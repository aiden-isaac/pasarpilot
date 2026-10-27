# Controlled browser lifecycle benchmark

This workspace implements the synthetic lifecycle experiment and the bounded fixture scheduler in
`openspec/changes/benchmark-bounded-browser-lifecycle/` and `openspec/changes/schedule-bounded-fixture-visits/`.
No Facebook, AI or trading integration.

Use Node.js 20 or newer, then `npm ci`, `npm run check`, `npm test` from this directory.
Dependencies are exactly pinned in the lockfile. Browser installation is separate from dependency installation.
The browser image must match Playwright 1.64.1; container/runtime setup is explicit, not performed by npm scripts.

Before remote browser execution: obtain owner approval for any Minecraft stop, verify graceful exit,
collect pre/post-stop and warmed baselines, and verify container limits and non-root Chromium sandboxing.
Start with one slot. No result from unit tests constitutes a browser benchmark or a GO decision.

The completed run returned GO for a one-slot fixture scheduler. See the [measured evidence](../docs/research/bounded-browser-lifecycle.md), [capacity analysis](../docs/research/bounded-browser-capacity.md) and [approved change](../openspec/changes/benchmark-bounded-browser-lifecycle/proposal.md). Raw outputs and browser profiles must remain protected and outside version control; publish only aggregate synthetic findings.

`sh runtime-check.sh` checks rootless Podman/cgroup prerequisites without a browser launch.
Build using `podman build --memory=1g --memory-swap=1g --cpu-quota=200000 --cpu-period=100000 -t localhost/pasarpilot-benchmark:v1 -f Containerfile .`
after compilation. `sh prepare-fixture.sh` creates only experiment-labelled resources: an internal
network and a non-root, 256 MiB-capped fixture container with no published ports. It prints the private
fixture origin for the run manifest. It refuses conflicting resources rather than replacing them.

`seccomp.json` is the pinned Playwright 1.64.1 Docker seccomp profile from
`https://github.com/microsoft/playwright/blob/v1.64.1/utils/docker/seccomp_profile.json`;
it retains the syscall filter while allowing Chromium's namespace sandbox. Never substitute an
unconfined seccomp profile, host networking or `--no-sandbox` when a capability check fails.
Compatibility additions deny `clone3` with ENOSYS (38), allowing modern libc to fall back to the
profile's filtered `clone`, and allow `chroot` so Chromium can enter its namespace sandbox's empty
root. The container still drops all capabilities; kernel privilege checks still apply. Without the
explicit `chroot` rule, the profile's capability-conditional rule rejects this sandbox setup step.

Image builds copy only the two lockfile-installed Playwright runtime packages. Run `npm ci` before
building; there is no package-registry access from the build container. This also avoids inheriting
a host-only loopback HTTP proxy inside rootless build networking.
Browser and fixture runs explicitly disable Podman's host-proxy forwarding; traffic stays on the
internal fixture network. A writable ephemeral HOME is provided inside the capped tmpfs for Chromium
runtime files; the selected persistent profile is the only seller state mounted into the container.

## Prepare the benchmark host

Run browser commands on the prepared Linux benchmark host, from this `benchmark/` directory.
Required tools are Node.js 20+, rootless Podman with cgroup v2/seccomp support and its init helper,
Python 3 and `flock`. Run `npm ci`, `npm run check` and `npm test` before the image build above;
`npm test` also compiles the harness. Local checks do not prove host sandbox compatibility.

Before any browser launch, identify Minecraft by its actual process/controller and working directory,
record its memory and a 60-second live RAM/CPU/swap/PSI baseline, then obtain explicit owner approval
before using its normal console `stop` command. Verify saved-world exit and no restart; record a second
60-second baseline. If it is already stopped, record that fact. Never send console commands to an
unverified tmux pane, kill the server, edit world/configuration files or stop unrelated services.
The [approved host gate](../openspec/changes/benchmark-bounded-browser-lifecycle/design.md) describes
the Jarlaxle procedure; historical process IDs are not safe targets for a new run.

After that gate, run `sh runtime-check.sh`, build the pinned base image and run
`sh prepare-fixture.sh`. Keep the fixture alive and do not rebuild images, change workload, or run
other benchmarks between primary arms. The fixture keeps server sessions in memory; restarting it
invalidates the synthetic authentication tokens in existing profiles.

## Run the matched comparison

Choose a **new absolute data directory outside the repository** for each experiment. The following
commands run on the benchmark host after preparation. Replace the example path before running;
keep the same `BENCH_DATA_ROOT` and five-second cadence throughout both primary arms. This example
assumes a Git checkout on the host; for a copied workspace, set `BENCH_REVISION` to the source commit
recorded before transfer instead.

