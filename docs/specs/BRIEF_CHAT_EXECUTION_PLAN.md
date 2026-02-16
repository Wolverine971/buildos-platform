<!-- docs/specs/BRIEF_CHAT_EXECUTION_PLAN.md -->

# Brief Chat Execution Plan

**Status:** Fully Implemented (Scoped Engineering Work Complete)  
**Owner:** Codex + DJ  
**Created:** 2026-02-14  
**Completed:** 2026-02-16  
**Primary Spec:** `docs/specs/BRIEF_CHAT_SPEC.md`

---

## 1) Product Framing (Locked)

- Global daily brief is **per-user private**.
- Project brief is **per-project shared snapshot** for collaborators.
- Brief chat sessions are **per-user** and keyed to `brief_id`.
- Regenerate creates a **new brief snapshot** (`new brief_id`) and keeps previous snapshots in history/background.

---

## 2) Permissions Model

- Global brief read/generate/regenerate: brief owner.
- Project brief read: project members with access.
- Project brief generate/regenerate: owner/editor (expand later if needed).
- Project brief API responses must be filtered by `ontology_daily_briefs.user_id = auth user` for personalized brief reads.

---

## 3) Implementation Plan

## Phase A: Security + Scope

- [x] Enforce user-scoped project brief reads in project-brief API route.
- [x] Audit ontology brief read endpoints and patch latest-snapshot/user-scope gaps.

## Phase B: Snapshot Semantics

- [x] Update ontology brief generation to immutable snapshots on regenerate.
- [x] Ensure lookup-by-date uses latest snapshot semantics where required.
- [x] Keep previous snapshots available in history views.

## Phase C: DB Guarantees

- [x] Add/verify unique constraint for `ontology_project_briefs (daily_brief_id, project_id)`.
- [x] Add one-processing-run lock pattern for ontology brief generation scope.
- [x] Add supporting indexes for latest-snapshot lookups.

## Phase D: Agent Behavior Alignment

- [x] Document operation-event contract preference (`operation` + `entity_id`, `tool_result` fallback).
- [x] Document ambiguity-driven confirmation behavior for out-of-brief entities.
- [x] Implement prompt/runtime guardrail updates in V2 prompt builder path.
- [x] Wire V2 `daily_brief` context loading with ontology-first entity resolution.
- [x] Enforce canonical Brief Chat session reuse by `brief_id` in V2 session service.

---

## 4) Concrete Worklog

### 2026-02-14

- Added user scoping to project brief API route:
    - `apps/web/src/routes/api/onto/projects/[id]/briefs/+server.ts`
    - Added join field `daily_brief.user_id` and filter `.eq('daily_brief.user_id', user.id)`.
- Implemented snapshot-based regenerate behavior in ontology brief repository:
    - `apps/web/src/lib/services/dailyBrief/ontologyBriefRepository.ts`
    - Regenerate now inserts a new processing snapshot row instead of mutating prior rows.
    - Date lookups now resolve to latest snapshot for that date.
    - Added race-handling for unique processing lock collisions.
- Added migration for snapshot safety and constraints:
    - `supabase/migrations/20260424000005_ontology_brief_snapshot_constraints.sql`
    - Unique index on `ontology_project_briefs (daily_brief_id, project_id)`.
    - Partial unique index for one processing run per `user_id + brief_date`.
    - Index for latest snapshot lookup by `created_at DESC`.
- Patched a latest-brief consumer to be snapshot-aware:
    - `apps/web/src/routes/api/admin/notifications/real-data/[userId]/[eventType]/+server.ts`
    - Latest brief query now orders by both `brief_date DESC` and `created_at DESC`.
- Added runtime daily-brief guardrails to the V2 master prompt builder:
    - `apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts`
    - Guardrails activate when brief-like signals are present in context data.
- Updated primary spec with:
    - Session/background behavior
    - Ambiguity-first confirmation policy
    - Collaboration-safe multi-user brief ownership requirements
    - Operation-event preference and fallback behavior

