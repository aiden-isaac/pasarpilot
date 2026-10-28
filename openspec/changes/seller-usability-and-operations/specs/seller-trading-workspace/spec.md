## MODIFIED Requirements

### Requirement: Safe and accessible dashboard actions

The dashboard SHALL use authenticated server-validated forms, CSRF protection, same-origin checks, escaped source/user text, bounded input sizes and optimistic versions for mutable actions. It SHALL expose labeled controls, keyboard-operable forms, readable status/error messages and explicit stale-action conflicts. No state change SHALL occur through a GET request or merely opening a page. Payment verification, unpaid reservation cancellation and transaction completion SHALL require an explicit contextual confirmation showing the affected buyer, item, quantity, amount where applicable, current state and consequences, with a safe return option. Payment SHALL retain manually entered exact received amount and unchecked trusted-receipt attestation; cancellation/completion SHALL require unchecked confirmation validated server-side. Final submission SHALL revalidate authorization and all existing transaction guards; confirmation pages and client feedback MUST NOT bypass them.

#### Scenario: Forged, unsafe or stale form
- **WHEN** a mutation lacks valid CSRF context, contains invalid values or targets an outdated record version
- **THEN** it is rejected without partial effects and the seller sees the relevant failure and safe recovery action
- **AND** a state conflict shows current owned-record context without silently retrying against a newer version

#### Scenario: Untrusted conversation text
- **WHEN** a listing or message contains HTML/script-like text
- **THEN** the dashboard displays it as text and it cannot execute code or change seller state

#### Scenario: Accidental critical action
- **WHEN** the seller opens a payment, cancellation or completion confirmation, cancels it or submits without its required attestation/confirmation
- **THEN** no critical transition occurs
- **AND** the page explains stock commitment, release/possible backup promotion or completion prerequisites as applicable

#### Scenario: Transaction changes during confirmation
- **WHEN** another session changes the order, its reservation expires or a blocking review appears before final confirmation
- **THEN** the existing version/state/payment/fulfilment rules determine rejection or an already-applied result without extra stock or history effects
- **AND** the seller can inspect the current state and decide a new action

#### Scenario: Validation or lost-response recovery
- **WHEN** valid-session submission contains an invalid field or the client loses the response to a critical action
- **THEN** field errors identify safe corrections and retain appropriate non-secret values, or recovery links permit inspection of committed state/history before retry
- **AND** the UI never reports success based only on a click, nor places private form values in URLs or browser storage

### Requirement: Small seller workflow views

The dashboard SHALL provide inventory/listing management, nested claims and backup positions, conversations with item/order associations, response proposals, an ambiguity/review queue, order/payment/fulfilment detail, transaction history and an activity timeline. Synthetic source and simulated delivery states SHALL be visibly labeled. Review actions MUST show relevant context and reasons; no dashboard view may imply that a proposal was sent or buyer evidence verified payment. The workspace SHALL offer consistent navigation to an overview of work needing attention, inventory/WTS, conversations, orders/history and settings/help, with contextual links between owned listings/items, conversations, reviews and orders. Detail access SHALL work independently of list page position and preserve a useful filtered return destination.

The interface SHALL distinguish new claim activity and its current disposition, held inventory, unreserved backups, unresolved seller decisions, proposed/stale responses, approved simulated responses, unverified payment evidence, seller-verified payment, collection/postage progress and completed/cancelled/expired transactions. Stock totals, exact due amount, reservation deadline/timezone and current next action SHALL remain understandable without expanding raw technical detail. Fulfilment dispatch/drop-off MUST NOT imply buyer receipt; paid MUST NOT imply completed.

#### Scenario: Review and follow a transaction
- **WHEN** the seller opens an order or review task
- **THEN** its listing item, buyer/thread context, current reservation, payment, fulfilment, proposals and chronological activity are accessible without opening Chromium

#### Scenario: Seller identifies work requiring attention
- **WHEN** unresolved reviews, proposed responses, awaiting-payment orders and paid unfulfilled orders exist
- **THEN** the overview provides labeled queues linking to the relevant action and context
- **AND** ordinary conversation is not falsely shown as an unresolved review

#### Scenario: Independent states remain clear
- **WHEN** A has a hold, B is backup, a payment draft is approved for simulated delivery and buyer payment evidence arrives
- **THEN** the interface shows one reservation, B without reserved entitlement, the approved simulated response and payment still unverified
- **AND** later seller verification, dispatch/collection and completion are distinct recorded states

#### Scenario: Navigate a record beyond the first page
- **WHEN** an order links to a listing/item or conversation outside the first page of its collection
- **THEN** the seller reaches the correct scoped detail and can return to the originating filtered view
- **AND** replacing an identifier with another seller's ID reveals no foreign content or existence-specific detail

## ADDED Requirements

### Requirement: Responsive and consistent seller interface

The seller interface SHALL apply the installed apple-design reference's hierarchy, layout, typography, feedback, motion, appearance and accessibility principles as responsive web behavior in the existing stack. It SHALL use a consistent shell, system typography, relative text sizes, a small shared spacing scale, restrained surfaces and semantic colors, and clear primary/secondary/critical action roles. Essential states and actions SHALL remain visible outside secondary disclosures. Navigation destinations and workflow functionality SHALL remain consistent across screen widths. The UI MUST NOT require a new framework, third-party fonts, decorative charts or native Apple runtime/components.

