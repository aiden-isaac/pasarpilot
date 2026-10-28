import assert from 'node:assert/strict';
import { fork,execFileSync } from 'node:child_process';
import { openSync,closeSync } from 'node:fs';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { accountsFor,dataset,evidence,type Evidence } from '../../../src/trading/operations.js';
import { pool } from '../../../src/trading/db.js';
export function operationsTest(name:string){
 const root=process.env.OPERATIONS_ROOT;assert.ok(root,'explicit OPERATIONS_ROOT disposable dataset required');
 const {database}=dataset(root),container=JSON.parse(execFileSync(database.runtime,['inspect',database.container],{encoding:'utf8'}))[0];
 assert.equal(container.Config.Labels['io.pasarpilot.dataset'],root);assert.equal(container.Config.Labels['io.pasarpilot.scheduler'],'true');assert.equal(container.HostConfig.NetworkMode,'none');assert.equal(container.HostConfig.Memory,768*1024**2);assert.equal(container.HostConfig.MemorySwap,container.HostConfig.Memory);
 process.env.PGHOST=join(root,'socket');const report=evidence(root,join(root,'evidence',name+'-'+Date.now())),admin=pool('fixture'),p=pool();
 return{root,database,report,admin,p,accounts:accountsFor(root)};
}
export async function application(root:string,report:Evidence,name:string,capture?:string){
 const fd=openSync(join(report.output,name+'.log'),'wx',0o600),child=fork(new URL('../../../src/trading/operations.js',import.meta.url),['serve-owned',root],{execArgv:[],env:{PATH:process.env.PATH,PGHOST:join(root,'socket'),...(capture?{TRADING_CAPTURE_ROOT:capture}:{})},stdio:['ignore',fd,fd,'ipc']});
 const exited=new Promise<void>(r=>child.once('exit',()=>r()));let timer:ReturnType<typeof setTimeout>|undefined;
 let closed=false;const close=async()=>{if(closed)return;closed=true;if(child.exitCode===null&&!child.signalCode){child.kill('SIGTERM');let timeout:ReturnType<typeof setTimeout>|undefined;await Promise.race([exited,new Promise<void>(r=>{timeout=setTimeout(r,10000);})]);if(timeout)clearTimeout(timeout);if(child.exitCode===null&&!child.signalCode){child.kill('SIGKILL');await exited;}}closeSync(fd);};
 try{const ready=await new Promise<{base:string;pid:number;telemetry:any}>((resolve,reject)=>{timer=setTimeout(()=>reject(Error('application-readiness-timeout')),30000);child.on('message',(m:any)=>{if(m.type==='ready')resolve(m);if(m.type==='startup-error')reject(Error(m.code));});child.once('exit',()=>reject(Error('application-exited-before-readiness')));child.once('error',reject);});return{...ready,child,close};}
 catch(error){await close();throw error;}finally{if(timer)clearTimeout(timer);}
}
export async function within30(check:()=>Promise<boolean>){const start=Date.now();let last:unknown;while(Date.now()-start<30000){try{if(await check())return Date.now()-start;}catch(error){last=error;}await delay(100);}throw Error('recovery-exceeded-30-seconds',{cause:last});}
