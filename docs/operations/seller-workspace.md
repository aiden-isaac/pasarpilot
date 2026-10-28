# Seller workspace operator and demonstration guide

This is an invited-seller, synthetic, loopback-only application. Payment replies
are delivered to a fixture; no Facebook, Messenger, AI, banking or public account
registration is connected. See the [acceptance report](../research/seller-usability-acceptance.md)
for passed, failed and unavailable checks. In particular, successful synthetic
sales do not establish Jarlaxle resource readiness.

## Existing demonstration

From this workspace, the selected demonstration database is
`/home/aiden/.local/share/pasarpilot-usability/demo-20261028`; its owner-only
`credentials.json` contains the two invited logins. Do not publish that file.
Start the existing data with the commands below; never run setup again on it.
Browse **http://127.0.0.1:8787/login** on the same machine. The application binds
only to `127.0.0.1`; this guide does not configure remote/public access.

```sh
cd /home/aiden/Projects/pasarpilot/benchmark
export PGHOST=/home/aiden/.local/share/pasarpilot-usability/demo-20261028/socket
npm run build
node dist/src/trading/cli.js migrate
node dist/src/trading/cli.js serve
```

If the owned database was stopped, use the verified restart procedure below
before migrating/serving. Leave this terminal running. Ctrl-C in this terminal
stops this application gracefully; it does not stop PostgreSQL or other services.

## First installation into a new private dataset

Use Node 20+ and the pinned dependencies (`npm ci`), then `npm run check` and
`npm run build`. Use rootless Podman on Jarlaxle; Docker is supported for the
local development database. The existing provisioning helper retains the pinned
PostgreSQL 17.11 image, private Unix socket, no network/ports, 768MiB/no-swap and
one-CPU cap. Choose a **new absolute path outside the repository**:

```sh
set -eu
umask 077
cd /home/aiden/Projects/pasarpilot/benchmark
seller_root=/home/aiden/.local/share/pasarpilot-sellers/demo-NEW
install -d -m 700 /home/aiden/.local/share/pasarpilot-sellers
test ! -e "$seller_root"
sh prepare-scheduler-db.sh "$seller_root" podman
export PGHOST="$seller_root/socket"
node --input-type=module - "$seller_root" <<'JS' | node dist/src/trading/cli.js setup
import {randomBytes} from 'node:crypto';
import {writeFileSync} from 'node:fs';
const accounts=['seller-a','seller-b'].map(login=>({login,password:randomBytes(24).toString('hex')}));
writeFileSync(process.argv[2]+'/credentials.json',JSON.stringify(accounts),{mode:0o600,flag:'wx'});
process.stdout.write(accounts.map(a=>a.password).join('\n')+'\n');
JS
node dist/src/trading/cli.js serve
```

The password pipe goes directly to setup; do not add `tee`, shell tracing or
passwords in command arguments. Read `credentials.json` privately to sign in.
Provisioning refuses an existing container and setup refuses existing sellers.
Do not remove those protections to restart or repeat a demonstration.

For an existing v1/v2 dataset, stop only its app, make a private backup, then run
`node dist/src/trading/cli.js migrate` with its verified `PGHOST`. Migration v3
retains accounts, source identities, sessions, stock, reservations and history.
Startup checks the schema and refuses an incompatible binary/schema combination.

## Browser-only seller demonstration

After setup, normal demonstrations need no terminal commands:

1. Sign in with the invited account. Open **Settings & help**, save a display
   name and configure **synthetic** payment instructions. Explicitly select
   **Approved for sharing → yes** and save. This does not deliver a reply.
2. Use **Inventory → Add inventory** to create a SYN / English / nonfoil / NM
   card, unsold quantity `1`, asking price `10.00`.
3. Use **WTS listings** to create a synthetic listing. Search/select that owned
   inventory and add a mapped item with offered quantity `1`. Check the first-use
   checklist. A blank private minimum leaves negotiation disabled; intervention
   guidance stays available in Settings.
4. Open **Guided RM10 demonstration** from Settings. Choose **Create one-unit
   RM10 demo listing**. Each run creates separate synthetic inventory/listing/item
   records; the card from initial onboarding remains independent.
5. Inspect inventory and the WTS item. Choose **Simulate Buyer A claim**, then
   **Simulate Buyer B backup**. A has the one held unit; B has no reservation.
6. Open **Continue with Buyer A order**. Choose collection and agree fee `0.00`.
   Propose a payment request, then find the **payment** response card and separately
   choose **Approve simulated delivery**. Inspect its RM10.00/instruction snapshot.
   Approving a claim acknowledgement is not delivery of payment instructions.
