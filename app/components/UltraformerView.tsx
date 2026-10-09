"use client";
import { Fragment, useEffect, useId, useState } from "react";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import { ChevronDown, History, Pencil, X, Zap } from "lucide-react";
import { availableUltraformerTips, isUltraformerTip, remainingShots, recordUltraformerUsage } from "@/lib/ultraformer";
import type { AppUser } from "@/lib/access";
import type { Patient, Professional, UltraformerTip } from "@/lib/types";

const number = (value: number) => value.toLocaleString("pt-BR");
const localDate = () => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`; };
type Editor = { id: string; name: string; depth: string; kind: UltraformerTip["kind"]; color: string; quantity: string };
export function TipIcon({ tip }: { tip: Pick<UltraformerTip, "color" | "kind" | "depth"> }) {
  const id = useId();
  return <svg viewBox="0 0 80 80" width="60" height="60" aria-hidden="true" className="ultraformer-icon shrink-0" style={tip.kind === "linear" ? { transform: "rotate(90deg)" } : undefined}>
    <defs><linearGradient id={`${id}-body`} x1="0" x2="1" y1="0" y2="1"><stop stopColor="#fff"/><stop offset=".55" stopColor="#f1f3f5"/><stop offset="1" stopColor="#ccd2d9"/></linearGradient></defs>
    {tip.kind === "booster" ? <g>
      <ellipse cx="40" cy="72" rx="15" ry="3" fill="#0f172a" opacity=".07"/>
      <rect x="38" y="7" width="4" height="9" rx="2" fill="#7b8590"/>
      <path d="M29 16 Q40 12 51 16 L50 63 Q50 70 40 70 Q30 70 30 63Z" fill={`url(#${id}-body)`} stroke="#d4d9df"/>
      <path d="M30 53 Q40 56 50 53 L50 62 Q40 66 30 62Z" fill={tip.color}/>
      <path d="M34 19 L34 51" stroke="#fff" strokeWidth="3" strokeLinecap="round"/>
      <text x="40" y="35" textAnchor="middle" fontSize="5" fill={tip.color} fontWeight="700">BOOSTER</text>
      <text x="40" y="43" textAnchor="middle" fontSize="6" fill="#6b7280">{tip.depth.replace(" mm", "")}</text>
    </g> : <g>
      <ellipse cx="38" cy="72" rx="26" ry="3" fill="#0f172a" opacity=".07"/>
      <path d="M19 48 Q22 21 45 14 L68 18 L68 35 Q53 35 44 48 L49 50 L39 68 L17 68 Q13 60 13 48Z" fill={`url(#${id}-body)`} stroke="#d4d9df" strokeLinejoin="round"/>
      <path d="M14 48 Q19 19 47 11 L43 20 Q28 41 29 48Z" fill={tip.color}/>
      <path d="M18 45 Q23 22 43 17" fill="none" stroke="#fff" opacity=".4" strokeWidth="3"/>
      <path d="M43 26 L61 26 M39 33 L61 33" stroke="#cfd5dc" strokeWidth="2" strokeLinecap="round"/>
      <path d="M14 49 L48 49" stroke="#fff" strokeWidth="2"/>
      <rect x="24" y="55" width="9" height="5" rx="1" fill={tip.color}/><text x="35" y="60" fontSize="5" fill={tip.color}>{tip.depth.replace(" mm", "")}</text>
    </g>}
  </svg>;
}
export function UltraformerView({ user, tips, setTips, patients, professionals }: {
  user: AppUser; tips: UltraformerTip[]; setTips: Dispatch<SetStateAction<UltraformerTip[]>>; patients: Patient[]; professionals: Professional[];
}) {
  const all = availableUltraformerTips(tips);
  const [usageTip, setUsageTip] = useState<string | null>(null);
  const [usage, setUsage] = useState({ quantity: "", date: localDate(), patientId: "", professionalId: "" });
  const [history, setHistory] = useState<{ id: string; page: number } | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  useEffect(() => {
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") { setHistory(null); setEditor(null); setUsageTip(null); setError(""); } };
    window.addEventListener("keydown", close); return () => window.removeEventListener("keydown", close);
  }, []);
  const rows = all;
  const historyTip = all.find(tip => tip.id === history?.id);
  const historyRows = [...(historyTip?.usages ?? [])].sort((a,b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  const pages = Math.max(1, Math.ceil(historyRows.length / 8));
  const page = Math.min(history?.page ?? 0, pages - 1);
  function edit(tip: UltraformerTip) {
    setUsageTip(null); setError(""); setNotice("");
    setEditor({ id: tip.id, name: tip.name, depth: tip.depth, kind: tip.kind, color: tip.color, quantity: String(remainingShots(tip)) });
  }
  function saveTip(event: FormEvent) {
    event.preventDefault(); if (!editor) return;
    const current = all.find(tip => tip.id === editor.id);
    const quantity = Number(editor.quantity);
    const updated: UltraformerTip = { id: editor.id, name: editor.name.trim(), depth: editor.depth.trim(), kind: editor.kind, color: editor.color, initialShots: quantity + (current?.usages.reduce((sum,row) => sum + row.quantity,0) ?? 0), usages: current?.usages ?? [] };
    if (!editor.quantity.trim() || !Number.isSafeInteger(quantity) || !isUltraformerTip(updated)) { setError("Preencha o nome e uma quantidade inteira de disparos válida."); return; }
    setTips(saved => { const latest = saved.find(tip => tip.id === updated.id); const usages = latest?.usages ?? updated.usages; const next = { ...updated, usages, initialShots: quantity + usages.reduce((sum,row) => sum+row.quantity,0) }; return saved.some(tip => tip.id === next.id) ? saved.map(tip => tip.id === next.id ? next : tip) : [...saved,next]; });
    setEditor(null); setError(""); setNotice("Ponteira atualizada.");
  }
  function recordUsage(event: FormEvent, tip: UltraformerTip) {
    event.preventDefault();
    const patient = patients.find(row => row.id === usage.patientId), professional = professionals.find(row => row.id === usage.professionalId);
    if (!patient || !professional) { setError("Selecione o paciente e a profissional."); return; }
    const entry = { registeredBy: { id: user.id ?? (user.login === "admin" ? "primary-admin" : user.login), login: user.login, name: user.name?.trim() || (user.login === "admin" ? "Administrador principal" : user.login) }, id: crypto.randomUUID(), date: usage.date, quantity: Number(usage.quantity), patientId: patient.id, patientName: patient.name, professionalId: professional.id, professionalName: professional.name, createdAt: new Date().toISOString() };
    try { recordUltraformerUsage(tip,entry); } catch (failure) { setError((failure as Error).message); return; }
    setTips(saved => { const current = saved.find(row => row.id === tip.id) ?? tip; const next = recordUltraformerUsage(current,entry); return saved.some(row => row.id === next.id) ? saved.map(row => row.id === next.id ? next : row) : [...saved,next]; });
    setUsageTip(null); setError(""); setNotice(`${number(entry.quantity)} disparos registrados em ${tip.name}.`);
  }
  return <section className="ultraformer-view flex min-h-0 flex-1 flex-col gap-2">
    <div className="grid shrink-0 grid-cols-3 gap-2">
      {[{ label: "Ponteiras", value: all.length },{ label: "Disparos disponíveis", value: all.reduce((sum,tip) => sum + remainingShots(tip),0) },{ label: "Disparos utilizados", value: all.reduce((sum,tip) => sum + tip.usages.reduce((total,row) => total + row.quantity,0),0) }].map(stat => <div key={stat.label} className="rounded-xl border border-white bg-white p-2 shadow-panel"><p className="text-[11px] text-slate-500 sm:text-xs">{stat.label}</p><strong className="mt-1 block text-lg text-avvi-blue sm:text-xl">{number(stat.value)}</strong></div>)}
    </div>
    <div className="flex min-h-0 flex-1 flex-col rounded-2xl bg-white p-2 shadow-panel sm:p-3">
      {notice && <p role="status" className="mb-2 shrink-0 rounded-lg bg-emerald-50 px-3 py-1 text-sm text-emerald-700">{notice}</p>}
      <div className="hidden shrink-0 grid-cols-[1fr_125px_165px] gap-3 border-b border-avvi-line px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400 sm:grid"><span>Ponteira</span><span>Disparos restantes</span><span className="text-right">Utilização e histórico</span></div>
      <div className="ultraformer-rows grid min-h-0 flex-1" style={{ gridTemplateRows: `repeat(${rows.length}, minmax(0, 1fr))` }}>
      {rows.map(tip => <Fragment key={tip.id}>
        <div data-testid={`ultraformer-tip-${tip.id}`} className="grid min-h-0 grid-cols-[minmax(0,1fr)_70px_75px] items-center gap-1 border-b border-avvi-line px-1 last:border-0 sm:grid-cols-[minmax(0,1fr)_125px_165px] sm:gap-3 sm:px-2">
          <div className="flex h-full min-h-0 min-w-0 items-center gap-2"><div className="ultraformer-icon-wrap rounded-lg" style={{ backgroundColor: `${tip.color}0b` }}><TipIcon tip={tip}/></div><h3 className="ultraformer-name min-w-0 font-bold">{tip.name}</h3></div>
          <div className="flex items-center gap-2"><div><strong data-testid={`shots-${tip.id}`} className={`ultraformer-balance tabular-nums ${remainingShots(tip) < 0 ? "text-red-600" : "text-avvi-ink"}`}>{number(remainingShots(tip))}</strong><span className="ml-1 text-[10px] text-slate-400 sm:hidden">disparos</span></div><button aria-label={`Editar ${tip.name}`} onClick={() => edit(tip)} className="rounded-lg p-1 text-slate-400 hover:bg-avvi-soft hover:text-avvi-blue"><Pencil size={14}/></button></div>
          <div className="flex min-h-0 items-center justify-end gap-1 sm:gap-2"><button aria-label={`Registrar disparos de ${tip.name}`} aria-expanded={usageTip === tip.id} onClick={() => { setUsageTip(usageTip === tip.id ? null : tip.id); setUsage({ quantity: "", date: localDate(), patientId: "", professionalId: "" }); setError(""); setNotice(""); }} className={`rounded-lg border p-1.5 sm:p-2 ${usageTip === tip.id ? "border-avvi-blue bg-avvi-soft text-avvi-blue" : "border-avvi-line text-slate-500 hover:bg-avvi-soft"}`}><ChevronDown size={17} className={usageTip === tip.id ? "rotate-180" : ""}/></button><button aria-label={`Histórico de ${tip.name}`} onClick={() => { setHistory({ id: tip.id, page: 0 }); setError(""); }} className="flex items-center gap-1.5 rounded-lg border border-avvi-line px-1.5 py-1.5 text-xs sm:px-2 sm:py-2 font-semibold text-slate-600 hover:bg-slate-50"><History size={15}/><span className="hidden sm:inline">Histórico</span></button></div>
        </div>
      </Fragment>)}
      </div>
        {all.filter(tip => tip.id === usageTip).map(tip => <div key={tip.id} className="fixed inset-0 z-[60] grid place-items-center bg-slate-900/40 p-3"><section role="dialog" aria-modal="true" aria-label={`Registrar utilização de ${tip.name}`} className="max-h-[90dvh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-4 shadow-panel"><form onSubmit={event => recordUsage(event,tip)} aria-label={`Registrar utilização de ${tip.name}`} className="space-y-3">
          <p className="mb-3 flex items-center gap-2 text-sm font-bold"><Zap size={16} className="text-avvi-blue"/>Registrar utilização</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-500">Disparos utilizados<input autoFocus required aria-label="Disparos utilizados" type="number" min="1" step="1" className="input mt-1" value={usage.quantity} onChange={event => setUsage({ ...usage, quantity: event.target.value })}/></label>
            <label className="text-xs font-semibold text-slate-500">Data da utilização<input required aria-label="Data da utilização" type="date" className="input mt-1" value={usage.date} onChange={event => setUsage({ ...usage, date: event.target.value })}/></label>
            <label className="text-xs font-semibold text-slate-500">Paciente<select required aria-label="Paciente da utilização" className="input mt-1" value={usage.patientId} onChange={event => setUsage({ ...usage, patientId: event.target.value })}><option value="">Selecione o paciente</option>{[...patients].sort((a,b)=>a.name.localeCompare(b.name,"pt-BR")).map(patient => <option key={patient.id} value={patient.id}>{patient.name}</option>)}</select></label>
            <label className="text-xs font-semibold text-slate-500">Profissional<select required aria-label="Profissional da utilização" className="input mt-1" value={usage.professionalId} onChange={event => setUsage({ ...usage, professionalId: event.target.value })}><option value="">Selecione a profissional</option>{[...professionals].sort((a,b)=>a.name.localeCompare(b.name,"pt-BR")).map(prof => <option key={prof.id} value={prof.id}>{prof.name}</option>)}</select></label>
          </div>
          {error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}
          <div className="mt-3 flex justify-end gap-2"><button type="button" onClick={() => { setUsageTip(null); setError(""); }} className="rounded-lg border border-avvi-line bg-white px-4 py-2 text-xs">Cancelar</button><button type="submit" className="rounded-lg bg-avvi-blue px-4 py-2 text-xs font-bold text-white">Registrar disparos</button></div>
        </form></section></div>)}
    </div>
    {editor && <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-900/40 p-3"><section role="dialog" aria-modal="true" aria-label="Dados da ponteira" className="max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-5 shadow-panel">
      <header className="mb-4 flex items-center justify-between"><h3 className="font-bold">Dados da ponteira</h3><button aria-label="Fechar edição da ponteira" onClick={() => { setEditor(null); setError(""); }} className="rounded p-1 text-slate-500"><X size={20}/></button></header>
      <form onSubmit={saveTip} className="space-y-3"><label className="block text-xs font-semibold text-slate-500">Nome<input autoFocus aria-label="Nome da ponteira" required maxLength={100} className="input mt-1" value={editor.name} onChange={event => setEditor({ ...editor, name: event.target.value })}/></label>
        <div className="grid grid-cols-2 gap-3"><label className="text-xs font-semibold text-slate-500">Modelo<select aria-label="Modelo da ponteira" className="input mt-1" value={editor.kind} onChange={event => setEditor({ ...editor, kind: event.target.value as Editor["kind"] })}><option value="linear">Ponteira maior</option><option value="booster">Skin Booster</option></select></label><label className="text-xs font-semibold text-slate-500">Profundidade<input aria-label="Profundidade da ponteira" maxLength={30} className="input mt-1" value={editor.depth} onChange={event => setEditor({ ...editor, depth: event.target.value })}/></label></div>
        <div className="grid grid-cols-[1fr_80px] items-end gap-3"><label className="text-xs font-semibold text-slate-500">Disparos disponíveis agora<input aria-label="Disparos disponíveis agora" required type="number" step="1" className="input mt-1" value={editor.quantity} onChange={event => setEditor({ ...editor, quantity: event.target.value })}/></label><label className="text-xs font-semibold text-slate-500">Cor<input aria-label="Cor da ponteira" type="color" className="mt-1 h-10 w-full cursor-pointer rounded-lg border border-avvi-line bg-white p-1" value={editor.color} onChange={event => setEditor({ ...editor, color: event.target.value })}/></label></div>
        <p className="text-xs text-slate-500">O saldo informado preserva o histórico de utilizações.</p>
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        <div className="flex justify-end"><button type="submit" className="rounded-lg bg-avvi-blue px-4 py-2.5 text-sm font-bold text-white">Salvar ponteira</button></div>
      </form></section></div>}
    {history && historyTip && <div className="fixed inset-0 z-[60] grid place-items-center bg-slate-900/40 p-3"><section role="dialog" aria-modal="true" aria-label={`Histórico de ${historyTip.name}`} className="flex max-h-[90dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-panel">
      <header className="flex items-center justify-between gap-3 border-b border-avvi-line p-4"><div className="flex items-center gap-2"><TipIcon tip={historyTip}/><div><h3 className="font-bold">Histórico · {historyTip.name}</h3><p className="mt-1 text-xs text-slate-500">{historyRows.length} registro(s) · {number(historyRows.reduce((sum,row)=>sum+row.quantity,0))} disparos utilizados</p></div></div><button aria-label="Fechar histórico" onClick={() => setHistory(null)} className="rounded p-1 text-slate-500"><X size={20}/></button></header>
      <div className="min-h-0 overflow-y-auto p-4"><div className="hidden grid-cols-[105px_1fr_75px_1fr_1fr] gap-3 border-b border-avvi-line pb-2 text-xs font-semibold text-slate-500 sm:grid"><span>Data</span><span>Paciente</span><span>Disparos</span><span>Profissional</span><span>Registrado por</span></div>
        {historyRows.slice(page*8,(page+1)*8).map(row => <div key={row.id} className="grid grid-cols-2 gap-3 border-b border-avvi-line py-3 text-sm sm:grid-cols-[105px_1fr_75px_1fr_1fr]"><div><span className="block text-[10px] text-slate-400 sm:hidden">Data</span><span>{row.date.split("-").reverse().join("/")}</span></div><div className="break-words"><span className="block text-[10px] text-slate-400 sm:hidden">Paciente</span><span>{row.patientName}</span></div><div><span className="block text-[10px] text-slate-400 sm:hidden">Disparos</span><strong>{number(row.quantity)}</strong></div><div className="break-words"><span className="block text-[10px] text-slate-400 sm:hidden">Profissional</span><span>{row.professionalName}</span></div><div className="break-words"><span className="block text-[10px] text-slate-400 sm:hidden">Registrado por</span><span>{row.registeredBy?.name ?? "Não informado"}</span>{row.registeredBy && <span className="mt-1 block text-[10px] text-slate-400">@{row.registeredBy.login}</span>}</div></div>)}
        {!historyRows.length && <p className="py-10 text-center text-sm text-slate-500">Nenhuma utilização registrada para esta ponteira.</p>}
      </div><footer className="flex items-center justify-between border-t border-avvi-line p-3 text-xs"><span>Página {page+1} de {pages}</span><div className="flex gap-2"><button disabled={!page} onClick={() => setHistory({ ...history, page: page-1 })} className="rounded border border-avvi-line px-3 py-2 disabled:opacity-30">Anterior</button><button disabled={page===pages-1} onClick={() => setHistory({ ...history, page: page+1 })} className="rounded border border-avvi-line px-3 py-2 disabled:opacity-30">Próxima</button></div></footer>
    </section></div>}
  </section>;
}
