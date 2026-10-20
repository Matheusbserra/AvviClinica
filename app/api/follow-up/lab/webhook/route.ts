import { after } from "next/server";
import { labEnabled, labWebhookVerification, acceptLabWebhook, processLabReplies } from "@/lib/whatsappLab";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) { if (!labEnabled()) return new Response("Indisponível", { status: 404 }); const query = new URL(request.url).searchParams; if (query.get("hub.mode") !== "subscribe" || !await labWebhookVerification(query.get("hub.verify_token") ?? "")) return new Response("Não autorizado", { status: 403 }); return new Response(query.get("hub.challenge") ?? "", { headers: { "Cache-Control": "no-store" } }); }
export async function POST(request: Request) {
  if (!labEnabled()) return new Response("Indisponível", { status: 404 });
  try {
    const raw = await request.text(); if (raw.length > 1000000) return new Response("Payload muito grande", { status: 413 });
    const accepted = await acceptLabWebhook(raw, request.headers.get("x-hub-signature-256") ?? "");
    if (accepted) after(async () => { try { await processLabReplies(); } catch { /* Persisted inbox is available for human follow-up. Never log keys or payloads. */ } });
    return Response.json({ received: true });
  } catch (error) { return Response.json({ error: "Não foi possível aceitar o evento." }, { status: error instanceof Error && error.message === "Assinatura inválida." ? 401 : 503 }); }
}
