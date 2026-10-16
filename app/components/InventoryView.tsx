"use client";
import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { ChevronDown, ChevronUp, History, Package, Plus, X } from "lucide-react";
import { stockProductVisible } from "@/lib/inventory";
import { SearchSelect } from "./SearchSelect";
import { ClinicalDialog } from "./ClinicalDialog";
import { procedureUsageHistory } from "@/lib/inventoryHistory";
import type { Appointment, FinancialEntry, InventoryItem, Patient, Procedure, Professional } from "@/lib/types";

export function InventoryView({ procedures, inventory, setInventory, appointments, entries, patients, professionals, canMove = true }: {
  canMove?: boolean; procedures: Procedure[]; inventory: InventoryItem[]; setInventory: Dispatch<SetStateAction<InventoryItem[]>>;
  appointments: Appointment[]; entries: FinancialEntry[]; patients: Patient[]; professionals: Professional[];
}) {
  const [search, setSearch] = useState("");
  const [adding, setAdding] = useState(false);
  const [productId, setProductId] = useState("");
  const available = procedures.filter(procedure => !stockProductVisible(procedure, inventory));
  const [history, setHistory] = useState<{ procedureId: string; page: number } | null>(null);
  const historyProcedure = procedures.find((procedure) => procedure.id === history?.procedureId);
  const usage = history ? procedureUsageHistory(history.procedureId, appointments, entries, patients, professionals) : [];
  const historyPages = Math.max(1, Math.ceil(usage.length / 8));
  const historyPage = Math.min(history?.page ?? 0, historyPages - 1);
  const rows = procedures.filter((procedure) => stockProductVisible(procedure, inventory) && procedure.name.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")))
    .slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  function update(procedureId: string, value: number, relative = false) {
    if (!canMove) return;
    setInventory((current) => {
      const existing = current.find((item) => item.procedureId === procedureId);
      const quantity = Math.trunc(relative ? (existing?.quantity ?? 0) + value : value);
      if (!Number.isFinite(quantity)) return current;
      const saved = { ...existing, id: existing?.id ?? procedureId, procedureId, quantity };
      return existing ? current.map((item) => item.procedureId === procedureId ? saved : item) : [...current, saved];
    });
  }
  function addProduct() {
    if (!canMove || !available.some(item => item.id === productId)) return;
    setInventory(current => {
      const existing = current.find(item => item.procedureId === productId);
      const saved = { ...existing, id: existing?.id ?? productId, procedureId: productId, quantity: existing?.quantity ?? 0, visibleInStock: true };
      return existing ? current.map(item => item.id === existing.id ? saved : item) : [...current, saved];
    });
    setSearch(""); setAdding(false);
  }
  return <section className="rounded-2xl border border-white/70 bg-white p-5 shadow-panel">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="flex items-center gap-2 text-lg font-bold"><Package size={20} />Estoque de produtos</h3><p className="mt-1 text-sm text-slate-500">{canMove ? "Edite a quantidade ou use as setas para adicionar e retirar unidades." : "Consulta do estoque"}</p></div>
      <input aria-label="Buscar procedimento no estoque" className="input max-w-sm" placeholder="Buscar procedimento" value={search} onChange={(event) => setSearch(event.target.value)} />
      {canMove && <button type="button" onClick={() => { setProductId(""); setAdding(true); }} className="flex items-center gap-2 rounded-lg bg-avvi-blue px-3 py-2 text-sm font-bold text-white"><Plus size={16}/>Produto</button>}
    </div>
    {canMove && adding && <ClinicalDialog title="Adicionar produto ao estoque" onClose={() => setAdding(false)} footer={<div className="flex w-full justify-end"><button type="button" disabled={!available.some(item => item.id === productId)} onClick={addProduct} className="w-full rounded-lg bg-avvi-blue px-4 py-2 text-sm font-bold text-white disabled:opacity-40 sm:w-auto">Adicionar produto</button></div>}>
      <div className="min-h-[min(26rem,55dvh)]">
        <p className="mb-2 text-sm font-semibold text-slate-600">Produto do cadastro</p>
        <SearchSelect label="Produto do cadastro de produtos" options={available} value={productId} onChange={setProductId} inlineResults/>
        {!available.length && <p className="my-3 text-sm text-slate-500">Todos os produtos cadastrados já estão no estoque.</p>}
      </div>
    </ClinicalDialog>}
    <div className="overflow-auto"><table className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-3 py-3">Procedimento</th><th className="px-3 py-3">Quantidade em estoque</th></tr></thead><tbody>
      {rows.map((procedure) => {
        const quantity = inventory.find((item) => item.procedureId === procedure.id)?.quantity ?? 0;
        return <tr key={procedure.id} className="border-b border-avvi-line last:border-0"><td className="px-3 py-4 font-semibold">{procedure.name}</td><td className="px-3 py-3"><div className="flex items-center gap-3">
          <input aria-label={`Quantidade de ${procedure.name}`} type="number" step={1} readOnly={!canMove} value={quantity} onChange={(event) => update(procedure.id, Number(event.target.value))} className={`input w-24 text-center font-bold ${quantity < 0 ? "text-red-600" : ""}`} />
          {canMove && <div className="flex flex-col gap-1"><button aria-label={`Adicionar uma unidade de ${procedure.name}`} onClick={() => update(procedure.id, 1, true)} className="rounded-md bg-avvi-soft px-3 py-1 text-avvi-blue hover:bg-amber-100"><ChevronUp size={18} /></button><button aria-label={`Retirar uma unidade de ${procedure.name}`} onClick={() => update(procedure.id, -1, true)} className="rounded-md bg-slate-100 px-3 py-1 text-slate-600 disabled:opacity-30"><ChevronDown size={18} /></button></div>}
          <button type="button" aria-label={`Histórico de ${procedure.name}`} onClick={() => setHistory({ procedureId: procedure.id, page: 0 })} className="flex items-center gap-1.5 rounded-md border border-avvi-line px-2 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"><History size={15} /><span className="hidden sm:inline">Histórico</span></button>
        </div></td></tr>;
      })}
    </tbody></table></div>
    {!rows.length && <p className="py-6 text-center text-sm text-slate-500">Nenhum procedimento encontrado.</p>}
    {history && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-3">
      <section role="dialog" aria-modal="true" aria-label={`Histórico de ${historyProcedure?.name ?? "procedimento"}`} className="flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-panel">
        <header className="flex items-start justify-between gap-3 border-b border-avvi-line p-4"><div><h3 className="font-bold">Histórico · {historyProcedure?.name}</h3><p className="mt-1 text-xs text-slate-500">{usage.length} utilização(ões) · {usage.reduce((sum, row) => sum + row.quantity, 0)} unidade(s) registrada(s)</p></div><button type="button" aria-label="Fechar histórico" onClick={() => setHistory(null)} className="rounded p-1 text-slate-500 hover:bg-slate-100"><X size={20} /></button></header>
        <div className="min-h-0 overflow-y-auto p-4">
          <div className="hidden grid-cols-[120px_1fr_90px_1fr] gap-3 border-b border-avvi-line pb-2 text-xs font-semibold text-slate-500 sm:grid"><span>Data</span><span>Profissional</span><span>Quantidade</span><span>Paciente</span></div>
          {usage.slice(historyPage * 8, (historyPage + 1) * 8).map((row) => <div key={row.id} data-testid={`procedure-usage-${row.id}`} className="grid grid-cols-2 gap-3 border-b border-avvi-line py-3 text-sm sm:grid-cols-[120px_1fr_90px_1fr]">
            <div><span className="mb-1 block text-[10px] text-slate-500 sm:hidden">Data</span>{row.date.slice(0, 10).split("-").reverse().join("/")}</div>
            <div className="min-w-0 break-words"><span className="mb-1 block text-[10px] text-slate-500 sm:hidden">Profissional</span>{row.professional}</div>
            <div><span className="mb-1 block text-[10px] text-slate-500 sm:hidden">Quantidade</span><strong>{row.quantity}</strong></div>
            <div className="min-w-0 break-words"><span className="mb-1 block text-[10px] text-slate-500 sm:hidden">Paciente</span>{row.patient}</div>
          </div>)}
          {!usage.length && <p className="py-8 text-center text-sm text-slate-500">Nenhuma utilização registrada para este procedimento.</p>}
        </div>
        <footer className="flex items-center justify-between border-t border-avvi-line p-3 text-xs"><span>Página {historyPage + 1} de {historyPages}</span><div className="flex gap-2"><button type="button" disabled={historyPage === 0} onClick={() => setHistory({ ...history, page: historyPage - 1 })} className="rounded border border-avvi-line px-3 py-2 disabled:opacity-30">Anterior</button><button type="button" disabled={historyPage === historyPages - 1} onClick={() => setHistory({ ...history, page: historyPage + 1 })} className="rounded border border-avvi-line px-3 py-2 disabled:opacity-30">Próxima</button></div></footer>
      </section>
    </div>}
  </section>;
}
