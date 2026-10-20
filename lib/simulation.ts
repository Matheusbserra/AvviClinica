import { calculateEntry } from "./calculations";
import { cardFeeRate } from "./paymentFees";
import type { DiscountSplit, PaymentItem, PaymentMethod } from "./types";

export type SimulationService = { id: string; serviceId: string; quantity: number; unitPrice: number };
export type SimulationProduct = { id: string; procedureId: string; quantity: number; unitCost: number };
export type SimulationPayment = { id: string; method: PaymentMethod; amount: number; cardBrand?: PaymentItem["cardBrand"]; installments: number; rateOverride?: number };
export type SimulationDraft = { services: SimulationService[]; products: SimulationProduct[]; payments: SimulationPayment[]; discount: number; discountSplit: DiscountSplit; professionalPercent: number };
const positive = (value: number) => Number.isFinite(value) ? Math.max(0, value) : 0;
export const simulationRound = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
export function newSimulation(): SimulationDraft {
  return { services: [{ id: "service-1", serviceId: "", quantity: 1, unitPrice: 0 }], products: [{ id: "product-1", procedureId: "", quantity: 1, unitCost: 0 }], payments: [{ id: "payment-1", method: "Pix", amount: 0, installments: 1 }], discount: 0, discountSplit: "Empresa e profissional dividem", professionalPercent: 70 };
}
export function simulationPaymentRate(payment: SimulationPayment) {
  if (!["Crédito", "Débito"].includes(payment.method)) return 0;
  return payment.rateOverride === undefined ? payment.method === "Débito" ? 0.76 : cardFeeRate(payment.cardBrand, payment.installments) : Math.min(100, positive(payment.rateOverride));
}
export function simulationTotals(draft: SimulationDraft) {
  const percent = Math.min(100, positive(draft.professionalPercent));
  const lines = draft.services.map(line => ({ id: line.id, quantity: 1, servicePrice: simulationRound(positive(line.unitPrice) * positive(line.quantity)), productCost: 0, professionalPercent: percent }));
  const gross = simulationRound(lines.reduce((sum, line) => sum + simulationRound(line.servicePrice * line.quantity), 0));
  const discount = simulationRound(Math.min(gross, positive(draft.discount)));
  const products = draft.products.map(product => ({ ...product, quantity: 1, unitCost: simulationRound(positive(product.quantity) * positive(product.unitCost)) }));
  const productCost = simulationRound(products.reduce((sum, product) => sum + simulationRound(product.quantity * product.unitCost), 0));
  const payments = draft.payments.map(payment => ({ ...payment, amount: simulationRound(positive(payment.amount)), fee: simulationRound(simulationRound(positive(payment.amount)) * simulationPaymentRate(payment) / 100), discount: 0 }));
  const summary = calculateEntry({ quantity: 0, servicePrice: 0, productCost: 0, machineFee: 0, accountClosed: true, commercialDiscount: discount, professionalPercent: percent, discountSplit: draft.discountSplit, payments, procedureLines: lines, products });
  const due = simulationRound(gross - discount), received = simulationRound(summary.received), fees = simulationRound(summary.machineFee);
  return { gross, discount: simulationRound(discount), due, received, productCost, fees, totalCost: simulationRound(productCost + fees), net: simulationRound(received - productCost - fees), professionalValue: simulationRound(summary.professionalValue), companyValue: simulationRound(summary.companyValue), remaining: simulationRound(Math.max(0, due - received)), excess: simulationRound(Math.max(0, received - due)), payments };
}

// Adjust only the first simulated payment, preserving the split entered in the
// other rows. Fees are derived on every render, including after price changes.
export function rebalanceSimulation(draft: SimulationDraft): SimulationDraft {
  if (!draft.payments.length) return draft;
  const due = simulationTotals(draft).due;
  const other = draft.payments.slice(1).reduce((sum, payment) => sum + simulationRound(positive(payment.amount)), 0);
  return { ...draft, payments: draft.payments.map((payment, index) => index ? payment : { ...payment, amount: simulationRound(Math.max(0, due - other)) }) };
}
