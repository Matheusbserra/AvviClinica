import { calculateCardFee, calculateDebitFee } from "./paymentFees";
import type { FixedCost, Patient, PatientCreditDeposit } from "./types";

export function patientCreditFee(deposit: Pick<PatientCreditDeposit, "method" | "amount" | "cardBrand" | "installments">) {
  if (deposit.method === "Crédito") return calculateCardFee(deposit.amount, deposit.cardBrand, deposit.installments);
  return deposit.method === "Débito" ? calculateDebitFee(deposit.amount) : 0;
}

export function validPatientCreditDeposit(deposit: PatientCreditDeposit) {
  if (!deposit || !/^patient-credit-[0-9a-f-]{36}$/.test(deposit.id) || !/^\d{4}-\d{2}-\d{2}$/.test(deposit.date)) return false;
  const day = new Date(`${deposit.date}T00:00:00Z`);
  if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== deposit.date) return false;
  if (typeof deposit.amount !== "number" || deposit.amount < 0.01 || !Number.isSafeInteger(Math.round(deposit.amount * 100)) || Math.round(deposit.amount * 100) / 100 !== deposit.amount) return false;
  if (deposit.method === "Crédito") return ["Mastercard", "Visa", "Elo"].includes(deposit.cardBrand ?? "") && Number.isInteger(deposit.installments) && deposit.installments! >= 1 && deposit.installments! <= 12;
  return ["Pix", "Débito", "Dinheiro"].includes(deposit.method) && deposit.cardBrand === undefined && deposit.installments === undefined;
}

export function patientCreditFeeCost(deposit: PatientCreditDeposit, patient: Pick<Patient, "id" | "name">): FixedCost | null {
  const value = patientCreditFee(deposit);
  if (!value) return null;
  return {
    id: `taxa-maquininha-${patient.id}-${deposit.id}`,
    name: `Taxa maquininha - ${patient.name.trim() || "cliente"}`,
    category: "Custos variáveis", costType: "Taxa maquininha", professionalName: "",
    supplier: "Maquininha", value, dueDate: deposit.date, status: "Pago", paymentMethod: "Pix",
    replicateMonths: 0, creditInstallments: 1, notes: `Taxa da recarga de crédito futuro ${deposit.id}`,
  };
}
