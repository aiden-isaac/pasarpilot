# Bounded browser lifecycle implementation evidence

## Status

Implementation in progress. Both 100-visit primary arms have completed; final reclamation and optional-mode/capacity gates remain pending. Host and fixture results below are measurements, not Facebook capacity.

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

The owner must explicitly authorise the graceful Minecraft stop; browser execution remains gated on verified shutdown, a post-stop baseline, runtime support and admission checks. Raw local samples are retained outside the repository for analysis.

## Authorised Minecraft shutdown

The owner explicitly approved a graceful stop in this implementation session. The verified Minecraft console received only its normal `stop` command. Java exited without force; no Minecraft Java process remained on verification. The server log was checked only for normal shutdown/world-save markers; no console content or player information was copied. No data deletion, configuration edit, restart-policy change or unrelated service stop was performed. Minecraft remains stopped at the owner's request while preparation continues.

## Post-stop baseline

Measured over 60.5 seconds (61 samples) after the approved shutdown. No Minecraft Java process appeared in any sample.

- MemAvailable: minimum 6.298 GiB; median 6.344 GiB.
- Swap occupied: 82.1 MiB; live counter deltas: 5 pages in, 0 pages out.
- Last memory PSI: `some avg10=0.00 avg60=0.00 avg300=0.00 total=31231094; full avg10=0.00 avg60=0.00 avg300=0.00 total=29129937`.

This is measured post-stop availability, not a browser allowance. Runtime/fixture overhead, the host safety reserve and the future-service reserve still need subtracting. Browser startup/restoration/memory remain unmeasured.

## Runtime preparation

The owner installed Podman. Read-only checks confirmed Podman 4.9.3, rootless operation, the systemd cgroup manager, cgroup v2 and seccomp support. A compatible runtime exists; Chromium sandbox operation has not yet been proven. A SHA256-verified official Node.js 22.23.4 toolchain was installed under the user's dedicated benchmark toolchain directory without sudo or changes to system services. `benchmark/runtime-check.sh` records the repeatable prerequisites.

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

The host independently verified container/process termination before profile release. A five-minute post-cleanup sample is running before a fresh matched baseline and arm B. Process RSS and PSS are diagnostic views (median summed RSS 1,211.61 MiB; summed PSS 588.64 MiB), not values to add to cgroup memory: shared image/library pages can be charged to other cgroups. No inaccessible process samples occurred.

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

The raw sampled memory integral covers 126.15 seconds between live cgroup samples and is approximately 26,357 MiB-seconds. Startup/teardown sampling gaps must be bounded and disclosed before comparison; it is not a complete 497-second time integral. The final five-minute settled sample is pending.

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
