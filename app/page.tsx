"use client";

import { Fragment } from "react";
import type { ElementType, ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { addDays, eachDayOfInterval, endOfMonth, format, getDate, isSameDay, parseISO, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Activity,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  Download,
  Eye,
  EyeOff,
  FileText,
  Goal,
  LayoutDashboard,
  LogOut,
  Plus,
  HandCoins,
  ReceiptText,
  Save,
  Search,
  Settings,
  Stethoscope,
  Pencil,
  Trash2,
  UserPlus,
  Users,
  WalletCards,
  X
} from "lucide-react";
import jsPDF from "jspdf";
import { appointments as seedAppointments, financialEntries as seedFinancialEntries, fixedCosts as seedFixedCosts, patients as seedPatients, procedures as seedProcedures, professionals as seedProfessionals, receipts as seedReceipts } from "@/lib/seed";
import { catalogProcedures } from "@/lib/catalogProcedures";
import { importedClients } from "@/lib/importedClients";
import { importedRevenues } from "@/lib/importedRevenues";
import { importedCosts } from "@/lib/importedCosts";
import { applyProcedureCostOverrides } from "@/lib/procedureCosts";
import { calculateEntry, currency, monthKey, percent, summarizeMonth } from "@/lib/calculations";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { appDataTableMissing, selectEntityState, syncEntity, syncEntityDiff } from "@/lib/database";
import type { Appointment, AppointmentStatus, DiscountSplit, FinancialEntry, FixedCost, FixedCostStatus, Patient, PaymentItem, PaymentMethod, Procedure, ProcedureLine, Professional, ProfessionalPaymentReceipt, Receipt, RevenueEntry, ViewMode } from "@/lib/types";
import type { MonthlyGoals as StoredMonthlyGoals } from "@/lib/database";

type Tab = "Agenda" | "Dashboard" | "Receitas" | "Lançamento de Procedimentos" | "Pagamento Profissional" | "Relatório Profissional" | "Recibos de Pagamento" | "Cadastro de Procedimentos" | "Cadastro de Profissionais" | "Cadastro de Pacientes" | "Metas" | "Custos";
type MonthlyGoals = StoredMonthlyGoals;
type DataSnapshot = {
  patients: Patient[];
  professionals: Professional[];
  procedures: Procedure[];
  appointments: Appointment[];
  financial_entries: FinancialEntry[];
  revenues: RevenueEntry[];
  fixed_costs: FixedCost[];
  receipts: Receipt[];
  professional_receipts: ProfessionalPaymentReceipt[];
  monthly_goals: MonthlyGoals[];
};
type LocalSnapshot = { savedAt: string; data: DataSnapshot };

const localSnapshotKey = "avvi.data.snapshot.v1";

const tabs: { id: Tab; icon: ElementType }[] = [
  { id: "Agenda", icon: CalendarDays },
  { id: "Dashboard", icon: LayoutDashboard },
  { id: "Receitas", icon: CircleDollarSign },
  { id: "Lançamento de Procedimentos", icon: WalletCards },
  { id: "Pagamento Profissional", icon: HandCoins },
  { id: "Relatório Profissional", icon: BarChart3 },
  { id: "Recibos de Pagamento", icon: ReceiptText },
  { id: "Cadastro de Procedimentos", icon: Stethoscope },
  { id: "Cadastro de Profissionais", icon: UserPlus },
  { id: "Cadastro de Pacientes", icon: Users },
  { id: "Metas", icon: Goal },
  { id: "Custos", icon: Settings },
];

const statuses: AppointmentStatus[] = ["Agendado", "Confirmado", "Compareceu", "Faltou", "Cancelado", "Reagendado", "Finalizado"];
const paymentMethods: PaymentMethod[] = ["Pix", "Débito", "Crédito", "Dinheiro"];
const discountSplits: DiscountSplit[] = ["Empresa assume", "Profissional assume", "Empresa e profissional dividem"];
const eventOptions = ["Novo Agendamento", "Registrar Ausência", "Registrar Liberação de Horário", "Venda de Produto", "Pré-venda de Produto", "Venda e Consumo de Pacote", "Registro de Crédito de Cliente"];
const hours = Array.from({ length: 13 }, (_, index) => index + 8);
const cardBrands: NonNullable<PaymentItem["cardBrand"]>[] = ["Mastercard", "Visa", "Elo"];
const paymentTerms = Array.from({ length: 12 }, (_, index) => index + 1);
const cardFeeRates: Record<NonNullable<PaymentItem["cardBrand"]>, number[]> = {
  Mastercard: [3.13, 4.14, 4.74, 5.34, 5.94, 6.54, 7.42, 8.02, 8.62, 9.22, 9.82, 10.42],
  Visa: [3.13, 4.14, 4.74, 5.34, 5.94, 6.54, 7.42, 8.02, 8.62, 9.22, 9.82, 10.42],
  Elo: [3.63, 4.64, 5.24, 5.84, 6.44, 7.04, 7.92, 8.52, 9.12, 9.72, 10.32, 10.92]
};

const blankPayment: PaymentItem = { id: "pay-new", method: "Pix", amount: 0, fee: 0, discount: 0, installments: 1 };
const procedurePaymentMethods: PaymentMethod[] = [...paymentMethods, "Crédito Futuro" as PaymentMethod];
function id(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function savePatientRecord(form: Patient, patients: Patient[]) {
  const saved = {
    ...form,
    id: form.id || id("patient"),
    name: form.name.trim() || "Paciente sem nome",
    futureCredit: Number(form.futureCredit) || 0,
    loyaltyPoints: Number(form.loyaltyPoints) || 0,
    registrationDate: form.registrationDate || todayKey()
  };
  return form.id ? patients.map((patient) => patient.id === form.id ? saved : patient) : [saved, ...patients];
}

function todayKey() {
  return format(new Date(), "yyyy-MM-dd");
}

function isDateInPeriod(date: string, start: string, end: string) {
  if (!date) return false;
  return (!start || date >= start) && (!end || date <= end);
}

function monthPeriod(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return { start: "", end: "" };
  }
  const start = `${month}-01`;
  return { start, end: format(endOfMonth(parseISO(start)), "yyyy-MM-dd") };
}

function monthsInPeriod(start: string, end: string) {
  if (!start || !end) return [];
  const months: string[] = [];
  let cursor = start.slice(0, 7);
  const last = end.slice(0, 7);
  while (cursor <= last) {
    months.push(cursor);
    cursor = format(addDays(endOfMonth(parseISO(`${cursor}-01`)), 1), "yyyy-MM");
  }
  return months;
}

function summarizePeriod(revenues: RevenueEntry[], costs: FixedCost[], start: string, end: string) {
  const periodRevenues = revenues.filter((revenue) => isDateInPeriod(revenue.paymentDate, start, end));
  const periodCosts = costs.filter((cost) => isDateInPeriod(cost.dueDate, start, end) && cost.status !== "Pendente");
  const revenue = periodRevenues.reduce((sum, item) => sum + item.total, 0);
  const discounts = periodRevenues.reduce((sum, item) => sum + Math.abs(item.discount || 0), 0);
  const expenses = periodCosts.reduce((sum, item) => sum + item.value, 0);
  return { revenue, fees: 0, discounts, products: 0, professionals: 0, company: revenue, expenses, result: revenue - expenses };
}

function PeriodFilter({ start, end, month, onStartChange, onEndChange, onMonthChange }: { start: string; end: string; month: string; onStartChange: (value: string) => void; onEndChange: (value: string) => void; onMonthChange: (value: string) => void }) {
  return (
    <div className="grid gap-3 md:grid-cols-3">
      <FormField label="Início">
        <input className="input" type="date" value={start} onChange={(event) => onStartChange(event.target.value)} />
      </FormField>
      <FormField label="Fim">
        <input className="input" type="date" value={end} onChange={(event) => onEndChange(event.target.value)} />
      </FormField>
      <FormField label="Escolher mês">
        <input className="input" type="month" value={month} onChange={(event) => onMonthChange(event.target.value)} />
      </FormField>
    </div>
  );
}

function futureCreditUsed(entry?: Pick<FinancialEntry, "payments">) {
  return entry?.payments.reduce((sum, payment) => payment.method === "Crédito Futuro" ? sum + Number(payment.amount) : sum, 0) ?? 0;
}

function professionalPercentForEntry(entry: Pick<FinancialEntry, "procedureLines" | "servicePrice" | "quantity" | "professionalPercent">) {
  const lines = entry.procedureLines?.length ? entry.procedureLines : [{
    servicePrice: entry.servicePrice,
    quantity: entry.quantity,
    professionalPercent: entry.professionalPercent
  }];
  const gross = lines.reduce((sum, line) => sum + Number(line.servicePrice) * Number(line.quantity), 0);
  if (!gross) return entry.professionalPercent || 0;
  return lines.reduce((sum, line) => sum + Number(line.servicePrice) * Number(line.quantity) * Number(line.professionalPercent), 0) / gross;
}

function professionalReceiptProcedureRows(entry: FinancialEntry, procedureNameForLine: (line: ProcedureLine) => string) {
  const lines = entry.procedureLines?.length ? entry.procedureLines : [entryToLine(entry)];
  const grossTotal = lines.reduce((sum, line) => sum + Number(line.servicePrice) * Number(line.quantity), 0);
  const machineFee = entry.payments.reduce((sum, payment) => sum + Number(payment.fee || 0), 0) + Number(entry.machineFee || 0);
  const discount = Number(entry.commercialDiscount || 0) + entry.payments.reduce((sum, payment) => sum + Number(payment.discount || 0), 0);

  return lines.map((line) => {
    const gross = Number(line.servicePrice) * Number(line.quantity);
    const ratio = grossTotal ? gross / grossTotal : 0;
    const lineDiscount = discount * ratio;
    const lineFee = machineFee * ratio;
    const lineCost = Number(line.productCost) * Number(line.quantity);
    const received = Math.max(0, gross - lineDiscount);
    const profit = received - lineCost - lineFee;
    const professionalValue = Math.max(0, profit) * (Number(line.professionalPercent) / 100);

    return {
      procedure: procedureNameForLine(line),
      quantity: Number(line.quantity) || 1,
      gross,
      cost: lineCost,
      fee: lineFee,
      discount: lineDiscount,
      profit,
      professionalPercent: Number(line.professionalPercent) || 0,
      professionalValue
    };
  });
}

function calculateCardFee(amount: number, cardBrand?: PaymentItem["cardBrand"], installments?: number) {
  const brand = cardBrand ?? "Mastercard";
  const term = Math.min(12, Math.max(1, Number(installments) || 1));
  const rate = cardFeeRates[brand]?.[term - 1] ?? 0;
  return Number(((Number(amount) || 0) * rate / 100).toFixed(2));
}

function makeRevenueFromFinancialEntry(entry: FinancialEntry, patientName: string): RevenueEntry {
  const summary = calculateEntry(entry);
  const nonFuturePayments = entry.payments.filter((payment) => payment.method !== "Crédito Futuro");
  const totalPaid = Math.max(0, nonFuturePayments.reduce((sum, payment) => sum + Number(payment.amount), 0));
  const futureCreditUsedValue = entry.payments.filter((payment) => payment.method === "Crédito Futuro").reduce((sum, payment) => sum + Number(payment.amount), 0);
  return {
    id: `receita-entry-${entry.id}`,
    sourceFinancialEntryId: entry.id,
    serviceDate: entry.date,
    paymentDate: entry.date,
    paymentTime: "00:00",
    type: "Receita",
    clientName: patientName || "Cliente não informado",
    total: totalPaid,
    serviceQuantity: entry.procedureLines?.reduce((sum, line) => sum + Number(line.quantity || 0), 0) || entry.quantity,
    serviceTotal: summary.grossRevenue,
    clientCreditTotal: 0,
    clientCreditAddedTotal: 0,
    clientCreditUsedTotal: futureCreditUsedValue ? -Math.abs(futureCreditUsedValue) : 0,
    discount: summary.discount ? -Math.abs(summary.discount) : 0,
    discountReason: "",
    creditTotal: nonFuturePayments.filter((payment) => payment.method === "Crédito").reduce((sum, payment) => sum + Number(payment.amount), 0),
    debitTotal: nonFuturePayments.filter((payment) => payment.method === "Débito").reduce((sum, payment) => sum + Number(payment.amount), 0),
    cashTotal: nonFuturePayments.filter((payment) => payment.method === "Dinheiro").reduce((sum, payment) => sum + Number(payment.amount), 0),
    pixTotal: nonFuturePayments.filter((payment) => payment.method === "Pix").reduce((sum, payment) => sum + Number(payment.amount), 0)
  };
}

function makeMachineFeeCost(entry: FinancialEntry, patientName: string): FixedCost | null {
  const fee = calculateEntry(entry).machineFee;
  if (!fee) return null;
  return {
    id: `taxa-maquininha-${entry.id}`,
    sourceFinancialEntryId: entry.id,
    name: `Taxa maquininha - ${patientName || "cliente"}`,
    category: "Custos variáveis",
    costType: "Taxa maquininha",
    professionalName: "",
    supplier: "Maquininha",
    value: fee,
    dueDate: entry.date,
    status: "Pago",
    paymentMethod: "Pix",
    replicateMonths: 0,
    creditInstallments: 1,
    notes: `Taxa da maquininha do lançamento ${entry.id}`
  };
}

function mergeProcedures(current: Procedure[], imported: Procedure[]) {
  const names = new Set(current.map((procedure) => normalizeName(procedure.name)));
  return applyProcedureCostOverrides([...current, ...imported.filter((procedure) => !names.has(normalizeName(procedure.name)))]);
}

function mergePatients(current: Patient[], imported: Patient[]) {
  const keys = new Set(current.map(patientKey));
  return [...current, ...imported.filter((patient) => {
    const key = patientKey(patient);
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  })];
}

function mergeRevenues(current: RevenueEntry[], imported: RevenueEntry[]) {
  const keys = new Set(current.map(revenueKey));
  return [...current, ...imported.filter((revenue) => {
    const key = revenueKey(revenue);
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  })];
}

function mergeCosts(current: FixedCost[], imported: FixedCost[]) {
  const keys = new Set(current.map(costKey));
  return [...current, ...imported.filter((cost) => {
    const key = costKey(cost);
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  })];
}

function revenueKey(revenue: RevenueEntry) {
  return `${revenue.serviceDate}-${revenue.paymentDate}-${revenue.paymentTime}-${normalizeName(revenue.clientName)}-${revenue.total}`;
}

function costKey(cost: FixedCost) {
  return `${cost.dueDate}-${normalizeName(cost.name)}-${cost.value}-${cost.paymentMethod}`;
}

function patientKey(patient: Patient) {
  return patient.cpf || `${normalizeName(patient.name)}-${patient.phone.replace(/\D/g, "")}`;
}

function normalizeName(value: string) {
  return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function makeMonthlyGoal(month: string, professionals: Professional[]): MonthlyGoals {
  return {
    month,
    companyGoal: 125000,
    professionalGoals: Object.fromEntries(professionals.map((professional) => [professional.id, professional.monthlyGoal || 0]))
  };
}

function getMonthlyGoal(goals: MonthlyGoals[], month: string, professionals: Professional[]) {
  return goals.find((goal) => goal.month === month) ?? makeMonthlyGoal(month, professionals);
}

function getProfessionalGoal(goals: MonthlyGoals[], month: string, professional: Professional) {
  return getMonthlyGoal(goals, month, [professional]).professionalGoals[professional.id] ?? professional.monthlyGoal ?? 0;
}

function upsertMonthlyGoal(goals: MonthlyGoals[], goal: MonthlyGoals) {
  return goals.some((item) => item.month === goal.month) ? goals.map((item) => item.month === goal.month ? goal : item) : [...goals, goal];
}

function applyRemoteList<T extends { id?: string; month?: string }>(current: T[], recordId: string, record: T, remove: boolean) {
  const matches = (item: T) => (item.id || item.month) === recordId;
  if (remove) return current.filter((item) => !matches(item));
  return current.some(matches) ? current.map((item) => matches(item) ? record : item) : [record, ...current];
}

function readLocalSnapshot(): LocalSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(localSnapshotKey);
    return raw ? JSON.parse(raw) as LocalSnapshot : null;
  } catch {
    return null;
  }
}

