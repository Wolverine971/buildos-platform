<!-- docs/marketing/growth/growth-audit-2026-04-09.md -->

# BuildOS Growth Audit — April 2026

> **Date:** 2026-04-09
> **Data source:** Live Supabase database (94 users), full codebase audit, marketing documentation review
> **Method:** Four parallel growth agents (orchestrator, activation, retention, distribution) audited the full funnel independently

---

## Executive Summary

BuildOS has 94 total users, 1 paying subscriber, and 4 weekly active users. The product works for its builder — it has not been validated for anyone else. The strategy (anti-AI positioning, creator wedge, guerrilla doctrine) is genuinely strong. The execution surface has three broken pipes:

1. **Onboarding activation is collapsing** — 72% never complete onboarding; recent cohort (Jan-Apr 2026): 95% drop
2. **Welcome email sequence is broken** — 0 of 94 users have received a welcome email; 55% email failure rate
3. **Distribution apparatus doesn't exist** — zero video demos, zero real user stories, zero shareable artifacts

**Bottom line:** Fix these three before building anything new, and instrument the fixes so you can tell whether they worked.

---

## Table of Contents

- [The Activation Collapse](#1-the-activation-collapse)
- [Welcome Email Pipeline Broken](#2-welcome-email-pipeline-broken)
- [Calendar Boomerang Loop Dead](#3-calendar-boomerang-loop-dead)
- [Structural Findings](#4-structural-findings)
- [Habit Loop Diagnosis](#5-habit-loop-diagnosis)
- [Daily Brief Retention Analysis](#6-daily-brief-retention-analysis)
- [Lifecycle Messaging Audit](#7-lifecycle-messaging-audit)
- [Trial / Grace / Read-Only Conversion](#8-trial--grace--read-only-conversion)
- [Reactivation Mechanisms](#9-reactivation-mechanisms)
- [Distribution & Creator Strategy](#10-distribution--creator-strategy)
- [Proof-Asset Inventory](#11-proof-asset-inventory)
- [Category Framing Evaluation](#12-category-framing-evaluation)
- [Loop Map](#13-loop-map)
- [Prioritized Recommendations](#14-prioritized-recommendations)
- [Execution Rules](#15-execution-rules)
- [Next 14 Days](#16-next-14-days)
- [Quick Wins](#17-quick-wins-this-week)
- [What Would 10x Look Like](#18-what-would-10x-look-like)

---

## 1. The Activation Collapse

**Priority: CRITICAL — Highest priority leak. Every other loop depends on this.**

### The funnel (database evidence)

| Step                       | Count | % of previous      | Source                          |
| -------------------------- | ----- | ------------------ | ------------------------------- |
| Signed up                  | 94    | —                  | `users`                         |
| Completed onboarding       | 26    | 28%                | `users.onboarding_completed_at` |
| Has at least 1 project     | ~27   | ~100% of onboarded | `onto_projects.created_by`      |
| Received a completed brief | 16    | 62% of onboarded   | `ontology_daily_briefs`         |
| Active in last 30 days     | 9     | 10% of all signups | `users.last_visit`              |
| Active in last 7 days      | 4     | 4% of all signups  | `users.last_visit`              |
| Paying subscriber          | 1     | 1% of all signups  | `users.subscription_status`     |

### Recent cohort is worse

- **Jan-Apr 2026:** 20 signups, 1 completed onboarding (5%), 2 active in last 7 days
- **Oct-Dec 2025:** 16 signups, 2 completed onboarding (13%)
- The onboarding completion rate is **declining**, not improving

### Root cause: Step 2 does not produce activation

The `ProjectsCaptureStep` (carried over from V2 onboarding) is a tutorial screen — it shows screenshots and descriptions of the brain dump feature instead of containing an actual brain dump input. Users leave onboarding having created nothing. The "Continue" button lets them advance with zero projects.

**Key evidence:**

- `ProjectsCaptureStep.svelte` never renders a text area or calls `onProjectsCreated()` with real data
- The `complete_v3` API endpoint accepts `projectsCreated: 0` for all intents
- Median time to complete onboarding: **657 hours (27 days)** — only 9 of 26 completed same-day
- 88 of 94 users have `NULL` for `onboarding_intent` — intent data is not being collected
- 15+ `PLACEHOLDER` screenshot/video paths in the onboarding config — users see broken assets

### The spec exists but is unbuilt

`ONBOARDING_FIRST_BRAINDUMP_REBUILD_SPEC.md` describes the correct fix: inline brain dump in Step 2 with intent-aware prompts and a transformation preview. This is the single highest-leverage change in the product.

**Files:**

- `apps/web/src/lib/components/onboarding-v2/ProjectsCaptureStep.svelte`
- `apps/web/src/lib/config/onboarding.config.ts` (lines 211-245 have PLACEHOLDER assets)
- `apps/web/src/routes/api/onboarding/+server.ts` (line 99-100 accepts 0 projects)
- `apps/web/docs/features/onboarding/ONBOARDING_FIRST_BRAINDUMP_REBUILD_SPEC.md`

---

## 2. Welcome Email Pipeline Broken

**Priority: CRITICAL — The only re-engagement mechanism for the 72% who drop during onboarding, and it reaches nobody.**

### Evidence

- `welcome_email_sequences`: 3 rows total (of 94 users), all status "active", all 5 emails still "pending" — 0 sent, 0 skipped
- `email_logs`: 50 recent logs, all campaign "unknown" — none from the welcome sequence
- `email_tracking_events`: 31 total — 17 failed, 12 sent, 2 opened. **55% email failure rate.**
- `trial_reminders`: **0 reminders ever sent.** The trial reminder cron has never fired or is failing silently.

### Root cause candidates

1. The trigger that calls `WelcomeSequenceService.startSequenceForUser()` is not firing for most signups — only 3 of 94 users have sequence rows
2. The cron that calls `processDueSequences()` may not be scheduled or may be failing
3. The email infrastructure itself has a 55% failure rate

### The welcome sequence design is good

The 5-email behavioral sequence (days 0/1/3/6/9) with intent-aware copy, send-window management, and behavioral branching is well-designed. The problem is purely infrastructure — it's not reaching users.

**Files:**

- `apps/web/src/lib/server/welcome-sequence.service.ts`
- `apps/web/src/lib/server/welcome-sequence.logic.ts`
- `apps/web/src/routes/api/cron/welcome-sequence/+server.ts`
- `apps/web/src/routes/api/cron/trial-reminders/+server.ts`

---

## 3. Calendar Boomerang Loop Dead

### Evidence

- `user_calendar_tokens`: 10 users connected calendar (11% of total)
- `calendar_project_suggestions`: 23 suggestions total — **19 still pending, 4 accepted, 1 with a created project**
- 4% conversion from suggestion to project

The calendar analysis produces output nobody uses. Suggestion → project conversion requires too many decisions at a moment when the user hasn't seen the value of a BuildOS project yet.

**Recommendation:** Auto-create the top calendar suggestion as a project with a single confirm/dismiss UI.

---

## 4. Structural Findings

### 4a. No product analytics instrumentation

No PostHog, Mixpanel, Amplitude, GA4, FullStory, or LogRocket anywhere in the codebase. The `visitors` table tracks daily uniques via localStorage, but there is:

- No UTM capture on signups
- No event stream for in-product actions
- No funnel visualization
- No session replay

Every growth question requires manual SQL against 15+ tables.

### 4b. Brand violations on pricing page

Four anti-AI brand violations in `apps/web/src/routes/pricing/+page.svelte`:

- Line 54: `"AI-Powered Productivity Plans"`
- Line 55: `"unlock unlimited AI-powered organization"`
- Line 62: `"AI-powered project organization platform"` (JSON-LD)
- Line 164: `"AI-powered brain dump parsing"` (feature list)

Additional violations found on:

- Registration page: "AI-powered project collaboration for ADHD minds"
- Beta page title: "Early Access to AI Productivity"

These directly contradict the [Brand Guide](../brand/brand-guide-1-pager.md) and [Anti-AI Strategy](../strategy/anti-ai-show-dont-tell-strategy.md).

### 4c. "Project Remembers" moat is not being measured

No metric tracks context accumulation per project. No threshold for when a project becomes "sticky." No cohort analysis showing whether projects with more context correlate with higher retention.

### 4d. Sean Ellis PMF question has not been asked

0 beta feedback entries. 2 total feedback entries. No "how would you feel if you could no longer use BuildOS?" survey.

### 4e. Engagement backoff is well-built but OFF

`ENGAGEMENT_BACKOFF_ENABLED` defaults to `false`. All users with brief preferences get daily briefs forever, including those who haven't logged in for months. The backoff logic is production-ready and conservative — it should be turned on.

### 4f. Infinite trial

93 of 94 users are in "trialing" status — some for 6+ months. `access_restricted` is `false/null` for all 94 users. The trial never effectively expires.

---

## 5. Habit Loop Diagnosis

### The intended loop

Brain dump -> AI extracts projects/tasks/goals -> Daily brief surfaces what matters -> User returns -> Brain dump again (context compounds)

### Where it breaks

**The second brain dump has no dedicated trigger.** The daily brief tells you what exists but does not prompt you to update it. The brief → brain dump link is passive. There is no "Quick update" CTA in brief emails that opens directly into the brain dump input.

**`last_visit` is the only session signal, and it's coarse.** No session count, no session duration, no "meaningful action" flag. A user who glances at the site for 2 seconds resets their inactivity clock, potentially masking disengagement.

**Recommendation:** Add a "What changed?" CTA to daily brief emails that deep-links to the brain dump input pre-loaded with project context. This closes the loop.

---

## 6. Daily Brief Retention Analysis

### What works

- Timezone-aware scheduling with user-configurable timing
- Ontology-aware generation (goals, tasks, risks, milestones)
- Multi-channel delivery (push, email, SMS, in-app)
- Re-engagement briefs with tone that scales by inactivity duration
- Brief completion rate: 214/217 (99%)

### What doesn't

- **No brief usefulness measurement.** Open/click tracked, but no "brief acted upon" concept. A user who opens the brief and immediately closes it is indistinguishable from one who acts on it.
- **Brief doesn't adapt to usage patterns.** Every user gets the same structure regardless of what they engage with.
- **Engagement backoff is OFF.** Every user gets daily briefs forever, wasting compute and email reputation.
- **Briefs stop for read-only users.** The brief is the strongest conversion argument ("your context is still here"), and it goes silent precisely when users need convincing to pay.

**Files:**

- `apps/worker/src/lib/briefBackoffCalculator.ts`
- `apps/worker/src/workers/brief/briefWorker.ts`
- `apps/worker/src/workers/brief/ontologyPrompts.ts`

---

## 7. Lifecycle Messaging Audit

### Current communications

| Sequence               | Channel                  | Timing                  | Status                                  |
| ---------------------- | ------------------------ | ----------------------- | --------------------------------------- |
| Welcome Emails 1-5     | Email                    | Days 0/1/3/6/9          | **BROKEN** — 0 sent                     |
| Trial Warnings         | In-app only              | Days 7, 3, 1 before end | **In-app only — misses inactive users** |
| Daily Brief            | Email, SMS, Push, In-app | User-configured         | Working for ~16 users                   |
| Re-engagement Brief    | Email, SMS, Push, In-app | Days 4, 10, 31+         | Feature-flagged OFF                     |
| Dunning (payment fail) | Email + In-app           | Days 0-21               | Built but 1 subscriber                  |
| Retargeting Pilot      | Email                    | 3-touch sequence        | Built with holdout groups               |
| SMS Event Reminders    | SMS                      | Before calendar events  | 2 verified phones                       |

### Critical gap: Days 9-14

Welcome sequence ends at day 9. Trial warnings start at day 7. No dedicated "you are activated, here is why paying makes sense" message that references the user's actual usage data.

### Trial reminders should be multi-channel

The trial reminder cron creates in-app notifications only. Users who haven't logged in never see them. Should use `emit_notification_event` RPC for email + in-app delivery.

---

## 8. Trial / Grace / Read-Only Conversion

### The billing funnel

1. **Free Explorer:** 5 projects, 400 AI credits, no time limit
2. **Trial (14 days):** Full access
3. **Grace (7 days):** After trial, still usable
4. **Read-Only:** View/export only, no create/edit/brain-dump
5. **Paid:** Pro (2000 credits) or Power (7500 credits) via Stripe

### Problems

- **No activation gate for conversion measurement.** All trialing users get the same reminders regardless of whether they've created projects or brain dumps.
- **Read-only mode stops brief generation.** This removes the compounding context pressure that should drive conversion. Briefs should continue for read-only users.
- **Trial never expires in practice.** 93 users in "trialing" for months with `access_restricted = false`.

---

## 9. Reactivation Mechanisms

### What exists

- **Engagement backoff briefs** — Days 4, 10, 31+ with scaled tone (feature-flagged OFF)
- **Retargeting pilot** — 3-touch email sequence with holdout groups and attribution tracking
- **Dunning flow** — 6 stages over 21 days for failed payments

### What's missing

- **No reactivation for consumption-gate-frozen users.** When free users hit the 5-project or 400-credit limit, they get a 402 error. No proactive email.
- **No pre-churn intervention for paying dormant users.** No message for paid users inactive 14+ days.
- **The beta list is untouched.** 84 approved beta signups, 0 beta feedback entries, 9 marked as beta users. This is the cheapest qualitative research available.

---

## 10. Distribution & Creator Strategy

### Creator wedge: correct but unproven

The choice of authors + YouTubers is well-reasoned and consistently documented. The landing page is aligned with creator-specific examples (fantasy novel revision, video essay pipeline, podcast systems).

**What's missing:**

- Zero evidence of actual authors or YouTubers using the product
- No creator-specific landing pages (strategy called for `/for/authors`, `/for/youtubers` in Week 3)
- Beta form doesn't segment by creator type
- Onboarding has no "Author" or "YouTuber" archetype — only generic intents
- Instagram engagement targets are all ADHD community accounts, not creator-wedge accounts

### Founder-led growth: strong doctrine, weak execution

The [Guerrilla Content Doctrine](../strategy/buildos-guerrilla-content-doctrine.md) is a legitimate strategic document. But:

- No screenshot bank, demo library, or screen recording bank exists
- The 6-week campaign (started 2026-03-12) has no evidence of published content
- No content publishing or scheduling automation
- DJ is maintaining strategy for 3 platforms, 15+ planned blog posts, and a podcast expansion plan simultaneously

### The apparatus doesn't exist

The doctrine says "if the proof is weak, the message will feel weak." The entire distribution system depends on a demo library and proof bank that haven't been built. Without it, every content week starts from scratch.

**See also:** [Guerrilla Content Doctrine](../strategy/buildos-guerrilla-content-doctrine.md), [Thinking Environment Creator Strategy](../strategy/thinking-environment-creator-strategy.md)

---

## 11. Proof-Asset Inventory

| Asset Type                       | Status            | Notes                                                       |
| -------------------------------- | ----------------- | ----------------------------------------------------------- |
| Video demos / screen recordings  | **None**          | Doctrine calls for 8-12 reusable demos                      |
| Before/after screenshots         | **None**          | Landing page has text examples but no product shots         |
| Real user testimonials           | **None**          | 0 beta feedback entries                                     |
| Real case studies                | **None**          | All case studies in blog are synthetic                      |
| Public project pages             | **2 published**   | `onto_public_pages` — embryonic, not promoted               |
| Post-brain-dump share card       | **Doesn't exist** | Highest-leverage product distribution feature               |
| "BuildOS builds BuildOS" content | **None**          | Doctrine identifies this as "strongest authenticity signal" |
| Published anti-AI blog           | **1**             | `anti-ai-assistant-execution-engine.md` — strong            |
| Comparison posts                 | **3 (outdated)**  | vs Notion, vs ChatGPT, vs Monday — all have TODO notes      |

---

## 12. Category Framing Evaluation

### "Thinking environment" is the right category

- Avoids crowded "AI productivity tool" and "second brain" spaces
- Landing page headline ("Turn messy thinking into structured work") is clean
- Strategic enemies (tool sprawl, stateless chat, blank-page chaos) are concrete

### But it hasn't been said enough in public

- The term exists in strategy docs but not in the wild
- Old framing leaks through: pricing page ("AI-Powered"), beta page ("AI Productivity"), blog metadata ("ADHD productivity tools"), Instagram bio ("ADHD founder building for ADHD brains")
- Category design requires ~50 unique public uses before market association forms
- No comparison pages use the current thinking-environment framing

**Cross-reference:** [Brand Audit Framework](../brand/BUILDOS_BRAND_AUDIT_FRAMEWORK.md) for remediation workflow.

---

## 13. Loop Map

| Loop                                    | Current State                                                                | Verdict             |
| --------------------------------------- | ---------------------------------------------------------------------------- | ------------------- |
| **(a) Content/SEO**                     | Landing page exists. No UTM tracking. ~200 visitors/month. No attribution.   | **Blind**           |
| **(b) Brain-dump -> brief -> habit**    | 6 onto-braindumps, 214 completed briefs, 2 active daily users. Works for DJ. | **Broken at entry** |
| **(c) Calendar boomerang**              | 10 connected, 23 suggestions, 1 project created.                             | **Dead**            |
| **(d) Founder-in-public**               | Strategy and campaign exist. No measurement of follower -> signup.           | **Unmeasured**      |
| **(e) Beta -> testimonial -> carousel** | 84 approved betas, 0 feedback entries.                                       | **Stalled**         |

---

## 14. Prioritized Recommendations

### Priority 1: Rebuild Onboarding Step 2 + Instrument Activation (CRITICAL)

Replace the tutorial screen with an inline brain dump. Add prompt chips. Show the structured output as the aha moment. Enforce `projectsCreated >= 1` server-side. Replace all PLACEHOLDER assets. At the same time, add the minimum event instrumentation needed to measure whether the rebuild works: `onboarding_started`, `brain_dump_submitted`, `first_project_created`, `onboarding_completed`.

**Why first:** 72% drop. 95% of recent cohort. Nothing else matters until this is fixed.

**Exit criteria:** New signups can complete Step 2 with a real brain dump, no broken assets remain in the onboarding path, and the activation funnel can be measured without manual SQL spelunking.

### Priority 2: Fix Welcome Email + Trial Reminder Delivery (CRITICAL)

Debug the trigger that starts sequences. Fix the 55% email failure rate. Verify crons are scheduled. Ensure all new signups get a welcome sequence row. Route trial reminders through the same verified delivery path so inactive users can actually receive them.

**Why second:** The only re-engagement mechanism for Day 0 dropoffs, reaching 0% of users.

**Exit criteria:** 100% of new signups create a welcome sequence row, due messages actually send, and trial reminders are observable in logs.

### Priority 3: Repair Retention/Conversion Integrity (HIGH)

- Set `ENGAGEMENT_BACKOFF_ENABLED=true`
- Change `canGenerateBriefs: false` to `true` in `TRIAL_CONFIG.READ_ONLY_FEATURES`
- Make trial reminders multi-channel via `emit_notification_event`
- Enforce trial/grace/read-only transitions so conversion behavior can be learned from reality rather than from an infinite trial

**Why third:** BuildOS cannot learn retention or monetization while inactive users get spammed forever and nearly everyone remains in a de facto endless trial.

**Exit criteria:** Brief volume matches engagement, read-only users still see value, and expired trials move into the intended states consistently.

### Priority 4: Build the Proof Apparatus From the Fixed Flow (HIGH)

One focused day: record 4-6 screen captures of brain dump -> structured project. This is what makes the content doctrine sustainable.

**Why fourth:** The entire distribution strategy is blocked on this, but the demos should reflect the repaired product, not the broken one.

**Exit criteria:** A reusable demo bank exists for onboarding, daily brief, and "BuildOS builds BuildOS" content.

### Priority 5: Fix Brand Leaks + Add Minimum Attribution (MEDIUM)

Remove "AI-powered" from pricing page (4 instances), beta page, registration page. Add UTM capture on signups and a simple source view so founder-led growth can be tied to actual signups.

**Why fifth:** Messaging cleanup is cheap and necessary, but it should not displace the funnel repairs above. Attribution should be lightweight and support execution, not become a separate analytics project.

**Exit criteria:** No obvious anti-brand copy remains in the main acquisition surfaces, and new signups retain basic source attribution.

### Priority 6: Use Existing Humans for Qualitative Learning (MEDIUM)

Send the Sean Ellis PMF question to top-engagement users (5+ brain dumps, 5+ briefs). Contact the approved beta list with a short personal note asking what they are trying to build and whether they tried the product.

**Why sixth:** This is high-value research, but it will be materially better once the first-run experience and lifecycle emails are no longer obviously broken.

**Exit criteria:** At least 10 qualitative replies land, and they are tagged by audience and activation status.

---

## 15. Execution Rules

- Freeze non-core feature work for 14 days. Do not touch calendar boomerang, public pages, podcast expansion, comparison-post refreshes, or new feature experiments until Priorities 1-3 are shipped.
- Limit work in progress to two tracks at once: activation and lifecycle delivery. The current risk is diffusion, not lack of ideas.
- Instrument while fixing. Do not open a separate analytics project before the core events above exist.
- Record demos only after the repaired onboarding flow is live, so proof assets do not instantly become stale.
- Treat the beta list as a research channel, not as a scale channel, until activation and lifecycle delivery are functioning.

---

## 16. Next 14 Days

### Days 1-2: Establish baseline and reproduce failures

1. Save a baseline snapshot for onboarding completion, welcome-sequence creation, welcome-email send rate, and trial reminder sends.
2. Reproduce the onboarding Step 2 failure locally and confirm exactly where `projectsCreated=0` is allowed through.
3. Trace welcome-sequence creation for a new signup and confirm whether the failure is trigger, cron, provider, or all three.

### Days 3-7: Ship the highest-leverage fixes

1. Rebuild onboarding Step 2 to require a real brain dump and at least one created project.
2. Remove broken onboarding assets and add minimum activation events.
3. Repair welcome-sequence creation and delivery, then verify at least one full test user passes through the sequence and trial reminder path.

### Days 8-14: Make the repaired funnel usable and marketable

1. Turn on engagement backoff, keep briefs alive for read-only users, and enforce trial/grace/read-only transitions.
2. Clean brand violations on acquisition surfaces and preserve source attribution on new signups.
3. Record 4-6 demos from the repaired flow and send the first wave of founder/user outreach to the beta list and engaged users.

### Exit criteria before pushing distribution harder

- Onboarding Step 2 creates a real artifact and cannot complete with zero projects.
- Every new signup gets a welcome-sequence row.
- Email delivery and trial-reminder sends are visible in logs and no longer silently failing.
- The team has a current demo bank built from the fixed product.

---

## 17. Quick Wins (This Week)

- [ ] Reproduce and document the exact onboarding Step 2 failure path
- [ ] Trace why welcome-sequence rows exist for only 3 of 94 users
- [ ] Add minimum activation events alongside the onboarding rebuild
- [ ] Fix "AI-powered" copy on pricing page (4 instances), beta page, registration page
- [ ] Turn on `ENGAGEMENT_BACKOFF_ENABLED` once welcome/trial delivery is verified

---

## 18. What Would 10x Look Like

Going from 4 weekly active users to 40 requires:

1. **Fix activation so 60%+ of signups produce a successful first brain dump on Day 0.** Templated, guided, impossible to fail.
2. **Make the daily brief the thing that brings users back.** SMS delivery (2 verified phones currently). "Quick update" CTA in every brief.
3. **Close the founder-in-public loop.** UTM capture + referrer tracking to know if content strategy is working.
4. **Use the beta list.** 84 approved people. Send each a personal email.

---

## Anti-Pattern Callouts

1. **Blended metrics hide activation failure.** Admin dashboard shows 94 users, 90 projects, 217 briefs. These look functional. 2 users account for the vast majority.
2. **Feature factory risk.** Calendar analysis, agentic chat, voice notes, SMS, public pages, ontology migration — meanwhile the core brain dump -> project flow doesn't activate new users.
3. **Vanity beta numbers.** 84 approved signups, 9 are beta users, 0 feedback entries.
4. **Planning paralysis dressed as strategy.** Strategy docs for 3 platforms, 15+ blog posts, podcast expansion, 11 engagement targets — for one person. The doctrine correctly identifies minimum viable cadence but it isn't being followed.

---

## Key Files Referenced

### Onboarding & Activation

- `apps/web/src/lib/config/onboarding.config.ts` — V2/V3 config with PLACEHOLDER assets
- `apps/web/src/lib/components/onboarding-v2/ProjectsCaptureStep.svelte` — Broken Step 2
- `apps/web/src/routes/onboarding/+page.svelte` — V3 onboarding flow
- `apps/web/src/routes/api/onboarding/+server.ts` — Accepts projectsCreated=0
- `apps/web/docs/features/onboarding/ONBOARDING_FIRST_BRAINDUMP_REBUILD_SPEC.md` — Unbuilt fix spec
- `apps/web/src/lib/components/dashboard/AnalyticsDashboard.svelte` — Dashboard blank state

### Lifecycle & Email

- `apps/web/src/lib/server/welcome-sequence.service.ts` — Welcome sequence orchestration
- `apps/web/src/lib/server/welcome-sequence.logic.ts` — Email content and branching
- `apps/web/src/routes/api/cron/welcome-sequence/+server.ts` — Hourly cron
- `apps/web/src/routes/api/cron/trial-reminders/+server.ts` — Trial reminders (never fired)

### Retention & Briefs

- `apps/worker/src/lib/briefBackoffCalculator.ts` — Engagement backoff (OFF)
- `apps/worker/src/workers/brief/briefWorker.ts` — Brief generation
- `apps/worker/src/workers/brief/ontologyPrompts.ts` — Re-engagement brief prompts

### Billing & Conversion

- `apps/web/src/lib/config/trial.ts` — 14-day trial, 7-day grace, read-only features
- `apps/web/src/lib/server/consumption-billing.ts` — Consumption limits
- `apps/web/src/lib/config/dunning.ts` — Dunning stages
- `apps/web/src/lib/server/retargeting-pilot.logic.ts` — 3-touch reactivation

### Brand & Distribution

- `apps/web/src/routes/pricing/+page.svelte` — Brand violations (lines 54, 55, 62, 164)
- `apps/web/src/routes/+page.svelte` — Landing page (clean)

---

## Related Documents

- [Marketing Strategy 2026](../strategy/buildos-marketing-strategy-2026.md) — Master strategy
- [Growth Next Steps & Implementation Checklist](./growth-next-steps-2026-04-10.md) — Companion execution doc
- [Lead Gen Operating System](./lead-gen-operating-system-2026-04-10.md) — Companion campaign and lead-generation system
- [Anti-AI Show-Don't-Tell Strategy](../strategy/anti-ai-show-dont-tell-strategy.md) — Positioning thesis
- [Thinking Environment Creator Strategy](../strategy/thinking-environment-creator-strategy.md) — Creator wedge strategy
- [Guerrilla Content Doctrine](../strategy/buildos-guerrilla-content-doctrine.md) — Content operating doctrine
- [Welcome Sequence Strategy](../strategy/buildos-welcome-sequence.md) — Email lifecycle design
- [Brand Guide 1-Pager](../brand/brand-guide-1-pager.md) — Brand reference
- [Brand Audit Framework](../brand/BUILDOS_BRAND_AUDIT_FRAMEWORK.md) — Audit workflow
- [Onboarding First Braindump Rebuild Spec](../../apps/web/docs/features/onboarding/ONBOARDING_FIRST_BRAINDUMP_REBUILD_SPEC.md) — Activation fix spec

---

_Audit conducted 2026-04-09 using four parallel growth agents (orchestrator, activation, retention, distribution) analyzing the live Supabase database, full codebase, and marketing documentation._
