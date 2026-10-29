# Spec Delta

## Purpose

Give the infrastructure owner a bounded, private Chromium session for manually checking whether an authenticated site session survives repeated browser restarts, without collecting site content or automating site actions.

## ADDED Requirements

### Requirement: Explicit owner-controlled session
The system SHALL start one isolated browser session only on an explicit owner command and SHALL open it without automated navigation to Facebook or Messenger. The owner SHALL control navigation, sign-in and verification challenges directly through the remote browser.

#### Scenario: Manual sign-in
- **WHEN** the owner starts a fresh session
- **THEN** a blank or local start page is presented and the owner can navigate and sign in directly
- **AND** PasarPilot does not request or receive the account password or history-unlock PIN

#### Scenario: No unattended platform action
- **WHEN** the remote browser is left open without owner input
- **THEN** PasarPilot performs no Facebook or Messenger inspection, extraction, posting or messaging

### Requirement: Private temporary browser access
The system SHALL expose the remote browser only through an authenticated, owner-controlled path with a finite lifetime. CDP, VNC, container management and the browser profile MUST NOT be directly publicly reachable. Ending access SHALL revoke the temporary viewer credential.

#### Scenario: Owner connects remotely
- **WHEN** the owner establishes the documented authenticated tunnel and opens the temporary viewer
- **THEN** the browser display is usable for manual navigation without publishing CDP or VNC to the public network

#### Scenario: Session ends or expires
- **WHEN** the owner closes the session or its deadline expires
- **THEN** viewer access stops and its temporary credential can no longer be used

### Requirement: Persistent selected profile and exclusive ownership
The system SHALL preserve one selected browser profile across launches in an owner-only directory outside Git. It MUST reject a second browser using that profile and MUST verify termination before reopening it. It SHALL retain the profile after the experiment unless the owner explicitly requests deletion.

#### Scenario: Reopen after clean close
- **WHEN** the owner closes Chromium and starts the next cycle
- **THEN** a fresh browser process opens the same selected profile only after the prior process tree is proven stopped

#### Scenario: Competing launch
- **WHEN** another launch requests the profile while the first session is active or cleanup is unproven
- **THEN** the second launch is rejected and the profile is not opened concurrently

### Requirement: Five measured restart cycles
The experiment SHALL support an initial launch followed by five explicit close-and-reopen cycles. For every launch and close it SHALL record startup time, peak browser memory, shutdown time and cleanup outcome. After each reopen, it SHALL ask the owner to record authentication as survived, lost or unknown; no browser-content inspection may infer that answer.

#### Scenario: Complete run
- **WHEN** the owner completes five close-and-reopen cycles
- **THEN** the report contains all six launches, five restart results, their measurements and the owner's five authentication assessments

#### Scenario: Interrupted run
- **WHEN** a cycle fails or the owner stops early
- **THEN** the report retains every attempted cycle, identifies the missing measurements and does not claim five successful restarts

### Requirement: Content-free evidence
The system MUST NOT log, screenshot, export or include passwords, cookies, tokens, private messages, group content, browsing history or page DOM in experiment artifacts. Its report SHALL contain only bounded lifecycle metrics, owner-entered authentication assessments, failure codes and profile protection metadata.

#### Scenario: Manual Facebook or Messenger use
- **WHEN** the owner navigates, signs in or views a conversation
- **THEN** logs and reports contain no page content, URL path, credential, cookie, token or screenshot from that session

### Requirement: Bounded cleanup and safe host operation
Every launch SHALL use non-root sandboxed Chromium with resource limits and current host admission checks. Closing, timeout, resource failure or controller interruption SHALL stop and verify all experiment browser and viewer processes before releasing ownership. The experiment MUST NOT stop unrelated services or alter the synthetic fixture scheduler.

#### Scenario: Normal final cleanup
- **WHEN** the fifth restart is assessed and the owner ends the experiment
- **THEN** all experiment browser/viewer processes are absent, temporary access is revoked and the protected profile remains available for a later owner decision

#### Scenario: Pressure or failed termination
- **WHEN** resource admission fails, host pressure rises or process termination cannot be proven
- **THEN** the experiment fails closed, records a content-free failure and does not start another browser on that profile

### Requirement: No Facebook automation adapter
The experiment SHALL contain no enabled Facebook or Messenger extraction or send adapter. Any future adapter MUST remain outside this capability and require a separately established supported authorization path. Existing synthetic browser, event and trading tests SHALL continue to use the controlled fixture.

#### Scenario: Feasibility run completes
- **WHEN** the owner finishes the restart experiment
- **THEN** no Facebook post, comment or message has been automatically read, stored, published or sent by PasarPilot
