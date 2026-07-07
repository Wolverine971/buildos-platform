<!-- docs/technical/reviews/project-loops-flow-audit-handoff-2026-07-04.md -->

# Project Loops Flow Audit Handoff - 2026-07-04

## Purpose

This is a handoff brief for an agent auditing BuildOS Project Loops, AI Inbox review, and the newer Complete Project Audit track.

The product goal is not just "run agents in the background." The goal is to make BuildOS a better thinking environment: proactively scan projects, remove bloat/cruft/duplication, surface important decisions, and add clarity without nagging the user or repeating stale advice.

The audit should answer:

1. Are the current loops actually helping users maintain clearer projects?
2. Are duplicate/similar task suggestions smart enough to be useful and safe?
3. Does user feedback, especially dismissed loop suggestions, reliably suppress or reshape future suggestions?
4. Is the Complete Project Audit flow real, testable, and pointed at the right product outcome?

## Current Status Snapshot

As of 2026-07-04:

- Production schema appears applied for Project Loops, AI Inbox, and Complete Project Audit tables.
- Production has `project_loop_runs`, `project_suggestions`, `inbox_items`, `project_audits`, `project_audit_trigger_evaluations`, and `project_audit_suggestions`.
- Production row counts observed through read-only Supabase API:
    - `project_loop_runs`: 101
    - `project_suggestions`: 5
    - `inbox_items`: 16
    - `project_audits`: 0
- Existing Project Loop production runs:
    - 97 `end_of_day` rows failed before queueing because old enqueue logic used actor IDs as queue `user_id`s.
    - 2 manual runs failed with `feature_disabled`.
    - 2 manual runs reached `waiting_review` and created 5 suggestions.
- The end-of-day failure cluster is stale:
    - All failed `end_of_day` rows have `queue_job_id = null` and `started_at = null`.
    - No failed `end_of_day` rows exist after 2026-06-25.
    - Current code resolves `onto_projects.created_by` through `onto_actors.user_id` and validates against `public.users`.
- No scheduled Project Loop rows exist after 2026-06-25. The worker no-ops in production unless `ENABLE_PROJECT_LOOPS=true` is present in the worker environment.
- Complete Project Audit schema and code exist, but production has zero `project_audits` rows. Treat this as built-but-lightly-tested until a full run proves otherwise.

## Loop Taxonomy

### 1. Light Project Review Loop

The main project-loop worker performs a focused reconciliation pass for one project.

Entry points:

- Manual web trigger: [`apps/web/src/lib/server/project-loops.service.ts`](../../../apps/web/src/lib/server/project-loops.service.ts)
- Worker-side enqueue: [`apps/worker/src/workers/project-loop/enqueue.ts`](../../../apps/worker/src/workers/project-loop/enqueue.ts)
- Worker processor: [`apps/worker/src/workers/project-loop/projectLoopWorker.ts`](../../../apps/worker/src/workers/project-loop/projectLoopWorker.ts)

Output:

- Parent run row in `project_loop_runs`
- Child review rows in `project_suggestions`
- Denormalized inbox rows in `inbox_items`

Suggestion families:

- `doc_org`: suggests document/tree cleanup.
- `doc_outdated`: flags stale docs/evidence.
- `drift`: informational project drift acknowledgement.
- `task_conflict`: flags duplicate/contradictory/blocked open tasks with reversible metadata, not destructive merges.

Generator code:

- [`apps/worker/src/workers/project-loop/generators.ts`](../../../apps/worker/src/workers/project-loop/generators.ts)

### 2. Burst Loop

Project mutations can trigger a lightweight scan when recent activity crosses a threshold.

Code:

- [`apps/web/src/lib/server/project-loop-burst.service.ts`](../../../apps/web/src/lib/server/project-loop-burst.service.ts)

This path can also evaluate whether a Complete Project Audit should be queued.

Key audit concern: confirm this does not over-trigger on minor edits, but does catch meaningful project churn.

### 3. End-of-Day Scheduled Loop

The worker scheduler scans active/planning projects updated in the last 24 hours.

Code:

