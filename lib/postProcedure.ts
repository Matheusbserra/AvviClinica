import type { Appointment, Patient, PostProcedureContact, PostProcedureMessage, PostProcedureMessageStage, PostProcedurePlan, PostProcedureStatus, Professional, Service } from "./types";

export const postProcedureMessageStages: { id: PostProcedureMessageStage; label: string }[] = [
  { id: "first", label: "Primeiro contato" }, { id: "followup", label: "Acompanhamento" },
  { id: "satisfaction", label: "Resultado e satisfação" }, { id: "reactivation", label: "Reativação" },
];
const messageStart = "Olá, {paciente}! Aqui é da AVVI Clínica. Estamos acompanhando seu procedimento de {procedimentos}.";
const recoveryMessage = `${messageStart} Como você está se sentindo? Teve algum desconforto, alguma alteração ou dúvida sobre as orientações recebidas?`;
export const postProcedureDefaultMessages: Record<PostProcedureMessageStage, string> = {
  first: recoveryMessage, followup: recoveryMessage,
  satisfaction: `${messageStart} Como você percebe a evolução e o resultado até agora? Ficou com alguma dúvida ou algo que gostaria de conversar com a profissional?`,
  reactivation: "Olá, {paciente}! Aqui é da AVVI Clínica. Como você está? Gostaria de agendar uma nova avaliação para conversar sobre seus objetivos e os cuidados indicados para você?",
};
export const postProcedureMessageVariables = ["paciente", "procedimentos", "data", "profissionais", "etapa", "dias"] as const;
export function validPostProcedureMessage(value: unknown): value is PostProcedureMessage {
  const item = value as PostProcedureMessage | undefined;
  if (!item || !postProcedureMessageStages.some(stage => stage.id === item.id) || typeof item.template !== "string" || !item.template.trim() || item.template.length > 5000 || typeof item.updatedAt !== "string" || !Number.isFinite(Date.parse(item.updatedAt))) return false;
  return !/[{}]/.test(item.template.replace(/\{(paciente|procedimentos|data|profissionais|etapa|dias)\}/g, ""));
}
export function postProcedureMessageDraft(messages: PostProcedureMessage[]): Record<PostProcedureMessageStage, string> {
  const draft = { ...postProcedureDefaultMessages };
  for (const message of messages) if (validPostProcedureMessage(message)) draft[message.id] = message.template;
  return draft;
}
export function savePostProcedureMessages(current: PostProcedureMessage[], initial: Record<PostProcedureMessageStage, string>, draft: Record<PostProcedureMessageStage, string>, at: string) {
  const changes = postProcedureMessageStages.filter(stage => draft[stage.id] !== initial[stage.id]).map(stage => ({ id: stage.id, template: draft[stage.id], updatedAt: at }));
  if (!changes.length || !changes.every(validPostProcedureMessage)) return current;
  const records = new Map(current.map(message => [message.id, message]));
  for (const message of changes) records.set(message.id, message);
  return [...records.values()];
}