7. Open **Review payment verification**. Inspect the buyer, total, hold deadline
   and current state. For this simulation, explicitly attest the synthetic trusted
   receipt and manually enter `10.00`, then **Confirm payment received**. Screenshots
   and buyer assertions never verify payment. Do not use real banking information.
8. Save a collection location and ISO meeting time, e.g. a current/future
   `2026-10-28T20:00:00+08:00` adjusted to the actual day. Record actual progress
   **collected** with synthetic handover evidence.
9. Open **Review completion**, explicitly confirm actual receipt/handover and
   complete. Inspect **activity** and **instructions** tabs in Orders & history.
   The order is completed/verified/collected; stock was committed once; B is
   unfulfilled. No payment or fulfilment decision was made automatically.
10. Return to **All demonstration runs → start another** and repeat. Both histories
    remain reachable. The desktop/mobile/no-JS acceptance completes this twice.

Use the separate Seller B invitation to inspect tenant isolation. It cannot see
Seller A's records, even when identifiers collide. Never share session cookies.

## Repeat, interruption and recovery

There is no destructive reset button. Start a new guided run for another sale;
use an entirely new private dataset only when a genuinely blank installation is
needed. Do not truncate tables, delete audit/history, rerun setup, restore paid
stock or manufacture source positions as a reset.

Unpaid holds last 15 minutes by database time. If A expires, inspect the item and
order: the earliest eligible fully fillable backup can be promoted once. The
guide may retain A's expired order; use the item/order links or start a new run.
Unpaid cancellation has a contextual confirmation and may promote B. Paid
cancellation requires manual review and never automatically restocks inventory.
Use the guarded hold-extension form when appropriate, not direct deadline edits.

For an uncertain response, inspect the current order, proposal/delivery and
activity before deciding to retry. Stable demo run/step identities, delivered
approvals, exact verification and completed orders support safe replay through
their existing boundaries. Do not invent a new event ID to bypass a conflict.
Refresh a stale form and inspect its new version before making a new decision.
If a session expires/revokes, sign in again and inspect state; private form input
is not retained. The freshness footer is a bounded local check, not worker health
or proof that an external source is complete.

### Verified database restart

Stop only the app terminal you started. Run this from `benchmark/`, replacing the
selected path. It checks the exact owned labelled test database, restarts only
that container, queries readiness and restores socket privacy. It does not
restart Minecraft or any other workload:

```sh
node --input-type=module - /absolute/private/selected-dataset <<'JS'
import assert from 'node:assert/strict';
import {readFileSync,realpathSync,lstatSync,chmodSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
const root=process.argv[2];
assert.equal(realpathSync(root),root);
assert.equal(lstatSync(root).uid,process.getuid());
assert.equal(lstatSync(root).mode&0o077,0);
const d=JSON.parse(readFileSync(root+'/database.json'));
assert.equal(d.root,root);assert.equal(d.socket,root+'/socket');
assert.ok(['podman','docker'].includes(d.runtime));
assert.match(d.container,/^pasarpilot-scheduler-db-[a-f0-9]{12}$/);
const r=JSON.parse(execFileSync(d.runtime,['inspect',d.container]))[0];
assert.equal(r.Config.Labels['io.pasarpilot.dataset'],root);
assert.equal(r.Config.Labels['io.pasarpilot.scheduler'],'true');
execFileSync(d.runtime,['restart',d.container],{stdio:'pipe',timeout:30000});
for(let n=0;;n++){
 try{execFileSync(d.runtime,['exec',d.container,'psql','-U','fixture','-d','fixture','-Atqc','SELECT 1'],{stdio:'pipe'});break;}
 catch{if(n>=29)throw Error('not ready; retain logs/data and retry later');await new Promise(r=>setTimeout(r,1000));}
}
assert.equal(realpathSync(d.socket),d.socket);
assert.equal(lstatSync(d.socket).uid,process.getuid());chmodSync(d.socket,0o700);
console.log('Selected database ready; private socket restored; no reseed.');
JS
export PGHOST=/absolute/private/selected-dataset/socket
node dist/src/trading/cli.js serve
```

The image entrypoint resets socket-directory mode to 3775 on restart; the parent
remains private, and the check above restores 0700. PostgreSQL startup (`57P03`)
fails with a same-dataset retry instruction. Never answer it by running setup.
Owned fault tests recovered pending/held/paid state and reconciled expired rights
within 30 seconds of readiness. Missing capture or one failed source does not
block local expiry/healthy sellers; retain invalid payloads and inspect private
fixed-code logs. No browser or model credential is needed for local trading.

