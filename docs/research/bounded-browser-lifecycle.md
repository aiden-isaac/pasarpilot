# Jarlaxle bounded browser lifecycle benchmark

## Status

**GO for a bounded, single-slot fixture scheduler next.** Both matched primary arms passed, including clean persistence, resource/reclamation and recovery gates. This does not authorise Facebook automation or establish real Messenger reliability. Implementation and conditional modes are complete; final scoped cleanup is recorded at the end of this report.

Measured on 2026-10-27, after the owner-approved Minecraft stop on 2026-10-26. [Capacity and latency projections](bounded-browser-capacity.md) and the [complete sanitised 864-scenario matrix](bounded-browser-capacity.csv) separate calculated demand from measured fixture behaviour.

| Experiment question | Evidence-based answer |
| --- | --- |
| Is rotation viable on Jarlaxle? | Yes for the controlled fixture: 100/100 fresh-process visits passed across three profiles. |
| Memory per session? | Rotation kernel peak 281.55 MiB; resident control peak 418.45 MiB. Use a conservative calibrated 576 MiB fixture allowance, not these peaks as fixed RAM promises. |
| Is memory reclaimed? | Yes: zero surviving attempts, 13.50 MiB available-memory deterioration after rotation versus the 256 MiB tolerance; anonymous difference +1.27 MiB. |
| Restoration cost? | Worker launch median 707 ms; fixture/auth/storage readiness median 126 ms; complete occupied visit mean 2.316 seconds. |
| Persistence reliable over repeated cycles? | All 100 clean rotation assertions passed without reseeding. Five crashes restored previously cleanly flushed state; unfinished writes remain outside the guarantee. |
| How many workers fit? | Four concurrent isolated workers passed three short batches with Minecraft stopped. Only one slot completed the 100-visit protocol; sustained two/four-slot reliability is unverified. |
| Achievable freshness? | One-slot calculated 70% capacity 1,088 fixture checks/hour; five sellers/15 minutes use 1.3% raw utilisation. Polling still adds interval residual delay; see the complete arrival/queue model. |
| What should follow? | A single-host, single-slot durable fixture scheduler with profile fencing, job coalescing/backpressure and browser-free event consumption; no Facebook integration yet. |

## Pre-stop baseline

Captured 2026-10-26T14:35:59.815615+00:00 on Jarlaxle over 60.1 seconds (61 samples).

- Usable RAM: 7.099 GiB.
- MemAvailable: minimum 3.891 GiB; median 3.903 GiB.
- Swap occupied: 82.1 MiB.
- Swap counters: +0 pages in, +0 pages out over the sample.
- CPU: 12 logical threads, Ryzen 5 5500U (hardware revalidated in preparation).
- Last memory PSI: `some avg10=0.00 avg60=0.00 avg300=0.00 total=31231094; full avg10=0.00 avg60=0.00 avg300=0.00 total=29129936`.
- Minecraft Java RSS: 2.458 GiB; PSS: 2.454 GiB; owning cgroup: 2.453 GiB. These are alternative accounting views, not additive.
- Minecraft identified through its working directory, Java process, cgroup and previously verified tmux controller. No environment, command-line secrets or console history captured.
- Docker and Podman unavailable on the SSH user's PATH. Passwordless sudo unavailable. Ubuntu restricts ordinary unprivileged namespace creation; runtime sandbox compatibility must be verified before any browser launch.

At this pre-stop stage, browser execution was gated on owner approval, verified shutdown, refreshed baselines, runtime support and admission. The approval and subsequent measurements are recorded below. Raw samples remain outside the repository.

## Authorised Minecraft shutdown

The owner explicitly approved a graceful stop in this implementation session. The verified Minecraft console received only its normal `stop` command. Java exited without force; no Minecraft Java process remained on verification. The server log was checked only for normal shutdown/world-save markers; no console content or player information was copied. No data deletion, configuration edit, restart-policy change or unrelated service stop was performed. Minecraft remains stopped at the owner's request while preparation continues.

## Post-stop baseline

