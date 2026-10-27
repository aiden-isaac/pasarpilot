import { fileURLToPath } from 'node:url';
import { pool } from './db.js';
import { migrate } from './migrate.js';
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
 } else if(command==='serve') { const p=pool(); await checkSchema(p); const app=await listen(p,8787,mutate,view); console.log('Synthetic WTS: http://127.0.0.1:8787'); process.on('SIGTERM',()=>{app.close(()=>void p.end());});
 } else { console.log('Synthetic WTS workspace: setup | serve | generate'); }
}
