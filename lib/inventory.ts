import type { Appointment, InventoryItem, ProcedureLine } from "./types";

// Persist the quantities applied to each appointment so reopening only applies the difference.
export function applyCheckoutInventory(inventory: InventoryItem[], previous: Appointment["stockConsumption"], lines: Pick<ProcedureLine, "procedureId" | "quantity">[]) {
  const quantities = new Map<string, number>();
  for (const line of lines) {
    if (line.procedureId) quantities.set(line.procedureId, (quantities.get(line.procedureId) ?? 0) + line.quantity);
  }
  const consumption = [...quantities].map(([procedureId, quantity]) => ({ procedureId, quantity }));
  const previousQuantities = new Map((previous ?? []).map((item) => [item.procedureId, item.quantity]));
  const next = [...inventory];
  for (const procedureId of new Set([...quantities.keys(), ...previousQuantities.keys()])) {
    const difference = (quantities.get(procedureId) ?? 0) - (previousQuantities.get(procedureId) ?? 0);
    if (!difference) continue;
    const index = next.findIndex((item) => item.procedureId === procedureId);
    const existing = next[index];
    const item = { id: existing?.id ?? procedureId, procedureId, quantity: (existing?.quantity ?? 0) - difference };
    if (index < 0) next.push(item); else next[index] = item;
  }
  return { inventory: next, consumption };
}
