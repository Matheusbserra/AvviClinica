"use client";

import { Fragment, useEffect, useLayoutEffect, useRef, useState } from "react";
import Image from "next/image";
import { createPortal } from "react-dom";
import { addDays, addMonths, eachDayOfInterval, endOfMonth, format, getDate, isSameDay, parseISO, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Plus, X, Eye, CircleDollarSign, Ban, Phone, User, Syringe, Info } from "lucide-react";
import { agendaHours, agendaSlots, slotTime, bookingDuration, isAbsence, overlappingAppointments, rectangleSlots, shiftClosed, slotAvailable } from "@/lib/agendaAvailability";
import type { AgendaSlot } from "@/lib/agendaAvailability";
import { agendaGroups } from "@/lib/agendaGroups";
import { appointmentServices } from "@/lib/appointmentServices";
import type { Appointment, AppointmentStatus, FinancialEntry, Patient, Procedure, Professional, Service, ViewMode } from "@/lib/types";

const hours = agendaHours;
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
  openSlot: (hour: number, professionalId: string, durationMinutes?: number) => void;
  markAbsent: (slots: AgendaSlot[]) => void; removeAbsence: (id: string) => void; openAppointment: (id: string) => void;
  updateStatus: (id: string, status: "Confirmado" | "Cancelado") => void;
  openAccount: (id: string) => void; viewAccount: (id: string) => void;
};

