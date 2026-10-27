# Bounded browser capacity projections

These calculations use the controlled Jarlaxle fixture, with Minecraft stopped. They are **not Facebook capacity or subscription SLAs**. One-slot inputs cover 100 complete fresh-process visits. Two/four-slot inputs cover only three successful concurrent batches each; the five-second observation hold is removed, while all work/cleanup time remains charged conservatively to every batch slot. Sustained concurrent throughput remains unverified.

No warm-ups or failed primary attempts were excluded: both primary arms had zero failures/retries. Startup, restoration, extraction, durable observation, shutdown and ownership release are included in service cost. Outgoing-browser action cost is unmeasured and assumed equal to an observation visit.

## Service and memory envelope

| Slots | Measured effective service, s | Raw checks/hour projection | 70% planning checks/hour | Aggregate admitted cap |
| --- | ---: | ---: | ---: | ---: |
| 1 | 2.316 | 1555 | 1088 | 576 MiB |
| 2 | 3.039 | 2369 | 1658 | 1,152 MiB |
| 4 | 4.841 | 2975 | 2082 | 2,304 MiB |

The primary arms actually used a matched 2 GiB hard cap; the later 576 MiB per-slot allowance is calibrated from the larger 418.45 MiB resident-control peak with 125% rounded headroom. A hard cap is an admission commitment, not measured constant RAM. Short two/four-slot tests observed approximately 559/1,123 MiB maximum aggregate current memory. The host budget also reserves 1.065 GiB for safety and 1.5 GiB for a future application/database. Rebaseline if Minecraft or other workloads return.

## Active-seller interval matrix

Utilisation percentages are actual demand divided by projected raw capacity. `>70%` exceeds planning headroom; `unstable` means >=100% utilisation and no finite backlog/delay promise. Registered inactive sellers are not included in these active-seller counts.

| Active sellers | Interval, min | 1 slot utilisation | 2 slots utilisation | 4 slots utilisation |
| --- | ---: | ---: | ---: | ---: |
| 5 | 2 | 9.6% | 6.3% | 5.0% |
| 5 | 5 | 3.9% | 2.5% | 2.0% |
| 5 | 10 | 1.9% | 1.3% | 1.0% |
| 5 | 15 | 1.3% | 0.8% | 0.7% |
| 20 | 2 | 38.6% | 25.3% | 20.2% |
| 20 | 5 | 15.4% | 10.1% | 8.1% |
| 20 | 10 | 7.7% | 5.1% | 4.0% |
| 20 | 15 | 5.1% | 3.4% | 2.7% |
| 50 | 2 | 96.5% >70% | 63.3% | 50.4% |
| 50 | 5 | 38.6% | 25.3% | 20.2% |
| 50 | 10 | 19.3% | 12.7% | 10.1% |
| 50 | 15 | 12.9% | 8.4% | 6.7% |
| 100 | 2 | 193.0% unstable | 126.6% unstable | 100.9% unstable |
| 100 | 5 | 77.2% >70% | 50.6% | 40.3% |
| 100 | 10 | 38.6% | 25.3% | 20.2% |
| 100 | 15 | 25.7% | 16.9% | 13.4% |

Thus the synthetic five-seller/15-minute pilot uses only 1.3% of one slot's raw capacity. Fifty sellers every two minutes exceed one-slot planning headroom; 100 every two minutes are unstable even under the measured four-slot batch estimate. More memory alone does not remove CPU/startup contention.

| Slots | Minimum interval at 70%, minutes: 5 / 20 / 50 / 100 sellers |
| --- | --- |
| 1 | 0.28 / 1.10 / 2.76 / 5.51 |
| 2 | 0.18 / 0.72 / 1.81 / 3.62 |
| 4 | 0.14 / 0.58 / 1.44 / 2.88 |

## Resource cost per seller

Monthly occupied-slot hours use a 720-hour month, no outgoing visits/retries or interactive allocation. This includes lifecycle overhead, not just browser CPU time, and is not a monetary cost estimate. Higher-concurrency batch figures are conservative and based on a very short test.

| Monitoring interval, min | 1 slot, hours/seller/month | 2-slot batch estimate | 4-slot batch estimate |
| --- | ---: | ---: | ---: |
| 2 | 13.89 | 18.23 | 29.05 |
| 5 | 5.56 | 7.29 | 11.62 |
| 10 | 2.78 | 3.65 | 5.81 |
| 15 | 1.85 | 2.43 | 3.87 |