- Scheduler: [`apps/worker/src/scheduler.ts`](../../../apps/worker/src/scheduler.ts)
- End-of-day scan: [`apps/worker/src/workers/project-loop/enqueue.ts`](../../../apps/worker/src/workers/project-loop/enqueue.ts)
- Owner resolution: [`apps/worker/src/workers/project-loop/ownerResolution.ts`](../../../apps/worker/src/workers/project-loop/ownerResolution.ts)
- Regression tests: [`apps/worker/tests/projectLoopOwnerResolution.test.ts`](../../../apps/worker/tests/projectLoopOwnerResolution.test.ts)

Known historical issue:

- Old runs failed because `created_by` was treated as a real user id.
- Current code maps `created_by` actor IDs to `onto_actors.user_id`, validates against `public.users`, and skips invalid owners.

Audit question:

- Is `ENABLE_PROJECT_LOOPS` enabled in the production worker environment? If not, scheduled loops are currently off.

### 4. AI Inbox Review Loop

AI Inbox is the unified review queue. Project-loop suggestions are one source among others.

Core service and routes:

- Inbox list/count service: [`apps/web/src/lib/server/inbox.service.ts`](../../../apps/web/src/lib/server/inbox.service.ts)
- Decide route: [`apps/web/src/routes/api/inbox/decide/+server.ts`](../../../apps/web/src/routes/api/inbox/decide/+server.ts)
- Chat route: [`apps/web/src/routes/api/inbox/[item_id]/chat-session/+server.ts`](../../../apps/web/src/routes/api/inbox/%5Bitem_id%5D/chat-session/+server.ts)
- Resolve-from-chat route: [`apps/web/src/routes/api/inbox/[item_id]/resolve-from-chat/+server.ts`](../../../apps/web/src/routes/api/inbox/%5Bitem_id%5D/resolve-from-chat/+server.ts)
- Project Inbox UI: [`apps/web/src/lib/components/project/ProjectInboxPanel.svelte`](../../../apps/web/src/lib/components/project/ProjectInboxPanel.svelte)
- Dashboard Inbox UI: [`apps/web/src/lib/components/dashboard/DashboardInboxModal.svelte`](../../../apps/web/src/lib/components/dashboard/DashboardInboxModal.svelte)

Shared source-to-inbox indexing:

- [`packages/shared-agent-ops/src/inbox-index.ts`](../../../packages/shared-agent-ops/src/inbox-index.ts)

Audit concern:

- Does the inbox make review feel like useful clarity, or does it become a second task list?

### 5. Feedback Memory Loop

Dismissed/applied/delegated/superseded suggestions can feed later project-loop prompts. Earlier code only loaded prior decisions when `user_feedback` was present; the 2026-07-04 fixes now write implicit dismissal feedback and load prior decisions without that non-null filter.

Feedback write path:

- Project suggestion decision service: [`apps/web/src/lib/server/project-suggestion-actions.service.ts`](../../../apps/web/src/lib/server/project-suggestion-actions.service.ts)
- Clarified decision service: [`apps/web/src/lib/server/clarified-decision.service.ts`](../../../apps/web/src/lib/server/clarified-decision.service.ts)
- Resolve-from-chat route: [`apps/web/src/routes/api/inbox/[item_id]/resolve-from-chat/+server.ts`](../../../apps/web/src/routes/api/inbox/%5Bitem_id%5D/resolve-from-chat/+server.ts)

Feedback read path:

- `loadPriorDecisions` in [`apps/worker/src/workers/project-loop/projectLoopWorker.ts`](../../../apps/worker/src/workers/project-loop/projectLoopWorker.ts)
- Prompt inclusion in [`apps/worker/src/workers/project-loop/generators.ts`](../../../apps/worker/src/workers/project-loop/generators.ts)

Important current behavior:

- Dismiss with feedback stores `project_suggestions.user_feedback`.
- Bare dismissals are backfilled as `reason = dismissed_without_note`.
- Later loop context loads prior decisions where status is `rejected`, `applied`, `delegated`, or `superseded`, without requiring non-null `user_feedback`.
- Deterministic pre-insert suppression drops repeated suggestions with the same semantic key before they reach the inbox.

Primary audit question:

- Should every dismissal record at least an implicit feedback object so future loops know "the user rejected this," even if there is no free-text rationale?