export function AgendaView(props: Props) {
  const [menu, setMenu] = useState<{ appointmentId: string; appointmentIds: string[]; left: number; top: number } | null>(null);
  const [hover, setHover] = useState<{ appointmentIds: string[]; left: number; top: number; bottom: number } | null>(null);
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hoverRef = useRef<HTMLDivElement>(null);
  function clearHoverTimers() { if (hoverTimer.current) clearTimeout(hoverTimer.current); if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current); }
  function closeHover() { clearHoverTimers(); setHover(null); }
  function scheduleHover(element: HTMLButtonElement, appointmentIds: string[]) {
    if (menu || slotMenu) return;
    clearHoverTimers(); setHover(null);
    hoverTimer.current = setTimeout(() => {
      const rect = element.getBoundingClientRect();
      setHover({ appointmentIds, left: Math.max(8, Math.min(rect.left, window.innerWidth - 268)), top: rect.bottom + 6, bottom: rect.bottom });
    }, 1500);
  }
  function leaveHover() { if (hoverTimer.current) clearTimeout(hoverTimer.current); hoverCloseTimer.current = setTimeout(() => setHover(null), 180); }
  useEffect(() => {
    function close() { if (hoverTimer.current) clearTimeout(hoverTimer.current); if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current); setHover(null); }
    function escape(event: KeyboardEvent) { if (event.key === "Escape") close(); }
    window.addEventListener("resize", close); window.addEventListener("scroll", close, true); document.addEventListener("keydown", escape);
    return () => { close(); window.removeEventListener("resize", close); window.removeEventListener("scroll", close, true); document.removeEventListener("keydown", escape); };
  }, []);
  useLayoutEffect(() => {
    if (!hover || !hoverRef.current) return;
    const top = Math.max(8, Math.min(hover.bottom + 6, window.innerHeight - hoverRef.current.offsetHeight - 8));
    if (top !== hover.top) setHover({ ...hover, top });
  }, [hover]);
  const [slotMenu, setSlotMenu] = useState<{ left: number; top: number } | null>(null);
  const [selectedSlots, setSelectedSlots] = useState<AgendaSlot[]>([]);
  const [choosingProfessional, setChoosingProfessional] = useState(false);
  const dragCleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => dragCleanup.current?.(), []);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => {
    if (!menu && !slotMenu) return;
    menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
    function dismiss(event: PointerEvent) {
      if (!menuRef.current?.contains(event.target as Node)) { setMenu(null); setSlotMenu(null); setSelectedSlots([]); }
    }
    function close() { setMenu(null); setSlotMenu(null); setSelectedSlots([]); }
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
  }, [menu, slotMenu]);
  useLayoutEffect(() => {
    if (!menu || !menuRef.current || !triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const top = Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - menuRef.current.offsetHeight - 8));
    if (top !== menu.top) setMenu({ ...menu, top });
  }, [menu]);
  function showMenu(appointmentId: string, element: HTMLButtonElement, appointmentIds = [appointmentId]) {
    closeHover();
    const rect = element.getBoundingClientRect();
    triggerRef.current = element;
    const width = 190;
    setSlotMenu(null); setSelectedSlots([]);
    setMenu({ appointmentId, appointmentIds, left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 188)) });
  }
  function menuAction(action: () => void) { triggerRef.current?.focus({ preventScroll: true }); setMenu(null); setSlotMenu(null); setSelectedSlots([]); setChoosingProfessional(false); setSlotList(null); action(); }
  function navigateMenu(event: React.KeyboardEvent<HTMLDivElement>) {
    if ((event.target as HTMLElement).closest("select")) return;
    const buttons = [...(menuRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [])];
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const index = event.key === "Home" ? 0 : event.key === "End" ? buttons.length - 1
        : (current + (event.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length;
      buttons[index]?.focus();
    }
  }
  function showSlotMenu(element: HTMLButtonElement, slots: AgendaSlot[]) {
    if (!slots.length) return;
    triggerRef.current = element;
    const rect = element.getBoundingClientRect();
    setMenu(null); setChoosingProfessional(false); setSelectedSlots(slots);
    setSlotMenu({ left: Math.max(8, Math.min(rect.left, window.innerWidth - 230)), top: Math.max(8, Math.min(rect.bottom + 4, window.innerHeight - 155)) });
  }
  function selectSlot(event: React.PointerEvent<HTMLButtonElement>, slot: AgendaSlot) {
    if (event.button !== 0) return;
    event.preventDefault();
    closeHover();
    dragCleanup.current?.(); setMenu(null); setSlotMenu(null); setChoosingProfessional(false);
    const ids = visible.map(item => item.id), pointerId = event.pointerId;
    let slots = [slot], anchor = event.currentTarget;
    setSelectedSlots(slots);
    function move(pointer: PointerEvent) {
      if (pointer.pointerId !== pointerId) return;
      const cell = document.elementFromPoint(pointer.clientX, pointer.clientY)?.closest<HTMLElement>("[data-agenda-slot]");
      if (!cell || !gridRef.current?.contains(cell)) return;
      const target = { professionalId: cell.dataset.professionalId!, hour: Number(cell.dataset.hour) };
      slots = rectangleSlots(slot.date, ids, slot, target).filter(item => slotAvailable(props.professionals, props.appointments, item));
      const button = cell.querySelector<HTMLButtonElement>("button");
      if (button) anchor = button;
      setSelectedSlots(slots);
    }
    function cleanup() { document.removeEventListener("pointermove", move); document.removeEventListener("pointerup", finish); document.removeEventListener("pointercancel", cancel); document.removeEventListener("keydown", escape); dragCleanup.current = null; }
    function finish(pointer: PointerEvent) { if (pointer.pointerId !== pointerId) return; cleanup(); showSlotMenu(anchor, slots); }
    function cancel() { cleanup(); setSelectedSlots([]); }
    function escape(key: KeyboardEvent) { if (key.key === "Escape") cancel(); }
    document.addEventListener("pointermove", move); document.addEventListener("pointerup", finish); document.addEventListener("pointercancel", cancel); document.addEventListener("keydown", escape);
    dragCleanup.current = cleanup;
  }
  function bookSelection(professionalId: string) {
    const selection = selectedSlots.filter(item => slotAvailable(props.professionals, props.appointments, item));
    if (!selection.some(item => item.professionalId === professionalId)) return;
    const { hour, durationMinutes } = bookingDuration(selection, professionalId);
    menuAction(() => props.openSlot(hour, professionalId, durationMinutes));
  }
  const gridRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [professionalPage, setProfessionalPage] = useState(0);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [slotList, setSlotList] = useState<{ professionalId: string; hour: number; page: number; appointmentIds?: string[] } | null>(null);
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
  const compactRows = rowHeight < 38;
  const denseRows = rowHeight < 29;
  const patientNames = new Map(props.patients.map((patient) => [patient.id, patient.name]));
  const procedureNames = new Map(props.procedures.map((procedure) => [procedure.id, procedure.name]));
  const closedAppointments = new Set(props.entries.filter((entry) => entry.accountClosed).map((entry) => entry.appointmentId));
  const closedEntries = new Set(props.entries.filter((entry) => entry.accountClosed).map((entry) => entry.id));
  const isClosed = (appointment: Appointment) => appointment.accountClosed || closedAppointments.has(appointment.id) || closedEntries.has(appointment.financialEntryId ?? "");
  const menuAppointment = menu ? props.appointments.find((appointment) => appointment.id === menu.appointmentId) : undefined;
  const patientName = (appointment: Appointment) => isAbsence(appointment) ? "Ausente" : patientNames.get(appointment.patientId ?? "") ?? "Paciente";
  const serviceName = (appointment: Appointment) => appointmentServices(appointment, props.services).map((service) => service.name).join(" · ") || procedureNames.get(appointment.procedureId ?? "") || "Sem serviço";
  const appointmentsAt = (professionalId: string, hour: number) => overlappingAppointments(props.appointments, { date: props.selectedDate, professionalId, hour });
  const displayGroups = new Map(visible.map(professional => [professional.id, agendaGroups(props.appointments, props.selectedDate, professional.id)]));
  const hoverAppointments = hover ? props.appointments.filter(item => hover.appointmentIds.includes(item.id)) : [];
  const hoverAppointment = hoverAppointments[0];
  const hoverPatient = hoverAppointment ? props.patients.find(item => item.id === hoverAppointment.patientId) : undefined;
  const hoverStart = hoverAppointments.map(item => item.startsAt).sort()[0] ?? "";
  const hoverEnd = hoverAppointments.map(item => item.endsAt).sort().at(-1) ?? "";
  const previousVisit = hoverAppointment && props.appointments.some(item => item.patientId === hoverAppointment.patientId && !isAbsence(item) && item.startsAt < hoverStart && (isClosed(item) || item.status === "Compareceu" || item.status === "Finalizado"));
  const listedAppointments = slotList ? slotList.appointmentIds ? props.appointments.filter(item => slotList.appointmentIds!.includes(item.id)) : appointmentsAt(slotList.professionalId, slotList.hour) : [];
  const listPages = Math.max(1, Math.ceil(listedAppointments.length / 4));
  const listPage = Math.min(slotList?.page ?? 0, listPages - 1);
  function changeDate(date: string) { dragCleanup.current?.(); props.setSelectedDate(date); setSlotList(null); setMenu(null); setSlotMenu(null); setSelectedSlots([]); }
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
      <label className="block text-[10px] font-semibold text-slate-500">Profissional<select aria-label="Filtrar profissional da agenda" value={props.professionals.some(professional => professional.id === props.professionalFilter && professional.showInAgenda !== false) ? props.professionalFilter : "todos"} onChange={(event) => { props.setProfessionalFilter(event.target.value); setProfessionalPage(0); }} className="mt-1 w-full min-w-0 rounded border border-avvi-line bg-white px-1.5 py-1.5 text-[11px]"><option value="todos">Todos</option>{props.professionals.filter(professional => professional.showInAgenda !== false).map((professional) => <option key={professional.id} value={professional.id}>{professional.name}</option>)}</select></label>
      <div><p className="mb-1 text-[10px] font-semibold text-slate-500">Visão</p><div className="grid grid-cols-3 gap-1">{(["Dia", "Semana", "Mês"] as ViewMode[]).map((mode) => <button type="button" key={mode} onClick={() => props.setViewMode(mode)} className={`rounded px-1 py-1.5 text-[10px] font-semibold ${props.viewMode === mode ? "bg-avvi-blue text-white" : "bg-slate-100 text-slate-600"}`}>{mode}</button>)}</div></div>
      <div className="space-y-1 border-t border-avvi-line pt-2 text-[9px] text-slate-500">{[["bg-blue-200", "Agendado"], ["bg-green-200", "Confirmado / compareceu"], ["bg-red-200", "Cancelado / faltou / reagendado"], ["bg-orange-200", "Finalizado"], ["bg-slate-300", "Ausente"], ["bg-[#f0f7ff]", "Agenda fechada"]].map(([color, label]) => <p key={label} className="flex items-center gap-1.5"><span className={`h-2 w-2 shrink-0 rounded ${color}`} />{label}</p>)}</div>
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
        <button type="button" onClick={() => { const professional = props.visibleProfessionals.find((item) => item.active); if (professional) { const hour = agendaSlots.find(hour => slotAvailable(props.professionals, props.appointments, { date: props.selectedDate, professionalId: professional.id, hour })); if (hour !== undefined) props.openSlot(hour, professional.id); } }} disabled={!props.visibleProfessionals.some((item) => item.active)} className="ml-auto flex shrink-0 items-center gap-1 rounded bg-avvi-blue px-2 py-1.5 text-[11px] font-bold text-white disabled:opacity-30"><Plus size={13} />Agendar</button>
      </div>
      <div className="flex shrink-0 justify-end border-b border-avvi-line px-2 py-0.5">

        <div className="flex shrink-0 items-center gap-1 text-[9px] text-slate-500"><button type="button" aria-label="Profissionais anteriores" disabled={page === 0} onClick={() => { setProfessionalPage(page - 1); setMenu(null); setSlotMenu(null); setSelectedSlots([]); }} className="rounded border border-avvi-line p-1 disabled:opacity-25"><ChevronLeft size={12} /></button><span data-testid="professional-page">{props.visibleProfessionals.length ? `${page * columnsPerPage + 1}–${Math.min((page + 1) * columnsPerPage, props.visibleProfessionals.length)}` : "0"} de {props.visibleProfessionals.length}</span><button type="button" aria-label="Próximos profissionais" disabled={page === pageCount - 1} onClick={() => { setProfessionalPage(page + 1); setMenu(null); setSlotMenu(null); setSelectedSlots([]); }} className="rounded border border-avvi-line p-1 disabled:opacity-25"><ChevronRight size={12} /></button></div>
      </div>
      <div ref={gridRef} data-testid="agenda-grid" className="grid min-h-0 min-w-0 flex-1 overflow-hidden" style={{ gridTemplateColumns: `34px repeat(${Math.max(1, visible.length)}, minmax(0, 1fr))`, gridTemplateRows: `56px repeat(${agendaSlots.length}, minmax(0, 1fr))` }}>
        <div className="border-b border-avvi-line" />
        {visible.map((professional) => <div key={professional.id} data-testid={`professional-${professional.id}`} title={`${professional.name} · ${professional.specialty}`} className="flex min-w-0 items-center gap-2 overflow-hidden border-b border-l border-avvi-line px-2"><span className="grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full text-sm font-bold text-white" style={{ background: professional.color }}>{professional.avatarDataUrl ? <Image src={professional.avatarDataUrl} alt={`Foto de ${professional.name}`} width={36} height={36} className="h-full w-full object-cover" unoptimized /> : professional.name.slice(0, 1)}</span><div className="min-w-0"><p className="truncate text-sm font-bold leading-tight">{professional.name}</p><p className="mt-0.5 truncate text-[10px] leading-tight text-slate-500">{professional.specialty}</p></div></div>)}
        {!visible.length && <div className="min-w-0 border-b border-avvi-line px-2 py-2 text-[10px] text-slate-500">Nenhum profissional</div>}
        {agendaSlots.map((time, index) => <Fragment key={time}>
          {index % 2 === 0 && <div data-testid={`agenda-hour-${time}`} className="flex min-h-0 items-center justify-center overflow-hidden border-b border-avvi-line bg-slate-50 text-[10px] text-slate-500" style={{ gridRow: `${index + 2} / span 2`, gridColumn: 1 }}>{time}h</div>}
          {visible.map((professional, column) => {
            const group = displayGroups.get(professional.id)?.find(item => item.startIndex === index);
            const appointment = group?.appointments[0];
            const occupied = appointmentsAt(professional.id, time).length > 0;
            const slot = { date: props.selectedDate, professionalId: professional.id, hour: time };
            const closed = shiftClosed(professional, props.selectedDate, time);
            const selectedSlot = selectedSlots.some(item => item.date === slot.date && item.professionalId === slot.professionalId && item.hour === time);
            const fullHeight = !!group && group.slotCount > 1;
            const names = group ? [...new Set(group.appointments.map(serviceName))].join(" · ") : "";
            const statuses = group ? [...new Set(group.appointments.map(item => item.status))].join(" · ") : "";
            const otherPatients = group ? new Set(group.overlaps.filter(item => !group.appointments.some(own => own.id === item.id)).map(item => item.patientId ?? item.id)).size : 0;
            return <div key={`${professional.id}-${time}`} data-agenda-slot="true" data-hour={time} data-professional-id={professional.id} className={`relative min-h-0 min-w-0 border-b border-l border-avvi-line ${index % 2 === 0 ? "border-b-transparent hover:border-b-slate-300 focus-within:border-b-slate-300" : ""} ${selectedSlot ? "bg-avvi-soft ring-2 ring-inset ring-avvi-blue" : ""}`} style={{ gridRow: index + 2, gridColumn: column + 2 }}>
              {group && appointment ? <div data-testid="appointment-group" data-appointment-ids={group.appointments.map(item => item.id).join(",")} data-slot-count={group.slotCount} className="absolute left-0 top-0 z-10 w-full p-0.5" style={{ height: `calc(${group.slotCount * 100}% + ${group.slotCount - 1}px)` }}>
                <button type="button" onPointerEnter={event => { if (event.pointerType !== "touch" && !isAbsence(appointment)) scheduleHover(event.currentTarget, group.appointments.map(item => item.id)); }} onPointerLeave={leaveHover} aria-describedby={hover?.appointmentIds.includes(appointment.id) ? "agenda-patient-hover" : undefined} onClick={event => showMenu(appointment.id, event.currentTarget, group.appointments.map(item => item.id))} onContextMenu={event => { event.preventDefault(); showMenu(appointment.id, event.currentTarget, group.appointments.map(item => item.id)); }} aria-haspopup="menu" aria-expanded={!!menu && group.appointments.some(item => item.id === menu.appointmentId)} data-testid={`appointment-${appointment.id}`} data-status={appointment.status} data-compact={!fullHeight} aria-label={`${patientName(appointment)}, ${names}, ${statuses}`} className={`flex h-full w-full min-w-0 flex-col justify-center overflow-hidden rounded border-l-[3px] px-1 text-center ${isAbsence(appointment) ? "bg-slate-200 border-slate-400 text-slate-600" : statusColors(appointment.status)}`}>
                  <span data-testid="appointment-patient" className={`flex w-full min-w-0 shrink-0 items-center justify-center gap-1 font-bold ${fullHeight && group.slotCount > 2 ? "text-[10px] leading-[11px]" : denseRows ? "text-[7px] leading-[7px]" : compactRows ? "text-[8px] leading-[8px]" : "text-[10px] leading-[11px]"} ${otherPatients ? "px-6" : ""}`}><span className="truncate">{patientName(appointment)}</span>{group.appointments.every(isClosed) && <CheckCircle2 size={10} aria-label="Conta fechada" className="shrink-0 text-green-600" />}</span>
                  {fullHeight && <><span data-testid="appointment-service" className={`block w-full shrink-0 truncate text-slate-600 ${denseRows && group.slotCount === 2 ? "text-[7px] leading-[7px]" : compactRows && group.slotCount === 2 ? "text-[8px] leading-[8px]" : "text-[9px] leading-[11px]"}`}>{isAbsence(appointment) ? "Profissional ausente" : names}</span>
                  {!isAbsence(appointment) && <span data-testid="appointment-status" className={`block w-full shrink-0 text-center font-semibold ${denseRows && group.slotCount === 2 ? "text-[7px] leading-[7px]" : compactRows && group.slotCount === 2 ? "text-[8px] leading-[8px]" : "text-[9px] leading-[11px]"}`}>{statuses}</span>}</>}
                </button>
                {otherPatients > 0 && <button type="button" aria-label={`Ver outros pacientes às ${slotTime(time)} com ${professional.name}`} onClick={() => setSlotList({ professionalId: professional.id, hour: time, page: 0, appointmentIds: group.overlaps.map(item => item.id) })} className="absolute right-1 top-0.5 rounded bg-white/90 px-1 text-[9px] font-bold text-slate-600 shadow-sm">+{otherPatients}</button>}
              </div> : !occupied && <button type="button" aria-label={`Agendar às ${slotTime(time)} com ${professional.name}`} disabled={closed || !professional.active} onPointerDown={event => selectSlot(event, slot)} onClick={event => { if (event.detail === 0) showSlotMenu(event.currentTarget, [slot]); }} onContextMenu={event => { event.preventDefault(); if (!closed && professional.active) showSlotMenu(event.currentTarget, [slot]); }} aria-haspopup="menu" aria-expanded={!!slotMenu && selectedSlot} className={`h-full w-full touch-none select-none rounded text-[9px] ${closed ? "bg-[#f0f7ff] text-slate-400" : !professional.active ? "bg-slate-50 text-slate-400" : "hover:bg-avvi-soft"}`}>{closed ? "Agenda fechada" : !professional.active ? "Inativo" : null}</button>}
            </div>;
          })}
          {!visible.length && <div className="min-h-0 border-b border-avvi-line" style={{ gridRow: index + 2, gridColumn: 2 }} />}
        </Fragment>)}
      </div>
    </section>
    {hover && hoverAppointment && createPortal(<div ref={hoverRef} id="agenda-patient-hover" role="tooltip" data-testid="patient-hover-summary" onPointerEnter={() => { if (hoverCloseTimer.current) clearTimeout(hoverCloseTimer.current); }} onPointerLeave={leaveHover} className="fixed z-[70] max-h-[calc(100dvh-16px)] w-[260px] overflow-y-auto rounded-xl border border-slate-200 bg-white p-3 text-[11px] text-slate-600 shadow-xl" style={{ left: hover.left, top: hover.top }}>
      <p className="break-words text-center text-xs font-bold text-slate-900">{patientName(hoverAppointment)}</p>
      <p className="mt-0.5 text-center font-semibold text-slate-800">{hoverStart.slice(11,16)} – {hoverEnd.slice(11,16)}</p>
      <div className="mt-3 space-y-1.5">
        <p className="flex items-center gap-2"><Phone size={13} className="shrink-0 text-slate-500" />{hoverPatient?.phone || "Telefone não cadastrado"}</p>
        <p className="flex items-center gap-2"><User size={13} className="shrink-0 text-slate-500" />{props.professionals.find(item => item.id === hoverAppointment.professionalId)?.name || "Profissional"}</p>
        <p className="flex items-start gap-2"><Syringe size={13} aria-label="Serviço" className="mt-0.5 shrink-0 text-slate-500" /><span className="break-words">{[...new Set(hoverAppointments.map(serviceName))].join(" · ")}</span></p>
        <p className="pl-[21px] font-semibold">{[...new Set(hoverAppointments.map(item => item.status))].join(" · ")}</p>
      </div>
      <div className="mt-3 rounded-md bg-slate-50 p-2 text-[10px]">
        <p className="flex items-start gap-1.5"><Info size={13} className="mt-0.5 shrink-0 text-avvi-blue" /><span>{previousVisit ? "Paciente com atendimentos anteriores" : "Primeiro atendimento registrado"}</span></p>
        <p className="mt-1 break-words"><strong>Sobre o paciente:</strong> {hoverPatient?.notes || "Paciente da clínica"}</p>
      </div>
    </div>, document.body)}
    {menu && menuAppointment && createPortal(<div ref={menuRef} role="menu" aria-label="Ações do agendamento" onKeyDown={navigateMenu} className="appointment-context-menu fixed z-[75] w-[190px] max-h-[calc(100dvh-16px)] overflow-y-auto rounded-md border border-slate-200 bg-white p-1 text-xs shadow-lg" style={{ left: menu.left, top: menu.top }}>
      <div className="border-b border-slate-100 px-2 py-1.5 text-[10px] text-slate-500">
        <p className="break-words font-semibold text-slate-700">{patientName(menuAppointment)}</p>
        {!isAbsence(menuAppointment) && <><p data-testid="menu-appointment-service" className="mt-1 break-words">{serviceName(menuAppointment)}</p><p data-testid="menu-appointment-status" className="mt-1 font-semibold">{menuAppointment.status}</p></>}
        <p className="mt-1">{menuAppointment.startsAt.slice(11, 16)} – {menuAppointment.endsAt.slice(11, 16)}</p>
      </div>
      {menu.appointmentIds.length > 1 && <label className="block border-b border-slate-100 px-2 py-2 text-[10px] text-slate-500">Agendamento<select aria-label="Selecionar agendamento da paciente" value={menu.appointmentId} onChange={event => setMenu({ ...menu, appointmentId: event.target.value })} className="mt-1 block w-full min-w-0 rounded border border-avvi-line bg-white p-1 text-[10px] text-slate-700">{menu.appointmentIds.map(id => { const item = props.appointments.find(appointment => appointment.id === id); return item && <option key={id} value={id}>{item.startsAt.slice(11,16)} – {item.endsAt.slice(11,16)} · {serviceName(item)}</option>; })}</select></label>}
      {isAbsence(menuAppointment) ? <button type="button" role="menuitem" onClick={() => menuAction(() => props.removeAbsence(menuAppointment.id))} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-slate-700 hover:bg-slate-100"><X size={14} />Remover ausência</button> : <>
      <button type="button" role="menuitem" onClick={() => menuAction(() => props.openAppointment(menuAppointment.id))} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-slate-700 hover:bg-slate-100 focus:bg-slate-100 focus:outline-none"><Eye size={14} />Ver agendamento</button>
      <button type="button" role="menuitem" onClick={() => menuAction(() => props.updateStatus(menuAppointment.id, "Confirmado"))} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-green-700 hover:bg-green-50 focus:bg-green-50 focus:outline-none"><CheckCircle2 size={14} />Confirmado</button>
      <button type="button" role="menuitem" onClick={() => menuAction(() => props.updateStatus(menuAppointment.id, "Cancelado"))} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-red-600 hover:bg-red-50 focus:bg-red-50 focus:outline-none"><Ban size={14} />Cancelado</button>
      <button type="button" role="menuitem" onClick={() => menuAction(() => isClosed(menuAppointment) ? props.viewAccount(menuAppointment.id) : props.openAccount(menuAppointment.id))} className="flex w-full items-center gap-2 rounded border-t border-slate-100 px-2 py-2 text-left text-orange-600 hover:bg-orange-50 focus:bg-orange-50 focus:outline-none"><CircleDollarSign size={14} />{isClosed(menuAppointment) ? "Ver fechamento" : "Fechar conta"}</button>
      </>}
    </div>, document.body)}
    {slotMenu && createPortal(<div ref={menuRef} role="menu" aria-label="Ações dos horários selecionados" onKeyDown={navigateMenu} className="appointment-context-menu fixed z-[75] w-[220px] rounded-md border border-slate-200 bg-white p-1 text-xs shadow-lg" style={{ left: slotMenu.left, top: slotMenu.top }}>
      <p className="border-b border-slate-100 px-2 py-1.5 text-[10px] font-semibold text-slate-500">{selectedSlots.length === 1 ? `Horário selecionado · ${Math.floor(selectedSlots[0].hour)}h${selectedSlots[0].hour % 1 ? "30" : ""}` : `${selectedSlots.length} horários selecionados`}</p>
      {choosingProfessional ? <><p className="px-2 py-1 text-[10px] text-slate-500">Agendar com:</p>{[...new Set(selectedSlots.map(item => item.professionalId))].map(id => <button type="button" role="menuitem" key={id} onClick={() => bookSelection(id)} className="block w-full rounded px-2 py-2 text-left hover:bg-avvi-soft">{props.professionals.find(item => item.id === id)?.name}</button>)}</> : <button type="button" role="menuitem" onClick={() => { const ids = [...new Set(selectedSlots.map(item => item.professionalId))]; if (ids.length > 1) setChoosingProfessional(true); else if (ids[0]) bookSelection(ids[0]); }} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left hover:bg-avvi-soft"><Plus size={14} />Novo agendamento</button>}
      <button type="button" role="menuitem" onClick={() => menuAction(() => props.markAbsent(selectedSlots))} className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-slate-600 hover:bg-slate-100"><Ban size={14} />Ausente</button>
    </div>, document.body)}
    {controlsOpen && <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-900/40 p-3"><section role="dialog" aria-modal="true" aria-label="Calendário e filtros da agenda" className="w-full max-w-xs rounded-xl bg-white p-3"><header className="mb-2 flex items-center justify-between text-sm font-bold">Calendário e filtros<button type="button" aria-label="Fechar calendário e filtros" onClick={() => setControlsOpen(false)} className="rounded p-1"><X size={18} /></button></header><div className="space-y-2">{controls}</div></section></div>}
    {slotList && <div className="fixed inset-0 z-[55] flex items-center justify-center bg-slate-900/40 p-3"><section role="dialog" aria-modal="true" aria-label="Agendamentos deste horário" className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-xl bg-white shadow-panel">
      <header className="flex shrink-0 items-center justify-between gap-3 border-b border-avvi-line p-3"><div><h3 className="text-sm font-bold">{slotTime(slotList.hour)} · {props.professionals.find((professional) => professional.id === slotList.professionalId)?.name}</h3><p className="text-[11px] text-slate-500">{format(selected, "dd/MM/yyyy")} · {listedAppointments.length} pacientes</p></div><button type="button" aria-label="Fechar lista de agendamentos" onClick={() => setSlotList(null)} className="rounded p-1"><X size={18} /></button></header>
      <div className="min-h-0 space-y-2 overflow-y-auto p-3">{listedAppointments.slice(listPage * 4, (listPage + 1) * 4).map((appointment) => <button type="button" key={appointment.id} data-testid={`appointment-${appointment.id}`} onClick={(event) => showMenu(appointment.id, event.currentTarget)} onContextMenu={(event) => { event.preventDefault(); showMenu(appointment.id, event.currentTarget); }} aria-haspopup="menu" aria-expanded={menu?.appointmentId === appointment.id} className={`block w-full rounded border-l-4 p-2 text-center ${isAbsence(appointment) ? "bg-slate-200 border-slate-400 text-slate-600" : statusColors(appointment.status)}`}><span className="flex items-center justify-center gap-2 text-xs font-bold">{appointment.startsAt.slice(11, 16)} · {patientName(appointment)}{isClosed(appointment) && <CheckCircle2 size={14} aria-label="Conta fechada" className="text-green-600" />}</span><span className="block truncate text-[10px] text-slate-600">{serviceName(appointment)}</span>{!isAbsence(appointment) && <span className="block text-center text-[10px] font-semibold">{appointment.status}</span>}</button>)}</div>
      <footer className="flex shrink-0 items-center justify-between border-t border-avvi-line p-3 text-xs"><span>{listPage + 1} de {listPages}</span><div className="flex gap-2"><button type="button" aria-label="Pacientes anteriores do horário" disabled={listPage === 0} onClick={() => setSlotList({ ...slotList, page: listPage - 1 })} className="rounded border border-avvi-line px-2 py-1 disabled:opacity-30">Anterior</button><button type="button" aria-label="Próximos pacientes do horário" disabled={listPage === listPages - 1} onClick={() => setSlotList({ ...slotList, page: listPage + 1 })} className="rounded border border-avvi-line px-2 py-1 disabled:opacity-30">Próxima</button></div></footer>
    </section></div>}
  </div>;
}
