import type { ServicePackage } from "./servicePackages";
import type { PostProcedureContact, PostProcedureMessage } from "./types";
import { supabase } from "./supabase";
import type { AppRole, AppUser } from "./access";
import { canReadEntity } from "./access";
import type { DataSnapshot } from "./persistence";
let accessUser: AppRole | AppUser = "admin";
const usesGateway = () => typeof accessUser === "object" || accessUser === "standard" || isProtectedDatabase;
export const isProtectedDatabase = process.env.NEXT_PUBLIC_AVVI_PROTECTED_DATABASE === "true";
export function setDatabaseAccess(user: AppRole | AppUser) { accessUser = user; }
async function accessRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: "no-store", signal: AbortSignal.timeout(25000) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Acesso não autorizado.");
  return data;
}
import type { Appointment, FinancialEntry, FixedCost, Patient, Procedure, Professional, ProfessionalPaymentReceipt, Receipt, RevenueEntry, Service, InventoryItem, FollowUpRule, FollowUpContact, FollowUpLog, GiftStockItem, UltraformerTip, AnamneseRecord, ProfessionalStrategy } from "./types";

export type MonthlyGoals = { month: string; companyGoal: number; professionalGoals: Record<string, number> };

export type EntityName =
  | "patients"
  | "professionals"
  | "procedures"
  | "services"
  | "service_packages"
  | "inventory"
  | "gifts"
  | "strategies"
  | "anamneses"
  | "ultraformer_tips"
  | "followup_rules"
  | "followup_contacts"
  | "followup_logs"
  | "post_procedure_contacts"
  | "post_procedure_messages"
  | "appointments"
  | "financial_entries"
  | "revenues"
  | "fixed_costs"
  | "receipts"
  | "professional_receipts"
  | "monthly_goals";

export type EntityPayloadMap = {
  patients: Patient;
  professionals: Professional;
  procedures: Procedure;
  services: Service;
  service_packages: ServicePackage;
  inventory: InventoryItem;
  gifts: GiftStockItem;
  strategies: ProfessionalStrategy;
  anamneses: AnamneseRecord;
  ultraformer_tips: UltraformerTip;
  followup_rules: FollowUpRule;
  followup_contacts: FollowUpContact;
  followup_logs: FollowUpLog;
  post_procedure_contacts: PostProcedureContact;
  post_procedure_messages: PostProcedureMessage;
  appointments: Appointment;
  financial_entries: FinancialEntry;
  revenues: RevenueEntry;
  fixed_costs: FixedCost;
  receipts: Receipt;
  professional_receipts: ProfessionalPaymentReceipt;
  monthly_goals: MonthlyGoals;
};

export const entityNames: EntityName[] = [
  "patients",
  "professionals",
  "procedures",
  "services",
  "service_packages",
  "inventory",
  "gifts",
  "strategies",
  "anamneses",
  "ultraformer_tips",
  "followup_rules",
  "followup_contacts",
  "followup_logs",
  "post_procedure_contacts",
  "post_procedure_messages",
  "appointments",
  "financial_entries",
  "revenues",
  "fixed_costs",
  "receipts",
  "professional_receipts",
  "monthly_goals"
];

export function appDataTableMissing(error: unknown) {
  const detail = error as { code?: string; message?: string } | null;
  return detail?.code === "42P01" || detail?.code === "PGRST205" || /(?:could not find|does not exist).*avvi_records/i.test(String(detail?.message ?? error));
}

export type EntitySelectResult<T extends EntityName> = {
  records: EntityPayloadMap[T][];
  latestUpdatedAt: string;
};

export async function selectEntity<T extends EntityName>(entity: T): Promise<EntityPayloadMap[T][]> {
  const result = await selectEntityState(entity);
  return result.records;
}

// Conditional refresh works with the custom clinic session and protected RLS,
// unlike a browser Realtime subscription authenticated with only the anon key.
export async function selectCloudState(revision = ""): Promise<{ revision: string; data: Partial<DataSnapshot> } | null> {
  const response = await fetch("/api/access/data?sync=1", {
    cache: "no-store", signal: AbortSignal.timeout(25000),
    headers: revision ? { "If-None-Match": revision } : {}
  });
  if (response.status === 304) return null;
  const data = await response.json();
  if (!response.ok) throw new Error(data.error ?? "Não foi possível atualizar a agenda compartilhada.");
  return data;
}