function writeLocalSnapshot(data: DataSnapshot) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(localSnapshotKey, JSON.stringify({ savedAt: new Date().toISOString(), data }));
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("Agenda");
  const [viewMode, setViewMode] = useState<ViewMode>("Dia");
  const [selectedDate, setSelectedDate] = useState("2026-05-27");
  const [selectedMonth, setSelectedMonth] = useState("2026-05");
  const [professionalFilter, setProfessionalFilter] = useState("todos");
  const [reportFilter, setReportFilter] = useState("Todos");
  const [search, setSearch] = useState("");
  const [patients, setPatients] = useState<Patient[]>(() => mergePatients(seedPatients, importedClients));
  const [professionals, setProfessionals] = useState<Professional[]>(seedProfessionals);
  const [procedures, setProcedures] = useState<Procedure[]>(() => mergeProcedures(seedProcedures, catalogProcedures));
  const [appointments, setAppointments] = useState<Appointment[]>(seedAppointments);
  const [entries, setEntries] = useState<FinancialEntry[]>(seedFinancialEntries);
  const [revenues, setRevenues] = useState<RevenueEntry[]>(importedRevenues);
  const [costs, setCosts] = useState<FixedCost[]>(() => mergeCosts(seedFixedCosts, importedCosts));
  const [receipts, setReceipts] = useState<Receipt[]>(seedReceipts);
  const [professionalReceipts, setProfessionalReceipts] = useState<ProfessionalPaymentReceipt[]>([]);
  const [monthlyGoals, setMonthlyGoals] = useState<MonthlyGoals[]>(() => [makeMonthlyGoal("2026-05", seedProfessionals)]);
  const [selectedSlot, setSelectedSlot] = useState<{ hour: number; professionalId: string } | null>(null);
  const [selectedAppointmentId, setSelectedAppointmentId] = useState<string | null>(null);
  const [appointmentForm, setAppointmentForm] = useState(makeAppointmentForm("ana", selectedDate, 8));
  const [entryForm, setEntryForm] = useState(makeEntryForm());
  const [receiptForm, setReceiptForm] = useState(makeReceiptForm());
  const [procedureForm, setProcedureForm] = useState(makeProcedureForm());
  const [patientForm, setPatientForm] = useState(makePatientForm());
  const [professionalForm, setProfessionalForm] = useState(makeProfessionalForm());
  const [costForm, setCostForm] = useState(makeCostForm());
  const [professionalPaymentFilter, setProfessionalPaymentFilter] = useState("todos");
  const [selectedProfessionalEntryIds, setSelectedProfessionalEntryIds] = useState<string[]>([]);
  const [isAuthenticated, setIsAuthenticated] = useState(() => typeof window !== "undefined" && window.sessionStorage.getItem("avvi.session") === "active");
  const [loginForm, setLoginForm] = useState({ login: "", password: "" });
  const [loginError, setLoginError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const didHydrate = useRef(false);
  const isRemoteUpdate = useRef(false);
  const lastSyncedSnapshot = useRef<DataSnapshot | null>(null);
  const [syncError, setSyncError] = useState(() => isSupabaseConfigured ? "" : "Supabase não configurado. Preencha NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no .env.local.");

  const visibleProfessionals = professionalFilter === "todos" ? professionals : professionals.filter((professional) => professional.id === professionalFilter);
  const currentMonthSummary = useMemo(() => summarizeMonth(revenues, costs, selectedMonth), [revenues, costs, selectedMonth]);
  const previousMonthKey = previousMonth(selectedMonth);
  const previousSummary = useMemo(() => summarizeMonth(revenues, costs, previousMonthKey), [revenues, costs, previousMonthKey]);

  function applyRemoteRecord(entity: string, eventType: string, recordId: string, data: unknown) {
    const remove = eventType === "DELETE";
    if (entity === "patients") setPatients((current) => applyRemoteList(current, recordId, data as Patient, remove));
    if (entity === "professionals") setProfessionals((current) => applyRemoteList(current, recordId, data as Professional, remove));
    if (entity === "procedures") setProcedures((current) => applyRemoteList(current, recordId, data as Procedure, remove));
    if (entity === "appointments") setAppointments((current) => applyRemoteList(current, recordId, data as Appointment, remove));
    if (entity === "financial_entries") setEntries((current) => applyRemoteList(current, recordId, data as FinancialEntry, remove));
    if (entity === "revenues") setRevenues((current) => applyRemoteList(current, recordId, data as RevenueEntry, remove));
    if (entity === "fixed_costs") setCosts((current) => applyRemoteList(current, recordId, data as FixedCost, remove));
    if (entity === "receipts") setReceipts((current) => applyRemoteList(current, recordId, data as Receipt, remove));
    if (entity === "professional_receipts") setProfessionalReceipts((current) => applyRemoteList(current, recordId, data as ProfessionalPaymentReceipt, remove));
    if (entity === "monthly_goals") setMonthlyGoals((current) => applyRemoteList(current, recordId, data as MonthlyGoals, remove));

    const snapshot = lastSyncedSnapshot.current;
    if (!snapshot) return;
    lastSyncedSnapshot.current = {
      ...snapshot,
      patients: entity === "patients" ? applyRemoteList(snapshot.patients, recordId, data as Patient, remove) : snapshot.patients,
      professionals: entity === "professionals" ? applyRemoteList(snapshot.professionals, recordId, data as Professional, remove) : snapshot.professionals,
      procedures: entity === "procedures" ? applyRemoteList(snapshot.procedures, recordId, data as Procedure, remove) : snapshot.procedures,
      appointments: entity === "appointments" ? applyRemoteList(snapshot.appointments, recordId, data as Appointment, remove) : snapshot.appointments,
      financial_entries: entity === "financial_entries" ? applyRemoteList(snapshot.financial_entries, recordId, data as FinancialEntry, remove) : snapshot.financial_entries,
      revenues: entity === "revenues" ? applyRemoteList(snapshot.revenues, recordId, data as RevenueEntry, remove) : snapshot.revenues,
      fixed_costs: entity === "fixed_costs" ? applyRemoteList(snapshot.fixed_costs, recordId, data as FixedCost, remove) : snapshot.fixed_costs,
      receipts: entity === "receipts" ? applyRemoteList(snapshot.receipts, recordId, data as Receipt, remove) : snapshot.receipts,
      professional_receipts: entity === "professional_receipts" ? applyRemoteList(snapshot.professional_receipts, recordId, data as ProfessionalPaymentReceipt, remove) : snapshot.professional_receipts,
      monthly_goals: entity === "monthly_goals" ? applyRemoteList(snapshot.monthly_goals, recordId, data as MonthlyGoals, remove) : snapshot.monthly_goals
    };
  }

  useEffect(() => {
    if (!isSupabaseConfigured) {
      didHydrate.current = true;
      return;
    }

    let cancelled = false;

    async function hydrateFromSupabase() {
      try {
        const [
          dbPatientsState,
          dbProfessionalsState,
          dbProceduresState,
          dbAppointmentsState,
          dbEntriesState,
          dbRevenuesState,
          dbCostsState,
          dbReceiptsState,
          dbProfessionalReceiptsState,
          dbGoalsState
        ] = await Promise.all([
          selectEntityState("patients"),
          selectEntityState("professionals"),
          selectEntityState("procedures"),
          selectEntityState("appointments"),
          selectEntityState("financial_entries"),
          selectEntityState("revenues"),
          selectEntityState("fixed_costs"),
          selectEntityState("receipts"),
          selectEntityState("professional_receipts"),
          selectEntityState("monthly_goals")
        ]);
        if (cancelled) return;

        const dbPatients = dbPatientsState.records;
        const dbProfessionals = dbProfessionalsState.records;
        const dbProcedures = applyProcedureCostOverrides(dbProceduresState.records);
        const dbAppointments = dbAppointmentsState.records;
        const dbEntries = dbEntriesState.records;
        const dbRevenues = dbRevenuesState.records;
        const dbCosts = dbCostsState.records;
        const dbReceipts = dbReceiptsState.records;
        const dbProfessionalReceipts = dbProfessionalReceiptsState.records;
        const dbGoals = dbGoalsState.records;

        const initialPatients = mergePatients(seedPatients, importedClients);
        const initialProfessionals = seedProfessionals;
        const initialProcedures = mergeProcedures(seedProcedures, catalogProcedures);
        const initialAppointments = seedAppointments;
        const initialEntries = seedFinancialEntries;
        const initialRevenues = importedRevenues;
        const initialCosts = mergeCosts(seedFixedCosts, importedCosts);
        const initialReceipts = seedReceipts;
        const initialGoals = [makeMonthlyGoal("2026-05", seedProfessionals)];
        const isEmptyDatabase = !dbPatients.length && !dbProfessionals.length && !dbProcedures.length && !dbAppointments.length && !dbEntries.length && !dbRevenues.length && !dbCosts.length && !dbReceipts.length && !dbProfessionalReceipts.length && !dbGoals.length;
        const remoteSnapshot: DataSnapshot = {
          patients: dbPatients.length ? dbPatients : initialPatients,
          professionals: dbProfessionals.length ? dbProfessionals : initialProfessionals,
          procedures: dbProceduresState.records.length ? dbProcedures : initialProcedures,
          appointments: dbAppointments.length ? dbAppointments : initialAppointments,
          financial_entries: dbEntries.length ? dbEntries : initialEntries,
          revenues: dbRevenues.length ? dbRevenues : initialRevenues,
          fixed_costs: dbCosts.length ? dbCosts : initialCosts,
          receipts: dbReceipts.length ? dbReceipts : initialReceipts,
          professional_receipts: dbProfessionalReceipts,
          monthly_goals: dbGoals.length ? dbGoals : initialGoals
        };
        const latestRemoteUpdate = [
          dbPatientsState.latestUpdatedAt,
          dbProfessionalsState.latestUpdatedAt,
          dbProceduresState.latestUpdatedAt,
          dbAppointmentsState.latestUpdatedAt,
          dbEntriesState.latestUpdatedAt,
          dbRevenuesState.latestUpdatedAt,
          dbCostsState.latestUpdatedAt,
          dbReceiptsState.latestUpdatedAt,
          dbProfessionalReceiptsState.latestUpdatedAt,
          dbGoalsState.latestUpdatedAt
        ].filter(Boolean).sort().at(-1) ?? "";
        const savedLocalSnapshot = readLocalSnapshot();
        const localSnapshot = savedLocalSnapshot ? {
          ...savedLocalSnapshot,
          data: {
            ...savedLocalSnapshot.data,
            procedures: applyProcedureCostOverrides(savedLocalSnapshot.data.procedures)
          }
        } : null;
        const shouldUseLocalSnapshot = Boolean(localSnapshot?.savedAt && (!latestRemoteUpdate || localSnapshot.savedAt > latestRemoteUpdate));
        const hydratedSnapshot = shouldUseLocalSnapshot ? localSnapshot!.data : remoteSnapshot;

        isRemoteUpdate.current = true;
        lastSyncedSnapshot.current = shouldUseLocalSnapshot ? remoteSnapshot : hydratedSnapshot;
        setPatients(hydratedSnapshot.patients);
        setProfessionals(hydratedSnapshot.professionals);
        setProcedures(hydratedSnapshot.procedures);
        setAppointments(hydratedSnapshot.appointments);
        setEntries(hydratedSnapshot.financial_entries);
        setRevenues(hydratedSnapshot.revenues);
        setCosts(hydratedSnapshot.fixed_costs);
        setReceipts(hydratedSnapshot.receipts);
        setProfessionalReceipts(hydratedSnapshot.professional_receipts);
        setMonthlyGoals(hydratedSnapshot.monthly_goals);
        window.setTimeout(() => {
          isRemoteUpdate.current = false;
          didHydrate.current = true;
        }, 0);

        if (isEmptyDatabase) {
          await syncEntity("patients", initialPatients);
          await syncEntity("professionals", initialProfessionals);
          await syncEntity("procedures", initialProcedures);
          await syncEntity("appointments", initialAppointments);
          await syncEntity("financial_entries", initialEntries);
          await syncEntity("revenues", initialRevenues);
          await syncEntity("fixed_costs", initialCosts);
          await syncEntity("receipts", initialReceipts);
          await syncEntity("professional_receipts", []);
          await syncEntity("monthly_goals", initialGoals);
        }
        if (dbProceduresState.records.length) {
          await syncEntityDiff("procedures", dbProceduresState.records, dbProcedures);
        }
        if (shouldUseLocalSnapshot) {
          await syncEntityDiff("patients", remoteSnapshot.patients, hydratedSnapshot.patients);
          await syncEntityDiff("professionals", remoteSnapshot.professionals, hydratedSnapshot.professionals);
          await syncEntityDiff("procedures", remoteSnapshot.procedures, hydratedSnapshot.procedures);
          await syncEntityDiff("appointments", remoteSnapshot.appointments, hydratedSnapshot.appointments);
          await syncEntityDiff("financial_entries", remoteSnapshot.financial_entries, hydratedSnapshot.financial_entries);
          await syncEntityDiff("revenues", remoteSnapshot.revenues, hydratedSnapshot.revenues);
          await syncEntityDiff("fixed_costs", remoteSnapshot.fixed_costs, hydratedSnapshot.fixed_costs);
          await syncEntityDiff("receipts", remoteSnapshot.receipts, hydratedSnapshot.receipts);
          await syncEntityDiff("professional_receipts", remoteSnapshot.professional_receipts, hydratedSnapshot.professional_receipts);
          await syncEntityDiff("monthly_goals", remoteSnapshot.monthly_goals, hydratedSnapshot.monthly_goals);
          lastSyncedSnapshot.current = hydratedSnapshot;
        }
        writeLocalSnapshot(hydratedSnapshot);
        setSyncError("");
      } catch (error) {
        didHydrate.current = true;
        const message = appDataTableMissing(error)
          ? "Tabela avvi_records não encontrada no Supabase. Execute supabase/schema.sql no SQL Editor."
          : `Erro ao conectar ao Supabase: ${(error as Error).message}`;
        setSyncError(message);
      }
    }

    hydrateFromSupabase();

    const channel = supabase?.channel("avvi-records-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "avvi_records" }, (payload) => {
        const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as { entity?: string; record_id?: string; data?: unknown };
        if (!row?.entity) return;
        isRemoteUpdate.current = true;
        applyRemoteRecord(row.entity, payload.eventType, String(row.record_id), row.data);
        window.setTimeout(() => { isRemoteUpdate.current = false; }, 0);
      })
      .subscribe();

    return () => {
      cancelled = true;
      if (channel) supabase?.removeChannel(channel);
    };
  }, []);

  useEffect(() => {
    if (!didHydrate.current || isRemoteUpdate.current || !isSupabaseConfigured) return;
    const timeout = window.setTimeout(() => {
      const previous = lastSyncedSnapshot.current;
      const next: DataSnapshot = {
        patients,
        professionals,
        procedures,
        appointments,
        financial_entries: entries,
        revenues,
        fixed_costs: costs,
        receipts,
        professional_receipts: professionalReceipts,
        monthly_goals: monthlyGoals
      };
      if (!previous) {
        lastSyncedSnapshot.current = next;
        writeLocalSnapshot(next);
        return;
      }
      const syncedPrevious = previous;
      async function saveChanges() {
        await syncEntityDiff("patients", syncedPrevious.patients, next.patients);
        await syncEntityDiff("professionals", syncedPrevious.professionals, next.professionals);
        await syncEntityDiff("procedures", syncedPrevious.procedures, next.procedures);
        await syncEntityDiff("appointments", syncedPrevious.appointments, next.appointments);
        await syncEntityDiff("financial_entries", syncedPrevious.financial_entries, next.financial_entries);
        await syncEntityDiff("revenues", syncedPrevious.revenues, next.revenues);
        await syncEntityDiff("fixed_costs", syncedPrevious.fixed_costs, next.fixed_costs);
        await syncEntityDiff("receipts", syncedPrevious.receipts, next.receipts);
        await syncEntityDiff("professional_receipts", syncedPrevious.professional_receipts, next.professional_receipts);
        await syncEntityDiff("monthly_goals", syncedPrevious.monthly_goals, next.monthly_goals);
      }

      saveChanges().then(() => {
        lastSyncedSnapshot.current = next;
        writeLocalSnapshot(next);
        setSyncError("");
      }).catch((error) => {
        writeLocalSnapshot(next);
        setSyncError(`Erro ao salvar no Supabase: ${(error as Error).message}`);
      });
    }, 500);
    return () => window.clearTimeout(timeout);
  }, [patients, professionals, procedures, appointments, entries, revenues, costs, receipts, professionalReceipts, monthlyGoals]);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setIsAuthenticated(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsAuthenticated(Boolean(session));
    });
    return () => data.subscription.unsubscribe();
  }, []);

  async function handleLogin() {
    if (loginForm.login.trim().toLowerCase() === "admin" && loginForm.password === "avvi2025@") {
      setIsAuthenticated(true);
      window.sessionStorage.setItem("avvi.session", "active");
      setLoginError("");
      return;
    }
    if (supabase) {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginForm.login.trim(),
        password: loginForm.password
      });
      if (!error) {
        setIsAuthenticated(true);
        window.sessionStorage.setItem("avvi.session", "active");
        setLoginError("");
        return;
      }
      setLoginError(error.message);
      return;
    }
    setLoginError("Login ou senha inválidos.");
  }

  async function handleLogout() {
    if (supabase) {
      await supabase.auth.signOut();
    }
    window.sessionStorage.removeItem("avvi.session");
    setIsAuthenticated(false);
    setLoginForm({ login: "", password: "" });
    setLoginError("");
    setActiveTab("Agenda");
  }

  function openSlot(hour: number, professionalId: string) {
    setSelectedAppointmentId(null);
    setSelectedSlot({ hour, professionalId });
    setAppointmentForm(makeAppointmentForm(professionalId, selectedDate, hour));
  }

  function openAppointment(appointmentId: string) {
    const appointment = appointments.find((item) => item.id === appointmentId);
    if (!appointment) return;
    const startsAt = parseISO(appointment.startsAt);
    const patient = patients.find((item) => item.id === appointment.patientId);
    setSelectedAppointmentId(appointment.id);
    setSelectedSlot({ hour: Number(format(startsAt, "H")), professionalId: appointment.professionalId });
    setAppointmentForm({
      ...makeAppointmentForm(appointment.professionalId, format(startsAt, "yyyy-MM-dd"), Number(format(startsAt, "H"))),
      patientId: appointment.patientId ?? "",
      patientName: patient?.name ?? "",
      phone: patient?.phone ?? "",
      cpf: patient?.cpf ?? "",
      birthDate: patient?.birthDate ?? "",
      patientNotes: patient?.notes ?? "",
      procedureId: appointment.procedureId ?? "",
      status: appointment.status,
      eventType: appointment.eventType,
      notes: appointment.notes
    });
  }

  function saveAppointment() {
    let patientId = appointmentForm.patientId;
    if (!patientId && appointmentForm.patientName.trim()) {
      const created: Patient = {
        id: id("patient"),
        name: appointmentForm.patientName.trim(),
        gender: "Não informado",
        phone: appointmentForm.phone,
        cpf: appointmentForm.cpf,
        birthDate: appointmentForm.birthDate,
        address: "",
        professionalId: appointmentForm.professionalId,
        futureCredit: 0,
        registrationDate: todayKey(),
        loyaltyPoints: 0,
        notes: appointmentForm.patientNotes
      };
      setPatients((current) => [...current, created]);
      patientId = created.id;
    }
    const startsAt = `${appointmentForm.date}T${appointmentForm.hour.padStart(2, "0")}:00:00`;
    const endsAt = `${appointmentForm.date}T${String(Number(appointmentForm.hour) + 1).padStart(2, "0")}:00:00`;
    const created: Appointment = {
      id: selectedAppointmentId || id("appointment"),
      patientId,
      professionalId: appointmentForm.professionalId,
      procedureId: appointmentForm.procedureId || undefined,
      startsAt,
      endsAt,
      status: appointmentForm.status,
      eventType: appointmentForm.eventType,
      notes: appointmentForm.notes
    };
    setAppointments((current) => selectedAppointmentId ? current.map((appointment) => appointment.id === selectedAppointmentId ? created : appointment) : [...current, created]);
    if (appointmentForm.status === "Finalizado") {
      const procedure = procedures.find((item) => item.id === appointmentForm.procedureId);
      const financial = {
        ...makeEntryForm(),
        appointmentId: created.id,
        patientId: patientId || "",
        professionalId: appointmentForm.professionalId,
        procedureId: appointmentForm.procedureId,
        servicePrice: procedure?.price ?? 0,
        productCost: procedure?.averageCost ?? 0,
        professionalPercent: procedure?.professionalPercent ?? 50,
        patientName: patientName(patientId),
        procedureLines: [{
          id: id("line"),
          procedureId: appointmentForm.procedureId,
          manualProcedure: "",
          quantity: 1,
          servicePrice: procedure?.price ?? 0,
          productCost: procedure?.averageCost ?? 0,
          professionalPercent: procedure?.professionalPercent ?? 50
        }],
        payments: [{ ...blankPayment, id: id("payment"), amount: procedure?.price ?? 0 }],
        date: appointmentForm.date
      };
      setEntryForm(financial);
      setActiveTab("Lançamento de Procedimentos");
    }
    setSelectedSlot(null);
    setSelectedAppointmentId(null);
  }

  function deleteSelectedAppointment() {
    if (!selectedAppointmentId) return;
    setAppointments((current) => current.filter((appointment) => appointment.id !== selectedAppointmentId));
    setSelectedAppointmentId(null);
    setSelectedSlot(null);
  }

  function saveEntry(source: typeof entryForm) {
    if (!source.professionalId) return;
    let patientId = source.patientId;
    if (!patientId && source.patientName.trim()) {
      const created: Patient = {
        id: id("patient"),
        name: source.patientName.trim(),
        gender: "Não informado",
        phone: "",
        cpf: "",
        birthDate: "",
        address: "",
        professionalId: source.professionalId,
        futureCredit: 0,
        registrationDate: todayKey(),
        loyaltyPoints: 0,
        notes: "Paciente criado pelo lançamento financeiro."
      };
      setPatients((current) => [...current, created]);
      patientId = created.id;
    }
    if (!patientId) return;
    const legacyPaymentDiscount = source.payments.reduce((sum, payment) => sum + (Number(payment.discount) || 0), 0);
    const normalizedPayments = source.payments.map((payment) => ({
      ...payment,
      id: payment.id === "pay-new" ? id("payment") : payment.id,
      fee: payment.method === "Crédito" ? Number(payment.fee) || 0 : 0,
      cardBrand: payment.method === "Crédito" ? payment.cardBrand : undefined,
      installments: payment.method === "Crédito" ? Number(payment.installments) || 1 : 1,
      discount: 0
    }));
    const created: FinancialEntry = {
      id: source.id || id("entry"),
      appointmentId: source.appointmentId,
      patientId,
      professionalId: source.professionalId,
      procedureId: source.procedureLines[0]?.procedureId || source.procedureId || undefined,
      manualProcedure: source.procedureLines[0]?.manualProcedure || source.manualProcedure,
      quantity: Number(source.procedureLines[0]?.quantity ?? source.quantity) || 1,
      servicePrice: Number(source.procedureLines[0]?.servicePrice ?? source.servicePrice) || 0,
      productCost: Number(source.procedureLines[0]?.productCost ?? source.productCost) || 0,
      machineFee: 0,
      commercialDiscount: (Number(source.commercialDiscount) || 0) + legacyPaymentDiscount,
      discountSplit: source.discountSplit,
      professionalPercent: Number(source.procedureLines[0]?.professionalPercent ?? source.professionalPercent) || 0,
      procedureLines: source.procedureLines.map((line) => ({
        ...line,
        id: line.id || id("line"),
        quantity: Number(line.quantity) || 1,
        servicePrice: Number(line.servicePrice) || 0,
        productCost: Number(line.productCost) || 0,
        professionalPercent: Number(line.professionalPercent) || 0
      })),
      date: source.date,
      notes: source.notes,
      payments: normalizedPayments.length ? normalizedPayments : [{ ...blankPayment, id: id("payment"), amount: Number(source.servicePrice) || 0 }]
    };
    const previousEntry = entries.find((entry) => entry.id === source.id);
    const adjustments = new Map<string, number>();
    if (previousEntry) adjustments.set(previousEntry.patientId, futureCreditUsed(previousEntry));
    adjustments.set(patientId, (adjustments.get(patientId) ?? 0) - futureCreditUsed(created));
    if (adjustments.size) {
      setPatients((current) => current.map((patient) => {
        const adjustment = adjustments.get(patient.id) ?? 0;
        return adjustment ? { ...patient, futureCredit: Math.max(0, Number(patient.futureCredit) + adjustment) } : patient;
      }));
    }
    const resolvedPatientName = patients.find((patient) => patient.id === patientId)?.name ?? source.patientName;
    const linkedRevenue = makeRevenueFromFinancialEntry(created, resolvedPatientName);
    const linkedMachineFeeCost = makeMachineFeeCost(created, resolvedPatientName);
    setRevenues((current) => [linkedRevenue, ...current.filter((revenue) => revenue.sourceFinancialEntryId !== created.id)]);
    setCosts((current) => {
      const withoutCurrentFee = current.filter((cost) => cost.sourceFinancialEntryId !== created.id);
      return linkedMachineFeeCost ? [linkedMachineFeeCost, ...withoutCurrentFee] : withoutCurrentFee;
    });
    setEntries((current) => source.id ? current.map((entry) => entry.id === source.id ? created : entry) : [created, ...current]);
    setEntryForm(makeEntryForm());
  }

  function deleteEntry(entryId: string) {
    const entry = entries.find((item) => item.id === entryId);
    if (entry) {
      const used = futureCreditUsed(entry);
      if (used) {
        setPatients((current) => current.map((patient) => patient.id === entry.patientId ? { ...patient, futureCredit: (Number(patient.futureCredit) || 0) + used } : patient));
      }
    }
    setEntries((current) => current.filter((entry) => entry.id !== entryId));
    setRevenues((current) => current.filter((revenue) => revenue.sourceFinancialEntryId !== entryId));
    setCosts((current) => current.filter((cost) => cost.sourceFinancialEntryId !== entryId));
  }

  function exportExcel() {
    import("xlsx").then((xlsx) => {
      const rows = filteredEntries(entries, selectedMonth, professionalFilter).map((entry) => {
        const summary = calculateEntry(entry);
        return {
          Data: formatDate(entry.date),
          Profissional: professionalName(entry.professionalId),
          Paciente: patientName(entry.patientId),
          Procedimento: procedureName(entry),
          "Custo total": summary.productCost,
          "Preço": summary.grossRevenue,
          "Taxa/desconto": summary.machineFee + summary.discount,
          "Valor recebido": summary.received,
          "Lucro base": summary.baseProfit,
          "Valor profissional": summary.professionalValue,
          "Valor empresa": summary.companyValue
        };
      });
      const worksheet = xlsx.utils.json_to_sheet(rows);
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, worksheet, "Lançamentos");
      xlsx.writeFile(workbook, `avvi-lancamentos-${selectedMonth}.xlsx`);
    });
  }

  function generateReceipt() {
    const professional = professionals.find((item) => item.id === receiptForm.professionalId);
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("AVVI Clínica", 20, 22);
    doc.setFontSize(12);
    doc.text("Recibo de Pagamento", 20, 34);
    doc.line(20, 39, 190, 39);
    doc.text(`Paciente: ${receiptForm.patientName}`, 20, 52);
    doc.text(`CPF: ${receiptForm.cpf}`, 20, 62);
    doc.text(`Procedimento: ${receiptForm.procedure}`, 20, 72);
    doc.text(`Valor pago: ${currency(Number(receiptForm.amount))}`, 20, 82);
    doc.text(`Forma de pagamento: ${receiptForm.paymentMethod}`, 20, 92);
    doc.text(`Data: ${formatDate(receiptForm.date)}`, 20, 102);
    doc.text(`Profissional: ${professional?.name ?? ""}`, 20, 112);
    doc.text(`Observações: ${receiptForm.notes || "-"}`, 20, 122);
    doc.text("Declaro o recebimento do valor acima referente ao procedimento informado.", 20, 146);
    doc.line(55, 172, 155, 172);
    doc.text("AVVI Clínica", 88, 180);
    doc.save(`recibo-avvi-${receiptForm.patientName || "paciente"}.pdf`);
    setReceipts((current) => [{ ...receiptForm, id: id("receipt"), amount: Number(receiptForm.amount) || 0 }, ...current]);
    setReceiptForm(makeReceiptForm());
  }

  async function generateProfessionalReceipt() {
    const selectedEntries = entries.filter((entry) => selectedProfessionalEntryIds.includes(entry.id));
    if (!selectedEntries.length) return;
    const alreadyReceipted = professionalReceipts.flatMap((receipt) => receipt.entryIds);
    const duplicatedEntry = selectedEntries.find((entry) => alreadyReceipted.includes(entry.id));
    if (duplicatedEntry) {
      window.alert("Um ou mais serviços selecionados já fazem parte de um recibo profissional. Exclua o recibo anterior para gerar novamente.");
      return;
    }
    const firstProfessionalId = professionalPaymentFilter !== "todos" ? professionalPaymentFilter : selectedEntries[0].professionalId;
    const professional = professionals.find((item) => item.id === firstProfessionalId);
    const total = selectedEntries.reduce((sum, entry) => sum + calculateEntry(entry).professionalValue, 0);
    const issuedAt = selectedEntries
      .map((entry) => entry.date)
      .sort()
      .at(-1) ?? format(new Date(), "yyyy-MM-dd");
    const doc = new jsPDF();
    const logo = await imageToDataUrl("/logo-avvi.png");
    if (logo) {
      doc.addImage(logo, "PNG", 90, 12, 30, 13);
    }
    doc.setFontSize(18);
    doc.text("Recibo de Pagamento Profissional", 105, 36, { align: "center" });
    doc.setFontSize(12);
    doc.line(20, 42, 190, 42);
    doc.text(`Profissional: ${professional?.name ?? "Selecionadas"}`, 20, 54);
    doc.text(`Data de emissão: ${formatDate(issuedAt)}`, 20, 64);
    doc.setFontSize(14);
    doc.text(`Total a pagar: ${currency(total)}`, 20, 78);
    doc.setFontSize(9);
    let y = 94;
    const headers = ["Data", "Paciente", "Produto", "Qtd", "Valor", "Custo", "Taxa", "Desc.", "Lucro", "%", "V. Prof."];
    const widths = [14, 24, 35, 8, 17, 17, 15, 15, 17, 9, 17];
    y += drawPdfRow(doc, headers, widths, 10, y, true);
    selectedEntries.forEach((entry) => {
      const rows = professionalReceiptProcedureRows(entry, (line) => procedures.find((procedure) => procedure.id === line.procedureId)?.name || line.manualProcedure || procedureName(entry));
      rows.forEach((row) => {
        if (y > 252) {
          doc.addPage();
          y = 24;
          y += drawPdfRow(doc, headers, widths, 10, y, true);
        }
        y += drawPdfRow(doc, [
          formatDate(entry.date),
          patientName(entry.patientId),
          row.procedure,
          String(row.quantity),
          currency(row.gross),
          currency(row.cost),
          currency(row.fee),
          currency(row.discount),
          currency(row.profit),
          `${row.professionalPercent.toFixed(0)}%`,
          currency(row.professionalValue)
        ], widths, 10, y, false);
      });
    });
    y = Math.min(y + 22, 268);
    doc.line(55, y, 155, y);
    doc.text("Assinatura da profissional", 78, y + 8);
    doc.save(`pagamento-profissional-${professional?.name ?? "avvi"}.pdf`);
    const receipt: ProfessionalPaymentReceipt = {
      id: id("professional-receipt"),
      date: issuedAt,
      professionalId: firstProfessionalId,
      professionalName: professional?.name ?? "Selecionadas",
      total,
      entryIds: selectedEntries.map((entry) => entry.id)
    };
    setProfessionalReceipts((current) => [receipt, ...current]);
    setCosts((current) => [{
      id: id("cost"),
      name: `Pagamento profissional - ${receipt.professionalName}`,
      category: "Custos variáveis",
      value: total,
      dueDate: issuedAt,
      status: "Pago",
      paymentMethod: "Pix",
      replicateMonths: 0,
      creditInstallments: 1,
      professionalReceiptId: receipt.id,
      notes: ""
    }, ...current]);
    setSelectedProfessionalEntryIds([]);
  }

  function deleteProfessionalReceipt(receiptId: string) {
    setProfessionalReceipts((current) => current.filter((receipt) => receipt.id !== receiptId));
    setCosts((current) => current.filter((cost) => cost.professionalReceiptId !== receiptId));
  }

  function saveProcedure() {
    const saved = { ...procedureForm, id: procedureForm.id || id("procedure"), price: Number(procedureForm.price), averageCost: Number(procedureForm.averageCost), professionalPercent: Number(procedureForm.professionalPercent) };
    setProcedures((current) => procedureForm.id ? current.map((procedure) => procedure.id === procedureForm.id ? saved : procedure) : [saved, ...current]);
    setProcedureForm(makeProcedureForm());
  }

  function saveProfessional() {
    const saved = {
      ...professionalForm,
      id: professionalForm.id || id("professional"),
      commissionPercent: Number(professionalForm.commissionPercent) || 0,
      monthlyGoal: Number(professionalForm.monthlyGoal) || 0
    };
    setProfessionals((current) => professionalForm.id ? current.map((professional) => professional.id === professionalForm.id ? saved : professional) : [saved, ...current]);
    setProfessionalForm(makeProfessionalForm());
  }

  function saveCost() {
    const base = { ...costForm, id: costForm.id || id("cost"), name: costForm.name.trim() || costForm.notes.trim() || "Custo sem nome", value: Number(costForm.value) || 0, replicateMonths: Number(costForm.replicateMonths) || 0, creditInstallments: Number(costForm.creditInstallments) || 1 };
    const replicated = Array.from({ length: base.replicateMonths }, (_, index) => ({
      ...base,
      id: id("cost"),
      dueDate: addMonthsToDate(base.dueDate, index + 1),
      replicateMonths: 0
    }));
    setCosts((current) => costForm.id ? current.map((cost) => cost.id === costForm.id ? base : cost) : [base, ...replicated, ...current]);
    setCostForm(makeCostForm());
  }

  function patientName(patientId?: string) {
    return patients.find((patient) => patient.id === patientId)?.name ?? "-";
  }

  function professionalName(professionalId?: string) {
    return professionals.find((professional) => professional.id === professionalId)?.name ?? "-";
  }

  function procedureName(entry: FinancialEntry | Appointment) {
    if ("procedureLines" in entry && entry.procedureLines?.length) {
      return entry.procedureLines.map((line) => procedures.find((procedure) => procedure.id === line.procedureId)?.name ?? line.manualProcedure ?? "-").join(" + ");
    }
    const procedureId = "procedureId" in entry ? entry.procedureId : undefined;
    const manual = "manualProcedure" in entry ? entry.manualProcedure : undefined;
    return procedures.find((procedure) => procedure.id === procedureId)?.name ?? manual ?? "-";
  }

  if (!isAuthenticated) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#f5f6f8] px-4">
        <section className="w-full max-w-md rounded-2xl border border-white/70 bg-white/90 p-8 text-center shadow-panel backdrop-blur">
          <Image src="/logo-avvi.png" alt="AVVI Clínica" width={240} height={100} className="mx-auto h-24 w-auto object-contain" priority />
          <p className="mt-4 text-xs font-bold uppercase tracking-[0.18em] text-avvi-blue">Gestão integrada</p>
          <h1 className="mt-3 text-2xl font-bold text-avvi-ink">Acesse o sistema</h1>
          <div className="mt-6 space-y-3 text-left">
            <FormField label="Login">
              <input className="input" value={loginForm.login} onChange={(event) => setLoginForm({ ...loginForm, login: event.target.value })} placeholder="email@avviclinica.com" />
            </FormField>
            <FormField label="Senha">
              <div className="relative">
                <input className="input pr-11" type={showPassword ? "text" : "password"} value={loginForm.password} onChange={(event) => setLoginForm({ ...loginForm, password: event.target.value })} placeholder="Senha" onKeyDown={(event) => { if (event.key === "Enter") handleLogin(); }} />
                <button type="button" onClick={() => setShowPassword((current) => !current)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-2 text-slate-500 hover:bg-avvi-soft hover:text-avvi-blue" title={showPassword ? "Ocultar senha" : "Mostrar senha"}>
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </FormField>
          </div>
          {loginError && <p className="mt-3 text-sm font-bold text-avvi-red">{loginError}</p>}
          <button onClick={handleLogin} className="mt-5 w-full rounded-lg bg-avvi-blue px-5 py-3 font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-panel">Entrar</button>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-transparent">
      <div className="flex w-full">
        <aside className="fixed left-0 top-0 z-40 hidden h-screen w-80 shrink-0 border-r border-white/70 bg-white/90 p-4 shadow-panel backdrop-blur-xl lg:block">
          <div className="flex h-full flex-col">
            <div className="mb-4 text-center">
              <Image src="/logo-avvi.png" alt="AVVI Clínica" width={200} height={82} className="mx-auto h-16 w-auto object-contain" priority />
              <p className="mt-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-avvi-blue">Gestão integrada</p>
            </div>
            <nav className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 thin-scrollbar">
              <SidebarGroup label="Operação">
                {tabs.filter((tab) => ["Agenda"].includes(tab.id)).map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12px] font-semibold transition ${activeTab === tab.id ? "bg-avvi-blue text-white shadow-sm" : "text-slate-600 hover:bg-avvi-soft hover:text-avvi-blue"}`}
                    >
                      <Icon size={15} />
                      <span>{tab.id}</span>
                    </button>
                  );
                })}
              </SidebarGroup>
              <SidebarGroup label="Financeiro">
                {tabs.filter((tab) => ["Dashboard", "Receitas", "Lançamento de Procedimentos", "Pagamento Profissional", "Relatório Profissional", "Custos"].includes(tab.id)).map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12px] font-semibold transition ${activeTab === tab.id ? "bg-avvi-blue text-white shadow-sm" : "text-slate-600 hover:bg-avvi-soft hover:text-avvi-blue"}`}
                    >
                      <Icon size={15} />
                      <span>{tab.id}</span>
                    </button>
                  );
                })}
              </SidebarGroup>
              <SidebarGroup label="Cadastros">
                {tabs.filter((tab) => ["Cadastro de Procedimentos", "Cadastro de Profissionais", "Cadastro de Pacientes", "Metas"].includes(tab.id)).map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left text-[12px] font-semibold transition ${activeTab === tab.id ? "bg-avvi-blue text-white shadow-sm" : "text-slate-600 hover:bg-avvi-soft hover:text-avvi-blue"}`}
                  >
                    <Icon size={15} />
                    <span>{tab.id}</span>
                  </button>
                );
                })}
              </SidebarGroup>
            </nav>
            <div className="mt-3 space-y-2">
              <div className="rounded-md border border-[#eadcc4] bg-avvi-soft p-2.5 text-xs text-slate-600">
                <p className="font-semibold text-avvi-ink">Perfil atual</p>
                <p>Administrador</p>
                <p className="mt-1 text-[10px]">Acesso total a relatórios, metas, valores e cadastros.</p>
              </div>
              <button onClick={handleLogout} className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-100 bg-white px-4 py-2.5 text-xs font-bold text-avvi-red transition hover:bg-red-50" title="Sair do sistema">
                <LogOut size={15} />
                <span>Sair</span>
              </button>
            </div>
          </div>
        </aside>

        <section className="min-w-0 flex-1 px-4 py-5 lg:ml-80 lg:px-7">
          <Header activeTab={activeTab} />
          {syncError && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-avvi-red">
              {syncError}
            </div>
          )}
          <MobileTabs activeTab={activeTab} setActiveTab={setActiveTab} />

          {activeTab === "Agenda" && (
            <AgendaView
              viewMode={viewMode}
              setViewMode={setViewMode}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              professionalFilter={professionalFilter}
              setProfessionalFilter={setProfessionalFilter}
              search={search}
              setSearch={setSearch}
              appointments={appointments}
              patients={patients}
              procedures={procedures}
              professionals={professionals}
              visibleProfessionals={visibleProfessionals}
              openSlot={openSlot}
              openAppointment={openAppointment}
            />
          )}

          {activeTab === "Lançamento de Procedimentos" && (
            <FinancialView
              entryForm={entryForm}
              setEntryForm={setEntryForm}
              saveEntry={saveEntry}
              patients={patients}
              procedures={procedures}
              professionals={professionals}
              entries={entries}
              setEntries={setEntries}
              deleteEntry={deleteEntry}
              selectedMonth={selectedMonth}
              setSelectedMonth={setSelectedMonth}
              professionalFilter={professionalFilter}
              setProfessionalFilter={setProfessionalFilter}
              exportExcel={exportExcel}
              patientName={patientName}
              professionalName={professionalName}
              procedureName={procedureName}
            />
          )}

          {activeTab === "Receitas" && (
            <RevenuesView
              revenues={revenues}
              setRevenues={setRevenues}
              patients={patients}
              setPatients={setPatients}
              selectedMonth={selectedMonth}
              setSelectedMonth={setSelectedMonth}
            />
          )}

          {activeTab === "Recibos de Pagamento" && (
            <ReceiptsView
              receiptForm={receiptForm}
              setReceiptForm={setReceiptForm}
              receipts={receipts}
              professionals={professionals}
              generateReceipt={generateReceipt}
              professionalName={professionalName}
            />
          )}

          {activeTab === "Pagamento Profissional" && (
            <ProfessionalPaymentView
              entries={entries}
              professionals={professionals}
              selectedMonth={selectedMonth}
              setSelectedMonth={setSelectedMonth}
              professionalFilter={professionalPaymentFilter}
              setProfessionalFilter={setProfessionalPaymentFilter}
              selectedEntryIds={selectedProfessionalEntryIds}
              setSelectedEntryIds={setSelectedProfessionalEntryIds}
              generateReceipt={generateProfessionalReceipt}
              professionalReceipts={professionalReceipts}
              deleteProfessionalReceipt={deleteProfessionalReceipt}
              patientName={patientName}
              professionalName={professionalName}
              procedureName={procedureName}
            />
          )}

          {activeTab === "Relatório Profissional" && (
            <ProfessionalReportView
              entries={entries}
              professionals={professionals}
              selectedMonth={selectedMonth}
              setSelectedMonth={setSelectedMonth}
              monthlyGoals={monthlyGoals}
              professionalName={professionalName}
            />
          )}

          {activeTab === "Cadastro de Procedimentos" && (
            <ProceduresView
              procedureForm={procedureForm}
              setProcedureForm={setProcedureForm}
              procedures={procedures}
              setProcedures={setProcedures}
              saveProcedure={saveProcedure}
            />
          )}

          {activeTab === "Cadastro de Profissionais" && (
            <ProfessionalsView
              professionalForm={professionalForm}
              setProfessionalForm={setProfessionalForm}
              professionals={professionals}
              setProfessionals={setProfessionals}
              saveProfessional={saveProfessional}
            />
          )}

          {activeTab === "Cadastro de Pacientes" && (
            <PatientsView
              patientForm={patientForm}
              setPatientForm={setPatientForm}
              patients={patients}
              setPatients={setPatients}
              professionals={professionals}
              appointments={appointments}
            />
          )}

          {activeTab === "Metas" && (
            <GoalsView
              selectedMonth={selectedMonth}
              setSelectedMonth={setSelectedMonth}
              professionals={professionals}
              entries={entries}
              revenues={revenues}
              costs={costs}
              monthlyGoals={monthlyGoals}
              setMonthlyGoals={setMonthlyGoals}
            />
          )}

          {activeTab === "Custos" && (
            <CostsView costForm={costForm} setCostForm={setCostForm} costs={costs} setCosts={setCosts} saveCost={saveCost} />
          )}

          {activeTab === "Dashboard" && (
            <DashboardView
              selectedMonth={selectedMonth}
              setSelectedMonth={setSelectedMonth}
              professionalFilter={professionalFilter}
              setProfessionalFilter={setProfessionalFilter}
              reportFilter={reportFilter}
              setReportFilter={setReportFilter}
              entries={entries}
              revenues={revenues}
              costs={costs}
              professionals={professionals}
              monthlyGoals={monthlyGoals}
              currentMonthSummary={currentMonthSummary}
              previousSummary={previousSummary}
              professionalName={professionalName}
            />
          )}
        </section>
      </div>

      {selectedSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[92vh] w-full max-w-4xl overflow-auto rounded-lg bg-white p-5 shadow-panel thin-scrollbar">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold text-avvi-blue">{selectedSlot.hour}:00 · {professionalName(selectedSlot.professionalId)}</p>
                <h2 className="text-xl font-bold">{selectedAppointmentId ? "Detalhes do agendamento" : "Novo evento da agenda"}</h2>
              </div>
              <div className="flex items-center gap-2">
                {selectedAppointmentId && (
                  <button className="rounded-md border border-red-100 p-2 text-avvi-red hover:bg-red-50" onClick={deleteSelectedAppointment} title="Excluir agendamento">
                    <Trash2 size={18} />
                  </button>
                )}
                <button className="rounded-md border border-avvi-line px-3 py-2 text-sm" onClick={() => { setSelectedSlot(null); setSelectedAppointmentId(null); }}>Fechar</button>
              </div>
            </div>
            <AppointmentForm
              form={appointmentForm}
              setForm={setAppointmentForm}
              patients={patients}
              procedures={procedures}
              professionals={professionals}
              saveAppointment={saveAppointment}
            />
          </div>
        </div>
      )}
    </main>
  );
}

function Header({ activeTab }: { activeTab: Tab }) {
  return (
    <header className="mb-4 rounded-2xl border border-white/70 bg-white/85 px-5 py-4 shadow-panel backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-avvi-blue">AVVI Clínica</p>
          <h2 className="text-2xl font-bold text-avvi-ink">{activeTab}</h2>
        </div>
        <div className="flex items-center gap-2 rounded-xl bg-avvi-soft px-3 py-2 text-sm font-semibold text-avvi-blue">
          <CheckCircle2 size={16} />
          Sistema v1 funcional
        </div>
      </div>
    </header>
  );
}

function MobileTabs({ activeTab, setActiveTab }: { activeTab: Tab; setActiveTab: (tab: Tab) => void }) {
  return (
    <div className="mb-4 flex gap-2 overflow-x-auto lg:hidden">
      {tabs.map((tab) => (
        <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold shadow-sm ${activeTab === tab.id ? "bg-avvi-blue text-white" : "bg-white/90 text-slate-600"}`}>
          {tab.id}
        </button>
      ))}
    </div>
  );
}

