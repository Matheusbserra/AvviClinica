"use client";
import { useState } from "react";
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2, UserRound, X } from "lucide-react";
import { SearchSelect } from "./SearchSelect";
import { packageCheckoutLines } from "@/lib/servicePackages";
import type { ServicePackage } from "@/lib/servicePackages";
import { availableUltraformerTips, validCheckoutShots } from "@/lib/ultraformer";
import { currency } from "@/lib/calculations";
import { checkoutTotals, checkoutCommission, settleCheckoutPayments, checkoutAllowsNoProducts, moneyRound, paymentChoiceKey, paymentChoices, toggleCheckoutPayment } from "@/lib/checkout";
import type { Appointment, DiscountSplit, Patient, PaymentItem, Procedure, ProcedureLine, Professional, ProductUsage, Service, GiftStockItem, GiftUsage, UltraformerShots, UltraformerTip } from "@/lib/types";

export type CheckoutDraft = {
  appointment: Appointment; client: Patient; professional?: Professional;
  lines: ProcedureLine[]; products: ProductUsage[]; gifts?: GiftUsage[]; ultraformerShots?: UltraformerShots[]; payments: PaymentItem[]; entryId?: string;
  discountSplit: DiscountSplit; notes: string; checkoutNotes?: string; previousFutureCredit: number; previousCreditAdded?: number; storedCreditPayments?: PaymentItem[]; clinicPatient?: boolean;
};
export type CheckoutResult = { client: Patient; lines: ProcedureLine[]; products: ProductUsage[]; gifts: GiftUsage[]; ultraformerShots: UltraformerShots[]; payments: PaymentItem[]; total: number; discount: number; balanceDue: number; change: number; creditAdded: number; creditPayments: PaymentItem[]; clinicPatient: boolean; checkoutNotes: string };