Measured over 60.5 seconds (61 samples) after the approved shutdown. No Minecraft Java process appeared in any sample.

- MemAvailable: minimum 6.298 GiB; median 6.344 GiB.
- Swap occupied: 82.1 MiB; live counter deltas: 5 pages in, 0 pages out.
- Last memory PSI: `some avg10=0.00 avg60=0.00 avg300=0.00 total=31231094; full avg10=0.00 avg60=0.00 avg300=0.00 total=29129937`.

This is measured post-stop availability, not a browser allowance. Runtime/fixture overhead, the host safety reserve and the future-service reserve still need subtracting. Browser measurements were taken only after runtime setup and the warmed baseline below.

## Runtime preparation

The owner installed Podman. Read-only checks confirmed Podman 4.9.3, rootless operation, the systemd cgroup manager, cgroup v2 and seccomp support. At this prerequisite stage the runtime was compatible; the later admitted smoke/pilot verified Chromium sandbox operation. A SHA256-verified official Node.js 22.23.4 toolchain was installed under the user's dedicated benchmark toolchain directory without sudo or changes to system services. `benchmark/runtime-check.sh` records the repeatable prerequisites.

## Lifecycle smoke verification

Two controlled visits in a separate smoke dataset passed on Jarlaxle: the second fresh Chromium process restored the same synthetic cookie, local storage and IndexedDB, and the committed counter advanced from 0 to 1. Chromium's own status reported Layer 1 Namespace, PID and network namespaces, and Seccomp-BPF enabled. Both containers were verified stopped before releasing ownership. This is not the primary 100-visit comparison.

Preparation failures were retained locally: a legacy seccomp clone3 error, a missing writable ephemeral HOME, a chroot rule incompatible with dropping all container capabilities, a sandbox-status label mismatch, and forwarded host-only proxy settings. Fixes retained the default-deny syscall filter, all-capabilities-dropped runtime, non-root execution, read-only root filesystem and internal-only networking. The explicit chroot allowance enables Chromium's own empty-root sandbox; clone3 is denied with ENOSYS for libc fallback. No unsandboxed browser was used. Startup failure samples showed no OOM events; those samples are not full-session memory estimates.

## Ownership and recovery validation

A complete 13-case live synthetic suite passed: seed/clean flush, five forced attempt crashes, restoration after the fifth crash, duplicate/expired ownership rejection, cancellation, locked-history recovery, expired-authentication recovery, uncertain/stale action rejection, and supervisor reconciliation with a surviving attempt. No cross-tenant browser contexts were shared. Reconciliation fences the old lease before stopping its labelled container, verifies termination, and only then allows a new generation. An unlock race on rejected stale-state acquisition was fixed and regression-tested.

Crash durability is deliberately limited to previously flushed state. An earlier preflight injected a crash immediately after initial authentication and found the cookie had not reached durable storage; that failed fixture dataset was retained. The passing suite first establishes state by clean shutdown, then verifies it across crashes without claiming that localStorage or a fresh authentication response is an immediate disk-flush guarantee. This limitation remains relevant to real account recovery.

## Admitted single-slot pilot

The six-visit instrumented pilot completed across all three primary synthetic profiles. The measured whole-attempt cgroup peak was 384,602,112 bytes (366.8 MiB), yielding a minimum 125%-headroom allowance rounded to 512 MiB. Both primary arms will retain the same conservative 2 GiB hard cap to avoid biasing the continuous control through an aggressively reduced cap. Optional concurrency will be recalibrated from completed primary-arm peaks. Final resource counters are captured after Chromium closes but before the container exits, and the host independently verifies termination.

The primary comparison declares a five-second start-to-start cadence, with overruns recorded. This accelerates the controlled lifecycle experiment; it does not simulate Facebook traffic or establish production monitoring latency. The five-minute continuous-browser idle and post-shutdown observation windows remain unchanged.

## Primary arm A — continuous control

