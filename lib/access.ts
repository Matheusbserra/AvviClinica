export type AppRole = "admin" | "standard";
export const appTabs = ["Agenda", "Estoque", "Follow Up", "Estratégias", "Anamnese", "Ultraformer MPT", "Relatórios", "Dashboard", "Receitas", "Lançamento de Procedimentos", "Pagamento Profissional", "Relatório Profissional", "Recibos de Pagamento", "Nota Fiscal", "Custos", "Cadastro de Procedimentos", "Cadastro de Serviços", "Cadastro de Profissionais", "Cadastro de Pacientes", "Metas", "Contas"] as const;
export type AppTab = typeof appTabs[number];
export type AppUser = { id?: string; name?: string; login: string; role: AppRole; tabs?: string[]; revision?: number; professionalReport?: { professionalIds: string[] }; professionalRegistration?: { professionalIds: string[] } };
export type ProfessionalScope = { professionalIds: string[] };
export const professionalAccessTabs = ["Relatório Profissional", "Cadastro de Profissionais", "Estratégias"];
// Older accounts had two independent selections. Their intersection preserves
// restrictions while the account editor now saves one selection for all three tabs.
export function professionalScope(user: AppUser): ProfessionalScope | null {
  if (user.role === "admin") return null;
  const scopes = [user.professionalReport, user.professionalRegistration].filter((scope): scope is ProfessionalScope => !!scope);
  if (!scopes.length) return null;
  return { professionalIds: [...new Set(scopes[0].professionalIds)].filter(id => scopes.every(scope => scope.professionalIds.includes(id))) };
}
export function canAccessProfessional(user: AppUser, professionalId: string) {
  const scope = professionalScope(user);
  return !scope || scope.professionalIds.includes(professionalId);
}
export const standardTabs: string[] = ["Agenda", "Estoque", "Follow Up", "Custos", "Cadastro de Procedimentos", "Cadastro de Serviços", "Cadastro de Profissionais", "Cadastro de Pacientes"];
type Access = AppRole | AppUser;
export function canAccessTab(access: Access, tab: string) {
  const role = typeof access === "string" ? access : access.role;
  if (!appTabs.includes(tab as AppTab)) return false;
  return role === "admin" || (tab !== "Contas" && (typeof access === "string" ? standardTabs : access.tabs ?? standardTabs).includes(tab));
}
export function hasLimitedProfessionalReport(access: Access) { return typeof access !== "string" && !!professionalScope(access); }
export function hasFinancialAccess(access: Access) { return ["Dashboard", "Metas", "Relatórios", "Lançamento de Procedimentos", "Pagamento Profissional", "Relatório Profissional"].some(tab => canAccessTab(access, tab) && (tab !== "Relatório Profissional" || !hasLimitedProfessionalReport(access))); }
const readTabs: Record<string, string[]> = {
  strategies: ["Estratégias"],
  anamneses: ["Anamnese"],
  ultraformer_tips: ["Ultraformer MPT"],
  patients: ["Anamnese", "Dashboard", "Metas", "Ultraformer MPT", "Agenda", "Estoque", "Follow Up", "Relatórios", "Lançamento de Procedimentos", "Cadastro de Pacientes", "Recibos de Pagamento", "Relatório Profissional", "Nota Fiscal"],
  professionals: ["Estratégias", "Anamnese", "Ultraformer MPT", "Agenda", "Estoque", "Follow Up", "Relatórios", "Lançamento de Procedimentos", "Pagamento Profissional", "Relatório Profissional", "Cadastro de Profissionais", "Cadastro de Pacientes", "Dashboard", "Metas", "Recibos de Pagamento", "Nota Fiscal"],
  procedures: ["Agenda", "Estoque", "Relatórios", "Relatório Profissional", "Lançamento de Procedimentos", "Cadastro de Procedimentos"],
  services: ["Dashboard", "Metas", "Agenda", "Follow Up", "Relatórios", "Cadastro de Serviços", "Relatório Profissional", "Nota Fiscal"],
  inventory: ["Agenda", "Estoque"], gifts: ["Agenda", "Estoque"], appointments: ["Dashboard", "Metas", "Agenda", "Estoque", "Follow Up", "Relatórios", "Cadastro de Pacientes", "Relatório Profissional", "Nota Fiscal"],
  fixed_costs: ["Custos", "Dashboard", "Metas"], revenues: ["Receitas", "Dashboard", "Metas"],
  receipts: ["Recibos de Pagamento"], professional_receipts: ["Pagamento Profissional"], monthly_goals: ["Metas", "Dashboard", "Relatório Profissional"],
  financial_entries: ["Agenda", "Estoque", "Relatórios", "Lançamento de Procedimentos", "Pagamento Profissional", "Relatório Profissional", "Dashboard", "Metas"],
  followup_rules: ["Follow Up"], followup_contacts: ["Follow Up"], followup_logs: ["Follow Up"]
};
const writeTabs: Record<string, string[]> = {
  strategies: ["Estratégias"],
  anamneses: ["Anamnese"],
  ultraformer_tips: ["Ultraformer MPT"],
  patients: ["Cadastro de Pacientes", "Agenda"], professionals: ["Cadastro de Profissionais"], procedures: ["Cadastro de Procedimentos"], services: ["Cadastro de Serviços"],
  inventory: ["Estoque", "Agenda"], gifts: ["Estoque", "Agenda"], appointments: ["Agenda"], fixed_costs: ["Custos"], revenues: ["Receitas"],
  receipts: ["Recibos de Pagamento"], professional_receipts: ["Pagamento Profissional"], monthly_goals: ["Metas"], financial_entries: ["Lançamento de Procedimentos", "Pagamento Profissional"],
  followup_rules: ["Follow Up"], followup_contacts: ["Follow Up"], followup_logs: ["Follow Up"]
};
export const standardEntities = Object.keys(writeTabs).filter(entity => writeTabs[entity].some(tab => standardTabs.includes(tab)));
export function canReadEntity(access: Access, entity: string) { return (readTabs[entity] ?? []).some(tab => canAccessTab(access, tab) && (tab !== "Relatório Profissional" || !hasLimitedProfessionalReport(access))); }
export function canWriteEntity(access: Access, entity: string) { return (writeTabs[entity] ?? []).some(tab => canAccessTab(access, tab)); }
export function userSnapshotKey(user: AppUser) {
  if (user.login === "admin" && (!user.id || user.id === "primary-admin")) return "avvi.data.snapshot.v1";
  if (user.login === "avviclinica" && (!user.id || user.id === "builtin-standard") && !user.revision) return "avvi.data.snapshot.standard.v1";
  return `avvi.data.snapshot.user.${encodeURIComponent(user.id ?? user.login)}.${user.revision ?? 0}.v1`;
}

export function canManageProfessional(user: AppUser, professionalId: string) {
  return canAccessTab(user, "Cadastro de Profissionais") && canAccessProfessional(user, professionalId);
}
export function registrationOnly(user: AppUser) {
  return user.role === "standard" && !["Anamnese", "Ultraformer MPT", "Agenda", "Estoque", "Follow Up", "Relatórios", "Lançamento de Procedimentos", "Pagamento Profissional", "Cadastro de Pacientes", "Dashboard", "Metas", "Recibos de Pagamento"].some(tab => canAccessTab(user, tab));
}
