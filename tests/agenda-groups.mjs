import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
const compile=path=>ts.transpileModule(fs.readFileSync(path,"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const availability="data:text/javascript;base64,"+Buffer.from(compile("lib/agendaAvailability.ts")).toString("base64");
const groupsCode=compile("lib/agendaGroups.ts").replace('"./agendaAvailability"',JSON.stringify(availability));
const {agendaGroups}=await import("data:text/javascript;base64,"+Buffer.from(groupsCode).toString("base64"));
const date="2026-10-10",record=(id,patient,start,end,professionalId="ana")=>({id,patientId:patient,professionalId,startsAt:date+"T"+start+":00",endsAt:date+"T"+end+":00",eventType:"Novo Agendamento",status:"Confirmado"});
const records=[record("one","p1","08:00","08:30"),record("two","p1","08:30","09:00"),record("long","p2","09:30","11:30"),record("different","p3","11:30","12:00"),record("after-gap","p2","12:30","13:00"),record("other-professional","p2","09:30","11:30","bia")];
const before=JSON.stringify(records),groups=agendaGroups(records,date,"ana");assert.equal(groups.length,4);assert.equal(groups[0].slotCount,2);assert.deepEqual(groups[0].appointments.map(a=>a.id),["one","two"]);assert.equal(groups[1].slotCount,4);assert.equal(groups[1].startIndex,3);assert.equal(groups[2].appointments[0].patientId,"p3");assert.equal(groups[3].appointments[0].id,"after-gap");

assert.equal(agendaGroups(records,date,"bia").length,1);assert.equal(agendaGroups(records,"2026-10-11","ana").length,0);assert.equal(JSON.stringify(records),before);
const overlapping=agendaGroups([record("first","p1","08:00","10:00"),record("overlap","p2","09:00","09:30")],date,"ana");assert.equal(overlapping.length,1);assert.equal(overlapping[0].overlaps.length,2);assert.equal(overlapping[0].appointments.length,1);
const absences=[record("abs1",undefined,"08:00","08:30"),record("abs2",undefined,"08:30","09:00")].map(a=>({...a,eventType:"Registrar Ausência"}));assert.equal(agendaGroups(absences,date,"ana").length,2);
assert.equal(agendaGroups([record("mid-hour","p1","08:30","10:00")],date,"ana")[0].slotCount,3);
console.log("PASS: consecutive separate appointments share one display group; a long appointment spans four half-hours; gaps, different patients/professionals and absences stay separate; overlapping other patients remain available; original records unchanged.");
