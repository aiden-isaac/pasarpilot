# Assisted WTS trading core acceptance

Date: 2026-10-28 (Singapore). Change: `assisted-wts-trading-core`, spec-driven, 29 tasks.

The synthetic MVP completes one authenticated RM10.00 sale with one stock commitment and a competing backup. It uses the existing TypeScript workspace, pinned PostgreSQL 17.11, pg 8.23.1, pg-boss 10.4.2 and Playwright 1.64.1. No dependencies were added. The change remains unarchived; no commits were pushed or squashed.

## Delivered behavior

- Operator-provisioned isolated sellers, salted asynchronous scrypt password hashes, hashed opaque sessions, expiry/revocation and generic bounded login failures (ten attempts per minute for this loopback demo).
- Loopback forms with session-derived seller scope, CSRF/origin/Host checks, bounded input, escaped text and optimistic versions. Composite seller keys enforce parent isolation.
- Explicit MTG printing, collector number, language, finish and condition; independent variants, checked integer MYR sen, shared stock across mapped WTS comments and immutable/versioned agreement history.
- Durable normalized inbox, atomic application queue wake-up, reliable source cursors, duplicate/conflict handling, missing-parent/gap deferral and review for revised sources.
- Complete-quantity row-locked reservations, deterministic backups, 15-minute database-time holds, bounded extensions, cancellation/expiry sweeps and explicit cross-listing promotion.
- Seller review, stable actor/thread conversations, deterministic proposals, private negotiation floors, version revalidation and idempotent approved simulated delivery.
- Approved payment-instruction snapshots and known fees; only explicit seller attestation of trusted receipt and exact amount commits stock. Buyer evidence stays unverified. Paid cancellation requires manual handling.
- COD, postage and collection/shop drop-off arrangements; posting/drop-off are intermediate states. Completion requires payment plus actual collection/delivery. History retains agreement and shared-instruction snapshots with scoped timelines.
- Opt-in actual typed fixture events are flushed beside the unchanged version-1, 400-event aggregate ledger. Import requires released ownership/dead-browser evidence; restart/ack replay deduplicates.

## Setup and demo

Run from `benchmark/`, with Node 20+ and the existing pinned dependencies installed. Application-only processing needs no Chromium, Podman browser or LLM. Database provisioning below uses the existing private container helper (Podman on Jarlaxle; Docker is supported for local database-only checks).

```bash
npm run build
export TRADING_DATA_ROOT=/absolute/private/path/outside/the/repository
sh prepare-scheduler-db.sh "$TRADING_DATA_ROOT" podman
export PGHOST="$TRADING_DATA_ROOT/socket"

# Bash reads without echo. Passwords enter Node only through stdin.
read -r -s -p 'Seller A password (12–256 characters): ' wts_a_password; printf '\n'
read -r -s -p 'Seller B password (12–256 characters): ' wts_b_password; printf '\n'
printf '%s\n%s\n' "$wts_a_password" "$wts_b_password" | node dist/src/trading/cli.js setup
unset wts_a_password wts_b_password
node dist/src/trading/cli.js serve
```

The inherited PostgreSQL helper can briefly observe its temporary initialization server before the final server is ready. If the first application connection returns PostgreSQL `57P03` (starting up), retain the error and retry once the final database is ready. Never reseed an existing seller dataset: setup explicitly refuses it. Later non-destructive schema upgrades use `node dist/src/trading/cli.js migrate` with the same explicit socket; normal serving uses the restricted `trading_runtime` role and checks schema versions 1 and 2.

Open `http://127.0.0.1:8787/login` locally or through an SSH tunnel; log in as `seller-a`. Keep the server on loopback. This change supplies no public/HTTPS deployment mode.