### 2026-02-14 (continued)

- Added `daily_brief` as a first-class chat context type and updated context maps/UI descriptors:
    - `packages/shared-types/src/chat.types.ts`
    - `apps/web/src/lib/components/agent/agent-chat.constants.ts`
    - `apps/web/src/lib/components/agent/AgentChatModal.svelte`
    - `apps/web/src/lib/services/agentic-chat/prompts/config/context-prompts.ts`
    - `apps/web/src/lib/services/chat-context-service.ts`
- Implemented V2 daily-brief context loading with ontology-first entity mentions and markdown-link fallback:
    - `apps/web/src/lib/services/agentic-chat-v2/context-loader.ts`
    - `apps/web/src/lib/services/agentic-chat-v2/context-models.ts`
- Enforced daily-brief access checks and request validation in V2 stream route:
    - `apps/web/src/routes/api/agent/v2/stream/+server.ts`
- Added canonical session behavior for Brief Chat (`context_type='daily_brief'` + `entity_id=brief_id`):
    - `apps/web/src/lib/services/agentic-chat-v2/session-service.ts`
- Updated tool/context configuration to support `daily_brief` context:
    - `apps/web/src/lib/services/agentic-chat/tools/core/tools.config.ts`
    - `apps/web/src/lib/services/agentic-chat-v2/prompt-builder.ts`
- Patched latest-snapshot read behavior in dashboard brief widget to avoid multi-snapshot `.maybeSingle()` collisions:
    - `apps/web/src/lib/components/dashboard/DashboardBriefWidget.svelte`
- Added focused tests:
    - `apps/web/src/lib/services/dailyBrief/ontologyBriefRepository.test.ts`
    - `apps/web/src/lib/services/agentic-chat-v2/context-loader.test.ts`

### 2026-02-15

- Verified split-pane Brief Chat integration on `/briefs`:
    - `apps/web/src/routes/briefs/+page.svelte`
    - `apps/web/src/lib/components/briefs/BriefChatModal.svelte`
    - Chat opens with `context_type='daily_brief'` and `entity_id=brief_id` through V2 stream.
- Fixed Brief Chat session keying in UI to prioritize ontology snapshot id:
    - `apps/web/src/lib/types/daily-brief.ts`
    - `apps/web/src/routes/briefs/+page.svelte`
    - `apps/web/src/lib/components/briefs/BriefChatModal.svelte`
- Updated `/briefs` data loader to prefer ontology snapshots for current brief and project briefs:
    - `apps/web/src/routes/briefs/+server.ts`
- Fixed database constraint mismatch causing runtime error
  (`chat_sessions_context_type_check` rejecting `daily_brief`):
    - `supabase/migrations/20260424000006_add_daily_brief_context_type_to_chat_sessions.sql`
- Implemented `/briefs` snapshot-specific selection + deep linking:
    - `apps/web/src/routes/briefs/+server.ts`
    - `apps/web/src/routes/briefs/+page.svelte`
    - Added `brief_id` query support and made history selection open exact snapshot instead of date-only latest.
- Patched snapshot-safe project brief API reads to avoid same-date multi-snapshot mixing:
    - `apps/web/src/routes/api/project-briefs/+server.ts`
    - Added explicit `brief_id` support and latest-snapshot-by-date resolution when `brief_id` is absent.
- Added canonical prewarm session reuse for Brief Chat:
    - `apps/web/src/routes/api/agent/prewarm/+server.ts`
    - Prewarm now reuses active `(user_id, context_type='daily_brief', entity_id=brief_id)` sessions and enforces brief ownership access checks.
- Validation:
    - `vitest` targeted suite passed for ontology brief snapshot + daily brief context loader.
    - `tsc --noEmit` still reports unrelated pre-existing errors across other modules
      (for example: calendar services, analytics briefs typing, markdown normalization).

---

## 5) Open Decisions (Non-Blocking Product Policy)

