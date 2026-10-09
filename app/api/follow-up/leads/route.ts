import { followUpConfig, requireFollowUpUser, listFollowUpLeads, writeRuntime } from "@/lib/followUpServer";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const config = followUpConfig(); if (!config.url || !config.key) return Response.json({ leads: [] });
  try { await requireFollowUpUser(request); } catch { return Response.json({ error: "Entre com um usuário autorizado para consultar as conversas." }, { status: 401 }); }
  try { return Response.json({ leads: await listFollowUpLeads() }); } catch { return Response.json({ error: "Não foi possível carregar as conversas." }, { status: 503 }); }
}
export async function POST(request: Request) {
  try { await requireFollowUpUser(request); } catch { return Response.json({ error: "Entre com um usuário autorizado para mover os leads." }, { status: 401 }); }
  try {
    const { id, stage } = await request.json();
    if (typeof id !== "string" || !id.startsWith("whatsapp-") || ![null, "entry", "warm", "cold", "scheduled", "aftercare"].includes(stage)) return Response.json({ error: "Confira a etapa escolhida." }, { status: 400 });
    if (!(await listFollowUpLeads()).some((lead) => lead.id === id)) return Response.json({ error: "Lead não encontrado." }, { status: 404 });
    await writeRuntime("lead_stages", { id, stage, updatedAt: new Date().toISOString() }); return Response.json({ success: true });
  } catch { return Response.json({ error: "Não foi possível salvar a movimentação." }, { status: 503 }); }
}
