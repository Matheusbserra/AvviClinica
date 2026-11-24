"use client";
import {useEffect,useRef,useState} from "react";
import {Plus,X} from "lucide-react";
import {currency} from "@/lib/calculations";
import {currentInvoiceMonth,invoiceMonthLabel,invoiceMonthlyGroups,invoiceRows} from "@/lib/invoices";

export function InvoicePicker({rows,listed,onAdd,onClose}:{rows:ReturnType<typeof invoiceRows>;listed:Set<string>;onAdd:(id:string)=>void;onClose:()=>void}) {
 const dialog=useRef<HTMLDialogElement>(null);
 const [month,setMonth]=useState(currentInvoiceMonth),[query,setQuery]=useState(""),[professional,setProfessional]=useState("");
 useEffect(()=>{const element=dialog.current;element?.showModal();return()=>element?.close();},[]);
 const months=invoiceMonthlyGroups(rows).map(group=>({month:group.month,label:group.label}));
 if(month&&!months.some(item=>item.month===month)){months.push({month,label:invoiceMonthLabel(month)});months.sort((a,b)=>b.month.localeCompare(a.month));}
 const professionals=[...new Map(rows.map(row=>[row.professional!.id,row.professional!])).values()].sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"));
 const filtered=rows.filter(row=>(!month||row.date.slice(0,7)===month)&&(!professional||row.professional?.id===professional)&&[row.patient?.name,row.patient?.cpf,row.professional?.name,...row.lines.map(line=>line.name)].join(" ").toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")));
 return <dialog ref={dialog} aria-labelledby="invoice-picker-title" onCancel={onClose} onClick={event=>{if(event.target===event.currentTarget)onClose();}} className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-4xl overflow-y-auto rounded-xl bg-white p-0 text-avvi-ink shadow-panel backdrop:bg-black/50">
  <div className="p-4 sm:p-5"><header className="flex items-center justify-between gap-3"><h2 id="invoice-picker-title" className="font-bold">Adicionar notas</h2><button type="button" aria-label="Fechar adicionar notas" onClick={onClose} className="rounded-lg p-2 hover:bg-slate-100"><X size={20}/></button></header>
   <p className="mt-2 text-sm text-slate-600">Escolha o fechamento de qualquer profissional para adicionar à lista de notas fiscais.</p>
   <div className="my-4 grid gap-3 sm:grid-cols-3"><label className="text-xs text-slate-600">Mês<select autoFocus aria-label="Mês dos fechamentos" className="input mt-1" value={month} onChange={event=>setMonth(event.target.value)}><option value="">Todos os meses</option>{months.map(item=><option key={item.month} value={item.month}>{item.label}</option>)}</select></label><label className="text-xs text-slate-600">Profissional<select aria-label="Profissional dos fechamentos" className="input mt-1" value={professional} onChange={event=>setProfessional(event.target.value)}><option value="">Todas as profissionais</option>{professionals.map(item=><option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label className="text-xs text-slate-600">Buscar<input aria-label="Buscar fechamento" className="input mt-1" placeholder="Paciente, CPF ou serviço" value={query} onChange={event=>setQuery(event.target.value)}/></label></div>
   <p className="mb-3 text-xs text-slate-500">{filtered.length} fechamento(s)</p>
   <div className="space-y-3">{filtered.map(row=><article key={row.appointment.id} data-testid={`invoice-choice-${row.appointment.id}`} className="rounded-lg border border-avvi-line p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 break-words"><strong>{row.patient?.name??"Paciente"}</strong><p className="mt-1 text-xs text-slate-600">{row.date.split("-").reverse().join("/")} · {row.professional?.name}</p><p className="mt-2 text-sm">{row.lines.map(line=>`${line.name}${line.quantity>1?` × ${line.quantity}`:""}`).join(" · ")}</p><p className="mt-2 text-sm font-bold">{currency(row.total)}</p></div><button type="button" aria-label={`Adicionar nota de ${row.patient?.name} em ${row.date}`} disabled={listed.has(row.appointment.id)} onClick={()=>onAdd(row.appointment.id)} className="flex items-center gap-1 rounded-lg border border-avvi-line px-3 py-2 text-xs font-bold text-avvi-blue disabled:cursor-default disabled:opacity-50"><Plus size={14}/>{listed.has(row.appointment.id)?"Já na lista":"Adicionar nota"}</button></div></article>)}{!filtered.length&&<p className="rounded-lg border border-dashed border-avvi-line p-8 text-center text-sm text-slate-500">Nenhum fechamento neste filtro.</p>}</div>
   <footer className="mt-4 flex justify-end"><button type="button" onClick={onClose} className="rounded-lg border border-avvi-line px-4 py-2 text-sm font-bold">Concluir</button></footer>
  </div>
 </dialog>;
}
