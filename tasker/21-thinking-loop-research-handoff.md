<!-- tasker/21-thinking-loop-research-handoff.md -->

# 21 - BuildOS Thinking Loop Research Handoff

**Created 2026-07-07.** Owner: next research / product-architecture agent.
**Type:** strategy + product-flow assessment. Do not implement code changes in this task unless explicitly asked.

## Assignment

Flesh out the BuildOS thinking loop:

1. Capture
2. Structure
3. Surface
4. Decide
5. Update

The current product appears strongest at **Capture -> Structure**. The assignment is to define the full loop, audit where the product already supports each stage, identify where the loop breaks, and propose a product-level model that BuildOS can repeatedly use when evaluating features.

This should answer: **Does BuildOS actually help a user think more clearly, or does it only turn messy input into stored structure?**

## Read First

Core positioning:

- `docs/marketing/START_HERE.md`
- `docs/marketing/brand/brand-guide-1-pager.md`
- `docs/marketing/strategy/thinking-environment-creator-strategy.md`
- `docs/marketing/strategy/how-to-explain-buildos-2026-05-11.md`

Current growth / activation reality:

- `docs/marketing/growth/growth-audit-2026-04-09.md`
- `apps/web/docs/features/onboarding/ONBOARDING_FIRST_BRAINDUMP_REBUILD_SPEC.md`
- `apps/web/docs/technical/audits/ONBOARDING_AUDIT_2026-06-26.md`

Relevant product systems:

- `apps/web/docs/technical/architecture/agent-work/AI_INBOX_DESIGN_2026-06-24.md`
- `apps/web/docs/technical/architecture/agent-work/AI_INBOX_CLARIFIED_DECISIONS_SPEC_2026-06-26.md`
- `apps/worker/docs/features/daily-briefs/DAILY_BRIEF_FLOW_AUDIT_2026-07-06.md`
- `docs/reports/daily-brief-quality-efficiency-review-2026-05-19.md`
- `docs/technical/reviews/project-loops-flow-audit-2026-07-04.md`
- `docs/specs/AGENTIC_CHAT_TIMELINE_TABS_BRAINDUMP_ARCHITECTURE_2026-06-20.md`

Useful code entry points to inspect:

- `apps/web/src/routes/onboarding/+page.svelte`
- `apps/web/src/lib/components/onboarding-v2/ProjectsCaptureStep.svelte`
- `apps/web/src/routes/api/onto/braindumps/+server.ts`
- `apps/web/src/routes/api/onto/braindumps/[id]/process/+server.ts`
- `apps/worker/src/workers/braindump/braindumpProcessor.ts`
- `apps/web/src/routes/api/inbox/decide/+server.ts`
- `apps/web/src/lib/server/inbox.service.ts`
- `apps/web/src/lib/components/dashboard/DashboardInboxModal.svelte`
- `apps/worker/src/workers/brief/ontologyBriefGenerator.ts`
- `apps/web/src/lib/components/briefs/DailyBriefModal.svelte`

## Core Research Questions

### 1. Define the stages in BuildOS language

For each loop stage, define:

- What the user is trying to do.
- What BuildOS should do.
- What product objects are created or changed.
- What a successful stage feels like.
- What failure looks like.

Starter definitions to test:

- **Capture:** user gets rough context out of their head without needing to organize it first.
- **Structure:** BuildOS turns rough input into project state: tasks, docs, decisions, risks, milestones, open questions, relationships.
- **Surface:** BuildOS brings the right part of the project back at the right moment.
- **Decide:** user, agent, or system resolves an ambiguity, accepts/rejects a suggestion, chooses the next move, or changes priority.
- **Update:** the canonical project state changes so future surfaces are better.

### 2. Map the current product onto the loop

Audit the current system by surface:

- Onboarding
- Brain dump / voice dump
- Project page
- Dashboard
- Daily brief
- AI Inbox
- Agentic chat
- External agent gateway / MCP
- Calendar suggestions
- Public pages

For each surface, answer:

- Which loop stages does it support?
- Which stage does it hand off to next?
- Does the user know what happened?
- Does the project state actually change?
- Does it create a return path?
- Where does the loop silently end?

### 3. Find the weak links

Pay special attention to:

- Whether **Surface** is too diffuse: dashboard, daily brief, inbox, notifications, and project pages may all surface things but without one clean model.
- Whether **Decide** only exists in AI Inbox and not as a broader BuildOS behavior.
- Whether **Update** is explicit enough for the user to trust that the project remembers.
- Whether a user can see what changed after a brain dump, brief, inbox action, or agent write.
- Whether the loop has a "what changed?" entry point for returning users.

### 4. Define loop quality metrics

Create metrics that distinguish a real thinking loop from simple storage.

Candidate metrics:

- Time from signup to first meaningful capture.
- Time from capture to visible structured project.
- Percentage of structured suggestions accepted, edited, or rejected.
- Percentage of surfaced items that lead to a decision or update.
- Return-after-brief rate.
- "What changed?" update rate.
- Number of projects with recent context updates.
- User-rated clarity after a brief / inbox decision / restart.
- Time-to-restart after 7+ days away.

### 5. Propose the canonical BuildOS loop model

The final output should give future agents a usable rubric:

- If a feature only captures but does not surface, it is incomplete.
- If it surfaces but does not create a decision path, it is noise.
- If it decides but does not update canonical state, it does not compound.
- If it updates but the user cannot see what changed, trust degrades.

## Deliverables

Create a new synthesis doc:

- `docs/product/thinking-loop-capture-structure-surface-decide-update-2026-07-07.md`

Create `docs/product/` if it does not exist yet; this task is allowed to establish that product-strategy folder.

The synthesis should include:

1. One-page loop definition.
2. Current-state map by product surface.
3. Broken / missing handoffs.
4. Proposed canonical loop UX.
5. Metrics and instrumentation gaps.
6. Prioritized research or implementation follow-ups.

If useful, add a Mermaid diagram showing the loop and where current features attach.

## Definition Of Done

- The loop is defined in plain BuildOS language.
- Each current product surface is mapped to loop stages.
- Missing Surface / Decide / Update behaviors are explicitly called out.
- The output gives future agents a rubric for evaluating features against the thinking-environment thesis.
- No code changes unless DJ explicitly approves implementation.
