import { appointmentAvailabilityError } from "./agendaAvailability";
import { applyCheckoutInventory } from "./inventory";
import { applyCheckoutGifts } from "./gifts";
import { recordIsPending } from "./persistence";
import type { DataSnapshot } from "./persistence";
import type { Appointment, ClosedAccount } from "./types";

export type AgendaSyncConflict = { appointmentId: string; message: string };
const moved = (before: Appointment | undefined, after: Appointment) => !before || before.professionalId !== after.professionalId || before.startsAt !== after.startsAt || before.endsAt !== after.endsAt || before.eventType !== after.eventType || before.status === "Cancelado" && after.status !== "Cancelado";
const credit = (account: ClosedAccount | undefined) => (account?.creditAdded ?? 0) - (account?.payments ?? []).filter(payment => payment.method === "Crédito Futuro").reduce((sum, payment) => sum + payment.amount, 0);

// A rejected booking stays in the durable local draft. Its linked effects must
// stay there too, while unrelated appointments and registrations keep saving.
export function saveableAgendaSnapshot(baseline: DataSnapshot, draft: DataSnapshot): { data: DataSnapshot; conflicts: AgendaSyncConflict[] } {
  const conflicts: AgendaSyncConflict[] = [], blocked = new Set<string>();
  let appointments = [...draft.appointments];
  const previousById = new Map(baseline.appointments.map(item => [item.id, item]));
  const candidates = draft.appointments.filter(item => moved(previousById.get(item.id), item));
  // Restoring a moved record can expose a conflict for another pending move.
  // Repeat until every remaining pending reservation is valid together.
  let changed = true;
  while (changed) {
    changed = false;
    for (const item of candidates) {
      if (blocked.has(item.id)) continue;
      const message = appointmentAvailabilityError(draft.professionals.find(pro => pro.id === item.professionalId), appointments, item.startsAt, item.endsAt, item.id, item.eventType);
      if (!message) continue;
      blocked.add(item.id); conflicts.push({ appointmentId: item.id, message }); changed = true;
      appointments = appointments.filter(row => row.id !== item.id);
      const previous = baseline.appointments.find(row => row.id === item.id);
      if (previous) appointments.push(previous);
    }
  }
  // A pending consumption cannot be saved before its blocked package sale.
  changed = true;
  while (changed) {
    changed = false;
    for (const item of appointments) if (!blocked.has(item.id) && recordIsPending(baseline, draft, "appointments", item.id) && item.closedAccount?.packageSessionUses?.some(use => blocked.has(use.sourceAppointmentId))) {
      blocked.add(item.id); conflicts.push({ appointmentId: item.id, message: "Este consumo de pacote depende de um agendamento que precisa de revisão." }); changed = true;
      appointments = appointments.filter(row => row.id !== item.id);
      const previous = baseline.appointments.find(row => row.id === item.id);
      if (previous) appointments.push(previous);
    }
  }
  if (!conflicts.length) return { data: draft, conflicts };
  return { data: omitPendingAppointments(baseline, draft, blocked), conflicts };
}

