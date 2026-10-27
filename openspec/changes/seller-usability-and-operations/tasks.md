## 1. Establish additive data and query changes

- [x] 1.1 Confirm callers of workspace/history/view/mutation and synthetic-generator functions, existing tests and protected scheduler contracts; record a baseline checklist and explicit private demo/test dataset paths without changing shared services.
- [x] 1.2 Extend versioned migrations/schema checks for bounded display name, independent profile version and chronological order browsing where needed; safely backfill existing rows and test fresh setup plus version-1/2 upgrades preserving source identities, sessions and held/paid/completed records.
- [x] 1.3 Probe runtime-role grants; prevent business/scheduler DDL, migration writes and audit UPDATE/DELETE while preserving required pg-boss queue permissions. Add focused role assertions and verify the provisioning role is absent from normal serving.
- [x] 1.4 Add validated seller-scoped keyset pages and allowlisted filters to existing workspace/order-history reads (default 25, maximum 100, one continuation row); test complete traversal, filter/cursor failures and colliding/foreign seller IDs.
- [x] 1.5 Bound detail children, messages, drafts, claims/backups, timelines and shared-instruction snapshots with SQL joins/EXISTS; eliminate full draft-reference arrays and test long histories without changing backup rank or snapshot visibility.
- [x] 1.6 Add bounded server-side inventory/item search/selection and late-page association; test that records beyond 200 can be selected, edited and opened directly without loading every collection.

## 2. Organize and style the existing seller workspace

- [ ] 2.1 Refactor selected-view rendering into overview, inventory/WTS, conversations, orders/history and settings/help using existing forms/domain functions; add scoped contextual detail links, current-navigation indication and safe filtered return destinations; update existing dashboard test callers.
- [ ] 2.2 Serve a small fixed same-origin stylesheet/script with narrowly scoped CSP allowances; implement the shared shell, system typography, spacing/surface/status tokens, native controls, focus/press states and responsive rows using the apple-design references in design.md, with no new dependency.
- [ ] 2.3 Render independent claim/reservation/response/payment/fulfilment states and concise next actions, with explicit synthetic labels, MYR totals, deadlines/timezones and empty states; verify paid/evidence/simulated-delivery and posted/collected distinctions in focused dashboard scenarios.
- [ ] 2.4 Complete semantic labels/landmarks/skip navigation, 44 CSS px action targets, light/dark appearance and reduced-motion behavior; check contrast, keyboard focus, 320 CSS px reflow, 200% zoom and the declared desktop/mobile viewports with screenshots and existing Playwright assertions.

## 3. Add minimal invited-seller onboarding

- [ ] 3.1 Add the authenticated display-profile form with current-version/CSRF validation and transactional activity; test foreign/stale/unsafe input and persistence across logout/restart without changing login or payment-instruction versions.
- [ ] 3.2 Add first-use checklist links/progress derived from owned profile, inventory, listing/mapping and instruction facts; reuse existing forms/defaults and test interrupted/out-of-order onboarding without duplicate records or implicit approvals.
- [ ] 3.3 Add concise persistent negotiation/intervention help and synthetic-scope login guidance; exercise an invited seller's full onboarding on narrow and desktop layouts, including disabled negotiation and separate instruction/delivery approval.

## 4. Guard critical interactions and make errors recoverable

- [ ] 4.1 Add read-only contextual confirmation pages and server-validated explicit intent for unpaid cancellation and completion; preserve CSRF/version/domain functions and test cancel/back/no-confirmation paths plus a two-session state change before final submission.
- [ ] 4.2 Add the payment review step with manually entered exact amount, unchecked trusted-receipt attestation and commitment consequences; update HTTP/Playwright/capture-demo callers as needed and test wrong/late amounts, expired holds, blocking review and replay without duplicate stock effects.
- [ ] 4.3 Replace raw/generic action failures with safe field summaries, relevant current state and recovery links; preserve non-secret valid inputs, handle response uncertainty/relogin, add immediate progressive pending feedback and verify the core workflow still works without JavaScript.

## 5. Add bounded activity updates

