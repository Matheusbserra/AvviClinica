import fs from "node:fs";import os from "node:os";import path from "node:path";import {pathToFileURL} from "node:url";import assert from "node:assert/strict";import ts from "typescript";
const directory=fs.mkdtempSync(path.join(os.tmpdir(),"avvi-checkout-exceptions-"));
try{
 for(const name of ["checkout","accountProcedures","inventory"]){const code=fs.readFileSync("lib/"+name+".ts","utf8");fs.writeFileSync(path.join(directory,name+".mjs"),ts.transpileModule(code,{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText);}
 const {checkoutAllowsNoProducts,checkoutTotals}=await import(pathToFileURL(path.join(directory,"checkout.mjs")));
 const {procedureEntryFromAccount}=await import(pathToFileURL(path.join(directory,"accountProcedures.mjs")));
 const {applyCheckoutInventory}=await import(pathToFileURL(path.join(directory,"inventory.mjs")));
 const line=name=>({id:"line",serviceId:"service",manualProcedure:name,quantity:1,servicePrice:0,discount:0,productCost:0,professionalPercent:30});
 for(const name of ["Avaliação estética","Avaliação HOF","AVALIACAO facial","Consulta de avaliação","Retorno","RETORNO HOF","Retorno pós-atendimento"]){assert.equal(checkoutAllowsNoProducts([line(name)],[]),true);}
 for(const name of ["Botox","Preenchimento","Limpeza","Procedimento"]){assert.equal(checkoutAllowsNoProducts([line(name)],[]),false);}
 assert.equal(checkoutAllowsNoProducts([],[]),false);
 assert.equal(checkoutAllowsNoProducts([{...line("Avaliação"),quantity:0}],[]),false);
 assert.equal(checkoutAllowsNoProducts([{...line("Avaliação"),serviceId:undefined,procedureId:"product"}],[]),false);
 assert.equal(checkoutAllowsNoProducts([{...line(""),serviceId:"eval"}],[{id:"eval",name:"Avaliação HOF"}]),true);
 assert.equal(checkoutAllowsNoProducts([line("Botox"),line("Retorno")],[]),true);
 const lines=[line("Avaliação HOF")],totals=checkoutTotals(lines,[]);assert.equal(totals.total,0);assert.equal(totals.received,0);assert.equal(totals.remaining,0);
 const discounted=[{...line("Avaliação estética"),servicePrice:200,discount:200}];assert.equal(checkoutTotals(discounted,[]).total,0);
 const account={id:"eval-account",appointmentId:"appointment",patientId:"patient",professionalId:"professional",procedureLines:lines,products:[],payments:[],commercialDiscount:0,discountSplit:"Empresa assume",date:"2026-10-09"};
 assert.equal(procedureEntryFromAccount(account,[],{commissionPercent:30}),undefined);
 const stock=[{id:"stock",procedureId:"product",quantity:5}],before=JSON.stringify(stock);const update=applyCheckoutInventory(stock,undefined,[]);assert.deepEqual(update.consumption,[]);assert.equal(JSON.stringify(update.inventory),before);assert.equal(JSON.stringify(stock),before);
 const used=procedureEntryFromAccount({...account,products:[{id:"usage",procedureId:"product",quantity:1,unitCost:10}]},[{id:"product",name:"Produto",price:100}],{commissionPercent:30});assert.equal(used,undefined);
 const paid=procedureEntryFromAccount({...account,products:[{id:"usage",procedureId:"product",quantity:1,unitCost:10}],payments:[{amount:100}]},[{id:"product",name:"Produto",price:100}],{commissionPercent:30});assert.ok(paid);assert.equal(paid.procedureLines.length,1);
 console.log("PASS: Evaluation/return names and accent/case variants, service-only exception, ordinary services still require products, current service changes, zero price/full discount without payment, no procedure ledger or stock consumption without products, zero accounts never generate a ledger, paid products still generate the normal ledger.");
}finally{fs.rmSync(directory,{recursive:true,force:true});}