function AgendaView(props: {
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  selectedDate: string;
  setSelectedDate: (date: string) => void;
  professionalFilter: string;
  setProfessionalFilter: (value: string) => void;
  search: string;
  setSearch: (value: string) => void;
  appointments: Appointment[];
  patients: Patient[];
  procedures: Procedure[];
  professionals: Professional[];
  visibleProfessionals: Professional[];
  openSlot: (hour: number, professionalId: string) => void;
  openAppointment: (appointmentId: string) => void;
}) {
  const days = eachDayOfInterval({ start: startOfMonth(parseISO(`${props.selectedDate.slice(0, 7)}-01`)), end: endOfMonth(parseISO(`${props.selectedDate.slice(0, 7)}-01`)) });
  const selected = parseISO(`${props.selectedDate}T00:00:00`);
  const query = props.search.toLowerCase();

  return (
    <div className="grid gap-4 xl:grid-cols-[280px_minmax(0,1fr)]">
      <aside className="space-y-4">
        <Panel>
          <div className="mb-3 flex items-center justify-between">
            <button className="rounded-md p-2 hover:bg-avvi-soft" onClick={() => props.setSelectedDate(addMonth(props.selectedDate, -1))} title="Mês anterior"><ChevronLeft size={16} /></button>
            <strong>{format(selected, "MMMM yyyy", { locale: ptBR })}</strong>
            <button className="rounded-md p-2 hover:bg-avvi-soft" onClick={() => props.setSelectedDate(addMonth(props.selectedDate, 1))} title="Próximo mês"><ChevronRight size={16} /></button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-slate-500">
            {["dom", "seg", "ter", "qua", "qui", "sex", "sáb"].map((day) => <span key={day}>{day}</span>)}
            {days.map((day) => (
              <button key={day.toISOString()} onClick={() => props.setSelectedDate(format(day, "yyyy-MM-dd"))} className={`aspect-square rounded-full text-sm ${isSameDay(day, selected) ? "bg-avvi-blue text-white" : "hover:bg-avvi-soft"}`}>
                {getDate(day)}
              </button>
            ))}
          </div>
        </Panel>
        <Panel>
          <label className="text-xs font-semibold text-slate-500">Profissional</label>
          <select value={props.professionalFilter} onChange={(event) => props.setProfessionalFilter(event.target.value)} className="mt-1 w-full rounded-md border border-avvi-line bg-white px-3 py-2 text-sm">
            <option value="todos">Todos</option>
            {props.professionals.map((professional) => <option key={professional.id} value={professional.id}>{professional.name}</option>)}
          </select>
          <label className="mt-3 block text-xs font-semibold text-slate-500">Visão</label>
          <div className="mt-1 grid grid-cols-3 gap-1">
            {(["Dia", "Semana", "Mês"] as ViewMode[]).map((mode) => (
              <button key={mode} onClick={() => props.setViewMode(mode)} className={`rounded-md px-2 py-2 text-sm font-semibold ${props.viewMode === mode ? "bg-avvi-blue text-white" : "bg-slate-100 text-slate-600"}`}>{mode}</button>
            ))}
          </div>
          <div className="mt-4 space-y-2 text-sm">
            {["Status do Agendamento", "Fechamento de Conta", "Tamanho da agenda", "Exibição da agenda"].map((item) => (
              <div key={item} className="flex items-center justify-between border-t border-avvi-line pt-2 text-slate-600">
                <span>{item}</span>
                <ChevronRight size={14} />
              </div>
            ))}
          </div>
        </Panel>
      </aside>

      <div className="min-w-0 rounded-lg border border-avvi-line bg-white shadow-panel">
        <div className="flex flex-wrap items-center gap-3 border-b border-avvi-line p-3">
          <button className="rounded-md border border-avvi-line p-2" onClick={() => props.setSelectedDate(format(addDays(parseISO(props.selectedDate), -1), "yyyy-MM-dd"))} title="Dia anterior"><ChevronLeft size={16} /></button>
          <div className="rounded-md border border-avvi-line px-4 py-2 text-center text-sm font-bold">
            {format(parseISO(`${props.selectedDate}T00:00:00`), "dd MMM yyyy", { locale: ptBR })}
            <span className="block text-xs font-normal text-slate-500">{format(parseISO(`${props.selectedDate}T00:00:00`), "EEEE", { locale: ptBR })}</span>
          </div>
          <button className="rounded-md border border-avvi-line p-2" onClick={() => props.setSelectedDate(format(addDays(parseISO(props.selectedDate), 1), "yyyy-MM-dd"))} title="Próximo dia"><ChevronRight size={16} /></button>
          <button className="rounded-md bg-avvi-blue px-4 py-2 text-sm font-bold text-white"><Plus className="mr-1 inline" size={16} />Agendar</button>
          <div className="relative min-w-[240px] flex-1">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
            <input value={props.search} onChange={(event) => props.setSearch(event.target.value)} placeholder="Buscar clientes agendados hoje" className="w-full rounded-md border border-avvi-line py-2 pl-9 pr-3 text-sm" />
          </div>
        </div>
        <div className="overflow-auto thin-scrollbar">
          <div className="min-w-[900px]">
            <div className="grid" style={{ gridTemplateColumns: `58px repeat(${props.visibleProfessionals.length}, minmax(210px, 1fr))` }}>
              <div className="border-b border-avvi-line bg-white" />
              {props.visibleProfessionals.map((professional) => (
                <div key={professional.id} className="border-b border-l border-avvi-line p-3">
                  <div className="flex items-center gap-2">
                    <span className="grid h-9 w-9 place-items-center rounded-full text-sm font-bold text-white" style={{ background: professional.color }}>{professional.name.slice(0, 1)}</span>
                    <div>
                      <p className="font-bold">{professional.name}</p>
                      <p className="text-xs text-slate-500">{professional.specialty}</p>
                    </div>
                  </div>
                </div>
              ))}
              {hours.map((hour) => (
                <Fragment key={hour}>
                  <div key={`h-${hour}`} className="border-b border-avvi-line bg-slate-50 px-2 py-4 text-right text-sm text-slate-500">{hour}h</div>
                  {props.visibleProfessionals.map((professional) => {
                    const slotAppointments = props.appointments.filter((appointment) => appointment.professionalId === professional.id && appointment.startsAt.startsWith(props.selectedDate) && Number(appointment.startsAt.slice(11, 13)) === hour);
                    const visible = slotAppointments.filter((appointment) => patientNameLocal(props.patients, appointment.patientId).toLowerCase().includes(query));
                    return (
                      <button key={`${professional.id}-${hour}`} onClick={() => props.openSlot(hour, professional.id)} className="min-h-[62px] border-b border-l border-avvi-line bg-white p-2 text-left align-top hover:bg-avvi-soft">
                        {visible.map((appointment) => (
                          <div key={appointment.id} onClick={(event) => { event.stopPropagation(); props.openAppointment(appointment.id); }} className={`mb-1 rounded-md border-l-4 bg-white px-2 py-1 shadow-sm ${appointment.status === "Finalizado" ? "border-avvi-green" : appointment.status === "Cancelado" ? "border-avvi-red" : "border-avvi-blue"}`}>
                            <p className="text-xs font-bold">{patientNameLocal(props.patients, appointment.patientId)}</p>
                            <p className="truncate text-[11px] text-slate-500">{procedureNameLocal(props.procedures, appointment.procedureId)} · {appointment.status}</p>
                          </div>
                        ))}
                      </button>
                    );
                  })}
                </Fragment>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AppointmentForm({ form, setForm, patients, procedures, professionals, saveAppointment }: { form: ReturnType<typeof makeAppointmentForm>; setForm: (form: ReturnType<typeof makeAppointmentForm>) => void; patients: Patient[]; procedures: Procedure[]; professionals: Professional[]; saveAppointment: () => void }) {
  return (
    <div className="mt-5 grid gap-4 lg:grid-cols-2">
      <FormField label="Ação">
        <select value={form.eventType} onChange={(event) => setForm({ ...form, eventType: event.target.value })} className="input">
          {eventOptions.map((option) => <option key={option}>{option}</option>)}
        </select>
      </FormField>
      <FormField label="Status">
        <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as AppointmentStatus })} className="input">
          {statuses.map((status) => <option key={status}>{status}</option>)}
        </select>
      </FormField>
      <FormField label="Paciente cadastrado">
        <select value={form.patientId} onChange={(event) => setForm({ ...form, patientId: event.target.value })} className="input">
          <option value="">Novo paciente</option>
          {patients.map((patient) => <option key={patient.id} value={patient.id}>{patient.name}</option>)}
        </select>
      </FormField>
      <FormField label="Nome do paciente">
        <input value={form.patientName} onChange={(event) => setForm({ ...form, patientName: event.target.value })} className="input" placeholder="Nome completo" />
      </FormField>
      <FormField label="Telefone"><input value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} className="input" /></FormField>
      <FormField label="CPF"><input value={form.cpf} onChange={(event) => setForm({ ...form, cpf: event.target.value })} className="input" /></FormField>
      <FormField label="Data de nascimento"><input type="date" value={form.birthDate} onChange={(event) => setForm({ ...form, birthDate: event.target.value })} className="input" /></FormField>
      <FormField label="Procedimento">
        <select value={form.procedureId} onChange={(event) => setForm({ ...form, procedureId: event.target.value })} className="input">
          <option value="">Selecione</option>
          {procedures.filter((procedure) => procedure.active).map((procedure) => <option key={procedure.id} value={procedure.id}>{procedure.name}</option>)}
        </select>
      </FormField>
      <FormField label="Profissional">
        <select value={form.professionalId} onChange={(event) => setForm({ ...form, professionalId: event.target.value })} className="input">
          {professionals.map((professional) => <option key={professional.id} value={professional.id}>{professional.name}</option>)}
        </select>
      </FormField>
      <FormField label="Data"><input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} className="input" /></FormField>
      <FormField label="Hora"><input type="number" min={8} max={20} value={form.hour} onChange={(event) => setForm({ ...form, hour: event.target.value })} className="input" /></FormField>
      <FormField label="Observações"><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="input min-h-20" /></FormField>
      <FormField label="Observações do paciente"><textarea value={form.patientNotes} onChange={(event) => setForm({ ...form, patientNotes: event.target.value })} className="input min-h-20" /></FormField>
      <div className="lg:col-span-2">
        <button onClick={saveAppointment} className="rounded-md bg-avvi-blue px-4 py-2 font-bold text-white"><Save className="mr-2 inline" size={16} />Salvar agendamento</button>
      </div>
    </div>
  );
}

