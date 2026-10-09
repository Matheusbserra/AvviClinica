import { branchMatches, resumeConversation } from "./conversationFlow";
import { createHash, timingSafeEqual } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { followUpCandidates, normalizedPhone, validateFollowUpRule, renderFollowUp } from "./followUp";
import type { FollowUpContext, FollowUpCandidate } from "./followUp";
import type { FollowUpRule, FollowUpContact, FollowUpLog, ConversationCursor, ConversationNode, FollowUpLead, LeadStage, FollowUpMessage } from "./types";

export function followUpConfig() {
  return { url: (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").trim().replace(/\/+$/, "").replace(/\/(rest|auth)\/v1$/, ""), key: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
    token: process.env.WHATSAPP_ACCESS_TOKEN ?? "", phoneId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
    version: process.env.WHATSAPP_API_VERSION ?? "", appSecret: process.env.WHATSAPP_APP_SECRET ?? "",
    verifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? "", cronSecret: process.env.WHATSAPP_CRON_SECRET ?? "",
    staffIds: (process.env.WHATSAPP_STAFF_USER_IDS ?? "").split(",").map((id) => id.trim()).filter(Boolean),
    enabled: process.env.WHATSAPP_AUTOMATIONS_ENABLED === "true" };
}
export function serverDatabase() {
  const config = followUpConfig();
  if (!config.url || !config.key) throw new Error("Configure a conexão protegida do servidor com o Supabase.");
  return createClient(config.url, config.key, { auth: { persistSession: false, autoRefreshToken: false } });
}
export function safeEqual(left: string, right: string) {
  const a = Buffer.from(left); const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
export async function requireFollowUpUser(request: Request) {
  if (request.headers.get("cookie")) {
    const { resolveAccess, sameOrigin } = await import("./accessServer");
    const user = await resolveAccess(request);
    if (user) {
      const { canAccessTab } = await import("./access");
      if (!canAccessTab(user, "Follow Up")) throw new Error("Acesso ao Follow Up não autorizado.");
      if (request.method !== "GET" && !sameOrigin(request)) throw new Error("Origem não autorizada.");
      return { id: `clinic:${user.login}` };
    }
  }
  const bearer = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  if (!bearer) throw new Error("Sessão autenticada necessária.");
  const db = serverDatabase(); const { data, error } = await db.auth.getUser(bearer);
  if (error || !data.user) throw new Error("Sessão autenticada necessária.");
  // Keep sending permissions outside the browser-editable clinic records.
  if (!followUpConfig().staffIds.includes(data.user.id)) throw new Error("Acesso restrito à equipe autorizada da clínica.");
  return data.user;
}
export async function readRuntime<T>(entity: string): Promise<T[]> {
  const records: T[] = [], db = serverDatabase();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from("avvi_followup_runtime").select("data").eq("entity", entity).order("record_id").range(offset, offset + 999);
    if (error) throw new Error("Prepare as tabelas protegidas do Follow Up no Supabase.");
    records.push(...(data ?? []).map((row) => row.data as T));
    if ((data?.length ?? 0) < 1000) return records;
  }
}
export async function writeRuntime<T extends { id: string }>(entity: string, record: T) {
  const { error } = await serverDatabase().from("avvi_followup_runtime").upsert({ entity, record_id: record.id, data: record, updated_at: new Date().toISOString() }, { onConflict: "entity,record_id" });
  if (error) throw new Error("Não foi possível gravar o Follow Up no servidor.");
}
export async function readClinic(): Promise<Omit<FollowUpContext, "contacts">> {
  const rows: { entity: string; data: unknown }[] = [], db = serverDatabase();
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db.from("avvi_records").select("entity,data").in("entity", ["patients", "appointments", "services", "professionals"]).order("entity").order("record_id").range(offset, offset + 999);
    if (error) throw new Error("Não foi possível carregar os dados da clínica.");
    rows.push(...(data ?? [])); if ((data?.length ?? 0) < 1000) break;
  }
  return Object.fromEntries(["patients", "appointments", "services", "professionals"].map((entity) => [entity, rows.filter((row) => row.entity === entity).map((row) => row.data)])) as Omit<FollowUpContext, "contacts">;
}
export async function publishFollowUp(rules: FollowUpRule[], contacts: FollowUpContact[]) {
  if (!Array.isArray(rules) || !Array.isArray(contacts) || rules.length > 100 || contacts.length > 50000) throw new Error("Configuração de automações inválida.");
  if (new Set(rules.map((rule) => rule?.id)).size !== rules.length) throw new Error("Cada automação precisa de uma identificação única.");
  for (const rule of rules) {
    if (!rule || !Array.isArray(rule.keywords) || !Array.isArray(rule.patientIds) || !Array.isArray(rule.templateParameters) || ![...rule.keywords, ...rule.patientIds, ...rule.templateParameters].every((item) => typeof item === "string") || typeof rule.active !== "boolean" || !["contains", "exact"].includes(rule.match) || !["text", "template"].includes(rule.messageType) || typeof rule.templateName !== "string" || typeof rule.templateLanguage !== "string" || !/^[a-z]{2,3}(_[A-Z]{2})?$/.test(rule.templateLanguage) || typeof rule.scheduledAt !== "string" || typeof rule.message !== "string" || typeof rule.name !== "string" || typeof rule.id !== "string" || !rule.id.trim() || rule.id.length > 200) throw new Error("Confira os campos das automações.");
    const error = validateFollowUpRule(rule, rule.active); if (error) throw new Error(`${rule.name}: ${error}`);
  }
  for (const contact of contacts) if (!contact || typeof contact.id !== "string" || typeof contact.optIn !== "boolean") throw new Error("Confira as autorizações dos pacientes.");
  // The service role publishes a protected snapshot. Browser drafts cannot change a live campaign.
  await writeRuntime("configuration", { id: "current", rules, contacts, publishedAt: new Date().toISOString() });
}
type RuntimeConfig = { id: string; rules: FollowUpRule[]; contacts: FollowUpContact[]; publishedAt: string };
type InboundSession = FollowUpContact & { lastMessageId?: string; lastText?: string };
type Incoming = { id: string; patientId: string; text: string; at: string };
export async function runtimeContext() {
  const config = (await readRuntime<RuntimeConfig>("configuration")).find((item) => item.id === "current");
  const sessions = await readRuntime<InboundSession>("sessions");
  const context = { ...await readClinic(), contacts: (config?.contacts ?? []).map((contact) => {
    const session = sessions.find((item) => item.id === contact.id);
    return { ...contact, lastInboundAt: session?.lastInboundAt, optIn: contact.optIn && session?.optIn !== false };
  }) };
  return { config, context, sessions };
}
export async function enqueueFollowUp(incoming?: Incoming) {
  const { config, context } = await runtimeContext(); if (!config) return;
  const now = new Date(); const candidates = followUpCandidates(config.rules, context, now, incoming);
  const existing = await readRuntime<FollowUpLog>("jobs"); const ids = new Set(existing.map((job) => job.id));
  for (const candidate of candidates.filter((item) => item.allowed)) {
    if (candidate.rule.flow) { await enqueueConversation(candidate, incoming?.text ?? ""); continue; }
    const id = createHash("sha256").update(candidate.id).digest("hex");
    if (ids.has(id)) continue;
    const record: FollowUpLog = { id, ruleId: candidate.ruleId, ruleName: candidate.ruleName, patientId: candidate.patientId, patientName: candidate.patientName, phone: candidate.phone,
      message: candidate.message, scheduledFor: candidate.scheduledFor, createdAt: now.toISOString(), sourceId: candidate.sourceId, status: "scheduled" };
    const { error } = await serverDatabase().from("avvi_followup_runtime").insert({ entity: "jobs", record_id: id, data: { ...record, candidate }, updated_at: now.toISOString() });
    if (error && error.code !== "23505") throw new Error("Não foi possível preparar a fila de mensagens.");
  }
}
export async function processFollowUp() {
  const config = followUpConfig();
  if (!config.enabled) throw new Error("O envio real está desativado no servidor.");
  if (!config.token || !config.phoneId || !/^v\d+\.\d+$/.test(config.version)) throw new Error("Conexão oficial não configurada.");
  await enqueueFollowUp();
  const { config: published, context } = await runtimeContext();
  const current = followUpCandidates(published?.rules ?? [], context, new Date());
  const jobs = await readRuntime<FollowUpLog & { candidate: FollowUpCandidate }>("jobs");
  let sent = 0;
  for (const job of jobs.filter((item) => item.status === "scheduled" && Date.parse(item.scheduledFor) <= Date.now()).slice(0, 20)) {
    const rule = published?.rules.find((item) => item.id === job.ruleId);
    const contact = context.contacts.find((item) => item.id === job.patientId);
    const patient = context.patients.find((item) => item.id === job.patientId);
    const unchanged = rule && JSON.stringify(rule) === JSON.stringify(job.candidate.rule);
    const stillScheduled = job.candidate.rule.trigger === "keyword" || current.some((candidate) => candidate.id === job.candidate.id);
    if (!unchanged || !rule?.active || !contact?.optIn || !patient || !stillScheduled || normalizedPhone(patient.phone) !== job.phone) {
      await writeRuntime("jobs", { ...job, status: "canceled", error: "A regra, autorização ou agendamento mudou." }); continue;
    }
    // Database claim prevents concurrent schedulers from dispatching the same job.
    const { data: claimed, error } = await serverDatabase().from("avvi_followup_runtime").update({ data: { ...job, status: "sending" }, updated_at: new Date().toISOString() }).eq("entity", "jobs").eq("record_id", job.id).eq("data->>status", "scheduled").select("record_id");
    if (error || !claimed?.length) continue;
    try {
      if (rule.messageType === "text" && (!contact.lastInboundAt || !Number.isFinite(Date.parse(contact.lastInboundAt)) || Date.parse(contact.lastInboundAt) > Date.now() || Date.now() - Date.parse(contact.lastInboundAt) >= 86400000)) throw new Error("Janela de atendimento encerrada. Use um modelo aprovado.");
      const payload = rule.messageType === "template" ? { messaging_product: "whatsapp", to: job.phone, type: "template", template: { name: rule.templateName, language: { code: rule.templateLanguage }, ...(job.candidate.templateParameters.length ? { components: [{ type: "body", parameters: job.candidate.templateParameters.map((text) => ({ type: "text", text })) }] } : {}) } }
        : { messaging_product: "whatsapp", to: job.phone, type: "text", text: { body: job.message, preview_url: false } };
      const response = await fetch(`https://graph.facebook.com/${config.version}/${config.phoneId}/messages`, { method: "POST", headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10000) });
      const result = await response.json();
      if (!response.ok || !result.messages?.[0]?.id) throw new Error(`WhatsApp recusou o envio (código ${result.error?.code ?? response.status}).`);
      await writeRuntime("jobs", { ...job, status: "sent", sentAt: new Date().toISOString(), providerMessageId: result.messages[0].id }); sent += 1;
    } catch (failure) { await writeRuntime("jobs", { ...job, status: "failed", error: (failure as Error).message }); }
  }
  sent += await processConversations();
  return { sent };
}
export async function handleFollowUpWebhook(payload: { entry?: { changes?: { value?: { metadata?: { phone_number_id?: string }; contacts?: { wa_id: string; profile?: { name?: string } }[]; messages?: { id: string; from: string; timestamp: string; text?: { body?: string }; interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } }; button?: { text?: string } }[]; statuses?: { id: string; status: string }[] } }[] }[] }) {
  const { context } = await runtimeContext();
  for (const entry of payload.entry ?? []) for (const change of entry.changes ?? []) {
    const value = change.value;
    if (value?.metadata?.phone_number_id !== followUpConfig().phoneId) continue;
    for (const message of value.messages ?? []) {
      const patient = context.patients.find((item) => normalizedPhone(item.phone) === message.from);
      const at = new Date(Number(message.timestamp) * 1000).toISOString();
      const inboundText = message.text?.body ?? message.interactive?.button_reply?.title ?? message.interactive?.list_reply?.title ?? message.button?.text ?? "[Mensagem de mídia]";
      await captureWhatsAppLead(message.from, patient?.name || value.contacts?.find((contact) => contact.wa_id === message.from)?.profile?.name || message.from, patient?.id, at, inboundText, message.id);
      await writeRuntime("messages", { id: message.id, leadId: `whatsapp-${message.from.replace(/\D/g, "")}`, direction: "incoming", text: inboundText.slice(0, 4096), at } satisfies FollowUpMessage);
      if (!patient) continue;
      const old = (await readRuntime<FollowUpContact>("sessions")).find((item) => item.id === patient.id);
      if (old?.lastInboundAt && Date.parse(old.lastInboundAt) > Date.parse(at)) continue;
      const text = message.text?.body ?? message.interactive?.button_reply?.title ?? message.interactive?.list_reply?.title ?? message.button?.text ?? "";
      const stop = /^(parar|sair|cancelar mensagens|stop)$/i.test(text.trim());
      await writeRuntime("sessions", { id: patient.id, updatedAt: new Date().toISOString(), lastInboundAt: at, lastMessageId: message.id, lastText: text, optIn: stop ? false : old?.optIn ?? true });
      if (!stop && text) {
        const consumed = await resumePatientConversation(patient.id, message.id, text, at);
        if (!consumed) await enqueueFollowUp({ id: message.id, patientId: patient.id, text, at });
      }
    }
    const order = { sent: 1, delivered: 2, read: 3 };
    for (const status of value.statuses ?? []) {
      if (!["sent", "delivered", "read", "failed"].includes(status.status)) continue;
      const job = (await readRuntime<FollowUpLog>("jobs")).find((item) => item.providerMessageId === status.id);
      if (!job) continue;
      if (status.status !== "failed" && (order[status.status as keyof typeof order] ?? 0) < (order[job.status as keyof typeof order] ?? 0)) continue;
      await writeRuntime("jobs", { ...job, status: status.status as FollowUpLog["status"] });
    }
  }
}