```sh
set -eu
export BENCH_DATA_ROOT=/absolute/private/new-benchmark-run
BENCH_REVISION=$(git rev-parse HEAD)
export BENCH_REVISION
umask 077
node dist/src/cli.js baseline "$BENCH_DATA_ROOT" 5000
node dist/src/cli.js smoke "$BENCH_DATA_ROOT"
node dist/src/cli.js pilot "$BENCH_DATA_ROOT" 6 0
node dist/src/cli.js baseline "$BENCH_DATA_ROOT" 5000
node dist/src/cli.js calibrate "$BENCH_DATA_ROOT"
cp "$BENCH_DATA_ROOT/manifest.json" "$BENCH_DATA_ROOT/runs/baseline-A.json"
node dist/src/cli.js continuous "$BENCH_DATA_ROOT" 100 5000
node dist/src/cli.js settle "$BENCH_DATA_ROOT"
node dist/src/cli.js baseline "$BENCH_DATA_ROOT" 5000
node dist/src/cli.js calibrate "$BENCH_DATA_ROOT"
cp "$BENCH_DATA_ROOT/manifest.json" "$BENCH_DATA_ROOT/runs/baseline-B.json"
node dist/src/cli.js rotation "$BENCH_DATA_ROOT" 100 5000
node dist/src/cli.js settle "$BENCH_DATA_ROOT"
node dist/src/cli.js faults "$BENCH_DATA_ROOT"
```

Run each command only after its predecessor succeeds; stop and inspect retained evidence after a
failure. A baseline takes at least 60 seconds. It declares a budget from minimum observed MemAvailable
minus `max(1 GiB, 15% of usable RAM)` and 1.5 GiB for future application/database services. Initial
browser admission additionally requires the 2 GiB bootstrap cap; swap is not capacity.

The six-visit pilot covers three profiles; calibration records the measured allowance while retaining
at least the same 2 GiB cap for both primary arms. The smoke check uses a separate dataset. Neither
is an excluded warm-up within the primary visit counts. The final baseline argument is the declared
cadence in milliseconds (default 60000); primary arms must match it. A five-second cadence accelerates
the fixture experiment and establishes no Facebook freshness guarantee.

Arm A includes a five-minute resident idle segment. Each `settle` captures five minutes after cleanup.
Arm B performs 100 fresh-process visits across three profiles (34/33/33), verifies persistence without
reseeding, and verifies process termination before releasing each profile. All failed attempts remain
in the evidence. Do not force a higher concurrency or smaller reserve to finish a run.

`faults DATA` runs the separate synthetic recovery suite. It retains failed datasets, first flushes
seed state through clean shutdown, then tests five abrupt crashes against that committed baseline.
It also tests expired ownership, supervisor reconciliation, cancellation, authentication/history
recovery and uncertain actions. This does not assert durability of arbitrary in-flight browser writes.

## Optional modes and capacity

Here `DATA` means the same absolute `BENCH_DATA_ROOT`. Optional experiments follow complete primary
arms and settled cleanup, never concurrent builds:

```sh
node dist/src/cli.js concurrency "$BENCH_DATA_ROOT" 2
node dist/src/cli.js concurrency "$BENCH_DATA_ROOT" 4
podman build --http-proxy=false --memory=1g --memory-swap=1g --cpu-quota=200000 --cpu-period=100000 -t localhost/pasarpilot-benchmark-interactive:v1 -f Containerfile.interactive .
node dist/src/cli.js interactive "$BENCH_DATA_ROOT"
```

Concurrency uses fresh, distinct profiles in separate datasets; four slots require a safe two-slot
result. The per-slot allowance uses the larger primary peak with 125% rounded headroom. Batches
include a declared five-second sampling hold, which is excluded from work/cleanup cycle timings.

The optional image uses signed HTTPS Ubuntu repositories and installs x11vnc/noVNC/websockify.
Headed attempts use Podman's init process, a private X11 socket tmpfs and ephemeral Xauthority;
VNC and WebSocket listeners bind loopback only. A real noVNC client uses a separately capped
container (576 MiB in the measured run) without any seller profile, sharing only the display network
namespace. Both client and background capacity count toward admission. All containers retain sandboxing and a 256-task
limit. Fifteen-second phase windows measure a static fixture, not a production streaming load.
Initial authentication, public remote access and production inactivity policies remain out of scope.

`node dist/src/cli.js capacity DATA` performs browser-free calculations from the complete rotation
and successful concurrency results. It writes all 864 demand/arrival sensitivity rows to private
`runs/capacity.json`; no browser is launched. One-slot durations include every primary attempt;
higher-concurrency rows use measured batch work cycles where available and otherwise explicitly
extrapolate. Outgoing visits cost the same as observations unless separately measured. Overload
returns unbounded backlog, not an invented finite delay. See the sanitised research report and CSV.