type RevenuePaymentMethod = "Dinheiro" | "Crédito" | "Débito" | "Pix" | "Crédito Futuro";

function makeRevenueForm() {
  return {
    clientName: "",
    date: todayKey(),
    serviceValue: 0,
    serviceQuantity: 1,
    discount: 0,
    paymentMethod: "Pix" as RevenuePaymentMethod,
    clientCreditAdded: 0
  };
}

function calculateRevenueTotal(form: ReturnType<typeof makeRevenueForm>) {
  if (form.paymentMethod === "Crédito Futuro") return 0;
  const serviceTotal = (Number(form.serviceValue) || 0) * (Number(form.serviceQuantity) || 0);
  return Math.max(0, serviceTotal - (Number(form.discount) || 0));
}

function RevenuesView({ revenues, setRevenues, patients, setPatients, selectedMonth, setSelectedMonth }: { revenues: RevenueEntry[]; setRevenues: (items: RevenueEntry[]) => void; patients: Patient[]; setPatients: (items: Patient[]) => void; selectedMonth: string; setSelectedMonth: (value: string) => void }) {
  const [form, setForm] = useState(makeRevenueForm());
  const initialPeriod = monthPeriod(selectedMonth);
  const [periodStart, setPeriodStart] = useState(initialPeriod.start);
  const [periodEnd, setPeriodEnd] = useState(initialPeriod.end);
  const rows = revenues.filter((revenue) => isDateInPeriod(revenue.paymentDate, periodStart, periodEnd));
  const totalGross = rows.reduce((sum, revenue) => sum + revenue.total, 0);
  const totalDiscounts = rows.reduce((sum, revenue) => sum + revenue.discount, 0);
  const totalClientCreditAdded = rows.reduce((sum, revenue) => sum + revenue.clientCreditAddedTotal, 0);
  const totalClientCreditUsed = rows.reduce((sum, revenue) => sum + revenue.clientCreditUsedTotal, 0);
  const serviceTotal = (Number(form.serviceValue) || 0) * (Number(form.serviceQuantity) || 0);
  const totalPaid = calculateRevenueTotal(form);

  function saveRevenue() {
    const paid = calculateRevenueTotal(form);
    const isClientCreditPayment = form.paymentMethod === "Crédito Futuro";
    const futureCreditUsed = isClientCreditPayment ? Math.abs(serviceTotal - (Number(form.discount) || 0)) : 0;
    const revenue: RevenueEntry = {
      id: id("revenue"),
      serviceDate: form.date,
      paymentDate: form.date,
      paymentTime: format(new Date(), "HH:mm"),
      type: "Receita",
      clientName: form.clientName.trim() || "Cliente não informado",
      total: paid,
      serviceQuantity: Number(form.serviceQuantity) || 0,
      serviceTotal,
      clientCreditTotal: Number(form.clientCreditAdded) || 0,
      clientCreditAddedTotal: Number(form.clientCreditAdded) || 0,
      clientCreditUsedTotal: isClientCreditPayment ? -futureCreditUsed : 0,
      discount: -Math.abs(Number(form.discount) || 0),
      discountReason: "",
      creditTotal: form.paymentMethod === "Crédito" ? paid : 0,
      debitTotal: form.paymentMethod === "Débito" ? paid : 0,
      cashTotal: form.paymentMethod === "Dinheiro" ? paid : 0,
      pixTotal: form.paymentMethod === "Pix" ? paid : 0
    };
    setRevenues([revenue, ...revenues]);
    const patientNameKey = normalizeName(form.clientName);
    if (patientNameKey && ((Number(form.clientCreditAdded) || 0) || futureCreditUsed)) {
      const hasPatient = patients.some((patient) => normalizeName(patient.name) === patientNameKey);
      const updatedPatients = patients.map((patient) => normalizeName(patient.name) === patientNameKey ? {
        ...patient,
        futureCredit: Math.max(0, (Number(patient.futureCredit) || 0) + (Number(form.clientCreditAdded) || 0) - futureCreditUsed)
      } : patient);
      setPatients(hasPatient ? updatedPatients : [{
        ...makePatientForm(),
        id: id("patient"),
        name: form.clientName.trim(),
        futureCredit: Math.max(0, (Number(form.clientCreditAdded) || 0) - futureCreditUsed),
        notes: "Paciente criado pelo cadastro de receitas."
      }, ...updatedPatients]);
    }
    setForm(makeRevenueForm());
  }

  function selectPeriodMonth(month: string) {
    const period = monthPeriod(month);
    setSelectedMonth(month);
    setPeriodStart(period.start);
    setPeriodEnd(period.end);
  }

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold">Receitas</h3>
            <p className="text-sm text-slate-500">Cadastro manual de receitas da clínica.</p>
          </div>
          <span className="rounded-full bg-avvi-soft px-3 py-1 text-xs font-bold text-avvi-blue">{revenues.length} receitas cadastradas</span>
        </div>
        <div className="mt-4">
          <PeriodFilter start={periodStart} end={periodEnd} month={selectedMonth} onStartChange={setPeriodStart} onEndChange={setPeriodEnd} onMonthChange={selectPeriodMonth} />
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-4">
          <FormField label="Cliente">
            <input className="input" value={form.clientName} onChange={(event) => setForm({ ...form, clientName: event.target.value })} placeholder="Nome do cliente" />
          </FormField>
          <FormField label="Data">
            <input type="date" className="input" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} />
          </FormField>
          <FormField label="Valor do serviço">
            <MoneyInput value={form.serviceValue} onChange={(value) => setForm({ ...form, serviceValue: value })} />
          </FormField>
          <FormField label="Quantidade de serviços">
            <input type="number" min={1} className="input" value={form.serviceQuantity} onChange={(event) => setForm({ ...form, serviceQuantity: Number(event.target.value) })} />
          </FormField>
          <FormField label="Desconto">
            <MoneyInput value={form.discount} onChange={(value) => setForm({ ...form, discount: value })} />
          </FormField>
          <FormField label="Forma de pagamento">
            <select className="input" value={form.paymentMethod} onChange={(event) => setForm({ ...form, paymentMethod: event.target.value as RevenuePaymentMethod })}>
              {(["Dinheiro", "Crédito", "Débito", "Pix", "Crédito Futuro"] as RevenuePaymentMethod[]).map((method) => <option key={method}>{method}</option>)}
            </select>
          </FormField>
          <FormField label="Adicionar crédito futuro">
            <MoneyInput value={form.clientCreditAdded} onChange={(value) => setForm({ ...form, clientCreditAdded: value })} />
          </FormField>
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
            <p className="text-xs font-bold uppercase text-amber-700">Total pago automático</p>
            <p className="mt-1 text-2xl font-bold text-slate-950">{currency(totalPaid)}</p>
            <p className="mt-1 text-xs text-slate-500">Desconto: {currency(-Math.abs(Number(form.discount) || 0))} · Crédito futuro: {form.paymentMethod === "Crédito Futuro" ? currency(-Math.abs(serviceTotal - (Number(form.discount) || 0))) : currency(Number(form.clientCreditAdded) || 0)}</p>
          </div>
          <div className="lg:col-span-4">
            <button onClick={saveRevenue} className="rounded-md bg-avvi-blue px-4 py-2 font-bold text-white"><Save className="mr-2 inline" size={16} />Salvar receita</button>
          </div>
        </div>
      </Panel>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard title="Total pago" value={currency(totalGross)} meta={`${rows.length} receita(s) cadastrada(s)`} tone="green" delta="Soma dos totais pagos" />
        <MetricCard title="Crédito futuro gerado" value={currency(totalClientCreditAdded)} meta="Crédito adicionado para uso futuro" tone="blue" delta="Cadastro manual" />
        <MetricCard title="Crédito futuro utilizado" value={currency(totalClientCreditUsed)} meta="Não entra como custo/despesa" tone="blue" delta="Baixa do saldo do cliente" />
        <MetricCard title="Descontos" value={currency(totalDiscounts)} meta="Sempre indicado com sinal negativo" tone="red" delta="Somatório cadastrado" />
      </div>

      <Panel>
        <DataTable
          headers={["Data", "Cliente", "Qtd. Serviços", "Valor Serviço", "Desconto", "Crédito Futuro Adicionado", "Crédito Futuro Utilizado", "Dinheiro", "Crédito", "Débito", "Pix", "Total", "Ações"]}
          rows={rows.map((revenue) => [
            `${formatDate(revenue.paymentDate)} ${revenue.paymentTime}`,
            revenue.clientName,
            String(revenue.serviceQuantity),
            currency(revenue.serviceTotal),
            currency(revenue.discount),
            currency(revenue.clientCreditAddedTotal),
            currency(revenue.clientCreditUsedTotal),
            currency(revenue.cashTotal),
            currency(revenue.creditTotal),
            currency(revenue.debitTotal),
            currency(revenue.pixTotal),
            currency(revenue.total),
            <button key={revenue.id} onClick={() => setRevenues(revenues.filter((item) => item.id !== revenue.id))} className="rounded-md border border-red-100 p-2 text-avvi-red hover:bg-red-50" title="Excluir receita">
              <Trash2 size={14} />
            </button>
          ])}
        />
      </Panel>
    </div>
  );
}

