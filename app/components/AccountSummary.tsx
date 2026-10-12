"use client";

import { useEffect, useRef, useState } from "react";
import { Printer, X } from "lucide-react";
import { currency } from "@/lib/calculations";
import { checkoutTotals, moneyRound } from "@/lib/checkout";
import type { Procedure } from "@/lib/types";
import type { CheckoutDraft } from "./AccountCheckout";

export function AccountSummary({ draft, closedAt, change, procedures, onClose }: {
  draft: CheckoutDraft; closedAt?: string; change: number; procedures: Procedure[]; onClose: () => void;
}) {
  const [showProducts, setShowProducts] = useState(false);
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
      if (event.key === "Tab") {
        const buttons = [...(dialogRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
        const first = buttons[0]; const last = buttons.at(-1);
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    }
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("keydown", escape); previous?.focus(); };
  }, [onClose]);
  const totals = checkoutTotals(draft.lines, draft.payments);
  const date = draft.appointment.startsAt.slice(0, 10).split("-").reverse().join("/");
  const remaining = Math.max(0, moneyRound(totals.total - totals.received));
  const historical = draft.appointment.historicalImport?.paymentsUnknown && !draft.appointment.closedAccount;
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/40 p-2 sm:p-4">
    <section ref={dialogRef} role="dialog" aria-modal="true" aria-label="Detalhes do fechamento" className="account-summary-dialog flex max-h-[96dvh] w-full max-w-5xl flex-col overflow-hidden rounded-lg bg-white text-slate-700 shadow-panel">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 px-4 py-3"><h2 className="text-sm font-medium uppercase">Fechamento de conta do dia {date}</h2><button ref={closeRef} type="button" aria-label="Fechar detalhes do fechamento" onClick={onClose} className="summary-actions rounded-full bg-avvi-blue p-1 text-white hover:brightness-95"><X size={16} /></button></header>
      <div className="summary-content grid min-h-0 flex-1 gap-4 overflow-y-auto p-4 sm:p-5 lg:grid-cols-[minmax(0,1fr)_250px]">
        <div className="min-w-0">
          <section className="border border-slate-200 px-3 py-2 text-xs leading-6"><p><strong>Cliente:</strong> <span className="ml-2 font-semibold">{draft.client.name}</span></p><p className="break-words"><strong>Contatos:</strong> <span className="ml-2">{[draft.client.phone, draft.client.email].filter(Boolean).join(" / ") || "Não informado"}</span></p></section>
          {historical && <p data-testid="historical-account-notice" className="mt-3 rounded border border-avvi-blue/20 bg-avvi-soft p-3 text-xs leading-5">Histórico importado. O PDF informa os valores dos serviços, mas não os pagamentos ou os produtos utilizados. Este registro não gerou lançamento de procedimentos nem baixa de estoque. {draft.appointment.historicalImport?.closedByCutoff ? "Conta marcada como fechada na importação por ser anterior a agosto de 2026." : "Conta já fechada no sistema de origem."}</p>}
          <h3 className="mb-2 mt-5 text-sm font-bold text-avvi-blue">Serviços</h3>
          <div className="overflow-x-auto"><table data-testid="closed-account-services" className="w-full min-w-[510px] border-collapse text-xs"><thead className="bg-avvi-blue text-white"><tr>{["Serviço", "Profissional", "Quantidade", "Preço (R$)", "Desconto (R$)", "A pagar (R$)"].map((label) => <th key={label} className="border border-avvi-blue/30 px-2 py-2 text-left font-semibold">{label}</th>)}</tr></thead><tbody>{draft.lines.map((line) => {
            const price = moneyRound(line.servicePrice * line.quantity);
            const discount = line.discount ?? 0;
            return <tr key={line.id}><td className="border border-slate-200 px-2 py-2 align-top"><span className="mr-1 inline-block h-3 w-3 bg-blue-300" />{line.manualProcedure || "Serviço registrado"}{line.packageName && <span className="mt-1 block text-[10px] font-semibold text-avvi-blue">Pacote: {line.packageName}</span>}</td><td className="border border-slate-200 px-2 py-2 text-center align-top">{draft.professional?.name ?? "Profissional"}</td><td className="border border-slate-200 px-2 py-2 text-center align-top">{line.quantity}</td><td className="whitespace-nowrap border border-slate-200 px-2 py-2 text-right align-top">{currency(price)}</td><td className="whitespace-nowrap border border-slate-200 px-2 py-2 text-right align-top">{currency(discount)}</td><td className="whitespace-nowrap border border-slate-200 px-2 py-2 text-right align-top">{currency(Math.max(0, price - discount))}</td></tr>;
          })}</tbody><tfoot><tr><th colSpan={3} className="border border-slate-200 px-2 py-2 text-right font-normal">Total:</th><td className="whitespace-nowrap border border-slate-200 px-2 py-2 text-right">{currency(totals.gross)}</td><td className="whitespace-nowrap border border-slate-200 px-2 py-2 text-right">{currency(totals.discount)}</td><td data-testid="closed-account-total" className="whitespace-nowrap border border-slate-200 px-2 py-2 text-right font-bold">{currency(totals.total)}</td></tr></tfoot></table></div>
          <div className="mt-6"><button type="button" aria-expanded={showProducts} onClick={() => setShowProducts(!showProducts)} className="rounded bg-avvi-blue px-3 py-1.5 text-xs font-semibold text-white">Produtos usados nos serviços</button><section hidden={!showProducts} className="mt-3 border border-slate-200 p-3 text-xs" aria-label="Produtos utilizados no fechamento">{draft.products.length ? <table className="w-full text-left"><thead><tr><th className="pb-2">Produto</th><th className="pb-2 text-right">Quantidade</th></tr></thead><tbody>{draft.products.map((product) => <tr key={product.id}><td className="border-t border-slate-100 py-2">{procedures.find((procedure) => procedure.id === product.procedureId)?.name ?? "Produto registrado"}</td><td className="border-t border-slate-100 py-2 text-right">{product.quantity}</td></tr>)}</tbody></table> : <p>Nenhum produto registrado neste fechamento.</p>}</section></div>
          {!!draft.gifts?.length && <section aria-label="Brindes entregues no fechamento" className="mt-4 rounded-lg border border-avvi-line bg-avvi-soft p-3 text-xs"><h3 className="mb-2 font-bold text-avvi-blue">Brindes entregues</h3>{draft.gifts.map((gift) => <div key={gift.id} className="flex justify-between gap-3 border-t border-avvi-line py-2"><span>{gift.name}</span><strong>{gift.quantity} unidade(s)</strong></div>)}</section>}
        </div>
        <aside className="self-start border border-slate-300 text-xs"><h3 className="bg-avvi-blue px-3 py-2 font-semibold text-white">Valores Recebidos</h3><div className="space-y-3 p-3">{draft.payments.length ? draft.payments.map((payment) => <div key={payment.id}><p className="font-semibold">{payment.method.toUpperCase()}</p><div className="flex justify-between gap-2"><span>{payment.cardBrand || payment.method}</span><span className="whitespace-nowrap">{currency(payment.amount)}</span></div>{payment.method === "Crédito" && <p className="text-right text-[10px] italic text-slate-500">em {payment.installments ?? 1} {(payment.installments ?? 1) > 1 ? "parcelas" : "parcela"}</p>}</div>) : <p>{historical ? "Pagamentos não informados no histórico." : "Nenhum valor recebido."}</p>}<div className="space-y-2 border-t border-slate-300 pt-3 text-right"><p className="flex justify-between gap-3 font-bold"><span>Total Pago:</span><span data-testid="closed-account-received">{historical ? "Não informado" : currency(totals.received+(draft.appointment.closedAccount?.creditAdded??0))}</span></p>{!historical && <p className="flex justify-between gap-3 font-semibold"><span>Troco:</span><span>{currency(change)}</span></p>}{!!draft.appointment.closedAccount?.creditAdded && <p className="flex justify-between gap-3 font-semibold text-avvi-blue"><span>Crédito guardado:</span><span>{currency(draft.appointment.closedAccount.creditAdded)}</span></p>}{!historical && remaining > 0 && <p className="flex justify-between gap-3 font-semibold text-red-600"><span>Saldo em aberto:</span><span>{currency(remaining)}</span></p>}</div></div></aside>
      </div>
      <footer className="flex shrink-0 flex-wrap items-center justify-between gap-3 px-4 pb-4 text-[10px] text-slate-500">{closedAt ? <p>Fechado em {new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(closedAt))}</p> : <p>Consulta do fechamento</p>}<button type="button" onClick={() => window.print()} className="summary-actions flex items-center gap-1 font-semibold text-avvi-blue underline"><Printer size={13} />Imprimir fechamento</button></footer>
    </section>
  </div>;
}
