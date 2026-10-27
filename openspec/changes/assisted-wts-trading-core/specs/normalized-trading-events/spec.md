## ADDED Requirements

### Requirement: Durable source-neutral event identity

Trading intake SHALL validate a versioned envelope with trusted seller mapping, source/epoch, stable event/object ID, revision, reliable stream position, kind, actor and parent/item/thread references, timestamps and bounded payload. It SHALL persist accepted intent and its browser-free processing wake-up atomically. Replaying the same seller/source/epoch/event/revision and content MUST NOT duplicate a claim, reservation, order, message, draft or timeline transition. Conflicting content under that identity SHALL be quarantined. Intake MUST NOT accept unauthenticated external buyer/platform messages in this change.

#### Scenario: Duplicate delivery across restart
- **WHEN** the same accepted synthetic event is delivered before and after worker restart
- **THEN** it has one durable interpretation and one set of business effects

#### Scenario: Malformed or conflicting event
- **WHEN** identity, seller scope, revision, quantity/payload fields or content consistency are invalid
- **THEN** intake rejects or quarantines the event with a reason and performs no stock/payment mutation

### Requirement: Reliable ordering and revision handling

The consumer SHALL apply fixture events in reliable source-stream order using a durable cursor and serialized processing. It MUST NOT infer first-claim priority from receipt time, display name or an ambiguous timestamp. Gaps/missing parents SHALL defer dependent effects; unsupported ordering SHALL require review. Edits/deletions of acted-on claims or binding messages SHALL create review and invalidate affected unsent proposals rather than silently undo reservations or paid agreements.

#### Scenario: Second claim arrives before the first
- **WHEN** stream position two is received while position one is absent
- **THEN** position two receives no automatic allocation until the ordered context is available or an explicit reviewed decision is recorded

#### Scenario: Reserved claim is edited
- **WHEN** a new source revision changes an already reserved claim
- **THEN** the prior agreement remains auditable and the change requires review without creating another hold or silently changing quantity/price

### Requirement: Browser-free processing with additive fixture capture

The direct synthetic generator and controlled browser fixture SHALL feed the same normalized boundary. Browser capture SHALL flush actual typed events durably, and trading import/processing SHALL occur only after the producing attempt's verified termination and profile release. Existing aggregate observation schema/counts and default benchmark workload SHALL remain valid; counts MUST NOT be fabricated into claim messages. A restart after capture/import/acknowledgement SHALL replay safely. The existing single-slot scheduler's isolation, admission, cancellation and reconciliation rules SHALL remain intact.

#### Scenario: Captured claim survives handoff interruption
- **WHEN** typed fixture events are flushed and the importer stops before acknowledging them
- **THEN** restart imports/processes them once after verified browser exit without repeating business effects

#### Scenario: Domain processing without a browser
- **WHEN** the same normalized events are replayed directly with Chromium stopped and no LLM available
- **THEN** claim, reservation, proposal and order decisions remain correct and use no browser slot

### Requirement: Explicit inquiry and conversation association

The system SHALL persist synthetic conversation/message state with seller, stable buyer actor and source-thread identities. It SHALL associate an inquiry using its validated item parent or explicit seller-confirmed mapping. An uncertain buyer identity, missing item or thread containing several plausible orders SHALL produce an unassociated/review state rather than an inferred match. Ordinary conversation and inquiries MUST NOT reserve stock or verify payment.

#### Scenario: Item inquiry and unrelated thread text
- **WHEN** a buyer asks about one known item and later posts unrelated conversation text
- **THEN** the inquiry is associated with that item while unrelated text has no inventory/payment effect

#### Scenario: Ambiguous thread context
- **WHEN** a message could concern either of two items/orders or the buyer's identity is not established
- **THEN** the seller sees the context and can explicitly resolve it without cross-linking another buyer or tenant

### Requirement: Deterministic proposals and approved simulated delivery

The system SHALL generate predefined response drafts for claims, backups, availability, clarification, prices, payment instructions and fulfilment using deterministic rules. Drafts SHALL record source/order/listing/policy versions and remain visibly proposed until seller approval. Approval SHALL revalidate relevant state, price, live hold and instruction versions; stale drafts SHALL require regeneration. Simulated delivery SHALL be idempotent by draft identity and visible in the synthetic buyer conversation. No live messaging or browser send SHALL occur.

#### Scenario: Proposal approval is retried
- **WHEN** the seller approves a current draft and the approval/delivery request is retried
- **THEN** the simulated buyer receives one outbound message and the timeline distinguishes proposal, approval and delivery

#### Scenario: Agreement changes before approval
- **WHEN** an instruction, source revision, applicable policy or order state invalidates a pending draft
- **THEN** approving that draft sends nothing and offers a current proposal for review

### Requirement: Seller-configured negotiation limits

Negotiation SHALL default to disabled and SHALL use an explicit seller-owned minimum unit price no higher than asking when enabled. An unambiguous MYR offer at/above the minimum can generate an acceptance proposal; an offer below it SHALL generate a decline/asking-price counter or review without disclosing the private minimum. Offers alone SHALL NOT reserve stock. Approval of an acceptance SHALL recheck policy version, money arithmetic and atomic allocation/price rules. No autonomous multi-turn negotiation or LLM decision SHALL be required.

#### Scenario: Acceptable and below-limit offers
- **WHEN** buyers offer prices above and below the configured minimum
- **THEN** deterministic proposals respect the limit, reveal no private floor and bind no new agreement before seller approval

#### Scenario: Limit changes or terms are unclear
- **WHEN** the minimum changes before approval or an offer contains unsupported conditional terms
- **THEN** the stale acceptance is blocked or the offer is escalated for review, without an out-of-limit agreement
