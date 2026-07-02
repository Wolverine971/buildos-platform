<!-- docs/architecture/POSTHOG_ANALYTICS_INTEGRATION.md -->

# PostHog Analytics Integration

Engineering reference for the PostHog product-analytics layer shipped 2026-07-01. For the strategy, funnel definitions, and Half B (MCP read-loop) plan, see the runbook: [`docs/marketing/growth/posthog-analytics-workflow.md`](../marketing/growth/posthog-analytics-workflow.md).

## Design principles

- **Safe no-op without config.** Every wrapper checks `PUBLIC_POSTHOG_KEY` and silently does nothing when unset. Capture failures are logged, never thrown — analytics must not break product flows.
- **Small, trusted taxonomy.** Eight funnel events, `snake_case`, past-tense. Resist adding more until these are trusted (runbook rule A3).
- **One fire-point per event.** Each event fires at a single canonical location — prefer shared choke-points (e.g. `instantiateProject`) over per-caller instrumentation.
- **Dev is muted by default.** Client capture only runs in production builds unless `PUBLIC_POSTHOG_CAPTURE_DEV=true`. Server/worker capture is env-key gated (local `.env` has the key, so worker-local runs do capture — unset the key locally if that's noise).

## The four wrappers

| Runtime                         | File                                                 | Sending strategy                                                                                            |
| ------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Web client (browser)            | `apps/web/src/lib/services/posthog.ts`               | `posthog-js`, autocapture + SPA pageviews (`defaults: '2025-05-24'`), `person_profiles: 'identified_only'`  |
| Web server (Vercel serverless)  | `apps/web/src/lib/server/posthog.ts`                 | `posthog-node` `captureImmediate` — awaited so events send before the function freezes (~50-150ms per call) |
| Worker (Railway, long-running)  | `apps/worker/src/lib/posthog.ts`                     | `posthog-node` batched (`flushAt: 5`, 5s interval); flushed on SIGTERM/SIGINT in `apps/worker/src/index.ts` |
| Shared op layer (both runtimes) | `packages/shared-agent-ops/src/analytics/posthog.ts` | `captureImmediate`, reads `process.env` directly (same pattern as the calendar port)                        |

Identify/reset lifecycle lives in `apps/web/src/routes/+layout.svelte`: `identifyUser()` fires once per user id (an `$effect` on `data.user`), `resetPostHogUser()` fires in `handleAuthSignedOut` so the next login isn't merged into the previous identity.

## Event taxonomy → fire points

| Event                  | Fires at                                                                                                                                                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `signup`               | `apps/web/src/routes/api/auth/register/+server.ts` (email) and `apps/web/src/lib/utils/google-oauth.ts` `isRegistration && isNewUser` block (Google OAuth)                                          |
| `onboarding_started`   | `apps/web/src/routes/onboarding/+page.svelte` — fresh starts only (session-restore and OAuth-redirect resumes don't re-fire)                                                                        |
| `onboarding_completed` | `apps/web/src/routes/api/onboarding/+server.ts` — both `complete_v3` and legacy `complete` actions                                                                                                  |
| `brain_dump_created`   | `apps/web/src/routes/api/onto/braindumps/+server.ts` POST (the only `onto_braindumps` insert)                                                                                                       |
| `project_created`      | `packages/shared-agent-ops/src/ontology/instantiation.service.ts` `instantiateProject()` — the single choke-point for API, agentic chat, braindump extraction, and calendar-analysis creation paths |
| `brief_generated`      | `apps/worker/src/workers/brief/briefWorker.ts` after the job completes                                                                                                                              |
| `brief_viewed`         | `apps/web/src/routes/briefs/+page.svelte` on mount when a brief renders                                                                                                                             |
| `task_completed`       | `apps/web/src/routes/api/onto/tasks/[id]/+server.ts` on the not-done → done transition only. (Agent-driven task completion via shared ops is NOT yet instrumented.)                                 |

## Runtime health logs

The wrappers emit a structured `[posthog-health]` log for the eight funnel events
only. Server/shared captures log `status: "captured"` after `captureImmediate`;
worker captures log `status: "queued"` after enqueueing into the PostHog batch;
missing config logs `status: "skipped"` with `reason: "missing_key"`. Web server
and worker capture failures are also persisted to `error_logs` with
`operation_type = 'posthog_capture'` and `metadata.analyticsEvent = <event>`.
Use [`docs/marketing/growth/posthog-analytics-health-log-2026-07-02.md`](../marketing/growth/posthog-analytics-health-log-2026-07-02.md)
for the July 2026 dashboard verification pass.

## First-touch UTM attribution

1. `initPostHog()` (root layout) stashes `utm_source/medium/campaign` + external `document.referrer` + landing page in `localStorage` (`buildos_first_touch`) on first landing; never overwritten. Runs even when capture is disabled.
2. `identifyUser()` attaches it as `$set_once` person properties.
3. The register form sends it in the request body; the register endpoint sanitizes it, derives `signup_source` (utm*source → referrer host → `direct`), fires `signup` with `$set_once`, and persists to `users.signup_source` / `utm*\*`/`referrer`.
4. Columns come from migration `supabase/migrations/20260701010000_users_signup_attribution.sql`. Until it's applied + `pnpm gen:types` is run, the DB update fails quietly (caught + logged) and the register endpoint carries an `as any` cast that should then be removed.
5. **OAuth signups get PostHog person props only** — attribution can't ride the OAuth redirect, so their `users` columns stay null.

## Adding a new event

1. Justify it against the runbook's "small, correct funnel" rule first.
2. Pick the wrapper for the runtime the action completes in (table above) and call it at the single canonical fire-point: `captureEvent` (client), `captureServerEvent` (web API), `captureWorkerEvent` (worker), `captureProductEvent` (shared-agent-ops).
3. `snake_case`, past-tense, `distinctId` = BuildOS user id. Keep properties to ids/counts/enums — no content payloads.
4. Add the event to the taxonomy table here and in the runbook.

## Environment

```bash
PUBLIC_POSTHOG_KEY=phc_...                 # Project API key (public write-only)
PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
PUBLIC_POSTHOG_CAPTURE_DEV=false           # web client only; true => capture from local dev
```

Set in Vercel (web) and Railway (worker) — see [`docs/operations/environment/DEPLOYMENT_ENV_CHECKLIST.md`](../operations/environment/DEPLOYMENT_ENV_CHECKLIST.md).
