import type { Appointment, ClosedAccount, ImportedPatientPackage, Patient } from "./types";

export type PackageSessionUse = {
  id: string; sourceAppointmentId: string; sourceAccountId: string; purchaseKey: string;
  packageId: string; packageName: string; serviceId: string; serviceName: string; quantity: number;
};
export type PackageSessionBalance = Omit<PackageSessionUse, "id" | "quantity"> & {
  id: string; purchasedOn: string; expiresOn?: string; total: number; used: number; remaining: number;
};
const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const key = (value: Pick<PackageSessionUse, "sourceAppointmentId" | "sourceAccountId" | "purchaseKey" | "serviceId">) => JSON.stringify([value.sourceAppointmentId, value.sourceAccountId, value.purchaseKey, value.serviceId]);
export function validPackageSessionUses(value: unknown): value is PackageSessionUse[] {
  if (!Array.isArray(value) || value.length > 100) return false;
  return value.every(item => item && ["id", "sourceAppointmentId", "sourceAccountId", "purchaseKey", "packageId", "packageName", "serviceId", "serviceName"].every(field => typeof item[field] === "string" && item[field].trim() && item[field].length <= 500)
    && Number.isSafeInteger(item.quantity) && item.quantity > 0 && item.quantity <= 10000)
    && new Set(value.map(item => item.id)).size === value.length && new Set(value.map(key)).size === value.length;
}
export function packageExpiry(date: string, months: number) {
  if (!months) return undefined;
  const [year, month, day] = date.split("-").map(Number);
  const end = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(day, last));
  return end.toISOString().slice(0, 10);
}
function purchases(appointments: Appointment[], patientId?: string) {
  const balances = new Map<string, PackageSessionBalance>();
  for (const appointment of appointments) {
    const account = appointment.closedAccount;
    if (!appointment.accountClosed || !account || patientId && appointment.patientId !== patientId) continue;
    const lines = account.procedureLines ?? [];
    const gross = round(lines.reduce((sum, line) => sum + line.quantity * line.servicePrice, 0));
    const discount = account.commercialDiscount ?? lines.reduce((sum, line) => sum + (line.discount ?? 0), 0);
    const paid = round((account.payments ?? []).reduce((sum, payment) => sum + payment.amount, 0));
    if (paid < round(Math.max(0, gross - discount))) continue;
    for (const line of lines) {
      if (!line.packageId || !line.serviceId || !Number.isSafeInteger(line.quantity) || line.quantity <= 0) continue;
      const source = { sourceAppointmentId: appointment.id, sourceAccountId: account.id, purchaseKey: line.packagePurchaseKey ?? `legacy:${line.packageId}`, packageId: line.packageId, packageName: line.packageName || "Pacote", serviceId: line.serviceId, serviceName: line.manualProcedure || "Serviço" };
      const id = key(source), previous = balances.get(id), total = (previous?.total ?? 0) + line.quantity;
      balances.set(id, { ...source, id, purchasedOn: account.date, expiresOn: packageExpiry(account.date, line.packageValidityMonths ?? 0), total, used: 0, remaining: total });
    }
  }
  return balances;
}
// The paid sale snapshots grant sessions, never the current editable catalogue.
// Excluding the edited appointment returns only its own previously consumed units.
export function patientPackageBalances(appointments: Appointment[], patientId: string, editingAppointmentId?: string): PackageSessionBalance[] {
  const balances = purchases(appointments, patientId);
  for (const appointment of appointments) {
    if (!appointment.accountClosed || appointment.id === editingAppointmentId || appointment.patientId !== patientId) continue;
    for (const use of appointment.closedAccount?.packageSessionUses ?? []) {
      const balance = balances.get(key(use));
      if (balance) { balance.used += use.quantity; balance.remaining = balance.total - balance.used; }
    }
  }
  return [...balances.values()];
}
export function packageSessionError(appointments: Appointment[]) {
  const byId = new Map(appointments.map(item => [item.id, item])), balances = purchases(appointments);
  for (const appointment of appointments) {
    if (!appointment.accountClosed) continue;
    const account = appointment.closedAccount;
    if (account?.packageSessionUses === undefined) continue;
    if (!validPackageSessionUses(account.packageSessionUses)) return "Confira os pacotes e as sessões utilizadas.";
    for (const use of account.packageSessionUses) {
      const source = byId.get(use.sourceAppointmentId), balance = balances.get(key(use));
      if (!balance || source?.patientId !== appointment.patientId || balance.packageId !== use.packageId) return "O pacote utilizado precisa estar pago e pertencer a este paciente. Restaure a venda ou remova a utilização vinculada.";
      if (account.date < balance.purchasedOn || balance.expiresOn && account.date > balance.expiresOn) return "A sessão está fora da validade do pacote.";
      balance.used += use.quantity;
      if (balance.used > balance.total) return "O pacote não possui sessões suficientes. Atualize os dados e confira o saldo.";
    }
  }
  return "";
}
export function hasPackageSessionData(appointment?: Appointment) {
  return !!appointment?.closedAccount && (!!appointment.closedAccount.packageSessionUses?.length || appointment.closedAccount.procedureLines?.some(line => !!line.packageId));
}
export function isPackageSessionTreatment(account?: ClosedAccount) {
  return !!account?.packageSessionUses?.some(use => use.quantity > 0);
}

