import { stockConsumptionFor } from "./inventory";
import type { Appointment, FinancialEntry, Patient, Professional } from "./types";

export type ProcedureUsage = { id: string; date: string; professional: string; patient: string; quantity: number };
export type StockUsage = ProcedureUsage & { procedureId: string };

export function stockUsageHistory(appointments: Appointment[], entries: FinancialEntry[], patients: Patient[], professionals: Professional[]): StockUsage[] {
  const patientNames = new Map(patients.map((patient) => [patient.id, patient.name]));
  const professionalNames = new Map(professionals.map((professional) => [professional.id, professional.name]));
  const rows: StockUsage[] = [];
  const accountedAppointments = new Set<string>();
  const accountedEntries = new Set<string>();
  const accountedAccounts = new Set<string>();
  for (const appointment of appointments) {
    if (appointment.stockConsumption === undefined && !(appointment.accountClosed && appointment.closedAccount?.products !== undefined)) continue;
    accountedAppointments.add(appointment.id);
    if (appointment.financialEntryId) accountedEntries.add(appointment.financialEntryId);
    if (appointment.closedAccount?.generatedEntryId) accountedEntries.add(appointment.closedAccount.generatedEntryId);
    if (appointment.closedAccount?.id) {
      accountedAccounts.add(appointment.closedAccount.id);
      accountedEntries.add(appointment.closedAccount.id);
    }
    const consumed = appointment.stockConsumption ?? stockConsumptionFor(appointment.closedAccount!.products);
    for (const { procedureId, quantity } of stockConsumptionFor(consumed)) {
      if (quantity <= 0) continue;
      rows.push({ id: appointment.id, procedureId, date: appointment.startsAt, quantity,
        professional: professionalNames.get(appointment.professionalId) ?? "Profissional não encontrado",
        patient: patientNames.get(appointment.patientId ?? "") ?? "Paciente não encontrado" });
    }
  }
  // Include older financial records that predate automatic inventory tracking.
  for (const entry of entries) {
    if (accountedEntries.has(entry.id) || (entry.appointmentId && accountedAppointments.has(entry.appointmentId))
      || (entry.sourceAccountId && accountedAccounts.has(entry.sourceAccountId))) continue;
    const lines = entry.products ?? (entry.procedureLines?.length ? entry.procedureLines : [{ procedureId: entry.procedureId, quantity: entry.quantity }]);
    for (const { procedureId, quantity } of stockConsumptionFor(lines.map(line => ({ ...line, procedureId: line.procedureId ?? "" })))) {
      if (quantity <= 0) continue;
      rows.push({ id: entry.id, procedureId, date: entry.date, quantity,
        professional: professionalNames.get(entry.professionalId) ?? "Profissional não encontrado",
        patient: patientNames.get(entry.patientId) ?? "Paciente não encontrado" });
    }
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}

export function procedureUsageHistory(procedureId: string, appointments: Appointment[], entries: FinancialEntry[], patients: Patient[], professionals: Professional[]): ProcedureUsage[] {
  return stockUsageHistory(appointments, entries, patients, professionals)
    .filter(row => row.procedureId === procedureId)
    .map(row => ({ id: row.id, date: row.date, professional: row.professional, patient: row.patient, quantity: row.quantity }));
}

export function stockUsageInPeriod(rows: StockUsage[], start: string, end: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end) || start > end) return [];
  return rows.filter(row => row.date.slice(0, 10) >= start && row.date.slice(0, 10) <= end);
}

export function currentStockDate(now = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
