const vm = require('node:vm'), fs = require('node:fs'), assert = require('node:assert/strict');
let saved = {access_token: 'old', refresh_token: 'refresh', expires_at: 1}, requests = 0, remembered;
const context = {window: {}, storedAdminSession: () => saved, ADMIN_SESSION_KEY: 'key',
  localStorage: {getItem: () => null}, authConfig: () => ({url: 'https://test', key: 'public'}),
  decodeJwt: () => ({app_metadata: {admin_role: 'restaurant_admin'}}),
  clearAdminSession: () => {saved = null;}, saveAdminSession: (value, remember) => {saved = value; remembered = remember;},
  fetch: async () => {requests++; return {ok: true, json: async () => ({access_token: 'new', refresh_token: 'rotated', expires_at: Date.now()/1000+3600})};},
  AbortSignal, Date, Error,
};
vm.runInNewContext(fs.readFileSync('docs/control/session-client.js', 'utf8'), context);
(async () => {
  const sessions = await Promise.all([context.window.bk8AccessSession(), context.window.bk8AccessSession()]);
  assert.equal(requests, 1, 'parallel requests share a refresh');
  assert.equal(sessions[0].access_token, 'new');
  assert.equal(remembered, false, 'session-only login must remain session-only');
  await context.window.bk8AccessSession(); assert.equal(requests, 1);
  context.fetch = async () => ({ok: false, status: 401});
  await assert.rejects(context.window.bk8AccessSession(true));
  assert.equal(saved, null);
  console.log('Admin session tests passed');
})().catch(error => {console.error(error); process.exitCode = 1;});
