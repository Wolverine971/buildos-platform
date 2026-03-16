<!-- apps/web/docs/features/onboarding/README.md -->

# Onboarding Feature

**Last Updated**: March 16, 2026
**Status**: Active (V3 Complete, V2 Deprecated)
**Category**: Feature
**Location**: `/apps/web/docs/features/onboarding/`

---

## Overview

The onboarding system helps new users get started with BuildOS in under 5 minutes. V3 strips the flow to 4 meaningful steps — collecting only what behavior can't reveal (intent + stakes), creating real data (brain dump), and setting up notifications. On completion, the user's behavioral profile is seeded with initial dimensions at confidence 0.1.

**Design philosophy**: Ask questions that behavior can't reveal. Create real data, not preferences. Teach by doing, not by telling. The onboarding IS the first behavioral data.

---

## Documentation in This Folder

| Document                                                                   | Purpose                                |
| -------------------------------------------------------------------------- | -------------------------------------- |
| [README.md](./README.md)                                                   | This file - Overview and navigation    |
| [ONBOARDING_V2_UPDATE_ASSESSMENT.md](./ONBOARDING_V2_UPDATE_ASSESSMENT.md) | V2 implementation spec (deprecated)    |
| [ONBOARDING_V2_UPDATED_SPEC.md](./ONBOARDING_V2_UPDATED_SPEC.md)           | Detailed V2 specification (deprecated) |
| [ONBOARDING_FLOW_ANALYSIS.md](./ONBOARDING_FLOW_ANALYSIS.md)               | Original flow analysis                 |
| [ONBOARDING_ASSETS_CHECKLIST.md](./ONBOARDING_ASSETS_CHECKLIST.md)         | Asset requirements checklist           |

### Specs (in `/docs/specs/`)

| Document                                | Purpose                                        |
| --------------------------------------- | ---------------------------------------------- |
| `ONBOARDING_BEHAVIORAL_SEED_SPEC.md`    | V3 design spec — onboarding as behavioral seed |
| `USER_BEHAVIORAL_PROFILE_SPEC.md`       | Companion spec — behavioral profile system     |
| `ONBOARDING_BEHAVIORAL_SEED_SPEC.md` §9 | Implementation checklist with progress         |

---

## Onboarding V3 Flow (Current)

The V3 flow consists of 4 steps, down from V2's 9. Total time: ~3-6 minutes.

| Step | Component             | Required | Purpose                                    |
| ---- | --------------------- | -------- | ------------------------------------------ |
| 1    | `IntentStakesStep`    | Yes      | "What brings you here?" + "How important?" |
| 2    | `ProjectsCaptureStep` | No\*     | Brain dump with intent-tailored prompts    |
| 3    | `NotificationsStepV3` | No       | Email + SMS toggles, simplified            |
| 4    | `ReadyStep`           | Yes      | Stats summary + next actions + complete    |

\*Skippable for "explore" intent users.

### Step 1: Intent + Stakes

Two questions that behavior alone can't reveal:

- **Intent** (4 options): organize, plan, unstuck, explore
- **Stakes** (3 options): high (work/income), medium (personal), low (casual)

These seed the behavioral profile dimensions and generate initial agent instructions.

### Step 2: Brain Dump

Reuses `ProjectsCaptureStep` with intent-aware prompts:

- "organize" → "Tell us about the projects you're working on..."
- "plan" → "What are you trying to accomplish?..."
- "unstuck" → "What's on your plate right now?..."
- "explore" → "Got anything you're working on?..."

### Step 3: Notifications

Single screen with email daily brief toggle and SMS toggle. If SMS selected, inline phone verification appears. Skip is prominent.

### Step 4: You're Ready

Shows stats (projects, tasks, goals created), next action suggestions, and "Go to Dashboard" CTA. Completing this step:

1. Marks onboarding complete on `users` and `user_context` tables
2. Seeds the behavioral profile via `seedProfileFromOnboarding()`
3. Queues onboarding analysis job

---

## Welcome Sequence Integration

New-account onboarding and the welcome email sequence are now intentionally linked.

- Account creation starts the welcome sequence as soon as the app has created the matching `public.users` row for a real new trial user.
- Later welcome emails branch using the same product state onboarding writes:
    - `users.onboarding_intent`
    - `users.onboarding_completed_at`
    - project presence in `onto_projects`
    - daily brief and notification flags in `user_brief_preferences` and `user_notification_preferences`
    - SMS readiness in `user_sms_preferences`
    - calendar connection in `user_calendar_tokens`
- Email 4 only sends when the user still needs follow-through setup: incomplete onboarding, no daily brief, no verified SMS path, and no connected calendar.
- The marketing source of truth for the sequence lives in `/docs/marketing/strategy/buildos-welcome-sequence.md`. Keep product docs aligned to that doc and the implementation in `welcome-sequence.service.ts`.

---

## Behavioral Profile Seeding

On V3 completion, `onboarding-profile-seed.service.ts` creates/upserts the user's `user_behavioral_profiles` row:

