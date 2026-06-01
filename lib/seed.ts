import type { Appointment, FinancialEntry, FixedCost, Patient, Procedure, Professional, Receipt } from "./types";

export const professionals: Professional[] = [
  { id: "ana", name: "Ana", specialty: "Dentista - Harmonização Facial", phone: "(11) 99999-1001", email: "ana@avviclinica.com", cpf: "", birthDate: "", notes: "Responsável por harmonização facial.", active: true, color: "#b8862b", commissionPercent: 70, monthlyGoal: 60000 },
  { id: "tamna", name: "Tamna", specialty: "Fisioterapeuta Esteta", phone: "(11) 99999-1002", email: "tamna@avviclinica.com", cpf: "", birthDate: "", notes: "Foco em estética corporal.", active: true, color: "#0f9f75", commissionPercent: 50, monthlyGoal: 15000 },
  { id: "samia", name: "Samia", specialty: "Dentista - Harmonização Facial", phone: "(11) 99999-1003", email: "samia@avviclinica.com", cpf: "", birthDate: "", notes: "Atendimentos faciais avançados.", active: true, color: "#7c3aed", commissionPercent: 65, monthlyGoal: 30000 },
  { id: "beatriz", name: "Beatriz", specialty: "Dentista - Harmonização Facial", phone: "(11) 99999-1004", email: "beatriz@avviclinica.com", cpf: "", birthDate: "", notes: "Atendimentos de toxina e preenchimento.", active: true, color: "#d99a2b", commissionPercent: 55, monthlyGoal: 20000 }
];

export const patients: Patient[] = [
  { id: "p1", name: "Ricardo Nascimento Gomes", phone: "(11) 99999-0101", cpf: "123.456.789-10", birthDate: "1986-02-12", notes: "Prefere atendimento no período da tarde." },
  { id: "p2", name: "Wamberto Souza Campos Filho", phone: "(11) 98888-0202", cpf: "223.456.789-10", birthDate: "1978-09-04", notes: "Cliente de toxina e bioestimulador." },
  { id: "p3", name: "Angra Maria Oliveira Mendes", phone: "(11) 97777-0303", cpf: "323.456.789-10", birthDate: "1991-06-20", notes: "Acompanhar retorno em 30 dias." },
  { id: "p4", name: "Marina Duarte", phone: "(11) 96666-0404", cpf: "423.456.789-10", birthDate: "1994-01-18", notes: "Interessada em pacote corporal." }
];

export const procedures: Procedure[] = [
  { id: "toxina", name: "Toxina Botulínica", category: "Harmonização", price: 1200, averageCost: 230, professionalPercent: 70, notes: "Aplicação por região.", active: true },
  { id: "preenchimento", name: "Preenchimento Facial", category: "Harmonização", price: 2100, averageCost: 685, professionalPercent: 65, notes: "Valor por seringa.", active: true },
  { id: "bioestimulador", name: "Bioestimulador de Colágeno", category: "Estética", price: 3700, averageCost: 1326.23, professionalPercent: 70, notes: "Produto incluso.", active: true },
  { id: "limpeza", name: "Limpeza de Pele", category: "Estética", price: 280, averageCost: 48, professionalPercent: 45, notes: "Procedimento facial básico.", active: true }
];

export const appointments: Appointment[] = [
  { id: "a1", patientId: "p1", professionalId: "ana", procedureId: "bioestimulador", startsAt: "2026-05-27T09:00:00", endsAt: "2026-05-27T10:00:00", status: "Confirmado", eventType: "Novo Agendamento", notes: "Chegar 10 min antes.", financialEntryId: "f1" },
  { id: "a2", patientId: "p2", professionalId: "samia", procedureId: "preenchimento", startsAt: "2026-05-27T11:00:00", endsAt: "2026-05-27T12:00:00", status: "Agendado", eventType: "Novo Agendamento", notes: "" },
  { id: "a3", patientId: "p3", professionalId: "beatriz", procedureId: "toxina", startsAt: "2026-05-27T14:00:00", endsAt: "2026-05-27T15:00:00", status: "Finalizado", eventType: "Novo Agendamento", notes: "Finalizar recibo.", financialEntryId: "f4" },
  { id: "a4", professionalId: "tamna", startsAt: "2026-05-27T16:00:00", endsAt: "2026-05-27T17:00:00", status: "Agendado", eventType: "Registrar Liberação de Horário", notes: "Bloqueio para almoço." }
];

export const financialEntries: FinancialEntry[] = [
  { id: "f1", appointmentId: "a1", patientId: "p1", professionalId: "ana", procedureId: "bioestimulador", quantity: 2, servicePrice: 3700, productCost: 1326.23, machineFee: 0, commercialDiscount: 0, discountSplit: "Empresa e profissional dividem", professionalPercent: 70, date: "2026-05-24", notes: "", payments: [{ id: "pay1", method: "Crédito", amount: 3700, fee: 106.7, discount: 0, installments: 3 }] },
  { id: "f2", patientId: "p4", professionalId: "tamna", procedureId: "limpeza", quantity: 1, servicePrice: 739.98, productCost: 170.88, machineFee: 0, commercialDiscount: 0, discountSplit: "Empresa assume", professionalPercent: 50, date: "2026-05-24", notes: "", payments: [{ id: "pay2", method: "Pix", amount: 739.98, fee: 0, discount: 0 }] },
  { id: "f3", patientId: "p2", professionalId: "samia", procedureId: "preenchimento", quantity: 1, servicePrice: 900, productCost: 482.08, machineFee: 0, commercialDiscount: 0, discountSplit: "Empresa assume", professionalPercent: 65, date: "2026-05-23", notes: "", payments: [{ id: "pay3", method: "Dinheiro", amount: 900, fee: 0, discount: 0 }] },
  { id: "f4", appointmentId: "a3", patientId: "p3", professionalId: "beatriz", procedureId: "preenchimento", quantity: 1, servicePrice: 2100, productCost: 685.07, machineFee: 0, commercialDiscount: 0, discountSplit: "Empresa e profissional dividem", professionalPercent: 55, date: "2026-05-23", notes: "Desconto comercial autorizado.", payments: [{ id: "pay4", method: "Débito", amount: 2100, fee: 0, discount: 200 }] }
];

export const fixedCosts: FixedCost[] = [
  { id: "c1", name: "Aluguel", category: "Estrutura", value: 12500, dueDate: "2026-05-05", status: "Pago", paymentMethod: "Pix", replicateMonths: 0, creditInstallments: 1, notes: "" },
  { id: "c2", name: "Marketing", category: "Comercial", value: 4200, dueDate: "2026-05-10", status: "Pago", paymentMethod: "Crédito", replicateMonths: 0, creditInstallments: 3, notes: "Campanhas Meta Ads." },
  { id: "c3", name: "Insumos recorrentes", category: "Operacional", value: 3100, dueDate: "2026-05-28", status: "Pendente", paymentMethod: "Pix", replicateMonths: 0, creditInstallments: 1, notes: "" }
];

export const receipts: Receipt[] = [
  { id: "r1", patientName: "Angra Maria Oliveira Mendes", cpf: "323.456.789-10", procedure: "Preenchimento Facial", amount: 1900, paymentMethod: "Débito", date: "2026-05-23", professionalId: "beatriz", notes: "Recibo gerado após atendimento." }
];

