<!-- docs/specs/BRIEF_CHAT_EXECUTION_PLAN.md -->

# Brief Chat Execution Plan

**Status:** In Progress  
**Owner:** Codex + DJ  
**Created:** 2026-02-14  
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
- [ ] Keep previous snapshots available in history views.

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

---

## 5) Open Decisions

- Confirm whether project team brief generation permission should include viewers or remain owner/editor only.
- Confirm whether project team brief snapshots should have a separate table family in V1 or be layered after current model stabilizes.

---

## 6) Next Up (Execution Order)

1. Build Brief Chat UI history/latest selection behavior using snapshot semantics (`brief_id` picker + date grouping).
2. Audit remaining ontology brief consumers for any date-scoped `.single()`/`.maybeSingle()` patterns and convert to latest-snapshot ordering.
3. Add a dedicated user-facing ontology brief history endpoint if existing pages cannot consume snapshot history cleanly.
