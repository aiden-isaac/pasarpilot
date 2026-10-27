# seller-trading-workspace Specification

## Purpose

Define the authenticated seller workspace for isolated MTG inventory, mapped synthetic WTS listings, review, conversations and transaction history.

## Requirements

### Requirement: Authenticated seller sessions

The application SHALL provide operator-provisioned seller accounts and password login/logout. It MUST store salted password hashes and hashed opaque session tokens, enforce expiry/revocation and bounded login throttling, and return generic login failures. Cookies SHALL be HttpOnly and SameSite=Strict, with Secure required for HTTPS. The demonstration SHALL bind only to loopback and MUST NOT reuse Facebook credentials, browser profiles or history-unlock secrets for application login.

#### Scenario: Login and logout
- **WHEN** a provisioned seller supplies valid credentials
- **THEN** a fresh session grants access to that seller's workspace
- **AND** logout or expiry invalidates further use of the session

#### Scenario: Unauthenticated or repeated failed access
- **WHEN** a request has no valid session or repeatedly submits invalid login credentials
- **THEN** protected data is withheld and login attempts are bounded without revealing account existence

### Requirement: Seller isolation at every boundary

The application SHALL derive seller scope from authenticated context or a trusted fixture mapping, qualify all reads/writes by that scope and enforce seller-consistent parent references in the database. Seller IDs supplied in request payloads MUST NOT grant access. Inventory, listings, events, conversations, jobs, drafts, orders, reviews and histories SHALL remain isolated even when source IDs or buyer names collide. Runtime database access SHALL use a restricted application role.

#### Scenario: Cross-seller identifier substitution
- **WHEN** seller A requests or mutates seller B's item, order, conversation, response or review by guessing an ID
- **THEN** the operation reveals no B data and changes no state for either seller

#### Scenario: Colliding fixture identities
- **WHEN** two sellers ingest events with the same source event ID, buyer label and item reference
- **THEN** each event resolves only within its established seller mapping and cannot link across sellers

### Requirement: Safe and accessible dashboard actions

The dashboard SHALL use authenticated server-validated forms, CSRF protection, same-origin checks, escaped source/user text, bounded input sizes and optimistic versions for mutable actions. It SHALL expose labeled controls, keyboard-operable forms, readable status/error messages and explicit stale-action conflicts. No state change SHALL occur through a GET request or merely opening a page.

#### Scenario: Forged, unsafe or stale form
- **WHEN** a mutation lacks valid CSRF context, contains invalid values or targets an outdated record version
- **THEN** it is rejected without partial effects and the seller can see the relevant failure or refresh requirement

#### Scenario: Untrusted conversation text
- **WHEN** a listing or message contains HTML/script-like text
- **THEN** the dashboard displays it as text and it cannot execute code or change seller state

### Requirement: Explicit MTG inventory and MYR values

Sellers SHALL manage inventory identified by card name, printing/set, collector number, language, finish/variant and condition, with nonnegative unsold quantity, reserved quantity and explicit MYR unit price. Available quantity SHALL equal unsold minus reserved. Distinct variants/conditions MUST NOT be merged automatically. Monetary values SHALL be integer sen with validated decimal input and checked arithmetic; invalid quantities, fractional sen, negative values and overflow MUST be rejected. Inventory reductions MUST NOT consume units held for another order.

#### Scenario: Different variants of one card
- **WHEN** a seller adds nonfoil/NM and foil/LP copies of the same named card
- **THEN** they have separate stock and prices and a claim against one cannot consume the other

#### Scenario: Invalid stock or price edit
- **WHEN** a seller tries to reduce unsold stock below active reservations or submits invalid money/quantity arithmetic
- **THEN** the entire edit is rejected and previously agreed orders remain unchanged

### Requirement: WTS posts and mapped item comments

The seller SHALL create a synthetic WTS post with one or more item comments, each mapped explicitly to exactly one owned inventory variant and a positive offered quantity/price snapshot. Nested buyer replies SHALL retain their parent item reference. Listing/item closure SHALL block new allocations without silently cancelling existing orders. Edits SHALL preserve versions and existing agreement snapshots; offered quantity cannot fall below its held/committed allocation. Automatic image/catalog recognition and multi-item carts are outside this capability.

#### Scenario: Create a mapped listing
- **WHEN** a seller publishes a WTS listing with two different item comments
- **THEN** each comment shows its own variant, condition, offered quantity, MYR price and nested claims

#### Scenario: Shared stock across listings
- **WHEN** two item comments or listings reference the same inventory row
- **THEN** their displayed sellable availability reflects shared stock and reservations cannot exceed either global stock or a comment's remaining offered allocation

### Requirement: Small seller workflow views

The dashboard SHALL provide inventory/listing management, nested claims and backup positions, conversations with item/order associations, response proposals, an ambiguity/review queue, order/payment/fulfilment detail, transaction history and an activity timeline. Synthetic source and simulated delivery states SHALL be visibly labeled. Review actions MUST show relevant context and reasons; no dashboard view may imply that a proposal was sent or buyer evidence verified payment.

#### Scenario: Review and follow a transaction
- **WHEN** the seller opens an order or review task
- **THEN** its listing item, buyer/thread context, current reservation, payment, fulfilment, proposals and chronological activity are accessible without opening Chromium
