# Bounded fixture scheduler results

**PASS for the tested single-host, single-slot fixture configuration.** On Jarlaxle on 2026-10-27,
all 102 predeclared clean visits passed on their first attempt, with 34 completions per tenant.
The separate recovery suite passed 16/16 cases. This establishes a durable synthetic scheduler,
not Facebook/Messenger reliability, customer capacity or a production SLA.

## Implemented scope

The existing TypeScript workspace schedules three synthetic tenants through PostgreSQL 17.11,
pg-boss 10.4.2 and pg 8.23.1. Node 20 remains supported; the host used its existing Node 22.23.4
toolchain and Playwright 1.64.1 Chromium image. PostgreSQL uses a digest-pinned image, a 768 MiB cap,
no swap and a private Unix socket with container networking disabled.

One supervisor holds the dataset lock and dispatches one eligible job per round-robin tenant turn.
Observation ticks coalesce; each tenant has at most one nonterminal observation and one explicit
action, including unresolved actions. Overload action submissions are rejected. Pending payloads
and settlement use short, generation-fenced transactions against the pinned queue schema; no
database transaction spans browser work. Seven-day terminal queue retention is maintained at
startup and between visits. Private attempt history is retained separately.

Browsers preserve sandboxing, isolated profile mounts, `flock`/generation ownership, heartbeat,
resource admission and verified process/cgroup shutdown. Worker checkpoints validate current
schedule revision, cancellation, deadline and queue ownership before operations. Observations
flush before shutdown and are imported idempotently after release. Uncertain actions never retry
automatically; only positive fixture evidence can establish that they applied.

## Clean-run measurements

The plan declared 102 visits at a 10-second interval per tenant, with all three tenants due together
and the first due time staged three seconds ahead. A separate three-visit pilot seeded and cleanly
flushed the profiles. The clean run reused committed profiles without reseeding. The browser cap
remained the conservative 2 GiB bootstrap cap; no smaller allowance was copied from the old benchmark.
The baseline retained the host guard and 1.5 GiB future-service reserve.

| Measurement | Result |
| --- | ---: |
| Planned / completed clean visits | 102 / 102 |
| First-attempt success / retries / skips | 100% / 0 / 0 |
| Completions per tenant | 34 / 34 / 34 |
| Occupied time, mean / p95 / max | 2.387 / 2.461 / 2.567 s |
| Cleanup time, mean / p95 / max | 0.507 / 0.596 / 0.608 s |
| Queue wait and dispatch lateness, mean / p95 / max | 2.574 / 5.078 / 5.167 s |
| Whole-browser cgroup peak | 298.80 MiB |
| Database cgroup peak | 78.88 MiB |
| Scheduler process RSS maximum | 105.11 MiB |
| Concurrent database memory + scheduler RSS maximum | 147.56 MiB |
| Database / scheduler average CPU, fractions of one core | 0.0128 / 0.0577 |
| Minimum sampled host MemAvailable during visits | 5.813 GiB |
| Maximum memory PSI full / swap-out growth | 0 / 0 pages |
| Browser OOM / ownership / isolation violations | 0 / 0 / 0 |
| Maximum observation-to-consumer completion lag | 0.663 s |
| Pending jobs / oldest pending age at completion | 0 / 0 |
| Clean coalesced ticks / expired visits | 0 / 0 |
| Clean invocation elapsed time | 340.266 s |

Occupied time includes ownership, launch, restoration, inspection, observation flush and verified
cleanup/release; database consumption follows. Queue wait equals dispatch lateness here because
no clean ticks coalesced. The synchronised arrivals deliberately queue the second and third tenants;
these waits are fixture measurements, not detection-delay promises.

All 102 observations have distinct tenant/source identities and one durable consumer result each.
The dataset has 105 consumed observations including the three-visit pilot. Tenant turns repeat
`seller-a`, `seller-b`, `seller-c` for 34 rounds. The fixed-denominator 99% first-attempt and
minimum-33-per-tenant gates passed without discarding or retrying any primary attempt.

The separate database and scheduler maxima occur at different instants; do not add them as a
concurrent measurement. The concurrent sum is conservative because PostgreSQL's cgroup includes
shared/file memory and scheduler RSS is not unique physical memory. Its 147.56 MiB peak fits the
1.5 GiB service allowance without reducing other reserves. The warmed pre-clean pool budget was
3.573 GiB, admitting the unchanged 2 GiB slot with live headroom checks. A final 61-sample quiescent
baseline, with the queue client/supervisor lock and database resident, retained 6.137 GiB minimum
available and a 3.572 GiB pool budget; concurrent service memory peaked at 90.69 MiB. No cache
eviction or unrelated-service changes were used.

