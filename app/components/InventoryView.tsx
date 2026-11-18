"use client";
import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { History, Minus, Package, Plus, X } from "lucide-react";
import { stockProductVisible } from "@/lib/inventory";
import { SearchSelect } from "./SearchSelect";
import { ClinicalDialog } from "./ClinicalDialog";
import { currentStockDate, stockUsageHistory, stockUsageInPeriod } from "@/lib/inventoryHistory";
import type { Appointment, FinancialEntry, InventoryItem, Patient, Procedure, Professional, StockMovementRequest } from "@/lib/types";

const movementDate = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });

export function InventoryView({ procedures, inventory, setInventory, moveStock, appointments, entries, patients, professionals, canMove = true }: {
  canMove?: boolean; procedures: Procedure[]; inventory: InventoryItem[]; setInventory: Dispatch<SetStateAction<InventoryItem[]>>;
  moveStock: (movement: StockMovementRequest) => Promise<void>;
  appointments: Appointment[]; entries: FinancialEntry[]; patients: Patient[]; professionals: Professional[];
}) {
  const [search, setSearch] = useState("");
  const [period, setPeriod] = useState(() => {
    const today = currentStockDate();
    return { start: today, end: today };
  });
  const [usagePage, setUsagePage] = useState(0);
  const allUsage = useMemo(() => stockUsageHistory(appointments, entries, patients, professionals), [appointments, entries, patients, professionals]);
  const productNames = useMemo(() => new Map(procedures.map(product => [product.id, product])), [procedures]);
  const periodUsage = useMemo(() => stockUsageInPeriod(allUsage, period.start, period.end), [allUsage, period.start, period.end]);
  const periodError = !period.start || !period.end ? "Informe a data inicial e a data final."
    : period.start > period.end ? "A data final deve ser igual ou posterior à data inicial." : "";
  const usagePages = Math.max(1, Math.ceil(periodUsage.length / 20));
  const currentUsagePage = Math.min(usagePage, usagePages - 1);
  const [adding, setAdding] = useState(false);
  const [removingProduct, setRemovingProduct] = useState(false);
  const [movement, setMovement] = useState<{ procedure: Procedure; kind: StockMovementRequest["kind"]; id: string; quantity: string } | null>(null);
  const [savingMovement, setSavingMovement] = useState(false);
  const [movementError, setMovementError] = useState("");
  const [productId, setProductId] = useState("");
  const available = procedures.filter(procedure => !procedure.comboItems && !stockProductVisible(procedure, inventory));
  const [history, setHistory] = useState<{ procedureId: string; page: number } | null>(null);
  const historyProcedure = procedures.find((procedure) => procedure.id === history?.procedureId);
  const usage = history ? allUsage.filter(row => row.procedureId === history.procedureId) : [];
  const movements = history ? inventory.find(item => item.procedureId === history.procedureId)?.movements ?? [] : [];
  const historyRows = [...usage.map(row => ({ ...row, key: "use-" + row.id, dateLabel: row.date.slice(0, 10).split("-").reverse().join("/") })),
    ...movements.map(row => ({ id: row.id, key: "movement-" + row.id, date: row.at, dateLabel: movementDate.format(new Date(row.at)), professional: row.by,
      quantity: row.quantity, patient: row.kind === "addition" ? "Adição ao estoque" : "Remoção do estoque" }))].sort((a, b) => b.date.localeCompare(a.date));
  const historyPages = Math.max(1, Math.ceil(historyRows.length / 8));
  const historyPage = Math.min(history?.page ?? 0, historyPages - 1);
  const listedProducts = procedures.filter(procedure => stockProductVisible(procedure, inventory)).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const rows = listedProducts.filter(procedure => procedure.name.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")));
  function setProductVisibility(procedureId: string, visibleInStock: boolean) {
    setInventory(current => {
      const existing = current.find(item => item.procedureId === procedureId);
      const saved = { ...existing, id: existing?.id ?? procedureId, procedureId, quantity: existing?.quantity ?? 0, visibleInStock };
      return existing ? current.map(item => item.id === existing.id ? saved : item) : [...current, saved];
    });
  }
  function addProduct() {
    if (!canMove || !available.some(item => item.id === productId)) return;
    setProductVisibility(productId, true);
    setSearch(""); setAdding(false);
  }
  function openMovement(procedure: Procedure, kind: StockMovementRequest["kind"]) {
    setMovementError("");
    setMovement({ procedure, kind, id: crypto.randomUUID(), quantity: "" });
  }
  async function confirmMovement() {
    if (!movement || savingMovement) return;
    const quantity = Number(movement.quantity);
    if (!Number.isSafeInteger(quantity) || quantity < 1) {
      setMovementError("Informe uma quantidade inteira e positiva.");
      return;
    }
    setSavingMovement(true); setMovementError("");
    try {
      await moveStock({ id: movement.id, procedureId: movement.procedure.id, kind: movement.kind, quantity });
      setMovement(null);
    } catch (error) {
      setMovementError(error instanceof Error ? error.message : "Não foi possível registrar a movimentação.");
    } finally { setSavingMovement(false); }
  }
  const movementLabel = movement?.kind === "removal" ? "Remover do estoque" : "Adicionar ao estoque";
  return <div className="min-w-0 space-y-4">
    <section aria-label="Produtos utilizados por período" className="min-w-0 rounded-2xl border border-white/70 bg-white p-4 shadow-panel sm:p-5">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div><h3 className="text-lg font-bold">Produtos utilizados</h3><p className="mt-1 text-xs text-slate-500">Pela data do atendimento ou do lançamento.</p></div>
        <div className="grid w-full min-w-0 grid-cols-2 items-end gap-2 sm:flex sm:w-auto sm:flex-wrap">
          <label className="min-w-0 text-xs font-semibold text-slate-600">Data inicial
            <input type="date" className="input mt-1 block min-w-0" value={period.start} onChange={event => { setPeriod(current => ({ ...current, start: event.target.value })); setUsagePage(0); }}/>
          </label>
          <label className="min-w-0 text-xs font-semibold text-slate-600">Data final
            <input type="date" className="input mt-1 block min-w-0" value={period.end} onChange={event => { setPeriod(current => ({ ...current, end: event.target.value })); setUsagePage(0); }}/>
          </label>
          <button type="button" onClick={() => { const today = currentStockDate(); setPeriod({ start: today, end: today }); setUsagePage(0); }} className="rounded-lg border border-avvi-line px-3 py-2 text-sm font-semibold text-avvi-blue">Hoje</button>
        </div>
      </header>
      {periodError ? <p role="alert" className="text-sm text-red-700">{periodError}</p> : periodUsage.length ? <>
        <p className="mb-3 text-xs text-slate-600">{periodUsage.reduce((sum, row) => sum + row.quantity, 0)} unidades utilizadas · {new Set(periodUsage.map(row => row.procedureId)).size} produtos</p>
        <div className="overflow-x-auto">
          <table aria-label="Produtos utilizados no período" className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs uppercase text-slate-500"><tr>{["Data", "Produto", "Profissional", "Paciente", "Quantidade"].map(label => <th key={label} scope="col" className="px-3 py-3">{label}</th>)}</tr></thead>
            <tbody>{periodUsage.slice(currentUsagePage * 20, (currentUsagePage + 1) * 20).map(row => {
              const product = productNames.get(row.procedureId);
              return <tr key={JSON.stringify([row.id, row.procedureId])} className="border-b border-avvi-line last:border-0">
                <td className="whitespace-nowrap px-3 py-3">{row.date.slice(0, 10).split("-").reverse().join("/")}</td>
                <td className="px-3 py-3"><span className="font-semibold">{product?.name ?? "Produto removido do cadastro"}</span>{product?.category && <span className="mt-1 block text-xs text-slate-500">{product.category}</span>}</td>
                <td className="px-3 py-3">{row.professional}</td><td className="px-3 py-3">{row.patient}</td><td className="px-3 py-3 font-bold">{row.quantity}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        {usagePages > 1 && <nav aria-label="Paginação dos produtos utilizados" className="mt-3 flex items-center justify-between gap-2 text-xs">
          <span>Página {currentUsagePage + 1} de {usagePages}</span><div className="flex gap-2">
            <button type="button" disabled={currentUsagePage === 0} onClick={() => setUsagePage(currentUsagePage - 1)} className="rounded border border-avvi-line px-3 py-2 disabled:opacity-40">Anterior</button>
            <button type="button" disabled={currentUsagePage === usagePages - 1} onClick={() => setUsagePage(currentUsagePage + 1)} className="rounded border border-avvi-line px-3 py-2 disabled:opacity-40">Próxima</button>
          </div>
        </nav>}
      </> : <p className="py-4 text-sm text-slate-500">Nenhum produto utilizado no período selecionado.</p>}
    </section>
    <section className="rounded-2xl border border-white/70 bg-white p-5 shadow-panel">
    <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
      <div><h3 className="flex items-center gap-2 text-lg font-bold"><Package size={20} />Estoque de produtos</h3></div>
      <input aria-label="Buscar procedimento no estoque" className="input max-w-sm" placeholder="Buscar procedimento" value={search} onChange={(event) => setSearch(event.target.value)} />
      {canMove && <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => { setProductId(""); setAdding(true); }} className="flex items-center gap-2 rounded-lg bg-avvi-blue px-3 py-2 text-sm font-bold text-white"><Plus size={16}/>Produto</button>
        <button type="button" aria-label="Retirar produto da lista do estoque" onClick={() => setRemovingProduct(true)} className="flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-bold text-red-700"><Minus size={16}/>Produto</button>
      </div>}
    </div>
    {canMove && adding && <ClinicalDialog title="Adicionar produto ao estoque" onClose={() => setAdding(false)} footer={<div className="flex w-full justify-end"><button type="button" disabled={!available.some(item => item.id === productId)} onClick={addProduct} className="w-full rounded-lg bg-avvi-blue px-4 py-2 text-sm font-bold text-white disabled:opacity-40 sm:w-auto">Adicionar produto</button></div>}>
      <div className="min-h-[min(26rem,55dvh)]">
        <p className="mb-2 text-sm font-semibold text-slate-600">Produto do cadastro</p>
        <SearchSelect label="Produto do cadastro de produtos" options={available} value={productId} onChange={setProductId} inlineResults/>
        {!available.length && <p className="my-3 text-sm text-slate-500">Todos os produtos cadastrados já estão no estoque.</p>}
      </div>
    </ClinicalDialog>}
    {canMove && removingProduct && <ClinicalDialog title="Retirar produtos da lista do estoque" onClose={() => setRemovingProduct(false)}>
      <p className="mb-3 text-sm text-slate-600">O saldo e o histórico ficam disponíveis ao adicionar o produto de novo.</p>
      <ul className="divide-y divide-avvi-line">{listedProducts.map(procedure => <li key={procedure.id} className="flex items-center justify-between gap-3 py-2 text-sm">
        <span>{procedure.name}</span>
        <button type="button" aria-label={`Retirar ${procedure.name} da lista do estoque`} onClick={() => setProductVisibility(procedure.id, false)} className="rounded border border-red-200 p-2 text-red-700 hover:bg-red-50"><Minus size={17}/></button>
      </li>)}</ul>
      {!listedProducts.length && <p className="py-3 text-sm text-slate-500">Nenhum produto na lista do estoque.</p>}
    </ClinicalDialog>}
    {canMove && movement && <ClinicalDialog title={movementLabel} onClose={() => { if (!savingMovement) setMovement(null); }}>
      <form noValidate onSubmit={event => { event.preventDefault(); void confirmMovement(); }} className="mx-auto max-w-md space-y-4">
        <p className="font-semibold">{movement.procedure.name}</p>
        <p className="text-sm text-slate-600">Saldo em estoque <strong>{inventory.find(item => item.procedureId === movement.procedure.id)?.quantity ?? 0}</strong></p>
        <label className="block text-sm font-semibold">Quantidade
          <input type="number" min={1} step={1} disabled={savingMovement} className="input mt-1" value={movement.quantity} onChange={event => { setMovement({ ...movement, id: crypto.randomUUID(), quantity: event.target.value }); setMovementError(""); }} />
        </label>
        {movementError && <p role="alert" className="text-sm text-red-700">{movementError}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" disabled={savingMovement} onClick={() => setMovement(null)} className="rounded border border-avvi-line px-3 py-2 text-sm">Cancelar</button>
          <button type="submit" disabled={savingMovement} className="rounded bg-avvi-blue px-3 py-2 text-sm font-bold text-white disabled:opacity-40">{savingMovement ? "Salvando…" : movementLabel}</button>
        </div>
      </form>
    </ClinicalDialog>}
    <div className="overflow-auto"><table aria-label="Saldos do estoque" className="w-full text-sm"><thead className="bg-slate-50 text-left text-xs uppercase text-slate-500"><tr><th className="px-3 py-3">Procedimento</th><th className="px-3 py-3">Quantidade em estoque</th></tr></thead><tbody>
      {rows.map((procedure) => {
        const quantity = inventory.find((item) => item.procedureId === procedure.id)?.quantity ?? 0;
        return <tr key={procedure.id} className="border-b border-avvi-line last:border-0"><td className="px-3 py-4 font-semibold">{procedure.name}</td><td className="px-3 py-3"><div className="flex flex-wrap items-center gap-2">
          <input aria-label={`Quantidade de ${procedure.name}`} readOnly value={quantity} className={`input w-24 cursor-default bg-slate-50 text-center font-bold ${quantity < 0 ? "text-red-600" : ""}`} />
          <button type="button" aria-label={`Histórico de ${procedure.name}`} onClick={() => setHistory({ procedureId: procedure.id, page: 0 })} className="flex items-center gap-1.5 rounded-md border border-avvi-line px-2 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"><History size={15} /><span className="hidden sm:inline">Histórico</span></button>
          {canMove && <div className="flex flex-wrap gap-1">
            <button type="button" aria-label={`Adicionar ao estoque de ${procedure.name}`} onClick={() => openMovement(procedure, "addition")} className="flex items-center gap-1 rounded-md border border-avvi-line px-2 py-2 text-xs font-semibold text-avvi-blue"><Plus size={16}/><span className="hidden sm:inline">Adicionar</span></button>
            <button type="button" aria-label={`Remover do estoque de ${procedure.name}`} disabled={quantity <= 0} onClick={() => openMovement(procedure, "removal")} className="flex items-center gap-1 rounded-md border border-red-200 px-2 py-2 text-xs font-semibold text-red-700 disabled:opacity-40"><Minus size={16}/><span className="hidden sm:inline">Remover</span></button>
          </div>}
        </div></td></tr>;
      })}
    </tbody></table></div>
    {!rows.length && <p className="py-6 text-center text-sm text-slate-500">Nenhum procedimento encontrado.</p>}
    {history && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-3">
      <section role="dialog" aria-modal="true" aria-label={`Histórico de ${historyProcedure?.name ?? "procedimento"}`} className="flex max-h-[90dvh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-panel">
        <header className="flex items-start justify-between gap-3 border-b border-avvi-line p-4"><div><h3 className="font-bold">Histórico · {historyProcedure?.name}</h3><p className="mt-1 text-xs text-slate-500">{usage.length} utilizações em atendimentos · {movements.length} movimentações manuais</p></div><button type="button" aria-label="Fechar histórico" onClick={() => setHistory(null)} className="rounded p-1 text-slate-500 hover:bg-slate-100"><X size={20} /></button></header>
        <div className="min-h-0 overflow-y-auto p-4">
          <div className="hidden grid-cols-[120px_1fr_90px_1fr] gap-3 border-b border-avvi-line pb-2 text-xs font-semibold text-slate-500 sm:grid"><span>Data</span><span>Profissional / Perfil</span><span>Quantidade</span><span>Paciente / Movimentação</span></div>
          {historyRows.slice(historyPage * 8, (historyPage + 1) * 8).map((row) => <div key={row.key} data-testid={row.key.startsWith("use-") ? `procedure-usage-${row.id}` : `stock-${row.key}`} className="grid grid-cols-2 gap-3 border-b border-avvi-line py-3 text-sm sm:grid-cols-[120px_1fr_90px_1fr]">
            <div><span className="mb-1 block text-[10px] text-slate-500 sm:hidden">Data</span><span>{row.dateLabel}</span></div>
            <div className="min-w-0 break-words"><span className="mb-1 block text-[10px] text-slate-500 sm:hidden">Profissional / Perfil</span><span>{row.professional}</span></div>
            <div><span className="mb-1 block text-[10px] text-slate-500 sm:hidden">Quantidade</span><strong>{row.quantity}</strong></div>
            <div className="min-w-0 break-words"><span className="mb-1 block text-[10px] text-slate-500 sm:hidden">Paciente / Movimentação</span><span>{row.patient}</span></div>
          </div>)}
          {!historyRows.length && <p className="py-8 text-center text-sm text-slate-500">Nenhuma movimentação registrada para este produto.</p>}
        </div>
        <footer className="flex items-center justify-between border-t border-avvi-line p-3 text-xs"><span>Página {historyPage + 1} de {historyPages}</span><div className="flex gap-2"><button type="button" disabled={historyPage === 0} onClick={() => setHistory({ ...history, page: historyPage - 1 })} className="rounded border border-avvi-line px-3 py-2 disabled:opacity-30">Anterior</button><button type="button" disabled={historyPage === historyPages - 1} onClick={() => setHistory({ ...history, page: historyPage + 1 })} className="rounded border border-avvi-line px-3 py-2 disabled:opacity-30">Próxima</button></div></footer>
      </section>
    </div>}
    </section>
  </div>;
}
