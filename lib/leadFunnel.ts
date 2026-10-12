import { zeroClosedAppointment } from "./calculations";
import type { Appointment, FollowUpLead, LeadStage, Patient } from "./types";
export const leadStages: { id: LeadStage; title: string; description: string; color: string }[] = [
  { id: "entry", title: "Leads de Entrada", description: "Conversas iniciadas hoje", color: "#eab308" },
  { id: "warm", title: "Leads quentes", description: "De 1 a 7 dias atrás", color: "#f97316" },
  { id: "cold", title: "Leads frios", description: "Mais de 7 dias, sem agendamento", color: "#60a5fa" },
  { id: "scheduled", title: "Agendamentos marcados", description: "Agendados na clínica", color: "#22c55e" },
  { id: "aftercare", title: "Pós-atendimento", description: "Conta fechada na agenda", color: "#a855f7" }
];
function phoneKey(phone: string) { const digits = phone.replace(/\D/g, ""); return digits.length === 10 || digits.length === 11 ? `55${digits}` : digits; }
export function patientForLead(lead: FollowUpLead, patients: Patient[]) { return patients.find((patient) => patient.id === lead.patientId) ?? patients.find((patient) => phoneKey(patient.phone) === phoneKey(lead.phone)); }
export function appointmentForLead(lead: FollowUpLead, patients: Patient[], appointments: Appointment[]) {
  const patient = patientForLead(lead, patients); if (!patient) return undefined;
  return appointments.filter((appointment) => appointment.patientId === patient.id && !zeroClosedAppointment(appointment) && !["Cancelado", "Faltou", "Reagendado"].includes(appointment.status)).sort((a, b) => b.startsAt.localeCompare(a.startsAt))[0];
}
function dayNumber(date: Date) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date).map((part) => [part.type, part.value]));
  return Math.floor(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)) / 86400000);
}
export function leadAge(lead: FollowUpLead, now: Date) { const first = new Date(lead.firstContactAt); return Number.isFinite(first.getTime()) ? Math.max(0, dayNumber(now) - dayNumber(first)) : 0; }
export function automaticLeadStage(lead: FollowUpLead, patients: Patient[], appointments: Appointment[], now: Date): LeadStage {
  const appointment = appointmentForLead(lead, patients, appointments);
  if (appointment) return appointment.accountClosed ? "aftercare" : "scheduled";
  const days = leadAge(lead, now); return days === 0 ? "entry" : days <= 7 ? "warm" : "cold";
}
export function stageForLead(lead: FollowUpLead, patients: Patient[], appointments: Appointment[], now: Date): LeadStage { return lead.manualStage ?? automaticLeadStage(lead, patients, appointments, now); }
