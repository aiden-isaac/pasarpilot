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
