import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
import ts from 'typescript';
const dir=fs.mkdtempSync(path.join(os.tmpdir(),'avvi-zero-'));
try {
 const names=['calculations','appointmentServices','reports','professionalReports','checkout','invoices','accountProcedures','leadFunnel'];
 for(const name of names){let code=fs.readFileSync(`lib/${name}.ts`,'utf8');for(const dependency of names)code=code.replaceAll(`"./${dependency}"`,`"./${dependency}.mjs"`);fs.writeFileSync(path.join(dir,`${name}.mjs`),ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);}
 const load=name=>import(pathToFileURL(path.join(dir,name+'.mjs')));
 const {zeroClosedAppointment,excludeZeroAccounts}=await load('calculations'),{professionalReports}=await load('professionalReports'),{clinicRankings}=await load('reports'),{invoiceRows,cpfOnlyUpdate}=await load('invoices'),{procedureEntryFromAccount}=await load('accountProcedures'),{automaticLeadStage}=await load('leadFunnel');
 const services=[{id:'paid',name:'Preenchimento',price:1000},{id:'free',name:'Avaliação HOF',price:0}];
 const account=(id,amount)=>({id,patientId:id,professionalId:'bia',date:'2026-10-12',quantity:1,servicePrice:amount,productCost:0,machineFee:0,commercialDiscount:0,professionalPercent:30,discountSplit:'Empresa assume',accountClosed:true,payments:amount?[{amount,fee:0,discount:0}]:[],products:[{procedureId:'product',quantity:1,unitCost:10}],procedureLines:[{serviceId:amount?'paid':'free',manualProcedure:amount?'Preenchimento':'Avaliação HOF',servicePrice:amount,quantity:1,productCost:0,professionalPercent:30}]});
 const paid=account('paid-account',1000),free=account('free-account',0),discounted={...account('discount-account',0),servicePrice:500,commercialDiscount:500,procedureLines:[{serviceId:'paid',manualProcedure:'Preenchimento',servicePrice:500,quantity:1,discount:500,productCost:0,professionalPercent:30}]};
 const ap=(id,account)=>({id,professionalId:'bia',patientId:account.patientId,startsAt:'2026-10-12T08:00:00',endsAt:'2026-10-12T09:00:00',accountClosed:true,status:'Finalizado',closedAccount:account,financialEntryId:'ledger-'+id,stockConsumption:[{procedureId:'product',quantity:1}]});
 const appointments=[ap('paid',paid),ap('free',free),ap('discounted',discounted)];
 const entries=appointments.map(ap=>({...ap.closedAccount,id:ap.financialEntryId,accountClosed:undefined,appointmentId:ap.id,sourceAccountId:ap.closedAccount.id}));
 const patients=appointments.map(ap=>({id:ap.patientId,name:ap.id,cpf:'',phone:'9899999999'})),professionals=[{id:'bia',name:'Beatriz',monthlyGoal:2000}];
 const input={start:'2026-10-01',end:'2026-10-31',appointments,entries,patients,professionals,services,procedures:[{id:'product',name:'Produto'}],monthlyGoals:[]},before=JSON.stringify(input);
 assert.equal(zeroClosedAppointment(appointments[1]),true);assert.equal(zeroClosedAppointment(appointments[2]),true);assert.equal(zeroClosedAppointment(appointments[0]),false);
 const historical={id:'unknown',accountClosed:true,historicalImport:{paymentsUnknown:true},servicePrice:0};assert.equal(zeroClosedAppointment(historical),false);
 const importedFree={...historical,id:"imported-return",professionalId:"bia",patientId:"free",startsAt:"2026-10-12T09:00:00",serviceId:"free",services:[{serviceId:"free",name:"Retorno pós-procedimento",price:0}]};assert.equal(zeroClosedAppointment(importedFree),true);assert.equal(invoiceRows([importedFree],patients,professionals,services,[]).length,0);assert.equal(clinicRankings({...input,appointments:[...appointments,importedFree]}).totalAttendances,1);assert.equal(professionalReports({...input,appointments:[...appointments,importedFree]}).reports[0].averageTicket,1000);
 assert.equal(zeroClosedAppointment({...importedFree,services:[{name:"Avaliação HOF",price:100}]}),false);
 const filtered=excludeZeroAccounts(appointments,entries,services);assert.deepEqual(filtered.appointments.map(a=>a.id),['paid']);assert.deepEqual(filtered.entries.map(e=>e.id),['ledger-paid']);assert.ok(filtered.entryIds.has('free-account'));assert.ok(filtered.entryIds.has('ledger-discounted'));
 const report=professionalReports(input).reports[0];assert.equal(report.totalPaid,1000);assert.equal(report.closedPatientCount,1);assert.equal(report.averageTicket,1000);assert.equal(report.count,1);assert.equal(report.serviceCount,1);assert.deepEqual(report.services.map(s=>s.name),['Preenchimento']);
 const clinic=clinicRankings(input);assert.equal(clinic.totalAttendances,1);assert.equal(clinic.totalRevenue,1000);assert.equal(clinic.averageTicket[0].averageTicket,1000);assert.equal(clinic.procedures[0].quantity,1);assert.equal(clinic.services[0].quantity,1);
 assert.deepEqual(invoiceRows(appointments,patients,professionals,services,entries).map(row=>row.appointment.id),['paid']);assert.equal(procedureEntryFromAccount(free,input.procedures,professionals[0]),undefined);assert.equal(procedureEntryFromAccount(discounted,input.procedures,professionals[0]),undefined);
 const legacy={...appointments[1],closedAccount:undefined,financialEntryId:'old'};assert.equal(zeroClosedAppointment(legacy,[{...free,id:'old'}]),true);assert.equal(zeroClosedAppointment({...legacy,accountClosed:false},[{...free,id:'old'}]),false);
 const patient={id:'p',name:'Patient',cpf:'',futureCredit:0};assert.equal(cpfOnlyUpdate(patient,{...patient,cpf:'123.456.789-09'}),true);assert.equal(cpfOnlyUpdate(patient,{...patient,cpf:'12345678909',futureCredit:999}),false);assert.equal(cpfOnlyUpdate(patient,{...patient,cpf:'1'}),false);
 const lead={id:'lead',patientId:free.patientId,phone:'9899999999',firstContactAt:'2026-10-12T12:00:00Z'};assert.equal(automaticLeadStage(lead,patients,[appointments[1]],new Date('2026-10-12T15:00:00Z')),'entry');
 assert.equal(JSON.stringify(input),before);
 console.log('PASS: all free closures, including fully discounted services, excluded from finances, patient/ticket denominator, clinical attendance/productivity/service/product rankings, invoices, ledger and aftercare; paid and unknown historical accounts preserved; original agenda data unchanged; CPF-only permission cannot change balances.');
} finally {fs.rmSync(dir,{recursive:true,force:true});}
