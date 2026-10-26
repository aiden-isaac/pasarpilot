# Controlled browser lifecycle benchmark

This workspace implements only the synthetic experiment in
`openspec/changes/benchmark-bounded-browser-lifecycle/`. No Facebook, AI or trading integration.

Use Node.js 20 or newer, then `npm ci`, `npm run check`, `npm test` from this directory.
Dependencies are exactly pinned in the lockfile. Browser installation is separate from dependency installation.
The browser image must match Playwright 1.64.1; container/runtime setup is explicit, not performed by npm scripts.

Before remote browser execution: obtain owner approval for any Minecraft stop, verify graceful exit,
collect pre/post-stop and warmed baselines, and verify container limits and non-root Chromium sandboxing.
Start with one slot. No result from unit tests constitutes a browser benchmark or a GO decision.

Runtime/data commands will be documented with their implementation. Raw outputs and browser profiles
must remain protected and outside version control; publish only aggregate synthetic findings.
