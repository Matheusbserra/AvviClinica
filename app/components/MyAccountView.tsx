"use client";
import { tabLabel } from "@/lib/access";
import { useEffect, useState } from "react";
import { KeyRound, ShieldCheck, Save } from "lucide-react";
import type { AppUser } from "@/lib/access";
import { professionalScope } from "@/lib/access";
import type { Professional } from "@/lib/types";
import { ClinicalDialog } from "./ClinicalDialog";

export function MyAccountView({ professionals, onPasswordChanged }: { professionals: Professional[]; onPasswordChanged: (user: AppUser) => Promise<void> }) {
  const [account, setAccount] = useState<AppUser | null>(null), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [open, setOpen] = useState(false), [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/accounts", { cache: "no-store", signal: controller.signal }).then(async response => {
      const data = await response.json(); if (!response.ok || !data.account) throw new Error(data.error ?? "Não foi possível consultar sua conta.");
      if (!controller.signal.aborted) setAccount(data.account);
    }).catch(error => { if (!controller.signal.aborted) setError(error.message); });
    return () => controller.abort();
  }, []);
  async function save() {
    if (form.newPassword.length < 8 || form.newPassword.length > 256) { setError("A nova senha deve ter de 8 a 256 caracteres."); return; }
    if (form.newPassword !== form.confirmPassword) { setError("A confirmação da nova senha não confere."); return; }
    setSaving(true); setError("");
    try {
      const response = await fetch("/api/accounts/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const data = await response.json(); if (!response.ok || !data.user) throw new Error(data.error ?? "Não foi possível alterar a senha.");
      await onPasswordChanged(data.user);
      setAccount(data.user); setOpen(false); setForm({ currentPassword: "", newPassword: "", confirmPassword: "" }); setNotice("Senha alterada com sucesso.");
    } catch (error) { setError((error as Error).message); } finally { setSaving(false); }
  }
  const scope = account ? professionalScope(account) : null;
  return <div className="space-y-3">
    {!account && !error && <p role="status" className="p-4 text-sm text-slate-500">Carregando sua conta…</p>}
    {notice && <p role="status" className="rounded-lg bg-green-50 p-3 text-sm text-green-700">{notice}</p>}
    {error && !open && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    {account && <section aria-label={`Conta ${account.login}`} className="rounded-xl bg-white p-4 shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="flex items-center gap-2"><ShieldCheck size={19} className="text-avvi-blue"/><h3 className="font-bold">{account.name || account.login}</h3><span className="rounded-full bg-avvi-soft px-2 py-1 text-[10px] font-bold text-avvi-blue">Usuário padrão</span></div><p className="mt-2 text-sm text-slate-600">Login: <strong>{account.login}</strong></p></div><button type="button" onClick={() => { setError(""); setNotice(""); setForm({ currentPassword: "", newPassword: "", confirmPassword: "" }); setOpen(true); }} className="flex items-center gap-2 rounded-lg border border-avvi-line px-3 py-2 text-xs font-bold text-avvi-blue"><KeyRound size={15}/>Alterar senha</button></div>
      <div className="mt-3 flex flex-wrap gap-1.5">{account.tabs?.map(tab => <span key={tab} className="rounded bg-avvi-soft px-2 py-1 text-[10px] text-slate-600">✓ {tabLabel(tab)}</span>)}</div>
      {scope && <p className="mt-3 text-xs text-slate-600">Profissionais autorizados: {scope.professionalIds.map(id => professionals.find(item => item.id === id)?.name ?? "Profissional autorizado").join(", ") || "Nenhum profissional autorizado"}.</p>}
    </section>}
    {open && <ClinicalDialog title="Alterar senha" onClose={() => { if (!saving) { setOpen(false); setError(""); } }} footer={<button type="button" disabled={saving} onClick={save} className="flex items-center gap-2 rounded-lg bg-avvi-blue px-4 py-2 text-sm font-bold text-white disabled:opacity-40"><Save size={16}/>{saving ? "Salvando…" : "Salvar nova senha"}</button>}>
      <form onSubmit={event => { event.preventDefault(); if (!saving) void save(); }} className="grid gap-3 sm:grid-cols-2"><label className="text-xs font-semibold text-slate-600 sm:col-span-2">Senha atual<input aria-label="Senha atual" type="password" autoComplete="current-password" maxLength={256} disabled={saving} className="input mt-1" value={form.currentPassword} onChange={event => setForm({ ...form, currentPassword: event.target.value })}/></label><label className="text-xs font-semibold text-slate-600">Nova senha<input aria-label="Nova senha" type="password" autoComplete="new-password" minLength={8} maxLength={256} disabled={saving} className="input mt-1" value={form.newPassword} onChange={event => setForm({ ...form, newPassword: event.target.value })}/></label><label className="text-xs font-semibold text-slate-600">Confirmar nova senha<input aria-label="Confirmar nova senha" type="password" autoComplete="new-password" maxLength={256} disabled={saving} className="input mt-1" value={form.confirmPassword} onChange={event => setForm({ ...form, confirmPassword: event.target.value })}/></label><button type="submit" className="sr-only" tabIndex={-1} disabled={saving}>Confirmar alteração</button></form>
      {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
    </ClinicalDialog>}
  </div>;
}