Run `continuous-1793085277671`, source `fd98838`, immutable image `499bbd2a8b04cb208b51fd584108894c000b4424a604c73780e5be3ce38fa34e`. All 100 planned visits succeeded on their first attempt; zero retries, failures or excluded warm-ups. Four targets and 400 synthetic items per visit, five-second cadence, one resident profile, then five minutes idle. Total wall time: 795.8 seconds.

- Whole-attempt cgroup peak: **418.45 MiB**, with a 2 GiB hard cap; no OOM/max events.
- Cgroup memory median/p95: 355.21/400.09 MiB; five-minute idle median/p95: 345.44/377.42 MiB.
- Per-inspection occupied time median/p95/max: 307/349/1,851 ms. This excludes retained idle occupancy and final shutdown; it is not the service cost of rotating processes.
- One browser launch-to-ready: 718 ms. Authenticated fixture/storage readiness median/p95: 72/77 ms; subsequent three-target inspection median/p95: 227/256 ms.
- CPU: 76.26 core-seconds; throttled time: 2.71 seconds, including idle and shutdown. Host swap-in/out: zero pages; maximum memory PSI full avg10: zero.
- Sampled memory-time: approximately 284,554 MiB-seconds across 794.46 observed seconds, including the additional idle segment. This is trapezoidal sample integration, not exact physical-memory accounting.
- Profile allocated bytes increased from 7,352,320 to 12,025,856 across the three existing pilot profiles.

The host independently verified container/process termination before profile release. Its five-minute cleanup sample passed before the fresh baseline and arm B. Process RSS and PSS are diagnostic views (median summed RSS 1,211.61 MiB; summed PSS 588.64 MiB), not values to add to cgroup memory: shared image/library pages can be charged to other cgroups. No inaccessible process samples occurred.

## Primary arm B — fresh-process rotation

Run `rotation-1793086469923` used the same `fd98838` source/image, four-target workload, five-second cadence and 2 GiB cap as arm A, after A's verified shutdown, five-minute settled sample and fresh 60-second baseline. All 100 planned visits succeeded on the first attempt, with zero retries, failures or excluded warm-ups: 34/33/33 visits across the three profiles. Profiles were seeded in the separate pilot and never reseeded during either primary arm.

- Total wall time: **497.31 seconds**; 100 fresh containers, each verified stopped before release.
- Whole-attempt cgroup peak: **281.55 MiB**; zero OOM/max events. The larger continuous-arm peak governs later headroom calibration.
- Complete occupied-slot duration mean/median/p95/max: **2.316/2.315/2.357/2.374 seconds**, including launch, restoration, extraction, durable observation, shutdown and ownership release.
- Worker Chromium launch-to-ready median/p95: 707/723 ms; fixture/storage restoration: 126/141 ms; inspection: 223/254 ms; observation flush: 5.8/7.2 ms; verified shutdown/release: 496/514 ms. Container creation and supervisory work account for the remaining occupied time.
- CPU: 277.22 core-seconds; throttled time: 61.24 seconds under the unchanged two-CPU cap. Rotation saved resident memory while using more CPU/startup work than the continuous control.
- Host minimum MemAvailable: 6,067.91 MiB; no swap-in/out; maximum memory PSI full avg10: zero.
- Allocated profile data increased by 2.24 MiB to 13.71 MiB across three profiles.
- Three transient process-read races occurred during teardown; whole-cgroup kernel peak/CPU accounting remained available for every attempt. RSS/PSS diagnostics are not substituted for that accounting.

The raw sampled memory integral covers 126.15 seconds between live cgroup samples and is approximately 26,357 MiB-seconds. Startup/teardown sampling gaps must be bounded and disclosed before comparison; it is not a complete 497-second time integral. The subsequent five-minute settled sample passed as detailed below.

## Separate final recovery suite

All **16 cases passed** in the post-primary suite (`faults-1793087304794`), including five injected attempt crashes and restoration after the fifth crash. This separate denominator does not alter either primary arm's 100/100 first-attempt result. History/authentication failure now explicitly closes capacity, records `reauth-required`, and resumes only through a separate explicit fixture-recovery session. Duplicate-profile/expired-owner rejection, cancellation, stale/uncertain actions and supervisor fencing also passed.

