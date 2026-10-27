# bounded-fixture-scheduling Specification

## Purpose

Define durable, fair and resource-bounded scheduling of isolated synthetic fixture visits on one host, including cancellation, recovery and browser-free observation consumption.

## Requirements

### Requirement: Fixture-only single-host execution

The scheduler SHALL run only the three primary synthetic tenants on one host and one canonical private dataset, with exactly one admitted browser slot. It SHALL preserve non-root sandboxed fresh-process visits, selected-profile-only mounts, fixture-only browser access and private infrastructure endpoints. It MUST reject unknown tenants, path escapes, invalid job parameters and dataset/host mismatches before accepting work. It MUST NOT access Facebook/Messenger, real credentials or additional browser slots.

#### Scenario: Valid scheduled visit
- **WHEN** an eligible primary tenant has an admitted job
- **THEN** a fresh sandboxed browser uses only that tenant's profile and verifies its fixture identity
- **AND** no other browser attempt is alive

#### Scenario: Invalid request
- **WHEN** a submission names another target, an unknown tenant, an unsafe path or invalid timing/action fields
- **THEN** it is rejected without accepting a job or launching Chromium

### Requirement: Durable schedules and atomic enqueue

The scheduler SHALL persist schedules, revisions, logical job IDs, claim/attempt association, outcomes and the fair-dispatch cursor in PostgreSQL with pg-boss delivery. Due-job insertion and schedule advancement SHALL commit atomically. Accepted work SHALL survive supervisor/database restart, and repeated submission of the same tenant/action ID SHALL return the existing outcome. Incompatible schema or dataset identity MUST fail without destructive reset.

#### Scenario: Enqueue interrupted before commit
- **WHEN** the process fails between due-job insertion and schedule advancement
- **THEN** either both changes commit or neither does
- **AND** restart produces no missing or duplicate logical visit

#### Scenario: Accepted work survives restart
- **WHEN** the supervisor and database restart after accepting a future job
- **THEN** its identity, schedule revision and eligibility remain available from durable state

### Requirement: Coalescing and bounded backlog

The scheduler SHALL allow at most one nonterminal observation and one nonterminal explicit action per tenant, including active, retry and unresolved action states, for at most six nonterminal logical jobs. Repeated observation ticks SHALL coalesce to current demand, retain the oldest pending timestamp for metrics and skip replay of individual missed intervals. Action submissions above the bound SHALL be rejected explicitly. Blocked tenants MUST NOT generate automatic jobs. Terminal queue records SHALL have seven-day retention.

#### Scenario: Overdue ticks during outage or active work
- **WHEN** many intervals elapse while the database is unavailable or an observation remains outstanding
- **THEN** recovery preserves at most one current observation demand per tenant and schedules the next future tick
- **AND** coalesced counts and original pending age remain observable

#### Scenario: Action overload
- **WHEN** an action is already nonterminal for a tenant and a distinct action is submitted
- **THEN** the additional action is rejected with a reason and the six-job bound holds

### Requirement: Deterministic fair dispatch

The scheduler SHALL choose eligible tenants in sorted round-robin order using its durable cursor, granting one job attempt per turn. Within a tenant it SHALL choose the oldest eligible job with job ID as tie-breaker. Failures and actions SHALL consume a turn; retry-delayed, blocked, cancelled and stale work SHALL NOT prevent other eligible tenants from progressing. Among N continuously eligible tenants, a tenant MUST NOT receive a second turn before the other N-1 receive a turn. Resource denial SHALL defer dispatch with bounded polling rather than spin or consume a browser slot.

#### Scenario: Noisy tenant with retries and actions
- **WHEN** all three tenants remain eligible and one repeatedly submits work or fails
- **THEN** each receives one turn in each complete round and the noisy tenant cannot overtake the others

#### Scenario: Restart preserves fairness
- **WHEN** the supervisor restarts after recording a dispatch
- **THEN** its next selection continues after the persisted tenant, after startup reconciliation

### Requirement: Revision, deadline and retry bounds

