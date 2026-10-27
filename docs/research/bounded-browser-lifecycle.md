# Bounded browser lifecycle implementation evidence

## Status

Implementation in progress. No browser benchmark result exists yet. Measurements below are read-only host preparation evidence, not assumed browser capacity.

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
