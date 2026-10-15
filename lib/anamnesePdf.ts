import jsPDF from "jspdf";
import { anamnesePages, toxinMuscles, type ClinicalField } from "./anamnese";
import { bodyConsentText } from "./bodyAnamnese";
import type { AnamneseRecord } from "./types";
async function imageData(path: string) {
 const response = await fetch(path); if (!response.ok) throw new Error("Não foi possível carregar a imagem da ficha.");
 return new Promise<string>((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error("Não foi possível ler a imagem.")); response.blob().then(blob => reader.readAsDataURL(blob)).catch(reject); });
}
export async function exportAnamnese(record: AnamneseRecord, professionalName: string) {
 const isBody=record.template === "body", pages=anamnesePages(record.template);
 const images = await Promise.all((isBody?["/anamnese/avaliacao-corporal.png"]:["/anamnese/planejamento-facial.png","/anamnese/anatomia-facial.png"]).map(imageData));
 const doc = new jsPDF(); let y = 35; const margin = 14, width = 182, bottom = 280;
 function header(title: string) { doc.setFont("helvetica","bold");doc.setTextColor(184,134,43);doc.setFontSize(16);doc.text("AVVI Clínica",margin,15);doc.setFontSize(11);doc.setTextColor(35,42,55);doc.text(isBody?"Ficha de Anamnese Corporal":"Ficha de Harmonização Facial - Anamnese",margin,22);doc.setFontSize(9);doc.setFont("helvetica","normal");doc.text(doc.splitTextToSize(`${String(record.answers.name || "Paciente")} | ${professionalName} | ${record.date.split("-").reverse().join("/")}`,width),margin,28);y=39;doc.setFont("helvetica","bold");doc.text(title,margin,y);y+=7; }
 function next() { doc.addPage();header("Continuação"); }
 const lineHeight = isBody ? 4 : 4.4;
 function text(value: string, bold = false) {
  doc.setFont("helvetica",bold?"bold":"normal");doc.setFontSize(9);doc.setTextColor(35,42,55);
  const lines:string[]=doc.splitTextToSize(value.replace(/[–—]/g,"-"),width);
  for(const line of lines){
   if(y+lineHeight>bottom){next();doc.setFont("helvetica",bold?"bold":"normal");doc.setFontSize(9);doc.setTextColor(35,42,55);}
   doc.text(line,margin,y);y+=lineHeight;
  }
 }
 function pair(label: string, answer: string) { text(`${label}: ${answer || "Não informado"}`);y+=isBody?0.2:0.5; }
 function bodyFields(fields: ClinicalField[]) {
  let pending: ClinicalField[] = [];
  const answer = (field: ClinicalField) => { const value=record.answers[field.id];return Array.isArray(value)?value.join(", "):value||"Não informado"; };
  const flush = () => {
   if (!pending.length) return;
   doc.setFont("helvetica","normal");doc.setFontSize(9);doc.setTextColor(35,42,55);
   const columns = pending.map(field => doc.splitTextToSize(`${field.label}: ${answer(field)}`.replace(/[–—]/g,"-"),88) as string[]);
   for(let line=0;line<Math.max(...columns.map(column=>column.length));line++){
    if(y+lineHeight>bottom){next();doc.setFont("helvetica","normal");doc.setFontSize(9);}
    columns.forEach((column,index)=>{if(column[line])doc.text(column[line],margin+index*94,y);});y+=lineHeight;
   }
   y+=1;pending=[];
  };
  for(const field of fields){
   if(field.type === "area" || field.type === "signature"){
    flush();pair(field.label,answer(field));
    if(field.type === "signature" && record.answers[`${field.id}Image`])addImage(String(record.answers[`${field.id}Image`]),100,28);
   }else{pending.push(field);if(pending.length===2)flush();}
  }
  flush();
 }
 function addImage(data: string, w: number, h: number) { if(y+h>bottom)next();doc.addImage(data,"PNG",margin,y,w,h);y+=h+5; }
 for (let index=0;index<pages.length;index++) {
  if(index)doc.addPage();header(pages[index].title);
  for(const section of pages[index].sections) {
   if(y+12>bottom)next();text(section.title,true);y+=2;
   if(section.declaration){text(isBody?bodyConsentText():section.declaration);y+=3;}
   if(isBody&&section.image)addImage(String(record.answers.bodyImage || images[0]),182,182*403/730);
   if(!isBody&&index===3)addImage(String(record.answers.planningImage || images[0]),182,71);
   if(!isBody&&index===4) {
    const top=y;doc.addImage(images[1],"PNG",120,top,76,106);doc.setFont("helvetica","bold");doc.setFontSize(9);doc.text("Tratamento",margin,top);doc.text("Un",105,top);y+=6;
    for(let i=0;i<toxinMuscles.length;i++){doc.setFont("helvetica","normal");doc.setFontSize(8);doc.text(toxinMuscles[i],margin,y);doc.text(String(record.answers[`toxin${i}`] || "—").replace("—","-"),105,y,{align:"right"});y+=7;}
    doc.setFont("helvetica","bold");doc.text("Total",margin,y);doc.text(String(toxinMuscles.reduce((sum,_,i)=>sum+Number(record.answers[`toxin${i}`]||0),0)),105,y,{align:"right"});y=Math.max(y+8,top+112);
   }
   if(isBody)bodyFields(section.fields);
   else for(const field of section.fields) {
    if(!isBody&&index===4&&field.id.startsWith("toxin")&&field.id!=="toxinNotes")continue;
    const answer=record.answers[field.id];
    if(field.type==="rank") { text(field.label,true);field.options!.forEach((option,i)=>pair(option,Array.isArray(answer)?answer[i]||"Sem prioridade":"Sem prioridade")); }
    else pair(field.label,Array.isArray(answer)?answer.join(", "):answer||"");
    if(field.type==="signature"&&record.answers[`${field.id}Image`])addImage(String(record.answers[`${field.id}Image`]),100,28);
   }
   y+=isBody?2:3;
  }
 }
 const total=doc.getNumberOfPages();for(let i=1;i<=total;i++){doc.setPage(i);doc.setTextColor(110,110,110);doc.setFontSize(8);doc.text(`AVVI Clínica · ${i} / ${total}`,196,289,{align:"right"});}
 const patient=String(record.answers.name||"paciente").normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/gi,"-").slice(0,60);
 doc.save(`anamnese-${isBody?"corporal-":""}${patient}-${record.date}.pdf`);
}
