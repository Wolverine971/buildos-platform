<!-- apps/web/docs/technical/issues/AGENTIC_CHAT_FLOW_AUDIT.md -->

# Agentic Chat Flow Audit

> **Created**: 2025-12-20
> **Status**: Active - Requires Resolution
> **Priority**: High (several flow-breaking issues in plan lifecycle and metadata)

## Executive Summary

The agentic chat flow is functional end-to-end, but the plan lifecycle, session metadata propagation, and executor bookkeeping have multiple correctness gaps. The most severe issues are:

1. **Plan status enum drift** between internal types and database enums, which breaks draft/review flows and can force plan execution into a failed state.
2. **Context shift persistence** uses the wrong session identifier/table, so shifts are not reliably stored.
3. **Project creation clarification metadata** is computed but never persisted, causing lost multi-round context.

Secondary issues include missing completion timestamps on failures, lack of step-level "executing" state, non-parallel execution despite grouping logic, and inconsistent token accounting.

---

## Issue 1: Plan Status Enum Drift (DB Rejects Status Updates)

### Affected Files

- `apps/web/src/lib/services/agentic-chat/planning/plan-orchestrator.ts`
- `apps/web/src/routes/api/agent/stream/utils/event-mapper.ts`
- `packages/shared-types/src/agent.types.ts`
- `packages/shared-types/src/database.types.ts`

### Symptoms

- Draft/review flow fails when persisting plan status.
- Plans with partial failures flip to `failed` even when some steps completed.
- SSE payloads may contain status values not allowed by shared types.

### Root Cause

Internal plan statuses include values not present in the database enum:

- Internal: `pending_review`, `completed_with_errors`
- DB enum: `pending`, `executing`, `completed`, `failed`

`persistDraft()` and `executePlan()` write invalid status values to `agent_plans`, which causes update failures and triggers the outer error handler.

### Recommended Fix

- **Option A (lowest impact):** Map internal statuses to DB-safe values and store extra state in `metadata`.
  - `pending_review` -> `pending` + `metadata.review_status = 'pending_review'`
  - `completed_with_errors` -> `completed` + `metadata.has_errors = true`
- **Option B:** Extend DB enum (requires migration and broader type updates).

---

## Issue 2: Context Shift Persistence Targets the Wrong Table

### Affected Files

- `apps/web/src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts`
- `apps/web/src/lib/services/agentic-chat/persistence/agent-persistence-service.ts`
- `apps/web/src/routes/api/agent/stream/services/session-manager.ts`

### Symptoms

- Context shifts sometimes fail to persist (warnings logged).
- Context shift updates can silently fail because no `agent_chat_sessions` row exists for the planner.

### Root Cause

`AgentChatOrchestrator` calls:

```ts
await persistenceService.updateChatSession(serviceContext.sessionId, ...)
```

`serviceContext.sessionId` is the **user chat session** (`chat_sessions.id`), but `updateChatSession` writes to **agent_chat_sessions**. The planner never creates an `agent_chat_sessions` row, so the update targets a non-existent ID.

### Recommended Fix

- **Option A:** Update `chat_sessions` for planner context shifts via `SessionManager`/`ChatSessionService`.
- **Option B:** Create a planner `agent_chat_sessions` record and track its ID separately.

---

## Issue 3: Project Creation Clarification Metadata Is Dropped

### Affected Files

- `apps/web/src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts`
- `apps/web/src/routes/api/agent/stream/services/stream-handler.ts`

### Symptoms

- Clarifying questions do not accumulate prior user responses or context.
- Subsequent rounds may re-ask questions or ignore prior answers.

### Root Cause

`checkProjectCreationClarification()` builds `updatedMetadata` but the caller ignores it and emits no metadata-bearing event. The stream handler only appends questions, leaving `accumulatedContext` and `previousResponses` unchanged.

### Recommended Fix

- Emit a new event containing `updatedMetadata`, or include it in `clarifying_questions`.
- Update session metadata with `accumulatedContext` and `previousResponses` on every clarification round.

---

## Issue 4: Executor Failures Do Not Record Completion Time

### Affected Files

- `apps/web/src/lib/services/agentic-chat/execution/executor-coordinator.ts`

### Symptoms

- Failed executor runs show `status = failed` without `completed_at`.
- Admin analytics and operational timelines under-report failed run completion.

### Root Cause

On failure, `updateExecutorStatus(..., false)` omits `completed_at` even though the run ended.

### Recommended Fix

- Always set `completed_at` for both success and failure.
- Remove the `hasFinalStatus` flag or default it to `true` on error paths.

---

## Issue 5: Plan Execution Is Sequential Despite Parallel Grouping

### Affected Files

- `apps/web/src/lib/services/agentic-chat/planning/plan-orchestrator.ts`

### Symptoms

- Execution groups are logged but steps within a group still execute sequentially.
- User-facing timelines are longer than expected for parallelizable plans.

### Root Cause

