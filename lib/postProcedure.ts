import type { Appointment, Patient, PostProcedureContact, PostProcedurePlan, PostProcedureStatus, Professional, Service } from "./types";

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
    && plan.followUpDays.every((n, index) => n >= plan.firstContactDays && n <= plan.satisfactionDays && (!index || n > plan.followUpDays[index - 1]));
}
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
    && /^(first|followup-\d{1,2}|satisfaction|reactivation)$/.test(item.stage) && item.id === postProcedureId(item.appointmentId, item.serviceId, item.stage)
    && postProcedureStatuses.includes(item.status) && typeof item.response === "string" && item.response.length <= 5000
    && (item.dueDate === undefined || validPostProcedureDate(item.dueDate)) && typeof item.updatedAt === "string" && Number.isFinite(Date.parse(item.updatedAt))
    && Array.isArray(item.history) && item.history.length <= 100 && item.history.every(h => h && typeof h.at === "string" && Number.isFinite(Date.parse(h.at)) && typeof h.by === "string" && h.by.length <= 200 && postProcedureStatuses.includes(h.status) && typeof h.response === "string" && h.response.length <= 5000 && (h.dueDate === undefined || validPostProcedureDate(h.dueDate)));
}
export type PostProcedureTask = {
  id: string; appointmentId: string; patientId: string; serviceId: string; stage: string; label: string;
  performedOn: string; dueDate: string; patientName: string; phone: string; professionalId: string; professionalName: string;
  serviceName: string; status: PostProcedureStatus; contact?: PostProcedureContact;
};
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
      const stages = [{ stage: "first", label: "Primeiro contato", days: plan.firstContactDays }, ...plan.followUpDays.map((days, index) => ({ stage: `followup-${index}`, label: `Acompanhamento ${index + 1}`, days })), { stage: "satisfaction", label: "Resultado e satisfação", days: plan.satisfactionDays }, { stage: "reactivation", label: "Reativação", days: plan.reactivationDays }];
      for (const stage of stages) {
        const id = postProcedureId(appointment.id, service.id, stage.stage), contact = saved.get(id);
        const patient = people.get(appointment.patientId);
        tasks.set(id, { id, appointmentId: appointment.id, patientId: appointment.patientId, serviceId: service.id, stage: stage.stage, label: stage.label, performedOn,
          dueDate: contact?.dueDate ?? addPostProcedureDays(performedOn, stage.days), patientName: patient?.name ?? "Paciente não encontrado", phone: patient?.phone ?? "",
          professionalId: appointment.professionalId, professionalName: team.get(appointment.professionalId)?.name ?? "Profissional", serviceName: service.name, status: contact?.status ?? "Aguardando contato", contact });
      }
    }
  }
  return [...tasks.values()].sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.patientName.localeCompare(b.patientName, "pt-BR") || a.serviceName.localeCompare(b.serviceName, "pt-BR"));
}
export function postProcedureMessage(task: PostProcedureTask) {
  const start = `Olá, ${task.patientName}! Aqui é da AVVI Clínica. Estamos acompanhando seu procedimento de ${task.serviceName}.`;
  return task.stage === "reactivation" ? `Olá, ${task.patientName}! Aqui é da AVVI Clínica. Como você está? Gostaria de agendar uma nova avaliação para conversar sobre seus objetivos e os cuidados indicados para você?`
    : task.stage === "satisfaction" ? `${start} Como você percebe a evolução e o resultado até agora? Ficou com alguma dúvida ou algo que gostaria de conversar com a profissional?`
    : `${start} Como você está se sentindo? Teve algum desconforto, alguma alteração ou dúvida sobre as orientações recebidas?`;
}
export function postProcedureWhatsApp(phone: string, message: string) {
  let digits = phone.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) digits = "55" + digits;
  if (!/^[1-9]\d{10,14}$/.test(digits)) return "";
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
