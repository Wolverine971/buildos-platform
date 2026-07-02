---
date: 2026-06-12
topic: project-loops
status: brainstorm
path: docs/brainstorms/2026-06-12-project-loops-brainstorm.md
---

# Project Loops

## 2026-06-13 Direction Shift

Project Loops should orient around **Project Review**, not an "AI Suggestions"
inbox. The user-facing promise is: the project catches itself up while the user
is away, then asks for judgment only where judgment is actually needed.

The existing deferred-tool-call model is still the right substrate, but every
review item needs enough context for trust:

- why this surfaced now
- source evidence
- before/after preview
- freshness/staleness state
- reversibility or undo metadata
- user correction feedback

Detailed scope: `docs/specs/PROJECT_REVIEW_LOOPS_SCOPE_2026-06-13.md`.

## What We're Building

A **loop** is a per-project synthesis/reconciliation pass. After a burst of
activity on a project (brain dumps, new tasks, new documents) — or on an
end-of-day schedule — a focused agent reviews the project and emits a ranked
set of **review items** the user reviews and approves in a "Project Review"
panel on the project page (styled like the homepage overdue-task triage).

The loop agent never mutates the project directly. It investigates with
**read tools**, then proposes changes as **deferred tool calls**. Approving a
suggestion **replays its stored operations through the same `ChatToolExecutor`
the agentic chat uses** — so it acts "as if the user prompted the agent," but
gated by a risk tier.

v1 covers four reconciliation jobs:

1. **Document organization** — propose a `doc_structure` hierarchy for flat docs.
2. **Outdated document flags** — surface stale/superseded docs.
3. **Drift / on-track check** — assess whether tasks+docs still match the goal.
4. **Task de-confliction** — find duplicate/contradictory tasks, propose merges.

## Why This Approach

- **Not a new agent engine.** Homework and Tree Agent are rough drafts that
  underperform; we are _not_ building on them. Instead we reuse the one piece
  that already works well and is HTTP-decoupled: the agentic-chat **tool layer**
  (`ChatToolExecutor` + `CHAT_TOOL_DEFINITIONS`, 82 tools).
- **"Suggestion = deferred tool call"** reconciles the two requirements:
  tiered human review AND an agent with real tools. The suggestion stores the
  exact write operations; approval executes them. Nothing silently changes.
- **Document org is mostly already modeled** — `onto_projects.doc_structure`
  (JSONB tree), `onto_documents.children`, and `onto_project_structure_history`
  (audits reorganizations) already exist. The doc-org job is "propose a new
  `doc_structure` tree" + replay `move_document_in_tree` / `reorganize_onto_project_graph`.
- **The triage UI already exists as a template** — `OverdueTaskTriageModal`
  gives us the card list, per-item actions, batch actions, pending-state
  handling, and Inkprint styling to copy.

## Key Decisions

- **Trigger (chosen): end-of-day per active project + activity burst.**
  Both converge on enqueuing one job, `buildos_project_loop`, with a
  `dedup_key` per project. A **manual "Run loop" button** is added for free
  (essential for dogfooding) even though it wasn't explicitly requested.
    - End-of-day: scheduler enqueues for projects with activity since last run.
    - Burst: debounced — N changes within a window enqueue a loop after a quiet
      period (dedup_key collapses repeats). Window/threshold are open params.

- **Autonomy (chosen): tiered by risk, surfaced as a project-page section.**
    - **Tier 1 — info/low** (outdated flags, drift read, tags): one-click apply
      or dismiss. Read-mostly. Never auto-applied silently.
    - **Tier 2 — medium** (new tasks, doc moves): reviewed; batch-approvable.
    - **Tier 3 — high** (task merges/deletes, large doc restructures): **always
      explicit, one-by-one approval.** This is the "big restructuring requires
      user approval" rule.

- **Engine (chosen): a new focused loop pass, NOT homework/tree-agent.**
    - New worker job `buildos_project_loop`.
    - Loop agent gets **read tools** + one new meta-tool
      `propose_suggestion(kind, risk_tier, title, rationale, operations[])`.
    - `operations[]` = exact write tool-calls (e.g. `move_document_in_tree`,
      `update_onto_task`, `delete_onto_task`, `link_onto_entities`).
    - Approval path replays `operations[]` through `ChatToolExecutor` (same path
      the chat agent writes through — auth, validation, side effects, logging all
      reused).
    - Input context = `build_project_context_snapshot` (already exists).
    - Cost tracked via a `chat_session` like homework does.

