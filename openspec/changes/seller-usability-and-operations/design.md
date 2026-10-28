## Context

The [trading acceptance report](../../../docs/research/assisted-wts-trading-core.md) records an authenticated MYR 10.00 sale, backup handling and security/replay checks. The [archived trading design](../archive/2026-10-28-assisted-wts-trading-core/design.md) and four main trading specs already define the domain. The [archived scheduler design](../archive/2026-10-27-schedule-bounded-fixture-visits/design.md), [scheduler results](../../../docs/research/bounded-fixture-scheduling.md), [lifecycle results](../../../docs/research/bounded-browser-lifecycle.md), [capacity projections](../../../docs/research/bounded-browser-capacity.md) and [UI research](../../../docs/research/facebook-ui.md) constrain this work. The completed lifecycle change remains unarchived; do not move or rewrite it.

Inspected implementation and gaps:

| Existing code/evidence | Reuse and targeted change |
| --- | --- |
| `dashboard.ts` renders inventory, listings, claims, reviews, orders, conversations and synthetic controls | Keep its forms/domain functions; organize them into selected views and scoped details instead of one enormous page. |
| `Workspace.rows` runs ten independent `SELECT * ... ORDER BY id LIMIT 200` reads per dashboard | Replace page loading with bounded queries for the selected view. UUID ordering is deterministic, but is not chronological. |
| `history.ts` filters state/buyer; timeline loads all draft references before limiting activity; sent snapshots are unbounded | Preserve history/snapshots; page queries and related records in SQL, avoiding full reference arrays. |
| `server.ts` provides loopback Host/origin/CSRF/session checks and no-store responses | Retain boundaries; replace generic 409/raw code output with safe contextual recovery. Its current `default-src 'none'` CSP needs narrow same-origin asset/connect allowances. |
| `sellers` has login and instruction configuration, but no display profile | Add a display name and independent profile version, backfilled from login. Keep credentials and instruction versions separate. |
| The worker has a five-second non-overlapping tick, 100-event stream batches, 100-expiry sweeps and a pool of three | Retain these bounds first. Test reconnects, idle pool errors, retry behavior and fairness. Optional import currently precedes sweeps, so an import error can defer local work for the tick. |
| `setup` provisions two accounts only on a fresh dataset; `generate` and `/synthetic` already exist | Keep the invitation model and reuse buyer simulation; never rerun setup to reset seller records. Concurrent synthetic generation currently computes next position separately from intake; test and correct that shared boundary if required. |
| Existing database races, HTTP safety and Playwright workflow tests | Extend callers/assertions for new views and confirmations, preserve deterministic transaction invariants. |
| Root README still claims no application/dashboard | Correct current setup/status documentation as part of handoff. |

The finite prior combined capture run measured 147.53 MiB concurrent services, not sustained operation. Do not substitute it for new evidence or advertise the old browser projections as seller capacity.

## Goals / Non-Goals

**Goals:** Invited sellers can set up, understand current work, navigate a listing-to-completed-order flow and recover from errors on desktop/mobile. Read paths and operating workloads stay bounded. Transactions survive restart, disconnected databases and duplicate inputs. All acceptance is synthetic, local and practical for one developer.

**Non-Goals:** Facebook/Messenger, Meta authorization, WTB, automated posting, AI/model integration, real payments, refunds, billing, public registration, public/production access, a new frontend stack, caching services, microservices or general account-management infrastructure. Keep one item per order, integer sen, existing claim priority, 15-minute holds, guarded backup promotion and explicit seller-approved simulated responses.

## Decisions

### 1. Improve the existing server-rendered application

Use the current Node HTTP/TypeScript/PostgreSQL application and trading worker, existing domain mutations and pinned dependencies. Select a view using validated paths or query parameters handled by the existing `View` callback. Use normal links, GET filters and POST/redirect/GET forms. Preserve existing action paths where practical; update their callers and acceptance tests if return destinations change. Allow only validated local return destinations.

Add a small application-owned stylesheet and progressive-enhancement script, served from explicit same-origin asset routes with fixed filenames/content types. Keep `default-src 'none'`, `form-action 'self'`, `frame-ancestors 'none'`, no-store authenticated responses, escaping and current Host/origin checks; add only the needed `style-src 'self'`, `script-src 'self'` and `connect-src 'self'`. No inline event handlers, unsafe-inline, CDN fonts or new packages. Forms, navigation and critical confirmations must work without JavaScript. A SPA/framework or new API service adds deployment and state synchronization work with no demonstrated benefit here.

