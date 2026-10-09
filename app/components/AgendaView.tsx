"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { addDays, addMonths, eachDayOfInterval, endOfMonth, format, getDate, isSameDay, parseISO, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Plus, X, Eye, CircleDollarSign, Ban } from "lucide-react";
import { appointmentServices } from "@/lib/appointmentServices";
import type { Appointment, AppointmentStatus, FinancialEntry, Patient, Procedure, Professional, Service, ViewMode } from "@/lib/types";

const hours = Array.from({ length: 13 }, (_, index) => index + 8);
function statusColors(status: AppointmentStatus) {
  if (status === "Finalizado") return "bg-orange-100 border-orange-500 text-orange-950";
  if (status === "Confirmado" || status === "Compareceu") return "bg-green-100 border-green-500 text-green-950";
  if (status === "Cancelado" || status === "Faltou" || status === "Reagendado") return "bg-red-100 border-red-500 text-red-950";
  return "bg-blue-100 border-blue-500 text-blue-950";
}

type Props = {
  viewMode: ViewMode; setViewMode: (mode: ViewMode) => void;
  selectedDate: string; setSelectedDate: (date: string) => void;
  professionalFilter: string; setProfessionalFilter: (value: string) => void;
  appointments: Appointment[]; entries: FinancialEntry[]; patients: Patient[];
  procedures: Procedure[]; services: Service[]; professionals: Professional[]; visibleProfessionals: Professional[];
  openSlot: (hour: number, professionalId: string) => void; openAppointment: (id: string) => void;
  updateStatus: (id: string, status: "Confirmado" | "Cancelado") => void;
  openAccount: (id: string) => void; viewAccount: (id: string) => void;
};

