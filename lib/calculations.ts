import type { Appointment, Service, DiscountSplit, FinancialEntry, FixedCost, RevenueEntry } from "./types";

export type FinancialSummary = {
  grossRevenue: number;
  paymentTotal: number;
  machineFee: number;
  discount: number;
  productCost: number;
  received: number;
  baseProfit: number;
  professionalValue: number;
  companyValue: number;
};

export function currency(value: number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL"
  }).format(value || 0);
}

export function percent(value: number) {
  return `${Number.isFinite(value) ? value.toFixed(1) : "0.0"}%`;
}

export function monthKey(date: string) {
  return date.slice(0, 7);
}

export function calculateEntry(entry: Pick<FinancialEntry, "quantity" | "servicePrice" | "productCost" | "machineFee" | "commercialDiscount" | "professionalPercent" | "discountSplit" | "payments" | "procedureLines" | "accountClosed" | "products">): FinancialSummary {
  const lines = entry.procedureLines?.length ? entry.procedureLines : [{
    quantity: entry.quantity,
    servicePrice: entry.servicePrice,
    productCost: entry.productCost,
    professionalPercent: entry.professionalPercent
  }];
  const grossRevenue = lines.reduce((sum, line) => sum + line.servicePrice * line.quantity, 0);
  const paymentTotal = entry.payments.reduce((sum, item) => sum + item.amount, 0);
  const paymentFees = entry.payments.reduce((sum, item) => sum + item.fee, 0);
  const paymentDiscounts = entry.payments.reduce((sum, item) => sum + item.discount, 0);
  const machineFee = entry.machineFee + paymentFees;
  const discount = entry.commercialDiscount + paymentDiscounts;
  const discountedGross = Math.max(0, grossRevenue - discount);
  const received = entry.accountClosed ? paymentTotal : paymentTotal || discountedGross;
  const productCost = lines.reduce((sum, line) => sum + line.productCost * line.quantity, 0) + (entry.products ?? []).reduce((sum, product) => sum + product.unitCost * product.quantity, 0) + machineFee;
  const baseProfitBeforeSplit = received - productCost;
  const weightedPercent = grossRevenue
    ? lines.reduce((sum, line) => sum + line.servicePrice * line.quantity * line.professionalPercent, 0) / grossRevenue
    : entry.professionalPercent;
  const professionalBaseBeforeDiscount = Math.max(0, baseProfitBeforeSplit + discount);
  const discountImpact = splitDiscountImpact(discount, entry.discountSplit);
  const professionalValue = Math.max(0, professionalBaseBeforeDiscount * (weightedPercent / 100) - discountImpact.professional);
  const companyValue = baseProfitBeforeSplit - professionalValue;

  return {
    grossRevenue,
    paymentTotal: entry.accountClosed ? paymentTotal : paymentTotal || grossRevenue,
    machineFee,
    discount,
    productCost,
    received,
    baseProfit: baseProfitBeforeSplit,
    professionalValue,
    companyValue
  };
}

export function splitDiscountImpact(discount: number, split: DiscountSplit) {
  if (split === "Empresa assume") return { company: discount, professional: 0 };
  if (split === "Profissional assume") return { company: 0, professional: discount };
  return { company: discount / 2, professional: discount / 2 };
}

export function summarizeMonth(revenues: RevenueEntry[], fixedCosts: FixedCost[], key: string) {
  const monthRevenues = revenues.filter((revenue) => monthKey(revenue.paymentDate) === key);
  const monthCosts = fixedCosts.filter((cost) => monthKey(cost.dueDate) === key && cost.status !== "Pendente");
  const totals = monthRevenues.reduce(
    (acc, revenue) => {
      acc.revenue += revenue.total;
      acc.fees += 0;
      acc.discounts += Math.abs(revenue.discount || 0);
      acc.products += 0;
      acc.professionals += 0;
      acc.company += revenue.total;
      return acc;
    },
    { revenue: 0, fees: 0, discounts: 0, products: 0, professionals: 0, company: 0 }
  );
  const expenses = monthCosts.reduce((sum, cost) => sum + cost.value, 0);
  return { ...totals, expenses, result: totals.revenue - expenses };
}



// A historical import with unknown payments is not proof of a free account.
export function zeroClosedAppointment(appointment: Appointment, entries: FinancialEntry[] = [], services: Service[] = []) {
  const legacy = entries.find(entry => entry.id === appointment.financialEntryId && !entry.sourceAccountId);
  const account = appointment.closedAccount ?? legacy;
  if (appointment.accountClosed === false || (!appointment.accountClosed && !account?.accountClosed)) return false;
  if (account && Array.isArray(account.payments)) return Math.round(account.payments.reduce((sum, payment) => sum + payment.amount, 0) * 100) === 0;
  // Imported free evaluations/returns have an explicit zero service price even
  // though the source did not export payment methods. Do not count them as paid visits.
  if (appointment.historicalImport?.paymentsUnknown) {
    const lines = appointment.services?.length ? appointment.services : appointment.serviceId ? [{ name: services.find(service => service.id === appointment.serviceId)?.name ?? "", price: appointment.servicePrice ?? services.find(service => service.id === appointment.serviceId)?.price }] : [];
    return lines.length > 0 && lines.every(line => line.price === 0 && /avaliacao|retorno/.test(line.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()));
  }
  if (appointment.services?.length) return appointment.services.every(line => line.price === 0);
  const price = appointment.servicePrice ?? services.find(service => service.id === appointment.serviceId)?.price;
  return price === 0;
}
export function excludeZeroAccounts(appointments: Appointment[], entries: FinancialEntry[], services: Service[] = []) {
  const excluded = appointments.filter(appointment => zeroClosedAppointment(appointment, entries, services));
  const appointmentIds = new Set(excluded.map(item => item.id));
  const entryIds = new Set(excluded.flatMap(item => [item.closedAccount?.id, item.closedAccount?.generatedEntryId, item.financialEntryId]).filter(Boolean));
  const excludedEntry = (entry: FinancialEntry) => appointmentIds.has(entry.appointmentId ?? "") || entryIds.has(entry.id) || entryIds.has(entry.sourceAccountId) || (entry.accountClosed === true && Array.isArray(entry.payments) && Math.round(entry.payments.reduce((sum, payment) => sum + payment.amount, 0) * 100) === 0);
  for (const entry of entries) if (excludedEntry(entry)) entryIds.add(entry.id);
  return { appointments: appointments.filter(item => !appointmentIds.has(item.id)), entries: entries.filter(entry => !excludedEntry(entry)), entryIds };
}
