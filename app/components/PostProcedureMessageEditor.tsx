"use client";
import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { RotateCcw, Save } from "lucide-react";
import type { PostProcedureMessage, PostProcedureMessageStage } from "@/lib/types";
import { addPostProcedureDays, postProcedureDay, postProcedureDefaultMessages, postProcedureMessage, postProcedureMessageDraft, postProcedureMessageStages, postProcedureMessageVariables, savePostProcedureMessages, validPostProcedureMessage } from "@/lib/postProcedure";
import { ClinicalDialog } from "./ClinicalDialog";

export function PostProcedureMessageEditor({ messages, setMessages, onClose }: { messages: PostProcedureMessage[]; setMessages: Dispatch<SetStateAction<PostProcedureMessage[]>>; onClose: () => void }) {
  const [initial] = useState(() => postProcedureMessageDraft(messages));
  const [draft, setDraft] = useState(initial), [stage, setStage] = useState<PostProcedureMessageStage>("first"), [error, setError] = useState("");
  const today = postProcedureDay(), label = postProcedureMessageStages.find(item => item.id === stage)!.label;
  const preview = postProcedureMessage({ id: "example", appointmentId: "example", patientId: "example", serviceId: "example", professionalId: "example", patientName: "Maria", serviceName: "Botox, Preenchimento labial", professionalName: "Profissional da clínica", phone: "", performedOn: addPostProcedureDays(today, -7), dueDate: today, scheduledDate: today, stage, label, status: "Aguardando contato" }, [{ id: stage, template: draft[stage], updatedAt: today }], today);
  function save() {
    const at = new Date().toISOString(), invalid = postProcedureMessageStages.find(item => !validPostProcedureMessage({ id: item.id, template: draft[item.id], updatedAt: at }));
    if (invalid) { setStage(invalid.id); setError("Preencha a mensagem e use somente as variáveis indicadas, entre chaves. Limite de 5.000 caracteres."); return; }
    setMessages(current => savePostProcedureMessages(current, initial, draft, at)); onClose();
  }
  return <ClinicalDialog title="Editar mensagens do WhatsApp" onClose={onClose}><form onSubmit={event => { event.preventDefault(); save(); }} className="space-y-4">
    <p className="text-sm text-slate-600">Defina a mensagem de cada etapa. Os textos salvos serão usados nos botões de WhatsApp do pós-procedimento para todos os usuários autorizados da clínica.</p>
    <label className="block text-xs font-semibold">Etapa da mensagem<select aria-label="Etapa da mensagem" className="input mt-1" value={stage} onChange={event => { setStage(event.target.value as PostProcedureMessageStage); setError(""); }}>{postProcedureMessageStages.map(item => <option key={item.id} value={item.id}>{item.label}</option>)}</select></label>
    <label className="block text-xs font-semibold">Mensagem · {label}<textarea aria-label="Texto da mensagem do WhatsApp" className="input mt-1 min-h-40" maxLength={5000} value={draft[stage]} onChange={event => { setDraft({ ...draft, [stage]: event.target.value }); setError(""); }}/></label>
    <p className="text-xs text-slate-500">Variáveis preenchidas automaticamente: {postProcedureMessageVariables.map(variable => `{${variable}}`).join(" · ")}. A data é a realização do procedimento; os dias são contados até a data de referência selecionada.</p>
    <button type="button" onClick={() => { setDraft({ ...draft, [stage]: postProcedureDefaultMessages[stage] }); setError(""); }} className="flex items-center gap-2 rounded-lg border border-avvi-line px-3 py-2 text-xs font-bold text-avvi-blue"><RotateCcw size={14}/>Restaurar padrão desta etapa</button>
    <div className="rounded-xl border border-avvi-line bg-slate-50 p-3"><h3 className="text-xs font-bold">Prévia com dados de exemplo</h3><p data-testid="post-message-preview" className="mt-2 whitespace-pre-wrap break-words text-sm">{draft[stage].trim() ? preview : "Digite uma mensagem para visualizar."}</p></div>
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
    <div className="flex flex-wrap gap-2"><button type="submit" className="flex items-center gap-2 rounded-lg bg-avvi-blue px-4 py-2 text-sm font-bold text-white"><Save size={16}/>Salvar mensagens</button><button type="button" onClick={onClose} className="rounded-lg border border-avvi-line px-4 py-2 text-sm">Cancelar</button></div>
    <p className="text-xs text-slate-500">Salvar atualiza os textos das quatro etapas. Acompanhe a confirmação de salvamento no topo do sistema. A mensagem só será enviada quando você confirmar no WhatsApp.</p>
  </form></ClinicalDialog>;
}