| Signal          | What It Seeds                                                 |
| --------------- | ------------------------------------------------------------- |
| Intent          | `action_orientation`, `session_style`, `intent_clarity`, etc. |
| Stakes          | `autonomy_comfort` (high stakes → 0.2, low → 0.5)             |
| Brain dump size | `information_appetite` (verbose → 0.6, terse → 0.3)           |
| Time spent      | `session_style` (fast → bursty, slow → deep)                  |
| Steps skipped   | `overwhelm_threshold` (skips → lower threshold)               |

Initial confidence: **0.1** — the profile is a starting point, refined after 10 sessions.

Agent instructions are generated per intent+stakes combo (e.g., "This user came to BuildOS to get unstuck. Keep it simple. One thing at a time.").

---

## Key Files

### V3 Components

```
/src/lib/components/onboarding-v3/
├── IntentStakesStep.svelte        # Intent + stakes two-question flow
├── NotificationsStepV3.svelte     # Simplified email/SMS toggles
├── ReadyStep.svelte               # Completion screen with stats
└── ProgressIndicatorV3.svelte     # 4-dot progress bar
```

### Shared Components (from V2)

```
/src/lib/components/onboarding-v2/
├── ProjectsCaptureStep.svelte     # Brain dump + calendar (modified for V3 intent props)
└── PhoneVerificationCard.svelte   # Phone verification (reused by V3)
```

### Routes

- `/src/routes/onboarding/+page.svelte` — V3 4-step flow (~147 lines)
- `/src/routes/onboarding/+page.server.ts` — Auth + completion redirect

### Services

- `/src/lib/server/onboarding.service.ts` — Server service (save intent/stakes, complete V3)
- `/src/lib/server/onboarding-profile-seed.service.ts` — Behavioral profile seeding
- `/src/lib/config/onboarding.config.ts` — V3 config (intents, stakes, brain dump prompts)

### API

- `POST /api/onboarding` with actions:
    - `save_intent_stakes` — persists intent + stakes to users table
    - `complete_v3` — marks complete, seeds profile, queues analysis
    - `save_inputs`, `save_input_only`, `summary`, `complete` — legacy V1 actions (still functional)

### Database

- Migration: `supabase/migrations/20260216000000_onboarding_v3_columns.sql`
- New columns: `users.onboarding_intent`, `users.onboarding_stakes`, `user_behavioral_profiles.onboarding_seed`

---

## V2 → V3 Migration

### What was removed

9 V2 components deleted: WelcomeStep, CapabilitiesStep, FlexibilityStep, PreferencesStep, CombinedProfileStep, AdminTourStep, SummaryStep, ProgressIndicator, NotificationsStep. The client-side `onboarding-v2.service.ts` was also deleted.

### What was kept

- `ProjectsCaptureStep.svelte` — modified with `intent` and `isSkippable` props
- `PhoneVerificationCard.svelte` — reused by NotificationsStepV3
- `ONBOARDING_V2_CONFIG` — still referenced by ProjectsCaptureStep for voice input feature flag

### Backward compatibility

- Existing users with `completed_onboarding: true` or `user_context.onboarding_completed_at` are redirected away from `/onboarding`
- V1 API actions (`save_inputs`, `save_input_only`, `summary`, `complete`) still work
- The `user_context` table's `onboarding_completed_at` is set on V3 completion for backward compat

---

## Not Yet Implemented

From the spec (§5, §9):

- Progressive discovery system (contextual feature introduction)
- Ambient onboarding checklist component
- Feature introduction triggers
- Onboarding timing capture as session events
- Retroactive profile seeding for existing V1/V2 users
- Validation metrics (completion rate, say/do gap tracking)

---

## Related Documentation

### Direct Dependencies

- **[Behavioral Profile Spec](/docs/specs/USER_BEHAVIORAL_PROFILE_SPEC.md)** — Companion spec for profile system
- **[Onboarding Seed Spec](/docs/specs/ONBOARDING_BEHAVIORAL_SEED_SPEC.md)** — V3 design spec
- **[Ontology System](../ontology/README.md)** — Project structure created during brain dump
- **[Brain Dump](../braindump-context/README.md)** — Brain dump processing system

### UI Components

- **[Inkprint Design System](../../technical/components/INKPRINT_DESIGN_SYSTEM.md)** — Design system used

---

## Progress Log

### 2026-02-16: V3 Implementation Complete

- Rewrote onboarding from V2 (9 steps, 835 lines) to V3 (4 steps, 147 lines)
- Created IntentStakesStep, NotificationsStepV3, ReadyStep, ProgressIndicatorV3
- Modified ProjectsCaptureStep with intent-aware prompts and skip support
- Built behavioral profile seeding service (dimensions, agent instructions)
- Added `save_intent_stakes` and `complete_v3` API actions
- Database migration for `onboarding_intent`, `onboarding_stakes`, `onboarding_seed`
- Deleted 9 unused V2 components + V2 client service
- Added onboarding API validation tests and confirmed targeted onboarding/task/icon route tests pass

### 2026-01-07: V2 Complete (All 3 Phases)

- V2 onboarding with 9 steps including brain dump, calendar analysis, preferences
- See ONBOARDING_V2_UPDATE_ASSESSMENT.md for V2 details

---

**Document Author**: Claude
**Last Major Update**: March 16, 2026 - Welcome sequence integration documented
