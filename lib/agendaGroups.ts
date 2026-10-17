import { agendaSlots, isAbsence, overlappingAppointments, reservedInterval } from "./agendaAvailability";
import type { Appointment } from "./types";

export type AgendaGroup = { startIndex: number; slotCount: number; appointments: Appointment[]; overlaps: Appointment[] };
function samePatient(left: Appointment, right: Appointment) {
  return left.id === right.id || (isAbsence(left) && isAbsence(right)) || (!isAbsence(left) && !isAbsence(right) && !!left.patientId && left.patientId === right.patientId);
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

export type PositionedAgendaGroup = AgendaGroup & { lane: number; columns: number };

// Cancelled appointments are passed here only when the visibility filter is on.
// Give overlapping cancellations their own cards without changing normal patient
// grouping or the underlying appointments, schedules and account records.
export function positionedAgendaGroups(appointments: Appointment[], date: string, professionalId: string): PositionedAgendaGroup[] {
  const daily = appointments.filter(item => item.professionalId === professionalId && item.startsAt < `${date}T21:00:00` && item.endsAt > `${date}T08:00:00`);
  const intervals = daily.map(item => ({ item, interval: reservedInterval(item.startsAt, item.endsAt) }));
  const separate = new Set(intervals.filter(({ item, interval }) => item.status === "Cancelado" && interval && intervals.some(other =>
    other.item.id !== item.id && other.interval && other.interval.start < interval.end && other.interval.end > interval.start
  )).map(({ item }) => item.id));
  const groups = [
    ...agendaGroups(daily.filter(item => !separate.has(item.id)), date, professionalId),
    ...daily.filter(item => separate.has(item.id)).flatMap(item => agendaGroups([item], date, professionalId))
  ].sort((a, b) => a.startIndex - b.startIndex || Number(a.appointments[0].status === "Cancelado") - Number(b.appointments[0].status === "Cancelado") || a.appointments[0].id.localeCompare(b.appointments[0].id));
  const positioned: PositionedAgendaGroup[] = [];
  let cluster: AgendaGroup[] = [], end = 0;
  function flush() {
    const laneEnds: number[] = [];
    const members = cluster.map(group => {
      let lane = laneEnds.findIndex(value => value <= group.startIndex);
      if (lane < 0) lane = laneEnds.length;
      laneEnds[lane] = group.startIndex + group.slotCount;
      return { ...group, lane, columns: 1 };
    });
    positioned.push(...members.map(group => ({ ...group, columns: laneEnds.length })));
    cluster = [];
  }
  for (const group of groups) {
    if (cluster.length && group.startIndex >= end) flush();
    if (!cluster.length) end = 0;
    cluster.push(group); end = Math.max(end, group.startIndex + group.slotCount);
  }
  flush();
  return positioned;
}
