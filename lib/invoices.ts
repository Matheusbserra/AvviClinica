import type {Appointment, FinancialEntry, Professional, Service, Patient, InvoiceAttachment} from "./types";
import {appointmentServices} from "./appointmentServices";
import {zeroClosedAppointment} from "./calculations";
import {moneyRound} from "./checkout";
export const invoiceBucket="avvi-invoices";
export const invoiceMaxBytes=3*1024*1024;
// A booking edited from an older tab must not erase a PDF saved independently.
// Reversing the account still removes the invoice along with its closure.
export function preserveCloudInvoice(previous: Appointment | undefined, next: Appointment): Appointment {
 const saved=previous?.invoice;
 if(!saved||!next.accountClosed)return next;
 const incoming=next.invoice;
 if(!incoming || saved.updatedAt && (!incoming.updatedAt || incoming.updatedAt < saved.updatedAt))return {...next,invoice:saved};
 if(saved.pdfPath && !incoming.pdfPath)return {...next,invoice:{...incoming,pdfPath:saved.pdfPath,filename:saved.filename}};
 return next;
}
// The requested historical cutoff is fixed, rather than advancing every month.
export const invoiceStartDate = "2026-10-01";
export function invoiceVisible(appointment: Appointment) {
 return appointment.invoice?.visibility === "visible" ||
   (appointment.invoice?.visibility !== "hidden" && appointment.startsAt.slice(0,10) >= invoiceStartDate);
}
export function excludedInvoiceProfessional(professional?: Pick<Professional,"id"|"name">) {
 if(!professional)return true;
 const name=professional.name.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/^(dra?\.?|doutora?)\s+/g,"").trim();
 return professional.id==="ana"||name==="ana"||name.startsWith("ana ");
}
export function invoiceRows(appointments: Appointment[],patients:Patient[],professionals:Professional[],services:Service[],entries:FinancialEntry[]) {
 return appointments.flatMap(appointment=>{
   const professional=professionals.find(item=>item.id===appointment.professionalId);
   const account=appointment.closedAccount??entries.find(entry=>!entry.sourceAccountId&&entry.accountClosed&&(entry.appointmentId===appointment.id||entry.id===appointment.financialEntryId));
   if((!appointment.accountClosed&&!account)||excludedInvoiceProfessional(professional)||zeroClosedAppointment(appointment,entries,services))return [];
   const lines=account?.procedureLines?.length?account.procedureLines.map(line=>({name:line.manualProcedure||services.find(item=>item.id===line.serviceId)?.name||"Serviço registrado",quantity:line.quantity,value:moneyRound(Math.max(0,line.quantity*line.servicePrice-(line.discount??0)))})):appointmentServices(appointment,services).map(line=>({name:line.name,quantity:1,value:line.price}));
   return [{appointment,professional,patient:patients.find(item=>item.id===appointment.patientId),date:appointment.startsAt.slice(0,10),lines,total:moneyRound(lines.reduce((sum,line)=>sum+line.value,0))}];
 }).sort((a,b)=>b.date.localeCompare(a.date));
}
export function validInvoice(value: unknown): value is InvoiceAttachment {
 if(!value||typeof value!=="object")return false;
 const v=value as Record<string,unknown>;
 return Object.keys(v).every(key=>["issued","visibility","updatedAt","filename","pdfPath","localPdf"].includes(key))&&typeof v.issued==="boolean"&&(v.visibility===undefined||v.visibility==="hidden"||v.visibility==="visible")&&(v.pdfPath===undefined||(typeof v.pdfPath==="string"&&/^[a-f0-9]+\/[a-f0-9-]{36}\.pdf$/.test(v.pdfPath)))&&["updatedAt","filename","pdfPath","localPdf"].every(key=>v[key]===undefined||typeof v[key]==="string");
}
export function invoiceOnlyUpdate(previous:Appointment|undefined,next:Appointment) {
 if(!previous||!validInvoice(next.invoice))return false;
 const stable=(value:unknown):string=>JSON.stringify(value,(_key,item)=>item&&typeof item==="object"&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
 const omit=(value:Appointment)=>Object.fromEntries(Object.entries(value).filter(([key])=>key!=="invoice"));
 return stable(omit(previous))===stable(omit(next));
}

export function cpfOnlyUpdate(previous:Patient|undefined,next:Patient) {
 if(!previous||typeof next.cpf!=="string"||!(/^(?:\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2}|)$/.test(next.cpf)))return false;
 const stable=(value:unknown):string=>JSON.stringify(value,(_key,item)=>item&&typeof item==="object"&&!Array.isArray(item)?Object.fromEntries(Object.entries(item).sort(([a],[b])=>a.localeCompare(b))):item);
 const omit=(value:Patient)=>Object.fromEntries(Object.entries(value).filter(([key])=>key!=="cpf"));
 return stable(omit(previous))===stable(omit(next));
}