## Evidence and cleanup

Keep `DATA` owner-only and outside Git. Preserve run manifests before replacing
baselines (`runs/baseline-A.json`, `runs/baseline-B.json`) and collect `settle DATA` after each arm.
The fixture keeps synthetic server sessions in memory; after stopping/restarting it, use a fresh
benchmark dataset rather than silently reseeding preserved evidence. For this completed run, all
browser/fixture containers and the labelled network were removed; protected data and images remain
through owner review. Never prune unrelated containers/volumes or restart Minecraft automatically.

To validate the planning artifacts from the repository root, with OpenSpec available:

```sh
openspec validate benchmark-bounded-browser-lifecycle --strict
```

The benchmark change remains unarchived. The scheduler below adds a private fixture database/queue;
there is no production platform integration, AI service, public remote-access gateway or dashboard.

## Durable single-slot fixture scheduler

The scheduler uses exactly three primary tenants, one browser slot and PostgreSQL/pg-boss. It reuses
the benchmark's sandbox, selected-profile mount, host admission, profile lock/generation, heartbeat
and verified shutdown. It keeps one outstanding observation and one explicit action per tenant;
missed observation ticks coalesce and additional actions receive backpressure. A persisted round-robin
cursor gives each eligible tenant one attempt per turn, including failures and actions.

Versions: Node 20+ (Jarlaxle uses 22.23.4), PostgreSQL **17.11** (image pinned by digest in
`prepare-scheduler-db.sh`), pg-boss **10.4.2**, pg **8.23.1**. The queue version retains the existing
Node 20 baseline. Its `fetch`, `send`, `complete`, `fail` and `maintain` APIs are integration-tested.
Pending-payload refresh and retry-generation settlement use short transactions against that pinned
schema; upgrading pg-boss requires rerunning the database checks. Queue expiration does not kill
Chromium or prove exactly-once external effects.

Run from `benchmark/` on the prepared host after the Minecraft/runtime gate above. Choose a **new
absolute private directory outside the checkout**. Do not reuse old benchmark profiles/evidence.
Build the browser image and prepare the fixture as above; keep the same fixture instance alive
through setup, pilot, clean run and fault suite. The database uses a private Unix socket, `--network=none`,
no published ports, a 768 MiB cap and no swap. Its generated password file, volume, socket and raw
results stay owner-only outside Git. Browser containers receive neither the database socket nor its
credentials.

```sh
export SCHEDULER_DATA_ROOT=/absolute/private/new-scheduler-run
sh prepare-scheduler-db.sh "$SCHEDULER_DATA_ROOT" podman
node dist/src/cli.js scheduler-setup "$SCHEDULER_DATA_ROOT" 120000
node dist/src/cli.js baseline "$SCHEDULER_DATA_ROOT" 10000
node dist/src/cli.js scheduler-run "$SCHEDULER_DATA_ROOT" 3
node dist/src/cli.js scheduler-status "$SCHEDULER_DATA_ROOT"
```

Inspect the three pilot results: require complete observations, clean shutdown and one durable
consumer result each. The 2 GiB bootstrap cap remains in use; do not copy the historical 576 MiB
allowance without fresh calibration. A warmed full-stack baseline retains the host guard and the
conservative 1.5 GiB future-service reserve. Separate service samples check database cgroup memory
plus scheduler RSS against a further 1.5 GiB planning envelope; this sum is deliberately conservative.
Unsafe admission defers without taking a queue claim; pressure/accounting failures stop execution.

After the pilot, update each schedule to a declared cadence and run a separately recorded clean
sample. Ten seconds per tenant was selected for the synthetic acceptance run; it is accelerated
fixture timing. A just-started schedule coalesces to the latest due time, so its first freshness window
can be shorter than an interval. For a synchronised acceptance run, set a future common `next_due`
in the private schema before starting, and record that preparation with the plan. Do not hide skipped
or expired attempts by restarting the denominator.

```sh
node --input-type=module - "$SCHEDULER_DATA_ROOT" <<'JS'
import { readFileSync } from 'node:fs';
import { SchedulerStore } from './dist/src/scheduler-store.js';
import { runScheduler } from './dist/src/scheduler.js';
const root = process.argv[2], store = await SchedulerStore.open(root);
try {
  for (const tenant of ['seller-a','seller-b','seller-c']) await store.configure(tenant,true,10000);
  await store.pool.query(`UPDATE ${store.schema}.schedule SET next_due=now()+make_interval(secs => 3)`);
  await runScheduler(store,JSON.parse(readFileSync(root+'/manifest.json','utf8')),102);
} finally { await store.close(); }
JS
```

