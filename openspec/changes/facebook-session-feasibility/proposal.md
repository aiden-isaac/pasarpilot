# Proposal

## Why

PasarPilot has measured a bounded Chromium lifecycle only against a controlled synthetic fixture. The owner needs a small, separate experiment to learn whether a manually authenticated Facebook session survives repeated isolated browser restarts on Jarlaxle, without implementing Facebook data collection or messaging automation.

## What Changes

- Add an owner-operated, temporary headed Chromium session with an isolated persistent profile and a private remote-browser interface. The owner navigates, signs in and handles any Facebook or Messenger challenge directly in the browser.
- Reuse the established non-root sandbox, exclusive profile ownership, resource admission and verified process termination patterns while keeping the synthetic fixture scheduler unchanged.
- Support five explicit close/reopen cycles on the same profile. Record startup, memory, shutdown and restoration measurements, and let the owner report whether authentication survived each cycle.
- Retain the profile in an owner-only location after the final verified cleanup. Keep browser contents, credentials, cookies, tokens, messages and group data out of reports, logs and Git.
- Document that Meta permission for automated Facebook access remains unresolved. Leave any future Facebook extraction or send adapter absent and disabled; synthetic fixtures continue to cover browser automation and trading events.

## Capabilities

### New Capabilities

- `owner-browser-session`: Temporary private interactive Chromium access, selected-profile persistence, bounded restart measurement, owner-reported results and verified cleanup without platform-content capture.

### Modified Capabilities

None. The existing fixture scheduling and synthetic seller workspace requirements remain scoped to their controlled data.

## Impact

Add a separate owner-session command and private access mechanism around the existing `benchmark/src/` lifecycle primitives, plus focused tests and an operator runbook. The experiment runs on Jarlaxle with rootless Podman and the pinned Chromium image, using a new private data directory outside Git. It does not add Facebook credentials to PasarPilot, change the trading database, publish CDP/VNC directly, or enable automated Facebook operations.
