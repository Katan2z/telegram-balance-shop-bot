import {PGlite} from '../.audit-runtime/package/dist/index.js';
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const db = new PGlite();
await db.exec(`create role anon; create role authenticated; create role service_role;
create table admin_notifications (
 id bigint generated always as identity primary key,
 is_active boolean default true, next_send_at timestamptz default now(),
 last_sent_at timestamptz, repeat_hours integer
);`);
const migration = await readFile('docs/migrations/20261009_notification_queue.sql','utf8');
await db.exec(migration);
await db.exec(migration);
await db.exec('insert into admin_notifications default values');
let claimed = (await db.query('select * from claim_admin_notifications(1)')).rows;
assert.equal(claimed.length,1);
assert.equal((await db.query('select * from claim_admin_notifications(1)')).rows.length,0);
assert.equal((await db.query("select finish_admin_notification(1,'00000000-0000-0000-0000-000000000000') as ok")).rows[0].ok,false);
await db.query('select finish_admin_notification($1,$2,$3)',[1,claimed[0].lease_token,'offline']);
let row = (await db.query('select * from admin_notifications')).rows[0];
assert.equal(row.last_error,'offline');
assert.equal(row.is_active,true);
assert.equal(row.lease_token,null);
assert.equal((await db.query('select * from claim_admin_notifications(1)')).rows.length,0);
await db.exec("update admin_notifications set next_send_at=now()-interval '1 minute'");
claimed = (await db.query('select * from claim_admin_notifications(1)')).rows;
await db.query('select finish_admin_notification($1,$2)',[1,claimed[0].lease_token]);
row = (await db.query('select * from admin_notifications')).rows[0];
assert.equal(row.is_active,false);
assert.equal(row.last_error,null);
assert.equal(row.delivery_attempts,0);
await db.exec('insert into admin_notifications(repeat_hours) values(4)');
claimed = (await db.query('select * from claim_admin_notifications(1)')).rows;
await db.query('select finish_admin_notification($1,$2)',[2,claimed[0].lease_token]);
row = (await db.query('select * from admin_notifications where id=2')).rows[0];
assert.equal(row.is_active,true);
assert.ok(new Date(row.next_send_at)>new Date());
await db.close();
console.log('Queue migration and delivery transitions passed');
