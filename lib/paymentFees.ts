import type { PaymentItem } from "./types";

// Same reference rates used by the procedure ledger. These are estimates;
// the simulator can override them without changing the clinic configuration.
const cardFeeRates: Record<NonNullable<PaymentItem["cardBrand"]>, number[]> = {
  Mastercard: [3.13, 4.14, 4.74, 5.34, 5.94, 6.54, 7.42, 8.02, 8.62, 9.22, 9.82, 10.42],
  Visa: [3.13, 4.14, 4.74, 5.34, 5.94, 6.54, 7.42, 8.02, 8.62, 9.22, 9.82, 10.42],
  Elo: [3.63, 4.64, 5.24, 5.84, 6.44, 7.04, 7.92, 8.52, 9.12, 9.72, 10.32, 10.92]
};
export function cardFeeRate(cardBrand?: PaymentItem["cardBrand"], installments?: number) {
  const term = Math.min(12, Math.max(1, Number(installments) || 1));
  return cardFeeRates[cardBrand ?? "Mastercard"]?.[term - 1] ?? 0;
}
export function calculateCardFee(amount: number, cardBrand?: PaymentItem["cardBrand"], installments?: number) {
  return Number(((Number(amount) || 0) * cardFeeRate(cardBrand, installments) / 100).toFixed(2));
}
export function calculateDebitFee(amount: number) {
  return Number(((Number(amount) || 0) * 0.76 / 100).toFixed(2));
}
