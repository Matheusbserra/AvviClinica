import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createPackageTestDatabase} from './package-session-db-helper.mjs';
const db=await createPackageTestDatabase();
try{
 const sql=fs.readFileSync('supabase/compact-sync.sql','utf8');await db.exec(sql);await db.exec(sql);
 await db.exec("alter role service_role bypassrls; alter table avvi_records enable row level security;");
 const get=async()=>{const result=await db.query("select * from avvi_sync_revisions($1::text[]) order by entity",[['patients','appointments','empty']]);return Object.fromEntries(result.rows.map(row=>[row.entity,row.fingerprint]));};
 await db.query("insert into avvi_records(entity,record_id,data,updated_at) select 'patients','p'||n,jsonb_build_object('id','p'||n),'2026-10-01'::timestamptz from generate_series(1,1500) n");
 const initial=await get();assert.equal(Object.keys(initial).length,3);assert.ok(Object.values(initial).every(value=>/^[a-f0-9]{64}$/.test(value)));
 assert.deepEqual(await get(),initial);
 await db.exec("set timezone='America/Sao_Paulo'");assert.deepEqual(await get(),initial);
 await db.exec("update avvi_records set updated_at='2026-01-01' where record_id='p1499'");const backdated=await get();assert.notEqual(backdated.patients,initial.patients);assert.equal(backdated.appointments,initial.appointments);
 await db.exec("delete from avvi_records where record_id='p1499'");const deleted=await get();assert.notEqual(deleted.patients,backdated.patients);
 await db.exec("delete from avvi_records where entity='patients'");assert.equal((await get()).patients,initial.empty);
 await db.exec('set role anon');await assert.rejects(get,/permission denied/);await db.exec('reset role');
 await db.exec('set role authenticated');await assert.rejects(get,/permission denied/);await db.exec('reset role');
 await db.exec('set role service_role');assert.deepEqual(await get(),{appointments:initial.empty,empty:initial.empty,patients:initial.empty});await db.exec('reset role');
 console.log('PASS: compact fingerprints execute/reexecute in isolated PostgreSQL, detect updates/deletions/backdated changes beyond 1000 rows, include empty categories, and permit only the private service role. No production database changes.');
}finally{await db.close();}
