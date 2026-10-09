import { requireFollowUpUser, listFollowUpMessages } from "@/lib/followUpServer";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { await requireFollowUpUser(request); } catch { return Response.json({ error: "Entre com um usuário autorizado para consultar a conversa." }, { status: 401 }); }
  const leadId = new URL(request.url).searchParams.get("leadId") ?? "";
  if (!/^whatsapp-\d{10,15}$/.test(leadId)) return Response.json({ error: "Selecione uma conversa válida." }, { status: 400 });
  try {
    const messages = await listFollowUpMessages(leadId);
    const before = new URL(request.url).searchParams.get("before");
    const stop = before ? messages.findIndex((message) => message.id === before) : messages.length;
    if (stop < 0) return Response.json({ error: "Atualize a conversa para carregar as mensagens." }, { status: 400 });
    const start = Math.max(0, stop - 100);
    return Response.json({ messages: messages.slice(start, stop), hasMore: start > 0 });
  } catch { return Response.json({ error: "Não foi possível carregar a conversa." }, { status: 503 }); }
}
