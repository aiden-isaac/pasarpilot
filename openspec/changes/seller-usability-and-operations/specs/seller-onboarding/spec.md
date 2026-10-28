## ADDED Requirements

### Requirement: Invited seller first-use entry

PasarPilot SHALL retain operator-provisioned seller accounts and offer first-use guidance after authenticated login. Guidance SHALL explain synthetic demonstration scope and lead to a resumable checklist covering display profile, inventory, WTS creation, inventory association, payment instructions, negotiation and intervention. The current secure operator setup SHALL remain separate from seller forms. Public registration, billing, identity collection and complex account management MUST NOT be introduced.

#### Scenario: New invited seller signs in
- **WHEN** an operator-provisioned seller logs into an empty workspace
- **THEN** the seller sees a clear start action and checklist explaining how to complete setup using the existing trading functions
- **AND** no Facebook credentials, registration or payment-provider account is required

### Requirement: Minimal isolated display profile

A seller SHALL be able to save a bounded plain-text display name under their authenticated seller scope. Login identity, password/session handling and payment-instruction versions SHALL remain independent. Existing accounts SHALL retain access after migration with a useful display-name default. Profile/guidance updates SHALL use current versions, input validation, CSRF and transactional audit records; profile setup MUST NOT approve payment sharing or change any order agreement.

#### Scenario: Configure and resume seller profile
- **WHEN** a seller saves a valid display name, logs out and logs in after application restart
- **THEN** the display name and relevant checklist progress remain available only to that seller
- **AND** login credentials and payment-sharing state remain unchanged

#### Scenario: Foreign or stale profile write
- **WHEN** a request submits another seller's identifier, a stale profile version or unsafe/oversized profile text
- **THEN** it cannot mutate another seller, overwrite a newer profile or execute text as markup

### Requirement: Guided inventory listing and configuration reuse

The checklist SHALL link directly to existing inventory, listing, item-mapping and payment-instruction controls, show unmet prerequisites and derive progress from owned records/configuration. Record-creation steps SHALL NOT be duplicated into a separate wizard state machine. Defaults SHALL preserve English/nonfoil/NM, quantity one, explicit MYR amounts, disabled negotiation and unapproved payment sharing. The seller SHALL explicitly approve configured payment instructions and separately approve proposed simulated delivery.

#### Scenario: Complete first listing setup
- **WHEN** a seller adds one explicit MTG variant, creates a WTS listing, maps that inventory with offered quantity and saves approved synthetic instructions
- **THEN** the checklist reflects the persisted configuration and the listing displays available/reserved stock and item association
- **AND** no response is sent and no order is paid merely by completing setup

#### Scenario: Interrupted or out-of-order onboarding
- **WHEN** the seller leaves partway through onboarding, restarts the application or configures an independent step first
- **THEN** the checklist resumes from actual owned records and identifies remaining prerequisites without creating duplicate inventory/listings or bypassing transaction validation

### Requirement: Negotiation and intervention guidance

Concise contextual help SHALL explain the private minimum price, disabled-by-default negotiation, approval before a proposal binds/delivers, exact supported claim grammar, reservation deadlines and when seller review is needed. It SHALL distinguish buyer payment evidence from seller verification and dispatch/drop-off from buyer receipt. Guidance SHALL remain accessible after onboarding; any persisted acknowledgement SHALL be seller-scoped/versioned and SHALL NOT serve as transaction authorization.

#### Scenario: Seller understands limits before demonstration
- **WHEN** the seller reads negotiation/intervention guidance with negotiation disabled
- **THEN** the interface explains that ordinary inquiries do not reserve, ambiguous/changed/late cases need review, private floors remain undisclosed and payment requires a trusted-receipt check
- **AND** the seller can proceed with the fixed-price demonstration without enabling negotiation or AI
