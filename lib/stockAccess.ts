import { applyCheckoutInventory } from "./inventory";
import { applyCheckoutGifts } from "./gifts";
import { checkoutTotals } from "./checkout";
import type { Appointment, InventoryItem, GiftStockItem } from "./types";

const stable = (value: unknown): string => JSON.stringify(value, (_key, item) =>
  item && typeof item === "object" && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);

// Read-only stock users may still close/reopen accounts in Agenda. Accept only
// the exact resulting stock changes, never arbitrary quantity or catalog edits.
export function checkoutStockUpdates(
  inventory: InventoryItem[], gifts: GiftStockItem[], previous: Appointment[],
  appointments: Appointment[], removedAppointments: string[],
  updates: { entity: string; record_id: string; data: unknown }[],
) {
  let expectedInventory = inventory, expectedGifts = gifts;
  const deleted = previous.filter(item => removedAppointments.includes(item.id))
    .map(item => ({ ...item, accountClosed: false, closedAccount: undefined, stockConsumption: [], giftConsumption: [] }));
  for (const next of [...appointments, ...deleted]) {
    const old = previous.find(item => item.id === next.id);
    const paidAccount = next.accountClosed && next.closedAccount && checkoutTotals(next.closedAccount.procedureLines, next.closedAccount.payments ?? []).total > 0;
    const products = paidAccount ? next.closedAccount!.products : [];
    const selectedGifts = paidAccount ? next.closedAccount!.gifts ?? [] : [];
    if (!Array.isArray(products) || !Array.isArray(selectedGifts) ||
      products.some(item => !item.procedureId || !Number.isSafeInteger(item.quantity) || item.quantity < 0) ||
      selectedGifts.some(item => !item.giftId || !Number.isSafeInteger(item.quantity) || item.quantity < 0)) return false;
    const stock = applyCheckoutInventory(expectedInventory, old?.stockConsumption ?? old?.closedAccount?.products, products);
    const giftStock = applyCheckoutGifts(expectedGifts, old?.giftConsumption ?? old?.closedAccount?.gifts, selectedGifts);
    // Invoice-only edits and historical imports need not carry a stock marker.
    const consumptionChanged = stable(old?.stockConsumption ?? []) !== stable(next.stockConsumption ?? []) ||
      stable(old?.giftConsumption ?? []) !== stable(next.giftConsumption ?? []);
    const accountChanged = stable(old?.closedAccount) !== stable(next.closedAccount) || !!old?.accountClosed !== !!next.accountClosed;
    if (!accountChanged && !consumptionChanged) continue;
    if (stable(next.stockConsumption ?? []) !== stable(stock.consumption) ||
      stable(next.giftConsumption ?? next.closedAccount?.gifts ?? []) !== stable(giftStock.consumption)) return false;
    expectedInventory = stock.inventory; expectedGifts = giftStock.gifts;
  }
  return updates.every(update => {
    const expected = (update.entity === "inventory" ? expectedInventory : expectedGifts).find(item => item.id === update.record_id);
    return !!expected && stable(update.data) === stable(expected);
  });
}
