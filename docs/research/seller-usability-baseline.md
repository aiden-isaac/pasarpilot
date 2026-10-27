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