export const postProcedureStatuses: PostProcedureStatus[] = ["Aguardando contato", "Mensagem enviada", "Sem resposta", "Concluído", "Encaminhado à profissional"];
export const postProcedureTemplates = {
  custom: { label: "Personalizado", followUpDays: [7], satisfactionDays: 30 },
  toxin: { label: "Toxina botulínica", followUpDays: [7], satisfactionDays: 14 },
  filler: { label: "Preenchimento com ácido hialurônico", followUpDays: [7], satisfactionDays: 21 },
  collagen: { label: "Bioestimulador de colágeno", followUpDays: [7, 30], satisfactionDays: 90 },
  laser: { label: "Laser Lavieen", followUpDays: [10], satisfactionDays: 30 },
};
export function postProcedureTemplatePlan(key: keyof typeof postProcedureTemplates): PostProcedurePlan {
  return { enabled: true, firstContactDays: 1, followUpDays: [...postProcedureTemplates[key].followUpDays], satisfactionDays: postProcedureTemplates[key].satisfactionDays, reactivationDays: 60 };
}
export function servicePostProcedurePlan(service: Pick<Service, "name" | "postProcedure">): PostProcedurePlan {
  if (service.postProcedure) return service.postProcedure;
  const name = service.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const key = /lavieen|lavien/.test(name) ? "laser"
    : /bioestimul|sculptra|radiesse|hidroxiapatita|poli.?latico|ellanse/.test(name) ? "collagen"
    : /preench|acido hialuronico/.test(name) ? "filler"
    : /botox|toxina botulinica|dysport|xeomin|botulift|nabota/.test(name) ? "toxin" : "custom";
  return { ...postProcedureTemplatePlan(key), enabled: key !== "custom" };
}
export function validPostProcedurePlan(value: unknown): value is PostProcedurePlan {
  const plan = value as PostProcedurePlan | undefined;
  const day = (n: unknown) => Number.isSafeInteger(n) && Number(n) >= 1 && Number(n) <= 730;
  return !!plan && typeof plan.enabled === "boolean" && day(plan.firstContactDays) && day(plan.satisfactionDays) && plan.firstContactDays <= plan.satisfactionDays && day(plan.reactivationDays)
    && Array.isArray(plan.followUpDays) && plan.followUpDays.length <= 12 && plan.followUpDays.every(day)
    && new Set(plan.followUpDays).size === plan.followUpDays.length
    && (plan.reactivationDaysList === undefined || Array.isArray(plan.reactivationDaysList) && plan.reactivationDaysList.length <= 12 && plan.reactivationDaysList.every(day) && plan.reactivationDaysList.every((n, index) => !index || n > plan.reactivationDaysList![index - 1]))
    && plan.followUpDays.every((n, index) => n >= plan.firstContactDays && n <= plan.satisfactionDays && (!index || n > plan.followUpDays[index - 1]));
}
export function postProcedureReactivationDays(plan: PostProcedurePlan) { return plan.reactivationDaysList ?? [plan.reactivationDays]; }
export function validPostProcedureDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + "T12:00:00Z")) && new Date(value + "T12:00:00Z").toISOString().slice(0, 10) === value;
}
export function postProcedureDay(date = new Date()) {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}
export function addPostProcedureDays(date: string, days: number) {
  const time = new Date(date + "T12:00:00Z"); time.setUTCDate(time.getUTCDate() + days); return time.toISOString().slice(0, 10);
}
export function postProcedureElapsedDays(performedOn: string, reference = postProcedureDay()) {
  if (!validPostProcedureDate(performedOn) || !validPostProcedureDate(reference)) return null;
  return Math.round((Date.parse(reference + "T12:00:00Z") - Date.parse(performedOn + "T12:00:00Z")) / 86400000);
}
export const postProcedureId = (appointmentId: string, serviceId: string, stage: string) => JSON.stringify([appointmentId, serviceId, stage]);
export function validPostProcedureContact(value: unknown): value is PostProcedureContact {
  const item = value as PostProcedureContact | undefined;
  return !!item && [item.id, item.appointmentId, item.patientId, item.serviceId, item.stage].every(s => typeof s === "string" && s.length > 0 && s.length <= 1500)
    && /^(first|followup-\d{1,2}|satisfaction|reactivation(?:-\d{1,2})?)$/.test(item.stage) && item.id === postProcedureId(item.appointmentId, item.serviceId, item.stage)
    && postProcedureStatuses.includes(item.status) && typeof item.response === "string" && item.response.length <= 5000
    && (item.rescheduled === undefined || typeof item.rescheduled === "boolean")
    && (item.dueDate === undefined || validPostProcedureDate(item.dueDate)) && typeof item.updatedAt === "string" && Number.isFinite(Date.parse(item.updatedAt))
    && Array.isArray(item.history) && item.history.length <= 100 && item.history.every(h => h && typeof h.at === "string" && Number.isFinite(Date.parse(h.at)) && typeof h.by === "string" && h.by.length <= 200 && postProcedureStatuses.includes(h.status) && typeof h.response === "string" && h.response.length <= 5000 && (h.dueDate === undefined || validPostProcedureDate(h.dueDate)));
}
export type PostProcedureTask = {
  id: string; appointmentId: string; patientId: string; serviceId: string; stage: string; label: string;
  performedOn: string; scheduledDate: string; dueDate: string; patientName: string; phone: string; professionalId: string; professionalName: string;
  serviceName: string; status: PostProcedureStatus; contact?: PostProcedureContact;
};
export function groupPostProcedurePatients(tasks: PostProcedureTask[]) {
  const patients = new Map<string, { patientId: string; patientName: string; tasks: PostProcedureTask[] }>();
  for (const task of tasks) {
    let patient = patients.get(task.patientId);
    if (!patient) { patient = { patientId: task.patientId, patientName: task.patientName, tasks: [] }; patients.set(task.patientId, patient); }
    patient.tasks.push(task);
  }
  return [...patients.values()].map(patient => ({ ...patient, procedureCount: new Set(patient.tasks.map(task => JSON.stringify([task.appointmentId, task.serviceId]))).size }));
}
export type PostProcedureDayContact = { id: string; patientId: string; patientName: string; performedOn: string; stage: string; label: string; tasks: PostProcedureTask[]; dueDates: string[]; status: PostProcedureStatus | "" };
export function groupPostProcedureDays(tasks: PostProcedureTask[]): PostProcedureDayContact[] {
  const groups = new Map<string, PostProcedureTask[]>();
  for (const task of tasks) {
    // Separate repeated follow-up/reactivation stages even when the treatment date is the same.
    const key = JSON.stringify([task.patientId, task.performedOn, task.stage]);
    const group = groups.get(key) ?? []; group.push(task); groups.set(key, group);
  }
  return [...groups].map(([id, items]) => ({ id, patientId: items[0].patientId, patientName: items[0].patientName, performedOn: items[0].performedOn, stage: items[0].stage, label: items[0].label, tasks: items,
    dueDates: [...new Set(items.map(task => task.dueDate))].sort(), status: items.every(task => task.status === items[0].status) ? items[0].status : "" }));
}
export function postProcedureDayMessage(tasks: PostProcedureTask[], messages: PostProcedureMessage[] = [], reference = postProcedureDay()) {
  if (!tasks.length) return "";
  return postProcedureMessage({ ...tasks[0], serviceName: [...new Set(tasks.map(task => task.serviceName))].join(", "), professionalName: [...new Set(tasks.map(task => task.professionalName))].join(", ") }, messages, reference);
}
export function postProcedureDayHistory(tasks: PostProcedureTask[]) {
  const history = new Map<string, Omit<PostProcedureContact["history"][number], "dueDate"> & { services: string[]; dueDates: string[] }>();
  for (const task of tasks) for (const entry of task.contact?.history ?? []) {
    const key = JSON.stringify([entry.at, entry.by, entry.status, entry.response]);
    const group = history.get(key) ?? { at: entry.at, by: entry.by, status: entry.status, response: entry.response, services: [], dueDates: [] };
    if (!group.services.includes(task.serviceName)) group.services.push(task.serviceName);
    if (entry.dueDate && !group.dueDates.includes(entry.dueDate)) group.dueDates.push(entry.dueDate);
    history.set(key, group);
  }
  return [...history.values()].sort((a, b) => b.at.localeCompare(a.at));
}
export function savePostProcedureDay(contacts: PostProcedureContact[], tasks: PostProcedureTask[], change: { status: PostProcedureStatus; response?: string; dueDate?: string; at: string; by: string }) {
  const records = new Map(contacts.map(contact => [contact.id, contact]));
  for (const task of tasks) {
    const previous = records.get(task.id), response = change.response === undefined ? previous?.response ?? "" : change.response.trim(), dueDate = change.dueDate || task.dueDate;
    records.set(task.id, { id: task.id, appointmentId: task.appointmentId, patientId: task.patientId, serviceId: task.serviceId, stage: task.stage, status: change.status, response, dueDate,
      rescheduled: change.dueDate ? dueDate !== task.scheduledDate : previous?.rescheduled ?? false, updatedAt: change.at,
      history: [...(previous?.history ?? []), { at: change.at, by: change.by, status: change.status, response, dueDate }].slice(-100) });
  }
  return [...records.values()];
}
export function postProcedureInPeriod(task: Pick<PostProcedureTask, "dueDate" | "status">, period: string, reference: string) {
  if (period === "completed") return task.status === "Concluído";
  if (task.status === "Concluído") return false;
  const offset = postProcedureElapsedDays(reference, task.dueDate);
  if (offset === null) return false;
  if (period === "today") return offset === 0;
  if (period === "late") return offset >= -7 && offset < 0;
  if (period === "next") return offset > 0 && offset <= 7;
  return true;
}
// Derive the queue without writing records or polling. Only manual contact updates are persisted.
export function postProcedureTasks(appointments: Appointment[], services: Service[], patients: Patient[], professionals: Professional[], contacts: PostProcedureContact[], today = postProcedureDay()): PostProcedureTask[] {
  const catalog = new Map(services.map(s => [s.id, s])), people = new Map(patients.map(p => [p.id, p])), team = new Map(professionals.map(p => [p.id, p]));
  const saved = new Map(contacts.map(c => [c.id, c])), tasks = new Map<string, PostProcedureTask>();
  for (const appointment of appointments) {
    if (["Cancelado", "Reagendado", "Faltou"].includes(appointment.status) || !appointment.patientId || !["Compareceu", "Finalizado"].includes(appointment.status) && !appointment.accountClosed) continue;
    const performedOn = appointment.startsAt.slice(0, 10);
    if (!validPostProcedureDate(performedOn) || performedOn > today) continue;
    const account = appointment.accountClosed ? appointment.closedAccount : undefined;
    const serviceIds = account ? [
      ...(account.procedureLines ?? []).filter(line => !line.packageId && line.quantity > 0).map(line => line.serviceId),
      ...(account.packageSessionUses ?? []).filter(use => use.quantity > 0).map(use => use.serviceId),
    ] : appointment.services !== undefined ? appointment.services.map(s => s.serviceId) : [appointment.serviceId];
    for (const serviceId of new Set(serviceIds)) {
      const service = serviceId ? catalog.get(serviceId) : undefined;
      if (!service) continue;
      const plan = servicePostProcedurePlan(service);
      if (!validPostProcedurePlan(plan) || !plan.enabled) continue;
      const reactivations = postProcedureReactivationDays(plan);
      const stages = [{ stage: "first", label: "Primeiro contato", days: plan.firstContactDays }, ...plan.followUpDays.map((days, index) => ({ stage: `followup-${index}`, label: `Acompanhamento ${index + 1}`, days })), { stage: "satisfaction", label: "Resultado e satisfação", days: plan.satisfactionDays }, ...reactivations.map((days, index) => ({ stage: index ? `reactivation-${index}` : "reactivation", label: reactivations.length > 1 ? `Reativação ${index + 1}` : "Reativação", days }))];
      for (const stage of stages) {
        const id = postProcedureId(appointment.id, service.id, stage.stage), contact = saved.get(id);
        const scheduledDate = addPostProcedureDays(performedOn, stage.days);
        const patient = people.get(appointment.patientId);
        tasks.set(id, { id, appointmentId: appointment.id, patientId: appointment.patientId, serviceId: service.id, stage: stage.stage, label: stage.label, performedOn,
          scheduledDate, dueDate: contact?.status === "Concluído" || contact?.rescheduled ? contact.dueDate ?? scheduledDate : scheduledDate, patientName: patient?.name ?? "Paciente não encontrado", phone: patient?.phone ?? "",
          professionalId: appointment.professionalId, professionalName: team.get(appointment.professionalId)?.name ?? "Profissional", serviceName: service.name, status: contact?.status ?? "Aguardando contato", contact });
      }
    }
  }
  return [...tasks.values()].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.patientName.localeCompare(b.patientName, "pt-BR") || a.serviceName.localeCompare(b.serviceName, "pt-BR"));
}
export function postProcedureMessage(task: PostProcedureTask, messages: PostProcedureMessage[] = [], reference = postProcedureDay()) {
  const stage = task.stage.startsWith("reactivation") ? "reactivation" : task.stage.startsWith("followup") ? "followup" : task.stage === "satisfaction" ? "satisfaction" : "first";
  const values: Record<typeof postProcedureMessageVariables[number], string> = { paciente: task.patientName, procedimentos: task.serviceName, data: task.performedOn.split("-").reverse().join("/"), profissionais: task.professionalName, etapa: task.label, dias: String(postProcedureElapsedDays(task.performedOn, reference) ?? "") };
  return postProcedureMessageDraft(messages)[stage].replace(/\{(paciente|procedimentos|data|profissionais|etapa|dias)\}/g, (_, key: typeof postProcedureMessageVariables[number]) => values[key]);
}
export function postProcedureWhatsApp(phone: string, message: string) {
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = "55" + digits;
  if (!/^[1-9]\d{10,14}$/.test(digits)) return "";
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
