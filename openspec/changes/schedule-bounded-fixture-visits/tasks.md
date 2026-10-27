## 1. Establish durable queue compatibility and storage

- [x] 1.1 Pin PostgreSQL, pg-boss and the required database client to a compatible Node runtime; add explicit private/capped database setup and an opt-in real-database test command without changing default browser-free checks.
- [x] 1.2 Prove pg-boss transactional enqueue/rollback, manual fetch/attempt-aware settlement, duplicate suppression and claim expiry against the pinned release; record the supported APIs and versions.
- [x] 1.3 Add a minimal versioned scheduler schema for dataset identity, schedules/revisions, fair cursor, attempt receipts, tenant/action outcomes and consumer results; reject incompatible schemas/root/host identity without resetting data.
- [x] 1.4 Add validated fixture scheduler setup/status/submission commands using existing CLI conventions, with owner-only data outside Git, primary-tenant restrictions, duplicate action-ID lookup and tests for invalid inputs/path escapes.

## 2. Implement bounded scheduling and fair dispatch

- [x] 2.1 Implement atomic due-job creation and schedule advancement, one outstanding observation per tenant and latest-tick coalescing across active work/restarts; retain original pending age and coalesced counts.
- [x] 2.2 Enforce one nonterminal action per tenant, including uncertain outcomes, the six-job dataset bound, explicit overload rejections and seven-day terminal queue retention; verify bounds with real database transactions.
- [x] 2.3 Add manual single-job fetches over three tenant queues with a durable sorted round-robin cursor and oldest-job/ID tie-breaker; test continuous eligibility, noisy tenants, actions, delayed retries and restart fairness using a fake clock/executor.
- [x] 2.4 Implement schedule revision/disablement/cancellation checks, coalesced observation deadlines, explicit action deadlines, 120-second work/40-second cleanup bounds, queue expiry of at least 180 seconds and transient observation retry limits of two with 30/60-second delays; test expiry and exhaustion without browser launches.

## 3. Connect the existing browser lifecycle safely

- [x] 3.1 Search all lifecycle callers and extract only shared fresh-process visit/cleanup code from `runner.ts`; preserve continuous/concurrency/interactive/fault/smoke behaviour and existing report contracts, and run the existing TypeScript checks/tests.
- [x] 3.2 Hold the dataset supervisor lock through reconciliation/shutdown, reject competing benchmark/scheduler access, and associate each claimed job with persisted profile generation/attempt ownership before launch; test competing/stale owners.
- [x] 3.3 Add pre-launch and operation-boundary job checks, resource admission, heartbeat, cancellation and pressure handling; require verified empty process-tree/cgroup before profile or slot reuse, and halt dispatch when termination is unproven.
- [x] 3.4 Implement distinct authentication/history recovery-required states and explicit validated fixture recovery/resume with a new schedule revision; test that blocked tenants stop generating work while healthy tenants continue.

## 4. Reconcile durable outcomes and fixture actions

- [x] 4.1 Associate flushed observations with logical jobs/attempts, commit completion receipts after verified browser release and implement idempotent browser-free observation import/consumer transactions with tenant/source uniqueness.
- [x] 4.2 Implement startup/outage reconciliation in fence-terminate-verify-replay-settle order, including local cleanup when PostgreSQL is unavailable; preserve ambiguous profile counters and malformed/truncated ledger evidence without reseeding.
- [x] 4.3 Add the smallest authenticated, tenant-scoped read-only fixture action-status lookup and tests for tenant isolation, existing/missing IDs and unchanged action validation.
- [ ] 4.4 Implement explicit action dispatch with refreshed source/schedule state, durable uncertainty before send, and positive-evidence reconciliation across local `actionGate` and database records; test stale revisions, lost acknowledgements, duplicate IDs and fixture reset without blind resend.
- [ ] 4.5 Add real-database fault tests at enqueue, claim, observation flush, browser release, completion acknowledgement and consumer transaction boundaries; assert no lost accepted intent, duplicate result or unsafe replacement dispatch.

## 5. Measure and validate on the prepared fixture host

- [ ] 5.1 Document and apply the existing host preparation gate: verify current Minecraft state and obtain fresh owner approval only if a graceful stop is needed; retain scoped resources and fresh pre/post/warmed baselines without modifying unrelated services.
- [ ] 5.2 Prepare a separate private scheduler dataset and capped database/fixture services, verify sandbox/accounting/network controls, measure database plus scheduler overhead against 1.5 GiB, and admit a fresh pilot at the 2 GiB bootstrap cap with unchanged host/future reserves; report blocked gates instead of forcing execution.
- [ ] 5.3 Instrument queue depth/oldest age, coalescing/rejection/expiry, tenant turns, wait/lateness, success/retry denominators, occupied/cleanup time, consume lag, database/supervisor resource use and host pressure in a versioned run manifest and local evidence.
- [ ] 5.4 Predeclare cadence and at least 100 planned clean visits, run the three-tenant single-slot scheduler when admitted, and verify at least 33 completions per tenant, at least 99% first-attempt success, persistence without reseeding, fair turns and zero ownership/isolation breaches; preserve all failures/skips in the planned denominator.
- [ ] 5.5 Run separate controlled burst/overload, retry/deadline/cancellation, expired-claim survivor, supervisor/database outage, crash/replay, unavailable-session and uncertain-action cases; verify the six-job bound and reconcile every accepted job to a terminal or explicit blocked/uncertain disposition.
- [ ] 5.6 Stop dispatch and verify no scheduler browser descendants remain; remove only explicitly selected scheduler runtime resources, preserve database/profiles/raw evidence and leave Minecraft restoration to the owner.

## 6. Publish the scoped outcome and runbook

- [ ] 6.1 Add reproducible setup/run/status/cancel/recover/rollback and separate unit/database/live validation commands to `benchmark/README.md`; update the root README with the implemented fixture-only scope and actual outcome.
- [ ] 6.2 Write `docs/research/bounded-fixture-scheduling.md` with PASS/FAIL/INCONCLUSIVE gates, first-attempt and retry denominators, fairness/backlog/resource/recovery evidence, retained artifacts and limitations; distinguish measurements from policies/projections and preserve completed benchmark evidence.
- [ ] 6.3 Run TypeScript checks, existing/new unit tests, explicit PostgreSQL integration tests, OpenSpec strict validation and whitespace checks; record unavailable live checks honestly and do not archive either change automatically.
