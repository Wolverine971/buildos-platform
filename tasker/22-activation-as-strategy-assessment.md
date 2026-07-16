<!-- tasker/22-activation-as-strategy-assessment.md -->

# 22 - Activation As The Strategy Assessment

**Created 2026-07-07.** Owner: next growth / product strategy agent.
**Type:** assessment handoff. Do not implement code changes in this task unless explicitly asked.

## Assignment

Assess whether BuildOS is actually being built around activation.

The working thesis is:

> Activation is the strategy. If users do not reach the remembered-project moment, model choice, agent architecture, and category design do not matter yet.

This task should answer:

- Are we building toward activation?
- Are we going to get to activation with the current plan?
- Do we have a real plan for activation, or only adjacent feature work?
- What must be measured, changed, or paused to make activation the operating center of BuildOS?

## Read First

Required:

- `docs/marketing/growth/growth-audit-2026-04-09.md`
- `docs/marketing/START_HERE.md`
- `docs/marketing/brand/brand-guide-1-pager.md`
- `docs/marketing/strategy/anti-ai-show-dont-tell-strategy.md`
- `docs/marketing/strategy/thinking-environment-creator-strategy.md`
- `apps/web/docs/features/onboarding/ONBOARDING_FIRST_BRAINDUMP_REBUILD_SPEC.md`
- `apps/web/docs/features/onboarding/ONBOARDING_FLOW_ANALYSIS.md`
- `apps/web/docs/technical/audits/ONBOARDING_AUDIT_2026-06-26.md`

Relevant existing Taskers:

- `tasker/13-ai-inbox-verify-and-cleanup.md`
- `tasker/14-complete-project-audit-build.md`
- `tasker/21-thinking-loop-research-handoff.md`

Useful code / system entry points:

- `apps/web/src/routes/onboarding/+page.svelte`
- `apps/web/src/lib/components/onboarding-v2/ProjectsCaptureStep.svelte`
- `apps/web/src/routes/api/onboarding/+server.ts`
- `apps/web/src/lib/config/onboarding.config.ts`
- `apps/web/src/lib/server/onboarding.service.ts`
- `apps/web/src/lib/server/onboarding-profile-seed.service.ts`
- `apps/web/src/lib/server/welcome-sequence.service.ts`
- `apps/web/src/routes/api/cron/welcome-sequence/+server.ts`
- `apps/web/src/routes/api/cron/trial-reminders/+server.ts`
- `apps/web/src/lib/config/trial.ts`

## Core Research Questions

### 1. What is BuildOS activation?

Do not accept "completed onboarding" as the answer without testing it.

Define:

- Primary activation event.
- Secondary activation events.
- Leading indicators.
- False positives.
- Minimum viable activation for different wedges.

Candidate activation moments:

- User submits first real brain dump.
- User gets a structured project they recognize as useful.
- User edits / accepts extracted structure.
- User returns to a project after a delay and immediately sees what matters.
- User receives a daily brief and acts on it.
- User uses AI Inbox to decide and update project state.
- User connects an external agent that reads / writes the project.
- User says they would be disappointed if BuildOS disappeared.

### 2. What is the remembered-project moment?

Define this in concrete user language.

Questions:

- What must the project remember for the user to feel relief?
- Is it tasks, decisions, docs, risks, open questions, history, relationships, next moves, or all of them?
- How soon can the first version of this happen?
- What should the user see immediately after it happens?
- What is the smallest demo that proves it?

### 3. Does the current funnel force activation?

Audit:

- Onboarding steps.
- First project creation.
- Brain dump processing.
- Dashboard / first landing surface after onboarding.
- Welcome sequence.
- Daily brief setup.
- Trial / payment state.
- Re-entry after inactivity.

For each, answer:

- Does this move the user closer to activation?
- Does it let the user skip activation?
- Does it measure activation?
- Does it show proof of value?
- Does it create a return trigger?

### 4. Is the current roadmap aligned?

Review active Tasker docs and relevant product specs.

Classify open work into:

- Directly activation-critical.
- Supports activation indirectly.
- Useful but distracting until activation improves.
- Dangerous because it adds surface area before the core loop works.

Be blunt. The output should help DJ decide what to pause.

### 5. What must be instrumented?

Define a minimum activation event stream.

Candidate events:

- `onboarding_started`
- `intent_selected`
- `first_capture_started`
- `first_capture_submitted`
- `first_structure_generated`
- `first_project_created`
- `first_project_reviewed`
- `first_suggestion_accepted`
- `first_project_reopened`
- `daily_brief_received`
- `daily_brief_acted_on`
- `inbox_decision_completed`
- `project_context_updated`
- `trial_conversion_prompt_seen`
- `paid_conversion_started`

Include properties needed for cohort analysis:

- audience / intent
- source / UTM
- project count
- capture length
- time-to-value
- model cost
- output quality rating
- context depth
- activation path

### 6. What is the activation plan?

Write a realistic plan with:

- What to fix first.
- What to measure first.
- What to stop doing until activation is repaired.
- What proof assets should be recorded from the repaired flow.
- What success looks like in 7 days, 30 days, and 90 days.

## Deliverables

Create a new assessment doc:

- `docs/product/activation-as-strategy-assessment-2026-07-07.md`

Create `docs/product/` if it does not exist yet; this task is allowed to establish that product-strategy folder.

The assessment should include:

1. Proposed BuildOS activation definition.
2. Current funnel map.
3. Activation blockers.
4. Roadmap alignment table.
5. Instrumentation gaps.
6. 7 / 30 / 90 day activation plan.
7. Decisions DJ needs to make.

## Definition Of Done

- Activation is defined beyond "onboarding complete."
- The remembered-project moment is described in concrete terms.
- Current product flow is assessed against that definition.
- The output gives DJ a clear view of whether BuildOS is currently building toward activation.
- No code changes unless DJ explicitly approves implementation.