1. Add Synthetic Lightning Bolt, SYN / collector 1 / English / nonfoil / NM, unsold quantity 1, MYR price 10.00.
2. Create a synthetic WTS post. Add a mapped item comment for that inventory variant, offered quantity 1.
3. In **Simulate buyer activity**, select the item and `buyer-a`, reply `claim`. The item shows one primary claim, reserved 1, available 0.
4. Generate `claim` from `buyer-b`. B appears as backup; there is still only one reservation.
5. Save synthetic payment instructions and explicitly select **Approved for sharing: yes**. In A's order agree collection with fee 0.00, then **Propose payment request**.
6. Review the payment draft and **Approve simulated delivery**. The conversation labels it Approved / Delivered to fixture; it is still unpaid.
7. Enter the exact received amount 10.00, attest the trusted-account/COD cash check and **Confirm payment received**. Unsold and reserved both become 0, once.
8. Save a synthetic collection location and ISO meeting time. Record actual collection with a reason/evidence, then **Complete transaction**.
9. Open the order timeline from transaction history. A is completed, B unfulfilled, and there is one verified sale. Repeated delivery/payment/completion commands do not repeat their effects.

For browser-free operator-generated events, use the displayed item comment ID:

```bash
node dist/src/trading/cli.js generate seller-a ITEM_ID buyer-a 'claim'
node dist/src/trading/cli.js generate seller-a ITEM_ID buyer-b 'claim'
```

Cancellation/expiry, ambiguity and negotiation scenarios are intentionally separate from the paid sale. Unpaid cancellation releases once and promotes a fillable same-item backup. Other listing comments require explicit promotion. Conditional text such as `claim if NM` creates a review, not an entitlement. Negotiation is disabled until a private minimum is set. A price offer proposes acceptance/countering but reserves nothing before seller approval.

## Controlled browser capture

Use a new dataset and an idle prepared Jarlaxle host; never run this over an existing seller dataset. Minecraft must already be stopped; these commands do not stop or restart it. Preserve the existing admission, sandbox and ownership gates.

```bash
export TRADING_DATA_ROOT=/absolute/private/new-capture-dataset
sh prepare-scheduler-db.sh "$TRADING_DATA_ROOT" podman
export PGHOST="$TRADING_DATA_ROOT/socket"
node dist/src/trading/capture-demo.js prepare "$TRADING_DATA_ROOT"
# Build the existing image with the additive fixture/worker code.
podman build -t localhost/pasarpilot-benchmark:v1 .
# Requires a fresh owned fixture; an existing fixture is preserved, not replaced.
WTS_FIXTURE_FILE="$TRADING_DATA_ROOT/trading-fixture.json" sh prepare-fixture.sh
node dist/src/trading/capture-demo.js run "$TRADING_DATA_ROOT"
```

The assert-checked demo prepares two private synthetic accounts, writes owner-only demo credentials outside browser profile/attempt mounts, starts the application/worker/scheduler together, measures 61 baseline samples, admits one unchanged 2 GiB browser slot, captures actual fixture payloads, verifies exit/release, imports, then completes the sale using authenticated HTTP forms. Reports retain partial failures under `runs/trading-capture-demo.json`. The application, worker and scheduler are in the same Node process, so the recorded Node RSS includes all three; PostgreSQL is accounted separately and concurrently. The fixture is resident during the host baseline.

For ongoing opt-in capture, the existing scheduler dataset needs `trading-capture.json` containing `{"enabled":true}` and a fixture prepared with an operator-owned `WTS_FIXTURE_FILE` mapping the approved fixture tenants to normalized events. Existing default visits make no WTS request. The normal application worker scans only when `TRADING_CAPTURE_ROOT` is explicitly set:

```bash
TRADING_CAPTURE_ROOT=/absolute/private/scheduler-dataset node dist/src/trading/cli.js serve
# Or an explicit browser-free import of already released attempts:
node dist/src/trading/cli.js import /absolute/private/scheduler-dataset
```

Missing payloads are not semantic events or proof of completeness. An unreleased attempt is deferred. An invalid mapping, content conflict or malformed/truncated sidecar is retained and rejected; no count is converted into a claim.

## Verification

