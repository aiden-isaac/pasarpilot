import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { inspect } from './container.js';
import { cgroupPath } from './runtime.js';
import { sampleAttempt } from './metrics.js';
import { defaults } from './config.js';

export function sampleServices(root: string) {
  const database = JSON.parse(readFileSync(join(root, 'database.json'), 'utf8'));
  if (database.root !== root || database.runtime !== 'podman' || database.socket !== `${root}/socket` ||
      !/^pasarpilot-scheduler-db-[a-f0-9]{12}$/.test(database.container)) throw Error('invalid-database-runtime-record');
  const record = inspect(database.container);
  if (!record.State.Running || record.Config.Labels['io.pasarpilot.scheduler'] !== 'true' ||
      record.Config.Labels['io.pasarpilot.dataset'] !== root || record.HostConfig.NetworkMode !== 'none' ||
      Object.keys(record.HostConfig.PortBindings ?? {}).length || record.HostConfig.Memory !== 768 * 1024 ** 2 ||
      record.HostConfig.MemorySwap !== record.HostConfig.Memory) throw Error('unsafe-database-runtime');
  const cgroup = cgroupPath(database.container);
  if (!cgroup) throw Error('missing-database-cgroup');
  const resources = sampleAttempt(cgroup);
  const rss = process.memoryUsage().rss;
  if (!resources.memory || resources.swapMax !== 0 || !resources.events || resources.events.oom || resources.events.oom_kill) throw Error('database-resource-failure');
  if (resources.memory + rss > defaults.futureReserve) throw Error('service-envelope-exceeded');
  return { time: Date.now(), database: resources, schedulerRss: rss, schedulerCpu: process.cpuUsage(),
    combinedConservativeBytes: resources.memory + rss };
}
