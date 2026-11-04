import type { ProfessionalStrategy, StrategyMetric } from "./types";
export const strategyMetrics: { id: StrategyMetric; label: string; unit: "money" | "number" | "percent"; description: string }[] = [
  { id: "revenue", label: "Faturamento", unit: "money", description: "Total pago pelos clientes, como no relatório profissional." },
  { id: "patients", label: "Pacientes atendidos", unit: "number", description: "Pacientes distintos com conta fechada. Contas zeradas não entram." },
  { id: "services", label: "Serviços realizados", unit: "number", description: "Quantidade de serviços realizados no período, como no relatório profissional." },
  { id: "averageTicket", label: "Ticket médio", unit: "money", description: "Faturamento dividido pelos pacientes distintos com conta fechada." },
  { id: "productivity", label: "Produtividade", unit: "percent", description: "Pacientes atendidos ÷ capacidade do período: dois por dia, exceto domingos." },
  { id: "custom", label: "Estratégia personalizada", unit: "number", description: "Defina uma meta e registre o progresso manualmente." }
];
export function validStrategy(value: unknown): value is ProfessionalStrategy {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const item = value as ProfessionalStrategy;
  const date = (value: string) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(new Date(value + "T12:00:00Z").getTime()) && new Date(value + "T12:00:00Z").toISOString().slice(0, 10) === value;
  const author = (value: ProfessionalStrategy["createdBy"]) => !!value && typeof value.login === "string" && typeof value.name === "string" && value.login.length <= 100 && value.name.length <= 150;
  const keys = ["id", "professionalId", "title", "metric", "sortOrder", "start", "end", "target", "manualProgress", "notes", "createdAt", "updatedAt", "createdBy", "updatedBy"];
  return Object.keys(item).every(key => keys.includes(key)) && (item.sortOrder === undefined || (Number.isSafeInteger(item.sortOrder) && item.sortOrder >= 0)) && typeof item.id === "string" && item.id.length > 0 && item.id.length <= 150 && typeof item.professionalId === "string" && !!item.professionalId && typeof item.title === "string" && !!item.title.trim() && item.title.length <= 150 && strategyMetrics.some(metric => metric.id === item.metric) && date(item.start) && date(item.end) && item.end >= item.start && new Date(item.end).getTime()-new Date(item.start).getTime() <= 36600*86400000 && Number.isFinite(item.target) && item.target > 0 && item.target <= 1e12 && Number.isFinite(item.manualProgress) && item.manualProgress >= 0 && item.manualProgress <= 1e12 && typeof item.notes === "string" && item.notes.length <= 5000 && typeof item.createdAt === "string" && typeof item.updatedAt === "string" && author(item.createdBy) && author(item.updatedBy);
}

export function compareStrategies(a: ProfessionalStrategy, b: ProfessionalStrategy) {
  return (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER)
    || a.end.localeCompare(b.end) || a.title.localeCompare(b.title, "pt-BR") || a.id.localeCompare(b.id);
}

// Store positions in the records: array order alone is lost on cloud reloads.
// Reorder visible neighbours while preserving hidden periods and other professionals.
export function moveStrategy(records: ProfessionalStrategy[], id: string, direction: -1 | 1, visibleIds: string[], author: ProfessionalStrategy["updatedBy"], now = new Date().toISOString()) {
  const selected = records.find(item => item.id === id);
  if (!selected) return records;
  const ordered = records.filter(item => item.professionalId === selected.professionalId).sort(compareStrategies);
  const visible = ordered.filter(item => visibleIds.includes(item.id));
  const index = visible.findIndex(item => item.id === id), neighbour = visible[index + direction];
  if (index < 0 || !neighbour) return records;
  const from = ordered.findIndex(item => item.id === id), to = ordered.findIndex(item => item.id === neighbour.id);
  [ordered[from], ordered[to]] = [ordered[to], ordered[from]];
  const positions = new Map(ordered.map((item, index) => [item.id, index]));
  return records.map(item => {
    const sortOrder = positions.get(item.id);
    return sortOrder === undefined || sortOrder === item.sortOrder ? item : { ...item, sortOrder, updatedAt: now, updatedBy: author };
  });
}
