import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'avvi-shared-recovery-'));
try {
 const modules = ['persistence', 'access', 'inventory', 'gifts', 'checkout', 'packageSessions', 'sharedSnapshot', 'agendaAvailability', 'agendaSync'];
 for (const name of modules) {
  if (!fs.existsSync(`lib/${name}.ts`)) continue;
  let source = fs.readFileSync(`lib/${name}.ts`, 'utf8');
  for (const dependency of modules) source = source.replaceAll(`"./${dependency}"`, `"./${dependency}.mjs"`);
  fs.writeFileSync(path.join(directory, name + '.mjs'), ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText);
 }
 const persistence = await import(pathToFileURL(path.join(directory, 'persistence.mjs')).href);
 const recover = fs.existsSync('lib/sharedSnapshot.ts')
  ? (await import(pathToFileURL(path.join(directory, 'sharedSnapshot.mjs')).href)).recoverSharedSnapshot
  : persistence.recoverPendingChanges;
 const user = { login: 'operator', role: 'standard', tabs: ['Agenda'] };
 const appointment = { id: 'visit', patientId: 'patient', professionalId: 'professional', accountClosed: false };
 const product = { id: 'use', procedureId: 'product', quantity: 2, unitCost: 50 };
 const gift = { id: 'gift-use', giftId: 'gift', name: 'Brinde QA', quantity: 1 };
 const closed = { ...appointment, accountClosed: true, stockConsumption: [{ procedureId: 'product', quantity: 2 }], giftConsumption: [gift], closedAccount: { id: 'account', appointmentId: appointment.id, products: [product], gifts: [gift], procedureLines: [{ id: 'line', quantity: 1, servicePrice: 300 }], payments: [{ amount: 300 }] } };
 const baseline = persistence.normalizeSnapshot({ appointments: [appointment], inventory: [{ id: 'stock', procedureId: 'product', quantity: 10 }], gifts: [{ id: 'gift', name: 'Brinde QA', quantity: 4 }] });
 const draft = { ...baseline, appointments: [closed], inventory: [{ ...baseline.inventory[0], quantity: 8 }], gifts: [{ ...baseline.gifts[0], quantity: 3 }] };
 const remote = structuredClone(baseline);
 remote.inventory[0].quantity = 15; remote.gifts[0].quantity = 7;
 let recovered = recover(remote, baseline, draft, user);
 assert.equal(recovered.inventory[0].quantity, 13, 'A pending standard checkout must consume from current shared stock, not restore its stale absolute balance');
 assert.equal(recovered.gifts[0].quantity, 6);
 assert.equal(recovered.appointments[0].accountClosed, true);
 const stockUser = { ...user, tabs: ['Agenda', 'Estoque', 'Estoque: movimentação'] };
 assert.equal(recover(remote, baseline, draft, stockUser).inventory[0].quantity, 13, 'Automatic checkout consumption also rebases for users allowed to move stock');
 assert.equal(recover(remote, baseline, { ...draft, inventory: [{ ...draft.inventory[0], quantity: 99 }] }, stockUser).inventory[0].quantity, 99, 'An explicit manual balance adjustment retains its existing semantics');
 // The server committed our checkout, lost its acknowledgement, then another user moved stock.
 const committed = { ...remote, appointments: [closed] };
 committed.inventory = [{ ...remote.inventory[0], quantity: 11 }]; committed.gifts = [{ ...remote.gifts[0], quantity: 5 }];
 recovered = recover(committed, baseline, draft, user);
 assert.equal(recovered.inventory[0].quantity, 11, 'A committed checkout must not consume twice or undo another user’s later stock movement');
 assert.equal(recovered.gifts[0].quantity, 5);
 // Reversal uses the latest shared stock and reverses only this appointment's usage.
 const reversed = { ...draft, appointments: [{ ...appointment, stockConsumption: [], giftConsumption: [] }], inventory: baseline.inventory, gifts: baseline.gifts };
 recovered = recover(committed, draft, reversed, user);
 assert.equal(recovered.inventory[0].quantity, 13); assert.equal(recovered.gifts[0].quantity, 6);
 const deleted = { ...reversed, appointments: [] };
 recovered = recover(committed, draft, deleted, user);
 assert.equal(recovered.inventory[0].quantity, 13); assert.equal(recovered.appointments.length, 0);
 // A plain new booking survives recovery alongside another user's stock adjustment.
 const booked = { ...baseline, appointments: [...baseline.appointments, { ...appointment, id: 'new-visit' }] };
 recovered = recover(remote, baseline, booked, user);
 assert.equal(recovered.inventory[0].quantity, 15); assert.equal(recovered.appointments.length, 2);
 assert.deepEqual(remote.inventory, [{ id: 'stock', procedureId: 'product', quantity: 15 }], 'Recovery never mutates the acknowledged cloud baseline');
 const partition = fs.existsSync('lib/agendaSync.ts') ? (await import(pathToFileURL(path.join(directory, 'agendaSync.mjs')).href)).saveableAgendaSnapshot : (_baseline, data) => ({ data, conflicts: [] });
 const slot = { professionalId: 'professional', startsAt: '2026-10-08T09:00:00', endsAt: '2026-10-08T10:00:00', status: 'Agendado', eventType: 'Novo Agendamento', notes: '' };
 const bookedCloud = persistence.normalizeSnapshot({ ...baseline, professionals: [{ id: 'professional', name: 'Profissional QA', active: true }], patients: [{ id: 'patient', name: 'Paciente existente', futureCredit: 0 }], appointments: [{ ...slot, id: 'occupied', patientId: 'patient' }] });
 const blocked = { ...closed, ...slot, id: 'blocked', patientId: 'pending-patient', closedAccount: { ...closed.closedAccount, id: 'blocked-account', appointmentId: 'blocked', patientId: 'pending-patient', creditAdded: 20, generatedEntryId: 'procedure-account-blocked-account' } };
 const good = { ...slot, id: 'good', patientId: 'patient', startsAt: '2026-10-08T11:00:00', endsAt: '2026-10-08T12:00:00' };
 const conflictDraft = { ...bookedCloud, appointments: [...bookedCloud.appointments, blocked, good], patients: [...bookedCloud.patients, { id: 'pending-patient', name: 'Paciente em conflito', futureCredit: 20 }], inventory: [{ ...baseline.inventory[0], quantity: 8 }], gifts: [{ ...baseline.gifts[0], quantity: 3 }], financial_entries: [{ id: 'procedure-account-blocked-account', appointmentId: 'blocked', sourceAccountId: 'blocked-account' }], revenues: [{ id: 'receita-entry-blocked-account', sourceFinancialEntryId: 'blocked-account', total: 300 }], fixed_costs: [{ id: 'taxa-maquininha-blocked-account', sourceFinancialEntryId: 'blocked-account', value: 3 }] };
 const safe = partition(bookedCloud, conflictDraft);
 assert.equal(safe.conflicts.length, 1, 'The persistent occupied-slot error must identify the pending appointment instead of poisoning every save');
 assert.equal(safe.conflicts[0].appointmentId, 'blocked');
 assert.deepEqual(safe.data.appointments.map(row => row.id), ['occupied', 'good']);
 assert.equal(safe.data.patients.some(row => row.id === 'pending-patient'), false, 'Do not save an orphan patient from a blocked booking');
 assert.equal(safe.data.inventory[0].quantity, 10); assert.equal(safe.data.gifts[0].quantity, 4);
 assert.equal(safe.data.financial_entries.length + safe.data.revenues.length + safe.data.fixed_costs.length, 0, 'A blocked closure must not produce stock, debt, commission or revenue in the cloud');
 assert.equal(conflictDraft.appointments.length, 3); assert.equal(conflictDraft.patients.at(-1).futureCredit, 20, 'The full local draft remains available for review, including payment and patient data');
 const repaired = { ...conflictDraft, appointments: conflictDraft.appointments.map(row => row.id === 'blocked' ? { ...row, startsAt: '2026-10-08T13:00:00', endsAt: '2026-10-08T14:00:00' } : row) };
 assert.equal(partition(bookedCloud, repaired).conflicts.length, 0, 'Rescheduling the preserved pending appointment releases its original closure for saving');
 const sharedPatientGood = { ...good, patientId: blocked.patientId, accountClosed: true, stockConsumption: [{ procedureId: 'product', quantity: 1 }], giftConsumption: [gift], closedAccount: { ...blocked.closedAccount, id: 'good-account', appointmentId: good.id, creditAdded: 5, products: [{ ...product, quantity: 1 }], generatedEntryId: 'procedure-account-good-account' } };
 const combined = { ...conflictDraft, appointments: [...bookedCloud.appointments, blocked, sharedPatientGood], inventory: [{ ...baseline.inventory[0], quantity: 7 }], gifts: [{ ...baseline.gifts[0], quantity: 2 }], patients: [...bookedCloud.patients, { id: blocked.patientId, name: 'Paciente em conflito', futureCredit: 25 }], financial_entries: [...conflictDraft.financial_entries, { id: 'procedure-account-good-account', appointmentId: good.id, sourceAccountId: 'good-account' }], revenues: [...conflictDraft.revenues, { id: 'receita-entry-good-account', sourceFinancialEntryId: 'good-account', total: 300 }] };
 const otherClosure = partition(bookedCloud, combined);
 assert.equal(otherClosure.conflicts.length, 1); assert.equal(otherClosure.data.inventory[0].quantity, 9); assert.equal(otherClosure.data.gifts[0].quantity, 3);
 assert.equal(otherClosure.data.patients.find(row => row.id === blocked.patientId).futureCredit, 5, 'Keep the independent closure’s credit, excluding the blocked closure’s credit');
 assert.deepEqual(otherClosure.data.financial_entries.map(row => row.id), ['procedure-account-good-account']); assert.equal(otherClosure.data.revenues.length, 1);
 const cloudOriginal = { ...blocked, startsAt: '2026-10-08T13:00:00', endsAt: '2026-10-08T14:00:00' };
 const movedBaseline = { ...bookedCloud, appointments: [...bookedCloud.appointments, cloudOriginal], patients: conflictDraft.patients, inventory: conflictDraft.inventory, gifts: conflictDraft.gifts, financial_entries: conflictDraft.financial_entries, revenues: conflictDraft.revenues, fixed_costs: conflictDraft.fixed_costs };
 const pendingMove = { ...movedBaseline, appointments: [...bookedCloud.appointments, blocked, good] };
 const movedSafe = partition(movedBaseline, pendingMove);
 assert.equal(movedSafe.conflicts.length, 1); assert.deepEqual(movedSafe.data.appointments.find(row => row.id === blocked.id), cloudOriginal, 'A blocked move never deletes or reopens the original cloud account');
 assert.equal(movedSafe.data.inventory[0].quantity, movedBaseline.inventory[0].quantity);
 const emptyStock = partition({ ...bookedCloud, inventory: [], gifts: [] }, { ...conflictDraft, inventory: [{ id: 'product', procedureId: 'product', quantity: -2 }], gifts: [{ id: 'gift', name: 'Brinde QA', quantity: -1 }] });
 assert.equal(emptyStock.data.inventory.length, 0); assert.equal(emptyStock.data.gifts.length, 0, 'The first untracked usage must not leave a forbidden zero stock row blocking the remaining saves');
 const tips = [{ id: 'tip', initialShots: 100, usages: [{ id: 'manual-before', quantity: 2 }, { id: 'linked', appointmentId: blocked.id, quantity: 3 }, { id: 'manual-after', quantity: 4 }] }];
 const shotProjection = partition({ ...movedBaseline, ultraformer_tips: tips }, { ...pendingMove, ultraformer_tips: [{ ...tips[0], usages: [tips[0].usages[0], { ...tips[0].usages[1], quantity: 5 }, tips[0].usages[2]] }] });
 assert.deepEqual(shotProjection.data.ultraformer_tips, tips, 'Restoring a blocked usage preserves the original shot-history order and cannot poison another save with an unrelated tip rewrite');
 console.log('PASS: pending stock/gift recovery and idempotent acknowledgement; occupied-slot conflicts remain local while unrelated bookings and closures save; linked financial rows, shared-patient credit, original cloud closures and orphan prevention stay consistent. Fictional data only.');
} finally { fs.rmSync(directory, { recursive: true, force: true }); }
