import { professionalReports } from "./professionalReports";
import { reportCapacity } from "./reports";
import type { ProfessionalStrategy } from "./types";

export function strategyProgress(strategies: ProfessionalStrategy[], data: Omit<Parameters<typeof professionalReports>[0], "start" | "end">) {
  const periods = new Map<string, ReturnType<typeof professionalReports>>();
  return strategies.map(strategy => {
    if (strategy.metric === "custom") return { id: strategy.id, value: strategy.manualProgress };
    const key = strategy.start + ":" + strategy.end;
    if (!periods.has(key)) periods.set(key, professionalReports({ ...data, start: strategy.start, end: strategy.end }));
    const report = periods.get(key)!.reports.find(item => item.professional.id === strategy.professionalId);
    const capacity = reportCapacity(strategy.start, strategy.end).capacity;
    const values = { revenue: report?.totalPaid ?? 0, patients: report?.closedPatientCount ?? 0, services: report?.serviceCount ?? 0, averageTicket: report?.averageTicket ?? 0, productivity: capacity ? (report?.closedPatientCount ?? 0) / capacity * 100 : 0 };
    return { id: strategy.id, value: values[strategy.metric] };
  });
}