Final results: TypeScript and strict OpenSpec validation pass; 19 existing unit tests, 4 trading rule tests, 28 real PostgreSQL trading tests, 2 dashboard acceptance tests, 3 existing PostgreSQL integration tests, and all 16 prepared-host scheduler recovery cases pass. The dashboard suite includes one sandboxed local Playwright browser run; its other case checks HTTP security without Chromium. Existing live tests are one Node test containing 16 separately recorded cases. No final test is failed, skipped or blocked. No linter is configured in this repository; `git diff --check` and TypeScript were run instead of adding one.

```bash
npm run check
npm test
npm run test:trading:unit
PGHOST=/absolute/private/test-dataset/socket npm run test:trading:database
PGHOST=/absolute/private/test-dataset/socket TRADING_BROWSER=/path/to/installed/sandbox-capable/chromium npm run test:trading:dashboard
PGHOST=/absolute/private/test-dataset/socket npm run test:database
SCHEDULER_DATA_ROOT=/absolute/private/prepared-idle-scheduler-dataset npm run test:fixture
# From the repository root:
openspec validate assisted-wts-trading-core --strict
```

Tests create synthetic records in an explicitly selected private test dataset. Keep test datasets separate from manual/demo workspaces. No test resets a seller schema or commits runtime datasets. The prepared-host regression deliberately exercises browser crashes and selected fixture/database restarts, so it requires an idle owned fixture dataset. Its survivor case correctly used SIGKILL only after the existing 15-second grace period.

### Requirement and scenario traceability

All 24 requirements / 49 specified scenarios are covered by the following focused test groups, with the complete happy path also exercised through authenticated forms:

| Capability | Requirements / scenarios | Evidence |
| --- | --- | --- |
| Seller trading workspace | 6 / 11 | `auth`, `boundary`, `catalog`, `listings`, `setup` database tests; dashboard `safety` and `workflow`: login/logout/expiry, bounded failures, colliding and foreign IDs, forged/stale forms, escaped source text, variants, held-stock edits, mapped/shared listings and contextual workflow views |
| Normalized trading events | 6 / 12 | `intake`, `ordering`, `conversation`, `capture`, `negotiation`, `proposals`, `edge-cases`, `final-guards`, unit `rules`: dedup/restart, malformed/conflicting identities, gaps/missing parents, revisions, capture/ack crash replay, browser-free decisions, uncertain association, deterministic/stale/retried proposals and private negotiation policies |
| WTS claim reservations | 6 / 12 | unit `claims`/`values`; database `stock`, `backups`, `expiry`, `reviews`, `edge-cases`, `final-guards`, `sale`: exact versus ambiguous/repeated claims, independent connections and shared listings, transaction rollback, complete quantity/snapshots, late expiry, cancellation/extension, promotion/closure/terminal exclusions and reviewed capacity races |
| Assisted order lifecycle | 6 / 14 | `payment-request`, `verification`, `fulfilment`, `history`, `sale`, `final-guards`, dashboard `workflow`, prepared-host `capture-demo` and existing scheduler regressions: durable independent states, review blocking, instruction/fee approval and stale snapshots, unverified evidence, exact/idempotent seller payment, expiry/cancellation races, actual fulfilment, retained intermediate states, scoped replay-safe histories and synthetic/resource boundaries |

### Resource results

The final fresh run measured **147.53 MiB** maximum concurrent PostgreSQL + application/worker/scheduler memory, **551.15 MiB** whole-browser peak, **2.684 s** occupied time and **0.476 s** verified cleanup. Its 61 baseline samples spanned 67.125 seconds, with 6.110 GiB minimum MemAvailable, a 3.544 GiB admitted pool budget, maximum memory PSI full 0.46 (below the unchanged threshold), zero baseline swap-out growth and zero browser/database OOM events. The browser kept its 2 GiB cap and the 1.5 GiB future-service reserve stayed intact.

See [sanitised resource measurements](assisted-wts-trading-resources.json). Both the initial and final-code capture runs are retained; the JSON identifies the final one. This is a finite single-visit check of the unchanged envelope, not a new capacity/SLA claim. The original browser/scheduler ownership, single-slot and admission gates remain in place. Minecraft stayed stopped; no unrelated service or world/configuration was modified.

