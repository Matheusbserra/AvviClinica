import { promises as fs } from "node:fs";
import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { defaultLabKnowledge, labAssistantReply, labProviderFetch, validLocalModel } from "./whatsappLabAssistant";

export type LabTransport = "rehearsal" | "whatsapp";
export type LabMessage = { id: string; direction: "incoming" | "outgoing"; text: string; at: string; transport: LabTransport; status: "received" | "simulated" | "sending" | "sent" | "delivered" | "read" | "failed" | "uncertain"; providerId?: string; source?: string; error?: string; handled?: boolean };
type LabConfig = { aiProvider?: "openai" | "local"; localModel?: string; token: string; phoneId: string; businessId: string; version: string; appSecret: string; verifyToken: string; aiKey: string; model: string; testPhone: string; consent: boolean; knowledge: string; assistant: boolean; publicUrl: string };
type Channel = { mode: "assistant" | "human"; optedOut: boolean; lastInboundAt?: string; error?: string };
type WebhookEvent = { at: string; result: "received" | "status" | "other" | "phone-mismatch" | "sender-mismatch" | "consent" | "duplicate" | "invalid-message" };
type LabState = { webhookEvents?: WebhookEvent[]; recipientWaId?: string; config: LabConfig; messages: LabMessage[]; channels: Record<LabTransport, Channel>; lastWebhookAt?: string; connection?: { number: string; name: string; checkedAt: string }; templates: { id: string; name: string; language: string; status: string; category: string }[]; appointment: { service: string; date: string; time: string; status: "Agendado" | "Confirmado" | "Cancelado" } };
export function labEnabled() { return process.env.AVVI_WHATSAPP_LOCAL_TEST === "true" && !process.env.VERCEL; }
function ensureEnabled() { if (!labEnabled()) throw new Error("O laboratório está disponível somente na prévia local autorizada."); }
const labDirectories = new AsyncLocalStorage<string>();
export function withLabDirectory<T>(directory: string, work: () => Promise<T>) { return labDirectories.run(directory, work); }
const directory = () => labDirectories.getStore() || process.env.AVVI_WHATSAPP_LAB_DIRECTORY || path.join(process.cwd(), ".avvi-local", "whatsapp-lab");
const stateFile = () => path.join(directory(), "state.json");
const root = globalThis as typeof globalThis & { avviLabQueues?: Map<string, Promise<unknown>>; avviLabInterrupts?: Map<string, number> };
function interruptKey(transport: LabTransport) { return `${stateFile()}:${transport}`; }
function interruption(transport: LabTransport) { return root.avviLabInterrupts?.get(interruptKey(transport)) ?? 0; }
async function serial<T>(work: (state: LabState, persist: () => Promise<void>) => Promise<T>) {
  ensureEnabled(); const file = stateFile(); const queues = root.avviLabQueues ??= new Map();
  const previous = queues.get(file) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(async () => { const state = await readState(); return work(state, () => writeState(state)); });
  queues.set(file, next); try { return await next; } finally { if (queues.get(file) === next) queues.delete(file); }
}
function initial(): LabState { return { config: { token: "", phoneId: "", businessId: "", version: "v26.0", appSecret: "", verifyToken: randomUUID(), aiKey: "", model: "gpt-5.4-mini", testPhone: "", consent: false, knowledge: defaultLabKnowledge, assistant: false, publicUrl: "" }, messages: [], channels: { rehearsal: { mode: "assistant", optedOut: false }, whatsapp: { mode: "assistant", optedOut: false } }, templates: [], appointment: { service: "Avaliação de demonstração", date: "", time: "", status: "Agendado" } }; }
async function readState(): Promise<LabState> { ensureEnabled(); try { return JSON.parse(await fs.readFile(stateFile(), "utf8")); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return initial(); throw new Error("Não foi possível ler os testes locais. Preserve os arquivos e tente novamente."); } }
async function writeState(state: LabState) { await fs.mkdir(directory(), { recursive: true, mode: 0o700 }); const temporary = stateFile() + "." + randomUUID() + ".tmp"; await fs.writeFile(temporary, JSON.stringify(state), { mode: 0o600 }); await fs.rename(temporary, stateFile()); }
function snapshot(state: LabState) {
  const { token, appSecret, aiKey, ...config } = state.config;
  return { enabled: true, config: { ...config, tokenConfigured: !!token, appSecretConfigured: !!appSecret, aiConfigured: !!aiKey }, messages: state.messages, channels: state.channels, lastWebhookAt: state.lastWebhookAt, webhookEvents: state.webhookEvents ?? [], connection: state.connection, templates: state.templates, appointment: state.appointment };
}
export type LabSnapshot = ReturnType<typeof snapshot> & { tunnelUrl?: string };
export function redactLabForReviewer(data: LabSnapshot): LabSnapshot { return { ...data, config: { ...data.config, phoneId: "", businessId: "", verifyToken: "", knowledge: "", publicUrl: "" }, tunnelUrl: undefined, webhookEvents: [] }; }
export async function labSnapshot(): Promise<LabSnapshot> { return serial(async (state, persist) => { await persist(); let tunnelUrl: string | undefined; try { const tunnel = JSON.parse(await fs.readFile(path.join(directory(), "tunnel.json"), "utf8")); if (/^https:\/\/[a-z0-9-]+\.trycloudflare\.com\/api\/follow-up\/lab\/webhook$/.test(tunnel.url) && Number.isInteger(tunnel.pid)) { process.kill(tunnel.pid, 0); tunnelUrl = tunnel.url; } } catch { /* The tunnel is optional until real webhook configuration. */ } return { ...snapshot(state), ...(tunnelUrl ? { tunnelUrl } : {}) }; }); }
function value(input: Record<string, unknown>, key: string, maximum = 5000) { const item = input[key]; if (typeof item !== "string" || item.length > maximum) throw new Error(`Confira o campo ${key}.`); return item.trim(); }
export async function saveLabConfig(input: Record<string, unknown>) {
  return serial(async (state, persist) => {
    const next = { ...state.config };
    if (input.aiProvider !== undefined) { if (!["openai", "local"].includes(String(input.aiProvider))) throw new Error("Escolha OpenAI ou IA local."); next.aiProvider = input.aiProvider as "openai" | "local"; }
    if (input.localModel !== undefined) { const model = value(input, "localModel", 100); if (!validLocalModel(model)) throw new Error("Escolha um nome de modelo local válido, sem nuvem."); next.localModel = model; }
    for (const key of ["token", "appSecret", "aiKey"] as const) if (input[key] !== undefined) { const text = value(input, key); if (text) next[key] = text; }
    for (const key of ["phoneId", "businessId", "version", "verifyToken", "model", "testPhone", "knowledge", "publicUrl"] as const) if (input[key] !== undefined) next[key] = value(input, key, key === "knowledge" ? 16000 : 500);
    for (const key of ["consent", "assistant"] as const) if (input[key] !== undefined) { if (typeof input[key] !== "boolean") throw new Error("Opção inválida."); next[key] = input[key]; }
    next.testPhone = next.testPhone.replace(/\D/g, "");
    if (next.testPhone && !/^\d{10,15}$/.test(next.testPhone) || next.phoneId && !/^\d{5,30}$/.test(next.phoneId) || next.businessId && !/^\d{5,30}$/.test(next.businessId) || !/^v\d+\.\d+$/.test(next.version) || !/^[\w.-]{1,100}$/.test(next.model) || !next.verifyToken || next.verifyToken.length < 16) throw new Error("Confira o telefone com DDI, os IDs, a versão da API e o token de verificação (mínimo 16 caracteres).");
    if (next.publicUrl && !/^https:\/\/[^\s?#]+$/.test(next.publicUrl)) throw new Error("Informe o endereço HTTPS público do webhook.");
    if (next.testPhone !== state.config.testPhone) { delete state.recipientWaId; state.messages = []; state.channels = initial().channels; delete state.lastWebhookAt; }
    if (next.token !== state.config.token || next.phoneId !== state.config.phoneId || next.version !== state.config.version) delete state.connection;
    state.config = next; await persist(); return snapshot(state);
  });
}
async function graph(config: LabConfig, resource: string, body?: unknown) {
  if (!config.token || !config.phoneId) throw new Error("Preencha o token temporário e o ID do número de teste da Meta.");
  const response = await labProviderFetch("Meta", `https://graph.facebook.com/${config.version}/${resource}`, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${config.token}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000), cache: "no-store" });
  const data = await response.json();
  if (!response.ok) {
    const code = typeof data.error?.code === "number" ? data.error.code : undefined;
    const detail = code === 131005 ? "Acesso de envio negado. O token pode funcionar para consultas e ainda não autorizar o envio. Gere um novo token temporário na Meta, salve a configuração e confira o acesso do app à conta WhatsApp de teste. Depois retome o assistente."
      : code === 190 ? "Token expirado ou inválido. Gere um novo token temporário na Meta e salve a configuração. Depois retome o assistente."
      : "Confira credenciais, destinatário autorizado e permissões.";
    throw Object.assign(new Error(`A Meta recusou a operação (HTTP ${response.status}, código ${code ?? "indisponível"}). ${detail}`), { metaCode: code });
  }
  return data;
}
export async function checkLabConnection() { return serial(async (state, persist) => { const data = await graph(state.config, `${state.config.phoneId}?fields=id,display_phone_number,verified_name`); if (String(data.id) !== state.config.phoneId) throw new Error("A Meta retornou outro número."); state.connection = { number: data.display_phone_number ?? "Número de teste", name: data.verified_name ?? "WhatsApp Business", checkedAt: new Date().toISOString() }; await persist(); return snapshot(state); }); }
function allowed(state: LabState) { if (!state.config.testPhone || !state.config.consent) throw new Error("Informe seu telefone de teste com DDI e confirme a autorização para receber as mensagens."); }
function windowOpen(channel: Channel) { const at = Date.parse(channel.lastInboundAt ?? ""); return Number.isFinite(at) && Date.now() >= at && Date.now() - at < 86400000; }
async function send(state: LabState, persist: () => Promise<void>, transport: LabTransport, text: string, id: string, source: string, template?: { name: string; language: string; parameters: string[] }) {
  const existing = state.messages.find(item => item.id === id); if (existing) { if (existing.transport !== transport || existing.text !== text) throw new Error("A identificação desta mensagem já foi utilizada. Atualize a conversa."); return existing; }
  if (state.messages.length >= 1000) throw new Error("O histórico do laboratório está cheio. Limpe os testes para continuar.");
  if (transport === "whatsapp") { allowed(state); if (state.channels.whatsapp.optedOut) throw new Error("Este contato pediu para parar. Renove a autorização antes de enviar."); if (!template && !windowOpen(state.channels.whatsapp)) throw new Error("Envie um modelo aprovado ou peça ao telefone de teste para mandar uma mensagem primeiro (janela de 24 horas)."); }
  const message: LabMessage = { id, direction: "outgoing", text, at: new Date().toISOString(), transport, source, status: transport === "rehearsal" ? "simulated" : "sending" };
  state.messages.push(message); await persist(); if (transport === "rehearsal") return message;
  try {
    const data = await graph(state.config, `${state.config.phoneId}/messages`, { messaging_product: "whatsapp", to: state.config.testPhone, ...(template ? { type: "template", template: { name: template.name, language: { code: template.language }, ...(template.parameters.length ? { components: [{ type: "body", parameters: template.parameters.map(text => ({ type: "text", text })) }] } : {}) } } : { type: "text", text: { body: text, preview_url: false } }) });
    if (!data.messages?.[0]?.id) throw new Error("Não foi possível confirmar o envio na Meta."); const recipient = data.contacts?.find((contact: { input?: string; wa_id?: string }) => contact.input?.replace(/\D/g, "") === state.config.testPhone && /^\d{10,15}$/.test(contact.wa_id ?? ""));
    if (recipient) state.recipientWaId = recipient.wa_id;
    message.providerId = data.messages[0].id; message.status = "sent";
  } catch (error) {
    message.status = error instanceof Error && error.message.startsWith("A Meta recusou") ? "failed" : "uncertain"; message.error = error instanceof Error ? error.message : "Não foi possível confirmar o envio. Confira no WhatsApp antes de repetir.";
    if ([131005, 190].includes((error as { metaCode?: number })?.metaCode ?? 0)) { state.channels.whatsapp.mode = "human"; state.channels.whatsapp.error = message.error; }
  }
  await persist(); return message;
}
function interrupt(transport: LabTransport) { const versions = root.avviLabInterrupts ??= new Map(); versions.set(interruptKey(transport), interruption(transport) + 1); }
export async function sendLabMessage(input: { transport: LabTransport; text: string; id: string; template?: { name: string; language: string; parameters: string[] } }) { if (!input.template) interrupt(input.transport); return serial(async (state, persist) => { if (!input.template) state.channels[input.transport].mode = "human"; const result = await send(state, persist, input.transport, input.text, input.id, "Equipe", input.template); return { ...snapshot(state), result }; }); }
export async function changeLabMode(transport: LabTransport, mode: "assistant" | "human", renewConsent = false) { if (mode === "human") interrupt(transport); return serial(async (state, persist) => { const channel = state.channels[transport]; if (mode === "assistant" && channel.optedOut && !renewConsent) throw new Error("Confirme uma nova autorização antes de reativar o contato."); if (renewConsent) { if (transport === "whatsapp") allowed(state); channel.optedOut = false; } channel.mode = mode; delete channel.error; await persist(); return snapshot(state); }); }
export async function saveLabAppointment(input: { service: string; date: string; time: string }) { return serial(async (state, persist) => { if (!input.service.trim() || input.service.length > 200 || !/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) throw new Error("Preencha o serviço, a data e a hora do agendamento de teste."); state.appointment = { ...input, status: "Agendado" }; await persist(); return snapshot(state); }); }
export async function rehearseLabInbound(text: string, id: string) { await serial(async (state, persist) => { if (!state.messages.some(item => item.id === id)) state.messages.push({ id, direction: "incoming", text, at: new Date().toISOString(), transport: "rehearsal", status: "simulated" }); await persist(); }); await processLabReplies(); return labSnapshot(); }
export async function processLabReplies() {
  return serial(async (state, persist) => {
    for (const message of state.messages.filter(item => item.direction === "incoming" && !item.handled)) {
      message.handled = true; await persist(); const channel = state.channels[message.transport];
      const normalized = message.text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
      if (/^(sair|parar|stop|cancelar mensagens)$/.test(normalized)) { channel.optedOut = true; channel.mode = "human"; await persist(); continue; }
      if (channel.optedOut || channel.mode === "human" || !state.config.assistant) continue;
      if (message.transport === "whatsapp" && (!state.config.consent || !windowOpen(channel))) continue;
      try {
        const generation = interruption(message.transport);
        let reply;
        if (state.appointment.date && /^(confirmo|confirmar|sim,? confirmo|pode confirmar)[.!\s]*$/.test(normalized)) { state.appointment.status = "Confirmado"; reply = { reply: `Sou o assistente virtual da AVVI Clínica. O agendamento de demonstração de ${state.appointment.service}, em ${state.appointment.date.split("-").reverse().join("/")}, às ${state.appointment.time}, foi confirmado.`, handoff: false, source: "Agenda de teste" }; }
        else reply = await labAssistantReply(state.config.knowledge, state.messages.filter(item => item.transport === message.transport && !["failed", "uncertain"].includes(item.status)), state.config.aiKey, state.config.model, message.transport === "rehearsal", state.config.aiProvider === "local" ? state.config.localModel || "qwen3.5:2b" : undefined);
        if (interruption(message.transport) !== generation) { await persist(); continue; }
        if (reply.handoff) channel.mode = "human";
        await send(state, persist, message.transport, reply.reply, `reply-${message.id}`, reply.source);
      } catch (error) { channel.mode = "human"; channel.error = error instanceof Error ? error.message : "Encaminhe para a equipe."; }
      await persist();
    }
    return snapshot(state);
  });
}
export async function labWebhookVerification(token: string) { const state = await readState(); const expected = Buffer.from(state.config.verifyToken); const actual = Buffer.from(token); return expected.length === actual.length && timingSafeEqual(expected, actual); }
// A small clock difference must not discard genuine signed replies. Accepted
// timestamps are still clamped to local time below, keeping the 24-hour gate.
const webhookClockTolerance = 3 * 60 * 1000;
export async function acceptLabWebhook(raw: string, signature: string) {
  return serial(async (state, persist) => {
    if (!state.config.appSecret) throw new Error("Configure o segredo do aplicativo Meta.");
    const expected = Buffer.from("sha256=" + createHmac("sha256", state.config.appSecret).update(raw).digest("hex")); const actual = Buffer.from(signature);
    if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error("Assinatura inválida.");
    const payload = JSON.parse(raw); let accepted = false;
    const record = (result: WebhookEvent["result"]) => { state.webhookEvents = [...(state.webhookEvents ?? []), { at: new Date().toISOString(), result }].slice(-20); };
    for (const entry of payload.entry ?? []) for (const change of entry.changes ?? []) {
      const data = change.value; if (data?.metadata?.phone_number_id !== state.config.phoneId) { record("phone-mismatch"); continue; }
      if (data.statuses?.length) record("status");
      if (!data.messages?.length && !data.statuses?.length) record("other");
      for (const item of data.messages ?? []) {
        const authorized = !!state.config.testPhone && typeof item.from === "string" && (item.from === state.config.testPhone || !!state.recipientWaId && item.from === state.recipientWaId);
        if (!authorized) { record("sender-mismatch"); continue; }
        if (!state.config.consent) { record("consent"); continue; }
        if (state.messages.some(message => message.id === item.id)) { record("duplicate"); continue; }
        const text = item.text?.body ?? item.interactive?.button_reply?.title ?? item.interactive?.list_reply?.title ?? item.button?.text;
        const timestamp = Number(item.timestamp) * 1000; if (typeof item.id !== "string" || !item.id || item.id.length > 200 || !Number.isFinite(timestamp) || timestamp > Date.now() + webhookClockTolerance) { record("invalid-message"); continue; }
        if (state.messages.length >= 1000) throw new Error("Histórico de testes cheio.");
        const at = new Date(Math.min(timestamp, Date.now())).toISOString();
        state.messages.push({ id: item.id, direction: "incoming", text: typeof text === "string" ? text.slice(0, 4000) : "[Mídia recebida: atendimento humano necessário]", at, transport: "whatsapp", status: "received" });
        if (!text) state.channels.whatsapp.mode = "human";
        if (!state.channels.whatsapp.lastInboundAt || at > state.channels.whatsapp.lastInboundAt!) state.channels.whatsapp.lastInboundAt = at;
        state.lastWebhookAt = new Date().toISOString(); record("received"); accepted = true;
      }
      for (const status of data.statuses ?? []) { const message = state.messages.find(item => item.providerId === status.id && item.transport === "whatsapp"); if (!message) continue; const rank = { sent: 1, delivered: 2, read: 3 }; if (status.status === "failed" && !["delivered", "read"].includes(message.status)) message.status = "failed"; else if (status.status in rank && rank[status.status as keyof typeof rank] >= (rank[message.status as keyof typeof rank] ?? 0)) message.status = status.status; }
    }
    await persist(); return accepted;
  });
}
export async function labTemplates(create?: { name: string; language: string; body: string }) { return serial(async (state, persist) => { if (!state.config.businessId) throw new Error("Informe o ID da conta WhatsApp Business (WABA)."); if (create) { if (!/^[a-z][a-z0-9_]{0,100}$/.test(create.name) || !/^[a-z]{2}(?:_[A-Z]{2})?$/.test(create.language) || !create.body.trim() || create.body.length > 1024) throw new Error("Confira o nome, idioma e texto do modelo."); await graph(state.config, `${state.config.businessId}/message_templates`, { name: create.name, language: create.language, category: "UTILITY", components: [{ type: "BODY", text: create.body }] }); } const data = await graph(state.config, `${state.config.businessId}/message_templates?limit=100&fields=id,name,language,status,category`); state.templates = (data.data ?? []).map((item: LabState["templates"][number]) => ({ id: item.id, name: item.name, language: item.language, status: item.status, category: item.category })); await persist(); return snapshot(state); }); }
export async function clearLabHistory() { return serial(async (state, persist) => { state.messages = []; for (const transport of ["rehearsal", "whatsapp"] as const) state.channels[transport] = { mode: state.channels[transport].optedOut ? "human" : "assistant", optedOut: state.channels[transport].optedOut }; delete state.lastWebhookAt; state.appointment.status = "Agendado"; await persist(); return snapshot(state); }); }