export function AgendaView(props: Props) {
  const [menu, setMenu] = useState<{ appointmentId: string; left: number; top: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!menu) return;
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    function dismiss(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setMenu(null);
    }
    function close() { setMenu(null); }
    function escape(event: KeyboardEvent) {
      if (event.key === "Escape") { close(); triggerRef.current?.focus(); }
    }
    document.addEventListener("pointerdown", dismiss);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      document.removeEventListener("pointerdown", dismiss);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);
  function showMenu(appointmentId: string, element: HTMLButtonElement) {
    const rect = element.getBoundingClientRect();
    triggerRef.current = element;
    const width = 190;
    setMenu({ appointmentId, left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 188)) });
  }
  function menuAction(action: () => void) { triggerRef.current?.focus({ preventScroll: true }); setMenu(null); setSlotList(null); action(); }
  function navigateMenu(event: React.KeyboardEvent<HTMLDivElement>) {
    const buttons = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const index = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
        : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[index]?.focus();
    }
  }
  const gridRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [professionalPage, setProfessionalPage] = useState(0);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [slotList, setSlotList] = useState<{ professionalId: string; hour: number; page: number } | null>(null);
  useEffect(() => {
    const element = gridRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const selected = parseISO(`${props.selectedDate}T00:00:00`);
  const days = eachDayOfInterval({ start: startOfMonth(selected), end: endOfMonth(selected) });
  const columnsPerPage = Math.max(1, Math.floor((size.width - 34) / 148));
  const pageCount = Math.max(1, Math.ceil(props.visibleProfessionals.length / columnsPerPage));
  const page = Math.min(professionalPage, pageCount - 1);
  const visible = props.visibleProfessionals.slice(page * columnsPerPage, (page + 1) * columnsPerPage);
  const rowHeight = Math.max(0, (size.height - 56) / hours.length);
  const compactRows = rowHeight < 29;
  const patientNames = new Map(props.patients.map((patient) => [patient.id, patient.name]));
  const procedureNames = new Map(props.procedures.map((procedure) => [procedure.id, procedure.name]));
  const closedAppointments = new Set(props.entries.filter((entry) => entry.accountClosed).map((entry) => entry.appointmentId));
  const closedEntries = new Set(props.entries.filter((entry) => entry.accountClosed).map((entry) => entry.id));
  const isClosed = (appointment: Appointment) => appointment.accountClosed || closedAppointments.has(appointment.id) || closedEntries.has(appointment.financialEntryId ?? "");
  const menuAppointment = menu ? props.appointments.find((appointment) => appointment.id === menu.appointmentId) : undefined;
  const patientName = (appointment: Appointment) => patientNames.get(appointment.patientId ?? "") ?? "Paciente";
  const serviceName = (appointment: Appointment) => appointmentServices(appointment, props.services).map((service) => service.name).join(" · ") || procedureNames.get(appointment.procedureId ?? "") || "Sem serviço";
  const dailyAppointments = props.appointments.filter((appointment) => appointment.startsAt.startsWith(props.selectedDate)).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const appointmentsAt = (professionalId: string, hour: number) => dailyAppointments.filter((appointment) => appointment.professionalId === professionalId && Number(appointment.startsAt.slice(11, 13)) === hour);
  const listedAppointments = slotList ? appointmentsAt(slotList.professionalId, slotList.hour) : [];
  const listPages = Math.max(1, Math.ceil(listedAppointments.length / 4));
  const listPage = Math.min(slotList?.page ?? 0, listPages - 1);
  function changeDate(date: string) { props.setSelectedDate(date); setSlotList(null); }
  const controls = <>
    <section className="rounded-lg border border-avvi-line bg-white p-2.5 shadow-sm">
      <div className="mb-2 flex items-center justify-between gap-1 text-[11px]"><button type="button" className="rounded p-1 hover:bg-avvi-soft" onClick={() => changeDate(format(addMonths(selected, -1), "yyyy-MM-dd"))} title="Mês anterior"><ChevronLeft size={13} /></button><strong>{format(selected, "MMM yyyy", { locale: ptBR })}</strong><button type="button" className="rounded p-1 hover:bg-avvi-soft" onClick={() => changeDate(format(addMonths(selected, 1), "yyyy-MM-dd"))} title="Próximo mês"><ChevronRight size={13} /></button></div>
      <div className="grid grid-cols-7 gap-0.5 text-center text-[9px] text-slate-500">
        {["D", "S", "T", "Q", "Q", "S", "S"].map((day, index) => <span key={index}>{day}</span>)}
        {Array.from({ length: startOfMonth(selected).getDay() }, (_, index) => <span key={`blank-${index}`} />)}
        {days.map((day) => <button type="button" aria-label={`Selecionar dia ${format(day, "dd/MM/yyyy")}`} key={day.toISOString()} onClick={() => { changeDate(format(day, "yyyy-MM-dd")); setControlsOpen(false); }} className={`h-5 min-w-0 rounded text-[10px] ${isSameDay(day, selected) ? "bg-avvi-blue font-bold text-white" : "hover:bg-avvi-soft"}`}>{getDate(day)}</button>)}
      </div>
    </section>
    <section className="space-y-2 rounded-lg border border-avvi-line bg-white p-2.5 shadow-sm">
      <label className="block text-[10px] font-semibold text-slate-500">Profissional<select aria-label="Filtrar profissional da agenda" value={props.professionalFilter} onChange={(event) => { props.setProfessionalFilter(event.target.value); setProfessionalPage(0); }} className="mt-1 w-full min-w-0 rounded border border-avvi-line bg-white px-1.5 py-1.5 text-[11px]"><option value="todos">Todos</option>{props.professionals.map((professional) => <option key={professional.id} value={professional.id}>{professional.name}</option>)}</select></label>
      <div><p className="mb-1 text-[10px] font-semibold text-slate-500">Visão</p><div className="grid grid-cols-3 gap-1">{(["Dia", "Semana", "Mês"] as ViewMode[]).map((mode) => <button type="button" key={mode} onClick={() => props.setViewMode(mode)} className={`rounded px-1 py-1.5 text-[10px] font-semibold ${props.viewMode === mode ? "bg-avvi-blue text-white" : "bg-slate-100 text-slate-600"}`}>{mode}</button>)}</div></div>
      <div className="space-y-1 border-t border-avvi-line pt-2 text-[9px] text-slate-500">{[["bg-blue-200", "Agendado"], ["bg-green-200", "Confirmado / compareceu"], ["bg-red-200", "Cancelado / faltou / reagendado"], ["bg-orange-200", "Finalizado"]].map(([color, label]) => <p key={label} className="flex items-center gap-1.5"><span className={`h-2 w-2 shrink-0 rounded ${color}`} />{label}</p>)}</div>
    </section>
  </>;
  return <div data-testid="agenda-layout" className="grid min-h-0 min-w-0 flex-1 gap-2 overflow-hidden md:grid-cols-[164px_minmax(0,1fr)]">
    <aside aria-label="Calendário e filtros" className="hidden min-h-0 space-y-2 md:block">{controls}</aside>
    <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-avvi-line bg-white shadow-panel">
      <div className="flex shrink-0 items-center gap-1.5 border-b border-avvi-line p-2">
        <button type="button" aria-label="Abrir calendário e filtros" onClick={() => setControlsOpen(true)} className="rounded border border-avvi-line p-1.5 md:hidden"><CalendarDays size={15} /></button>
        <button type="button" title="Dia anterior" onClick={() => changeDate(format(addDays(selected, -1), "yyyy-MM-dd"))} className="rounded border border-avvi-line p-1"><ChevronLeft size={14} /></button>
        <div className="min-w-0 text-center text-[11px] font-bold"><span className="block whitespace-nowrap">{format(selected, "dd MMM yyyy", { locale: ptBR })}</span><span className="block truncate text-[9px] font-normal text-slate-500">{format(selected, "EEEE", { locale: ptBR })}</span></div>
        <button type="button" title="Próximo dia" onClick={() => changeDate(format(addDays(selected, 1), "yyyy-MM-dd"))} className="rounded border border-avvi-line p-1"><ChevronRight size={14} /></button>
        <button type="button" onClick={() => { const professional = props.visibleProfessionals.find((item) => item.active); if (professional) props.openSlot(8, professional.id); }} disabled={!props.visibleProfessionals.some((item) => item.active)} className="ml-auto flex shrink-0 items-center gap-1 rounded bg-avvi-blue px-2 py-1.5 text-[11px] font-bold text-white disabled:opacity-30"><Plus size={13} />Agendar</button>
      </div>
      <div className="flex shrink-0 justify-end border-b border-avvi-line px-2 py-0.5">

        <div className="flex shrink-0 items-center gap-1 text-[9px] text-slate-500"><button type="button" aria-label="Profissionais anteriores" disabled={page === 0} onClick={() => setProfessionalPage(page - 1)} className="rounded border border-avvi-line p-1 disabled:opacity-25"><ChevronLeft size={12} /></button><span data-testid="professional-page">{props.visibleProfessionals.length ? `${page * columnsPerPage + 1}–${Math.min((page + 1) * columnsPerPage, props.visibleProfessionals.length)}` : "0"} de {props.visibleProfessionals.length}</span><button type="button" aria-label="Próximos profissionais" disabled={page === pageCount - 1} onClick={() => setProfessionalPage(page + 1)} className="rounded border border-avvi-line p-1 disabled:opacity-25"><ChevronRight size={12} /></button></div>
      </div>
      <div ref={gridRef} data-testid="agenda-grid" className="grid min-h-0 min-w-0 flex-1 overflow-hidden" style={{ gridTemplateColumns: `34px repeat(${Math.max(1, visible.length)}, minmax(0, 1fr))`, gridTemplateRows: `56px repeat(${hours.length}, minmax(0, 1fr))` }}>
        <div className="border-b border-avvi-line" />
        {visible.map((professional) => <div key={professional.id} data-testid={`professional-${professional.id}`} title={`${professional.name} · ${professional.specialty}`} className="flex min-w-0 items-center gap-2 overflow-hidden border-b border-l border-avvi-line px-2"><span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full text-sm font-bold text-white" style={{ background: professional.color }}>{professional.avatarDataUrl ? <Image src={professional.avatarDataUrl} alt={`Foto de ${professional.name}`} width={36} height={36} className="h-full w-full object-cover" unoptimized /> : professional.name.slice(0, 1)}</span><div className="min-w-0"><p className="truncate text-sm font-bold leading-tight">{professional.name}</p><p className="mt-0.5 truncate text-[10px] leading-tight text-slate-500">{professional.specialty}</p></div></div>)}
        {!visible.length && <div className="min-w-0 border-b border-avvi-line px-2 py-2 text-[10px] text-slate-500">Nenhum profissional</div>}
        {hours.map((hour) => <Fragment key={hour}>
          <div data-testid={`agenda-hour-${hour}`} className="flex min-h-0 items-center justify-center overflow-hidden border-b border-avvi-line bg-slate-50 text-[10px] text-slate-500">{hour}h</div>
          {visible.map((professional) => {
            const appointments = appointmentsAt(professional.id, hour);
            const appointment = appointments[0];
            return <div key={`${professional.id}-${hour}`} className="relative min-h-0 min-w-0 overflow-hidden border-b border-l border-avvi-line p-0.5">
              {appointment ? <>
                <button type="button" onClick={(event) => showMenu(appointment.id, event.currentTarget)} onContextMenu={(event) => { event.preventDefault(); showMenu(appointment.id, event.currentTarget); }} aria-haspopup="menu" aria-expanded={menu?.appointmentId === appointment.id} data-testid={`appointment-${appointment.id}`} data-status={appointment.status} aria-label={`${patientName(appointment)}, ${serviceName(appointment)}, ${appointment.status}`} title={`${appointment.startsAt.slice(11, 16)} · ${patientName(appointment)} · ${serviceName(appointment)} · ${appointment.status}`} className={`flex h-full w-full min-w-0 flex-col justify-center overflow-hidden rounded border-l-[3px] px-1 text-left ${statusColors(appointment.status)}`}>
                  <span className={`flex min-w-0 items-center gap-1 font-bold ${compactRows ? "text-[9px]" : "text-[10px]"} ${appointments.length > 1 ? "pr-7" : ""}`}><span className="truncate">{patientName(appointment)}</span>{isClosed(appointment) && <CheckCircle2 size={12} aria-label="Conta fechada" className="shrink-0 text-green-600" />}</span>
                  {!compactRows && <span className="block w-full truncate text-[9px] text-slate-600">{serviceName(appointment)} · {appointment.status}</span>}
                </button>
                {appointments.length > 1 && <button type="button" aria-label={`Ver ${appointments.length} pacientes às ${hour}h com ${professional.name}`} onClick={() => setSlotList({ professionalId: professional.id, hour, page: 0 })} className="absolute right-1 top-1 rounded bg-white/90 px-1 py-0.5 text-[9px] font-bold text-slate-600 shadow-sm">+{appointments.length - 1}</button>}
              </> : <button type="button" aria-label={`Agendar às ${hour}h com ${professional.name}`} onClick={() => props.openSlot(hour, professional.id)} className="h-full w-full rounded hover:bg-avvi-soft" />}
            </div>;
          })}
          {!visible.length && <div className="min-h-0 border-b border-avvi-line" />}
        </Fragment>)}
      </div>
    </section>
    {menu && menuAppointment && createPortal(<div ref={menuRef} role="menu" aria-label="Ações do agendamento" onKeyDown={navigateMenu} className="appointment-context-menu fixed z-[75] w-[190px] overflow-hidden rounded-md border border-slate-200 bg-white p-1 text-xs shadow-lg" style={{ left: menu.left, top: menu.top }}>
      <p className="truncate border-b border-slate-100 px-2 py-1.5 text-[10px] font-semibold text-slate-500">{patientName(menuAppointment)}</p>
      <button type="button" role="menuitem" onClick={() => menuAction(() => props.openAppointment(menuAppointment.id))} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-slate-700 hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"><Eye size={14} />Ver agendamento</button>
      <button type="button" role="menuitem" onClick={() => menuAction(() => props.updateStatus(menuAppointment.id, "Confirmado"))} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-green-700 hover:bg-green-50 focus:bg-green-50 focus:outline-none"><CheckCircle2 size={14} />Confirmado</button>
      <button type="button" role="menuitem" onClick={() => menuAction(() => props.updateStatus(menuAppointment.id, "Cancelado"))} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-red-600 hover:bg-red-50 focus:bg-red-50 focus:outline-none"><Ban size={14} />Cancelado</button>
      <button type="button" role="menuitem" onClick={() => menuAction(() => isClosed(menuAppointment) ? props.viewAccount(menuAppointment.id) : props.openAccount(menuAppointment.id))} className="flex w-full items-center gap-2 rounded border-t border-slate-100 px-2 py-2 text-left text-orange-600 hover:bg-orange-50 focus:bg-orange-50 focus:outline-none"><CircleDollarSign size={14} />{isClosed(menuAppointment) ? "Ver fechamento" : "Fechar conta"}</button>
    </div>, document.body)}
    {controlsOpen && <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-900/40 p-3"><section role="dialog" aria-modal="true" aria-label="Calendário e filtros da agenda" className="w-full max-w-xs rounded-xl bg-white p-3"><header className="mb-2 flex items-center justify-between text-sm font-bold">Calendário e filtros<button type="button" aria-label="Fechar calendário e filtros" onClick={() => setControlsOpen(false)} className="rounded p-1"><X size={18} /></button></header><div className="space-y-2">{controls}</div></section></div>}
    {slotList && <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-900/40 p-3"><section role="dialog" aria-modal="true" aria-label="Agendamentos deste horário" className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-panel">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-avvi-line p-3"><div><h3 className="text-sm font-bold">{slotList.hour}h · {props.professionals.find((professional) => professional.id === slotList.professionalId)?.name}</h3><p className="text-[11px] text-slate-500">{format(selected, "dd/MM/yyyy")} · {listedAppointments.length} pacientes</p></div><button type="button" aria-label="Fechar lista de agendamentos" onClick={() => setSlotList(null)} className="rounded p-1"><X size={18} /></button></header>
      <div className="min-h-0 space-y-2 overflow-y-auto p-3">{listedAppointments.slice(listPage * 4, (listPage + 1) * 4).map((appointment) => <button type="button" key={appointment.id} data-testid={`appointment-${appointment.id}`} onClick={(event) => showMenu(appointment.id, event.currentTarget)} onContextMenu={(event) => { event.preventDefault(); showMenu(appointment.id, event.currentTarget); }} aria-haspopup="menu" aria-expanded={menu?.appointmentId === appointment.id} className={`block w-full rounded border-l-4 p-2 text-left ${statusColors(appointment.status)}`}><span className="flex items-center gap-2 text-xs font-bold">{appointment.startsAt.slice(11, 16)} · {patientName(appointment)}{isClosed(appointment) && <CheckCircle2 size={14} aria-label="Conta fechada" className="text-green-600" />}</span><span className="block truncate text-[10px] text-slate-600">{serviceName(appointment)} · {appointment.status}</span></button>)}</div>
      <footer className="flex shrink-0 items-center justify-between border-t border-avvi-line p-3 text-xs"><span>{listPage + 1} de {listPages}</span><div className="flex gap-2"><button type="button" aria-label="Pacientes anteriores do horário" disabled={listPage === 0} onClick={() => setSlotList({ ...slotList, page: listPage - 1 })} className="rounded border border-avvi-line px-2 py-1 disabled:opacity-30">Anterior</button><button type="button" aria-label="Próximos pacientes do horário" disabled={listPage === listPages - 1} onClick={() => setSlotList({ ...slotList, page: listPage + 1 })} className="rounded border border-avvi-line px-2 py-1 disabled:opacity-30">Próxima</button></div></footer>
    </section></div>}
  </div>;
}
