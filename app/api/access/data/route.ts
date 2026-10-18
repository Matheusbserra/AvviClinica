import { validServicePackage } from "@/lib/servicePackages";
import { hasPackageSessionData, packageSessionError, validPackageSessionUses } from "@/lib/packageSessions";
import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import type { AppUser } from "@/lib/access";
import { resolveAccess, sameOrigin } from "@/lib/accessServer";
import { canAccessProfessional, canManageProfessional, canMoveStock, registrationOnly, canAccessTab, canReadEntity, canWriteEntity, hasFinancialAccess } from "@/lib/access";
import { checkoutStockUpdates } from "@/lib/stockAccess";
import { stockHistoryEntry } from "@/lib/accessSnapshot";
import { appointmentAvailabilityError, validClosedShifts } from "@/lib/agendaAvailability";
import { applyCheckoutUltraformer, isUltraformerTip, usageOnlyTipUpdate, validCheckoutShots } from "@/lib/ultraformer";
import { validStrategy } from "@/lib/strategyDefinitions";
import { validAnamnese } from "@/lib/anamnese";
import { cpfOnlyUpdate, invoiceOnlyUpdate, validInvoice } from "@/lib/invoices";
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
async function permittedRecords(user: AppUser, entity: string) {
    const records = await rows(entity);
    const permitted = entity === "strategies" ? records.filter(row => canAccessProfessional(user, String(row.data.professionalId))) : entity === "professionals" && registrationOnly(user) ? records.filter(row => canAccessProfessional(user, row.record_id)) : records;
    const data = permitted.map((row) => {
      if (user.role === "admin") return row.data;
      if (entity === "professionals") {
        const copy = { ...row.data };
        if (!canReadEntity(user, "monthly_goals")) delete copy.monthlyGoal;
        if (registrationOnly(user)) copy.commissionPercent = 0;
        return copy;
      }
      if (entity !== "financial_entries" || hasFinancialAccess(user)) return row.data;
      const entry = row.data as unknown as FinancialEntry;
      return stockHistoryEntry(entry);
    });
    return { records: data, latestUpdatedAt: records.map((row) => row.updated_at ?? "").sort().at(-1) ?? "" };
}

// All profiles share avvi_records. A private session only limits which categories
// and fields may be returned; it never creates a separate agenda for that user.
async function cloudRevision(user: AppUser, entities: EntityName[]) {
  const db = database(), hash = createHash("sha256").update(JSON.stringify(user));
  if (!entities.length) return `"${hash.digest("hex")}"`;
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from("avvi_records").select("entity,record_id,updated_at")
      .in("entity", entities).order("entity").order("record_id").range(offset, offset + 499);
    if (error) throw error;
    for (const row of data ?? []) hash.update(JSON.stringify([row.entity, row.record_id, row.updated_at]));
    if (!data || data.length < 500) return `"${hash.digest("hex")}"`;
  }
}