### 6. Freshness Guard Loop

Project suggestions carry `source_fingerprint` when their operations mutate concrete project entities. Approval checks whether those referenced entities changed since the suggestion was generated.

Code:

- Shared scoped fingerprint helpers: [`packages/shared-agent-ops/src/project-loops.ts`](../../../packages/shared-agent-ops/src/project-loops.ts)
- Approval freshness service: [`apps/web/src/lib/server/project-loop-snapshot.service.ts`](../../../apps/web/src/lib/server/project-loop-snapshot.service.ts)
- Approval freshness guard: [`apps/web/src/lib/server/project-suggestion-actions.service.ts`](../../../apps/web/src/lib/server/project-suggestion-actions.service.ts)

Behavior:

- If the current scoped fingerprint differs, the suggestion becomes `superseded`, `freshness_state = changed`, and no operation is applied.
- Informational/no-op suggestions such as drift and audit follow-ups carry no source fingerprint and are acknowledged without a freshness guard.

Audit concern:

- Does the fingerprint track the right project fields, or does it over/under-invalidate review items?

### 7. Complete Project Audit Loop

Complete Project Audit is the larger, more strategic review track. It should eventually answer, "Is this whole project coherent, healthy, and ready to move forward?"

Core code:

- Shared audit snapshot, eligibility, trigger, and scoring logic: [`packages/shared-agent-ops/src/project-audits.ts`](../../../packages/shared-agent-ops/src/project-audits.ts)
- Worker enqueue path: [`apps/worker/src/workers/project-loop/auditEnqueue.ts`](../../../apps/worker/src/workers/project-loop/auditEnqueue.ts)
- Web enqueue path: [`apps/web/src/lib/server/project-audit-trigger.service.ts`](../../../apps/web/src/lib/server/project-audit-trigger.service.ts)
- Worker execution path: `processCompleteProjectAuditJob` in [`apps/worker/src/workers/project-loop/projectLoopWorker.ts`](../../../apps/worker/src/workers/project-loop/projectLoopWorker.ts)
- Audit chat service: [`apps/web/src/lib/server/project-audit-chat-session.service.ts`](../../../apps/web/src/lib/server/project-audit-chat-session.service.ts)
- Audit tracker UI: [`apps/web/src/lib/components/project/ProjectAuditTracker.svelte`](../../../apps/web/src/lib/components/project/ProjectAuditTracker.svelte)
- Audit API routes: [`apps/web/src/routes/api/onto/projects/[id]/audits`](../../../apps/web/src/routes/api/onto/projects/%5Bid%5D/audits)

Schema:

- [`supabase/migrations/20260703000000_complete_project_audits.sql`](../../../supabase/migrations/20260703000000_complete_project_audits.sql)
- [`supabase/migrations/20260703010000_project_audit_recommendation_suggestion_kind.sql`](../../../supabase/migrations/20260703010000_project_audit_recommendation_suggestion_kind.sql)

Current status:

- Schema exists in production.
- Code exists.
- No production `project_audits` rows observed on 2026-07-04.
- Treat this as not product-validated until a manual audit run proves:
    - trigger evaluation works,
    - project snapshot is sane,
    - worker completes,
    - report content is useful,
    - child recommendations are linked to `project_suggestions`,
    - UI displays the audit and child suggestions correctly,
    - chat opens with audit context,
    - review/archive flows update status correctly.

## Data Models

### `project_loop_runs`

Parent event for light project-loop work and, for complete audits, a worker parent/link row.

Fields to inspect:

- `project_id`, `user_id`
- `trigger_reason`: `manual`, `burst`, `end_of_day`, `scheduled`, `critical_change`
- `status`: `queued`, `running`, `waiting_review`, `completed`, `failed`
- `brief`
- `summary`
- `suggestion_count`
- `chat_session_id`
- `queue_job_id`
- `error_message`

Schema:

- [`supabase/migrations/20260613000000_project_loops.sql`](../../../supabase/migrations/20260613000000_project_loops.sql)
- [`supabase/migrations/20260625000000_project_loop_run_brief.sql`](../../../supabase/migrations/20260625000000_project_loop_run_brief.sql)

### `project_suggestions`

