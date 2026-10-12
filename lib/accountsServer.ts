import { createClient } from "@supabase/supabase-js";
import { createCipheriv, createDecipheriv, createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { appTabs, standardTabs, professionalAccessTabs, professionalScope, canAccessTab } from "./access";
import type { AppRole, AppUser } from "./access";
import { legacyStandard } from "./accessServer";
export type StoredAccount = { id: string; login: string; name: string; role: AppRole; tabs: string[]; salt: string; password_hash: string; password_ciphertext: string | null; version: number; professional_report?: { professionalIds: string[] } | null; professional_registration?: { professionalIds: string[] } | null };
export type ManagedAccount = AppUser & { id: string; name: string; tabs: string[]; revision: number; locked: boolean; password: string | null };
export class AccountError extends Error { constructor(message: string, public status = 400) { super(message); } }
const primary: ManagedAccount = { id: "primary-admin", login: "admin", name: "Administrador principal", role: "admin", tabs: [...appTabs], revision: 0, locked: true, password: null };
const builtin: StoredAccount = { id: "builtin-standard", login: "avviclinica", name: "AvviClínica", role: "standard", tabs: [...standardTabs], salt: legacyStandard.salt, password_hash: legacyStandard.hash, password_ciphertext: null, version: 0 };
export function accountUser(account: StoredAccount): AppUser {
  const clean = (scope: StoredAccount["professional_report"]) => scope ? { professionalIds: Array.isArray(scope.professionalIds) ? scope.professionalIds.filter(id => typeof id === "string") : [] } : undefined;
  const scope = professionalScope({ login: account.login, role: account.role, professionalReport: clean(account.professional_report), professionalRegistration: clean(account.professional_registration) });
  return { id: account.id, login: account.login, name: account.name, role: account.role, tabs: account.role === "admin" ? [...appTabs] : account.tabs.filter(tab => appTabs.includes(tab as typeof appTabs[number])), revision: account.version, ...(scope ? { professionalReport: scope, professionalRegistration: scope } : {}) };
}
function cryptKey() {
  const secret = process.env.AVVI_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new AccountError("Configure AVVI_SESSION_SECRET na hospedagem.", 503);
  return createHash("sha256").update("avvi-password-v1:" + secret).digest();
}
function encrypt(password: string) { const iv = randomBytes(12), cipher = createCipheriv("aes-256-gcm", cryptKey(), iv); const encrypted = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]); return [iv, encrypted, cipher.getAuthTag()].map(value => value.toString("base64url")).join("."); }
function decrypt(value: string) { const [iv, encrypted, tag] = value.split(".").map(part => Buffer.from(part, "base64url")); const decipher = createDecipheriv("aes-256-gcm", cryptKey(), iv); decipher.setAuthTag(tag); return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8"); }
export function accountStorageMode() { return !process.env.VERCEL && !process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ? "local" : "cloud"; }
const localFile = () => path.join(process.env.AVVI_LOCAL_ACCOUNTS_DIRECTORY ?? path.join(process.cwd(), ".avvi-local"), "accounts.json");
function cloud() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim().replace(/\/+$/, "").replace(/\/(rest|auth)\/v1$/i, ""), key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) throw new AccountError("Para gerenciar usuários na nuvem, configure SUPABASE_SERVICE_ROLE_KEY no servidor e execute supabase/accounts.sql no mesmo projeto Supabase.", 503);
  if (key.startsWith("sb_publishable_")) throw new AccountError("SUPABASE_SERVICE_ROLE_KEY contém uma chave pública. Use a chave privada service_role ou Secret key do mesmo projeto Supabase, no Vercel Production.", 503);
  if (key.split(".").length === 3) {
    let claims: { role?: string; ref?: string } | undefined;
    try { claims = JSON.parse(Buffer.from(key.split(".")[1], "base64url").toString()); } catch { /* The API validates malformed keys. */ }
    if (claims?.role && claims.role !== "service_role") throw new AccountError("SUPABASE_SERVICE_ROLE_KEY contém uma chave pública ou de usuário. Copie a chave service_role do Supabase para essa variável no Vercel Production.", 503);
    const host = new URL(url).hostname;
    if (claims?.ref && host.endsWith(".supabase.co") && host !== `${claims.ref}.supabase.co`) throw new AccountError("A chave privada pertence a outro projeto Supabase. Use a chave do mesmo projeto indicado em NEXT_PUBLIC_SUPABASE_URL.", 503);
  }
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, global: { fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(25000) }) } });
}
function unavailable(error: { code?: string }) { return ["42P01", "PGRST205"].includes(error.code ?? ""); }
function databaseFailure(error: { code?: string }, status: number, action: "consultar" | "salvar") {
  if (unavailable(error)) return new AccountError("Execute supabase/accounts.sql no SQL Editor do mesmo projeto Supabase configurado no Vercel para habilitar Contas.", 503);
  if (error.code === "42501") return new AccountError("O Supabase negou acesso à tabela de usuários. Confira a chave privada SUPABASE_SERVICE_ROLE_KEY e execute novamente supabase/accounts.sql para conceder as permissões ao servidor.", 503);
  if (status === 401 || status === 403 || error.code === "PGRST301" || error.code === "PGRST303") return new AccountError("O Supabase recusou a chave privada. Confira SUPABASE_SERVICE_ROLE_KEY do mesmo projeto no Vercel Production e publique novamente.", 503);
  if ((error.code === "42703" || error.code === "PGRST204") && /professional_registration/.test(String((error as { message?: string }).message ?? ""))) return new AccountError("Execute supabase/professional-registration-access.sql no SQL Editor para salvar as permissões do cadastro de profissionais. As contas existentes serão preservadas.", 503);
  if ((error.code === "42703" || error.code === "PGRST204") && /professional_report/.test(String((error as { message?: string }).message ?? ""))) return new AccountError("Execute supabase/professional-report-access.sql no SQL Editor para salvar as permissões do relatório profissional. As contas existentes serão preservadas.", 503);
  if (error.code === "42703" || error.code === "PGRST204") return new AccountError("A tabela de usuários está com uma estrutura diferente da esperada. Confira as colunas de avvi_user_accounts com supabase/accounts.sql.", 503);
  if (error.code === "23505") return new AccountError("Este login já está cadastrado.", 409);
  return new AccountError(`Não foi possível ${action} os usuários na nuvem. Tente novamente. Diagnóstico: HTTP ${status}.${error.code && /^(?:PGRST\d{3}|[A-Z0-9]{5})$/.test(error.code) ? ` Código: ${error.code}.` : ""}`, 503);
}
async function storedAccounts(allowUnprepared = false): Promise<StoredAccount[]> {
  if (accountStorageMode() === "local") { try { return JSON.parse(await readFile(localFile(), "utf8")); } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return []; throw error; } }
  if (allowUnprepared && !process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) return [];
  const { data, error, status } = await cloud().from("avvi_user_accounts").select("*").order("login");
  if (error) { if (allowUnprepared && unavailable(error)) return []; throw databaseFailure(error, status, "consultar"); }
  return data as StoredAccount[];
}
export async function findAccount(idOrLogin: string) { const stored = await storedAccounts(true), all = stored.some(item => item.id === builtin.id) ? stored : [...stored, builtin]; return all.find(item => item.id === idOrLogin || item.login === idOrLogin); }
export async function authenticateManaged(login: string, password: string): Promise<AppUser | null> {
  const account = await findAccount(login.trim().toLowerCase()); if (!account || password.length > 256) return null;
  const hash = scryptSync(password, account.salt, 64); return timingSafeEqual(hash, Buffer.from(account.password_hash, "hex")) ? accountUser(account) : null;
}
export async function listAccounts(): Promise<{ accounts: ManagedAccount[]; mode: string; editable: boolean; message?: string }> {
  let stored: StoredAccount[] = [], editable = true, message: string | undefined;
  try { stored = await storedAccounts(); } catch (error) { if (!(error instanceof AccountError)) throw error; editable = false; message = error.message; stored = await storedAccounts(true); }
  const all = stored.some(item => item.id === builtin.id) ? stored : [...stored, builtin];
  return { accounts: [primary, ...all.map(item => ({ ...accountUser(item), id: item.id, name: item.name, tabs: item.role === "admin" ? [...appTabs] : item.tabs, revision: item.version, locked: false, password: item.password_ciphertext ? decrypt(item.password_ciphertext) : item.id === builtin.id ? "avviclinica2026" : null }))], mode: accountStorageMode(), editable, message };
}
let localQueue: Promise<unknown> = Promise.resolve();
export async function saveAccount(input: { id?: string; login?: string; name?: string; password?: string; role?: AppRole; tabs?: unknown; revision?: number; professionalAccess?: unknown; professionalReport?: unknown; professionalRegistration?: unknown }) {
  if (input.id === primary.id || (typeof input.login === "string" && input.login.trim().toLowerCase() === "admin")) throw new AccountError("O administrador principal é fixo e não pode ser alterado.", 403);
  if (typeof input.login !== "string" || typeof input.name !== "string" || (input.password !== undefined && typeof input.password !== "string") || (input.id !== undefined && typeof input.id !== "string")) throw new AccountError("Informe nome, login e senha válidos.");
  const operation = async () => {
    const stored = await storedAccounts(), current = input.id ? stored.find(item => item.id === input.id) ?? (input.id === builtin.id ? builtin : undefined) : undefined;
    if (input.id && !current) throw new AccountError("Usuário não encontrado.", 404);
    if (current && input.revision !== current.version) throw new AccountError("Este usuário foi alterado em outra janela. Atualize a lista e tente novamente.", 409);
    const login = input.login?.trim().toLowerCase() ?? "", name = input.name?.trim() ?? "";
    if (!/^[a-z0-9][a-z0-9._@-]{2,63}$/.test(login)) throw new AccountError("Use um login de 3 a 64 caracteres, com letras, números, ponto, hífen ou @.");
    if (!name || name.length > 100) throw new AccountError("Informe um nome de até 100 caracteres.");
    if (!["admin", "standard"].includes(input.role ?? "")) throw new AccountError("Selecione o perfil do usuário.");
    const all = stored.some(item => item.id === builtin.id) ? stored : [...stored, builtin];
    if (all.some(item => item.login === login && item.id !== current?.id)) throw new AccountError("Este login já está cadastrado.", 409);
    const password = input.password ?? "";
    if ((!current && password.length < 8) || (password && (password.length < 8 || password.length > 256))) throw new AccountError("A senha deve ter de 8 a 256 caracteres.");
    if (!Array.isArray(input.tabs) || input.tabs.some(tab => typeof tab !== "string" || !appTabs.includes(tab as typeof appTabs[number]))) throw new AccountError("Permissões inválidas.");
    const tabs = input.role === "admin" ? [...appTabs] : [...new Set(input.tabs as string[])];
    const validateScope = (value: unknown) => {
      if (value === null) return null;
      const scope = value as { professionalIds?: unknown };
      if (!scope || typeof scope !== "object" || !Array.isArray(scope.professionalIds) || !scope.professionalIds.length || scope.professionalIds.length > 500 || scope.professionalIds.some(id => typeof id !== "string" || !id.trim() || id.length > 150)) throw new AccountError("Selecione pelo menos um profissional para o acesso limitado.");
      return { professionalIds: [...new Set(scope.professionalIds as string[])] };
    };
    let scope: { professionalIds: string[] } | null = null;
    if (input.role !== "admin" && professionalAccessTabs.some(tab => tabs.includes(tab))) {
      if (input.professionalAccess !== undefined) scope = validateScope(input.professionalAccess);
      else if (input.professionalReport !== undefined || input.professionalRegistration !== undefined) {
        const report = input.professionalReport === undefined ? current?.professional_report ?? null : input.professionalReport;
        const registration = input.professionalRegistration === undefined ? current?.professional_registration ?? null : input.professionalRegistration;
        // Combine legacy fields without expanding an existing restriction.
        scope = professionalScope({ login, role: "standard", professionalReport: validateScope(report) ?? undefined, professionalRegistration: validateScope(registration) ?? undefined });
        if (scope && !scope.professionalIds.length) throw new AccountError("As seleções antigas não têm um profissional em comum. Escolha os profissionais para o acesso unificado.");
      } else scope = current ? professionalScope(accountUser(current)) : null;
    }
    // Reuse the existing report column; no additional database migration. Mirror
    // the old registration column only when it already exists on the stored row.
    const professionalReport = scope, professionalRegistration = scope;
    const salt = password ? randomBytes(16).toString("hex") : current!.salt;
    const row: StoredAccount = { id: current?.id ?? randomUUID(), login, name, role: input.role!, tabs, professional_report: professionalReport as StoredAccount["professional_report"], ...(current && "professional_registration" in current ? { professional_registration: professionalRegistration as StoredAccount["professional_registration"] } : {}), salt, password_hash: password ? scryptSync(password, salt, 64).toString("hex") : current!.password_hash, password_ciphertext: password ? encrypt(password) : current!.password_ciphertext ?? (current?.id === builtin.id ? encrypt("avviclinica2026") : null), version: (current?.version ?? 0) + 1 };
    await persistAccount(row, current, stored);
    return accountUser(row);
  };
  if (accountStorageMode() !== "local") return operation();
  const pending = localQueue.then(operation); localQueue = pending.catch(() => undefined); return pending;
}

