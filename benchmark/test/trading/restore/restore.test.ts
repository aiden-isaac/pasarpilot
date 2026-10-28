import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync,openSync,closeSync,writeFileSync,createReadStream } from 'node:fs';
import { join,dirname,isAbsolute } from 'node:path';
import { randomUUID,createHash } from 'node:crypto';
import { hostname } from 'node:os';
import { operationsTest,application } from '../operations/helpers.js';
import { ownedDirectory,accountsFor,httpClient } from '../../../src/trading/operations.js';
import { pool,checkSchema } from '../../../src/trading/db.js';
import pg from 'pg';
import { migrate } from '../../../src/trading/migrate.js';
import { login } from '../../../src/trading/auth.js';
import { worker } from '../../../src/trading/worker.js';

test('private streamed backup restores separately with bounded complete record comparison and working access',{timeout:180000},async()=>{
 const ctx=operationsTest('backup'),{root,database,report,p,admin}=ctx,restore=process.env.OPERATIONS_RESTORE_ROOT;
 assert.ok(restore&&isAbsolute(restore)&&restore!==root&&!existsSync(restore),'new explicit OPERATIONS_RESTORE_ROOT required');ownedDirectory(dirname(restore));
 const dump=join(report.output,'database.dump'),out=openSync(dump,'wx',0o600);let targetAdmin:pg.Pool|undefined,target:pg.Pool|undefined,app:Awaited<ReturnType<typeof application>>|undefined;
 const run=(stage:string,runtime:string,args:string[],input:'ignore'|number='ignore',output:'ignore'|number='ignore')=>{try{execFileSync(runtime,args,{stdio:[input,output,'pipe'],timeout:120000,maxBuffer:65536});}catch(error){writeFileSync(join(report.output,stage+'-error.log'),(error as {stderr?:Buffer}).stderr??Buffer.from('command failed'),{mode:0o600,flag:'wx'});throw Error(stage+'-failed-see-private-evidence');}};
 try{
  try{run('dump',database.runtime,['exec',database.container,'pg_dump','-U','fixture','-d','fixture','-Fc'], 'ignore',out);}finally{closeSync(out);}
  const hash=createHash('sha256');for await(const chunk of createReadStream(dump))hash.update(chunk);const sha256=hash.digest('hex');report.write({type:'backup',sha256,sourceUnchanged:true});
  run('prepare','sh',['prepare-scheduler-db.sh',restore,database.runtime]);
  process.env.PGHOST=join(restore,'socket');targetAdmin=pool('fixture');await targetAdmin.query('CREATE ROLE trading_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE');
  const restoredDatabase=JSON.parse((await import('node:fs')).readFileSync(join(restore,'database.json'),'utf8')),input=openSync(dump,'r');try{run('restore',restoredDatabase.runtime,['exec','-i',restoredDatabase.container,'pg_restore','--exit-on-error','-U','fixture','-d','fixture'],input);}finally{closeSync(input);}
  writeFileSync(join(restore,'operations.json'),JSON.stringify({purpose:'disposable-seller-operations-v1',root:restore,host:hostname(),id:randomUUID(),revision:'restore-verification',sourceDirty:false,restoredFrom:root,backupSha256:sha256}),{mode:0o600,flag:'wx'});writeFileSync(join(restore,'accounts.json'),JSON.stringify(accountsFor(root)),{mode:0o600,flag:'wx'});target=pool();await checkSchema(target);
  const tables=['sellers','actors','sources','streams','inventory','listings','items','inbox','conflicts','conversations','claims','orders','reservations','drafts','deliveries','reviews','messages','activity','sessions','login_limits','migrations'].map(t=>'trading.'+t).concat(['trading_queue.job','trading_queue.archive','trading_queue.queue','trading_queue.version','trading_queue.schedule','trading_queue.subscription']);
  const compare=async(sourcePool:pg.Pool,copyPool:pg.Pool,stage:string,legacy=false)=>{for(const table of tables){
   let keys=(await sourcePool.query(`SELECT a.attname FROM pg_index i CROSS JOIN LATERAL unnest(i.indkey) WITH ORDINALITY k(num,position) JOIN pg_attribute a ON a.attrelid=i.indrelid AND a.attnum=k.num WHERE i.indrelid=$1::regclass AND i.indisprimary ORDER BY k.position`,[table])).rows.map(r=>r.attname as string);
   if(!keys.length&&['trading_queue.job','trading_queue.archive'].includes(table))keys=['name','id'];assert.ok(keys.length&&keys.every(k=>/^[a-z_]+$/.test(k)),'known primary key required: '+table);
   const expressions=keys.map(k=>`t.${k}::text COLLATE "C"`),tuple='('+expressions.join(',')+')',payload=legacy&&table==='trading.sellers'?"(to_jsonb(t)-'display_name'-'profile_version')":legacy&&table==='trading.orders'?"(to_jsonb(t)-'created_at')":legacy&&table==='trading.migrations'?"(to_jsonb(t)-'applied_at')":'to_jsonb(t)';let after:string[]|undefined,count=0;
   for(;;){const sql=`SELECT ${expressions.map((x,i)=>x+' AS key'+i).join(',')},${payload}::text AS payload FROM ${table} t ${after?'WHERE '+tuple+'>('+keys.map((_,i)=>'$'+(i+1)).join(',')+')':''} ORDER BY ${expressions.join(',')} LIMIT 100`,args=after??[];const source:pg.QueryResultRow[]=(await sourcePool.query(sql,args)).rows,copy:pg.QueryResultRow[]=(await copyPool.query(sql,args)).rows;assert.equal(copy.length,source.length,table);for(let n=0;n<source.length;n++)assert.ok(source[n]!.payload===copy[n]!.payload,'restored record differs: '+table);count+=source.length;if(source.length<100)break;const last=source.at(-1)!;after=keys.map((_,i)=>last['key'+i]);}
   report.write({type:'restore-compare',stage,table,rows:count,maxPageRows:100});
  }};
  await compare(admin,targetAdmin,'current-schema');
  for(const version of[1,2]){
   const legacyName=`legacy_${process.pid}_${version}`,copyName=legacyName+'_restored';await targetAdmin.query(`CREATE DATABASE ${legacyName}`);await targetAdmin.query(`CREATE DATABASE ${copyName}`);
   const seedDump=openSync(dump,'r');try{run('legacy-seed-'+version,restoredDatabase.runtime,['exec','-i',restoredDatabase.container,'pg_restore','--exit-on-error','-U','fixture','-d',legacyName],seedDump);}finally{closeSync(seedDump);}
   const legacy:pg.Pool=new pg.Pool({host:join(restore,'socket'),user:'fixture',database:legacyName,max:3}),copy:pg.Pool=new pg.Pool({host:join(restore,'socket'),user:'fixture',database:copyName,max:3}),runtime:pg.Pool=new pg.Pool({host:join(restore,'socket'),user:'trading_runtime',database:copyName,max:3});let stop:(()=>Promise<void>)|undefined;
   try{
    // Only newly created disposable copies are shaped as legacy installations.
    await legacy.query('ALTER TABLE trading.sellers DROP COLUMN display_name,DROP COLUMN profile_version; ALTER TABLE trading.orders DROP COLUMN created_at; DELETE FROM trading.migrations WHERE version>2');if(version===1)await legacy.query('ALTER TABLE trading.orders DROP CONSTRAINT known_total; DELETE FROM trading.migrations WHERE version=2');
    const path=join(report.output,`legacy-v${version}.dump`),output=openSync(path,'wx',0o600);try{run('legacy-dump-'+version,restoredDatabase.runtime,['exec',restoredDatabase.container,'pg_dump','-U','fixture','-d',legacyName,'-Fc'],'ignore',output);}finally{closeSync(output);}
    const input=openSync(path,'r');try{run('legacy-restore-'+version,restoredDatabase.runtime,['exec','-i',restoredDatabase.container,'pg_restore','--exit-on-error','-U','fixture','-d',copyName],input);}finally{closeSync(input);}
    await migrate(legacy);await migrate(copy);await checkSchema(runtime);await compare(targetAdmin,legacy,'upgraded-v'+version,true);await compare(targetAdmin,copy,'restored-upgraded-v'+version,true);
    const account=accountsFor(root)[0]!,paid=(await runtime.query("SELECT o.seller_id,o.id,i.inventory_id FROM trading.orders o JOIN trading.items i ON(i.seller_id=o.seller_id AND i.id=o.item_id) WHERE o.payment='seller_verified' ORDER BY o.seller_id,o.id LIMIT 1")).rows[0],before=(await runtime.query('SELECT unsold,reserved FROM trading.inventory WHERE seller_id=$1 AND id=$2',[paid.seller_id,paid.inventory_id])).rows[0];
    stop=await worker(runtime);assert.equal((await login(runtime,account.login,account.password)).seller_id,account.seller);assert.deepEqual((await runtime.query('SELECT unsold,reserved FROM trading.inventory WHERE seller_id=$1 AND id=$2',[paid.seller_id,paid.inventory_id])).rows[0],before);report.write({type:'legacy-restore-complete',version,upgraded:true,restartedWorker:true,login:true,verifiedStockPreserved:true});
   }finally{await stop?.();await runtime.end();await copy.end();await legacy.end();}
  }
  await assert.rejects(target.query("UPDATE trading.activity SET reason='forbidden'"),{code:'42501'});await assert.rejects(target.query('INSERT INTO trading.migrations(version) VALUES(999)'),{code:'42501'});
  const paid=(await target.query("SELECT o.seller_id,o.id,i.inventory_id FROM trading.orders o JOIN trading.items i ON(i.seller_id=o.seller_id AND i.id=o.item_id) WHERE o.payment='seller_verified' ORDER BY o.seller_id,o.id LIMIT 1")).rows[0];assert.ok(paid);const before=(await target.query('SELECT unsold,reserved FROM trading.inventory WHERE seller_id=$1 AND id=$2',[paid.seller_id,paid.inventory_id])).rows[0];
  // A restore may contain old sessions; revoke them before exposing the restored workspace.
  await targetAdmin.query('UPDATE trading.sessions SET revoked=true');app=await application(restore,report,'restored-application');for(const account of accountsFor(restore)){const client=await httpClient(app.base,account,report,()=>undefined);await client.get('/?view=orders');}
  assert.deepEqual((await target.query('SELECT unsold,reserved FROM trading.inventory WHERE seller_id=$1 AND id=$2',[paid.seller_id,paid.inventory_id])).rows[0],before);assert.equal((await target.query('SELECT payment FROM trading.orders WHERE seller_id=$1 AND id=$2',[paid.seller_id,paid.id])).rows[0].payment,'seller_verified');report.write({type:'restore-complete',separateRoot:restore,login:true,verifiedStockPreserved:true});
 }finally{await app?.close();await target?.end();await targetAdmin?.end();await p.end();await admin.end();report.close();}
});
