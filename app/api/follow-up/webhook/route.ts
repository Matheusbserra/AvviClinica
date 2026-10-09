import { createHmac } from "node:crypto";
import { followUpConfig, safeEqual, handleFollowUpWebhook } from "@/lib/followUpServer";
export async function GET(request: Request) {
  const query = new URL(request.url).searchParams; const token = followUpConfig().verifyToken;
  if (!token || query.get("hub.mode") !== "subscribe" || !safeEqual(query.get("hub.verify_token") ?? "", token)) return new Response("Não autorizado", { status: 403 });
  return new Response(query.get("hub.challenge") ?? "");
}
export async function POST(request: Request) {
  const secret = followUpConfig().appSecret;
  if (!secret) return Response.json({ error: "Webhook não configurado." }, { status: 503 });
  const raw = await request.text(); if (raw.length > 1000000) return new Response("Payload muito grande", { status: 413 });
  const signature = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
  if (!safeEqual(request.headers.get("x-hub-signature-256") ?? "", signature)) return new Response("Não autorizado", { status: 401 });
  try { await handleFollowUpWebhook(JSON.parse(raw)); return Response.json({ received: true }); } catch { return Response.json({ error: "Não foi possível processar o evento." }, { status: 503 }); }
}
