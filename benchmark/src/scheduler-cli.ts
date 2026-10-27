import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { holdLock } from './ownership.js';
import { writeJson } from './storage.js';
import { SchedulerStore } from './scheduler-store.js';
import { schedulerRoot, tenant, actionId } from './schedule.js';
import { runScheduler, recoverJobs, recoverTenant, reconcileAction, type SchedulerManifest } from './scheduler.js';

export async function schedulerCommand(command: string, dataRoot: string, args: string[]) {
  const root = schedulerRoot(dataRoot);
  const setup = command === 'scheduler-setup';
  const store = await SchedulerStore.open(root, setup, setup ? Number(args[0] ?? 60_000) : 60_000);
  const manifest = () => JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8')) as SchedulerManifest;
  try {
    if (setup) {
      const metadata = { schemaVersion: 1, root, node: process.version, pgBoss: '10.4.2', pg: '8.23.1',
        postgres: (await store.pool.query('SHOW server_version')).rows[0].server_version, identity: await store.identity() };
      writeJson(join(root, 'scheduler.json'), metadata);
      console.log(JSON.stringify(metadata));
    } else if (command === 'scheduler-status') console.log(JSON.stringify(await store.status(), null, 2));
    else if (command === 'scheduler-run') await runScheduler(store, manifest(), Number(args[0] ?? 100));
    else if (command === 'scheduler-action') {
      const [t, id, revision, deadline] = args;
      console.log(JSON.stringify(await store.submitAction(t!, id!, Number(revision), Number(deadline))));
    } else if (command === 'scheduler-cancel') await store.cancel(args[0]!);
    else if (command === 'scheduler-configure') {
      const [t, state, every] = args;
      if (state !== 'enabled' && state !== 'disabled') throw Error('expected-enabled-or-disabled');
      await store.configure(t!, state === 'enabled', every === undefined ? undefined : Number(every));
    } else if (command === 'scheduler-recover') {
      const [t, mode = 'verify'] = args;
      if (mode !== 'verify' && mode !== 'history' && mode !== 'auth') throw Error('expected-verify-history-or-auth');
      console.log(JSON.stringify(await recoverTenant(store, t!, mode, manifest())));
    } else if (command === 'scheduler-reconcile-action') console.log(JSON.stringify(await reconcileAction(store, args[0]!, args[1]!, manifest())));
    else if (command === 'scheduler-dispose-action') {
      tenant(args[0]!); actionId(args[1]!);
      if (args[2] !== 'abandon') throw Error('explicit-abandon-required');
      await store.pool.query(`UPDATE ${store.schema}.action SET outcome='abandoned',result='{"reason":"explicit-operator-disposition"}' WHERE tenant=$1 AND id=$2 AND outcome='uncertain'`, args.slice(0, 2));
    } else if (command === 'scheduler-reconcile') {
      const lock = await holdLock(join(root, 'locks', 'supervisor.lock'));
      try { await recoverJobs(store); } finally { lock.stdin.end(); }
    } else throw Error('unknown-scheduler-command');
  } finally { await store.close(); }
}