export function AccountCheckout({ draft, gifts, procedures, services, packages = [], ultraformerTips, appointments, onCancel, onConfirm, onDelete }: {
  draft: CheckoutDraft; ultraformerTips: UltraformerTip[]; gifts: GiftStockItem[]; procedures: Procedure[]; services: Service[]; packages?: ServicePackage[]; appointments: Appointment[];
  onDelete?: () => void; onCancel: () => void; onConfirm: (result: CheckoutResult) => void;
}) {
  const [client, setClient] = useState({ ...draft.client });
  const [checkoutNotes, setCheckoutNotes] = useState(draft.checkoutNotes ?? "");
  const [lines, setLines] = useState(() => draft.lines.map((line) => ({ ...line })));
  const [expandedDiscount, setExpandedDiscount] = useState<string | null>(null);
  const [percentages, setPercentages] = useState<Record<string, number>>({});
  const [products, setProducts] = useState(() => draft.products.map((product) => ({ ...product })));
  const [selectedGifts, setSelectedGifts] = useState(() => (draft.gifts ?? []).map((gift) => ({ ...gift })));
  const [selectedShots, setSelectedShots] = useState(() => (draft.ultraformerShots ?? []).map(shot => ({ ...shot })));
  const [tipId, setTipId] = useState(""); const [shotQuantity, setShotQuantity] = useState(1);
  const tips = availableUltraformerTips(ultraformerTips);
  const [giftId, setGiftId] = useState(""); const [giftQuantity, setGiftQuantity] = useState(1);
  const [payments, setPayments] = useState(() => [...draft.payments,...(draft.storedCreditPayments??[])].map((payment) => ({ ...payment })));
  const [editingClient, setEditingClient] = useState(false);
  const [adding, setAdding] = useState<"service" | "product" | "gift" | "package" | "ultraformer" | null>(null);
  const [packageId, setPackageId] = useState("");
  const [packageQuantity, setPackageQuantity] = useState(1);
  const [serviceId, setServiceId] = useState("");
  const [serviceQuantity, setServiceQuantity] = useState(1);
  const [procedureId, setProcedureId] = useState("");
  const [procedureQuantity, setProcedureQuantity] = useState(1);
  const [keepCredit, setKeepCredit] = useState((draft.previousCreditAdded??0)>0);
  const [leaveDebt, setLeaveDebt] = useState(() => !!draft.entryId && checkoutTotals(draft.lines, draft.payments).remaining > 0);
  const [clinicPatient, setClinicPatient] = useState(draft.clinicPatient ?? false);
  const availableCredit = moneyRound(Math.max(0,(Number(client.futureCredit)||0)+draft.previousFutureCredit-(draft.previousCreditAdded??0)));
  const [error, setError] = useState("");
  const [closedGroups, setClosedGroups] = useState<string[]>(() => [
    ...(!draft.payments.some((payment) => payment.method === "Transferência Bancária") ? ["Transação bancária"] : []),
    ...(!draft.payments.some((payment) => payment.method === "Dinheiro" || payment.method === "Depósito") ? ["À vista"] : []),
    ...(!draft.payments.some((payment) => payment.method === "Crédito Futuro") ? ["Pré-pago"] : [])
  ]);
  const totals = checkoutTotals(lines, payments);
  const allowsNoProducts = checkoutAllowsNoProducts(lines, services);
  const visits = appointments.filter((appointment) => appointment.patientId === client.id && appointment.status === "Finalizado");
  const lastVisit = visits.map((appointment) => appointment.startsAt.slice(0, 10)).sort().at(-1);
  const displayDate = (date?: string) => date ? date.slice(0, 10).split("-").reverse().join("/") : "-";
  const groups = [
    { name: "PIX", choices: paymentChoices.filter((choice) => choice.method === "Pix") },
    { name: "Crédito", choices: paymentChoices.filter((choice) => choice.method === "Crédito") },
    { name: "Débito", choices: paymentChoices.filter((choice) => choice.method === "Débito") },
    { name: "Transação bancária", choices: paymentChoices.filter((choice) => choice.method === "Transferência Bancária") },
    { name: "À vista", choices: paymentChoices.filter((choice) => choice.method === "Dinheiro" || choice.method === "Depósito") },
    { name: "Pré-pago", choices: paymentChoices.filter((choice) => choice.method === "Crédito Futuro") }
  ];
  function updateLine(index: number, patch: Partial<ProcedureLine>) {
    const target = lines[index];
    if (patch.discount !== undefined && target) setPercentages(current => { const next = { ...current }; delete next[target.id]; return next; });
    setLines((current) => current.map((line, row) => {
      if (row !== index) return line;
      const next = { ...line, ...patch };
      if (patch.discount === undefined && percentages[line.id] !== undefined) next.discount = moneyRound(next.quantity * next.servicePrice * percentages[line.id] / 100);
      return next;
    }));
  }
  function applyPercentage(index: number, value: number) {
    const percent = Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
    const line = lines[index];
    setPercentages(current => ({ ...current, [line.id]: percent }));
    setLines(current => current.map((item, row) => row === index ? { ...item, discount: moneyRound(item.quantity * item.servicePrice * percent / 100) } : item));
  }
  function addService() {
    const service = services.find((item) => item.id === serviceId && item.active);
    if (!service || !Number.isInteger(serviceQuantity) || serviceQuantity <= 0) return;
    setLines((current) => {
      const existing = current.find((line) => line.serviceId === service.id && !line.packageId);
      return existing ? current.map((line) => line.id === existing.id ? { ...line, quantity: line.quantity + serviceQuantity, discount: percentages[line.id] !== undefined ? moneyRound((line.quantity + serviceQuantity) * line.servicePrice * percentages[line.id] / 100) : line.discount } : line)
        : [...current, { id: `line-${crypto.randomUUID()}`, serviceId: service.id, manualProcedure: service.name, quantity: serviceQuantity,
          servicePrice: service.price, productCost: 0, professionalPercent: draft.professional?.commissionPercent ?? 70, discount: 0 }];
    });
    setServiceId(""); setServiceQuantity(1); setAdding(null);
  }
  function addPackage() {
    const pack = packages.find(item => item.id === packageId && item.active);
    if (!pack) return;
    try { const added = packageCheckoutLines(pack, packageQuantity); setLines(current => [...current, ...added]); setPackageId(""); setPackageQuantity(1); setAdding(null); setError(""); }
    catch (error) { setError(error instanceof Error ? error.message : "Confira o pacote."); }
  }
  function addProduct() {
    const procedure = procedures.find((item) => item.id === procedureId);
    if (!procedure || !Number.isInteger(procedureQuantity) || procedureQuantity <= 0) return;
    setProducts((current) => {
      const existing = current.find((product) => product.procedureId === procedure.id);
      return existing ? current.map((product) => product.id === existing.id ? { ...product, quantity: product.quantity + procedureQuantity } : product)
        : [...current, { id: `product-${crypto.randomUUID()}`, procedureId: procedure.id, quantity: procedureQuantity, unitCost: procedure.averageCost }];
    });
    setProcedureId(""); setProcedureQuantity(1); setAdding(null);
  }
  function addGift() {
    const gift = gifts.find((item) => item.id === giftId); if (!gift || !Number.isSafeInteger(giftQuantity) || giftQuantity <= 0) return;
    setSelectedGifts((current) => { const existing = current.find((item) => item.giftId === gift.id); return existing ? current.map((item) => item.giftId === gift.id ? { ...item, quantity: item.quantity + giftQuantity } : item) : [...current, { id: `gift-usage-${crypto.randomUUID()}`, giftId: gift.id, name: gift.name, quantity: giftQuantity }]; });
    setGiftId(""); setGiftQuantity(1); setAdding(null);
  }
  function addShots() {
    const tip = tips.find(item => item.id === tipId);
    if (!tip || !Number.isSafeInteger(shotQuantity) || shotQuantity <= 0) return;
    const next = selectedShots.some(item => item.tipId === tip.id)
      ? selectedShots.map(item => item.tipId === tip.id ? { ...item, quantity: item.quantity + shotQuantity } : item)
      : [...selectedShots, { tipId: tip.id, name: tip.name, quantity: shotQuantity }];
    if (!validCheckoutShots(next)) { setError("Confira a quantidade de disparos."); return; }
    setSelectedShots(next); setTipId(""); setShotQuantity(1); setAdding(null); setError("");
  }
  function updatePayment(choiceId: string, amount: number) {
    const selected = payments.filter((payment) => paymentChoiceKey(payment) === choiceId);
    if (!selected.length) return;
    setPayments((current) => [...current.filter((payment) => paymentChoiceKey(payment) !== choiceId), { ...selected[0], amount: moneyRound(amount) }]);
  }
  function confirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!client.name.trim() || !lines.length) { setError("Informe o cliente e adicione ao menos um serviço à conta."); return; }
    if (lines.some((line) => !Number.isInteger(line.quantity) || line.quantity <= 0 || !Number.isFinite(line.servicePrice) || line.servicePrice < 0
      || !Number.isFinite(line.discount ?? 0) || (line.discount ?? 0) < 0 || (line.discount ?? 0) > moneyRound(line.quantity * line.servicePrice))) {
      setError("Confira as quantidades, os preços e os descontos dos itens."); return;
    }
    if (!products.length && !selectedShots.length && !allowsNoProducts) { setError("Adicione um produto utilizado ou os disparos do Ultraformer antes de fechar a conta."); return; }
    if (products.some((product) => !Number.isInteger(product.quantity) || product.quantity <= 0 || !Number.isFinite(product.unitCost) || product.unitCost < 0)) { setError("Confira as quantidades dos produtos utilizados."); return; }
    if (!validCheckoutShots(selectedShots)) { setError("Confira a ponteira e a quantidade de disparos."); return; }
    if (selectedGifts.some((gift) => !Number.isSafeInteger(gift.quantity) || gift.quantity <= 0)) { setError("Confira as quantidades dos brindes."); return; }
    if (payments.some((payment) => !Number.isFinite(payment.amount) || payment.amount < 0)) { setError("Confira os valores pagos."); return; }
    const futureCredit = payments.filter((payment) => payment.method === "Crédito Futuro").reduce((sum, payment) => sum + payment.amount, 0);
    if (futureCredit > availableCredit) { setError("O pagamento com crédito futuro ultrapassa o saldo do cliente."); return; }
    if (totals.remaining > 0 && !leaveDebt) { setError("Informe o pagamento que falta para fechar a conta ou ative deixar o restante como dívida."); return; }
    try {
      const settled = settleCheckoutPayments(payments,totals.change,keepCredit);
      const professionalPercent=checkoutCommission(draft.professional?.commissionPercent??0,clinicPatient);
      onConfirm({ client, lines: lines.map(line=>({...line,professionalPercent: line.packageCommissionPercent === undefined ? professionalPercent : checkoutCommission(line.packageCommissionPercent,clinicPatient)})), products, gifts: selectedGifts, ultraformerShots: selectedShots, ...settled, clinicPatient, checkoutNotes, total: totals.total, discount: totals.discount, balanceDue: totals.remaining });
    } catch (error) {setError(error instanceof Error?error.message:"Confira os pagamentos.");}

  }
  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/40 p-2 sm:p-4">
    <form onSubmit={confirm} role="dialog" aria-modal="true" aria-label="Fechamento de conta" className="flex max-h-[96vh] w-full max-w-6xl flex-col overflow-hidden rounded-xl bg-white shadow-panel">
      <header className="flex shrink-0 items-center justify-between border-b border-avvi-line px-5 py-4"><h2 className="text-sm font-semibold uppercase text-slate-600">Fechamento de conta do dia {displayDate(draft.appointment.startsAt)}</h2><button type="button" aria-label="Fechar janela da conta" onClick={onCancel} className="rounded-md p-2 text-slate-500 hover:bg-slate-100"><X size={20} /></button></header>
      <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          <section className="rounded-md border border-avvi-line">
            <div className="flex flex-wrap items-center justify-between gap-3 p-3"><div className="flex items-center gap-3"><span className="grid h-12 w-12 place-items-center rounded-full bg-slate-100 text-slate-400"><UserRound size={28} /></span><strong className="text-sm">{client.name || "Cliente"}</strong></div><div className="flex gap-4 text-xs"><button type="button" onClick={() => setEditingClient(!editingClient)} className="flex items-center gap-1 font-semibold text-slate-600"><Pencil size={14} />Editar cliente</button></div></div>
            {editingClient ? <div className="grid gap-3 px-4 pb-4 sm:grid-cols-2"><label className="text-xs">Nome<input aria-label="Nome do cliente na conta" required className="input mt-1" value={client.name} onChange={(event) => setClient({ ...client, name: event.target.value })} /></label><label className="text-xs">Telefone<input aria-label="Telefone do cliente na conta" className="input mt-1" value={client.phone} onChange={(event) => setClient({ ...client, phone: event.target.value })} /></label><label className="text-xs">E-mail<input aria-label="E-mail do cliente na conta" type="email" className="input mt-1" value={client.email ?? ""} onChange={(event) => setClient({ ...client, email: event.target.value })} /></label></div> : <div className="flex flex-wrap gap-3 px-4 pb-3 text-xs text-slate-500"><span>{client.phone || "Sem telefone"}</span>{client.email && <span>{client.email}</span>}</div>}
            <div className="grid grid-cols-2 divide-x divide-avvi-line bg-slate-50 text-center text-xs sm:grid-cols-3">{[["Aniversário", client.birthDate ? displayDate(client.birthDate).slice(0, 5) : "-"], ["Cliente desde", client.registrationDate?.slice(0, 4) || "-"], ["Última visita", displayDate(lastVisit)]].map(([label, value]) => <div key={label} className="px-2 py-3"><p className="text-slate-500">{label}</p><p className="mt-1 font-semibold">{value}</p></div>)}</div>
          </section>
          <div className="my-5 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setAdding(adding === "service" ? null : "service")} className="flex items-center gap-2 rounded-md bg-avvi-blue px-4 py-2 text-sm font-bold text-white hover:brightness-95"><Plus size={16} />Serviços</button>
            <button type="button" onClick={() => setAdding(adding === "package" ? null : "package")} className="flex items-center gap-2 rounded-md bg-avvi-blue px-4 py-2 text-sm font-bold text-white hover:brightness-95"><Plus size={16}/>Pacotes</button>
            <button type="button" onClick={() => setAdding(adding === "product" ? null : "product")} className="flex items-center gap-2 rounded-md bg-avvi-blue px-4 py-2 text-sm font-bold text-white hover:brightness-95"><Plus size={16} />Produtos</button>
            <button type="button" onClick={() => setAdding(adding === "gift" ? null : "gift")} className="flex items-center gap-2 rounded-md bg-avvi-blue px-4 py-2 text-sm font-bold text-white hover:brightness-95"><Plus size={16} />Brindes</button>
            <button type="button" onClick={() => setAdding(adding === "ultraformer" ? null : "ultraformer")} className="flex items-center gap-2 rounded-md bg-avvi-blue px-4 py-2 text-sm font-bold text-white hover:brightness-95"><Plus size={16}/>Ultraformer</button>
          </div>
          {adding === "service" && <div className="mb-4 grid gap-3 rounded-md border border-lime-200 bg-lime-50 p-3 sm:grid-cols-[1fr_100px_auto]">
            <label className="text-xs font-semibold">Serviço<SearchSelect label="Adicionar serviço à conta" options={services.filter(service=>service.active)} value={serviceId} onChange={setServiceId}/></label>
            <label className="text-xs font-semibold">Quantidade<input aria-label="Quantidade do serviço a adicionar" className="input mt-1" type="number" min={1} step={1} value={serviceQuantity} onChange={(event) => setServiceQuantity(Number(event.target.value))} /></label>
            <button type="button" disabled={!serviceId || !Number.isInteger(serviceQuantity) || serviceQuantity < 1} onClick={addService} className="self-end rounded-md bg-lime-400 px-3 py-2 text-sm font-bold disabled:opacity-40">Adicionar serviço</button>
          </div>}
          {adding === "package" && <div className="mb-4 grid gap-3 rounded-md border border-avvi-line bg-avvi-soft p-3 sm:grid-cols-[1fr_100px_auto]">
            <label className="text-xs font-semibold">Pacote<SearchSelect label="Adicionar pacote à conta" options={packages.filter(pack => pack.active)} value={packageId} onChange={setPackageId}/></label>
            <label className="text-xs font-semibold">Quantidade<input aria-label="Quantidade do pacote a adicionar" className="input mt-1" type="number" min={1} max={10000} step={1} value={packageQuantity} onChange={event => setPackageQuantity(Number(event.target.value))}/></label>
            <button type="button" disabled={!packageId || !Number.isSafeInteger(packageQuantity) || packageQuantity < 1 || packageQuantity > 10000} onClick={addPackage} className="self-end rounded-md bg-avvi-blue px-3 py-2 text-sm font-bold text-white disabled:opacity-40">Adicionar pacote</button>
            {packageId && <p className="text-xs text-slate-600 sm:col-span-3">{currency((packages.find(pack => pack.id === packageId)?.salePrice ?? 0) * packageQuantity)} · {packages.find(pack => pack.id === packageId)?.items.map(item => `${item.quantity * packageQuantity}× ${item.name}`).join(" · ")}</p>}
            {!packages.some(pack => pack.active) && <p className="text-xs text-slate-500 sm:col-span-3">Cadastre um pacote em Cadastro de Serviços → Pacotes.</p>}
          </div>}
          {adding === "product" && <div className="mb-4 grid gap-3 rounded-md border border-lime-200 bg-lime-50 p-3 sm:grid-cols-[1fr_100px_auto]">
            <label className="text-xs font-semibold">Produto<SearchSelect label="Adicionar produto ao consumo" options={procedures} value={procedureId} onChange={setProcedureId}/></label>
            <label className="text-xs font-semibold">Quantidade<input aria-label="Quantidade do produto a adicionar" className="input mt-1" type="number" min={1} step={1} value={procedureQuantity} onChange={(event) => setProcedureQuantity(Number(event.target.value))} /></label>
            <button type="button" disabled={!procedureId || !Number.isInteger(procedureQuantity) || procedureQuantity < 1} onClick={addProduct} className="self-end rounded-md bg-lime-400 px-3 py-2 text-sm font-bold disabled:opacity-40">Adicionar produto</button>
          </div>}
          {adding === "gift" && <div className="mb-4 grid gap-3 rounded-md border border-lime-200 bg-lime-50 p-3 sm:grid-cols-[1fr_100px_auto]"><label className="text-xs font-semibold">Brinde<select aria-label="Adicionar brinde ao fechamento" className="input mt-1" value={giftId} onChange={(event) => setGiftId(event.target.value)}><option value="">Selecione</option>{gifts.slice().sort((a, b) => a.name.localeCompare(b.name, "pt-BR")).map((gift) => <option key={gift.id} value={gift.id}>{gift.name}</option>)}</select></label><label className="text-xs font-semibold">Quantidade<input aria-label="Quantidade do brinde a adicionar" className="input mt-1" type="number" min={1} step={1} value={giftQuantity} onChange={(event) => setGiftQuantity(Number(event.target.value))} /></label><button type="button" disabled={!giftId || !Number.isSafeInteger(giftQuantity) || giftQuantity < 1} onClick={addGift} className="self-end rounded-md bg-lime-400 px-3 py-2 text-sm font-bold disabled:opacity-40">Adicionar brinde</button>{!gifts.length && <p className="text-xs text-slate-500 sm:col-span-3">Cadastre seus brindes em Estoque → Brindes.</p>}</div>}
          {adding === "ultraformer" && <div className="mb-4 grid gap-3 rounded-md border border-avvi-line bg-avvi-soft p-3 sm:grid-cols-[1fr_110px_auto]">
            <label className="text-xs font-semibold">Ponteira<SearchSelect label="Ponteira do Ultraformer" options={tips} value={tipId} onChange={setTipId}/></label>
            <label className="text-xs font-semibold">Disparos utilizados<input aria-label="Disparos do Ultraformer a adicionar" className="input mt-1" type="number" min={1} step={1} value={shotQuantity} onChange={event => setShotQuantity(Number(event.target.value))}/></label>
            <button type="button" disabled={!tipId || !Number.isSafeInteger(shotQuantity) || shotQuantity < 1} onClick={addShots} className="self-end rounded-md bg-avvi-blue px-3 py-2 text-sm font-bold text-white disabled:opacity-40">Adicionar Ultraformer</button>
          </div>}
          {!!selectedShots.length && <section aria-label="Ultraformer no fechamento" className="mb-4 rounded-md border border-avvi-line bg-avvi-soft p-3"><h3 className="text-xs font-bold text-avvi-blue">Ultraformer</h3><div className="mt-2 divide-y divide-avvi-line">{selectedShots.map(shot => <div key={shot.tipId} className="flex items-center gap-3 py-2"><span className="min-w-0 flex-1 text-sm font-semibold">{shot.name}</span><input aria-label={`Disparos utilizados de ${shot.name}`} type="number" required min={1} step={1} value={shot.quantity} onChange={event => setSelectedShots(current => current.map(item => item.tipId === shot.tipId ? { ...item, quantity: Number(event.target.value) } : item))} className="w-24 rounded border border-slate-300 px-2 py-1 text-right text-sm"/><button type="button" aria-label={`Remover ${shot.name} do Ultraformer`} onClick={() => setSelectedShots(current => current.filter(item => item.tipId !== shot.tipId))} className="rounded p-1 text-slate-400 hover:text-red-500"><Trash2 size={15}/></button></div>)}</div></section>}
          {selectedGifts.length > 0 && <section data-testid="checkout-gifts" className="mb-4 rounded-md border border-avvi-line bg-avvi-soft p-3"><h3 className="text-xs font-bold text-avvi-blue">Brindes entregues</h3><p className="mt-1 text-xs text-slate-500">Opcional, sem cobrança ao paciente.</p><div className="mt-2 divide-y divide-avvi-line">{selectedGifts.map((gift) => <div key={gift.id} className="flex items-center gap-3 py-2"><span className="min-w-0 flex-1 text-sm font-semibold">{gift.name}</span><input aria-label={`Quantidade entregue de ${gift.name}`} type="number" required min={1} step={1} value={gift.quantity} onChange={(event) => setSelectedGifts((current) => current.map((item) => item.id === gift.id ? { ...item, quantity: Number(event.target.value) } : item))} className="w-16 rounded border border-slate-300 px-2 py-1 text-right text-sm" /><button type="button" aria-label={`Remover ${gift.name} dos brindes entregues`} onClick={() => setSelectedGifts((current) => current.filter((item) => item.id !== gift.id))} className="rounded p-1 text-slate-400 hover:text-red-500"><Trash2 size={15} /></button></div>)}</div></section>}
          {products.length > 0 && <section data-testid="checkout-products" className="mb-4 rounded-md border border-avvi-line bg-slate-50 p-3"><h3 className="text-xs font-bold text-slate-600">Produtos utilizados</h3><p className="mt-1 text-xs text-slate-500">Quantidade consumida no estoque.</p><div className="mt-2 divide-y divide-avvi-line">{products.map((product) => {
            const name = procedures.find((procedure) => procedure.id === product.procedureId)?.name ?? "Produto registrado";
            return <div key={product.id} className="flex items-center gap-3 py-2"><span className="min-w-0 flex-1 text-sm font-semibold">{name}</span><input aria-label={`Quantidade utilizada de ${name}`} className="w-16 rounded border border-slate-300 px-2 py-1 text-right text-sm" type="number" min={1} step={1} required value={product.quantity} onChange={(event) => setProducts((current) => current.map((item) => item.id === product.id ? { ...item, quantity: Number(event.target.value) } : item))} /><button type="button" aria-label={`Remover ${name} dos produtos utilizados`} onClick={() => setProducts((current) => current.filter((item) => item.id !== product.id))} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 size={15} /></button></div>;
          })}</div></section>}
          <div className="overflow-x-auto"><table data-testid="checkout-services" className="w-full min-w-[620px] text-sm"><thead className="border-b-2 border-avvi-line text-left text-xs text-slate-500"><tr><th className="px-2 py-3">Item</th><th className="px-2 py-3">Quantidade</th><th className="px-2 py-3">Preço</th><th className="px-2 py-3">Desconto</th><th className="px-2 py-3">A pagar</th><th /></tr></thead><tbody>
            {lines.map((line, index) => {
              const name = line.manualProcedure || services.find((service) => service.id === line.serviceId)?.name || "Serviço registrado";
              return <tr key={line.id} className="border-b border-avvi-line"><td className="border-l-4 border-l-lime-500 px-3 py-4"><p className="font-semibold">{name}</p>{line.packageName && <span className="mt-1 block text-[10px] font-semibold text-avvi-blue">Pacote: {line.packageName}</span>}<p className="mt-1 text-xs text-orange-600">com {draft.professional?.name ?? "Profissional"}</p></td><td className="px-2 py-3"><input aria-label={`Quantidade de ${name} na conta`} type="number" min={1} step={1} required value={line.quantity} onChange={(event) => updateLine(index, { quantity: Number(event.target.value) })} className="w-16 rounded border border-slate-300 px-2 py-1 text-right" /></td><td className="px-2 py-3 align-top"><div className="relative w-28"><span className="pointer-events-none absolute left-2 top-1 text-xs text-slate-500">R$</span><input aria-label={`Preço de ${name} na conta`} type="number" min={0} step="0.01" required value={line.servicePrice} onChange={(event) => updateLine(index, { servicePrice: Number(event.target.value) })} className="w-full rounded border border-slate-300 py-1 pl-8 pr-2 text-right" /></div></td><td className="px-2 py-3 align-top"><div className="relative w-28"><span className="pointer-events-none absolute left-2 top-1 text-xs text-slate-500">R$</span><input aria-label={`Desconto de ${name} na conta`} type="number" min={0} max={moneyRound(line.servicePrice * line.quantity)} step="0.01" value={line.discount ?? 0} onFocus={() => setExpandedDiscount(line.id)} onClick={() => setExpandedDiscount(line.id)} onChange={(event) => updateLine(index, { discount: Number(event.target.value) })} className="w-full rounded border border-slate-300 py-1 pl-8 pr-2 text-right" /></div>{expandedDiscount === line.id && <div className="mt-2 w-32 rounded-md border border-avvi-line bg-avvi-soft p-2"><label className="block text-[10px] font-semibold text-slate-600">Desconto em %<div className="relative mt-1"><input aria-label={`Porcentagem de desconto de ${name}`} type="number" min={0} max={100} step="0.01" value={percentages[line.id] ?? (line.quantity * line.servicePrice > 0 ? moneyRound((line.discount ?? 0) / (line.quantity * line.servicePrice) * 100) : 0)} onChange={event => applyPercentage(index, Number(event.target.value))} className="w-full rounded border border-slate-300 bg-white py-1 pl-2 pr-6 text-right text-xs" /><span className="pointer-events-none absolute right-2 top-1 text-xs">%</span></div></label><p className="mt-1 text-[9px] text-slate-500">Sobre {currency(line.quantity * line.servicePrice)}</p><button type="button" aria-label={`Ocultar porcentagem de ${name}`} onClick={() => setExpandedDiscount(null)} className="mt-1 text-[10px] font-semibold text-avvi-blue">Concluir</button></div>}</td><td className="whitespace-nowrap px-2 py-3">{currency(Math.max(0, moneyRound(line.servicePrice * line.quantity - (line.discount ?? 0))))}</td><td><button type="button" aria-label={`Remover ${name} da conta`} onClick={() => setLines((current) => current.filter((item) => item.id !== line.id))} className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-500"><Trash2 size={15} /></button></td></tr>;
            })}
          </tbody></table></div>
          {!lines.length && <p className="py-6 text-center text-sm text-slate-500">Adicione os serviços desta conta.</p>}
          <label className="mt-5 block text-xs text-slate-500">Observação do agendamento<p className="mt-1 text-sm text-slate-700">{draft.notes || "-"}</p></label>
          <label className="mt-4 block text-xs font-semibold text-slate-600">Observações do fechamento<textarea aria-label="Observações do fechamento" className="input mt-2 min-h-24 resize-y" maxLength={10000} value={checkoutNotes} onChange={event => setCheckoutNotes(event.target.value)}/></label>
        </div>
        <aside className="space-y-3 lg:border-l lg:border-avvi-line lg:pl-4">
          <div className="flex justify-between rounded-md bg-white px-3 py-3 text-sm shadow-panel"><span>Total</span><strong>{currency(totals.total)}</strong></div>
          {groups.map((group) => <section key={group.name}><button type="button" onClick={() => setClosedGroups((current) => current.includes(group.name) ? current.filter((name) => name !== group.name) : [...current, group.name])} className="flex w-full items-center justify-between rounded bg-slate-200 px-3 py-1.5 text-sm text-slate-600">{group.name}{closedGroups.includes(group.name) ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</button>{!closedGroups.includes(group.name) && <div className="divide-y divide-slate-100">{group.choices.map((choice) => {
            const selected = payments.filter((payment) => paymentChoiceKey(payment) === choice.id);
            return <div key={choice.id} className="px-1 py-2"><label className="flex items-center gap-2 text-xs text-slate-600"><input aria-label={`Receber por ${choice.label}`} type="checkbox" checked={selected.length > 0} onChange={() => setPayments((current) => toggleCheckoutPayment(current, choice, totals.total))} className="h-4 w-4 accent-lime-600" />{choice.label}</label>{selected.length > 0 && <div className="mt-2 flex items-center gap-2"><span className="text-xs text-slate-500">R$</span><input aria-label={`Valor pago por ${choice.label}`} type="number" min={0} step="0.01" value={moneyRound(selected.reduce((sum, payment) => sum + payment.amount, 0))} onChange={(event) => updatePayment(choice.id, Number(event.target.value))} className="min-w-0 flex-1 rounded border border-slate-300 px-2 py-1 text-right text-sm" />{choice.method === "Crédito" && <select aria-label={`Parcelas de ${choice.label}`} value={selected[0].installments ?? 1} onChange={(event) => setPayments((current) => current.map((payment) => paymentChoiceKey(payment) === choice.id ? { ...payment, installments: Number(event.target.value) } : payment))} className="rounded border border-slate-300 py-1 text-xs">{Array.from({ length: 12 }, (_, index) => <option key={index} value={index + 1}>{index + 1}x</option>)}</select>}</div>}</div>;
          })}</div>}</section>)}
          <div className="rounded-md bg-white p-3 text-sm shadow-panel"><div className="flex justify-between border-b py-2"><span>Total</span><strong data-testid="checkout-total">{currency(totals.total)}</strong></div><div className="flex justify-between border-b py-2"><span>Recebido</span><strong data-testid="checkout-received" className="text-emerald-600">{currency(totals.received)}</strong></div><div className="flex justify-between py-2"><span>Falta</span><strong data-testid="checkout-remaining" className="text-red-500">{currency(totals.remaining)}</strong></div>{totals.change > 0 && <div className="flex justify-between py-2"><span>{keepCredit?"Crédito a guardar":"Troco"}</span><strong data-testid="checkout-excess">{currency(totals.change)}</strong></div>}<div className="mt-3 space-y-3"><CheckoutSwitch label="Deixar o restante como dívida" checked={leaveDebt} onChange={setLeaveDebt}/><CheckoutSwitch label="Guardar valor pago a mais como crédito" checked={keepCredit} onChange={setKeepCredit}/><CheckoutSwitch label="Paciente da clínica" checked={clinicPatient} onChange={setClinicPatient}/><p className="text-xs text-slate-500">Crédito disponível: <strong data-testid="checkout-credit-balance">{currency(availableCredit)}</strong></p></div></div>
        </aside>
      </div>
      <footer className="shrink-0 border-t border-avvi-line px-5 py-4">{allowsNoProducts && <p className="mb-2 text-xs text-slate-500">Avaliação ou retorno: produtos são opcionais. Para fechar sem cobrança, deixe o valor a pagar em R$ 0,00. Sem produtos, não será gerado um lançamento de procedimentos.</p>}{error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}<div className="flex justify-end gap-3"><button type="button" onClick={onCancel} className="rounded border border-orange-500 px-4 py-2 text-sm font-semibold text-orange-600">Cancelar</button>{onDelete && <button type="button" aria-label="Excluir conta fechada" title="Excluir conta fechada" onClick={onDelete} className="rounded-md border border-red-200 p-2 text-red-600 hover:bg-red-50"><Trash2 size={18} /></button>}<button type="submit" className="rounded bg-orange-500 px-5 py-2 text-sm font-bold text-white hover:bg-orange-600">Fechar Conta</button></div></footer>
    </form>
  </div>;
}

function CheckoutSwitch({label,checked,onChange}:{label:string;checked:boolean;onChange:(checked:boolean)=>void}) {
 return <label className="flex cursor-pointer items-center justify-between gap-3 text-xs text-slate-600"><span>{label}</span><input type="checkbox" role="switch" aria-label={label} checked={checked} onChange={event=>onChange(event.target.checked)} className="peer sr-only"/><span aria-hidden="true" className={`relative h-5 w-9 shrink-0 rounded-full transition peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-avvi-blue ${checked?"bg-avvi-blue":"bg-slate-300"}`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${checked?"left-[18px]":"left-0.5"}`}/></span></label>;
}
