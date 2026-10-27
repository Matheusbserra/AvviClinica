"use client";
import { addMonths, eachDayOfInterval, endOfMonth, format, getDate, isSameDay, parseISO, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";

// One calendar shared by Agenda and Pós-procedimento, with the same month/day navigation.
export function MonthCalendar({ date, onChange, onDaySelected, label = "Calendário" }: { date: string; onChange: (date: string) => void; onDaySelected?: () => void; label?: string }) {
  const selected = parseISO(`${date}T00:00:00`);
  const days = eachDayOfInterval({ start: startOfMonth(selected), end: endOfMonth(selected) });
  return <section role="region" aria-label={label} data-selected-date={date} className="rounded-lg border border-avvi-line bg-white p-2.5 shadow-sm">
    <div className="mb-2 flex items-center justify-between gap-1 text-[11px]"><button type="button" className="rounded p-1 hover:bg-avvi-soft" onClick={() => onChange(format(addMonths(selected, -1), "yyyy-MM-dd"))} title="Mês anterior"><ChevronLeft size={13}/></button><strong>{format(selected, "MMM yyyy", { locale: ptBR })}</strong><button type="button" className="rounded p-1 hover:bg-avvi-soft" onClick={() => onChange(format(addMonths(selected, 1), "yyyy-MM-dd"))} title="Próximo mês"><ChevronRight size={13}/></button></div>
    <div className="grid grid-cols-7 gap-0.5 text-center text-[9px] text-slate-500">
      {["D", "S", "T", "Q", "Q", "S", "S"].map((day, index) => <span key={index}>{day}</span>)}
      {Array.from({ length: startOfMonth(selected).getDay() }, (_, index) => <span key={`blank-${index}`}/>)}
      {days.map(day => <button type="button" aria-label={`Selecionar dia ${format(day, "dd/MM/yyyy")}`} aria-pressed={isSameDay(day, selected)} key={format(day, "yyyy-MM-dd")} onClick={() => { onChange(format(day, "yyyy-MM-dd")); onDaySelected?.(); }} className={`h-5 min-w-0 rounded text-[10px] ${isSameDay(day, selected) ? "bg-avvi-blue font-bold text-white" : "hover:bg-avvi-soft"}`}>{getDate(day)}</button>)}
    </div>
  </section>;
}
