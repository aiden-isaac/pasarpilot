## Context

The [completed benchmark](../../../docs/research/bounded-browser-lifecycle.md) measured 100 successful fresh-process visits, 2.316 seconds mean occupied time and a 576 MiB calibrated fixture allowance. Its GO applies to a one-slot synthetic scheduler, not platform integration. The existing `benchmark/` TypeScript workspace already implements private fixture networking, persistent profiles, supervisor/profile `flock`, generation-numbered leases, sandbox checks, resource admission, forced cleanup and flushed observation files. `runner.ts` currently embeds lifecycle management in a finite sequential loop; there is no database or scheduler.

The three primary tenants are `seller-a`, `seller-b` and `seller-c`. Fixture sessions are in memory: restarting the fixture invalidates saved authentication and action history. Previously flushed profile state is the crash-durability boundary; arbitrary in-flight profile writes are not guaranteed.

## Goals / Non-Goals

**Goals:** Demonstrate durable schedules, bounded backlog, deterministic tenant fairness, cancellation, restart recovery and idempotent browser-free consumption on one prepared host with one admitted browser. Measure the queue/database cost and preserve existing isolation, resource and shutdown checks.

**Non-Goals:** Facebook/Messenger access, distributed execution, additional slots, headed authentication, public APIs, dashboard, trading/AI/billing logic, production uptime or freshness guarantees. The completed benchmark change stays unarchived and unchanged.

## Decisions

### 1. Reuse the workspace and lifecycle; add PostgreSQL/pg-boss

Add a scheduler CLI/module in `benchmark/`, retaining existing benchmark commands. Extract only the single fresh-process visit and its cleanup needed by both drivers; leave the continuous control and historical report formats intact. Reuse `Ownership`, `Session`, `heartbeat`, `reconcile`, `admit` and `PressureGuard`, with explicit job cancellation/deadline checks at the shared boundary. Search and preserve callers in `runner.ts`, `faults.ts`, `concurrency.ts`, `interactive.ts`, `smoke.ts` and tests when shared code changes.

Use PostgreSQL and pg-boss for durable delivery and retry state, with small application tables for tenant schedule/revision, dispatch cursor, visit receipts, action outcomes and consumed observations. Do not add an ORM, generic queue interface or a second job-state engine. Pin a release combination compatible with the declared Node runtime and record schema/API compatibility in the run manifest. The implementation selects PostgreSQL 17.11, pg-boss 10.4.2 and pg 8.23.1, preserving Node 20 support. Integration tests prove transactional enqueue/rollback, manual fetch/settlement and duplicate suppression. The pinned pg-boss version requires short row-locked SQL updates for pending payload refresh and retry-generation fencing; use its supported `maintain()` method for expiry/archive/deletion. An incompatible release is a blocker to resolve, not permission to silently replace the queue.