- Confirm whether project team brief generation permission should include viewers or remain owner/editor only.
- Confirm whether project team brief snapshots should have a separate table family in V1 or be layered after current model stabilizes.

---

## 6) Remaining Engineering Work

1. None required for the scoped execution plan.
2. Optional enhancement only: add a dedicated server-paginated history endpoint if `/briefs` history UX later needs larger-scale grouping/filtering.

---

## 7) UI Handoff Guide (For Implementation Agent)

### Required Contracts (Do Not Change)

- Brief chat must use `POST /api/agent/v2/stream` (no legacy `/api/agent/stream` path).
- Use `context_type: 'daily_brief'` for interactive brief chat.
- Use canonical session key `entity_id = brief_id` (ontology daily brief snapshot ID).
- Regenerate creates a new `brief_id` and therefore a fresh chat session; old sessions remain in background/history.
- Keep `daily_brief_update` reserved for preferences/settings only.

### Backend Behavior Already Implemented

- V2 stream validates brief chat requests and requires `entity_id` for `daily_brief`.
- V2 stream verifies brief ownership (`ontology_daily_briefs.user_id = auth user`) before streaming.
- V2 session service reuses active session for the same `(user_id, context_type='daily_brief', entity_id=brief_id)`.
- V2 context loader provides daily brief context with:
    - `brief_id`, `brief_date`, `executive_summary`, `priority_actions`, `generation_status`, `llm_analysis`, `metadata`
    - `project_briefs[]`
    - `mentioned_entities[]` (source: `ontology_brief_entities` first, markdown-link fallback second)
    - `mentioned_entity_counts`
- Prompt guardrails for ambiguity/out-of-brief caution are active in V2.

### UI Implementation Guidance

1. Routing and state

- Build/use a Brief Chat surface (modal/page) that always tracks active `brief_id`.
- Support deep links with `brief_id` directly; if only `date` is present, resolve to latest snapshot for that date (`created_at DESC`).
- Preserve previously viewed `brief_id` sessions in history; do not auto-archive old snapshots.

2. Chat pane wiring

- Reuse `AgentChatModal` internals but send:
    - `context_type: 'daily_brief'`
    - `entity_id: <active brief_id>`
- Keep `session_id` if already known; backend will canonicalize by `brief_id` anyway.

3. Brief pane data + mapping

- Load/render brief content from ontology snapshot (`ontology_daily_briefs`) plus `ontology_project_briefs`.
- Build actionable entity mapping from `ontology_brief_entities` first.
- Only parse markdown links for entity mapping when brief entities are missing.

4. Live reconciliation

- Prefer SSE `operation` events (with `entity_id`) to update/highlight brief items.
- Parse `tool_result` payloads only when explicit `operation` contract is missing.
- Update UI badges/strikethrough/date/assignee states when affected entity IDs are in brief mappings.

5. Regenerate flow

- “Generate New Brief” should switch active context to new snapshot (`new brief_id`) and start a fresh chat.
- Keep prior brief snapshots visible in history/background selector.

### Recommended UI Starting Points

- Chat shell/components: `apps/web/src/lib/components/agent/AgentChatModal.svelte`
- Existing brief display patterns: `apps/web/src/lib/components/briefs/DailyBriefModal.svelte`
- Dashboard brief loading behavior: `apps/web/src/lib/components/dashboard/DashboardBriefWidget.svelte`
- Project brief list endpoint (already user-scoped): `apps/web/src/routes/api/onto/projects/[id]/briefs/+server.ts`
- V2 stream endpoint contract: `apps/web/src/routes/api/agent/v2/stream/+server.ts`

### Suggested UI Acceptance Checklist

- Opening Brief Chat for same `brief_id` resumes same thread.
- Regenerating brief creates a new thread tied to new `brief_id`.
- Chat requests for brief context always hit `/api/agent/v2/stream`.
- Ambiguous out-of-brief edits trigger agent clarification behavior (not silent broad edits).
- Live updates reconcile primarily from `operation` events and correctly patch brief UI.
