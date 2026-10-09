import type { ClosedAccount, FinancialEntry, Procedure, Professional, ProcedureLine } from "./types";

// Keep catalog prices and share only the difference equally between product rows.
// Include the explicit discount before comparing the catalog total with the amount received.
export function procedureEntryFromAccount(account: ClosedAccount, procedures: Procedure[], professional?: Professional): FinancialEntry | undefined {
  if (!account.products.length) return undefined;
  const received = Math.round(account.payments.reduce((sum, payment) => sum + payment.amount, 0) * 100);
  const discount = Math.round(account.commercialDiscount * 100);
  const gross = received + discount;
  const allocated = account.products.map((product) => Math.round(Math.max(0,
    procedures.find((procedure) => procedure.id === product.procedureId)?.price ?? 0) * product.quantity * 100));
  const difference = gross - allocated.reduce((sum, amount) => sum + amount, 0);
  if (difference > 0) {
    const addition = Math.floor(difference / allocated.length);
    const remainder = difference % allocated.length;
    for (let index = 0; index < allocated.length; index++) allocated[index] += addition + (index < remainder ? 1 : 0);
  } else {
    let remaining = -difference;
    while (remaining > 0) {
      const positive = allocated.map((amount, index) => ({ amount, index })).filter((item) => item.amount > 0);
      const reduction = Math.floor(remaining / positive.length);
      const remainder = remaining % positive.length;
      for (const [position, item] of positive.entries()) {
        // A product cannot have a negative price; share any remaining reduction among the others.
        const removed = Math.min(item.amount, reduction + (position < remainder ? 1 : 0));
        allocated[item.index] -= removed;
        remaining -= removed;
      }
    }
  }
  const lines: ProcedureLine[] = account.products.map((product, index) => ({
    id: `line-${crypto.randomUUID()}`, procedureId: product.procedureId,
    manualProcedure: procedures.find((procedure) => procedure.id === product.procedureId)?.name ?? "Produto registrado",
    quantity: product.quantity, servicePrice: allocated[index] / 100 / product.quantity,
    productCost: product.unitCost, professionalPercent: professional?.commissionPercent ?? 0
  }));
  const first = lines[0];
  return { id: `procedure-account-${account.id}`, sourceAccountId: account.id, appointmentId: account.appointmentId,
    patientId: account.patientId, professionalId: account.professionalId, date: account.date,
    procedureId: first.procedureId, manualProcedure: first.manualProcedure, quantity: first.quantity,
    servicePrice: first.servicePrice, productCost: first.productCost, professionalPercent: first.professionalPercent,
    procedureLines: lines, machineFee: 0, commercialDiscount: discount / 100, discountSplit: account.discountSplit,
    payments: account.payments.map((payment) => ({ ...payment, id: `payment-${crypto.randomUUID()}`, discount: 0 })), notes: ""
  };
}
