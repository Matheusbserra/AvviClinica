import { professionalReports } from "./professionalReports";
import type { AppUser } from "./access";
export type LimitedRanking = { id: string; name: string; value?: number };
export type LimitedProfessionalReport = {
  professional: { id: string; name: string; avatarDataUrl?: string };
  goal: number; totalPaid: number; count: number; serviceCount: number; averageTicket: number; closedPatientCount: number;
  services: LimitedRanking[]; patientRevenue: LimitedRanking[];
  patientProfit: LimitedRanking[]; patientServices: LimitedRanking[];
};
// Only this explicit projection crosses the boundary to a limited user.
export function limitedProfessionalReports(user: AppUser, input: Parameters<typeof professionalReports>[0]) {
  const ids = new Set(user.professionalReport?.professionalIds ?? []);
  const result = professionalReports({ ...input, professionals: input.professionals.filter(item => ids.has(item.id)),
    entries: input.entries.filter(item => ids.has(item.professionalId)),
    appointments: input.appointments.filter(item => ids.has(item.professionalId)) });
  return { valid: result.valid, reports: result.reports.map((item): LimitedProfessionalReport => ({
    professional: { id: item.professional.id, name: item.professional.name, ...(item.professional.avatarDataUrl ? { avatarDataUrl: item.professional.avatarDataUrl } : {}) },
    goal: item.goal, totalPaid: item.totalPaid, count: item.count, serviceCount: item.serviceCount, averageTicket: item.averageTicket, closedPatientCount: item.closedPatientCount,
    services: item.services.map(({ id, name, value }) => ({ id, name, value })),
    patientServices: item.patientServices.map(({ id, name, value }) => ({ id, name, value })),
    patientRevenue: item.patientRevenue.map(({ id, name }) => ({ id, name })),
    patientProfit: item.patientProfit.map(({ id, name }) => ({ id, name }))
  })) };
}
