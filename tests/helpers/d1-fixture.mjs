import {DatabaseSync} from 'node:sqlite';
import {readFileSync,readdirSync} from 'node:fs';
export function fixture(){
 const db=new DatabaseSync(':memory:');
 for(const path of readdirSync(new URL('../../migrations/',import.meta.url)).filter(p=>p.endsWith('.sql')).sort()) db.exec(readFileSync(new URL('../../migrations/'+path,import.meta.url),'utf8'));
 const wrap=(sql,args=[])=>({
  bind:(...values)=>wrap(sql,values),
  first:async()=>db.prepare(sql).get(...args)||null,
  all:async()=>({results:db.prepare(sql).all(...args)}),
  run:async()=>{const r=db.prepare(sql).run(...args);return {meta:{changes:r.changes,last_row_id:r.lastInsertRowid}};}
 });
 const env={DB:{prepare:sql=>wrap(sql),batch:async statements=>{db.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}}};
 return {db,env};
}
