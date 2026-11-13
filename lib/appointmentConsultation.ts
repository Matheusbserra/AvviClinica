import { addDays, format, isValid, parse, parseISO } from "date-fns";
import { isAbsence } from "./agendaAvailability";
import { originalAppointmentNotes } from "./appointmentNotes";
import { appointmentServices } from "./appointmentServices";
import { checkoutTotals, distributeCheckoutDiscount, moneyRound } from "./checkout";
import { matchesSearch } from "./search";
import type { Appointment, FinancialEntry, Patient, Procedure, Professional, Service } from "./types";

export type AppointmentConsultationFilters = {
  start: string;
  end: string;
  patientField: "name" | "cpf" | "phone" | "email";
  patient: string;
  category: string;
  service: string;
  professional: string;
  status: string;
  account: string;
};

export type AppointmentConsultationData = {
  appointments: Appointment[];
  patients: Patient[];
  professionals: Professional[];
  services: Service[];
  procedures: Procedure[];
  entries: FinancialEntry[];
};

const clinicDay = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" });
const clinicTime = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" });
const clinicTimeWithSeconds = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit", second: "2-digit" });

export function displayConsultationDay(day: string) {
  return day.split("-").reverse().join("/");
}

export function consultationDateKey(value: string) {
  if (!/^\d{2}\/\d{2}\/\d{4}$/.test(value)) return "";
  const date = parse(value, "dd/MM/yyyy", new Date());
  return isValid(date) ? format(date, "yyyy-MM-dd") : "";
}

export function defaultConsultationFilters(now: Date): AppointmentConsultationFilters {
  const start = clinicDay.format(now);
  const end = format(addDays(parseISO(start), 10), "yyyy-MM-dd");
  return { start, end, patientField: "name", patient: "", category: "", service: "", professional: "", status: "", account: "" };
}

export function consultationReportTime(now: Date) {
  return `${displayConsultationDay(clinicDay.format(now))} às ${clinicTime.format(now)}`;
}

function registrationTime(id: string) {
  // Locally generated identifiers include the creation instant. Imported IDs use other formats.
  const match = /^appointment-(\d{13})-[a-f\d]{1,14}$/.exec(id);
  if (!match) return "";
  const date = new Date(Number(match[1]));
  return `${displayConsultationDay(clinicDay.format(date))} ${clinicTimeWithSeconds.format(date)}`;
}

export function consultationDuration(minutes: number) {
  if (!Number.isFinite(minutes) || minutes < 0) return "—";
  if (minutes <= 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? `${hours}h e ${remainder} min` : `${hours}h`;
}

function matchesPatient(patient: Patient | undefined, field: AppointmentConsultationFilters["patientField"], input: string) {
  const query = input.trim();
  if (!query) return true;
  const value = patient?.[field] ?? "";
  if (field === "cpf" || field === "phone") {
    const digits = query.replace(/\D/g, "");
    return Boolean(digits) && value.replace(/\D/g, "").includes(digits);
  }
  return matchesSearch(value, query);
}

export function appointmentConsultationRows(data: AppointmentConsultationData, filters: AppointmentConsultationFilters) {
  const patients = new Map(data.patients.map(patient => [patient.id, patient]));
  const professionals = new Map(data.professionals.map(professional => [professional.id, professional.name]));
  const services = new Map(data.services.map(service => [service.id, service]));
  const procedures = new Map(data.procedures.map(procedure => [procedure.id, procedure]));
  const accountsById = new Map<string, FinancialEntry>();
  const accountsByAppointment = new Map<string, FinancialEntry>();

  for (const entry of data.entries) {
    if (!entry.accountClosed || entry.sourceAccountId) continue;
    accountsById.set(entry.id, entry);
    if (entry.appointmentId && !accountsByAppointment.has(entry.appointmentId)) accountsByAppointment.set(entry.appointmentId, entry);
  }

  return data.appointments.flatMap(appointment => {
    const date = appointment.startsAt.slice(0, 10);
    if (date < filters.start || date > filters.end || isAbsence(appointment) || appointment.eventType === "Registrar Liberação de Horário") return [];
    if ((filters.professional && appointment.professionalId !== filters.professional) || (filters.status && appointment.status !== filters.status)) return [];

    const patient = patients.get(appointment.patientId ?? "");
    if (!matchesPatient(patient, filters.patientField, filters.patient)) return [];

    const account = appointment.closedAccount ?? accountsById.get(appointment.financialEntryId ?? "") ?? accountsByAppointment.get(appointment.id);
    const closed = appointment.accountClosed ?? Boolean(account);
    if (filters.account && (filters.account === "closed") !== closed) return [];

    const savedService = services.get(appointment.serviceId ?? "");
    const scheduled = appointmentServices(appointment, savedService ? [savedService] : []);
    const legacyProcedure = procedures.get(appointment.procedureId ?? "");
    const accountLines = closed ? account?.procedureLines ?? [] : [];
    const billedItems = accountLines.length ? accountLines : closed && account ? [account] : [];
    const lineServices = [
      ...scheduled.map(item => ({ serviceId: item.serviceId, category: services.get(item.serviceId)?.category, name: item.name })),
      ...billedItems.map(line => {
        const serviceId = "serviceId" in line ? line.serviceId : undefined;
        const service = services.get(serviceId ?? "");
        const procedure = procedures.get(line.procedureId ?? "");
        return { serviceId, category: service?.category ?? procedure?.category, name: line.manualProcedure || service?.name || procedure?.name };
      }),
    ];
    if (legacyProcedure) lineServices.push({ serviceId: undefined, category: legacyProcedure.category, name: legacyProcedure.name });
    if ((filters.category || filters.service) && !lineServices.some(line => (!filters.category || line.category === filters.category) && (!filters.service || line.serviceId === filters.service))) return [];

    let value = scheduled.length ? moneyRound(scheduled.reduce((sum, item) => sum + item.price, 0)) : legacyProcedure?.price ?? 0;
    if (closed && account) {
      value = accountLines.length
        ? checkoutTotals(distributeCheckoutDiscount(accountLines, account.commercialDiscount ?? accountLines.reduce((sum, line) => sum + (line.discount ?? 0), 0)), []).total
        : moneyRound(Math.max(0, account.quantity * account.servicePrice - (account.commercialDiscount ?? 0)));
    }

    return [{
      id: appointment.id,
      startsAt: appointment.startsAt,
      date: displayConsultationDay(date),
      time: appointment.startsAt.slice(11, 16),
      duration: consultationDuration(Math.round((Date.parse(appointment.endsAt) - Date.parse(appointment.startsAt)) / 60000)),
      professional: professionals.get(appointment.professionalId) ?? "—",
      service: [...new Set(lineServices.map(line => line.name).filter(Boolean))].join(" + ") || "—",
      patient: patient?.name ?? "—",
      status: appointment.status,
      notes: originalAppointmentNotes(appointment.notes ?? ""),
      registered: registrationTime(appointment.id),
      value,
    }];
  }).sort((a, b) => a.startsAt.localeCompare(b.startsAt) || a.id.localeCompare(b.id));
}
