"use client";
import { useMemo, useState } from "react";
import Image from "next/image";
import { BarChart3, ChevronDown, Eye, EyeOff, Trophy } from "lucide-react";
import { currency, percent } from "@/lib/calculations";
import { reportMonthPeriod } from "@/lib/reports";
import { professionalReports } from "@/lib/professionalReports";
import type { IndividualRanking } from "@/lib/professionalReports";
import type { MonthlyGoals } from "@/lib/database";
import type { Appointment, FinancialEntry, Patient, Professional, Service } from "@/lib/types";

export function ProfessionalReportView(props: {
  entries: FinancialEntry[]; appointments: Appointment[]; professionals: Professional[];
  patients: Patient[]; services: Service[]; monthlyGoals: MonthlyGoals[];
  selectedMonth: string; setSelectedMonth: (month: string) => void;
}) {
  const initial = reportMonthPeriod(props.selectedMonth) ?? { start: "", end: "" };
  const [mode, setMode] = useState("month"), [start, setStart] = useState(initial.start), [end, setEnd] = useState(initial.end);
  const [expanded, setExpanded] = useState<string[]>([]), [visibleFinancials, setVisibleFinancials] = useState<string[]>([]);
  const [showAllFinancials, setShowAllFinancials] = useState(false);
  const period = mode === "month" ? reportMonthPeriod(props.selectedMonth) ?? { start: "", end: "" } : { start, end };
  const { start: periodStart, end: periodEnd } = period;
  const data = useMemo(() => professionalReports({ ...props, start: periodStart, end: periodEnd }), [props, periodStart, periodEnd]);
  const toggle = (items: string[], id: string) => items.includes(id) ? items.filter(item => item !== id) : [...items, id];
  function changeMonth(month: string) {
    props.setSelectedMonth(month); const next = reportMonthPeriod(month);
    if (next) { setStart(next.start); setEnd(next.end); }
  }
  return <div className="space-y-4">
    <section className="rounded-2xl bg-white p-5 shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><div className="flex items-center gap-2"><BarChart3 size={22} className="text-avvi-blue"/><h3 className="text-xl font-bold">Relatório por Profissional</h3></div><p className="mt-1 text-sm text-slate-500">Profissionais ordenados pelo faturamento. Abra os rankings individuais para explorar os resultados.</p></div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-slate-600">Período<select aria-label="Tipo de período do relatório profissional" className="input mt-1" value={mode} onChange={event => setMode(event.target.value)}><option value="month">Por mês</option><option value="range">Intervalo de datas</option></select></label>
          {mode === "month" ? <label className="text-xs font-semibold text-slate-600">Mês<input aria-label="Mês do relatório profissional" type="month" className="input mt-1" value={props.selectedMonth} onChange={event => changeMonth(event.target.value)}/></label> : <><label className="text-xs font-semibold text-slate-600">Início<input aria-label="Data inicial do relatório profissional" type="date" className="input mt-1" value={start} onChange={event => setStart(event.target.value)}/></label><label className="text-xs font-semibold text-slate-600">Fim<input aria-label="Data final do relatório profissional" type="date" className="input mt-1" value={end} onChange={event => setEnd(event.target.value)}/></label></>}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-avvi-line pt-4"><p className="max-w-3xl text-xs leading-relaxed text-slate-500">Valores e lucro seguem os lançamentos de procedimentos, com custos, taxas e descontos. Serviços contam apenas atendimentos realizados e itens de serviços registrados; produtos não entram nessa contagem.</p><button type="button" className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-avvi-blue/30 bg-avvi-soft px-3 py-2 text-sm font-semibold text-avvi-blue hover:bg-avvi-blue/15" aria-pressed={showAllFinancials} onClick={() => { setShowAllFinancials(!showAllFinancials); setVisibleFinancials([]); }}>{showAllFinancials ? <EyeOff size={16}/> : <Eye size={16}/>} {showAllFinancials ? "Ocultar valores de todos" : "Mostrar valores de todos"}</button></div>
      {!data.valid && <p role="alert" className="mt-3 text-sm text-red-600">Informe um período válido, com a data final igual ou posterior à inicial.</p>}
    </section>
    <div className="grid items-start gap-4 xl:grid-cols-2">
      {data.reports.map((item, index) => {
        const id = item.professional.id, name = item.professional.name, isExpanded = expanded.includes(id), showValues = showAllFinancials || visibleFinancials.includes(id);
        const progress = item.goal > 0 ? Math.max(0, Math.min(100, item.totalPaid / item.goal * 100)) : 0;
        return <section key={id} aria-label={`Relatório de ${name}`} className={`min-w-0 overflow-hidden rounded-2xl bg-white shadow-panel ${isExpanded ? "xl:col-span-2" : ""}`}>
          <button type="button" className="flex w-full items-center gap-3 p-5 text-left hover:bg-avvi-soft/40 focus-visible:outline-avvi-blue" aria-label={`Rankings de ${name}`} aria-expanded={isExpanded} aria-controls={`professional-rankings-${id}`} onClick={() => setExpanded(toggle(expanded, id))}>
            <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-avvi-soft text-lg font-bold text-avvi-blue">{item.professional.avatarDataUrl ? <Image src={item.professional.avatarDataUrl} alt={`Foto de ${name}`} width={44} height={44} unoptimized className="h-full w-full rounded-full object-cover"/> : name[0]}</span>
            <span className="min-w-0 flex-1"><span className="block text-lg font-bold">{index + 1}. {name}</span><span className="mt-1 block text-xs text-slate-500">{item.serviceCount.toLocaleString("pt-BR")} serviços realizados · {item.count} lançamentos</span></span><ChevronDown size={20} className={`shrink-0 text-avvi-blue transition-transform ${isExpanded ? "rotate-180" : ""}`}/>
          </button>
          <div className="px-5 pb-5">
            <div className="rounded-xl bg-avvi-soft/50 p-3"><div className="flex flex-wrap justify-between gap-2 text-sm"><span className="text-slate-600">Total pago pelos clientes</span><strong>{currency(item.totalPaid)}</strong></div><div className="mt-3 flex justify-between gap-2 text-xs text-slate-500"><span>Meta: {currency(item.goal)}</span><strong>{percent(progress)}</strong></div><div aria-hidden className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-avvi-blue" style={{ width: `${progress}%` }}/></div></div>
            <button type="button" className="mt-3 flex items-center gap-2 text-sm font-semibold text-avvi-blue disabled:opacity-70" disabled={showAllFinancials} aria-expanded={showValues} aria-controls={`professional-financials-${id}`} onClick={() => setVisibleFinancials(toggle(visibleFinancials, id))}>{showValues ? <EyeOff size={16}/> : <Eye size={16}/>} {showValues ? "Ocultar valores financeiros" : "Ver valores financeiros"}</button>
            {showValues && <div id={`professional-financials-${id}`} aria-label={`Valores financeiros de ${name}`} role="region" className="mt-3 space-y-3 rounded-xl border border-avvi-line p-4 text-sm"><FinancialLine label="Lucro total" value={item.totalProfit} tone="green"/><FinancialLine label="Receita da empresa" value={item.companyRevenue} tone="gold"/><FinancialLine label="Valor recebido pelo profissional" value={item.professionalValue} tone="blue"/><FinancialLine label="Ticket médio" value={item.averageTicket} tone="slate"/><p className="text-[11px] text-slate-500">Total pago ÷ {item.closedPatientCount} {item.closedPatientCount === 1 ? "paciente com conta fechada" : "pacientes com conta fechada"} no período. Cada paciente conta uma vez.</p></div>}
            <button type="button" className="mt-4 flex items-center gap-2 text-xs font-semibold text-slate-500" aria-expanded={isExpanded} aria-controls={`professional-rankings-${id}`} onClick={() => setExpanded(toggle(expanded, id))}><Trophy size={15} className="text-avvi-blue"/>{isExpanded ? "Ocultar rankings individuais" : "Ver rankings individuais"}</button>
          </div>
          {isExpanded && <div id={`professional-rankings-${id}`} role="region" aria-label={`Rankings individuais de ${name}`} className="grid gap-4 border-t border-avvi-line bg-slate-50/60 p-4 sm:grid-cols-2"><IndividualTable title="Serviços mais realizados" rows={item.services} metric="Quantidade" money={false}/><IndividualTable title="Pacientes por faturamento" rows={item.patientRevenue} metric="Faturamento" money/><IndividualTable title="Pacientes por lucro" rows={item.patientProfit} metric="Lucro" money/><IndividualTable title="Pacientes por serviços realizados" rows={item.patientServices} metric="Serviços" money={false}/></div>}
        </section>;
      })}
    </div>
    {!data.reports.length && <p className="rounded-xl bg-white p-6 text-center text-sm text-slate-500">Nenhum profissional cadastrado.</p>}
  </div>;
}
function FinancialLine({ label, value, tone }: { label: string; value: number; tone: "green" | "gold" | "blue" | "slate" }) {
  const colors = { green: "text-avvi-green", gold: "text-avvi-gold", blue: "text-blue-600", slate: "text-avvi-ink" };
  return <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-slate-600">{label}</span><strong className={colors[tone]}>{currency(value)}</strong></div>;
}
function IndividualTable({ title, rows, metric, money }: { title: string; rows: IndividualRanking[]; metric: string; money: boolean }) {
  return <section aria-label={title} className="min-w-0 overflow-hidden rounded-xl border border-avvi-line bg-white"><header className="flex items-center justify-between gap-2 border-b border-avvi-line p-3"><h4 className="text-sm font-bold">{title}</h4><span className="shrink-0 rounded-full bg-avvi-soft px-2 py-1 text-[10px] font-bold text-avvi-blue">Top 5</span></header>{rows.length ? <table className="w-full table-fixed text-xs"><thead className="bg-avvi-soft/50 text-slate-500"><tr><th className="w-7 py-2">#</th><th className="px-2 py-2 text-left">{title.startsWith("Serviços") ? "Serviço" : "Paciente"}</th><th className="w-24 px-2 py-2 text-right">{metric}</th></tr></thead><tbody>{rows.map((row, index) => <tr key={row.id} className="border-t border-avvi-line"><td className="py-3 text-center text-slate-400">{index + 1}</td><td className="break-words px-2 py-3 font-semibold">{row.name}</td><td className="px-2 py-3 text-right font-bold">{money ? currency(row.value) : row.value.toLocaleString("pt-BR")}</td></tr>)}</tbody></table> : <p className="p-4 text-xs text-slate-500">Nenhum registro neste período.</p>}</section>;
}
