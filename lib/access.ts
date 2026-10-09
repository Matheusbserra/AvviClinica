export type AppRole = "admin" | "standard";
export const appTabs = ["Agenda", "Estoque", "Follow Up", "Relatórios", "Dashboard", "Receitas", "Lançamento de Procedimentos", "Pagamento Profissional", "Relatório Profissional", "Recibos de Pagamento", "Custos", "Cadastro de Procedimentos", "Cadastro de Serviços", "Cadastro de Profissionais", "Cadastro de Pacientes", "Metas", "Contas"] as const;
export type AppTab = typeof appTabs[number];
export type AppUser = { id?: string; name?: string; login: string; role: AppRole; tabs?: string[]; revision?: number };
export const standardTabs: string[] = ["Agenda", "Estoque", "Follow Up", "Custos", "Cadastro de Procedimentos", "Cadastro de Serviços", "Cadastro de Profissionais", "Cadastro de Pacientes"];
type Access = AppRole | AppUser;
export function canAccessTab(access: Access, tab: string) {
  const role = typeof access === "string" ? access : access.role;
  if (!appTabs.includes(tab as AppTab)) return false;
  return role === "admin" || (tab !== "Contas" && (typeof access === "string" ? standardTabs : access.tabs ?? standardTabs).includes(tab));
}
export function hasFinancialAccess(access: Access) { return ["Relatórios", "Lançamento de Procedimentos", "Pagamento Profissional", "Relatório Profissional"].some(tab => canAccessTab(access, tab)); }
const readTabs: Record<string, string[]> = {
  patients: ["Agenda", "Estoque", "Follow Up", "Relatórios", "Lançamento de Procedimentos", "Cadastro de Pacientes", "Recibos de Pagamento", "Relatório Profissional"],
  professionals: ["Agenda", "Estoque", "Follow Up", "Relatórios", "Lançamento de Procedimentos", "Pagamento Profissional", "Relatório Profissional", "Cadastro de Profissionais", "Cadastro de Pacientes", "Dashboard", "Metas", "Recibos de Pagamento"],
  procedures: ["Agenda", "Estoque", "Relatórios", "Lançamento de Procedimentos", "Cadastro de Procedimentos"],
  services: ["Agenda", "Follow Up", "Relatórios", "Cadastro de Serviços", "Relatório Profissional"],
  inventory: ["Agenda", "Estoque"], gifts: ["Agenda", "Estoque"], appointments: ["Agenda", "Estoque", "Follow Up", "Relatórios", "Cadastro de Pacientes", "Relatório Profissional"],
  fixed_costs: ["Custos", "Dashboard", "Metas"], revenues: ["Receitas", "Dashboard", "Metas"],
  receipts: ["Recibos de Pagamento"], professional_receipts: ["Pagamento Profissional"], monthly_goals: ["Metas", "Dashboard", "Relatório Profissional"],
  financial_entries: ["Agenda", "Estoque", "Relatórios", "Lançamento de Procedimentos", "Pagamento Profissional", "Relatório Profissional", "Dashboard", "Metas"],
  followup_rules: ["Follow Up"], followup_contacts: ["Follow Up"], followup_logs: ["Follow Up"]
};
const writeTabs: Record<string, string[]> = {
  patients: ["Cadastro de Pacientes", "Agenda"], professionals: ["Cadastro de Profissionais"], procedures: ["Cadastro de Procedimentos"], services: ["Cadastro de Serviços"],
  inventory: ["Estoque", "Agenda"], gifts: ["Estoque", "Agenda"], appointments: ["Agenda"], fixed_costs: ["Custos"], revenues: ["Receitas"],
  receipts: ["Recibos de Pagamento"], professional_receipts: ["Pagamento Profissional"], monthly_goals: ["Metas"], financial_entries: ["Lançamento de Procedimentos", "Pagamento Profissional"],
  followup_rules: ["Follow Up"], followup_contacts: ["Follow Up"], followup_logs: ["Follow Up"]
};
export const standardEntities = Object.keys(writeTabs).filter(entity => writeTabs[entity].some(tab => standardTabs.includes(tab)));
export function canReadEntity(access: Access, entity: string) { return (readTabs[entity] ?? []).some(tab => canAccessTab(access, tab)); }
export function canWriteEntity(access: Access, entity: string) { return (writeTabs[entity] ?? []).some(tab => canAccessTab(access, tab)); }
export function userSnapshotKey(user: AppUser) {
  if (user.login === "admin" && (!user.id || user.id === "primary-admin")) return "avvi.data.snapshot.v1";
  if (user.login === "avviclinica" && (!user.id || user.id === "builtin-standard") && !user.revision) return "avvi.data.snapshot.standard.v1";
  return `avvi.data.snapshot.user.${encodeURIComponent(user.id ?? user.login)}.${user.revision ?? 0}.v1`;
}
