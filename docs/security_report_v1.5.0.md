# Security Report — tofucode v1.5.0

**Date:** 2026-05-03
**Scope:** Changes introduced in v1.5.0 since v1.4.0

---

## Summary

Static code review of all new and modified server-side files plus `npm audit` on dependency tree. The v1.5.0 additions (session branching, btw injection, effort selector, session rewind, compact button) follow the same authentication and input-validation patterns established in earlier releases.

**Overall status:** ✅ Safe to release — no Critical issues; High findings are build-toolchain-only with accepted rationale; one Medium finding fixed; one Medium accepted.

---

## Findings

### Fixed

| # | Severity | Finding | Resolution |
|---|----------|---------|------------|
| 1 | Moderate | **postcss < 8.5.10 — XSS via unescaped `</style>` in CSS stringify output** ([GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93)) | Fixed — `npm audit fix` upgraded postcss to 8.5.10 |
| 2 | Medium | **prompt.js — verbose debug logs leaking full queryOptions JSON** (included `resume` session ID, full options object) | Fixed — removed development-only debug `console.log` calls; sanitised error-block logging to omit full options dump |

### Accepted Risks

| # | Severity | Finding | Rationale |
|---|----------|---------|-----------|
| 3 | High | **serialize-javascript ≤ 7.0.4 — RCE via RegExp.flags / CPU exhaustion DoS** ([GHSA-5c6j-r48x-rmvq](https://github.com/advisories/GHSA-5c6j-r48x-rmvq), [GHSA-qj8w-gfj5-8c6v](https://github.com/advisories/GHSA-qj8w-gfj5-8c6v)) — transitive via `vite-plugin-pwa → workbox-build → @rollup/plugin-terser` | **Build-toolchain only.** The vulnerability is triggered by crafted input to the Terser minifier. tofucode's build pipeline processes only its own trusted source code — no user-controlled or third-party untrusted code is fed to the minifier. The available fix (`npm audit fix --force`) would downgrade `vite-plugin-pwa` from 1.2.0 to 0.19.8 (a major version regression), breaking PWA manifest generation and service worker injection that were built and tested for 1.x. No 1.x release of vite-plugin-pwa resolves this upstream chain. Risk in production is zero (this package is a dev dependency, not shipped). |
| 4 | Moderate | **@anthropic-ai/sdk 0.79.0–0.91.0 — insecure default file permissions on Local Filesystem Memory Tool** ([GHSA-p7fg-763f-g4gf](https://github.com/advisories/GHSA-p7fg-763f-g4gf)) — in `@anthropic-ai/claude-agent-sdk ≥ 0.2.91` | **Unfixable upstream + not applicable.** The fix requires `@anthropic-ai/sdk ≥ 0.92.0`, but `@anthropic-ai/claude-agent-sdk` (the package tofucode depends on) pins `^0.81.0` and no published version currently requires 0.92+. Additionally, tofucode does not use the Local Filesystem Memory Tool that is the subject of the CVE. tofucode is a single-user, self-hosted application running on a personal VM — world-readable files on a single-user system carry no practical cross-user exposure. Will re-evaluate when claude-agent-sdk ships a compatible release. |
| 5 | Medium | **rewind-session.js — undo store shared across all WS connections per session** (concurrent rewinders from different browser tabs could overwrite each other's undo state) | **Single-user by design.** tofucode is a personal self-hosted tool; concurrent rewinders on the same session from different tabs is an edge case with no security implication. The worst outcome is a missed undo — not a data integrity or authentication issue. Deferred to a future UX polish pass. |

### Not Applicable / Confirmed Safe

| Area | Finding | Verdict |
|------|---------|---------|
| Session ID validation | All new handlers (`fork-session`, `rewind-session`, `compact-session`) validate `sessionId` with a UUID regex before filesystem operations | ✅ Secure |
| Path traversal | `fork-session` and `rewind-session` build paths exclusively from UUID-validated session IDs via `pathForSession()`; project root restriction enforced in `select-project` | ✅ Secure |
| btw injection | User-supplied btw text is pushed to `AsyncQueue` and delivered as `{ role: 'user', content }` to the SDK; no intermediate eval or code execution | ✅ Secure |
| Effort parameter | Validated against a fixed whitelist (`low/medium/high/xhigh/max`); invalid values silently ignored (SDK default used) | ✅ Secure |
| Model string | Validated by regex `^claude-[a-z0-9-]+$`; unknown model names are rejected by the Claude API at call time | ✅ Secure |
| Async context clobber | Fixed in this release — pre-await session ID snapshot prevents handler from overwriting context after user switches sessions | ✅ Fixed |
| Session watcher race | Fixed in this release — `select-project` no longer prematurely unregisters the watcher | ✅ Fixed |
| Prototype pollution | No `Object.assign` with user data; no custom JSON reviver; `AsyncQueue` is a simple FIFO with no prototype manipulation | ✅ Secure |
| Input injection | No `eval`, `exec`, or dynamic code evaluation; all SDK interactions are type-safe JSON | ✅ Secure |

---

## npm audit (post-fix)

```
@anthropic-ai/sdk  0.79.0 - 0.91.0
Severity: moderate — Insecure Default File Permissions in Local Filesystem Memory Tool
https://github.com/advisories/GHSA-p7fg-763f-g4gf
(accepted risk — see finding #4)

serialize-javascript  <=7.0.4
Severity: high — RCE via RegExp.flags / CPU Exhaustion DoS
https://github.com/advisories/GHSA-5c6j-r48x-rmvq
https://github.com/advisories/GHSA-qj8w-gfj5-8c6v
(accepted risk — see finding #3)

6 vulnerabilities (2 moderate, 4 high) — all build-toolchain or upstream-unfixable
```

---

## Conclusion

All Critical and High application-code findings are resolved or carry explicit accepted-risk rationale. The two remaining High npm findings are exclusively in the build toolchain with no runtime exposure. Safe to release v1.5.0.
