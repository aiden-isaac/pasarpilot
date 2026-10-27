## ADDED Requirements

### Requirement: Minecraft preparation and owner approval

Before launching benchmark browsers, the operator SHALL identify any Minecraft workload on Jarlaxle using process/controller and cgroup evidence, measure its current RSS/PSS and cgroup memory where supported, and record a live pre-stop host baseline. If running, the operator MUST obtain explicit owner confirmation before a graceful server-console stop or record that the owner stopped it directly. The experiment MUST NOT delete data, change Minecraft configuration/restart policy, kill its tmux session, or stop unrelated services.

#### Scenario: Running Minecraft without approval
- **WHEN** Minecraft is running and no explicit stop confirmation or owner-performed stop is recorded
- **THEN** preparation can identify and measure it but does not stop it or launch benchmark browsers

#### Scenario: Approved graceful stop
- **WHEN** the owner approves stopping the verified Minecraft target
- **THEN** the operator uses its normal console/controller shutdown, waits for saving and exit, verifies no server descendants/restart remain, and captures a second host baseline
- **AND** Minecraft files/configuration and unrelated services are unchanged by preparation

#### Scenario: Minecraft already stopped or stop unsuccessful
- **WHEN** Minecraft is already stopped or cannot stop cleanly
- **THEN** the operator records the actual state and captures a current baseline or reports blocked preparation respectively
- **AND** no shutdown delta is invented and no forced Minecraft termination is attempted

### Requirement: Measured host budget and admission

The benchmark SHALL capture at least 60-second pre-stop and post-stop baselines when a stop occurs, then a warmed idle baseline including fixture, collector, supervisor and runtime overhead. It SHALL record MemTotal/MemAvailable, CPU, swap occupancy and rates, memory PSI and software/runtime versions. Browser admission SHALL use observed availability rather than nominal RAM or swap capacity.

The default safety reserve SHALL be `max(1 GiB, 15% of MemTotal)`. An additional 1.5 GiB future application/database reserve SHALL be subtracted unless already included as a deployed measured workload. The initial 2 GiB single-browser cap SHALL fit the residual budget before a pilot starts. Subsequent mode allowances SHALL be at least 125% of observed maximum whole-attempt memory rounded up to 64 MiB. All active mode allowances SHALL fit both live headroom and the configured slot ceiling.

#### Scenario: Initial admission fails
- **WHEN** the warmed residual budget cannot accommodate the provisional single-slot cap
- **THEN** the benchmark remains blocked pending explicit resource-envelope review and does not consume swap or stop other services to force admission

#### Scenario: Admission succeeds
- **WHEN** the slot ceiling and measured residual budget both accommodate the attempt
- **THEN** the supervisor applies verified memory, CPU and swap controls and records the admission calculation before launch

### Requirement: Resource stop conditions

The benchmark SHALL sample at one-second intervals and stop the arm if MemAvailable is below the safety reserve for three consecutive samples, memory PSI `full avg10` is at least 1% for ten seconds, swap-out exceeds 1 MiB/s averaged over ten seconds, or an OOM/isolation/sandbox violation occurs. It SHALL stop new admission, safely clean up experiment resources and retain the failure evidence. These declared experimental policies SHALL be distinguished from measured results.

#### Scenario: Pressure threshold crossed
- **WHEN** any declared sustained pressure threshold is reached
- **THEN** no additional browser starts, experiment-owned active attempts are safely stopped, and the report records the threshold, samples and incomplete visit counts

### Requirement: Comparable repeated-visit protocol

The primary benchmark SHALL compare one continuously running synthetic browser against one slot rotating fresh processes through three persistent profiles. Both arms SHALL use matched fixture workload, target count, content, cadence, software, resource controls and declared warm-up policy. Each arm SHALL complete at least 100 controlled visits when safe, and rotation SHALL include at least 33 visits per profile. All failed attempts and overruns SHALL remain in the report. Deliberate fault injections SHALL have a separate denominator.

#### Scenario: Complete comparison
- **WHEN** both primary arms complete safely
- **THEN** the report includes at least 100 completed visits per arm, tenant counts, retained idle memory, failures, and comparable timing/resource summaries

#### Scenario: Unsafe or impractical completion
- **WHEN** the planned visit count cannot safely or practically be completed
- **THEN** the harness stops and reports actual counts and the reason without claiming a complete or passing comparison

### Requirement: Whole-attempt instrumentation and reclamation

Measurements SHALL cover startup/peak/settled memory, process-tree/cgroup usage, CPU and throttling, swap/pressure, phase durations, total slot occupancy, profile disk growth and repeated-visit trends. Cgroup current/peak/category and OOM counters SHALL be used where supported; otherwise the report SHALL identify sampled approximations and gaps. RSS, PSS, file cache, MemAvailable and pressure MUST be explained separately and MUST NOT be added as independent physical memory totals.

After each rotated visit, zero browser descendants and released ownership SHALL be verified. After each primary arm's cleanup, a five-minute quiescent sample SHALL test available-memory drift against `max(256 MiB, 10% of the single-slot allowance)` and inspect anonymous/residual growth. Reclaimable file cache alone MUST NOT be classified as a leak; unrelated host noise SHALL produce an inconclusive reclamation result.

