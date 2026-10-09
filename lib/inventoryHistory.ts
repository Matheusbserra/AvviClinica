import type { Appointment, FinancialEntry, Patient, Professional } from "./types";

export type ProcedureUsage = { id: string; date: string; professional: string; patient: string; quantity: number };

export function procedureUsageHistory(procedureId: string, appointments: Appointment[], entries: FinancialEntry[], patients: Patient[], professionals: Professional[]): ProcedureUsage[] {
  const patientNames = new Map(patients.map((patient) => [patient.id, patient.name]));
  const professionalNames = new Map(professionals.map((professional) => [professional.id, professional.name]));
  const rows: ProcedureUsage[] = [];
  const accountedAppointments = new Set<string>();
  const accountedEntries = new Set<string>();
  for (const appointment of appointments) {
    if (appointment.stockConsumption === undefined) continue;
    accountedAppointments.add(appointment.id);
    if (appointment.financialEntryId) accountedEntries.add(appointment.financialEntryId);
    const quantity = appointment.stockConsumption.filter((item) => item.procedureId === procedureId).reduce((sum, item) => sum + item.quantity, 0);
    if (quantity <= 0) continue;
    rows.push({ id: appointment.id, date: appointment.startsAt, quantity,
      professional: professionalNames.get(appointment.professionalId) ?? "Profissional não encontrado",
      patient: patientNames.get(appointment.patientId ?? "") ?? "Paciente não encontrado" });
  }
  // Include older financial records that predate automatic inventory tracking.
  for (const entry of entries) {
    if (accountedEntries.has(entry.id) || (entry.appointmentId && accountedAppointments.has(entry.appointmentId))) continue;
    const lines = entry.products ?? (entry.procedureLines?.length ? entry.procedureLines : [{ procedureId: entry.procedureId, quantity: entry.quantity }]);
    const quantity = lines.filter((line) => line.procedureId === procedureId).reduce((sum, line) => sum + line.quantity, 0);
    if (quantity <= 0) continue;
    rows.push({ id: entry.id, date: entry.date, quantity,
      professional: professionalNames.get(entry.professionalId) ?? "Profissional não encontrado",
      patient: patientNames.get(entry.patientId) ?? "Paciente não encontrado" });
  }
  return rows.sort((a, b) => b.date.localeCompare(a.date));
}
