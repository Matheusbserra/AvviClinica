import type { Appointment, UltraformerShots, UltraformerTip, UltraformerUsage } from "./types";

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
  return (!usage?.appointmentId || (typeof usage.appointmentId === "string" && usage.appointmentId.length <= 200 && typeof usage.sourceAccountId === "string" && !!usage.sourceAccountId && usage.sourceAccountId.length <= 200)) && (!usage?.sourceAccountId || !!usage.appointmentId) && (!usage?.registeredBy || [usage.registeredBy.id, usage.registeredBy.login, usage.registeredBy.name].every(value => typeof value === "string" && !!value.trim())) && typeof usage?.id === "string" && !!usage.id && Number.isSafeInteger(usage.quantity) && usage.quantity > 0 &&
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

// Standard users can append usage only, with an unchanged balance base and history.
export function usageOnlyTipUpdate(previous: UltraformerTip | undefined, next: UltraformerTip) {
  const original = previous ?? ultraformerCatalog.find(tip => tip.id === next.id);
  if (!original || !isUltraformerTip(next)) return false;
  const stable = (value: unknown): string => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
  const metadata = (tip: UltraformerTip) => Object.fromEntries(Object.entries(tip).filter(([key]) => key !== "usages"));
  const normalized = availableUltraformerTips([original]).find(tip => tip.id === original.id)!;
  if (stable(metadata(original)) !== stable(metadata(next)) && stable(metadata(normalized)) !== stable(metadata(next))) return false;
  if (next.usages.length < original.usages.length) return false;
  const content = (usage: UltraformerUsage) => Object.fromEntries(Object.entries(usage).filter(([key]) => key !== "registeredBy"));
  return original.usages.every((usage, index) => stable(content(usage)) === stable(content(next.usages[index])));
}

export function validCheckoutShots(value: unknown): value is UltraformerShots[] {
  return Array.isArray(value) && value.length <= 50 && value.every(item => item && typeof item.tipId === "string" && !!item.tipId && item.tipId.length <= 200 && typeof item.name === "string" && !!item.name.trim() && item.name.length <= 100 && Number.isSafeInteger(item.quantity) && item.quantity > 0) && new Set(value.map(item => item.tipId)).size === value.length;
}

// Reconcile only this appointment's usage. Manual records and other accounts stay intact.
// Stable IDs and the original creation date make retries and repeated saves idempotent.
export function applyCheckoutUltraformer(saved: UltraformerTip[], appointment: Appointment, patientName: string, professionalName: string, author: UltraformerUsage["registeredBy"]): UltraformerTip[] {
  const account = appointment.accountClosed ? appointment.closedAccount : undefined;
  const shots = account?.ultraformerShots ?? [];
  if (!validCheckoutShots(shots)) throw new Error("Confira a ponteira e a quantidade de disparos do Ultraformer.");
  if (shots.length && (!account || !appointment.patientId || account.patientId !== appointment.patientId || account.professionalId !== appointment.professionalId || !patientName || !professionalName)) throw new Error("Confira o paciente e a profissional dos disparos.");
  const all = [...saved, ...ultraformerCatalog.filter(tip => !saved.some(row => row.id === tip.id))];
  if (shots.some(shot => !all.some(tip => tip.id === shot.tipId))) throw new Error("A ponteira selecionada não está cadastrada.");
  const result = [...saved];
  for (const tip of all) {
    const selected = shots.find(shot => shot.tipId === tip.id);
    const existing = tip.usages.find(usage => usage.appointmentId === appointment.id);
    if (!selected && !existing) continue;
    const unchanged = existing && selected && account && existing.sourceAccountId === account.id && existing.quantity === selected.quantity && existing.date === account.date && existing.patientId === account.patientId && existing.professionalId === account.professionalId;
    const usage: UltraformerUsage | undefined = unchanged ? existing : selected && account ? {
      id: `checkout-shots-${account.id}-${tip.id}`, appointmentId: appointment.id, sourceAccountId: account.id,
      date: account.date, quantity: selected.quantity, patientId: account.patientId, patientName,
      professionalId: account.professionalId, professionalName, createdAt: existing?.createdAt ?? account.closedAt ?? `${account.date}T12:00:00Z`,
      registeredBy: existing?.registeredBy ?? author,
    } : undefined;
    const usages = tip.usages.flatMap(row => row.appointmentId === appointment.id ? usage ? [usage] : [] : [row]);
    if (usage && !existing) usages.push(usage);
    const next = { ...tip, usages };
    if (!isUltraformerTip(next)) throw new Error("Quantidade de disparos inválida.");
    const index = result.findIndex(row => row.id === tip.id);
    if (index < 0) result.push(next); else result[index] = next;
  }
  return result;
}