### Retained failures and evidence

Development checks found and corrected TypeScript inference/narrowing errors and an incorrect local browser executable path. A dashboard run against accumulated test records exceeded its browser wait; waits are now bounded and inventory/review editing is collapsed, but the finite workspace remains unsuitable for unbounded history. The fresh authenticated sale passed, as did the final combined test dataset. The final fresh PostgreSQL preparation also encountered the initialization `57P03` race described above; the failure was retained and a later retry succeeded without resetting data or changing the infrastructure helper.

Raw local logs remain under `/tmp/wts-*`; private local database/test datasets are `/tmp/pasarpilot-wts-20261027` and `/tmp/pasarpilot-wts-acceptance-20261027`. Private remote evidence is under `/home/aiden/.local/share/pasarpilot-wts/`, including the workspace, image build logs, `data/capture-20261028` (initial capture and 16-case regression evidence) and `data/final-capture-20261028` (final code capture). The final source/test archive and SHA-256 are retained beside that evidence; its hash is in the sanitised JSON. Scoped cleanup verified no producing browsers remained, stopped/removed only the selected application database and fixture containers, removed the empty labelled fixture network, and retained data/evidence. Local task-owned test database containers were also stopped/removed with datasets retained. These locations contain only synthetic trading data but also private passwords, sessions and browser state, and must stay owner-only and outside Git. Only aggregate sanitised measurements and source/test documentation are committed.

## Recovery and rollback

Stop the loopback application with SIGTERM or Ctrl-C; accepted inbox state, holds and histories remain in PostgreSQL. Restart against the same socket and schema. Startup/periodic/lazy sweeps reconcile database-time expiry; wake-up replay cannot preserve expired rights, duplicate delivery or decrement stock twice. Keep the same source epochs and event identities after interruption. Resolve source conflicts and ambiguous mappings explicitly with a reason; never regenerate event identities to bypass a review.

Use these commands with the existing selected dataset and its verified database container (do not rerun account setup):

```bash
export PGHOST="$TRADING_DATA_ROOT/socket"
# If its verified named container still exists but is stopped:
podman start VERIFIED_DATABASE_CONTAINER
node dist/src/trading/cli.js migrate
node dist/src/trading/cli.js serve
# For an interrupted controlled browser dataset, before importing:
node dist/src/cli.js scheduler-reconcile /absolute/private/scheduler-dataset
node dist/src/trading/cli.js import /absolute/private/scheduler-dataset
```

The acceptance cleanup removed container definitions while retaining mounted data. To reopen those retained datasets, reconstruct only the selected database container using its original pinned-image run command and existing volume/socket/password mounts from the provisioning helper; do not run fresh initialization or seed accounts. `podman start` applies only when the container definition still exists.

If a browser attempt was interrupted, use the existing scheduler reconciliation command before importing released handoffs. Do not unlock a profile by deleting its lease or assume expiry proves its browser dead. Preserve sidecars and import acknowledgements; replaying an unacknowledged import is safe. A source gap is deferred rather than assigned invented priority.

A concrete application rollback keeps all business data:

```bash
# OWNED_APPLICATION_PID is the operator-recorded PID of this application's serve command.
kill -TERM "$OWNED_APPLICATION_PID"
# Disable new capture using the existing durable private-file writer.
node --input-type=module - "$TRADING_CAPTURE_ROOT" <<'JS'
import { writeJson } from './dist/src/storage.js';
import { join } from 'node:path';
const root = process.argv[2];
if (!root?.startsWith('/')) throw Error('explicit-private-capture-root-required');
writeJson(join(root, 'trading-capture.json'), { enabled: false });
JS
# Reconcile existing browser ownership before any selected-container cleanup.
node dist/src/cli.js scheduler-reconcile "$TRADING_CAPTURE_ROOT"
```

