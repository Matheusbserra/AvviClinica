import type { GiftStockItem, GiftUsage } from "./types";
// Gifts only move their own stock; they do not change billing or procedure commissions.
export function applyCheckoutGifts(stock: GiftStockItem[], previous: GiftUsage[] | undefined, selected: GiftUsage[]) {
  const before = new Map<string, { quantity: number; name: string }>(), after = new Map<string, { quantity: number; name: string }>();
  for (const [rows, result] of [[previous ?? [], before], [selected, after]] as const) for (const item of rows) {
    result.set(item.giftId, { quantity: (result.get(item.giftId)?.quantity ?? 0) + item.quantity, name: item.name });
  }
  const gifts = stock.map((item) => ({ ...item }));
  for (const giftId of new Set([...before.keys(), ...after.keys()])) {
    const difference = (after.get(giftId)?.quantity ?? 0) - (before.get(giftId)?.quantity ?? 0); if (!difference) continue;
    const existing = gifts.find((item) => item.id === giftId);
    if (existing) existing.quantity -= difference;
    else gifts.push({ id: giftId, name: after.get(giftId)?.name ?? before.get(giftId)?.name ?? "Brinde registrado", quantity: -difference });
  }
  return { gifts, consumption: selected.map((item) => ({ ...item })) };
}