A deliberately suspended worker could not answer graceful close. The supervisor hit the 15-second close deadline, performed bounded container termination, verified absence, then reopened the committed profile in the next case. Container stop is asynchronous so host pressure checks and heartbeat renewal continue while waiting. Forced-cleanup reason and elapsed case time are retained in the protected aggregate fault record. This tests a frozen worker in addition to abrupt crashes; it does not guarantee durability of unfinished browser writes.

## Reclamation and memory-time

Both five-minute cleanup windows contain 301 samples over at least 300 seconds. The permitted available-memory deterioration was `max(256 MiB, 10% of the 2 GiB cap) = 256 MiB`.

| Host median | Before A | Settled after A | Before B | Settled after B |
| --- | ---: | ---: | ---: | ---: |
| MemAvailable, MiB | 6,384.37 | 6,392.89 | 6,391.96 | 6,378.46 |
| Anonymous pages, MiB | 148.64 | 155.88 | 155.77 | 157.04 |
| File cache, MiB | 5,088.91 | 4,989.97 | 4,990.05 | 4,999.27 |

Available-memory deterioration was **none after A** and **13.50 MiB after B**. Anonymous differences were +7.24/+1.27 MiB, with no sustained residual growth or surviving browser cgroup. Both passed. Settled swap-out and PSI full averages were zero; A's settled window read in three old swapped pages, without swap-out. Existing occupied swap remained 80.86 MiB. Reclaimable file cache is not a browser leak.

Rotation per-visit kernel peak median/p95/max was 278.99/280.55/281.55 MiB. Median peaks across successive 25-visit batches were 278.72, 279.07, 279.01 and 279.18 MiB: no accumulating live browser footprint. All 100 attempts retained kernel peak, hard-limit, swap and CPU accounting; three transient process-read gaps affected only RSS/PSS diagnostics. Cgroup anon/file/kernel medians were 226.55/9.86/18.41 MiB for rotation and 318.23/17.02/19.51 MiB for the resident control. Categories overlap at subcategory level (for example shmem within file); do not sum diagnostic categories indiscriminately.

At one-second resolution, trapezoidal integration covers 794.46 continuous seconds but only 126.15 rotated seconds between live samples. Instead of hiding startup gaps, bound each rotated visit by its whole-attempt **kernel peak × complete occupied duration**. The sum is at most **64,584 MiB-seconds**, including the unobserved startup/teardown gaps; the sampled partial integral is 26,357 MiB-seconds. Over the same first 497.31 wall seconds the continuous arm's sampled integral is approximately **180,265 MiB-seconds**. Rotation's conservative upper bound is 35.8% of that observed control cost. The extra 300-second continuous idle window is reported separately, not used to inflate this matched comparison. These are cgroup memory-time estimates/bounds, not total-host energy or unique-PSS accounting.

The five-second paced rotation completed **723.9 checks/hour** in the experiment. Back-to-back raw/70% capacity calculated from complete occupied time is about **1,555/1,088 checks/hour**, not a measured sustained zero-cadence run. All results are for the tiny synthetic fixture.

## Conditional concurrency

Admission recalibrated from the larger primary peak: `ceil(418.45 MiB × 1.25 / 64 MiB) × 64 MiB = 576 MiB` per slot, never reducing isolation. Two-slot aggregate allowance 1,152 MiB fitted the 3.67 GiB warmed budget and live headroom. Three fresh-process batches (six visits, two distinct profiles in a separate dataset) passed persistence, sandbox, limits and verified termination. Maximum sampled aggregate cgroup memory was **559.35 MiB**; maximum individual kernel peak 282.57 MiB. Minimum host MemAvailable was 5,791.36 MiB, with PSI full avg10 zero and no OOM.

Two-slot batch work/cleanup cycles were 3.103, 2.968 and 3.046 seconds, excluding the explicitly added five-second sampling hold. These short batch timings can inform conservative capacity projections; they are not a sustained high-concurrency benchmark.

