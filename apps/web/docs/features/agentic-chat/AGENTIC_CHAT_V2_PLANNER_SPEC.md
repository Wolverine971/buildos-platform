<!-- apps/web/docs/features/agentic-chat/AGENTIC_CHAT_V2_PLANNER_SPEC.md -->

# Agentic Chat V2 — Planner + Executor Spec

**Status:** Draft (Design)  
**Owner:** BuildOS  
**Date:** 2026-02-05  
**Scope:** Planning, parallel/sequence orchestration, and executor coordination for agentic chat.

---

## 1. Purpose

This spec defines how the **planner** builds staged plans and how the **executor
coordinator** runs steps in sequence or parallel, with deterministic resolution
rules and event emission.

---

## 2. Goals

- Support **parallel + sequential** execution within a single plan.
- Provide **clear dependency resolution** (DAG-style).
- Keep orchestration **fast and predictable** (no deadlocks).
- Emit **structured events** for UI and auditability.

---

## 3. Non-Goals

- Full-blown workflow engine
- Long-term background jobs (out of scope for chat turn)
- Auto-retries beyond basic retry policy

---

## 4. Plan Structure (Stages + Dependencies)

```ts
type PlanStage = {
  id: string;
  name: string;
  mode: 'parallel' | 'sequence';
  steps: PlanStep[];
};

type PlanStep = {
  id: string;
  title: string;
  intent: 'research' | 'analysis' | 'draft' | 'edit' | 'create' | 'update' | 'review';
  executor: 'planner' | 'research' | 'writer' | 'editor' | 'tooling';
  tools?: string[];
  inputs?: string[];      // step IDs this step depends on
  outputs?: string[];     // produced artifact IDs
};

type AgentPlan = {
  id: string;
  goal: string;
  stages: PlanStage[];
  constraints?: string[];
};
```

**Rule:** Steps in the same stage can run in parallel unless dependencies are
explicitly declared in `inputs`.

---

## 5. Planner Responsibilities

The planner must:

1. Identify steps that **must be sequential** (outputs of earlier steps).
2. Identify steps that **can be parallel** (independent research, discovery).
3. Assign each step to an executor profile.
4. Minimize tools; gate tool calls with lightweight checks.

---

## 6. Execution Semantics

### 6.1 Orchestrator Rules

- Stages run **in order**.
- Within a stage:
  - `mode: parallel` → run steps concurrently (with concurrency cap)
  - `mode: sequence` → run steps in order
- A step is eligible to run only when **all `inputs` are complete**.

**Implementation note:** The runtime derives stages from `dependsOn` and annotates
each step with `metadata.stageId`, `metadata.stageIndex`, and `metadata.stageMode`
for UI + auditability.

### 6.2 Concurrency Controls

- Global cap per turn (default: **5** concurrent steps/executors).
- Per-tool cap to prevent overload (e.g., 1 web search at a time).

### 6.3 Failure Handling

- If a step fails:
  - mark step `failed`
  - propagate to dependent steps (skip or block)
  - emit `error` + `step_complete` with `status: failed`
- Planner may choose to regenerate a fallback step **within the same stage**.

---

## 7. Event Contract (Planner/Executor)

The planner/executor emits:

- `plan_created`
- `step_start`
- `step_complete`
- `executor_spawned`
- `executor_result`
- `tool_call`, `tool_result`
- `operation` (human-readable)

Each step should include:

```
{
  step_id: string,
  stage_id: string,
  status: "start" | "complete" | "failed",
  executor: string,
  output_refs?: string[]
}
```

---

## 8. Integration with Agent State

Planning updates agent state:

- Add expectations for each step (expected outputs).
- Update assumptions when a step result contradicts prior hypotheses.
- Record dependencies in `current_understanding.dependencies`.

Agent state **must** update asynchronously and never block execution.

---

## 9. Example Plan

Stage 1 (parallel research):
- Research market trends
- Research competitors
- Review user interviews

Stage 2 (sequence synthesis):
- Draft findings summary
- Draft spec
- Edit spec

---

## 10. Open Questions

**Decisions (2026-02-05):**

1. **Plan creation:** Only return a plan when explicitly requested.
2. **Failed steps:** Auto-spawn a fallback/retry when possible, using planner context.
3. **Parallel default:** Allow up to **5** parallel steps by default (tunable).
