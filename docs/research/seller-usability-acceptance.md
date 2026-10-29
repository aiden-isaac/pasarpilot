# Seller usability and operations acceptance

Change: `seller-usability-and-operations`; the implementation was merged to
`main` at `3cbe1d0`. Follow-up evidence is on local branch
`feat/seller-usability-acceptance-followup`. **30/32 tasks complete.** The change
is unarchived, with no follow-up push or production deployment. Implementation
details and evidence are in [the baseline ledger](seller-usability-baseline.md).

## Outcome and remaining gates

The seller workspace, onboarding, guarded transaction actions, bounded pages and
activity updates, repeatable RM10 guide, recovery fixes and operator handoff are
implemented. The prior final local automated suites passed, and the current
prepared-host fixture suite passed. Functional growth reaches
1,000 orders per seller on Kano. The homelab is **not operationally accepted**:

- **7.7 incomplete/failed:** all 240 scheduled sales passed on Jarlaxle over the
  full 60-minute transaction window, and backlog drained, but host swap-out grew
  by one 4,096-byte page during the first settled window. Both required five-minute
  windows are incomplete; their RSS-mean comparison is unavailable. Two further
  owned clean attempts stopped on the unchanged host swap-out gate after 100 and
  186 successful sales respectively. Neither reached settlement.
- **8.1 incomplete:** route/security, visual, semantic and tool-assisted keyboard
  checks pass; a native screen reader is unavailable. Native browser-toolbar
  zoom was not exercised; 200% text/zoom-equivalent and 320px reflow were tested.
- **Current fixture regression passed:** after Jarlaxle became reachable, the
  prepared-host suite passed all 16 cases on a new owned dataset under the
  unchanged rootless Podman, cgroup, sandbox and admission gates. Minecraft's
  server process was absent; no service stop was needed.

No guard was weakened, cache evicted, service tuned, unrelated workload stopped
or missing evidence replaced by an estimate.

## Implemented seller behavior

The existing TypeScript/PostgreSQL trading engine remains authoritative. The
workspace provides Overview, Inventory, WTS listings, Conversations, Orders &
history, Settings/help, contextual reviews and a guided demonstration. Independent
claim, hold, proposal/delivery, payment and fulfilment states have plain labels,
MYR totals, MYT deadlines and next actions. Screenshots/buyer claims remain
unverified; exact trusted receipt and actual handover require seller decisions.

Additive schema v3 separates display names/profile versions from credentials and
payment instructions, and backfills chronological orders. Onboarding derives six
facts from owned records; it does not deliver messages, verify payments or create
public accounts. Critical cancellation/completion/payment reviews are read-only
until explicit validated POST intent. Safe recovery preserves non-secret input,
stale versions and inspect-before-retry guidance.

Pages default to 25, cap at 100 plus one continuation row, and bind cursors to
seller/query scope. Detail children, long threads, timelines and instruction
snapshots are paged. Search/select reaches records beyond 200. Visible-tab checks
run every 10 seconds, one flight at a time, with hidden-tab pause and bounded
backoff; they preserve editing/focus/scroll and do not claim source completeness.
Stable demo event identities and source-row locking preserve ordering/replay.

Observed recovery fixes handle idle-pool errors, preserve the original error when
rollback also fails, give safe startup retry instructions and isolate optional
capture/per-seller failures from local expiry and healthy sellers. Browser
lifecycle isolation, scheduler bounds, tenant-qualified queries, stock locking,
claim/backup ordering, manual verification and durable transactional audit remain.
No Redis, new UI framework, microservice or external production integration was added.

## Design and rendered review

