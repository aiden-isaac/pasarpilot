import { fileURLToPath } from 'node:url';
import { importHandoffs } from './capture.js';
import { queue } from './db.js';
import { synthetic,intake } from './intake.js';
import { processStream } from './consumer.js';
import { handle } from './stock.js';
import { pool } from './db.js';
import { migrate } from './migrate.js';
import { worker } from './worker.js';
import { listen } from './server.js';
import { mutate,view } from './dashboard.js';
import { checkSchema } from './db.js';
import { seed } from './setup.js';
export const tradingCommands = ['setup', 'serve', 'generate'] as const;
if (process.argv[1] === fileURLToPath(import.meta.url)) {
 const command=process.argv[2];
 if(command==='setup') {
  if(process.argv.length!==3 || process.stdin.isTTY) throw Error('pipe-two-password-lines-through-stdin-no-arguments');
  let input=''; for await(const b of process.stdin) { input+=b; if(input.length>1024) throw Error('input-too-large'); }
  const p=pool('fixture'); try { await migrate(p); await seed(p,input.trimEnd().split('\n')); console.log('Created two isolated synthetic sellers.'); } finally { await p.end(); }
 } else if(command==='serve') { const p=pool(); await checkSchema(p); const stop=await worker(p); const app=await listen(p,8787,mutate,view); console.log('Synthetic WTS: http://127.0.0.1:8787'); process.on('SIGTERM',()=>{app.close(()=>void stop().then(()=>p.end()));});
 } else if(command==='import'){const p=pool();try{await checkSchema(p);console.log('Imported events:',await importHandoffs(p,queue(p),process.argv[3]!));}finally{await p.end();}
 } else if(command==='generate'){const p=pool();try{await checkSchema(p);const [tenant,item,buyer,message]=process.argv.slice(3);const m=(await p.query('SELECT * FROM trading.sources WHERE tenant=$1',[tenant])).rows[0];if(!m)throw Error('invalid-mapping');const pos=Number((await p.query('SELECT COALESCE(max(position),0)+1 AS n FROM trading.inbox WHERE seller_id=$1 AND source=$2 AND epoch=$3',[m.seller_id,m.source,m.epoch])).rows[0].n);await intake(p,queue(p),tenant!,synthetic({source:m.source,epoch:m.epoch},pos,item!,buyer!,message!));await processStream(p,m.seller_id,m.source,m.epoch,handle);console.log('Synthetic event processed or durably deferred.');}finally{await p.end();}
 } else { console.log('Synthetic WTS workspace: setup | serve | generate'); }
}
