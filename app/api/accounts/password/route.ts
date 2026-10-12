import { accessCookie, resolveAccess, sameOrigin, signAccess } from "@/lib/accessServer";
import { canAccessTab } from "@/lib/access";
import { AccountError, changeOwnPassword } from "@/lib/accountsServer";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie" };
const attempts = new Map<string, { count: number; until: number }>();
export async function POST(request: Request) {
  const user = await resolveAccess(request);
  if (!user) return Response.json({ error: "Autentique-se novamente." }, { status: 401, headers });
  if (!canAccessTab(user, "Contas") || !sameOrigin(request)) return Response.json({ error: "Acesso não autorizado." }, { status: 403, headers });
  const key = user.id ?? user.login;
  let attempt = attempts.get(key);
  if (!attempt || attempt.until < Date.now()) { attempt = { count: 0, until: Date.now() + 15 * 60 * 1000 }; attempts.set(key, attempt); }
  if (attempt.count >= 10) return Response.json({ error: "Muitas tentativas. Aguarde alguns minutos." }, { status: 429, headers });
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).some(key => !["currentPassword", "newPassword", "confirmPassword"].includes(key))) throw new AccountError("Informe somente a senha atual e a nova senha.");
    if (typeof body.newPassword !== "string" || body.newPassword !== body.confirmPassword) throw new AccountError("A confirmação da nova senha não confere.");
    const saved = await changeOwnPassword(user, body.currentPassword, body.newPassword);
    attempts.delete(key);
    return Response.json({ user: saved }, { headers: { ...headers, "Set-Cookie": `${accessCookie}=${signAccess(saved)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=43200${new URL(request.url).protocol === "https:" ? "; Secure" : ""}` } });
  } catch (error) {
    if (error instanceof AccountError && error.status === 401) attempt.count++;
    return Response.json({ error: error instanceof AccountError ? error.message : "Não foi possível alterar a senha. Tente novamente." }, { status: error instanceof AccountError ? error.status : 503, headers });
  }
}
