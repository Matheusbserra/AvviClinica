import { jsPDF } from "jspdf";
import { currency } from "./calculations";
import type { Receipt } from "./types";

export function receiptServiceNames(receipt: Receipt) {
  return receipt.services?.length ? receipt.services.map(service => service.name) : receipt.procedure ? [receipt.procedure] : [];
}

export function receiptPayments(receipt: Receipt) {
  return receipt.payments?.length ? receipt.payments : [{ method: receipt.paymentMethod, amount: receipt.amount }];
}

export function receiptPaymentTotal(payments: NonNullable<Receipt["payments"]>) {
  return payments.reduce((total, payment) => total + Math.round(payment.amount * 100), 0) / 100;
}

export function createPatientReceiptPdf(receipt: Receipt, professionalName: string, logo: string) {
  const doc = new jsPDF();
  const image = doc.getImageProperties(logo);
  const width = Math.min(44, 28 * image.width / image.height), height = width * image.height / image.width;
  let y = 70;
  function header() {
    doc.addImage(logo, "PNG", (210 - width) / 2, 12, width, height);
    doc.setTextColor(20, 28, 43); doc.setFont("helvetica", "bold"); doc.setFontSize(17);
    doc.text("Recibo de Pagamento", 105, 52, { align: "center" });
    doc.setDrawColor(184, 134, 40); doc.line(20, 58, 190, 58);
    doc.setFont("helvetica", "normal"); doc.setFontSize(11);
  }
  function space(height: number) {
    if (y + height > 265) { doc.addPage(); header(); y = 70; }
  }
  function text(value: string, bold = false) {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    const lines: string[] = doc.splitTextToSize(value, 170);
    for (const line of lines) { space(6); doc.text(line, 20, y); y += 6; }
    y += 3;
  }
  header();
  text(`Paciente: ${receipt.patientName}`);
  text(`CPF: ${receipt.cpf || "-"}`);
  const services = receiptServiceNames(receipt);
  if (services.length) { text("Serviços:", true); for (const name of services) text(`- ${name}`); }
  text(`Valor pago: ${currency(receipt.amount)}`, true);
  const payments = receiptPayments(receipt);
  text(payments.length > 1 ? "Formas de pagamento:" : "Forma de pagamento:", true);
  for (const payment of payments) text(`- ${payment.method}: ${currency(payment.amount)}`);
  text(`Data: ${receipt.date.split("-").reverse().join("/")}`);
  text(`Profissional: ${professionalName || "-"}`);
  text(`Observações: ${receipt.notes || "-"}`);
  space(60); y += 5;
  const futureCredit = receiptPaymentTotal(payments.filter(payment => payment.method === "Crédito Futuro"));
  text(futureCredit === receipt.amount
    ? "Declaro o recebimento do valor acima como crédito futuro para utilização pelo paciente."
    : futureCredit > 0
      ? `Declaro o recebimento do valor acima, sendo ${currency(futureCredit)} como crédito futuro para utilização pelo paciente e o restante referente aos serviços informados.`
      : "Declaro o recebimento do valor acima referente aos serviços informados.");
  space(35); y += 20;
  doc.setDrawColor(100); doc.line(55, y, 155, y);
  doc.setFont("helvetica", "normal"); doc.text("AVVI Clínica", 105, y + 8, { align: "center" });
  return doc;
}
