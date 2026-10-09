import { createHmac, scryptSync, timingSafeEqual } from "node:crypto";
import type { AppUser } from "./access";
const accounts: (AppUser & { salt: string; hash: string })[] = [
  { login: "admin", role: "admin", salt: "cb9a97815a4abc49b1046d312c25e9c6", hash: "e6f0e8fec46fb91a268ed33d2689986a53854ef4a98f46b4b8d77f8ea25e9a96bddda488c9318d53b0cd66220bd939f9c8c7fc9c9be0d9b3adc639f6fc75a179" },
  { login: "avviclinica", role: "standard", salt: "2369f96c6c800fdd8e02f53ff8f7bc2c", hash: "edfac34d4846d8162a30b154725ffc99b88ec6842d40fbaa1f09f5b346fab398e6c8458d9d0067b06c1d987fce57e00621ce8926820d0724908487c104676fa5" }
];
export const legacyStandard = accounts[1];
export const accessCookie = "avvi_access";
function secret() {
  const value = process.env.AVVI_SESSION_SECRET;
  if (!value || value.length < 32) throw new Error("Configure AVVI_SESSION_SECRET no servidor para habilitar os usuários da clínica.");
  return value;
}
export function verifyCredentials(login: string, password: string): AppUser | null {
  const account = accounts.find((user) => user.login === login.trim().toLowerCase());
  if (!account || password.length > 256) return null;
  const hash = scryptSync(password, account.salt, 64);
  if (!timingSafeEqual(hash, Buffer.from(account.hash, "hex"))) return null;
  return { login: account.login, role: account.role };
}
export function signAccess(user: AppUser, now = Date.now()) {
  const value = Buffer.from(JSON.stringify({ ...user, expires: now + 12 * 60 * 60 * 1000 })).toString("base64url");
  return value + "." + createHmac("sha256", secret()).update(value).digest("base64url");
}
export function readAccess(request: Request, now = Date.now()): AppUser | null {
  const raw = request.headers.get("cookie")?.split(";").map((item) => item.trim()).find((item) => item.startsWith(accessCookie + "="))?.slice(accessCookie.length + 1);
  if (!raw) return null;
  try {
    const [value, signature] = raw.split(".");
    if (!value || !signature) return null;
    const expected = createHmac("sha256", secret()).update(value).digest();
    const received = Buffer.from(signature, "base64url");
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return null;
    const data = JSON.parse(Buffer.from(value, "base64url").toString());
    if (typeof data.login !== "string" || !["admin", "standard"].includes(data.role) || !Number.isFinite(data.expires) || data.expires <= now) return null;
    return { login: data.login, role: data.role, ...(data.id ? { id: data.id } : {}), ...(data.name ? { name: data.name } : {}), ...(data.tabs ? { tabs: data.tabs } : {}), ...(data.revision !== undefined ? { revision: data.revision } : {}) };
  } catch { return null; }
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    const source = new URL(origin);
    const target = new URL(request.url);
    const host = request.headers.get("host") ?? target.host;
    const protocol = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? target.protocol.replace(":", "");
    return source.host === host && source.protocol === `${protocol}:`;
  } catch { return false; }
}

export async function authenticateUser(login: string, password: string): Promise<AppUser | null> {
  if (login.trim().toLowerCase() === "admin") return verifyCredentials(login, password);
  const { authenticateManaged } = await import("./accountsServer"); return authenticateManaged(login, password);
}
export async function resolveAccess(request: Request, now = Date.now()): Promise<AppUser | null> {
  const signed = readAccess(request, now); if (!signed) return null;
  if (signed.login === "admin" && signed.role === "admin" && (!signed.id || signed.id === "primary-admin")) return { login: "admin", role: "admin", name: "Administrador principal" };
  try {
    const { findAccount, accountUser } = await import("./accountsServer"); const account = await findAccount(signed.id ?? signed.login);
    if (!account || account.login !== signed.login || account.role !== signed.role || account.version !== (signed.revision ?? 0)) return null;
    return accountUser(account);
  } catch { return null; }
}
