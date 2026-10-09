import { appointmentServices } from "./appointmentServices";
import { validateConversationFlow } from "./conversationFlow";
import type { Appointment, Patient, Service, Professional, FollowUpRule, FollowUpContact, FollowUpLog } from "./types";

export const followUpLabels = { keyword: "Palavra-chave", appointment_before: "Antes do agendamento", appointment_after: "Depois do atendimento", scheduled: "Data e horário", inactivity: "Sem resposta do cliente" };
export const followUpVariables = ["{nome}", "{primeiro_nome}", "{servico}", "{profissional}", "{data}", "{hora}", "{clinica}"];
export function saoPauloInput(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(date).map((part) => [part.type, part.value]));
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
export function localToInstant(value: string) { return new Date(`${value}:00-03:00`).toISOString(); }
export function followUpDate(value: string) { return value ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—"; }
export function newFollowUpRule(): FollowUpRule { return { id: "", name: "", active: false, trigger: "keyword", keywords: [], match: "contains", delayMinutes: 0, scheduledAt: "", patientIds: [], message: "Olá, {primeiro_nome}! Como podemos ajudar?", messageType: "text", templateName: "", templateLanguage: "pt_BR", templateParameters: [] }; }
export const followUpModels: { title: string; description: string; rule: FollowUpRule }[] = [
  { title: "Primeiro contato", description: "Responder quando alguém perguntar preço ou valor.", rule: { ...newFollowUpRule(), name: "Interesse em serviços", keywords: ["preço", "valor", "orçamento"], message: "Olá, {primeiro_nome}! Obrigada pelo contato com a {clinica}. Qual serviço você gostaria de conhecer? Nossa equipe vai te ajudar." } },
  { title: "Lembrete da consulta", description: "Avisar o paciente 24 horas antes do agendamento.", rule: { ...newFollowUpRule(), name: "Lembrete de agendamento", trigger: "appointment_before", delayMinutes: 1440, messageType: "template", message: "Olá, {primeiro_nome}! Sua consulta de {servico} com {profissional} está agendada para {data}, às {hora}. Podemos confirmar sua presença?" } },
  { title: "Depois do atendimento", description: "Entrar em contato um dia depois do atendimento concluído.", rule: { ...newFollowUpRule(), name: "Como foi seu atendimento?", trigger: "appointment_after", delayMinutes: 1440, messageType: "template", message: "Olá, {primeiro_nome}! Como foi seu atendimento na {clinica}? Se precisar de ajuda, nossa equipe está à disposição." } },
  { title: "Retomar conversa", description: "Retornar duas horas depois da última mensagem do cliente.", rule: { ...newFollowUpRule(), name: "Retomar contato", trigger: "inactivity", delayMinutes: 120, message: "Olá, {primeiro_nome}! Ficou alguma dúvida? Podemos ajudar por aqui." } }
];
export function normalizedPhone(value: string) {
  let digits = value.replace(/\D/g, "");
  if (!value.trim().startsWith("+") && (digits.length === 10 || digits.length === 11)) digits = `55${digits}`;
  return /^\d{10,15}$/.test(digits) ? digits : "";
}
export function keywordMatches(text: string, rule: FollowUpRule) {
  const normalize = (value: string) => value.toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
  const input = normalize(text);
  return rule.keywords.filter((keyword) => keyword.trim()).some((keyword) => rule.match === "exact" ? input === normalize(keyword) : input.includes(normalize(keyword)));
}
export function validateFollowUpRule(rule: FollowUpRule, publish = false): string {
  if (!rule.name.trim()) return "Informe o nome da automação.";
  if (!Object.keys(followUpLabels).includes(rule.trigger)) return "Selecione um gatilho válido.";
  if (rule.flow) { const error = validateConversationFlow(rule.flow, publish); if (error) return error; }
  if (!rule.flow && (!rule.message.trim() || rule.message.length > 4096)) return "Escreva uma mensagem com até 4.096 caracteres.";
  if (!Number.isInteger(rule.delayMinutes) || rule.delayMinutes < 0 || rule.delayMinutes > 525600) return "Confira o intervalo: use até 365 dias.";
  if (rule.trigger === "keyword" && !rule.keywords.some((keyword) => keyword.trim())) return "Adicione pelo menos uma palavra-chave.";
  if (rule.trigger === "inactivity" && rule.delayMinutes < 1) return "Informe um intervalo maior que zero.";
  if (rule.trigger === "scheduled" && (!rule.scheduledAt || !Number.isFinite(Date.parse(rule.scheduledAt)) || !rule.patientIds.length)) return "Escolha a data, o horário e pelo menos um paciente.";
  if (!rule.flow && publish && rule.messageType === "template" && !/^[a-z0-9_]+$/.test(rule.templateName)) return "Informe o nome exato do modelo aprovado no WhatsApp.";
  if (!rule.flow && publish && rule.messageType === "text" && rule.trigger !== "keyword" && (rule.trigger !== "inactivity" || rule.delayMinutes >= 1440)) return "Use um modelo aprovado para mensagens que podem ocorrer fora da janela de 24 horas.";
  if (publish && rule.flow && rule.trigger !== "keyword" && (rule.trigger !== "inactivity" || rule.delayMinutes >= 1440)) {
    const entry = rule.flow.nodes.find((node) => node.id === rule.flow!.entry);
    if (entry?.type !== "message" || entry.messageType !== "template") return "Inicie este fluxo com um modelo aprovado e aguarde a resposta antes de enviar texto ou imagem.";
  }
  return "";
}
export type FollowUpContext = { patients: Patient[]; appointments: Appointment[]; services: Service[]; professionals: Professional[]; contacts: FollowUpContact[] };
export type FollowUpCandidate = Omit<FollowUpLog, "status"> & { allowed: boolean; reason: string; rule: FollowUpRule; templateParameters: string[] };
export function renderFollowUp(message: string, patient: Patient, appointment: Appointment | undefined, context: FollowUpContext) {
  const date = appointment?.startsAt.slice(0, 10).split("-").reverse().join("/") ?? "";
  const values: Record<string, string> = { nome: patient.name, primeiro_nome: patient.name.trim().split(/\s+/)[0] || patient.name,
    servico: (appointment ? appointmentServices(appointment, context.services).map((service) => service.name).join(", ") : "") || "consulta",
    profissional: context.professionals.find((professional) => professional.id === appointment?.professionalId)?.name ?? "nossa equipe",
    data: date, hora: appointment?.startsAt.slice(11, 16) ?? "", clinica: "AvviClínica" };
  return message.replace(/\{([a-z_]+)\}/g, (original, key: string) => values[key] ?? original);
}
export function followUpCandidates(rules: FollowUpRule[], context: FollowUpContext, now: Date, incoming?: { patientId: string; text: string; at: string; id: string }): FollowUpCandidate[] {
  const result: FollowUpCandidate[] = [];
  for (const rule of rules.filter((item) => item.active && !validateFollowUpRule(item))) {
    const add = (patient: Patient, at: string, source: string, appointment?: Appointment) => {
      const contact = context.contacts.find((item) => item.id === patient.id);
      const phone = normalizedPhone(patient.phone);
      const reason = !phone ? "Paciente sem telefone válido." : !contact?.optIn ? "Recebimento de mensagens não autorizado pelo paciente." : "";
      result.push({ id: `${rule.id}:${source}:${patient.id}:${at}`, ruleId: rule.id, ruleName: rule.name, patientId: patient.id, patientName: patient.name, phone,
        message: renderFollowUp(rule.message, patient, appointment, context), scheduledFor: at, createdAt: now.toISOString(), sourceId: source,
        allowed: !reason, reason, rule, templateParameters: rule.templateParameters.map((value) => renderFollowUp(value, patient, appointment, context)) });
    };
    if (rule.trigger === "keyword" && incoming && keywordMatches(incoming.text, rule)) {
      const patient = context.patients.find((item) => item.id === incoming.patientId);
      if (patient && Number.isFinite(Date.parse(incoming.at))) add(patient, new Date(Date.parse(incoming.at) + rule.delayMinutes * 60000).toISOString(), incoming.id);
    } else if (rule.trigger === "scheduled") {
      for (const patient of context.patients.filter((item) => rule.patientIds.includes(item.id))) add(patient, rule.scheduledAt, "date");
    } else if (rule.trigger === "inactivity") {
      for (const contact of context.contacts.filter((item) => item.lastInboundAt && Number.isFinite(Date.parse(item.lastInboundAt)))) {
        const patient = context.patients.find((item) => item.id === contact.id);
        if (patient) add(patient, new Date(Date.parse(contact.lastInboundAt!) + rule.delayMinutes * 60000).toISOString(), `inbound-${contact.lastInboundAt}`);
      }
    } else if (rule.trigger === "appointment_before" || rule.trigger === "appointment_after") {
      for (const appointment of context.appointments) {
        if (["Cancelado", "Faltou", "Reagendado"].includes(appointment.status)) continue;
        if (rule.trigger === "appointment_after" && appointment.status !== "Finalizado") continue;
        if (rule.trigger === "appointment_before" && appointment.status === "Finalizado") continue;
        const patient = context.patients.find((item) => item.id === appointment.patientId);
        const base = rule.trigger === "appointment_before" ? appointment.startsAt : appointment.endsAt;
        if (!Number.isFinite(Date.parse(/[Zz]|[+-]\d{2}:\d{2}$/.test(base) ? base : `${base}-03:00`))) continue;
        const at = new Date(Date.parse(/[Zz]|[+-]\d{2}:\d{2}$/.test(base) ? base : `${base}-03:00`) + (rule.trigger === "appointment_before" ? -1 : 1) * rule.delayMinutes * 60000).toISOString();
        // Ignore historical appointments when enabling a rule; don't send a backlog of old reminders.
        if (patient && Date.parse(at) >= now.getTime() - 300000) add(patient, at, `appointment-${appointment.id}-${base}`, appointment);
      }
    }
  }
  return result.sort((a, b) => a.scheduledFor.localeCompare(b.scheduledFor));
}
