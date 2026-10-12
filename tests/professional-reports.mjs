import fs from "node:fs"; import os from "node:os"; import path from "node:path"; import { pathToFileURL } from "node:url"; import assert from "node:assert/strict"; import ts from "typescript";
const directory = fs.mkdtempSync(path.join(os.tmpdir(), "avvi-professional-reports-"));
try {
  const names = ["calculations", "appointmentServices", "reports", "professionalReports", "access"];
  for (const name of names) {
    let source = fs.readFileSync("lib/" + name + ".ts", "utf8");
    for (const dependency of names) source = source.replaceAll('"./' + dependency + '"', '"./' + dependency + '.mjs"');
    fs.writeFileSync(path.join(directory, name + ".mjs"), ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText);
  }
  const { professionalReports } = await import(pathToFileURL(path.join(directory, "professionalReports.mjs")));
  const { calculateEntry } = await import(pathToFileURL(path.join(directory, "calculations.mjs")));
  const { canReadEntity, canWriteEntity } = await import(pathToFileURL(path.join(directory, "access.mjs")));
  const entry = overrides => ({ id: "e", professionalId: "a", patientId: "patient-1", date: "2026-10-08", quantity: 1, servicePrice: 1000, productCost: 100, machineFee: 20, commercialDiscount: 50, professionalPercent: 30, discountSplit: "Empresa assume", payments: [{ amount: 900, fee: 10, discount: 0 }], ...overrides });
  const input = { start: "2026-10-01", end: "2026-10-31", professionals: [{ id: "a", name: "Ana", monthlyGoal: 2000 }, { id: "b", name: "Bia", monthlyGoal: 1000 }], patients: [{ id: "patient-1", name: "Clara" }, { id: "patient-2", name: "Daniela" }], procedures: [{id:"product",name:"Produto QA"}], services: [{ id: "s1", name: "Botox" }, { id: "s2", name: "Limpeza" }], monthlyGoals: [{ month: "2026-10", professionalGoals: { a: 5000 } }], entries: [entry({ id: "generated", appointmentId: "closed", sourceAccountId: "account", procedureLines: [{ procedureId: "product", quantity: 20, servicePrice: 50, productCost: 5, professionalPercent: 30 }] }), entry({ id: "manual", patientId: "patient-2", payments: [{ amount: 300, fee: 0, discount: 0 }], productCost: 100 })], appointments: [{ id: "closed", professionalId: "a", patientId: "patient-1", startsAt: "2026-10-08T10:00:00", accountClosed: true, status: "Finalizado", financialEntryId: "generated", closedAccount: { id: "account", patientId: "patient-1", generatedEntryId: "generated", procedureLines: [{ serviceId: "s1", quantity: 2, manualProcedure: "Botox" }, { serviceId: "s2", quantity: 1, manualProcedure: "Limpeza" }], products: [{ procedureId: "product", quantity: 20 }] } }, { id: "present", professionalId: "a", patientId: "patient-1", startsAt: "2026-10-09T10:00:00", status: "Compareceu", serviceId: "s1" }, { id: "cancelled", professionalId: "a", patientId: "patient-2", startsAt: "2026-10-09T12:00:00", status: "Cancelado", serviceId: "s1" }, { id: "confirmed", professionalId: "a", patientId: "patient-2", startsAt: "2026-10-09T14:00:00", status: "Confirmado", serviceId: "s1" }] };
  const before = JSON.stringify(input);
  let report = professionalReports(input), ana = report.reports[0];
  assert.equal(report.valid, true); assert.equal(report.reports.length, 2);
  const previous = input.entries.reduce((totals, entry) => { const row = calculateEntry(entry); for (const key of Object.keys(totals)) totals[key] += row[key]; return totals; }, { received: 0, baseProfit: 0, companyValue: 0, professionalValue: 0 });
  assert.equal(ana.totalPaid, previous.received); assert.equal(ana.totalProfit, previous.baseProfit); assert.equal(ana.companyRevenue, previous.companyValue); assert.equal(ana.professionalValue, previous.professionalValue);
  assert.equal(ana.closedPatientCount, 1); assert.equal(ana.averageTicket, 1200); assert.equal(ana.count, 2); assert.equal(ana.goal, 5000); assert.equal(ana.serviceCount, 4);
  assert.deepEqual(ana.services, [{ id: "s1", name: "Botox", value: 3 }, { id: "s2", name: "Limpeza", value: 1 }]);
  assert.equal(ana.patientRevenue[0].name, "Clara"); assert.equal(ana.patientRevenue[0].value, 900);
  assert.deepEqual(ana.products, [{id:"product",name:"Produto QA",value:20}]); assert.equal(Object.hasOwn(ana,"patientProfit"),false); assert.equal(ana.patientServices[0].value, 4);
  assert.deepEqual(report.reports[1].services, []); assert.equal(report.reports[1].totalPaid, 0); assert.equal(report.reports[1].averageTicket, 0); assert.equal(JSON.stringify(input), before);
  // Duplicate old service rows linked to the same appointment must not add extra services.
  const old = entry({ id: "legacy", patientId: "patient-2", accountClosed: true, procedureLines: [{ serviceId: "s2", quantity: 2, servicePrice: 100, productCost: 0, professionalPercent: 30 }], payments: [{ amount: 200, fee: 0, discount: 0 }] });
  report = professionalReports({ ...input, entries: [...input.entries, old, entry({ id: "old-manual", patientId: "patient-2", procedureLines: [{ serviceId: "s1", quantity: 3, servicePrice: 10, productCost: 0, professionalPercent: 30 }] })], appointments: [...input.appointments, { id: "old-appointment", patientId: "patient-2", professionalId: "a", startsAt: "2026-10-10T10:00:00", financialEntryId: "legacy", status: "Finalizado", accountClosed: true }] });
  assert.equal(report.reports[0].serviceCount, 9);
  report = professionalReports({ ...input, start: "2026-10-09", end: "2026-10-09" }); assert.equal(report.reports[0].totalPaid, 0); assert.equal(report.reports[0].serviceCount, 1);
  report = professionalReports({ ...input, start: "2026-10-31", end: "2026-10-01" }); assert.equal(report.valid, false); assert.equal(report.reports[0].totalPaid, 0);
  report = professionalReports({ ...input, start: "2026-10-01", end: "2026-11-30" }); assert.equal(report.reports[0].goal, 7000);
  const many = Array.from({ length: 8 }, (_, index) => entry({ id: "entry-" + index, patientId: "patient-" + index, payments: [{ amount: 100 + index, fee: 0, discount: 0 }], procedureLines: [{ serviceId: "service-" + index, quantity: index + 1, servicePrice: 100, productCost: 0, professionalPercent: 30 }] }));
  report = professionalReports({ ...input, entries: many, appointments: [] }); ana = report.reports[0];
  for (const key of ["services", "patientRevenue", "patientServices"]) assert.equal(ana[key].length, 5);
  assert.equal(ana.services[0].value, 8); assert.equal(ana.patientRevenue[0].value, 107);
  report = professionalReports({ ...input, appointments: [{ ...input.appointments[0], closedAccount: { id: "legacy-products", procedureLines: [{ procedureId: "product", quantity: 20 }], products: [] }, serviceId: "s1" }] });
  assert.equal(report.reports[0].serviceCount, 1);
  report = professionalReports({ ...input, appointments: [], patients: [{ id: "same-a", name: "Mesmo nome" }, { id: "same-b", name: "Mesmo nome" }], entries: [entry({ id: "same-e1", patientId: "same-a" }), entry({ id: "same-e2", patientId: "same-b" }), entry({ id: "unattributed", patientId: "" })] });
  assert.equal(report.reports[0].patientRevenue.length, 2); assert.equal(report.reports[0].totalPaid, 2700);
  report = professionalReports({ ...input, appointments: [...input.appointments, { ...input.appointments[0], id: "repeat", financialEntryId: "", closedAccount: { ...input.appointments[0].closedAccount, id: "repeat-account" } }, { ...input.appointments[0], id: "second-patient", patientId: "patient-2" }] });
  assert.equal(report.reports[0].closedPatientCount, 2); assert.equal(report.reports[0].averageTicket, 600);
  report = professionalReports({ ...input, appointments: input.appointments.filter(item=>!item.accountClosed) });
  assert.equal(report.reports[0].closedPatientCount, 0); assert.equal(report.reports[0].averageTicket, 0);
  report = professionalReports({...input,appointments:[],entries:[entry({id:"repeat1",patientId:"patient-1",accountClosed:true,payments:[{amount:100}]}),entry({id:"repeat2",patientId:"patient-1",accountClosed:true,payments:[{amount:200}]}),entry({id:"repeat3",patientId:"patient-1",accountClosed:true,payments:[{amount:300}]}),entry({id:"distinct",patientId:"patient-2",accountClosed:true,payments:[{amount:400}]}),entry({id:"return-only",patientId:"return-only",accountClosed:true,servicePrice:0,payments:[{amount:0}],procedureLines:[{serviceId:"return",quantity:1,servicePrice:0}]}),entry({id:"evaluation-only",patientId:"evaluation-only",accountClosed:true,servicePrice:0,payments:[{amount:0}],procedureLines:[{serviceId:"evaluation",quantity:1,servicePrice:0}]})]});
  assert.equal(report.reports[0].totalPaid,1000);assert.equal(report.reports[0].closedPatientCount,2);assert.equal(report.reports[0].averageTicket,500);
  const productEntries = Array.from({length:8},(_,i)=>entry({id:"product-entry"+i,products:[{procedureId:"prod"+i,quantity:i+1}]}));
  report=professionalReports({...input,appointments:[],entries:productEntries,procedures:Array.from({length:8},(_,i)=>({id:"prod"+i,name:"Produto "+i}))});
  assert.equal(report.reports[0].products.length,5);assert.equal(report.reports[0].products[0].value,8);assert.equal(report.reports[0].products[4].value,4);
  assert.equal(professionalReports({...input,start:"2026-10-09",end:"2026-10-09"}).reports[0].products.length,0);
  assert.equal(professionalReports({...input,start:"2026-10-31",end:"2026-10-01"}).reports[0].products.length,0);
  const restricted = { role: "standard", login: "reports-only", tabs: ["Relatório Profissional"] };
  for (const entity of ["patients", "services", "appointments", "financial_entries", "professionals", "monthly_goals"]) { assert.equal(canReadEntity(restricted, entity), true); assert.equal(canWriteEntity(restricted, entity), false); }
  console.log("PASS: Existing financial calculations unchanged, individual Top 5 services, products and patient rankings, separate service/product quantities, generated and legacy service deduplication, patients grouped by ID, discounts/costs/commissions, inactive/empty professionals, periods/goals, no data mutation and read-only permissions.");
} finally { fs.rmSync(directory, { recursive: true, force: true }); }
