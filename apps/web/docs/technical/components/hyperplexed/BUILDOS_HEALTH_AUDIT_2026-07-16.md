<!-- apps/web/docs/technical/components/hyperplexed/BUILDOS_HEALTH_AUDIT_2026-07-16.md -->

# BuildOS Cross-Surface Health Audit — 2026-07-16

**Status:** Clear defects shipped; public route, responsive, automated, and production-preview checks pass.

## Scope

- Requested the full 167-URL public sitemap from the production preview.
- Inspected 20 representative public/auth routes at 390 px and seven content-heavy routes at 320 px, with desktop and light/dark checks on the public shell and Skills gallery.
- Exercised navigation, theme switching, the mobile menu, protected-route behavior, landmark/heading structure, horizontal overflow, image alternatives, tests, type checking, lint guardrails, and a production build.
- Measured warm local production-preview response time, HTML size, and initial preloads for representative SSR routes. These local timings are useful for relative regressions, not a substitute for deployed Lighthouse or field data.

## Findings shipped

### Tier 1

- **SMS monitoring access and failure state (P3, P13, P19):** `/sms/monitoring` exposed an admin dashboard shell to unauthenticated visitors, then failed against protected metrics APIs. A server guard now redirects unauthenticated visitors to login and non-admin users to the dashboard. The legacy light-only dashboard palette now inherits Inkprint tokens, controls have visible focus treatment, auto-refresh exposes pressed state, and spinners respect reduced motion.
- **Briefs unauthenticated dead-end (P3, P13):** `/briefs` rendered an indefinite loader while its client requests returned `Unauthorized`. The page now redirects to login before rendering and preserves the requested URL.

### Tier 2

- **Document landmark nesting (P13):** the docs layout nested a second `<main>` inside the root application landmark. The inner container is now neutral, leaving one main landmark per page.
- **Password recovery hierarchy and tinted-message contrast (P4, P13, P19):** forgot/reset titles are now level-one headings, and body text on semantic soft tints uses the normal foreground color.
- **SMS alert reactivity (P20):** the alert list now uses `SvelteSet` instead of cloning a native `Set` after every mutation.

### Engineering guardrail

- The project-full API route exceeded the 400-line route limit. Reusable event-window, context-document, error, profile, and performance helpers moved to `project-full-api-helpers.ts`; the handler is now 351 lines with its existing behavior covered by tests.
- Removed the now-stale transcribe-route entry from the oversized-route allowlist.

## Performance snapshot

| Route      | Warm local median |      HTML | Initial preloads (gzip) |
| ---------- | ----------------: | --------: | ----------------------: |
| `/`        |            4.4 ms |  80.2 KiB |               172.3 KiB |
| `/pricing` |            3.4 ms |  35.3 KiB |               163.4 KiB |
| `/skills`  |           14.7 ms | 285.4 KiB |               187.5 KiB |

The public shell is responsive and fast after warm-up, but the number of initially preloaded modules and the Skills HTML payload remain the clearest performance opportunities. This pass deliberately avoids a speculative bundle rewrite without deployed trace data.

## Verification

- 167/167 sitemap URLs return HTTP 200 in the final production preview.
- `/briefs` and `/sms/monitoring` return browser navigation redirects to login when unauthenticated.
- Representative 320 px and 390 px pages have no horizontal document overflow.
- Docs, forgot-password, and reset-password expose one main landmark and one H1.
- Svelte autofixer: no remaining issues or suggestions in all touched components.
- `svelte-check`: 0 errors, 0 warnings.
- Lint and repository guardrails: pass. The existing ESLint baseline still reports 210 unused-code warnings and no errors.
- Full suite: 416 files, 2,571 tests passed.
- Production build: passed. The Vercel adapter continues to report optional Sharp dependency-trace warnings.

## Follow-up evidence still worth collecting

- Run deployed mobile Lighthouse/Web Vitals; local preview cannot model CDN, network, or real-device costs.
- Profile why the public shell preloads 79–94 assets and reduce the `/skills` HTML/catalog payload if field data confirms impact.
- Perform authenticated visual smoke checks for the main product surfaces and the admin-only SMS dashboard with representative data.
- Burn down the existing 210 unused-code warnings separately so future lint output becomes higher signal.
