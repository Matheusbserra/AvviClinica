import type { UltraformerTip, UltraformerUsage } from "./types";

// Names, depths and color references: CLASSYS Ultraformer MPT official cartridge images.
export const ultraformerCatalog: UltraformerTip[] = [
  { id: "mpt-linear-1-5", name: "1,5 mm", depth: "1,5 mm", kind: "linear", color: "#10b5ab", initialShots: 0, usages: [] },
  { id: "mpt-linear-2-0", name: "2,0 mm", depth: "2,0 mm", kind: "linear", color: "#ec4899", initialShots: 0, usages: [] },
  { id: "mpt-linear-3-0", name: "3,0 mm", depth: "3,0 mm", kind: "linear", color: "#f28a13", initialShots: 0, usages: [] },
  { id: "mpt-linear-4-5", name: "4,5 mm", depth: "4,5 mm", kind: "linear", color: "#2467d6", initialShots: 0, usages: [] },
  { id: "mpt-linear-6-0", name: "6,0 mm", depth: "6,0 mm", kind: "linear", color: "#c59a36", initialShots: 0, usages: [] },
  { id: "mpt-linear-9-0", name: "9,0 mm", depth: "9,0 mm", kind: "linear", color: "#6735b1", initialShots: 0, usages: [] },
  { id: "mpt-linear-13-0", name: "13,0 mm", depth: "13,0 mm", kind: "linear", color: "#292a30", initialShots: 0, usages: [] },
  { id: "mpt-booster-1-5", name: "Booster 1,5 mm", depth: "1,5 mm", kind: "booster", color: "#83cfbd", initialShots: 0, usages: [] },
  { id: "mpt-booster-3-0", name: "Booster 3,0 mm", depth: "3,0 mm", kind: "booster", color: "#f4b36e", initialShots: 0, usages: [] },
  { id: "mpt-booster-4-5", name: "Booster 4,5 mm", depth: "4,5 mm", kind: "booster", color: "#8acfe4", initialShots: 0, usages: [] },
];
export function availableUltraformerTips(saved: UltraformerTip[]): UltraformerTip[] {
  return [...ultraformerCatalog.map(tip => {
    const stored = saved.find(row => row.id === tip.id);
    if (!stored) return tip;
    const name = stored.name.replace(/^(DERMA|CELLUP|CELUP|LINEUP)\s+/i, "").replace(/^BOOSTER\s+/i, "Booster ");
    return name === stored.name ? stored : { ...stored, name };
  }), ...saved.filter(tip => !ultraformerCatalog.some(row => row.id === tip.id))];
}
export function remainingShots(tip: UltraformerTip): number {
  return tip.initialShots - tip.usages.reduce((sum, usage) => sum + usage.quantity, 0);
}
export function validUsage(usage: UltraformerUsage): boolean {
  return (!usage?.registeredBy || [usage.registeredBy.id, usage.registeredBy.login, usage.registeredBy.name].every(value => typeof value === "string" && !!value.trim())) && typeof usage?.id === "string" && !!usage.id && Number.isSafeInteger(usage.quantity) && usage.quantity > 0 &&
    /^\d{4}-\d{2}-\d{2}$/.test(usage.date) && !Number.isNaN(Date.parse(usage.date)) && new Date(usage.date).toISOString().slice(0, 10) === usage.date &&
    [usage.patientId, usage.patientName, usage.professionalId, usage.professionalName, usage.createdAt].every(value => typeof value === "string" && !!value.trim()) && !Number.isNaN(Date.parse(usage.createdAt));
}
export function isUltraformerTip(value: unknown): value is UltraformerTip {
  const tip = value as UltraformerTip;
  return !!tip && typeof tip.id === "string" && !!tip.id && typeof tip.name === "string" && !!tip.name.trim() && tip.name.length <= 100 &&
    typeof tip.depth === "string" && tip.depth.length <= 30 && ["linear", "booster"].includes(tip.kind) && /^#[0-9a-f]{6}$/i.test(tip.color) &&
    Number.isSafeInteger(tip.initialShots) && Array.isArray(tip.usages) && tip.usages.every(validUsage) &&
    new Set(tip.usages.map(usage => usage.id)).size === tip.usages.length && Number.isSafeInteger(remainingShots(tip));
}
export function recordUltraformerUsage(tip: UltraformerTip, usage: UltraformerUsage): UltraformerTip {
  if (!validUsage(usage)) throw new Error("Informe uma quantidade inteira positiva, a data, o paciente e a profissional.");
  if (tip.usages.some(row => row.id === usage.id)) return tip;
  const updated = { ...tip, usages: [...tip.usages, usage] };
  if (!isUltraformerTip(updated)) throw new Error("Quantidade de disparos inválida.");
  return updated;
}
