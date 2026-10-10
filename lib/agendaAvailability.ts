import type { Appointment, ClosedShift, Professional } from "./types";
export type AgendaSlot = { date: string; professionalId: string; hour: number };
export const agendaHours = Array.from({ length: 13 }, (_, index) => index + 8);
export const agendaShifts = [{ id: "morning", label: "Manhã", start: 8, end: 12 }, { id: "afternoon", label: "Tarde", start: 12, end: 18 }, { id: "evening", label: "Noite", start: 18, end: 21 }] as const;
export const weekdays = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
export function validClosedShifts(value: unknown): value is ClosedShift[] {
  return Array.isArray(value) && value.length <= 21 && value.every(item => item && Number.isInteger(item.weekday) && item.weekday >= 0 && item.weekday <= 6 && agendaShifts.some(shift => shift.id === item.shift));
}
export function shiftClosed(professional: Professional, date: string, startHour: number, endHour = startHour + 1) {
  const weekday = new Date(date + "T12:00:00Z").getUTCDay();
  return (professional.closedShifts ?? []).some(rule => {
    const shift = agendaShifts.find(item => item.id === rule.shift);
    return rule.weekday === weekday && !!shift && startHour < shift.end && endHour > shift.start;
  });
}
export const isAbsence = (appointment: Appointment) => appointment.eventType === "Registrar Ausência";
export function overlappingAppointments(appointments: Appointment[], slot: AgendaSlot) {
  const start = `${slot.date}T${String(slot.hour).padStart(2, "0")}:00:00`, end = `${slot.date}T${String(slot.hour + 1).padStart(2, "0")}:00:00`;
  return appointments.filter(item => item.professionalId === slot.professionalId && item.startsAt < end && item.endsAt > start);
}
export function slotAvailable(professionals: Professional[], appointments: Appointment[], slot: AgendaSlot) {
  const professional = professionals.find(item => item.id === slot.professionalId);
  return !!professional?.active && agendaHours.includes(slot.hour) && !shiftClosed(professional, slot.date, slot.hour) && !overlappingAppointments(appointments, slot).length;
}
export function rectangleSlots(date: string, ids: string[], origin: { professionalId: string; hour: number }, target: { professionalId: string; hour: number }): AgendaSlot[] {
  const from = ids.indexOf(origin.professionalId), to = ids.indexOf(target.professionalId);
  if (from < 0 || to < 0) return [];
  return ids.slice(Math.min(from, to), Math.max(from, to) + 1).flatMap(professionalId => agendaHours.filter(hour => hour >= Math.min(origin.hour, target.hour) && hour <= Math.max(origin.hour, target.hour)).map(hour => ({ date, professionalId, hour })));
}
export function bookingDuration(slots: AgendaSlot[], professionalId: string) {
  const hours = slots.filter(item => item.professionalId === professionalId).map(item => item.hour).sort((a,b) => a-b);
  let last = hours[0]; for (const hour of hours.slice(1)) { if (hour !== last + 1) break; last = hour; }
  return { hour: hours[0], durationMinutes: (last - hours[0] + 1) * 60 };
}
export function newAbsences(professionals: Professional[], appointments: Appointment[], slots: AgendaSlot[], id: () => string): Appointment[] {
  const result: Appointment[] = [];
  for (const slot of slots) if (slotAvailable(professionals, [...appointments, ...result], slot)) result.push({ id: id(), professionalId: slot.professionalId, startsAt: `${slot.date}T${String(slot.hour).padStart(2,"0")}:00:00`, endsAt: `${slot.date}T${String(slot.hour+1).padStart(2,"0")}:00:00`, status: "Agendado", eventType: "Registrar Ausência", notes: "", services: [] });
  return result;
}
// Every touched hourly cell is reserved in full, including the final partial hour.
export function reservedInterval(startsAt: string, endsAt: string) {
  const start = Date.parse(startsAt?.slice(0,19) + "Z"), end = Date.parse(endsAt?.slice(0,19) + "Z");
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return { start: new Date(Math.floor(start / 3600000) * 3600000).toISOString().slice(0,19), end: new Date(Math.ceil(end / 3600000) * 3600000).toISOString().slice(0,19) };
}
export function appointmentAvailabilityError(professional: Professional | undefined, appointments: Appointment[], startsAt: string, endsAt: string, editingId?: string) {
  const interval = reservedInterval(startsAt, endsAt);
  if (!professional?.active || !interval) return "Selecione um profissional ativo e um horário válido.";
  let day = interval.start.slice(0,10);
  while (day <= interval.end.slice(0,10)) {
    const startHour = day === interval.start.slice(0,10) ? Number(interval.start.slice(11,13)) : 0;
    const endHour = day === interval.end.slice(0,10) ? Number(interval.end.slice(11,13)) : 24;
    if (endHour > startHour && shiftClosed(professional, day, startHour, endHour)) return "A agenda do profissional está fechada nesse turno. Ajuste os turnos no cadastro de profissionais.";
    day = new Date(Date.parse(day + "T00:00:00Z") + 86400000).toISOString().slice(0,10);
  }
  const conflicts = appointments.filter(item => {
    if (item.id === editingId || item.professionalId !== professional.id) return false;
    const other = reservedInterval(item.startsAt, item.endsAt);
    return other && other.start < interval.end && other.end > interval.start;
  });
  if (conflicts.some(isAbsence)) return "O profissional está ausente nesse horário. Remova a ausência para agendar.";
  if (conflicts.length) return "Este horário já está reservado para outro atendimento deste profissional. Escolha um intervalo livre.";
  return "";
}
