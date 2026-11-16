import { validServicePackage } from "@/lib/servicePackages";
import { validPostProcedurePlan, validPostProcedureContact, validPostProcedureMessage, postProcedurePhoneOnlyUpdate, postProcedureTasks } from "@/lib/postProcedure";
import { hasPackageSessionData, packageSessionError, validPackageSessionUses, preserveImportedPatientPackages } from "@/lib/packageSessions";
import { createClient } from "@supabase/supabase-js";
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { AppUser } from "@/lib/access";
import { resolveAccess, sameOrigin } from "@/lib/accessServer";
import { followUpEnabled, canAccessProfessional, canManageProfessional, canMoveStock, registrationOnly, isMetaReviewer, canAccessTab, canReadEntity, canWriteEntity, hasFinancialAccess } from "@/lib/access";
import { checkoutStockUpdates } from "@/lib/stockAccess";
import { applyStockMovement, validStockMovement } from "@/lib/inventory";
import { stockHistoryEntry, followUpEntityRows, postProcedureOnly, postProcedureEntityRows } from "@/lib/accessSnapshot";
import { appointmentAvailabilityError, reservedInterval, validClosedShifts } from "@/lib/agendaAvailability";
import { applyCheckoutUltraformer, isUltraformerTip, usageOnlyTipUpdate, validCheckoutShots } from "@/lib/ultraformer";
import { validStrategy } from "@/lib/strategyDefinitions";
import { validAnamnese } from "@/lib/anamnese";
import { cpfOnlyUpdate, invoiceOnlyUpdate, validInvoice, preserveCloudInvoice } from "@/lib/invoices";
import { entityNames } from "@/lib/database";
import type { EntityName } from "@/lib/database";
import type { Appointment, FinancialEntry, GiftStockItem, InventoryItem, Patient, PatientCreditDeposit, Professional, StockMovementRequest } from "@/lib/types";
import { patientCreditFeeCost, validPatientCreditDeposit } from "@/lib/patientCredit";
export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
function database() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/(rest|auth)\/v1\/?$/, "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key?.trim()) throw new Error("Conexão com a nuvem não configurada.");
  return createClient(url, key.trim(), { auth: { persistSession: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(25000) }) } });
}
type ReadFilter = { field: string; op: "in"; values: string[] } | { field: string; op: "lt" | "gt" | "neq" | "like"; value: string } | { op: "or"; value: string };
type RecordRow = { record_id: string; data: Record<string, unknown>; updated_at?: string };
async function rows<T = RecordRow>(entity: string, filters: ReadFilter[] = [], projection = "record_id,data,updated_at") {
  const db = database(); const result: T[] = [];
  for (let offset = 0; ; offset += 500) {
    let query = db.from("avvi_records").select(projection).eq("entity", entity);
    for (const filter of filters) {
      if (filter.op === "in") query = query.in(filter.field, filter.values);
      else if (filter.op === "or") query = query.or(filter.value);
      else query = query.filter(filter.field, filter.op, filter.value);
    }
    const { data, error } = await query.order("record_id").range(offset, offset + 499);
    if (error) throw error;
    result.push(...data as unknown as typeof result); if (data.length < 500) return result;
  }
}
async function rowsByIds<T = RecordRow>(entity: string, ids: string[], field = "record_id", projection = "record_id,data,updated_at") {
  const unique = [...new Set(ids.filter(id => typeof id === "string" && id))], result: T[] = [];
  for (let offset = 0; offset < unique.length; offset += 100) result.push(...await rows<T>(entity, [{field,op:"in",values:unique.slice(offset,offset+100)}], projection));
  return result;
}
async function permittedRecords(user: AppUser, entity: string) {
    const records = await rows(entity);
    const permitted = entity === "strategies" ? records.filter(row => canAccessProfessional(user, String(row.data.professionalId))) : entity === "professionals" && registrationOnly(user) ? records.filter(row => canAccessProfessional(user, row.record_id)) : records;
    const data = permitted.map((row) => {
      if (postProcedureOnly(user)) return postProcedureEntityRows(entity, [row.data])[0];
      if (isMetaReviewer(user)) return followUpEntityRows(entity, [row.data])[0];
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
  const db = database(), scope = createHash("sha256").update(JSON.stringify(user)).digest("hex");
  const compact = await db.rpc("avvi_sync_revisions", { requested_entities: entities });
  if (!compact.error) {
    if (!Array.isArray(compact.data) || compact.data.length !== entities.length || new Set(compact.data.map(row=>row.entity)).size !== entities.length || compact.data.some(row=>!entities.includes(row.entity) || !/^[a-f0-9]{64}$/.test(row.fingerprint))) throw new Error("Resposta de sincronização inválida.");
    return {...signedRevision(scope, Object.fromEntries(compact.data.map(row=>[row.entity,row.fingerprint]))), mode: "compact"};
  }
  // Preserve operation while the optional, service-only SQL function is installed.
  // Provider/network/permission errors must never be mistaken for empty data.
  if (!["PGRST202", "42883"].includes(compact.error.code) && compact.status !== 404) throw compact.error;
  const hashes = new Map(entities.map(entity => [entity, createHash("sha256")]));
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from("avvi_records").select("entity,record_id,updated_at")
      .in("entity", entities).order("entity").order("record_id").range(offset, offset + 499);
    if (error) throw error;
    for (const row of data ?? []) hashes.get(row.entity)?.update(JSON.stringify([row.record_id, row.updated_at]));
    if (!data || data.length < 500) {
      const stamps = Object.fromEntries([...hashes].map(([entity, hash]) => [entity, hash.digest("hex")]));
      return {...signedRevision(scope, stamps), mode: "metadata"};
    }
  }
}
function signedRevision(scope: string, stamps: Record<string,string>) {
  stamps = Object.fromEntries(Object.entries(stamps).sort(([a],[b])=>a.localeCompare(b)));
  const payload = Buffer.from(JSON.stringify({ scope, stamps })).toString("base64url");
  const signature = createHmac("sha256", revisionSecret()).update("avvi-sync-v2\0").update(payload).digest("base64url");
  return { revision: `"sync2.${payload}.${signature}"`, scope, stamps };
}
function revisionSecret() {
  const secret = process.env.AVVI_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error("Sessão de sincronização indisponível.");
  return secret;
}
function previousEntityStamps(revision: string | null, scope: string): Record<string, string> | null {
  if (!revision || revision.length > 12000) return null;
  try {
    const match = /^"sync2\.([A-Za-z0-9_-]+)\.([A-Za-z0-9_-]+)"$/.exec(revision);
    if (!match) return null;
    const expected = createHmac("sha256", revisionSecret()).update("avvi-sync-v2\0").update(match[1]).digest(), signature = Buffer.from(match[2], "base64url");
    if (signature.length !== expected.length || !timingSafeEqual(signature, expected)) return null;
    const parsed = JSON.parse(Buffer.from(match[1], "base64url").toString());
    return parsed.scope === scope && parsed.stamps && typeof parsed.stamps === "object" && !Array.isArray(parsed.stamps) ? parsed.stamps : null;
  } catch { return null; }
}

export async function GET(request: Request) {
  const user = await resolveAccess(request); if (!user) return Response.json({ error: "Autentique-se novamente." }, { status: 401, headers });
  const query = new URL(request.url).searchParams;
  try {
    if (query.get("sync") === "1") {
      const entities = entityNames.filter(entity => canReadEntity(user, entity));
      const { revision, scope, stamps, mode } = await cloudRevision(user, entities);
      const syncHeaders = { ...headers, ETag: revision, Vary: "Cookie", "X-AVVI-Sync-Mode": mode };
      if (request.headers.get("if-none-match") === revision) return new Response(null, { status: 304, headers: syncHeaders });
      const previous = previousEntityStamps(request.headers.get("if-none-match"), scope);
      const changed = entities.filter(entity => previous?.[entity] !== stamps[entity]);
      const data = Object.fromEntries(await Promise.all(changed.map(async entity => [entity, (await permittedRecords(user, entity)).records])));
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
  if (!acquired) return Response.json({ error: "Outro lançamento está sendo salvo. Tente novamente em instantes. Suas alterações continuam pendentes." }, { status: 409, headers });
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

async function recordStockMovement(db: ReturnType<typeof database>, user: AppUser, request: StockMovementRequest, ownsLease: () => Promise<boolean>) {
  const { id, kind, procedureId, quantity } = request;
  const [row] = await rowsByIds<{ record_id: string; data: InventoryItem }>("inventory", [procedureId], "data->>procedureId");
  if (!row && !(await rowsByIds("procedures", [procedureId], "record_id", "record_id")).length) {
    return Response.json({ error: "Produto não encontrado." }, { status: 404, headers });
  }
  const current = row?.data ?? { id: procedureId, procedureId, quantity: 0, visibleInStock: true };
  const actorId = user.id ?? user.login;
  const previous = current.movements?.find(entry => entry.id === id);
  if (previous) {
    if (previous.actorId !== actorId || previous.kind !== kind || previous.quantity !== quantity) {
      return Response.json({ error: "Esta movimentação já foi registrada." }, { status: 409, headers });
    }
    return Response.json({ inventoryItem: current }, { headers });
  }
  const at = new Date().toISOString();
  let inventoryItem: InventoryItem;
  try { inventoryItem = applyStockMovement(current, { id, kind, quantity, at, by: user.name?.trim() || user.login, actorId }); }
  catch (error) { return Response.json({ error: (error as Error).message }, { status: 409, headers }); }
  if (!await ownsLease()) return Response.json({ error: "Tente salvar a movimentação novamente." }, { status: 409, headers });
  const { error } = await db.from("avvi_records").upsert({
    entity: "inventory", record_id: row?.record_id ?? inventoryItem.id, data: inventoryItem, updated_at: at
  }, { onConflict: "entity,record_id" });
  if (error) throw error;
  return Response.json({ inventoryItem }, { headers });
}

async function saveData(request: Request, ownsPackageLease?: () => Promise<boolean>): Promise<Response> {
  const user = await resolveAccess(request); if (!user) return Response.json({ error: "Autentique-se novamente." }, { status: 401, headers });
  if (!sameOrigin(request)) return Response.json({ error: "Origem não autorizada." }, { status: 403, headers });
  try {
    const retryRequest = request.clone();
    const { upserts = [], removed = [], patientCreditBases = {}, stockMovement } = await request.json();
    if (!Array.isArray(upserts) || !Array.isArray(removed) || upserts.length > 5000 || removed.length > 5000) return Response.json({ error: "Requisição inválida." }, { status: 400, headers });
    if (!patientCreditBases || typeof patientCreditBases !== "object" || Array.isArray(patientCreditBases) || Object.values(patientCreditBases).some(value => !Number.isFinite(value))) return Response.json({ error: "Saldo de referência inválido." }, { status: 400, headers });
    if (!followUpEnabled && [...upserts, ...removed].some(row => typeof row?.entity === "string" && row.entity.startsWith("followup_"))) return Response.json({ disabled:true,error:"Follow Up temporariamente desativado. Atualize a página para continuar usando as outras áreas." }, { status:503,headers });
    if (isMetaReviewer(user) && [...upserts, ...removed].some(row => !canWriteEntity(user, row.entity))) return Response.json({ error: "Acesso restrito ao Follow Up." }, { status: 403, headers });
    if (canAccessTab(user, "Simulação") && !entityNames.some(entity => canWriteEntity(user, entity))) return Response.json({ error: "Esta conta tem acesso somente à simulação, sem gravação de dados." }, { status: 403, headers });
    const db = database();
    if (stockMovement !== undefined) {
      if (!canMoveStock(user)) return Response.json({ error: "Movimentação de estoque não autorizada." }, { status: 403, headers });
      if (!validStockMovement(stockMovement) || upserts.length || removed.length) return Response.json({ error: "Informe uma quantidade inteira e positiva." }, { status: 400, headers });
      if (!ownsPackageLease) return await packageLockedSave(retryRequest, db);
      return await recordStockMovement(db, user, stockMovement, ownsPackageLease);
    }
    const inventoryUpdates = upserts.filter(row => row?.entity === "inventory");
    const inventoryDeletes = removed.filter(row => row?.entity === "inventory" && Array.isArray(row.ids)).flatMap(row => row.ids);
    if ((inventoryUpdates.length || inventoryDeletes.length) && !ownsPackageLease) return await packageLockedSave(retryRequest, db);
    const inventoryRows = (inventoryUpdates.length || inventoryDeletes.length)
      ? await rowsByIds<{ record_id: string; data: InventoryItem }>("inventory", [...inventoryUpdates.map(row => row.record_id), ...inventoryDeletes])
      : [];
    // Movement history can only be changed by the authenticated operation above.
    for (const { record_id, data } of inventoryRows) {
      if (data.movements?.length && inventoryDeletes.includes(record_id)) return Response.json({ error: "O produto possui histórico de movimentações." }, { status: 409, headers });
    }
    for (const row of inventoryUpdates) {
      const current = inventoryRows.find(item => item.record_id === row.record_id)?.data;
      const history = current?.movements ?? [];
      const submitted = row.data?.movements;
      if (submitted !== undefined && !Array.isArray(submitted) || history.length !== (submitted?.length ?? 0)
        || history.some((entry, index) => entry.id !== submitted[index]?.id)) {
        return Response.json({ error: "O estoque mudou. Atualize os dados antes de salvar novamente." }, { status: 409, headers });
      }
      if (current?.movements) row.data.movements = current.movements;
      else if (row.data) delete row.data.movements;
    }
    const postContacts = upserts.filter(row => row.entity === "post_procedure_contacts");
    if (postContacts.length) {
      if (!canWriteEntity(user, "post_procedure_contacts")) return Response.json({ error: "Acesso ao pós-procedimento não autorizado." }, { status: 403, headers });
      if (postContacts.some(row => !validPostProcedureContact(row.data))) return Response.json({ error: "Confira os dados do contato pós-procedimento." }, { status: 400, headers });
      // Validate only the referenced visits/services, avoiding a full agenda download per contact.
      const referencedRows = async (entity: string, ids: string[]) => {
        const result: { data: Record<string, unknown> }[] = [], unique = [...new Set(ids)];
        for (let offset = 0; offset < unique.length; offset += 100) {
          const { data, error } = await db.from("avvi_records").select("record_id,data").eq("entity", entity).in("record_id", unique.slice(offset, offset + 100));
          if (error) throw error;
          result.push(...data);
        }
        return result;
      };
      const [visits, catalog] = await Promise.all([referencedRows("appointments", postContacts.map(row => row.data.appointmentId)), referencedRows("services", postContacts.map(row => row.data.serviceId))]);
      const validTasks = new Map(postProcedureTasks(visits.map(row => row.data) as unknown as Appointment[], catalog.map(row => row.data) as unknown as import("@/lib/types").Service[], [], [], []).map(task => [task.id, task]));
      for (const row of postContacts) {
        const task = validTasks.get(row.data.id);
        if (!task || task.patientId !== row.data.patientId || row.data.dueDate && row.data.dueDate < task.performedOn) return Response.json({ error: "O atendimento ou serviço foi alterado. Atualize os dados antes de registrar este contato." }, { status: 409, headers });
      }
    }
    const selectedStockProducts = upserts.filter(row => row.entity === "inventory" && row.data?.visibleInStock === true);
    if (selectedStockProducts.length) {
      const productIds = new Set((await rowsByIds("procedures", selectedStockProducts.map(row => row.data.procedureId), "record_id", "record_id")).map(row => row.record_id));
      for (const row of upserts) if (row.entity === "procedures" && canWriteEntity(user, "procedures")) productIds.add(row.record_id);
      if (selectedStockProducts.some(row => !productIds.has(row.data.procedureId))) return Response.json({ error: "Selecione um produto do Cadastro de Produtos." }, { status: 400, headers });
    }
    const packageUpdates = upserts.filter(row => row.entity === "service_packages");
    if (packageUpdates.length) {
      if (!canWriteEntity(user, "service_packages")) return Response.json({ error: "Cadastro de pacotes não autorizado." }, { status: 403, headers });
      const serviceIds = new Set((await rowsByIds("services", packageUpdates.flatMap(row => Array.isArray(row.data?.items) ? row.data.items.map((item: {serviceId:string}) => item.serviceId) : []), "record_id", "record_id")).map(row => row.record_id));
      for (const row of upserts) if (row.entity === "services" && canWriteEntity(user, "services")) serviceIds.add(row.record_id);
      for (const row of packageUpdates) if (!validServicePackage(row.data) || row.data.items.some((item: { serviceId: string }) => !serviceIds.has(item.serviceId))) return Response.json({ error: "Confira os serviços e os dados do pacote." }, { status: 400, headers });
    }
    const strategyUpdates = upserts.filter(row => row.entity === "strategies");
    if (strategyUpdates.length) {
      if (!canWriteEntity(user,"strategies")) return Response.json({error:"Acesso às estratégias não autorizado."},{status:403,headers});
      const [existing,professionals]=await Promise.all([rowsByIds("strategies", strategyUpdates.map(row => row.record_id)),rowsByIds("professionals", strategyUpdates.map(row => row.data?.professionalId), "record_id", "record_id")]);
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
      const [existing, patients, professionals] = await Promise.all([rowsByIds("anamneses", clinicalUpdates.map(row => row.record_id)), rowsByIds("patients", clinicalUpdates.map(row => row.data?.patientId), "record_id", "record_id"), rowsByIds("professionals", clinicalUpdates.map(row => row.data?.professionalId), "record_id", "record_id")]);
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
    const stored = (await rowsByIds("appointments", [...appointmentUpdates.map(item => item.id), ...deletedAppointments])).map(row => row.data as unknown as Appointment);
    for (const appointment of appointmentUpdates) Object.assign(appointment, preserveCloudInvoice(stored.find(item => item.id === appointment.id), appointment));
    const packageSensitive = [...appointmentUpdates, ...stored.filter(item => deletedAppointments.includes(item.id) || appointmentUpdates.some(next => next.id === item.id))].some(hasPackageSessionData);
    const moved = appointmentUpdates.filter(item => !stored.some(old => old.id === item.id && old.professionalId === item.professionalId && old.startsAt === item.startsAt && old.endsAt === item.endsAt && old.eventType === item.eventType && !(old.status === "Cancelado" && item.status !== "Cancelado")));
    if (packageSensitive && ownsPackageLease) {
      // The lease protects both reads. Only sales and uses can affect a package
      // balance. Match the JSON key before applying the existing exact validator.
      type PackageVisit = Pick<Appointment, "id" | "patientId" | "accountClosed" | "closedAccount">;
      const projection = "record_id,id:data->>id,patientId:data->>patientId,accountClosed:data->accountClosed,closedAccount:data->closedAccount";
      const [sales, uses] = await Promise.all([
        rows<PackageVisit & { record_id: string }>("appointments", [{ field: "data->closedAccount->>procedureLines", op: "like", value: '%"packageId"%' }], projection),
        rows<PackageVisit & { record_id: string }>("appointments", [{ field: "data->closedAccount->packageSessionUses", op: "neq", value: "[]" }], projection)
      ]);
      const effective = new Map<string, PackageVisit>([...sales, ...uses].map(row => [row.record_id, row]));
      for (const id of deletedAppointments) effective.delete(id);
      for (const appointment of appointmentUpdates) effective.set(appointment.id, appointment);
      const packageError = packageSessionError([...effective.values()]);
      if (packageError) return Response.json({ error: packageError }, { status: 409, headers });
    }
    if (stockRestricted) {
      if (removed.some(item => ["inventory", "gifts"].includes(item.entity) && item.ids?.length)) return Response.json({ error: "Movimentação de estoque não autorizada." }, { status: 403, headers });
      if (stockUpdates.length) {
        if (!canAccessTab(user, "Agenda")) return Response.json({ error: "Movimentação de estoque não autorizada." }, { status: 403, headers });
        const inventoryUpdates = stockUpdates.filter(row => row.entity === "inventory");
        const giftUpdates = stockUpdates.filter(row => row.entity === "gifts");
        const [inventoryByProduct, gifts] = await Promise.all([
          rowsByIds<{ record_id: string; data: InventoryItem }>("inventory", inventoryUpdates.map(row => row.data?.procedureId), "data->>procedureId"),
          rowsByIds("gifts", giftUpdates.map(row => row.record_id))
        ]);
        const inventoryById = inventoryRows.filter(row => inventoryUpdates.some(update => update.record_id === row.record_id));
        const inventory = [...new Map([...inventoryByProduct, ...inventoryById].map(row => [row.record_id, row])).values()]
          .sort((first, second) => first.record_id < second.record_id ? -1 : first.record_id > second.record_id ? 1 : 0);
        if (!checkoutStockUpdates(inventory.map(row => row.data), gifts.map(row => row.data as unknown as GiftStockItem), stored, appointmentUpdates, deletedAppointments, stockUpdates)) return Response.json({ error: "Sem permissão para ajustar o estoque. A baixa automática deve corresponder ao fechamento da conta." }, { status: 403, headers });
      }
    }
    const tipUpdates = upserts.filter(row => row.entity === "ultraformer_tips");
    const shotAppointments = appointmentUpdates.filter(next => next.closedAccount?.ultraformerShots?.length || stored.find(old => old.id === next.id)?.closedAccount?.ultraformerShots?.length);
    const deletedShotAppointments = stored.filter(old => deletedAppointments.includes(old.id) && old.closedAccount?.ultraformerShots?.length).map(old => ({ ...old, accountClosed: false, closedAccount: undefined }));
    if (appointmentUpdates.some(next => next.closedAccount?.ultraformerShots !== undefined && !validCheckoutShots(next.closedAccount.ultraformerShots))) return Response.json({ error: "Confira as ponteiras e os disparos do Ultraformer." }, { status: 400, headers });
    const checkoutTipIds = new Set<string>();
    if (shotAppointments.length || deletedShotAppointments.length) {
      const shotVisits = [...shotAppointments, ...deletedShotAppointments];
      const [tipRows, patientRows, professionalRows] = await Promise.all([rows("ultraformer_tips"), rowsByIds("patients", shotVisits.flatMap(item=>item.patientId ? [item.patientId] : [])), rowsByIds("professionals", shotVisits.map(item=>item.professionalId))]);
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
    if (moved.length) {
      // Availability needs the slot and status only, including across professionals
      // for the room limit. Checkout history is read separately by ID.
      const projection = "record_id,professionalId:data->>professionalId,startsAt:data->>startsAt,endsAt:data->>endsAt,status:data->>status,eventType:data->>eventType";
      const intervals = [...new Map(moved.flatMap(item => {
        const interval = reservedInterval(item.startsAt, item.endsAt);
        return interval ? [[interval.start + "/" + interval.end, interval] as const] : [];
      })).values()];
      const overlaps = new Map<string, Appointment>();
      async function addSlots(filters: ReadFilter[]) {
        const slots = await rows("appointments", filters, projection);
        for (const slot of slots) overlaps.set(slot.record_id, { ...slot, id: slot.record_id } as unknown as Appointment);
      }
      // Bound URL length while checking the exact requested intervals in bulk.
      const intervalsPerQuery = 16;
      for (let start = 0; start < intervals.length; start += intervalsPerQuery) {
        const batch = intervals.slice(start, start + intervalsPerQuery);
        if (batch.length === 1) {
          await addSlots([
            { field: "data->>startsAt", op: "lt", value: batch[0].end },
            { field: "data->>endsAt", op: "gt", value: batch[0].start }
          ]);
        } else {
          await addSlots([{ op: "or", value: batch.map(interval =>
            `and(data->>startsAt.lt.${interval.end},data->>endsAt.gt.${interval.start})`
          ).join(",") }]);
        }
      }
      const professionals = await rowsByIds<Pick<Professional, "id" | "active" | "closedShifts">>(
        "professionals", moved.map(item => item.professionalId), "record_id",
        "id:data->>id,active:data->active,closedShifts:data->closedShifts"
      );
      const replaced = new Set([...deletedAppointments, ...appointmentUpdates.map(item => item.id)]);
      const effectiveAppointments = [...[...overlaps.values()].filter(item => !replaced.has(item.id)), ...appointmentUpdates];
      for (const appointment of moved) {
        const professional = upserts.find(row => row.entity === "professionals" && row.record_id === appointment.professionalId)?.data ?? professionals.find(item => item.id === appointment.professionalId);
        const error = appointmentAvailabilityError(professional, effectiveAppointments, appointment.startsAt, appointment.endsAt, appointment.id, appointment.eventType);
        if (error) return Response.json({ error }, { status: 409, headers });
      }
    }
    if (user.role === "standard") {
      const linked = await rowsByIds("appointments", appointmentUpdates.flatMap(item => item.closedAccount?.id ? [item.closedAccount.id] : []), "data->closedAccount->>id", "record_id,accountId:data->closedAccount->>id");
      for (const appointment of appointmentUpdates) {
        const account = appointment.closedAccount;
        if (!account) continue;
        const foreign = linked.some(item => item.record_id !== appointment.id && (item as unknown as { accountId: string }).accountId === account.id);
        if (account.appointmentId !== appointment.id || foreign || (account.generatedEntryId && account.generatedEntryId !== `procedure-account-${account.id}`)) return Response.json({ error: "Vínculo de fechamento inválido." }, { status: 403, headers });
      }
    }
    const touched = stored.filter((item) => deletedAppointments.includes(item.id) || appointmentUpdates.some((update) => update.id === item.id));
    const accounts = new Set([...touched, ...appointmentUpdates].flatMap((item) => [item.closedAccount?.id, item.financialEntryId, item.closedAccount?.generatedEntryId]).filter(Boolean));
    const entries = new Set([...accounts, ...upserts.filter((row) => row.entity === "financial_entries" && accounts.has(row.data?.sourceAccountId)).map((row) => row.record_id)]);
    const ledgerSources = new Set<string>(canWriteEntity(user, "financial_entries") ? upserts.filter(row => row.entity === "financial_entries").map(row => row.record_id) : []);
    const receiptSources = new Set<string>(canWriteEntity(user, "professional_receipts") ? upserts.filter(row => row.entity === "professional_receipts").map(row => row.record_id) : []);
    const acknowledgedRows = new Set<(typeof upserts)[number]>();
    const creditDeposits = new Set<string>();
    const depositCosts: { entity: "fixed_costs"; record_id: string; data: NonNullable<ReturnType<typeof patientCreditFeeCost>>; updated_at: string }[] = [];
    for (const row of upserts) {
      if (!entityNames.includes(row.entity) || typeof row.record_id !== "string" || !row.data || (row.data.id || row.data.month) !== row.record_id) return Response.json({ error: "Registro inválido." }, { status: 400, headers });
      if (row.entity === "patients" && canWriteEntity(user,"patients")) {
        const packagesOnly = user.role === "admin" && row.data.importedPackages !== undefined && Object.keys(row.data).every(key => key === "id" || key === "importedPackages");
        const previous = await db.from("avvi_records")
          .select(packagesOnly ? "data" : "importedPackages:data->importedPackages,futureCreditDeposits:data->futureCreditDeposits,futureCredit:data->futureCredit")
          .eq("entity", "patients").eq("record_id", row.record_id).maybeSingle();
        if (previous.error) throw previous.error;
        // Regular saves only need the previously imported balances. A balances
        // import also needs the registration fields it does not send itself.
        const previousPatient = previous.data as unknown as (Partial<Patient> & { data?: Patient }) | null;
        const storedPatient = packagesOnly ? previousPatient?.data : previousPatient as Patient | null;
        const candidate = packagesOnly && storedPatient ? { ...storedPatient, importedPackages: row.data.importedPackages } : row.data;
        try { row.data = preserveImportedPatientPackages(storedPatient ?? undefined, candidate, user.role === "admin"); }
        catch (error) { return Response.json({error:error instanceof Error?error.message:"Pacotes inválidos."},{status:400,headers}); }
        const storedDeposits: PatientCreditDeposit[] = storedPatient?.futureCreditDeposits ?? [];
        const incoming = row.data.futureCreditDeposits ?? [];
        if (!Array.isArray(incoming)) return Response.json({ error: "Recargas de crédito inválidas." }, { status: 400, headers });
        const existing = new Map(storedDeposits.map(item => [item.id, item]));
        const added: PatientCreditDeposit[] = [];
        for (const deposit of incoming) {
          if (!validPatientCreditDeposit(deposit)) return Response.json({ error: "Confira o valor e a forma de pagamento do crédito." }, { status: 400, headers });
          const original = existing.get(deposit.id);
          if (original) {
            if (original.amount !== deposit.amount || original.date !== deposit.date || original.method !== deposit.method || original.cardBrand !== deposit.cardBrand || original.installments !== deposit.installments) return Response.json({ error: "Uma recarga registrada não pode ser alterada." }, { status: 409, headers });
            continue;
          }
          if (!canAccessTab(user, "Cadastro de Pacientes") || creditDeposits.has(deposit.id)) return Response.json({ error: "Recarga não autorizada." }, { status: 403, headers });
          creditDeposits.add(deposit.id);
          const { id, date, amount, method, cardBrand, installments } = deposit;
          added.push({ id, date, amount, method, ...(method === "Crédito" ? { cardBrand, installments } : {}) });
        }
        const cents = (value: unknown) => Math.round((Number(value) || 0) * 100);
        const currentBalance = cents(storedPatient?.futureCredit);
        const clientBalance = cents(row.data.futureCredit);
        const hasBase = Object.hasOwn(patientCreditBases, row.record_id);
        if ((added.length || storedDeposits.length && !packagesOnly) && !ownsPackageLease) return await packageLockedSave(retryRequest, db);
        if (added.length) {
          const expected = currentBalance + added.reduce((sum, deposit) => sum + cents(deposit.amount), 0);
          if (cents(row.data.futureCredit) !== expected) return Response.json({ error: "O saldo mudou desde a abertura do cadastro. Atualize os dados antes de salvar." }, { status: 409, headers });
          for (const deposit of added) {
            const fee = patientCreditFeeCost(deposit, row.data);
            if (fee) depositCosts.push({ entity: "fixed_costs", record_id: fee.id, data: fee, updated_at: new Date().toISOString() });
          }
        }
        if (!added.length && storedDeposits.length && !packagesOnly && clientBalance !== currentBalance && (!hasBase || cents(patientCreditBases[row.record_id]) !== currentBalance)) return Response.json({ error: "O saldo mudou. Atualize os dados antes de salvar." }, { status: 409, headers });
        if (storedDeposits.length || added.length) row.data.futureCreditDeposits = [...storedDeposits, ...added];
      }
      if (row.entity === "services" && row.data.postProcedure !== undefined && !validPostProcedurePlan(row.data.postProcedure)) return Response.json({ error: "Prazos de pós-procedimento inválidos." }, { status: 400, headers });
      if (row.entity === "post_procedure_messages" && !validPostProcedureMessage(row.data)) return Response.json({ error: "Mensagem de pós-procedimento inválida. Confira o texto e as variáveis." }, { status: 400, headers });
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
      if (row.entity === "patients" && ["Pós-procedimento", "Nota Fiscal", "Anamnese"].some(tab => canAccessTab(user, tab))) {
        const { data: previous, error } = await db.from("avvi_records").select("data").eq("entity", "patients").eq("record_id", row.record_id).maybeSingle();
        if (error) throw error;
        if (canAccessTab(user, "Pós-procedimento") && previous && postProcedurePhoneOnlyUpdate(previous.data, row.data, postProcedureOnly(user))) {
          // A projected post-procedure record must never erase hidden patient fields.
          row.data = { ...previous.data, phone: row.data.phone };
          continue;
        }
        if (canAccessTab(user, "Nota Fiscal") && cpfOnlyUpdate(previous?.data, row.data)) continue;
        // Photos are uploaded and attached by the private endpoint. A clinical-only
        // profile may acknowledge that saved record, without editing the patient.
        const stable = (value: unknown) => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a],[b]) => a.localeCompare(b))) : item);
        if (canAccessTab(user, "Anamnese") && previous && stable(previous.data) === stable(row.data)) continue;
      }
      const accountDerivative = canAccessTab(user, "Agenda") && (row.entity === "financial_entries" ? accounts.has(row.data.sourceAccountId) && row.record_id === `procedure-account-${row.data.sourceAccountId}` && appointmentUpdates.some((item) => item.closedAccount?.generatedEntryId === row.record_id)
        : ["revenues", "fixed_costs"].includes(row.entity) && accounts.has(row.data.sourceFinancialEntryId) && row.record_id === `${row.entity === "revenues" ? "receita-entry" : "taxa-maquininha"}-${row.data.sourceFinancialEntryId}`);
      const ledgerDerivative = ["revenues", "fixed_costs"].includes(row.entity) && ledgerSources.has(row.data.sourceFinancialEntryId) && row.record_id === `${row.entity === "revenues" ? "receita-entry" : "taxa-maquininha"}-${row.data.sourceFinancialEntryId}`;
      const receiptDerivative = row.entity === "fixed_costs" && receiptSources.has(row.data.professionalReceiptId) && upserts.some(item => item.entity === "professional_receipts" && item.record_id === row.data.professionalReceiptId && Number(item.data.total) === Number(row.data.value) && item.data.date === row.data.dueDate);
      const derived = accountDerivative || ledgerDerivative || receiptDerivative;
      // A lost HTTP acknowledgement can leave only financial derivatives pending
      // after the shared agenda confirms the appointment. A standard user may
      // acknowledge an identical stored checkout row, but never rewrite it or
      // change an unrelated financial record. Skip these rows in every write
      // path so another user's later edits cannot be overwritten by the retry.
      if (!derived && canAccessTab(user, "Agenda") && ["financial_entries", "revenues", "fixed_costs"].includes(row.entity)) {
        const source = row.entity === "financial_entries" ? row.data.sourceAccountId : row.data.sourceFinancialEntryId;
        const prefix = row.entity === "financial_entries" ? "procedure-account" : row.entity === "revenues" ? "receita-entry" : "taxa-maquininha";
        if (typeof source === "string" && source && row.record_id === `${prefix}-${source}`) {
          const { data: existing, error } = await db.from("avvi_records").select("data").eq("entity", row.entity).eq("record_id", row.record_id).maybeSingle();
          if (error) throw error;
          const stable = (value: unknown) => JSON.stringify(value, (_key, item) => item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item);
          if (existing && stable(existing.data) === stable(row.data)) { acknowledgedRows.add(row); continue; }
        }
      }
      if (!derived) return Response.json({ error: "Alteração financeira restrita ao administrador." }, { status: 403, headers });
    }
    for (const item of removed) {
      if (!entityNames.includes(item.entity) || !Array.isArray(item.ids) || item.ids.some((id: unknown) => typeof id !== "string")) return Response.json({ error: "Exclusão inválida." }, { status: 400, headers });
      if (user.role === "standard" && item.entity === "ultraformer_tips" && item.ids.length) return Response.json({ error: "Somente o administrador pode excluir ponteiras ou utilizações." }, { status: 403, headers });
      if (item.entity === "strategies" && user.role === "standard" && item.ids.length) {
        const existing = await rowsByIds("strategies", item.ids);
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
    const pendingUpserts = [...upserts.filter(row => !acknowledgedRows.has(row)), ...depositCosts];
    const savedResponse = { saved: true, ...(depositCosts.length && canReadEntity(user, "fixed_costs") ? { creditDepositCosts: depositCosts.map(row => row.data) } : {}) };
    if (packageSensitive) {
      if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return Response.json({ error: "Configure SUPABASE_SERVICE_ROLE_KEY no servidor para salvar sessões de pacotes." }, { status: 503, headers });
      // Re-run validation after taking the shared lease, using current cloud rows.
      if (!ownsPackageLease) return await packageLockedSave(retryRequest, db);
      if (!await ownsPackageLease()) return Response.json({ error: "Atualize os dados e tente salvar o pacote novamente." }, { status: 409, headers });
      const consumesCurrentSale = appointmentUpdates.some(item => item.closedAccount?.packageSessionUses?.some(use => use.sourceAppointmentId === item.id));
      // Older installed functions do not support consuming the sale being closed.
      if (!consumesCurrentSale) {
        const { error } = await db.rpc("avvi_save_package_checkout", { p_upserts: pendingUpserts, p_removed: removed });
        if (!error) return Response.json(savedResponse, { headers });
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
    if (pendingUpserts.length) { await checkPackageLease(); const { error } = await db.from("avvi_records").upsert(pendingUpserts, { onConflict: "entity,record_id" }); if (error) throw error; }
    return Response.json(savedResponse, { headers });
  } catch { return Response.json({ error: "Não foi possível salvar. Suas alterações continuam pendentes." }, { status: 503, headers }); }
}
