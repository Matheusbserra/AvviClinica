// Remove only the explanatory line added by the historical import.
export function originalAppointmentNotes(notes: string) {
  return notes.split(/\r?\n/).filter(line => !/^Histórico importado: conta originalmente .*Sem lançamento de procedimento ou baixa de estoque na importação\.$/.test(line.trim())).join("\n").trim();
}