The installed Apple reference was the `apple-design-mcp` service at
`/home/aiden/.local/share/mcp/apple-design-mcp`, not a standalone `SKILL.md`.
Its README and HIG tools were used before frontend implementation, covering
[Layout](https://developer.apple.com/design/human-interface-guidelines/layout),
[Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars),
[Typography](https://developer.apple.com/design/human-interface-guidelines/typography),
[Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons),
[Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback),
[Motion](https://developer.apple.com/design/human-interface-guidelines/motion),
[Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
and [Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode).

Applied system typography, reusable spacing/color/surface tokens, restrained
surfaces, 44px controls, visible focus, skip navigation, responsive layout,
automatic light/dark appearance and reduced-motion behavior. Existing native
forms work without JavaScript. No external fonts or decorative UI dependency.

Actual Playwright/Brave renders were reviewed at 1280×800, 390×844, 360×800 and
320px reflow, including populated, empty, error, pending/uncertain and confirmation
states. Search no-results wording was corrected during review. Measured normal
text contrast exceeds 4.5:1 and control boundaries exceed 3:1 in both appearances.
Keyboard review reached search/settings and the native payment checkbox with
visible focus; the accessibility tree exposes labelled controls. No native
screen-reader listening pass is claimed.

The final retained-demo render also revealed a help link numbered as a seventh
item beneath the six-step progress count. It was moved outside the numbered
checklist; onboarding plus desktop/mobile/no-JS workflow follow-up checks pass
(4/4). No business rule or onboarding fact changed.

Inspect the app at **http://127.0.0.1:8787/login** using the private invitations;
follow [the operator guide](../operations/seller-workspace.md). Protected local
screenshots are outside Git under the usability evidence parent:
`test-20261028/final-acceptance/` and `test-20261028/manual-acceptance/`, including
`empty-desktop.png`, `keyboard-settings.png` and
`keyboard-payment-dark-mobile.png`. Chrome DevTools MCP could not connect;
the project Playwright fallback used sandboxed Brave and fresh contexts, without
inspecting Facebook or unrelated tabs.

## Automated validation

| Check | Final result |
| --- | --- |
| TypeScript | Passed |
| Existing benchmark units | 19/19 passed |
| Trading units | 7/7 passed |
| Scheduler PostgreSQL integration | 3/3 passed |
| Trading PostgreSQL integration | 36/36 passed |
| Dashboard/browser acceptance | 11/11 passed |
| Browser-free recovery/dependency/invariant TAP tests | 12/12 passed, including nested parent tests |
| Streamed current/legacy restore proof | Passed; separate v3, v1/v2 restore/upgrade cases |
| Current prepared-host fixture recovery | Passed: 16/16 cases on Jarlaxle, 2026-10-29 |
| Native screen reader | Unavailable, not performed |
| Strict OpenSpec / diff checks | Earlier pass retained; OpenSpec 1.15.0 now fails strict validation on 14 requirement-length warnings; Git diff check passes |

The final dashboard rerun corrected a test that assumed a newly created review
would be on the first bounded page; it now checks the exact source event/review.
An earlier local test attempt failed because its owned database had been stopped;
only that verified container was restarted, without reseeding. Failed attempts
are retained, not counted as passing runs. Local Node 20.20.2 is supported by the
package; installed npm 12 emits a Node-support warning while checks exit zero.
The remote operational runtime was Node 22.23.4. Dependencies remain pinned.

## Measured operations

| Observation | Jarlaxle clean run | Kano functional growth |
| --- | ---: | ---: |
| Planned / passed scenarios | 240 / 240 | 2,000 / 2,000 |
| Final completed orders per seller | 120 | 1,000 |
| Client read p95 | 8ms | 12ms |
| Mutation + redirect p95 | 37ms | 36ms |
| Synthetic visibility p95 | 77ms | 102ms |
| Maximum simultaneous app RSS + DB cgroup | 467,111,936 bytes | 648,200,192 bytes |
| Separate runner maximum RSS | 111,448,064 bytes | 127,823,872 bytes |
| Minimum host available memory | 5,884,911,616 bytes | 9,735,168,000 bytes |
| Resource samples / declared gaps | 4,616 / 0 | 252 / 0 |
| Database size growth | 7,151,616 bytes | 49,277,788 bytes |
| Overall resource result | Failed: one host swap-out page | Passed on Kano, with overlap qualification below |

The database retained 768MiB/no-swap/one-CPU limits; app+DB allowance remained
1.5GiB and the host guard max(1GiB,15% RAM). RSS plus cgroup memory is a conservative
concurrent sum, not unique physical memory or a sum of independent peaks. Runner
overhead is separate. Clean-phase observed mean CPU was 0.004753 application
cores and 0.011810 database cores (one core = 100%). No database OOM, query/request
error or negative/over-reserved stock was observed in the clean run. Its queue,
inbox and holds drained; 240 stock commitments matched the 240 orders.

The clean run collected only 89 samples of the first settled window (mean app
RSS 343,625,728 bytes), then stopped on swap-out growth. There is no second mean.
Evidence was 17,869,076 logical bytes at post-run inspection. Host-wide swap
growth is not attributed to the application: no extra ancestor cgroup memory
cap was found, and its cause was not established.

On fresh owned Jarlaxle datasets at source `3cbe1d0`, clean rerun 01 recorded
100 attempted/passed sales and 140 not attempted; rerun 02 recorded 186
attempted/passed and 54 not attempted. Both stopped on host swap-out growth,
retained all 240 planned outcomes and had no completed settled window. Their
maximum concurrent app RSS plus database cgroup memory was 308,211,712 and
392,134,656 bytes respectively, with zero sampling gaps. The first abort
overlapped a separate `study-studio-build.service` invocation; the second
overlapped the start of another Codex process. Application and database memory
were nearly flat in the final samples of each run while host anonymous memory
rose. This temporal evidence does not establish the source of the swapped pages.
No threshold was changed and no unrelated process was stopped.

Initial Jarlaxle growth found a 2,712.909ms correlated timeline scan; an
uncorrelated seller-scoped reference query measured 3.527ms for the same 14 rows.
No index was needed. Later 250-order checkpoints passed, but host swap-out stopped
growth before 1,000 per seller. The retained single-database attempt recorded
1,393 attempted/1,391 passed scenarios out of 2,000 planned; durable state retained
696 completed per seller and one unpaid hold. A completed transaction's final
scenario acknowledgement was interrupted during abort; no committed record was lost.

Kano subsequently reached both growth sizes with complete bounded traversal,
235 related records/checkpoint, long threads and late-page edits/associations.
Page p95 was 2ms at 250 and 3ms at 1,000; repeated 1,000-order timeline HTTP p95
was 11ms/8ms. A separate local browser regression overlapped the end of this run.
It is functional coverage with the same enforced service/database limits, not an
isolated host benchmark or a replacement for Jarlaxle acceptance.

Observed database delta/order is about 29.8kB in the clean dataset and 24.6kB in
the growth dataset (different record mixes). At the latter mix, 10,000 additional
orders would linearly imply about 246MB database growth; this sizing illustration
excludes base allocation, WAL, backups, evidence, future record mix and retention
effects. It is not a tested capacity claim. Actual runs enforce 512MiB additional
database allocation and 256MiB evidence limits. Business/audit/instruction records
are retained; only supported pg-boss terminal-job maintenance is used.

## Recovery, security and retained evidence

Controlled tests cover rollback before commit, real idle backend termination,
database/app restart with pending/held/paid state, startup `57P03`, discarded real
commit acknowledgement and HTTP response, expiry/promotion, payment races,
duplicate/conflicting events and revoked/expired sessions. The `57P03` case uses
a deterministic wire fixture; the restart cases use actual PostgreSQL. Observed
idle reconnect was 26ms, post-restart app reconciliation 149ms and running-app
expiry recovery 4,388ms, within 30 seconds. Capture failures and an injected bad
seller stream preserve their evidence while healthy sellers continue.

All new boundaries are exercised with two sellers, colliding/foreign IDs, forged
CSRF/origin, stale versions, foreign cursors, safe escaping and secret-free error
recovery. Runtime cannot perform business/scheduler DDL, write migration records
or update/delete audit; required application queue permissions remain. Source
and restored current data match in bounded pages; legacy copies retain financial,
source and history fields through upgrade. Restored sessions are revoked before
access, both invitations work and verified stock stays committed after startup.

Protected evidence is under `/home/aiden/.local/share/pasarpilot-usability/`:

- Jarlaxle: `operations-task23`, `operations-growth-01/02/03`, `operations-clean-01`,
  `operations-clean-rerun-01/evidence/clean-01`,
  `operations-clean-rerun-02/evidence/clean-01`, and
  `fixture-recovery-20261029-01/faults-1793233993378` (16-case recovery proof).
- Kano: `operations-growth-kano-01`, `operations-local-v2-20261028/evidence/`,
  `restore-proof-01/02/03`, `test-20261028`, final dashboard/operations text outputs.
- Committed clean runtime: `c1c512f93726e4b8b1bf4a15ac3da3866a5835a4`, archive
  SHA256 `05c44e23da897237e085e2d4f24a11a0c73d6a95c9e04c6600b50515b1e29a59`.
- Kano growth records dirty parent `43ba7228fa58bcddeba50b162a3def11a0685385`,
  patch `bccfd6add9efecb53b41261d8f2bf7e9ccf11e69fefde4ceffae75e88b18b4d9`,
  runtime `a4e75a558cd5aef90e6ea53a60a988c687c951f2eabe8ca9ac2d4e2730f8f2ea`.

Early explicitly uncommitted remote copies incorrectly recorded `sourceDirty=false`;
that preparation metadata bug is fixed and original evidence remains unchanged.
Completed owned Jarlaxle follow-up test containers were stopped with data retained.
The demonstration is separate. No broad container/volume prune or host service
restart occurred.

## Capability trace

| Approved capability | Implementation/evidence | Remaining limit |
| --- | --- | --- |
| seller-trading-workspace | `paging`, `workspace`, `history`, `navigation`, `assets`, `dashboard`, `updates`; paging/children/selection/safety/appearance/freshness/state tests; 250/1,000 functional checkpoints | Native reader/toolbar zoom verification incomplete; homelab resource acceptance failed |
| seller-onboarding | v3 migration, `profile`, `onboarding`, Settings/help; migration/profile/checklist and desktop/mobile/no-JS workflow tests | Invitations remain operator-managed by design |
| seller-demonstration | common locked synthetic intake, stable demo IDs, guided UI; two completed runs at each declared workflow viewport | Synthetic only; no external posting or payment connection |
| trading-operational-readiness | finite measured runner, pool/tx/worker fixes, real recovery/invariant tests, current/legacy streamed restore, operator guide; current 16-case prepared-host fixture pass | Failed no-swap settled gate |

## Known limits and next milestone

Loopback HTTP, privileged host access to sessions/backups and unresolved Meta
authorization prevent a production-access claim. No public exposure, automatic
payment verification, live scraping/Messenger, OpenRouter, WTB, billing or real
banking API was added. ISO date entry for meeting/extension fields remains
operator-oriented; a native picker and a native assistive-technology review are
useful follow-up usability work.

Next OpenSpec work should close the remaining resource/assistive-technology gates,
then define an invited-seller private pilot with
an explicit secure-access/backup/retention model. Keep Meta authorization separate
from implementation permission; do not start live integrations to bypass it.

## Implementation commits

Each completed task has its checkbox in its completion commit; failed/incomplete
work has explicit evidence commits and remains unchecked. This report's final
commit is discoverable with `git log -1 --format='%h %s' -- docs/research/seller-usability-acceptance.md`.

| Commit | Conventional Commit message |
| --- | --- |
| b3e71ef | docs(operations): record seller usability baseline and protected contracts |
| 1f44a1f | feat(onboarding): migrate display profiles and chronological orders |
| ef2561f | fix(security): revoke runtime migration writes and verify queue grants |
| cfe9ac6 | feat(workspace): add scoped keyset pages and bounded history filters |
| 6a5c0d2 | feat(history): bound detail children and retained instruction snapshots |
| d368335 | feat(inventory): add bounded search and late-page selection |
| 66c715d | feat(ui): organize bounded seller views and contextual navigation |
| f56f0a9 | feat(ui): add responsive seller shell and same-origin visual assets |
| cb27e90 | feat(orders): clarify independent transaction states and next actions |
| 9944734 | test(ui): verify accessible targets appearance focus and responsive reflow |
| 83555df | feat(onboarding): save isolated versioned seller display profiles |
| 8e2a979 | feat(onboarding): derive resumable setup checklist from owned records |
| 5e95957 | feat(onboarding): explain trading safeguards and verify invited seller setup |
| 09b983e | feat(orders): require contextual cancellation and completion confirmation |
| b9003eb | feat(payments): add manual receipt review with explicit stock consequences |
| ee159e5 | feat(ui): provide safe form recovery and uncertain-response feedback |
| d88acca | feat(activity): expose private bounded local update summaries |
| dcdad20 | feat(activity): add bounded visible-tab checks without replacing forms |
| 466cbd6 | fix(intake): serialize synthetic positions and retain stable retry identities |
| f0c8aa8 | feat(demo): guide stable RM10 seller runs through existing trading controls |
| fbad661 | test(demo): complete two guided sales across desktop mobile and no-JS |
| 6594af9 | test(operations): add finite owned two-seller workload and accounting checks |
| 5386238 | test(operations): measure bounded service resources and enforce admission gates |
| a1971b0 | fix(operations): preserve transaction errors and recover owned database connections |
| 096fdec | fix(operations): isolate capture and seller stream failures from expiry |
| a0f0dd9 | test(operations): retain stock audit and session invariants across restart |
| c1c512f | perf(history): avoid correlated timeline scans and retain bounded growth evidence |
| 43ba722 | test(operations): record complete sales and failed settled host resource gate |
| b852a5f | test(operations): verify bounded thousand-order functional growth on Kano |
| 277fd6e | fix(ui): clarify filtered empty results and audit seller route boundaries |
| 77ecf38 | docs(operations): prove separate restores and publish seller demonstration guide |
| c561b33 | test(operations): finish local regressions and record blocked fixture gate |
