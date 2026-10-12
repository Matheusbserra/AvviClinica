"use client";
import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Package, Pencil, Plus, Trash2 } from "lucide-react";
import { ClinicalDialog } from "./ClinicalDialog";
import { SearchSelect } from "./SearchSelect";
import { currency } from "@/lib/calculations";
import { serviceKey } from "@/lib/services";
import { packageItemsTotal, validServicePackage } from "@/lib/servicePackages";
import type { ServicePackage } from "@/lib/servicePackages";
import type { Service } from "@/lib/types";

const empty = (): ServicePackage => ({ id: "", name: "", description: "", items: [], salePrice: 0, validityEnabled: false, validityMonths: 0, commissionPercent: 0, active: true });
export function PackagesView({ services, records, setRecords }: { services: Service[]; records: ServicePackage[]; setRecords: Dispatch<SetStateAction<ServicePackage[]>> }) {
  const [form, setForm] = useState<ServicePackage | null>(null);
  const [query, setQuery] = useState("");
  const [serviceId, setServiceId] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState(0);
  const [error, setError] = useState("");
  const sorted = records.filter(record => serviceKey(`${record.name} ${record.description}`).includes(serviceKey(query))).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  function open(record = empty()) { setForm({ ...record, items: record.items.map(item => ({ ...item })) }); setServiceId(""); setQuantity(1); setUnitPrice(0); setError(""); }
  function addItem() {
    const service = services.find(item => item.id === serviceId && item.active);
    if (!form || !service || !Number.isSafeInteger(quantity) || quantity < 1 || quantity > 10000 || !Number.isFinite(unitPrice) || unitPrice < 0) { setError("Selecione um serviço e confira a quantidade e o valor unitário."); return; }
    if (form.items.some(item => item.serviceId === serviceId)) { setError("Este serviço já está no pacote. Ajuste a quantidade na linha abaixo."); return; }
    const next = [...form.items, { id: crypto.randomUUID(), serviceId, name: service.name, quantity, unitPrice: Math.round(unitPrice * 100) / 100 }];
    const previousTotal = packageItemsTotal(form.items);
    setForm({ ...form, items: next, salePrice: form.salePrice === previousTotal ? packageItemsTotal(next) : form.salePrice });
    setServiceId(""); setQuantity(1); setUnitPrice(0); setError("");
  }
  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!form) return;
    if (serviceId) { setError("Clique em Adicionar para incluir o serviço selecionado antes de salvar."); return; }
    const saved = { ...form, id: form.id || `package-${crypto.randomUUID()}`, name: form.name.trim(), description: form.description.trim(), salePrice: Math.round(form.salePrice * 100) / 100, items: form.items.map(item => ({ ...item, unitPrice: Math.round(item.unitPrice * 100) / 100 })) };
    if (!validServicePackage(saved)) { setError("Informe o nome, adicione os serviços e confira quantidades, valores, validade e comissão."); return; }
    if (records.some(item => item.id !== saved.id && serviceKey(item.name) === serviceKey(saved.name))) { setError("Já existe um pacote com este nome."); return; }
    setRecords(current => form.id ? current.map(item => item.id === form.id ? saved : item) : [saved, ...current]); setForm(null);
  }
  return <>
    <section className="rounded-2xl bg-white p-5 shadow-panel">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h3 className="text-lg font-bold">Pacotes cadastrados <span className="text-xs font-normal text-slate-500">{records.length}</span></h3><button type="button" onClick={() => open()} className="flex items-center gap-2 rounded-md bg-avvi-blue px-4 py-2 text-sm font-bold text-white"><Plus size={16}/>Pacotes</button></div>
      <input aria-label="Buscar pacotes" className="input mb-4 max-w-sm" placeholder="Buscar nome ou descrição" value={query} onChange={event => setQuery(event.target.value)}/>
      <div className="space-y-3">{sorted.map(record => <article key={record.id} aria-label={`Pacote ${record.name}`} className="rounded-xl border border-avvi-line p-4"><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex gap-3"><span className="rounded-lg bg-avvi-soft p-2 text-avvi-blue"><Package size={22}/></span><div><h4 className="font-bold">{record.name}</h4>{record.description && <p className="mt-1 text-sm text-slate-500">{record.description}</p>}<p className="mt-2 text-xs text-slate-600">{record.items.map(item => `${item.quantity}× ${item.name}`).join(" · ")}</p></div></div><div className="text-right"><strong className="text-lg text-avvi-blue">{currency(record.salePrice)}</strong><p className="text-xs text-slate-500">Itens: {currency(packageItemsTotal(record.items))}</p></div></div><div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-avvi-line pt-3"><div className="flex flex-wrap gap-3 text-xs text-slate-500"><span>{record.active ? "Ativo" : "Inativo"}</span><span>{record.validityEnabled ? `Validade: ${record.validityMonths} meses` : "Sem validade"}</span><span>Comissão: {record.commissionPercent}%</span></div><div className="flex gap-2"><button type="button" aria-label={`Editar pacote ${record.name}`} onClick={() => open(record)} className="rounded-md border border-avvi-line p-2 text-avvi-blue"><Pencil size={16}/></button><button type="button" onClick={() => setRecords(current => current.map(item => item.id === record.id ? { ...item, active: !item.active } : item))} className="rounded-md bg-avvi-soft px-3 py-2 text-xs font-bold text-avvi-blue">{record.active ? "Desativar" : "Ativar"}</button></div></div></article>)}</div>
      {!sorted.length && <p className="py-6 text-center text-sm text-slate-500">Nenhum pacote encontrado.</p>}
    </section>
    {form && <ClinicalDialog title={form.id ? "Editar pacote" : "Novo pacote"} onClose={() => setForm(null)}><form onSubmit={save}>
      <div className="grid gap-4 sm:grid-cols-2"><label className="text-sm font-semibold">Nome<input aria-label="Nome do pacote" required maxLength={200} className="input mt-1" value={form.name} onChange={event => setForm({ ...form, name: event.target.value })}/></label><label className="text-sm font-semibold">Descrição<input aria-label="Descrição do pacote" maxLength={5000} className="input mt-1" value={form.description} onChange={event => setForm({ ...form, description: event.target.value })}/></label></div>
      <div className="mt-5 grid items-end gap-3 rounded-lg border border-avvi-line bg-slate-50 p-3 sm:grid-cols-[100px_minmax(0,1fr)_80px_130px]"><label className="text-xs font-semibold">Tipo do item<select aria-label="Tipo do item do pacote" className="input mt-1" value="service" onChange={() => {}}><option value="service">Serviço</option></select></label><label className="min-w-0 text-xs font-semibold">Item do pacote<SearchSelect key={`${form.id}-${form.items.length}`} label="Item do pacote" options={services.filter(item => item.active)} value={serviceId} onChange={value => { setServiceId(value); setUnitPrice(services.find(item => item.id === value)?.price ?? 0); }}/></label><label className="text-xs font-semibold">Quant.<input aria-label="Quantidade do item do pacote" className="input mt-1" type="number" min={1} max={10000} step={1} value={quantity} onChange={event => setQuantity(Number(event.target.value))}/></label><PackageMoney label="Valor unitário do item" value={unitPrice} onChange={setUnitPrice}/><button type="button" onClick={addItem} className="justify-self-end rounded-md bg-avvi-blue px-4 py-2 text-sm font-bold text-white sm:col-span-4">Adicionar</button></div>
      <div className="mt-3 space-y-2">{form.items.map(item => <div key={item.id} className="grid items-center gap-2 rounded-lg border border-avvi-line p-3 sm:grid-cols-[minmax(0,1fr)_80px_130px_auto]"><span className="text-sm font-semibold">{item.name}</span><input aria-label={`Quantidade de ${item.name} no pacote`} className="input" type="number" min={1} max={10000} step={1} required value={item.quantity} onChange={event => setForm({ ...form, items: form.items.map(line => line.id === item.id ? { ...line, quantity: Number(event.target.value) } : line) })}/><PackageMoney label={`Valor unitário de ${item.name} no pacote`} caption="Valor unitário" value={item.unitPrice} onChange={value => setForm({ ...form, items: form.items.map(line => line.id === item.id ? { ...line, unitPrice: value } : line) })}/><button type="button" aria-label={`Remover ${item.name} do pacote`} onClick={() => setForm({ ...form, items: form.items.filter(line => line.id !== item.id) })} className="justify-self-end p-2 text-red-500"><Trash2 size={16}/></button></div>)}</div>
      <p className="my-4 text-sm font-bold" data-testid="package-items-total">Total em itens: {currency(packageItemsTotal(form.items))}</p>
      <div className="grid items-start gap-4 sm:grid-cols-3"><PackageMoney label="Valor de venda do pacote" value={form.salePrice} onChange={value => setForm({ ...form, salePrice: value })}/><div><label className="text-xs font-semibold">Válido por (em meses)<input aria-label="Validade do pacote em meses" type="number" min={1} max={1200} step={1} required={form.validityEnabled} disabled={!form.validityEnabled} className="input mt-1 disabled:bg-slate-100" value={form.validityMonths || ""} onChange={event => setForm({ ...form, validityMonths: Number(event.target.value) })}/></label><label className="mt-2 flex items-center gap-2 text-xs"><input aria-label="Ativar validade do pacote" type="checkbox" checked={form.validityEnabled} onChange={event => setForm({ ...form, validityEnabled: event.target.checked })} className="accent-avvi-blue"/>Ativar validade</label></div><label className="text-xs font-semibold">% de comissão sobre venda<input aria-label="Comissão sobre venda do pacote" type="number" min={0} max={100} step="0.01" required className="input mt-1" value={form.commissionPercent} onChange={event => setForm({ ...form, commissionPercent: Number(event.target.value) })}/></label></div>
      {error && <p role="alert" className="mt-4 text-sm font-semibold text-red-600">{error}</p>}<div className="mt-5 flex justify-end gap-3 border-t border-avvi-line pt-4"><button type="button" onClick={() => setForm(null)} className="rounded-md border border-avvi-line px-4 py-2 text-sm font-bold">Cancelar</button><button type="submit" className="rounded-md bg-avvi-blue px-5 py-2 text-sm font-bold text-white">Salvar pacote</button></div>
    </form></ClinicalDialog>}
  </>;
}
function PackageMoney({ label, caption, value, onChange }: { label: string; caption?: string; value: number; onChange: (value: number) => void }) {
  return <label className="text-xs font-semibold">{caption ?? label}<div className="relative mt-1"><span className="pointer-events-none absolute left-3 top-3 text-xs text-slate-500">R$</span><input aria-label={label} className="input pl-9" type="number" min={0} max={1e9} step="0.01" required value={value} onChange={event => onChange(Number(event.target.value))}/></div></label>;
}
