import { supabase } from "./supabase";
import type { Appointment, FinancialEntry, FixedCost, Patient, Procedure, Professional, ProfessionalPaymentReceipt, Receipt, RevenueEntry } from "./types";

export type MonthlyGoals = { month: string; companyGoal: number; professionalGoals: Record<string, number> };

export type EntityName =
  | "patients"
  | "professionals"
  | "procedures"
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
  "appointments",
  "financial_entries",
  "revenues",
  "fixed_costs",
  "receipts",
  "professional_receipts",
  "monthly_goals"
];

export function appDataTableMissing(error: unknown) {
  return String((error as { message?: string } | null)?.message ?? error).includes("avvi_records");
}

export async function selectEntity<T extends EntityName>(entity: T): Promise<EntityPayloadMap[T][]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from("avvi_records")
    .select("record_id,data,updated_at")
    .eq("entity", entity)
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row) => row.data as EntityPayloadMap[T]);
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

export async function syncEntityDiff<T extends EntityName>(entity: T, previous: EntityPayloadMap[T][], next: EntityPayloadMap[T][]) {
  const previousById = new Map(previous.map((record) => [getRecordId(record), record]));
  const nextById = new Map(next.map((record) => [getRecordId(record), record]));

  const removedIds = [...previousById.keys()].filter((recordId) => !nextById.has(recordId));
  const changedRecords = next.filter((record) => {
    const recordId = getRecordId(record);
    const oldRecord = previousById.get(recordId);
    return !oldRecord || JSON.stringify(oldRecord) !== JSON.stringify(record);
  });

  for (const ids of chunkArray(removedIds, 50)) {
    if (!supabase || !ids.length) continue;
    const { error } = await supabase
      .from("avvi_records")
      .delete()
      .eq("entity", entity)
      .in("record_id", ids);
    if (error) throw error;
  }

  for (const batch of chunkArray(changedRecords, 25)) {
    if (!supabase || !batch.length) continue;
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

export function getRecordId(record: { id?: string; month?: string }) {
  return record.id || record.month || crypto.randomUUID();
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}