Before launch and before new fixture operations or observation persistence, the scheduler SHALL check current schedule revision, enabled state, cancellation, captured deadline and ownership. Pending observation deadlines SHALL be one interval after the latest coalesced due time; active attempts SHALL retain their captured revision/deadline. Actions SHALL require a finite explicit deadline and expected source revision. Work SHALL stop at the earlier of the deadline or 120 seconds after launch, with at most 40 additional seconds for cleanup. Queue expiration SHALL be at least 180 seconds and SHALL NOT be used as a browser cleanup mechanism. Only transient observation failures SHALL retry automatically, at most twice with 30/60-second delays and only while still current.

#### Scenario: Obsolete queued or retried work
- **WHEN** a claimed job has an obsolete revision, expired deadline, cancellation or disabled schedule
- **THEN** it is recorded as skipped/cancelled without launching a browser
- **AND** any current observation demand remains coalesced separately

#### Scenario: Hung or repeatedly failing attempt
- **WHEN** a visit exceeds its work bound or repeatedly encounters a transient failure
- **THEN** bounded cleanup runs, retries obey their count/delay/deadline limits and other tenants retain fair turns
- **AND** unproven termination prevents further browser dispatch

### Requirement: Exclusive ownership through verified termination

The scheduler SHALL hold a dataset supervisor lock, acquire exclusive profile locks and persist generation-numbered ownership associated with the job attempt before launch. It SHALL reject concurrent supervisors/benchmark access to that dataset and fence stale attempts before actions or event writes. Slot/profile reuse SHALL require verified empty attempt process trees/cgroups. Queue claim expiry, cancellation and lease expiry MUST NOT substitute for termination evidence.

#### Scenario: Claim expires while Chromium survives
- **WHEN** queue ownership or the profile lease expires while the old browser remains alive
- **THEN** no replacement browser launches and the old generation is fenced
- **AND** only verified termination permits another profile generation or slot reuse

#### Scenario: Competing supervisor
- **WHEN** a second supervisor or benchmark driver requests the active scheduler dataset
- **THEN** it is rejected before reconciling or launching any browser

### Requirement: Restart and database-outage reconciliation

Before resuming dispatch, the supervisor SHALL fence recorded owners, reconcile only its dataset-labelled attempts, verify their termination and reconcile durable observations/receipts with interrupted queue attempts. It SHALL stop admission and clean up the current browser on database failure using local ownership evidence. Irreconcilable ownership, malformed evidence or unproven termination SHALL halt browser dispatch with retained evidence. A profile counter mismatch SHALL block its tenant rather than trigger reseeding.

#### Scenario: Supervisor crash with surviving browser
- **WHEN** the supervisor dies after browser launch and before job completion
- **THEN** restart terminates and verifies the old attempt before settling or retrying its job
- **AND** stale generations cannot append observations or initiate new operations

#### Scenario: Database fails during a visit
- **WHEN** the active supervisor loses database access
- **THEN** it admits no new browser, cancels and verifies cleanup locally, and preserves pending outcome evidence
- **AND** dispatch remains stopped until database recovery and reconciliation succeed

### Requirement: Durable browser-free observation consumption

The scheduler SHALL flush complete normalised observations with stable tenant/source identity and attempt generation before browser shutdown. It SHALL consume them only after verified termination and profile release, using an idempotent database transaction for observation import and consumer result. Crash recovery SHALL settle completed evidence without blindly repeating browser work and SHALL produce one durable consumer result per source identity. It MUST diagnose incomplete ledger records rather than treat them as complete observations.

#### Scenario: Crash after flush but before queue acknowledgement
- **WHEN** an observation is flushed and the process dies before database/job completion
- **THEN** recovery verifies browser termination, replays the existing observation and settles the logical job from its evidence
- **AND** it does not launch Chromium merely to reproduce that observation

#### Scenario: Consumer restart
- **WHEN** the consumer reprocesses a previously imported observation or restarts during its transaction
- **THEN** exactly one durable result exists for that tenant/source identity without browser access

### Requirement: Cancellation and explicit session recovery

Cancellation or schedule disablement SHALL persist before acknowledgement, prevent subsequent operations once observed and trigger verified shutdown for an active attempt. Already issued operations SHALL be treated as possibly completed. Authentication expiry and unavailable history SHALL block the affected tenant with distinct reasons after cleanup, without automatic login/reseed/retry loops. Resumption SHALL require explicit fixture recovery, state validation and a new schedule revision; healthy tenants SHALL continue fairly.

