import { createClient } from "@supabase/supabase-js";
import { readAccess, sameOrigin } from "@/lib/accessServer";
import { canReadEntity, standardEntities } from "@/lib/access";
import { entityNames } from "@/lib/database";
import type { EntityName } from "@/lib/database";
import type { Appointment, FinancialEntry } from "@/lib/types";
export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
function database() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/(rest|auth)\/v1\/?$/, "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key?.trim()) throw new Error("Conexão com a nuvem não configurada.");
  return createClient(url, key.trim(), { auth: { persistSession: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(25000) }) } });
}
async function rows(entity: string) {
  const db = database(); const result: { record_id: string; data: Record<string, unknown>; updated_at?: string }[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from("avvi_records").select("record_id,data,updated_at").eq("entity", entity).order("record_id").range(offset, offset + 499);
    if (error) throw error;
    result.push(...data); if (data.length < 500) return result;
  }
}
export async function GET(request: Request) {
  const user = readAccess(request); if (!user) return Response.json({ error: "Autentique-se novamente." }, { status: 401, headers });
  const entity = new URL(request.url).searchParams.get("entity") ?? "";
  if (!entityNames.includes(entity as EntityName) || !canReadEntity(user.role, entity)) return Response.json({ error: "Esta informação é restrita ao administrador." }, { status: 403, headers });
  try {
    const records = await rows(entity);
    const data = records.map((row) => {
      if (user.role !== "standard") return row.data;
      if (entity === "professionals") { const copy = { ...row.data }; delete copy.monthlyGoal; return copy; }
      if (entity !== "financial_entries") return row.data;
      const entry = row.data as unknown as FinancialEntry;
      // Only the identifiers and quantities needed by the permitted stock history are returned.
      return { id: entry.id, patientId: entry.patientId, professionalId: entry.professionalId, appointmentId: entry.appointmentId,
        sourceAccountId: entry.sourceAccountId, date: entry.date, procedureId: entry.procedureId, manualProcedure: entry.manualProcedure,
        quantity: entry.quantity, products: entry.products?.map(({ id, procedureId, quantity }) => ({ id, procedureId, quantity, unitCost: 0 })),
        procedureLines: entry.procedureLines?.map(({ id, procedureId, manualProcedure, quantity }) => ({ id, procedureId, manualProcedure, quantity, servicePrice: 0, productCost: 0, professionalPercent: 0 })),
        servicePrice: 0, productCost: 0, machineFee: 0, commercialDiscount: 0, professionalPercent: 0, discountSplit: "Empresa assume", notes: "", payments: [] };
    });
    return Response.json({ records: data, latestUpdatedAt: records.map((row) => row.updated_at ?? "").sort().at(-1) ?? "" }, { headers });
  } catch { return Response.json({ error: "Não foi possível consultar os dados permitidos na nuvem." }, { status: 503, headers }); }
}
export async function POST(request: Request) {
  const user = readAccess(request); if (!user) return Response.json({ error: "Autentique-se novamente." }, { status: 401, headers });
  if (!sameOrigin(request)) return Response.json({ error: "Origem não autorizada." }, { status: 403, headers });
  try {
    const { upserts = [], removed = [] } = await request.json();
    if (!Array.isArray(upserts) || !Array.isArray(removed) || upserts.length > 5000 || removed.length > 5000) return Response.json({ error: "Requisição inválida." }, { status: 400, headers });
    const db = database();
    const appointmentUpdates = upserts.filter((row) => row.entity === "appointments").map((row) => row.data as Appointment);
    const stored = user.role === "standard" && appointmentUpdates.length ? (await rows("appointments")).map((row) => row.data as unknown as Appointment) : [];
    if (user.role === "standard") for (const appointment of appointmentUpdates) {
      const account = appointment.closedAccount;
      if (!account) continue;
      const foreign = stored.some((item) => item.id !== appointment.id && item.closedAccount?.id === account.id);
      if (account.appointmentId !== appointment.id || foreign || (account.generatedEntryId && account.generatedEntryId !== `procedure-account-${account.id}`)) return Response.json({ error: "Vínculo de fechamento inválido." }, { status: 403, headers });
    }
    const touched = stored.filter((item) => appointmentUpdates.some((update) => update.id === item.id));
    const accounts = new Set([...touched, ...appointmentUpdates].flatMap((item) => [item.closedAccount?.id, item.financialEntryId, item.closedAccount?.generatedEntryId]).filter(Boolean));
    const entries = new Set([...accounts, ...upserts.filter((row) => row.entity === "financial_entries" && accounts.has(row.data?.sourceAccountId)).map((row) => row.record_id)]);
    for (const row of upserts) {
      if (!entityNames.includes(row.entity) || typeof row.record_id !== "string" || !row.data || (row.data.id || row.data.month) !== row.record_id) return Response.json({ error: "Registro inválido." }, { status: 400, headers });
      if (user.role !== "standard") continue;
      if (standardEntities.includes(row.entity)) {
        if (row.entity === "professionals") {
          const { data } = await db.from("avvi_records").select("data").eq("entity", "professionals").eq("record_id", row.record_id).maybeSingle();
          // The standard user never edits a professional's goal through an allowed registration screen.
          delete row.data.monthlyGoal; if (data?.data.monthlyGoal !== undefined) row.data.monthlyGoal = data.data.monthlyGoal;
        }
        continue;
      }
      const derived = row.entity === "financial_entries" ? accounts.has(row.data.sourceAccountId) && row.record_id === `procedure-account-${row.data.sourceAccountId}` && appointmentUpdates.some((item) => item.closedAccount?.generatedEntryId === row.record_id)
        : row.entity === "revenues" && accounts.has(row.data.sourceFinancialEntryId) && row.record_id === `receita-entry-${row.data.sourceFinancialEntryId}`;
      if (!derived) return Response.json({ error: "Alteração financeira restrita ao administrador." }, { status: 403, headers });
    }
    for (const item of removed) {
      if (!entityNames.includes(item.entity) || !Array.isArray(item.ids) || item.ids.some((id: unknown) => typeof id !== "string")) return Response.json({ error: "Exclusão inválida." }, { status: 400, headers });
      if (user.role === "standard" && !standardEntities.includes(item.entity)) {
        if (!["financial_entries", "revenues"].includes(item.entity)) return Response.json({ error: "Exclusão financeira restrita ao administrador." }, { status: 403, headers });
        const { data, error } = await db.from("avvi_records").select("record_id,data").eq("entity", item.entity).in("record_id", item.ids);
        if (error) throw error;
        const permitted = (data ?? []).every((row) => item.entity === "revenues"
          ? accounts.has(row.data.sourceFinancialEntryId)
          : entries.has(row.record_id) || (row.data.sourceAccountId && appointmentUpdates.some((appointment) => appointment.id === row.data.appointmentId && !appointment.accountClosed)));
        if (!permitted) return Response.json({ error: "Exclusão financeira restrita ao administrador." }, { status: 403, headers });
      }
    }
    for (const item of removed) for (let offset = 0; offset < item.ids.length; offset += 50) {
      const { error } = await db.from("avvi_records").delete().eq("entity", item.entity).in("record_id", item.ids.slice(offset, offset + 50)); if (error) throw error;
    }
    // Removing a closed account reverses its derived records even though restricted rows are not loaded by this user.
    if (user.role === "standard") for (const old of touched) {
      const next = appointmentUpdates.find((item) => item.id === old.id);
      if (old.accountClosed && next && !next.accountClosed) {
        for (const entity of ["revenues", "fixed_costs", "financial_entries"]) {
          const ids = [old.closedAccount?.id, old.financialEntryId, old.closedAccount?.generatedEntryId].filter(Boolean);
          for (const id of ids) {
            const field = entity === "financial_entries" ? "sourceAccountId" : "sourceFinancialEntryId";
            const { error } = await db.from("avvi_records").delete().eq("entity", entity).eq(`data->>${field}`, id); if (error) throw error;
          }
        }
      }
    }
    // Write the account/stock state last: retries retain the stored account links until all reversals finish.
    if (upserts.length) { const { error } = await db.from("avvi_records").upsert(upserts, { onConflict: "entity,record_id" }); if (error) throw error; }
    return Response.json({ saved: true }, { headers });
  } catch { return Response.json({ error: "Não foi possível salvar. Suas alterações continuam pendentes." }, { status: 503, headers }); }
}
