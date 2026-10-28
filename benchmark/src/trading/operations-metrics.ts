import { readFileSync,statfsSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import type { Server,IncomingMessage,ServerResponse } from 'node:http';
import type pg from 'pg';
import { sampleAttempt,diskUsage,guardBytes,PressureGuard } from '../metrics.js';
import { sampleHost } from '../host.js';
import { defaults } from '../config.js';

export class Latencies{
 private bins=new Uint32Array(10002);private count=0;private sum=0;private max=0;
 add(ms:number){this.count++;this.sum+=ms;this.max=Math.max(this.max,ms);this.bins[Math.min(10001,Math.ceil(ms))]!++;}
 snapshot(){let seen=0,p95=0;for(let n=0;n<this.bins.length;n++){seen+=this.bins[n]!;if(seen>=Math.ceil(this.count*.95)){p95=n;break;}}return{count:this.count,meanMs:this.count?this.sum/this.count:0,p95Ms:p95,maxMs:this.max,p95Capped:p95===10001};}
}
export function instrument(p:pg.Pool,app:Server){
 const query=new Latencies(),wait=new Latencies(),reads=new Latencies(),mutations=new Latencies();let queryErrors=0,requestErrors=0,selectedRows=0,maxSelectedRows=0;
 p.on('connect',c=>{
  const original=c.query.bind(c) as (...args:any[])=>any;
  c.query=((...args:any[])=>{const start=performance.now(),finish=(error?:unknown,result?:pg.QueryResult)=>{query.add(performance.now()-start);if(error)queryErrors++;if(result?.command==='SELECT'){selectedRows+=result.rows.length;maxSelectedRows=Math.max(maxSelectedRows,result.rows.length);}};const callback=args.at(-1);
   if(typeof callback==='function'){args[args.length-1]=(...result:any[])=>{finish(result[0],result[1]);callback(...result);};return original(...args);}
   return original(...args).then((result:pg.QueryResult)=>{finish(undefined,result);return result;},(error:unknown)=>{finish(error);throw error;});
  }) as typeof c.query;
 });
 const connect=p.connect.bind(p) as (...args:any[])=>any;
 p.connect=((callback?: (...args:any[])=>void)=>{const start=performance.now();if(callback)return connect((...args:any[])=>{wait.add(performance.now()-start);callback(...args);});return connect().then((client:unknown)=>{wait.add(performance.now()-start);return client;},(error:unknown)=>{wait.add(performance.now()-start);throw error;});}) as typeof p.connect;
 app.prependListener('request',(req:IncomingMessage,res:ServerResponse)=>{const start=performance.now();res.once('finish',()=>{(req.method==='GET'?reads:mutations).add(performance.now()-start);if(res.statusCode>=400)requestErrors++;});});
 return()=>({time:Date.now(),query:query.snapshot(),poolWait:wait.snapshot(),reads:reads.snapshot(),mutations:mutations.snapshot(),queryErrors,requestErrors,selectedRows,maxSelectedRows,pool:{total:p.totalCount,idle:p.idleCount,waiting:p.waitingCount}});
}
export function processResources(pid:number,ticks:number){
 const stat=readFileSync(`/proc/${pid}/stat`,'utf8'),fields=stat.slice(stat.lastIndexOf(')')+2).trim().split(/\s+/),status=readFileSync(`/proc/${pid}/status`,'utf8');
 const rss=Number(status.match(/^VmRSS:\s+(\d+)/m)?.[1])*1024,cpuUsec=(Number(fields[11])+Number(fields[12]))/ticks*1e6;
 if(!Number.isFinite(rss)||rss<=0||!Number.isFinite(cpuUsec))throw Error('missing-process-accounting');return{pid,rss,cpuUsec};
}
export async function storageSnapshot(p:pg.Pool){
 const database=(await p.query('SELECT pg_database_size(current_database())::float8 AS bytes')).rows[0].bytes as number;
 const tables=(await p.query("SELECT n.nspname AS schema,c.relname,pg_total_relation_size(c.oid)::float8 AS total_bytes,pg_relation_size(c.oid)::float8 AS heap_bytes,pg_indexes_size(c.oid)::float8 AS index_bytes FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN('trading','trading_queue') AND c.relkind IN('r','p') ORDER BY n.nspname,c.relname")).rows;
 const inbox=(await p.query("SELECT count(*)::int AS pending,coalesce(extract(epoch FROM(now()-min(received_at))),0)::float8 AS oldest_seconds FROM trading.inbox WHERE result='pending'")).rows[0];
 const queue=(await p.query("SELECT name,state,count(*)::int AS count,coalesce(extract(epoch FROM(now()-min(created_on))),0)::float8 AS oldest_seconds FROM trading_queue.job WHERE state IN('created','retry','active') GROUP BY name,state ORDER BY name,state")).rows;
 const orders=(await p.query('SELECT seller_id,state,count(*)::int AS count FROM trading.orders GROUP BY seller_id,state ORDER BY seller_id,state')).rows;
 const held=(await p.query("SELECT count(*)::int AS count FROM trading.reservations WHERE state='held'")).rows[0].count;
 const commits=(await p.query("SELECT count(*)::int AS count FROM trading.activity WHERE action='payment_verified_and_stock_committed'")).rows[0].count;
 return{database,tables,inbox,queue,orders,held,commits};
}
export class OperationsMetrics{
 readonly ticks=Number(execFileSync('getconf',['CLK_TCK'],{encoding:'utf8'}).trim());
 readonly pageBytes=Number(execFileSync('getconf',['PAGESIZE'],{encoding:'utf8'}).trim());
 readonly pressure=new PressureGuard();readonly cgroup:string;readonly initialSwap:number;readonly initialDisk:number;
 private initialDatabase=0;private initialDataBytes=0;abort?:string;latestTelemetry:any;private lastSample=0;readonly summary={samples:0,missing:0,maxCombinedBytes:0,maxRunnerRss:0,minAvailableBytes:Infinity,windows:[] as {phase:string;count:number;meanRss:number;start:number;end:number}[]};
 constructor(readonly root:string,readonly output:string,readonly pid:number,database:{runtime:string;container:string},readonly write:(value:Record<string,unknown>)=>void){
  const record=JSON.parse(execFileSync(database.runtime,['inspect',database.container],{encoding:'utf8',timeout:5000,maxBuffer:1024*1024}))[0];
  if(!record.State.Running||record.Config.Labels['io.pasarpilot.dataset']!==root||record.Config.Labels['io.pasarpilot.scheduler']!=='true'||record.HostConfig.NetworkMode!=='none'||Object.keys(record.HostConfig.PortBindings??{}).length||record.HostConfig.Memory!==768*1024**2||record.HostConfig.MemorySwap!==record.HostConfig.Memory)throw Error('unsafe-test-database');
  const line=readFileSync(`/proc/${record.State.Pid}/cgroup`,'utf8').split('\n').find(l=>l.startsWith('0::'));if(!line)throw Error('cgroup-v2-required');this.cgroup=join('/sys/fs/cgroup',line.slice(3));
  const cpu=readFileSync(join(this.cgroup,'cpu.max'),'utf8').trim().split(/\s+/).map(Number);if(cpu.length!==2||!Number.isFinite(cpu[0])||cpu[0]! / cpu[1]! !== 1)throw Error('database-cpu-cap-required');
  this.initialSwap=sampleHost().swapOutPages;this.initialDisk=Number(statfsSync(root).bavail)*Number(statfsSync(root).bsize);
  if(!Number.isFinite(this.ticks)||this.ticks<=0||!Number.isFinite(this.pageBytes)||this.initialDisk<2*1024**3)throw Error('calibration-or-disk-headroom-unavailable');
  this.write({type:'resource-contract',ticksPerSecond:this.ticks,pageBytes:this.pageBytes,initialSwapOutPages:this.initialSwap,serviceAllowance:defaults.futureReserve,databaseAllowance:768*1024**2,databaseSwap:0,databaseCpu:cpu[0]!/cpu[1]!,hostGuard:guardBytes(sampleHost().total),databaseLabelsVerified:true});
 }
 sample(phase:string){
  let observed:Record<string,unknown>|undefined;
  try{
   const host=sampleHost(),app=processResources(this.pid,this.ticks),runner={pid:process.pid,rss:process.memoryUsage().rss,cpu:process.cpuUsage()},database=sampleAttempt(this.cgroup),combined=app.rss+(database.memory??0),disk=statfsSync(this.root);
   observed={host,app,runner,database,combinedConservativeBytes:combined};
   this.pressure.check(host);if(host.swapOutPages>this.initialSwap)throw Error('host-swap-out-growth');
   if(!database.memory||database.swapMax!==0||database.memoryMax!==768*1024**2||!database.cpu||!database.events||database.events.oom||database.events.oom_kill||database.swap)throw Error('database-accounting-or-oom');
   if(combined>defaults.futureReserve)throw Error('service-envelope');if(host.available<guardBytes(host.total)+defaults.futureReserve)throw Error('host-headroom');
   if(Number(disk.bavail)*Number(disk.bsize)<1024**3||diskUsage(join(this.root,'evidence')).logicalBytes>256*1024**2)throw Error('disk-or-evidence-limit');
   if(!this.latestTelemetry||host.time-this.latestTelemetry.time>2500)throw Error('missing-application-telemetry');
   if(this.lastSample&&host.time-this.lastSample>2500){this.summary.missing++;throw Error('missing-one-second-samples');}this.lastSample=host.time;
   this.summary.samples++;this.summary.maxCombinedBytes=Math.max(this.summary.maxCombinedBytes,combined);this.summary.maxRunnerRss=Math.max(this.summary.maxRunnerRss,runner.rss);this.summary.minAvailableBytes=Math.min(this.summary.minAvailableBytes,host.available);
   this.write({type:'resources',phase,host,app,runner,database,combinedConservativeBytes:combined,telemetry:this.latestTelemetry});return app.rss;
  }catch(error){this.abort??=error instanceof Error?error.message:'resource-sample-failed';this.write({type:'resource-failure',phase,code:this.abort,observed});return undefined;}
 }
 async storage(p:pg.Pool,phase:string){
  const snapshot=await storageSnapshot(p),dataBytes=diskUsage(join(this.root,'postgres')).allocatedBytes;
  if(!this.initialDatabase){this.initialDatabase=snapshot.database;this.initialDataBytes=dataBytes;}
  if(snapshot.database-this.initialDatabase>512*1024**2||dataBytes-this.initialDataBytes>512*1024**2)this.abort??='database-growth-limit';
  this.write({type:'storage',phase,...snapshot,dataAllocatedBytes:dataBytes,pool:{total:p.totalCount,idle:p.idleCount,waiting:p.waitingCount}});return snapshot;
 }
}
