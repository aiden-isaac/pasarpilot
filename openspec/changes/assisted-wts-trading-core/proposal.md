## Why

The lifecycle experiment and durable fixture scheduler have proved bounded browser collection and recovery, but sellers still cannot manage a trade. The next useful milestone is a small authenticated workspace that turns synthetic WTS activity into safe reservations, seller-reviewed conversations, verified payment records and completed orders.

## What Changes

- Add a minimal authenticated seller dashboard for inventory, WTS listings/item comments, nested buyer claims, conversations, review tasks and transaction history.
- Represent MTG printings/variants, condition, quantities and seller-approved MYR prices explicitly; map each listing item to the seller's inventory rather than infer cards from images.
- Accept validated, seller-scoped normalized events from a synthetic generator and a controlled fixture adapter. Persist/replay events independently of browser execution and preserve reliable source order, revisions and deduplication.
- Distinguish clear first claims, backups, inquiries and ambiguous claims. Reserve complete requested quantities atomically across all listings sharing stock; release unpaid holds on cancellation/expiry and promote eligible backups deterministically.
- Persist orders, conversation context and an activity timeline. Produce deterministic response drafts and enforce seller-configured minimum prices, with seller approval before simulated delivery.
- Share only seller-approved payment instructions. A buyer's payment assertion or screenshot reference remains unverified; only an explicit seller action after a trusted-account check can confirm payment and commit stock.
- Track COD, postage and collection arrangements through actual handover/delivery confirmation. Demonstrate the full one-unit sale and competing claim, plus cancellation, expiry, backup promotion and manual intervention.

## Capabilities

### New Capabilities

- `seller-trading-workspace`: Authenticated, isolated seller access; MTG inventory and WTS listing management; a small dashboard with review and history views.
- `normalized-trading-events`: Durable source-neutral event ingestion, controlled fixture handoff, conversation association and deterministic response/negotiation proposals.
- `wts-claim-reservations`: Claim classification, atomic stock allocation, price snapshots, cancellation/expiry and backup handling.
- `assisted-order-lifecycle`: Seller-approved payment instructions, explicit payment verification, fulfilment, audit history and the complete simulated transaction.

### Modified Capabilities

None. `bounded-fixture-scheduling` remains the browser-infrastructure contract. New typed trading payloads and browser-free processing are additive; existing counting benchmarks and browser admission/ownership rules stay intact.

## Impact

- Extend the existing TypeScript/Node workspace under `benchmark/`, reusing pinned `pg`, `pg-boss`, Playwright tests, short-transaction conventions and protected fixture tooling. Add an application schema, a small server-rendered dashboard, a browser-free consumer and synthetic scenario commands; avoid a new service stack, ORM or frontend build pipeline.
- Touch fixture capture/worker handoff only where needed to persist actual typed events alongside existing observations. Preserve the version-1 aggregate ledger and existing scheduler commands/tests; those counts cannot stand in for claim content.
- Add database concurrency/isolation/replay tests and authenticated dashboard acceptance tests using synthetic sellers/buyers and MYR amounts. Measure the combined running workload before claiming the existing host budget still fits.
- Keep the unresolved Meta authorization and real-platform reliability gates documented. Production Facebook automation or live messaging, payment gateways, receipt-image verification, WTB, subscriptions, autonomous AI negotiation and multi-seller checkout/commerce are excluded. OpenRouter remains a future optional interpretation boundary; critical processing works without an LLM.
