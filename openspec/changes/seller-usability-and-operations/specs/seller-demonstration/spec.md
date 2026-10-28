## ADDED Requirements

### Requirement: Guided synthetic seller sale

After one operator setup/start phase, an invited seller SHALL be able to complete the demonstration from the dashboard with no transaction-time CLI commands: open the workspace, inspect their mapped WTS item, observe A's claim, observe B as backup, approve simulated payment instructions, verify exact payment manually, record actual collection, complete the order and inspect final activity/history. The sample SHALL use one explicit synthetic NM nonfoil variant at MYR 10.00, quantity one and collection fee 0.00. Guided steps SHALL reuse current catalog/intake/proposal/payment/fulfilment functions and contextual links. Synthetic scope and simulated outbound delivery SHALL remain visible; no step SHALL automatically verify money or claim actual bank receipt.

#### Scenario: Seller completes the nine-step demonstration
- **WHEN** the seller follows the dashboard guide after setup
- **THEN** A receives one held then seller-verified completed order, B is an unreserved backup then unfulfilled after stock commitment, and unsold/reserved reach zero exactly once
- **AND** final order history explains claim, reservation, proposal, approved simulated delivery, manual verification, collection and completion

#### Scenario: Seller pauses at an unmet prerequisite
- **WHEN** payment sharing is unapproved, fee unknown, a hold expired or collection unrecorded
- **THEN** the guided step explains the actual prerequisite and links to its existing control or review path
- **AND** it cannot bypass the domain guard to keep the demo moving

### Requirement: Repeatable isolated demonstration data

Synthetic step controls SHALL be authenticated and seller-scoped, use existing actor/source mappings and preserve normalized event identity/order/deduplication. Retrying a step after response loss SHALL reuse its stable run/event identity rather than generate another business effect. Concurrent synthetic event generation SHALL serialize next-position assignment at the shared boundary used by both dashboard and CLI callers. A new demonstration run SHALL create distinct synthetic listing/item records and preserve previous history; fresh-account setup MUST NOT be reused as a reset mechanism. Testing and demonstration datasets SHALL remain separate.

#### Scenario: Retry and repeat the demonstration
- **WHEN** a claim-generation step is retried and a second complete demo run is later started
- **THEN** the retry has one source/business effect, the second run has separate records and both final histories remain inspectable without deleting/reseeding either

#### Scenario: Concurrent dashboard and CLI generation
- **WHEN** authenticated dashboard and operator CLI generation target the same trusted synthetic stream concurrently
- **THEN** distinct accepted events receive valid serialized positions, replay remains idempotent and no position collision silently loses an intended event
- **AND** colliding labels in another seller's stream cannot associate either seller's records

### Requirement: Demonstration guide and independent acceptance

The operator guide SHALL include exact implemented setup/start/login instructions, protected invited credentials, browser-only seller steps, expected visible states, final invariant checks and troubleshooting for stale forms, sessions, database readiness, expiry and interrupted runs. It SHALL distinguish the minimal sale from optional cancellation/backup-promotion, ambiguity and postage examples. Acceptance SHALL demonstrate desktop/mobile workflows and a browser-free HTTP/domain equivalent with browser scheduler/Chromium/AI unavailable. No live Facebook/Messenger, public access or real payment processing SHALL be implied.

#### Scenario: Operator prepares and recovers a demonstration
- **WHEN** an operator follows the guide on an owned private dataset, pauses/restarts the application and resumes from the dashboard
- **THEN** no accepted transaction is reset, current expired/paid state is clear and the guide permits safe inspection/recovery with scoped resources only

#### Scenario: Application has no browser or AI service
- **WHEN** the same sale is executed by browser-free clients with scheduler stopped, Chromium absent from the service and no AI credentials
- **THEN** every deterministic trading step succeeds and requires no browser slot or model call
- **AND** any Playwright used for separate UI acceptance is identified as a test client rather than an application dependency
