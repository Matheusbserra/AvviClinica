"use client";

import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, MessageSquareMore, Settings } from "lucide-react";
import { ClinicalDialog } from "./ClinicalDialog";
import {
  appointmentConsultationRows, consultationDateKey, consultationReportTime, defaultConsultationFilters, displayConsultationDay,
} from "@/lib/appointmentConsultation";
import type { AppointmentConsultationData, AppointmentConsultationFilters } from "@/lib/appointmentConsultation";
import type { AppointmentStatus } from "@/lib/types";
import styles from "./AppointmentConsultationView.module.css";

const PAGE_SIZE = 10;
const NO_AUTHOR = "Os agendamentos não registram quem fez o cadastro.";
const NO_PHOTO_LINK = "As fotos são cadastradas no paciente, sem vínculo com o serviço do agendamento.";
const NO_RECURRENCE = "A agenda não registra recorrência.";
const HEADERS = ["Data", "Hora", "Ações", "Profissional", "Serviço", "Duração", "Cliente", "Valor", "Status", "Observações", "Serviço com Foto", "Cadastramento"];
const COLUMN_WIDTHS = [3.75, 2.25, 4.1, 5.75, 31.9, 2.8, 17, 4.15, 6.05, 3.8, 8.05, 10.4];
const numberFormat = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const alphabetical = (a: string, b: string) => a.localeCompare(b, "pt-BR");

type Props = AppointmentConsultationData & {
  statuses: AppointmentStatus[];
  onOpenAppointment: (id: string) => void;
};

function DateField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <span className={styles.dateField}>
    <input aria-label={label} value={value} inputMode="numeric" maxLength={10} required onChange={event => onChange(event.target.value)} />
    <span className={styles.calendar}>
      <CalendarDays size={14} aria-hidden="true" />
      <input type="date" aria-label={`Escolher ${label.toLocaleLowerCase("pt-BR")}`} value={consultationDateKey(value)} onChange={event => onChange(displayConsultationDay(event.target.value))} />
    </span>
  </span>;
}

