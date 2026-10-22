import { canAccessTab, canMoveStock } from "./access";
import type { AppUser } from "./access";
import { checkoutTotals } from "./checkout";
import { applyCheckoutInventory } from "./inventory";
import { applyCheckoutGifts } from "./gifts";
import { isPackageSessionTreatment } from "./packageSessions";
import { recoverPendingChanges } from "./persistence";
import type { DataSnapshot } from "./persistence";
import type { Appointment } from "./types";

const stable = (value: unknown) => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
function applyUsage(state: DataSnapshot, old: Appointment | undefined, next: Appointment | undefined): DataSnapshot {
  const account = next?.accountClosed ? next.closedAccount : undefined;
  const consumesStock = account && (checkoutTotals(account.procedureLines, account.payments ?? []).total > 0 || isPackageSessionTreatment(account));
  return { ...state,
    inventory: applyCheckoutInventory(state.inventory, old?.stockConsumption ?? (old?.accountClosed ? old.closedAccount?.products : []), consumesStock ? account.products : []).inventory,
    gifts: applyCheckoutGifts(state.gifts, old?.giftConsumption ?? (old?.accountClosed ? old.closedAccount?.gifts : []), consumesStock ? account.gifts ?? [] : []).gifts
  };
}

// Restricted operators can change stock only through account usage. Recover that
// intent against the current shared balance, never a stale absolute quantity.
export function recoverSharedSnapshot(remote: DataSnapshot, baseline: DataSnapshot, draft: DataSnapshot, user: AppUser): DataSnapshot {
  const recovered = recoverPendingChanges(remote, baseline, draft);
  if (!canAccessTab(user, "Agenda")) return recovered;
  let rebased = remote, expectedLocal = baseline;
  const before = new Map(baseline.appointments.map(item => [item.id, item]));
  const after = new Map(draft.appointments.map(item => [item.id, item]));
  const cloud = new Map(remote.appointments.map(item => [item.id, item]));
  const merged = new Map(recovered.appointments.map(item => [item.id, item]));
  const ids = new Set([...before.keys(), ...after.keys()]);
  for (const id of ids) {
    if (JSON.stringify(before.get(id)) === JSON.stringify(after.get(id))) continue;
    rebased = applyUsage(rebased, cloud.get(id), merged.get(id));
    expectedLocal = applyUsage(expectedLocal, before.get(id), after.get(id));
  }
  if (!canMoveStock(user)) return { ...recovered, inventory: rebased.inventory, gifts: rebased.gifts };
  // Administrators and stock operators also rebase automatic usage. An explicit
  // manual adjustment differs from the checkout-only result and is preserved.
  const localProducts = new Map(draft.inventory.map(row => [row.procedureId, row]));
  const automaticProducts = new Set(expectedLocal.inventory.filter(row => stable(localProducts.get(row.procedureId)) === stable(row)).map(row => row.procedureId));
  const localGifts = new Map(draft.gifts.map(row => [row.id, row]));
  const automaticGifts = new Set(expectedLocal.gifts.filter(row => stable(localGifts.get(row.id)) === stable(row)).map(row => row.id));
  return { ...recovered,
    inventory: [...recovered.inventory.filter(row => !automaticProducts.has(row.procedureId)), ...rebased.inventory.filter(row => automaticProducts.has(row.procedureId))],
    gifts: [...recovered.gifts.filter(row => !automaticGifts.has(row.id)), ...rebased.gifts.filter(row => automaticGifts.has(row.id))]
  };
}
