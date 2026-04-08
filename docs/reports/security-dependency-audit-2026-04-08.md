<!-- docs/reports/security-dependency-audit-2026-04-08.md -->

# Security Dependency Audit - 2026-04-08

## Scope

This document tracks the April 8, 2026 security audit for the BuildOS monorepo.

Workstreams:

- Patch the dependency tree from the workspace root.
- Audit privileged Supabase client usage.
- Redesign rate limiting for expensive AI routes without degrading normal product use.
- Remove stale package declarations and redundant direct dependencies.
- Record open follow-ups around Gmail SMTP and lockfile policy.

## Dependency Surface

Primary external platforms in active runtime code:

- Supabase: auth, database, storage, realtime, admin/service-role access.
- Vercel: web deployment and build/runtime platform.
- Railway: worker runtime and internal webhook caller.
- OpenRouter/OpenAI/Moonshot-family via Smart LLM service: chat, transcription, and model routing.
- Google OAuth and Google Calendar APIs.
- Stripe: billing and subscription webhooks.
- Twilio: SMS verification, delivery status, and notifications.
- Gmail SMTP via Nodemailer: transactional notification delivery.
- Tavily: web search for agent tools.
- reCAPTCHA: public anti-abuse control.
- Web Push / VAPID: browser push delivery.

## Live Audit Snapshot

Audit command run on 2026-04-08:

```bash
pnpm audit --prod --json
```

Snapshot:

- Production dependencies: 627
- Advisories: 40
- High: 13
- Moderate: 19
- Low: 8
- Critical: 0

Highest-signal items from the live audit:

- `@sveltejs/kit`: DoS / possible SSRF exposure in affected prerendering paths. Target `>=2.49.5`.
- `vite`: dev-server file read and `server.fs.deny` bypass issues. Target `>=7.3.2`.
- `twilio -> axios`: DoS issue. Target `axios >=1.13.5`.
- `google-auth-library/googleapis -> jws`: target patched `jws`.
- `express -> path-to-regexp@0.1.12`: target `>=0.1.13`.
- `@antv/g6` / `cytoscape-dagre` tree: pulls vulnerable `lodash` and `serialize-javascript`.

Notes:

- Some findings are dev-server or build-chain weighted, but Vite matters here because the repo exposes `vite dev --host`.
- The worker Express issue is runtime-relevant.

### Post-remediation snapshot

After package updates and root overrides:

- Production dependencies: 628
- Advisories: 4
- High: 0
- Moderate: 1
- Low: 3

Remaining advisories:

- `nodemailer@7.0.11`: 1 moderate + 1 low advisory; audit recommends `8.0.5+`.
- `webpack@5.103.0` in the `@antv/g6` workerize path: 2 low advisories.

Interpretation:

- The original high-severity web/worker graph issues are substantially reduced.
- The remaining moderate item is tied to the current Gmail/Nodemailer delivery path, which is still an explicit follow-up decision.
- The remaining webpack issues are low-severity build-time findings in a transitive visualization dependency tree.

## Lockfile State

Current repo state includes:

- Root lockfile: `/Users/djwayne/buildos-platform/pnpm-lock.yaml`
- Nested lockfile: `/Users/djwayne/buildos-platform/apps/web/pnpm-lock.yaml`
- Nested lockfile: `/Users/djwayne/buildos-platform/apps/worker/pnpm-lock.yaml`

Observed drift:

- Root lock resolves newer package versions than the nested app lockfiles.
- Vercel root config installs from the workspace root with `pnpm install --frozen-lockfile`, so the root lockfile is the effective deploy artifact.
- The nested lockfiles are now misleading for audits and local reasoning.

Decision status:

- Do not delete nested lockfiles until the team explicitly agrees on the policy.
- Treat the root lockfile as the authoritative deployment lockfile for this remediation pass.

## Package Hygiene

Adapter verification:

- `/Users/djwayne/buildos-platform/apps/web/svelte.config.js` uses `@sveltejs/adapter-vercel`.
- `@sveltejs/adapter-auto` was declared but not used.

Removed as stale or redundant:

- `apps/web/package.json`
    - `@sveltejs/adapter-auto`
    - `@codemirror/theme-one-dark`
    - `codemirror`
    - `@tiptap/extension-placeholder`
    - direct `@supabase/ssr` declaration
- `package.json`
    - `baseline-browser-mapping`

Rationale:

- The adapter package was stale.
- The CodeMirror umbrella package and unused theme package were not imported anywhere.
- The TipTap placeholder extension was declared but not configured anywhere.
- `@supabase/ssr` is already provided by the workspace package `@buildos/supabase-client`, so the app-level direct declaration was redundant.
- `baseline-browser-mapping` had no code, config, or script usage in the repo.

Checked but intentionally kept:

- `swagger-ui-dist`
    - Used by dynamic imports in `/Users/djwayne/buildos-platform/apps/web/src/lib/components/docs/SwaggerUI.svelte`
- `tailwindcss`, `postcss`, `autoprefixer`
    - Used by config convention in `tailwind.config.js` and `postcss.config.js`
- `prettier-plugin-svelte`
    - Needed by Prettier plugin resolution, even though it is not imported in source
- `@types/*`, `typescript`, `@vitest/ui`, `@vitest/coverage-v8`
    - These are ambient-type or tooling packages and should not be judged by source imports alone

## Supabase Privileged Client Audit

Counts captured during this pass:

