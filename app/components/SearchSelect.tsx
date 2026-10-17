"use client";
import { useId, useState } from "react";
import { Search } from "lucide-react";
import { matchesSearch } from "@/lib/search";
export function SearchSelect({label, options, value, onChange, inlineResults = false}: {label: string; options: {id: string; name: string}[]; value: string; onChange: (id: string) => void; inlineResults?: boolean}) {
  const [query, setQuery] = useState(""); const [open, setOpen] = useState(false); const [index, setIndex] = useState(0); const id=useId();
  const selected=options.find(option=>option.id===value);
  const matches=options.filter(option=>matchesSearch(option.name,query)).sort((a,b)=>a.name.localeCompare(b.name,"pt-BR"));
  function select(option: {id: string; name: string}) {onChange(option.id);setQuery(option.name);setOpen(false);}
  return <div className="relative mt-1 min-w-0" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node))setOpen(false);}}>
    <Search size={15} className="pointer-events-none absolute left-3 top-3 text-slate-400"/>
    <input role="combobox" aria-label={label} aria-expanded={open} aria-controls={id} aria-autocomplete="list" aria-activedescendant={open&&matches[index]?`${id}-${index}`:undefined} autoComplete="off" placeholder="Digite para buscar" className="input pl-9" value={value?selected?.name??query:query} onFocus={()=>{setQuery("");setIndex(0);setOpen(true);}} onChange={event=>{setQuery(event.target.value);onChange("");setIndex(0);setOpen(true);}} onKeyDown={event=>{if(event.key==="Escape"){event.preventDefault();setOpen(false);}if(event.key==="ArrowDown"||event.key==="ArrowUp"){event.preventDefault();setOpen(true);setIndex(old=>Math.max(0,Math.min(matches.length-1,old+(event.key==="ArrowDown"?1:-1))));}if(event.key==="Enter"&&open){event.preventDefault();if(matches[index])select(matches[index]);}}}/>
    {open&&<div id={id} role="listbox" aria-label={`Resultados de ${label}`} className={`${inlineResults ? "relative mt-2 max-h-[min(20rem,40dvh)] overscroll-contain" : "absolute z-20 mt-1 max-h-48"} w-full overflow-y-auto rounded-lg border border-avvi-line bg-white p-1 shadow-lg`}>{matches.length?matches.map((option,i)=><button type="button" role="option" aria-selected={value===option.id} id={`${id}-${i}`} key={option.id} onMouseDown={event=>event.preventDefault()} onClick={()=>select(option)} className={`block w-full whitespace-normal break-words rounded text-left ${inlineResults ? "p-3 text-sm leading-relaxed" : "p-2 text-xs"} ${i===index?"bg-avvi-soft":"hover:bg-slate-50"}`}>{option.name}</button>):<p className="p-2 text-xs text-slate-500">Nenhum resultado encontrado.</p>}</div>}
  </div>;
}
