import { followUpConfig, requireFollowUpUser, publishFollowUp } from "@/lib/followUpServer";
export async function POST(request: Request) {
  try { await requireFollowUpUser(request); } catch { return Response.json({ error: "Entre com um usuário autorizado da clínica para publicar automações." }, { status: 401 }); }
  try {
    if (!followUpConfig().enabled) return Response.json({ error: "Envio real desativado no servidor." }, { status: 409 });
    const body = await request.json(); await publishFollowUp(body.rules, body.contacts); return Response.json({ success: true });
  } catch (failure) { return Response.json({ error: (failure as Error).message }, { status: 400 }); }
}
