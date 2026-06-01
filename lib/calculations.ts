import type { DiscountSplit, FinancialEntry, FixedCost, RevenueEntry } from "./types";

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

export function calculateEntry(entry: Pick<FinancialEntry, "quantity" | "servicePrice" | "productCost" | "machineFee" | "commercialDiscount" | "professionalPercent" | "discountSplit" | "payments" | "procedureLines">): FinancialSummary {
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
  const received = Math.max(0, (paymentTotal || grossRevenue) - machineFee - discount);
  const productCost = lines.reduce((sum, line) => sum + line.productCost * line.quantity, 0);
  const baseProfitBeforeSplit = received - productCost;
  const discountImpact = splitDiscountImpact(discount, entry.discountSplit);
  const professionalBase = Math.max(0, baseProfitBeforeSplit - discountImpact.professional);
  const weightedPercent = grossRevenue
    ? lines.reduce((sum, line) => sum + line.servicePrice * line.quantity * line.professionalPercent, 0) / grossRevenue
    : entry.professionalPercent;
  const professionalValue = professionalBase * (weightedPercent / 100);
  const companyValue = baseProfitBeforeSplit - professionalValue - discountImpact.company;

  return {
    grossRevenue,
    paymentTotal: paymentTotal || grossRevenue,
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