Reviewable child finding emitted by a Project Loop or Complete Project Audit.

Fields to inspect:

- `kind`: `doc_org`, `doc_outdated`, `drift`, `task_conflict`, `audit_recommendation`
- `risk_tier`
- `title`, `rationale`, `why_now`
- `evidence_refs`
- `preview`
- `operations`
- `status`
- `freshness_state`
- `source_fingerprint`
- `user_feedback`
- `result`
- `chat_session_id`
- `agent_run_id`

Schema:

- [`supabase/migrations/20260613000000_project_loops.sql`](../../../supabase/migrations/20260613000000_project_loops.sql)
- [`supabase/migrations/20260613010000_project_review_item_metadata.sql`](../../../supabase/migrations/20260613010000_project_review_item_metadata.sql)
- [`supabase/migrations/20260626000000_project_suggestion_chat_link.sql`](../../../supabase/migrations/20260626000000_project_suggestion_chat_link.sql)
- [`supabase/migrations/20260626010000_clarified_project_suggestion_decisions.sql`](../../../supabase/migrations/20260626010000_clarified_project_suggestion_decisions.sql)

### `inbox_items`

Denormalized review queue item. Source rows remain canonical.

Fields to inspect:

- `source_type`
- `source_ref_id`
- `source_status`
- `user_id`, `project_id`, `audience`
- `status`: `pending`, `deciding`, `decided`, `blocked`, `expired`, `snoozed`
- `title`, `summary`, `risk_tier`, `action_kinds`
- `decided_at`, `expires_at`

Schema:

- [`supabase/migrations/20260624010000_ai_inbox_items.sql`](../../../supabase/migrations/20260624010000_ai_inbox_items.sql)

### `project_audits`

Durable report packet for the larger audit track.

Fields to inspect:

- `status`
- `trigger_reason`
- `audit_depth`
- `delivery_confidence`
- `project_size_class`
- `project_thesis`
- `summary`
- `top_findings`
- `top_actions`
- `dimensions`
- `risks`
- `open_questions`
- `recommendations`
- `generated_suggestion_count`
- `unresolved_suggestion_count`
- `trigger_snapshot`
- `project_snapshot_fingerprint`

Schema:

- [`supabase/migrations/20260703000000_complete_project_audits.sql`](../../../supabase/migrations/20260703000000_complete_project_audits.sql)

### `project_audit_trigger_evaluations`

Audit gate/evaluation history.

Fields to inspect:

- `decision`
- `trigger_reason`
- `eligible`
- `project_size_class`
- `maturity_snapshot`
- `burst_score`
- `changed_entity_count`
- `major_change_count`
- `last_audit_id`
- `quiet_until`
- `cooldown_until`
- `reason_summary`
- `created_audit_id`
- `created_loop_run_id`

### `project_audit_suggestions`

Join table linking audit report recommendations to reviewable `project_suggestions`.

Fields to inspect:

- `audit_id`
- `suggestion_id`
- `role`

### `queue_jobs`

Background processor queue.

Relevant details:

- Project loop jobs use `job_type = buildos_project_loop`.
- Failed historical end-of-day rows did not create queue jobs.
- Light-loop and complete-audit queue dedup keys are stable per project/day across web and worker producers.
- Producers resolve the queue row returned by `add_queue_job` and require its metadata to match the freshly-created parent run/audit. If the RPC returns an existing job or malformed metadata, the new loser row(s) are immediately marked `failed`.

Code:

- [`packages/shared-types/src/functions/add_queue_job.sql`](../../../packages/shared-types/src/functions/add_queue_job.sql)
- [`apps/worker/src/workers/project-loop/enqueue.ts`](../../../apps/worker/src/workers/project-loop/enqueue.ts)

## Task Deduplication / Similarity Audit Focus

The task-conflict loop is the closest current implementation to task deduplication. It does not automatically merge tasks. It asks the LLM to identify duplicate, contradictory, or blocked-by relationships among open tasks, then emits a `task_conflict` suggestion with reversible metadata operations.

Current implementation note, 2026-07-05: task-conflict generation now precomputes deterministic candidate pairs before LLM classification and rejects operations that do not match known task IDs, cited evidence, and the candidate-pair set. Remaining open questions are mostly product/UX: richer conflict actions, better dismissal rationale capture, and making accepted conflict flags visible in task and agent contexts.

