import type { Appointment, ClosedShift, Professional } from "./types";
export type AgendaSlot = { date: string; professionalId: string; hour: number };
export const agendaHours = Array.from({ length: 13 }, (_, index) => index + 8);
export const agendaSlots = agendaHours.flatMap(hour => [hour, hour + 0.5]);
export function slotTime(hour: number) {
  return `${String(Math.floor(hour)).padStart(2, "0")}:${String(Math.round((hour % 1) * 60)).padStart(2, "0")}`;
}
const slotTimestamp = (date: string, hour: number) => `${date}T${slotTime(hour)}:00`;
export const agendaShifts = [{ id: "morning", label: "Manhã", start: 8, end: 12 }, { id: "afternoon", label: "Tarde", start: 12, end: 18 }, { id: "evening", label: "Noite", start: 18, end: 21 }] as const;
export const weekdays = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
export function validClosedShifts(value: unknown): value is ClosedShift[] {
  return Array.isArray(value) && value.length <= 21 && value.every(item => item && Number.isInteger(item.weekday) && item.weekday >= 0 && item.weekday <= 6 && agendaShifts.some(shift => shift.id === item.shift));
}
export function shiftClosed(professional: Professional, date: string, startHour: number, endHour = startHour + 0.5) {
  const weekday = new Date(date + "T12:00:00Z").getUTCDay();
  return (professional.closedShifts ?? []).some(rule => {
    const shift = agendaShifts.find(item => item.id === rule.shift);
    return rule.weekday === weekday && !!shift && startHour < shift.end && endHour > shift.start;
  });
}
export const isAbsence = (appointment: Appointment) => appointment.eventType === "Registrar Ausência";
export function overlappingAppointments(appointments: Appointment[], slot: AgendaSlot) {
  const start = slotTimestamp(slot.date, slot.hour), end = slotTimestamp(slot.date, slot.hour + 0.5);
  return appointments.filter(item => item.professionalId === slot.professionalId && item.startsAt < end && item.endsAt > start);
}
export function slotAvailable(professionals: Professional[], appointments: Appointment[], slot: AgendaSlot) {
  const professional = professionals.find(item => item.id === slot.professionalId);
  return !!professional?.active && agendaSlots.includes(slot.hour) && !shiftClosed(professional, slot.date, slot.hour) && !overlappingAppointments(appointments, slot).some(item => item.status !== "Cancelado");
}
export function rectangleSlots(date: string, ids: string[], origin: { professionalId: string; hour: number }, target: { professionalId: string; hour: number }): AgendaSlot[] {
  const from = ids.indexOf(origin.professionalId), to = ids.indexOf(target.professionalId);
  if (from < 0 || to < 0) return [];
  return ids.slice(Math.min(from, to), Math.max(from, to) + 1).flatMap(professionalId => agendaSlots.filter(hour => hour >= Math.min(origin.hour, target.hour) && hour <= Math.max(origin.hour, target.hour)).map(hour => ({ date, professionalId, hour })));
}
export function bookingDuration(slots: AgendaSlot[], professionalId: string) {
  const hours = [...new Set(slots.filter(item => item.professionalId === professionalId).map(item => item.hour))].sort((a,b) => a-b);
  let last = hours[0]; for (const hour of hours.slice(1)) { if (hour !== last + 0.5) break; last = hour; }
  return { hour: hours[0], durationMinutes: (last - hours[0] + 0.5) * 60 };
}
export function newAbsences(professionals: Professional[], appointments: Appointment[], slots: AgendaSlot[], id: () => string): Appointment[] {
  const result: Appointment[] = [];
  for (const slot of slots) if (slotAvailable(professionals, [...appointments, ...result], slot)) result.push({ id: id(), professionalId: slot.professionalId, startsAt: slotTimestamp(slot.date, slot.hour), endsAt: slotTimestamp(slot.date, slot.hour + 0.5), status: "Agendado", eventType: "Registrar Ausência", notes: "", services: [] });
  return result;
}
// Reserve each touched half-hour; keep the exact service duration in the saved appointment.
export function reservedInterval(startsAt: string, endsAt: string) {
  const start = Date.parse(startsAt?.slice(0,19) + "Z"), end = Date.parse(endsAt?.slice(0,19) + "Z");
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return { start: new Date(Math.floor(start / 1800000) * 1800000).toISOString().slice(0,19), end: new Date(Math.ceil(end / 1800000) * 1800000).toISOString().slice(0,19) };
}
export function appointmentAvailabilityError(professional: Professional | undefined, appointments: Appointment[], startsAt: string, endsAt: string, editingId?: string, eventType?: Appointment["eventType"]) {
  const interval = reservedInterval(startsAt, endsAt);
  if (!professional?.active || !interval) return "Selecione um profissional ativo e um horário válido.";
  let day = interval.start.slice(0,10);
  while (day <= interval.end.slice(0,10)) {
    const startHour = day === interval.start.slice(0,10) ? Number(interval.start.slice(11,13)) + Number(interval.start.slice(14,16)) / 60 : 0;
    const endHour = day === interval.end.slice(0,10) ? Number(interval.end.slice(11,13)) + Number(interval.end.slice(14,16)) / 60 : 24;
    if (endHour > startHour && shiftClosed(professional, day, startHour, endHour)) return "A agenda do profissional está fechada nesse turno. Ajuste os turnos no cadastro de profissionais.";
    day = new Date(Date.parse(day + "T00:00:00Z") + 86400000).toISOString().slice(0,10);
  }
  const conflicts = appointments.filter(item => {
    if (item.id === editingId || item.professionalId !== professional.id || item.status === "Cancelado") return false;
    const other = reservedInterval(item.startsAt, item.endsAt);
    return other && other.start < interval.end && other.end > interval.start;
  });
  if (conflicts.some(isAbsence)) return "O profissional está ausente nesse horário. Remova a ausência para agendar.";
  if (conflicts.length) return "Este horário já está reservado para outro atendimento deste profissional. Escolha um intervalo livre.";
  // Absence markers occupy a professional's schedule, but never a treatment room.
  if (eventType === "Registrar Ausência") return "";
  const boundaries: { time: string; professionalId: string; delta: number }[] = [];
  for (const appointment of appointments) {
    if (appointment.id === editingId || isAbsence(appointment) || appointment.status === "Cancelado") continue;
    const other = reservedInterval(appointment.startsAt, appointment.endsAt);
    if (!other || other.start >= interval.end || other.end <= interval.start) continue;
    boundaries.push({ time: other.start < interval.start ? interval.start : other.start, professionalId: appointment.professionalId, delta: 1 },
      { time: other.end > interval.end ? interval.end : other.end, professionalId: appointment.professionalId, delta: -1 });
  }
  // Endings release their room before another appointment starts at the same time.
  boundaries.sort((a, b) => a.time.localeCompare(b.time) || a.delta - b.delta);
  const occupied = new Map<string, number>();
  for (const boundary of boundaries) {
    const count = (occupied.get(boundary.professionalId) ?? 0) + boundary.delta;
    if (count) occupied.set(boundary.professionalId, count); else occupied.delete(boundary.professionalId);
    if (occupied.size >= 3) return "A clínica permite até 3 pacientes simultâneos, com profissionais diferentes. Escolha outro horário.";
  }
  return "";
}

export function resizedAgendaEnd(appointment: Pick<Appointment, "startsAt" | "endsAt">, halfHourSteps: number) {
  if (!reservedInterval(appointment.startsAt, appointment.endsAt) || appointment.startsAt.slice(0, 10) !== appointment.endsAt.slice(0, 10) || !Number.isInteger(halfHourSteps)) return null;
  const minutes = (value: string) => Number(value.slice(11, 13)) * 60 + Number(value.slice(14, 16));
  const minimum = Math.ceil((minutes(appointment.startsAt) + 30) / 30) * 30;
  if (minimum > 21 * 60) return null;
  const end = Math.max(minimum, Math.min(21 * 60, Math.ceil(minutes(appointment.endsAt) / 30) * 30 + halfHourSteps * 30));
  return `${appointment.startsAt.slice(0, 10)}T${slotTime(end / 60)}:00`;
}