- [ ] 5.1 Add an authenticated read-only recent-activity/attention endpoint with bounded queries and no private message/address/instruction bodies; test tenant isolation, revoked sessions, input bounds and out-of-order activity commits without treating an identity watermark as complete history.
- [ ] 5.2 Add visible-tab checks every 10 seconds, single in-flight request, hidden-tab pause and bounded error backoff; show freshness/relogin/degraded feedback and test that updates preserve in-progress forms, versions, focus, selection and scroll, including reduced motion and manual no-JS refresh.

## 6. Make the demonstration repeatable through existing trading paths

- [ ] 6.1 Give each synthetic demo run/step stable identities and serialize next-position generation at the shared trusted source boundary used by HTTP and CLI; test concurrent generation and retry after response loss without source collisions or duplicate effects.
- [ ] 6.2 Add a guided browser-only sequence over existing inventory/listing and buyer simulation controls, linking to prerequisites and A's order; use one MYR 10.00 unit, B backup and zero-fee collection without auto-verifying payment or fulfilment.
- [ ] 6.3 Extend the existing end-to-end acceptance to finish onboarding and the guided sale twice, preserving both histories and verifying one stock commitment per run; cover desktop/mobile and separate unpaid expiry/promotion, ambiguous-review and intermediate postage/drop-off cases using existing focused tests.

## 7. Exercise bounded browser-free operations and recovery

- [ ] 7.1 Add one finite operations runner with explicit disposable dataset/output ownership checks, secure credentials, stable event IDs, two-seller concurrency ceiling and streamed private evidence; include a small self-check for workload limits and report accounting before running a soak.
- [ ] 7.2 Collect actual application/worker and separate runner RSS/CPU, concurrent database cgroup metrics, host pressure/swap and request/pool/query/backlog/storage observations; add the predeclared memory/disk abort gates, 60-second baseline and fixed-record settled windows without changing host services.
- [ ] 7.3 Add controlled disconnect/reconnect and startup-readiness cases, including idle pool errors, in-flight rollback, app restart and lost commit acknowledgements; fix only observed existing pool/transaction/worker recovery gaps and assert safe resumption within 30 seconds of readiness.
- [ ] 7.4 Exercise unavailable optional capture, one failing seller stream and stopped scheduler/Chromium/AI; ensure expiry and healthy sellers continue through narrowly scoped worker fixes and retain invalid/missing source evidence rather than fabricate events.
- [ ] 7.5 Extend existing real-database tests for held-stock edits, same-unit races, expiry/cancellation/promotion, payment races, duplicate/conflicting events and session revocation; keep test-only deadline manipulation in the disposable dataset and prove no duplicate business/audit effects after restart.
- [ ] 7.6 Generate bounded 250/1,000-order-per-seller growth stages with >200 related records and a long thread; measure query plans/returned rows/latency/storage, add only justified indexes or batch adjustments and verify the declared p95 targets and complete paged browsing.
- [ ] 7.7 Run the predeclared 60-minute/240-sale clean soak separately from fault/growth stages; retain every planned attempt, resource samples, backlog settlement and both five-minute settled windows; mark any missed correctness/resource/latency gate failed or inconclusive with evidence.

## 8. Close acceptance and publish the operator handoff

- [ ] 8.1 Verify all new routes/forms/cursors/updates against two sellers with colliding/foreign IDs, session/CSRF/origin/stale/escaping cases and private-log checks; perform and record a manual keyboard/screen-reader pass alongside light/dark, reduced-motion, zoom, no-JS and responsive screenshots.
- [ ] 8.2 Write the exact setup/login/browser-only demo, non-destructive repeat, restart/reconnect/expiry, interruption, backup/restore and rollback instructions; prove restore to a separate private dataset, explain schema downgrade limits and document future external-access requirements without configuring public access.
- [ ] 8.3 Run TypeScript, existing benchmark units, trading unit/database/dashboard suites and scheduler database checks; run the existing fixture recovery suite only on a prepared owned host under unchanged browser admission/ownership rules. Record unavailable host gates as blocked and obtain owner approval only if an existing rule requires a service stop; never stop unrelated services automatically.
- [ ] 8.4 Correct root/runbook status claims and publish a sanitised acceptance report mapping the four capability specs to tests, measured limits, failures and retained private evidence. Run strict OpenSpec validation and diff checks; leave live Meta authorization unresolved and do not archive or deploy automatically.