export async function selectEntityState<T extends EntityName>(entity: T): Promise<EntitySelectResult<T>> {
  if (!supabase) return { records: [], latestUpdatedAt: "" };
  if (!canReadEntity(accessUser, entity)) return { records: [], latestUpdatedAt: "" };
  if (usesGateway()) return accessRequest(`/api/access/data?entity=${entity}`);
  const records: EntityPayloadMap[T][] = [];
  let latestUpdatedAt = "";
  const pageSize = 500;
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase
      .from("avvi_records")
      .select("record_id,data,updated_at")
      .eq("entity", entity)
      .order("updated_at", { ascending: false })
      .order("record_id", { ascending: true })
      .range(offset, offset + pageSize - 1);
    if (error) throw error;
    if (!offset) latestUpdatedAt = String(data?.[0]?.updated_at ?? "");
    records.push(...(data ?? []).map((row) => row.data as EntityPayloadMap[T]));
    if (!data || data.length < pageSize) break;
  }
  return { records, latestUpdatedAt };
}

export async function upsertRecord<T extends EntityName>(entity: T, record: EntityPayloadMap[T]) {
  if (!supabase) return;
  const recordId = getRecordId(record);
  const { error } = await supabase
    .from("avvi_records")
    .upsert({
      entity,
      record_id: recordId,
      data: record,
      updated_at: new Date().toISOString()
    }, { onConflict: "entity,record_id" });
  if (error) throw error;
}

export async function deleteRecord(entity: EntityName, recordId: string) {
  if (!supabase) return;
  const { error } = await supabase
    .from("avvi_records")
    .delete()
    .eq("entity", entity)
    .eq("record_id", recordId);
  if (error) throw error;
}

export async function syncEntity<T extends EntityName>(entity: T, records: EntityPayloadMap[T][]) {
  if (!supabase) return;
  const currentIds = new Set(records.map(getRecordId));
  const { data: existing, error: selectError } = await supabase
    .from("avvi_records")
    .select("record_id")
    .eq("entity", entity);
  if (selectError) throw selectError;

  const deleteIds = (existing ?? [])
    .map((row) => String(row.record_id))
    .filter((recordId) => !currentIds.has(recordId));

  for (const ids of chunkArray(deleteIds, 50)) {
    const { error } = await supabase
      .from("avvi_records")
      .delete()
      .eq("entity", entity)
      .in("record_id", ids);
    if (error) throw error;
  }

  if (!records.length) return;
  for (const batch of chunkArray(records, 25)) {
    const { error } = await supabase
      .from("avvi_records")
      .upsert(batch.map((record) => ({
        entity,
        record_id: getRecordId(record),
        data: record,
        updated_at: new Date().toISOString()
      })), { onConflict: "entity,record_id" });
    if (error) throw error;
  }
}

type EntityChange = { entity: EntityName; previous: EntityPayloadMap[EntityName][]; next: EntityPayloadMap[EntityName][] };

export async function syncEntityDiff<T extends EntityName>(entity: T, previous: EntityPayloadMap[T][], next: EntityPayloadMap[T][]) {
  return syncEntityDiffs([{ entity, previous, next }]);
}

export async function syncEntityDiffs(changes: EntityChange[]) {
  if (!supabase) return;
  const upserts: { entity: EntityName; record_id: string; data: EntityPayloadMap[EntityName]; updated_at: string }[] = [];
  const removed: { entity: EntityName; ids: string[] }[] = [];
  const updatedAt = new Date().toISOString();
  for (const { entity, previous, next } of changes) {
    const previousById = new Map(previous.map((record) => [getRecordId(record), record]));
    const nextIds = new Set(next.map(getRecordId));
    const ids = [...previousById.keys()].filter((recordId) => !nextIds.has(recordId));
    if (ids.length) removed.push({ entity, ids });
    for (const record of next) {
      const recordId = getRecordId(record);
      if (JSON.stringify(previousById.get(recordId)) !== JSON.stringify(record)) {
        upserts.push({ entity, record_id: recordId, data: record, updated_at: updatedAt });
      }
    }
  }
  if (usesGateway()) {
    if (upserts.length || removed.length) await accessRequest("/api/access/data", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ upserts, removed }) });
    return;
  }
  // Upserts share one request. Deletions are separate, and a failed batch remains pending for idempotent retry.
  if (upserts.length) {
    const { error } = await supabase.from("avvi_records").upsert(upserts, { onConflict: "entity,record_id" });
    if (error) throw error;
  }
  for (const { entity, ids } of removed) {
    for (const batch of chunkArray(ids, 50)) {
      const { error } = await supabase.from("avvi_records").delete().eq("entity", entity).in("record_id", batch);
      if (error) throw error;
    }
  }
}

export function getRecordId(record: { id?: string; month?: string }) {
  const recordId = record.id || record.month;
  if (!recordId) throw new Error("Registro sem identificador: o salvamento foi interrompido para evitar duplicação.");
  return recordId;
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
