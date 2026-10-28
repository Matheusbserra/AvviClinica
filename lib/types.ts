export type UserRole = "admin" | "recepcao" | "profissional";

export type AppointmentStatus =
  | "Agendado"
  | "Confirmado"
  | "Compareceu"
  | "Faltou"
  | "Cancelado"
  | "Reagendado"
  | "Finalizado";

export type AnamneseTemplate = "facial" | "body";
export type AnamneseRecord = {
  id: string; patientId: string; professionalId: string; date: string; templateVersion: 1;
  template?: AnamneseTemplate;
  answers: Record<string, string | string[]>;
  createdAt: string; updatedAt: string;
  createdBy: { login: string; name: string }; updatedBy: { login: string; name: string };
};

export type PaymentMethod = "Pix" | "Débito" | "Crédito" | "Dinheiro" | "Crédito Futuro" | "Transferência Bancária" | "Depósito";
export type DiscountSplit = "Empresa assume" | "Profissional assume" | "Empresa e profissional dividem";
export type FixedCostStatus = "Pago" | "Pendente" | "Atrasado";
export type ViewMode = "Dia" | "Semana" | "Mês";

export type ClosedShift = { weekday: number; shift: "morning" | "afternoon" | "evening" };

export type Professional = {
  anamneseTemplate?: AnamneseTemplate;
  closedShifts?: ClosedShift[];
  showInAgenda?: boolean;
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
  photos?: PatientPhoto[];
  id: string;
  email?: string;
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

export type PatientPhoto = { id: string; name: string; date: string; uploadedBy: string; path?: string; localImage?: string };

export type Procedure = {
  id: string;
  name: string;
  category: string;
  price: number;
  productCost?: number;
  taxPercent?: number;
  clinicCost?: number;
  averageCost: number;
  professionalPercent: number;
  notes: string;
  active: boolean;
};

export type Service = {
  postProcedure?: PostProcedurePlan;
  id: string;
  name: string;
  description: string;
  durationMinutes: number;
  category: string;
  price: number;
  priceType: "fixed" | "from";
  active: boolean;
};

export type PostProcedurePlan = { enabled: boolean; firstContactDays: number; followUpDays: number[]; satisfactionDays: number; satisfactionEnabled?: boolean; reactivationDays: number; reactivationDaysList?: number[] };
export type PostProcedureStatus = "Aguardando contato" | "Mensagem enviada" | "Sem resposta" | "Concluído" | "Encaminhado à profissional";
export type PostProcedureMessageStage = "first" | "followup" | "satisfaction" | "reactivation";
export type PostProcedureMessage = { id: PostProcedureMessageStage; template: string; updatedAt: string };
export type PostProcedureContact = {
  id: string; appointmentId: string; patientId: string; serviceId: string; stage: string;
  status: PostProcedureStatus; dueDate?: string; rescheduled?: boolean; response: string;
  history: { at: string; by: string; status: PostProcedureStatus; response: string; dueDate?: string }[];
  updatedAt: string;
};

export type GiftStockItem = { id: string; name: string; quantity: number };
export type GiftUsage = { id: string; giftId: string; name: string; quantity: number };

export type InventoryItem = {
  id: string;
  procedureId: string;
  quantity: number;
  visibleInStock?: boolean;
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
  totalPriceOverride?: number;
  id: string;
  serviceId?: string;
  packageId?: string;
  packagePurchaseKey?: string;
  packageName?: string;
  packageCommissionPercent?: number;
  packageValidityMonths?: number;
  discount?: number;
  procedureId?: string;
  manualProcedure?: string;
  quantity: number;
  servicePrice: number;
  productCost: number;
  professionalPercent: number;
};

export type ProductUsage = { id: string; procedureId: string; quantity: number; unitCost: number };

export type FinancialEntry = {
  id: string;
  sourceAccountId?: string;
  accountClosed?: boolean;
  balanceDue?: number;
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
  products?: ProductUsage[];
  date: string;
  notes: string;
  payments: PaymentItem[];
};

// Billing is stored separately from the independently editable procedure ledger.
export type ClosedAccount = FinancialEntry & {
  packageSessionUses?: import("./packageSessions").PackageSessionUse[];
  checkoutNotes?: string;
  clinicPatient?: boolean;
  creditAdded?: number;
  creditPayments?: PaymentItem[];
  gifts?: GiftUsage[];
  ultraformerShots?: UltraformerShots[];
  closedAt?: string;
  change?: number;
  procedureLines: ProcedureLine[];
  products: ProductUsage[];
  generatedEntryId?: string;
};

export type AppointmentService = { id: string; serviceId: string; name: string; price: number; priceType: Service["priceType"]; durationMinutes: number };

export type InvoiceAttachment = { issued: boolean; invalidCpf?: boolean; visibility?: "hidden" | "visible"; updatedAt?: string; filename?: string; pdfPath?: string; localPdf?: string };

export type Appointment = {
  invoice?: InvoiceAttachment;
  historicalImport?: {
    sourceFile: string;
    sourceFingerprint: string;
    sourceRows: number[];
    originalStatus: string;
    originalAccount: string;
    closedByCutoff: boolean;
    paymentsUnknown: boolean;
  };
  giftConsumption?: GiftUsage[];
  services?: AppointmentService[];
  id: string;
  closedAccount?: ClosedAccount;
  accountClosed?: boolean;
  stockConsumption?: { procedureId: string; quantity: number }[];
  serviceId?: string;
  servicePrice?: number;
  servicePriceType?: Service["priceType"];
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
  services?: { serviceId: string; name: string }[];
  amount: number;
  paymentMethod: PaymentMethod;
  payments?: { method: PaymentMethod; amount: number }[];
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


export type FollowUpTrigger = "keyword" | "appointment_before" | "appointment_after" | "scheduled" | "inactivity";
export type FollowUpRule = {
  id: string; name: string; active: boolean; trigger: FollowUpTrigger;
  flow?: ConversationFlow;
  keywords: string[]; match: "contains" | "exact"; delayMinutes: number;
  scheduledAt: string; patientIds: string[]; message: string;
  messageType: "text" | "template"; templateName: string; templateLanguage: string; templateParameters: string[];
};
export type FollowUpContact = { id: string; optIn: boolean; updatedAt: string; lastInboundAt?: string };
export type FollowUpLog = { sentAt?: string;
  id: string; ruleId: string; ruleName: string; patientId: string; patientName: string; phone: string;
  message: string; scheduledFor: string; createdAt: string; sourceId: string;
  status: "simulated" | "scheduled" | "sending" | "sent" | "delivered" | "read" | "failed" | "canceled";
  providerMessageId?: string; error?: string;
};

export type ConversationBranch = { id: string; label: string; operator: "contains" | "exact" | "starts_with"; value: string; target: string };
export type ConversationNode = {
  id: string; type: "message" | "condition" | "wait" | "end"; title: string; x: number; y: number; next: string;
  text: string; messageType: "text" | "image" | "template"; imageUrl: string;
  templateName: string; templateLanguage: string; templateParameters: string[];
  branches: ConversationBranch[]; fallback: string; waitMode: "reply" | "delay"; delayMinutes: number;
};
export type ConversationFlow = { version: 1; entry: string; nodes: ConversationNode[]; triggerPosition?: { x: number; y: number } };
export type ConversationCursor = { nodeId: string; status: "active" | "waiting" | "done"; reply: string; wakeAt?: string; waitingSince?: string };

export type LeadStage = "entry" | "warm" | "cold" | "scheduled" | "aftercare";
export type FollowUpLead = { id: string; name: string; phone: string; patientId?: string; firstContactAt: string; lastContactAt: string; lastMessage: string; lastMessageId: string; manualStage?: LeadStage };

export type FollowUpMessage = { id: string; leadId: string; direction: "incoming" | "outgoing"; text: string; at: string; status?: FollowUpLog["status"] };

export type UltraformerShots = { tipId: string; name: string; quantity: number };
export type UltraformerUsage = { appointmentId?: string; sourceAccountId?: string; registeredBy?: { id: string; login: string; name: string }; id: string; date: string; quantity: number; patientId: string; patientName: string; professionalId: string; professionalName: string; createdAt: string };
export type UltraformerTip = { id: string; name: string; depth: string; kind: "linear" | "booster"; color: string; initialShots: number; usages: UltraformerUsage[] };

export type StrategyMetric = "revenue" | "patients" | "services" | "averageTicket" | "productivity" | "custom";
export type ProfessionalStrategy = {
  id: string; professionalId: string; title: string; metric: StrategyMetric;
  start: string; end: string; target: number; manualProgress: number; notes: string;
  createdAt: string; updatedAt: string;
  createdBy: { login: string; name: string }; updatedBy: { login: string; name: string };
};