export async function GET(request: Request) {
  const user = await resolveAccess(request); if (!user) return Response.json({ error: "Autentique-se novamente." }, { status: 401, headers });
  const query = new URL(request.url).searchParams;
  try {
    if (query.get("sync") === "1") {
      const entities = entityNames.filter(entity => canReadEntity(user, entity));
      const revision = await cloudRevision(user, entities);
      const syncHeaders = { ...headers, ETag: revision, Vary: "Cookie" };
      if (request.headers.get("if-none-match") === revision) return new Response(null, { status: 304, headers: syncHeaders });
      const data = Object.fromEntries(await Promise.all(entities.map(async entity => [entity, (await permittedRecords(user, entity)).records])));
      return Response.json({ revision, data }, { headers: syncHeaders });
    }
    const entity = query.get("entity") ?? "";
    if (!entityNames.includes(entity as EntityName) || !canReadEntity(user, entity)) return Response.json({ error: "Esta informação é restrita ao administrador." }, { status: 403, headers });
    return Response.json(await permittedRecords(user, entity), { headers });
  } catch { return Response.json({ error: "Não foi possível consultar os dados permitidos na nuvem." }, { status: 503, headers }); }
}
// Use the existing JSON table for a shared lease, including across server instances.
// It is private to the gateway and is never included in a user's entity snapshot.
const packageLockEntity = "_package_checkout_lock";
async function packageLockedSave(request: Request, db: ReturnType<typeof database>): Promise<Response> {
  const owner = crypto.randomUUID(), expiresAt = new Date(Date.now() + 300000).toISOString();
  const lease = { entity: packageLockEntity, record_id: "checkout", data: { owner, expiresAt } };
  let acquired = false;
  for (let attempt = 0; attempt < 30; attempt++) {
    const inserted = await db.from("avvi_records").insert(lease);
    if (!inserted.error) { acquired = true; break; }
    const previous = await db.from("avvi_records").select("data").eq("entity", packageLockEntity).eq("record_id", "checkout").maybeSingle();
    if (previous.error) throw previous.error;
    // A lost HTTP acknowledgement must not strand our own successful insertion.
    if (previous.data?.data.owner === owner) { acquired = true; break; }
    if (inserted.error.code !== "23505") throw inserted.error;
    if (previous.data && previous.data.data.expiresAt < new Date().toISOString()) {
      const claimed = await db.from("avvi_records").update({ data: lease.data }).eq("entity", packageLockEntity).eq("record_id", "checkout").eq("data", JSON.stringify(previous.data.data)).select("record_id");
      if (claimed.error) throw claimed.error;
      if (claimed.data?.length) { acquired = true; break; }
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  if (!acquired) return Response.json({ error: "Outro fechamento de pacote está sendo salvo. Tente novamente em instantes; suas alterações continuam pendentes." }, { status: 409, headers });
  const ownsLease = async () => {
    const result = await db.from("avvi_records").select("data").eq("entity", packageLockEntity).eq("record_id", "checkout").eq("data->>owner", owner).maybeSingle();
    if (result.error) throw result.error;
    // Leave a full HTTP timeout before expiry; never start a write on an old lease.
    return !!result.data && Date.parse(result.data.data.expiresAt) - Date.now() > 30000;
  };
  try { return await saveData(request, ownsLease); }
  finally {
    await db.from("avvi_records").delete().eq("entity", packageLockEntity).eq("record_id", "checkout").eq("data->>owner", owner);
  }
}
export async function POST(request: Request) { return saveData(request); }
async function saveData(request: Request, ownsPackageLease?: () => Promise<boolean>): Promise<Response> {
  const user = await resolveAccess(request); if (!user) return Response.json({ error: "Autentique-se novamente." }, { status: 401, headers });
  if (!sameOrigin(request)) return Response.json({ error: "Origem não autorizada." }, { status: 403, headers });
  try {
    const retryRequest = request.clone();
    const { upserts = [], removed = [] } = await request.json();
    if (!Array.isArray(upserts) || !Array.isArray(removed) || upserts.length > 5000 || removed.length > 5000) return Response.json({ error: "Requisição inválida." }, { status: 400, headers });
    const db = database();
    const selectedStockProducts = upserts.filter(row => row.entity === "inventory" && row.data?.visibleInStock === true);
    if (selectedStockProducts.length) {
      const productIds = new Set((await rows("procedures")).map(row => row.record_id));
      for (const row of upserts) if (row.entity === "procedures" && canWriteEntity(user, "procedures")) productIds.add(row.record_id);
      if (selectedStockProducts.some(row => !productIds.has(row.data.procedureId))) return Response.json({ error: "Selecione um produto do Cadastro de Produtos." }, { status: 400, headers });
    }
    const packageUpdates = upserts.filter(row => row.entity === "service_packages");
    if (packageUpdates.length) {
      if (!canWriteEntity(user, "service_packages")) return Response.json({ error: "Cadastro de pacotes não autorizado." }, { status: 403, headers });
      const serviceIds = new Set((await rows("services")).map(row => row.record_id));
      for (const row of upserts) if (row.entity === "services" && canWriteEntity(user, "services")) serviceIds.add(row.record_id);
      for (const row of packageUpdates) if (!validServicePackage(row.data) || row.data.items.some((item: { serviceId: string }) => !serviceIds.has(item.serviceId))) return Response.json({ error: "Confira os serviços e os dados do pacote." }, { status: 400, headers });
    }
    const strategyUpdates = upserts.filter(row => row.entity === "strategies");
    if (strategyUpdates.length) {
      if (!canWriteEntity(user,"strategies")) return Response.json({error:"Acesso às estratégias não autorizado."},{status:403,headers});
      const [existing,professionals]=await Promise.all([rows("strategies"),rows("professionals")]);
      const professionalIds=new Set(professionals.map(row=>row.record_id));
      for(const row of upserts)if(row.entity==="professionals"&&canWriteEntity(user,"professionals")&&canManageProfessional(user,row.record_id))professionalIds.add(row.record_id);
      for (const row of strategyUpdates) {
        if(!validStrategy(row.data)||!professionalIds.has(row.data.professionalId))return Response.json({error:"Meta, período ou profissional da estratégia inválido."},{status:400,headers});
        const prior=existing.find(item=>item.record_id===row.record_id)?.data;
        if (!canAccessProfessional(user, row.data.professionalId) || prior && !canAccessProfessional(user, String(prior.professionalId))) return Response.json({error:"Estratégia deste profissional não autorizada."},{status:403,headers});
        const author={login:user.login,name:user.name?.trim()||user.login},now=new Date().toISOString();
        row.data={...row.data,createdAt:prior?.createdAt??now,createdBy:prior?.createdBy??author,updatedAt:now,updatedBy:author};
      }
    }
    const clinicalUpdates = upserts.filter(row => row.entity === "anamneses");
    if (clinicalUpdates.length) {
      if (!canWriteEntity(user, "anamneses")) return Response.json({ error: "Acesso à anamnese não autorizado." }, { status: 403, headers });
      const [existing, patients, professionals] = await Promise.all([rows("anamneses"), rows("patients"), rows("professionals")]);
      const patientIds = new Set(patients.map(row => row.record_id)); const professionalIds = new Set(professionals.map(row => row.record_id));
      for (const row of upserts) {
        if (row.entity === "patients" && canWriteEntity(user, "patients")) patientIds.add(row.record_id);
        if (row.entity === "professionals" && canWriteEntity(user, "professionals") && canManageProfessional(user, row.record_id)) professionalIds.add(row.record_id);
      }
      for (const row of clinicalUpdates) {
        if (!validAnamnese(row.data) || !patientIds.has(row.data.patientId) || !professionalIds.has(row.data.professionalId)) return Response.json({ error: "Ficha, paciente ou profissional inválido." }, { status: 400, headers });
        const prior = existing.find(item => item.record_id === row.record_id)?.data;
        if (prior && (prior.patientId !== row.data.patientId || prior.professionalId !== row.data.professionalId)) return Response.json({ error: "O vínculo da ficha não pode ser alterado." }, { status: 400, headers });
        if (prior && (prior.template ?? "facial") !== (row.data.template ?? "facial")) return Response.json({ error: "O modelo de uma ficha salva não pode ser alterado. Crie uma nova anamnese." }, { status: 400, headers });
        const author = { login: user.login, name: user.name?.trim() || user.login }; const now = new Date().toISOString();
        row.data = { id: row.data.id, patientId: row.data.patientId, professionalId: row.data.professionalId, date: row.data.date, templateVersion: 1, ...(row.data.template ? {template: row.data.template} : {}), answers: row.data.answers, createdAt: prior?.createdAt ?? now, updatedAt: now, createdBy: prior?.createdBy ?? author, updatedBy: author };
      }
    }
    const appointmentUpdates = upserts.filter((row) => row.entity === "appointments").map((row) => row.data as Appointment);
    if (appointmentUpdates.some(item => item.closedAccount?.packageSessionUses !== undefined && !validPackageSessionUses(item.closedAccount.packageSessionUses))) return Response.json({ error: "Confira os pacotes e as sessões utilizadas." }, { status: 409, headers });
    const stockUpdates = upserts.filter(row => ["inventory", "gifts"].includes(row.entity));
    const stockRestricted = user.role === "standard" && !canMoveStock(user);
    const deletedAppointments = removed.filter(item => item.entity === "appointments" && Array.isArray(item.ids)).flatMap(item => item.ids);
    const stored = appointmentUpdates.length || deletedAppointments.length || stockRestricted && stockUpdates.length ? (await rows("appointments")).map((row) => row.data as unknown as Appointment) : [];
    const packageSensitive = [...appointmentUpdates, ...stored.filter(item => deletedAppointments.includes(item.id) || appointmentUpdates.some(next => next.id === item.id))].some(hasPackageSessionData);
    if (packageSensitive) {
      const effective = [...stored.filter(item => !deletedAppointments.includes(item.id) && !appointmentUpdates.some(next => next.id === item.id)), ...appointmentUpdates];
      const packageError = packageSessionError(effective);
      if (packageError) return Response.json({ error: packageError }, { status: 409, headers });
    }
    if (stockRestricted) {
      if (removed.some(item => ["inventory", "gifts"].includes(item.entity) && item.ids?.length)) return Response.json({ error: "Movimentação de estoque não autorizada." }, { status: 403, headers });
      if (stockUpdates.length) {
        if (!canAccessTab(user, "Agenda")) return Response.json({ error: "Movimentação de estoque não autorizada." }, { status: 403, headers });
        const [inventory, gifts] = await Promise.all([rows("inventory"), rows("gifts")]);
        if (!checkoutStockUpdates(inventory.map(row => row.data as unknown as import("@/lib/types").InventoryItem), gifts.map(row => row.data as unknown as import("@/lib/types").GiftStockItem), stored, appointmentUpdates, deletedAppointments, stockUpdates)) return Response.json({ error: "Sem permissão para ajustar o estoque. A baixa automática deve corresponder ao fechamento da conta." }, { status: 403, headers });
      }
    }
    const tipUpdates = upserts.filter(row => row.entity === "ultraformer_tips");
    const shotAppointments = appointmentUpdates.filter(next => next.closedAccount?.ultraformerShots?.length || stored.find(old => old.id === next.id)?.closedAccount?.ultraformerShots?.length);
    const deletedShotAppointments = stored.filter(old => deletedAppointments.includes(old.id) && old.closedAccount?.ultraformerShots?.length).map(old => ({ ...old, accountClosed: false, closedAccount: undefined }));
    if (appointmentUpdates.some(next => next.closedAccount?.ultraformerShots !== undefined && !validCheckoutShots(next.closedAccount.ultraformerShots))) return Response.json({ error: "Confira as ponteiras e os disparos do Ultraformer." }, { status: 400, headers });
    const checkoutTipIds = new Set<string>();
    if (shotAppointments.length || deletedShotAppointments.length) {
      const [tipRows, patientRows, professionalRows] = await Promise.all([rows("ultraformer_tips"), rows("patients"), rows("professionals")]);
      const tips = tipRows.map(row => row.data as unknown as import("@/lib/types").UltraformerTip);
      let expected = tips;
      try {
        for (const next of [...shotAppointments, ...deletedShotAppointments]) {
          const patient = upserts.find(row => row.entity === "patients" && row.record_id === next.patientId)?.data ?? patientRows.find(row => row.record_id === next.patientId)?.data;
          const professional = upserts.find(row => row.entity === "professionals" && row.record_id === next.professionalId)?.data ?? professionalRows.find(row => row.record_id === next.professionalId)?.data;
          const old = stored.find(item => item.id === next.id);
          for (const shot of [...(old?.closedAccount?.ultraformerShots ?? []), ...(next.closedAccount?.ultraformerShots ?? [])]) checkoutTipIds.add(shot.tipId);
          expected = applyCheckoutUltraformer(expected, next, String(patient?.name ?? ""), String(professional?.name ?? ""), undefined);
        }
      } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Disparos inválidos." }, { status: 400, headers }); }
      // A checkout may adjust only its linked usages, with the balance base and manual history intact.
      const stable = (value: unknown) => JSON.stringify(value, (key, item) => key === "registeredBy" ? undefined : item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
      for (const tipId of checkoutTipIds) {
        const before = tips.find(tip => tip.id === tipId), after = expected.find(tip => tip.id === tipId), update = tipUpdates.find(row => row.record_id === tipId);
        if (update && stable(update.data) !== stable(after) || !update && stable(before) !== stable(after)) return Response.json({ error: "Os disparos devem corresponder ao fechamento da conta. Atualize a página e tente novamente." }, { status: 409, headers });
      }
    }
    const moved = appointmentUpdates.filter(item => !stored.some(old => old.id === item.id && old.professionalId === item.professionalId && old.startsAt === item.startsAt && old.endsAt === item.endsAt && old.eventType === item.eventType && !(old.status === "Cancelado" && item.status !== "Cancelado")));
    if (moved.length) {
      const professionals = (await rows("professionals")).map(row => row.data as unknown as import("@/lib/types").Professional);
      const deleted = new Set(removed.filter(item => item.entity === "appointments" && Array.isArray(item.ids)).flatMap(item => item.ids));
      const effectiveAppointments = [...stored.filter(item => !deleted.has(item.id) && !appointmentUpdates.some(next => next.id === item.id)), ...appointmentUpdates];
      for (const appointment of moved) {
        const professional = upserts.find(row => row.entity === "professionals" && row.record_id === appointment.professionalId)?.data ?? professionals.find(item => item.id === appointment.professionalId);
        const error = appointmentAvailabilityError(professional, effectiveAppointments, appointment.startsAt, appointment.endsAt, appointment.id, appointment.eventType);
        if (error) return Response.json({ error }, { status: 409, headers });
      }
    }
    if (user.role === "standard") for (const appointment of appointmentUpdates) {
      const account = appointment.closedAccount;
      if (!account) continue;
      const foreign = stored.some((item) => item.id !== appointment.id && item.closedAccount?.id === account.id);
      if (account.appointmentId !== appointment.id || foreign || (account.generatedEntryId && account.generatedEntryId !== `procedure-account-${account.id}`)) return Response.json({ error: "Vínculo de fechamento inválido." }, { status: 403, headers });
    }
    const touched = stored.filter((item) => deletedAppointments.includes(item.id) || appointmentUpdates.some((update) => update.id === item.id));
    const accounts = new Set([...touched, ...appointmentUpdates].flatMap((item) => [item.closedAccount?.id, item.financialEntryId, item.closedAccount?.generatedEntryId]).filter(Boolean));
    const entries = new Set([...accounts, ...upserts.filter((row) => row.entity === "financial_entries" && accounts.has(row.data?.sourceAccountId)).map((row) => row.record_id)]);
    const ledgerSources = new Set<string>(canWriteEntity(user, "financial_entries") ? upserts.filter(row => row.entity === "financial_entries").map(row => row.record_id) : []);
    const receiptSources = new Set<string>(canWriteEntity(user, "professional_receipts") ? upserts.filter(row => row.entity === "professional_receipts").map(row => row.record_id) : []);
    for (const row of upserts) {
      if (!entityNames.includes(row.entity) || typeof row.record_id !== "string" || !row.data || (row.data.id || row.data.month) !== row.record_id) return Response.json({ error: "Registro inválido." }, { status: 400, headers });
      if (row.entity === "service_packages" && !validServicePackage(row.data)) return Response.json({ error: "Dados do pacote inválidos." }, { status: 400, headers });
      if (row.entity === "inventory" && row.data.visibleInStock !== undefined && typeof row.data.visibleInStock !== "boolean") return Response.json({ error: "Visibilidade do produto no estoque inválida." }, { status: 400, headers });
      if (row.entity === "appointments" && row.data.invoice !== undefined && (!validInvoice(row.data.invoice) || row.data.invoice.localPdf)) return Response.json({error:"Anexo fiscal inválido."},{status:400,headers});
      if (row.entity === "professionals" && row.data.showInAgenda !== undefined && typeof row.data.showInAgenda !== "boolean") return Response.json({ error: "Visibilidade na agenda inválida." }, { status: 400, headers });
      if (row.entity === "professionals" && row.data.closedShifts !== undefined && !validClosedShifts(row.data.closedShifts)) return Response.json({ error: "Turnos de agenda inválidos." }, { status: 400, headers });
      if (row.entity === "professionals" && row.data.anamneseTemplate !== undefined && !["facial", "body"].includes(row.data.anamneseTemplate)) return Response.json({ error: "Modelo de anamnese inválido." }, { status: 400, headers });
      if (row.entity === "professionals" && !canManageProfessional(user, row.record_id)) return Response.json({ error: "Cadastro deste profissional não autorizado." }, { status: 403, headers });
      if (row.entity === "ultraformer_tips" && !isUltraformerTip(row.data)) return Response.json({ error: "Dados de ponteira ou utilização inválidos." }, { status: 400, headers });
      if (row.entity === "ultraformer_tips" && !canWriteEntity(user, "ultraformer_tips")) return Response.json({ error: "Acesso ao Ultraformer MPT não autorizado." }, { status: 403, headers });
      if (row.entity === "ultraformer_tips") {
        const { data: previous, error } = await db.from("avvi_records").select("data").eq("entity", "ultraformer_tips").eq("record_id", row.record_id).maybeSingle();
        if (error) throw error;
        const checkoutUpdate = canAccessTab(user, "Agenda") && checkoutTipIds.has(row.record_id);
        const previousIds = new Set((previous?.data?.usages ?? []).map((usage: { id: string }) => usage.id));
        const forgedCheckoutUsage = row.data.usages.some((usage: { id: string; appointmentId?: string; sourceAccountId?: string }) => !previousIds.has(usage.id) && (usage.appointmentId || usage.sourceAccountId));
        if (user.role === "standard" && !checkoutUpdate && (!canAccessTab(user, "Ultraformer MPT") || forgedCheckoutUsage || !usageOnlyTipUpdate(previous?.data, row.data))) return Response.json({ error: "Somente o administrador pode ajustar o saldo ou alterar o histórico. Registre uma nova utilização ou edite o fechamento correspondente." }, { status: 403, headers });
        const prior = new Map((previous?.data?.usages ?? []).map((usage: { id: string; registeredBy?: unknown }) => [usage.id, usage]));
        // Stamp new usages from the signed session; preserve the original author on retries and edits.
        row.data.usages = row.data.usages.map((usage: { id: string; registeredBy?: unknown }) => {
          const original = prior.get(usage.id) as { registeredBy?: unknown } | undefined;
          return { ...usage, registeredBy: original ? original.registeredBy : { id: user.id ?? (user.login === "admin" ? "primary-admin" : user.login), login: user.login, name: user.name?.trim() || user.login } };
        });
      }
      if (user.role !== "standard") continue;
      if (canWriteEntity(user, row.entity)) {
        if (row.entity === "professionals") {
          const { data, error } = await db.from("avvi_records").select("data").eq("entity", "professionals").eq("record_id", row.record_id).maybeSingle();
          if (error) throw error;
          // Registration updates cannot change a standard user's hidden commission.
          row.data.commissionPercent = data?.data.commissionPercent ?? 0;
          if (!canAccessTab(user, "Metas")) { delete row.data.monthlyGoal; if (data?.data.monthlyGoal !== undefined) row.data.monthlyGoal = data.data.monthlyGoal; }
        }
        continue;
      }
      if (row.entity === "appointments" && canAccessTab(user,"Nota Fiscal") && invoiceOnlyUpdate(stored.find(item=>item.id===row.record_id),row.data)) continue;
      if (row.entity === "patients" && canAccessTab(user, "Nota Fiscal")) {
        const { data: previous, error } = await db.from("avvi_records").select("data").eq("entity", "patients").eq("record_id", row.record_id).maybeSingle();
        if (error) throw error;
        if (cpfOnlyUpdate(previous?.data, row.data)) continue;
      }
      if (row.entity === "patients" && canAccessTab(user, "Anamnese")) {
        const { data: previous, error } = await db.from("avvi_records").select("data").eq("entity", "patients").eq("record_id", row.record_id).maybeSingle();
        if (error) throw error;
        // Photos are uploaded and attached by the private endpoint. A clinical-only
        // profile may acknowledge that saved record, without editing the patient.
        const stable = (value: unknown) => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a],[b]) => a.localeCompare(b))) : item);
        if (previous && stable(previous.data) === stable(row.data)) continue;
      }
      const accountDerivative = canAccessTab(user, "Agenda") && (row.entity === "financial_entries" ? accounts.has(row.data.sourceAccountId) && row.record_id === `procedure-account-${row.data.sourceAccountId}` && appointmentUpdates.some((item) => item.closedAccount?.generatedEntryId === row.record_id)
        : ["revenues", "fixed_costs"].includes(row.entity) && accounts.has(row.data.sourceFinancialEntryId) && row.record_id === `${row.entity === "revenues" ? "receita-entry" : "taxa-maquininha"}-${row.data.sourceFinancialEntryId}`);
      const ledgerDerivative = ["revenues", "fixed_costs"].includes(row.entity) && ledgerSources.has(row.data.sourceFinancialEntryId) && row.record_id === `${row.entity === "revenues" ? "receita-entry" : "taxa-maquininha"}-${row.data.sourceFinancialEntryId}`;
      const receiptDerivative = row.entity === "fixed_costs" && receiptSources.has(row.data.professionalReceiptId) && upserts.some(item => item.entity === "professional_receipts" && item.record_id === row.data.professionalReceiptId && Number(item.data.total) === Number(row.data.value) && item.data.date === row.data.dueDate);
      const derived = accountDerivative || ledgerDerivative || receiptDerivative;
      if (!derived) return Response.json({ error: "Alteração financeira restrita ao administrador." }, { status: 403, headers });
    }
    for (const item of removed) {
      if (!entityNames.includes(item.entity) || !Array.isArray(item.ids) || item.ids.some((id: unknown) => typeof id !== "string")) return Response.json({ error: "Exclusão inválida." }, { status: 400, headers });
      if (user.role === "standard" && item.entity === "ultraformer_tips" && item.ids.length) return Response.json({ error: "Somente o administrador pode excluir ponteiras ou utilizações." }, { status: 403, headers });
      if (item.entity === "strategies" && user.role === "standard" && item.ids.length) {
        const existing = await rows("strategies");
        if (existing.some(row => item.ids.includes(row.record_id) && !canAccessProfessional(user, String(row.data.professionalId)))) return Response.json({ error: "Exclusão de estratégia deste profissional não autorizada." }, { status: 403, headers });
      }
      if (item.entity === "professionals" && item.ids.some((id: string) => !canManageProfessional(user, id))) return Response.json({ error: "Exclusão deste profissional não autorizada." }, { status: 403, headers });
      if (user.role === "standard" && !canWriteEntity(user, item.entity)) {
        if (!canAccessTab(user, "Agenda") || !["financial_entries", "revenues", "fixed_costs"].includes(item.entity)) return Response.json({ error: "Exclusão financeira restrita ao administrador." }, { status: 403, headers });
        const { data, error } = await db.from("avvi_records").select("record_id,data").eq("entity", item.entity).in("record_id", item.ids);
        if (error) throw error;
        const permitted = (data ?? []).every((row) => item.entity !== "financial_entries"
          ? accounts.has(row.data.sourceFinancialEntryId)
          : entries.has(row.record_id) || (row.data.sourceAccountId && appointmentUpdates.some((appointment) => appointment.id === row.data.appointmentId && !appointment.accountClosed)));
        if (!permitted) return Response.json({ error: "Exclusão financeira restrita ao administrador." }, { status: 403, headers });
      }
    }
    if (packageSensitive) {
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return Response.json({ error: "Configure SUPABASE_SERVICE_ROLE_KEY no servidor para salvar sessões de pacotes." }, { status: 503, headers });
      // Re-run validation after taking the shared lease, using current cloud rows.
      if (!ownsPackageLease) return await packageLockedSave(retryRequest, db);
      if (!await ownsPackageLease()) return Response.json({ error: "Atualize os dados e tente salvar o pacote novamente." }, { status: 409, headers });
      const consumesCurrentSale = appointmentUpdates.some(item => item.closedAccount?.packageSessionUses?.some(use => use.sourceAppointmentId === item.id));
      // Older installed functions do not support consuming the sale being closed.
      if (!consumesCurrentSale) {
        const { error } = await db.rpc("avvi_save_package_checkout", { p_upserts: upserts, p_removed: removed });
        if (!error) return Response.json({ saved: true }, { headers });
        if (error.code !== "PGRST202" && error.code !== "42883") {
          if (error.code === "P0001") return Response.json({ error: error.message }, { status: 409, headers });
          throw error;
        }
      }
      // No extra SQL is required: the account already contains its paid sessions.
      // Older installations use the same CRUD path as other account closures.
    }
    const checkPackageLease = async () => { if (ownsPackageLease && !await ownsPackageLease()) throw new Error("A coordenação do fechamento expirou. Tente salvar novamente."); };
    for (const item of removed) for (let offset = 0; offset < item.ids.length; offset += 50) {
      await checkPackageLease();
      const { error } = await db.from("avvi_records").delete().eq("entity", item.entity).in("record_id", item.ids.slice(offset, offset + 50)); if (error) throw error;
    }
    // Removing a closed account reverses its derived records even though restricted rows are not loaded by this user.
    if (user.role === "standard") for (const old of touched) {
      const next = appointmentUpdates.find((item) => item.id === old.id);
      if (old.accountClosed && (!next || !next.accountClosed)) {
        for (const entity of ["revenues", "fixed_costs", "financial_entries"]) {
          const ids = [old.closedAccount?.id, old.financialEntryId, old.closedAccount?.generatedEntryId].filter(Boolean);
          for (const id of ids) {
            await checkPackageLease();
            const field = entity === "financial_entries" ? "sourceAccountId" : "sourceFinancialEntryId";
            const { error } = await db.from("avvi_records").delete().eq("entity", entity).eq(`data->>${field}`, id); if (error) throw error;
          }
        }
      }
    }
    // Write the account/stock state last: retries retain the stored account links until all reversals finish.
    if (upserts.length) { await checkPackageLease(); const { error } = await db.from("avvi_records").upsert(upserts, { onConflict: "entity,record_id" }); if (error) throw error; }
    return Response.json({ saved: true }, { headers });
  } catch { return Response.json({ error: "Não foi possível salvar. Suas alterações continuam pendentes." }, { status: 503, headers }); }
}
