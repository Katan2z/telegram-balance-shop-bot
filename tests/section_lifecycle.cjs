const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
let tick, visible = false, editing = false, calls = 0, release;
const root = {getClientRects: () => visible ? [1] : [], contains: () => editing};
const context = {
  window: {addEventListener() {}},
  document: {hidden: false, getElementById: () => root, activeElement: {matches: () => true}, addEventListener() {}},
  setInterval: fn => {tick = fn; return 1;}, clearInterval() {}, console, Promise, Map, Date,
};
vm.runInNewContext(fs.readFileSync('docs/section-lifecycle.js', 'utf8'), context);
context.window.bk8PollSection('test', 0, () => {calls++; return new Promise(resolve => {release = resolve;});});
(async () => {
  await tick(); assert.equal(calls, 0, 'hidden section must not load');
  visible = true; editing = true;
  await tick(); assert.equal(calls, 0, 'editing must not be overwritten');
  editing = false; context.document.hidden = true;
  await tick(); assert.equal(calls, 0, 'hidden document must not load');
  context.document.hidden = false;
  await tick(); await tick(); assert.equal(calls, 1, 'requests must not overlap');
  release(); await new Promise(resolve => setImmediate(resolve));
  await tick(); assert.equal(calls, 2, 'completed request may refresh again');
  release(); console.log('Section lifecycle tests passed');
})().catch(error => {console.error(error); process.exitCode = 1;});
