import type { Appointment, FinancialEntry, Professional, Procedure, Service, RevenueEntry } from "./types";
import { calculateEntry } from "./calculations";
import { appointmentServices } from "./appointmentServices";
export type ProfessionalRanking = { id: string; name: string; avatar?: string; revenue: number; attendances: number; averageTicket: number; capacity: number; productivity: number };
export type UsageRanking = { id: string; name: string; quantity: number };
export function validReportDate(date: string) { if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false; const value = new Date(date + "T12:00:00Z"); return Number.isFinite(value.getTime()) && value.toISOString().slice(0, 10) === date; }
export function reportMonthPeriod(month: string) { if (!/^\d{4}-\d{2}$/.test(month) || !validReportDate(month + "-01")) return null; const [year, number] = month.split("-").map(Number); const last = new Date(Date.UTC(year, number, 0)).getUTCDate(); return { start: month + "-01", end: `${month}-${String(last).padStart(2, "0")}` }; }
export function reportCapacity(start: string, end: string) {
  if (!validReportDate(start) || !validReportDate(end) || end < start) return { days: 0, capacity: 0, valid: false };
  let days = 0, count = 0; const cursor = new Date(start + "T12:00:00Z"), until = new Date(end + "T12:00:00Z");
  while (cursor <= until) { if (++count > 36600) return { days: 0, capacity: 0, valid: false }; if (cursor.getUTCDay() !== 0) days++; cursor.setUTCDate(cursor.getUTCDate() + 1); }
  return { days, capacity: days * 2, valid: true };
}
export function clinicRankings(input: { start: string; end: string; professionals: Professional[]; appointments: Appointment[]; entries: FinancialEntry[]; procedures: Procedure[]; services: Service[]; revenues?: RevenueEntry[] }) {
  const period = reportCapacity(input.start, input.end), inPeriod = (date: string) => validReportDate(date.slice(0, 10)) && date.slice(0, 10) >= input.start && date.slice(0, 10) <= input.end;
  const people = new Map(input.professionals.map(person => [person.id, { id: person.id, name: person.name, avatar: person.avatarDataUrl, revenue: 0, attendances: 0, averageTicket: 0, capacity: period.capacity, productivity: 0 }]));
  const productNames = new Map(input.procedures.map(product => [product.id, product.name])), serviceNames = new Map(input.services.map(service => [service.id, service.name]));
  const products = new Map<string, UsageRanking>(), services = new Map<string, UsageRanking>(), attendanceIds = new Set<string>();
  const person = (id: string) => { if (!people.has(id)) people.set(id, { id, name: "Profissional não cadastrado", avatar: undefined, revenue: 0, attendances: 0, averageTicket: 0, capacity: period.capacity, productivity: 0 }); return people.get(id)!; };
  const amount = (value: number) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const add = (map: Map<string, UsageRanking>, id: string, name: string, quantity: number) => { const number = amount(quantity); if (number <= 0) return; const current = map.get(id) ?? { id, name, quantity: 0 }; current.quantity += number; map.set(id, current); };
  const attendance = (professionalId: string, id: string) => { const key = professionalId + ":" + id; if (!attendanceIds.has(key)) { attendanceIds.add(key); person(professionalId).attendances++; } };
  const entriesById = new Map(input.entries.map(entry => [entry.id, entry]));
  const resolvedAccounts = new Map(input.appointments.flatMap(item => {
    const legacy = item.financialEntryId ? entriesById.get(item.financialEntryId) : undefined;
    const closed = item.accountClosed || (item.accountClosed !== false && (item.closedAccount || legacy?.accountClosed));
    const account = closed ? item.closedAccount ?? legacy : undefined;
    return account ? [[item.id, account] as const] : [];
  }));
  const linkedAccounts = new Set(input.appointments.flatMap(item => {
    const account = resolvedAccounts.get(item.id); return account ? [account.id, item.closedAccount?.generatedEntryId, item.financialEntryId].filter((id): id is string => !!id) : [];
  }));
  const accountedAppointments = new Set(input.appointments.filter(item => resolvedAccounts.has(item.id) || item.stockConsumption !== undefined).map(item => item.id));
  if (period.valid) for (const appointment of input.appointments) {
    if (!inPeriod(appointment.startsAt) || (!resolvedAccounts.has(appointment.id) && !["Compareceu", "Finalizado"].includes(appointment.status))) continue;
    attendance(appointment.professionalId, appointment.id);
    if (resolvedAccounts.has(appointment.id)) {
      const account = resolvedAccounts.get(appointment.id)!;
      person(appointment.professionalId).revenue += account.payments.reduce((sum, payment) => sum + amount(payment.amount), 0);
      for (const line of account.procedureLines ?? []) if (line.serviceId || !line.procedureId) { const key = line.serviceId ?? "name:" + (line.manualProcedure || "Serviço registrado"); add(services, key, line.manualProcedure || serviceNames.get(line.serviceId ?? "") || "Serviço registrado", line.quantity); }
    } else for (const service of appointmentServices(appointment, input.services)) add(services, service.serviceId, service.name, 1);
    const account = resolvedAccounts.get(appointment.id);
    const used = appointment.stockConsumption ?? account?.products ?? account?.procedureLines?.filter(line => line.procedureId) ?? [];
    for (const product of used) if (product.procedureId) add(products, product.procedureId, productNames.get(product.procedureId) ?? "Produto não cadastrado", product.quantity);
  }
  if (period.valid) for (const entry of input.entries) {
    if (!inPeriod(entry.date) || linkedAccounts.has(entry.id) || (entry.sourceAccountId && linkedAccounts.has(entry.sourceAccountId)) || (entry.appointmentId && resolvedAccounts.has(entry.appointmentId))) continue;
    attendance(entry.professionalId, entry.appointmentId ?? "entry:" + entry.id);
    person(entry.professionalId).revenue += amount(calculateEntry(entry).received);
    if (!entry.appointmentId || !accountedAppointments.has(entry.appointmentId)) {
      const lines = entry.products ?? (entry.procedureLines?.length ? entry.procedureLines : [{ procedureId: entry.procedureId, manualProcedure: entry.manualProcedure, quantity: entry.quantity }]);
      for (const line of lines) if (line.procedureId || ("manualProcedure" in line && line.manualProcedure)) { const id = line.procedureId ?? "manual:" + ("manualProcedure" in line ? line.manualProcedure : ""); add(products, id, productNames.get(id) ?? ("manualProcedure" in line ? line.manualProcedure : undefined) ?? "Produto registrado", line.quantity); }
    }
    for (const line of entry.procedureLines ?? []) if (line.serviceId) add(services, line.serviceId, serviceNames.get(line.serviceId) ?? line.manualProcedure ?? "Serviço registrado", line.quantity);
  }
  const all = [...people.values()].map(item => ({ ...item, revenue: Math.round(item.revenue * 100) / 100, averageTicket: item.attendances ? item.revenue / item.attendances : 0, productivity: item.capacity ? item.attendances / item.capacity * 100 : 0 }));
  const rank = (key: "revenue" | "averageTicket" | "attendances" | "productivity") => [...all].sort((a, b) => b[key] - a[key] || a.name.localeCompare(b.name, "pt-BR"));
  const usage = (map: Map<string, UsageRanking>) => [...map.values()].sort((a, b) => b.quantity - a.quantity || a.name.localeCompare(b.name, "pt-BR")).slice(0, 20);
  const unattributed = (input.revenues ?? []).filter(item => period.valid && inPeriod(item.serviceDate || item.paymentDate) && !item.sourceFinancialEntryId).reduce((sum, item) => sum + amount(item.total), 0);
  return { ...period, revenue: rank("revenue"), averageTicket: rank("averageTicket"), attendances: rank("attendances"), productivity: rank("productivity"), procedures: usage(products), services: usage(services), totalRevenue: all.reduce((sum, item) => sum + item.revenue, 0), totalAttendances: all.reduce((sum, item) => sum + item.attendances, 0), unattributed };
}