Rollback stops intake/worker and new trading capture (`trading-capture.json` disabled), then follows normal verified browser shutdown and scoped resource cleanup. Retain the database, source evidence, reservations, payment/instruction snapshots and profiles for reconciliation. Do not drop schemas, reseed profiles, restore paid stock automatically or downgrade the application schema. Inspect `database.json` plus container labels to identify only the selected database/fixture; remove a private network only after it is empty and its ownership label is verified. Retain the prior image ID/tag for an explicit operator-controlled code rollback.

## Limits and next milestone

This is a loopback synthetic demonstration, with finite 200-record views and no pagination. Long-lived use needs bounded history browsing and representative sustained resource measurements. The private Unix socket relies on the operator-only dataset directory. There is no public onboarding, recovery email, live messaging, payment provider integration, refund handling, subscription billing, catalog recognition, WTB, OpenRouter or autonomous negotiation. Seller attestation records a human verification; it does not verify a bank account automatically.

Meta authorization and real-platform identity, ordering/completeness and messaging reliability remain unresolved release gates. No production security, live-platform reliability or production SLA is claimed. Recommend the next OpenSpec milestone be an explicitly scoped seller usability and sustained browser-free operations pilot, covering pagination/retention, representative workload/recovery measurements and seller workflow feedback. Pursue any authorized Meta integration only through a separate approved proposal and evidence gate.

## Atomic task commits

Each row is one completed task, in tasks.md order. The last row is the acceptance/report commit itself; the final handoff supplies its exact hash.

| Hash | Conventional Commit message |
| --- | --- |
| bf5d85a | feat(trading): add isolated workspace entry and test commands |
| 49e2a16 | feat(trading): add constrained versioned schema and runtime role |
| 9f252c5 | feat(trading): validate integer sen quantities and agreement snapshots |
| e2d9c82 | feat(trading): securely provision isolated synthetic seller datasets |
| b9b7ef4 | feat(auth): add bounded password login and expiring opaque sessions |
| 0657eb7 | feat(dashboard): enforce loopback sessions CSRF and seller boundaries |
| 72cb36d | feat(inventory): add seller-scoped MTG inventory forms and stock guards |
| 1740cf1 | feat(listings): add versioned WTS posts and mapped item comments |
| 25eb87d | feat(events): add validated atomic synthetic inbox and queue intake |
| ab67f70 | feat(events): serialize source cursors and defer gaps or revised claims |
| 3271fff | feat(conversations): persist actor-scoped messages and uncertain associations |
| cdc5751 | feat(responses): add deterministic trading templates without AI |
| 6018e19 | feat(claims): classify exact claims backups and ambiguous requests |
| facb0c0 | feat(trading): reserve global and listing stock atomically with row locks |
| be5fb6d | feat(claims): promote eligible backups deterministically without partial fills |
| f88eedb | feat(reservations): reconcile expiry cancel holds and wake durable sweeps |
| 0530b96 | feat(reviews): resolve associations and claims through guarded seller actions |
| b7d61c1 | feat(responses): approve current drafts with idempotent simulated delivery |
| 9fc0313 | feat(negotiation): enforce private seller floors and approved offer allocation |
| 00cbcc3 | feat(payments): propose approved instruction snapshots and exact payable totals |
| 3a7c2d3 | feat(dashboard): expose seller claims reviews conversations and payment approvals |
| ed9b5c4 | feat(payments): verify trusted receipt and commit reserved stock once |
| 96a98df | feat(fulfilment): track arrangements handover and guarded completion |
| 436ab25 | feat(history): show isolated transaction timelines and agreement snapshots |
| ae2689a | feat(fixtures): capture typed WTS sidecars and replay released handoffs |
| 5354bae | test(trading): demonstrate authenticated RM10 sale with backup and collection |
| 177ad7f | test(trading): cover tenant boundaries revisions review and reservation races |
| 2b16f3b | test(fixtures): verify bounded browser capture through authenticated completed sale |
| HEAD (this report) | test(trading): complete acceptance guards and publish operator runbook |