- **Output data model (proposed):**
    - `project_loop_runs` — id, project_id, user_id, trigger_reason
      (`end_of_day` | `burst` | `manual`), status
      (`queued|running|waiting_review|completed|failed`), summary, counts,
      cost_usd, chat_session_id, started_at, finished_at.
    - `project_suggestions` — id, run_id, project_id, kind
      (`doc_org` | `doc_outdated` | `drift` | `task_conflict` | ...),
      risk_tier (1|2|3), title, rationale, confidence, `operations` JSONB
      (ordered deferred tool calls), status
      (`pending|approved|applied|rejected|superseded|failed`), sort_order,
      depends_on (suggestion id, nullable), created_at, decided_at, applied_at.
    - A suggestion may bundle **multiple ordered operations** (e.g. doc-org =
      many moves). Suggestions also carry **sort_order + depends_on** so the panel
      can sequence them (create container doc before moving into it; resolve task
      conflicts before drift recompute).

- **Review UI (proposed):** new project review panel rendered as a
  **"Project Review" section on the project page** (mirrors the homepage overdue
  section), expandable into a focused review. Reuses card layout, tier badges,
  approve/reject/defer buttons, `pendingSuggestionIds` set, and Inkprint tokens
  (`shadow-ink`, `wt-card`, `tx-bloom`/`tx-static`, success/warning color
  layers) from `OverdueTaskTriageModal`. Each item should show evidence,
  why-now, and a preview before the user approves a write.

## Phasing Within v1

1. **Phase 1 — substrate + safe wedge.** `buildos_project_loop` job, the two new
   tables, `propose_suggestion` meta-tool, approval-replay path, the suggestions
   panel, **doc-org + outdated flags** (tiers 1–2). Builds trust.
2. **Phase 2 — drift check** (tier 1, informational + may suggest new tasks).
3. **Phase 3 — task de-confliction** (tier 3, destructive) once the review flow
   is trusted.

## Open Questions

- **Burst detection params** — what counts as a "burst," and the quiet-period
  debounce before firing. Needs real-usage tuning.
- **Staleness/superseding** — if the project changes after a suggestion is
  generated (operations no longer valid), how do we detect and mark
  `superseded`? Validate operations at approval time and fail soft.
- **Tier-1 auto-apply?** Decision held: v1 = one-click, nothing silent. Revisit.
- **Per-run cost/budget cap** and max suggestions per run.
- **Snapshot freshness** — force a fresh `build_project_context_snapshot` at
  loop start, or accept the 15-min cache?
- **Where execution runs** — replay write tool-calls in the web request on
  approval (simplest, reuses `ChatToolExecutor` in-process) vs. enqueue an
  apply job. Lean web-request for single suggestions, job for batch-approve.
- **Naming** — surface as "Loops" (the run) + "Suggestions" (the output)?

## Implementation Status (2026-06-13)

Phase 1 built behind a dev-only feature flag (`PUBLIC_ENABLE_PROJECT_LOOPS` web,
`ENABLE_PROJECT_LOOPS` worker; both default off, auto-on in dev).

Resolved the "where does execution run" open question: **worker proposes, web
executes**. The worker can't import the web `ChatToolExecutor` (separate apps),
so the loop job emits suggestions whose `operations[]` are declarative tool-call
specs (`{ tool, args }`); the web replays them through the real `ChatToolExecutor`
on approval. No cross-app import.

Files:

- Migration: `supabase/migrations/20260613000000_project_loops.sql`
  (`project_loop_runs`, `project_suggestions`, `queue_type += buildos_project_loop`).
- Types: `packages/shared-types/src/project-loops.types.ts` + queue metadata.
- Worker engine: `apps/worker/src/workers/project-loop/` (orchestrator,
  generators for doc_org + doc_outdated, scheduler enqueue). Registered in
  `worker.ts`; end-of-day cron in `scheduler.ts` (4:00 UTC).
- Web API: `/api/onto/projects/[id]/loops` (GET list / POST trigger) +
  `/api/onto/projects/[id]/suggestions/[suggestion_id]` (approve/dismiss replay).
  Enqueue service `apps/web/src/lib/server/project-loops.service.ts` (30-min
  cooldown for automated triggers).
- UI: `ProjectSuggestionsPanel.svelte`, mounted on the project page above docs.

Deviations / deferrals:

- v1 doc-org only **moves existing documents** (no new container docs — avoids
  resolving a not-yet-created id at replay time).
- Outdated-doc apply is a **non-destructive props flag** (`loop_flagged_outdated`).
- **Burst trigger** mechanism is ready (`triggerReason: 'burst'` + cooldown) but
  intentionally NOT wired into a hot mutation path yet — debounce policy is the
  open tuning question; pick the chokepoint before enabling.
- Drift + task de-confliction generators are stubs-for-later (Phases 2–3).

Before it runs: apply the migration to the DB, then `pnpm gen:all` (regenerates
DB types so the new tables/enum typecheck cleanly).

## Next Steps

→ `/workflows:plan` for implementation details (schema migration, the
`propose_suggestion` tool + read-only tool subset, worker job, approval-replay
endpoint, and the `ProjectSuggestionsPanel` component).
