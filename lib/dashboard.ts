import { excludeZeroAccounts } from "./calculations";
import { professionalReports } from "./professionalReports";
import { validReportDate } from "./reports";
import type { FixedCost, RevenueEntry } from "./types";

// Dashboard performance uses the same receipt/date basis as each professional.
// Receipts linked to those accounts are copies, not additional revenue.
export function dashboardPeriod(input: Parameters<typeof professionalReports>[0] & { revenues: RevenueEntry[]; costs: FixedCost[] }) {
  const accounting = excludeZeroAccounts(input.appointments, input.entries, input.services);
  const result = professionalReports({ ...input, ...accounting });
  const inPeriod = (date: string) => result.valid && validReportDate(date.slice(0, 10)) && date.slice(0, 10) >= input.start && date.slice(0, 10) <= input.end;
  const excluded = new Set(accounting.entryIds);
  for (const entry of input.entries) if (excluded.has(entry.id) && entry.sourceAccountId) excluded.add(entry.sourceAccountId);
  const covered = new Set(accounting.entries.flatMap(entry => [entry.id, entry.sourceAccountId].filter((id): id is string => !!id)));
  for (const appointment of accounting.appointments) {
    for (const id of [appointment.financialEntryId, appointment.closedAccount?.id, appointment.closedAccount?.generatedEntryId]) if (id) covered.add(id);
  }
  const independentRevenue = input.revenues.filter(item => inPeriod(item.serviceDate || item.paymentDate) && (!item.sourceFinancialEntryId || (!covered.has(item.sourceFinancialEntryId) && !excluded.has(item.sourceFinancialEntryId)))).reduce((sum, item) => sum + item.total, 0);
  const revenue = result.reports.reduce((sum, report) => sum + report.totalPaid, 0) + independentRevenue;
  const expenses = input.costs.filter(item => item.status !== "Pendente" && inPeriod(item.dueDate) && !excluded.has(item.sourceFinancialEntryId ?? "")).reduce((sum, item) => sum + item.value, 0);
  return { ...result, summary: { revenue, independentRevenue, expenses, result: revenue - expenses } };
}
