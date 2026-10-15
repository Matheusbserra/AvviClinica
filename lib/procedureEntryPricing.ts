import type { ProcedureLine } from "./types";

const cents = (value: number) => Math.round(value * 100) / 100;

export function procedureLineTotal(line: ProcedureLine) {
  return cents(line.servicePrice * line.quantity);
}

// Store the equivalent unit price so existing reports and old records retain
// their quantity × unit-price convention. Do not round repeating unit prices.
export function overrideProcedureLineTotal(line: ProcedureLine, total: number): ProcedureLine {
  if (!Number.isFinite(total) || !Number.isFinite(line.quantity) || line.quantity <= 0) return line;
  const totalPriceOverride = cents(total);
  return { ...line, totalPriceOverride, servicePrice: totalPriceOverride / line.quantity };
}

export function changeProcedureLineQuantity(line: ProcedureLine, quantity: number): ProcedureLine {
  if (!Number.isFinite(quantity) || quantity <= 0) return line;
  return { ...line, quantity, ...(line.totalPriceOverride !== undefined ? { servicePrice: line.totalPriceOverride / quantity } : {}) };
}