// Visual conversations share the private runtime table and scheduler; browser previews never use this path.
type ConversationRun = { id: string; patientId: string; candidate: FollowUpCandidate; rule: FollowUpRule; cursor: ConversationCursor;
  status: "active" | "waiting" | "running" | "done" | "failed" | "canceled"; lastMessageId: string; updatedAt: string; lastSentAt?: string; error?: string };
async function enqueueConversation(candidate: FollowUpCandidate, reply: string) {
  const id = createHash("sha256").update(`conversation:${candidate.id}`).digest("hex");
  const runs = await readRuntime<ConversationRun>("flow_runs");
  if (runs.some((run) => run.id === id || run.patientId === candidate.patientId && ["active", "waiting", "running"].includes(run.status))) return;
  const run: ConversationRun = { id, patientId: candidate.patientId, candidate, rule: candidate.rule, cursor: { nodeId: candidate.rule.flow!.entry, status: "active", reply }, status: "active", lastMessageId: candidate.sourceId, updatedAt: new Date().toISOString() };
  const { error } = await serverDatabase().from("avvi_followup_runtime").insert({ entity: "flow_runs", record_id: id, data: run, updated_at: run.updatedAt });
  if (error && error.code !== "23505") throw new Error("Prepare o controle de conversas do Follow Up no servidor.");
}
async function resumePatientConversation(patientId: string, messageId: string, text: string, at: string) {
  const run = (await readRuntime<ConversationRun>("flow_runs")).find((item) => item.patientId === patientId && ["active", "waiting", "running"].includes(item.status));
  if (!run) return false;
  if (run.lastMessageId === messageId || run.status !== "waiting" || run.cursor.wakeAt) return true;
  const cursor = resumeConversation(run.cursor, text, at); if (cursor.status !== "active") return true;
  const { error } = await serverDatabase().from("avvi_followup_runtime").update({ data: { ...run, cursor, status: "active", lastMessageId: messageId, updatedAt: new Date().toISOString() } }).eq("entity", "flow_runs").eq("record_id", run.id).eq("data->>status", "waiting");
  if (error) throw new Error("Não foi possível registrar a resposta da conversa."); return true;
}
async function sendConversationMessage(node: ConversationNode, run: ConversationRun, context: FollowUpContext) {
  const config = followUpConfig(), patient = context.patients.find((item) => item.id === run.patientId)!;
  const appointmentId = run.candidate.sourceId.startsWith("appointment-") ? context.appointments.find((item) => run.candidate.sourceId.startsWith(`appointment-${item.id}-`))?.id : undefined;
  const appointment = context.appointments.find((item) => item.id === appointmentId);
  const contact = context.contacts.find((item) => item.id === run.patientId)!;
  if (node.messageType !== "template" && (!contact.lastInboundAt || !Number.isFinite(Date.parse(contact.lastInboundAt)) || Date.parse(contact.lastInboundAt) > Date.now() || Date.now() - Date.parse(contact.lastInboundAt) >= 86400000)) throw new Error("Janela de atendimento encerrada. Use um modelo aprovado e aguarde a resposta.");
  const text = renderFollowUp(node.text, patient, appointment, context);
  const common = { messaging_product: "whatsapp", to: normalizedPhone(patient.phone) };
  let payload: object;
  if (node.messageType === "template") payload = { ...common, type: "template", template: { name: node.templateName, language: { code: node.templateLanguage }, ...(node.templateParameters.length ? { components: [{ type: "body", parameters: node.templateParameters.map((value) => ({ type: "text", text: renderFollowUp(value, patient, appointment, context) })) }] } : {}) } };
  else if (node.messageType === "image") {
    let image: { link?: string; id?: string; caption?: string } = { link: node.imageUrl };
    if (node.imageUrl.startsWith("data:")) {
      const match = node.imageUrl.match(/^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/]+={0,2})$/); if (!match) throw new Error("Imagem anexada inválida.");
      const bytes = Buffer.from(match[2], "base64");
      if (bytes.length > 420000 || (match[1] === "image/jpeg" ? bytes[0] !== 255 || bytes[1] !== 216 : bytes[0] !== 137 || bytes.subarray(1, 4).toString() !== "PNG")) throw new Error("Imagem anexada inválida ou grande demais.");
      const form = new FormData(); form.append("messaging_product", "whatsapp"); form.append("file", new Blob([bytes], { type: match[1] }), match[1] === "image/jpeg" ? "imagem.jpg" : "imagem.png");
      const uploaded = await fetch(`https://graph.facebook.com/${config.version}/${config.phoneId}/media`, { method: "POST", headers: { Authorization: `Bearer ${config.token}` }, body: form, signal: AbortSignal.timeout(10000) });
      const media = await uploaded.json(); if (!uploaded.ok || !media.id) throw new Error("Não foi possível enviar a imagem à API do WhatsApp."); image = { id: media.id };
    }
    payload = { ...common, type: "image", image: { ...image, ...(text ? { caption: text } : {}) } };
  } else payload = { ...common, type: "text", text: { body: text, preview_url: false } };
  const response = await fetch(`https://graph.facebook.com/${config.version}/${config.phoneId}/messages`, { method: "POST", headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: AbortSignal.timeout(10000) });
  const result = await response.json(); if (!response.ok || !result.messages?.[0]?.id) throw new Error(`WhatsApp recusou o envio (código ${result.error?.code ?? response.status}).`);
  return { providerMessageId: result.messages[0].id, text };
}
async function processConversations() {
  const { config: published, context, sessions } = await runtimeContext(); const runs = await readRuntime<ConversationRun>("flow_runs");
  const recordedJobs = new Map((await readRuntime<FollowUpLog>("jobs")).map((job) => [job.id, job]));
  let sent = 0;
  for (const original of runs.filter((run) => ["active", "waiting"].includes(run.status)).slice(0, 20)) {
    const rule = published?.rules.find((item) => item.id === original.rule.id);
    const contact = context.contacts.find((item) => item.id === original.patientId), patient = context.patients.find((item) => item.id === original.patientId);
    const appointment = context.appointments.find((item) => original.candidate.sourceId.startsWith(`appointment-${item.id}-`));
    if (!rule?.active || JSON.stringify(rule) !== JSON.stringify(original.rule) || !contact?.optIn || !patient || normalizedPhone(patient.phone) !== original.candidate.phone || appointment && ["Cancelado", "Faltou", "Reagendado"].includes(appointment.status)) { await writeRuntime("flow_runs", { ...original, status: "canceled" }); continue; }
    const latest = sessions.find((session) => session.id === original.patientId);
    const buffered = original.status === "waiting" && !original.cursor.wakeAt && latest?.lastMessageId && latest.lastMessageId !== original.lastMessageId && latest.lastText && latest.lastInboundAt
      ? resumeConversation(original.cursor, latest.lastText, latest.lastInboundAt) : original.cursor;
    if (Date.parse(original.candidate.scheduledFor) > Date.now() || original.status === "waiting" && (original.cursor.wakeAt ? Date.parse(original.cursor.wakeAt) > Date.now() : buffered.status !== "active")) continue;
    const run: ConversationRun = { ...original, cursor: { ...buffered, status: "active" }, lastMessageId: buffered !== original.cursor ? latest!.lastMessageId! : original.lastMessageId, status: "running" };
    const { data: claimed, error } = await serverDatabase().from("avvi_followup_runtime").update({ data: run }).eq("entity", "flow_runs").eq("record_id", run.id).eq("data->>status", original.status).select("record_id"); if (error || !claimed?.length) continue;
    const flow = run.rule.flow!;
    try {
      for (let index = 0; index <= flow.nodes.length && run.cursor.status === "active" && sent < 20; index++) {
        const node = flow.nodes.find((item) => item.id === run.cursor.nodeId);
        if (!node || node.type === "end") { run.cursor.status = "done"; break; }
        if (node.type === "message") {
          const id = `${run.id}:${node.id}`; const existing = recordedJobs.get(id);
          if (existing && !["sent", "delivered", "read"].includes(existing.status)) throw new Error("Envio anterior precisa de conferência antes de continuar.");
          if (!existing) {
            const log: FollowUpLog = { id, ruleId: rule!.id, ruleName: `${rule!.name} · ${node.title}`, patientId: patient!.id, patientName: patient!.name, phone: normalizedPhone(patient!.phone), message: renderFollowUp(node.text, patient!, appointment, context), scheduledFor: new Date().toISOString(), createdAt: new Date().toISOString(), sourceId: run.id, status: "sending" };
            await writeRuntime("jobs", log);
            try { const result = await sendConversationMessage(node, run, context); await writeRuntime("jobs", { ...log, status: "sent", sentAt: new Date().toISOString(), providerMessageId: result.providerMessageId }); recordedJobs.set(id, { ...log, status: "sent", sentAt: new Date().toISOString(), providerMessageId: result.providerMessageId }); run.lastSentAt = new Date(Math.floor(Date.now() / 1000) * 1000).toISOString(); sent++; }
            catch (failure) { await writeRuntime("jobs", { ...log, status: "failed", error: (failure as Error).message }); throw failure; }
          }
          run.cursor.nodeId = node.next;
        } else if (node.type === "condition") run.cursor.nodeId = node.branches.find((branch) => branchMatches(run.cursor.reply, branch))?.target || node.fallback;
        else {
          run.cursor.nodeId = node.next; run.cursor.status = "waiting"; run.cursor.waitingSince = run.lastSentAt ?? new Date(Math.floor(Date.now() / 1000) * 1000).toISOString();
          if (node.waitMode === "delay") run.cursor.wakeAt = new Date(Date.now() + node.delayMinutes * 60000).toISOString();
          else { run.cursor.reply = ""; delete run.cursor.wakeAt; }
        }
        if (!run.cursor.nodeId) run.cursor.status = "done";
        await writeRuntime("flow_runs", run);
      }
      await writeRuntime("flow_runs", { ...run, status: run.cursor.status, updatedAt: new Date().toISOString() });
    } catch (failure) { await writeRuntime("flow_runs", { ...run, status: "failed", error: (failure as Error).message }); }
  }
  return sent;
}

