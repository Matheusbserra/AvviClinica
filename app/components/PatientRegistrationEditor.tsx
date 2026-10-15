"use client";

import { useState } from "react";
import type { Patient, Professional } from "@/lib/types";
import { ClinicalDialog } from "./ClinicalDialog";

export type PatientRegistration = Pick<Patient, "name" | "gender" | "phone" | "email" | "cpf" | "birthDate" | "address" | "registrationDate" | "professionalId" | "loyaltyPoints" | "notes">;

export function PatientRegistrationEditor({ patient, professionals, onSave, onClose }: {
  patient: Patient; professionals: Professional[]; onSave: (details: PatientRegistration) => void; onClose: () => void;
}) {
  const [form, setForm] = useState<PatientRegistration>(() => ({ name: patient.name, gender: patient.gender, phone: patient.phone, email: patient.email, cpf: patient.cpf,
    birthDate: patient.birthDate, address: patient.address, registrationDate: patient.registrationDate, professionalId: patient.professionalId, loyaltyPoints: patient.loyaltyPoints, notes: patient.notes }));
  const fields = [
    { key: "name", label: "Nome", type: "text" }, { key: "phone", label: "Telefone", type: "tel" }, { key: "email", label: "E-mail", type: "email" },
    { key: "cpf", label: "CPF", type: "text" }, { key: "birthDate", label: "Data de nascimento", type: "date" }, { key: "address", label: "Endereço", type: "text" },
    { key: "registrationDate", label: "Data de Cadastro", type: "date" }
  ] as const;
  return <ClinicalDialog title="Editar paciente" onClose={onClose} footer={<div className="ml-auto flex gap-2"><button type="button" onClick={onClose} className="rounded-md border border-avvi-line px-4 py-2 text-sm">Cancelar</button><button type="submit" form="appointment-patient-registration" className="rounded-md bg-avvi-blue px-4 py-2 text-sm font-bold text-white">Salvar paciente</button></div>}>
    <form id="appointment-patient-registration" onSubmit={event => { event.preventDefault(); onSave({ ...form, name: form.name.trim() || "Paciente sem nome" }); }} className="grid gap-4 sm:grid-cols-2">
      {fields.map(field => <label key={field.key} className="text-xs font-semibold text-slate-600">{field.label}<input aria-label={field.label} type={field.type} className="input mt-1" value={form[field.key] ?? ""} onChange={event => setForm({ ...form, [field.key]: event.target.value })}/></label>)}
      <label className="text-xs font-semibold text-slate-600">Gênero<select aria-label="Gênero" className="input mt-1" value={form.gender ?? ""} onChange={event => setForm({ ...form, gender: event.target.value as Patient["gender"] })}><option value="">Opcional</option>{["Feminino", "Masculino", "Não informado"].map(value => <option key={value}>{value}</option>)}</select></label>
      <label className="text-xs font-semibold text-slate-600">Profissional vinculada<select aria-label="Profissional vinculada" className="input mt-1" value={form.professionalId ?? ""} onChange={event => setForm({ ...form, professionalId: event.target.value || undefined })}><option value="">Opcional</option>{professionals.map(professional => <option key={professional.id} value={professional.id}>{professional.name}</option>)}</select></label>
      <label className="text-xs font-semibold text-slate-600">Pontos de Fidelidade<input aria-label="Pontos de Fidelidade" type="number" min={0} className="input mt-1" value={form.loyaltyPoints ?? 0} onChange={event => setForm({ ...form, loyaltyPoints: Number(event.target.value) || 0 })}/></label>
      <label className="text-xs font-semibold text-slate-600 sm:col-span-2">Observações<textarea aria-label="Observações" className="input mt-1 min-h-20" value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })}/></label>
    </form>
  </ClinicalDialog>;
}
