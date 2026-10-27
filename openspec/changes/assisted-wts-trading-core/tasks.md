## 1. Establish the application boundary and schema

- [x] 1.1 Add the smallest trading entry point/module layout and separate unit/database/dashboard test commands in the existing TypeScript workspace; retain pinned packages and existing benchmark/scheduler commands without introducing another service stack.
- [x] 1.2 Add versioned trading schema migrations with seller-consistent composite keys, stock/quantity/price constraints, unique event/claim/delivery identities, orders/reservations, conversations/reviews and transactional activity records; provide a restricted runtime database role and non-destructive schema/version checks.
- [x] 1.3 Implement validated MYR-sen/quantity parsing, checked arithmetic and agreement snapshot helpers; test fractional sen, negative values, overflow, variant distinctions and immutable order totals.
- [x] 1.4 Add an explicit operator setup/seed command for two isolated seller accounts, synthetic actors/source epochs and fixture-tenant mappings; accept passwords securely without arguments/logging/Git and create a fresh private demo dataset.

## 2. Build authenticated seller inventory and listings

- [x] 2.1 Implement password/session storage, login/logout, expiry/revocation and bounded generic login failures using Node platform crypto; test that expired/revoked/forged sessions expose no data.
- [x] 2.2 Add the loopback HTTP server and seller-scoped request/SQL boundaries with CSRF/same-origin checks, escaping, input bounds and optimistic form versions; test cross-seller ID substitution, colliding IDs, unsafe HTML and stale/forged mutations.
- [x] 2.3 Add inventory forms/views for printing/set, collector number, language, finish/variant, condition, unsold/reserved/available quantities and MYR asking price; reject edits that consume held stock and preserve variant isolation.
- [x] 2.4 Add WTS post/item-comment creation, explicit inventory mapping, offered quantities, source-parent references and close/edit/version guards; render the item hierarchy and demonstrate shared stock across two listings without creating a cart.

## 3. Introduce normalized events and browser-free processing

- [x] 3.1 Define/validate the trading envelope and implement atomic inbox plus application-queue wake-up, stable event/revision/content deduplication and a direct synthetic generator; test duplicate intake, conflicting identities, malformed/foreign events and transaction rollback.
- [x] 3.2 Implement durable source cursors and ordered processing with gap/missing-parent deferral, edited/deleted acted-on source review and idempotent restart; test claim position two arriving before one without awarding incorrect priority.
- [x] 3.3 Persist messages/conversations and associate buyer inquiries through stable actors and item/thread mappings; expose unresolved associations and verify that unrelated/ambiguous text creates no stock or payment effect.
- [x] 3.4 Add deterministic template/rule helpers for claim acknowledgement, backups, clarification, price responses, payment and fulfilment; test stable outputs and explicit unsupported-context escalation without an LLM.

## 4. Implement atomic claims reservations and review

- [x] 4.1 Implement the narrow claim/backup grammar and classification, including ambiguous/conditional/multi-item requests and repeated claims against an active buyer/item order; test that only valid complete claims attempt allocation.
- [x] 4.2 Implement row-locked global/listing allocation with full-quantity guards, order/hold snapshots, unique active claims and atomic event-result/proposal/activity writes; test rollback and competing allocations through two independent database connections and two listings sharing one unit.
- [x] 4.3 Implement eligible backup ordering and guarded promotion, same-item automatic versus explicit cross-listing promotion, terminal/withdrawn exclusions and sold-out dispositions; test quantity fit, tie-breakers and no repeated promotion.
- [x] 4.4 Implement database-time 15-minute holds, idempotent unpaid cancellation/release, expiry wake-ups plus startup/periodic/lazy sweeps, bounded seller extensions and transactional backup promotion; test downtime, repeated jobs, expired extensions and cancellation/expiry/allocation races.
- [x] 4.5 Add seller review actions for association, quantity/intent resolution, rejection, unpaid cancellation and explicit promotion with reasons/current versions; reuse the stock/price guards and test stale review, lost availability and no silent displacement of another valid hold.

## 5. Add assisted responses negotiation and payment requests

- [x] 5.1 Persist versioned response proposals and implement seller approval plus transactional idempotent simulated delivery to buyer conversation records; test changed source/order/listing dependencies, duplicate approval and no browser/live-platform send.
- [x] 5.2 Add seller-configured negotiation enablement/minimum MYR unit price, deterministic offer proposals and guarded acceptance; test below-floor confidentiality, policy changes, unsupported terms, availability loss and reuse of an existing hold without double allocation.
- [x] 5.3 Add seller payment-instruction configuration and explicit sharing approval, instruction snapshots and exact payable totals with agreed fulfilment fees; block unknown postage cost and stale/unapproved instructions, and test that receipt references remain unverified.
- [x] 5.4 Complete the seller claim/review/conversation/order workspace with clearly labeled proposed/approved/delivered states, keyboard-operable forms and contextual errors; exercise the core listing-to-reservation-to-approved-payment-request path through Playwright.

## 6. Complete payment fulfilment and transaction history

- [x] 6.1 Implement explicit seller verification of trusted receipt/exact amount, guarded reservation commitment and one-time stock decrement; test buyer screenshot/payment assertions, repeated confirmation, late/incorrect amounts, payment-versus-expiry/cancellation races and paid-cancellation review without automatic restocking.
- [x] 6.2 Add COD, postage and collection/drop-off arrangements with fee/location/time or recipient/address/tracking as appropriate; require seller-confirmed payment and actual collection/handover/delivery before completion, preserving intermediate posted/drop-off states and preventing another stock decrement.
- [x] 6.3 Add transaction history and an order/conversation activity timeline with actor/source/time/reason/version references, agreement/instruction snapshots and filters; test restart visibility, tenant isolation, replay uniqueness and absence of credentials/payment details in global logs.

## 7. Prove the smallest useful demonstration and preserve infrastructure

- [x] 7.1 Add opt-in typed WTS event capture to the controlled fixture/worker while preserving the existing aggregate ledger and default counting workload; flush an attempt sidecar and import only verified-dead/released handoffs into the same trading inbox, with capture/import/acknowledgement crash-replay tests.
- [x] 7.2 Demonstrate the full authenticated one-unit MYR 10.00 sale: create listing, A claims/reserves, B becomes backup, seller approves simulated payment instructions, explicitly verifies payment, records collection and completes A's order with one auditable sale and no oversell.
- [x] 7.3 Add separate dashboard/database scenarios for unpaid cancellation, hold expiry and backup promotion, manual ambiguity resolution, negotiation limits, concurrent claims, cross-seller access, duplicate events/approvals and restart; prove the same domain decisions with no Chromium or OpenRouter dependency.
- [x] 7.4 Run one existing single-slot browser-backed capture-to-trade demonstration after a fresh combined application/database/worker/scheduler baseline and unchanged admission/ownership gates; obtain fresh owner approval only if stopping a running Minecraft service is necessary, preserve partial failures and perform scoped verified cleanup.
- [ ] 7.5 Run the existing and new TypeScript/unit/PostgreSQL/Playwright checks and strict OpenSpec validation; publish setup/demo/recovery/rollback commands and a sanitised acceptance report including resource results, retained evidence, scope limits and the unresolved Meta authorization gate, without archiving changes or deploying live integrations automatically.
