import { checkoutTotals, distributeCheckoutDiscount, moneyRound } from "./checkout";
import { appointmentServices } from "./appointmentServices";
import type { Appointment, ClosedAccount, FinancialEntry, Patient, Professional, RevenueEntry, Service } from "./types";

export const movementColumns = [
  { key: "services", label: "Serviços" }, { key: "packages", label: "Pacotes" },
  { key: "discount", label: "Descontos" }, { key: "creditAdded", label: "Crédito guardado" },
  { key: "creditUsed", label: "Crédito utilizado" }, { key: "credit", label: "Cartão crédito" },
  { key: "debit", label: "Débito" }, { key: "cash", label: "Dinheiro" },
  { key: "pix", label: "PIX" }, { key: "change", label: "Troco" }, { key: "other", label: "Outros" }, { key: "received", label: "Total recebido" }
] as const;
export type MovementAmounts = Record<typeof movementColumns[number]["key"], number>;
export type Movement = MovementAmounts & { id: string; appointmentId?: string; serviceDate: string; paymentDate: string; time: string; clientName: string; professionalId?: string; professionalName: string; unknownPayments: boolean; legacy?: RevenueEntry };
const zero = (): MovementAmounts => Object.fromEntries(movementColumns.map(item => [item.key, 0])) as MovementAmounts;
export function sumMovements(records: Movement[]): MovementAmounts {
  const totals = zero(); for (const record of records) for (const column of movementColumns) totals[column.key] = moneyRound(totals[column.key] + record[column.key]); return totals;
}
const nameKey = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim().replace(/\s+/g, " ");
function closedDate(value?: string) {
  if (!value || Number.isNaN(new Date(value).getTime())) return null;
  const date = new Date(value);
  return { date: new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date), time: new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(date) };
}
export function accountMovements(input: { appointments: Appointment[]; entries: FinancialEntry[]; revenues: RevenueEntry[]; patients: Patient[]; professionals: Professional[]; services: Service[] }): Movement[] {
  const patients = new Map(input.patients.map(item => [item.id, item]));
  const professionals = new Map(input.professionals.map(item => [item.id, item.name]));
  const covered = new Set<string>(); const result: Movement[] = []; const accountIds = new Set<string>();
  function addAccount(account: FinancialEntry, appointment?: Appointment) {
    if (accountIds.has(account.id)) return;
    accountIds.add(account.id); covered.add(account.id);
    if (account.sourceAccountId) covered.add(account.sourceAccountId);
    const closed = account as ClosedAccount;
    if (closed.generatedEntryId) covered.add(closed.generatedEntryId);
    const lines = account.procedureLines?.length ? account.procedureLines : [{ id: account.id, quantity: account.quantity, servicePrice: account.servicePrice, professionalPercent: account.professionalPercent, productCost: account.productCost }];
    const totals = checkoutTotals(distributeCheckoutDiscount(lines, account.commercialDiscount ?? 0), account.payments ?? []);
    if (totals.total === 0 && !((closed.creditAdded ?? 0) > 0)) return;
    const savedDate = closedDate(closed.closedAt);
    const amounts = zero();
    amounts.services = moneyRound(lines.filter(line => !line.packageId).reduce((sum, line) => sum + line.servicePrice * line.quantity, 0));
    amounts.packages = moneyRound(lines.filter(line => line.packageId).reduce((sum, line) => sum + line.servicePrice * line.quantity, 0));
    amounts.change = closed.change ?? 0; amounts.discount = totals.discount; amounts.creditAdded = closed.creditAdded ?? 0;
    for (const payment of [...(account.payments ?? []), ...(closed.creditPayments ?? [])]) {
      if (payment.method === "Crédito Futuro") { amounts.creditUsed += payment.amount; continue; }
      const column = payment.method === "Crédito" ? "credit" : payment.method === "Débito" ? "debit" : payment.method === "Dinheiro" ? "cash" : payment.method === "Pix" ? "pix" : "other";
      amounts[column] += payment.amount; amounts.received += payment.amount;
    }
    for (const column of movementColumns) amounts[column.key] = moneyRound(amounts[column.key]);
    result.push({ ...amounts, id: account.id, appointmentId: appointment?.id, serviceDate: account.date.slice(0, 10), paymentDate: savedDate?.date ?? account.date.slice(0, 10), time: savedDate?.time ?? appointment?.startsAt.slice(11, 16) ?? "", clientName: patients.get(account.patientId)?.name ?? "Paciente não encontrado", professionalId: account.professionalId, professionalName: professionals.get(account.professionalId) ?? "Profissional não encontrado", unknownPayments: false });
  }
  for (const appointment of input.appointments) {
    const account = appointment.closedAccount ?? input.entries.find(entry => entry.id === appointment.financialEntryId && entry.accountClosed);
    if (account) { if (appointment.financialEntryId) covered.add(appointment.financialEntryId); addAccount(account, appointment); }
  }
  for (const entry of input.entries) if (entry.accountClosed && !covered.has(entry.id) && !covered.has(entry.sourceAccountId ?? "")) addAccount(entry, input.appointments.find(item => item.id === entry.appointmentId));
  const legacy = input.revenues.filter(row => !covered.has(row.sourceFinancialEntryId ?? ""));
  const historical = input.appointments.filter(item => item.accountClosed && !item.closedAccount && !input.entries.some(entry => entry.accountClosed && (entry.id === item.financialEntryId || entry.appointmentId === item.id)));
  for (const revenue of legacy) {
    const matching = historical.filter(item => item.startsAt.slice(0, 10) === revenue.serviceDate && nameKey(patients.get(item.patientId ?? "")?.name ?? "") === nameKey(revenue.clientName));
    const appointment = matching.length === 1 ? matching[0] : undefined;
    const amounts = { ...zero(), services: revenue.serviceTotal, discount: Math.abs(revenue.discount), creditAdded: revenue.clientCreditAddedTotal, creditUsed: Math.abs(revenue.clientCreditUsedTotal), credit: revenue.creditTotal, debit: revenue.debitTotal, cash: revenue.cashTotal, pix: revenue.pixTotal, received: revenue.total };
    amounts.other = moneyRound(revenue.total - amounts.credit - amounts.debit - amounts.cash - amounts.pix);
    if (movementColumns.every(column => !amounts[column.key])) continue;
    result.push({ ...amounts, id: revenue.id, appointmentId: appointment?.id, serviceDate: revenue.serviceDate, paymentDate: revenue.paymentDate, time: revenue.paymentTime, clientName: revenue.clientName, professionalId: appointment?.professionalId, professionalName: appointment ? professionals.get(appointment.professionalId) ?? "" : "", unknownPayments: false, legacy: revenue });
  }
  // Imported appointments without payment information remain consultable. Their
  // service prices must never be invented as money received.
  for (const appointment of historical) {
    const patient = patients.get(appointment.patientId ?? "");
    if (legacy.some(row => row.serviceDate === appointment.startsAt.slice(0, 10) && nameKey(row.clientName) === nameKey(patient?.name ?? ""))) continue;
    const total = moneyRound(appointmentServices(appointment, input.services).reduce((sum, item) => sum + item.price, 0));
    if (!total) continue;
    result.push({ ...zero(), services: total, id: `historical-${appointment.id}`, appointmentId: appointment.id, serviceDate: appointment.startsAt.slice(0, 10), paymentDate: appointment.startsAt.slice(0, 10), time: appointment.startsAt.slice(11, 16), clientName: patient?.name ?? "Paciente não encontrado", professionalId: appointment.professionalId, professionalName: professionals.get(appointment.professionalId) ?? "", unknownPayments: true });
  }
  return result.sort((a, b) => b.paymentDate.localeCompare(a.paymentDate) || b.time.localeCompare(a.time) || a.id.localeCompare(b.id));
}
