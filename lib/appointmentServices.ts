import type { Appointment, AppointmentService, Service } from "./types";
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
