# Design

## Context

See [proposal.md](proposal.md) for the motivation and [owner-browser-session/spec.md](specs/owner-browser-session/spec.md) for the required behavior. Jarlaxle already runs rootless Podman with a pinned Playwright/Chromium image. `benchmark/src/runtime.ts`, `ownership.ts` and `metrics.ts` provide bounded fixture sessions, profile ownership, cgroup sampling and host admission. `benchmark/src/interactive.ts` proves headed Chromium and noVNC on a synthetic page, but its worker blocks non-fixture origins. Reusing that worker would prevent the owner's manual Facebook check. The fixture scheduler and seller workspace must keep their existing synthetic-only behavior.

## Goals / Non-Goals

**Goals:**

- Give the infrastructure owner a private screen, keyboard and mouse for a single headed Chromium process, with a profile that survives clean container replacement.
- Make every restart and resource claim observable without recording browser content. Treat the owner's authentication assessment as the only login result.
- Keep the owner session's data, process labels and lifecycle separate from the fixture scheduler, and make cleanup safe after interrupts and partial failures.

**Non-Goals:**

- Programmatic Facebook or Messenger navigation, DOM access, network interception, extraction, posting, messaging or challenge handling.
- A shared multi-user remote desktop, public browser endpoint, Facebook account management or a trading workflow backed by Facebook data.
- A claim that Meta permits automated access or that local filesystem permissions provide encryption at rest.

## Decisions

### 1. Use a separate owner-session command and worker

Create a dedicated command under `benchmark/` for this experiment. It may reuse the current container, ownership and metrics primitives after extracting platform-neutral pieces, but its browser worker has no fixture route handler and no application adapter. It opens `about:blank`; only the VNC input path changes the page. Give its containers distinct names and labels, and put its profile and reports under a new absolute owner-selected root outside the checkout. Do not change the fixture worker's origin restriction or scheduler database.

This keeps the controlled fixture regression meaningful and prevents a future Facebook adapter from being enabled accidentally by a scheduler flag. The alternative of relaxing the fixture worker's origin guard would blend two different trust boundaries.

### 2. Offer temporary private viewing through loopback and SSH

Run Xvfb, x11vnc and noVNC/websockify with the headed browser in an isolated rootless container. Bind the host-facing noVNC port to `127.0.0.1` only, use a fresh random viewer secret for each launch, and require the owner to connect through SSH local port forwarding to Jarlaxle. Keep CDP unexposed. Give each viewer a fixed maximum lifetime and end it on close, timeout or controller failure; erase its temporary secret after revocation. The CLI prints a local URL and tunnel command, never the secret in a persistent report or process arguments. Provision the secret in a mode-0600 temporary file or equivalent private channel.

SSH is already an authenticated path on Jarlaxle and needs no new public ingress. Directly binding VNC/noVNC to `0.0.0.0` or exposing a container port would make the live authenticated browser reachable beyond the owner. A Cloudflare Tunnel with Access could be a later access option, but it is not required for this smallest experiment and is not currently installed or configured here.

### 3. Persist exactly one protected profile and prove ownership before reuse

Use a dedicated profile directory outside Git, owned by the Jarlaxle operator with `0700` directories and restrictive file creation. Reject symlinks, relative paths, path escape and concurrent ownership; hold a lease through every launch, close and report write. Mount only that selected directory at the browser's profile path. Start each cycle in a new container using the same profile, after the prior browser and viewer process tree has stopped and its container has been removed. If termination cannot be proven, retain the lease in a recoverable failed state and block reopening. Never delete the profile as routine cleanup.

This extends the tested selected-profile pattern while isolating owner browsing from tenant fixture profiles. A disposable profile would not answer the session-survival question. The host filesystem is not known to be encrypted, so the runbook must describe the profile as sensitive and accessible to privileged host operators.

### 4. Make the five-cycle experiment explicit and content-free

An experiment consists of one initial launch and five owner-requested close/reopen cycles. A cycle starts only after the owner requests it; the controller never inspects the browser to decide when login is complete. Sample startup-to-viewer-ready time, cgroup `memory.current` and `memory.peak`, and close-to-verified-stop time for each launch. After each reopen, prompt the owner for `survived`, `lost` or `unknown`. Store the owner's choice, not browser evidence. Report six launches and five assessments only when all five cycles finish; otherwise mark the run incomplete and retain attempted-cycle measurements with explicit missing values and failure codes. The final close is measured too.

Use a structured report schema that has no URL, page title, console, HTML, network record, screenshot, video, cookie, token or free-text account field. Logs use fixed lifecycle event names and numeric values. Do not enable Playwright tracing, HAR or screenshot capture. This gives enough evidence for memory and restoration decisions while preventing accidental content collection. Automated login checks or screenshots would cross the experiment boundary.

### 5. Preserve bounded host operation and verified cleanup

Before the first launch, take the established 60-second host baseline and apply the existing admission gate, 2 GiB browser cap, host guard and reserve policy. Apply the same checks before each reopen. Monitor cgroup usage and pressure while the browser is live. On normal close, timeout, pressure or interruption, stop only containers carrying the experiment's unique labels, wait for their cgroups/processes to empty, remove them, revoke viewer access and release ownership only after verification. A failed verification ends the run and blocks the next launch. Do not stop unrelated Jarlaxle services.

The existing benchmark lifecycle is the known bounded approach; an unbounded desktop service would give no reliable cleanup or memory result. A controller restart should reconcile its own labeled containers and lease before opening another browser.

## Risks / Trade-offs

- **Profile holds account state and browsing history** → Restrict the data root to the owner, keep it outside Git and backups intended for test artifacts, document host-admin access, and require a separate explicit deletion action. Do not claim filesystem encryption.
- **The owner may encounter a verification challenge or login expiry** → Leave all interaction to the owner and record `lost` or `unknown` as appropriate; never bypass or infer a result from page content.
- **A leaked viewer credential could expose the live browser** → Bind the viewer to loopback, require SSH authentication, generate a new short-lived secret per launch and revoke it at close.
- **A crash could leave Chromium or the viewer alive** → Reconcile only uniquely labeled experiment processes, verify cleanup and block profile reuse until it is proven stopped.
- **Measurements may not generalize to future automated Facebook use** → Report only manual session feasibility and bounded resource behavior. Meta permission for automated Facebook access remains unresolved; no adapter is enabled.

## Migration Plan

1. Add the separate command, worker, private viewer and report schema without altering the fixture scheduler or trading database.
2. Document one-time Jarlaxle setup, private data-root creation, loopback SSH forwarding and manual sign-in/restart instructions.
3. Verify the command first against a blank or controlled synthetic page, including interrupt and cleanup cases. Then the owner may navigate to Facebook manually and perform the five measured cycles.
4. On failure, close the experiment's labeled processes and revoke access. Retain the profile and content-free report for owner review. Removing the new command is a code rollback; profile disposal is a separate explicit owner decision.
