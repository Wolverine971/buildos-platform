<!-- docs/product/activation-as-strategy-assessment-2026-07-07.md -->

# Activation As The Strategy — Assessment

Date: 2026-07-07 (assessment), verified against codebase 2026-07-10
Status: Product-strategy assessment and decision handoff
Source tasker: `tasker/22-activation-as-strategy-assessment.md`
Companion docs: `docs/product/thinking-loop-capture-structure-surface-decide-update-2026-07-07.md`, `docs/product/thinking-loop-plan-of-attack-2026-07-07.md`

> **Note on dating.** The tasker was written 2026-07-07; this assessment was completed 2026-07-10 and reflects three things the tasker predates: `/today` (the re-envisioned dashboard) shipped 2026-07-10 (`4395206f`); a PostHog customer-journey effort shipped ~8 funnel events + UTM capture (~2026-07-01); onboarding P0 copy fixes shipped ~2026-06-26. The filename keeps the tasker's date for traceability.

---

## Executive Finding

**BuildOS is building _adjacent to_ activation, not _at_ it.**

The thesis in the tasker is correct: activation is the strategy, and until users reach the remembered-project moment, model choice, agent architecture, and category design do not matter yet. The problem is that the single highest-leverage activation fix has now been specified three separate times — the onboarding first-brain-dump rebuild spec (2026-04-08), the onboarding audit P1 "transformation reveal" (2026-06-26), and the thinking-loop plan-of-attack Phase 1 (2026-07-07) — and **it is still not built.** Meanwhile the team shipped instrumentation, a rebuilt welcome sequence, and `/today` (the re-envisioned dashboard). Those are real and good. But none of them is the forcing function.

Concretely, three things are true right now in the code:

1. **Onboarding does not force the activation moment.** The project-capture step (`ProjectsCaptureStep.svelte`) is still the tutorial-style component the April audit flagged. It opens a chat modal in a separate overlay; the "Continue" / "Skip for now" button always advances with zero projects; and the server (`complete_v3` in `api/onboarding/+server.ts`) accepts `projectsCreated: 0` for **every** intent, including non-explore. A user can complete onboarding having created nothing.
2. **The one surface that _is_ the remembered-project moment shipped but is not on the default path.** `/today` — merged agenda + "what changed since you were here" receipts + quick capture — is exactly the returning-user aha. But `/` redirects logged-in users to `/dashboard` (`routes/+page.server.ts:9`) and post-onboarding `ReadyStep` also routes to `/dashboard` (`ReadyStep.svelte:153`). The aha surface is one nav-click off the default; most users won't land on it.
3. **We can see the _top_ of the funnel but not the _return_ — and the headline metric flatters.** The top-of-funnel instrumentation is genuinely good: `signup` (both signup paths), `onboarding_started`, `onboarding_completed` (with a `projects_created` count), `project_created` (a real chokepoint at `packages/shared-agent-ops/.../instantiation.service.ts:1077` that every create path — API, agentic chat, braindump, calendar — funnels through), and `brief_generated` (worker `briefWorker.ts:437`) all fire. What is _not_ instrumented is the **return/loop layer that proves the remembered-project moment**: project reopened, daily-brief-acted-on, second capture, trial-prompt-seen, paid-conversion-started, and every `/today` loop event (telemetry is landing now in a parallel session). And because `onboarding_completed` fires even at `projects_created: 0`, the one funnel number you'd glance at first can look healthy while activation is failing.

The blunt version: **we keep building the parts of the loop that are fun to build (agent capability, receipts, a beautiful Today view) and keep not building the boring forcing function (make the first dump unskippable, show the transformation, gate zero-project completion, land people on the remembered-project surface, and measure the _return_).** That is the difference between a product that is _about_ activation and a product _built around_ it.

---

## 1. Proposed BuildOS Activation Definition

Do not accept "completed onboarding" as activation. As shown below, `onboarding_completed` fires with `projects_created: 0` and is a known false positive.

### The North-Star activation event: the remembered return

> **A user returns on a later calendar day (24h+ after their first structured project) and, within one session, acts on surfaced project memory — opens a brief/receipt/task and does something with it — without re-creating context.**

This is the only event that proves the category promise ("the project remembers"). It is a two-visit event by construction, because the moat is memory across time, not a single good first session. It maps to the loop's **Surface → Decide** arc landing on a return.