## Private backup and separate restore

Stop the selected app for a consistent operator inspection point; PostgreSQL
`pg_dump` itself takes a consistent snapshot. Keep `database.json`, invitation
credentials and source evidence protected separately. A dump contains private
records and authentication hashes; never commit or publish it.

After verifying the source container labels as above, stream its backup to a
new owner-only file (substitute the verified runtime/name):

```sh
umask 077
podman exec VERIFIED_SOURCE_CONTAINER pg_dump -U fixture -d fixture -Fc > /absolute/private/new-backup.dump
sha256sum /absolute/private/new-backup.dump
```

For restore, provision an entirely **new** private dataset with
`prepare-scheduler-db.sh`; do not run setup/migrate or create sellers in it first.
Verify its labels/socket and the backup hash. The dump preserves grants but does
not create cluster roles, so create the restricted runtime role before restore:

```sh
podman exec VERIFIED_NEW_CONTAINER psql -U fixture -d fixture -v ON_ERROR_STOP=1 \
  -c 'CREATE ROLE trading_runtime LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE'
podman exec -i VERIFIED_NEW_CONTAINER pg_restore --exit-on-error -U fixture -d fixture < /absolute/private/new-backup.dump
podman exec VERIFIED_NEW_CONTAINER psql -U fixture -d fixture -v ON_ERROR_STOP=1 \
  -c 'UPDATE trading.sessions SET revoked=true'
```

Restore no data over the live source. Before starting the restored app, compare
schema, source identities, counts and bounded record pages, especially verified
payments, inventory, reservations, deliveries and audit history. Old unpaid
deadlines can legitimately reconcile on worker startup; paid stock must remain
committed. Sign in with the protected invitations and inspect history. Old
sessions are revoked above to avoid reviving stale credentials.

The executable proof uses an explicitly disposable operations source and a new
restore path, streams dump/restore without buffering the database, compares every
business/queue record in pages of at most 100, checks restricted grants, signs in
both sellers and verifies paid stock after worker startup. It also prepares
new disposable legacy v1/v2 copies, backs up/restores each separately and upgrades
both originals and restores. Financial/source/history fields must match; newly
derived v3 profile/order fields and fresh migration application timestamps are
checked under the separate migration contract rather than treated as old data:

```sh
OPERATIONS_ROOT=/absolute/private/owned-operations-source \
OPERATIONS_RESTORE_ROOT=/absolute/private/NEW-restore-proof \
npm run test:trading:restore
```

The source must be an owned operations dataset prepared by the finite runner,
not the seller demonstration. Evidence/dump and both databases are retained.

## Bounded tests, storage and rollback

Use a fresh owned dataset for each clean/growth experiment; never point faults at
demonstration data. From `benchmark/`, `node dist/src/trading/operations.js
prepare NEW_ABSOLUTE_ROOT podman` prepares two private synthetic invitations.
`smoke`, `growth` or `clean` then takes that root and a **new** explicit
`ROOT/evidence/NAME` output. Growth is 250 then 1,000 orders per seller; clean is
60 minutes/240 sales, drain, then two five-minute settled windows. Do not shorten
these stages, discard failed attempts or weaken guards. Raw evidence stays private.

Application/worker RSS plus concurrent database memory is capped at 1.5GiB;
database 768MiB/no swap/one CPU; host guard max(1GiB,15% RAM). Any host swap-out
growth, configured pressure breach, OOM, missing telemetry, disk headroom breach,
512MiB additional database allocation or 256MiB evidence stops admission. The
runner is measured separately. A failed resource gate is not a capacity pass.

Business, activity and instruction history are retained. The pinned pg-boss
10.4.2 maintenance archives completed jobs after its default 12 hours and removes
archived queue jobs after 7 days; it does not delete business records. Measure
actual data/WAL/backup/evidence growth and free space; do not extrapolate seller
capacity from a finite synthetic run. No destructive retention policy was added.

Rollback stops updated intake/app and preserves the selected database/evidence.
Old binaries reject newer schemas; do not drop columns or migration records to
force a downgrade. Prefer a compatible corrective release. An owner-chosen
pre-upgrade backup requires reconciliation of every newer accepted transaction
before replacing any active data. Never automatically restore paid stock.

Future external access still needs an explicit access model, HTTPS/cookie/origin
review, invitation/session administration, backup/restore/retention policy and
resolved Meta authorization. No public listener, tunnel, proxy or production
integration is configured by this milestone.