async function persistAccount(row: StoredAccount, current: StoredAccount | undefined, stored: StoredAccount[]) {
  if (accountStorageMode() === "local") {
    const next = [...stored.filter(item => item.id !== row.id), row], file = localFile();
    await mkdir(path.dirname(file), { recursive: true });
    const temporary = file + "." + randomUUID() + ".tmp";
    await writeFile(temporary, JSON.stringify(next), { mode: 0o600 }); await rename(temporary, file);
  } else {
    const db = cloud(), exists = stored.some(item => item.id === row.id);
    const query = exists ? db.from("avvi_user_accounts").update({ ...row, updated_at: new Date().toISOString() }).eq("id", row.id).eq("version", current!.version) : db.from("avvi_user_accounts").insert(row);
    const { data, error, status } = await query.select("id");
    if (error) throw databaseFailure(error, status, "salvar");
    if (!data?.length) throw new AccountError("Esta conta foi alterada em outra janela. Entre novamente.", 409);
  }
}
export async function changeOwnPassword(user: AppUser, currentPassword: string, newPassword: string) {
  if (user.login === "admin" || user.id === primary.id) throw new AccountError("O administrador principal é fixo e não pode ser alterado.", 403);
  if (typeof currentPassword !== "string" || !currentPassword || currentPassword.length > 256 || typeof newPassword !== "string" || newPassword.length < 8 || newPassword.length > 256) throw new AccountError("Informe a senha atual e uma nova senha de 8 a 256 caracteres.");
  const operation = async () => {
    const stored = await storedAccounts(), current = stored.find(item => item.id === user.id) ?? (user.id === builtin.id ? builtin : undefined);
    if (!current || current.login !== user.login || current.version !== user.revision || current.role !== user.role) throw new AccountError("Autentique-se novamente.", 401);
    if (!canAccessTab(accountUser(current), "Contas")) throw new AccountError("Acesso a Contas não autorizado.", 403);
    const hash = scryptSync(currentPassword, current.salt, 64);
    if (!timingSafeEqual(hash, Buffer.from(current.password_hash, "hex"))) throw new AccountError("Senha atual incorreta.", 401);
    const salt = randomBytes(16).toString("hex");
    const row: StoredAccount = { ...current, salt, password_hash: scryptSync(newPassword, salt, 64).toString("hex"), password_ciphertext: encrypt(newPassword), version: current.version + 1 };
    // Only credential fields and the session version change; permissions remain exact.
    await persistAccount(row, current, stored);
    return accountUser(row);
  };
  if (accountStorageMode() !== "local") return operation();
  const pending = localQueue.then(operation); localQueue = pending.catch(() => undefined); return pending;
}
