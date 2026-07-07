<!-- docs/marketing/growth/posthog-analytics-workflow.md -->

# PostHog Analytics Workflow — BuildOS Runbook

> Living runbook. Created 2026-06-26. The Tier-0 foundation for the [Customer Journey audit](../strategy/customer-journey-touchpoints-audit-2026-06-26.md): instrument BuildOS, then pipe the data back into Claude Code so every later tier becomes "ship change → watch the funnel move."

---

## Why this exists

The journey audit found the **meta-gap**: there is no product-analytics layer and no acquisition attribution, so _every_ stage rating is inferred, not measured. You can't tell which awareness touchpoint drives signups, or whether an onboarding fix actually closed the 72–95% activation leak.

A PostHog workflow has **two halves**. Most people only build the first.

- **Half A — Get data IN:** instrument BuildOS so it sends events to PostHog.
- **Half B — Get insight OUT:** wire PostHog back into Claude Code (MCP) + a recurring digest, so you can _ping it and get updates_ instead of staring at dashboards.

---

## Status log

- **2026-07-01 — Half A code shipped & deploying.** All 8 funnel events + UTM first-touch instrumented (see checklist below); key live-verified with a test event. DJ deploying to prod today. **Follow-up scheduled: week of 2026-07-08 → 2026-07-15 — re-check this exact runbook:** are events flowing in prod (signup, brain_dump_created, project_created, brief_generated)? Did the migration get applied + `gen:types` run? Are Vercel/Railway env vars set? Then: build the 4 insights and start Half B (MCP).
- **2026-07-02 — Dashboard created.** DJ reports PostHog env vars, the attribution migration, and generated types are likely complete; not re-confirmed in this thread. Added a dated verification log: [`posthog-analytics-health-log-2026-07-02.md`](./posthog-analytics-health-log-2026-07-02.md). Capture wrappers now emit searchable `[posthog-health]` runtime logs for the eight funnel events, and web/worker capture failures persist to `error_logs` with `operation_type = 'posthog_capture'`. Created the PostHog dashboard **BuildOS Activation** with the four initial insights. One-time check-back scheduled for **2026-07-09** to review one week of data quality.

## Current state (2026-06-26 audit)

What's actually wired today (verified in-repo):

- ✅ **Vercel Analytics** — `@vercel/analytics`, init in `apps/web/src/routes/+layout.ts`. Pageviews + web-vitals only.
- ✅ **Vercel Speed Insights** — `@vercel/speed-insights`, init in `apps/web/src/routes/+layout.svelte`. Core Web Vitals only.
- ✅ **Custom visitor tracking** — `apps/web/src/lib/services/visitor.service.ts` → `/api/visitors` → Supabase `visitors` table. Daily visit count, not external.
- ⚠️ **`activityLogger.ts`** — `apps/web/src/lib/utils/activityLogger.ts` enumerates the right events (`brain_dump_*`, `project_created`, `brief_generated`, `task_completed`) but they are **defined and almost never fired**. This is our event map, already written.
- ❌ **PostHog** — NOT installed. No package, no env vars, no `capture()`. (Whatever was "set up" before is not in this repo.)
- ❌ **UTM / signup-source capture** — none. `users` has no `utm_source` / `signup_source` columns; register endpoint captures only email/password/name.

**Takeaway:** PostHog is greenfield here. Nothing to migrate or untangle — just build it right once.

---

## Step 0 — Resolve the account (do this first)

You weren't sure if an account exists. Resolve before writing any code:

