> Implementation status: all 27 experiment tasks are complete; the change remains unarchived. See the [measured results and fixture-only GO decision](../../../docs/research/bounded-browser-lifecycle.md) and [capacity projections](../../../docs/research/bounded-browser-capacity.md). The planning assumptions below are retained as the original baseline.

## Why

PasarPilot cannot afford a continuously running browser for every seller on its RAM-constrained homelab. Before building infrastructure, measure whether short-lived isolated Chromium visits can reliably restore seller profiles, reclaim memory, and deliver useful monitoring intervals on Jarlaxle.

## What Changes

- Add a controlled benchmark harness using an authorised fixture and three synthetic tenants, with one browser slot initially and a fresh sandboxed Chromium process/container for each tenant visit.
- Compare one continuously running synthetic session against rotation through persistent tenant profiles over at least 100 completed visits per primary arm when safe. Include clean restart, injected crash, cancellation, profile-lock and stale-owner checks.
- Measure host and whole-browser resource use, lifecycle timings, storage, persistence reliability and failures; produce reproducible evidence and capacity calculations.
- Require Minecraft identification, explicit owner approval before a graceful stop if running, and pre/post-stop baselines before browser admission. Do not delete server data, change its configuration, or stop unrelated services.
- Gate optional two/four-slot and headed/temporary-noVNC experiments on measured headroom. Unsupported tests are reported as unmeasured rather than forced.
- Preserve browser-free event processing and a PostgreSQL-compatible future job boundary without implementing production scheduling, trading logic, AI, billing, or a dashboard.

## Capabilities

### New Capabilities

- `bounded-browser-lifecycle`: Synthetic fixture isolation, persistent profiles, exclusive ownership, termination, cancellation and recovery.
- `browser-resource-benchmark`: Host preparation, resource admission, reproducible comparisons, measurements, capacity modelling and a final decision report.

### Modified Capabilities

None; there are no existing application specifications to amend.

## Impact

Future implementation will introduce a small TypeScript/Playwright harness, a controlled fixture, isolated browser execution and local benchmark outputs. Jarlaxle is the experiment host; temporary dependencies and runtime setup require recording. No Facebook access, real credentials, public browser endpoints, production database, or application feature is required. Protected synthetic profiles and raw local metrics are excluded from version control; only sanitised findings belong in the repository.

## Acceptance Criteria

- Identify the current Minecraft workload and its memory; record approval or owner-performed shutdown, verified termination, and a refreshed post-stop baseline before testing. If it is already stopped, document that fact and capture the current baseline without inventing a second shutdown.
- Complete at least 100 visits in each primary arm, with rotation covering all three tenants, or report an incomplete/inconclusive result with the safety reason. Never run browsers merely to satisfy the visit count under unsafe pressure.
- Require zero wrong-tenant observations or lock violations, successful persistence checks on every clean rotation visit, at least 99% first-attempt success in each primary arm, and successful recovery in each declared injected-failure scenario.
- Verify complete process termination before reassignment, quantify post-shutdown reclamation, and stay within the declared host safety envelope.
- Report measured timings/memory and explicitly labelled projections for 5/20/50/100 active sellers, 2/5/10/15-minute intervals, and one/two/four slots; distinguish measured concurrency from extrapolation.
- End with GO, NO-GO or INCONCLUSIVE against the design's explicit criteria and recommend the next bounded change. A completed experiment may validly conclude NO-GO; passing this experiment never authorises Meta automation.
