import type { Appointment, InventoryItem, Procedure, ProductUsage, StockComponent, StockMovement, StockMovementRequest } from "./types";

export function validComboItems(items: unknown): items is StockComponent[] {
  return Array.isArray(items) && items.length > 0 && items.length <= 100 && items.every(item =>
    item && typeof item.procedureId === "string" && item.procedureId.trim() && item.procedureId.length <= 500
    && Number.isSafeInteger(item.quantity) && item.quantity > 0 && item.quantity <= 10000
  ) && new Set(items.map(item => item.procedureId)).size === items.length;
}

export function sameComboItems(first?: StockComponent[] | null, second?: StockComponent[] | null) {
  return (first?.length ?? 0) === (second?.length ?? 0)
    && (first ?? []).every((item, index) => item.procedureId === second?.[index]?.procedureId && item.quantity === second[index].quantity);
}

type StockProductUsage = Pick<ProductUsage, "procedureId" | "quantity" | "comboItems">;

export function stockConsumptionFor(products: StockProductUsage[]): StockComponent[] {
  const quantities = new Map<string, number>();
  for (const product of products) {
    const items = product.comboItems ?? [{ procedureId: product.procedureId, quantity: 1 }];
    for (const item of items) {
      if (item.procedureId) quantities.set(item.procedureId, (quantities.get(item.procedureId) ?? 0) + item.quantity * product.quantity);
    }
  }
  return [...quantities].map(([procedureId, quantity]) => ({ procedureId, quantity }));
}

export function checkoutStockProducts(products: ProductUsage[], consumesOrdinaryStock: boolean) {
  return consumesOrdinaryStock ? products : products.filter(product => product.comboItems !== undefined);
}

export function appointmentStockConsumption(appointment?: Appointment) {
  return appointment?.stockConsumption ?? stockConsumptionFor(appointment?.closedAccount?.products ?? []);
}

export function validStockMovement(value: unknown): value is StockMovementRequest {
  const movement = value as Partial<StockMovementRequest> | null;
  return !!movement && typeof movement.id === "string" && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(movement.id)
    && typeof movement.procedureId === "string" && !!movement.procedureId.trim() && movement.procedureId.length <= 500
    && (movement.kind === "addition" || movement.kind === "removal")
    && Number.isSafeInteger(movement.quantity) && movement.quantity! > 0;
}

export function applyStockMovement(item: InventoryItem, movement: StockMovement) {
  if (movement.kind === "removal" && movement.quantity > item.quantity) throw new Error("A quantidade a remover ultrapassa o saldo em estoque.");
  const quantity = item.quantity + (movement.kind === "addition" ? movement.quantity : -movement.quantity);
  if (!Number.isSafeInteger(quantity)) throw new Error("Quantidade inválida para este produto.");
  return { ...item, quantity, movements: [...(item.movements ?? []), movement] };
}

export function stockProductVisible(procedure: Pick<Procedure, "id" | "name" | "comboItems">, inventory: InventoryItem[]) {
  if (procedure.comboItems !== undefined) return false;
  const saved = inventory.find(item => item.procedureId === procedure.id);
  if (saved?.visibleInStock !== undefined) return saved.visibleInStock;
  const name = procedure.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/\s+/g, " ");
  return ["bioestimulador", "botox", "combo", "fios de pdo", "fios pdo", "enzima", "pdo espiculado", "pdo multilaser", "liala peel", "preenchedor", "preenchimento", "protocolo"].some(category => name.includes(category));
}

// Persist the quantities applied to each appointment so reopening only applies the difference.
export function applyCheckoutInventory(inventory: InventoryItem[], previous: Appointment["stockConsumption"], products: StockProductUsage[]) {
  const consumption = stockConsumptionFor(products);
  const quantities = new Map(consumption.map(item => [item.procedureId, item.quantity]));
  const previousQuantities = new Map((previous ?? []).map((item) => [item.procedureId, item.quantity]));
  const next = [...inventory];
  for (const procedureId of new Set([...quantities.keys(), ...previousQuantities.keys()])) {
    const difference = (quantities.get(procedureId) ?? 0) - (previousQuantities.get(procedureId) ?? 0);
    if (!difference) continue;
    const index = next.findIndex((item) => item.procedureId === procedureId);
    const existing = next[index];
    const item = { ...existing, id: existing?.id ?? procedureId, procedureId, quantity: (existing?.quantity ?? 0) - difference };
    if (index < 0) next.push(item); else next[index] = item;
  }
  return { inventory: next, consumption };
}
