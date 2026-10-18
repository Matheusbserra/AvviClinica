import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
export async function createPackageTestDatabase(){
 const fallback=pathToFileURL(path.resolve('.avvi-local/package-session-tests/node_modules/@electric-sql/pglite/dist/index.js')).href;
 const {PGlite}=await import(process.env.AVVI_PGLITE_MODULE??fallback);
 const db=new PGlite();
 await db.exec("create role anon; create role authenticated; create role service_role; create table avvi_records(entity text not null, record_id text not null, data jsonb not null, updated_at timestamptz default now(), primary key(entity,record_id)); grant all on avvi_records to service_role;");
 const sql=fs.readFileSync('supabase/package-sessions.sql','utf8');await db.exec(sql);await db.exec(sql);
 return db;
}
