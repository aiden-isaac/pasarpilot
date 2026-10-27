# Controlled browser lifecycle benchmark

This workspace implements only the synthetic experiment in
`openspec/changes/benchmark-bounded-browser-lifecycle/`. No Facebook, AI or trading integration.

Use Node.js 20 or newer, then `npm ci`, `npm run check`, `npm test` from this directory.
Dependencies are exactly pinned in the lockfile. Browser installation is separate from dependency installation.
The browser image must match Playwright 1.64.1; container/runtime setup is explicit, not performed by npm scripts.

Before remote browser execution: obtain owner approval for any Minecraft stop, verify graceful exit,
collect pre/post-stop and warmed baselines, and verify container limits and non-root Chromium sandboxing.
Start with one slot. No result from unit tests constitutes a browser benchmark or a GO decision.

Runtime/data commands will be documented with their implementation. Raw outputs and browser profiles
must remain protected and outside version control; publish only aggregate synthetic findings.

`sh runtime-check.sh` checks rootless Podman/cgroup prerequisites without a browser launch.
Build using `podman build --memory=1g --memory-swap=1g --cpu-quota=200000 --cpu-period=100000 -t localhost/pasarpilot-benchmark:v1 -f Containerfile .`
after compilation. `sh prepare-fixture.sh` creates only experiment-labelled resources: an internal
network and a non-root, 256 MiB-capped fixture container with no published ports. It prints the private
fixture origin for the run manifest. It refuses conflicting resources rather than replacing them.

`seccomp.json` is the pinned Playwright 1.64.1 Docker seccomp profile from
`https://github.com/microsoft/playwright/blob/v1.64.1/utils/docker/seccomp_profile.json`;
it retains the syscall filter while allowing Chromium's namespace sandbox. Never substitute an
unconfined seccomp profile, host networking or `--no-sandbox` when a capability check fails.
Compatibility additions deny `clone3` with ENOSYS (38), allowing modern libc to fall back to the
profile's filtered `clone`, and allow `chroot` so Chromium can enter its namespace sandbox's empty
root. The container still drops all capabilities; kernel privilege checks still apply. Without the
explicit `chroot` rule, the profile's capability-conditional rule rejects this sandbox setup step.

Image builds copy only the two lockfile-installed Playwright runtime packages. Run `npm ci` before
building; there is no package-registry access from the build container. This also avoids inheriting
a host-only loopback HTTP proxy inside rootless build networking.
Browser and fixture runs explicitly disable Podman's host-proxy forwarding; traffic stays on the
internal fixture network. A writable ephemeral HOME is provided inside the capped tmpfs for Chromium
runtime files; the selected persistent profile is the only seller state mounted into the container.

After the authorised Minecraft shutdown and fixture setup, run:

```
BENCH_REVISION=<source-commit> node dist/src/cli.js baseline /absolute/private/data
```

This records a 60-second warmed baseline and a protected manifest with the minimum observed
MemAvailable minus the host safety reserve and 1.5 GiB future-service reserve. It refuses a running
Minecraft workload. Initial browser admission additionally requires 2 GiB; swap is not capacity.

The optional final baseline argument declares cadence in milliseconds (default 60000). Primary arms
must use that declared cadence: `node dist/src/cli.js continuous DATA 100 CADENCE_MS` then `rotation`
with the same parameters. `pilot DATA 3 0` is a separate three-profile instrumentation check.
`settle DATA` collects a five-minute post-shutdown sample. Arm A includes a five-minute idle segment.
Use a freshly captured baseline after runtime changes; never interpret fixture timings as Facebook latency.
