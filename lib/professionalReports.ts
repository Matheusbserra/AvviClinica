import { calculateEntry } from "./calculations";
import { appointmentServices } from "./appointmentServices";
import { reportCapacity, reportMonthPeriod, validReportDate } from "./reports";
import type { Appointment, FinancialEntry, Patient, Professional, Service } from "./types";
import type { MonthlyGoals } from "./database";

export type IndividualRanking = { id: string; name: string; value: number };
export type ProfessionalReport = {
  professional: Professional; goal: number; totalPaid: number; totalProfit: number;
  companyRevenue: number; professionalValue: number; count: number; serviceCount: number; closedPatientCount: number; averageTicket: number;
  services: IndividualRanking[]; patientRevenue: IndividualRanking[];
  patientProfit: IndividualRanking[]; patientServices: IndividualRanking[];
};

// Financial totals retain the existing ledger calculation. Service quantities
// come from attended appointments and explicitly linked services, never products.
export function professionalReports(input: {
  start: string; end: string; entries: FinancialEntry[]; appointments: Appointment[];
  professionals: Professional[]; patients: Patient[]; services: Service[]; monthlyGoals: MonthlyGoals[];
}) {
  const valid = reportCapacity(input.start, input.end).valid;
  const inPeriod = (date: string) => valid && validReportDate(date.slice(0, 10)) && date.slice(0, 10) >= input.start && date.slice(0, 10) <= input.end;
  const patients = new Map(input.patients.map(patient => [patient.id, patient.name]));
  const services = new Map(input.services.map(service => [service.id, service.name]));
  const appointments = new Map(input.appointments.map(appointment => [appointment.id, appointment]));
  const entries = new Map(input.entries.map(entry => [entry.id, entry]));
  const top = (rows: Map<string, IndividualRanking>) => [...rows.values()].sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, "pt-BR") || a.id.localeCompare(b.id)).slice(0, 5);
  const number = (value: number) => Number.isFinite(value) ? value : 0;
  const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  const reports: ProfessionalReport[] = input.professionals.map(professional => {
    const revenue = new Map<string, IndividualRanking>(), profit = new Map<string, IndividualRanking>();
    const serviceUsage = new Map<string, IndividualRanking>(), patientUsage = new Map<string, IndividualRanking>();
    const add = (map: Map<string, IndividualRanking>, id: string | undefined, name: string, value: number) => {
      if (!id) return;
      const row = map.get(id) ?? { id, name, value: 0 }; row.value += number(value); map.set(id, row);
    };
    const patientName = (id?: string) => patients.get(id ?? "") ?? "Paciente não cadastrado";
    const closedPatientIds = new Set<string>();
    const totals = { totalPaid: 0, totalProfit: 0, companyRevenue: 0, professionalValue: 0, count: 0 };
    for (const entry of input.entries) {
      if (entry.professionalId !== professional.id || !inPeriod(entry.date)) continue;
      const summary = calculateEntry(entry);
      totals.totalPaid += number(summary.received); totals.totalProfit += number(summary.baseProfit);
      totals.companyRevenue += number(summary.companyValue); totals.professionalValue += number(summary.professionalValue); totals.count++;
      const patientId = entry.patientId || appointments.get(entry.appointmentId ?? "")?.patientId;
      if (entry.accountClosed) closedPatientIds.add(patientId || "account:" + (entry.appointmentId || entry.id));
      add(revenue, patientId, patientName(patientId), summary.received);
      add(profit, patientId, patientName(patientId), summary.baseProfit);
    }
    let serviceCount = 0;
    const countedAppointments = new Set<string>(), countedEntries = new Set<string>(), countedAccounts = new Set<string>();
    const addService = (id: string, name: string, quantity: number, patientId?: string) => {
      if (!Number.isFinite(quantity) || quantity <= 0) return;
      add(serviceUsage, id, name, quantity); add(patientUsage, patientId, patientName(patientId), quantity); serviceCount += quantity;
    };
    for (const appointment of input.appointments) {
      if (appointment.professionalId !== professional.id || !inPeriod(appointment.startsAt)) continue;
      const legacy = entries.get(appointment.financialEntryId ?? "");
      const closed = appointment.accountClosed || (appointment.accountClosed !== false && (appointment.closedAccount || legacy?.accountClosed));
      const account = closed ? appointment.closedAccount ?? legacy : undefined;
      if (!account && !["Compareceu", "Finalizado"].includes(appointment.status)) continue;
      countedAppointments.add(appointment.id);
      if (appointment.financialEntryId) countedEntries.add(appointment.financialEntryId);
      if (account) { countedAccounts.add(account.id); countedEntries.add(account.id); }
      if (appointment.closedAccount?.generatedEntryId) countedEntries.add(appointment.closedAccount.generatedEntryId);
      const patientId = appointment.patientId || account?.patientId;
      if (closed) closedPatientIds.add(patientId || "account:" + appointment.id);
      const serviceLines = account?.procedureLines?.filter(line => line.serviceId || !line.procedureId) ?? [];
      if (serviceLines.length) {
        for (const line of serviceLines) {
          if (line.serviceId || !line.procedureId) {
            const name = line.manualProcedure || services.get(line.serviceId ?? "") || "Serviço registrado";
            addService(line.serviceId ?? "name:" + name, name, line.quantity, patientId);
          }
        }
      } else for (const line of appointmentServices(appointment, input.services)) addService(line.serviceId, line.name, 1, patientId);
    }
    for (const entry of input.entries) {
      if (entry.professionalId !== professional.id || !inPeriod(entry.date) || countedEntries.has(entry.id) || (entry.sourceAccountId && countedAccounts.has(entry.sourceAccountId)) || (entry.appointmentId && countedAppointments.has(entry.appointmentId))) continue;
      for (const line of entry.procedureLines ?? []) if (line.serviceId) addService(line.serviceId, services.get(line.serviceId) || line.manualProcedure || "Serviço registrado", line.quantity, entry.patientId);
    }
    let goal = 0;
    if (valid) for (let month = input.start.slice(0, 7); month <= input.end.slice(0, 7);) {
      goal += input.monthlyGoals.find(item => item.month === month)?.professionalGoals[professional.id] ?? professional.monthlyGoal ?? 0;
      const last = new Date(reportMonthPeriod(month)!.end + "T12:00:00Z"); last.setUTCDate(last.getUTCDate() + 1); month = last.toISOString().slice(0, 7);
    }
    for (const rows of [revenue, profit]) for (const row of rows.values()) row.value = round(row.value);
    return { professional, goal, ...totals, serviceCount, closedPatientCount: closedPatientIds.size, averageTicket: closedPatientIds.size ? totals.totalPaid / closedPatientIds.size : 0, services: top(serviceUsage), patientRevenue: top(revenue), patientProfit: top(profit), patientServices: top(patientUsage) };
  }).sort((a, b) => b.totalPaid - a.totalPaid || a.professional.name.localeCompare(b.professional.name, "pt-BR"));
  return { valid, reports };
}
