"use client";
import { useId, useState } from "react";
import type { ReactNode } from "react";
import { Calculator, Plus, RotateCcw, Trash2 } from "lucide-react";
import { SearchSelect } from "./SearchSelect";
import { currency } from "@/lib/calculations";
import { newSimulation, rebalanceSimulation, simulationPaymentRate, simulationRound, simulationTotals } from "@/lib/simulation";
import type { SimulationDraft } from "@/lib/simulation";
import type { DiscountSplit, PaymentItem, PaymentMethod, Procedure, Service } from "@/lib/types";

function Field({ label, children }: { label: string; children: ReactNode }) { return <div className="min-w-0 space-y-1"><span className="text-xs font-semibold text-slate-600">{label}</span>{children}</div>; }
function NumberField({ label, value, onChange, max, step = "0.01" }: { label: string; value: number; onChange: (value: number) => void; max?: number; step?: string }) {
  const id = useId();
  return <div className="min-w-0"><label htmlFor={id} className="text-xs font-semibold text-slate-600">{label}</label><input id={id} type="number" min="0" max={max} step={step} className="input mt-1" value={value} onChange={event => onChange(Math.min(max ?? Infinity, Math.max(0, Number(event.target.value) || 0)))} /></div>;
}
function Result({ label, value }: { label: string; value: number }) { return <div className="min-w-0 rounded-xl border border-avvi-line bg-white p-3"><dt className="text-xs text-slate-500">{label}</dt><dd className={`mt-1 text-lg font-bold ${value < 0 ? "text-red-600" : "text-avvi-ink"}`}>{currency(value)}</dd></div>; }

