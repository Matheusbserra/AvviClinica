import type { EntityName, EntityPayloadMap } from "./database";

export type DataSnapshot = { [K in EntityName]: EntityPayloadMap[K][] };
export type LocalSnapshot = { savedAt: string; data: DataSnapshot; syncedData?: DataSnapshot };
export const snapshotKey = "avvi.data.snapshot.v1";
export const snapshotEntities: EntityName[] = ["patients", "professionals", "procedures", "services", "service_packages", "inventory", "gifts", "anamneses", "strategies", "ultraformer_tips", "followup_rules", "followup_contacts", "followup_logs", "post_procedure_contacts", "appointments", "financial_entries", "revenues", "fixed_costs", "receipts", "professional_receipts", "monthly_goals"];
const recordId = (item: { id?: string; month?: string }) => item.id || item.month || "";
const equal = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);

export function normalizeSnapshot(value: Partial<DataSnapshot>): DataSnapshot {
  return Object.fromEntries(snapshotEntities.map((entity) => [entity, Array.isArray(value[entity]) ? value[entity] : []])) as DataSnapshot;
}
export function snapshotChanges(previous: DataSnapshot, next: DataSnapshot) {
  return snapshotEntities.map((entity) => ({ entity, previous: previous[entity], next: next[entity] }));
}
export function hasSnapshotChanges(previous: DataSnapshot, next: DataSnapshot) {
  return snapshotEntities.some((entity) => {
    const before = new Map(previous[entity].map((record) => [recordId(record), record]));
    return before.size !== next[entity].length || next[entity].some((record) => !equal(before.get(recordId(record)), record));
  });
}
export function recordIsPending(baseline: DataSnapshot, draft: DataSnapshot, entity: EntityName, id: string) {
  return !equal(baseline[entity].find((item) => recordId(item) === id), draft[entity].find((item) => recordId(item) === id));
}
// Replay only local edits/deletions. Unchanged records keep the latest cloud version.
export function recoverPendingChanges(remote: DataSnapshot, baseline: DataSnapshot, draft: DataSnapshot): DataSnapshot {
  const result = { ...remote };
  for (const entity of snapshotEntities) {
    const before = new Map(baseline[entity].map((record) => [recordId(record), record]));
    const after = new Map(draft[entity].map((record) => [recordId(record), record]));
    const recovered = new Map(remote[entity].map((record) => [recordId(record), record]));
    for (const id of before.keys()) if (!after.has(id)) recovered.delete(id);
    for (const [id, record] of after) if (!equal(before.get(id), record)) recovered.set(id, record);
    Object.assign(result, { [entity]: [...recovered.values()] });
  }
  return result;
}
export function readSnapshot(storage: Pick<Storage, "getItem">, key = snapshotKey): LocalSnapshot | null {
  const raw = storage.getItem(key);
  if (!raw) return null;
  const parsed = JSON.parse(raw);
  if (!parsed?.data || typeof parsed.data !== "object" || Array.isArray(parsed.data)) throw new Error("A cópia local está inválida.");
  return { savedAt: String(parsed.savedAt ?? ""), data: normalizeSnapshot(parsed.data), ...(parsed.syncedData ? { syncedData: normalizeSnapshot(parsed.syncedData) } : {}) };
}
export function writeSnapshot(storage: Pick<Storage, "setItem">, data: DataSnapshot, syncedData: DataSnapshot | null, key = snapshotKey) {
  storage.setItem(key, JSON.stringify({ savedAt: new Date().toISOString(), data, ...(syncedData ? { syncedData } : {}) }));
}
