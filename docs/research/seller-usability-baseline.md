# Seller usability implementation baseline

2026-10-28. Source baseline `74e30a3`; branch `feat/seller-usability-and-operations`.
Approved source: `openspec/changes/seller-usability-and-operations/` (32 ordered tasks).

## Scope and callers

- `Workspace.rows/get`: dashboard list/detail reads; `get` also authorizes catalog,
  negotiation, payments, proposals, review, stock and fulfilment domain commands.
  Preserve its seller-qualified lookup and safe missing/foreign result.
- `history/timeline/sharedInstructions`: dashboard and database history/sale tests.
  Pagination must update these callers and retain all instruction snapshots.
- `view/mutate`: `server`/`listen`, trading CLI, capture demo and dashboard tests.
  Keep authenticated POST boundaries and the existing domain functions.
- `synthetic/intake`: HTTP `/synthetic`, CLI `generate`, capture demo, fixture
  payload tests and intake/ordering/sale tests. Both generator callers currently
  allocate next position before intake's trusted source lock; fix at that shared boundary.
- Migrations/schema checks: setup, migrate, serve, generate/import, test accounts
  and schema tests. Setup refuses existing accounts; migration must preserve them.
- Frontend scope: server shell, dashboard templates, fixed same-origin assets,
  workflow/security tests and capture-demo HTTP callers. No new dependency.

## Protected contracts

- Preserve benchmark CLI commands, three scheduler tenants, one browser slot,
  six nonterminal logical jobs, round-robin/coalescing, sandbox/admission rules,
  profile flock/generation/heartbeat and verified exit before release/import.
- Preserve version-1 400-event fixture ledger and opt-in typed capture.
- Preserve tenant composite keys, database-time 15-minute holds, inventory lock
  order, exact integer sen, backup source ordering, seller-only payment verification,
  delivery snapshots, transactional activity and retry semantics.
- Never mutate scheduler schemas/services for UI work. Prepared-host fixture
  recovery remains a separate gate; local database tests are not its substitute.

## Private datasets and baseline checks

All paths are outside Git under `/home/aiden/.local/share/pasarpilot-usability/`:

| Purpose | Explicit path / status |
| --- | --- |
| Disposable local PostgreSQL tests | `test-20261028/`, prepared with existing Docker helper |
| Seller walkthrough | `demo-20261028/`, reserved, not prepared or shared with tests |
| Browser-free fault/growth/soak | `operations-20261028/`, reserved; ownership and admission required |
| Separate restore verification | `restore-20261028/`, reserved |

The test database retains the pinned PostgreSQL 17.11 image, private Unix socket,
network disabled, 768 MiB/no-swap cap and dataset labels. Existing `mssql` stays
untouched. No application listener, browser, scheduler or remote service was started.

Baseline PASS: TypeScript; 19 benchmark units; 4 trading units; 28 real PostgreSQL
trading tests; 3 scheduler/queue integration tests. Private database logs are
`test-20261028/{trading,scheduler}-baseline.txt`. Dashboard/browser and prepared-host
fixture recovery have not yet run for this change. Node is 20.20.2; installed npm
12.2.0 emits a Node support warning, while the checks above exit successfully.

## UI reference and inspection

