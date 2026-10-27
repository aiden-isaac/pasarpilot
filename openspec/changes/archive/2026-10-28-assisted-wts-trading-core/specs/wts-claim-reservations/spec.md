## ADDED Requirements

### Requirement: Clear primary backup and ambiguous claims

The system SHALL classify exact `claim [positive quantity]` and `backup [positive quantity]` replies against a known item parent and stable buyer actor, defaulting quantity to one. A clear claim SHALL become primary only after successful full allocation; insufficient availability SHALL produce a queued backup. An explicit backup SHALL remain standby without reserving on arrival. Conditional, mixed-item, contradictory or unresolved claims SHALL require seller review with no stock effect. A distinct repeated claim by a buyer with an active order for the same item SHALL require review rather than silently increment quantity.

#### Scenario: First claim and competing buyer
- **WHEN** buyer A clearly claims the sole available unit and buyer B then claims the same listing item
- **THEN** A has one primary hold/order and B is a queued backup with no second reservation

#### Scenario: Ambiguous or repeated claim
- **WHEN** a buyer writes a conditional claim, references several items or repeats a claim already represented by an active order
- **THEN** the seller receives a contextual review task and stock is not allocated again automatically

### Requirement: Atomic reservations across shared inventory

Allocation SHALL lock and validate seller-scoped inventory, listing capacity and active order/claim state in a consistent database transaction. It SHALL reconcile expired holds and reserve the entire requested quantity only when both global availability and listing remaining quantity suffice. Reservation/order creation, consumed event result, relevant proposal and timeline changes SHALL commit together. Database constraints MUST prevent negative stock, reserved quantity above unsold quantity and duplicate active allocation for the same claim. In-memory/browser locks alone MUST NOT protect stock.

#### Scenario: Concurrent claims for the last unit
- **WHEN** two independent database connections try to allocate the same last unit, including through different listings
- **THEN** at most one active reservation succeeds and no negative/oversold inventory or partial order is committed

#### Scenario: Failure within allocation
- **WHEN** processing stops after a stock update but before order/event-result commit
- **THEN** the transaction rolls back or recovers as one committed allocation, and replay creates no extra hold

### Requirement: Complete quantity and agreement snapshots

Each order SHALL cover one listing item/variant with a positive integer quantity and a snapshotted MYR unit price, condition, quantity and policy references. Allocations SHALL be all-or-nothing; no silent partial fulfilment or substitution SHALL occur. Monetary calculations SHALL use checked integer sen and validate overflow. Later listing/inventory changes MUST NOT silently alter an existing agreement. Negotiated acceptance SHALL use the same atomic stock/price guards, reusing a valid existing hold rather than allocating it twice.

#### Scenario: Quantity exceeds availability
- **WHEN** a buyer requests two units and only one can be allocated
- **THEN** no one-unit sale is silently created and the full request becomes backup or requires explicit review

#### Scenario: Price or variant changes later
- **WHEN** the seller changes current inventory price or adds another finish after an order is reserved
- **THEN** the order retains its agreed variant, condition, quantity and price unless an explicit valid reviewed amendment is recorded

### Requirement: Unpaid cancellation expiry and extension

Unpaid holds SHALL have a 15-minute default deadline measured by database time. Cancellation/expiry SHALL release a held quantity once, update the order/claim and evaluate backup promotion in the same transaction. Repeated requests or delayed expiry jobs MUST NOT release stock twice. Startup/periodic sweeps and every relevant mutation SHALL check actual expiry independently of queue availability. Seller extension SHALL require current version, a live unpaid hold and a future deadline no more than 24 hours from the action; expiry cannot be undone by extension. Paid/committed stock MUST NOT be released by the unpaid expiry path.

#### Scenario: Expiry job is late after restart
- **WHEN** a hold has expired while the worker was stopped and payment or a competing claim is attempted
- **THEN** database-time reconciliation expires it before validating the action, with exactly one release

#### Scenario: Repeated cancellation or invalid extension
- **WHEN** cancellation is retried or a seller attempts to extend an expired/paid/stale hold
- **THEN** cancellation has at most one release effect and the invalid extension cannot resurrect or free stock

### Requirement: Deterministic backup promotion

On unpaid release, the system SHALL promote the earliest fully fillable eligible backup for the same open listing item using reliable source position and stable ID as tie-breaker. Promotion SHALL create a fresh guarded hold/order and response proposal atomically. A withdrawn, expired, ambiguous or already allocated claim SHALL NOT be promoted again. Backups on other listing comments SHALL remain visible for explicit seller promotion through the same stock guards; this change does not invent cross-listing chronological priority. Exhausted sold listings SHALL mark remaining backups unfulfilled rather than silently waiting for future restocking.

#### Scenario: Primary cancels or expires
- **WHEN** a primary unpaid hold releases its only unit and an eligible backup exists on that item
- **THEN** one backup is promoted with a new deadline and proposed notification, and another concurrent claim cannot take that unit as well

#### Scenario: Listing is closed or allocation already committed
- **WHEN** a backup is considered after closure, a committed sale or its own prior terminal outcome
- **THEN** no invalid promotion occurs and the seller sees its unresolved or unfulfilled disposition

### Requirement: Explicit manual intervention without invariant bypass

Seller review SHALL show raw synthetic context, source identity/revision, interpretation, priority and relevant stock/order state. A seller SHALL be able to associate an item/buyer, resolve quantity/intent, reject a claim, cancel a live unpaid hold or explicitly promote an eligible backup, recording a reason and expected version. Reviewed allocation SHALL still enforce seller scope, capacity, price and expiry. Ambiguous claims gain no automatic stock priority until resolved, and review MUST NOT silently displace an existing hold or alter verified payment.

#### Scenario: Seller resolves an unclear claim
- **WHEN** the seller maps an ambiguous reply to one item, buyer and quantity and confirms a current interpretation
- **THEN** normal atomic allocation determines primary versus backup, the review closes once and the decision appears in history

#### Scenario: Review races with another allocation
- **WHEN** a seller resolves a review using a stale version or stock was reserved by another valid order
- **THEN** the operation reports the conflict or becomes backup without overselling or overwriting the other order
