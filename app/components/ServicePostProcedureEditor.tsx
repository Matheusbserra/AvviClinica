"use client";
import { useState } from "react";
import type { PostProcedurePlan, Service } from "@/lib/types";
import { postProcedureReactivationDays, postProcedureTemplatePlan, postProcedureTemplates, servicePostProcedurePlan } from "@/lib/postProcedure";

export function ServicePostProcedureEditor({ service, onChange }: { service: Service; onChange: (plan: PostProcedurePlan) => void }) {
  const [open, setOpen] = useState(false);
  const plan = servicePostProcedurePlan(service);
  const update = (patch: Partial<PostProcedurePlan>) => onChange({ ...plan, ...patch });
  const reactivations = postProcedureReactivationDays(plan);
  const updateReactivations = (days: number[]) => update({ reactivationDays: days[0] ?? plan.reactivationDays, reactivationDaysList: days });
  return <section className="mt-5 rounded-xl border border-avvi-line p-4">
    <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="flex w-full items-center justify-between gap-2 text-left font-bold text-avvi-blue">Pós-procedimento <span className="text-xs">{plan.enabled ? "Ativo" : "Desativado"} · {open ? "Recolher" : "Configurar"}</span></button>
    {open && <div className="mt-4 space-y-4">
      <p className="text-xs leading-5 text-slate-600">Os dias contam da realização do serviço, em dias corridos. Revise as sugestões com a profissional. Alterações recalculam as etapas pendentes; datas ajustadas manualmente e contatos concluídos são preservados.</p>
      {!service.postProcedure && plan.enabled && <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">Sugestão identificada pelo nome do serviço. Confira os prazos antes de utilizar.</p>}
      <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={plan.enabled} onChange={e => update({ enabled: e.target.checked })} className="accent-[#b8862b]"/>Ativar pós-procedimento para este serviço</label>
      <label className="block text-xs font-semibold">Aplicar sugestão por procedimento<select aria-label="Aplicar sugestão de pós-procedimento" className="input mt-1" value="" onChange={e => { if (e.target.value) onChange(postProcedureTemplatePlan(e.target.value as keyof typeof postProcedureTemplates)); }}><option value="">Escolher sugestão</option>{Object.entries(postProcedureTemplates).map(([key, item]) => <option key={key} value={key}>{item.label}</option>)}</select></label>
      <div className="grid gap-3 sm:grid-cols-2">
        {([["firstContactDays", "Primeiro contato (dias)"], ["satisfactionDays", "Resultado e satisfação (dias)"]] as const).map(([key, label]) => <label key={key} className="block text-xs font-semibold">{label}<input aria-label={label} type="number" min={1} max={730} step={1} required className="input mt-1" value={plan[key] || ""} onChange={e => update({ [key]: Number(e.target.value) })}/></label>)}
        <div><p className="text-xs font-semibold">Acompanhamentos (dias)</p><div className="mt-1 flex flex-wrap gap-2">{plan.followUpDays.map((day, index) => <div key={index} className="flex items-center gap-1"><input aria-label={`Acompanhamento ${index + 1} (dias)`} type="number" min={1} max={730} step={1} required className="input w-20" value={day || ""} onChange={e => update({ followUpDays: plan.followUpDays.map((n, i) => i === index ? Number(e.target.value) : n) })}/><button type="button" aria-label={`Remover acompanhamento ${index + 1}`} onClick={() => update({ followUpDays: plan.followUpDays.filter((_, i) => i !== index) })} className="p-2 text-red-600">×</button></div>)}</div><button type="button" disabled={plan.followUpDays.length >= 12} onClick={() => update({ followUpDays: [...plan.followUpDays, Math.min(730, (plan.followUpDays.at(-1) ?? plan.firstContactDays) + 7)] })} className="mt-2 text-xs font-bold text-avvi-blue">+ Acompanhamento</button></div>
        <div><p className="text-xs font-semibold">Reativações (dias)</p><div className="mt-1 flex flex-wrap gap-2">{reactivations.map((day, index) => <div key={index} className="flex items-center gap-1"><input aria-label={index ? `Reativação ${index + 1} (dias)` : "Reativação (dias)"} type="number" min={1} max={730} step={1} required className="input w-20" value={day || ""} onChange={event => updateReactivations(reactivations.map((n, i) => i === index ? Number(event.target.value) : n))}/><button type="button" aria-label={`Remover reativação ${index + 1}`} onClick={() => updateReactivations(reactivations.filter((_, i) => i !== index))} className="p-2 text-red-600">×</button></div>)}</div><button type="button" disabled={reactivations.length >= 12} onClick={() => updateReactivations([...reactivations, Math.min(730, (reactivations.at(-1) ?? 30) + 30)])} className="mt-2 text-xs font-bold text-avvi-blue">+ Reativação</button></div>
      </div>
      <p className="text-xs text-slate-500">Reativação convida para nova avaliação. O prazo não indica que o mesmo procedimento já pode ser repetido.</p>
    </div>}
  </section>;
}