The installed reference is `/home/aiden/.local/share/mcp/apple-design-mcp`, with
`hig_search`/`hig_get`; there is no standalone apple-design SKILL.md. Its README
requires topic search, page fetch and Apple source attribution. Loaded
[Layout](https://developer.apple.com/design/human-interface-guidelines/layout).
Read the approved design's other reference topics before implementing components.
Initial source review confirms one long unstyled dashboard, ten `LIMIT 200` reads,
unbounded timeline draft references and instruction snapshots, ID-heavy labels,
inline critical action forms and dropdowns limited to loaded inventory/items.
Rendered inspection is required before frontend task completion.

## Acceptance checklist

- [ ] Fresh schema and v1/v2 upgrade preservation; runtime grant probes.
- [ ] Complete bounded traversal, children and selectors beyond record 200.
- [ ] Selected views, onboarding, safe critical confirmation and recoverable errors.
- [ ] Desktop/mobile, keyboard, screen reader, contrast, zoom/reflow, both appearances,
      reduced motion, no-JS and non-disruptive updates.
- [ ] Stable/replayed synthetic steps and two preserved browser-only demo sales.
- [ ] Separate bounded fault/growth stages and full 60-minute 240-sale clean soak,
      actual resource/latency/storage evidence and two five-minute settled windows.
- [ ] Separate restore, full regressions, strict OpenSpec validation and handoff.

No historical measurement is claimed as evidence for this milestone. Meta
authorization and public/production access remain unresolved.

## Task 1.2: additive schema

Schema 3 adds 1–80-character display names (existing login default), independent
profile version 1, and order `created_at`. Legacy dates use earliest attributable
order activity; absent activity explicitly falls back to migration transaction time.
New orders use database `now()`. No UUID-derived historical time is invented.
TypeScript and all 29 trading database tests pass, including fresh setup and
separate disposable v1/v2 upgrade simulations with retained credentials, sources,
sessions, holds, agreement snapshots and paid/completed state (`task-02.txt`).

## Task 1.3: restricted runtime role

The pre-change probe found migration INSERT permitted. Idempotent migration now
revokes all migration writes for fresh and upgraded datasets. Focused real-database
checks pass: runtime is `trading_runtime`, has no elevated role flags, cannot
create/alter business or actual scheduler tables or update/delete audit/migration
records, and can still start/send/cancel/maintain its pg-boss queue. Fresh/v1/v2
migration preservation also passes. Serving constructs the default runtime pool;
the provisioning pool remains confined to setup/migrate commands.

## Task 1.4: bounded list/history reads

Default 25/max 100 keyset pages fetch one continuation row. Cursor context binds
seller, collection and allowlisted filters. Order/message cursors retain PostgreSQL
microseconds (including equal timestamps); catalog IDs are deterministic, not
labelled chronological. Activity uses bigint identity order. Updated existing
callers to the page result shape; navigation presentation follows in task 2.1.
TypeScript/build and all 30 trading database tests pass (`task-04.txt`), including
235 colliding inventory IDs per seller, full filtered order traversal, timestamp
ties, foreign/incompatible/malformed cursors and invalid filters/page sizes.

## Task 1.5: bounded detail children

Owned parent reads page listing items, item claims/orders/conversations/drafts,
order drafts/reviews and conversation messages/drafts/orders. Claims use
(position,id) continuation and SQL backup ranks over the full owned item. Timeline
uses seller-qualified EXISTS instead of loading draft/source arrays; historical
instruction deliveries page by precise timestamp/id. TypeScript/build and all
31 database tests pass (`task-05.txt`), including 235-row long children/snapshots,
backup ranks, complete timeline traversal and foreign-parent rejection.

## Task 1.6: late-page selection

Inventory/item selectors use literal case-insensitive server-side metadata search,
25/100-row pages and optional owned listing scope. Direct scoped lookup and existing
catalog mutations work independently of list position. Focused database test/build
pass: traverse 235 matches, search/edit/map/open the final row, reject foreign
listing association and incompatible cursor/search input. UI selectors are wired
in the next selected-view task rather than adding a second set of forms.

## Task 2.1: selected seller views

Overview, inventory, WTS, conversations, orders/history and settings now query only
the selected bounded sections. Scoped detail pages and child tabs link items,
listings, claims, conversations, reviews and orders; new records open directly.
Search selectors retain an explicitly chosen owned ID, and paged/filter return
URLs are local/allowlisted. Updated dashboard callers and foreign-detail checks.
Five units and both dashboard tests pass, including a complete sandboxed Brave
RM10 sale on the accumulated test dataset. Separate rendered review at 1280×800
and 360×800 found and fixed search results reopening inside a closed disclosure.
Navigation spacing/visual polish continues in 2.2. Private screenshots:
`demo-20261028/task-07-{desktop,mobile}.png`. DevTools connection timed out;
Playwright used a separate sandboxed Brave process, never existing browser tabs.

## Task 2.2: shared visual shell

Loaded the installed service README and fetched Apple guidance for
[Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars),
[Typography](https://developer.apple.com/design/human-interface-guidelines/typography),
[Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons),
[Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback),
[Motion](https://developer.apple.com/design/human-interface-guidelines/motion),
[Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility)
and [Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode).
Applied hierarchy, progressive disclosure, system fonts, relative spacing, native
controls, restrained surfaces, press/focus feedback and adaptive navigation.
Fixed CSS/JS assets use same-origin CSP allowances without inline scripts/styles,
fonts, packages or framework. The script only enhances native submission feedback.
Build and both dashboard tests pass with asset/CSP checks. Reviewed actual desktop
and 360px mobile completed-order screenshots under `test-20261028/task-08-order*.png`;
mobile has no horizontal overflow. Raw timestamp/state wording is the next task.

## Task 2.3: independent states and next actions

Reservation, payment, fulfilment and order facts have separate visible labels.
Backups show their rank and lack of reserved entitlement; proposals explicitly
remain undelivered; approved fixture replies explicitly remain simulated. Payment
evidence stays unverified, paid stays awaiting completion, posted stays awaiting
receipt, and drop-off stays awaiting collection. MYR totals and readable MYT
(UTC+08:00) deadlines are visible; terminal orders show a previous hold deadline.
Build and all three dashboard tests pass, including actual evidence intake,
backup state and paid intermediate-postage scenarios. Reviewed desktop/mobile
order screenshots (`task-09-order*.png`). No trading transition rules changed.

## Task 2.4: appearance/accessibility verification

Rendered assertions pass for both appearances at 1280×800, 390×800, 360×800
and 320×800: no horizontal overflow, visible 3px keyboard focus, semantic
skip-to-main navigation, reduced-motion transitions removed and all visible
action targets >=44 CSS px. Native labels/landmarks remain available. Long text
wraps; the brand also wraps at enlarged text. Empty and error states were checked.
Text contrast: light primary 16.10, secondary 5.72, accent/tint 5.68, button 6.52;
dark 13.87, 8.89, 6.49, 7.95. Essential control borders: 3.66 / 4.36.
200% text at 320 CSS px and a 640×400 CSS/DPR2 geometry equivalent to 200%
zoom on 1280×800 pass reflow. This is automated zoom-equivalent emulation, not
a native browser-toolbar zoom interaction. Reviewed private screenshots in
`test-20261028/appearance/` (light/dark desktop/mobile, enlarged text and zoom).
Actual screen-reader workflow is still a separate final acceptance requirement.

## Task 3.1: display profile

Authenticated settings now save a bounded single-line plain-text display name
with independent current version, CSRF and transactional `profile_saved` activity.
Foreign explicit scope, unsafe/oversized input and stale updates are rejected.
The focused HTTP/database test proves credentials/payment versions and the other
seller stay unchanged, one audit entry is appended and the profile persists after
logout plus connection/server restart. Build and the browser sale pass; the
Playwright workflow edits the actual profile form and verifies the shell identity.

## Task 3.2: resumable first-use checklist

Overview/settings derive six setup facts using seller-scoped EXISTS queries and
profile/instruction versions; guidance remains an always-available link. Links
reuse existing forms and the first owned listing's mapping controls. A fresh
isolated-database test passes interrupted/out-of-order setup, other-seller
isolation, disabled negotiation, unchanged record counts and zero deliveries or
orders from setup alone. Build and browser profile-to-sale workflow pass.

## Task 3.3: invited-seller guidance and browser onboarding

Login explains operator invitation and synthetic/loopback scope. Persistent help
explains private floors, disabled negotiation, exact claims, holds/intervention,
separate instruction/delivery approvals, manual receipt and intermediate dispatch.
Two sandboxed browser tests now create fresh disposable databases and complete
onboarding plus the sale at 1280×800 and 390×844. Both pass, including checklist
1/6→6/6 and zero deliveries before explicit response approval. Reviewed actual
profile/checklist screenshots `appearance/onboarding-{1280,390}.png`; native forms
stack cleanly on mobile. Fresh UI datasets are separate from retained demo data.

## Task 4.1: cancellation/completion review

Read-only contextual review pages show buyer/variant/quantity/amount/current
version/state and release/promotion or receipt consequences. Unchecked explicit
confirmation is required by HTML and the POST handler; unavailable transitions
link back safely. Capture-demo and browser completion callers are updated.
Focused HTTP tests pass: opening/back navigation appends nothing, absent intent
is rejected, a second session invalidates the old cancellation version, backup
promotion releases once and completion replay changes no stock/audit twice.
Fresh desktop/mobile browser sales pass through the actual completion review;
reviewed `appearance/completion-review-390.png` for contextual layout and targets.

## Task 4.2: deliberate payment verification

Payment verification now opens a read-only buyer/item/amount/version/deadline
review with explicit stock-commit consequences. The amount starts blank and must
be entered; trusted receipt starts unchecked. Existing exact-amount, expiry,
review and delivery guards remain authoritative. Focused HTTP tests pass for
read-only review, missing attestation, wrong amount, blocking review and late
payment without stock revival. Existing payment/race/final-guard tests and both
fresh browser sales pass; replay remains idempotent. Reviewed actual mobile
`appearance/payment-review-390.png`; final critical POST returns to the owned
order, retaining its originating navigation context. Capture uses its existing
explicit amount/attestation; no automatic screenshot verification was added.

## Task 4.3: safe recovery and progressive feedback

Errors now explain corrections/current-state recovery without raw domain/SQL
codes. Safe inventory/catalog/profile values are escaped back into existing
controls with linked summaries and aria-invalid/describedby; old submitted
versions remain unchanged. Passwords, receipt amounts, attestations, instructions,
messages and addresses are not retained. Revoked/expired POST sessions prompt
relogin. Success appears only after server acceptance. Native forms add immediate
pending feedback and an inspect-before-retry message after an uncertain response.
All seven dashboard checks pass (`task-16-dashboard.txt`), including a full fresh
360px sale with JavaScript disabled. A feedback test keeps the submitting document
visible while a separate authenticated HTTP client commits, then verifies the
uncertain message and inspection of committed state. Its earlier native-navigation
interception test timed out in Playwright; only its owned sandboxed test browser
was closed, and timeout cleanup was hardened. Actual crash/ack recovery remains
in operations acceptance. Reviewed `appearance/uncertain-response.png`.

## Task 5.1: private bounded update endpoint

Authenticated GET `/updates` returns at most 20 recent activity summaries and
five references per attention kind, never message/address/instruction/reason
bodies. Query bounds, unexpected seller input, POST and revoked sessions are
rejected. No-store remains set. The focused real-HTTP/database test passes
foreign seller/private payload exclusion and a two-connection out-of-order
identity commit: each check re-reads the bounded window and discovers the lower
identity after its later commit, without treating a maximum ID as complete history.

## Task 5.2: non-disruptive visible-tab freshness

A read-only footer checks every 10 seconds while visible, with one fetch, an
8-second request timeout, hidden-tab pause and 20/40/60-second error backoff.
Revocation stops checks and exposes relogin. It updates bounded text summaries
only, labels local freshness honestly and provides explicit current-view refresh;
no forms, versions, selection, focus, scroll or browser storage are replaced.
All nine dashboard tests pass (`task-18-dashboard.txt`). Controlled browser-clock
checks prove initial cadence, hidden pause, one in-flight request, capped backoff,
relogin stop and exact editing/focus/selection/scroll preservation under reduced
motion. The no-JS sale retains manual navigation/refresh. Reviewed mobile
`appearance/freshness-relogin.png`; summary bodies contain no private text.

## Task 6.1: stable synthetic generation

HTTP/CLI now share trusted-source locking for next-position allocation and inbox
acceptance. Stable supplied event IDs replay the original position/source time;
changed content under that ID is quarantined rather than awarded a new effect.
The form allocates its event identity before submission. CLI `generate` now
requires a fifth stable-event-ID argument; the operator example is updated.
All 35 database and nine dashboard tests pass (`task-19-{database,dashboard}.txt`).
Concurrent actual HTTP/CLI calls using stable run/step IDs get adjacent unique
positions, one hold, safe acknowledgement-loss replay, retained conflict evidence
and tenant isolation. Normalized envelope validation/deduplication stays shared.

## Task 6.2: guided browser-only demonstration

Settings links a nine-step guide. Explicit start creates one SYN/English/NM
nonfoil RM10 unit, listing and mapping using existing catalog transactions, with
stable run IDs and resumable partial setup. A/B buttons use stable per-run source
identities; B requires A's live hold. The guide links existing fee, instruction,
manual payment, collection, completion and activity controls without approving any
step automatically. Run browsing is paged and previous records are preserved.
Domain tests pass concurrent/replayed start, partial setup resume, A/B replay,
foreign scope and separate run preservation. Actual browser A/B guide passes with
zero deliveries/unverified payment and no overflow at 390/1280px; reviewed
`appearance/guided-390.png`. The complete twice-through guide sale follows in 6.3.

## Task 6.3: two complete guided sales

The existing fresh-database browser acceptance now completes onboarding and two
guided sales at 1280×800 and 390×844, plus 360×800 without JavaScript. All three
cases pass: both orders/history and instruction deliveries remain retained, each
has exactly one stock commitment, each B ends unfulfilled, and stock reaches
zero once per run. Seller receipt, actual collection and completion stay explicit.
Seven focused tests pass including existing unpaid expiry/promotion, ambiguous
review and intermediate postage/drop-off cases. Private second-run activity
screenshots are `test-20261028/two-guided-sales-*.png`; review-page images remain
in `appearance/`. These six finite browser sales are not operational soak evidence.

## Task 7.1: finite browser-free runner foundation

Added explicit fresh disposable provisioning, canonical owner-only dataset/output
checks, protected random credentials, stable transaction IDs, two serial seller
streams and private streamed outcomes/request timings. Clean limits are fixed at
120 cycles each, 30-second cadence and 60 minutes; every planned failure or
non-admitted attempt stays counted. The runner does not start a browser or use
capture/model credentials. Six units and the executable self-check pass, including
private path/symlink checks and honest failed/not-attempted accounting. No soak
was started before resource instrumentation/admission (7.2). Read-only SSH confirms
Jarlaxle is reachable with Podman and the retained Node 22.23.4 toolchain; the
preliminary point sample is not substituted for the required measured baseline.

## Task 7.2: measured admission and service instrumentation

Added actual child application/worker RSS and calibrated process CPU, separate
runner accounting, concurrent capped database cgroup observations, host CPU/PSI/
swap, bounded query/pool/request histograms, backlog age and table/index/storage
snapshots. Sampling gaps, telemetry loss, pressure, swap-out growth, memory and
disk/evidence limits stop admission. The clean stage includes fixed-record drained
five-minute windows; their acceptance remains task 7.7, not the smoke result.
Provisioning now waits for the final PostgreSQL process and a successful query
against the actual database: the previous readiness probe accepted its temporary
initialisation server before database creation. Failed provisioning is retained.

TypeScript and seven units pass, including promise/callback instrumentation.
The local smoke correctly failed on host swap-out growth before sales; it is not
counted as a pass. Jarlaxle's separate `operations-task23/evidence/smoke-01` passed
both planned sales after 61 baseline samples with zero missing samples: combined
concurrent app RSS plus database cgroup maximum 161,726,464 bytes, runner maximum
75,898,880 bytes, minimum host available 6,555,041,792 bytes. Client p95 reads 17ms,
mutations including redirect 62ms, synthetic visibility 82ms; database grew
409,600 bytes. This development smoke used the explicitly labelled uncommitted
task-23 runtime archive SHA256
`2e28f1c357fcc9c51592cb3f13a0c5c3a6e7d58e7a23c2194870dac51e3229a2`.
No unrelated services changed. Future expiry wakeups remain visible in evidence;
smoke does not assert settled queue or sustained capacity.

## Task 7.3: controlled disconnect and acknowledgement recovery

Reproduced an application exit after terminating its idle database backend and
loss of the original `57P01` error when rollback also failed. Shared pools now
handle idle errors with a fixed diagnostic; transactions retain the original
error and discard broken connections. Serve startup fails with a safe same-data
retry instruction. No automatic transaction retry or reseeding was added.

Seven browser-free recovery assertions pass on the explicitly owned disposable
`operations-local-v2-20261028` database, including real backend termination,
uncommitted rollback, real container restart, held/paid/pending state retention,
expired-hold reconciliation, discarded successful COMMIT acknowledgement and
discarded HTTP response followed by stable replay. PostgreSQL startup `57P03`
uses a deterministic local wire-protocol error fixture; the separate restart
case uses actual PostgreSQL. Measured idle reconnect 26ms, post-restart app ready
and reconciled 149ms, running-app expiry recovery 4,388ms after readiness, all
within 30 seconds. Existing 36 trading database tests also pass.

The pinned image resets the socket directory to 3775 during restart. The owned
test restores 0700 after checking canonical path and owner; the application
continues to reject unsafe dataset permissions. The enclosing dataset stays
0700 throughout. Operator restart instructions must include this check (8.2).
Private fault evidence is `evidence/recovery-1793171810036`; failed harness
attempts and pre-fix logs are retained. These bounded fault tests are separate
from the clean soak.

## Task 7.4: independent local work during dependency failures

The pre-fix test reproduced missing capture blocking startup reconciliation and
invalid capture preventing a healthy seller's expiry for more than 30 seconds.
The worker now isolates optional import, seller expiry and seller stream errors
with fixed private diagnostic codes. It preserves the five-second cadence,
100-event/100-expiry bounds and existing queue maintenance. No source events are
fabricated, ignored or acknowledged as successfully imported on failure.

All 11 operations assertions pass: explicitly missing capture, invalid retained
capture, a test-only malformed pending source, healthy seller expiry and full
HTTP sale, then capture unset with no scheduler/model environment or application
child processes. The injected envelope is retained privately alongside its
original, restored after the test, and never deleted or marked processed while
invalid. Logs contain fixed codes without source/payment bodies. The complete
recovery suite still passes. All fault work used the separate owned disposable
database; no host scheduler, Chromium or unrelated service was stopped.

## Task 7.5: stock and session invariants across restart

Extended the catalog test with a real allocated hold: reducing stock below the
hold fails without a version or audit change. Added an owned database/application
regression for simultaneous last-unit claims, simultaneous exact verification,
payment versus already-expired hold, cancellation/promotion, stable duplicate
and conflicting events, and revoked/expired sessions across application restart.
Terminal replays retain identical payment/stock state, delivery count and audit
count. Revoked/expired requests return 401 for both update reads and writes.
The new restart assertion and nine focused existing database assertions pass;
TypeScript passes. All manipulated deadlines remain in disposable test data.

## Task 7.6: growth implementation and incomplete host acceptance

Implemented the fixed 250/1,000-order-per-seller growth plan over normal HTTP
sales, with two serial seller streams, complete paged traversal without history
aggregation, 235 related items and 235 additional messages per seller/checkpoint,
late-page edits/association, repeated list/filter/detail/update reads and actual
query plans. Operation-specific bounded histograms prevent a fast route masking
a slow one; mature p95 violations stop admission. Failure samples now retain
the concurrent resource observations and initial swap counter.

The first Jarlaxle attempt exposed a correlated timeline subquery: 4,389 draft
scans and 608,429 shared block hits for 14 rows, taking 2,712.909ms. Replacing
the correlated reference predicate with uncorrelated seller-scoped reference
sets measured 3.527ms for the same 14 rows. No index or schema change was needed.
Both long-history tests, all 36 database tests, seven units and TypeScript pass.

The next attempt passed both 250-order checkpoints: complete pages/related
records/late edits, domain page p95 3ms, timeline HTTP p95 9ms, updates 3ms.
It stopped on host swap-out growth after 596 successful scenarios. Only the
three retired, label/owner-verified test database containers were then stopped,
with data retained; no unrelated service was touched.

The single-database retry also passed 250 per seller (page p95 4ms), then stopped
on one 4,096-byte host swap-out increment. Its 2,000 planned denominator records
1,393 attempted, 1,391 passed, 609 failed/not admitted (607 not attempted). Actual
durable state contains 696 completed per seller and one remaining unpaid hold:
one completed transaction lost its final scenario acknowledgement during abort.
There are zero negative/over-reserved stock violations. Database growth was
34,152,448 bytes; 211 one-second samples have no gaps, maximum simultaneous app
RSS plus database memory 1,009,950,720 bytes (failure sample 1,017,143,296), runner
maximum 179,712,000 bytes and minimum host available 5,707,849,728 bytes. Memory
stayed inside the envelope; the strict no-swap-growth gate failed nonetheless.

Private roots `operations-growth-01`, `-02` and `-03` retain failed attempts,
plans, samples and post-abort state. Their explicitly labelled uncommitted
runtime archives are retained; the third SHA256 is
`19d6a288cfb7c1e5606fd4246ac41d9ccf670ccc44e2cff1eba0f519d38204c9`.
These development preparations incorrectly set `sourceDirty=false` for explicit
non-commit labels; preparation now identifies such labels as dirty. Historical
evidence is preserved rather than rewritten. Task 7.6 remains unchecked because
1,000 orders per seller were not safely reached. Do not describe partial growth
as a successful resource/capacity gate or relax host controls to force a pass.

## Task 7.7: full transaction window, failed settled resource gate

Ran the unchanged 60-minute clean schedule from committed source
`c1c512f93726e4b8b1bf4a15ac3da3866a5835a4` on fresh Jarlaxle dataset
`operations-clean-01`, archive SHA256
`05c44e23da897237e085e2d4f24a11a0c73d6a95c9e04c6600b50515b1e29a59`.
All 240 planned/attempted scenarios passed, 120 completed orders per seller,
240 stock commitments, zero stock violations, no pending inbox or held
reservations, and the scheduled queue drained through the existing worker.
No browser, scheduler or model environment was required.

The overall run **failed**, after drain and 89 samples into the first settled
window: host swap-out increased by one 4,096-byte page. Admission stopped and
evidence/state were retained. Neither five-minute window completed, so their
RSS comparison is unavailable. Task 7.7 remains unchecked; 240 successful sales
must not be described as passing the complete operational acceptance gate.
No threshold, host setting or unrelated workload was changed to obtain a pass.

Actual retained results: 4,616 samples with zero declared sampling gaps;
maximum concurrent application RSS plus database cgroup memory 467,111,936
bytes, runner maximum 111,448,064 bytes, minimum host available 5,884,911,616
bytes. No query/request errors or database OOM were observed. Client p95 reads
8ms, mutations including redirect 37ms and synthetic visibility 77ms. Measured
clean-phase mean CPU use was 0.004753 application cores and 0.011810 database
cores (one core = 100%); diagnostics/runner are separate. Database growth was
7,151,616 bytes and retained evidence 17,869,076 logical bytes at inspection.
The first partial settled RSS mean was 343,625,728 bytes; there is no second mean.

Private `evidence/clean-01/post-abort.json` retains state/CPU/storage checks.
Read-only ancestor cgroup inspection found no additional memory.high/max limit;
the cause of the host-wide swap increment is not attributed to the application.
Ten dashboard/browser tests separately pass after the timeline change; reviewed
desktop light and 360px dark screenshots in `final-query-review/` show legible
transaction facts, visible focus and responsive reflow. None of this substitutes
for the two incomplete resource acceptance tasks.

### Later 7.6 functional growth completion on Kano

After local headroom became available, `operations-growth-kano-01` passed all
2,000 planned HTTP sales, reaching exactly 1,000 completed orders per seller.
Both 250/1,000 checkpoints pass full paged traversal, 235 related mappings per
seller/checkpoint, long threads, late-page edits/association and retained actual
query plans. Page p95 was 2ms at 250 and 3ms at 1,000; repeated HTTP timeline p95
at 1,000 was 11ms/8ms for the two sellers. Overall client read p95 12ms, mutations
including redirect 36ms, synthetic visibility 102ms. No new index was necessary.

This is **Kano functional growth evidence**, not Jarlaxle capacity acceptance.
The database retained 768MiB/no-swap/one-CPU limits and the same service/host
guards. There were 252 samples, zero declared gaps, maximum concurrent app RSS
plus database memory 648,200,192 bytes, runner maximum 127,823,872 bytes, minimum
host available 9,735,168,000 bytes and database growth 49,277,788 bytes. A separate
local dashboard regression overlapped the end of this run; do not describe it
as an isolated host benchmark. The finite runner itself has no browser dependency.

Source parent `43ba7228fa58bcddeba50b162a3def11a0685385` is explicitly dirty:
the contemporaneous copy fix/security tests are retained in private runtime patch
SHA256 `bccfd6add9efecb53b41261d8f2bf7e9ccf11e69fefde4ceffae75e88b18b4d9`,
compiled runtime archive
`a4e75a558cd5aef90e6ea53a60a988c687c951f2eabe8ca9ac2d4e2730f8f2ea`.
Task 7.6 is now complete for bounded functional growth; prior failed homelab
attempts remain retained and 7.7's target-host acceptance remains incomplete.

## Task 8.1: boundary/UI review; native screen-reader check blocked

Expanded HTTP acceptance across all 22 seller POST form routes: missing
authentication, forged CSRF and foreign origin reject before any audit mutation.
Colliding owned inventory/listing/item/conversation/order/review IDs, read-only
critical reviews, foreign list/child/timeline cursors, colliding demo run IDs,
stale profiles, unsaved secret recovery and revoked sessions remain isolated.
Global diagnostics contain no injected private marker or token. The four focused
security/update/confirmation tests and all eleven dashboard/browser tests pass.

Fixed filtered inventory's empty message to distinguish no matches from no
inventory. The existing rendered appearance test verifies the recovery wording.
Tool-assisted keyboard review exercised skip-to-content, native search submission,
navigation to settings, visible input focus and the payment checkbox without
submitting payment. Chromium's accessibility tree exposes the labelled display
name textbox. Reviewed new desktop empty-state and 360px dark payment screenshots
under private `test-20261028/manual-acceptance/`; existing acceptance also covers
light/dark, reduced motion, 320px reflow, enlarged text/zoom equivalent and no-JS.
Native browser-toolbar zoom remains an emulation limitation already recorded.

No Orca, Speech Dispatcher, eSpeak NG or Xvfb executable is installed; native
computer-use surfaces are unavailable. No native screen-reader listening pass
was performed, and an accessibility-tree check is not claimed as a substitute.
Task 8.1 remains unchecked for that explicit missing verification. No system
packages or unrelated desktop services were installed or changed to bypass it.

## Task 8.2: operator guide and separate current/legacy restores

Published [the seller workspace guide](../operations/seller-workspace.md) with
private setup, invitations, the browser-only RM10 flow, non-destructive repeat,
uncertain-response inspection, verified restart/socket privacy, expiry, streamed
backup, separate restore and non-destructive rollback/downgrade limits. It leaves
Meta authorization and secure external-access requirements unresolved.

The executable restore test passes against `restore-proof-03`: a streamed current
backup restores into a new owned private database and exactly matches 1,161 rows
across 27 business/queue tables in pages of at most 100 before startup. Separate
new v1/v2 copies are backed up/restored, upgraded on both sides and compared for
retained financial/source/history data; expected new v3 fields/application times
are excluded from legacy equality only. Both legacy workers restart with valid
login and unchanged verified stock. Current restore checks restricted audit/
migration grants, revokes restored sessions, signs in both sellers and retains
paid stock after startup. TypeScript and the 11.3-second restore test pass.

Private dumps, error attempts and databases remain outside Git under the selected
source's `evidence/backup-*` and separate restore roots. The first current-schema
proof also passed; a later legacy harness comparison initially treated fresh
migration timestamps as old retained data, then was corrected. No source data,
live seller dataset or existing schema was downgraded or overwritten.

## Task 8.3: final local regression and unavailable prepared host

Final checks pass: TypeScript; 19 existing benchmark units; 7 trading units;
3 scheduler PostgreSQL tests; 36 trading database tests; 11 dashboard/browser
tests; 12 operational TAP tests (including nested parents); and the separate
current/legacy restore proof. Raw final dashboard/operations outputs are private
`final-dashboard-tests.txt` and `final-operations-tests.txt` under the usability
evidence parent. A dashboard test initially searched only the first bounded
review page; it now asserts the exact newly submitted evidence event/review.
The corrected full dashboard rerun and subsequent operations suite pass.

The current fixture browser recovery suite is **blocked**: SSH/name-service
checks for Jarlaxle fail (`Could not resolve hostname jarlaxle`). The retry did
not resolve it. Fresh Minecraft/process ownership, runtime/sandbox and host
admission therefore could not be established. No browser was launched there,
networking changed or unrelated service stopped. The earlier milestone's 16-case
pass remains historical evidence, not a current regression result. No approval
was needed/requested because no service stop was attempted. The selected remote
clean-test database's later cleanup cannot be verified while its host is
unreachable; retained data/evidence must not be removed by broad cleanup.

## Task 8.4: final acceptance and handoff

Corrected obsolete root/runbook claims and published the sanitised acceptance
report with all four capability traces, commit ledger, exact measurements and
separate passed/failed/blocked evidence. Strict OpenSpec validation, TypeScript,
diff checks and 33 local documentation links pass. The actual retained demo
accepts its invitation and all seven workspace pages render on loopback; reviewed
its desktop/mobile screenshots under `demo-20261028/final-review/`. Final visual
review found the persistent guidance link incorrectly numbered as a seventh
checklist step; moving it outside the list preserves six derived facts. Four
focused onboarding/desktop/mobile/no-JS follow-up cases pass after that copy/layout
fix. Only the verified owned demo process was restarted; test databases were
stopped with their data retained. No public listener or production deployment.

Final progress is 30/32: 7.7 remains failed/incomplete after the host swap-out
abort; 8.1 remains incomplete for native assistive-technology verification.
The prepared-host fixture rerun is explicitly blocked within completed 8.3.
Meta authorization stays unresolved. Nothing was pushed, rebased, squashed or
archived; existing untracked planning artifacts and `.codex/` are preserved.