After the safe two-slot result, four slots independently passed admission: **2,304 MiB** total allowance within the same reserve policy. Three batches completed 12 visits across four distinct synthetic profiles, with the fourth identity/profile outside the primary dataset. Maximum sampled aggregate memory was **1,123.18 MiB**, maximum individual kernel peak 285.02 MiB, and minimum host MemAvailable 5,128.56 MiB. PSI full avg10 remained zero. Work/cleanup batch cycles were 4.997, 4.689 and 4.837 seconds after excluding the sampling hold.

Thus **four concurrent isolated workers were safely exercised with Minecraft stopped**, not four workers proven at sustained production load. The measured mean batch cycle grew from 3.039 seconds at two slots to 4.841 seconds at four. Do not advertise fourfold scaling or reuse this budget after Minecraft/other services return without a fresh baseline and live admission.

## Temporary interactive mode

Final run `interactive-1793089005472` passed all seven checks with 15-second static-display sampling windows: clean headless release, exclusive same-profile handoff, one real noVNC viewer, a concurrent background visit using another profile, explicit release, accelerated three-second inactivity/deadline shutdowns, and return to headless with persisted identity/storage. The deadline tests use the harness timer; no production idle detector or access gateway was built.

| Server mode, same synthetic fixture | Median cgroup current | Maximum current in window |
| --- | ---: | ---: |
| Headless Chromium | 271.35 MiB | 276.43 MiB |
| Headed Chromium + private Xvfb | 294.78 MiB | 300.53 MiB |
| Plus noVNC/VNC, zero viewers | 322.89 MiB | 323.14 MiB |
| Plus one connected viewer | 335.92 MiB | 337.05 MiB |