- `createAdminSupabaseClient(...)` in `apps/web/src`: 78 call sites
- `createServiceClient(...)` in runtime code: 19 call sites

### Safe / Expected Categories

- Verified webhooks:
    - Stripe webhook
    - Twilio status webhook
    - Calendar webhook handlers
- Cron and internal jobs:
    - billing/dunning/trial reminder cron routes
    - Railway worker notification/brief/SMS processors
- Admin-only pages and admin-only APIs:
    - migration dashboard and retargeting endpoints
- Queue-backed long-running jobs with explicit ownership checks:
    - homework runs
    - tree-agent runs

### Needs Follow-Up

- Public endpoints using admin bypass:
    - `/Users/djwayne/buildos-platform/apps/web/src/routes/api/public/projects/+server.ts`
    - `/Users/djwayne/buildos-platform/apps/web/src/routes/api/public/projects/[id]/graph/+server.ts`
- User-triggered auth flows with admin fallback:
    - `/Users/djwayne/buildos-platform/apps/web/src/routes/api/auth/login/+server.ts`
    - `/Users/djwayne/buildos-platform/apps/web/src/routes/api/auth/register/+server.ts`
- Asset and OCR routes using admin storage/database access after user input:
    - `/Users/djwayne/buildos-platform/apps/web/src/routes/api/onto/assets/+server.ts`
    - `/Users/djwayne/buildos-platform/apps/web/src/routes/api/onto/assets/[id]/+server.ts`
    - `/Users/djwayne/buildos-platform/apps/web/src/routes/api/onto/assets/[id]/render/+server.ts`
    - `/Users/djwayne/buildos-platform/apps/web/src/routes/api/onto/assets/[id]/complete/+server.ts`
- Agent/tooling server services with embedded admin clients:
    - `/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat/tools/core/executors/base-executor.ts`
    - `/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat/tools/core/tool-executor-refactored.ts`
    - `/Users/djwayne/buildos-platform/apps/web/src/lib/server/voice-note-transcription.service.ts`
    - `/Users/djwayne/buildos-platform/apps/web/src/lib/server/project-icon-generation.service.ts`

### Rotation-Relevant Risk

If `PRIVATE_SUPABASE_SERVICE_KEY` leaks:

- RLS is bypassed everywhere this client is used.
- All user rows, project data, chat/session data, storage objects, notification preferences, and linked OAuth material become reachable.
- Public-route mistakes become whole-database mistakes.

## Rate Limiting Findings

Current state before remediation:

- The global SvelteKit rate-limit hook is commented out in `/Users/djwayne/buildos-platform/apps/web/src/hooks.server.ts`.
- Active limits only exist on a few expensive routes.
- Current active limiter is process-local memory and uses blunt request counts.
- That design is not safe for global enforcement and is too coarse for agentic workloads.

Redesign goals:

- No blanket global hard cap for normal app traffic.
- Limit only expensive routes.
- Separate concurrency control from rolling-budget control.
- Use per-user budgets instead of shared global caps.
- Keep defaults generous enough for normal BuildOS usage.
- Leave room for a future distributed backend without changing route call sites.

Planned implementation in this pass:

- Add a shared expensive-operation limiter for AI-heavy routes.
- Enforce per-user concurrency limits.
- Enforce rolling start-rate and rolling budget limits.
- Record actual usage where the route can observe tokens or payload size.

Implemented:

- Shared limiter added at `/Users/djwayne/buildos-platform/apps/web/src/lib/server/expensive-operation-limiter.ts`
- Policies added for:
    - fast chat stream
    - brain dump parse
    - brain dump stream
    - transcription
- Route integrations added in:
    - `/Users/djwayne/buildos-platform/apps/web/src/routes/api/agent/v2/stream/+server.ts`
    - `/Users/djwayne/buildos-platform/apps/web/src/routes/api/braindumps/generate/+server.ts`
    - `/Users/djwayne/buildos-platform/apps/web/src/routes/api/braindumps/stream/+server.ts`
    - `/Users/djwayne/buildos-platform/apps/web/src/routes/api/transcribe/+server.ts`

Behavioral changes:

- No global hard limiter was enabled.
- Expensive routes now enforce per-user concurrency separately from rolling budgets.
- Fast chat budgets record actual token usage after a stream completes.
- Brain dump and transcription routes use route-specific estimated cost models instead of a flat request counter.

## Gmail SMTP

Current status:

- Gmail app-password delivery is still active in web and worker code paths.
- This remains operationally weaker than scoped API-based delivery with vendor-side auditing and key isolation.

Decision status:

- Do not replace in this pass without explicit product direction.
- Keep this as an open security/operations follow-up.

## Work Log

Completed:

- Mapped runtime external dependencies and trust boundaries.
- Ran a live production dependency audit.
- Counted and classified privileged Supabase client usage.
- Confirmed lockfile drift between root and nested app lockfiles.
- Confirmed the current rate limiter is too blunt for safe global rollout.

In progress:

- Service-role review follow-up on the highest-risk public and user-triggered admin call paths.

Pending:

- Tighten a few high-risk service-role call paths or record specific follow-up items.

Verification:

- `pnpm audit --prod --json` rerun after dependency remediation
- `vitest` targeted test passed:
    - `/Users/djwayne/buildos-platform/apps/web/src/lib/server/expensive-operation-limiter.test.ts`
- Filtered TypeScript check for changed files passed
- Full `pnpm check` / `pnpm exec tsc --noEmit` still reports many pre-existing repo errors unrelated to this pass
