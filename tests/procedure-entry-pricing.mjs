import fs from 'node:fs';
import ts from 'typescript';
import assert from 'node:assert/strict';
const load=async file=>import('data:text/javascript;base64,'+Buffer.from(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText).toString('base64'));
const {procedureLineTotal,overrideProcedureLineTotal,changeProcedureLineQuantity}=await load('lib/procedureEntryPricing.ts'),{calculateEntry}=await load('lib/calculations.ts');
const original={id:'line',procedureId:'product',quantity:1,servicePrice:1000,productCost:100,professionalPercent:30};
const two=changeProcedureLineQuantity(original,2);assert.equal(procedureLineTotal(two),2000);assert.equal(two.productCost*two.quantity,200);assert.equal(two.totalPriceOverride,undefined);
const custom=overrideProcedureLineTotal(two,700.50);assert.equal(custom.servicePrice,350.25);assert.equal(procedureLineTotal(custom),700.50);assert.equal(custom.totalPriceOverride,700.50);assert.deepEqual(original,{id:'line',procedureId:'product',quantity:1,servicePrice:1000,productCost:100,professionalPercent:30});
const persisted=JSON.parse(JSON.stringify(custom));assert.equal(procedureLineTotal(persisted),700.50);const three=changeProcedureLineQuantity(persisted,3);assert.equal(procedureLineTotal(three),700.50);assert.equal(three.productCost*three.quantity,300);
const cents=overrideProcedureLineTotal(three,600.35);assert.equal(procedureLineTotal(cents),600.35);assert.equal(procedureLineTotal(JSON.parse(JSON.stringify(cents))),600.35);
const summary=calculateEntry({quantity:3,servicePrice:cents.servicePrice,productCost:100,machineFee:0,commercialDiscount:0,professionalPercent:30,discountSplit:'Empresa e profissional dividem',payments:[{amount:600.35,fee:0,discount:0}],procedureLines:[cents]});assert.equal(Math.round(summary.grossRevenue*100),60035);assert.equal(summary.productCost,300);assert.equal(summary.received,600.35);
for(const amount of [0,1,99.99,12345.67]){const next=overrideProcedureLineTotal(three,amount);assert.equal(procedureLineTotal(next),amount);assert.equal(procedureLineTotal(changeProcedureLineQuantity(next,7)),amount);}
assert.equal(overrideProcedureLineTotal(two,NaN),two);assert.equal(changeProcedureLineQuantity(two,0),two);assert.equal(changeProcedureLineQuantity(two,-1),two);assert.equal(changeProcedureLineQuantity(two,Infinity),two);
const legacy={...original,quantity:2};assert.equal(procedureLineTotal(legacy),2000);assert.equal(procedureLineTotal(changeProcedureLineQuantity(legacy,4)),4000);const reset={...custom,totalPriceOverride:undefined,servicePrice:1000};assert.equal(procedureLineTotal(changeProcedureLineQuantity(reset,3)),3000);
console.log('PASS: catalog quantity multiplication until overridden; explicit total retained through quantity changes and JSON persistence; proportional unit storage without cent loss; costs scale independently, zero/below-cost totals, legacy records and catalog reset.');