Formulae: service `D = total occupied attempt seconds / successful observations`; effective cost `(D + O × D_action) × (1 + extra_retry_rate)`; raw capacity `(3,600 × slots - H) / effective_cost`; planning capacity `0.70 × raw`; required observations/hour `60 × active_sellers / interval_minutes`; monthly slot-hours/seller `720 × effective_cost / (60 × interval_minutes)`. Retries already present in measured attempts would be amortised in D; the sensitivity retry rate represents additional failures only.

These figures do not establish whether RM25/month covers electricity, storage, support, security operations, payment fees or realistic Facebook workloads. Measure those costs before pricing.

## Queue and detection delay

[Complete 864-scenario matrix](bounded-browser-capacity.csv) contains every 5/20/50/100 active-seller, 2/5/10/15-minute, 1/2/4-slot combination, outgoing ratios 0/0.25/1, additional retries 0/5/15%, and interactive allocations 0/600 seconds/hour. It contains derived numbers only, no browser artifacts. The model is reproducible with `node dist/src/cli.js capacity DATA`; the complete private JSON is written to `DATA/runs/capacity.json`.

Assumptions: deterministic seed `0x5eed`; periodic FCFS non-preemptive jobs; at least six hours and 30 cycles, first five cycles excluded; empirical measured service samples; all sellers staggered evenly or all due together. Outgoing work is bundled after the observation, and an additional retry repeats that whole work bundle. Observed failure occupancy would already be amortised in D. The uniform event-arrival residual is integrated exactly over simulated queue/service offsets; detection includes the complete observation service duration conservatively. Interactive demand is due hourly and consumes a real slot for 600 seconds; it is neither free capacity nor preemptive priority. No tick coalescing, deadlines, provider push events or production fairness policy is simulated.

Queue and detection numbers below are mean/p95 **seconds**, without additional outgoing/retry/interactive demand unless noted. The higher-concurrency inputs are very small measured batch samples; these projections are not confidence bounds or long-run queue guarantees.

| Sellers / interval / slots | Staggered queue | Staggered detection | Burst queue | Burst detection |
| --- | ---: | ---: | ---: | ---: |
| 5 / 15 min / 1 | 0.0 / 0.0 | 452.3 / 857.3 | 4.6 / 9.3 | 456.9 / 861.9 |
| 20 / 2 min / 1 | 0.0 / 0.0 | 62.3 / 116.3 | 22.0 / 42.0 | 84.3 / 143.9 |
| 50 / 5 min / 1 | 0.0 / 0.0 | 152.3 / 287.3 | 56.7 / 108.8 | 209.1 / 358.0 |
| 100 / 5 min / 1 | 0.0 / 0.0 | 152.3 / 287.3 | 114.6 / 218.3 | 266.9 / 449.4 |
| 100 / 5 min / 2 | 0.0 / 0.0 | 153.0 / 288.0 | 74.5 / 142.8 | 227.5 / 386.0 |
| 100 / 15 min / 1 | 0.0 / 0.0 | 452.3 / 857.3 | 114.7 / 218.3 | 567.0 / 988.4 |

For five sellers every 15 minutes, one hourly ten-minute interactive block raises staggered mean/p95 queue delay to **64.0/422.3 seconds**, even though mean utilisation is low. Reserve interactive capacity or queue it with explicit limits; average capacity alone does not protect monitoring freshness. Actual production priority/fairness remains a later scheduler decision.

## Demand sensitivity

Example: 50 active sellers, five-minute interval, one slot. Outgoing visit cost is assumed equal to the measured observation cost.

| Extra outgoing visits/observation | Extra retry rate | Interactive seconds/hour | 70% observations/hour | Raw utilisation | Burst queue mean/p95, s |
| --- | ---: | ---: | ---: | ---: | ---: |
| 0 | 0% | 0 | 1088 | 38.6% | 56.7 / 108.8 |
| 0.25 | 0% | 0 | 871 | 48.2% | 71.2 / 136.6 |
| 1 | 0% | 0 | 544 | 77.2% | 113.5 / 217.7 |
| 0.25 | 5% | 0 | 829 | 50.7% | 74.9 / 143.8 |
| 0.25 | 15% | 0 | 757 | 55.5% | 82.3 / 157.8 |
| 0.25 | 15% | 600 | 631 | 66.6% | 206.3 / 648.8 |

At utilisation >=100%, the CSV has `stable=False`, queue status `unbounded`, and empty delay values instead of finite promises. At 70–100%, a scenario can be mathematically stable yet exceed planning headroom. The monitoring interval itself dominates freshness at low load: a 15-minute poll has a 7.5-minute mean residual wait before service, even with no queue. Offline polling still cannot recover unavailable/deleted events without authoritative history or push integration.