export function AppointmentConsultationView({ appointments, patients, professionals, services, procedures, entries, statuses, onOpenAppointment }: Props) {
  const [report, setReport] = useState(() => {
    const now = new Date();
    return { filters: defaultConsultationFilters(now), generatedAt: now };
  });
  const [draft, setDraft] = useState(() => ({ ...report.filters, start: displayConsultationDay(report.filters.start), end: displayConsultationDay(report.filters.end) }));
  const [selectedPage, setSelectedPage] = useState(1);
  const [selectedNotes, setSelectedNotes] = useState<{ patient: string; notes: string } | null>(null);
  const [error, setError] = useState("");
  const [exporting, setExporting] = useState(false);
  const categories = useMemo(() => [...new Set([...services, ...procedures].map(item => item.category).filter(Boolean))].sort(alphabetical), [services, procedures]);
  const serviceOptions = useMemo(() => services.filter(item => !draft.category || item.category === draft.category).sort((a, b) => alphabetical(a.name, b.name)), [services, draft.category]);
  const professionalOptions = useMemo(() => [...professionals].sort((a, b) => alphabetical(a.name, b.name)), [professionals]);
  const rows = useMemo(() => appointmentConsultationRows({ appointments, patients, professionals, services, procedures, entries }, report.filters), [appointments, patients, professionals, services, procedures, entries, report.filters]);

  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const page = Math.min(selectedPage, pageCount);
  const startIndex = (page - 1) * PAGE_SIZE;
  const pageNumbers = Array.from({ length: Math.min(5, pageCount) }, (_, index) => Math.min(Math.max(1, page - 2), Math.max(1, pageCount - 4)) + index);

  function changeFilter<K extends keyof AppointmentConsultationFilters>(field: K, value: AppointmentConsultationFilters[K]) {
    setDraft(current => ({ ...current, [field]: value, ...(field === "category" ? { service: "" } : {}) }));
    setError("");
  }

  function search(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const start = consultationDateKey(draft.start);
    const end = consultationDateKey(draft.end);
    if (!start || !end || start > end) {
      setError("Informe um período válido no formato dd/mm/aaaa.");
      return;
    }
    setError("");
    setSelectedPage(1);
    setReport({ filters: { ...draft, start, end }, generatedAt: new Date() });
  }

  function clearFilters() {
    const now = new Date();
    const filters = defaultConsultationFilters(now);
    setDraft({ ...filters, start: displayConsultationDay(filters.start), end: displayConsultationDay(filters.end) });
    setReport({ filters, generatedAt: now });
    setError("");
    setSelectedPage(1);
  }

  async function exportResults() {
    setExporting(true);
    setError("");
    try {
      const xlsx = await import("xlsx");
      const sheet = xlsx.utils.aoa_to_sheet([
        HEADERS.filter(heading => heading !== "Ações"),
        ...rows.map(row => [row.date, row.time, row.professional, row.service, row.duration, row.patient, row.value, row.status, row.notes, "", row.registered]),
      ]);
      sheet["!cols"] = [12, 8, 26, 54, 15, 36, 12, 26, 48, 19, 23].map(wch => ({ wch }));
      rows.forEach((_, index) => { sheet[xlsx.utils.encode_cell({ r: index + 1, c: 6 })].z = "#,##0.00"; });
      const book = xlsx.utils.book_new();
      xlsx.utils.book_append_sheet(book, sheet, "Agendamentos");
      xlsx.writeFile(book, `agendamentos-${report.filters.start}-${report.filters.end}.xlsx`);
    } catch {
      setError("Não foi possível exportar os agendamentos. Tente novamente.");
    } finally {
      setExporting(false);
    }
  }

  function choosePage(input: HTMLInputElement) {
    const value = Number(input.value);
    const next = Number.isSafeInteger(value) && input.value ? Math.min(pageCount, Math.max(1, value)) : page;
    input.value = String(next);
    setSelectedPage(next);
  }

  return <section className={styles.consultation} aria-label="Consulta de Agendamentos">
    <div className={styles.filtersPanel}>
      <form className={styles.filtersForm} onSubmit={search}>
        <div className={`${styles.fields} ${styles.leftFields}`}>
          <div className={styles.fieldRow}>
            <span className={styles.fieldLabel}>Datas</span>
            <div className={styles.dateRange}>
              <span>de</span>
              <DateField label="Data inicial" value={draft.start} onChange={value => changeFilter("start", value)} />
              <span>até</span>
              <DateField label="Data final" value={draft.end} onChange={value => changeFilter("end", value)} />
            </div>
          </div>
          <div className={styles.fieldRow}>
            <label className={styles.fieldLabel} htmlFor="consultation-patient">Cliente</label>
            <div className={styles.patientFields}>
              <select aria-label="Buscar cliente por" value={draft.patientField} onChange={event => changeFilter("patientField", event.target.value as AppointmentConsultationFilters["patientField"])}>
                <option value="name">Nome</option><option value="cpf">CPF</option><option value="phone">Telefone</option><option value="email">E-mail</option>
              </select>
              <input id="consultation-patient" value={draft.patient} onChange={event => changeFilter("patient", event.target.value)} />
            </div>
          </div>
          <label className={styles.fieldRow}>
            <span className={styles.fieldLabel}>Categoria</span>
            <select value={draft.category} onChange={event => changeFilter("category", event.target.value)}>
              <option value="">-- Selecione --</option>
              {categories.map(category => <option key={category}>{category}</option>)}
            </select>
          </label>
          <label className={styles.fieldRow}>
            <span className={styles.fieldLabel}>Serviço</span>
            <select value={draft.service} onChange={event => changeFilter("service", event.target.value)}>
              <option value="">-- Selecione --</option>
              {serviceOptions.map(service => <option key={service.id} value={service.id}>{service.name}</option>)}
            </select>
          </label>
          <label className={styles.fieldRow} title={NO_AUTHOR}>
            <span className={styles.fieldLabel}>Agendado<br />por</span>
            <select disabled aria-label="Agendado por"><option>Todos</option></select>
          </label>
        </div>
        <div className={`${styles.fields} ${styles.rightFields}`}>
          <label className={styles.fieldRow}>
            <span className={styles.fieldLabel}>Profissional</span>
            <select value={draft.professional} onChange={event => changeFilter("professional", event.target.value)}>
              <option value="">-- Selecione --</option>
              {professionalOptions.map(professional => <option key={professional.id} value={professional.id}>{professional.name}</option>)}
            </select>
          </label>
          <label className={styles.fieldRow}>
            <span className={styles.fieldLabel}>Status</span>
            <select value={draft.status} onChange={event => changeFilter("status", event.target.value)}>
              <option value="">-- Selecione --</option>
              {statuses.map(status => <option key={status}>{status}</option>)}
            </select>
          </label>
          <label className={styles.fieldRow}>
            <span className={styles.fieldLabel}>Fechamento Conta</span>
            <select value={draft.account} onChange={event => changeFilter("account", event.target.value)}>
              <option value="">-- Selecione --</option><option value="open">Em aberto</option><option value="closed">Fechada</option>
            </select>
          </label>
          <label className={styles.fieldRow} title={NO_PHOTO_LINK}>
            <span className={styles.fieldLabel}>Serviços com Fotos</span>
            <select disabled><option>Indiferente</option></select>
          </label>
          <label className={styles.recurrence} title={NO_RECURRENCE}><input type="checkbox" disabled /> Somente agendamentos recorrentes</label>
          <div className={styles.formActions}>
            <button type="submit">Pesquisar</button>
            <button type="button" onClick={exportResults} disabled={exporting || !rows.length}>{exporting ? "Exportando" : "Exportar"}</button>
            <button type="button" onClick={clearFilters}>Limpar</button>
          </div>
        </div>
        {error && <p className={styles.error} role="alert">{error}</p>}
      </form>
    </div>

    <div className={styles.summary}>
      <p>Agendamentos de <strong>{displayConsultationDay(report.filters.start)} a {displayConsultationDay(report.filters.end)}</strong></p>
      <p>Relatório gerado em <strong>{consultationReportTime(report.generatedAt)}</strong></p>
    </div>

    <div className={styles.tableContainer} tabIndex={0} role="region" aria-label="Tabela de agendamentos">
      <table className={styles.table}>
        <colgroup>{COLUMN_WIDTHS.map((width, index) => <col key={HEADERS[index]} style={{ width: `${width}%` }} />)}</colgroup>
        <thead><tr>{HEADERS.map(heading => <th scope="col" key={heading}>{heading}</th>)}</tr></thead>
        <tbody>
          {rows.slice(startIndex, startIndex + PAGE_SIZE).map(row => <tr key={row.id}>
            <td>{row.date}</td><td>{row.time}</td>
            <td><button className={styles.rowAction} type="button" title="Abrir agendamento" aria-label={`Abrir agendamento de ${row.patient}`} onClick={() => onOpenAppointment(row.id)}><Settings size={15} strokeWidth={2.8} /></button></td>
            <td>{row.professional}</td><td>{row.service}</td><td>{row.duration}</td><td>{row.patient}</td><td>{numberFormat.format(row.value)}</td><td>{row.status}</td>
            <td>{row.notes && <button className={styles.notesAction} type="button" title="Ver observações" aria-label={`Ver observações de ${row.patient}`} onClick={() => setSelectedNotes({ patient: row.patient, notes: row.notes })}><MessageSquareMore size={16} strokeWidth={2.8} /></button>}</td>
            <td title={NO_PHOTO_LINK}>—</td><td title={row.registered ? undefined : "Cadastramento sem data registrada."}>{row.registered || "—"}</td>
          </tr>)}
          {!rows.length && <tr><td className={styles.empty} colSpan={HEADERS.length}>Nenhum agendamento encontrado.</td></tr>}
        </tbody>
      </table>
    </div>

    <nav className={styles.pagination} aria-label="Paginação dos agendamentos">
      <span className={styles.recordCount} aria-live="polite">{rows.length} registro(s)</span>
      <button type="button" aria-label="Primeira página" onClick={() => setSelectedPage(1)} disabled={page === 1}><ChevronsLeft size={10} /></button>
      <button type="button" aria-label="Página anterior" onClick={() => setSelectedPage(page - 1)} disabled={page === 1}><ChevronLeft size={10} /></button>
      <input key={page} aria-label="Número da página" inputMode="numeric" defaultValue={page} onBlur={event => choosePage(event.currentTarget)} onKeyDown={event => { if (event.key === "Enter") choosePage(event.currentTarget); }} />
      <span>/ {pageCount}</span>
      <span className={styles.pageNumbers}>{pageNumbers.map(number => <button type="button" key={number} aria-label={`Página ${number}`} aria-current={number === page ? "page" : undefined} onClick={() => setSelectedPage(number)}>{number}</button>)}</span>
      <button type="button" aria-label="Próxima página" onClick={() => setSelectedPage(page + 1)} disabled={page === pageCount}><ChevronRight size={10} /></button>
      <button type="button" aria-label="Última página" onClick={() => setSelectedPage(pageCount)} disabled={page === pageCount}><ChevronsRight size={10} /></button>
    </nav>

    {selectedNotes && <ClinicalDialog title={`Observações de ${selectedNotes.patient}`} onClose={() => setSelectedNotes(null)}><p className={styles.notes}>{selectedNotes.notes}</p></ClinicalDialog>}
  </section>;
}
