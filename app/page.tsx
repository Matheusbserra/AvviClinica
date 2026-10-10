"use client";

import { Fragment } from "react";
import type { Dispatch, ElementType, ReactNode, SetStateAction } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { addMinutes, addDays, endOfMonth, format, getDate, parseISO } from "date-fns";
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
  Settings,
  Stethoscope,
  Pencil,
  Trash2,
  UserPlus,
  Users,
  WalletCards,
  MessageCircle,
  X
} from "lucide-react";
import jsPDF from "jspdf";
import { appointments as seedAppointments, financialEntries as seedFinancialEntries, fixedCosts as seedFixedCosts, patients as seedPatients, procedures as seedProcedures, professionals as seedProfessionals, receipts as seedReceipts } from "@/lib/seed";
import { catalogProcedures } from "@/lib/catalogProcedures";
import { FollowUpView, FollowUpNavigation } from "@/app/components/FollowUpView";
import { AgendaView } from "@/app/components/AgendaView";
import { UltraformerView } from "@/app/components/UltraformerView";
import { InventorySection } from "@/app/components/GiftInventoryView";
import { applyCheckoutGifts } from "@/lib/gifts";
import { AccountSummary } from "@/app/components/AccountSummary";
import { AccountCheckout } from "@/app/components/AccountCheckout";
import type { CheckoutDraft, CheckoutResult } from "@/app/components/AccountCheckout";
import { checkoutAllowsNoProducts, distributeCheckoutDiscount, restoreCheckoutItems } from "@/lib/checkout";
import { procedureEntryFromAccount } from "@/lib/accountProcedures";
import { applyCheckoutInventory } from "@/lib/inventory";
import { importedServices } from "@/lib/importedServices";
import { appointmentServices } from "@/lib/appointmentServices";
import type { AppointmentService } from "@/lib/types";
import { serviceKey } from "@/lib/services";
import { importedClients } from "@/lib/importedClients";
import { importedRevenues } from "@/lib/importedRevenues";
import { importedCosts } from "@/lib/importedCosts";
import { applyProcedureCostOverrides } from "@/lib/procedureCosts";
import { calculateEntry, currency, monthKey, percent, splitDiscountImpact, summarizeMonth } from "@/lib/calculations";
import { isSupabaseConfigured, supabase } from "@/lib/supabase";
import { appDataTableMissing, selectEntityState, syncEntityDiffs, setDatabaseAccess, isProtectedDatabase } from "@/lib/database";
import type { Appointment, AppointmentStatus, DiscountSplit, FinancialEntry, FixedCost, FixedCostStatus, Patient, PaymentItem, PaymentMethod, Procedure, ProcedureLine, Professional, ProfessionalPaymentReceipt, Receipt, RevenueEntry, Service, InventoryItem, ProductUsage, ClosedAccount, FollowUpRule, FollowUpContact, FollowUpLog, GiftStockItem, UltraformerTip, ViewMode } from "@/lib/types";
import type { MonthlyGoals as StoredMonthlyGoals } from "@/lib/database";
import { hasSnapshotChanges, readSnapshot, writeSnapshot, snapshotChanges, recoverPendingChanges, recordIsPending, snapshotEntities } from "@/lib/persistence";
import type { DataSnapshot, LocalSnapshot } from "@/lib/persistence";
import { canAccessTab, canReadEntity, canWriteEntity, hasFinancialAccess, userSnapshotKey } from "@/lib/access";
import { permittedSnapshot } from "@/lib/accessSnapshot";
import { AccountsView } from "@/app/components/AccountsView";
import { ReportsView } from "@/app/components/ReportsView";
import { ProfessionalReportView } from "@/app/components/ProfessionalReportView";
import type { AppRole, AppUser } from "@/lib/access";

type Tab = "Ultraformer MPT" | "Contas" | "Relatórios" | "Agenda" | "Estoque" | "Follow Up" | "Dashboard" | "Receitas" | "Lançamento de Procedimentos" | "Pagamento Profissional" | "Relatório Profissional" | "Recibos de Pagamento" | "Cadastro de Procedimentos" | "Cadastro de Serviços" | "Cadastro de Profissionais" | "Cadastro de Pacientes" | "Metas" | "Custos";
type MonthlyGoals = StoredMonthlyGoals;
const savedLoginKey = "avvi.saved.login.v1";

const tabs: { id: Tab; icon: ElementType }[] = [
  { id: "Agenda", icon: CalendarDays },
  { id: "Estoque", icon: WalletCards },
  { id: "Follow Up", icon: MessageCircle },
  { id: "Ultraformer MPT", icon: Activity },
  { id: "Relatórios", icon: BarChart3 },
  { id: "Dashboard", icon: LayoutDashboard },
  { id: "Receitas", icon: CircleDollarSign },
  { id: "Lançamento de Procedimentos", icon: WalletCards },
  { id: "Pagamento Profissional", icon: HandCoins },
  { id: "Relatório Profissional", icon: BarChart3 },
  { id: "Recibos de Pagamento", icon: ReceiptText },
  { id: "Cadastro de Procedimentos", icon: Stethoscope },
  { id: "Cadastro de Serviços", icon: CircleDollarSign },
  { id: "Cadastro de Profissionais", icon: UserPlus },
  { id: "Cadastro de Pacientes", icon: Users },
  { id: "Metas", icon: Goal },
  { id: "Contas", icon: Users },
  { id: "Custos", icon: Settings },
];

const statuses: AppointmentStatus[] = ["Agendado", "Confirmado", "Compareceu", "Faltou", "Cancelado", "Reagendado", "Finalizado"];
const paymentMethods: PaymentMethod[] = ["Pix", "Débito", "Crédito", "Dinheiro"];
const discountSplits: DiscountSplit[] = ["Empresa assume", "Profissional assume", "Empresa e profissional dividem"];
const eventOptions = ["Novo Agendamento", "Registrar Ausência", "Registrar Liberação de Horário", "Venda de Produto", "Pré-venda de Produto", "Venda e Consumo de Pacote", "Registro de Crédito de Cliente"];
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

function productCostOnly(entry: Pick<FinancialEntry, "quantity" | "productCost" | "procedureLines" | "products">) {
  const lines = entry.procedureLines?.length ? entry.procedureLines : [{
    quantity: entry.quantity,
    productCost: entry.productCost
  }];
  return lines.reduce((sum, line) => sum + Number(line.productCost) * Number(line.quantity), 0) + (entry.products ?? []).reduce((sum, product) => sum + product.unitCost * product.quantity, 0);
}

function servicesTotal(entry: Pick<FinancialEntry, "quantity" | "servicePrice" | "procedureLines">) {
  const lines = entry.procedureLines?.length ? entry.procedureLines : [{
    quantity: entry.quantity,
    servicePrice: entry.servicePrice
  }];
  return lines.reduce((sum, line) => sum + Number(line.servicePrice) * Number(line.quantity), 0);
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
    const lineCost = Number(line.productCost) * Number(line.quantity) + (entry.products ?? []).reduce((sum, product) => sum + product.unitCost * product.quantity, 0) * ratio;
    const received = Math.max(0, gross - lineDiscount);
    const profit = received - lineCost - lineFee;
    const professionalBeforeDiscount = Math.max(0, gross - lineCost - lineFee) * (Number(line.professionalPercent) / 100);
    const professionalValue = Math.max(0, professionalBeforeDiscount - splitDiscountImpact(lineDiscount, entry.discountSplit).professional);

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

function calculateDebitFee(amount: number) {
  return Number(((Number(amount) || 0) * 0.76 / 100).toFixed(2));
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

function readLocalSnapshot(user: AppUser): LocalSnapshot | null {
  if (typeof window === "undefined") return null;
  try {
    return readSnapshot(window.localStorage, userSnapshotKey(user));
  } catch {
    return null;
  }
}


function readSavedLogin() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(savedLoginKey);
    return raw ? JSON.parse(raw) as { login: string; password: string } : null;
  } catch {
    return null;
  }
}