export async function captureWhatsAppLead(phone: string, name: string, patientId: string | undefined, at: string, text: string, messageId: string) {
  const digits = phone.replace(/\D/g, ""); if (!/^\d{10,15}$/.test(digits) || !Number.isFinite(Date.parse(at))) return;
  const id = `whatsapp-${digits}`, db = serverDatabase();
  for (let attempt = 0; attempt < 4; attempt++) {
    const { data, error } = await db.from("avvi_followup_runtime").select("data").eq("entity", "leads").eq("record_id", id).maybeSingle();
    if (error) throw new Error("Não foi possível carregar o lead do WhatsApp.");
    const old = data?.data as FollowUpLead | undefined;
    const newest = !old || Date.parse(at) >= Date.parse(old.lastContactAt);
    const lead: FollowUpLead = { id, phone: digits, name: (newest ? name : old?.name) || name || digits, patientId: patientId ?? old?.patientId,
      firstContactAt: old && Date.parse(old.firstContactAt) <= Date.parse(at) ? old.firstContactAt : at,
      lastContactAt: newest ? at : old!.lastContactAt, lastMessage: newest ? text.slice(0, 1000) : old!.lastMessage, lastMessageId: newest ? messageId : old!.lastMessageId };
    if (old) {
      const { data: changed, error: failed } = await db.from("avvi_followup_runtime").update({ data: lead, updated_at: new Date().toISOString() }).eq("entity", "leads").eq("record_id", id).eq("data->>lastMessageId", old.lastMessageId).eq("data->>firstContactAt", old.firstContactAt).eq("data->>lastContactAt", old.lastContactAt).select("record_id");
      if (failed) throw new Error("Não foi possível atualizar o lead do WhatsApp."); if (changed?.length) return;
    } else {
      const { error: failed } = await db.from("avvi_followup_runtime").insert({ entity: "leads", record_id: id, data: lead, updated_at: new Date().toISOString() });
      if (!failed) return; if (failed.code !== "23505") throw new Error("Não foi possível cadastrar o lead do WhatsApp.");
    }
  }
  throw new Error("O lead recebeu atualizações simultâneas. O evento será processado novamente.");
}
export async function listFollowUpLeads(): Promise<FollowUpLead[]> {
  const leads = await readRuntime<FollowUpLead>("leads");
  const stages = await readRuntime<{ id: string; stage: LeadStage | null }>("lead_stages");
  return leads.map((lead) => ({ ...lead, manualStage: stages.find((stage) => stage.id === lead.id)?.stage ?? undefined }));
}

export async function listFollowUpMessages(leadId: string): Promise<FollowUpMessage[]> {
  const lead = (await listFollowUpLeads()).find((item) => item.id === leadId);
  if (!lead) throw new Error("Conversa não encontrada.");
  const [received, jobs] = await Promise.all([readRuntime<FollowUpMessage>("messages"), readRuntime<FollowUpLog>("jobs")]);
  const messages = received.filter((item) => item.leadId === leadId);
  if (!messages.length && lead.lastMessageId) messages.push({ id: lead.lastMessageId, leadId, direction: "incoming", text: lead.lastMessage, at: lead.lastContactAt });
  const outbound: FollowUpMessage[] = jobs.filter((job) => job.phone === lead.phone && ["sent", "delivered", "read"].includes(job.status)).map((job) => ({ id: `outgoing-${job.id}`, leadId, direction: "outgoing", text: job.message, at: job.sentAt ?? job.scheduledFor ?? job.createdAt, status: job.status }));
  return [...messages, ...outbound].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id));
}
