import { resolveAccess, sameOrigin } from "@/lib/accessServer";
import { labLocalModels } from "@/lib/whatsappLabAssistant";
import { labEnabled, redactLabForReviewer, labSnapshot, saveLabConfig, checkLabConnection, sendLabMessage, rehearseLabInbound, changeLabMode, saveLabAppointment, labTemplates, clearLabHistory } from "@/lib/whatsappLab";
import type { LabSnapshot } from "@/lib/whatsappLab";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
async function access(request: Request) {
  if (!labEnabled() || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(request.url).hostname)) return { denied: 404, reviewer: false };
  const user = await resolveAccess(request); if (!user) return { denied: 401, reviewer: false };
  const reviewer = user.role === "standard" && !!user.tabs?.includes("Follow Up: análise Meta");
  if (user.role !== "admin" && !reviewer) return { denied: 403, reviewer: false };
  if (request.method !== "GET" && (!request.headers.get("origin") || !sameOrigin(request))) return { denied: 403, reviewer: false };
  return { denied: 0, reviewer };
}
export async function GET(request: Request) {
  const { denied, reviewer } = await access(request); if (denied) return Response.json({ error: "Acesso restrito ao laboratório." }, { status: denied, headers });
  try { const data = await labSnapshot(); return Response.json(reviewer ? redactLabForReviewer(data) : data, { headers }); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Não foi possível abrir os testes." }, { status: 503, headers }); }
}
export async function POST(request: Request) {
  const { denied, reviewer } = await access(request); if (denied) return Response.json({ error: "Laboratório local restrito ao administrador." }, { status: denied, headers });
  const json = (data: unknown) => Response.json(reviewer ? redactLabForReviewer(data as LabSnapshot) : data, { headers });
  try {
    const raw = await request.text(); if (raw.length > 40000) throw new Error("Configuração muito grande."); const data = JSON.parse(raw);
    if (reviewer && (["config", "local-models", "clear"].includes(data.action) || data.renewConsent)) throw new Error("Esta configuração é restrita ao administrador.");
    if (reviewer && data.action === "create-template" && !/^avvi_review_[a-z0-9_]{1,70}$/.test(String(data.name))) throw new Error("Use um nome iniciado por avvi_review_.");
    if (data.action === "config") return json(await saveLabConfig(data.config ?? {}));
    if (data.action === "local-models") return json({ ...await labSnapshot(), localModels: await labLocalModels() });
    if (data.action === "connection") return json(await checkLabConnection());
    if (data.action === "templates") return json(await labTemplates());
    if (data.action === "create-template") { if (![data.name, data.language, data.body].every(item => typeof item === "string")) throw new Error("Modelo inválido."); return json(await labTemplates({ name: data.name, language: data.language, body: data.body })); }
    if (data.action === "appointment") { if (![data.service, data.date, data.time].every(item => typeof item === "string")) throw new Error("Agendamento inválido."); return json(await saveLabAppointment({ service: data.service, date: data.date, time: data.time })); }
    if (data.action === "clear") return json(await clearLabHistory());
    if (!["rehearsal", "whatsapp"].includes(data.transport)) throw new Error("Escolha ensaio local ou WhatsApp real.");
    if (data.action === "mode") { if (!["human", "assistant"].includes(data.mode) || data.renewConsent !== undefined && typeof data.renewConsent !== "boolean") throw new Error("Modo inválido."); return json(await changeLabMode(data.transport, data.mode, data.renewConsent === true)); }
    if (!["send", "inbound"].includes(data.action) || typeof data.text !== "string" || !data.text.trim() || data.text.length > 4000 || typeof data.id !== "string" || !/^[\w-]{1,200}$/.test(data.id)) throw new Error("Confira a mensagem.");
    if (data.action === "inbound") { if (data.transport !== "rehearsal") throw new Error("Mensagens reais só chegam pelo webhook assinado da Meta."); return json(await rehearseLabInbound(data.text.trim(), data.id)); }
    let template;
    if (data.template) { const item = data.template; if (typeof item.name !== "string" || !/^[a-z][a-z0-9_]{0,100}$/.test(item.name) || typeof item.language !== "string" || !/^[a-z]{2}(?:_[A-Z]{2})?$/.test(item.language) || !Array.isArray(item.parameters) || item.parameters.length > 10 || item.parameters.some((text: unknown) => typeof text !== "string" || text.length > 500)) throw new Error("Confira o modelo aprovado e os parâmetros."); template = { name: item.name, language: item.language, parameters: item.parameters }; }
    return json(await sendLabMessage({ transport: data.transport, text: data.text.trim(), id: data.id, template }));
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Não foi possível executar o teste." }, { status: 400, headers }); }
}
