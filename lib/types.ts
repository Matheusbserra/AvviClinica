export type UserRole = "admin" | "recepcao" | "profissional";

export type AppointmentStatus =
  | "Agendado"
  | "Confirmado"
  | "Compareceu"
  | "Faltou"
  | "Cancelado"
  | "Reagendado"
  | "Finalizado";

export type PaymentMethod = "Pix" | "Débito" | "Crédito" | "Dinheiro" | "Crédito Futuro";
export type DiscountSplit = "Empresa assume" | "Profissional assume" | "Empresa e profissional dividem";
export type FixedCostStatus = "Pago" | "Pendente" | "Atrasado";
export type ViewMode = "Dia" | "Semana" | "Mês";

export type Professional = {
  id: string;
  name: string;
  specialty: string;
  phone: string;
  email: string;
  cpf: string;
  birthDate: string;
  notes: string;
  avatarDataUrl?: string;
  active: boolean;
  color: string;
  commissionPercent: number;
  monthlyGoal: number;
};

export type Patient = {
  id: string;
  name: string;
  gender?: "Feminino" | "Masculino" | "Não informado" | "";
  phone: string;
  cpf: string;
  birthDate: string;
  address?: string;
  professionalId?: string;
  futureCredit?: number;
  registrationDate?: string;
  loyaltyPoints?: number;
  notes: string;
};

export type Procedure = {
  id: string;
  name: string;
  category: string;
  price: number;
  averageCost: number;
  professionalPercent: number;
  notes: string;
  active: boolean;
};

export type PaymentItem = {
  id: string;
  method: PaymentMethod;
  amount: number;
  fee: number;
  discount: number;
  cardBrand?: "Mastercard" | "Visa" | "Elo";
  installments?: number;
};

export type ProcedureLine = {
  id: string;
  procedureId?: string;
  manualProcedure?: string;
  quantity: number;
  servicePrice: number;
  productCost: number;
  professionalPercent: number;
};

export type FinancialEntry = {
  id: string;
  appointmentId?: string;
  patientId: string;
  professionalId: string;
  procedureId?: string;
  manualProcedure?: string;
  quantity: number;
  servicePrice: number;
  productCost: number;
  machineFee: number;
  commercialDiscount: number;
  discountSplit: DiscountSplit;
  professionalPercent: number;
  procedureLines?: ProcedureLine[];
  date: string;
  notes: string;
  payments: PaymentItem[];
};

export type Appointment = {
  id: string;
  patientId?: string;
  professionalId: string;
  procedureId?: string;
  startsAt: string;
  endsAt: string;
  status: AppointmentStatus;
  eventType: string;
  notes: string;
  financialEntryId?: string;
};

export type FixedCost = {
  id: string;
  sourceFinancialEntryId?: string;
  name: string;
  category: string;
  costType?: string;
  professionalName?: string;
  supplier?: string;
  value: number;
  dueDate: string;
  status: FixedCostStatus;
  paymentMethod: PaymentMethod;
  replicateMonths: number;
  creditInstallments: number;
  professionalReceiptId?: string;
  notes: string;
};

export type RevenueEntry = {
  id: string;
  sourceFinancialEntryId?: string;
  serviceDate: string;
  paymentDate: string;
  paymentTime: string;
  type: string;
  clientName: string;
  total: number;
  serviceQuantity: number;
  serviceTotal: number;
  clientCreditTotal: number;
  clientCreditAddedTotal: number;
  clientCreditUsedTotal: number;
  discount: number;
  discountReason: string;
  creditTotal: number;
  debitTotal: number;
  cashTotal: number;
  pixTotal: number;
};

export type Receipt = {
  id: string;
  patientName: string;
  cpf: string;
  procedure: string;
  amount: number;
  paymentMethod: PaymentMethod;
  date: string;
  professionalId: string;
  notes: string;
};

export type ProfessionalPaymentReceipt = {
  id: string;
  date: string;
  professionalId: string;
  professionalName: string;
  total: number;
  entryIds: string[];
};