#### Scenario: Desktop and mobile sale
- **WHEN** the core onboarding/sale workflow is performed at 360×800, 390×844 and 1280×800 viewport sizes
- **THEN** navigation, record context, amounts and critical actions remain legible and operable with no page-level horizontal scrolling or clipped transaction facts
- **AND** related fields stack or reflow coherently at narrow widths instead of shrinking the entire interface

#### Scenario: Light and dark appearance
- **WHEN** the supported browser's preferred color scheme changes between light and dark
- **THEN** page surfaces, native controls, text, focus indicators and all status/error/confirmation treatments adapt consistently without losing state meaning
- **AND** default system appearance is respected without requiring an account setting

### Requirement: Accessible interaction and purposeful feedback

The dashboard SHALL provide semantic landmarks/headings, a skip link, current-navigation indication, native labeled controls, visible unobscured keyboard focus and a logical keyboard order. Touch action targets SHALL be at least 44×44 CSS px. Normal text SHALL meet 4.5:1 contrast; large text and essential control/focus boundaries SHALL meet 3:1 in both appearances. State SHALL NOT rely on color, animation or hover alone. The interface SHALL reflow at 320 CSS px and remain operable at 200% text/zoom. Errors SHALL identify fields and offer an accessible summary; asynchronous status changes SHALL use restrained accessible announcements. Optional transitions SHALL be brief, purposeful and nonblocking, and SHALL be removed when reduced motion is requested. Core forms/navigation/critical confirmation SHALL work without JavaScript.

#### Scenario: Keyboard and assistive-technology workflow
- **WHEN** a seller navigates onboarding, review, payment confirmation, collection and completion by keyboard and inspects the same controls with a screen reader
- **THEN** labels, status, errors and consequences are exposed in meaningful order, focus stays visible and no action requires a mouse/hover-only interaction

#### Scenario: Enlarged text and reduced motion
- **WHEN** the seller uses 200% text/zoom, a 320 CSS px view or reduced-motion preference
- **THEN** essential text and actions remain usable without overlap, and nonessential movement/smooth scrolling is suppressed while equivalent feedback remains

#### Scenario: Pending and successful submission
- **WHEN** a progressively enhanced form is submitted and the server later commits or rejects it
- **THEN** the form promptly shows pending feedback and prevents redundant clicks, then shows the actual result or a recoverable error
- **AND** optional animations never delay action availability or conceal transaction facts

### Requirement: Bounded seller queries and complete browsing

Seller lists, filtered histories, claims/backups, messages, drafts, reviews, source detail, activity and shared-instruction snapshots SHALL use scoped database queries with bounded pages. Default page size SHALL be 25 and maximum 100, with at most one additional row used to detect continuation. The selected view SHALL NOT load all collections or entire histories into memory. Direct details SHALL validate ownership independently. Filters and cursor inputs SHALL be length/type validated and parameterized; cursor ordering SHALL be deterministic and tied to the selected filters, with no tenant authority taken from the cursor. Chronological labels SHALL use actual timestamps/activity ordering, never random UUID order. Older/newer or return-to-newest navigation SHALL keep all retained records reachable. Related-record selection SHALL support bounded searching/paging without silently excluding records after the first 200. UI bounds SHALL NOT change stock or backup-priority rules.

#### Scenario: Seller grows past existing view limits
- **WHEN** a seller has 250 and then 1,000 orders, more than 200 related records and a long conversation/timeline
- **THEN** the seller can browse the full retained set, filter history, open older detail/snapshots and select later inventory/items through bounded queries
- **AND** no page requires the whole transaction history, all draft references or all related selectors in application memory

#### Scenario: Stable paged navigation and foreign cursor input
- **WHEN** the seller pages an unchanged dataset, changes a filter, submits a malformed cursor or substitutes another seller's identifiers
- **THEN** pages have deterministic continuation without omissions/duplicates in the unchanged dataset, filter changes reset incompatible continuation, invalid cursors fail safely and foreign records remain inaccessible
- **AND** concurrent additions remain discoverable through return-to-newest navigation without promising a frozen history snapshot

### Requirement: Non-disruptive activity freshness

An authenticated read-only endpoint SHALL expose only the current seller's bounded recent activity and attention summaries. With JavaScript enabled, visible tabs SHALL check at most once per 10 seconds with one request in flight, pause when hidden and back off on errors to at most one request per 60 seconds. The UI SHALL show last successful check and distinguish failed checks/session expiry from an empty queue. Updates SHALL refresh only read-only summaries or offer an explicit current-view refresh; they MUST NOT overwrite forms, optimistic versions, focus, selection or scroll. Summaries MUST NOT include full buyer messages, addresses, payment instructions or credentials. Freshness SHALL describe persisted local data rather than claim source completeness or scheduler health. Core views SHALL remain usable with manual refresh when JavaScript is disabled.

#### Scenario: Activity arrives while editing
- **WHEN** new synthetic claim/review activity commits while a seller is editing payment or inventory fields
- **THEN** a visible-tab update reports recent activity within the next successful 10-second check without changing the form or its version
- **AND** following the update explicitly opens current scoped state

#### Scenario: Hidden tab database outage and expired session
- **WHEN** the tab becomes hidden, its update request fails or the session expires/is revoked
- **THEN** polling pauses or backs off as applicable, no overlapping requests accumulate and a safe stale/relogin indication replaces any implication that data is current
- **AND** no expired-session response exposes seller summaries or automatically repeats a mutation