function FinancialView(props: {
  entryForm: ReturnType<typeof makeEntryForm>;
  setEntryForm: (form: ReturnType<typeof makeEntryForm>) => void;
  saveEntry: (form: ReturnType<typeof makeEntryForm>) => void;
  patients: Patient[];
  procedures: Procedure[];
  professionals: Professional[];
  entries: FinancialEntry[];
  setEntries: (items: FinancialEntry[]) => void;
  deleteEntry: (id: string) => void;
  selectedMonth: string;
  setSelectedMonth: (value: string) => void;
  professionalFilter: string;
  setProfessionalFilter: (value: string) => void;
  exportExcel: () => void;
  patientName: (id?: string) => string;
  professionalName: (id?: string) => string;
  procedureName: (entry: FinancialEntry) => string;
}) {
  const summary = calculateEntry(props.entryForm);
  const initialPeriod = monthPeriod(props.selectedMonth);
  const [periodStart, setPeriodStart] = useState(initialPeriod.start);
  const [periodEnd, setPeriodEnd] = useState(initialPeriod.end);
  const rows = props.entries.filter((entry) => isDateInPeriod(entry.date, periodStart, periodEnd) && (props.professionalFilter === "todos" || entry.professionalId === props.professionalFilter));
  const [detailEntryId, setDetailEntryId] = useState<string | null>(null);

  function selectPeriodMonth(month: string) {
    const period = monthPeriod(month);
    props.setSelectedMonth(month);
    setPeriodStart(period.start);
    setPeriodEnd(period.end);
  }

  function updateLine(index: number, patch: Partial<ProcedureLine>) {
    const procedureLines = props.entryForm.procedureLines.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line);
    const gross = procedureLines.reduce((sum, line) => sum + Number(line.servicePrice) * Number(line.quantity), 0);
    const paymentAmount = Math.max(0, gross - (Number(props.entryForm.commercialDiscount) || 0));
    props.setEntryForm({ ...props.entryForm, procedureLines, payments: [{ ...props.entryForm.payments[0], amount: paymentAmount }, ...props.entryForm.payments.slice(1)] });
  }

  function updateCommercialDiscount(value: number) {
    const gross = props.entryForm.procedureLines.reduce((sum, line) => sum + Number(line.servicePrice) * Number(line.quantity), 0);
    const paymentAmount = Math.max(0, gross - (Number(value) || 0));
    props.setEntryForm({
      ...props.entryForm,
      commercialDiscount: value,
      payments: [{ ...props.entryForm.payments[0], amount: paymentAmount }, ...props.entryForm.payments.slice(1)]
    });
  }

  function selectProcedure(index: number, procedureId: string) {
    const procedure = props.procedures.find((item) => item.id === procedureId);
    updateLine(index, {
      procedureId,
      servicePrice: procedure?.price ?? 0,
      productCost: procedure?.averageCost ?? 0,
      professionalPercent: procedure?.professionalPercent ?? 50
    });
  }

  function addLine() {
    props.setEntryForm({ ...props.entryForm, procedureLines: [...props.entryForm.procedureLines, makeProcedureLine()] });
  }

  function removeLine(index: number) {
    const procedureLines = props.entryForm.procedureLines.filter((_, lineIndex) => lineIndex !== index);
    props.setEntryForm({ ...props.entryForm, procedureLines: procedureLines.length ? procedureLines : [makeProcedureLine()] });
  }

  return (
    <div className="space-y-4">
      <Panel>
        <div className="mb-4 flex items-center gap-2">
          <Plus size={18} className="text-avvi-blue" />
          <h3 className="text-lg font-bold">Novo Lançamento</h3>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <FormField label="Nome do paciente">
            <input
              list="financial-patients"
              value={props.entryForm.patientName}
              onChange={(event) => {
                const patient = props.patients.find((item) => item.name.toLowerCase() === event.target.value.toLowerCase());
                props.setEntryForm({ ...props.entryForm, patientName: event.target.value, patientId: patient?.id ?? "" });
              }}
              className="input"
              placeholder="Digite ou selecione um paciente"
            />
            <datalist id="financial-patients">
              {props.patients.map((patient) => <option key={patient.id} value={patient.name} />)}
            </datalist>
          </FormField>
          <FormField label="Tipo de divisão do desconto">
            <select value={props.entryForm.discountSplit} onChange={(event) => props.setEntryForm({ ...props.entryForm, discountSplit: event.target.value as DiscountSplit })} className="input">
              {discountSplits.map((split) => <option key={split}>{split}</option>)}
            </select>
          </FormField>
          <FormField label="Profissional">
            <select value={props.entryForm.professionalId} onChange={(event) => props.setEntryForm({ ...props.entryForm, professionalId: event.target.value })} className="input">
              <option value="">Selecione</option>
              {props.professionals.map((professional) => <option key={professional.id} value={professional.id}>{professional.name}</option>)}
            </select>
          </FormField>
          <FormField label="Data"><input type="date" value={props.entryForm.date} onChange={(event) => props.setEntryForm({ ...props.entryForm, date: event.target.value })} className="input" /></FormField>
        </div>

        <div className="mt-4 rounded-md border border-avvi-line p-3">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="font-bold">Procedimentos do fechamento</p>
            <button onClick={addLine} className="text-sm font-bold text-avvi-blue"><Plus className="mr-1 inline" size={14} />Adicionar procedimento</button>
          </div>
          <div className="mb-3 grid gap-3 md:grid-cols-3">
            <FormField label="Desconto comercial">
              <MoneyInput value={props.entryForm.commercialDiscount} onChange={updateCommercialDiscount} />
            </FormField>
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-slate-600 md:col-span-2">
              O desconto reduz o valor dos procedimentos e preenche automaticamente o valor pago.
            </div>
          </div>
          <div className="space-y-3">
            {props.entryForm.procedureLines.map((line, index) => (
              <div key={line.id} className="grid gap-2 rounded-md bg-slate-50 p-3 md:grid-cols-[1.5fr_0.6fr_1fr_1fr_0.8fr_auto]">
                <FormField label="Procedimento">
                  <select value={line.procedureId ?? ""} onChange={(event) => selectProcedure(index, event.target.value)} className="input">
                    <option value="">Procedimento do catálogo</option>
                    {props.procedures.filter((procedure) => procedure.active).map((procedure) => <option key={procedure.id} value={procedure.id}>{procedure.name}</option>)}
                  </select>
                </FormField>
                <FormField label="Quantidade">
                  <input type="number" min={1} value={line.quantity} onChange={(event) => updateLine(index, { quantity: Number(event.target.value) })} className="input" />
                </FormField>
                <FormField label="Valor do produto">
                  <MoneyInput value={line.servicePrice} onChange={(value) => updateLine(index, { servicePrice: value })} />
                </FormField>
                <FormField label="Custo do produto">
                  <MoneyInput value={line.productCost} onChange={(value) => updateLine(index, { productCost: value })} />
                </FormField>
                <FormField label="% profissional">
                  <input type="number" value={line.professionalPercent} onChange={(event) => updateLine(index, { professionalPercent: Number(event.target.value) })} className="input" />
                </FormField>
                <div className="flex items-end">
                  <button onClick={() => removeLine(index)} className="rounded-md border border-red-100 p-2 text-avvi-red hover:bg-red-50" title="Excluir procedimento">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
        <PaymentEditor form={props.entryForm} setForm={props.setEntryForm} patients={props.patients} />
        <div className="mt-4 grid gap-2 rounded-md border border-amber-200 bg-avvi-soft p-3 text-sm md:grid-cols-7">
          <SummaryItem label="Custo total" value={currency(summary.productCost)} />
          <SummaryItem label="Total pago" value={currency(summary.paymentTotal)} />
          <SummaryItem label="Taxa maquininha" value={currency(summary.machineFee)} tone="red" />
          <SummaryItem label="Desconto" value={currency(summary.discount)} tone="red" />
          <SummaryItem label="Lucro base" value={currency(summary.baseProfit)} tone="green" />
          <SummaryItem label="Valor empresa" value={currency(summary.companyValue)} tone="blue" />
          <SummaryItem label="Valor profissional" value={currency(summary.professionalValue)} tone="violet" />
        </div>
        <div className="mt-4 flex justify-end">
          <button onClick={() => props.saveEntry(props.entryForm)} className="rounded-md bg-avvi-blue px-5 py-2 font-bold text-white"><Save className="mr-2 inline" size={16} />Salvar lançamento</button>
        </div>
      </Panel>

      <Panel>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="grid flex-1 gap-3 lg:grid-cols-[1fr_1fr_1fr_180px]">
            <PeriodFilter start={periodStart} end={periodEnd} month={props.selectedMonth} onStartChange={setPeriodStart} onEndChange={setPeriodEnd} onMonthChange={selectPeriodMonth} />
            <select value={props.professionalFilter} onChange={(event) => props.setProfessionalFilter(event.target.value)} className="input w-44">
              <option value="todos">Todos</option>
              {props.professionals.map((professional) => <option key={professional.id} value={professional.id}>{professional.name}</option>)}
            </select>
          </div>
          <button onClick={props.exportExcel} className="rounded-md bg-avvi-green px-4 py-2 text-sm font-bold text-white"><Download className="mr-2 inline" size={16} />Exportar Excel</button>
        </div>
        <FinancialEntriesTable
          rows={rows}
          detailEntryId={detailEntryId}
          setDetailEntryId={setDetailEntryId}
          setEntryForm={props.setEntryForm}
          setEntries={props.setEntries}
          deleteEntry={props.deleteEntry}
          entries={props.entries}
          procedures={props.procedures}
          patientName={props.patientName}
          professionalName={props.professionalName}
          procedureName={props.procedureName}
        />
      </Panel>
    </div>
  );
}

function FinancialEntriesTable(props: {
  rows: FinancialEntry[];
  entries: FinancialEntry[];
  procedures: Procedure[];
  detailEntryId: string | null;
  setDetailEntryId: (id: string | null) => void;
  setEntryForm: (form: ReturnType<typeof makeEntryForm>) => void;
  setEntries: (items: FinancialEntry[]) => void;
  deleteEntry: (id: string) => void;
  patientName: (id?: string) => string;
  professionalName: (id?: string) => string;
  procedureName: (entry: FinancialEntry) => string;
}) {
  const headers = ["Data", "Profissional", "Paciente", "Procedimento", "Custo total", "Preço", "Taxa/desc", "Valor recebido", "Lucro base", "V. profissional", "Ações"];

  return (
    <div className="overflow-auto thin-scrollbar">
      <table className="w-full min-w-[920px] border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-avvi-line bg-slate-50 text-xs uppercase text-slate-500">
            {headers.map((header) => <th key={header} className="px-3 py-3 font-bold">{header}</th>)}
          </tr>
        </thead>
        <tbody>
          {props.rows.map((entry) => {
            const item = calculateEntry(entry);
            const isOpen = props.detailEntryId === entry.id;
            return (
              <Fragment key={entry.id}>
                <tr className="border-b border-avvi-line">
                  <td className="px-3 py-3 align-top">
                    <div className="flex items-center gap-2">
                      <button onClick={() => props.setDetailEntryId(isOpen ? null : entry.id)} className="rounded-md border border-avvi-line p-1.5 text-avvi-blue hover:bg-avvi-soft" title="Mostrar detalhes">
                        <ChevronDown size={14} className={`-rotate-90 transition ${isOpen ? "rotate-0" : ""}`} />
                      </button>
                      <span>{formatDate(entry.date)}</span>
                    </div>
                  </td>
                  <td className="px-3 py-3 align-top">{props.professionalName(entry.professionalId)}</td>
                  <td className="px-3 py-3 align-top">{props.patientName(entry.patientId)}</td>
                  <td className="px-3 py-3 align-top">{props.procedureName(entry)}</td>
                  <td className="px-3 py-3 align-top">{currency(item.productCost)}</td>
                  <td className="px-3 py-3 align-top">{currency(item.grossRevenue)}</td>
                  <td className="px-3 py-3 align-top">{currency(item.machineFee + item.discount)}</td>
                  <td className="px-3 py-3 align-top">{currency(item.received)}</td>
                  <td className="px-3 py-3 align-top">{currency(item.baseProfit)}</td>
                  <td className="px-3 py-3 align-top">{currency(item.professionalValue)}</td>
                  <td className="px-3 py-3 align-top">
                    <ActionButtons
                      small
                      onEdit={() => props.setEntryForm({ ...entry, appointmentId: entry.appointmentId, patientName: props.patientName(entry.patientId), procedureId: entry.procedureId ?? "", manualProcedure: entry.manualProcedure ?? "", procedureLines: entry.procedureLines?.length ? entry.procedureLines : [entryToLine(entry)] })}
                      onDelete={() => props.deleteEntry(entry.id)}
                    />
                  </td>
                </tr>
                {isOpen && (
                  <tr className="border-b border-avvi-line bg-white">
                    <td colSpan={headers.length} className="px-3 py-3">
                      <ProcedureDetailPanel entry={entry} procedures={props.procedures} procedureName={props.procedureName} />
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function PaymentEditor({ form, setForm, patients }: { form: ReturnType<typeof makeEntryForm>; setForm: (form: ReturnType<typeof makeEntryForm>) => void; patients: Patient[] }) {
  const selectedPatient = patients.find((patient) => patient.id === form.patientId);
  const availableFutureCredit = Number(selectedPatient?.futureCredit) || 0;

  function updatePayment(index: number, patch: Partial<PaymentItem>) {
    setForm({
      ...form,
      payments: form.payments.map((payment, itemIndex) => {
        if (itemIndex !== index) return payment;
        const nextMethod = patch.method ?? payment.method;
        const nextAmount = patch.amount ?? payment.amount;
        const nextBrand = nextMethod === "Crédito" ? (patch.cardBrand ?? payment.cardBrand ?? "Mastercard") : undefined;
        const nextInstallments = nextMethod === "Crédito" ? (patch.installments ?? payment.installments ?? 1) : 1;
        return {
          ...payment,
          ...patch,
          amount: nextAmount,
          fee: nextMethod === "Crédito" ? calculateCardFee(nextAmount, nextBrand, nextInstallments) : 0,
          cardBrand: nextBrand,
          installments: nextInstallments
        };
      })
    });
  }

  function removePayment(index: number) {
    const payments = form.payments.filter((_, paymentIndex) => paymentIndex !== index);
    setForm({ ...form, payments: payments.length ? payments : [{ ...blankPayment, id: id("payment") }] });
  }

  return (
    <div className="mt-4 rounded-md border border-avvi-line p-3">
      <div className="mb-2 flex items-center justify-between">
        <p className="font-bold">Formas de pagamento</p>
        <button onClick={() => setForm({ ...form, payments: [...form.payments, { ...blankPayment, id: id("payment") }] })} className="text-sm font-bold text-avvi-blue"><Plus className="mr-1 inline" size={14} />Adicionar</button>
      </div>
      <div className="space-y-2">
        {form.payments.map((payment, index) => (
          <div key={payment.id} className="grid gap-2 rounded-md bg-slate-50 p-3 md:grid-cols-[1fr_1fr_1fr_1fr_0.8fr_auto]">
            <FormField label="Forma"><select value={payment.method} onChange={(event) => updatePayment(index, { method: event.target.value as PaymentMethod })} className="input">
                {procedurePaymentMethods.map((method) => <option key={method}>{method}</option>)}
              </select></FormField>
            <FormField label="Valor pago"><MoneyInput value={payment.amount} onChange={(value) => updatePayment(index, { amount: value })} /></FormField>
            <FormField label="Taxa crédito">
              {payment.method === "Crédito" ? (
                <MoneyInput value={payment.fee} onChange={(value) => updatePayment(index, { fee: value })} />
              ) : (
                <div className="rounded-md border border-avvi-line bg-white px-3 py-2 text-sm text-slate-400">Somente crédito</div>
              )}
            </FormField>
            <FormField label="Bandeira">
              {payment.method === "Crédito" ? (
                <select className="input" value={payment.cardBrand ?? "Mastercard"} onChange={(event) => updatePayment(index, { cardBrand: event.target.value as PaymentItem["cardBrand"] })}>
                  {cardBrands.map((brand) => <option key={brand}>{brand}</option>)}
                </select>
              ) : (
                <div className="rounded-md border border-avvi-line bg-white px-3 py-2 text-sm text-slate-400">Somente crédito</div>
              )}
            </FormField>
            <FormField label="Prazo">
              {payment.method === "Crédito" ? (
                <select className="input" value={payment.installments ?? 1} onChange={(event) => updatePayment(index, { installments: Number(event.target.value) })}>
                  {paymentTerms.map((term) => <option key={term} value={term}>{term}x</option>)}
                </select>
              ) : (
                <div className="rounded-md border border-avvi-line bg-white px-3 py-2 text-sm text-slate-400">Somente crédito</div>
              )}
            </FormField>
            {payment.method === "Crédito Futuro" && (
              <div className="rounded-md border border-amber-200 bg-white px-3 py-2 text-sm text-slate-600 md:col-span-5">
                Saldo disponível do paciente: <strong className="text-avvi-blue">{currency(availableFutureCredit)}</strong>
              </div>
            )}
            <div className="flex items-end">
              <button onClick={() => removePayment(index)} className="rounded-md border border-red-100 p-2 text-avvi-red hover:bg-red-50" title="Excluir forma de pagamento">
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProcedureDetailPanel({ entry, procedures, procedureName }: { entry: FinancialEntry; procedures: Procedure[]; procedureName: (entry: FinancialEntry) => string }) {
  const summary = calculateEntry(entry);
  const lines = entry.procedureLines?.length ? entry.procedureLines : [entryToLine(entry)];

  return (
    <div className="mt-4 rounded-md border border-avvi-line bg-white p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h4 className="font-bold">Detalhe do fechamento</h4>
          <p className="text-sm text-slate-500">{procedureName(entry)}</p>
        </div>
        <span className="rounded-full bg-avvi-soft px-3 py-1 text-xs font-bold text-avvi-blue">{lines.length} procedimento(s)</span>
      </div>
      <div className="grid gap-2 md:grid-cols-7">
        <SummaryItem label="Custo total" value={currency(summary.productCost)} />
        <SummaryItem label="Total pago" value={currency(summary.paymentTotal)} />
        <SummaryItem label="Taxa crédito" value={currency(summary.machineFee)} tone="red" />
        <SummaryItem label="Desconto" value={currency(summary.discount)} tone="red" />
        <SummaryItem label="Lucro base" value={currency(summary.baseProfit)} tone="green" />
        <SummaryItem label="Valor empresa" value={currency(summary.companyValue)} tone="blue" />
        <SummaryItem label="Valor profissional" value={currency(summary.professionalValue)} tone="violet" />
      </div>
      <div className="mt-4 grid gap-3">
        {lines.map((line) => (
          <div key={line.id} className="grid gap-2 rounded-md bg-slate-50 p-3 text-sm md:grid-cols-5">
            <div><p className="text-xs text-slate-500">Procedimento</p><p className="font-bold">{procedures.find((procedure) => procedure.id === line.procedureId)?.name || line.manualProcedure || "Procedimento"}</p></div>
            <SummaryItem label="Valor do produto" value={currency(line.servicePrice * line.quantity)} tone="blue" />
            <SummaryItem label="Custo do produto" value={currency(line.productCost * line.quantity)} />
            <SummaryItem label="% profissional" value={`${line.professionalPercent}%`} tone="violet" />
            <SummaryItem label="Quantidade" value={String(line.quantity)} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ReceiptsView({ receiptForm, setReceiptForm, receipts, professionals, generateReceipt, professionalName }: { receiptForm: ReturnType<typeof makeReceiptForm>; setReceiptForm: (form: ReturnType<typeof makeReceiptForm>) => void; receipts: Receipt[]; professionals: Professional[]; generateReceipt: () => void; professionalName: (id?: string) => string }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <Panel>
        <h3 className="mb-4 text-lg font-bold">Gerar recibo para paciente</h3>
        <div className="grid gap-3 md:grid-cols-2">
          <FormField label="Nome do paciente"><input className="input" value={receiptForm.patientName} onChange={(event) => setReceiptForm({ ...receiptForm, patientName: event.target.value })} /></FormField>
          <FormField label="CPF"><input className="input" value={receiptForm.cpf} onChange={(event) => setReceiptForm({ ...receiptForm, cpf: event.target.value })} /></FormField>
          <FormField label="Procedimento"><input className="input" value={receiptForm.procedure} onChange={(event) => setReceiptForm({ ...receiptForm, procedure: event.target.value })} /></FormField>
          <FormField label="Valor pago"><MoneyInput value={Number(receiptForm.amount)} onChange={(value) => setReceiptForm({ ...receiptForm, amount: value })} /></FormField>
          <FormField label="Forma de pagamento"><select className="input" value={receiptForm.paymentMethod} onChange={(event) => setReceiptForm({ ...receiptForm, paymentMethod: event.target.value as PaymentMethod })}>{paymentMethods.map((method) => <option key={method}>{method}</option>)}</select></FormField>
          <FormField label="Data"><input className="input" type="date" value={receiptForm.date} onChange={(event) => setReceiptForm({ ...receiptForm, date: event.target.value })} /></FormField>
          <FormField label="Profissional"><select className="input" value={receiptForm.professionalId} onChange={(event) => setReceiptForm({ ...receiptForm, professionalId: event.target.value })}>{professionals.map((professional) => <option key={professional.id} value={professional.id}>{professional.name}</option>)}</select></FormField>
          <FormField label="Observações"><textarea className="input min-h-20" value={receiptForm.notes} onChange={(event) => setReceiptForm({ ...receiptForm, notes: event.target.value })} /></FormField>
        </div>
        <button onClick={generateReceipt} className="mt-4 rounded-md bg-avvi-blue px-5 py-2 font-bold text-white"><FileText className="mr-2 inline" size={16} />Gerar recibo em PDF</button>
      </Panel>
      <Panel>
        <h3 className="mb-3 text-lg font-bold">Histórico de recibos</h3>
        <div className="space-y-2">
          {receipts.map((receipt) => (
            <div key={receipt.id} className="rounded-md border border-avvi-line p-3 text-sm">
              <p className="font-bold">{receipt.patientName}</p>
              <p>{receipt.procedure} · {currency(receipt.amount)}</p>
              <p className="text-slate-500">{formatDate(receipt.date)} · {professionalName(receipt.professionalId)}</p>
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function ProfessionalPaymentView(props: {
  entries: FinancialEntry[];
  professionals: Professional[];
  selectedMonth: string;
  setSelectedMonth: (value: string) => void;
  professionalFilter: string;
  setProfessionalFilter: (value: string) => void;
  selectedEntryIds: string[];
  setSelectedEntryIds: (ids: string[]) => void;
  generateReceipt: () => void;
  professionalReceipts: ProfessionalPaymentReceipt[];
  deleteProfessionalReceipt: (id: string) => void;
  patientName: (id?: string) => string;
  professionalName: (id?: string) => string;
  procedureName: (entry: FinancialEntry) => string;
}) {
  const initialPeriod = monthPeriod(props.selectedMonth);
  const [periodStart, setPeriodStart] = useState(initialPeriod.start);
  const [periodEnd, setPeriodEnd] = useState(initialPeriod.end);
  const rows = props.entries.filter((entry) => isDateInPeriod(entry.date, periodStart, periodEnd) && (props.professionalFilter === "todos" || entry.professionalId === props.professionalFilter));
  const receiptsInMonth = props.professionalReceipts.filter((receipt) => isDateInPeriod(receipt.date, periodStart, periodEnd));
  const receiptedEntryIds = props.professionalReceipts.flatMap((receipt) => receipt.entryIds);
  const selectedEntries = rows.filter((entry) => props.selectedEntryIds.includes(entry.id));
  const totalSelected = selectedEntries.reduce((sum, entry) => sum + calculateEntry(entry).professionalValue, 0);

  function toggleEntry(entryId: string) {
    if (receiptedEntryIds.includes(entryId)) return;
    props.setSelectedEntryIds(props.selectedEntryIds.includes(entryId) ? props.selectedEntryIds.filter((id) => id !== entryId) : [...props.selectedEntryIds, entryId]);
  }

  function toggleAll() {
    const rowIds = rows.filter((entry) => !receiptedEntryIds.includes(entry.id)).map((entry) => entry.id);
    const allSelected = rowIds.every((id) => props.selectedEntryIds.includes(id));
    props.setSelectedEntryIds(allSelected ? props.selectedEntryIds.filter((id) => !rowIds.includes(id)) : Array.from(new Set([...props.selectedEntryIds, ...rowIds])));
  }

  function selectProfessionalPaymentMonth(month: string) {
    const period = monthPeriod(month);
    props.setSelectedMonth(month);
    setPeriodStart(period.start);
    setPeriodEnd(period.end);
  }

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold">Pagamento Profissional</h3>
            <p className="text-sm text-slate-500">Selecione lançamentos para gerar recibo de pagamento da profissional.</p>
          </div>
          <div className="rounded-md bg-avvi-soft px-4 py-3 text-right">
            <p className="text-xs font-bold uppercase text-avvi-blue">Total selecionado</p>
            <p className="text-2xl font-bold text-avvi-ink">{currency(totalSelected)}</p>
          </div>
        </div>
        <div className="mt-4 grid gap-3 xl:grid-cols-[1fr_240px_auto_auto]">
          <PeriodFilter start={periodStart} end={periodEnd} month={props.selectedMonth} onStartChange={setPeriodStart} onEndChange={setPeriodEnd} onMonthChange={selectProfessionalPaymentMonth} />
          <select value={props.professionalFilter} onChange={(event) => { props.setProfessionalFilter(event.target.value); props.setSelectedEntryIds([]); }} className="input">
            <option value="todos">Todas profissionais</option>
            {props.professionals.map((professional) => <option key={professional.id} value={professional.id}>{professional.name}</option>)}
          </select>
          <button onClick={toggleAll} className="rounded-md border border-avvi-line bg-white px-4 py-2 text-sm font-bold text-avvi-blue">Selecionar todos</button>
          <button onClick={props.generateReceipt} disabled={!props.selectedEntryIds.length} className="rounded-md bg-avvi-blue px-5 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50">
            <FileText className="mr-2 inline" size={16} />Gerar recibo
          </button>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <Panel>
          <DataTable
            headers={["Selecionar", "Data", "Profissional", "Paciente", "Procedimento", "Recebido", "Taxa/desc", "Lucro base", "Valor profissional"]}
            rows={rows.map((entry) => {
              const summary = calculateEntry(entry);
              const isReceipted = receiptedEntryIds.includes(entry.id);
              return [
                <input key={entry.id} type="checkbox" checked={props.selectedEntryIds.includes(entry.id)} disabled={isReceipted} onChange={() => toggleEntry(entry.id)} className="h-4 w-4 accent-[#b8862b] disabled:opacity-30" />,
                formatDate(entry.date),
                props.professionalName(entry.professionalId),
                props.patientName(entry.patientId),
                <span key={`${entry.id}-procedure`} className={isReceipted ? "text-slate-400" : ""}>{props.procedureName(entry)}{isReceipted ? " · recibo gerado" : ""}</span>,
                currency(summary.received),
                currency(summary.machineFee + summary.discount),
                currency(summary.baseProfit),
                <strong key={`${entry.id}-value`} className="text-avvi-violet">{currency(summary.professionalValue)}</strong>
              ];
            })}
          />
        </Panel>
        <Panel>
          <h3 className="text-lg font-bold">Recibos gerados</h3>
          <p className="mb-3 text-sm text-slate-500">Recibos do período selecionado.</p>
          <div className="space-y-2">
            {receiptsInMonth.length ? receiptsInMonth.map((receipt) => (
              <div key={receipt.id} className="rounded-md border border-avvi-line bg-white p-3 text-sm">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold">{receipt.professionalName}</p>
                    <p className="text-slate-500">{formatDate(receipt.date)}</p>
                    <p className="mt-1 font-bold text-avvi-violet">{currency(receipt.total)}</p>
                  </div>
                  <button onClick={() => props.deleteProfessionalReceipt(receipt.id)} className="rounded-md border border-red-100 p-2 text-avvi-red hover:bg-red-50" title="Excluir recibo">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            )) : <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-500">Nenhum recibo gerado neste período.</p>}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function ProceduresView({ procedureForm, setProcedureForm, procedures, setProcedures, saveProcedure }: { procedureForm: ReturnType<typeof makeProcedureForm>; setProcedureForm: (form: ReturnType<typeof makeProcedureForm>) => void; procedures: Procedure[]; setProcedures: (items: Procedure[]) => void; saveProcedure: () => void }) {
  return (
    <div className="space-y-4">
      <Panel>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold">Cadastro de procedimentos</h3>
            <p className="text-sm text-slate-500">Preço, custo e comissão preenchidos automaticamente nos lançamentos.</p>
          </div>
          <span className="rounded-full bg-avvi-soft px-3 py-1 text-xs font-bold text-avvi-blue">{procedures.length} procedimentos</span>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <FormField label="Nome"><input className="input" value={procedureForm.name} onChange={(event) => setProcedureForm({ ...procedureForm, name: event.target.value })} /></FormField>
          <FormField label="Categoria"><input className="input" value={procedureForm.category} onChange={(event) => setProcedureForm({ ...procedureForm, category: event.target.value })} /></FormField>
          <FormField label="Preço padrão"><MoneyInput value={Number(procedureForm.price)} onChange={(value) => setProcedureForm({ ...procedureForm, price: value })} /></FormField>
          <FormField label="Custo médio"><MoneyInput value={Number(procedureForm.averageCost)} onChange={(value) => setProcedureForm({ ...procedureForm, averageCost: value })} /></FormField>
          <FormField label="% profissional"><input className="input" type="number" value={procedureForm.professionalPercent} onChange={(event) => setProcedureForm({ ...procedureForm, professionalPercent: Number(event.target.value) })} /></FormField>
          <FormField label="Observações"><input className="input" value={procedureForm.notes} onChange={(event) => setProcedureForm({ ...procedureForm, notes: event.target.value })} /></FormField>
        </div>
        <button onClick={saveProcedure} className="mt-4 rounded-md bg-avvi-blue px-5 py-2 font-bold text-white">Salvar procedimento</button>
      </Panel>
      <Panel>
        <DataTable
          headers={["Procedimento", "Categoria", "Preço", "Custo médio", "% Prof.", "Status", "Ações"]}
          rows={procedures.map((procedure) => [procedure.name, procedure.category, currency(procedure.price), currency(procedure.averageCost), `${procedure.professionalPercent}%`, procedure.active ? "Ativo" : "Inativo", (
            <div key={procedure.id} className="flex flex-wrap items-center gap-2">
              <ActionButtons
                onEdit={() => setProcedureForm(procedure)}
                onDelete={() => setProcedures(procedures.filter((item) => item.id !== procedure.id))}
              />
              <button onClick={() => setProcedures(procedures.map((item) => item.id === procedure.id ? { ...item, active: !item.active } : item))} className="rounded-md bg-avvi-soft px-3 py-2 text-sm font-bold text-avvi-blue">
                {procedure.active ? "Desativar" : "Ativar"}
              </button>
            </div>
          )])}
        />
      </Panel>
    </div>
  );
}

function ProfessionalsView({ professionalForm, setProfessionalForm, professionals, setProfessionals, saveProfessional }: { professionalForm: ReturnType<typeof makeProfessionalForm>; setProfessionalForm: (form: ReturnType<typeof makeProfessionalForm>) => void; professionals: Professional[]; setProfessionals: (items: Professional[]) => void; saveProfessional: () => void }) {
  function updateAvatar(professional: Professional, file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onloadend = () => {
      setProfessionals(professionals.map((item) => item.id === professional.id ? { ...item, avatarDataUrl: String(reader.result) } : item));
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-4">
      <Panel>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold">Cadastro de profissionais</h3>
            <p className="text-sm text-slate-500">Dados da profissional, comissão padrão e meta mensal do dashboard.</p>
          </div>
          <span className="rounded-full bg-avvi-soft px-3 py-1 text-xs font-bold text-avvi-blue">{professionals.length} profissionais</span>
        </div>
        <div className="grid gap-3 md:grid-cols-3">
          <FormField label="Nome"><input className="input" value={professionalForm.name} onChange={(event) => setProfessionalForm({ ...professionalForm, name: event.target.value })} /></FormField>
          <FormField label="Especialidade"><input className="input" value={professionalForm.specialty} onChange={(event) => setProfessionalForm({ ...professionalForm, specialty: event.target.value })} /></FormField>
          <FormField label="Telefone"><input className="input" value={professionalForm.phone} onChange={(event) => setProfessionalForm({ ...professionalForm, phone: event.target.value })} /></FormField>
          <FormField label="E-mail"><input className="input" type="email" value={professionalForm.email} onChange={(event) => setProfessionalForm({ ...professionalForm, email: event.target.value })} /></FormField>
          <FormField label="CPF"><input className="input" value={professionalForm.cpf} onChange={(event) => setProfessionalForm({ ...professionalForm, cpf: event.target.value })} /></FormField>
          <FormField label="Data de nascimento"><input className="input" type="date" value={professionalForm.birthDate} onChange={(event) => setProfessionalForm({ ...professionalForm, birthDate: event.target.value })} /></FormField>
          <FormField label="% comissão padrão"><input className="input" type="number" value={professionalForm.commissionPercent} onChange={(event) => setProfessionalForm({ ...professionalForm, commissionPercent: Number(event.target.value) })} /></FormField>
          <FormField label="Cor na agenda"><input className="input h-10" type="color" value={professionalForm.color} onChange={(event) => setProfessionalForm({ ...professionalForm, color: event.target.value })} /></FormField>
          <FormField label="Observações"><textarea className="input min-h-20" value={professionalForm.notes} onChange={(event) => setProfessionalForm({ ...professionalForm, notes: event.target.value })} /></FormField>
        </div>
        <button onClick={saveProfessional} className="mt-4 rounded-md bg-avvi-blue px-5 py-2 font-bold text-white">Salvar profissional</button>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        {professionals.map((professional) => (
          <Panel key={professional.id}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <label className="grid h-12 w-12 cursor-pointer place-items-center overflow-hidden rounded-full text-sm font-bold text-white" style={{ background: professional.color }} title="Adicionar foto">
                  {professional.avatarDataUrl ? <Image src={professional.avatarDataUrl} alt={professional.name} width={48} height={48} className="h-full w-full object-cover" unoptimized /> : professional.name.slice(0, 1)}
                  <input type="file" accept="image/*" className="hidden" onChange={(event) => updateAvatar(professional, event.target.files?.[0])} />
                </label>
                <div>
                  <h4 className="text-lg font-bold">{professional.name}</h4>
                  <p className="text-sm text-slate-500">{professional.specialty}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <ActionButtons
                  onEdit={() => setProfessionalForm(professional)}
                  onDelete={() => setProfessionals(professionals.filter((item) => item.id !== professional.id))}
                />
                <button onClick={() => setProfessionals(professionals.map((item) => item.id === professional.id ? { ...item, active: !item.active } : item))} className="rounded-md bg-avvi-soft px-3 py-2 text-sm font-bold text-avvi-blue">
                  {professional.active ? "Ativa" : "Inativa"}
                </button>
              </div>
            </div>
            <div className="mt-4 grid gap-3 text-sm md:grid-cols-3">
              <SummaryItem label="Comissão" value={`${professional.commissionPercent}%`} tone="violet" />
              <SummaryItem label="Telefone" value={professional.phone || "-"} />
            </div>
            <p className="mt-3 text-sm text-slate-500">{professional.email || "Sem e-mail cadastrado"}</p>
            <p className="mt-1 text-sm text-slate-500">{professional.notes || "Sem observações."}</p>
          </Panel>
        ))}
      </div>
    </div>
  );
}

function PatientsView({ patientForm, setPatientForm, patients, setPatients, professionals, appointments }: { patientForm: Patient; setPatientForm: (form: Patient) => void; patients: Patient[]; setPatients: (patients: Patient[]) => void; professionals: Professional[]; appointments: Appointment[] }) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [showScheduleInfo, setShowScheduleInfo] = useState(false);

  function savePatient() {
    setPatients(savePatientRecord(patientForm, patients));
    setPatientForm(makePatientForm());
    setIsFormOpen(false);
    setShowScheduleInfo(false);
  }

  function openNewPatient() {
    setPatientForm(makePatientForm());
    setShowScheduleInfo(false);
    setIsFormOpen(true);
  }

  function openEditPatient(patient: Patient) {
    setPatientForm({ ...makePatientForm(), ...patient });
    setShowScheduleInfo(false);
    setIsFormOpen(true);
  }

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold">Cadastro de Pacientes</h3>
            <p className="text-sm text-slate-500">Prévia dos pacientes cadastrados.</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={openNewPatient} className="rounded-md bg-avvi-blue px-4 py-2 text-sm font-bold text-white"><Plus className="mr-2 inline" size={16} />Adicionar Paciente</button>
            <span className="rounded-full bg-avvi-soft px-3 py-1 text-xs font-bold text-avvi-blue">{patients.length} pacientes</span>
          </div>
        </div>
      </Panel>

      {isFormOpen && (
        <Panel>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-bold">{patientForm.id ? "Editar paciente" : "Adicionar Paciente"}</h3>
              <p className="text-sm text-slate-500">Todas as informações são opcionais.</p>
            </div>
            <button onClick={() => { setIsFormOpen(false); setPatientForm(makePatientForm()); setShowScheduleInfo(false); }} className="rounded-md border border-avvi-line p-2 text-slate-500 hover:bg-avvi-soft" title="Fechar">
              <X size={18} />
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <FormField label="Nome"><input className="input" value={patientForm.name} onChange={(event) => setPatientForm({ ...patientForm, name: event.target.value })} /></FormField>
            <FormField label="Gênero">
              <select className="input" value={patientForm.gender ?? ""} onChange={(event) => setPatientForm({ ...patientForm, gender: event.target.value as Patient["gender"] })}>
                <option value="">Opcional</option>
                <option value="Feminino">Feminino</option>
                <option value="Masculino">Masculino</option>
                <option value="Não informado">Não informado</option>
              </select>
            </FormField>
            <FormField label="Telefone"><input className="input" value={patientForm.phone} onChange={(event) => setPatientForm({ ...patientForm, phone: event.target.value })} /></FormField>
            <FormField label="CPF"><input className="input" value={patientForm.cpf} onChange={(event) => setPatientForm({ ...patientForm, cpf: event.target.value })} /></FormField>
            <FormField label="Data de nascimento"><input className="input" type="date" value={patientForm.birthDate} onChange={(event) => setPatientForm({ ...patientForm, birthDate: event.target.value })} /></FormField>
            <FormField label="Data de Cadastro"><input className="input" type="date" value={patientForm.registrationDate ?? todayKey()} onChange={(event) => setPatientForm({ ...patientForm, registrationDate: event.target.value })} /></FormField>
            <FormField label="Pontos de Fidelidade"><input className="input" type="number" min={0} value={patientForm.loyaltyPoints ?? 0} onChange={(event) => setPatientForm({ ...patientForm, loyaltyPoints: Number(event.target.value) || 0 })} /></FormField>
            <FormField label="Endereço"><input className="input" value={patientForm.address ?? ""} onChange={(event) => setPatientForm({ ...patientForm, address: event.target.value })} /></FormField>
            <FormField label="Profissional vinculada">
              <select className="input" value={patientForm.professionalId ?? ""} onChange={(event) => setPatientForm({ ...patientForm, professionalId: event.target.value || undefined })}>
                <option value="">Opcional</option>
                {professionals.map((professional) => <option key={professional.id} value={professional.id}>{professional.name}</option>)}
              </select>
            </FormField>
            <FormField label="Crédito futuro"><MoneyInput value={Number(patientForm.futureCredit) || 0} onChange={(value) => setPatientForm({ ...patientForm, futureCredit: value })} /></FormField>
            <FormField label="Observações"><textarea className="input min-h-20" value={patientForm.notes} onChange={(event) => setPatientForm({ ...patientForm, notes: event.target.value })} /></FormField>
          </div>
          {patientForm.id && (
            <div className="mt-4">
              <button onClick={() => setShowScheduleInfo((current) => !current)} className="rounded-md border border-avvi-line bg-white px-4 py-2 text-sm font-bold text-avvi-blue">
                {showScheduleInfo ? "Ocultar agendamentos" : "Ver informações de agendamento"}
              </button>
              {showScheduleInfo && <PatientScheduleInfo patientId={patientForm.id} appointments={appointments} />}
            </div>
          )}
          <button onClick={savePatient} className="mt-4 rounded-md bg-avvi-blue px-5 py-2 font-bold text-white">Salvar paciente</button>
        </Panel>
      )}

      <Panel>
        <DataTable
          headers={["Nome", "Gênero", "Telefone", "CPF", "Cadastro", "Pontos", "Profissional", "Crédito futuro", "Observações", "Ações"]}
          rows={patients.map((patient) => [
            patient.name,
            patient.gender || "-",
            patient.phone || "-",
            patient.cpf || "-",
            patient.registrationDate ? formatDate(patient.registrationDate) : "-",
            String(patient.loyaltyPoints ?? 0),
            professionals.find((professional) => professional.id === patient.professionalId)?.name || "-",
            currency(Number(patient.futureCredit) || 0),
            patient.notes || "-",
            <ActionButtons key={patient.id} onEdit={() => openEditPatient(patient)} onDelete={() => setPatients(patients.filter((item) => item.id !== patient.id))} />
          ])}
        />
      </Panel>
    </div>
  );
}

function PatientScheduleInfo({ patientId, appointments }: { patientId: string; appointments: Appointment[] }) {
  const patientAppointments = appointments
    .filter((appointment) => appointment.patientId === patientId)
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const first = patientAppointments[0];
  const last = patientAppointments[patientAppointments.length - 1];

  return (
    <div className="mt-3 grid gap-3 rounded-md border border-avvi-line bg-slate-50 p-3 text-sm md:grid-cols-4">
      <SummaryItem label="Primeiro agendamento" value={first ? formatDate(first.startsAt.slice(0, 10)) : "-"} />
      <SummaryItem label="Status do primeiro agendamento" value={first?.status ?? "-"} />
      <SummaryItem label="Último agendamento" value={last ? formatDate(last.startsAt.slice(0, 10)) : "-"} />
      <SummaryItem label="Status do último agendamento" value={last?.status ?? "-"} />
    </div>
  );
}


function ProfessionalReportView({ entries, professionals, selectedMonth, setSelectedMonth, monthlyGoals, professionalName }: { entries: FinancialEntry[]; professionals: Professional[]; selectedMonth: string; setSelectedMonth: (value: string) => void; monthlyGoals: MonthlyGoals[]; professionalName: (id?: string) => string }) {
  const initialPeriod = monthPeriod(selectedMonth);
  const [periodStart, setPeriodStart] = useState(initialPeriod.start);
  const [periodEnd, setPeriodEnd] = useState(initialPeriod.end);
  function selectPeriodMonth(month: string) {
    const period = monthPeriod(month);
    setSelectedMonth(month);
    setPeriodStart(period.start);
    setPeriodEnd(period.end);
  }
  const activeMonths = monthsInPeriod(periodStart, periodEnd);

  const report = professionals.map((professional) => {
    const professionalEntries = entries.filter((entry) => entry.professionalId === professional.id && isDateInPeriod(entry.date, periodStart, periodEnd));
    const goal = activeMonths.reduce((sum, month) => sum + getProfessionalGoal(monthlyGoals, month, professional), 0);
    return professionalEntries.reduce((acc, entry) => {
      const summary = calculateEntry(entry);
      acc.totalPaid += summary.received;
      acc.totalProfit += summary.baseProfit;
      acc.companyRevenue += summary.companyValue;
      acc.professionalValue += summary.professionalValue;
      acc.count += 1;
      return acc;
    }, { professional, goal, totalPaid: 0, totalProfit: 0, companyRevenue: 0, professionalValue: 0, count: 0 });
  }).sort((a, b) => b.totalPaid - a.totalPaid);

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold">Relatório por Profissional</h3>
            <p className="text-sm text-slate-500">Ranking do maior faturamento para o menor.</p>
          </div>
          <div className="w-full max-w-2xl">
            <PeriodFilter start={periodStart} end={periodEnd} month={selectedMonth} onStartChange={setPeriodStart} onEndChange={setPeriodEnd} onMonthChange={selectPeriodMonth} />
          </div>
        </div>
      </Panel>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {report.map((item, index) => (
          <Panel key={item.professional.id}>
            <div className="flex items-center justify-between">
              <h4 className="text-xl font-bold">{index + 1}. {professionalName(item.professional.id)}</h4>
              <span className="rounded-full bg-avvi-soft px-3 py-1 text-xs font-bold text-avvi-blue">{item.count} serviço(s)</span>
            </div>
            <div className="mt-4 space-y-3">
              <ReportLine label="Total Pago (Clientes):" value={currency(item.totalPaid)} />
              <div>
                <GoalProgress value={item.totalPaid} goal={item.goal} />
              </div>
              <ReportLine label="Lucro Total:" value={currency(item.totalProfit)} tone="green" />
              <ReportLine label="Receita Empresa:" value={currency(item.companyRevenue)} tone="blue" />
              <div className="border-t border-avvi-line pt-3">
                <ReportLine label="Valor Recebido (Profissional):" value={currency(item.professionalValue)} strong />
              </div>
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}

function GoalsView({ selectedMonth, setSelectedMonth, professionals, entries, revenues, costs, monthlyGoals, setMonthlyGoals }: { selectedMonth: string; setSelectedMonth: (value: string) => void; professionals: Professional[]; entries: FinancialEntry[]; revenues: RevenueEntry[]; costs: FixedCost[]; monthlyGoals: MonthlyGoals[]; setMonthlyGoals: (goals: MonthlyGoals[]) => void }) {
  const goal = getMonthlyGoal(monthlyGoals, selectedMonth, professionals);
  const monthSummary = summarizeMonth(revenues, costs, selectedMonth);

  function updateCompanyGoal(value: number) {
    setMonthlyGoals(upsertMonthlyGoal(monthlyGoals, { ...goal, companyGoal: value }));
  }

  function updateProfessionalGoal(professionalId: string, value: number) {
    setMonthlyGoals(upsertMonthlyGoal(monthlyGoals, { ...goal, professionalGoals: { ...goal.professionalGoals, [professionalId]: value } }));
  }

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold">Metas</h3>
            <p className="text-sm text-slate-500">Metas mensais usadas no Dashboard.</p>
          </div>
          <input type="month" value={selectedMonth} onChange={(event) => setSelectedMonth(event.target.value)} className="input w-40" />
        </div>
      </Panel>

      <Panel>
        <div className="grid gap-4 md:grid-cols-[1fr_220px]">
          <div>
            <h4 className="font-bold">Meta da empresa</h4>
            <GoalProgress value={monthSummary.revenue} goal={goal.companyGoal} />
          </div>
          <FormField label="Meta mensal empresa">
            <MoneyInput value={goal.companyGoal} onChange={updateCompanyGoal} />
          </FormField>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        {professionals.map((professional) => {
          const professionalRevenue = entries.filter((entry) => entry.professionalId === professional.id && monthKey(entry.date) === selectedMonth).reduce((sum, entry) => sum + calculateEntry(entry).received, 0);
          const professionalGoal = goal.professionalGoals[professional.id] ?? professional.monthlyGoal ?? 0;
          return (
            <Panel key={professional.id}>
              <div className="grid gap-4 md:grid-cols-[1fr_220px]">
                <div>
                  <h4 className="font-bold">{professional.name}</h4>
                  <GoalProgress value={professionalRevenue} goal={professionalGoal} />
                </div>
                <FormField label="Meta mensal">
                  <MoneyInput value={professionalGoal} onChange={(value) => updateProfessionalGoal(professional.id, value)} />
                </FormField>
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}

function CostsView({ costForm, setCostForm, costs, setCosts, saveCost }: { costForm: ReturnType<typeof makeCostForm>; setCostForm: (form: ReturnType<typeof makeCostForm>) => void; costs: FixedCost[]; setCosts: (items: FixedCost[]) => void; saveCost: () => void }) {
  const installmentValue = costForm.creditInstallments > 0 ? Number(costForm.value) / Number(costForm.creditInstallments) : Number(costForm.value);
  const [periodStart, setPeriodStart] = useState(`${todayKey().slice(0, 7)}-01`);
  const [periodEnd, setPeriodEnd] = useState(format(endOfMonth(parseISO(`${todayKey().slice(0, 7)}-01`)), "yyyy-MM-dd"));
  const [periodMonth, setPeriodMonth] = useState(todayKey().slice(0, 7));
  const filteredCosts = costs.filter((cost) => isDateInPeriod(cost.dueDate, periodStart, periodEnd));
  const filteredTotal = filteredCosts.reduce((sum, cost) => sum + Number(cost.value), 0);

  function applyMonthFilter(month: string) {
    setPeriodMonth(month);
    setPeriodStart(`${month}-01`);
    setPeriodEnd(format(endOfMonth(parseISO(`${month}-01`)), "yyyy-MM-dd"));
  }

  return (
    <div className="space-y-4">
      <Panel>
        <h3 className="mb-4 text-lg font-bold">Cadastrar custo</h3>
        <div className="grid gap-3 md:grid-cols-3">
          <FormField label="Nome do custo"><input className="input" value={costForm.name} onChange={(event) => setCostForm({ ...costForm, name: event.target.value })} /></FormField>
          <FormField label="Categoria">
            <select className="input" value={costForm.category} onChange={(event) => setCostForm({ ...costForm, category: event.target.value })}>
              <option value="Custos fixos">Custos fixos</option>
              <option value="Custos variáveis">Custos variáveis</option>
            </select>
          </FormField>
          <FormField label="Tipo"><input className="input" value={costForm.costType ?? ""} onChange={(event) => setCostForm({ ...costForm, costType: event.target.value })} /></FormField>
          <FormField label="Profissional"><input className="input" value={costForm.professionalName ?? ""} onChange={(event) => setCostForm({ ...costForm, professionalName: event.target.value })} /></FormField>
          <FormField label="Fornecedor"><input className="input" value={costForm.supplier ?? ""} onChange={(event) => setCostForm({ ...costForm, supplier: event.target.value })} /></FormField>
          <FormField label="Valor"><MoneyInput value={Number(costForm.value)} onChange={(value) => setCostForm({ ...costForm, value })} /></FormField>
          <FormField label="Vencimento"><input className="input" type="date" value={costForm.dueDate} onChange={(event) => setCostForm({ ...costForm, dueDate: event.target.value })} /></FormField>
          <FormField label="Status"><select className="input" value={costForm.status} onChange={(event) => setCostForm({ ...costForm, status: event.target.value as FixedCostStatus })}>{["Pago", "Pendente", "Atrasado"].map((status) => <option key={status}>{status}</option>)}</select></FormField>
          <FormField label="Forma de pagamento"><select className="input" value={costForm.paymentMethod} onChange={(event) => setCostForm({ ...costForm, paymentMethod: event.target.value as PaymentMethod, creditInstallments: event.target.value === "Crédito" ? costForm.creditInstallments : 1 })}>{paymentMethods.map((method) => <option key={method}>{method}</option>)}</select></FormField>
          {costForm.paymentMethod === "Crédito" && (
            <FormField label="Parcelas no crédito">
              <input className="input" type="number" min={1} max={36} value={costForm.creditInstallments} onChange={(event) => setCostForm({ ...costForm, creditInstallments: Number(event.target.value) || 1 })} />
            </FormField>
          )}
          {costForm.paymentMethod === "Crédito" && (
            <div className="rounded-md border border-amber-200 bg-avvi-soft p-3 text-sm">
              <p className="font-bold text-avvi-ink">{costForm.creditInstallments}x de {currency(installmentValue)}</p>
              <p className="text-xs text-slate-500">Total do custo: {currency(Number(costForm.value))}</p>
            </div>
          )}
          <FormField label="Replicar para próximos meses">
            <input className="input" type="number" min={0} max={60} value={costForm.replicateMonths} onChange={(event) => setCostForm({ ...costForm, replicateMonths: Number(event.target.value) || 0 })} />
          </FormField>
          <FormField label="Descrição"><input className="input" value={costForm.notes} onChange={(event) => setCostForm({ ...costForm, notes: event.target.value })} /></FormField>
        </div>
        <button onClick={saveCost} className="mt-4 rounded-md bg-avvi-blue px-5 py-2 font-bold text-white">Salvar custo</button>
      </Panel>
      <Panel>
        <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_1fr_1fr_220px]">
          <FormField label="Início">
            <input className="input" type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} />
          </FormField>
          <FormField label="Fim">
            <input className="input" type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} />
          </FormField>
          <FormField label="Escolher mês">
            <input className="input" type="month" value={periodMonth} onChange={(event) => applyMonthFilter(event.target.value)} />
          </FormField>
          <div className="rounded-xl border border-red-100 bg-red-50 p-4">
            <p className="text-xs font-bold uppercase text-avvi-red">Custo total</p>
            <p className="mt-1 text-2xl font-bold text-slate-950">{currency(filteredTotal)}</p>
            <p className="mt-1 text-xs text-slate-500">{filteredCosts.length} custo(s) no período</p>
          </div>
        </div>
        <DataTable
          headers={["Descrição", "Categoria", "Tipo", "Profissional", "Fornecedor", "Valor", "Vencimento", "Status", "Pagamento", "Parcelas", "Ações"]}
          rows={filteredCosts.map((cost) => [
            cost.notes || cost.name,
            cost.category,
            cost.costType || "-",
            cost.professionalName || "-",
            cost.supplier || "-",
            currency(cost.value),
            formatDate(cost.dueDate),
            cost.status,
            cost.paymentMethod,
            cost.paymentMethod === "Crédito" ? `${cost.creditInstallments}x de ${currency(cost.value / Math.max(1, cost.creditInstallments))}` : "-",
            <ActionButtons key={cost.id} onEdit={() => setCostForm(cost)} onDelete={() => setCosts(costs.filter((item) => item.id !== cost.id))} />
          ])}
        />
      </Panel>
    </div>
  );
}

function DashboardView(props: {
  selectedMonth: string;
  setSelectedMonth: (value: string) => void;
  professionalFilter: string;
  setProfessionalFilter: (value: string) => void;
  reportFilter: string;
  setReportFilter: (value: string) => void;
  entries: FinancialEntry[];
  revenues: RevenueEntry[];
  costs: FixedCost[];
  professionals: Professional[];
  monthlyGoals: MonthlyGoals[];
  currentMonthSummary: ReturnType<typeof summarizeMonth>;
  previousSummary: ReturnType<typeof summarizeMonth>;
  professionalName: (id?: string) => string;
}) {
  const initialPeriod = monthPeriod(props.selectedMonth);
  const [periodStart, setPeriodStart] = useState(initialPeriod.start);
  const [periodEnd, setPeriodEnd] = useState(initialPeriod.end);
  const periodSummary = summarizePeriod(props.revenues, props.costs, periodStart, periodEnd);
  const elapsed = monthProgress(props.selectedMonth);
  const activeGoal = getMonthlyGoal(props.monthlyGoals, props.selectedMonth, props.professionals);
  const annual = Array.from({ length: 12 }, (_, index) => {
    const key = `${props.selectedMonth.slice(0, 4)}-${String(index + 1).padStart(2, "0")}`;
    const summary = summarizeMonth(props.revenues, props.costs, key);
    return { month: format(parseISO(`${key}-01`), "MMM", { locale: ptBR }), Receita: summary.revenue, Resultado: summary.result };
  });
  const cards = props.professionals.filter((professional) => props.professionalFilter === "todos" || professional.id === props.professionalFilter).map((professional) => {
    const professionalEntryIds = new Set(props.entries.filter((entry) => entry.professionalId === professional.id).map((entry) => entry.id));
    const revenue = props.revenues.filter((revenue) => isDateInPeriod(revenue.paymentDate, periodStart, periodEnd) && revenue.sourceFinancialEntryId && professionalEntryIds.has(revenue.sourceFinancialEntryId)).reduce((sum, revenue) => sum + revenue.total, 0);
    const goal = getProfessionalGoal(props.monthlyGoals, props.selectedMonth, professional);
    const progress = goal ? (revenue / goal) * 100 : 0;
    const expected = goal * elapsed;
    const trend = revenue - expected;
    const lastRevenue = props.revenues.filter((revenue) => monthKey(revenue.paymentDate) === previousMonth(props.selectedMonth) && revenue.sourceFinancialEntryId && professionalEntryIds.has(revenue.sourceFinancialEntryId)).reduce((sum, revenue) => sum + revenue.total, 0);
    return { professional, revenue, goal, progress, missing: Math.max(0, goal - revenue), trend, lastRevenue };
  });
  const barData = [{ name: "Receita Total", realizado: periodSummary.revenue, meta: activeGoal.companyGoal }, ...cards.map((card) => ({ name: card.professional.name, realizado: card.revenue, meta: card.goal }))];

  function selectPeriodMonth(month: string) {
    const period = monthPeriod(month);
    props.setSelectedMonth(month);
    setPeriodStart(period.start);
    setPeriodEnd(period.end);
  }

  return (
    <div className="space-y-4">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-xl font-bold">Dashboard de Performance</h3>
            <p className="text-sm text-slate-500">Análise de resultados, tendências e comparativos anuais.</p>
          </div>
          <div className="grid w-full max-w-5xl gap-3 xl:grid-cols-[1fr_180px_150px]">
            <PeriodFilter start={periodStart} end={periodEnd} month={props.selectedMonth} onStartChange={setPeriodStart} onEndChange={setPeriodEnd} onMonthChange={selectPeriodMonth} />
            <select value={props.professionalFilter} onChange={(event) => props.setProfessionalFilter(event.target.value)} className="input w-44">
              <option value="todos">Todos profissionais</option>
              {props.professionals.map((professional) => <option key={professional.id} value={professional.id}>{professional.name}</option>)}
            </select>
            <select value={props.reportFilter} onChange={(event) => props.setReportFilter(event.target.value)} className="input w-36">
              {["Todos", "Receita", "Despesa", "Outros"].map((filter) => <option key={filter}>{filter}</option>)}
            </select>
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          {["Todos", "Receita", "Despesa", "Outros"].map((filter) => (
            <button key={filter} onClick={() => props.setReportFilter(filter)} className={`rounded-full px-4 py-2 text-sm font-bold ${props.reportFilter === filter ? "bg-avvi-ink text-white" : "bg-avvi-soft text-slate-600"}`}>{filter}</button>
          ))}
        </div>
      </Panel>

      <div className="grid gap-4 md:grid-cols-3">
        <MetricCard title="Resultado financeiro" value={currency(periodSummary.result)} meta={`Meta empresa: ${currency(activeGoal.companyGoal)}`} tone="blue" delta={compare(periodSummary.result, props.previousSummary.result)} />
        <MetricCard title="Total receitas" value={currency(periodSummary.revenue)} meta={`${percent((periodSummary.revenue / Math.max(1, activeGoal.companyGoal)) * 100)} da meta`} tone="green" delta={compare(periodSummary.revenue, props.previousSummary.revenue)} />
        <MetricCard title="Total despesas" value={currency(periodSummary.expenses)} meta={`Progresso do mês: ${percent(elapsed * 100)}`} tone="red" delta={compare(periodSummary.expenses, props.previousSummary.expenses)} />
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        {cards.map((card) => (
          <Panel key={card.professional.id}>
            <div className="flex items-start justify-between">
              <p className="text-sm text-slate-600">Faturamento - {card.professional.name}</p>
              {card.trend >= 0 ? <CheckCircle2 size={16} className="text-avvi-green" /> : <Activity size={16} className="text-avvi-red" />}
            </div>
            <h4 className="mt-2 text-2xl font-bold">{currency(card.revenue)}</h4>
            <p className="text-xs text-slate-500">meta: {currency(card.goal)}</p>
            <div className="mt-3 h-2 rounded-full bg-slate-100">
              <div className="h-2 rounded-full bg-avvi-blue" style={{ width: `${Math.min(100, card.progress)}%` }} />
            </div>
            <div className="mt-3 rounded-md bg-avvi-soft p-2 text-xs">
              <div className="flex justify-between"><span>Mix de receita</span><strong>{percent((card.revenue / Math.max(1, periodSummary.revenue)) * 100)}</strong></div>
              <div className="mt-1 flex justify-between text-slate-500"><span>Falta</span><span>{currency(card.missing)}</span></div>
            </div>
            <div className="mt-3 flex justify-between text-xs">
              <span>Tendência linear</span>
              <strong className={card.trend >= 0 ? "text-avvi-green" : "text-avvi-red"}>{card.trend >= 0 ? "Adiantado" : "Atrasado"} ({currency(card.trend)})</strong>
            </div>
            <p className="mt-2 text-xs text-slate-500">vs mês anterior: {compare(card.revenue, card.lastRevenue)}</p>
          </Panel>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel>
          <h3 className="mb-4 flex items-center gap-2 text-lg font-bold"><CalendarDays size={18} />Histórico: Receita Total ({props.selectedMonth.slice(0, 4)})</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={annual}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5edf7" />
                <XAxis dataKey="month" />
                <YAxis tickFormatter={(value) => `${Number(value) / 1000}k`} />
                <Tooltip formatter={(value) => currency(Number(value))} />
                <Area type="monotone" dataKey="Receita" stroke="#b8862b" fill="#fdecc8" />
                <Area type="monotone" dataKey="Resultado" stroke="#079669" fill="#bbf7d0" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel>
          <h3 className="mb-4 flex items-center gap-2 text-lg font-bold"><Goal size={18} />Realizado vs Meta</h3>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5edf7" />
                <XAxis type="number" tickFormatter={(value) => `${Number(value) / 1000}k`} />
                <YAxis type="category" dataKey="name" width={90} />
                <Tooltip formatter={(value) => currency(Number(value))} />
                <Bar dataKey="meta" fill="#dbe5f2" radius={[0, 4, 4, 0]} />
                <Bar dataKey="realizado" fill="#b8862b" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return <section className="rounded-2xl border border-white/70 bg-white/90 p-5 shadow-panel backdrop-blur">{children}</section>;
}

function SidebarGroup({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 px-3 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-400">{label}</p>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function FormField({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-xs font-semibold text-slate-600">{label}<div className="mt-1.5">{children}</div></label>;
}

function MoneyInput({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  return (
    <div className="flex overflow-hidden rounded-lg border border-avvi-line bg-white/90 focus-within:border-avvi-blue focus-within:ring-4 focus-within:ring-amber-100/70">
      <span className="grid place-items-center border-r border-avvi-line bg-avvi-soft px-3 text-sm font-bold text-avvi-blue">R$</span>
      <input type="number" step="0.01" value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-full bg-white px-3 py-2 text-sm text-avvi-ink outline-none" />
    </div>
  );
}

function ActionButtons({ onEdit, onDelete, small = false }: { onEdit: () => void; onDelete: () => void; small?: boolean }) {
  const size = small ? 14 : 16;
  const padding = small ? "p-1.5" : "p-2";
  return (
    <div className={`flex items-center ${small ? "gap-1" : "gap-2"}`}>
      <button onClick={onEdit} className={`rounded-md border border-avvi-line ${padding} text-avvi-blue hover:bg-avvi-soft`} title="Editar">
        <Pencil size={size} />
      </button>
      <button onClick={onDelete} className={`rounded-md border border-red-100 ${padding} text-avvi-red hover:bg-red-50`} title="Excluir">
        <Trash2 size={size} />
      </button>
    </div>
  );
}

async function imageToDataUrl(src: string) {
  try {
    const response = await fetch(src);
    const blob = await response.blob();
    return await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result));
      reader.readAsDataURL(blob);
    });
  } catch {
    return "";
  }
}

function drawPdfRow(doc: jsPDF, values: string[], widths: number[], x: number, y: number, header: boolean) {
  let currentX = x;
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(210, 210, 210);
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(header ? 8 : 7);
  const splitValues = values.map((value, index) => doc.splitTextToSize(value, widths[index] - 2).slice(0, header ? 1 : 3));
  const rowHeight = header ? 8 : Math.max(11, Math.max(...splitValues.map((lines) => lines.length)) * 4 + 4);
  splitValues.forEach((text, index) => {
    const width = widths[index];
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(210, 210, 210);
    doc.rect(currentX, y - 6, width, rowHeight, "F");
    doc.rect(currentX, y - 6, width, rowHeight, "S");
    doc.setTextColor(0, 0, 0);
    doc.text(text, currentX + 1, y - 1);
    currentX += width;
  });
  return rowHeight;
}

function SummaryItem({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "red" | "green" | "blue" | "violet" }) {
  const colors = { slate: "text-slate-700", red: "text-avvi-red", green: "text-avvi-green", blue: "text-avvi-blue", violet: "text-avvi-violet" };
  return <div><p className="text-xs text-slate-500">{label}</p><p className={`font-bold ${colors[tone]}`}>{value}</p></div>;
}

function ReportLine({ label, value, tone = "slate", strong = false }: { label: string; value: string; tone?: "slate" | "green" | "blue"; strong?: boolean }) {
  const colors = { slate: "text-avvi-ink", green: "text-avvi-green", blue: "text-avvi-blue" };
  return (
    <div className={`flex items-center justify-between gap-3 ${strong ? "font-bold" : ""}`}>
      <span className="text-slate-600">{label}</span>
      <span className={colors[tone]}>{value}</span>
    </div>
  );
}

function GoalProgress({ value, goal }: { value: number; goal: number }) {
  const progress = goal ? Math.min(100, (value / goal) * 100) : 0;
  return (
    <div className="mt-3">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span>{currency(value)} realizado</span>
        <strong>{percent(progress)}</strong>
      </div>
      <div className="h-3 rounded-full bg-slate-100">
        <div className="h-3 rounded-full bg-avvi-blue" style={{ width: `${progress}%` }} />
      </div>
      <p className="mt-2 text-xs text-slate-500">Meta: {currency(goal)}</p>
    </div>
  );
}

function MetricCard({ title, value, meta, tone, delta }: { title: string; value: string; meta: string; tone: "blue" | "green" | "red"; delta: string }) {
  const toneMap = { blue: "border-amber-200 bg-avvi-soft text-avvi-blue", green: "border-green-200 bg-white/90 text-avvi-green", red: "border-orange-200 bg-white/90 text-avvi-red" };
  return (
    <div className={`rounded-2xl border p-5 shadow-panel ${toneMap[tone]}`}>
      <p className="text-xs font-bold uppercase">{title}</p>
      <h3 className="mt-2 text-3xl font-bold tracking-tight text-avvi-ink">{value}</h3>
      <p className="mt-2 text-xs text-slate-500">{meta}</p>
      <p className="mt-4 text-xs font-bold">{delta}</p>
    </div>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-auto thin-scrollbar">
      <table className="w-full min-w-[920px] border-separate border-spacing-0 text-left text-sm">
        <thead>
          <tr className="border-b border-avvi-line bg-slate-50/80 text-xs uppercase text-slate-500">
            {headers.map((header) => <th key={header} className="px-3 py-3 font-bold">{header}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index} className="border-b border-avvi-line bg-white/60 transition hover:bg-avvi-soft/60">
              {row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-3 align-top">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function makeAppointmentForm(professionalId: string, date: string, hour: number) {
  return { patientId: "", patientName: "", phone: "", cpf: "", birthDate: "", patientNotes: "", procedureId: "", professionalId, date, hour: String(hour), status: "Agendado" as AppointmentStatus, eventType: "Novo Agendamento", notes: "" };
}

function makeEntryForm() {
  return { id: "", appointmentId: undefined as string | undefined, patientId: "", patientName: "", professionalId: "", procedureId: "", manualProcedure: "", quantity: 1, servicePrice: 0, productCost: 0, machineFee: 0, commercialDiscount: 0, discountSplit: "Empresa e profissional dividem" as DiscountSplit, professionalPercent: 70, procedureLines: [makeProcedureLine()], date: "2026-05-27", notes: "", payments: [{ ...blankPayment, id: id("payment") }] };
}

function makeProcedureLine(): ProcedureLine {
  return { id: id("line"), procedureId: "", manualProcedure: "", quantity: 1, servicePrice: 0, productCost: 0, professionalPercent: 70 };
}

function entryToLine(entry: FinancialEntry): ProcedureLine {
  return {
    id: id("line"),
    procedureId: entry.procedureId ?? "",
    manualProcedure: entry.manualProcedure ?? "",
    quantity: entry.quantity,
    servicePrice: entry.servicePrice,
    productCost: entry.productCost,
    professionalPercent: entry.professionalPercent
  };
}

function makeReceiptForm(): Receipt {
  return { id: "", patientName: "", cpf: "", procedure: "", amount: 0, paymentMethod: "Pix", date: "2026-05-27", professionalId: "ana", notes: "" };
}

function makePatientForm(): Patient {
  return { id: "", name: "", gender: "", phone: "", cpf: "", birthDate: "", address: "", professionalId: "", futureCredit: 0, registrationDate: todayKey(), loyaltyPoints: 0, notes: "" };
}

function makeProcedureForm(): Procedure {
  return { id: "", name: "", category: "", price: 0, averageCost: 0, professionalPercent: 50, notes: "", active: true };
}

function makeProfessionalForm(): Professional {
  return {
    id: "",
    name: "",
    specialty: "",
    phone: "",
    email: "",
    cpf: "",
    birthDate: "",
    notes: "",
    active: true,
    color: "#b8862b",
    avatarDataUrl: "",
    commissionPercent: 50,
    monthlyGoal: 0
  };
}

function makeCostForm(): FixedCost {
  return { id: "", name: "", category: "Custos fixos", costType: "", professionalName: "", supplier: "", value: 0, dueDate: "2026-05-27", status: "Pendente", paymentMethod: "Pix", replicateMonths: 0, creditInstallments: 1, notes: "" };
}

function filteredEntries(entries: FinancialEntry[], selectedMonth: string, professionalFilter: string) {
  return entries.filter((entry) => monthKey(entry.date) === selectedMonth && (professionalFilter === "todos" || entry.professionalId === professionalFilter));
}

function formatDate(date: string) {
  return format(parseISO(`${date}T00:00:00`), "dd/MM/yyyy");
}

function monthLabel(key: string) {
  return format(parseISO(`${key}-01T00:00:00`), "MMM yyyy", { locale: ptBR });
}

function addMonth(date: string, amount: number) {
  const parsed = parseISO(`${date}T00:00:00`);
  const next = new Date(parsed.getFullYear(), parsed.getMonth() + amount, Math.min(parsed.getDate(), 28));
  return format(next, "yyyy-MM-dd");
}

function addMonthsToDate(date: string, amount: number) {
  const parsed = parseISO(`${date}T00:00:00`);
  return format(new Date(parsed.getFullYear(), parsed.getMonth() + amount, parsed.getDate()), "yyyy-MM-dd");
}

function previousMonth(key: string) {
  const date = parseISO(`${key}-01T00:00:00`);
  return format(new Date(date.getFullYear(), date.getMonth() - 1, 1), "yyyy-MM");
}

function monthProgress(key: string) {
  const now = key === "2026-05" ? 27 : 15;
  return Math.min(1, now / 31);
}

function compare(current: number, previous: number) {
  if (!previous) return "Sem base anterior";
  const value = ((current - previous) / Math.abs(previous)) * 100;
  return `${value >= 0 ? "+" : ""}${percent(value)} MoM`;
}

function patientNameLocal(patients: Patient[], patientId?: string) {
  return patients.find((patient) => patient.id === patientId)?.name ?? "Horário livre";
}

function procedureNameLocal(procedures: Procedure[], procedureId?: string) {
  return procedures.find((procedure) => procedure.id === procedureId)?.name ?? "Evento de agenda";
}


