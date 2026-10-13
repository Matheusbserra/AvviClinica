import { calculateEntry, excludeZeroAccounts } from "./calculations";
import { appointmentServices } from "./appointmentServices";
import { clinicRankings, reportCapacity, reportMonthPeriod, validReportDate } from "./reports";
import type { Appointment, FinancialEntry, Patient, Procedure, Professional, Service } from "./types";
import type { MonthlyGoals } from "./database";

export type IndividualRanking = { id: string; name: string; value: number };
export type MonthlyProfessionalInsights = {
  month: string; averageTicket: number; previousTicket: number | null;
  ticketChange: number | null; ticketChangePercent: number | null;
  patientCount: number; previousPatientCount: number;
  patientChange: number; newPatientCount: number;
  evaluationOnlyPatientCount: number; returnCount: number;
};
export type ProfessionalReport = {
  professional: Professional; goal: number; totalPaid: number; totalProfit: number;
  companyRevenue: number; professionalValue: number; count: number; serviceCount: number; closedPatientCount: number; averageTicket: number;
  services: IndividualRanking[]; patientRevenue: IndividualRanking[];
  products: IndividualRanking[]; patientServices: IndividualRanking[];
  monthlyInsights?: MonthlyProfessionalInsights;
};

// Financial totals retain the existing ledger calculation. Service quantities
// come from attended appointments and explicitly linked services, never products.
function periodProfessionalReports(input: {
  start: string; end: string; entries: FinancialEntry[]; appointments: Appointment[];
  professionals: Professional[]; patients: Patient[]; services: Service[]; procedures?: Procedure[]; monthlyGoals: MonthlyGoals[];
}) {
  input = { ...input, ...excludeZeroAccounts(input.appointments, input.entries, input.services) };
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
    const revenue = new Map<string, IndividualRanking>();
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
    for (const rows of [revenue]) for (const row of rows.values()) row.value = round(row.value);
    const products = clinicRankings({ start: input.start, end: input.end,
      professionals: [professional],
      appointments: input.appointments.filter(item => item.professionalId === professional.id),
      entries: input.entries.filter(item => item.professionalId === professional.id),
      services: input.services, procedures: input.procedures ?? []
    }).procedures.slice(0, 5).map(({ id, name, quantity }) => ({ id, name, value: quantity }));
    return { professional, goal, ...totals, serviceCount, closedPatientCount: closedPatientIds.size, averageTicket: closedPatientIds.size ? totals.totalPaid / closedPatientIds.size : 0, services: top(serviceUsage), patientRevenue: top(revenue), products, patientServices: top(patientUsage) };
  }).sort((a, b) => b.totalPaid - a.totalPaid || a.professional.name.localeCompare(b.professional.name, "pt-BR"));
  return { valid, reports };
}

export function professionalReports(input: Parameters<typeof periodProfessionalReports>[0]) {
  const result = periodProfessionalReports(input);
  if (!result.valid) return result;
  // In date-range mode the indicators explicitly identify the last calendar
  // month in the range. Range totals and rankings retain their original period.
  const month = input.end.slice(0, 7), period = reportMonthPeriod(month)!;
  const previousMonth = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 2, 1)).toISOString().slice(0, 7);
  const current = input.start === period.start && input.end === period.end ? result : periodProfessionalReports({ ...input, ...period });
  const previousReports = periodProfessionalReports({ ...input, ...reportMonthPeriod(previousMonth)! }).reports;
  const visits = professionalVisits(input);
  const firstVisits = new Map<string, Map<string, string>>();
  const paidPatients = new Map<string, Map<string, Set<string>>>();
  const addVisit = (professionalId: string, patientId: string | undefined, date: string, key: string) => {
    date = date.slice(0, 10);
    if (!validReportDate(date)) return;
    const activityMonth = date.slice(0, 7);
    const months = paidPatients.get(professionalId) ?? new Map<string, Set<string>>();
    const patients = months.get(activityMonth) ?? new Set<string>();
    patients.add(patientId || `unknown:${key}`);
    months.set(activityMonth, patients); paidPatients.set(professionalId, months);
    if (!patientId) return;
    const visits = firstVisits.get(professionalId) ?? new Map<string, string>();
    if (!visits.has(patientId) || date < visits.get(patientId)!) visits.set(patientId, date);
    firstVisits.set(professionalId, visits);
  };
  for (const visit of visits) if (visit.positiveClosed) addVisit(visit.professionalId, visit.patientId, visit.date, visit.key);
  const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
  for (const item of result.reports) {
    const id = item.professional.id, selected = current.reports.find(row => row.professional.id === id)!;
    const monthlyVisits = visits.filter(visit => visit.professionalId === id && visit.date >= period.start && visit.date <= period.end);
    const convertedPatients = new Set(monthlyVisits.filter(visit => visit.positiveClosed && visit.services.some(line => !clinicalService(line.name))).map(visit => visit.patientId).filter(Boolean));
    const evaluationPatients = new Set(monthlyVisits.filter(visit => visit.performed && visit.services.some(line => clinicalService(line.name) === "evaluation")).map(visit => visit.patientId).filter(Boolean));
    const patientCount = paidPatients.get(id)?.get(month)?.size ?? 0;
    const previous = previousReports.find(row => row.professional.id === id)!;
    const previousPatientCount = paidPatients.get(id)?.get(previousMonth)?.size ?? 0;
    const previousTicket = previous.closedPatientCount > 0 ? previous.averageTicket : null;
    item.monthlyInsights = {
      month, averageTicket: round(selected.averageTicket), previousTicket: previousTicket === null ? null : round(previousTicket),
      ticketChange: previousTicket === null ? null : round(selected.averageTicket - previousTicket),
      ticketChangePercent: previousTicket === null || previousTicket === 0 ? null : round((selected.averageTicket - previousTicket) / previousTicket * 100),
      patientCount,
      previousPatientCount,
      patientChange: patientCount - previousPatientCount,
      newPatientCount: [...(firstVisits.get(id)?.values() ?? [])].filter(date => date >= period.start && date <= period.end).length,
      evaluationOnlyPatientCount: [...evaluationPatients].filter(patientId => !convertedPatients.has(patientId)).length,
      returnCount: monthlyVisits.filter(visit => visit.performed).reduce((sum, visit) => sum + visit.services.filter(line => clinicalService(line.name) === "return").reduce((total, line) => total + line.quantity, 0), 0),
    };
  }
  return result;
}

