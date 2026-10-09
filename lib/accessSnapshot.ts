import { canAccessTab, canReadEntity, hasFinancialAccess } from "./access";
import type { AppUser } from "./access";
import type { DataSnapshot } from "./persistence";
import type { FinancialEntry } from "./types";
export function stockHistoryEntry(entry: FinancialEntry): FinancialEntry {
  return { id: entry.id, patientId: entry.patientId, professionalId: entry.professionalId, appointmentId: entry.appointmentId, sourceAccountId: entry.sourceAccountId, date: entry.date, procedureId: entry.procedureId, manualProcedure: entry.manualProcedure,
    quantity: entry.quantity, products: entry.products?.map(({ id, procedureId, quantity }) => ({ id, procedureId, quantity, unitCost: 0 })),
    procedureLines: entry.procedureLines?.map(({ id, procedureId, manualProcedure, quantity }) => ({ id, procedureId, manualProcedure, quantity, servicePrice: 0, productCost: 0, professionalPercent: 0 })),
    servicePrice: 0, productCost: 0, machineFee: 0, commercialDiscount: 0, professionalPercent: 0, discountSplit: "Empresa assume", notes: "", payments: [] };
}
// Keep the current user's pending checkout derivatives, even when their finance tabs are hidden.
// Every user/revision has a separate cache; data from another profile is never imported.
export function permittedSnapshot(snapshot: DataSnapshot, user: AppUser): DataSnapshot {
  const accounts = new Set(snapshot.appointments.flatMap(item => item.closedAccount?.id ? [item.closedAccount.id] : []));
  const derived = (entity: string, row: { id?: string; month?: string; sourceAccountId?: string; sourceFinancialEntryId?: string }) => canAccessTab(user, "Agenda") && (entity === "financial_entries" ? accounts.has(row.sourceAccountId ?? "") && row.id === `procedure-account-${row.sourceAccountId}` : accounts.has(row.sourceFinancialEntryId ?? "") && row.id === `${entity === "revenues" ? "receita-entry" : "taxa-maquininha"}-${row.sourceFinancialEntryId}`);
  return Object.fromEntries(Object.entries(snapshot).map(([entity, rows]) => {
    if (canReadEntity(user, entity)) return [entity, entity === "financial_entries" && !hasFinancialAccess(user) ? (rows as FinancialEntry[]).map(entry => derived(entity, entry) ? entry : stockHistoryEntry(entry)) : rows];
    return [entity, ["financial_entries", "revenues", "fixed_costs"].includes(entity) ? rows.filter(row => derived(entity, row)) : []];
  })) as DataSnapshot;
}
