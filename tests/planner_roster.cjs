const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const P = require('../docs/control/planner-engine.js');
const source = fs.readFileSync('docs/control/planner-ui.js', 'utf8');
const helpers = source.slice(source.indexOf('  function dayDate('), source.indexOf('  function openShiftEditor('));
const config = P.defaults();
config.reviewed = true;
config.spmh = 150;
P.DAYS.forEach(day => config.forecasts[day] = {revenue: 10000, checks: 600, averageCheck: null});
const state = {
  week: '2026-10-26', view: 'shifts', config,
  employees: [{employee_profile_id: 1, employee_name: '<Example>', work_type: 'FT', availability: {mon: 'ФТ'}}],
  shifts: [{employeeId: 1, day: 'mon', start: 480, end: 960, positions: {480: 'kitchen'}, locked: true}],
};
const context = {
  P, state, labels: ['ПН', 'ВТ', 'СР', 'ЧТ', 'ПТ', 'СБ', 'ВС'],
  escape: value => String(value ?? '').replaceAll('<', '&lt;').replaceAll('>', '&gt;'),
};
vm.runInNewContext(helpers + ';globalThis.roster = rosterMarkup;globalThis.totals = dayTotals;', context);
let html = context.roster();
assert.equal((html.match(/data-employee-row=/g) || []).length, 1, 'employee has exactly one weekly row');
assert.equal((html.match(/data-edit-cell=/g) || []).length, 7, 'seven days per employee');
assert.ok(html.includes('01.11'), 'week crossing month has correct Sunday');
assert.ok(html.includes('&lt;Example&gt;'), 'names must be escaped');
assert.ok(html.includes('Ознакомлен'), 'signature is visible in the final layout');
assert.ok(html.includes('08:00–16:00'));
assert.ok(html.includes('Возможности не заполнены'), 'blank availability is not treated as full-time');
const totals = context.totals('mon', P.demand(config).slots);
assert.equal(totals.hours, 8);
assert.ok(Math.abs(totals.spmh - 1250) < 1e-8);
assert.equal(context.totals('tue', []).spmh, null, 'no hours means no SPMH');
state.view = 'availability';
html = context.roster();
assert.ok(html.includes('ФТ'));
assert.ok(!html.includes('data-edit-cell='), 'availability is a read-only source');
assert.ok(!html.includes('Ознакомлен'), 'signature belongs to assigned shifts, not employee availability');
console.log('Planner weekly roster tests passed');