1. Check [app.posthog.com](https://app.posthog.com) / [eu.posthog.com](https://eu.posthog.com) — log in with the Google account you'd have used. Look for a "BuildOS" project.
2. Search your password manager / Vercel env vars for `POSTHOG`.
3. **If found:** note the **Project API key** (`phc_...`) and the **host** (US `https://us.i.posthog.com` or EU `https://eu.i.posthog.com`). Region matters — it's fixed per project.
4. **If not found:** create a new project (free tier is generous: ~1M events/mo). Pick US region unless you have an EU-data reason.

Output of Step 0: a `PUBLIC_POSTHOG_KEY` and `PUBLIC_POSTHOG_HOST`. Everything else is blocked on this.

---

## Half A — Get data IN (instrument BuildOS)

### A1. Dependencies + env

- `posthog-js` in `apps/web` (client-side capture, autocapture, session replay optional).
- `posthog-node` in `apps/worker` (server-side events — `brief_generated` happens in the background worker, never in a browser).
- Add to `.env.example` and Vercel:
    ```
    PUBLIC_POSTHOG_KEY=phc_xxx
    PUBLIC_POSTHOG_HOST=https://us.i.posthog.com
    ```
    (`PUBLIC_` prefix = client-accessible, per BuildOS env conventions.)

### A2. Init + identify (web)

- Init in `apps/web/src/routes/+layout.svelte` (client only, guarded by `browser && !dev` like Speed Insights already is). **Not** in `+layout.ts` — `identify()` needs the browser.
- On login / session present: `posthog.identify(userId, { plan, trial_status, signup_source })`.
- On logout: `posthog.reset()` (so the next user isn't merged into the previous identity).
- Guard everything behind the env var so local dev without a key is a no-op.

### A3. The event taxonomy (the core decision)

Track the **activation + retention funnel** and nothing else at first. Names mirror `activityLogger.ts` so the internal audit log and PostHog stay aligned. Keep names `snake_case`, past-tense where it's an action.

| Event                  | Stage it measures           | Client/Server   | Where to fire                                      |
| ---------------------- | --------------------------- | --------------- | -------------------------------------------------- |
| `signup`               | Acquisition (top of funnel) | server          | `apps/web/src/routes/api/auth/register/+server.ts` |
| `onboarding_started`   | Onboarding                  | client          | `apps/web/src/routes/onboarding/+page.svelte`      |
| `onboarding_completed` | Onboarding (the leak)       | client/server   | onboarding completion                              |
| `brain_dump_created`   | first input of value        | server          | braindump processing service                       |
| `project_created`      | **AHA — messy→structured**  | server          | ontology create op                                 |
| `brief_generated`      | retention loop output       | server (worker) | `apps/worker/src/scheduler.ts` / brief worker      |
| `brief_viewed`         | retention loop engagement   | client          | brief view route                                   |
| `task_completed`       | real ongoing usage          | server          | task update endpoint                               |

Rule: **resist adding more events until these are firing and trusted.** A small, correct funnel beats 50 noisy events.

### A4. UTM / acquisition attribution (fixes the meta-gap)

1. On first landing (`+layout.svelte` or a hook), read `utm_source/medium/campaign` + `document.referrer` → stash in `localStorage` (first-touch; don't overwrite).
2. Attach to `posthog.identify()` as person properties.
3. Pass to the register endpoint so it's durable in the DB.
4. **Migration:** add `signup_source`, `utm_source`, `utm_medium`, `utm_campaign`, `referrer` columns to `users` (Supabase migration in `supabase/migrations/`, then `pnpm gen:types`).

Now "which awareness touchpoint drives signups" is answerable — in both PostHog _and_ SQL.

### A5. Build 4 insights/dashboards in PostHog itself

Verified event map (as instrumented, 2026-07-01):

| Event                  | Source                 | Call site                                                                                                                                      |
| ---------------------- | ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `signup`               | server                 | `register/+server.ts:311`, `google-oauth.ts:542` (props: `signup_method`, `email_domain`, `signup_source`, `landing_page`; UTM as `$set_once`) |
| `onboarding_started`   | client                 | `onboarding/+page.svelte:113`                                                                                                                  |
| `onboarding_completed` | server                 | `api/onboarding/+server.ts:107`                                                                                                                |
| `brain_dump_created`   | server                 | `api/onto/braindumps/+server.ts:78`                                                                                                            |
| `project_created`      | shared (single funnel) | `instantiation.service.ts:968`                                                                                                                 |
| `brief_generated`      | worker                 | `briefWorker.ts:205`                                                                                                                           |
| `brief_viewed`         | client                 | `briefs/+page.svelte:361`                                                                                                                      |
| `task_completed`       | server                 | `api/onto/tasks/[id]/+server.ts:653`                                                                                                           |

Build these in PostHog → Product analytics → New insight, then pin all four to a dashboard named **"BuildOS Activation."** These become the things Claude Code reads in Half B.

1. **Activation funnel** (the 72–95% leak, made visible) — Insight type **Funnel**; steps in order `signup → onboarding_completed → brain_dump_created → project_created`; conversion window **7 days**; last 30 days.
2. **Weekly active users** — Insight type **Trends**; events `brain_dump_created` + `task_completed` + `brief_viewed`; measure **Unique users**; **Weekly** interval; last 90 days. Prefer a PostHog action/group for "any core activity" so one active user doing multiple core events is counted once.
3. **Retention after aha** — Insight type **Retention**; cohortize on **First time** `project_created`; returning event `task_completed` (or any event); **Weekly** period.
4. **Signups by source** — Insight type **Trends**; event `signup`; **Total count**; **Break down by** event property `signup_source` (or person property `utm_source`); **Weekly**; last 90 days.

Dashboard build/verification sheet: [`posthog-analytics-health-log-2026-07-02.md`](./posthog-analytics-health-log-2026-07-02.md).

---

## Half B — Get insight OUT (the workflow you actually want)

### B1. PostHog MCP → Claude Code

PostHog ships an **official, free, hosted MCP server**, plus a **Claude Code plugin** with slash commands (`/posthog:insights`, `/posthog:errors`, `/posthog:flags`, `/posthog:experiments`). Once connected:

- Claude Code can query your live PostHog directly — run HogQL, pull the activation funnel, check error spikes — inside any session.
- You stop dashboard-staring. You ask "how's activation this week?" and the answer comes from the API.

Setup: install the PostHog plugin / wizard, then `/mcp` in Claude Code and log in via the browser (auto-routes to your US/EU region). Docs: [posthog.com/docs/model-context-protocol/claude-code](https://posthog.com/docs/model-context-protocol/claude-code).

### B2. The recurring growth pulse

On top of the MCP, pick one cadence mechanism:

- **`/posthog` skill** (manual) — you run it; it pulls the 4 key numbers via MCP and writes a dated digest to `docs/marketing/growth/`.
- **Scheduled cloud agent** (`/schedule`, hands-off) — runs weekly, drops the digest automatically, flags any funnel step that moved >X%.

Either way the digest ties numbers back to the [journey audit](../strategy/customer-journey-touchpoints-audit-2026-06-26.md) tiers: "activation up 6pts after Tier-2 starter-dump shipped," etc.

The full loop: **BuildOS → PostHog → Claude Code (MCP) → weekly written diagnosis.**

---

## How this powers the rest of the roadmap

Tier 0 is the instrument. Every tier after becomes measurable:

| Tier  | Action                                             | The PostHog metric that proves it worked                         |
| ----- | -------------------------------------------------- | ---------------------------------------------------------------- |
| **0** | This runbook (instrument + read-loop)              | n/a — this is the measuring stick                                |
| **1** | In-app help widget; testimonial→carousel           | feedback-submit rate; testimonial-sourced signups (`utm_source`) |
| **2** | Templated starter brain-dump; intent→guide routing | **activation funnel** `signup → project_created` lifts           |
| **3** | In-app changelog; weekly proof asset               | returning-user rate; signups by `utm_source=youtube/social`      |
| **4** | Pricing tiers / paid ads (not yet)                 | trial→paid conversion; CAC by source                             |

---

## Checklist

**Step 0**

- [x] Confirm or create PostHog project; capture `PUBLIC_POSTHOG_KEY` + `PUBLIC_POSTHOG_HOST` _(2026-07-01: US region, key in local `.env`s; test event verified via capture API)_

**Half A — data in** _(code shipped 2026-07-01)_

- [x] Add `posthog-js` (web) + `posthog-node` (web server + worker + shared-agent-ops); env vars in `.env.example`s
- [x] Init + `identify`/`reset` in `+layout.svelte` (browser-guarded; dev capture opt-in via `PUBLIC_POSTHOG_CAPTURE_DEV`)
- [x] Fire the 8 funnel events (table A3) — `signup` covers email + Google OAuth; `project_created` fires in shared `instantiateProject` so every creation path (API/chat/braindump/calendar) is covered
- [x] UTM first-touch capture (localStorage, `$set_once`) → identify + register endpoint
- [x] Runtime health trail for the eight funnel events: `[posthog-health]`; failures persist to `error_logs.operation_type = 'posthog_capture'` for web/worker
- [ ] **Apply** migration `20260701010000_users_signup_attribution.sql`; then `pnpm gen:types` _(DJ reports likely complete 2026-07-02; not re-confirmed here)_
- [ ] Add `PUBLIC_POSTHOG_KEY` + `PUBLIC_POSTHOG_HOST` to **Vercel** (web) and **Railway** (worker) env _(DJ reports likely complete 2026-07-02; not re-confirmed here)_
- [x] Build the 4 insights/dashboards in PostHog _(2026-07-02: dashboard id `1788754`)_

**Half B — insight out**

- [ ] Install PostHog Claude Code plugin / MCP; `/mcp` login
- [ ] Verify Claude Code can query the activation funnel
- [ ] Stand up the growth-pulse digest (skill or scheduled agent)

---

## Sources

- **Engineering reference:** [`docs/architecture/POSTHOG_ANALYTICS_INTEGRATION.md`](../../architecture/POSTHOG_ANALYTICS_INTEGRATION.md) — wrapper files, exact fire-points, how to add an event
- [PostHog MCP for Claude Code](https://posthog.com/docs/model-context-protocol/claude-code)
- [PostHog Svelte library docs](https://posthog.com/docs/libraries/svelte)
- [PostHog SvelteKit analytics tutorial](https://posthog.com/tutorials/svelte-analytics)
- [Official PostHog MCP server (GitHub)](https://github.com/PostHog/mcp)
