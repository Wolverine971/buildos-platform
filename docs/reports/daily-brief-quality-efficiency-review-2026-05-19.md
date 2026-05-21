<!-- docs/reports/daily-brief-quality-efficiency-review-2026-05-19.md -->

# Daily Brief Quality and Efficiency Review

Date: 2026-05-19

## Scope

This review covers the ontology daily brief flow in `apps/worker/src/workers/brief`, especially how the worker selects projects, generates per-project briefs, composes the main brief, and spends LLM calls.

## Current Project Eligibility

Daily project briefs are generated only from projects loaded by `OntologyBriefDataLoader.loadUserOntologyData()`.

Current active-work filter:

- `onto_projects.state_key IN ('planning', 'active')`
- `onto_projects.deleted_at IS NULL`
- `onto_projects.archived_at IS NULL`

This excludes paused, deleted, archived, and blocked projects from per-project brief generation. Paused projects can still appear as short "Recently Paused" notices in the main daily brief, but they are not loaded into the active project set and do not receive project brief rows.

## Changes Implemented Now

### 1. Merged Project Next-Step Refresh Into Project Brief Generation

Before:

- The daily brief worker ran `generateProjectNextStepsForBrief()` as a separate LLM pass.
- It then ran another LLM pass per project to generate the project brief.
- Both passes reasoned over similar project context and produced next-action style output.

Now:

- The separate daily-brief next-step pre-pass is removed from `generateOntologyDailyBrief()`.
- The project brief LLM response returns `nextStepShort` and `nextStepLong`.
- When a project receives an LLM project brief, those next-step values are persisted to `onto_projects`.
- Deterministic project briefs continue to use the existing project next step.

Expected impact:

- Removes up to 8 LLM calls from each daily brief.
- Keeps next-step refresh tied to the same context used for the project brief.
- Reduces chance of conflicting project-level recommendations.

### 2. Added Signal-Based LLM Gating For Project Briefs

Before:

- Every active/planning project got a project-brief LLM call.
- Low-activity projects with no meaningful work this week still paid for fresh LLM generation.

Now:

- Every eligible project still gets an `ontology_project_briefs` row.
- High-signal projects get an LLM project brief.
- Low-signal projects use deterministic brief generation.

Current LLM signal triggers:

- Tasks due/start today.
- Calendar items today.
- Blocked tasks.
- Unblocking tasks.
- Goals at risk or behind.
- Multiple attention items.
- Two or more weekly commitments.
- At least one weekly commitment plus at least one distinct recent changed entity.
- Three or more distinct recent changed entities.

Passive projects are deterministic when they have little or no near-term schedule pressure and only minor/no recent movement.

Expected impact:

- Cuts unnecessary LLM calls for quiet projects.
- Preserves full coverage in the final brief because deterministic project briefs are still saved.
- Keeps LLM attention focused on projects where synthesis can actually add judgment.

### 3. Added Project Brief Concurrency Cap

Before:

- Project brief generation used unbounded `Promise.allSettled()` across all projects.

Now:

- Project brief generation uses a concurrency-limited mapper.
- Current cap: 3 project brief workers at a time.

Expected impact:

- Reduces provider/API burst pressure.
- Makes brief latency more predictable for users with many projects.
- Still allows parallelism.

### 4. Count Tasks Starting Today As Today's Work

Before:

- A task with `start_at` today and no `due_at` today was categorized as upcoming.
- This could make the daily brief understate today's work and could cause the project-brief LLM gate to skip an active project.

Now:

- Non-completed tasks with `start_at` today are categorized as today's tasks.
- Tasks with an overdue `due_at` remain overdue even if their `start_at` is today.

## Include/Exclude Project Hookup Findings

`includeProjects` and `excludeProjects` are currently request-scoped job options, not persisted user preference fields.

Current path:

- `DailyBriefJobMetadata.options` defines both fields as `string[]`.
- Shared validation requires both fields, when present, to be arrays of strings.
- `RailwayWorkerService.queueBriefGeneration()` can forward both arrays.
- `/api/brief-jobs/queue` forwards both arrays to the worker.
- `/api/daily-briefs/generate` also forwards both arrays to the worker.
- The worker `/queue/brief` endpoint stores both arrays in queued job options.

Current gaps:

- The primary brief page and daily brief modal do not pass include/exclude arrays into `BriefClientService.startStreamingGeneration()`.
- `BriefClientService.startStreamingGeneration()` does not expose include/exclude in its options, so a UI could not currently pass them through that path without a type/API change.
- The older frontend `BriefGenerationOptions` types still declare `includeProjects?: boolean`, which does not match the queue contract of `string[]`.
- The ontology worker receives the options but does not apply them in `loadUserOntologyData()`.

Interpretation:

- These fields look like a planned/manual generation filter, not a user-updated project preference.
- A backend-only implementation would make direct API callers work, but it would not change the normal user-facing generation path until the frontend creates and passes project ID arrays.

## Remaining Findings To Address Later

### Quality

- The final `Project Details` section may become too long for users with many active projects.
- `ontology_daily_briefs.executive_summary` stores the full main brief markdown, not just an executive summary. The naming is misleading.
- `includeProjects` and `excludeProjects` are accepted by the queue API but are not applied in the ontology data loader.
- Executive summary and full analysis can still overlap in content.

### Efficiency

- Executive summary and analysis are still separate LLM calls over overlapping context.
- Data loading fetches broad project entity sets and repeatedly groups/filter them in memory.
- Progress updates are split across queue metadata, daily brief rows, polling, and realtime subscriptions.
- Manual generation currently force-regenerates through the browser-side Railway worker service.
- Project brief LLM gating should be observed in production metrics and tuned after seeing real project distributions.

## Suggested Next Pass

1. Apply `includeProjects` / `excludeProjects` in the worker data loader after confirming the product surface that should set those arrays.
2. Add metrics for `projectBriefsLlmGenerated`, `projectBriefsDeterministic`, skipped reasons, cost, and latency.
3. Merge executive summary and analysis into a single LLM call that returns two bounded fields.
4. Shorten the final main brief by summarizing low-signal project details instead of appending every deterministic project brief verbatim.