`getParallelExecutionGroups()` computes groups, but `executePlan()` loops each step in sequence. No concurrency is used.

### Recommended Fix

- Use `Promise.all` or a controlled concurrency pool for each group.
- Preserve ordering of stream events (emit per-step start/complete in deterministic order).

---

## Issue 6: Step Status Never Transitions to `executing`

### Affected Files

- `apps/web/src/lib/services/agentic-chat/planning/plan-orchestrator.ts`

### Symptoms

- UI cannot show in-progress step state.
- If a step crashes mid-run, DB still shows `pending`.

### Root Cause

`executePlan()` updates step status only on completion/failure. It never sets `executing` or persists that state.

### Recommended Fix

- Set `step.status = 'executing'` before running and persist with `updatePlanStep`.
- Consider adding `started_at` in `metadata` for auditability.

---

## Issue 7: Project Creation Plan Enforcement Happens After Persistence

### Affected Files

- `apps/web/src/lib/services/agentic-chat/planning/plan-orchestrator.ts`

### Symptoms

- Invalid project_create plans can be saved (missing `create_onto_project`).
- Failed enforcement leaves orphaned plan records in `agent_plans`.

### Root Cause

`createPlanFromIntent()` persists the plan before calling `enforceProjectCreationPlan()`.

### Recommended Fix

- Enforce requirements before persistence.
- If enforcement fails after persistence, delete or mark the plan as failed with error metadata.

---

## Issue 8: Token Usage and Session Metrics Are Under-Reported

### Affected Files

- `apps/web/src/lib/services/agentic-chat/planning/plan-orchestrator.ts`
- `apps/web/src/lib/services/agentic-chat/synthesis/response-synthesizer.ts`
- `apps/web/src/routes/api/agent/stream/services/stream-handler.ts`

### Symptoms

- Plan execution `totalTokensUsed` is always `0`.
- Streaming responses use character length as token count.

### Root Cause

Token usage is not propagated from executor/tool layers into plan metadata. Streaming fallback uses a character-length heuristic.

### Recommended Fix

- Thread `tokensUsed` from executor/tool layers into plan metadata.
- Emit usage in `StreamEvent.done` consistently from all synthesis paths.

---

## Issue 9: Executor Permissions Are Read/Write by Default

### Affected Files

- `apps/web/src/lib/services/agentic-chat/execution/executor-coordinator.ts`
- `packages/shared-types/src/agent.types.ts`

### Symptoms

- Executors are created with `permissions = read_write` even though the model describes executors as read-only.

### Root Cause

`ExecutorCoordinator` uses `getToolsForAgent(..., 'read_write')` and persists `permissions: 'read_write'`.

### Recommended Fix

- Default executor permission to `read_only` and enforce tool filtering.
- Allow explicit elevation only when a step is explicitly flagged as requiring write access.

---

## Recommended Fix Priority

| Priority | Issue | Effort | Impact |
| -------- | ----- | ------ | ------ |
| 1 | Plan status enum drift | Low | Blocks draft/review + causes execution failure |
| 2 | Context shift persistence target | Medium | Prevents context recovery and auditability |
| 3 | Clarification metadata drop | Medium | Breaks multi-round project creation flow |
| 4 | Executor completion timestamps | Low | Fixes audit/metrics integrity |
| 5 | Step executing status | Low | Enables accurate UI and recovery |
| 6 | Project creation enforcement ordering | Low | Prevents invalid plans from persisting |
| 7 | Parallel execution gap | Medium | Improves performance and user experience |
| 8 | Token/usage reporting | Medium | Improves analytics accuracy |
| 9 | Executor permission mismatch | Medium | Aligns with least-privilege design |

---

## Implementation Checklist

### Phase 1: Critical Flow Fixes

- [x] Map internal plan statuses to DB-safe values before persistence
- [x] Persist context shifts in `chat_sessions` or create planner `agent_chat_sessions`
- [x] Persist clarification metadata (accumulated context + responses)

### Phase 2: Execution Correctness

- [ ] Record `completed_at` for failed executor runs
- [ ] Persist `executing` state for steps
- [ ] Enforce project_create requirements before insert

### Phase 3: Performance + Observability

- [ ] Execute parallel step groups concurrently
- [ ] Propagate token usage through plan and synthesis
- [ ] Align executor permissions with read-only default

---

## Related Files

- `apps/web/src/lib/services/agentic-chat/orchestration/agent-chat-orchestrator.ts`
- `apps/web/src/lib/services/agentic-chat/planning/plan-orchestrator.ts`
- `apps/web/src/lib/services/agentic-chat/execution/executor-coordinator.ts`
- `apps/web/src/lib/services/agentic-chat/persistence/agent-persistence-service.ts`
- `apps/web/src/routes/api/agent/stream/services/stream-handler.ts`
- `apps/web/src/routes/api/agent/stream/utils/event-mapper.ts`
- `packages/shared-types/src/agent.types.ts`
- `packages/shared-types/src/database.types.ts`
