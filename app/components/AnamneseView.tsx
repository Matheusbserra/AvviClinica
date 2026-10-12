"use client";
import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import Image from "next/image";
import { Plus, History, Save, Download, Eye, Pencil, Camera } from "lucide-react";
import type { AnamneseRecord, Patient, Professional } from "@/lib/types";
import type { AppUser } from "@/lib/access";
import { clinicalPages, initialClinicalAnswers, toxinMuscles, validAnamnese } from "@/lib/anamnese";
import type { ClinicalField } from "@/lib/anamnese";
import { exportAnamnese } from "@/lib/anamnesePdf";
import { SearchSelect } from "./SearchSelect";
import { ClinicalDialog } from "./ClinicalDialog";
import { ClinicalDrawing } from "./ClinicalDrawing";
import { PatientPhotos } from "./PatientPhotos";
const today=()=>new Date().toLocaleDateString("sv-SE");
export function AnamneseView({ user, patients, professionals, records, setRecords, onPatientChange }: { user: AppUser; patients: Patient[]; professionals: Professional[]; records: AnamneseRecord[]; setRecords: Dispatch<SetStateAction<AnamneseRecord[]>>; onPatientChange: (patient:Patient)=>void }) {
 const [patientId,setPatientId]=useState("");const [professionalId,setProfessionalId]=useState("");const [draft,setDraft]=useState<AnamneseRecord|null>(null);const [original,setOriginal]=useState("");const [readOnly,setReadOnly]=useState(false);const [step,setStep]=useState(0);const [error,setError]=useState("");const [busy,setBusy]=useState(false);const [photos,setPhotos]=useState(false);
 const patient=patients.find(p=>p.id===(draft?.patientId||patientId));const selectedProfessional=professionals.find(p=>p.id===professionalId);
 const history=records.filter(record=>record.professionalId===professionalId&&(!patientId||record.patientId===patientId)).sort((a,b)=>b.date.localeCompare(a.date)||b.createdAt.localeCompare(a.createdAt));
 function open(record:AnamneseRecord,view=false){setDraft(structuredClone(record));setOriginal(JSON.stringify(record));setReadOnly(view);setStep(0);setError("");}
 function create(professionalId:string){setProfessionalId(professionalId);if(!patient){setError("Selecione o paciente para criar a anamnese.");return;}const now=new Date().toISOString(),author={login:user.login,name:user.name||user.login};open({id:`anamnese-${crypto.randomUUID()}`,patientId:patient.id,professionalId,date:today(),templateVersion:1,answers:initialClinicalAnswers(patient),createdAt:now,updatedAt:now,createdBy:author,updatedBy:author});}
 function answer(key:string,value:string|string[]){if(draft)setDraft({...draft,answers:{...draft.answers,[key]:value}});}
 function close(){if(!readOnly&&draft&&JSON.stringify(draft)!==original&&!window.confirm("Descartar as alterações desta ficha?"))return;setDraft(null);setError("");}
 function save(){if(!draft||!validAnamnese(draft)){setError("Confira a data, os valores e as prioridades da ficha.");return;}const author={login:user.login,name:user.name||user.login},next={...draft,updatedAt:new Date().toISOString(),updatedBy:author};setRecords(current=>[...current.filter(record=>record.id!==next.id),next]);setDraft(null);setError("");}
 async function download(record:AnamneseRecord){setBusy(true);setError("");try{await exportAnamnese(record,professionals.find(p=>p.id===record.professionalId)?.name||"Profissional");}catch(e){setError(e instanceof Error?e.message:"Não foi possível exportar a ficha.");}finally{setBusy(false);}}
 function input(field: ClinicalField) {
  if (!draft) return null;
  const raw = draft.answers[field.id], value = typeof raw === "string" ? raw : "", array = Array.isArray(raw) ? raw : [];
  const attrs = { "aria-label": field.label, disabled: readOnly };
  const boxClass = "h-4 w-4 shrink-0 accent-[#b8862b]";
  if (field.type === "rank") return <fieldset>
   <legend className="mb-3 text-xs font-semibold text-slate-600">{field.label} <strong className="font-bold text-slate-800">&quot;Opcional&quot;</strong></legend>
   <div className="grid gap-2 sm:grid-cols-2">{field.options!.map((option, index) => <div key={option} className="flex items-center justify-between gap-3 rounded bg-slate-50 p-2 text-xs">
    <span>{option}</span><div className="flex shrink-0 gap-2">{["1", "2", "3"].map(rank => <label key={rank} className="flex cursor-pointer items-center gap-1.5">
     <input type="checkbox" aria-label={`Prioridade ${rank}: ${option}`} disabled={readOnly} checked={array[index] === rank} className={boxClass} onChange={event => {
      const next = field.options!.map((_, i) => array[i] || "");
      if (event.target.checked) for (let i = 0; i < next.length; i++) if (next[i] === rank) next[i] = "";
      next[index] = event.target.checked ? rank : "";
      answer(field.id, next);
     }}/>{rank}
    </label>)}</div>
   </div>)}</div>
  </fieldset>;
  if (field.type === "choice" || field.type === "checks") return <fieldset>
   <legend className="mb-2 text-xs font-semibold text-slate-600">{field.label}</legend>
   <div className="flex flex-wrap gap-2">{field.options!.map(option => {
    const checked = field.type === "checks" ? array.includes(option) : value === option;
    return <label key={option} className={`flex cursor-pointer items-center gap-2 rounded border px-2.5 py-2 text-xs ${checked ? "border-avvi-blue bg-avvi-soft text-avvi-blue" : "border-avvi-line text-slate-600"}`}>
     <input type="checkbox" aria-label={field.type === "checks" ? option : `${field.label}: ${option}`} disabled={readOnly} checked={checked} className={boxClass} onChange={event => answer(field.id,
      field.type === "checks" ? (event.target.checked ? [...array, option] : array.filter(item => item !== option)) : (event.target.checked ? option : "")
     )}/>{option}
    </label>;
   })}</div>
  </fieldset>;
  return <label className="block text-xs font-semibold text-slate-600"><span>{field.label}</span>
   {field.type === "area" ? <textarea {...attrs} className="input mt-1 min-h-24 resize-y" value={value} onChange={event => answer(field.id, event.target.value)}/> : <input {...attrs} className="input mt-1" type={field.type === "number" ? "number" : field.type === "date" ? "date" : "text"} min={field.type === "number" ? 0 : undefined} step={field.type === "number" ? "any" : undefined} value={value} onChange={event => answer(field.id, event.target.value)}/>}
   {field.type === "signature" && <div className="mt-2"><ClinicalDrawing label={`Desenhar ${field.label}`} value={String(draft.answers[`${field.id}Image`] || "")} onChange={value => answer(`${field.id}Image`, value)} readOnly={readOnly}/></div>}
  </label>;
 }
 function sectionInputs(section: (typeof clinicalPages)[number]["sections"][number]) {
  if (section.rows) {
   const fields = new Map(section.fields.map(field => [field.id, field]));
   const column = (ids?: string[]) => <div className="min-w-0 space-y-4">{ids?.map(id => <div key={id}>{input(fields.get(id)!)}</div>)}</div>;
   return <div className="space-y-4">{section.rows.map((row, index) => row.full ? <div key={index}>{column(row.full)}</div> : <div key={index} className="grid items-start gap-4 sm:grid-cols-2">{column(row.left)}{column(row.right)}</div>)}</div>;
  }
  return <div className="grid gap-4 sm:grid-cols-2">{section.fields.map(field => <div key={field.id} className={["area", "signature", "rank", "checks"].includes(field.type || "") ? "sm:col-span-2" : ""}>{input(field)}</div>)}{step === 4 && <p className="rounded bg-avvi-soft p-3 text-sm sm:col-span-2">Total: <strong>{toxinMuscles.reduce((sum, _, index) => sum + Number(draft?.answers[`toxin${index}`] || 0), 0)} Un</strong></p>}</div>;
 }
 return <div className="space-y-4"><section className="rounded-xl bg-white p-4 shadow-panel"><label className="block max-w-xl text-xs font-semibold text-slate-600">Paciente<SearchSelect label="Paciente da anamnese" options={patients} value={patientId} onChange={value=>{setPatientId(value);setError("");}}/></label>{patient&&<button type="button" onClick={()=>setPhotos(true)} className="mt-3 flex items-center gap-1 rounded border border-avvi-line px-3 py-2 text-xs font-semibold text-avvi-blue"><Camera size={15}/>Mais fotos · {patient.photos?.length??0}</button>}{error&&!draft&&<p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}</section>
  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{professionals.map(professional=><article key={professional.id} className={`rounded-xl border bg-white p-4 shadow-panel ${professionalId===professional.id?"border-avvi-blue":"border-white"}`}><button type="button" onClick={()=>setProfessionalId(professional.id)} aria-label={`Anamneses de ${professional.name}`} className="flex w-full items-center gap-3 text-left">{professional.avatarDataUrl?<Image unoptimized src={professional.avatarDataUrl} alt="" width={40} height={40} className="h-10 w-10 rounded-full object-cover"/>:<span className="flex h-10 w-10 items-center justify-center rounded-full bg-avvi-soft font-bold text-avvi-blue">{professional.name.slice(0,1)}</span>}<div><strong className="text-sm">{professional.name}</strong><p className="text-xs text-slate-400">{records.filter(record=>record.professionalId===professional.id&&(!patientId||record.patientId===patientId)).length} ficha(s)</p></div></button><div className="mt-4 flex gap-2"><button type="button" onClick={()=>create(professional.id)} className="flex items-center gap-1 rounded bg-avvi-blue px-3 py-2 text-xs font-bold text-white"><Plus size={14}/>Nova anamnese</button><button type="button" onClick={()=>setProfessionalId(professional.id)} className="flex items-center gap-1 rounded border border-avvi-line px-3 py-2 text-xs text-slate-600"><History size={14}/>Histórico</button></div></article>)}</div>
  {selectedProfessional&&<section className="rounded-xl bg-white p-4 shadow-panel"><h3 className="mb-3 font-bold">Histórico · {selectedProfessional.name}</h3>{!history.length?<p className="p-6 text-center text-sm text-slate-500">Nenhuma anamnese cadastrada.</p>:history.map(record=><article key={record.id} className="flex flex-wrap items-center justify-between gap-3 border-b border-avvi-line py-3"><div><strong className="text-sm">{String(record.answers.name||patients.find(p=>p.id===record.patientId)?.name||"Paciente")}</strong><p className="mt-1 text-xs text-slate-500">{record.date.split("-").reverse().join("/")} · Registrado por {record.createdBy.name} · Atualizado por {record.updatedBy.name}</p></div><div className="flex gap-3 text-xs font-semibold text-avvi-blue"><button type="button" onClick={()=>open(record,true)} className="flex items-center gap-1"><Eye size={15}/>Ver ficha</button><button type="button" onClick={()=>open(record)} className="flex items-center gap-1"><Pencil size={15}/>Editar</button><button type="button" disabled={busy} onClick={()=>void download(record)} className="flex items-center gap-1"><Download size={15}/>Exportar PDF</button></div></article>)}</section>}
  {draft&&<ClinicalDialog title="Ficha de Harmonização Facial – Anamnese" contentKey={step} onClose={close} footer={<><span className="text-xs text-slate-500">Página {step+1} de 5</span><div className="flex flex-wrap gap-2"><button type="button" disabled={step===0} onClick={()=>setStep(step-1)} className="rounded border px-3 py-2 text-xs disabled:opacity-30">Anterior</button><button type="button" disabled={step===4} onClick={()=>setStep(step+1)} className="rounded border px-3 py-2 text-xs disabled:opacity-30">Próxima</button><button type="button" disabled={busy} onClick={()=>void download(draft)} className="flex items-center gap-1 rounded border border-avvi-line px-3 py-2 text-xs font-semibold text-avvi-blue"><Download size={14}/>{busy?"Exportando…":"Exportar PDF"}</button>{!readOnly&&<button type="button" onClick={save} className="flex items-center gap-1 rounded bg-avvi-blue px-3 py-2 text-xs font-bold text-white"><Save size={14}/>Salvar anamnese</button>}</div></>}>
   <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div><strong className="text-sm">{patient?.name}</strong><p className="text-xs text-slate-500">{professionals.find(p=>p.id===draft.professionalId)?.name}</p></div><button type="button" onClick={()=>setPhotos(true)} className="flex items-center gap-1 text-xs font-semibold text-avvi-blue"><Camera size={15}/>Mais fotos</button><label className="text-xs">Data da ficha<input aria-label="Data da ficha" type="date" disabled={readOnly} className="input mt-1" value={draft.date} onChange={event=>setDraft({...draft,date:event.target.value})}/></label></div>
   <nav aria-label="Páginas da anamnese" className="mb-5 flex flex-wrap gap-1">{clinicalPages.map((page,index)=><button type="button" key={page.title} aria-pressed={step===index} onClick={()=>setStep(index)} className={`rounded px-3 py-2 text-xs font-semibold ${step===index?"bg-avvi-blue text-white":"bg-slate-50 text-slate-600"}`}>{index+1}. {page.title}</button>)}</nav>
   {clinicalPages[step].sections.map(section=><section key={section.title} className="mb-5 rounded-lg border border-avvi-line p-4"><h3 className="mb-4 text-sm font-bold text-avvi-blue">{section.title}</h3>{section.declaration&&<p className="mb-4 text-xs leading-6 text-slate-600">{section.declaration}</p>}{step===3&&<div className="mb-4"><ClinicalDrawing background={section.image} label="Marcações do planejamento facial" value={String(draft.answers.planningImage||"")} onChange={value=>answer("planningImage",value)} readOnly={readOnly}/></div>}<div className={step===4?"grid gap-5 md:grid-cols-[1fr_280px]":""}>{sectionInputs(section)}{step===4&&section.image&&<Image unoptimized src={section.image} alt="Anatomia facial da ficha original" width={350} height={490} className="w-full self-start object-contain"/>}</div></section>)}
   {error&&<p role="alert" className="text-sm text-red-600">{error}</p>}
  </ClinicalDialog>}
  {photos&&patient&&<PatientPhotos patient={patient} onChange={onPatientChange} onClose={()=>setPhotos(false)}/>}
 </div>;
}
