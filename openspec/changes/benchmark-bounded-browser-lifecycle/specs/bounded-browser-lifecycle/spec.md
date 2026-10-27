## ADDED Requirements

### Requirement: Controlled and isolated execution

The harness SHALL use only synthetic identities and an authorised controlled fixture. It SHALL run non-root Chromium with its sandbox verified, in tenant-isolated attempt containers with only the selected profile mounted. It SHALL restrict browser navigation/network access to the fixture and required local infrastructure, reject profile path escapes, and expose no CDP, VNC or container-management endpoint publicly. It MUST NOT inspect Facebook, use real credentials, share authenticated contexts between tenants, or persist profile contents in benchmark reports/version control.

#### Scenario: Safe fixture visit
- **WHEN** an admitted attempt starts for a known synthetic tenant
- **THEN** it uses that tenant's mounted profile and verified sandbox, and the fixture reports the expected synthetic identity
- **AND** other profiles and container-management endpoints are unavailable to the browser

#### Scenario: Unsafe environment or target
- **WHEN** sandbox verification fails, a profile path escapes its protected root, or a requested target is outside the authorised fixture
- **THEN** the harness refuses that operation and records a safety failure without weakening the isolation settings

### Requirement: Persistent synthetic profiles

The primary benchmark SHALL create exactly three synthetic seller profiles and seed each once. An admitted optional four-slot experiment SHALL add a fourth separate synthetic profile outside the primary dataset rather than opening one profile twice. Clean revisits SHALL verify persistent authentication, local storage, IndexedDB, per-tenant identity and the previous committed sequence counter before advancing the counter. A failed assertion MUST NOT be hidden by automatically reseeding or recreating the profile. Profile storage SHALL be owner-restricted and remain on the experiment host.

#### Scenario: Clean shutdown and restoration
- **WHEN** a completed visit closes Chromium and a later fresh process reopens that tenant's profile
- **THEN** all declared persisted values and the previous counter match without signing in again

#### Scenario: No tenant leakage
- **WHEN** successive visits rotate through all three profiles
- **THEN** each visit observes only its expected identity and storage markers
- **AND** any wrong-tenant value immediately stops the run as an isolation failure

#### Scenario: Missing persisted state
- **WHEN** a clean revisit cannot restore required fixture state
- **THEN** the attempt fails and preserves the affected profile for diagnosis instead of reseeding it

### Requirement: Bounded fresh-process rotation

The default concurrency SHALL be one. Each rotated visit SHALL use a fresh Chromium process/container and SHALL include launch, readiness, inspection, observation persistence and complete shutdown within its occupied-slot duration. The continuous-browser comparison SHALL be explicitly labelled as a control. Two/four-slot settings SHALL require the resource benchmark's admission gate.

#### Scenario: One-slot rotation
- **WHEN** visits for three tenants are due under the default configuration
- **THEN** at most one browser is alive, and the next rotated attempt starts only after the previous attempt terminates

#### Scenario: Continuous control
- **WHEN** the continuous comparison runs
- **THEN** exactly one declared synthetic browser can remain alive between visits and is terminated at the arm boundary

### Requirement: Exclusive profile ownership and fencing

The local supervisor SHALL acquire an exclusive host profile lock and persist generation-numbered attempt ownership before launch. Records SHALL identify the tenant, unique process/container attempt, expiry and cancellation state. The supervisor SHALL renew leases, reject stale generations before new actions/event appends and reconcile ownership on restart. It MUST NOT treat expiry alone as proof of browser termination or identify an owner by PID alone.

#### Scenario: Duplicate profile access
- **WHEN** a second attempt requests a profile with a live owner
- **THEN** the second launch is rejected even if another browser slot is available

#### Scenario: Expired lease with surviving process
- **WHEN** a lease expires but its browser remains alive
- **THEN** the profile remains unavailable until the old attempt is terminated and verified absent
- **AND** only then can a new ownership generation launch

#### Scenario: Stale worker and supervisor restart
- **WHEN** a prior worker resumes after ownership changes or a supervisor restarts with leftover attempts
- **THEN** stale workers cannot initiate new operations and the new supervisor reconciles experiment-owned processes before scheduling replacements
- **AND** in-flight effects with uncertain completion are recorded for reconciliation

### Requirement: Verified shutdown and crash recovery

The harness SHALL request graceful browser closure, allow a declared bounded grace period and terminate only remaining experiment-owned descendants if necessary. It SHALL verify an empty attempt process tree/cgroup before releasing the profile or reassigning its slot. Injected crashes SHALL be reported separately from clean visits and SHALL test recovery without silently discarding profile data. Durability assertions after a crash SHALL apply to observations and fixture state committed before the injected failure boundary.

#### Scenario: Clean completion
- **WHEN** a rotated visit completes
- **THEN** observations are flushed, Chromium and its descendants terminate, and ownership is released only after verification

#### Scenario: Hung browser
- **WHEN** graceful closure exceeds the declared timeout
- **THEN** the supervisor terminates only that experiment's attempt and records forced cleanup and its duration
- **AND** unproven termination leaves the profile unavailable

#### Scenario: Committed state survives injected crash
- **WHEN** an experiment browser is killed after a declared committed boundary
- **THEN** recovery waits for its verified termination and the reopened profile restores that committed fixture state

### Requirement: Cancellation and recovery states

Cancellation or revocation SHALL prevent new actions and trigger bounded verified shutdown. Authentication expiry and unavailable fixture history SHALL be distinct from an empty conversation and SHALL produce a recovery-required state without automatic retry loops. The harness SHALL persist the reason for stopping and the intended next state.

#### Scenario: Revoked attempt
- **WHEN** an active synthetic session is revoked or cancelled
- **THEN** it initiates no new operations and its browser is terminated before capacity is reassigned

#### Scenario: Authentication or history unavailable
- **WHEN** the fixture reports expired authentication or locked history
- **THEN** the harness records the specific recovery reason, releases browser capacity through verified shutdown, and waits for explicit synthetic recovery

### Requirement: Browser-free event boundary

The harness SHALL durably append and flush normalised synthetic observations before releasing Chromium. Records SHALL include stable synthetic event identity, source revision, tenant and attempt generation in a PostgreSQL-compatible shape. A browser-free consumer SHALL read those records after termination. This change MUST NOT implement trading decisions, AI inference or a production job scheduler.

#### Scenario: Processing after browser exit
- **WHEN** the producing browser has terminated
- **THEN** the consumer can read the completed observation from durable local storage without restarting a browser

#### Scenario: Stale or uncertain outgoing fixture action
- **WHEN** a simulated pending action refers to an obsolete source revision or has uncertain completion after a crash
- **THEN** the harness rejects the stale action or records uncertainty for reconciliation rather than blindly sending it again
- **AND** any new fixture action requires renewed exclusive browser access and refreshed state

### Requirement: Optional exclusive interactive handoff

An optional headed/noVNC experiment SHALL use synthetic profiles, authenticated private access, declared release/inactivity/deadline limits and its own measured resource allowance. Handoff SHALL stop the headless process before starting headed Chromium using the exclusively owned profile. Automated actions MUST NOT run during interactive control. Every interactive session SHALL consume admitted capacity.

#### Scenario: Safe mode change
- **WHEN** the admitted optional experiment transitions from monitoring to interactive mode and back
- **THEN** the old process is verified stopped before the replacement launches, no two instances open the profile, and automation remains paused until handoff completes

#### Scenario: No interactive capacity
- **WHEN** a requested interactive session cannot fit the available slot and memory budget
- **THEN** it waits or is reported as skipped without exceeding concurrency or taking capacity invisibly from background work
