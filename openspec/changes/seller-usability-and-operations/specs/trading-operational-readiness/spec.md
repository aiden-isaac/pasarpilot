## ADDED Requirements

### Requirement: Finite browser-free operating workload

Acceptance SHALL run a predeclared 60-minute clean synthetic workload against two concurrent isolated sellers, at most two active scenarios, one transaction per seller per 30 seconds and 120 completed transactions per seller. It SHALL use stable synthetic identities and existing authenticated/domain boundaries without Chromium, a browser scheduler, AI credentials or external services. Every planned outcome, rejection, timing and partial failure SHALL be retained in private bounded evidence. The runner SHALL require explicit owned disposable data/output paths and SHALL NOT reset an existing seller dataset or disrupt unrelated homelab services.

#### Scenario: Two sellers complete the clean workload
- **WHEN** the bounded clean workload runs with two independent seller sessions and scheduler/browser stopped
- **THEN** all 240 planned transactions complete, each has one payment stock commitment and an auditable backup outcome, and no cross-seller association or duplicate sale occurs
- **AND** all planned attempts remain in the report denominator, including failures

#### Scenario: Unsafe dataset or inadequate headroom
- **WHEN** ownership/private-path checks fail or baseline memory/disk headroom is insufficient
- **THEN** new test work does not start, the missing evidence is reported and no unrelated service is stopped or reconfigured

### Requirement: Recoverable durable transaction processing

Separate controlled cases SHALL exercise database disconnect/reconnect, application restart, interrupted operations before commit and after commit before acknowledgement/response, duplicate/conflicting events, session expiry/revocation and source gaps. They SHALL include pending events, live/expired holds, approved responses, verified payments and completed orders. Recovery SHALL retain accepted intent and committed state without duplicate claims/reservations/sales/deliveries/activity, automatic reseeding or invented source positions. Once the selected database/application is ready, healthy processing SHALL resume within 30 seconds; relevant mutations SHALL reconcile database-time expiry before granting a conflicting right. Optional capture unavailability or one failed seller stream MUST NOT indefinitely block expiry or healthy sellers.

#### Scenario: Restart preserves paid and unpaid state
- **WHEN** the application stops with pending inbox work, an unpaid reservation and a verified paid order, then restarts against the same database
- **THEN** each committed record remains inspectable, pending work resumes once, expired unpaid rights reconcile and paid stock is not released or sold again

#### Scenario: Database connection is interrupted
- **WHEN** the verified owned test database disconnects during an operation or an idle pool connection and becomes ready again
- **THEN** the application reports safe temporary unavailability or a clear restart instruction, preserves transaction atomicity and resumes healthy processing within the recovery bound
- **AND** no unhandled connection error loses accepted intent or forces fresh setup, including a PostgreSQL starting-up response

#### Scenario: Duplicate or interrupted operation is replayed
- **WHEN** the same event/approval/payment/completion is repeated after response/acknowledgement loss or a transaction fails before commit
- **THEN** replay produces only the previously committed effect or one valid new commit after rollback, with no extra stock, delivery or audit transition
- **AND** conflicting content under an existing event identity is rejected/quarantined rather than treated as a new sale

#### Scenario: Scheduler or capture is unavailable
- **WHEN** the browser scheduler is stopped, or explicitly enabled capture cannot read valid handoffs
- **THEN** local synthetic intake, expiry and healthy seller processing continue with a truthful degraded-import indication where relevant
- **AND** no browser is started, missing payload becomes a fabricated claim, or source completeness is asserted

### Requirement: Stock and state invariants under concurrent use

Controlled cases SHALL exercise held-stock edits, concurrent last-unit claims through shared listings, expiry/cancellation and backup promotion, payment-versus-expiry races and state changes during seller confirmation. They SHALL use real independent database connections and existing deterministic rules. Test-only expiry/session deadline preparation SHALL be isolated to the disposable dataset; production deadlines and authorization rules SHALL remain unchanged.

#### Scenario: Inventory changes while reserved
- **WHEN** the seller attempts to reduce stock below held quantity while another connection claims or verifies payment
- **THEN** invalid edits are rejected atomically, agreement snapshots remain intact and total reservations/sales never exceed available stock

