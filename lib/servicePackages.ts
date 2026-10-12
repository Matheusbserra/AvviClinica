import type { ProcedureLine } from "./types";

export type ServicePackageItem = { id: string; serviceId: string; name: string; quantity: number; unitPrice: number };
export type ServicePackage = {
  id: string; name: string; description: string; items: ServicePackageItem[];
  salePrice: number; validityEnabled: boolean; validityMonths: number;
  commissionPercent: number; active: boolean;
};
const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const amount = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 1e9 && Math.abs(money(value) - value) < 1e-7;
export function packageItemsTotal(items: ServicePackageItem[]) { return money(items.reduce((sum, item) => sum + money(item.quantity * item.unitPrice), 0)); }
export function validServicePackage(value: unknown): value is ServicePackage {
  if (!value || typeof value !== "object") return false;
  const item = value as ServicePackage;
  return typeof item.id === "string" && !!item.id && typeof item.name === "string" && !!item.name.trim() && item.name.length <= 200
    && typeof item.description === "string" && item.description.length <= 5000 && typeof item.active === "boolean"
    && amount(item.salePrice) && typeof item.commissionPercent === "number" && Number.isFinite(item.commissionPercent) && item.commissionPercent >= 0 && item.commissionPercent <= 100
    && typeof item.validityEnabled === "boolean" && Number.isSafeInteger(item.validityMonths) && item.validityMonths >= 0 && item.validityMonths <= 1200 && (!item.validityEnabled || item.validityMonths > 0)
    && Array.isArray(item.items) && item.items.length > 0 && item.items.length <= 100
    && item.items.every(line => line && typeof line.id === "string" && !!line.id && typeof line.serviceId === "string" && !!line.serviceId && typeof line.name === "string" && !!line.name.trim()
      && Number.isSafeInteger(line.quantity) && line.quantity > 0 && line.quantity <= 10000 && amount(line.unitPrice))
    && new Set(item.items.map(line => line.id)).size === item.items.length && new Set(item.items.map(line => line.serviceId)).size === item.items.length;
}

// Allocate the package's sale price among its services in cents. Splitting an item
// into two unit prices preserves both service quantities and the exact total.
export function packageCheckoutLines(pack: ServicePackage, quantity: number): ProcedureLine[] {
  if (!validServicePackage(pack) || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000) throw new Error("Confira os dados e a quantidade do pacote.");
  const total = Math.round(pack.salePrice * 100);
  const weights = pack.items.map(item => item.unitPrice * item.quantity);
  const sum = weights.reduce((a, b) => a + b, 0);
  const units = pack.items.reduce((a, b) => a + b.quantity, 0);
  const exact = weights.map((weight, i) => total * (sum ? weight / sum : pack.items[i].quantity / units));
  const allocated = exact.map(Math.floor);
  const order = exact.map((value, i) => ({ i, remainder: value - allocated[i] })).sort((a, b) => b.remainder - a.remainder);
  const remaining = total - allocated.reduce((a, b) => a + b, 0);
  for (let i = 0; i < remaining; i++) allocated[order[i % order.length].i]++;
  return pack.items.flatMap((item, i) => {
    const unit = Math.floor(allocated[i] / item.quantity), extra = allocated[i] % item.quantity;
    return [{ quantity: item.quantity - extra, cents: unit }, { quantity: extra, cents: unit + 1 }].filter(part => part.quantity > 0).map(part => ({
      id: `line-${crypto.randomUUID()}`, serviceId: item.serviceId, manualProcedure: item.name,
      quantity: part.quantity * quantity, servicePrice: part.cents / 100, productCost: 0,
      professionalPercent: pack.commissionPercent, discount: 0, packageId: pack.id, packageName: pack.name,
      packageCommissionPercent: pack.commissionPercent, ...(pack.validityEnabled ? { packageValidityMonths: pack.validityMonths } : {})
    }));
  });
}
