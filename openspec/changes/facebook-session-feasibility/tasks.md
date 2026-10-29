# Tasks

## 1. Isolated owner session foundation

- [ ] 1.1 Add a dedicated owner-session CLI entry point and worker that launch headed Chromium at `about:blank` with no fixture routing or Facebook adapter; verify a local run can open a blank page and existing fixture tests still pass.
- [ ] 1.2 Add a separate absolute data root, owner-only persistent profile and exclusive lease with symlink/path-escape checks; verify parallel launch is rejected and a second launch sees the same profile after verified first-process termination.
- [ ] 1.3 Add experiment-specific Podman names/labels, rootless sandbox settings and per-container resource caps; verify the browser runs as non-root with Chromium sandbox enabled and fixture containers remain untouched.

## 2. Temporary private remote browser

- [ ] 2.1 Start Xvfb, x11vnc and noVNC/websockify with the headed browser, publish the viewer on a host `127.0.0.1` port only, and keep CDP unexposed; verify manual keyboard, mouse and navigation work through an SSH local port forward and no listener binds a public interface.
- [ ] 2.2 Generate a fresh temporary viewer credential for each launch, set a maximum viewer lifetime and revoke it on close or expiry; verify an old credential cannot reconnect after restart and no credential appears in process arguments, logs or saved reports.
- [ ] 2.3 Document Jarlaxle preparation, SSH forwarding, manual site sign-in, viewer expiry and profile sensitivity in an owner runbook; verify the documented blank-page connection procedure works as written.

## 3. Bounded lifecycle and measurement

- [ ] 3.1 Reuse the established host baseline, admission and pressure checks before and during every owner launch, and sample startup time and cgroup current/peak memory; verify a controlled run records numeric measurements and a rejected admission starts no browser.
- [ ] 3.2 Implement owner-triggered close/reopen on the same profile, with verified browser/viewer termination before the next launch; verify six distinct launches can support five restarts and a failed termination blocks reuse.
- [ ] 3.3 Handle normal close, deadline, pressure and controller interruption by stopping only experiment-labeled processes, revoking viewer access and retaining the profile; verify fault/interrupt checks leave no experiment process running and do not stop unrelated containers.

## 4. Owner assessment and content-free evidence

- [ ] 4.1 Prompt for `survived`, `lost` or `unknown` after each reopen and store five owner assessments with per-launch startup, peak memory, shutdown and cleanup results; verify complete and interrupted reports distinguish completed, missing and failed measurements without inferring login state.
- [ ] 4.2 Use an allowlisted report schema and fixed lifecycle log fields, with no screenshot, tracing, HAR, DOM, URL path, cookies, tokens, messages or group content; verify a controlled sensitive-string check finds no fixture page text or seeded secret in saved artifacts.
- [ ] 4.3 Document that Meta permission for automated Facebook access remains unresolved and that no extraction/send adapter is enabled; verify the runbook and CLI offer only manual browser control, cycle controls and resource reports.

## 5. Integrated feasibility run

- [ ] 5.1 Run the blank-page/synthetic smoke check and relevant benchmark regressions, inspect process cleanup and validate the OpenSpec change; verify all checks pass or record the exact failure in the run report.
- [ ] 5.2 With the owner controlling the browser, perform one initial manual sign-in and five close/reopen cycles on Jarlaxle, collect the five owner-entered authentication assessments and resource measurements, then verify all experiment processes are stopped while the protected profile remains. Record an incomplete run if the owner stops or a cycle fails.
