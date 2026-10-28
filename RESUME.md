# Resume seller usability acceptance

Continue approved OpenSpec change `seller-usability-and-operations`.
The implementation is on branch `feat/seller-usability-and-operations`, at
`e5018b9` before this handoff document. There are 33 implementation commits.
Do not restart implementation: 30 of 32 tasks are complete.

## Read first

1. Applicable `AGENTS.md` and the installed `openspec-apply-change` skill.
2. All artifacts in `openspec/changes/seller-usability-and-operations/`.
3. `docs/research/seller-usability-acceptance.md` for final results and commits.
4. `docs/operations/seller-workspace.md` for exact setup/recovery procedures.
5. `docs/research/seller-usability-baseline.md` for detailed failed/passed attempts.

The approved proposal/design/specs, `tasks.md` and this handoff document are
included in Git by the handoff documentation commit. Project `.codex/` remains
untracked and will not arrive through Git clone/pull. Verify required skills on
the destination; review selected skill files separately from machine-specific
configuration. Do not copy Codex authentication/session
stores, `.env`, browser profiles, cookies, database volumes or private invitations
as part of a repository sync. Authenticate Codex on the destination normally.

## Remaining work

### 7.7 — failed/incomplete resource acceptance

On Jarlaxle, all 240 planned synthetic sales passed over the full 60-minute
schedule (120 per seller). There were 240 stock commitments, zero stock
violations, and the inbox/holds/queue drained. During the first settled window,
host swap-out increased by one 4,096-byte page. The runner stopped as required.
Only 89 seconds of that window were collected; neither required five-minute
window completed. Do not report a successful full soak.

Inspect existing resource samples and current host activity before another run;
the cause of the host-wide swap increment was not established. Verify hostname,
user, dataset ownership/container labels, actual resource headroom and current
service state. Do not infer an application leak or change thresholds from the
single swap increment. Use a fresh explicitly owned disposable dataset/output
for a new run, retaining old evidence. Plan roughly 85–90 minutes plus setup/
diagnosis for the baseline, 60-minute workload, expiry-job drain and two windows.

The finite runner is `benchmark/src/trading/operations.ts`; commands and budgets
are in the operator guide. Keep two seller streams, all 240 outcomes in the
denominator, 768MiB/no-swap/one-CPU database cap, 1.5GiB app+DB allowance, existing
host/pressure guards, no host swap-out growth, and bounded disk/evidence.
Run browser-free tests without introducing a browser dependency. Do not overlap
the next isolated resource run with browser tests or other benchmark workloads.

### 8.1 — native assistive-technology verification incomplete

Security, tenant isolation, CSRF/origin, stale-version, escaping, private-log,
keyboard, contrast, responsive, light/dark, reduced-motion and no-JS checks pass.
A native screen reader was unavailable. Accessibility-tree checks are not a
listening pass. Native browser-toolbar zoom was not exercised; text enlargement,
zoom-equivalent layout and 320px reflow were checked. Complete the missing manual
checks in a usable browser/screen-reader environment, potentially on the user's
desktop. Moving to a headless SSH host does not itself provide that environment.

If changing UI, load the installed apple-design guidance first and inspect actual
renders. The prior environment used `apple-design-mcp` HIG references; there was
no standalone apple-design `SKILL.md`. Verify destination tool availability.

### Blocked subcheck recorded under completed 8.3

The final prepared-host fixture recovery suite was not rerun: Jarlaxle name
resolution failed before preparation. The historical 16-case pass is not a
current result. Once reachable, follow `benchmark/README.md` unchanged: establish
Minecraft/process ownership, obtain approval only if a service stop is genuinely
required, verify rootless Podman/cgroup/sandbox and fresh admission, then run the
existing fixture suite on a new owned idle dataset. Never substitute an unprepared
host or disable sandbox/admission to obtain a pass.

## Evidence and environment

Protected evidence parent on each machine:
`/home/aiden/.local/share/pasarpilot-usability/`.

- Jarlaxle: `operations-clean-01/evidence/clean-01/` has `summary.json`,
  `events.jsonl` and `post-abort.json`; prior growth attempts are
  `operations-growth-01`, `-02`, `-03`; initial smoke is `operations-task23`.
- Kano: `operations-growth-kano-01` passed 2,000 sales and both 250/1,000-order
  checkpoints. This is functional growth evidence, not Jarlaxle capacity proof;
  a separate browser regression overlapped its end.
- Kano: `operations-local-v2-20261028/evidence/backup-*` and
  `restore-proof-01/02/03` retain current/legacy restore proof and failed attempts.
- Screenshots and final regression outputs remain private on Kano; locations are
  indexed in the acceptance report. Do not commit or publicly publish raw data.

Jarlaxle previously had rootless Podman and Node 22.23.4 at
`/home/aiden/.local/share/pasarpilot-benchmark/toolchain/node-v22.23.4-linux-x64/bin/node`.
Verify these paths and current state; do not assume they remain available.
Source/runtime copies under `runtime-task*` are historical test copies, not the
canonical new checkout. Do not overwrite them or reuse their source accidentally.

Completed local test databases were stopped with data retained. Last remote
cleanup could not be verified after loss of connectivity. Check before starting
additional containers. The separate Kano demo was left on `127.0.0.1:8787` using
`demo-20261028`; verify its PID file/process/environment before signalling it.
Do not signal a historical PID or operate the demonstration as a fault dataset.

## Validation already passed

TypeScript; 19 benchmark units; 7 trading units; 3 scheduler PostgreSQL tests;
36 trading database tests; 11 dashboard/browser tests; 12 operational TAP tests
(including nested parents); streamed current-schema and legacy v1/v2 separate
restore/upgrade proof. A final checklist-only presentation fix additionally
passed four onboarding/desktop/mobile/no-JS checks. Strict OpenSpec validation and
diff checks pass. Use relevant checks after new changes; do not discard histories
or widen pagination to make a test find an old fixture.

## Constraints that remain in force

- Preserve deterministic trading rules, tenant boundaries, stock locks, manual
  payment verification, durable audit/retries and browser/scheduler isolation.
- Do not relax guards, change host settings, stop Minecraft/unrelated services,
  expose listeners publicly, reseed existing data, prune volumes or delete audit.
- Do not add live Facebook/Messenger, AI, WTB, billing or banking integration.
  Meta authorization remains unresolved; this handoff does not authorize it.
- Update a task checkbox only when fully satisfied. Commit task-related changes
  atomically with Conventional Commits. No push, rebase, squash or automatic archive.
- Keep only one active writer to a checkout; inspect Git status and current
  services before actions. A fresh Codex session should use this file as context,
  not assume the previous conversation or local tools were transferred.