function clinicalService(name: string) {
  const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (/retorno/.test(normalized)) return "return";
  if (/avaliacao/.test(normalized)) return "evaluation";
  return null;
}

// Clinical activity must use the original records: free evaluations and returns
// remain eligible here even though they are excluded from financial rankings.
function professionalVisits(input: Parameters<typeof periodProfessionalReports>[0]) {
  const entries = new Map(input.entries.map(entry => [entry.id, entry]));
  const catalog = new Map(input.services.map(service => [service.id, service.name]));
  const linked = new Set<string>();
  const visits: {key: string; professionalId: string; patientId?: string; date: string; positiveClosed: boolean; performed: boolean; services: {name: string; quantity: number}[]}[] = [];
  const serviceLines = (account?: FinancialEntry) => (account?.procedureLines ?? []).filter(line => (line.serviceId || !line.procedureId) && Number.isFinite(line.quantity) && line.quantity > 0).map(line => ({name: line.manualProcedure || catalog.get(line.serviceId ?? "") || "Serviço registrado", quantity: line.quantity}));
  const paid = (account?: FinancialEntry, appointment?: Appointment) => {
    if (account && Array.isArray(account.payments)) return account.payments.reduce((sum, payment) => sum + payment.amount, 0) > 0;
    // Historical imports may lack payment methods. In that case use their saved
    // account/service value, while explicit zero payments always remain excluded.
    const value = account?.procedureLines?.length
      ? account.procedureLines.reduce((sum, line) => sum + line.servicePrice * line.quantity, 0) - (account.commercialDiscount || 0)
      : appointment ? appointmentServices(appointment, input.services).reduce((sum, line) => sum + line.price, 0) : 0;
    return Number.isFinite(value) && value > 0;
  };
  for (const appointment of input.appointments) {
    const legacy = entries.get(appointment.financialEntryId ?? "");
    const account = appointment.closedAccount ?? legacy;
    const closed = !!(appointment.accountClosed || (appointment.accountClosed !== false && account?.accountClosed));
    for (const id of [appointment.financialEntryId, account?.id, appointment.closedAccount?.generatedEntryId]) if (id) linked.add(id);
    const date = appointment.startsAt.slice(0, 10);
    if (!validReportDate(date)) continue;
    const excluded = ["Cancelado", "Faltou", "Reagendado"].includes(appointment.status);
    const lines = serviceLines(account);
    visits.push({key: appointment.id, professionalId: appointment.professionalId, patientId: appointment.patientId || account?.patientId, date,
      positiveClosed: !excluded && closed && paid(account, appointment), performed: !excluded && (closed || ["Compareceu", "Finalizado"].includes(appointment.status)),
      services: lines.length ? lines : appointmentServices(appointment, input.services).map(line => ({name: line.name, quantity: 1}))});
  }
  const appointmentIds = new Set(input.appointments.map(appointment => appointment.id));
  for (const entry of input.entries) {
    if (linked.has(entry.id) || (entry.sourceAccountId && (linked.has(entry.sourceAccountId) || entries.get(entry.sourceAccountId)?.accountClosed)) || (entry.appointmentId && appointmentIds.has(entry.appointmentId))) continue;
    const date = entry.date.slice(0, 10);
    if (!validReportDate(date)) continue;
    visits.push({key: entry.id, professionalId: entry.professionalId, patientId: entry.patientId, date, positiveClosed: entry.accountClosed === true && paid(entry), performed: entry.accountClosed === true,
      services: serviceLines(entry).length ? serviceLines(entry) : entry.manualProcedure ? [{name: entry.manualProcedure, quantity: entry.quantity}] : []});
  }
  return visits;
}
