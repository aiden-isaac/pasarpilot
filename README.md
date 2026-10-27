# PasarPilot

PasarPilot is a planned self-hosted trading assistant for sellers in Facebook buy/sell communities, initially the Malaysian Magic: The Gathering community. Buyers would continue using comments and Messenger; sellers would manage listings, claims, conversations and fulfilment from a native dashboard.

**Current status:** this repository contains a completed browser-lifecycle experiment and a tested single-slot durable fixture scheduler using PostgreSQL/pg-boss, plus research and OpenSpec artifacts. The SaaS application, production scheduler and Facebook integration have not been built.

## Architecture direction

Use a bounded pool of short-lived, tenant-isolated Chromium processes with seller-specific profiles stored securely between visits. Start with one slot, admit work against measured host headroom, and verify complete browser termination before releasing a profile. Keep deterministic business processing and any later AI interpretation outside browser occupancy.

```mermaid
flowchart LR
    Jobs[(Private PostgreSQL / pg-boss)] --> Driver[Durable fixture scheduler]
    Driver --> Admission[Resource admission and exclusive profile lease]
    Profile[(Selected persistent profile)] --> Browser[Fresh sandboxed Chromium container]
    Admission --> Browser
    Browser --> Fixture[Private synthetic fixture]
    Browser --> Events[(Flushed observation ledger)]
    Events --> Consumer[Browser-free consumer]
```

The normal product should use its dashboard without a permanently running remote desktop. Temporary headed sessions can support authentication or recovery; interactive access consumes separately admitted capacity. PostgreSQL/pg-boss now backs the synthetic scheduler; production integration and selective OpenRouter inference remain future work.

## Completed experiment

OpenSpec change: [`benchmark-bounded-browser-lifecycle`](openspec/changes/benchmark-bounded-browser-lifecycle/proposal.md). All 27 tasks are complete; the change remains available for review and has not been archived.

Measured on Jarlaxle on 2026-10-27, with approximately 7.1 GiB usable RAM and Minecraft stopped with owner approval:

| Measurement | Result |
| --- | ---: |
| Continuous control / fresh-process rotation | 100/100 visits passed in each arm |
| Rotation mean / p95 complete visit | 2.316 / 2.357 seconds |
| Rotation / continuous whole-attempt peak | 281.55 / 418.45 MiB |
| Calibrated fixture allowance per slot | 576 MiB |
| Available-memory deterioration after rotation | 13.50 MiB; within the 256 MiB tolerance |
| One-slot calculated capacity at 70% utilisation | Approximately 1,088 fixture checks/hour |
| Automated / final recovery tests | 14/14 and 16/16 passed |

**Decision: GO for a single-slot fixture scheduler next.** Two/four-worker short experiments and temporary noVNC access also passed. Higher concurrency figures are limited batch measurements; the throughput figure is a projection, not a sustained production result. These synthetic results do not establish Facebook/Messenger reliability, customer capacity or a subscription SLA.

All experiment containers and their private network were removed after measurement. Retained raw evidence and synthetic profiles stay outside Git. Minecraft was left stopped at experiment cleanup; future host changes require a fresh resource baseline.

## Completed fixture scheduler

OpenSpec change: [`schedule-bounded-fixture-visits`](openspec/changes/schedule-bounded-fixture-visits/proposal.md). It adds durable jobs, round-robin tenant turns, coalescing/backpressure, cancellation, restart reconciliation and browser-free consumption while retaining one admitted browser slot.

On Jarlaxle, **102/102 planned clean visits passed**, 34 per tenant, with no retries. Mean/p95 occupied time was **2.387/2.461 seconds**; browser peak was **298.80 MiB**, and concurrent database plus scheduler memory peaked at **147.56 MiB**. All 19 unit tests, three database integration tests and 16 controlled recovery cases passed. See the [measured scheduler evidence and limitations](docs/research/bounded-fixture-scheduling.md) and [runbook](benchmark/README.md#durable-single-slot-fixture-scheduler).

Fixture reset can change its origin and invalidate stored authentication/history; recovery refuses missing markers and retains uncertain actions. This result covers one synthetic host/slot, with raw evidence retained privately outside Git.

## Local development checks

Use Node.js 20 or newer, as declared by the benchmark package. The measured host used Node.js 22.23.4; the Playwright image used Node.js 24.22.1. No browser or container runtime is needed for these checks:

```sh
cd benchmark
npm ci
npm run check
npm test
```

Browser execution requires a prepared Linux host with rootless Podman, cgroup v2 and working Chromium sandbox support. Follow the [benchmark runbook](benchmark/README.md) for host preparation, image builds, matched comparisons, optional modes and protected artifact handling. There is no application server or dashboard to start yet.

## Documentation

- [Measured results, decision gates, limitations and implementation commits](docs/research/bounded-browser-lifecycle.md)
- [Durable fixture scheduler results, recovery evidence and limitations](docs/research/bounded-fixture-scheduling.md)
- [Capacity, queue latency and cost trade-offs](docs/research/bounded-browser-capacity.md), including the [864-scenario projection matrix](docs/research/bounded-browser-capacity.csv)
- [Sanitised Facebook UI observations and unresolved assumptions](docs/research/facebook-ui.md)
- OpenSpec [proposal](openspec/changes/benchmark-bounded-browser-lifecycle/proposal.md), [design](openspec/changes/benchmark-bounded-browser-lifecycle/design.md), [lifecycle requirements](openspec/changes/benchmark-bounded-browser-lifecycle/specs/bounded-browser-lifecycle/spec.md), [resource requirements](openspec/changes/benchmark-bounded-browser-lifecycle/specs/browser-resource-benchmark/spec.md) and [completed tasks](openspec/changes/benchmark-bounded-browser-lifecycle/tasks.md)

## Product and security boundaries

The intended first seller workflow is WTS claims through seller-confirmed payment and collection. Inventory, negotiation, AI, billing, onboarding and the dashboard are not implemented by this experiment.

- Meta authorisation remains an unresolved release gate. Seller permission alone does not authorise Facebook automation; no production Facebook automation runs here.
- Sellers must authenticate directly in their own isolated session. PasarPilot must not collect Facebook passwords or history-unlock PINs through its dashboard.
- Hosting authenticated profiles exposes account sessions to a privileged host operator. The prototype's filesystem permissions and containers are not a complete production encryption, access-control or remote-access design.
- A payment screenshot alone must never mark an order paid. Verification needs seller approval after checking a trusted account or a trusted payment provider.
- Keep real credentials, profiles, messages and raw browser artifacts out of Git. Do not expose CDP, VNC or container-management endpoints publicly.

The scoped `schedule-bounded-fixture-visits` change is implemented and validated. Real-platform integration and higher production concurrency still require separate approval and evidence.
