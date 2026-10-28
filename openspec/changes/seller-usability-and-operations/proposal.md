## Why

PasarPilot already completes an authenticated, deterministic MYR 10.00 synthetic sale, but its single long dashboard, truncated record views and operator-oriented setup are awkward for invited sellers. The next milestone should make that existing workflow understandable and recoverable, and establish bounded browser-free operating evidence before inviting sellers to demonstrations.

## What Changes

- Organize the existing seller dashboard around work needing attention, inventory/WTS listings, conversations, orders/history and settings. Add contextual links, explicit independent transaction states, responsive layouts and bounded recent activity updates.
- Use the installed `apple-design` reference as the primary UI/UX design reference: clear hierarchy, restrained visual treatment, readable typography, consistent spacing, purposeful feedback, light/dark appearance, keyboard access and reduced motion. Translate its Apple Human Interface Guidelines into ordinary responsive web components in the current stack.
- Add a resumable first-use checklist, a minimal seller display profile and explanations linking existing inventory, listing mapping, payment-instruction approval, negotiation and intervention controls. Keep operator-provisioned accounts and current defaults.
- Make payment verification, reservation cancellation and completion deliberate, contextual actions. Explain stale state and rejected actions without weakening existing authorization, exact-amount, stock, expiry, review or version guards.
- Replace silent 200-record truncation with server-side pagination/filtering and scoped detail reads, including related-record selectors and histories. Measure response latency and database plans before adding indexes or changing worker batch boundaries.
- Add finite, browser-free operational workloads for two concurrent sellers, duplicates, held-stock edits, expiry/promotion, disconnects, restarts and interrupted operations. Record latency, resource use, backlog and database/storage growth without disturbing unrelated services.
- Make the existing synthetic buyer controls a guided, repeatable dashboard demonstration; document setup, recovery, safe cleanup, acceptance gates and future external-access requirements. Correct stale project documentation.

## Capabilities

### New Capabilities

- `seller-onboarding`: Invited-seller first-use guidance, minimal display profile, safe configuration and resumable progress through existing trading functions.
- `trading-operational-readiness`: Bounded browser-free reliability, security, growth and resource acceptance evidence, plus operator recovery guidance.
- `seller-demonstration`: A repeatable synthetic dashboard sale with isolated data, clear operator instructions and verifiable outcomes.

### Modified Capabilities

- `seller-trading-workspace`: Improve workflow navigation, contextual and accessible guarded actions, responsive visual consistency, bounded record browsing and non-disruptive freshness feedback.

## Impact

Extend `benchmark/src/trading/dashboard.ts`, `server.ts`, `workspace.ts` and `history.ts`; reuse the existing catalog, authentication, payment, proposal, review and fulfilment functions. Add only small same-origin CSS/JavaScript assets for presentation and progressive enhancement. Extend versioned migrations for minimal profile fields and measured query needs; preserve existing records, runtime-role restrictions and audit history. Review `db.ts`, `worker.ts`, `consumer.ts`, `stock.ts` and synthetic intake callers for measured recovery/batching gaps rather than replace them.

Extend existing trading unit/PostgreSQL/dashboard tests and add a bounded operations runner/report alongside current tooling. Update `README.md`, `benchmark/README.md` and research evidence. No new runtime dependency, dashboard framework, ORM, service or public endpoint exposure is planned. Existing benchmark/scheduler commands, schemas, browser admission, ownership and fixture contracts remain intact.

This change excludes live Facebook/Messenger automation, posting, WTB scanning, OpenRouter/other AI models, billing, real payments, public registration, production access configuration and architectural rewrites. Meta authorization remains unresolved. UI test browsers are test clients; the trading service itself must work with Chromium and the browser scheduler stopped.
