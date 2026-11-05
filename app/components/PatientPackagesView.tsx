"use client";
import type { Appointment, Patient } from "@/lib/types";
import { patientActivePackages } from "@/lib/packageSessions";

export function PatientPackagesView({patient,appointments,today}:{patient:Patient;appointments:Appointment[];today:string}) {
  const packages=patientActivePackages(patient,appointments,today);
  const date=(value:string)=>value.split("-").reverse().join("/");
  return <section aria-label="Pacotes ativos do paciente" data-testid="patient-active-packages" className="mt-4 space-y-3">
    <h4 className="font-bold">Pacotes ativos ({packages.length})</h4>
    {!packages.length && <p className="rounded-lg bg-avvi-soft p-4 text-sm text-slate-500">Nenhum pacote ativo com sessões disponíveis.</p>}
    {packages.map(pack=><article key={pack.id} className="rounded-xl border border-avvi-line p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><h5 className="font-bold">{pack.name}</h5><span className="rounded-full bg-avvi-soft px-2 py-1 text-xs text-avvi-blue">{pack.imported?"Sistema anterior":"Venda no sistema"}</span></div>
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2"><div><dt className="text-xs text-slate-500">Data da venda</dt><dd>{date(pack.purchasedOn)}</dd></div><div><dt className="text-xs text-slate-500">Validade</dt><dd>{pack.expiresOn?date(pack.expiresOn):"Sem prazo de validade"}</dd></div>{pack.professionalName&&<div><dt className="text-xs text-slate-500">Profissional</dt><dd>{pack.professionalName}</dd></div>}</dl>
      <ul className="mt-3 space-y-1">{pack.items.map((item,index)=><li key={index} className="flex items-center justify-between gap-3 rounded-lg bg-avvi-soft p-3 text-sm"><span>{item.name}</span><strong className="shrink-0 text-avvi-blue">{item.remaining} {item.remaining===1?"sessão":"sessões"}</strong></li>)}</ul>
    </article>)}
  </section>;
}
