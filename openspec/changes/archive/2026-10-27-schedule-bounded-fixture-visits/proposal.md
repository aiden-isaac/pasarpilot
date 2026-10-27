## Why

The completed browser-lifecycle benchmark returned GO for a single-slot fixture scheduler, but its sequential driver cannot preserve scheduled work across restarts, control backlog or demonstrate tenant fairness. The next step is to prove those behaviours with a real durable queue while preserving the measured browser isolation and host safety boundaries.

## What Changes

- Add a single-host PostgreSQL/pg-boss scheduler for the existing private synthetic fixture, with exactly one admitted browser slot and fresh Chromium processes over the existing three tenant profiles.
- Persist tenant schedules, job identity, attempts and outcomes; coalesce overdue observation ticks, bound accepted work and retries, and dispatch eligible tenants in deterministic round-robin order.
- Preserve supervisor/profile locks, generation fencing, live resource admission and verified browser termination. Reconcile surviving browsers before recovering interrupted jobs; queue expiry alone never releases a profile or slot.
- Support cancellation, schedule revision checks, blocked authentication/history states and one explicitly submitted outgoing fixture action with stale-state rejection and uncertain-outcome reconciliation.
- Flush observations before browser shutdown and consume them idempotently after verified browser release, including recovery when a crash separates observation persistence from queue acknowledgement.
- Measure actual PostgreSQL/queue overhead, queue wait, lateness, occupied time, backlog and recovery on the prepared host, and document a repeatable fixture-only runbook and outcome.

## Capabilities

### New Capabilities

- `bounded-fixture-scheduling`: Durable fixture job scheduling, bounded fair dispatch, lifecycle-safe recovery, browser-free observation consumption and measured single-slot acceptance.

### Modified Capabilities

None. There are no published main specs yet; the unarchived benchmark change remains evidence and a dependency, with its lifecycle requirements preserved.

## Impact

- Extend the existing TypeScript workspace under `benchmark/` with a scheduler entry point, a minimal database schema/migration and queue integration. Reuse `ownership.ts`, `recovery.ts`, `runtime.ts`, `events.ts`, fixture operations and resource accounting; extract only the visit lifecycle needed by both drivers.
- Add pinned PostgreSQL/pg-boss tooling and only the database client needed for short transactions. Record compatibility and measured resource overhead before browser execution; keep all database/profile/raw evidence outside Git and endpoints private.
- Add deterministic scheduler tests, real PostgreSQL integration tests and controlled fixture recovery runs. Update `benchmark/README.md`, the root README and a sanitised scheduler research report without rewriting the completed benchmark evidence.
- No production Facebook/Messenger access, multi-host execution, additional browser slots, headed/noVNC workflow, dashboard, trading logic, AI, billing or customer SLA. No existing runtime resources are started or host services changed by this proposal.