#### Scenario: Memory returned acceptably
- **WHEN** all browsers are stopped and settled memory is compared with the matched idle baseline
- **THEN** the report records no surviving descendants, drift within the declared tolerance, and no unexplained sustained anonymous/residual growth

#### Scenario: Missing accounting or noisy baseline
- **WHEN** whole-attempt accounting cannot be demonstrated or unrelated activity prevents reclamation attribution
- **THEN** the report identifies the limitation and does not issue GO on incomplete memory evidence

### Requirement: Conditional concurrency and interaction experiments

Two-slot tests SHALL follow a passing single-slot baseline, and four-slot tests SHALL follow a safe lower-concurrency result. Each SHALL independently pass aggregate memory/live-headroom admission. Headed, noVNC and background-plus-interactive experiments SHALL separately account for display/streaming overhead. Unsupported concurrency SHALL be reported as skipped/unmeasured rather than forced or presented as measured capacity.

#### Scenario: Higher concurrency lacks headroom
- **WHEN** the measured allowances for two or four slots do not fit
- **THEN** that experiment is skipped with its failed admission calculation while the single-slot result remains reportable

#### Scenario: Interactive cost comparison
- **WHEN** a headed/noVNC experiment is safely admitted
- **THEN** its zero-viewer and one-viewer resource costs, startup/handoff timing and effect on monitoring capacity are reported separately

### Requirement: Throughput and latency projections

The report SHALL calculate raw and 70%-budgeted capacity, utilisation, minimum feasible interval, mean/p95 queue delay and detection delay, and monthly browser-time cost for 5/20/50/100 active sellers at 2/5/10/15-minute intervals and one/two/four slots. It SHALL use measured occupied time including failed-attempt/cleanup occupancy, or label unavailable values as assumptions. It SHALL distinguish measured concurrency from extrapolation, state arrival/staggering assumptions and mark sustained utilisation >=100% as unstable.

The model SHALL include additional outgoing-visit ratios 0/0.25/1, additional retry sensitivities 0/5/15% without double-counting observed failures, and an illustrative ten-minute interactive session per hour. Registered inactive accounts MUST NOT be counted as actively monitored unless explicitly assumed active.

#### Scenario: Measured model input
- **WHEN** primary timing and failure observations are available
- **THEN** projections replace the former 45-second/2 GiB assumptions with measured values or clearly retain only unavailable inputs as assumptions

#### Scenario: Demand exceeds capacity
- **WHEN** the chosen workload requires at least all available slot-seconds
- **THEN** the model reports unstable/unbounded backlog and does not promise a finite monitoring latency

### Requirement: Evidence-based final decision

The report SHALL distinguish verified measurements, provisional experimental policies, calculated projections and future production requirements. It SHALL answer rotation viability, per-session memory, reclamation, restoration cost/reliability, safe tested concurrency, achievable monitoring latency and the recommended next change.

GO SHALL require both primary arms' minimum completed visit counts and at least 99% first-attempt success among planned clean visits in each arm, zero isolation/ownership violations, all clean persistence assertions passing without reseeding, safe recovery of at least five injected crash/restarts and every other declared fault case, resource/reclamation compliance, complete mandatory evidence, and projected support for at least five active sellers every 15 minutes at the 70% planning target with one admitted slot. Planned-visit, first-attempt success and retry counts SHALL be reported separately. A demonstrated correctness/resource/reliability failure or failure to meet that provisional pilot workload SHALL produce NO-GO for the tested configuration. Missing approval, insufficient evidence or noisy/incomplete runs without a demonstrated design failure SHALL produce INCONCLUSIVE. Optional concurrency is not a prerequisite for a one-slot GO.

#### Scenario: One-slot go
- **WHEN** all mandatory criteria pass but higher concurrency is unmeasured
- **THEN** the report recommends only a bounded fixture scheduler at the verified single-slot configuration and labels higher concurrency unverified

#### Scenario: No-go or inconclusive
- **WHEN** a required gate fails or cannot be evaluated
- **THEN** the report names the failed/missing evidence, distinguishes NO-GO from INCONCLUSIVE, and recommends a narrowly scoped follow-up
- **AND** it does not authorise production Facebook integration

### Requirement: Sanitised artifacts and scoped cleanup

Local raw outputs and synthetic profiles SHALL be access-restricted and excluded from version control. The repository SHALL receive only sanitised methodology, aggregate results and conclusions. Cleanup SHALL target experiment-owned resources explicitly; it MUST NOT prune unrelated resources or automatically restart Minecraft. Meta authorisation, real Messenger restoration and safe external sends SHALL remain unresolved production gates.

#### Scenario: Publish benchmark findings
- **WHEN** results are prepared for the repository
- **THEN** they contain no cookies, credentials, private messages, profile dumps or public browser access secrets
- **AND** cleanup and any remaining experimental resources are documented separately from owner-controlled Minecraft operations
