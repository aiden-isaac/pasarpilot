## ADDED Requirements

### Requirement: Durable separate transaction states

The system SHALL persist orders and separate reservation, payment, fulfilment and review state. Orders SHALL identify seller, buyer, listing item, quantity, immutable agreement snapshots and current version. Valid order stages SHALL include awaiting payment, paid, completed, cancelled and expired; sensitive transitions SHALL stop for unresolved blocking review. Restart/replay SHALL preserve states, and duplicate commands SHALL NOT repeat financial or inventory effects.

#### Scenario: Restart during an unpaid transaction
- **WHEN** the application restarts with an unpaid held order and conversation history
- **THEN** the same agreement and statuses are recovered, subject to database-time expiry, without another order or reservation

#### Scenario: Review blocks an unsafe transition
- **WHEN** an order has an unresolved amount, identity, source or agreement conflict
- **THEN** the seller can inspect/reconcile it but cannot silently advance a conflicting payment/completion transition

### Requirement: Seller-approved payment instructions

Payment instructions SHALL be configured and explicitly approved by the owning seller before sharing. A payment request SHALL snapshot the approved instruction version, current agreement, MYR total and buyer/order association. A postage fee SHALL be explicitly agreed before the final payable total; unknown charges MUST NOT be guessed. Generated requests SHALL remain proposals until seller-approved simulated delivery. Changed/revoked instructions SHALL invalidate unsent drafts while preserving what was already shared historically.

#### Scenario: Propose and deliver payment instructions
- **WHEN** an order has a live hold, known total and seller-approved instructions
- **THEN** the seller can review/approve a correctly addressed payment draft and the simulated buyer receives exactly that approved version

#### Scenario: Instructions or charges are unapproved
- **WHEN** instructions were never approved, their version changed, or postage cost is unresolved
- **THEN** no stale/unapproved final payment request is delivered and the seller sees the missing decision

### Requirement: Explicit seller verification of received payment

Only an explicit authenticated seller action confirming a trusted-account check of the exact due MYR amount SHALL mark payment verified. The transaction SHALL recheck order version, live hold, amount and blocking review, record seller/time/amount, commit the reservation and decrement unsold/reserved quantities once. Buyer assertions, receipt/screenshot references, message delivery and automated interpretation MUST NOT verify payment. Late payment after expiry, discrepancies and paid cancellation/refund requests SHALL require manual review without automatic restocking or revival of a lost hold.

#### Scenario: Buyer submits payment evidence
- **WHEN** a synthetic buyer says payment is complete or provides an attachment/reference
- **THEN** the order remains unverified and the seller sees evidence as a reviewable assertion only

#### Scenario: Seller confirms and retries confirmation
- **WHEN** the seller verifies the exact amount on a current live order and repeats the same action
- **THEN** payment is verified once, stock is committed once and subsequent expiry cannot release it

#### Scenario: Payment races with expiry or cancellation
- **WHEN** payment confirmation and hold expiry/cancellation run on independent connections
- **THEN** one valid state wins under shared stock/order locks; lost/expired reservations cannot also become paid, and any late funds require review

### Requirement: COD postage and collection progress

The seller SHALL record COD meeting/time/location, collection/shop drop-off arrangements or postage recipient/address, explicit fee and tracking details as appropriate. Agreed changes SHALL be versioned and auditable. COD cash receipt SHALL require explicit seller confirmation; recording an arrangement, dispatch or shop drop-off SHALL NOT by itself complete an order. Completion SHALL require verified payment and explicit seller-confirmed handover/collection or delivery. Fulfilment/completion MUST NOT decrement stock a second time.

#### Scenario: Collection or COD completes
- **WHEN** the seller confirms payment/cash receipt and records actual buyer handover/collection
- **THEN** the order can complete with recorded arrangement and completion evidence

#### Scenario: Parcel posted or cards dropped at a shop
- **WHEN** postage tracking or a shop drop-off is recorded before buyer receipt/collection
- **THEN** fulfilment shows that intermediate state and completion remains blocked until the required seller-confirmed receipt/collection

### Requirement: Transaction history and activity timeline

Each committed domain transition SHALL append seller-scoped activity with actor or source identity, timestamp, action, reason and record/version references in the same transaction. The dashboard SHALL show transaction history and a chronological order/conversation timeline covering claims, backups, holds/releases, review, proposed/approved/delivered replies, payment and fulfilment. Prior agreement/instruction snapshots SHALL remain available to the owning seller. Replay MUST NOT duplicate timeline effects, and credentials/payment details/unrelated conversations MUST NOT leak into global logs or another seller's history.

#### Scenario: Inspect a completed or cancelled trade
- **WHEN** the seller opens transaction history after restart
- **THEN** its decisions, proposed versus delivered messages, payment verification and fulfilment transitions remain attributable and understandable

#### Scenario: Event or command replay
- **WHEN** previously handled events, approvals, payment confirmations or completion commands are replayed
- **THEN** no extra reservation, sale, delivery or activity transition is created

### Requirement: Complete controlled WTS demonstration

Acceptance SHALL demonstrate through the authenticated dashboard and synthetic sources: seller creates a one-unit MYR listing; buyer A claims; stock is reserved; buyer B claims the same unit; overselling is prevented; the seller approves proposed payment instructions and simulated buyer delivery; the seller verifies received payment; collection or postage progress is recorded; the order completes only after actual fulfilment confirmation. Separate tests SHALL cover cancellation, expiry, backup promotion, manual ambiguity resolution, negotiation limits, tenant isolation and restart/replay/concurrency. At least one typed event handoff SHALL come from the existing bounded browser fixture and be processed after verified browser exit; the domain workflow SHALL also run without a browser or LLM.

#### Scenario: Smallest useful sale
- **WHEN** the controlled one-unit scenario is executed end to end
- **THEN** A has one completed paid order, B never oversells that unit, each business effect occurs once and the seller can inspect the full timeline

#### Scenario: Safety and resource gates
- **WHEN** the combined dashboard/database/consumer/scheduler demo is tested
- **THEN** existing scheduler regressions and fresh host admission/accounting checks pass or execution is reported blocked with its missing evidence
- **AND** no new infrastructure capability weakens the browser envelope, restarts unrelated services or bypasses any required owner approval

#### Scenario: Scope remains synthetic
- **WHEN** no OpenRouter key, Facebook account or payment provider is configured
- **THEN** the full controlled workflow and failure tests remain demonstrable
- **AND** the report keeps Meta authorization unresolved and makes no live-platform, payment-automation or production SLA claim