`scheduler-run DATA COUNT` is a finite dispatcher invocation; its results retain every dispatched
attempt, including skips and retries. Successful clean acceptance requires the predeclared planned
count (at least 100), at least 33 completions per tenant and 99% first-attempt success. The invocation's
`complete` field means its dispatch count finished, not that all outcomes passed. Schedules/accepted
pending jobs persist when it exits or receives SIGINT/SIGTERM; another invocation reconciles before
resuming. Use `scheduler-configure DATA TENANT disabled` for durable schedule disablement.

The following commands use only synthetic fixture identities:

```sh
ACTION_DEADLINE_MS=$(node -e 'console.log(Date.now() + 120000)')
node dist/src/cli.js scheduler-action "$SCHEDULER_DATA_ROOT" seller-a effect-1 0 "$ACTION_DEADLINE_MS"
node dist/src/cli.js scheduler-cancel "$SCHEDULER_DATA_ROOT" JOB_UUID
node dist/src/cli.js scheduler-recover "$SCHEDULER_DATA_ROOT" seller-a verify
node dist/src/cli.js scheduler-recover "$SCHEDULER_DATA_ROOT" seller-a history
node dist/src/cli.js scheduler-recover "$SCHEDULER_DATA_ROOT" seller-a auth
node dist/src/cli.js scheduler-reconcile-action "$SCHEDULER_DATA_ROOT" seller-a effect-1
node dist/src/cli.js scheduler-dispose-action "$SCHEDULER_DATA_ROOT" seller-a effect-1 abandon
node dist/src/cli.js scheduler-reconcile "$SCHEDULER_DATA_ROOT"
```

Use the current fixture source revision and a future absolute deadline (Unix milliseconds).
Duplicate tenant/action IDs return their existing outcome, including
after expiry. Stale revisions never send. Ambiguous actions remain uncertain and occupy that tenant's
action allowance; a positive read-only fixture lookup can mark applied. A missing lookup never
authorises resend. `abandon` is an explicit operator disposition, not proof that no effect occurred.
Authentication/history recovery validates committed profile markers before resuming and increments
the schedule revision. `auth` explicitly creates a new synthetic fixture session; it does not recreate
the browser profile or restore lost action history.

On startup, the supervisor locks the dataset, fences old ownership, stops only matching labelled
attempts, verifies process absence, replays flushed observations and settles interrupted jobs. A queue
or lease timeout alone never releases the profile/slot. Worker checkpoints check current queue intent
before each fixture operation. A deadline caps work at 120 seconds and cleanup at another 40;
the queue expiry is 180 seconds. Only transient observation failures retry, at most twice at 30/60
seconds while current. Unproven termination halts dispatch. Database failure triggers local cleanup;
restart the database explicitly and start a new supervisor for reconciliation. Do not reseed profiles
to hide counter mismatches or truncated ledgers. Previously flushed state is the crash boundary.

Validation commands are separate so `npm test` requires no database, container or browser:

```sh
npm run check
npm test
export PGHOST="$SCHEDULER_DATA_ROOT/socket"
npm run test:database
SCHEDULER_DATA_ROOT="$SCHEDULER_DATA_ROOT" npm run test:fixture
```

Database tests create and drop only their own uniquely named test schemas in the explicitly selected
database. For local database-only checks, `sh prepare-scheduler-db.sh NEW_PRIVATE_ROOT docker` is
supported. It does not establish Podman/sandbox/host acceptance. The fixture fault suite takes the
parent supervisor lock, uses a separate retained dataset/schema, kills only its own child supervisors
and attempts, and deliberately stops/restarts the selected scheduler database. Run it only while the
normal dispatcher is idle. It covers crash boundaries, a surviving expired owner, active cancellation
and revision changes, unavailable sessions, uncertain actions, database outage and malformed evidence.

Rollback/cleanup: disable schedules, stop the dispatcher gracefully, run `scheduler-reconcile`, and
verify no matching browser containers/processes remain. Read `DATA/database.json` to identify the
exact labelled database container; stop/remove only that container and the explicitly prepared fixture
and network after inspection. Retain the database directory/password, profiles, attempts, ledger and
reports for review. Never run broad pruning, drop the scheduler schema as recovery, or restart Minecraft
automatically. Restarting the fixture invalidates its in-memory sessions/action evidence; use a new
explicitly prepared dataset for a new experiment.

See [scheduler evidence and limitations](../docs/research/bounded-fixture-scheduling.md).