#### Scenario: Cancellation during execution
- **WHEN** a cancellation is accepted for an active job
- **THEN** the worker stops issuing new operations once it observes cancellation and performs bounded cleanup
- **AND** any ambiguous issued action remains uncertain for reconciliation

#### Scenario: Authentication or history failure
- **WHEN** a visit reports expired authentication or unavailable history
- **THEN** its tenant becomes recovery-required, its browser terminates and other tenants continue
- **AND** automatic visits resume only after explicit validated recovery

### Requirement: Safe outgoing fixture actions

An explicit outgoing fixture action SHALL reacquire exclusive ownership and refresh identity, history and source revision before sending. Stale source/schedule revisions SHALL be rejected. Action uncertainty SHALL be durable before transmission, keyed by tenant/action ID. Ambiguous completion MUST NOT be retried automatically. A read-only fixture lookup SHALL expose only the authenticated tenant's action status; reconciliation SHALL mark applied only from positive evidence, leaving missing/reset evidence unresolved until explicit disposition.

#### Scenario: Fixture applied action but acknowledgement was lost
- **WHEN** the fixture applies an action and the supervisor crashes before recording completion
- **THEN** recovery queries that tenant/action ID, records the proven applied result and does not resend

#### Scenario: Stale action or missing evidence
- **WHEN** an action's expected revision differs from refreshed state, or an uncertain action cannot be proven applied
- **THEN** stale unsent work is rejected or ambiguous work remains unresolved, respectively
- **AND** neither condition causes a blind send or reseeding of the fixture

### Requirement: Fresh host resource admission

The scheduler SHALL measure the warmed fixture/database/supervisor stack before browser execution, retain the existing host guard and 1.5 GiB future-service reserve, and use current live admission/pressure checks. Database plus scheduler overhead SHALL be measured against the 1.5 GiB planning allowance. The bootstrap browser cap SHALL remain 2 GiB until a fresh pilot justifies calibration. Missing accounting, unsafe pressure, OOM or insufficient headroom SHALL stop or block execution without weakening controls. A running Minecraft server MUST NOT be stopped without fresh explicit owner approval.

#### Scenario: Queue/database overhead prevents admission
- **WHEN** the warmed system cannot fit one slot with the declared reserves, or its service overhead exceeds the planning allowance
- **THEN** the run records the failed gate and does not lower reserves or force admission to pass

#### Scenario: Pressure or missing mandatory accounting
- **WHEN** an active run exceeds existing pressure/OOM thresholds or loses required accounting
- **THEN** admission stops, the active browser is cleaned up safely and the failure is retained in the report

### Requirement: Reproducible scheduler acceptance evidence

The change SHALL include deterministic scheduling tests, real PostgreSQL integration tests and a prepared-host fixture run with at least 100 predeclared planned clean visits across three tenants, at least 33 completed visits each and at least 99% first-attempt success. Cadence and limits SHALL be declared before each run; failures, skips and late visits MUST NOT be removed from the planned denominator. Separate fault cases SHALL cover burst/overload, cancellation, revision/deadline expiry, transient retry exhaustion, queue expiry with a survivor, supervisor/database restart, crash boundaries around observation persistence/shutdown/acknowledgement, consumer replay, unavailable sessions and uncertain actions. Reports SHALL retain all attempts and expose queue depth/age, coalescing/rejection counts, per-tenant turns, wait/lateness, occupied/cleanup time, consume lag, service overhead, host pressure and final process absence.

#### Scenario: Passing fixture scheduler
- **WHEN** clean visits and all declared correctness, resource and fault gates pass
- **THEN** the report records PASS for this single-slot fixture configuration with no duplicate consumer results, ownership/isolation breach, fairness violation or backlog-bound violation
- **AND** every accepted job has a terminal or explicitly blocked/uncertain disposition

#### Scenario: Failed or incomplete validation
- **WHEN** a gate demonstrably fails or required execution/evidence cannot be completed safely
- **THEN** the report records FAIL or INCONCLUSIVE respectively, with missing evidence and retained failures
- **AND** it makes no production throughput, platform reliability or customer SLA claim
