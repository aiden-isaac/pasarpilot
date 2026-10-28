import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,mkdirSync,symlinkSync,chmodSync,rmSync,readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { Evidence,ownedDirectory,operationsSelfCheck,operationLimits } from '../../../src/trading/operations.js';
import { Latencies } from '../../../src/trading/operations-metrics.js';
import { instrument,processResources } from '../../../src/trading/operations-metrics.js';
import { EventEmitter } from 'node:events';
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import type pg from 'pg';
test('operations enforce finite load, private owned paths and an honest planned denominator without a browser',()=>{
 assert.equal(operationsSelfCheck().planned,240);assert.equal(operationLimits.sellers,2);
 const latency=new Latencies();for(let i=0;i<99;i++)latency.add(10);latency.add(20000);assert.equal(latency.snapshot().count,100);assert.equal(latency.snapshot().p95Ms,10);assert.equal(latency.snapshot().maxMs,20000);
 const root=mkdtempSync(join(tmpdir(),'seller-operations-'));
 try{
  assert.equal(ownedDirectory(root),root);assert.throws(()=>ownedDirectory(resolve('.')),/outside-workspace/);
  const publicDir=join(root,'public');mkdirSync(publicDir,{mode:0o755});assert.throws(()=>ownedDirectory(publicDir),/private-directory/);chmodSync(publicDir,0o700);assert.equal(ownedDirectory(publicDir),publicDir);
  const link=join(root,'linked');symlinkSync(publicDir,link);assert.throws(()=>ownedDirectory(link),/outside-workspace/);
  const report=new Evidence(publicDir);try{report.outcome({seller:'a',cycle:0,started:true,ok:true});report.outcome({seller:'b',cycle:0,started:true,ok:false});report.outcome({seller:'a',cycle:1,started:false,ok:false,reason:'admission-stopped'});assert.deepEqual(report.counts,{planned:3,attempted:2,passed:1,failed:2,notAttempted:1});}finally{report.close();}
  assert.equal(readFileSync(join(publicDir,'events.jsonl'),'utf8').trim().split('\n').length,3);
  const slow=join(root,'slow');mkdirSync(slow,{mode:0o700});const rejected=new Evidence(slow);try{for(let i=0;i<20;i++)rejected.write({type:'request',method:'GET',path:'/updates',ms:501});assert.equal(rejected.failure,'operation-latency-gate:GET:/updates');assert.equal(rejected.operations.size,1);}finally{rejected.close();}
 }finally{rmSync(root,{recursive:true});}
});
test('operation telemetry preserves pg promise and callback results and reads the actual process',async()=>{
 const p=new EventEmitter() as EventEmitter & {connect:Function;totalCount:number;idleCount:number;waitingCount:number};
 const client={query(...args:any[]){const error=args[0]==='bad'?Error('expected-query-failure'):null,result={command:'SELECT',rows:[{value:1}]},cb=args.at(-1);if(typeof cb==='function'){cb(error,result);return;}return error?Promise.reject(error):Promise.resolve(result);}};
 p.connect=(callback?:Function)=>callback?callback(null,client):Promise.resolve(client);p.totalCount=1;p.idleCount=1;p.waitingCount=0;
 const app=createServer(),snapshot=instrument(p as unknown as pg.Pool,app);p.emit('connect',client);
 const result=await client.query('ok');assert.ok(result);assert.equal(result.rows[0]!.value,1);await assert.rejects(async()=>{await client.query('bad');},/expected-query/);
 client.query('ok',(error:unknown,result:any)=>{assert.equal(error,null);assert.equal(result.rows[0].value,1);});
 assert.equal(await p.connect(),client);p.connect((error:unknown,result:unknown)=>{assert.equal(error,null);assert.equal(result,client);});
 const measured=snapshot();assert.equal(measured.query.count,3);assert.equal(measured.queryErrors,1);assert.equal(measured.poolWait.count,2);assert.equal(measured.selectedRows,2);assert.equal(measured.maxSelectedRows,1);
 const actual=processResources(process.pid,Number(execFileSync('getconf',['CLK_TCK'],{encoding:'utf8'})));assert.equal(actual.pid,process.pid);assert.ok(actual.rss>0);assert.ok(actual.cpuUsec>=0);
});
