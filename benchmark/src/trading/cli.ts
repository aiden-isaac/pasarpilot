import { fileURLToPath } from 'node:url';
import { importHandoffs } from './capture.js';
import { queue } from './db.js';
import { generate } from './intake.js';
import { processStream } from './consumer.js';
import { handle } from './stock.js';
import { pool } from './db.js';
import { migrate } from './migrate.js';
import { worker } from './worker.js';
import { listen } from './server.js';
import { mutate,view } from './dashboard.js';
import { checkSchema } from './db.js';
import { seed } from './setup.js';
export const tradingCommands = ['setup', 'migrate', 'serve', 'generate', 'import'] as const;
if (process.argv[1] === fileURLToPath(import.meta.url)) {
 const command=process.argv[2];
 if(command==='setup') {
  if(process.argv.length!==3 || process.stdin.isTTY) throw Error('pipe-two-password-lines-through-stdin-no-arguments');
  let input=''; for await(const b of process.stdin) { input+=b; if(input.length>1024) throw Error('input-too-large'); }
  const p=pool('fixture'); try { await migrate(p); await seed(p,input.trimEnd().split('\n')); console.log('Created two isolated synthetic sellers.'); } finally { await p.end(); }
 } else if(command==='migrate'){const p=pool('fixture');try{await migrate(p);console.log('Trading schema is current.');}finally{await p.end();}
 } else if(command==='serve') { const p=pool();let stop:(()=>Promise<void>)|undefined;
  try{await checkSchema(p);stop=await worker(p);const app=await listen(p,8787,mutate,view);console.log('Synthetic WTS: http://127.0.0.1:8787');let closing=false;const close=()=>{if(closing)return;closing=true;app.close(()=>void stop!().then(()=>p.end()));};process.on('SIGTERM',close);process.on('SIGINT',close);}
  catch{console.error('trading-startup-not-ready: check database readiness and compatible schema; retry serve with the same dataset, never reseed');await stop?.();await p.end();process.exitCode=1;}
 } else if(command==='import'){const p=pool();try{await checkSchema(p);console.log('Imported events:',await importHandoffs(p,queue(p),process.argv[3]!));}finally{await p.end();}
 } else if(command==='generate'){const p=pool();try{await checkSchema(p);const [tenant,item,buyer,message,event]=process.argv.slice(3);if(!event)throw Error('explicit-stable-event-id-required-as-fifth-generate-argument');const m=(await p.query('SELECT * FROM trading.sources WHERE tenant=$1',[tenant])).rows[0];if(!m)throw Error('invalid-mapping');await generate(p,queue(p),tenant!,{event,item:item!,actor:buyer!,message:message!,kind:'reply'});await processStream(p,m.seller_id,m.source,m.epoch,handle);console.log('Synthetic event processed or durably deferred.');}finally{await p.end();}
 } else { console.log('Synthetic WTS workspace: setup | serve | generate'); }
}
