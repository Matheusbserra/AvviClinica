import type { PaymentItem, PaymentMethod, ProcedureLine, ProductUsage, Procedure, Service } from "./types";

export type PaymentChoice = { id: string; label: string; method: PaymentMethod; cardBrand?: PaymentItem["cardBrand"] };
export const paymentChoices: PaymentChoice[] = [
  { id: "Pix", label: "Pix", method: "Pix" },
  { id: "Crédito", label: "Crédito", method: "Crédito" },
  ...(["Elo", "Mastercard", "Visa"] as const).map((brand) => ({ id: `Crédito-${brand}`, label: brand, method: "Crédito" as PaymentMethod, cardBrand: brand })),
  { id: "Débito", label: "Débito", method: "Débito" },
  { id: "Transferência Bancária", label: "Transferência bancária", method: "Transferência Bancária" },
  { id: "Depósito", label: "Depósito", method: "Depósito" },
  { id: "Dinheiro", label: "Dinheiro", method: "Dinheiro" },
  { id: "Crédito Futuro", label: "Crédito futuro", method: "Crédito Futuro" }
];
export function moneyRound(value: number) { return Math.round((value + Number.EPSILON) * 100) / 100; }
export function paymentChoiceKey(payment: PaymentItem) {
  return payment.method === "Crédito" && payment.cardBrand ? `Crédito-${payment.cardBrand}` : payment.method;
}
// Only service names grant the evaluation/return exception; products do not.
export function checkoutAllowsNoProducts(lines: Pick<ProcedureLine, "serviceId" | "procedureId" | "manualProcedure" | "quantity">[], services: Pick<Service, "id" | "name">[]) {
  return lines.some(line => {
    if (line.quantity <= 0 || (line.procedureId && !line.serviceId)) return false;
    const name = line.manualProcedure || services.find(service => service.id === line.serviceId)?.name || "";
    const normalized = name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR");
    return normalized.includes("avaliacao") || normalized.includes("retorno");
  });
}
export function checkoutTotals(lines: ProcedureLine[], payments: PaymentItem[]) {
  const gross = moneyRound(lines.reduce((sum, line) => sum + moneyRound(line.servicePrice * line.quantity), 0));
  const discount = moneyRound(lines.reduce((sum, line) => sum + (line.discount ?? 0), 0));
  const total = moneyRound(Math.max(0, gross - discount));
  const received = moneyRound(payments.reduce((sum, payment) => sum + payment.amount, 0));
  return { gross, discount, total, received, remaining: moneyRound(Math.max(0, total - received)), change: moneyRound(Math.max(0, received - total)) };
}
export function toggleCheckoutPayment(payments: PaymentItem[], choice: PaymentChoice, total: number) {
  if (payments.some((payment) => paymentChoiceKey(payment) === choice.id)) {
    return payments.filter((payment) => paymentChoiceKey(payment) !== choice.id);
  }
  const received = moneyRound(payments.reduce((sum, payment) => sum + payment.amount, 0));
  return [...payments, { id: `payment-${crypto.randomUUID()}`, method: choice.method, cardBrand: choice.cardBrand,
    amount: moneyRound(Math.max(0, total - received)), fee: 0, discount: 0, installments: 1 }];
}
export function distributeCheckoutDiscount(lines: ProcedureLine[], discount: number) {
  const stored = moneyRound(lines.reduce((sum, line) => sum + (line.discount ?? 0), 0));
  if (stored === moneyRound(discount)) return lines.map((line) => ({ ...line }));
  let remaining = discount;
  return lines.map((line) => {
    const allocated = moneyRound(Math.min(remaining, line.servicePrice * line.quantity));
    remaining = moneyRound(remaining - allocated);
    return { ...line, discount: allocated };
  });
}

// Keep the prices of previously billed items when opening accounts from the earlier checkout.
export function restoreCheckoutItems(lines: ProcedureLine[], storedProducts: ProductUsage[] | undefined, procedures: Procedure[], services: Service[]) {
  if (storedProducts !== undefined) return { lines: lines.map((line) => ({ ...line })), products: storedProducts.map((product) => ({ ...product })) };
  const products = new Map<string, ProductUsage>();
  const restoredLines = lines.map((line) => {
    const procedure = procedures.find((item) => item.id === line.procedureId);
    const name = line.manualProcedure || procedure?.name || "Serviço registrado";
    const service = services.find((item) => item.id === line.serviceId || item.name === name);
    if (line.procedureId) {
      const previous = products.get(line.procedureId);
      const quantity = (previous?.quantity ?? 0) + line.quantity;
      products.set(line.procedureId, { id: previous?.id ?? `product-${line.id}`, procedureId: line.procedureId, quantity,
        unitCost: quantity ? ((previous?.quantity ?? 0) * (previous?.unitCost ?? 0) + line.quantity * line.productCost) / quantity : 0 });
    }
    return { ...line, serviceId: service?.id ?? line.serviceId, procedureId: undefined, manualProcedure: name, productCost: line.procedureId ? 0 : line.productCost };
  });
  return { lines: restoredLines, products: [...products.values()] };
}
