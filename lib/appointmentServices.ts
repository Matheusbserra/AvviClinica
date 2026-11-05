import type { Appointment, AppointmentService, Service, FinancialEntry, Procedure } from "./types";
// Existing appointments keep their saved price; older single-service records remain readable.
export function appointmentServices(appointment: Appointment, catalog: Service[]): AppointmentService[] {
  if (appointment.services !== undefined) return appointment.services.map((service) => ({ ...service }));
  if (!appointment.serviceId) return [];
  const service = catalog.find((item) => item.id === appointment.serviceId);
  return [{ id: `scheduled-${appointment.id}`, serviceId: appointment.serviceId, name: service?.name ?? "Serviço registrado", price: appointment.servicePrice ?? service?.price ?? 0, priceType: appointment.servicePriceType ?? service?.priceType ?? "fixed", durationMinutes: service?.durationMinutes ?? 0 }];
}

export function totalServiceMinutes(services: Pick<AppointmentService, "durationMinutes">[]) {
  return services.reduce((sum, service) => sum + (Number.isInteger(service.durationMinutes) && service.durationMinutes > 0 ? service.durationMinutes : 0), 0);
}

// Display completed treatments without changing the original booking or its duration.
export function appointmentPreviewServiceNames(appointment: Appointment, services: Service[], entries: FinancialEntry[] = [], procedures: Procedure[] = []) {
  const names = appointmentServices(appointment,services).map(item=>item.name);
  const related = entries.filter(entry=>entry.accountClosed && (entry.appointmentId === appointment.id || !!appointment.financialEntryId && entry.id === appointment.financialEntryId || !!appointment.closedAccount?.id && entry.sourceAccountId === appointment.closedAccount.id));
  const lines = appointment.accountClosed && appointment.closedAccount?.procedureLines ? appointment.closedAccount.procedureLines : related.flatMap(entry=>entry.procedureLines ?? []);
  for (const line of lines) {
    const name = line.manualProcedure || services.find(item=>item.id===line.serviceId)?.name || procedures.find(item=>item.id===line.procedureId)?.name;
    if (name) names.push(name);
  }
  for (const entry of related) if (!entry.procedureLines?.length) {
    const name = entry.manualProcedure || procedures.find(item=>item.id===entry.procedureId)?.name;
    if(name)names.push(name);
  }
  if (!names.length) { const legacy=procedures.find(item=>item.id===appointment.procedureId); if(legacy)names.push(legacy.name); }
  return preferredPreviewServiceNames(names);
}
export function preferredPreviewServiceNames(names: string[]) {
  const normalize=(value:string)=>value.normalize("NFD").replace(/\p{Diacritic}/gu,"").toLocaleLowerCase("pt-BR").replace(/\s+/g," ").trim();
  const unique=[...new Map(names.filter(name=>name?.trim()).map(name=>[normalize(name),name])).values()];
  const treatments=unique.filter(name=>!normalize(name).includes("avaliacao"));
  return treatments.length?treatments:unique;
}
