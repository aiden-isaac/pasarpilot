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