## Recovery and correctness evidence

The final prepared-host suite passed 16 separately recorded cases:

1. Seed three profiles and establish cleanly flushed state.
2. Coalesce bursts, enforce six logical jobs and demonstrate fair turns under action overload.
3. Cancel an active attempt before its next browser operation.
4. Change a schedule revision during execution and fence the next operation.
5. Kill a supervisor immediately after claiming a job.
6. Kill a supervisor after observation flush and replay without another browser observation.
7. Kill a supervisor after browser release but before queue acknowledgement.
8. Expire a claim and profile lease with a surviving stopped worker/browser; reject replacement
   ownership, force cleanup after the grace period and verify termination.
9. Block unavailable history until explicit validated recovery.
10. Block expired authentication until explicit synthetic recovery.
11. Reject an obsolete source revision before sending.
12. Reconcile lost action acknowledgement from positive tenant-scoped evidence without resending.
13. Retain action uncertainty and reject an additional action for that tenant.
14. Stop PostgreSQL during an admitted visit, clean up locally, restart it and settle before new work.
15. Restart the fixture, lose action evidence and retain uncertainty without authorising a resend.
16. Retain a truncated ledger and reject incomplete evidence.

The survivor case required the expected forced kill after the 15-second graceful-stop window and
took 17.9 seconds overall. Cleanup preceded replacement ownership. The successful fault dataset
has no unsettled attempts or queued jobs; its remaining uncertain action is explicitly recorded.
Prior failed fault data and deliberately interrupted attempts remain retained separately.

All 19 browser-free unit tests and three real PostgreSQL integration tests pass locally and on the
prepared host. They cover atomic enqueue rollback, restart/fair cursor, overload/deduplication,
30/60-second retry bounds/exhaustion, expired-claim fencing, deadline skips, consumer transaction
rollback/replay and schema identity. A final regression checks that Playwright-wrapped persistence
errors block their tenant while another healthy tenant continues, preserving raw diagnostics.
TypeScript and strict OpenSpec validation pass.

## Limits and retained preflight failures

- Restarting the fixture invalidates sessions/action history. Podman also changed its private IP in
  the reset test, changing browser storage origin. Recovery correctly refused absent markers instead
  of reseeding. The test initially expected restoration and was corrected to assert safe refusal when
  the origin changes; the failed run remains retained. Use a new dataset after fixture replacement,
  or explicit recovery only when committed state can actually be verified.
- Before the accepted pilot, pg-boss's declared `purge()` method was absent at runtime; the supported
  `maintain()` path replaced it and was integration-tested. A separate three-attempt pilot exposed
  unreadable image dependencies under a restrictive umask; the image now grants read access to copied
  program assets. Those failures preceded fixture authentication/seeding and remain separate from the
  predeclared clean denominator.
- Crash guarantees cover flushed observations and previously committed browser state. A counter
  mismatch requires recovery, not profile erasure. A negative action lookup does not prove that an
  external effect never occurred.
- This finite runner loads retained history for status/evidence. Long-lived operation needs bounded
  history queries and longer representative measurements; six outstanding jobs do not bound history.
  More slots, real accounts, production encryption/access control, public access and Meta authorisation
  remain outside this change.

## Evidence, cleanup and handoff

Raw data remains owner-only on Jarlaxle under the selected scheduler data root, outside Git. It
includes database volume/password, clean/fault profiles and schemas, ownership/attempt records,
ledger, plans/results, clean aggregate, pre/warmed/post baselines and fault reports. The clean source
is `scheduler-1793109914007.json`; the successful fault dataset is `faults-1793110641424`. Measured
workspace and final source/test snapshots have retained archives and SHA-256 sidecars. The original
baseline's Git revision was unrecorded; exact working-tree snapshots provide its provenance.

Cleanup removes only the selected database container, fixture and empty labelled private network
after verifying no browser descendants remain. Database/profile/evidence directories are retained.
Minecraft was already stopped and remains stopped; no world data, configuration or unrelated service
was changed. The scheduler change was archived at the owner's request on 2026-10-27; the benchmark change remains unarchived.

The [runbook](../../benchmark/README.md#durable-single-slot-fixture-scheduler) covers setup, finite runs,
status, cancellation, session/action reconciliation, rollback and separate unit/database/live checks.
A production proposal still needs an authorised platform path and evidence beyond this fixture.