An in-memory timer or JSON job file cannot exercise the database/restart boundary recommended by the benchmark. A hand-built SQL queue would duplicate delivery machinery. The current [pg-boss job](https://github.com/timgit/pg-boss/blob/master/docs/api/jobs.md) and [queue documentation](https://github.com/timgit/pg-boss/blob/master/docs/api/queues.md) informs this choice; exact APIs must be checked against the pinned release. Queue claims and expiry do not prove browser termination or exactly-once external effects.

### 2. One supervisor, three tenant queues and a persisted fair cursor

Take the existing root-scoped supervisor lock before startup reconciliation, and keep it through shutdown. Tie the database dataset to one canonical private data root and one host; reject a mismatched root/host, a second supervisor or concurrent benchmark use. Per-profile locks remain independent safety checks. No database lock/transaction is held open during Chromium work.

Use one pg-boss queue per primary tenant, manual one-job fetches and one supervisor-owned browser slot. Poll eligible tenants in sorted circular order after the last dispatched tenant, persisting the cursor with the dispatch record before launch. Observation and explicit action work share that tenant's turn; choose its oldest eligible job, with job ID as the tie-breaker. Advance the cursor for every dispatched attempt, including a failed one. For N continuously eligible tenants, none receives a second turn before the others receive one. Retry delays and resource denial do not hold a turn or create a busy loop. Do not rely on global FIFO or priority as a fairness policy.

### 3. Persist intent atomically and bound accepted work

A schedule contains tenant, enabled/blocked state, revision, positive interval, next due time and outstanding observation job ID. Job payloads contain stable logical ID, dataset, tenant, kind, schedule revision, due time and deadline; actions additionally contain a tenant-scoped action ID and expected fixture revision. Validate CLI input, tenant/path identity, finite timings and action IDs before persistence.

In a short transaction, lock the schedule row, insert a due observation through pg-boss and update its reference/next due time. Use pg-boss's transaction integration; prove rollback with the pinned release. At most one nonterminal observation job per tenant exists, including active/retry work. Repeated ticks record the latest due time, coalesce earlier missed ticks and advance the schedule to the first future interval without enqueuing each missed interval. After settlement, materialise at most one current follow-up. Preserve the first pending time separately from the latest due time for honest backlog-age metrics. Restart performs the same calculation; it does not replay every offline tick.

Allow at most one nonterminal explicit action per tenant, across queued, active, retry and uncertain states. Thus there are at most six nonterminal logical jobs across the three tenants; overload action submissions receive a recorded rejection, while observation ticks coalesce. A duplicate tenant/action ID returns its existing outcome rather than another job. Blocked tenants retain their reason and do not generate automatic work. Queue maintenance removes terminal queue records after seven days; retain sanitised run summaries and scope any other evidence cleanup explicitly.

Observation freshness deadlines are one interval after the latest represented due time. Refresh pending observation metadata transactionally when coalescing; never mutate an active attempt's captured revision/deadline. A stale attempt is settled without a browser launch and current observation demand remains coalesced for a later turn. Actions require an explicit finite deadline and are rejected when stale. Runtime work is bounded by the earlier of that captured deadline and 120 seconds after launch; allow up to 40 additional seconds for verified cleanup. Set queue expiration above that full attempt bound (at least 180 seconds), with no automatic worker that can bypass the supervisor. Retry only transient observation failures, at most twice after the initial attempt, with 30/60-second delays; abandon a retry once its deadline is obsolete. A new periodic observation is distinct from a retry and retains failure metrics.

### 4. Keep durable receipts separate from process ownership

Before launch, recheck current schedule revision, enabled/blocked state, cancellation, deadline, live headroom, empty slot and profile availability. Acquire a new profile generation, associate the claimed job/attempt with it and persist before starting Chromium. Worker checkpoints exchange a small stdin/stdout guard request with the supervisor before fixture operations; the supervisor checks current database intent and ownership without giving database access to browser containers. Check cancellation/revision/ownership again before observation append. External cancellation is a durable request; an operation already sent can finish, so its outcome may require reconciliation.

On success, flush the existing local observation ledger, close Chromium, verify its process tree/cgroup is empty and release the profile. Only then commit a durable receipt and queue completion, using short transactions and conditional attempt identity. If database connectivity fails, stop admission and cancel/clean up the current browser using local ownership files. Never use a queue timeout as proof that cleanup succeeded. Unproven termination halts all browser dispatch on this one-slot host.

Startup and every interruption follow: acquire supervisor lock; fence recorded owners; reconcile only dataset-labelled containers; verify absence; recover local observation/attempt evidence; settle or retry interrupted logical jobs; resume dispatch. A crash after flush or shutdown but before database completion replays the existing receipt/observation with stable identity instead of blindly repeating the visit. If an in-flight profile counter cannot be matched to committed state, block that tenant for explicit recovery; never reseed to conceal a mismatch. Malformed or irreconcilable records stop recovery with retained evidence.

### 5. Browser-free consumption and uncertain fixture actions

Import the flushed ledger only after the producing attempt is verified dead and its profile is released. Insert normalised observations with unique tenant/source identity and mark their consumer result in the same database transaction. A retry or consumer restart produces one durable result per source identity. The ledger plus receipt bridges filesystem/database commits; it is not a distributed atomic transaction. A partial trailing ledger record is retained and diagnosed rather than silently treated as a complete observation.

For an explicit action, reacquire the tenant normally, refresh fixture identity/history/source revision and reject stale work before sending. Persist action uncertainty before the existing `/api/action` call; on an ambiguous acknowledgement or interrupted completion, never automatically resend. Add only a read-only tenant-scoped action-status lookup to the fixture so recovery can identify an already applied ID. Mark applied only from positive evidence. Missing/invalidated fixture history remains unresolved until explicit operator disposition; a negative lookup alone does not authorise resend. The existing local `actionGate` uncertainty record and database outcome must be reconciled under the same tenant/action identity.

Authentication expiry and history-unavailable outcomes block that tenant after verified shutdown. Other tenants continue fairly. An explicit fixture recovery/resume command validates restored state and increments schedule revision before renewing work; no periodic login or destructive profile replacement is added.

### 6. Measure the complete running system before accepting it

Use dedicated owner-only database/profile/evidence directories outside Git and private database connectivity inaccessible to browser containers; never publish database/CDP/VNC/management endpoints. Prepare capped PostgreSQL/runtime resources explicitly. Obtain fresh host baselines with database, fixture and supervisor running, retain the existing host guard and conservative 1.5 GiB future-service reserve, and apply live admission rather than copying the old pool budget. Measure database plus scheduler overhead separately against the 1.5 GiB planning allowance; exceedance blocks acceptance pending a revised resource plan. This deliberately retains conservative headroom even though PostgreSQL is now resident in the warmed baseline. Start at the existing 2 GiB bootstrap browser cap; any reduction requires a fresh calibrated pilot, never merely the historical 576 MiB result.

Local tests use a fake clock/visit executor for scheduling policy. Real PostgreSQL tests prove persistence, atomic enqueue/rollback, deduplication, bounded work, retry/claim expiry and restart settlement; they are separate from default browser-free unit tests. Host tests use the real fixture and prepared rootless runtime, with the existing host preparation gate. If Minecraft is running, stopping it still requires fresh explicit owner approval; this proposal does not grant that approval.

Record initial/steady queue depth, oldest pending age, coalesced/rejected/expired counts, per-tenant turns, queue wait, lateness, first-attempt success, retries, occupied/cleanup time, consume lag, database/supervisor memory and CPU, host pressure and final process absence. Predeclare at least 100 planned clean visits across three tenants, require at least 33 completed visits each and at least 99% first-attempt success, then run separate accelerated burst/overload, outage and recovery cases. Keep the planned denominator fixed; do not discard failed, skipped or late visits to improve the result. Declare cadence and limits before each run. Every accepted job must have a terminal or explicitly blocked/uncertain result. Validate six-job bound and round-robin turns deterministically; do not infer a customer SLA from timing samples. Report PASS only when correctness, resource and recovery gates all pass; demonstrated violations yield FAIL, missing/unsafe evidence yields INCONCLUSIVE.

## Risks / Trade-offs

- [Database exceeds the reserved envelope] → Measure the warmed full stack, refuse browser admission without headroom and report blocked/inconclusive execution rather than reduce safety reserves.
- [Queue redelivery overlaps a surviving worker] → One supervisor plus host/profile fencing, reconciliation and verified termination guard every launch.
- [Filesystem and database commits are separated] → Stable identities and recoverable receipts/ledger replay; quarantine ambiguous profile state and test each crash boundary.
- [Fixture reset loses sessions/action history] → Treat missing evidence as recovery-required/uncertain, preserve old data and use a new explicitly prepared dataset for a new fixture instance.
- [Non-preemptive work delays another tenant] → Bound visits and cleanup, rotate turns and expose lateness; this fixture policy does not promise production freshness.
- [Changing shared helpers regresses the benchmark] → Keep existing commands and output contracts, run all existing tests and add focused shared-lifecycle checks.

## Migration Plan

Create a separate scheduler dataset and schema with an explicit versioned setup command; seed only fresh synthetic profiles, then establish a clean committed baseline. Reject incompatible schema/dataset identity rather than reset it. Add setup/run/status/cancel/recover instructions using the existing CLI style. No benchmark evidence or production schema is migrated.

Rollback stops new dispatch, fences/cleans the current attempt and verifies termination before stopping only scheduler-owned queue/database/fixture resources. Keep database volume, profiles, receipts and raw evidence for diagnosis; no broad prune, database drop or automatic Minecraft restart. Existing benchmark commands remain usable in their separate datasets. Update documentation after validation without archiving either OpenSpec change.

## Open Questions

- Which pinned queue/database combination meets the Node baseline? Resolve with integration checks.
- Does the warmed stack fit Jarlaxle with unchanged reserves? Resolve through measurement.
