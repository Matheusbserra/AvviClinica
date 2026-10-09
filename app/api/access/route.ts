import { accessCookie, readAccess, sameOrigin, signAccess, verifyCredentials } from "@/lib/accessServer";
export const runtime = "nodejs";
const attempts = new Map<string, { count: number; until: number }>();
const headers = { "Cache-Control": "no-store" };
export async function GET(request: Request) { return Response.json({ user: readAccess(request) }, { headers }); }
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origem não autorizada." }, { status: 403, headers });
  const ip = request.headers.get("x-forwarded-for")?.split(",")[0] ?? "local";
  let attempt = attempts.get(ip);
  if (!attempt || attempt.until < Date.now()) { attempt = { count: 0, until: Date.now() + 15 * 60 * 1000 }; attempts.set(ip, attempt); }
  if (attempt.count >= 10) return Response.json({ error: "Muitas tentativas. Aguarde alguns minutos." }, { status: 429, headers });
  try {
    const body = await request.json();
    const user = typeof body.login === "string" && typeof body.password === "string" ? verifyCredentials(body.login, body.password) : null;
    if (!user) { attempt.count++; return Response.json({ error: "Login ou senha inválidos." }, { status: 401, headers }); }
    const token = signAccess(user); attempts.delete(ip);
    return Response.json({ user }, { headers: { ...headers, "Set-Cookie": `${accessCookie}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${new URL(request.url).protocol === "https:" ? "; Secure" : ""}` } });
  } catch { return Response.json({ error: "Não foi possível autenticar. Confira a configuração de acesso do servidor." }, { status: 503, headers }); }
}
export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "Origem não autorizada." }, { status: 403, headers });
  return Response.json({ user: null }, { headers: { ...headers, "Set-Cookie": `${accessCookie}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0` } });
}