export function validImportedPatientPackages(value: unknown): value is ImportedPatientPackage[] {
  const date = (value: unknown): value is string => typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(value + "T12:00:00Z")) && new Date(value + "T12:00:00Z").toISOString().slice(0,10) === value;
  return Array.isArray(value) && value.length <= 500 && new Set(value.map(item => item?.id)).size === value.length && value.every(item => item && item.source === "legacy-csv"
    && ["id", "name"].every(key => typeof item[key] === "string" && item[key].trim() && item[key].length <= 300)
    && date(item.purchasedOn) && date(item.expiresOn) && item.expiresOn >= item.purchasedOn
    && Number.isSafeInteger(item.remainingSessions) && item.remainingSessions >= 0 && item.remainingSessions <= 10000
    && Number.isFinite(item.saleValue) && item.saleValue >= 0 && item.saleValue <= 1e9 && Math.abs(round(item.saleValue) - item.saleValue) < 1e-7
    && typeof item.professionalName === "string" && item.professionalName.length <= 200
    && Object.keys(item).every(key => ["id","name","purchasedOn","expiresOn","remainingSessions","saleValue","professionalName","source"].includes(key)));
}

// Imported balances are read-only in patient forms. Old open tabs must not erase
// them when saving registration fields; new imported entries require an admin.
export function preserveImportedPatientPackages(previous: Patient | undefined, next: Patient, admin: boolean) {
  if (next.importedPackages !== undefined && !validImportedPatientPackages(next.importedPackages)) throw new Error("Pacotes importados inválidos.");
  const stored = previous?.importedPackages ?? [], incoming = next.importedPackages ?? [];
  const existing = new Map(stored.map(item => [item.id, item]));
  for (const item of incoming) {
    const old = existing.get(item.id);
    if (!old && !admin) throw new Error("Somente o administrador pode importar pacotes.");
    if (old && Object.keys(old).some(key => old[key as keyof ImportedPatientPackage] !== item[key as keyof ImportedPatientPackage])) throw new Error("Os saldos importados não podem ser alterados no cadastro.");
    if (!old) existing.set(item.id,item);
  }
  if (existing.size > 500) throw new Error("Limite de pacotes importados por paciente excedido.");
  if (!existing.size && next.importedPackages === undefined && previous?.importedPackages === undefined) return next;
  return { ...next, importedPackages: [...existing.values()] };
}

export type PatientActivePackage = { id: string; name: string; purchasedOn: string; expiresOn?: string; imported: boolean; professionalName?: string; items: {name:string;remaining:number}[] };
export function patientActivePackages(patient: Patient, appointments: Appointment[], today: string): PatientActivePackage[] {
  const result: PatientActivePackage[] = (patient.importedPackages ?? []).filter(item => item.remainingSessions > 0 && item.purchasedOn <= today && item.expiresOn >= today).map(item => ({id:item.id,name:item.name,purchasedOn:item.purchasedOn,expiresOn:item.expiresOn,imported:true,professionalName:item.professionalName,items:[{name:"Sessões restantes",remaining:item.remainingSessions}]}));
  const groups = new Map<string, PatientActivePackage>();
  for (const balance of patientPackageBalances(appointments,patient.id)) {
    if (balance.remaining <= 0 || balance.purchasedOn > today || balance.expiresOn && balance.expiresOn < today) continue;
    const id = JSON.stringify([balance.sourceAppointmentId,balance.sourceAccountId,balance.purchaseKey,balance.packageId]);
    const group = groups.get(id) ?? {id,name:balance.packageName,purchasedOn:balance.purchasedOn,expiresOn:balance.expiresOn,imported:false,items:[]};
    group.items.push({name:balance.serviceName,remaining:balance.remaining}); groups.set(id,group);
  }
  return [...result,...groups.values()].sort((a,b) => (a.expiresOn ?? "9999").localeCompare(b.expiresOn ?? "9999") || a.name.localeCompare(b.name,"pt-BR"));
}