### 2. Use apple-design as the primary UI reference, translated to the web

On this machine `apple-design` is an installed MCP service at `/home/aiden/.local/share/mcp/apple-design-mcp`, not a standalone skill file. Its README instructs searching HIG topics, fetching relevant pages and citing Apple source URLs. The reference service and relevant pages were read before these design decisions. These references inform the design; the measurements and CSS choices below are PasarPilot decisions, not native Apple platform requirements.

| Primary reference | PasarPilot application |
| --- | --- |
| [Layout](https://developer.apple.com/design/human-interface-guidelines/layout), [Sidebars](https://developer.apple.com/design/human-interface-guidelines/sidebars) | Put work awaiting action first, group related transaction facts, disclose secondary detail progressively, and retain the same destinations across narrow and wide layouts. |
| [Typography](https://developer.apple.com/design/human-interface-guidelines/typography) | One system font stack, clear heading/body/secondary roles, readable regular/medium weights, scalable text and aligned amounts. |
| [Buttons](https://developer.apple.com/design/human-interface-guidelines/buttons), [Feedback](https://developer.apple.com/design/human-interface-guidelines/feedback) | Clear action verbs, restrained emphasis, visible press/focus/pending states, outcomes beside the affected record and explanations for unavailable actions. |
| [Motion](https://developer.apple.com/design/human-interface-guidelines/motion) | Brief transitions only where they explain interaction; respect reduced motion and never delay transaction controls. |
| [Accessibility](https://developer.apple.com/design/human-interface-guidelines/accessibility), [Dark Mode](https://developer.apple.com/design/human-interface-guidelines/dark-mode) | Semantic controls, keyboard and screen-reader support, enlarged text, non-color state labels and semantic colors tested in both appearances. |

Component expectations, implemented in existing render functions with shared small HTML helpers only where repeated:

- **Application shell:** Seller identity and synthetic-mode label, skip link, visible current destination, consistent page heading, compact navigation and a readable content width. Use one ordinary navigation landmark: leading column on wide screens, wrapping links on narrow screens. No custom gesture navigation or nested sidebar tree.
- **Work lists:** Compact aligned rows with card/printing/condition, buyer, independent status labels, money and a contextual link. Stack row fields at narrow widths. Use whitespace and subtle separators; edit forms and raw source/snapshot detail open on demand. Critical state, amount and next step remain visible outside disclosures.
- **Type/spacing:** `system-ui` font stack; body at least `1rem` (16 CSS px at default settings), comfortable line height about 1.5, relative heading sizes and tabular numerals for amounts. Use a small 4/8/12/16/24/32 CSS px spacing scale expressed in rem. Do not shrink the whole dashboard or hide important content to fit mobile.
- **Color/surfaces:** Neutral page/surface/text/border tokens, one action accent and restrained semantic warning/error/success colors. Follow `prefers-color-scheme` with `color-scheme` and light/dark token values; no new appearance preference storage. Status meaning is always written in text. No blur, glass effect, decorative analytics, stock photography or downloaded Apple fonts/symbols.
- **Controls:** Native labeled inputs, selects, textareas, buttons and disclosures; one primary next action per local task group, secondary edit/navigation links and separated critical actions. Touch controls target at least 44 by 44 CSS px with spacing. Explicit hover, active, focus-visible, disabled and pending appearances; explain disabled states in text.
- **Feedback:** Show a pending label immediately after submission when JS is available, prevent repeated clicks in that form and restore controls after a recoverable failure. Confirm committed results only from the server. Field errors use labels, `aria-describedby`/`aria-invalid`, a linked error summary and retained safe values; never redisplay passwords or tokens. Successful redirects return to the affected record with a concise status message.
- **Motion:** At most 100–200 ms opacity/color transitions for controls or a newly revealed status. No animated list reordering, auto-scrolling, continuously animated background or delayed controls. Under `prefers-reduced-motion: reduce`, remove nonessential transitions and smooth scrolling; preserve equivalent text feedback.

UI acceptance covers 360×800 and 390×844 narrow views and 1280×800 desktop, plus reflow at 320 CSS px and 200% zoom. No page-level horizontal overflow, clipped amounts or hidden critical actions. Check normal text at 4.5:1 contrast, large text and essential control/focus boundaries at 3:1 in both appearances. Complete the workflow by keyboard with visible, unobscured focus; manually inspect a screen-reader pass and record device/tool limitations. Use existing Playwright screenshots and keyboard/semantic assertions; no dashboard/design-system dependency is needed.

### 3. Give sellers a task-oriented workspace and honest state labels

| Destination | Default content and primary relationships |
| --- | --- |
| Overview | Compact queues for intervention, proposed responses, awaiting payment confirmation and paid orders awaiting fulfilment; latest 20 activity entries. No revenue charts. |
| Inventory & WTS | Available/unsold/reserved stock, open/closed listings, mapped items, ordered claims/backups and links to related conversation/order. Inventory and listings can be subviews. |
| Conversations | Buyer/thread/item context, intervention reason, proposed and approved simulated responses; link to review and any associated order. |
| Orders | Active filters for payment and collection/postage, completed/cancelled/expired history; detail with linked listing/conversation, reservation, payment, fulfilment, proposals and paged activity/snapshots. |
| Settings & help | Display profile, current payment-instruction approval, negotiation explanation, checklist and guided synthetic demo entry. |

Attention means an unresolved review, response proposal or current seller task; ordinary conversation must not be labeled as a review merely for existing. New claims appear in recent activity with their source time/position and current disposition, without inventing unread/read state. A backup shows ordered position and no reserved entitlement. Display both reservation and order state, including expired/released/cancelled explanations. Payment evidence is explicitly unverified, approved simulated delivery is not a bank receipt, posted/dropped-off is not collected/delivered, and paid is not completed. Render database deadlines with readable local time and timezone; client countdowns are advisory.

Direct detail links must work beyond the first page of any list and never depend on a matching row being loaded into the overview. Preserve filters on return. Arbitrary UUIDs are secondary detail, not primary labels. Foreign/missing resources return the same safe not-found result.

### 4. Make onboarding a checklist over existing records

Operator provisions the existing two invited accounts using secure stdin setup on a new private dataset; no registration screen or password-reset product. Login introduces synthetic scope and points to the checklist. Add only `display_name` (bounded plain text) and `profile_version` on the seller row; no buyer contact, bank or identity fields in the profile. Backfill display name from login, keep login immutable and qualify updates by session seller and profile version, with transactional activity.

Checklist: sign in; save display profile; add first MTG variant; create WTS listing; map inventory/offered quantity; configure and explicitly approve synthetic payment instructions; read negotiation/intervention guidance. Derive configuration progress from scoped database facts; `profile_version > 1` indicates the default profile has been explicitly saved. Guidance remains an always-available checklist link rather than a separately persisted completion flag. No generic onboarding engine or separate copy of transaction state. Steps remain accessible, can be done in any safe order and survive logout/restart. Missing prerequisites link to the existing form rather than duplicating it in a wizard.

Defaults remain English/nonfoil/NM, quantity one, explicit MYR 10.00 for the sample, negotiation disabled and unapproved payment sharing. Explain that private minimum prices are not buyer-visible and supported exact claims may reserve automatically while ambiguous claims, changed sources, late/mismatched payments or uncertain associations require intervention. Onboarding never approves instructions, delivers replies or verifies money implicitly.

### 5. Confirm critical intent and retain database authority

Add a server-rendered review/confirmation step for payment verification, unpaid cancellation and transaction completion. GET of a review page is read-only; the final action remains a CSRF-protected POST. Keep critical actions separate from ordinary Save/Approve controls. Present buyer, variant, quantity, amount, current state/version and consequences: payment commits stock, unpaid cancellation releases stock and may promote a backup, completion requires actual receipt/handover. Require an unchecked explicit confirmation for cancellation/completion; retain the existing trusted-account/COD attestation and manually entered exact amount for payment. Use a safe return/cancel option and no destructive default focus. Confirmation fields are validated server-side even without JS.

This UX does not create a second authorization mechanism or bypass domain functions. On final submission recheck session, tenant, CSRF, expected version, database-time hold, review blocks, fee/instruction dependencies and existing payment/fulfilment guards. A two-tab race returns the current relevant state and a next action, never silently resubmits against a newer version. Invalid fields retain safe input; session expiry prompts reauthentication without retaining payment details in a URL/localStorage. An ambiguous response loss prompts inspection of current state/history before retry. Preserve existing idempotent completed-command semantics; a replay can report already applied, but never apply twice.

### 6. Bound every seller read instead of silently hiding record 201

Use page size 25, a validated maximum of 100, allowlisted filters and keyset continuation links. Return at most page size plus one rows to detect continuation. Ordinary catalog/entity lists can use stable `(seller_id,id)` ordering; do not label UUID order as recency. Use activity identity ordering for the activity feed; messages/deliveries use `(created_at,id)`. Order history uses a creation timestamp plus ID, added/backfilled by a migration only where needed: use attributable earliest order activity when available and document fallback migration time for legacy rows. Do not fabricate historical times from UUIDs. Preserve earlier/back-to-newest navigation and filters in validated cursors; cursors grant no tenant authority. Bound cursor length and page/filter inputs and use parameters for SQL values.

Query only the selected section. Fetch one detail and its paged children using seller-qualified joins/EXISTS; replace the unbounded draft/source reference array in timeline. Keep all historical instruction snapshots accessible through bounded pages. Related inventory/item selectors need a server-side search/page flow retaining the chosen owned ID, not a dropdown containing every inventory row or only the first 200. Page claims/backups and show their true source-order rank; paging does not change priority. Queries must not require all messages/claims/orders in memory to find associations. Add only indexes justified by representative plans (likely seller plus list ordering/state and order/conversation child references). Primary-key scans that suffice stay unchanged. No Redis, materialized dashboard cache or exact total-page counting requirement.

Measure query plans, returned rows, response sizes and database timing at 250 and 1,000 orders per seller, plus more than 200 inventory/items/messages/drafts/reviews/activity records and one long conversation/order timeline. Expected clean loopback p95: list/detail/filter/update GET <=500 ms, ordinary mutation including redirect <=1 s, asynchronous synthetic work visible <=10 s with worker running. Record samples, hardware, workload and worst cases; these are acceptance targets, not SLAs. Tune SQL/rendering first if they fail; do not change targets after seeing results without recording the deviation.

### 7. Offer small, non-disruptive freshness updates

Add an authenticated, tenant-scoped read-only update endpoint returning bounded recent activity summaries and attention summaries, without full messages, addresses, instruction bodies or a history dump. Poll at most once every 10 seconds per visible tab, one request in flight, pause when hidden and back off on failure up to 60 seconds. Read only persisted local trading data; no scheduler/browser calls. Display last successful dashboard check and an offline/degraded/relogin state; distinguish that check from source completeness or worker health.

Update only the read-only recent/attention area or announce that newer data is available with an explicit link to refresh the current list/detail. Never replace forms, version fields, selections, focus or scroll under the seller. Recent activity is a bounded current window, not a guaranteed event stream; complete history is paged separately. Avoid relying on `max(activity.id)` as proof that every smaller ID committed: PostgreSQL identities can commit out of order. Fetch the bounded window each time. No-JS users retain normal refresh/navigation and a timestamp; no websockets/SSE connection management is justified by this demo.

### 8. Test operations with finite workloads and narrowly fix measured failures

Extend the existing test tooling with one finite browser-free runner using Node HTTP clients/domain helpers, existing synthetic intake and existing host/database metrics. Require an explicit private disposable dataset/output path, store credentials through existing protected setup, record source revision/seed/limits and stream samples/results to owner-only files. Do not point fault tests at seller demonstration data or shared homelab databases. Preserve partial runs and failed attempts. Keep workloads serial within a seller, with at most two active seller scenarios; no unbounded `Promise.all` or in-memory history aggregation.

| Stage | Work and evidence |
| --- | --- |
| Preflight | Verify owned dataset/container labels, private socket, schema/runtime role, disk headroom and no browser/scheduler dependency. Record 60-second idle service/host baseline, service inventory and configured guards. If headroom is insufficient, report blocked; do not stop unrelated services. |
| Clean soak | 60 minutes, two existing sellers, one fresh one-unit transaction per seller every 30 seconds (120 each, 240 total), using claims A/B, approved simulated instructions, exact seller verification, collection and completion. Two concurrent HTTP sessions; cycle IDs/events are stable for replay. Record every planned outcome and per-operation timing. |
| Growth | Separate bounded stage reaching 250 then 1,000 orders per seller using normal domain transitions in small batches; include >200 related records and a long thread. Page through complete expected sets, exercise late-page edits/associations and inspect plans/latency/storage. Cap additional database growth at 512 MiB and run evidence at 256 MiB, aborting and retaining results at either limit. |
| Recovery | Separate named cases: inventory edit below held quantity; unpaid cancellation and database-time expiry promoting B; simultaneous last-unit claims and payment/expiry; duplicate/conflicting events; source gap; session expiry/revocation; database disconnect/reconnect; application restart with pending/held/paid states; interruption before commit and after commit before acknowledgement/HTTP response. Restart only the verified test database/application. |
| Dependency outage | Scheduler stopped, no Chromium process or model credentials, capture unset: full sale and expiry still work. With capture explicitly enabled but missing/unavailable, record degraded import while local expiry and healthy seller processing continue; never fabricate source events. |
| Settlement | Drain accepted work, verify 240 clean completed sales and one stock commitment per sale, compare all expected states and replay counts, then collect two five-minute settled windows and private database/table/queue/disk totals. |

Use one-second streaming samples for host MemAvailable/CPU/PSI/swap, application+worker RSS/CPU and simultaneous database cgroup memory/CPU/OOM; record pool wait/usage, statement failures/latency, pending inbox/queue size/age and database/table/index sizes at stage boundaries. Adapt existing helpers explicitly: `sampleServices` measures its own process RSS, so a separate runner must obtain the actual serve process RSS and account runner overhead separately. Do not sum independent maxima as simultaneous memory or call process RSS unique physical memory.

Resource gates: preserve the configured host guard and existing 1.5 GiB service envelope; keep the existing database 768 MiB/no-swap cap. No service OOM, host swap-out growth or configured PSI breach; combined concurrent app/worker+database <=1.5 GiB. Settled application RSS mean in the second window must be <=64 MiB above the first at the same record count and drained workload. Abort new work on pressure/disk breach, preserve accepted transactions and report failure/inconclusive sampling explicitly. No automatic host tuning, cache eviction, global prune or Minecraft/service stop. A browser regression run is a separate prepared-host gate under unchanged admission and any existing owner approval rule.

Reliability gates: zero lost committed changes, cross-tenant leaks, extra sales/deliveries or stock violations; every predeclared clean transaction succeeds; expected validation/fault rejections are reported separately. Healthy processing resumes within 30 seconds of database readiness/application restart with already-expired holds reconciled before a conflicting mutation. Startup while PostgreSQL returns `57P03` must fail clearly with retained data and a safe retry instruction or use a bounded readiness retry, never reseed. If reconnect tests expose unhandled idle-pool errors or optional importer failures blocking expiry, fix those boundaries in existing modules, preserve transaction errors/rollback and test them. Retain the current 100-event/100-expiry bounds unless measured latency/fairness requires smaller batches. No queue redesign.

Growth is retained audit evidence, not permission to delete transactions. Document measured bytes/order and projected disk needs with limitations. Keep business/activity/instruction records; use existing pg-boss maintenance for its terminal jobs only, verifying configured queue retention. Document owner-controlled backup/restore and eventual archival/retention work; do not add automated destructive retention.

### 9. Preserve security and produce a self-contained seller demo

Extend tenant/security tests over every new detail route, cursor/filter, update response, profile write and confirmation. Check colliding IDs and direct foreign-ID substitutions. Preserve scrypt/session hashing, HttpOnly/SameSite cookies, expiry/revocation, generic bounded login failures, input validation, escaping, parameterized SQL, CSRF and same-origin checks. Verify the runtime cannot perform DDL in business/scheduler schemas, write migration records or update/delete audit records, and runtime is never the provisioning superuser. Keep only the existing pg-boss permissions within its owned `trading_queue` schema; tighten migration-table INSERT grants if the role probe exposes them. Global diagnostic events use fixed codes, operation timings and opaque correlation IDs; no form bodies, cookies, passwords, buyer text/address, payment instructions or evidence in stdout/reports. Audit records remain seller-visible and transactional.

Provide a guided demo page using existing catalog forms and `/synthetic` controls, selected owned item and existing buyer actors. It offers named A claim / B backup steps through the same authenticated event boundary, then links to the appropriate order controls. Demo labels remain visible throughout, and no control auto-confirms a seller's payment or fulfilment. Repeated step submission reuses stable per-run event identity/position through the shared intake path; a new run creates a new synthetic listing/item and preserves previous history. Serialize synthetic next-position allocation with the existing trusted source lock or equivalent transactional shared helper; update HTTP and CLI generator callers together, without changing normalized identity rules. Do not invent identity on retry after an uncertain response.

Operator guide: one private setup/build/start phase; login and all nine sale steps thereafter in the browser; inspection of final sale and backup outcome; separate expiry/ambiguity examples; same-dataset restart/migrate/recovery; protected credentials; backup and restore of a selected dataset to a separate private location; scoped shutdown with data retained. Supply exact implemented commands at implementation time, not invented CLI options in this proposal. Demo can run twice without deletion or duplicate sales. No extra buyer account application, fixture browser or live platform is required.

Document future external-access requirements only: authenticated TLS entry point and Secure cookies, proxy/Host/origin/session policy, login protection/account provisioning and revocation, secret and database/network isolation, backup/restore and retention/privacy/access policies, logging/monitoring and a security review. Meta permission and production buyer identity/order completeness remain separate unresolved gates. Do not expose listeners, configure a reverse proxy or claim compliance in this change.

### 10. Acceptance gates and implementation order

| Gate | Required proof |
| --- | --- |
| Seller usability | Invited onboarding and guided sale succeed on desktop/mobile; seller can identify backup, proposal, evidence, verification and fulfilment states, and navigate related records. |
| UI quality | Both appearances, reduced motion, no-JS core flow, keyboard path, contrast, zoom/reflow and safe error recovery meet the workspace scenarios; screenshots and manual screen-reader observations retained. |
| Safety | New-route tenant/CSRF/auth/version/critical-confirmation tests pass; existing stock, order, response and audit invariants stay unchanged. |
| Boundedness | All selected views/children/selectors page past 200; returned rows capped; plans and latency meet declared growth targets without full history loading. |
| Reliability/resources | Clean finite soak and named recovery cases pass correctness, latency, recovery and resource gates with sanitised evidence and disclosed gaps. |
| Regression | Existing TypeScript, benchmark units, scheduler database checks, trading units/database/dashboard checks, and prepared-host fixture recovery suite pass; strict OpenSpec validation passes. Missing host evidence remains explicitly blocked, not waived. |

Implement read/query bounds first, then the shell/profile/checklist, contextual actions and freshness, guided demonstration, operations/fault fixes and acceptance documentation. Reuse existing tests rather than repeat every domain scenario through multiple UI paths. No implementation work occurs during Propose.

## Risks / Trade-offs

- [Polish obscures transaction meaning] → Keep independent textual states, amounts and deadlines visible; assess comprehension alongside screenshots.
- [Pagination loses context or excludes a chosen inventory row] → Direct scoped details, bounded child queries and explicit paged selectors; test records beyond 200 with active transactions.
- [Polling overwrites work or exposes private data] → Read-only bounded summaries, hidden-tab pause, safe backoff and no automatic form replacement.
- [Concurrent demo generation creates stream-position conflicts] → Reuse stable run identities and serialize position allocation at the shared existing intake boundary; test both HTTP and CLI callers.
- [Database reconnect or optional capture blocks local work] → Controlled fault tests and focused pool/worker fixes; domain expiry checks remain authoritative during downtime.
- [A finite soak misses leaks or larger sellers] → Publish exact load/duration/storage bounds, retain evidence and describe the tested envelope without a production SLA.
- [Migrations/index creation affect active trading] → Additive versioned migration on a backed-up private dataset with serving stopped; do not modify scheduler schemas or reset accounts.
- [Single-developer scope grows] → One CSS layer, small progressive enhancement, fixed checklist and existing synthetic controls; no custom component framework, analytics or new infrastructure.

## Migration Plan

1. Back up the explicitly selected private dataset; prove restore to a different private test location. Preserve sources/epochs, sessions, agreements, audit records and scheduler metadata.
2. Stop only the owned trading process; run the existing migration command as the provisioning role. Add profile/version and required ordering/index changes; backfill safely and extend schema-version checks and role grants. Test both fresh setup and upgrading versions 1/2 with pending, held, paid and completed records.
3. Start the updated loopback server/worker as `trading_runtime` against the same socket. Do not rerun fresh-account setup, change source identities or start capture implicitly. Confirm scoped pages, expiry reconciliation and session behavior.
4. Run demo/operations on separate synthetic datasets and record acceptance. Correct stale README claims and link the new operator guide and sanitised report.
5. Rollback stops the updated app and new intake without deleting data. Retain database, evidence, sources and reservations for recovery. The old binary rejects a newer schema: do not promise a blind binary downgrade or drop columns to force it. Use a compatible corrective release, or an operator-chosen pre-upgrade backup only after reconciling any newer accepted transactions. Do not restore paid stock automatically.

## Open Questions

No product choice blocks this plan. Invited-seller language preferences and navigation feedback can refine labels after a synthetic walkthrough. Latency/resource sufficiency and the smallest justified indexes remain measurement questions resolved by the predeclared acceptance runs; larger scale, long-term archival and secure external access require separate evidence and scope.