Code to inspect:

- Task conflict prompt and parser: [`apps/worker/src/workers/project-loop/generators.ts`](../../../apps/worker/src/workers/project-loop/generators.ts)
- Suggestion approval executor: [`apps/web/src/lib/server/project-suggestion-actions.service.ts`](../../../apps/web/src/lib/server/project-suggestion-actions.service.ts)
- Tool execution path: [`apps/web/src/lib/services/agentic-chat/tools/core/tool-executor.ts`](../../../apps/web/src/lib/services/agentic-chat/tools/core/tool-executor.ts)

Questions the audit should answer:

1. Are task titles/descriptions enough context to identify meaningful duplicates, or should task links, goals, milestones, docs, assignees, due dates, and recent activity be included?
2. Does the prompt distinguish true duplicate work from related subtasks, repeated checklist items, and intentionally parallel tasks?
3. Are false positives safe enough because only metadata flags are written?
4. Does the UI explain task-conflict suggestions in a way that helps users decide?
5. Is there any deterministic or embedding-based similarity layer, or is this entirely LLM judgment?
6. Should BuildOS compute candidate pairs first, then ask the LLM to classify them, rather than asking the LLM to scan the whole task list?
7. Are task-conflict suggestions deduped across runs, or can the same pair be flagged repeatedly?
8. Should accepted task-conflict flags feed future task creation and agent-run behavior, not just show an inbox item?
9. Should dismissed task-conflict suggestions suppress that exact task pair, suppress similar pairs, or adjust a project-specific threshold?
10. What is the right user-facing action after a task-conflict flag: acknowledge, merge, link, convert one task to subtask, close one task, or just remember the relationship?

## Feedback Memory / Repeated Suggestion Audit Focus

Historical behavior suggested a risk: dismissed suggestions only became useful future context when `user_feedback` existed. Current code writes implicit feedback for bare dismissals, loads prior decisions without requiring feedback, and performs deterministic pre-insert suppression.

Current implementation note, 2026-07-05: dismissal reason/note fields are now present in the Project Inbox and Dashboard Inbox. The UI preserves those values before optimistic card removal and omits empty fields so the server can distinguish a truly bare dismiss (`dismissed_without_note`) from an explicit `other` reason. Verified with the inbox decide route test run and `pnpm --filter=web check`.

Code to inspect:

- Dismiss write: [`apps/web/src/lib/server/project-suggestion-actions.service.ts`](../../../apps/web/src/lib/server/project-suggestion-actions.service.ts)
- Prior decision loader: [`apps/worker/src/workers/project-loop/projectLoopWorker.ts`](../../../apps/worker/src/workers/project-loop/projectLoopWorker.ts)
- Prompt inclusion: [`apps/worker/src/workers/project-loop/generators.ts`](../../../apps/worker/src/workers/project-loop/generators.ts)

Questions the audit should answer:

1. Does the Project Inbox UI always send a `reason` or `note` on dismiss?
2. If the user clicks plain Dismiss with no rationale, should we still write `user_feedback = { reason: "dismissed_without_note", created_at }`?
3. Do later prompts have enough detail to avoid re-raising dismissed suggestions?
4. Should repeated-suggestion suppression be deterministic, based on a stable semantic key or source fingerprint, instead of prompt-only?
5. Does `source_fingerprint` identify project state changes, or can it help identify recurring suggestions?
6. Do we need a separate table for per-project "review memory" or "do not suggest this again" facts?
7. Should feedback from resolved inbox-origin chats also feed `priorDecisions`?
8. Are applied suggestions included in later context so the model does not re-propose already-applied cleanup?
9. Are there cases where dismissed suggestions should reappear after material project changes? What threshold should govern that?
10. What dashboard or telemetry would show "suggestion repeated after dismissal" as a quality bug?

## Complete Project Audit Focus

This is the part most aligned with "BuildOS as a thinking environment" if it works. It should not just emit more tasks. It should provide a durable readout of project health, clarity, risks, stale work, duplication, and next decisions.

