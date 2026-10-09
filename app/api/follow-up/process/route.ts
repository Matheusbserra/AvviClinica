import { followUpConfig, safeEqual, processFollowUp } from "@/lib/followUpServer";
export async function POST(request: Request) {
  const secret = followUpConfig().cronSecret;
  if (!secret || !safeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`)) return Response.json({ error: "Não autorizado." }, { status: 401 });
  try { return Response.json(await processFollowUp()); } catch (failure) { return Response.json({ error: (failure as Error).message }, { status: 503 }); }
}