// Called only for a save projection, or after the user explicitly discards a
// particular local attempt. The acknowledged cloud records are always retained.
export function omitPendingAppointments(baseline: DataSnapshot, draft: DataSnapshot, blocked: Set<string>): DataSnapshot {
  const appointments = [...draft.appointments.filter(item => !blocked.has(item.id)), ...baseline.appointments.filter(item => blocked.has(item.id))];
  const data = { ...draft, appointments };
  const sources = new Set<string>(), patients = new Set<string>();
  const products = new Set<string>(), giftIds = new Set<string>();
  const adjustments = new Map<string, number>();
  for (const appointmentId of blocked) {
    const next = draft.appointments.find(item => item.id === appointmentId)!;
    const previous = baseline.appointments.find(item => item.id === appointmentId);
    for (const item of [previous, next]) {
      if (item?.patientId) patients.add(item.patientId);
      for (const source of [item?.closedAccount?.id, item?.closedAccount?.generatedEntryId, item?.financialEntryId]) if (source) sources.add(source);
      for (const product of item?.stockConsumption ?? item?.closedAccount?.products ?? []) if (product.procedureId) products.add(product.procedureId);
      for (const gift of item?.giftConsumption ?? item?.closedAccount?.gifts ?? []) giftIds.add(gift.giftId);
    }
    data.inventory = applyCheckoutInventory(data.inventory, next.stockConsumption ?? (next.accountClosed ? next.closedAccount?.products : []), previous?.stockConsumption ?? (previous?.accountClosed ? previous.closedAccount?.products ?? [] : [])).inventory;
    data.gifts = applyCheckoutGifts(data.gifts, next.giftConsumption ?? (next.accountClosed ? next.closedAccount?.gifts : []), previous?.giftConsumption ?? (previous?.accountClosed ? previous.closedAccount?.gifts ?? [] : [])).gifts;
    // Undo only this account's credit delta; other pending payments remain intact.
    if (next.closedAccount?.patientId) adjustments.set(next.closedAccount.patientId, (adjustments.get(next.closedAccount.patientId) ?? 0) - credit(next.closedAccount));
    if (previous?.closedAccount?.patientId) adjustments.set(previous.closedAccount.patientId, (adjustments.get(previous.closedAccount.patientId) ?? 0) + credit(previous.closedAccount));
  }
  for (const entry of [...baseline.financial_entries, ...draft.financial_entries]) if (entry.appointmentId && blocked.has(entry.appointmentId)) sources.add(entry.id);
  const linked = (row: { id: string; appointmentId?: string; sourceAccountId?: string; sourceFinancialEntryId?: string }) => sources.has(row.id) || !!row.appointmentId && blocked.has(row.appointmentId) || !!row.sourceAccountId && sources.has(row.sourceAccountId) || !!row.sourceFinancialEntryId && sources.has(row.sourceFinancialEntryId);
  data.financial_entries = [...draft.financial_entries.filter(row => !linked(row)), ...baseline.financial_entries.filter(linked)];
  data.revenues = [...draft.revenues.filter(row => !linked(row)), ...baseline.revenues.filter(linked)];
  data.fixed_costs = [...draft.fixed_costs.filter(row => !linked(row)), ...baseline.fixed_costs.filter(linked)];
  // Reversing the first usage of an untracked item can leave a zero row that
  // never existed in the cloud. Do not send that orphan stock write by itself.
  data.inventory = data.inventory.filter(row => row.quantity !== 0 || !products.has(row.procedureId) || baseline.inventory.some(old => old.id === row.id) || appointments.some(item => !blocked.has(item.id) && (item.stockConsumption ?? []).some(use => use.procedureId === row.procedureId && use.quantity > 0)));
  data.gifts = data.gifts.filter(row => row.quantity !== 0 || !giftIds.has(row.id) || baseline.gifts.some(old => old.id === row.id) || appointments.some(item => !blocked.has(item.id) && (item.giftConsumption ?? []).some(use => use.giftId === row.id && use.quantity > 0)));
  data.patients = draft.patients.flatMap(patient => {
    if (!patients.has(patient.id)) return [patient];
    const previous = baseline.patients.find(row => row.id === patient.id);
    const usedElsewhere = appointments.some(item => !blocked.has(item.id) && item.patientId === patient.id && recordIsPending(baseline, draft, "appointments", item.id)) || data.financial_entries.some(item => item.patientId === patient.id && recordIsPending(baseline, draft, "financial_entries", item.id)) || data.anamneses.some(item => item.patientId === patient.id && recordIsPending(baseline, draft, "anamneses", item.id));
    if (!usedElsewhere) return previous ? [previous] : [];
    return [{ ...patient, futureCredit: Math.round(((patient.futureCredit ?? 0) + (adjustments.get(patient.id) ?? 0)) * 100) / 100 }];
  });
  data.ultraformer_tips = draft.ultraformer_tips.map(tip => {
    const previous = baseline.ultraformer_tips.find(row => row.id === tip.id)?.usages ?? [];
    const retained = new Map([...tip.usages.filter(usage => !usage.appointmentId || !blocked.has(usage.appointmentId)), ...previous.filter(usage => usage.appointmentId && blocked.has(usage.appointmentId))].map(usage => [usage.id, usage]));
    const order = new Set([...previous, ...tip.usages].map(usage => usage.id));
    return { ...tip, usages: [...order].flatMap(id => retained.has(id) ? [retained.get(id)!] : []) };
  });
  return data;
}
