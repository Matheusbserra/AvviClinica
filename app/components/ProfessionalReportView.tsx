"use client";
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import Image from "next/image";
import { BarChart3, ChevronDown, Eye, EyeOff, Trophy, TrendingUp, TrendingDown, Minus, UserPlus } from "lucide-react";
import { currency, percent } from "@/lib/calculations";
import { reportMonthPeriod } from "@/lib/reports";
import { professionalReports } from "@/lib/professionalReports";
import type { MonthlyProfessionalInsights } from "@/lib/professionalReports";
import { professionalScope, hasLimitedProfessionalReport } from "@/lib/access";
import type { AppUser } from "@/lib/access";
import type { LimitedProfessionalReport, LimitedRanking } from "@/lib/professionalReportAccess";
type ReportItem = LimitedProfessionalReport & { totalProfit?: number; companyRevenue?: number; professionalValue?: number; averageTicket?: number; closedPatientCount?: number };
import type { MonthlyGoals } from "@/lib/database";
import type { Appointment, FinancialEntry, Patient, Procedure, Professional, Service } from "@/lib/types";

export function ProfessionalReportView(props: {
  user: AppUser; entries: FinancialEntry[]; appointments: Appointment[]; professionals: Professional[];
  patients: Patient[]; services: Service[]; procedures: Procedure[]; monthlyGoals: MonthlyGoals[];
  selectedMonth: string; setSelectedMonth: (month: string) => void;
}) {
  const initial = reportMonthPeriod(props.selectedMonth) ?? { start: "", end: "" };
  const [mode, setMode] = useState("month"), [start, setStart] = useState(initial.start), [end, setEnd] = useState(initial.end);
  const [expanded, setExpanded] = useState<string[]>([]), [visibleFinancials, setVisibleFinancials] = useState<string[]>([]);
  const [showAllFinancials, setShowAllFinancials] = useState(false);
  const period = mode === "month" ? reportMonthPeriod(props.selectedMonth) ?? { start: "", end: "" } : { start, end };
  const { start: periodStart, end: periodEnd } = period;
  const limited = hasLimitedProfessionalReport(props.user);
  const scopeKey = JSON.stringify([props.user.id ?? props.user.login, props.user.revision, professionalScope(props.user)?.professionalIds]);
  const queryKey = JSON.stringify([scopeKey, periodStart, periodEnd]);
  const [remote, setRemote] = useState<{ key: string; valid: boolean; reports: LimitedProfessionalReport[]; error?: string } | null>(null);
  const fullData = useMemo(() => limited ? { valid: true, reports: [] } : professionalReports({ ...props, start: periodStart, end: periodEnd }), [props, limited, periodStart, periodEnd]);
  useEffect(() => {
    if (!limited) return;
    const controller = new AbortController();
    fetch(`/api/reports/professionals?${new URLSearchParams({ start: periodStart, end: periodEnd })}`, { cache: "no-store", signal: controller.signal }).then(async response => {
      const result = await response.json(); if (!response.ok) throw new Error(result.error ?? "Não foi possível consultar o relatório.");
      if (!controller.signal.aborted) setRemote({ key: queryKey, valid: result.valid, reports: result.reports });
    }).catch(error => { if (!controller.signal.aborted) setRemote({ key: queryKey, valid: false, reports: [], error: error.message }); });
    return () => controller.abort();
  }, [limited, queryKey, periodStart, periodEnd]);
  const pending = limited && remote?.key !== queryKey;
  const error = limited && remote?.key === queryKey ? remote.error : undefined;
  const data: { valid: boolean; reports: ReportItem[] } = limited ? remote?.key === queryKey ? remote : { valid: true, reports: [] } : fullData;
  const toggle = (items: string[], id: string) => items.includes(id) ? items.filter(item => item !== id) : [...items, id];
  function changeMonth(month: string) {
    props.setSelectedMonth(month); const next = reportMonthPeriod(month);
    if (next) { setStart(next.start); setEnd(next.end); }
  }
  return <div className="space-y-4">
    <section className="rounded-2xl bg-white p-5 shadow-panel">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div><div className="flex items-center gap-2"><BarChart3 size={22} className="text-avvi-blue"/><h3 className="text-xl font-bold">Relatório por Profissional</h3></div><p className="mt-1 text-sm text-slate-500">{limited ? "Rankings individuais e metas dos profissionais autorizados para sua conta." : "Profissionais ordenados pelo faturamento. Abra os rankings individuais para explorar os resultados."}</p></div>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs font-semibold text-slate-600">Período<select aria-label="Tipo de período do relatório profissional" className="input mt-1" value={mode} onChange={event => setMode(event.target.value)}><option value="month">Por mês</option><option value="range">Intervalo de datas</option></select></label>
          {mode === "month" ? <label className="text-xs font-semibold text-slate-600">Mês<input aria-label="Mês do relatório profissional" type="month" className="input mt-1" value={props.selectedMonth} onChange={event => changeMonth(event.target.value)}/></label> : <><label className="text-xs font-semibold text-slate-600">Início<input aria-label="Data inicial do relatório profissional" type="date" className="input mt-1" value={start} onChange={event => setStart(event.target.value)}/></label><label className="text-xs font-semibold text-slate-600">Fim<input aria-label="Data final do relatório profissional" type="date" className="input mt-1" value={end} onChange={event => setEnd(event.target.value)}/></label></>}
        </div>
      </div>
      {!limited && <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-avvi-line pt-4"><button type="button" className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-avvi-blue/30 bg-avvi-soft px-3 py-2 text-sm font-semibold text-avvi-blue hover:bg-avvi-blue/15" aria-pressed={showAllFinancials} onClick={() => { setShowAllFinancials(!showAllFinancials); setVisibleFinancials([]); }}>{showAllFinancials ? <EyeOff size={16}/> : <Eye size={16}/>} {showAllFinancials ? "Ocultar valores de todos" : "Mostrar valores de todos"}</button></div>}
      {!limited && !data.valid && <p role="alert" className="mt-3 text-sm text-red-600">Informe um período válido, com a data final igual ou posterior à inicial.</p>}
    </section>
    {pending && <p role="status" className="p-4 text-sm text-slate-500">Carregando relatório autorizado…</p>}
    {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="grid items-start gap-4 xl:grid-cols-2">
      {data.reports.map((item, index) => {
        const id = item.professional.id, name = item.professional.name, isExpanded = expanded.includes(id), showValues = !limited && (showAllFinancials || visibleFinancials.includes(id));
        const progress = item.goal > 0 ? Math.max(0, Math.min(100, item.totalPaid / item.goal * 100)) : 0;
        return <section key={id} aria-label={`Relatório de ${name}`} className={`min-w-0 overflow-hidden rounded-2xl bg-white shadow-panel ${isExpanded ? "xl:col-span-2" : ""}`}>
          <button type="button" className="flex w-full items-center gap-3 p-5 text-left hover:bg-avvi-soft/40 focus-visible:outline-avvi-blue" aria-label={`Rankings de ${name}`} aria-expanded={isExpanded} aria-controls={`professional-rankings-${id}`} onClick={() => setExpanded(toggle(expanded, id))}>
            <span className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-avvi-soft text-lg font-bold text-avvi-blue">{item.professional.avatarDataUrl ? <Image src={item.professional.avatarDataUrl} alt={`Foto de ${name}`} width={44} height={44} unoptimized className="h-full w-full rounded-full object-cover"/> : name[0]}</span>
            <span className="min-w-0 flex-1"><span className="block text-lg font-bold">{index + 1}. {name}</span><span className="mt-1 block text-xs text-slate-500">{item.serviceCount.toLocaleString("pt-BR")} serviços realizados · {item.count} registros financeiros</span></span><ChevronDown size={20} className={`shrink-0 text-avvi-blue transition-transform ${isExpanded ? "rotate-180" : ""}`}/>
          </button>
          <div className="px-5 pb-5">
            <div className="rounded-xl bg-avvi-soft/50 p-3"><div className="flex flex-wrap justify-between gap-2 text-sm"><span className="text-slate-600">Total pago pelos clientes</span><strong data-testid={`professional-total-paid-${id}`}>{currency(item.totalPaid)}</strong></div><div className="mt-3 flex justify-between gap-2 text-xs text-slate-500"><span>Meta: {currency(item.goal)}</span><strong>{percent(progress)}</strong></div><div aria-hidden className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-avvi-blue" style={{ width: `${progress}%` }}/></div></div>
            {item.monthlyInsights && <MonthlyInsights name={name} values={item.monthlyInsights}/>}
            {limited && <div className="mt-3 rounded-xl border border-avvi-line p-3 text-sm"><FinancialLine label="Ticket médio" value={item.averageTicket ?? 0} tone="slate"/><p className="mt-2 text-[11px] text-slate-500">Total pago ÷ {item.closedPatientCount} {item.closedPatientCount === 1 ? "paciente com conta fechada" : "pacientes com conta fechada"} no período. Cada paciente conta uma vez.</p></div>}
            {!limited && <button type="button" className="mt-3 flex items-center gap-2 text-sm font-semibold text-avvi-blue disabled:opacity-70" disabled={showAllFinancials} aria-expanded={showValues} aria-controls={`professional-financials-${id}`} onClick={() => setVisibleFinancials(toggle(visibleFinancials, id))}>{showValues ? <EyeOff size={16}/> : <Eye size={16}/>} {showValues ? "Ocultar valores financeiros" : "Ver valores financeiros"}</button>}
            {showValues && <div id={`professional-financials-${id}`} aria-label={`Valores financeiros de ${name}`} role="region" className="mt-3 space-y-3 rounded-xl border border-avvi-line p-4 text-sm"><FinancialLine label="Lucro total" value={item.totalProfit ?? 0} tone="green"/><FinancialLine label="Receita da empresa" value={item.companyRevenue ?? 0} tone="gold"/><FinancialLine label="Valor recebido pelo profissional" value={item.professionalValue ?? 0} tone="blue"/><FinancialLine label="Ticket médio" value={item.averageTicket ?? 0} tone="slate"/><p className="text-[11px] text-slate-500">Total pago ÷ {item.closedPatientCount} {item.closedPatientCount === 1 ? "paciente com conta fechada" : "pacientes com conta fechada"} no período. Cada paciente conta uma vez.</p></div>}
            <button type="button" className="mt-4 flex items-center gap-2 text-xs font-semibold text-slate-500" aria-expanded={isExpanded} aria-controls={`professional-rankings-${id}`} onClick={() => setExpanded(toggle(expanded, id))}><Trophy size={15} className="text-avvi-blue"/>{isExpanded ? "Ocultar rankings individuais" : "Ver rankings individuais"}</button>
          </div>
          {isExpanded && <div id={`professional-rankings-${id}`} role="region" aria-label={`Rankings individuais de ${name}`} className="grid gap-4 border-t border-avvi-line bg-slate-50/60 p-4 sm:grid-cols-2"><IndividualTable title="Serviços mais realizados" rows={item.services} metric="Quantidade" money={false}/><IndividualTable title="Pacientes por faturamento" rows={item.patientRevenue} metric="Faturamento" money/><IndividualTable title="Produtos mais utilizados" rows={item.products} metric="Quantidade" money={false}/><IndividualTable title="Pacientes por serviços realizados" rows={item.patientServices} metric="Serviços" money={false}/></div>}
        </section>;
      })}
    </div>
    {!pending && !error && !data.reports.length && <p className="rounded-xl bg-white p-6 text-center text-sm text-slate-500">{limited ? "Nenhum profissional autorizado disponível." : "Nenhum profissional cadastrado."}</p>}
  </div>;
}
function MonthlyInsights({name, values}: {name: string; values: MonthlyProfessionalInsights}) {
  const number = (value: number) => value.toLocaleString("pt-BR", {maximumFractionDigits: 2});
  const month = new Intl.DateTimeFormat("pt-BR", {month: "long", year: "numeric"}).format(new Date(`${values.month}-01T12:00:00`));
  const ticket = values.ticketChangePercent === null ? "Sem base no mês anterior" : `${values.ticketChangePercent > 0 ? "+" : values.ticketChangePercent < 0 ? "−" : ""}${number(Math.abs(values.ticketChangePercent))}%`;
  return <div role="region" aria-label={`Indicadores mensais de ${name}`} className="mt-3 rounded-xl border border-avvi-line p-3">
    <p className="mb-2 text-[10px] font-semibold capitalize text-slate-500">{month}</p>
    <div className="space-y-2 text-xs">
      <InsightLine label="Ticket médio vs. mês anterior" change={values.ticketChange} value={ticket}/>
      <div title="Pacientes únicos com conta fechada e valor positivo, comparados ao mês anterior. Retornos e avaliações zerados não entram.">
        <InsightLine label="Pacientes atendidos" change={values.patientChange} value={<><span>{number(values.patientCount)}</span><span className="text-[10px] font-normal text-slate-500">· Pacientes no mês anterior: {number(values.previousPatientCount)}</span></>}/>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2" title="Primeira conta fechada e não zerada com esta profissional."><span className="text-slate-600">Pacientes novos</span><strong className="inline-flex items-center gap-1 text-avvi-blue"><UserPlus size={14}/>{values.newPatientCount}</strong></div>
      <div className="flex flex-wrap items-center justify-between gap-2" title="Pacientes únicos que realizaram avaliação no mês e não fecharam outro serviço com esta profissional no mesmo mês."><span className="text-slate-600">Pacientes só de avaliação</span><strong className="text-avvi-blue">{values.evaluationOnlyPatientCount}</strong></div>
      <div className="flex flex-wrap items-center justify-between gap-2" title="Quantidade de retornos realizados no mês, incluindo os gratuitos."><span className="text-slate-600">Retornos realizados</span><strong className="text-avvi-blue">{values.returnCount}</strong></div>
    </div>
  </div>;
}
function InsightLine({label, change, value, title}: {label: string; change: number | null; value: ReactNode; title?: string}) {
  const color = change === null || change === 0 ? "text-slate-500" : change > 0 ? "text-green-600" : "text-red-600";
  return <div className="flex flex-wrap items-center justify-between gap-2" title={title}><span className="text-slate-600">{label}</span><strong className={`inline-flex max-w-full flex-wrap items-center gap-1 ${color}`} data-testid={`insight-${label}`}>
    {change === null || change === 0 ? <Minus size={14} className="shrink-0"/> : change > 0 ? <TrendingUp size={14} className="shrink-0"/> : <TrendingDown size={14} className="shrink-0"/>}{value}
  </strong></div>;
}
function FinancialLine({ label, value, tone }: { label: string; value: number; tone: "green" | "gold" | "blue" | "slate" }) {
  const colors = { green: "text-avvi-green", gold: "text-avvi-gold", blue: "text-blue-600", slate: "text-avvi-ink" };
  return <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-slate-600">{label}</span><strong className={colors[tone]}>{currency(value)}</strong></div>;
}
function IndividualTable({ title, rows, metric, money, hideMetric = false }: { title: string; rows: LimitedRanking[]; metric: string; money: boolean; hideMetric?: boolean }) {
  return <section aria-label={title} className="min-w-0 overflow-hidden rounded-xl border border-avvi-line bg-white"><header className="flex items-center justify-between gap-2 border-b border-avvi-line p-3"><h4 className="text-sm font-bold">{title}</h4><span className="shrink-0 rounded-full bg-avvi-soft px-2 py-1 text-[10px] font-bold text-avvi-blue">Top 5</span></header>{rows.length ? <table className="w-full table-fixed text-xs"><thead className="bg-avvi-soft/50 text-slate-500"><tr><th className="w-7 py-2">#</th><th className="px-2 py-2 text-left">{title.startsWith("Serviços") ? "Serviço" : title.startsWith("Produtos") ? "Produto" : "Paciente"}</th>{!hideMetric && <th className="w-24 px-2 py-2 text-right">{metric}</th>}</tr></thead><tbody>{rows.map((row, index) => <tr key={row.id} className="border-t border-avvi-line"><td className="py-3 text-center text-slate-400">{index + 1}</td><td className="break-words px-2 py-3 font-semibold">{row.name}</td>{!hideMetric && <td className="px-2 py-3 text-right font-bold">{money ? currency(row.value ?? 0) : (row.value ?? 0).toLocaleString("pt-BR")}</td>}</tr>)}</tbody></table> : <p className="p-4 text-xs text-slate-500">Nenhum registro neste período.</p>}</section>;
}