### Precondition event: the first structured win (necessary, not sufficient)

> **A user's first real brain dump becomes a structured project they recognize as theirs, and they open it in the same session.**

Three sub-conditions, all required:

- **Real capture** — a non-trivial dump (a length/substance floor, not one word).
- **Recognizable structure** — a project with at least a title + one task or next-step that the user does not immediately discard.
- **Opened** — they land inside the project, not just see a success toast.

The first structured win is the thing onboarding must _force_. The remembered return is the thing the daily brief and `/today` must _earn_.

### Secondary activation events (leading indicators of the return)

- First structured win occurs **during onboarding** (not days later).
- User **edits or accepts** extracted structure (engagement, not just receipt).
- User **connects an external agent or calendar** (context surface widens).
- User **submits a second capture** ("what changed?") — the loop restarts.
- User **acts on a daily brief within 24h** (brief → project mutation).

### Leading indicators (measurable signals that predict activation)

- Capture length above a floor on the activation path.
- Time from signup → first structured project (target: same session).
- Project reopened within 7 days.
- ≥1 task/next-step present on the first project.
- Any project mutation on a day after the create day.

### False positives (things that look like activation but aren't)

- `onboarding_completed` with `projects_created: 0` — **currently allowed for all intents.**
- A project created but never reopened.
- A daily brief generated but never opened (brief completion ≠ brief usefulness).
- A raw `onto_braindumps` capture parked with no project (this is what `brain_dump_created` measures today).
- `last_visit` bumped by a 2-second glance.

### Minimum viable activation by wedge

The onboarding intents are pain-based (`organize`, `plan`, `unstuck`, `explore`) — note none of them is the creator wedge (authors/YouTubers) the brand guide leads with. Minimum viable activation differs by intent:

| Intent / wedge                                                    | Minimum viable activation                                                                                                                                                                         |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unstuck` / overwhelm                                             | Messy dump → a recognizable split into projects → "here's what matters today." Relief is the win.                                                                                                 |
| `organize`                                                        | Existing work → structured project with tasks the user recognizes.                                                                                                                                |
| `plan`                                                            | Vague goal → a phased plan with a concrete first next-move.                                                                                                                                       |
| `explore`                                                         | Lowest bar: one example transformation seen (sample project), so they leave having felt the magic once.                                                                                           |
| **Author / YouTuber (brand wedge, not yet an onboarding intent)** | A book/channel project with linked docs + tasks that _persists and is easy to resume a week later_. This is the remembered-return, and it is the demo the whole marketing strategy is blocked on. |

---

## 2. The Remembered-Project Moment (concrete)

In the user's own words:

> "I came back three days later, opened BuildOS, and it already knew where I left off — what I'd decided, what changed while I was gone, and the one thing to do next. I didn't have to re-explain anything or dig through a chat history."

What the project must remember for that to land: **next move, what changed since last visit, open decisions, and enough of the tasks/docs/context that resuming is faster than starting a fresh chat.** Not all of it perfectly — but the four in bold are the felt-relief minimum.

The smallest demo that proves it: brain-dump a real project on Monday; close the tab; on Thursday open `/today` and see the project's recent changes attributed and grouped, the next move surfaced, and a task ready to act on — captured as a 30-second screen recording. That recording is the single most valuable proof asset BuildOS could produce, and `/today` is now the surface that can produce it. It just isn't on the default path yet.

**The good news the tasker predates:** `/today` already implements the Surface half of this moment — merged agenda, a "what changed since you were here" receipts feed built on `onto_project_logs` (actor-attributed, grouped per project, anchored to last visit), and a selector-free quick-capture composer that closes Capture → Update on one page. The remembered-project moment is no longer vaporware. The gap is now (a) making it the surface users actually land on, and (b) getting users to _have_ a project worth remembering in the first place — which loops straight back to onboarding.

---

## 3. Current Funnel Map

Each stage is scored on the five questions from the tasker: **→A** moves toward activation · **skip?** lets the user skip activation · **meas?** measures activation · **proof?** shows proof of value · **return?** creates a return trigger.

| #   | Stage                               | File(s)                                                                                 | →A                         | skip?                        | meas?                                                                         | proof?                         | return?                             | Verdict                                                                                                                                                                                                                                                                           |
| --- | ----------------------------------- | --------------------------------------------------------------------------------------- | -------------------------- | ---------------------------- | ----------------------------------------------------------------------------- | ------------------------------ | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Landing → signup                    | `routes/+page.svelte`, `api/auth/register`                                              | ~                          | —                            | ✅ `signup` + first-touch UTM                                                 | ✅ hero before/after           | —                                   | Attribution now exists. Fine.                                                                                                                                                                                                                                                     |
| 2   | Register → welcome modal            | `OnboardingModal.svelte`                                                                | ~                          | ✅ dismissable               | —                                                                             | ~                              | —                                   | Skippable; dismiss dumps to generic dashboard.                                                                                                                                                                                                                                    |
| 3   | Onboarding S0 — intent + stakes     | `IntentStakesStep.svelte`                                                               | ✅                         | ❌ required                  | ⚠️ intent only on `onboarding_completed` prop                                 | —                              | —                                   | Good signal collected. No `intent_selected` event.                                                                                                                                                                                                                                |
| 4   | **Onboarding S1 — project capture** | `ProjectsCaptureStep.svelte`                                                            | ⚠️ possible via chat modal | **✅ zero-project Continue** | ~ `project_created` fires if a project is made; no capture-start/submit event | ⚠️ toast only, no reveal       | —                                   | **The activation step, and it does not force activation.** Tutorial-style; opens chat in overlay; advances with 0 projects.                                                                                                                                                       |
| 5   | Onboarding S2 — notifications       | `NotificationsStepV3.svelte`                                                            | ~                          | ✅ skippable                 | —                                                                             | —                              | ✅ opt-in to brief                  | Sets up the return channel. OK.                                                                                                                                                                                                                                                   |
| 6   | Onboarding S3 — Ready               | `ReadyStep.svelte`                                                                      | ~                          | —                            | ✅ `onboarding_completed` (w/ counts)                                         | ⚠️ stat row (can be empty)     | ✅ "connect agents", brief          | Good "connect AI tools" copy. Routes to `/dashboard`, not `/today`.                                                                                                                                                                                                               |
| 7   | **Post-onboarding landing**         | `routes/+page.server.ts` → `/dashboard`                                                 | ❌                         | —                            | —                                                                             | ⚠️ empty-state copy fixed (P0) | —                                   | Lands on `/dashboard` empty state, **not `/today`**. The remembered-project surface is skipped by default.                                                                                                                                                                        |
| 8   | Welcome email sequence              | `welcome-sequence.service.ts`, `cron/welcome-sequence`                                  | ~                          | —                            | ⚠️ email logs, no product join                                                | ~                              | ✅ 5 emails, days 0–9               | Rebuilt since April into a queue-backed enrollment system (was "0 sent"). Enrolled on **both** signup paths; cron runs **hourly**. Strongest actually-working re-entry mechanism. Verify live send rate.                                                                          |
| 9   | Daily brief                         | worker `ontologyBriefGenerator`, `briefWorker`, `DashboardBriefWidget`, `routes/briefs` | ~                          | —                            | ⚠️ `brief_generated`+`brief_viewed` fire; no acted-on                         | ✅ content                     | ⚠️ passive — no "what changed?" CTA | Strong Surface, no Decide/Update. `ENGAGEMENT_BACKOFF` OFF, so briefs go to everyone forever. Brief doesn't restart the loop.                                                                                                                                                     |
| 10  | **`/today` re-entry surface**       | `routes/today/*`, `today-feed.service.ts`, `what-changed.service.ts`                    | ✅✅                       | —                            | ❌ zero telemetry (landing now)                                               | ✅✅ receipts + agenda         | ✅ quick capture                    | **The remembered-project moment — built, but not the default landing.**                                                                                                                                                                                                           |
| 11  | Trial / grace / read-only           | `config/trial.ts`, `consumption-billing.ts`, `cron/trial-reminders`                     | ~                          | —                            | ⚠️ no activation gate on reminders                                            | —                              | ⚠️ trial reminders **in-app only**  | Free tier 5 projects/400 credits. Trial-reminder cron is scheduled (daily 10:00) but the **email step is a `console.log` placeholder** — a lapsed trial user who doesn't reopen the app gets nothing. `canGenerateBriefs: false` in read-only kills the best conversion argument. |
| 12  | Re-entry after inactivity           | `/welcome-back`, re-engagement briefs                                                   | ~                          | —                            | ⚠️ `last_visit` only                                                          | ~                              | ⚠️ re-engagement brief (flag)       | Coarse. No "what changed since you were here" in the email path (it exists only inside `/today`).                                                                                                                                                                                 |

**The two structural leaks the map exposes:**

- **Stage 4 → 7 is the whole ballgame, and both ends are broken.** The activation step doesn't force a project (4), and the surface that would prove memory isn't where users land (7 vs 10). We built the destination (10) and left the road pointing somewhere else (7).
- **Nothing between "brief received" and "acted on" is measured or triggered.** The daily brief is a report, not a re-entry. The loop-doc's Phase 3 (brief restart) is unbuilt.

---

## 4. Activation Blockers (ranked, blunt)

**B1 — Onboarding does not force the first structured win. (CRITICAL, unbuilt 3x)**
`ProjectsCaptureStep.svelte` is still the reused tutorial component; the primary action opens the agent chat modal in a separate overlay rather than an inline composer; the Continue/Skip button always calls `onNext()` regardless of project count; and `complete_v3` validates only `projectsCreated >= 0` (`api/onboarding/+server.ts:65-71`) — zero projects is a valid completion for every intent. The rebuild spec (`ONBOARDING_FIRST_BRAINDUMP_REBUILD_SPEC.md`, Decision 2 + Decision 5), the June audit P1 #4, and plan-of-attack Phase 1 all call for exactly this fix. It remains the single highest-leverage change and it is not done.

**B2 — The remembered-project surface is not the default landing. (CRITICAL, one-line fix)**
`/today` is the aha, but `/` → `/dashboard` and post-onboarding → `/dashboard`. The follow-up is literally flagged in the `/today` feature doc ("Making `/today` the default post-login landing — flip the `/` redirect once it earns it") and tasker 25. Every day this isn't flipped, the best surface BuildOS has ships value to almost no one.

**B3 — The _return_ half of the funnel is invisible, and the headline metric flatters. (HIGH for judgment)**
Top-of-funnel is measurable: `signup`, `onboarding_started`, `onboarding_completed` (with `projects_created`), `project_created` (all create paths funnel through `instantiation.service.ts`), and `brief_generated` all fire. What's missing is the layer that _defines_ activation here — project reopened, daily-brief-acted-on, second capture, trial-prompt-seen, paid-started, and the `/today` loop events (landing now). So we can see people arrive and create, but not whether the project was _remembered and returned to_. And because `onboarding_completed` fires at `projects_created: 0`, the first number you'd check can look healthy while the activation precondition is failing. You can't manage the return you can't see.

**B4 — The transformation "wow" is silent. (HIGH)**
The messy→structured moment — the product's entire pitch — passes with a success toast and no before/after reveal (June audit P1 #4). It is neither shown to the user nor recorded as proof media. The 12 PLACEHOLDER onboarding assets (`onboarding.config.ts:211-240`) are still zero-byte placeholders.

**B5 — The daily brief doesn't restart the loop, and the conversion machinery is half-wired. (HIGH)**
No "what changed?" / quick-update CTA on the brief; no acted-on measurement; and `canGenerateBriefs: false` in `TRIAL_CONFIG.READ_ONLY_FEATURES` silences the brief for read-only users — removing the compounding-context pressure at the moment continuity is the conversion argument. The April audit recommended flipping this; it's still false. Two adjacent gaps compound it: the trial-reminder cron creates **in-app notifications only** — its email step is a `console.log` placeholder, so lapsed trial users who don't reopen get zero conversion pressure — and `ENGAGEMENT_BACKOFF_ENABLED` still defaults **OFF** (`worker/src/scheduler.ts:41`), so briefs fire to everyone forever regardless of engagement, burning compute and email reputation.

**B6 — No sample project / no creator wedge in onboarding. (MEDIUM)**
`explore` users and skippers face a true blank slate (P0 copy softened it but there's no guided path or "see it on an example"). And the marketing wedge (authors/YouTubers) has no onboarding intent, no archetype, and no demo project — so the funnel cannot activate the exact users the distribution strategy is about to send.

---

## 5. Roadmap Alignment Table

Classifying open/in-flight work by its relationship to activation. Be blunt: the goal is to help decide what to pause.

| Work                                                                                                                       | Source                                                               | Classification                                          | Note                                                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Onboarding first-brain-dump rebuild + transformation reveal + gate zero-project completion                                 | rebuild spec; audit P1; plan Phase 1                                 | **Directly activation-critical**                        | The forcing function. Unbuilt. Do this.                                                                                                               |
| `/today` as default post-login + post-onboarding landing                                                                   | today feature doc; tasker 25                                         | **Directly activation-critical**                        | One-line redirect + `ReadyStep` goto. Cheap, huge.                                                                                                    |
| Loop telemetry on `/today` + activation event stream                                                                       | tasker 25 #3; §6 below                                               | **Directly activation-critical**                        | Landing now in a parallel session. Extend to onboarding path.                                                                                         |
| Daily-brief restart action ("what changed?" + acted-on)                                                                    | plan Phase 3                                                         | **Directly activation-critical**                        | Turns the brief from report into return trigger.                                                                                                      |
| Keep briefs alive for read-only/grace + wire trial-reminder email + activation-gate reminders + turn on engagement backoff | April audit; trial config; `cron/trial-reminders`; `scheduler.ts:41` | **Directly activation-critical (retention/conversion)** | Flip `canGenerateBriefs`; replace the trial-reminder `console.log` email placeholder with a real send; flip `ENGAGEMENT_BACKOFF_ENABLED`.             |
| `/today` receipts / What-changed (shipped)                                                                                 | tasker 25 #1–5                                                       | **Supports activation**                                 | Built. It's the Surface half — now needs traffic (B2) and something to remember (B1).                                                                 |
| Welcome sequence (rebuilt, queue-backed)                                                                                   | welcome-sequence service                                             | **Supports activation**                                 | Verify live send rate; wire "what changed" deep-links later.                                                                                          |
| AI Inbox / Project Inbox live-smoke closure                                                                                | tasker 13                                                            | **Supports activation**                                 | Built end-to-end but **never live-smoke-tested; prod migrations unverified**. Verification debt; gates Project Review exposure. Finish, don't expand. |
| Day-30 moat / context-compounding doc                                                                                      | tasker 23                                                            | **Supports activation (later phase)**                   | Research doc, **not started**; shapes the _return_ half. Fine to run in parallel (cheap).                                                             |
| Complete Project Audit build / Project Review production exposure                                                          | tasker 14; project-loops audit                                       | **Distracting until core loop works**                   | Audit core built but **live smoke never run**; Project Reviews OFF in prod, unvalidated. Do not broaden before B1–B3.                                 |
| External-agent write receipts, public-page feedback loop, voice-note conversion                                            | loop plan Phases 5–6                                                 | **Distracting until core loop works**                   | Real value, wrong order.                                                                                                                              |
| Calendar-boomerang improvements                                                                                            | April audit §3                                                       | **Distracting**                                         | 4% suggestion→project. Not the leak.                                                                                                                  |
| New broad agent capabilities / more capture inputs / more dashboard surfaces                                               | ongoing                                                              | **Dangerous — surface area before the core loop works** | Each adds maintenance + decision load without moving activation.                                                                                      |
| Creator-acquisition pilot pushing traffic into the funnel (Writer pilot / tasker 24)                                       | START_HERE; tasker 24                                                | **Dangerous _right now_**                               | Pointing distribution at a funnel that drops non-explore users at 0 projects burns scarce, hard-won creator attention. Sequence it _after_ B1–B4.     |

**One-line read of the table:** the activation-critical column is small, cheap, and mostly unbuilt; the "distracting/dangerous" column is where a lot of recent and planned energy sits.

---

## 6. Instrumentation Gaps

PostHog is wired app-wide (`services/posthog.ts` client, `server/posthog.ts` server), no-ops without a key, consent-gated, with first-touch UTM/referrer capture stored once and attached on identify. That foundation is good. The problem is coverage.

### What actually fires today (verified)

| Event                                                                       | Where                                                         | Notes                                                                                                                                                                          |
| --------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `signup`                                                                    | `api/auth/register`, `google-oauth`                           | + first-touch attribution. Good.                                                                                                                                               |
| `onboarding_started`                                                        | `routes/onboarding/+page.svelte:114`                          | Client, fresh-start only.                                                                                                                                                      |
| `onboarding_completed`                                                      | `api/onboarding/+server.ts:110,160`                           | Carries `intent`, `stakes`, `projects_created`, `tasks_created`, `goals_created`, `time_spent_seconds`. Useful — but fires at 0 projects too.                                  |
| `brain_dump_created`                                                        | `api/onto/braindumps/+server.ts:89`                           | **Raw-capture endpoint only** — parked note, not a project. `content_length`, `source`. Not the activation-path dump.                                                          |
| **`project_created`**                                                       | `packages/shared-agent-ops/.../instantiation.service.ts:1077` | **The aha event.** A real chokepoint — API, agentic chat, braindump, and calendar create paths all funnel through it. `project_id`, `type_key`, `task_count`, `change_source`. |
| `brief_generated`                                                           | worker `briefWorker.ts:437`                                   | Fires after brief job completes. `brief_id`, `brief_date`, `timezone`.                                                                                                         |
| `brief_viewed`                                                              | `routes/briefs/+page.svelte:425`                              | Client.                                                                                                                                                                        |
| `task_completed`                                                            | `api/onto/tasks/[id]/+server.ts:661`                          | Server.                                                                                                                                                                        |
| `project_audit_read` / `project_audit_reviewed` / project-suggestion events | audit + suggestion endpoints                                  | Decision-rail signal exists for audits/suggestions.                                                                                                                            |
| email tracking open/click                                                   | `api/email-tracking/*`                                        | Lifecycle email engagement.                                                                                                                                                    |

_Correction note: an earlier `apps/web/src`-only scan suggested `project_created` and `brief_generated` were declared-but-dead. They are not — both fire, from `packages/shared-agent-ops` and `apps/worker` respectively. The top and middle of the funnel are instrumented; the gap is the **return/loop layer** below._

### Diff vs the tasker's candidate event list

| Candidate event (tasker §5)                                                                   | Status                                                                                                                  |
| --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `onboarding_started`                                                                          | ✅ fires                                                                                                                |
| `intent_selected`                                                                             | ❌ missing (only as a property on `onboarding_completed`)                                                               |
| `first_capture_started`                                                                       | ❌ missing                                                                                                              |
| `first_capture_submitted`                                                                     | ❌ missing (`brain_dump_created` ≠ this; wrong pipeline)                                                                |
| `first_structure_generated`                                                                   | ❌ missing                                                                                                              |
| `first_project_created`                                                                       | ✅ `project_created` fires (all create paths funnel through it) — but not flagged as _first_, and no first-vs-Nth split |
| `first_project_reviewed`                                                                      | ❌ missing                                                                                                              |
| `first_suggestion_accepted`                                                                   | ~ partial (project-suggestion events exist)                                                                             |
| `first_project_reopened`                                                                      | ❌ missing                                                                                                              |
| `daily_brief_received`                                                                        | ~ `brief_generated` fires (worker) — generation, not delivery/open per channel                                          |
| `daily_brief_acted_on`                                                                        | ❌ missing (the retention keystone)                                                                                     |
| `inbox_decision_completed`                                                                    | ~ partial (audit/suggestion events; no unified inbox-decision event)                                                    |
| `project_context_updated`                                                                     | ❌ missing (though `onto_project_logs` has the DB truth)                                                                |
| `trial_conversion_prompt_seen`                                                                | ❌ missing                                                                                                              |
| `paid_conversion_started`                                                                     | ❌ missing                                                                                                              |
| **`/today` loop events** (`loop_capture_submitted`, receipt-viewed, done-toggle, chat-opened) | 🟡 landing now (parallel session) — treat as in-flight, not missing                                                     |

### Cohort properties

Present: `intent`, `stakes`, project/task/goal counts, `time_spent_seconds`, first-touch UTM (`utm_source/medium/campaign`, referrer, landing page). Missing from the tasker's list: capture length _on the activation path_ (only raw-capture has `content_length`), time-to-value, model cost, output quality rating, context depth, activation path.

### Recommendation

Adopt the shared loop-telemetry envelope already specified in the thinking-loop synthesis (`{event, source_type, surface, project_id, loop_stage_before/after, action, actor_kind, latency_ms, receipt_id}`) rather than one-off event names, and — critically — **emit the activation-path events from the onboarding rebuild in the same PR that builds it** (the April audit's "instrument while fixing" rule). Store IDs/counts/stage transitions only; no content. Top/mid funnel is already covered by `project_created` + `brief_generated`; the priority is the **return layer** (project reopened, brief acted-on, second capture, trial-prompt-seen, paid-started) plus a first-vs-Nth flag on `project_created` so the aha moment is separable from routine creation.

---

## 7. Activation Plan (7 / 30 / 90 days)

Realistic for a solo founder. The ordering principle: **instrument, then force, then land, then restart.** Do not push distribution until the funnel activates.

### First: what to STOP until activation is repaired

- Pause the creator-acquisition pilot's _outbound push_ (tasker 24 Writer pilot) — keep research/warmup, hold the traffic. Do not spend scarce creator attention on a funnel that drops non-explore users at 0 projects.
- Freeze Project Review production exposure (tasker 14) and any new agent capability / new capture input / new dashboard surface.
- No new proof-media production until the repaired onboarding + `/today`-as-landing flow is live (so demos aren't instantly stale — same rule the April audit set).

### 7 days — measure the truth and land two cheap wins

1. **Flip `/today` to the default landing** (`routes/+page.server.ts` redirect + `ReadyStep` goto). One line each. (B2)
2. **Instrument the return layer** alongside `/today` loop telemetry: `first_project_reopened`, `daily_brief_acted_on`, `second_capture_submitted`, `trial_prompt_seen`, `paid_conversion_started`; add `intent_selected` and a first-vs-Nth flag on the existing `project_created`. (Top/mid funnel already fires — don't rebuild it.) (B3)
3. **Baseline the funnel** with the new events + a one-time SQL snapshot: signup → onboarding_completed → onboarding_completed-with-≥1-project → project reopened within 7d.
4. Land `docs/product/day-30-moat-context-compounding` (tasker 23) so the return-half is specified before Phase 1 builds against it.

**7-day success:** `/today` is the surface returning users land on; the activation funnel is visible in PostHog (not just SQL); the false-positive rate (onboarding_completed at 0 projects) is a known number.

### 30 days — build the forcing function

5. **Rebuild onboarding Step 1** to the spec: inline composer, real brain-dump → project-creation pipeline (not raw capture), a **transformation receipt** ("I found this project, these tasks, this next move"), and **gate non-explore zero-project completion in both UI and `complete_v3`.** (B1, B4)
6. **Add the brief restart action** — "what changed?" quick-update from the brief, tied to the project, producing a receipt; measure acted-on. (B5)
7. **Repair the conversion/retention delivery:** keep briefs alive for read-only/grace users (flip `canGenerateBriefs`), replace the trial-reminder email `console.log` placeholder with a real send + gate reminders on activation state, and turn on `ENGAGEMENT_BACKOFF_ENABLED`. (B5)
8. **Add one sample/example project path** for `explore`/skippers. (B6)

**30-day success:** a new non-explore user cannot finish onboarding without one real structured project; they see the transformation; they land on `/today`; the brief has one direct update path; the whole path emits events.

### 90 days — prove the remembered return and record the proof

9. **Record the remembered-return proof asset** from the repaired flow: real brain dump → close → return to `/today` days later → memory + next move. This unblocks the entire distribution strategy.
10. **Ship the day-30 restart queries** (what changed / what's stale / what's blocking / what agents did / what matters in 20 min) on `/today` + project page.
11. **Then, and only then, re-open the creator pilot** — pointing traffic at a funnel that activates, with a demo that proves the moat.

**90-day success:** measurable remembered-return rate (return + act-on-memory within 7 days); onboarding-with-≥1-project rate materially up from baseline; brief acted-on rate is a tracked number; one real proof recording exists; distribution restarts on solid ground.

---

## 8. Decisions DJ Needs To Make

1. **Is activation the operating center for the next 2–3 weeks — enough to pause the creator-acquisition outbound push (tasker 24) and freeze Project Review / new agent surface?** (The plan above assumes yes. If no, say what wins instead and why.)
2. **Flip `/today` to the default landing now, or gate it behind more polish?** Recommendation: now. It's the remembered-project surface and it's a one-line change; it can only teach you something.
3. **Gate non-explore zero-project onboarding completion (UI + `complete_v3`)?** Recommendation: yes — this is the forcing function. Requires deciding the `explore` escape hatch stays explicit and measurable.
4. **Does the first brain dump create project state directly, or produce a review proposal first?** (Affects the transformation reveal and the "did they accept it" signal. The rebuild spec assumes direct creation via the parse-and-apply pipeline.)
5. **Keep the daily brief alive for read-only/grace users (flip `canGenerateBriefs`)?** Recommendation: yes — it's the strongest conversion argument and currently goes silent exactly when it should sell.
6. **Add a creator (author/YouTuber) intent + a sample project to onboarding, or keep the pain-based intents and treat the wedge as a marketing-layer concern only?** (Today the onboarding intents and the brand wedge don't match; the funnel can't activate the users the strategy targets.)
7. **What is the single activation metric you will commit to watching weekly?** Recommendation: _remembered-return rate_ (share of first-structured-win users who return within 7 days and act on surfaced project memory). Everything above exists to move that one number.

---

## Definition-of-Done Check (against the tasker)

- ✅ Activation defined beyond "onboarding complete" — remembered return (North Star) + first structured win (precondition), with false positives called out.
- ✅ Remembered-project moment described concretely, in user language, with the smallest proving demo.
- ✅ Current product flow assessed against that definition (12-stage funnel map, grounded in file paths).
- ✅ Clear view of whether BuildOS is building toward activation: **adjacent to it, not at it** — instrumentation + `/today` shipped, but the forcing function (onboarding) and the default path to the aha surface are not built.
- ✅ No code changes made. This is assessment-only, per the tasker.

---

## Files Verified For This Assessment

Onboarding & activation path:

- `apps/web/src/routes/onboarding/+page.svelte` (V3, 4 steps; `onboarding_started` capture; project-capture always advances)
- `apps/web/src/lib/components/onboarding-v2/ProjectsCaptureStep.svelte` (tutorial-style; chat-modal overlay; zero-project Continue/Skip)
- `apps/web/src/routes/api/onboarding/+server.ts` (`complete_v3` accepts `projectsCreated: 0` for all intents)
- `apps/web/src/lib/components/onboarding-v3/ReadyStep.svelte` (routes to `/dashboard`)
- `apps/web/src/lib/config/onboarding.config.ts` (V3 intents/prompts; 12 PLACEHOLDER assets)
- `apps/web/src/routes/+page.server.ts` (logged-in `/` → `/dashboard`)

Re-entry & retention:

- `apps/web/docs/features/today-view/TODAY_VIEW_2026-07-09.md`; `apps/web/src/routes/today/*`; `today-feed.service.ts`; `what-changed.service.ts`
- `apps/web/src/lib/components/layout/Navigation.svelte` (`/today` in nav, not default)
- `apps/web/src/lib/config/trial.ts` (`canGenerateBriefs: false`); `apps/web/src/lib/server/consumption-billing.ts` (5 projects / 400 credits)
- `apps/web/src/lib/server/welcome-sequence.service.ts` (queue-backed rebuild)

Instrumentation:

- `apps/web/src/lib/services/posthog.ts` (`FUNNEL_EVENTS`, first-touch UTM); `apps/web/src/lib/server/posthog.ts`
- Event call sites: `api/auth/register` + `utils/google-oauth.ts` (`signup`), `api/onboarding` (`onboarding_completed`), `api/onto/braindumps` (`brain_dump_created`, raw path), `api/onto/tasks/[id]` (`task_completed`), audit/suggestion endpoints
- `packages/shared-agent-ops/src/ontology/instantiation.service.ts:1077` (`project_created` chokepoint); `apps/worker/src/workers/brief/briefWorker.ts:437` (`brief_generated`)
- Crons: `vercel.json` (welcome-sequence hourly, trial-reminders daily 10:00); `welcome-sequence.service.startSequenceForUser` invoked on both signup paths; `apps/worker/src/scheduler.ts:41` (`ENGAGEMENT_BACKOFF_ENABLED` OFF); `api/cron/trial-reminders/+server.ts` (email step is a `console.log` placeholder)
- `apps/web/src/lib/components/dashboard/AnalyticsDashboard.svelte` (empty-state copy fixed — P0)

Strategy & prior audits:

- `docs/marketing/growth/growth-audit-2026-04-09.md`; `docs/marketing/START_HERE.md`; `docs/marketing/brand/brand-guide-1-pager.md`; `docs/marketing/strategy/anti-ai-show-dont-tell-strategy.md`; `docs/marketing/strategy/thinking-environment-creator-strategy.md`
- `apps/web/docs/features/onboarding/ONBOARDING_FIRST_BRAINDUMP_REBUILD_SPEC.md`; `ONBOARDING_FLOW_ANALYSIS.md`; `apps/web/docs/technical/audits/ONBOARDING_AUDIT_2026-06-26.md`
- `docs/product/thinking-loop-*-2026-07-07.md`; `tasker/13,14,21,22,23,25`