The real [noVNC browser client](https://github.com/novnc/noVNC/blob/master/docs/EMBEDDING.md) runs in a **separate capped container/cgroup with no seller profile**. Its median/peak memory was 285.12/293.98 MiB; that client cost normally resides on the seller's device and is not included in the server column. It joins the display's network namespace only to reach loopback VNC/WebSocket listeners; no ports are published. The server kernel peak was 338.74 MiB, and the separate concurrent background browser peaked at 285.88 MiB. All three containers were admitted: 2 GiB server + 576 MiB client + 576 MiB background = 3.125 GiB, below the warmed 3.67 GiB budget. Minimum host MemAvailable was 5,431.77 MiB, PSI full avg10 zero, swap-out zero, and no OOM/PID-limit events occurred. Server and client each retained the 256-task/thread cap.

Measured start-to-ready: headless 1.429/1.442 seconds; headed 1.670–1.685 seconds. Verified stop/release took 448–479 ms for single-session cases; releasing the viewer/background/server group took 1.314 seconds. A display is started only for headed mode and is fully removed at session termination. Headless-to-headed requires closing/reopening the profile; viewing is not switched onto an existing headless browser in place. An unwatched headed browser still consumes Chromium, Xvfb and optional VNC memory.

Retained failed optional preflights identified HTTP-only package mirror rejection, `xvfb-run` waiting as PID 1, a missing Xauthority environment for VNC, and the combined browser/client hitting a 256-task cap. HTTPS signed package sources, Podman's init process, a fixed ephemeral Xauthority path and separate viewer accounting corrected these issues. Two earlier passing combined-process trials are superseded by the final separate-cgroup measurement; none belong to primary clean-visit denominators. Optional image ID: `04a53ad64c16539e84c0f1211f8fdd06ebb9f98574dafbbb028b0299c583bc53`; packages: noVNC 1.3.0-2, x11vnc 0.9.16-10, websockify 0.10.0+dfsg1-5build2. The optional image adds these packages to the pinned Chromium image; results compare deployed modes, not a browser-only microbenchmark.

The temporary VNC password is generated for the fixture run, redacted from diagnostics, and deleted after verified shutdown. This loopback-only experiment is not a production remote-access authentication/TLS design. Static short windows do not establish scrolling/video bandwidth, simultaneous premium-seller capacity or long-lived interactive reliability.


## Protocol, software and startup accounting

Host: Jarlaxle, Ubuntu 24.04.5, kernel 6.8.0-146-generic, Ryzen 5 5500U with 12 logical threads, 7.099 GiB usable RAM. Podman 4.9.3 runs rootless with systemd/cgroup v2. Host driver Node 22.23.4; image Node 24.22.1; Playwright 1.64.1; pinned package Chromium revision 1248, Chrome for Testing 156.0.8078.4. The actual primary image digest and source revision are recorded with each run above. New processes reused warm OS/image caches; no genuinely cold-cache experiment, cache eviction, host sysctl or swap tuning occurred.

The warmed primary-A baseline had median MemAvailable 6,384.37 MiB. Its minimum minus the 1,090.40 MiB host guard and 1,536 MiB future-service reserve admitted a 3.662 GiB pool budget; the fresh B budget was 3.666 GiB. The earlier post-Minecraft-stop median was about 6.344 GiB. The later roughly 112 MiB availability difference includes fixture/runtime/tooling and host noise, not an isolated runtime-overhead measurement. The future application/database was not deployed; that reserve is policy, not measured PostgreSQL usage.

Every primary attempt had a dedicated memory/CPU/swap-limited cgroup, peak accounting and verified termination. Last pre-ready startup samples were retained at 250 ms resolution: continuous launch current/observed peak 238.69/242.92 MiB; rotation median/max current 242.56/246.60 MiB and maximum observed startup peak 256.96 MiB. A final fraction of startup can occur after that last sample, so **whole-attempt kernel peaks**, not those startup samples, govern admission. One-second samples plus lifecycle boundaries captured the rest; startup integration gaps are bounded explicitly above. CPU figures are summed per-attempt cgroup core-seconds, not percent of a single core. Mean whole-host CPU busy was 1.25% during A and 6.74% during B across 12 logical threads, with the stated two-CPU limit on each attempt.

## Decision gates

| Mandatory gate | Result |
| --- | --- |
| Owner-approved Minecraft stop, verified exit, real pre/post/warmed baselines | PASS; no unrelated service stop or server-data/configuration change |
| Matched primary workload/software/cadence/caps | PASS; four targets, 400 synthetic items, five-second cadence, identical primary image and source, 2 GiB cap, two CPUs, no browser swap |
| At least 100 completed clean visits per arm | PASS; A 100, B 100 (34/33/33 profiles) |
| At least 99% first-attempt success | PASS; 100/100 first attempts in each arm; zero retries or excluded warm-ups |
| No observed isolation/ownership violations, no silent reseeding | PASS; identities/storage checked on every visit and duplicate/stale actors rejected |
| Five committed-state crash recoveries and other declared recovery cases | PASS; all 16 final cases, including a 32.314-second complete hung-worker case within the 40-second bound |
| Resource controls/accounting, no OOM/pressure breach | PASS; whole-attempt peaks/CPU available; swap-out and PSI full zero in primary arms; three disclosed transient RSS/PSS read gaps |
| Complete termination and acceptable settled residual memory | PASS; 301 samples per five-minute window; no browsers survive; both drifts within 256 MiB |
| Five active sellers every 15 minutes within one-slot 70% budget | PASS; 20 checks/hour required versus approximately 1,088 budgeted |

**Decision: GO for the next bounded fixture change, at one slot.** No mandatory gate produced NO-GO or INCONCLUSIVE. Optional two/four-slot and interaction results support feasibility only within their short measured windows. A hundred successes are not statistical proof of a production 99% SLA. Earlier environment, locking and optional-display failures are retained and described; they were not removed from a primary run or relabelled as clean successes.

## Verification and remaining risks

Final TypeScript check and all **14 automated tests passed**, covering fixture identity/history/action state, storage paths, ownership/fencing, durable observations, resource admission/pressure and capacity/latency arithmetic. OpenSpec strict validation passed. The live primary comparison passed 200/200 planned visits; the final recovery suite passed 16/16 cases; two/four-slot modes passed three batches each; final interactive mode passed seven lifecycle checks. The host CLI generated all 864 capacity rows and matched the independent local calculation exactly. There is no separate configured linter; `git diff --check` checks formatting. Preflight failures are preserved as evidence rather than reported as currently passing tests.

Authentication fixture success does not establish Facebook cookies, encryption-key/key-store compatibility, Messenger history recovery, service-worker state or anti-abuse outcomes. A fresh cookie was lost when an early preflight crashed immediately after login: confirm connection only after a clean persistence boundary and retain explicit recovery paths. No real account, private Facebook conversation, payment, AI inference or outgoing platform message was used. Meta authorisation remains an unresolved release gate; seller consent alone does not grant it. Polling cannot guarantee recovery of deleted or inaccessible events.

Profiles are protected with owner-only permissions, tenant-specific mounts and sandboxed attempt containers, not a production encryption/key-management or tenant access-control system. A privileged host operator can access authenticated profiles; central hosting carries that account-session exposure. No CDP/VNC/container-management endpoints are published. The temporary loopback VNC mechanism is not a public access gateway; production identity checks, transport protection, revocation and secure-deletion policy remain future work. Local locks/files and flushed ledgers demonstrate one-host boundaries, not PostgreSQL transactions or distributed lease guarantees.

The timing/space footprint of four tiny fixture pages is not representative of Facebook media, history replay or arbitrary listing counts. High-concurrency tests contain only three batches, and interactive tests use a static display for 15 seconds per mode. Long-duration contention, disk growth with real profiles, visual activity/bandwidth, seller-side browser behaviour and subscription economics remain unverified. Returning Minecraft or other workloads invalidates the tested capacity envelope until a new baseline/admission calculation.

## Recommended next OpenSpec change

Propose `schedule-bounded-fixture-visits`: deploy the smallest single-host durable queue (evaluate pg-boss with actual PostgreSQL overhead against the reserved 1.5 GiB), keep one admitted browser slot initially, preserve tenant flock/generation fencing through verified termination, coalesce duplicate due visits, apply timeouts/backpressure and deterministic fair scheduling, and consume observations after releasing Chromium. Exercise cancellation, stale jobs, restart reconciliation, unavailable sessions and an uncertain outgoing **fixture** action. Record runtime/queue metrics before expanding concurrency.

Keep profiles at rest, create a fresh tenant process per visit, and keep business/optional AI processing outside browser occupancy. Temporary authentication/recovery can use an exclusively admitted headed session later; normal dashboard monitoring needs no permanent desktop. Do not include production Facebook, negotiation, inventory, OpenRouter, billing, multi-host scheduling or a full dashboard in that next change. Four workers and premium concurrency should remain opt-in experiments until longer representative measurements justify them. No OpenSpec main spec was rewritten or change archived automatically.


## Final cleanup and retained artifacts

Cleanup verified on Jarlaxle after all measurements: the only remaining labelled container was the fixture (31.18 MiB cgroup current at the pre-cleanup sample). It was gracefully stopped and removed, then the labelled private network was removed without force. **Zero experiment containers remain, no host listeners on 5900/6080 remain, and the supervisor plus all three primary profile locks are free.** Every browser/display/viewer container was already gone. Final MemAvailable snapshot: 6,371.59 MiB; this is a snapshot, not another settled benchmark. Minecraft remains stopped; no automatic restoration, world/configuration change, unrelated service stop or global image/volume prune occurred.

Retained on Jarlaxle under `/home/aiden/.local/share/pasarpilot-benchmark/`:

- `data/` (75.79 MiB allocated): synthetic profiles, leases, normalised observations, raw metrics, failed preflight diagnostics, the pre/post-Minecraft samples, paired primary baselines, settled windows, capacity model and `runs/cleanup.json`. Root/profile directories are owner-only; result files are restricted. Fixture server-side synthetic sessions were destroyed by its shutdown; no real account credentials exist here.
- `workspace/` (18.80 MiB allocated): reproducible sources, compiled harness and locked Playwright packages.
- `toolchain/` (232.41 MiB allocated): user-scoped verified Node toolchain and installation artifacts; system Node/PATH was not replaced.
- Rootless images remain for review/reproduction. Logical image sizes are 2.38 GiB base and 2.64 GiB optional display; they share layers, so these are not additive physical disk consumption. Primary image identity remains recorded separately from the later extended harness image.

Raw local analysis copies are inside `/tmp/pasarpilot-results/` with owner-only directory access; the two original temporary host baseline files were tightened to mode 0600 and copied into the protected remote evidence directory. Repository artifacts contain only code, synthetic methodology, aggregates and derived projections. No profiles, tokens, VNC password, `.env` or personal Facebook data were committed.

Retention is **through owner review**, with no automatic deletion job. Only the selected experiment containers/network and one-time viewer secrets were removed. Do not broadly prune storage. After review, the owner can explicitly remove the dedicated synthetic data/toolchain/images; this change does not delete them automatically. A future rerun should use a fresh dataset after restarting the in-memory fixture, preserving this evidence rather than reseeding old profiles silently.

## Task and commit ledger

All 27 tasks are complete after the final cleanup commit, with no remaining tasks in this change. Production integrations and long-run workload validation are intentionally outside this experiment. The change remains open for review and was not archived or squashed. The 27 implementation commits preserved pre-existing untracked skills, research and planning/configuration files. A subsequent documentation/publication update adds the sanitised UI research and approved OpenSpec artifacts so repository links work; local `.codex` tooling remains untracked.

The ledger below covers the 27 implementation commits, ending with `24c82e5`, which records task 7.4 cleanup. Later documentation/publication commits are separate from the experiment tasks. `git log --reverse ba0010a..24c82e5 --oneline` reproduces this implementation ledger.

| Commit | Message |
| --- | --- |
| `f83443a` | chore(benchmark): record Jarlaxle pre-stop resource baseline |
| `367400c` | chore(benchmark): record owner-approved graceful Minecraft shutdown |
| `08b0950` | chore(benchmark): measure Jarlaxle after Minecraft shutdown |
| `1cc20c3` | chore(benchmark): add pinned TypeScript and Playwright workspace |
| `fe88380` | feat(benchmark): add isolated synthetic trading fixture |
| `f57c88e` | chore(benchmark): verify rootless Podman prerequisites on Jarlaxle |
| `0a4fdc2` | feat(benchmark): protect profiles and isolate the fixture network |
| `20572b4` | feat(benchmark): capture warmed baseline and declare resource envelope |
| `4ab2520` | feat(browser): enforce exclusive persistent profile ownership |
| `b227407` | feat(benchmark): persist observations outside the browser lifecycle |
| `80649cf` | feat(browser): verify sandboxed persistent Chromium lifecycle on Jarlaxle |
| `4e40f07` | fix(browser): fence stale owners and reconcile surviving attempts safely |
| `8a3af9a` | feat(benchmark): collect whole-attempt resources and lifecycle timings |
| `3ff893b` | test(benchmark): verify memory admission and pressure abort policies |
| `a08f038` | test(browser): add controlled crash recovery and fencing scenarios |
| `fd98838` | test(benchmark): validate single-slot pilot and calibrate primary limits |
| `2a8bb3d` | test(benchmark): complete 100-visit continuous control on Jarlaxle |
| `12d9520` | test(benchmark): complete 100 isolated profile rotations on Jarlaxle |
| `60b648b` | test(browser): verify crash recovery and bounded hung-worker cleanup |
| `15ee19f` | docs(benchmark): verify settled reclamation and bound browser memory-time |
| `8d80f5c` | test(benchmark): admit and measure two isolated browser slots |
| `06f432e` | test(benchmark): verify four-profile concurrency within measured headroom |
| `bd21c23` | test(browser): measure isolated temporary display and noVNC access |
| `4184310` | docs(benchmark): calculate measured browser capacity and resource costs |
| `5f74a29` | feat(benchmark): model queue latency and bounded demand sensitivities |
| `c359235` | docs(benchmark): record fixture-only go decision and implementation evidence |
| `24c82e5` | chore(benchmark): verify scoped cleanup and retain experiment evidence |
