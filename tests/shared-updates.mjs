import fs from 'node:fs';
import assert from 'node:assert/strict';
import ts from 'typescript';
const source = ts.transpileModule(fs.readFileSync('lib/sharedUpdates.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.ES2022, target: ts.ScriptTarget.ES2022 } }).outputText;
const { notifySharedSave, watchSharedUpdates, sharedRefreshInterval } = await import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
const intervals = new Map(), channels = new Set(), oldChannel = globalThis.BroadcastChannel;
globalThis.window = Object.assign(new EventTarget(), { setInterval(callback, delay) { assert.equal(delay, 3000); intervals.set(callback, callback); return callback; }, clearInterval(id) { intervals.delete(id); }, localStorage: { setItem() { throw new Error('Blocked browser storage'); } } });
globalThis.document = new EventTarget();
globalThis.BroadcastChannel = class {
 constructor(name) { this.name = name; channels.add(this); }
 postMessage(data) { assert.equal(data, 'saved', 'Signals must never contain clinical records or credentials'); for (const channel of channels) if (channel !== this && channel.name === this.name) channel.onmessage?.({ data }); }
 close() { channels.delete(this); }
};
try {
 let first = 0, second = 0;
 const stopFirst = watchSharedUpdates(() => first++), stopSecond = watchSharedUpdates(() => second++);
 assert.equal(sharedRefreshInterval, 3000);
 notifySharedSave(); assert.ok(first > 0 && second > 0, 'A confirmed save signals all tabs without page reload');
 const before = first; for (const callback of intervals.values()) callback(); assert.ok(first > before, 'Independent devices receive updates through polling');
 document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('focus'));
 stopFirst(); stopSecond(); assert.equal(intervals.size, 0); assert.equal(channels.size, 0);
 const stopped = first; notifySharedSave(); assert.equal(first, stopped, 'Unsubscribed sessions must never receive subsequent events');
 globalThis.BroadcastChannel = undefined;
 const stopFallback = watchSharedUpdates(() => second++); assert.doesNotThrow(notifySharedSave); assert.equal(intervals.size, 1); stopFallback();
 globalThis.BroadcastChannel = class { constructor() { throw new Error('Blocked by browser privacy settings'); } };
 const stopBlocked = watchSharedUpdates(() => second++); assert.doesNotThrow(notifySharedSave, 'A blocked notification must never turn a confirmed cloud save into an error'); assert.equal(intervals.size, 1); stopBlocked();
 console.log('PASS: confirmed-save notifications refresh open tabs without data in signals or reload, independent sessions poll every three seconds, focus/visibility reconnect and teardown work, blocked storage preserves polling.');
} finally { globalThis.BroadcastChannel = oldChannel; delete globalThis.window; delete globalThis.document; }
