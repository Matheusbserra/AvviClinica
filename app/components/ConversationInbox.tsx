"use client";
import { useEffect, useRef, useState } from "react";
import { CheckCheck, GripVertical, Inbox, MessageCircle, RefreshCw, Search } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { leadStages, patientForLead, stageForLead } from "@/lib/leadFunnel";
import { followUpDate } from "@/lib/followUp";
import type { Appointment, FollowUpLead, FollowUpMessage, Patient } from "@/lib/types";
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("");
function MessageHistory({ lead }: { lead: FollowUpLead }) {
  const [messages, setMessages] = useState<FollowUpMessage[]>([]);
  const [error, setError] = useState(""); const [busy, setBusy] = useState(false); const [hasMore, setHasMore] = useState(false);
  const [refresh, setRefresh] = useState(0); const [before, setBefore] = useState("");
  const list = useRef<HTMLDivElement>(null); const followLatest = useRef(true);
  const anchor = useRef<{ height: number; top: number } | null>(null); const initialized = useRef(false);
  useEffect(() => {
    let active = true; const abort = new AbortController();
    async function load(older = false) {
      const session = await supabase?.auth.getSession(); if (!active) return;
      setBusy(true);
      try {
        const query = new URLSearchParams({ leadId: lead.id }); if (older && before) query.set("before", before);
        const response = await fetch(`/api/follow-up/messages?${query}`, { headers: { ...(session?.data.session ? { Authorization: `Bearer ${session.data.session.access_token}` } : {}) }, signal: abort.signal });
        const data = await response.json(); if (!response.ok) throw new Error(data.error); if (!active) return;
        setMessages((current) => [...new Map([...current, ...data.messages].map((message) => [message.id, message])).values()].sort((a, b) => a.at.localeCompare(b.at) || a.id.localeCompare(b.id)));
        if (!initialized.current || older) setHasMore(data.hasMore); initialized.current = true; setError("");
      } catch (failure) { if (active) setError((failure as Error).message); } finally { if (active) setBusy(false); }
    }
    const initial = setTimeout(() => { void load(Boolean(before)); }, 0);
    const timer = setInterval(() => { void load(); }, 15000);
    return () => { active = false; abort.abort(); clearTimeout(initial); if (timer) clearInterval(timer); };
  }, [lead.id, refresh, before]);
  useEffect(() => {
    const element = list.current; if (!element) return;
    if (anchor.current) { element.scrollTop = anchor.current.top + element.scrollHeight - anchor.current.height; anchor.current = null; }
    else if (followLatest.current) element.scrollTop = element.scrollHeight;
  }, [messages]);
  return <><div className="flex items-center justify-between border-b bg-white/80 px-4 py-2"><span className="text-[10px] text-slate-500">Mensagens recebidas e respostas da clínica</span><button aria-label="Atualizar mensagens desta conversa" disabled={busy} onClick={() => { setBefore(""); setRefresh((value) => value + 1); }} className="rounded p-1 text-slate-500 disabled:opacity-40"><RefreshCw size={14} className={busy ? "animate-spin" : ""} /></button></div>
    {error && <p role="alert" className="bg-red-50 px-4 py-2 text-xs text-red-600">{error}</p>}
    <div ref={list} data-testid="whatsapp-messages" role="log" aria-label="Mensagens da conversa" aria-live="polite" onScroll={() => { const element = list.current; if (element) followLatest.current = element.scrollHeight - element.scrollTop - element.clientHeight < 60; }} className="min-h-0 flex-1 space-y-3 overflow-y-auto bg-[#efeae2] bg-[radial-gradient(#d9d2c6_1px,transparent_1px)] p-4 [background-size:20px_20px]">
      {hasMore && <button disabled={busy} onClick={() => { const element = list.current; if (element) anchor.current = { height: element.scrollHeight, top: element.scrollTop }; followLatest.current = false; setBefore(messages[0]?.id ?? ""); }} className="mx-auto block rounded-full bg-white px-3 py-1.5 text-[11px] font-semibold text-green-800 disabled:opacity-40">Carregar mensagens anteriores</button>}
      {messages.map((message) => <div key={message.id} data-testid={`chat-message-${message.id}`} data-direction={message.direction} className={`w-fit max-w-[88%] rounded-xl px-3 py-2 text-xs leading-5 shadow-sm ${message.direction === "outgoing" ? "ml-auto rounded-tr-sm bg-[#d9fdd3]" : "mr-auto rounded-tl-sm bg-white"}`}><p className="whitespace-pre-wrap break-words">{message.text}</p><span className="mt-1 flex items-center justify-end gap-1 text-[9px] text-slate-500">{followUpDate(message.at)}{message.direction === "outgoing" && <CheckCheck size={13} aria-label={message.status === "read" ? "Lida" : message.status === "delivered" ? "Entregue" : "Enviada"} className={message.status === "read" ? "text-blue-500" : "text-slate-400"} />}</span></div>)}
      {!messages.length && <p className="rounded-xl bg-white/90 p-4 text-center text-xs text-slate-500">{busy ? "Carregando conversa…" : "As mensagens desta conversa aparecerão aqui."}</p>}
    </div><footer className="border-t bg-[#f0f2f5] px-4 py-3 text-[10px] leading-4 text-slate-500">Conversa sincronizada com o WhatsApp da clínica.</footer></>;
}
export function ConversationInbox({ leads, selectedId, select, patients, appointments, now, saving, dragEnd }: { leads: FollowUpLead[]; selectedId: string | null; select: (id: string) => void; patients: Patient[]; appointments: Appointment[]; now: Date; saving: boolean; dragEnd: () => void }) {
  const [search, setSearch] = useState(""); const panel = useRef<HTMLElement>(null);
  const selected = leads.find((lead) => lead.id === selectedId);
  const filtered = leads.filter((lead) => `${patientForLead(lead, patients)?.name || lead.name} ${lead.phone} ${lead.lastMessage}`.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR"))).slice().sort((a, b) => b.lastContactAt.localeCompare(a.lastContactAt));
  useEffect(() => { if (selectedId) panel.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }); }, [selectedId]);
  const name = (lead: FollowUpLead) => patientForLead(lead, patients)?.name || lead.name;
  const stage = selected ? leadStages.find((item) => item.id === stageForLead(selected, patients, appointments, now)) : undefined;
  return <section ref={panel} aria-label="Conversas do WhatsApp" className="overflow-hidden rounded-2xl border border-avvi-line bg-white shadow-panel"><header className="flex flex-wrap items-center justify-between gap-2 border-b bg-[#f0f2f5] px-4 py-3"><h3 className="flex items-center gap-2 text-sm font-bold"><MessageCircle size={20} className="text-green-700" />WhatsApp Business</h3><p className="text-[11px] text-slate-500">Arraste uma conversa para uma das etapas do funil acima.</p></header>
    <div className="grid min-h-[420px] grid-cols-1 md:h-[500px] md:grid-cols-[minmax(240px,34%)_minmax(0,1fr)]">
      <aside aria-label="Lista de conversas" className="flex max-h-[260px] min-h-0 flex-col border-b md:max-h-none md:border-b-0 md:border-r"><div className="relative shrink-0 border-b p-3"><Search size={15} className="absolute left-6 top-6 text-slate-400" /><input aria-label="Buscar conversa na lista do WhatsApp" placeholder="Pesquisar conversa" className="input pl-9 text-xs" value={search} onChange={(event) => setSearch(event.target.value)} /></div><div className="min-h-0 flex-1 overflow-y-auto">
        {filtered.map((lead) => { const currentStage = leadStages.find((item) => item.id === stageForLead(lead, patients, appointments, now))!; return <article key={lead.id} data-testid={`inbox-conversation-${lead.id}`} draggable={!saving} onDragStart={(event) => { event.dataTransfer.setData("text/avvi-lead", lead.id); event.dataTransfer.effectAllowed = "move"; }} onDragEnd={dragEnd} className={`cursor-grab border-b border-slate-100 active:cursor-grabbing ${selectedId === lead.id ? "bg-[#f0f2f5]" : "hover:bg-slate-50"}`}><button aria-label={`Abrir conversa com ${name(lead)}`} onClick={() => select(lead.id)} className="flex w-full items-start gap-3 p-3 text-left"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 text-sm font-bold text-green-800">{initials(name(lead))}</span><span className="min-w-0 flex-1"><strong className="block truncate text-xs">{name(lead)}</strong><span className="mt-1 block truncate text-[11px] text-slate-500">{lead.lastMessage}</span><span className="mt-1.5 inline-block rounded-full px-2 py-0.5 text-[9px]" style={{ background: `${currentStage.color}18`, color: currentStage.color }}>{currentStage.title}</span></span><GripVertical size={13} className="shrink-0 text-slate-300" /></button></article>; })}
        {!filtered.length && <div className="flex flex-col items-center p-8 text-center"><Inbox size={28} className="mb-3 text-slate-300" /><p className="text-xs font-semibold text-slate-500">{search ? "Nenhuma conversa encontrada" : "Ainda não há conversas"}</p><p className="mt-2 text-[11px] leading-5 text-slate-400">As conversas recebidas aparecerão aqui após conectar o WhatsApp.</p></div>}
      </div></aside>
      <div aria-label="Conversa aberta" className="flex h-[420px] min-w-0 flex-col md:h-full">{selected ? <><header className="flex items-center gap-3 border-b bg-[#f0f2f5] p-3"><span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-green-100 text-sm font-bold text-green-800">{initials(name(selected))}</span><div className="min-w-0 flex-1"><h4 className="truncate text-sm font-bold">{name(selected)}</h4><p className="mt-0.5 text-[10px] text-slate-500">{selected.phone}</p></div><span className="max-w-[40%] rounded-full px-2 py-1 text-[9px] font-semibold" style={{ background: `${stage?.color}18`, color: stage?.color }}>{stage?.title}</span></header><MessageHistory key={selected.id} lead={selected} /></> : <div className="flex h-full flex-col items-center justify-center border-b-4 border-green-600 bg-[#f0f2f5] p-8 text-center"><MessageCircle size={54} strokeWidth={1} className="mb-5 text-slate-300" /><h4 className="text-lg font-semibold text-slate-600">Conversas da clínica</h4><p className="mt-3 max-w-sm text-xs leading-6 text-slate-500">Selecione uma conversa na lista à esquerda para acompanhar as mensagens aqui.</p></div>}</div>
    </div>
  </section>;
}