Current implementation note, 2026-07-05: the worker now builds a deterministic audit scaffold and then runs an evidence-catalog-constrained LLM synthesis pass when an audit user is available. Synthesis must cite catalog evidence refs for findings, dimensions, risks, open questions, and recommendations, and falls back to the deterministic packet on model failure.

Questions the audit should answer:

1. What exactly should a Complete Project Audit produce that a light Project Loop should not?
2. Are `delivery_confidence`, `dimensions`, `risks`, `open_questions`, and `recommendations` populated with actionable evidence, or generic consulting prose?
3. Does the audit report make the project easier to understand in 60 seconds?
4. Does it distinguish:
    - stale information,
    - duplicated work,
    - blocked work,
    - missing decisions,
    - unclear goals,
    - poor document organization,
    - overloaded scope?
5. Are child `audit_recommendation` suggestions linked back to the audit and shown in the Inbox correctly?
6. Does dismissing or applying child recommendations update `generated_suggestion_count` and `unresolved_suggestion_count`?
7. Are trigger gates too conservative? Production has zero `project_audits` rows as of 2026-07-04.
8. Can a user manually request an audit from the UI, and can the worker complete it in production-like conditions?
9. Does the audit reuse light-loop signals and user feedback, or does it ignore prior project-review history?
10. Should the audit create a persistent "project clarity score" or just a report packet?

## Operational Questions

1. Is `ENABLE_PROJECT_LOOPS=true` set in the production worker environment?
2. Is `PUBLIC_ENABLE_PROJECT_LOOPS=true` set in production web?
3. Are scheduled loops intentionally off until more manual validation is done?
4. Should old failed end-of-day rows be left as historical signal, archived, or marked superseded/resolved?
5. Are queue dedup keys and returned queue metadata ownership checks correct:
    - light project loop: per project/day,
    - audit trigger evaluation: project/reason/time window,
    - complete audit run: per project/day plus `runId`/`auditId` metadata ownership?
6. Are stalled jobs reclaimed safely without duplicate suggestions, orphaned runs, or pending suggestions under failed parents?
7. Are cost caps and prompt payload caps sufficient for large projects?
8. Is PostHog or internal telemetry capturing:
    - suggestions generated,
    - accepted,
    - dismissed,
    - repeated after dismissal,
    - superseded by freshness,
    - failed application,
    - audit queued/skipped?
9. Are project-loop actions correctly excluded from triggering recursive burst loops?
10. Are AI Inbox status transitions repairable if source sync fails?

## Suggested Audit Method

1. Read the code and schema links above.
2. Build a sequence diagram for:
    - manual light loop,
    - burst-triggered light loop,
    - scheduled end-of-day loop,
    - suggestion accept,
    - suggestion dismiss,
    - inbox-origin chat resolution,
    - complete project audit.
3. Run a local or staging manual light loop on a throwaway project with:
    - duplicate-ish tasks,
    - related but non-duplicate tasks,
    - stale docs,
    - intentionally messy document structure,
    - a clear project goal.
4. Dismiss one suggestion with feedback and one without feedback. Rerun the loop and inspect whether either repeats.
5. Apply one task-conflict suggestion and inspect the actual task metadata written.
6. Run or simulate a Complete Project Audit and inspect:
    - `project_audits`,
    - `project_audit_trigger_evaluations`,
    - `project_audit_suggestions`,
    - linked `project_suggestions`,
    - UI rendering,
    - audit chat session context.
7. Produce findings as:
    - P0/P1 bugs,
    - product-quality gaps,
    - data-model gaps,
    - prompt/context gaps,
    - telemetry gaps,
    - recommended next implementation slices.

## Expected Deliverable

The reviewing agent should return:

1. A flow map of all Project Loop and Project Audit paths.
2. A status table for each path: built, tested, production enabled, observed rows, known failure modes.
3. Specific evidence on task dedupe quality.
4. Specific evidence on dismissed-suggestion memory.
5. Specific evidence on Complete Project Audit readiness.
6. Recommendations ranked by product impact:
    - highest leverage changes for clarity,
    - highest risk bugs,
    - smallest fixes that prevent repeated or noisy suggestions,
    - what must be true before scheduled loops are enabled broadly.
