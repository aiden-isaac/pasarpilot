## 1. Establish the host preparation gate

- [x] 1.1 Revalidate Jarlaxle hardware, runtime availability and Minecraft process/controller identity; record current RSS/PSS, cgroup memory and a 60-second live host baseline without collecting secrets.
- [x] 1.2 If Minecraft is running, present the verified graceful-stop procedure and obtain explicit owner confirmation or record the owner's direct stop; verify world-save exit and absence of restart without deleting data, changing configuration or stopping unrelated services. If blocked, keep browser execution blocked.
- [x] 1.3 Capture the post-stop 60-second baseline, or document that Minecraft was already stopped; retain both actual samples and do not assume all Minecraft RSS becomes available RAM.

## 2. Prepare the smallest controlled environment

- [x] 2.1 Add a minimal TypeScript/Playwright harness workspace with pinned versions and documented commands; keep runtime installation/configuration explicit and scoped to the experiment.
- [x] 2.2 Set up one compatible container runtime on Jarlaxle if needed and check kernel/runtime prerequisites for non-root sandboxed Chromium without launching a browser yet; verify actual sandbox operation in the admitted pilot and refuse an unsandboxed fallback. Record setup overhead before resource comparisons.
- [x] 2.3 Create the private authorised fixture with three synthetic identities, persistent authentication/local-storage/IndexedDB counters, deterministic four-target inspection, expiry/history-unavailable states and a bounded synthetic action for reconciliation tests.
- [x] 2.4 Define protected local profile/raw-output directories, exclusions from version control and a sanitised result schema; verify fixture-only network access and absence of public CDP/VNC/management endpoints.
- [x] 2.5 Start the fixed fixture/collector/supervisor workload, capture a warmed 60-second idle baseline, and declare the safety reserve, future-service reserve, initial cap, CPU limit, swap policy, cadence and timeouts in a run manifest before the first admitted browser.

## 3. Implement single-slot lifecycle and ownership

- [x] 3.1 Implement exclusive host profile locks and generation-numbered persisted attempt records; bind ownership to unique container identity or PID/start time and reject unknown/path-escaping tenant profiles.
- [ ] 3.2 Implement fresh-container persistent-profile visits, independent identity/history readiness checks, seed-once storage assertions and graceful shutdown with verified empty process-tree/cgroup before release.
- [ ] 3.3 Implement heartbeat/expiry handling, cancellation/revocation, bounded forced cleanup of experiment-only descendants and supervisor-start reconciliation; prove expiry cannot launch a second browser over a surviving owner.
- [x] 3.4 Append/flush normalised synthetic observations to a durable local ledger and consume them after browser exit; demonstrate renewed ownership/state checks and no blind retry for obsolete or uncertain fixture actions without adding trading/AI/production scheduling.

## 4. Instrument and check the safety envelope

- [ ] 4.1 Collect one-second and lifecycle-boundary host/cgroup/process metrics, including memory categories/peak, RSS/PSS, CPU/throttling, swap, PSI, OOMs, phase/occupied-slot timings and quiescent profile disk growth; report unsupported counters explicitly.
- [ ] 4.2 Implement live admission using measured headroom and aggregate mode allowances, defaulting to one slot; enforce the declared pressure/OOM stop conditions and test rejection/abort paths without pressuring unrelated host workloads.
- [ ] 4.3 Add small fixture-based checks for identity persistence, cross-tenant isolation, duplicate-profile rejection, stale-generation fencing, supervisor restart with surviving attempt, crash recovery, cancellation, unavailable history and uncertain actions.
- [ ] 4.4 Run the admitted single-slot pilot, verify complete process accounting/cleanup and tune the declared mode allowance from measured peak plus headroom; record any configuration change before primary comparisons.

## 5. Run the primary matched comparisons

- [ ] 5.1 Run continuous-browser arm A for at least 100 completed fixture visits when safe, retaining planned/first-attempt/retry counts, matched workload/cadence and the five-minute idle measurement.
- [ ] 5.2 Verify A's full cleanup and capture a fresh comparable baseline; run fresh-process rotation arm B for at least 100 completed visits, at least 33 per profile, without reseeding, excluding only declared warm-ups and reporting every failed attempt.
- [ ] 5.3 Separately perform at least five injected crash/restarts plus the declared ownership, cancellation, expiry/history and uncertain-action cases; verify committed state and safe recovery without hiding faults in clean-visit denominators.
- [ ] 5.4 Capture five-minute settled cleanup samples; quantify residual anonymous memory, available-memory drift, reclaimed processes, profile growth and integrated memory-time. Stop/report incomplete evidence if safety or practicality prevents completion.

## 6. Investigate optional modes only when admitted

- [ ] 6.1 Evaluate the two-slot budget using measured allowances and live headroom; run distinct-profile concurrency only if admitted, otherwise record the exact skip reason and leave capacity unmeasured.
- [ ] 6.2 Evaluate four slots only after a safe lower-concurrency result and a fresh admission check; seed a fourth synthetic profile outside the primary dataset if admitted, and record measured contention or an explicit skip without exceeding the host envelope.
- [ ] 6.3 If admitted, compare headless with headed/display mode and temporary protected noVNC with zero/one viewer; test exclusive mode handoff, release/inactivity/deadline cleanup and background-plus-interactive operation only where both modes fit.

## 7. Produce the decision and scoped handoff

- [ ] 7.1 Calculate raw/70%-budgeted checks per hour, memory envelopes, monthly browser-time cost and interval feasibility for 5/20/50/100 active sellers and one/two/four slots using measured timings; label every extrapolated concurrency/input.
- [ ] 7.2 Calculate mean/p95 queue/detection delay for declared staggered/burst arrival assumptions and sensitivities for outgoing visits, additional retries and ten interactive minutes/hour; report unstable workloads rather than finite latency promises.
- [ ] 7.3 Write sanitised findings to `docs/research/bounded-browser-lifecycle.md`, answering all eight experiment questions and separating measurements, policies, projections and future requirements. Apply every GO/NO-GO/INCONCLUSIVE gate, including 99% first-attempt success and the provisional five-seller/15-minute target; recommend only the next justified bounded change.
- [ ] 7.4 Verify no experiment browser descendants or public endpoints remain, list retained local artifacts and perform only explicitly selected synthetic-artifact cleanup under the recorded retention plan. Leave Minecraft restoration to the owner; preserve all server data/configuration and keep Meta authorisation unresolved.