export default function Home() {
  const [activeTab, setActiveTab] = useState<Tab>("Agenda");
  const [viewMode, setViewMode] = useState<ViewMode>("Dia");
  const [selectedDate, setSelectedDate] = useState(() => todayKey());
  const [selectedMonth, setSelectedMonth] = useState(() => todayKey().slice(0, 7));
  const [professionalFilter, setProfessionalFilter] = useState("todos");
  const [reportFilter, setReportFilter] = useState("Todos");
  const [patients, setPatients] = useState<Patient[]>(() => mergePatients(seedPatients, importedClients));
  const [professionals, setProfessionals] = useState<Professional[]>(seedProfessionals);
  const [procedures, setProcedures] = useState<Procedure[]>(() => mergeProcedures(seedProcedures, catalogProcedures));
  const [services, setServices] = useState<Service[]>(importedServices);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [gifts, setGifts] = useState<GiftStockItem[]>([]);
  const [ultraformerTips, setUltraformerTips] = useState<UltraformerTip[]>([]);
  const [followUpTab, setFollowUpTab] = useState("Conversas");
  const [followUpRules, setFollowUpRules] = useState<FollowUpRule[]>([]);
  const [followUpContacts, setFollowUpContacts] = useState<FollowUpContact[]>([]);
  const [followUpLogs, setFollowUpLogs] = useState<FollowUpLog[]>([]);
  const [checkoutDraft, setCheckoutDraft] = useState<CheckoutDraft | null>(null);
  const [accountSummary, setAccountSummary] = useState<{ draft: CheckoutDraft; closedAt?: string; change: number } | null>(null);
  const [appointmentError, setAppointmentError] = useState("");
  const [appointments, setAppointments] = useState<Appointment[]>(seedAppointments);
  const [entries, setEntries] = useState<FinancialEntry[]>(seedFinancialEntries);
  const [revenues, setRevenues] = useState<RevenueEntry[]>(importedRevenues);
  const [costs, setCosts] = useState<FixedCost[]>(() => mergeCosts(seedFixedCosts, importedCosts));
  const [receipts, setReceipts] = useState<Receipt[]>(seedReceipts);
  const [professionalReceipts, setProfessionalReceipts] = useState<ProfessionalPaymentReceipt[]>([]);
  const [monthlyGoals, setMonthlyGoals] = useState<MonthlyGoals[]>(() => [makeMonthlyGoal(todayKey().slice(0, 7), seedProfessionals)]);
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
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userRole, setUserRole] = useState<AppRole>("standard");
  const [currentUser, setCurrentUser] = useState<AppUser>({ login: "", role: "standard", tabs: [] });
  const [loginForm, setLoginForm] = useState({ login: "", password: "" });
  const [rememberPassword, setRememberPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isDataReady, setIsDataReady] = useState(false);
  const isRemoteUpdate = useRef(false);
  const lastSyncedSnapshot = useRef<DataSnapshot | null>(null);
  const syncQueue = useRef(Promise.resolve());
  const pendingSyncs = useRef(0);
  const latestDraft = useRef<DataSnapshot | null>(null);
  const startupSnapshot = useRef<DataSnapshot>({
    patients, professionals, procedures, services, inventory, gifts, ultraformer_tips: ultraformerTips,
    followup_rules: followUpRules, followup_contacts: followUpContacts, followup_logs: followUpLogs,
    appointments, financial_entries: entries, revenues, fixed_costs: costs, receipts,
    professional_receipts: professionalReceipts, monthly_goals: monthlyGoals
  });
  const cloudLoaded = useRef(false);
  const [connectionRetry, setConnectionRetry] = useState(0);
  const [storageError, setStorageError] = useState("");
  const [hasPendingChanges, setHasPendingChanges] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState("");
  const [syncError, setSyncError] = useState(() => isSupabaseConfigured ? "" : "Supabase não configurado. Preencha NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY no .env.local.");
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncRetry, setSyncRetry] = useState(0);

  const visibleProfessionals = professionalFilter === "todos" ? professionals : professionals.filter((professional) => professional.id === professionalFilter);
  const currentMonthSummary = useMemo(() => summarizeMonth(revenues, costs, selectedMonth), [revenues, costs, selectedMonth]);
  const previousMonthKey = previousMonth(selectedMonth);
  const previousSummary = useMemo(() => summarizeMonth(revenues, costs, previousMonthKey), [revenues, costs, previousMonthKey]);

  function applyRemoteRecord(entity: string, eventType: string, recordId: string, data: unknown) {
    if (!cloudLoaded.current || !snapshotEntities.includes(entity as typeof snapshotEntities[number])) return;
    // A realtime echo or another browser must not erase an edit still waiting to be saved.
    if (lastSyncedSnapshot.current && latestDraft.current && recordIsPending(lastSyncedSnapshot.current, latestDraft.current, entity as typeof snapshotEntities[number], recordId)) return;
    const remove = eventType === "DELETE";
    if (entity === "patients") setPatients((current) => applyRemoteList(current, recordId, data as Patient, remove));
    if (entity === "professionals") setProfessionals((current) => applyRemoteList(current, recordId, data as Professional, remove));
    if (entity === "procedures") setProcedures((current) => applyRemoteList(current, recordId, data as Procedure, remove));
    if (entity === "services") setServices((current) => applyRemoteList(current, recordId, data as Service, remove));
    if (entity === "gifts") setGifts((current) => applyRemoteList(current, recordId, data as GiftStockItem, remove));
    if (entity === "ultraformer_tips") setUltraformerTips((current) => applyRemoteList(current, recordId, data as UltraformerTip, remove));
    if (entity === "inventory") setInventory((current) => applyRemoteList(current, recordId, data as InventoryItem, remove));
    if (entity === "followup_rules") setFollowUpRules((current) => applyRemoteList(current, recordId, data as FollowUpRule, remove));
    if (entity === "followup_contacts") setFollowUpContacts((current) => applyRemoteList(current, recordId, data as FollowUpContact, remove));
    if (entity === "followup_logs") setFollowUpLogs((current) => applyRemoteList(current, recordId, data as FollowUpLog, remove));
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
      services: entity === "services" ? applyRemoteList(snapshot.services, recordId, data as Service, remove) : snapshot.services,
      gifts: entity === "gifts" ? applyRemoteList(snapshot.gifts ?? [], recordId, data as GiftStockItem, remove) : snapshot.gifts,
      ultraformer_tips: entity === "ultraformer_tips" ? applyRemoteList(snapshot.ultraformer_tips, recordId, data as UltraformerTip, remove) : snapshot.ultraformer_tips,
      inventory: entity === "inventory" ? applyRemoteList(snapshot.inventory, recordId, data as InventoryItem, remove) : snapshot.inventory,
      followup_rules: entity === "followup_rules" ? applyRemoteList(snapshot.followup_rules ?? [], recordId, data as FollowUpRule, remove) : snapshot.followup_rules,
      followup_contacts: entity === "followup_contacts" ? applyRemoteList(snapshot.followup_contacts ?? [], recordId, data as FollowUpContact, remove) : snapshot.followup_contacts,
      followup_logs: entity === "followup_logs" ? applyRemoteList(snapshot.followup_logs ?? [], recordId, data as FollowUpLog, remove) : snapshot.followup_logs,
      appointments: entity === "appointments" ? applyRemoteList(snapshot.appointments, recordId, data as Appointment, remove) : snapshot.appointments,
      financial_entries: entity === "financial_entries" ? applyRemoteList(snapshot.financial_entries, recordId, data as FinancialEntry, remove) : snapshot.financial_entries,
      revenues: entity === "revenues" ? applyRemoteList(snapshot.revenues, recordId, data as RevenueEntry, remove) : snapshot.revenues,
      fixed_costs: entity === "fixed_costs" ? applyRemoteList(snapshot.fixed_costs, recordId, data as FixedCost, remove) : snapshot.fixed_costs,
      receipts: entity === "receipts" ? applyRemoteList(snapshot.receipts, recordId, data as Receipt, remove) : snapshot.receipts,
      professional_receipts: entity === "professional_receipts" ? applyRemoteList(snapshot.professional_receipts, recordId, data as ProfessionalPaymentReceipt, remove) : snapshot.professional_receipts,
      monthly_goals: entity === "monthly_goals" ? applyRemoteList(snapshot.monthly_goals, recordId, data as MonthlyGoals, remove) : snapshot.monthly_goals
    };
  }

  const persistLocalDraft = useCallback((data: DataSnapshot) => {
    try {
      writeSnapshot(window.localStorage, data, lastSyncedSnapshot.current, userSnapshotKey(currentUser));
      setStorageError("");
    } catch {
      setStorageError("Não foi possível guardar a cópia neste navegador. Libere espaço ou permita o armazenamento local. Confira a confirmação na nuvem antes de sair.");
    }
  }, [currentUser]);

  useEffect(() => {
    if (!isAuthenticated) return;
    function restoreLocalData() {
      const local = readLocalSnapshot(currentUser);
      const snapshot = local?.data ? permittedSnapshot(local.data, currentUser) : undefined;
      if (isSupabaseConfigured && !lastSyncedSnapshot.current) {
        // Also preserve edits made when the very first connection fails.
        const initial = permittedSnapshot(startupSnapshot.current, currentUser);
        lastSyncedSnapshot.current = local?.syncedData ?? local?.data ?? latestDraft.current ?? initial;
      }
      if (snapshot) {
        setPatients(snapshot.patients);
        setProfessionals(snapshot.professionals);
        setProcedures(snapshot.procedures);
        setAppointments(snapshot.appointments);
        setEntries(snapshot.financial_entries);
        setRevenues(snapshot.revenues);
        setCosts(snapshot.fixed_costs);
        setReceipts(snapshot.receipts);
        setProfessionalReceipts(snapshot.professional_receipts);
        setMonthlyGoals(snapshot.monthly_goals);
      }
      setServices(snapshot?.services ?? importedServices);
      setInventory(snapshot?.inventory ?? []);
      setGifts(snapshot?.gifts ?? []);
      setUltraformerTips(snapshot?.ultraformer_tips ?? []);
      setFollowUpRules(snapshot?.followup_rules ?? []);
      setFollowUpContacts(snapshot?.followup_contacts ?? []);
      setFollowUpLogs(snapshot?.followup_logs ?? []);
      setIsDataReady(true);
    }
    if (!isSupabaseConfigured) {
      restoreLocalData();
      return;
    }

    let cancelled = false;

    async function hydrateFromSupabase() {
      try {
        const [
          dbPatientsState,
          dbProfessionalsState,
          dbProceduresState,
          dbServicesState,
          dbInventoryState,
          dbGiftsState,
          dbUltraformerState,
          dbFollowUpRulesState,
          dbFollowUpContactsState,
          dbFollowUpLogsState,
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
          selectEntityState("services"),
          selectEntityState("inventory"),
          selectEntityState("gifts"),
          selectEntityState("ultraformer_tips"),
          selectEntityState("followup_rules"),
          selectEntityState("followup_contacts"),
          selectEntityState("followup_logs"),
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
        const dbProcedures = dbProceduresState.records;
        const dbServices = dbServicesState.records;
        const dbInventory = dbInventoryState.records;
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
        const initialGoals = [makeMonthlyGoal(todayKey().slice(0, 7), seedProfessionals)];
        const isEmptyDatabase = userRole === "admin" && !dbPatients.length && !dbProfessionals.length && !dbProcedures.length && !dbServices.length && !dbInventory.length && !dbGiftsState.records.length && !dbUltraformerState.records.length && !dbFollowUpRulesState.records.length && !dbFollowUpContactsState.records.length && !dbFollowUpLogsState.records.length && !dbAppointments.length && !dbEntries.length && !dbRevenues.length && !dbCosts.length && !dbReceipts.length && !dbProfessionalReceipts.length && !dbGoals.length;
        const remoteSnapshot: DataSnapshot = {
          patients: isEmptyDatabase ? initialPatients : dbPatients,
          professionals: isEmptyDatabase ? initialProfessionals : dbProfessionals,
          procedures: isEmptyDatabase ? initialProcedures : dbProcedures,
          services: dbServices,
          inventory: dbInventory,
          gifts: dbGiftsState.records,
          ultraformer_tips: dbUltraformerState.records,
          followup_rules: dbFollowUpRulesState.records,
          followup_contacts: dbFollowUpContactsState.records,
          followup_logs: dbFollowUpLogsState.records,
          appointments: isEmptyDatabase ? initialAppointments : dbAppointments,
          financial_entries: isEmptyDatabase && hasFinancialAccess(currentUser) ? initialEntries : dbEntries,
          revenues: canReadEntity(currentUser, "revenues") ? (isEmptyDatabase ? initialRevenues : dbRevenues) : [],
          fixed_costs: isEmptyDatabase ? initialCosts : dbCosts,
          receipts: canReadEntity(currentUser, "receipts") ? (isEmptyDatabase ? initialReceipts : dbReceipts) : [],
          professional_receipts: dbProfessionalReceipts,
          monthly_goals: canReadEntity(currentUser, "monthly_goals") ? (isEmptyDatabase ? initialGoals : dbGoals) : []
        };
        const savedLocalSnapshot = readLocalSnapshot(currentUser);
        const localSnapshot = savedLocalSnapshot ? {
          ...savedLocalSnapshot,
          data: {
            ...savedLocalSnapshot.data,
            procedures: savedLocalSnapshot.data.procedures,
            services: savedLocalSnapshot.data.services ?? importedServices,
            inventory: savedLocalSnapshot.data.inventory ?? [],
            gifts: savedLocalSnapshot.data.gifts ?? [],
            ultraformer_tips: savedLocalSnapshot.data.ultraformer_tips ?? [],
            followup_rules: savedLocalSnapshot.data.followup_rules ?? [],
            followup_contacts: savedLocalSnapshot.data.followup_contacts ?? [],
            followup_logs: savedLocalSnapshot.data.followup_logs ?? []
          }
        } : null;
        const recoveredSnapshot = localSnapshot?.syncedData
          ? recoverPendingChanges(remoteSnapshot, localSnapshot.syncedData, localSnapshot.data)
          : isEmptyDatabase && localSnapshot ? localSnapshot.data : remoteSnapshot;
        const hydratedSnapshot: DataSnapshot = {
          ...recoveredSnapshot,
          services: recoveredSnapshot.services.length || localSnapshot?.syncedData || !canWriteEntity(currentUser, "services") ? recoveredSnapshot.services : importedServices
        };

        isRemoteUpdate.current = true;
        cloudLoaded.current = true;
        // Compare against actual stored rows, including genuinely empty categories.
        lastSyncedSnapshot.current = {
          patients: dbPatients, professionals: dbProfessionals, procedures: dbProceduresState.records,
          services: dbServices, inventory: dbInventory, gifts: dbGiftsState.records, ultraformer_tips: dbUltraformerState.records,
          followup_rules: dbFollowUpRulesState.records, followup_contacts: dbFollowUpContactsState.records,
          followup_logs: dbFollowUpLogsState.records, appointments: dbAppointments,
          financial_entries: dbEntries, revenues: dbRevenues, fixed_costs: dbCosts,
          receipts: dbReceipts, professional_receipts: dbProfessionalReceipts, monthly_goals: dbGoals
        };
        latestDraft.current = hydratedSnapshot;
        setPatients(hydratedSnapshot.patients);
        setProfessionals(hydratedSnapshot.professionals);
        setProcedures(hydratedSnapshot.procedures);
        setServices(hydratedSnapshot.services);
        setInventory(hydratedSnapshot.inventory);
        setGifts(hydratedSnapshot.gifts ?? []);
        setUltraformerTips(hydratedSnapshot.ultraformer_tips ?? []);
        setFollowUpRules(hydratedSnapshot.followup_rules);
        setFollowUpContacts(hydratedSnapshot.followup_contacts);
        setFollowUpLogs(hydratedSnapshot.followup_logs);
        setAppointments(hydratedSnapshot.appointments);
        setEntries(hydratedSnapshot.financial_entries);
        setRevenues(hydratedSnapshot.revenues);
        setCosts(hydratedSnapshot.fixed_costs);
        setReceipts(hydratedSnapshot.receipts);
        setProfessionalReceipts(hydratedSnapshot.professional_receipts);
        setMonthlyGoals(hydratedSnapshot.monthly_goals);

        if (cancelled) return;
        persistLocalDraft(hydratedSnapshot);
        isRemoteUpdate.current = false;
        setIsDataReady(true);
        setSyncError("");
      } catch (error) {
        if (cancelled) return;
        cloudLoaded.current = false;
        isRemoteUpdate.current = false;
        restoreLocalData();
        const message = appDataTableMissing(error)
          ? "Tabela avvi_records não encontrada no Supabase. Execute supabase/schema.sql no SQL Editor."
          : `Erro ao conectar ao Supabase: ${(error as Error).message}`;
        setSyncError(message);
      }
    }

    hydrateFromSupabase();

    const channel = userRole === "admin" && !isProtectedDatabase ? supabase?.channel("avvi-records-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "avvi_records" }, (payload) => {
        const row = (payload.eventType === "DELETE" ? payload.old : payload.new) as { entity?: string; record_id?: string; data?: unknown };
        if (!row?.entity) return;
        applyRemoteRecord(row.entity, payload.eventType, String(row.record_id), row.data);
      })
      .subscribe() : undefined;

    return () => {
      cancelled = true;
      if (channel) supabase?.removeChannel(channel);
    };
  // Hydration reads the database again only after a failed connection.
  }, [connectionRetry, isAuthenticated, userRole, currentUser, persistLocalDraft]);


  useEffect(() => {
    if (!isAuthenticated || !isDataReady || isRemoteUpdate.current) return;
    const next: DataSnapshot = {
      patients,
      professionals,
      procedures,
      services,
      inventory,
      gifts,
      ultraformer_tips: ultraformerTips,
      followup_rules: followUpRules,
      followup_contacts: followUpContacts,
      followup_logs: followUpLogs,
      appointments,
      financial_entries: entries,
      revenues,
      fixed_costs: costs,
      receipts,
      professional_receipts: professionalReceipts,
      monthly_goals: monthlyGoals
    };
    latestDraft.current = next;
    persistLocalDraft(next);
    if (!isSupabaseConfigured) return;
    const previous = lastSyncedSnapshot.current;
    const pending = !previous || hasSnapshotChanges(previous, next);
    setHasPendingChanges(pending);
    if (!cloudLoaded.current || !previous || !pending) return;

    pendingSyncs.current += 1;
    setIsSyncing(true);
    syncQueue.current = syncQueue.current
      .catch(() => undefined)
      .then(async () => {
        const baseline = lastSyncedSnapshot.current;
        const draft = latestDraft.current;
        if (!baseline || !draft) return;
        if (hasSnapshotChanges(baseline, draft)) {
          await syncEntityDiffs(snapshotChanges(baseline, draft));
          lastSyncedSnapshot.current = draft;
          setLastSavedAt(new Date().toISOString());
        }
        const latest = latestDraft.current ?? draft;
        persistLocalDraft(latest);
        setHasPendingChanges(hasSnapshotChanges(lastSyncedSnapshot.current!, latest));
        setSyncError("");
      })
      .catch((error) => {
        setHasPendingChanges(true);
        setSyncError(`Alterações pendentes: não foi possível salvar no Supabase. ${(error as Error).message}`);
      })
      .finally(() => {
        pendingSyncs.current -= 1;
        setIsSyncing(pendingSyncs.current > 0);
      });
  }, [patients, professionals, procedures, services, inventory, gifts, ultraformerTips, followUpRules, followUpContacts, followUpLogs, appointments, entries, revenues, costs, receipts, professionalReceipts, monthlyGoals, syncRetry, isDataReady, isAuthenticated, userRole, persistLocalDraft]);

  function retrySaving() {
    if (cloudLoaded.current) setSyncRetry((current) => current + 1);
    else setConnectionRetry((current) => current + 1);
  }
  useEffect(() => {
    if (!isSupabaseConfigured || isSyncing || (!syncError && !hasPendingChanges)) return;
    const retry = () => {
      if (cloudLoaded.current) setSyncRetry((current) => current + 1);
      else setConnectionRetry((current) => current + 1);
    };
    const timer = window.setTimeout(retry, 15000);
    window.addEventListener("online", retry);
    return () => { window.clearTimeout(timer); window.removeEventListener("online", retry); };
  }, [syncError, hasPendingChanges, isSyncing, syncRetry, connectionRetry]);

  useEffect(() => {
    if (!isSyncing && !hasPendingChanges && !storageError) return;
    const warnBeforeClose = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeClose);
    return () => window.removeEventListener("beforeunload", warnBeforeClose);
  }, [isSyncing, hasPendingChanges, storageError]);

  function acceptUser(user: AppUser) {
    setDatabaseAccess(user);
    setUserRole(user.role); setCurrentUser(user);
    setIsDataReady(false); setHasPendingChanges(false); setStorageError(""); setLastSavedAt("");
    lastSyncedSnapshot.current = null; latestDraft.current = null; cloudLoaded.current = false;
    setCheckoutDraft(null); setAccountSummary(null); setSelectedSlot(null); setSelectedAppointmentId(null);
    setEntries([]); setRevenues([]); setReceipts([]); setProfessionalReceipts([]); setMonthlyGoals([]);
    setPatients(startupSnapshot.current.patients); setProfessionals(startupSnapshot.current.professionals);
    setProcedures(startupSnapshot.current.procedures); setServices(startupSnapshot.current.services);
    setInventory([]); setGifts([]); setAppointments(startupSnapshot.current.appointments); setCosts(startupSnapshot.current.fixed_costs);
    setFollowUpRules([]); setFollowUpContacts([]); setFollowUpLogs([]);
    setActiveTab((tabs.find(tab => canAccessTab(user, tab.id))?.id ?? "Agenda")); setIsAuthenticated(true);
  }
  useEffect(() => {
    let active = true;
    const timer = window.setTimeout(() => {
      const savedLogin = readSavedLogin();
      if (savedLogin) { setLoginForm(current => current.login || current.password ? current : savedLogin); setRememberPassword(true); }
    }, 0);
    fetch("/api/access", { cache: "no-store" }).then((response) => response.json()).then((data) => {
      if (active && data.user) acceptUser(data.user);
    }).catch(() => undefined);
    return () => { active = false; window.clearTimeout(timer); };
  }, []);

  async function handleLogin() {
    setLoginError("");
    try {
      const response = await fetch("/api/access", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(loginForm) });
      const data = await response.json();
      if (!response.ok || !data.user) { setLoginError(data.error ?? "Login ou senha inválidos."); return; }
      acceptUser(data.user);
      // Server-side accounts and permissions determine access. Browser flags do not grant roles.
      window.sessionStorage.removeItem("avvi.session");
      if (rememberPassword) window.localStorage.setItem(savedLoginKey, JSON.stringify(loginForm));
      else window.localStorage.removeItem(savedLoginKey);
    } catch { setLoginError("Não foi possível acessar o servidor. Tente novamente."); }
  }
  async function handleLogout() {
    if (isSyncing) return;
    const response = await fetch("/api/access", { method: "DELETE" });
    if (!response.ok) return;
    if (supabase) await supabase.auth.signOut();
    window.sessionStorage.removeItem("avvi.session");
    setIsAuthenticated(false); setIsDataReady(false); setUserRole("standard"); setCurrentUser({ login: "", role: "standard", tabs: [] }); setDatabaseAccess("standard");
    lastSyncedSnapshot.current = null; latestDraft.current = null; cloudLoaded.current = false;
    setEntries([]); setRevenues([]); setReceipts([]); setProfessionalReceipts([]); setMonthlyGoals([]);
    setSelectedSlot(null); setSelectedAppointmentId(null); setCheckoutDraft(null); setAccountSummary(null);
    setLoginForm(rememberPassword ? loginForm : { login: "", password: "" });
    setLoginError(""); setActiveTab("Agenda");
  }
  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    const check = async () => {
      try {
        const response = await fetch("/api/access", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        if (active && !data.user) {
          setIsAuthenticated(false); setIsDataReady(false); setCurrentUser({ login: "", role: "standard", tabs: [] }); setUserRole("standard"); setDatabaseAccess("standard");
          setCheckoutDraft(null); setAccountSummary(null); setSelectedSlot(null); setSelectedAppointmentId(null);
          setLoginError("Seu acesso foi atualizado. Entre novamente para usar as permissões atuais.");
        }
      } catch { /* A temporary network failure does not discard the local pending draft. */ }
    };
    const timer = window.setInterval(check, 30000); window.addEventListener("focus", check);
    return () => { active = false; window.clearInterval(timer); window.removeEventListener("focus", check); };
  }, [isAuthenticated]);
  const availableTabs = tabs.filter((tab) => canAccessTab(currentUser, tab.id));
  function changeTab(tab: Tab) { if (canAccessTab(currentUser, tab)) setActiveTab(tab); }

  function openSlot(hour: number, professionalId: string) {
    setAppointmentError("");
    setSelectedAppointmentId(null);
    setSelectedSlot({ hour, professionalId });
    setAppointmentForm(makeAppointmentForm(professionalId, selectedDate, hour));
  }

  function openAppointment(appointmentId: string) {
    setAppointmentError("");
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
      serviceId: appointmentServices(appointment, services)[0]?.serviceId ?? "",
      servicePrice: appointmentServices(appointment, services)[0]?.price,
      servicePriceType: appointmentServices(appointment, services)[0]?.priceType,
      additionalServices: appointmentServices(appointment, services).slice(1),
      minute: format(startsAt, "mm"),
      durationMinutes: Math.max(1, Math.round((parseISO(appointment.endsAt).getTime() - startsAt.getTime()) / 60000)) || 60,
      status: appointment.status,
      eventType: appointment.eventType,
      notes: appointment.notes
    });
  }

  function saveAppointment() {
    if (!appointmentForm.professionalId || !appointmentForm.date || !Number.isInteger(appointmentForm.durationMinutes) || appointmentForm.durationMinutes <= 0) return;
    const selectedService = services.find((service) => service.id === appointmentForm.serviceId);
    if (appointmentForm.serviceId && !selectedService) return;
    if (appointmentForm.additionalServices.some((item) => item.serviceId && !services.some((service) => service.id === item.serviceId))) return;
    const scheduledServices: AppointmentService[] = [
      ...(selectedService ? [{ id: appointments.find((item) => item.id === selectedAppointmentId)?.services?.[0]?.id ?? (selectedAppointmentId ? `scheduled-${selectedAppointmentId}` : id("scheduled-service")), serviceId: selectedService.id, name: selectedService.name, price: appointmentForm.servicePrice ?? selectedService.price, priceType: appointmentForm.servicePriceType ?? selectedService.priceType, durationMinutes: selectedService.durationMinutes }] : []),
      ...appointmentForm.additionalServices.filter((item) => item.serviceId).map((item) => ({ ...item, name: services.find((service) => service.id === item.serviceId)!.name }))
    ];
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
    const startsAt = `${appointmentForm.date}T${appointmentForm.hour.padStart(2, "0")}:${appointmentForm.minute}:00`;
    const endsAt = format(addMinutes(parseISO(startsAt), appointmentForm.durationMinutes), "yyyy-MM-dd'T'HH:mm:ss");
    const created: Appointment = {
      id: selectedAppointmentId || id("appointment"),
      patientId,
      professionalId: appointmentForm.professionalId,
      procedureId: scheduledServices.length ? undefined : appointmentForm.procedureId || undefined,
      services: scheduledServices,
      serviceId: scheduledServices[0]?.serviceId,
      servicePrice: scheduledServices[0]?.price,
      servicePriceType: scheduledServices[0]?.priceType,
      financialEntryId: appointments.find((appointment) => appointment.id === selectedAppointmentId)?.financialEntryId,
      closedAccount: appointments.find((appointment) => appointment.id === selectedAppointmentId)?.closedAccount,
      accountClosed: appointments.find((appointment) => appointment.id === selectedAppointmentId)?.accountClosed,
      stockConsumption: appointments.find((appointment) => appointment.id === selectedAppointmentId)?.stockConsumption,
      giftConsumption: appointments.find((appointment) => appointment.id === selectedAppointmentId)?.giftConsumption,
      startsAt,
      endsAt,
      status: appointmentForm.status,
      eventType: appointmentForm.eventType,
      notes: appointmentForm.notes
    };
    setAppointments((current) => selectedAppointmentId ? current.map((appointment) => appointment.id === selectedAppointmentId ? created : appointment) : [...current, created]);
    setSelectedSlot(null);
    setSelectedAppointmentId(null);
    return created;
  }

  function openCheckout() {
    if (!appointmentForm.patientId && !appointmentForm.patientName.trim()) {
      setAppointmentError("Selecione um paciente ou informe o nome antes de fechar a conta.");
      return;
    }
    const appointment = saveAppointment();
    if (!appointment) return;
    setCheckoutDraft(makeCheckoutDraft(appointment, true));
  }

  function makeCheckoutDraft(appointment: Appointment, useAppointmentForm = false): CheckoutDraft {
    const service = services.find((item) => item.id === appointment.serviceId);
    const procedure = procedures.find((item) => item.id === appointment.procedureId || (service && serviceKey(item.name) === serviceKey(service.name)));
    const existing = appointment.closedAccount ?? entries.find((entry) => !entry.sourceAccountId && entry.accountClosed && (entry.id === appointment.financialEntryId || entry.appointmentId === appointment.id));
    const patient = patients.find((item) => item.id === appointment.patientId);
    const client: Patient = patient ?? { id: appointment.patientId ?? "", name: useAppointmentForm ? appointmentForm.patientName : "Paciente não encontrado", phone: useAppointmentForm ? appointmentForm.phone : "", cpf: useAppointmentForm ? appointmentForm.cpf : "", birthDate: useAppointmentForm ? appointmentForm.birthDate : "", registrationDate: todayKey(), notes: useAppointmentForm ? appointmentForm.patientNotes : "" };
    const scheduledServices = appointmentServices(appointment, services);
    const percent = professionals.find((item) => item.id === appointment.professionalId)?.commissionPercent ?? 0;
    const initialLines: ProcedureLine[] = scheduledServices.length ? scheduledServices.map((item) => ({ id: id("line"), serviceId: item.serviceId, manualProcedure: item.name, quantity: 1, servicePrice: item.price, productCost: 0, professionalPercent: percent, discount: 0 })) : service || procedure ? [{ id: id("line"), serviceId: service?.id,
      manualProcedure: service?.name ?? procedure?.name ?? "", quantity: 1,
      servicePrice: appointment.servicePrice ?? procedure?.price ?? 0, productCost: 0,
      professionalPercent: professionals.find((item) => item.id === appointment.professionalId)?.commissionPercent ?? 0, discount: 0 }] : [];
    const existingLines = existing?.procedureLines?.length ? existing.procedureLines : existing ? [entryToLine(existing)] : initialLines;
    const restoredItems = existing ? restoreCheckoutItems(existingLines, existing.products, procedures, services) : { lines: initialLines, products: [] };
    return { appointment, client: { ...client }, professional: professionals.find((item) => item.id === appointment.professionalId),
      lines: distributeCheckoutDiscount(restoredItems.lines, existing?.commercialDiscount ?? 0), products: restoredItems.products, gifts: appointment.closedAccount?.gifts?.map((gift) => ({ ...gift })) ?? [],
      payments: existing?.payments.map((payment) => ({ ...payment })) ?? [], entryId: existing?.id,
      discountSplit: existing?.discountSplit ?? "Empresa e profissional dividem", notes: existing?.notes ?? appointment.notes,
      previousFutureCredit: futureCreditUsed(existing) };
  }

  function openAccountFromAgenda(appointmentId: string) {
    const appointment = appointments.find((item) => item.id === appointmentId);
    if (!appointment) return;
    if (!appointment.patientId) {
      openAppointment(appointmentId);
      setAppointmentError("Selecione um paciente antes de fechar a conta.");
      return;
    }
    setSelectedSlot(null);
    setSelectedAppointmentId(null);
    setCheckoutDraft(makeCheckoutDraft(appointment));
  }

  function viewClosedAccount(appointmentId: string) {
    const appointment = appointments.find((item) => item.id === appointmentId);
    if (!appointment) return;
    setAccountSummary({ draft: makeCheckoutDraft(appointment), closedAt: appointment.closedAccount?.closedAt,
      change: appointment.closedAccount?.change ?? 0 });
  }

  function updateAgendaStatus(appointmentId: string, status: "Confirmado" | "Cancelado") {
    setAppointments((current) => current.map((appointment) => appointment.id === appointmentId ? { ...appointment, status } : appointment));
  }

  function finishCheckout(result: CheckoutResult) {
    if (!checkoutDraft || (!result.products.length && !checkoutAllowsNoProducts(result.lines, services))) return;
    const currentAppointment = appointments.find((appointment) => appointment.id === checkoutDraft.appointment.id);
    if (!currentAppointment?.patientId) return;
    const previousAccount = currentAppointment.closedAccount ?? entries.find((entry) => !entry.sourceAccountId && entry.accountClosed && entry.id === checkoutDraft.entryId);
    const accountId = previousAccount?.id ?? id("account");
    const professional = professionals.find((item) => item.id === currentAppointment.professionalId);
    const first = result.lines[0];
    const account: ClosedAccount = {
      id: accountId, appointmentId: currentAppointment.id, patientId: currentAppointment.patientId,
      professionalId: currentAppointment.professionalId, accountClosed: true, balanceDue: result.balanceDue,
      closedAt: new Date().toISOString(), change: result.change,
      procedureLines: result.lines.map((line) => ({ ...line })), products: result.products.map((product) => ({ ...product })), gifts: result.gifts.map((gift) => ({ ...gift })),
      procedureId: undefined, manualProcedure: first?.manualProcedure, quantity: first?.quantity ?? 1,
      servicePrice: first?.servicePrice ?? 0, productCost: 0, machineFee: 0,
      commercialDiscount: result.discount, discountSplit: checkoutDraft.discountSplit,
      professionalPercent: professional?.commissionPercent ?? 0,
      date: currentAppointment.startsAt.slice(0, 10), notes: checkoutDraft.notes,
      payments: result.payments.map((payment) => ({ ...payment, discount: 0,
        fee: payment.method === "Crédito" ? calculateCardFee(payment.amount, payment.cardBrand, payment.installments)
          : payment.method === "Débito" ? calculateDebitFee(payment.amount) : 0 }))
    };
    // Generate once. Editing either record afterward never overwrites the other.
    const generated = entries.find((entry) => entry.sourceAccountId === accountId);
    const procedureEntry = generated ?? procedureEntryFromAccount(account, procedures, professional);
    account.generatedEntryId = procedureEntry?.id;
    const legacyEntryId = !currentAppointment.closedAccount ? previousAccount?.id : undefined;
    setEntries((current) => {
      const preserved = current.filter((entry) => entry.id !== legacyEntryId);
      return procedureEntry && !preserved.some((entry) => entry.id === procedureEntry.id) ? [procedureEntry, ...preserved] : preserved;
    });
    const stockUpdate = applyCheckoutInventory(inventory, currentAppointment.stockConsumption, result.products);
    setInventory(stockUpdate.inventory);
    const giftUpdate = applyCheckoutGifts(gifts, currentAppointment.giftConsumption ?? currentAppointment.closedAccount?.gifts, result.gifts);
    setGifts(giftUpdate.gifts);
    const creditAdjustments = new Map<string, number>();
    if (previousAccount) creditAdjustments.set(previousAccount.patientId, futureCreditUsed(previousAccount));
    creditAdjustments.set(account.patientId, (creditAdjustments.get(account.patientId) ?? 0) - futureCreditUsed(account));
    setPatients((current) => current.map((patient) => {
      const adjustment = creditAdjustments.get(patient.id) ?? 0;
      if (patient.id !== account.patientId && !adjustment) return patient;
      return { ...patient,
        ...(patient.id === account.patientId ? { name: result.client.name.trim(), phone: result.client.phone, email: result.client.email } : {}),
        futureCredit: Math.max(0, (Number(patient.futureCredit) || 0) + adjustment) };
    }));
    const revenue = makeRevenueFromFinancialEntry(account, result.client.name);
    const fee = makeMachineFeeCost(account, result.client.name);
    setRevenues((current) => [revenue, ...current.filter((item) => item.sourceFinancialEntryId !== accountId)]);
    setCosts((current) => { const preserved = current.filter((item) => item.sourceFinancialEntryId !== accountId); return fee ? [fee, ...preserved] : preserved; });
    setAppointments((current) => current.map((appointment) => appointment.id === currentAppointment.id
      ? { ...appointment, status: "Finalizado", financialEntryId: procedureEntry?.id, closedAccount: account,
        accountClosed: true, stockConsumption: stockUpdate.consumption, giftConsumption: giftUpdate.consumption } : appointment));
    setCheckoutDraft(null);
    setActiveTab("Agenda");
  }

  function deleteClosedAccount(appointmentId: string) {
    const appointment = appointments.find((item) => item.id === appointmentId);
    if (!appointment?.accountClosed) return;
    const account = appointment.closedAccount ?? entries.find((entry) => entry.accountClosed && entry.id === appointment.financialEntryId);
    const linked = entries.filter((entry) => account ? entry.sourceAccountId === account.id || entry.id === account.id || entry.id === appointment.closedAccount?.generatedEntryId : entry.id === appointment.financialEntryId);
    const removedIds = new Set(linked.map((entry) => entry.id));
    if (account) removedIds.add(account.id);
    setEntries((current) => current.filter((entry) => !removedIds.has(entry.id)));
    setRevenues((current) => current.filter((revenue) => !removedIds.has(revenue.sourceFinancialEntryId ?? "")));
    setCosts((current) => current.filter((cost) => !removedIds.has(cost.sourceFinancialEntryId ?? "")));
    const consumed = appointment.stockConsumption ?? account?.products ?? [];
    setInventory(applyCheckoutInventory(inventory, consumed, []).inventory);
    setGifts(applyCheckoutGifts(gifts, appointment.giftConsumption ?? appointment.closedAccount?.gifts, []).gifts);
    const credit = futureCreditUsed(account) + linked.filter((entry) => !entry.sourceAccountId && entry.id !== account?.id).reduce((sum, entry) => sum + futureCreditUsed(entry), 0);
    if (credit) setPatients((current) => current.map((patient) => patient.id === (account?.patientId ?? appointment.patientId) ? { ...patient, futureCredit: (Number(patient.futureCredit) || 0) + credit } : patient));
    setAppointments((current) => current.map((item) => item.id === appointment.id
      ? { ...item, status: "Agendado", accountClosed: false, closedAccount: undefined, financialEntryId: undefined, stockConsumption: [], giftConsumption: [] } : item));
    setAppointmentForm((current) => ({ ...current, status: "Agendado" }));
    setCheckoutDraft(null);
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
      fee: payment.method === "Crédito"
        ? calculateCardFee(Number(payment.amount), payment.cardBrand, payment.installments)
        : payment.method === "Débito"
          ? calculateDebitFee(Number(payment.amount))
          : 0,
      cardBrand: payment.method === "Crédito" ? payment.cardBrand : undefined,
      installments: payment.method === "Crédito" ? Number(payment.installments) || 1 : 1,
      discount: 0
    }));
    const created: FinancialEntry = {
      id: source.id || id("entry"),
      appointmentId: source.appointmentId,
      sourceAccountId: source.sourceAccountId,
      accountClosed: source.accountClosed,
      products: source.products?.map((product) => ({ ...product })),
      balanceDue: source.accountClosed ? Math.max(0, Math.round((calculateEntry(source).grossRevenue - (Number(source.commercialDiscount) || 0) - legacyPaymentDiscount - normalizedPayments.reduce((sum, payment) => sum + payment.amount, 0)) * 100) / 100) : source.balanceDue,
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
      payments: source.accountClosed ? normalizedPayments : normalizedPayments.length ? normalizedPayments : [{ ...blankPayment, id: id("payment"), amount: Number(source.servicePrice) || 0 }]
    };
    const previousEntry = entries.find((entry) => entry.id === source.id);
    const adjustments = new Map<string, number>();
    if (previousEntry && !previousEntry.sourceAccountId) adjustments.set(previousEntry.patientId, futureCreditUsed(previousEntry));
    if (!created.sourceAccountId) adjustments.set(patientId, (adjustments.get(patientId) ?? 0) - futureCreditUsed(created));
    if (adjustments.size) {
      setPatients((current) => current.map((patient) => {
        const adjustment = adjustments.get(patient.id) ?? 0;
        return adjustment ? { ...patient, futureCredit: Math.max(0, Number(patient.futureCredit) + adjustment) } : patient;
      }));
    }
    const resolvedPatientName = source.patientName.trim() || patients.find((patient) => patient.id === patientId)?.name || "";
    const linkedRevenue = makeRevenueFromFinancialEntry(created, resolvedPatientName);
    const linkedMachineFeeCost = makeMachineFeeCost(created, resolvedPatientName);
    // The account already records the actual payment; its procedure ledger must not duplicate it.
    if (!created.sourceAccountId) setRevenues((current) => [linkedRevenue, ...current.filter((revenue) => revenue.sourceFinancialEntryId !== created.id)]);
    setCosts((current) => {
      const withoutCurrentFee = current.filter((cost) => cost.sourceFinancialEntryId !== created.id);
      return !created.sourceAccountId && linkedMachineFeeCost ? [linkedMachineFeeCost, ...withoutCurrentFee] : withoutCurrentFee;
    });
    setEntries((current) => source.id ? current.map((entry) => entry.id === source.id ? created : entry) : [created, ...current]);
    setEntryForm(makeEntryForm());
    return created;
  }

  function deleteEntry(entryId: string) {
    const entry = entries.find((item) => item.id === entryId);
    if (entry && !entry.sourceAccountId) {
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

  function savePatientReceiptPdf(receipt: Receipt) {
    const professional = professionals.find((item) => item.id === receipt.professionalId);
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("AVVI Clínica", 20, 22);
    doc.setFontSize(12);
    doc.text("Recibo de Pagamento", 20, 34);
    doc.line(20, 39, 190, 39);
    doc.text(`Paciente: ${receipt.patientName}`, 20, 52);
    doc.text(`CPF: ${receipt.cpf}`, 20, 62);
    doc.text(`Procedimento: ${receipt.procedure}`, 20, 72);
    doc.text(`Valor pago: ${currency(Number(receipt.amount))}`, 20, 82);
    doc.text(`Forma de pagamento: ${receipt.paymentMethod}`, 20, 92);
    doc.text(`Data: ${formatDate(receipt.date)}`, 20, 102);
    doc.text(`Profissional: ${professional?.name ?? ""}`, 20, 112);
    doc.text(`Observações: ${receipt.notes || "-"}`, 20, 122);
    doc.text("Declaro o recebimento do valor acima referente ao procedimento informado.", 20, 146);
    doc.line(55, 172, 155, 172);
    doc.text("AVVI Clínica", 88, 180);
    doc.save(`recibo-avvi-${receipt.patientName || "paciente"}.pdf`);
  }

  function generateReceipt() {
    const receipt = { ...receiptForm, id: id("receipt"), amount: Number(receiptForm.amount) || 0 };
    savePatientReceiptPdf(receipt);
    setReceipts((current) => [receipt, ...current]);
    setReceiptForm(makeReceiptForm());
  }

  async function saveProfessionalReceiptPdf(selectedEntries: FinancialEntry[], professionalId: string, issuedAt: string) {
    const professional = professionals.find((item) => item.id === professionalId);
    const receiptRows = selectedEntries.flatMap((entry) => professionalReceiptProcedureRows(
      entry,
      (line) => procedures.find((procedure) => procedure.id === line.procedureId)?.name || line.manualProcedure || procedureName(entry)
    ).map((row) => ({ entry, row })));
    const total = receiptRows.reduce((sum, item) => sum + item.row.professionalValue, 0);
    const totalPaid = receiptRows.reduce((sum, item) => sum + item.row.gross, 0);
    const totalProductCost = receiptRows.reduce((sum, item) => sum + item.row.cost, 0);
    const totalMachineFee = receiptRows.reduce((sum, item) => sum + item.row.fee, 0);
    const totalDiscount = receiptRows.reduce((sum, item) => sum + item.row.discount, 0);
    const totalCost = totalProductCost + totalMachineFee + totalDiscount;
    const totalProfit = totalPaid - totalCost;
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
    y += drawProfessionalReceiptSummary(doc, {
      productCost: totalProductCost,
      totalCost,
      totalPaid,
      totalMachineFee,
      totalDiscount,
      totalProfit,
      professionalValue: total
    }, 10, y);
    y += 7;
    const headers = ["Data", "Paciente", "Produto", "Qtd", "Valor", "Custo", "Taxa", "Desc.", "Lucro", "%", "V. Prof."];
    const widths = [14, 24, 35, 8, 17, 17, 15, 15, 17, 9, 17];
    y += drawPdfRow(doc, headers, widths, 10, y, true);
    receiptRows.forEach(({ entry, row }) => {
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
    y = drawProfessionalReceiptFormulas(doc, Math.min(y + 6, 230));
    y = Math.min(y + 20, 268);
    doc.line(55, y, 155, y);
    doc.text("Assinatura da profissional", 78, y + 8);
    doc.save(`pagamento-profissional-${professional?.name ?? "avvi"}.pdf`);
    return total;
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
    const issuedAt = selectedEntries
      .map((entry) => entry.date)
      .sort()
      .at(-1) ?? format(new Date(), "yyyy-MM-dd");
    const total = await saveProfessionalReceiptPdf(selectedEntries, firstProfessionalId, issuedAt);
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

  async function reopenProfessionalReceipt(receiptId: string) {
    const receipt = professionalReceipts.find((item) => item.id === receiptId);
    if (!receipt) return;
    const receiptEntries = entries.filter((entry) => receipt.entryIds.includes(entry.id));
    if (!receiptEntries.length) {
      window.alert("Não encontrei os lançamentos deste recibo para abrir o PDF novamente.");
      return;
    }
    await saveProfessionalReceiptPdf(receiptEntries, receipt.professionalId, receipt.date);
  }

  function deleteProfessionalReceipt(receiptId: string) {
    setProfessionalReceipts((current) => current.filter((receipt) => receipt.id !== receiptId));
    setCosts((current) => current.filter((cost) => cost.professionalReceiptId !== receiptId));
  }

  function saveProcedure() {
    const price = Number(procedureForm.price) || 0;
    const productCost = Number(procedureForm.productCost ?? procedureForm.averageCost) || 0;
    const taxPercent = Number(procedureForm.taxPercent) || 0;
    const clinicCost = Number(procedureForm.clinicCost) || 0;
    const taxValue = price * (taxPercent / 100);
    const saved = {
      ...procedureForm,
      id: procedureForm.id || id("procedure"),
      price,
      productCost,
      taxPercent,
      clinicCost,
      averageCost: productCost + taxValue + clinicCost,
      professionalPercent: Number(procedureForm.professionalPercent)
    };
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
    setProfessionals((current) => professionalForm.id ? current.map((professional) => professional.id === professionalForm.id ? { ...saved, avatarDataUrl: professional.avatarDataUrl } : professional) : [saved, ...current]);
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
            <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
              <input
                type="checkbox"
                checked={rememberPassword}
                onChange={(event) => {
                  setRememberPassword(event.target.checked);
                  if (!event.target.checked && typeof window !== "undefined") {
                    window.localStorage.removeItem(savedLoginKey);
                  }
                }}
                className="h-4 w-4 accent-[#b8862b]"
              />
              Salvar senha neste navegador
            </label>
          </div>
          {loginError && <p className="mt-3 text-sm font-bold text-avvi-red">{loginError}</p>}
          <button onClick={handleLogin} className="mt-5 w-full rounded-lg bg-avvi-blue px-5 py-3 font-bold text-white shadow-sm transition hover:-translate-y-0.5 hover:shadow-panel">Entrar</button>
        </section>
      </main>
    );
  }

  if (!isDataReady) return <main className="grid min-h-screen place-items-center bg-[#f5f6f8] p-6"><div role="status" className="rounded-2xl bg-white p-6 text-center shadow-panel"><p className="font-bold text-avvi-blue">Carregando os dados da clínica…</p><p className="mt-2 text-sm text-slate-600">Aguarde a consulta à nuvem antes de editar.</p></div></main>;

  return (
    <main className="min-h-screen bg-transparent">
      <div className="flex w-full">
        <aside className="avvi-sidebar fixed left-0 top-0 z-40 hidden h-dvh w-[17.5rem] shrink-0 border-r border-white/70 bg-white/90 p-3 shadow-panel backdrop-blur-xl lg:block">
          <div className="flex h-full flex-col">
            <div className="avvi-sidebar-brand shrink-0 text-center">
              <Image src="/logo-avvi.png" alt="AVVI Clínica" width={200} height={82} className="mx-auto w-auto object-contain" priority />
              <p className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-avvi-blue">Gestão integrada</p>
            </div>
            <nav aria-label="Menu principal" className="avvi-sidebar-nav min-h-0 flex-1">
              <SidebarGroup label="Operação">
                {availableTabs.filter((tab) => ["Agenda", "Estoque", "Follow Up", "Ultraformer MPT", "Relatórios"].includes(tab.id)).map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => changeTab(tab.id)}
                      className={`avvi-sidebar-link flex w-full shrink-0 items-center gap-2 rounded-lg px-2.5 text-left font-semibold transition ${activeTab === tab.id ? "bg-avvi-blue text-white shadow-sm" : "text-slate-600 hover:bg-avvi-soft hover:text-avvi-blue"}`}
                    >
                      <Icon size={15} />
                      <span>{tab.id}</span>
                    </button>
                  );
                })}
              </SidebarGroup>
              <SidebarGroup label="Financeiro">
                {availableTabs.filter((tab) => ["Dashboard", "Receitas", "Lançamento de Procedimentos", "Pagamento Profissional", "Relatório Profissional", "Recibos de Pagamento", "Custos"].includes(tab.id)).map((tab) => {
                  const Icon = tab.icon;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => changeTab(tab.id)}
                      className={`avvi-sidebar-link flex w-full shrink-0 items-center gap-2 rounded-lg px-2.5 text-left font-semibold transition ${activeTab === tab.id ? "bg-avvi-blue text-white shadow-sm" : "text-slate-600 hover:bg-avvi-soft hover:text-avvi-blue"}`}
                    >
                      <Icon size={15} />
                      <span>{tab.id}</span>
                    </button>
                  );
                })}
              </SidebarGroup>
              <SidebarGroup label="Cadastros">
                {availableTabs.filter((tab) => ["Cadastro de Procedimentos", "Cadastro de Serviços", "Cadastro de Profissionais", "Cadastro de Pacientes", "Metas", "Contas"].includes(tab.id)).map((tab) => {
                const Icon = tab.icon;
                return (
                  <button
                    key={tab.id}
                    onClick={() => changeTab(tab.id)}
                    className={`avvi-sidebar-link flex w-full shrink-0 items-center gap-2 rounded-lg px-2.5 text-left font-semibold transition ${activeTab === tab.id ? "bg-avvi-blue text-white shadow-sm" : "text-slate-600 hover:bg-avvi-soft hover:text-avvi-blue"}`}
                  >
                    <Icon size={15} />
                    <span>{tab.id}</span>
                  </button>
                );
                })}
              </SidebarGroup>
            </nav>
            <div className="avvi-sidebar-footer shrink-0">
              <div aria-label="Perfil do usuário" title={`${currentUser.name || currentUser.login} · ${userRole === "admin" ? "Administrador" : "Usuário padrão"}`} className="truncate rounded border border-[#eadcc4] bg-avvi-soft px-2 text-[10px] font-semibold leading-[20px] text-slate-600">
                {currentUser.login === "admin" ? "Perfil Administrador" : `Perfil ${userRole === "admin" ? "Administrador" : "Usuário padrão"} · ${currentUser.login}`}
              </div>
              <button onClick={handleLogout} disabled={isSyncing} className="flex w-full items-center justify-center gap-2 rounded-lg border border-red-100 bg-white h-[26px] px-3 text-[11px] font-bold text-avvi-red transition hover:bg-red-50" title="Sair do sistema">
                <LogOut size={15} />
                <span>Sair</span>
              </button>
            </div>
          </div>
        </aside>

        <section className={`min-w-0 flex-1 lg:ml-[17.5rem] ${["Agenda", "Ultraformer MPT"].includes(activeTab) ? "flex h-dvh min-h-0 flex-col overflow-hidden px-2 py-2 lg:px-4" : "px-4 py-5 lg:px-7"}`}>
          <Header activeTab={activeTab} compact={["Agenda", "Ultraformer MPT"].includes(activeTab)} />
          {!availableTabs.length && <Panel><p className="text-sm text-slate-600">Nenhuma aba foi autorizada para esta conta. Solicite o acesso ao administrador.</p></Panel>}
          {canAccessTab(currentUser, "Follow Up") && activeTab === "Follow Up" && <FollowUpNavigation tab={followUpTab} change={setFollowUpTab} />}
          {syncError && (
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-avvi-red">
              <span>{syncError}</span>
              {isSupabaseConfigured && <button onClick={retrySaving} disabled={isSyncing} className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-xs font-bold text-avvi-red disabled:cursor-not-allowed disabled:opacity-60">Tentar novamente</button>}
            </div>
          )}
          {storageError && <div role="alert" className="mb-2 rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-sm text-avvi-red">{storageError}</div>}
          <div role="status" aria-label="Status do salvamento" className="mb-2 shrink-0 rounded-lg border border-avvi-line bg-white px-3 py-1.5 text-xs font-semibold text-slate-600">
            {!isDataReady ? "Carregando dados…" : storageError && !isSupabaseConfigured ? "Falha ao salvar neste navegador. Mantenha a página aberta." : !isSupabaseConfigured ? "Prévia local: alterações salvas apenas neste navegador." : isSyncing ? "Salvando alterações na nuvem…" : hasPendingChanges || syncError ? "Salvamento na nuvem pendente. As alterações serão tentadas novamente." : `Dados salvos na nuvem${lastSavedAt ? ` às ${format(parseISO(lastSavedAt), "HH:mm:ss")}` : ""}.`}
          </div>
          {activeTab === "Agenda" ? <select aria-label="Navegar pelo sistema" value={activeTab} onChange={(event) => changeTab(event.target.value as Tab)} className="mb-2 shrink-0 rounded border border-avvi-line bg-white p-1.5 text-xs lg:hidden">{availableTabs.map((tab) => <option key={tab.id}>{tab.id}</option>)}</select> : <MobileTabs activeTab={activeTab} setActiveTab={changeTab} allowedTabs={availableTabs} />}

          {canAccessTab(currentUser, "Agenda") && activeTab === "Agenda" && (
            <AgendaView
              viewMode={viewMode}
              setViewMode={setViewMode}
              selectedDate={selectedDate}
              setSelectedDate={setSelectedDate}
              professionalFilter={professionalFilter}
              setProfessionalFilter={setProfessionalFilter}
              appointments={appointments}
              entries={entries}
              patients={patients}
              procedures={procedures}
              services={services}
              professionals={professionals}
              visibleProfessionals={visibleProfessionals}
              openSlot={openSlot}
              openAppointment={openAppointment}
              updateStatus={updateAgendaStatus}
              openAccount={openAccountFromAgenda}
              viewAccount={viewClosedAccount}
            />
          )}

          {activeTab === "Follow Up" && <FollowUpView tab={followUpTab} changeTab={setFollowUpTab} patients={patients} appointments={appointments} services={services} professionals={professionals} rules={followUpRules} setRules={setFollowUpRules} contacts={followUpContacts} setContacts={setFollowUpContacts} logs={followUpLogs} setLogs={setFollowUpLogs} />}

          {userRole === "admin" && activeTab === "Contas" && <AccountsView professionals={professionals} />}
          {canAccessTab(currentUser, "Relatórios") && activeTab === "Relatórios" && <ReportsView appointments={appointments} entries={entries} professionals={professionals} procedures={procedures} services={services} revenues={revenues} />}

          {canAccessTab(currentUser, "Ultraformer MPT") && activeTab === "Ultraformer MPT" && <UltraformerView user={currentUser} tips={ultraformerTips} setTips={setUltraformerTips} patients={patients} professionals={professionals} />}
          {canAccessTab(currentUser, "Estoque") && activeTab === "Estoque" && <InventorySection gifts={gifts} setGifts={setGifts} procedures={procedures} inventory={inventory} setInventory={setInventory} appointments={appointments} entries={entries} patients={patients} professionals={professionals} />}

          {canAccessTab(currentUser, "Lançamento de Procedimentos") && activeTab === "Lançamento de Procedimentos" && (
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

          {canAccessTab(currentUser, "Receitas") && activeTab === "Receitas" && (
            <RevenuesView
              revenues={revenues}
              setRevenues={setRevenues}
              patients={patients}
              setPatients={setPatients}
              selectedMonth={selectedMonth}
              setSelectedMonth={setSelectedMonth}
            />
          )}

          {canAccessTab(currentUser, "Recibos de Pagamento") && activeTab === "Recibos de Pagamento" && (
            <ReceiptsView
              receiptForm={receiptForm}
              setReceiptForm={setReceiptForm}
              receipts={receipts}
              professionals={professionals}
              generateReceipt={generateReceipt}
              reopenReceipt={savePatientReceiptPdf}
              professionalName={professionalName}
            />
          )}

          {canAccessTab(currentUser, "Pagamento Profissional") && activeTab === "Pagamento Profissional" && (
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
              reopenProfessionalReceipt={reopenProfessionalReceipt}
              patientName={patientName}
              professionalName={professionalName}
              procedureName={procedureName}
            />
          )}

          {canAccessTab(currentUser, "Relatório Profissional") && activeTab === "Relatório Profissional" && (
            <ProfessionalReportView
              user={currentUser}
              entries={entries}
              professionals={professionals}
              selectedMonth={selectedMonth}
              setSelectedMonth={setSelectedMonth}
              monthlyGoals={monthlyGoals}
              appointments={appointments}
              patients={patients}
              services={services}
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

          {activeTab === "Cadastro de Serviços" && (
            <ServicesView services={services} setServices={setServices} />
          )}

          {activeTab === "Cadastro de Profissionais" && (
            <ProfessionalsView
              professionalForm={professionalForm}
              setProfessionalForm={setProfessionalForm}
              professionals={professionals}
              setProfessionals={setProfessionals}
              saveProfessional={saveProfessional}
              allowGoals={canAccessTab(currentUser, "Metas")}
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

          {canAccessTab(currentUser, "Metas") && activeTab === "Metas" && (
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

          {canAccessTab(currentUser, "Dashboard") && activeTab === "Dashboard" && (
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

      {accountSummary && <AccountSummary draft={accountSummary.draft} closedAt={accountSummary.closedAt} change={accountSummary.change} procedures={procedures} onClose={() => setAccountSummary(null)} />}

      {checkoutDraft && <AccountCheckout key={`${checkoutDraft.appointment.id}-${checkoutDraft.entryId ?? "new"}`}
        draft={checkoutDraft} gifts={gifts} procedures={procedures} services={services} appointments={appointments}
        onCancel={() => { const appointmentId = checkoutDraft.appointment.id; setCheckoutDraft(null); openAppointment(appointmentId); }}
        onDelete={checkoutDraft.appointment.accountClosed ? () => deleteClosedAccount(checkoutDraft.appointment.id) : undefined}
        onConfirm={finishCheckout} />}

      {selectedSlot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div data-testid="appointment-details-window" className="max-h-[96dvh] w-full max-w-6xl overflow-auto rounded-lg bg-white p-5 shadow-panel thin-scrollbar">
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
              services={services}
              professionals={professionals}
              saveAppointment={() => saveAppointment()}
              openCheckout={openCheckout}
              deleteAccount={appointments.find((item) => item.id === selectedAppointmentId)?.accountClosed ? () => deleteClosedAccount(selectedAppointmentId!) : undefined}
              error={appointmentError}
            />
          </div>
        </div>
      )}
    </main>
  );
}

function Header({ activeTab, compact = false }: { activeTab: Tab; compact?: boolean }) {
  return (
    <header className={`shrink-0 rounded-2xl border border-white/70 bg-white/85 shadow-panel backdrop-blur ${compact ? "mb-2 px-3 py-2" : "mb-4 px-5 py-4"}`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          {!compact && <p className="text-xs font-semibold uppercase tracking-[0.16em] text-avvi-blue">AVVI Clínica</p>}
          <h2 className={`${compact ? "text-lg" : "text-2xl"} font-bold text-avvi-ink`}>{activeTab}</h2>
        </div>
        <div className={`flex items-center gap-2 rounded-xl bg-avvi-soft font-semibold text-avvi-blue ${compact ? "px-2 py-1 text-[10px]" : "px-3 py-2 text-sm"}`}>
          <CheckCircle2 size={16} />
          Sistema v1 funcional
        </div>
      </div>
    </header>
  );
}

function MobileTabs({ activeTab, setActiveTab, allowedTabs }: { activeTab: Tab; setActiveTab: (tab: Tab) => void; allowedTabs: typeof tabs }) {
  return (
    <div className="mb-4 flex gap-2 overflow-x-auto lg:hidden">
      {allowedTabs.map((tab) => (
        <button key={tab.id} onClick={() => setActiveTab(tab.id)} className={`shrink-0 rounded-lg px-3 py-2 text-sm font-semibold shadow-sm ${activeTab === tab.id ? "bg-avvi-blue text-white" : "bg-white/90 text-slate-600"}`}>
          {tab.id}
        </button>
      ))}
    </div>
  );
}

function AppointmentForm({ form, setForm, patients, services, professionals, saveAppointment, openCheckout, deleteAccount, error }: { form: ReturnType<typeof makeAppointmentForm>; setForm: (form: ReturnType<typeof makeAppointmentForm>) => void; patients: Patient[]; services: Service[]; professionals: Professional[]; saveAppointment: () => void; openCheckout: () => void; deleteAccount?: () => void; error: string }) {
  return (
    <form onSubmit={(event) => { event.preventDefault(); saveAppointment(); }} className="mt-5 grid gap-4 lg:grid-cols-2">
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
      <div className="space-y-2 lg:col-span-2">
        <FormField label="Serviço">
          <div className="flex items-center gap-2"><select aria-label="Serviço" value={form.serviceId} onChange={(event) => {
            const service = services.find((item) => item.id === event.target.value);
            setForm({ ...form, serviceId: event.target.value, procedureId: service ? "" : form.procedureId,
              durationMinutes: service ? service.durationMinutes + form.additionalServices.reduce((sum, item) => sum + item.durationMinutes, 0) : form.durationMinutes,
              servicePrice: service?.price, servicePriceType: service?.priceType });
          }} className="input min-w-0 flex-1">
            <option value="">Selecione um serviço</option>
            {services.filter((service) => service.active || service.id === form.serviceId).slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR")).map((service) => <option key={service.id} value={service.id}>{service.name} · {service.priceType === "from" ? "A partir de " : ""}{currency(service.price)}{service.active ? "" : " (inativo)"}</option>)}
          </select><button type="button" aria-label="Adicionar outro serviço ao agendamento" title="Adicionar outro serviço" onClick={() => setForm({ ...form, additionalServices: [...form.additionalServices, { id: id("scheduled-service"), serviceId: "", name: "", price: 0, priceType: "fixed", durationMinutes: 0 }] })} className="shrink-0 rounded-lg border border-avvi-line bg-amber-50 p-2.5 text-avvi-blue"><Plus size={18} /></button></div>
        </FormField>
        {form.additionalServices.map((item, index) => <div key={item.id} className="flex items-center gap-2"><select aria-label={`Serviço adicional ${index + 1}`} value={item.serviceId} className="input min-w-0 flex-1" onChange={(event) => {
          const service = services.find((entry) => entry.id === event.target.value);
          setForm({ ...form, durationMinutes: Math.max(1, form.durationMinutes - item.durationMinutes + (service?.durationMinutes ?? 0)), additionalServices: form.additionalServices.map((entry) => entry.id === item.id ? { ...entry, serviceId: service?.id ?? "", name: service?.name ?? "", price: service?.price ?? 0, priceType: service?.priceType ?? "fixed", durationMinutes: service?.durationMinutes ?? 0 } : entry) });
        }}><option value="">Selecione outro serviço</option>{services.filter((service) => service.active || service.id === item.serviceId).slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR")).map((service) => <option key={service.id} value={service.id}>{service.name} · {service.priceType === "from" ? "A partir de " : ""}{currency(service.price)}{service.active ? "" : " (inativo)"}</option>)}</select><button type="button" aria-label={`Remover serviço adicional ${index + 1}`} onClick={() => setForm({ ...form, durationMinutes: Math.max(1, form.durationMinutes - item.durationMinutes), additionalServices: form.additionalServices.filter((entry) => entry.id !== item.id) })} className="shrink-0 rounded p-2.5 text-slate-400 hover:text-red-500"><Trash2 size={16} /></button></div>)}
      </div>
      <FormField label="Profissional">
        <select value={form.professionalId} onChange={(event) => setForm({ ...form, professionalId: event.target.value })} className="input">
          {professionals.map((professional) => <option key={professional.id} value={professional.id}>{professional.name}</option>)}
        </select>
      </FormField>
      <FormField label="Data"><input type="date" required value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} className="input" /></FormField>
      <FormField label="Hora"><input type="time" required value={`${form.hour.padStart(2, "0")}:${form.minute}`} onChange={(event) => { const [hour, minute] = event.target.value.split(":"); setForm({ ...form, hour, minute }); }} className="input" /></FormField>
      <FormField label="Duração (minutos)"><input type="number" required min={1} step={1} value={form.durationMinutes || ""} onChange={(event) => setForm({ ...form, durationMinutes: Number(event.target.value) })} className="input" /></FormField>
      <FormField label="Observações"><textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} className="input min-h-20" /></FormField>
      <FormField label="Observações do paciente"><textarea value={form.patientNotes} onChange={(event) => setForm({ ...form, patientNotes: event.target.value })} className="input min-h-20" /></FormField>
      <div className="flex items-center justify-between gap-3 lg:col-span-2">
        <button type="submit" className="rounded-md bg-avvi-blue px-4 py-2 font-bold text-white"><Save className="mr-2 inline" size={16} />Salvar agendamento</button>
        <div className="flex items-center gap-2">{deleteAccount && <button type="button" aria-label="Excluir conta fechada" title="Excluir conta fechada" onClick={deleteAccount} className="rounded-md border border-red-200 p-2 text-red-600 hover:bg-red-50"><Trash2 size={18} /></button>}<button type="button" onClick={openCheckout} className="rounded-md border border-orange-500 bg-orange-50 px-4 py-2 font-bold text-orange-600"><CircleDollarSign className="mr-2 inline" size={16} />Fechar conta</button></div>
      </div>
      {error && <p role="alert" className="text-sm text-avvi-red lg:col-span-2">{error}</p>}
    </form>
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
  const productCost = productCostOnly(props.entryForm);
  const totalServices = servicesTotal(props.entryForm);
  const totalCost = productCost + summary.discount + summary.machineFee;
  const profit = totalServices - totalCost;
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
      professionalPercent: props.professionals.find((item) => item.id === props.entryForm.professionalId)?.commissionPercent ?? 70
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
            <p className="font-bold">Procedimentos do lançamento</p>
            <button onClick={addLine} className="text-sm font-bold text-avvi-blue"><Plus className="mr-1 inline" size={14} />Adicionar procedimento</button>
          </div>
          <div className="mb-3 grid gap-3 md:grid-cols-3">
            <FormField label="Desconto comercial">
              <MoneyInput value={props.entryForm.commercialDiscount} onChange={updateCommercialDiscount} />
            </FormField>
            <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-slate-600 md:col-span-2">
              O desconto reduz o valor dos procedimentos e preenche automaticamente o valor pago. Em &quot;Profissional assume&quot;, ele também é abatido integralmente do valor profissional.
            </div>
          </div>
          <div className="space-y-3">
            {props.entryForm.procedureLines.map((line, index) => (
              <div key={line.id} className="grid gap-2 rounded-md bg-slate-50 p-3 md:grid-cols-[1.5fr_0.6fr_1fr_1fr_0.8fr_auto]">
                <FormField label="Procedimento">
                  <select value={line.procedureId ?? ""} onChange={(event) => selectProcedure(index, event.target.value)} className="input">
                    <option value="">Procedimento do catálogo</option>
                    {props.procedures
                      .filter((procedure) => procedure.active)
                      .slice()
                      .sort((first, second) => first.name.localeCompare(second.name, "pt-BR", { sensitivity: "base" }))
                      .map((procedure) => <option key={procedure.id} value={procedure.id}>{procedure.name}</option>)}
                  </select>
                  {!line.procedureId && line.manualProcedure && <p className="mt-2 text-sm font-bold text-avvi-blue">Serviço agendado: {line.manualProcedure}</p>}
                </FormField>
                <FormField label="Quantidade">
                  <input type="number" min={1} value={line.quantity} onChange={(event) => updateLine(index, { quantity: Number(event.target.value) })} className="input" />
                </FormField>
                <FormField label="Valor do produto">
                  <MoneyInput value={line.servicePrice} onChange={(value) => updateLine(index, { servicePrice: value })} />
                </FormField>
                <FormField label="Custo médio">
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
        <div className="mt-4"><FormField label="Observações do lançamento"><textarea className="input min-h-20" value={props.entryForm.notes} onChange={(event) => props.setEntryForm({ ...props.entryForm, notes: event.target.value })} /></FormField></div>
        <PaymentEditor form={props.entryForm} setForm={props.setEntryForm} patients={props.patients} />
        <div className="mt-4 grid gap-2 rounded-md border border-amber-200 bg-avvi-soft p-3 text-[11px] md:grid-cols-8">
          <SummaryItem label="Custo médio" value={currency(productCost)} />
          <SummaryItem label="Descontos" value={currency(summary.discount)} tone="red" />
          <SummaryItem label="Taxa maquininha" value={currency(summary.machineFee)} tone="red" />
          <SummaryItem label="Custo total" value={currency(totalCost)} />
          <SummaryItem label="Total de procedimentos" value={currency(totalServices)} tone="blue" />
          <SummaryItem label="Lucro" value={currency(profit)} tone="green" />
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
  const headers = ["Data", "Profissional", "Paciente", "Procedimento", "Custo médio", "Preço", "Taxa/desc", "Valor recebido", "Lucro base", "V. profissional", "Ações"];

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
                  <td className="px-3 py-3 align-top">{currency(productCostOnly(entry))}</td>
                  <td className="px-3 py-3 align-top">{currency(item.grossRevenue)}</td>
                  <td className="px-3 py-3 align-top">{currency(item.machineFee + item.discount)}</td>
                  <td className="px-3 py-3 align-top">{currency(item.received)}</td>
                  <td className="px-3 py-3 align-top">{currency(item.baseProfit)}</td>
                  <td className="px-3 py-3 align-top">{currency(item.professionalValue)}</td>
                  <td className="px-3 py-3 align-top">
                    <ActionButtons
                      small
                      onEdit={() => props.setEntryForm({ ...entry, sourceAccountId: entry.sourceAccountId, products: entry.products, accountClosed: entry.accountClosed, balanceDue: entry.balanceDue, appointmentId: entry.appointmentId, patientName: props.patientName(entry.patientId), procedureId: entry.procedureId ?? "", manualProcedure: entry.manualProcedure ?? "", procedureLines: entry.procedureLines?.length ? entry.procedureLines : [entryToLine(entry)] })}
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
  const totalDue = Math.max(0, servicesTotal(form) - (Number(form.commercialDiscount) || 0));
  const paidTotal = form.payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const remainingPayment = Math.max(0, totalDue - paidTotal);

  function updatePayment(index: number, patch: Partial<PaymentItem>) {
    setForm({
      ...form,
      payments: form.payments.map((payment, itemIndex) => {
        if (itemIndex !== index) return payment;
        const nextMethod = patch.method ?? payment.method;
        const nextAmount = patch.amount ?? payment.amount;
        const nextBrand = nextMethod === "Crédito" ? (patch.cardBrand ?? payment.cardBrand ?? "Mastercard") : undefined;
        const nextInstallments = nextMethod === "Crédito" ? (patch.installments ?? payment.installments ?? 1) : 1;
        const nextFee = nextMethod === "Crédito"
          ? calculateCardFee(nextAmount, nextBrand, nextInstallments)
          : nextMethod === "Débito"
            ? calculateDebitFee(nextAmount)
            : 0;
        return {
          ...payment,
          ...patch,
          amount: nextAmount,
          fee: nextFee,
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
        <button onClick={() => setForm({ ...form, payments: [...form.payments, { ...blankPayment, id: id("payment"), amount: remainingPayment }] })} className="text-sm font-bold text-avvi-blue"><Plus className="mr-1 inline" size={14} />Adicionar</button>
      </div>
      <div className="space-y-2">
        {form.payments.map((payment, index) => (
          <div key={payment.id} className="grid gap-2 rounded-md bg-slate-50 p-3 md:grid-cols-[1fr_1fr_1fr_1fr_0.8fr_auto]">
            <FormField label="Forma"><select value={payment.method} onChange={(event) => updatePayment(index, { method: event.target.value as PaymentMethod })} className="input">
                {procedurePaymentMethods.map((method) => <option key={method}>{method}</option>)}
              </select></FormField>
            <FormField label="Valor pago"><MoneyInput value={payment.amount} onChange={(value) => updatePayment(index, { amount: value })} /></FormField>
            <FormField label="Taxa maquininha">
              {payment.method === "Crédito" || payment.method === "Débito" ? (
                <MoneyInput value={payment.fee} onChange={(value) => updatePayment(index, { fee: value })} />
              ) : (
                <div className="rounded-md border border-avvi-line bg-white px-3 py-2 text-sm text-slate-400">Sem taxa</div>
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
        <SummaryItem label="Taxa maquininha" value={currency(summary.machineFee)} tone="red" />
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
            <SummaryItem label="Custo médio" value={currency(line.productCost * line.quantity)} />
            <SummaryItem label="% profissional" value={`${line.professionalPercent}%`} tone="violet" />
            <SummaryItem label="Quantidade" value={String(line.quantity)} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ReceiptsView({ receiptForm, setReceiptForm, receipts, professionals, generateReceipt, reopenReceipt, professionalName }: { receiptForm: ReturnType<typeof makeReceiptForm>; setReceiptForm: (form: ReturnType<typeof makeReceiptForm>) => void; receipts: Receipt[]; professionals: Professional[]; generateReceipt: () => void; reopenReceipt: (receipt: Receipt) => void; professionalName: (id?: string) => string }) {
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
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-bold">{receipt.patientName}</p>
                  <p>{receipt.procedure} · {currency(receipt.amount)}</p>
                  <p className="text-slate-500">{formatDate(receipt.date)} · {professionalName(receipt.professionalId)}</p>
                </div>
                <button onClick={() => reopenReceipt(receipt)} className="rounded-md border border-avvi-line p-2 text-avvi-blue hover:bg-avvi-soft" title="Abrir PDF novamente">
                  <FileText size={14} />
                </button>
              </div>
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
  reopenProfessionalReceipt: (id: string) => void;
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
                  <div className="flex gap-1">
                    <button onClick={() => props.reopenProfessionalReceipt(receipt.id)} className="rounded-md border border-avvi-line p-2 text-avvi-blue hover:bg-avvi-soft" title="Abrir PDF novamente">
                      <FileText size={14} />
                    </button>
                    <button onClick={() => props.deleteProfessionalReceipt(receipt.id)} className="rounded-md border border-red-100 p-2 text-avvi-red hover:bg-red-50" title="Excluir recibo">
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              </div>
            )) : <p className="rounded-md bg-slate-50 p-3 text-sm text-slate-500">Nenhum recibo gerado neste período.</p>}
          </div>
        </Panel>
      </div>
    </div>
  );
}

function makeServiceForm(): Service {
  return { id: "", name: "", description: "", durationMinutes: 60, category: "", price: 0, priceType: "fixed", active: true };
}

function ServicesView({ services, setServices }: { services: Service[]; setServices: Dispatch<SetStateAction<Service[]>> }) {
  const [serviceForm, setServiceForm] = useState<Service>(makeServiceForm);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const sortedServices = services.filter((service) => serviceKey(`${service.name} ${service.category}`).includes(serviceKey(query)))
    .slice().sort((first, second) => first.name.localeCompare(second.name, "pt-BR", { sensitivity: "base" }));

  function saveService(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!serviceForm.name.trim() || !Number.isInteger(serviceForm.durationMinutes) || serviceForm.durationMinutes <= 0
      || !Number.isFinite(serviceForm.price) || serviceForm.price < 0) {
      setError("Informe o nome, uma duração válida e um preço igual ou maior que zero.");
      return;
    }
    if (services.some((service) => service.id !== serviceForm.id && serviceKey(service.name) === serviceKey(serviceForm.name))) {
      setError("Já existe um serviço com este nome. Edite o cadastro existente.");
      return;
    }
    const saved: Service = { ...serviceForm, id: serviceForm.id || id("service"), name: serviceForm.name.trim(),
      description: serviceForm.description.trim(), category: serviceForm.category.trim(), price: Math.round(serviceForm.price * 100) / 100 };
    setServices((current) => serviceForm.id ? current.map((service) => service.id === serviceForm.id ? saved : service) : [saved, ...current]);
    setServiceForm(makeServiceForm());
    setError("");
  }

  return (
    <div className="space-y-4">
      <Panel>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold">{serviceForm.id ? "Editar serviço" : "Cadastro de serviços"}</h3>
            <p className="text-sm text-slate-500">Cadastre os serviços da clínica e selecione-os nos agendamentos.</p>
          </div>
          <span className="rounded-full bg-avvi-soft px-3 py-1 text-xs font-bold text-avvi-blue">{services.length} serviços</span>
        </div>
        <form onSubmit={saveService}>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <FormField label="Nome"><input className="input" required value={serviceForm.name} onChange={(event) => setServiceForm({ ...serviceForm, name: event.target.value })} /></FormField>
            <FormField label="Categoria"><input className="input" value={serviceForm.category} onChange={(event) => setServiceForm({ ...serviceForm, category: event.target.value })} /></FormField>
            <FormField label="Duração (minutos)"><input className="input" type="number" required min={1} step={1} value={serviceForm.durationMinutes || ""} onChange={(event) => setServiceForm({ ...serviceForm, durationMinutes: Number(event.target.value) })} /></FormField>
            <div className="md:col-span-2">
              <FormField label="Descrição"><textarea className="input min-h-24" value={serviceForm.description} onChange={(event) => setServiceForm({ ...serviceForm, description: event.target.value })} /></FormField>
            </div>
            <div className="rounded-xl border border-avvi-blue/30 bg-avvi-soft p-4">
              <p className="mb-2 text-xl font-bold text-avvi-blue">{serviceForm.priceType === "from" ? "A partir de " : ""}{currency(serviceForm.price)}</p>
              <FormField label="Preço"><MoneyInput value={serviceForm.price} onChange={(value) => setServiceForm({ ...serviceForm, price: value })} /></FormField>
              <div className="mt-3">
                <FormField label="Tipo de preço"><select className="input" value={serviceForm.priceType} onChange={(event) => setServiceForm({ ...serviceForm, priceType: event.target.value as Service["priceType"] })}>
                  <option value="fixed">Preço fixo</option><option value="from">A partir de</option>
                </select></FormField>
              </div>
            </div>
          </div>
          {error && <p role="alert" className="mt-3 text-sm font-bold text-avvi-red">{error}</p>}
          <div className="mt-4 flex gap-3">
            <button type="submit" className="rounded-md bg-avvi-blue px-5 py-2 font-bold text-white"><Save className="mr-2 inline" size={16} />Salvar serviço</button>
            {serviceForm.id && <button type="button" className="rounded-md border border-avvi-line px-4 py-2 text-sm font-bold" onClick={() => { setServiceForm(makeServiceForm()); setError(""); }}>Cancelar edição</button>}
          </div>
        </form>
      </Panel>
      <Panel>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-lg font-bold">Serviços cadastrados</h3>
          <input aria-label="Buscar serviços" className="input max-w-sm" placeholder="Buscar nome ou categoria" value={query} onChange={(event) => setQuery(event.target.value)} />
        </div>
        <DataTable headers={["Serviço", "Categoria", "Duração", "Preço", "Status", "Ações"]} rows={sortedServices.map((service) => [
          <div key={`${service.id}-name`} className="max-w-sm"><p className="font-bold">{service.name}</p>{service.description && <p className="mt-1 text-xs text-slate-500">{service.description}</p>}</div>,
          service.category || "-", `${service.durationMinutes} min`,
          <span key={`${service.id}-price`} className="whitespace-nowrap text-base font-bold text-avvi-blue">{service.priceType === "from" ? "A partir de " : ""}{currency(service.price)}</span>,
          service.active ? "Ativo" : "Inativo",
          <div key={`${service.id}-actions`} className="flex items-center gap-2">
            <button title="Editar serviço" className="rounded-md border border-avvi-line p-2 text-avvi-blue hover:bg-avvi-soft" onClick={() => { setServiceForm({ ...service }); setError(""); window.scrollTo({ top: 0, behavior: "smooth" }); }}><Pencil size={16} /></button>
            <button className="rounded-md bg-avvi-soft px-3 py-2 text-sm font-bold text-avvi-blue" onClick={() => setServices((current) => current.map((item) => item.id === service.id ? { ...item, active: !item.active } : item))}>{service.active ? "Desativar" : "Ativar"}</button>
          </div>
        ])} />
        {!sortedServices.length && <p className="py-4 text-sm text-slate-500">Nenhum serviço encontrado.</p>}
      </Panel>
    </div>
  );
}

function ProceduresView({ procedureForm, setProcedureForm, procedures, setProcedures, saveProcedure }: { procedureForm: ReturnType<typeof makeProcedureForm>; setProcedureForm: (form: ReturnType<typeof makeProcedureForm>) => void; procedures: Procedure[]; setProcedures: (items: Procedure[]) => void; saveProcedure: () => void }) {
  const productCost = Number(procedureForm.productCost ?? procedureForm.averageCost) || 0;
  const taxValue = (Number(procedureForm.price) || 0) * ((Number(procedureForm.taxPercent) || 0) / 100);
  const clinicCost = Number(procedureForm.clinicCost) || 0;
  const calculatedAverageCost = productCost + taxValue + clinicCost;
  const sortedProcedures = procedures.slice().sort((first, second) => first.name.localeCompare(second.name, "pt-BR", { sensitivity: "base" }));

  function exportProceduresExcel() {
    import("xlsx").then((xlsx) => {
      const rows = sortedProcedures.map((procedure) => ({
        Procedimento: procedure.name,
        Categoria: procedure.category,
        "Custo do produto": procedure.productCost ?? procedure.averageCost,
        Imposto: procedure.price * ((procedure.taxPercent ?? 0) / 100),
        "Custo da clínica": procedure.clinicCost ?? 0,
        "Custo médio": procedure.averageCost,
        "Preço padrão": procedure.price
      }));
      const worksheet = xlsx.utils.json_to_sheet(rows);
      worksheet["!cols"] = [
        { wch: 34 }, { wch: 20 }, { wch: 18 }, { wch: 16 }, { wch: 18 },
        { wch: 16 }, { wch: 16 }
      ];
      const workbook = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(workbook, worksheet, "Procedimentos");
      xlsx.writeFile(workbook, "avvi-procedimentos.xlsx");
    });
  }

  function exportProceduresPdf() {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const headers = ["Procedimento", "Categoria", "Custo do produto", "Imposto", "Custo da clínica", "Custo médio", "Preço"];
    const widths = [52, 34, 37, 27, 37, 32, 27];
    const drawHeader = (y: number) => {
      doc.setFontSize(16);
      doc.setTextColor(20, 55, 90);
      doc.text("AVVI Clínica", 10, y);
      doc.setFontSize(11);
      doc.setTextColor(0, 0, 0);
      doc.text("Cadastro de procedimentos", 10, y + 7);
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text(`Gerado em ${new Date().toLocaleDateString("pt-BR")} · ${sortedProcedures.length} procedimento(s)`, 10, y + 12);
      return y + 20;
    };

    let y = drawHeader(12);
    y += drawPdfRow(doc, headers, widths, 10, y, true);
    sortedProcedures.forEach((procedure) => {
      const values = [
        procedure.name,
        procedure.category || "-",
        currency(procedure.productCost ?? procedure.averageCost),
        currency(procedure.price * ((procedure.taxPercent ?? 0) / 100)),
        currency(procedure.clinicCost ?? 0),
        currency(procedure.averageCost),
        currency(procedure.price),
      ];
      const rowHeight = Math.max(11, Math.max(...values.map((value, index) => doc.splitTextToSize(value, widths[index] - 2).slice(0, 3).length)) * 4 + 4);
      if (y + rowHeight > 195) {
        doc.addPage();
        y = drawHeader(12);
        y += drawPdfRow(doc, headers, widths, 10, y, true);
      }
      y += drawPdfRow(doc, values, widths, 10, y, false);
    });
    doc.save("avvi-procedimentos.pdf");
  }

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
          <FormField label="Custo do produto"><MoneyInput value={productCost} onChange={(value) => setProcedureForm({ ...procedureForm, productCost: value })} /></FormField>
          <FormField label="Imposto (%)"><input className="input" type="number" value={procedureForm.taxPercent ?? 0} onChange={(event) => setProcedureForm({ ...procedureForm, taxPercent: Number(event.target.value) })} /></FormField>
          <FormField label="Custo da clínica"><MoneyInput value={clinicCost} onChange={(value) => setProcedureForm({ ...procedureForm, clinicCost: value })} /></FormField>
          <div className="rounded-md border border-amber-200 bg-avvi-soft p-3 text-sm">
            <p className="text-xs font-bold uppercase text-avvi-blue">Custo médio calculado</p>
            <p className="mt-1 text-lg font-bold text-avvi-ink">{currency(calculatedAverageCost)}</p>
            <p className="mt-1 text-xs text-slate-500">Produto + imposto ({currency(taxValue)}) + clínica</p>
          </div>
          <FormField label="Observações"><input className="input" value={procedureForm.notes} onChange={(event) => setProcedureForm({ ...procedureForm, notes: event.target.value })} /></FormField>
        </div>
        <button onClick={saveProcedure} className="mt-4 rounded-md bg-avvi-blue px-5 py-2 font-bold text-white">Salvar procedimento</button>
      </Panel>
      <Panel>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold">Procedimentos cadastrados</h3>
            <p className="text-sm text-slate-500">Exporte a lista completa em PDF ou Excel.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={exportProceduresPdf} className="rounded-md border border-avvi-blue px-4 py-2 text-sm font-bold text-avvi-blue hover:bg-avvi-soft"><FileText className="mr-2 inline" size={16} />Exportar PDF</button>
            <button onClick={exportProceduresExcel} className="rounded-md bg-avvi-green px-4 py-2 text-sm font-bold text-white"><Download className="mr-2 inline" size={16} />Exportar Excel</button>
          </div>
        </div>
        <DataTable
          headers={["Procedimento", "Categoria", "Preço", "Custo médio", "Ações"]}
          rows={sortedProcedures.map((procedure) => [procedure.name, procedure.category, currency(procedure.price), currency(procedure.averageCost), (
            <div key={procedure.id} className="flex flex-wrap items-center gap-2">
              <ActionButtons
                onEdit={() => setProcedureForm({ ...procedure, productCost: procedure.productCost ?? procedure.averageCost, taxPercent: procedure.taxPercent ?? 0, clinicCost: procedure.clinicCost ?? 0 })}
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

function ProfessionalsView({ professionalForm, setProfessionalForm, professionals, setProfessionals, saveProfessional, allowGoals }: { professionalForm: ReturnType<typeof makeProfessionalForm>; setProfessionalForm: Dispatch<SetStateAction<ReturnType<typeof makeProfessionalForm>>>; professionals: Professional[]; setProfessionals: Dispatch<SetStateAction<Professional[]>>; saveProfessional: () => void; allowGoals: boolean }) {
  function updateAvatar(professional: Professional, file?: File) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      const avatarDataUrl = reader.result;
      setProfessionals((current) => current.map((item) => item.id === professional.id ? { ...item, avatarDataUrl } : item));
      setProfessionalForm((current) => current.id === professional.id ? { ...current, avatarDataUrl } : current);
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-4">
      <Panel>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold">Cadastro de profissionais</h3>
            <p className="text-sm text-slate-500">{allowGoals ? "Dados da profissional e comissão padrão." : "Cadastro da profissional e comissão padrão."}</p>
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
                  <input type="file" aria-label={`Foto de ${professional.name}`} accept="image/*" className="hidden" onChange={(event) => { updateAvatar(professional, event.target.files?.[0]); event.target.value = ""; }} />
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
    <div className="avvi-sidebar-group">
      <p className="mb-0.5 px-2.5 text-[9px] font-bold uppercase leading-3 tracking-[0.14em] text-slate-400">{label}</p>
      <div className="flex flex-col gap-0.5">{children}</div>
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

function drawProfessionalReceiptSummary(doc: jsPDF, values: { productCost: number; totalCost: number; totalPaid: number; totalMachineFee: number; totalDiscount: number; totalProfit: number; professionalValue: number }, x: number, y: number) {
  const items = [
    { label: "Custo produtos", value: values.productCost, color: [71, 85, 105] },
    { label: "Desconto", value: values.totalDiscount, color: [220, 38, 38] },
    { label: "Taxa maq.", value: values.totalMachineFee, color: [194, 65, 12] },
    { label: "Custo total", value: values.totalCost, color: [71, 85, 105] },
    { label: "Total serviços", value: values.totalPaid, color: [15, 23, 42] },
    { label: "Lucro", value: values.totalProfit, color: [0, 139, 92] },
    { label: "V. profissional", value: values.professionalValue, color: [99, 102, 241] }
  ];
  const cardWidth = 27;
  const cardHeight = 17;

  items.forEach((item, index) => {
    const currentX = x + (index * cardWidth);
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(currentX, y - 6, cardWidth - 2, cardHeight, 2, 2, "FD");
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text(item.label, currentX + 2, y - 1);
    doc.setFontSize(8);
    doc.setTextColor(item.color[0], item.color[1], item.color[2]);
    doc.text(currency(item.value), currentX + 2, y + 6);
  });
  doc.setTextColor(0, 0, 0);
  return cardHeight + 2;
}

function drawProfessionalReceiptFormulas(doc: jsPDF, y: number) {
  if (y > 228) {
    doc.addPage();
    y = 24;
  }
  doc.setDrawColor(226, 232, 240);
  doc.setFillColor(248, 250, 252);
  doc.roundedRect(10, y, 190, 24, 2, 2, "FD");
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text("Fórmulas utilizadas:", 14, y + 6);
  doc.text("Custo total = desconto + custo dos produtos + taxa da maquininha", 14, y + 12);
  doc.text("Lucro = total de serviços - custo total", 14, y + 17);
  doc.text("Valor profissional = lucro x % profissional cadastrado", 14, y + 22);
  doc.setTextColor(0, 0, 0);
  return y + 24;
}

function SummaryItem({ label, value, tone = "slate" }: { label: string; value: string; tone?: "slate" | "red" | "green" | "blue" | "violet" }) {
  const colors = { slate: "text-slate-700", red: "text-avvi-red", green: "text-avvi-green", blue: "text-avvi-blue", violet: "text-avvi-violet" };
  return <div><p className="text-xs text-slate-500">{label}</p><p className={`font-bold ${colors[tone]}`}>{value}</p></div>;
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
  return { patientId: "", patientName: "", phone: "", cpf: "", birthDate: "", patientNotes: "", procedureId: "", serviceId: "", additionalServices: [] as AppointmentService[], servicePrice: undefined as number | undefined, servicePriceType: undefined as Service["priceType"] | undefined, durationMinutes: 60, professionalId, date, hour: String(hour), minute: "00", status: "Agendado" as AppointmentStatus, eventType: "Novo Agendamento", notes: "" };
}

function makeEntryForm() {
  return { id: "", sourceAccountId: undefined as string | undefined, products: undefined as ProductUsage[] | undefined, accountClosed: undefined as boolean | undefined, balanceDue: undefined as number | undefined, appointmentId: undefined as string | undefined, patientId: "", patientName: "", professionalId: "", procedureId: "", manualProcedure: "", quantity: 1, servicePrice: 0, productCost: 0, machineFee: 0, commercialDiscount: 0, discountSplit: "Empresa e profissional dividem" as DiscountSplit, professionalPercent: 70, procedureLines: [makeProcedureLine()], date: todayKey(), notes: "", payments: [{ ...blankPayment, id: id("payment") }] };
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
  return { id: "", patientName: "", cpf: "", procedure: "", amount: 0, paymentMethod: "Pix", date: todayKey(), professionalId: "ana", notes: "" };
}

function makePatientForm(): Patient {
  return { id: "", name: "", gender: "", phone: "", cpf: "", birthDate: "", address: "", professionalId: "", futureCredit: 0, registrationDate: todayKey(), loyaltyPoints: 0, notes: "" };
}

function makeProcedureForm(): Procedure {
  return { id: "", name: "", category: "", price: 0, productCost: 0, taxPercent: 0, clinicCost: 0, averageCost: 0, professionalPercent: 70, notes: "", active: true };
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
  return { id: "", name: "", category: "Custos fixos", costType: "", professionalName: "", supplier: "", value: 0, dueDate: todayKey(), status: "Pendente", paymentMethod: "Pix", replicateMonths: 0, creditInstallments: 1, notes: "" };
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

function addMonthsToDate(date: string, amount: number) {
  const parsed = parseISO(`${date}T00:00:00`);
  return format(new Date(parsed.getFullYear(), parsed.getMonth() + amount, parsed.getDate()), "yyyy-MM-dd");
}

function previousMonth(key: string) {
  const date = parseISO(`${key}-01T00:00:00`);
  return format(new Date(date.getFullYear(), date.getMonth() - 1, 1), "yyyy-MM");
}

function monthProgress(key: string) {
  const today = todayKey();
  const currentMonth = today.slice(0, 7);
  if (key < currentMonth) return 1;
  if (key > currentMonth) return 0;
  return Math.min(1, Number(today.slice(8, 10)) / getDate(endOfMonth(parseISO(`${key}-01`))));
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