export function SimulationView({ procedures, services }: { procedures: Procedure[]; services: Service[] }) {
  // Deliberately component-local: no persistence, callbacks that write clinic
  // entities, storage, API mutations or shared checkout/ledger draft.
  const [draft, setDraft] = useState(newSimulation);
  const totals = simulationTotals(draft);
  const products = procedures.filter(product => product.active);
  const catalogServices = services.filter(service => service.active);
  function update(patch: Partial<SimulationDraft>, balance = false) { const next = { ...draft, ...patch }; setDraft(balance ? rebalanceSimulation(next) : next); }
  function payment(index: number, patch: Partial<SimulationDraft["payments"][number]>) { update({ payments: draft.payments.map((item, at) => at === index ? { ...item, ...patch } : item) }); }
  return <div className="space-y-4" role="region" aria-label="Simulação de atendimento">
    <section className="rounded-2xl border border-amber-200 bg-avvi-soft p-4 shadow-panel">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="flex items-center gap-2 text-lg font-bold"><Calculator size={21}/>Simulação de atendimento</h2><p className="mt-2 text-sm text-slate-600">Calcule custos e compare formas de pagamento. Nada é salvo: ao sair desta aba ou recarregar, os valores são descartados.</p><p className="mt-1 text-xs text-slate-500">Os preços e custos vêm do catálogo. As taxas são estimativas do lançamento de procedimentos; ajuste conforme a sua maquininha.</p></div><button type="button" onClick={() => setDraft(newSimulation())} className="flex items-center gap-2 rounded-lg border border-avvi-line bg-white px-3 py-2 text-xs font-bold text-avvi-blue"><RotateCcw size={15}/>Limpar simulação</button></div>
    </section>
    <section className="rounded-2xl bg-white p-4 shadow-panel">
      <div className="mb-4 flex items-center justify-between gap-2"><h3 className="font-bold">Serviços e valor do atendimento</h3><button type="button" onClick={() => update({ services: [...draft.services, { id: crypto.randomUUID(), serviceId: "", quantity: 1, unitPrice: 0 }] })} className="flex items-center gap-1 text-xs font-bold text-avvi-blue"><Plus size={15}/>Adicionar serviço</button></div>
      <div className="space-y-3">{draft.services.map((line, index) => <div key={line.id} className="grid items-end gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1fr_auto]">
        <Field label={`Serviço ${index + 1}`}><SearchSelect label={`Serviço da simulação ${index + 1}`} value={line.serviceId} options={catalogServices} onChange={serviceId => update({ services: draft.services.map(item => item.id === line.id ? { ...item, serviceId, unitPrice: catalogServices.find(service => service.id === serviceId)?.price ?? item.unitPrice } : item) }, true)}/><p className="text-[10px] text-slate-500">Ou informe o valor ao lado para simular livremente.</p></Field>
        <NumberField label={`Quantidade do serviço ${index + 1}`} value={line.quantity} onChange={quantity => update({ services: draft.services.map(item => item.id === line.id ? { ...item, quantity } : item) }, true)}/>
        <NumberField label={`Valor unitário do serviço ${index + 1}`} value={line.unitPrice} onChange={unitPrice => update({ services: draft.services.map(item => item.id === line.id ? { ...item, unitPrice } : item) }, true)}/>
        <Result label={`Total do serviço ${index + 1}`} value={simulationRound(line.quantity * line.unitPrice)}/>
        <button type="button" aria-label={`Remover serviço ${index + 1}`} onClick={() => update({ services: draft.services.filter(item => item.id !== line.id) }, true)} className="rounded-lg p-2 text-red-600"><Trash2 size={17}/></button>
      </div>)}</div>
    </section>
    <section className="rounded-2xl bg-white p-4 shadow-panel">
      <div className="mb-4 flex items-center justify-between gap-2"><h3 className="font-bold">Produtos utilizados e custos</h3><button type="button" onClick={() => update({ products: [...draft.products, { id: crypto.randomUUID(), procedureId: "", quantity: 1, unitCost: 0 }] })} className="flex items-center gap-1 text-xs font-bold text-avvi-blue"><Plus size={15}/>Adicionar produto</button></div>
      <div className="space-y-3">{draft.products.map((line, index) => <div key={line.id} className="grid items-end gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1fr_auto]">
        <Field label={`Produto ${index + 1}`}><SearchSelect label={`Produto da simulação ${index + 1}`} value={line.procedureId} options={products} onChange={procedureId => update({ products: draft.products.map(item => item.id === line.id ? { ...item, procedureId, unitCost: products.find(product => product.id === procedureId)?.averageCost ?? item.unitCost } : item) })}/></Field>
        <NumberField label={`Quantidade do produto ${index + 1}`} value={line.quantity} onChange={quantity => update({ products: draft.products.map(item => item.id === line.id ? { ...item, quantity } : item) })}/>
        <NumberField label={`Custo unitário do produto ${index + 1}`} value={line.unitCost} onChange={unitCost => update({ products: draft.products.map(item => item.id === line.id ? { ...item, unitCost } : item) })}/>
        <Result label={`Custo total do produto ${index + 1}`} value={simulationRound(line.quantity * line.unitCost)}/>
        <button type="button" aria-label={`Remover produto ${index + 1}`} onClick={() => update({ products: draft.products.filter(item => item.id !== line.id) })} className="rounded-lg p-2 text-red-600"><Trash2 size={17}/></button>
      </div>)}</div>
    </section>
    <section className="grid gap-3 rounded-2xl bg-white p-4 shadow-panel md:grid-cols-3">
      <NumberField label="Desconto simulado" value={draft.discount} max={totals.gross} onChange={discount => update({ discount }, true)}/>
      <NumberField label="Participação profissional na simulação (%)" value={draft.professionalPercent} max={100} onChange={professionalPercent => update({ professionalPercent })}/>
      <label className="min-w-0 text-xs font-semibold text-slate-600">Divisão do desconto<select aria-label="Divisão do desconto" className="input mt-1" value={draft.discountSplit} onChange={event => update({ discountSplit: event.target.value as DiscountSplit })}>{["Empresa assume", "Profissional assume", "Empresa e profissional dividem"].map(split => <option key={split}>{split}</option>)}</select></label>
    </section>
    <section className="rounded-2xl bg-white p-4 shadow-panel">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2"><h3 className="font-bold">Pagamento simulado</h3><div className="flex gap-3"><button type="button" onClick={() => setDraft(rebalanceSimulation(draft))} className="text-xs font-bold text-avvi-blue">Completar valor restante</button><button type="button" onClick={() => update({ payments: [...draft.payments, { id: crypto.randomUUID(), method: "Pix", amount: totals.remaining, installments: 1 }] })} className="flex items-center gap-1 text-xs font-bold text-avvi-blue"><Plus size={15}/>Adicionar pagamento</button></div></div>
      <div className="space-y-3">{draft.payments.map((line, index) => { const card = line.method === "Crédito" || line.method === "Débito"; return <div key={line.id} className="grid items-end gap-3 rounded-xl bg-slate-50 p-3 sm:grid-cols-2 xl:grid-cols-[1.2fr_1fr_1fr_0.7fr_0.8fr_1fr_auto]">
        <label className="text-xs font-semibold text-slate-600">Forma de pagamento {index + 1}<select aria-label={`Forma de pagamento ${index + 1}`} className="input mt-1" value={line.method} onChange={event => payment(index, { method: event.target.value as PaymentMethod, installments: 1, rateOverride: undefined })}>{["Pix", "Dinheiro", "Débito", "Crédito", "Transferência Bancária", "Depósito"].map(method => <option key={method}>{method}</option>)}</select></label>
        <NumberField label={`Valor do pagamento ${index + 1}`} value={line.amount} onChange={amount => payment(index, { amount })}/>
        {line.method === "Crédito" && <><label className="text-xs font-semibold text-slate-600">Bandeira {index + 1}<select aria-label={`Bandeira ${index + 1}`} className="input mt-1" value={line.cardBrand ?? "Mastercard"} onChange={event => payment(index, { cardBrand: event.target.value as PaymentItem["cardBrand"], rateOverride: undefined })}>{["Mastercard", "Visa", "Elo"].map(brand => <option key={brand}>{brand}</option>)}</select></label><label className="text-xs font-semibold text-slate-600">Parcelas {index + 1}<select aria-label={`Parcelas ${index + 1}`} className="input mt-1" value={line.installments} onChange={event => payment(index, { installments: Number(event.target.value), rateOverride: undefined })}>{Array.from({ length: 12 }, (_, i) => <option key={i} value={i + 1}>{i + 1}x</option>)}</select></label></>}
        {card && <NumberField label={`Taxa simulada (%) ${index + 1}`} value={simulationPaymentRate(line)} max={100} onChange={rateOverride => payment(index, { rateOverride })}/>}
        <Result label={`Taxa do pagamento ${index + 1}`} value={totals.payments[index].fee}/>
        <button type="button" aria-label={`Remover pagamento ${index + 1}`} onClick={() => update({ payments: draft.payments.filter(item => item.id !== line.id) })} className="rounded-lg p-2 text-red-600"><Trash2 size={17}/></button>
      </div>; })}</div>
      {(totals.remaining > 0 || totals.excess > 0) && <p role="status" className="mt-3 text-sm text-amber-800">{totals.remaining > 0 ? `Falta distribuir ${currency(totals.remaining)} entre os pagamentos.` : `Os pagamentos excedem o atendimento em ${currency(totals.excess)}.`} Os resultados abaixo usam os valores de pagamento informados.</p>}
    </section>
    <section aria-label="Resultado da simulação" className="rounded-2xl border border-amber-200 bg-avvi-soft p-4"><h3 className="mb-3 font-bold">Resultado da simulação</h3><dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><Result label="Valor dos serviços" value={totals.gross}/><Result label="Desconto" value={totals.discount}/><Result label="Total a pagar" value={totals.due}/><Result label="Pagamento informado" value={totals.received}/><Result label="Custo dos produtos" value={totals.productCost}/><Result label="Taxa de maquininha" value={totals.fees}/><Result label="Custo total (produtos + taxas)" value={totals.totalCost}/><Result label="Resultado após custos" value={totals.net}/><Result label="Valor profissional estimado" value={totals.professionalValue}/></dl><p className="mt-3 text-xs text-slate-600">A divisão segue a regra do lançamento de procedimentos. O resultado considera somente os produtos e taxas informados, sem custos fixos ou impostos adicionais.</p></section>
  </div>;
}
