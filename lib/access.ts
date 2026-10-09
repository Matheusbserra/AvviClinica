export type AppRole = "admin" | "standard";
export type AppUser = { login: string; role: AppRole };
export const standardTabs = ["Agenda", "Estoque", "Follow Up", "Custos", "Cadastro de Procedimentos", "Cadastro de Serviços", "Cadastro de Profissionais", "Cadastro de Pacientes"];
export function canAccessTab(role: AppRole, tab: string) { return role === "admin" || standardTabs.includes(tab); }
export const standardEntities = ["patients", "professionals", "procedures", "services", "inventory", "gifts", "appointments", "fixed_costs", "followup_rules", "followup_contacts", "followup_logs"];
export function canReadEntity(role: AppRole, entity: string) { return role === "admin" || standardEntities.includes(entity) || entity === "financial_entries"; }
