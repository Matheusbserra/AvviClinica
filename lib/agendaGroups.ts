import { agendaSlots, isAbsence, overlappingAppointments } from "./agendaAvailability";
import type { Appointment } from "./types";

export type AgendaGroup = { startIndex: number; slotCount: number; appointments: Appointment[]; overlaps: Appointment[] };
function samePatient(left: Appointment, right: Appointment) {
  return left.id === right.id || (!isAbsence(left) && !isAbsence(right) && !!left.patientId && left.patientId === right.patientId);
}
// Group only the display; every original appointment keeps its ID, times and account.
export function agendaGroups(appointments: Appointment[], date: string, professionalId: string): AgendaGroup[] {
  const groups: AgendaGroup[] = [];
  agendaSlots.forEach((hour, index) => {
    const overlaps = overlappingAppointments(appointments, { date, professionalId, hour });
    const primary = overlaps.find(item => !isAbsence(item)) ?? overlaps[0];
    if (!primary) return;
    const previous = groups.at(-1);
    const group = previous && previous.startIndex + previous.slotCount === index && samePatient(previous.appointments[0], primary)
      ? previous : { startIndex: index, slotCount: 0, appointments: [], overlaps: [] };
    if (group !== previous) groups.push(group);
    group.slotCount += 1;
    for (const item of overlaps) {
      if (!group.overlaps.some(old => old.id === item.id)) group.overlaps.push(item);
      if (samePatient(primary, item) && !group.appointments.some(old => old.id === item.id)) group.appointments.push(item);
    }
  });
  return groups;
}
