import fs from 'node:fs';
import ts from 'typescript';
import assert from 'node:assert/strict';
const code=ts.transpileModule(fs.readFileSync('lib/appointmentServices.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const {appointmentServices,totalServiceMinutes}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const catalog=[{id:'one',name:'Consulta',price:300,priceType:'fixed',durationMinutes:60},{id:'two',name:'Retorno',price:150,priceType:'from',durationMinutes:30}];
const legacy={id:'a',serviceId:'one',servicePrice:200,servicePriceType:'from'};
assert.equal(appointmentServices(legacy,catalog)[0].price,200);assert.equal(appointmentServices(legacy,catalog)[0].priceType,'from');
assert.equal(appointmentServices({...legacy,servicePrice:undefined},catalog)[0].price,300);
const stored={...legacy,services:[{id:'l1',serviceId:'one',name:'Consulta agendada',price:200,priceType:'from',durationMinutes:60},{id:'l2',serviceId:'two',name:'Retorno agendado',price:100,priceType:'fixed',durationMinutes:30}]};
assert.deepEqual(appointmentServices(stored,catalog),stored.services);assert.deepEqual(appointmentServices(stored,[]),stored.services);
const copy=appointmentServices(stored,catalog);copy[0].price=10;assert.equal(stored.services[0].price,200);assert.deepEqual(appointmentServices({...legacy,services:[]},catalog),[]);assert.deepEqual(appointmentServices({id:'no-service'},catalog),[]);
console.log('PASS: Legacy appointment pricing, explicit empty service list, multiple saved service snapshots, deleted/changed catalog and independent copies.');

assert.equal(totalServiceMinutes([{durationMinutes:120}]),120);
assert.equal(totalServiceMinutes([{durationMinutes:120},{durationMinutes:30},{durationMinutes:10}]),160);
assert.equal(totalServiceMinutes([{durationMinutes:0},{durationMinutes:NaN},{durationMinutes:30}]),30);
assert.equal(totalServiceMinutes([]),0);
console.log('PASS: service duration sums include extra services, fractional hours remain exact in minutes and empty service selectors do not add a phantom hour.');