#### Scenario: Expiration promotes backup once
- **WHEN** an unpaid hold expires during downtime or cancellation/expiry/payment attempts race
- **THEN** one valid terminal outcome wins, stock releases or commits once and the earliest eligible fully fillable same-item backup is promoted only when permitted
- **AND** late payment requires review instead of reviving expired rights or releasing paid inventory

### Requirement: Measured resource latency and growth gates

Acceptance SHALL include a 60-second baseline, one-second streamed host/application-worker/database samples, 250- and 1,000-order-per-seller growth stages, more than 200 related records and a long conversation/timeline. Measurements SHALL cover actual serve-process RSS/CPU, simultaneous database cgroup memory/CPU/OOM, host available memory/PSI/swap, request/pool/query timings, backlog age/counts, returned rows/response sizes and database/table/index/disk growth. Runner overhead and missing samples SHALL be identified separately. No entire transaction history SHALL be loaded for measurement or reporting.

Clean loopback p95 targets SHALL be <=500 ms for common list/detail/filter/update reads, <=1 s for ordinary mutations including redirect and <=10 s for asynchronous synthetic work visibility with the worker running. Combined concurrent app/worker plus database memory SHALL remain within the existing 1.5 GiB service allowance and configured host guard; the database SHALL retain its 768 MiB/no-swap cap. There SHALL be no OOM, swap-out growth or configured PSI breach. At a fixed drained record count, the second of two five-minute settled application RSS means SHALL be no more than 64 MiB above the first. Additional database growth SHALL be capped at 512 MiB and run evidence at 256 MiB. Breaches SHALL stop new workload and produce a failed/inconclusive result with data retained, not silent threshold relaxation.

#### Scenario: Growing records stay usable
- **WHEN** representative filters/details/selectors and full paged traversal run at both declared growth sizes while two sellers use the application
- **THEN** bounded-query checks and declared read/mutation/visibility targets pass with retained plans/sample counts, or the failing operation and limit are reported
- **AND** fixes target measured existing SQL/render/worker behavior before proposing new infrastructure

#### Scenario: Resource pressure or missing evidence
- **WHEN** resource/disk thresholds are breached or mandatory accounting cannot be collected
- **THEN** the runner stops admitting new work safely, retains accepted state/partial results and marks the gate failed or inconclusive
- **AND** it does not alter host settings, evict caches, stop Minecraft/other services or add browser slots

### Requirement: Security operational guide and regression evidence

The change SHALL verify existing authentication, session expiry/revocation, tenant isolation, CSRF/origin checks, escaping, bounded input and transaction audit guarantees for all new routes/forms/cursors/updates. It SHALL verify restricted runtime role behavior, including inability to perform DDL in business/scheduler schemas, write migration records or update/delete audit records; existing required pg-boss permissions SHALL remain limited to its owned application queue schema. Global logs and sanitised reports MUST NOT expose credentials, tokens, private buyer text/contact/address, payment instructions or evidence. Business/audit/instruction history SHALL be retained; queue maintenance SHALL use the existing supported mechanism without deleting business records.

An operator guide SHALL cover selected-dataset setup/migrate/start, safe reconnect/restart, backup and separately located restore verification, interrupted-operation inspection, scoped shutdown/rollback, growth limits and remaining requirements for future secure external access. Loopback binding SHALL remain enforced; no public exposure or production-access configuration SHALL be added. Acceptance SHALL retain results for existing benchmark/scheduler/trading suites and strict OpenSpec validation, with any unavailable prepared-host gate explicitly blocked. Meta authorization SHALL remain unresolved.

#### Scenario: New boundaries preserve isolation and privacy
- **WHEN** two sellers use colliding identifiers and attempt foreign detail/cursor/profile/update/confirmation access, forged CSRF/origin requests or expired sessions
- **THEN** no foreign data or mutation is exposed, safe failures are understandable and private payloads are absent from global diagnostics
- **AND** database role probes cannot rewrite audit/migration state or create business/scheduler objects while supported queue operation still works

#### Scenario: Migration recovery and baseline regressions
- **WHEN** an existing version-1/2 synthetic dataset is backed up, upgraded and restarted and a backup is restored separately
- **THEN** account access, source identities and committed transactions remain recoverable without reseeding or dropping schemas
- **AND** existing benchmark units, scheduler database/live recovery and trading checks pass or clearly identify blocked evidence, without changing browser admission, ownership or fixture-count contracts
