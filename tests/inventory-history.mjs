import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";

const compile = source => ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 }
}).outputText;
const moduleUrl = source => "data:text/javascript;base64," + Buffer.from(source).toString("base64");
const inventoryUrl = moduleUrl(compile(fs.readFileSync("lib/inventory.ts", "utf8")));
const historySource = compile(fs.readFileSync("lib/inventoryHistory.ts", "utf8")).replace('"./inventory"', JSON.stringify(inventoryUrl));
const { currentStockDate, stockUsageHistory, stockUsageInPeriod, procedureUsageHistory } = await import(moduleUrl(historySource));

assert.equal(currentStockDate(new Date("2026-11-18T02:59:59Z")), "2026-11-17");
assert.equal(currentStockDate(new Date("2026-11-18T03:00:00Z")), "2026-11-18");

const component = { procedureId: "belarine", quantity: 3 };
const combo = { id: "combo-line", procedureId: "combo", quantity: 2, unitCost: 100, comboItems: [component] };
const appointment = (id, date, stockConsumption) => ({
  id, startsAt: date, patientId: "patient", professionalId: "pro", stockConsumption,
  accountClosed: true
});
const appointments = [
  appointment("start-day", "2026-11-01T00:00:00", [{ procedureId: "belarine", quantity: 1 }]),
  {
    ...appointment("today", "2026-11-17T23:59:59", [
      { procedureId: "belarine", quantity: 6 }, { procedureId: "belarine", quantity: 1 }, { procedureId: "cannula", quantity: 2 }
    ]),
    closedAccount: { id: "account-today", generatedEntryId: "ledger-today", products: [combo] }
  },
  appointment("tomorrow", "2026-11-18T00:00:00", [{ procedureId: "belarine", quantity: 4 }]),
  appointment("end-day", "2026-11-30T23:59:59", [{ procedureId: "cannula", quantity: 1 }]),
  appointment("next-month", "2026-12-01T00:00:00", [{ procedureId: "belarine", quantity: 20 }]),
  { ...appointment("reopened", "2026-11-17T10:00:00", []), accountClosed: false, financialEntryId: "old-ledger" },
  { ...appointment("legacy-combo", "2026-10-31T23:59:59", undefined), closedAccount: { id: "old-account", products: [combo] } }
];
const entries = [
  { id: "ledger-today", date: "2026-11-17", products: [combo] },
  { id: "another-copy", sourceAccountId: "account-today", date: "2026-11-17", products: [combo] },
  { id: "old-ledger", appointmentId: "reopened", date: "2026-11-17", products: [combo] },
  { id: "legacy-ledger", sourceAccountId: "old-account", date: "2026-10-31", products: [combo] },
  { id: "legacy-product", date: "2026-11-15", professionalId: "pro", patientId: "patient", procedureId: "cannula", quantity: 3 },
  { id: "legacy-missing-names", date: "2026-11-17", products: [{ procedureId: "removed-product", quantity: 1, unitCost: 0 }] },
  { id: "negative", date: "2026-11-17", products: [{ procedureId: "belarine", quantity: -1 }] }
];
const patients = [{ id: "patient", name: "Paciente QA" }];
const professionals = [{ id: "pro", name: "Profissional QA" }];
const history = stockUsageHistory(appointments, entries, patients, professionals);
const today = stockUsageInPeriod(history, "2026-11-17", "2026-11-17");
assert.equal(today.length, 3);
assert.deepEqual(today.find(row => row.procedureId === "belarine"), {
  id: "today", procedureId: "belarine", date: "2026-11-17T23:59:59",
  professional: "Profissional QA", patient: "Paciente QA", quantity: 7
});
assert.equal(today.find(row => row.procedureId === "cannula").quantity, 2);
assert.equal(today.find(row => row.procedureId === "removed-product").professional, "Profissional não encontrado");
const month = stockUsageInPeriod(history, "2026-11-01", "2026-11-30");
assert.equal(month.reduce((sum, row) => sum + row.quantity, 0), 19);
assert.ok(month.some(row => row.id === "start-day"));
assert.ok(month.some(row => row.id === "end-day"));
assert.ok(!month.some(row => ["legacy-combo", "next-month"].includes(row.id)));
assert.deepEqual(stockUsageInPeriod(history, "2026-11-18", "2026-11-17"), []);
assert.deepEqual(stockUsageInPeriod(history, "", "2026-11-17"), []);
assert.deepEqual(stockUsageInPeriod(history, "2027-01-01", "2027-01-31"), []);
const legacyCombo = stockUsageInPeriod(history, "2026-10-31", "2026-10-31");
assert.equal(legacyCombo.length, 1);
assert.equal(legacyCombo[0].procedureId, "belarine");
assert.equal(legacyCombo[0].quantity, 6);
const perProduct = procedureUsageHistory("belarine", appointments, entries, patients, professionals);
assert.equal(perProduct.find(row => row.id === "today").quantity, 7);
assert.ok(!("procedureId" in perProduct[0]));
console.log("PASS: inventory usage dates default to São Paulo time, inclusive single-day/month ranges, actual combo components, legacy entries, duplicate prevention, reopened accounts and missing catalog references.");
