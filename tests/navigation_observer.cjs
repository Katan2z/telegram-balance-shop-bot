const vm = require('node:vm');
const fs = require('node:fs');
const assert = require('node:assert/strict');
let callback, watching = false, updates = 0;
const queue = [];
const button = {dataset: {tab: 'home'}, textContent: 'Главная', style: {}, classList: {
  contains: () => false,
  remove() { updates++; if (watching) callback(); },
  add() { if (watching) callback(); },
}};
const tabs = {querySelectorAll: () => [button]};
const context = {
  document: {readyState: 'complete', getElementById: id => id === 'tabs' ? tabs : null, querySelectorAll: () => [], addEventListener() {}},
  window: {addEventListener() {}},
  MutationObserver: class {constructor(fn) {callback = fn;} observe() {watching = true;} disconnect() {watching = false;}},
  queueMicrotask: fn => queue.push(fn), Set,
};
vm.runInNewContext(fs.readFileSync('docs/navigation.js', 'utf8'), context);
callback(); callback();
assert.equal(queue.length, 1, 'external changes are batched');
queue.shift()();
assert.equal(queue.length, 0, 'navigation must not observe its own class changes');
assert.equal(watching, true, 'external changes must still be observed');
assert.ok(updates > 0);
console.log('Navigation observer regression passed');
