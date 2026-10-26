import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
const source = ts.transpileModule(fs.readFileSync('lib/sharedUpdates.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { notifySharedSave, watchSharedUpdates } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const intervals = new Map(), channels = new Set(), oldChannel = globalThis.BroadcastChannel;
globalThis.window = Object.assign(new EventTarget(), { setInterval(callback) { intervals.set(callback, callback); return callback; }, clearInterval(id) { intervals.delete(id); }, localStorage: { setItem() { throw new Error('Blocked browser storage'); } } });
globalThis.document = Object.assign(new EventTarget(), {visibilityState:'visible'});
globalThis.BroadcastChannel = class {
 constructor(name) { this.name = name; channels.add(this); }
 postMessage(data) { assert.equal(data, 'saved', 'Signals must never contain clinical records or credentials'); for (const channel of channels) if (channel !== this && channel.name === this.name) channel.onmessage?.({ data }); }
 close() { channels.delete(this); }
};
try {
 let first = 0, second = 0;
 const stopFirst = watchSharedUpdates(() => first++), stopSecond = watchSharedUpdates(() => second++);
 assert.equal(intervals.size, 0, 'Leaving the clinic open must not schedule continuous cloud downloads');
 notifySharedSave(); assert.ok(first > 0 && second > 0, 'A confirmed save signals all tabs without page reload');
 const before = first; for(let tick=0;tick<9600;tick++)for (const callback of intervals.values()) callback(); assert.equal(first,before,'Eight idle hours must cause no recurring refreshes');
 document.visibilityState='hidden';document.dispatchEvent(new Event('visibilitychange'));window.dispatchEvent(new Event('focus'));assert.equal(first,before,'Background tabs do not download records');
 document.visibilityState='visible';document.dispatchEvent(new Event('visibilitychange'));assert.ok(first>before,'Returning to a device fetches updates without reload');window.dispatchEvent(new Event('focus'));
 stopFirst(); stopSecond(); assert.equal(intervals.size, 0); assert.equal(channels.size, 0);
 const stopped = first; notifySharedSave(); assert.equal(first, stopped, 'Unsubscribed sessions must never receive subsequent events');
 globalThis.BroadcastChannel = undefined;
 const stopFallback = watchSharedUpdates(() => second++); assert.doesNotThrow(notifySharedSave); assert.equal(intervals.size, 0); stopFallback();
 globalThis.BroadcastChannel = class { constructor() { throw new Error('Blocked by browser privacy settings'); } };
 const stopBlocked = watchSharedUpdates(() => second++); assert.doesNotThrow(notifySharedSave, 'A blocked notification must never turn a confirmed cloud save into an error'); assert.equal(intervals.size, 0); stopBlocked();
 console.log('PASS: zero recurring cloud refreshes during eight idle hours, background tabs stay idle, returning focus/visibility reconnects, confirmed-save signals contain no records, teardown and blocked storage remain safe.');
} finally { globalThis.BroadcastChannel = oldChannel; delete globalThis.window; delete globalThis.document; }
