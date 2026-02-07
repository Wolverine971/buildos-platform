<!-- docs/specs/tree-agent/tree-agent-llm-orchestration-spec.md -->

# Tree Agent LLM Orchestration Spec

**Date:** 2026-01-27  
**Goal:** Replace the demo planner/executor flow in `apps/worker/src/workers/tree-agent/treeAgentWorker.ts` with a real LLM-driven recursive planner + executor + aggregator.

---

## 1) Outcomes We Want

1. Each node decides whether to execute directly or decompose into a plan.
2. Plans are expressed as **bands** (sequential across bands, parallel within a band).
3. Children return results in a strict envelope that points to JSON and/or documents.
4. Parents explicitly read child results, synthesize, and emit a new result.
5. The UI updates live via `tree_agent_events`.

---

## 2) High-Level Architecture

Tree Agent uses three LLM roles that share a common result contract:

1. **Planner** (per node): decide `execute` vs `plan`, and if `plan`, author bands + steps.
2. **Executor** (leaf node): perform work and produce artifacts/results.
3. **Aggregator** (parent after children complete): read child results and produce synthesis.

These are roles, not types. A node may run all three roles over its lifetime.

---

## 3) Contracts (LLM JSON Schemas)

### 3.1 Planner Output

Planner must always choose a mode and explain why:

```ts
type PlannerMode = 'execute' | 'plan';

type PlannerOutput = {
	mode: PlannerMode;
	modeReason: string;
	leafDecision?: {
		canExecuteDirectly: boolean;
		complexity: 'low' | 'medium' | 'high';
		blockers: string[];
	};
	plan?: {
		summary: string;
		bands: Array<{
			index: number;
			goal: string;
			parallelizable: boolean;
			steps: Array<{
				id: string;
				title: string;
				reason: string;
				successCriteria: string[];
				stepIndex: number;
			}>;
		}>;
	};
	scratchpad: {
		appendMarkdown: string;
		tailPreview: string;
	};
};
```

Rules:

1. If `mode = "plan"`, `plan.bands` must be present.
2. Bands must be indexed from `0..n-1`.
3. Step IDs must be stable if replanning the same node.
4. The scratchpad section is required every time.

### 3.2 Executor Output

Executor is responsible for returning artifacts and a result envelope:

```ts
type ExecutorOutput = {
	actions: Array<{
		kind: 'analysis' | 'tool_call' | 'document';
		note: string;
		toolName?: string;
		toolArgs?: Record<string, unknown>;
	}>;
	artifacts: Array<{
		type: 'document' | 'json';
		label: string;
		title?: string;
		documentMarkdown?: string;
		jsonPayload?: Record<string, unknown>;
		isPrimary?: boolean;
	}>;
	result: {
		kind: 'json' | 'document' | 'hybrid';
		summary: string;
		successAssessment?: { met: boolean; notes?: string };
		primaryArtifactLabel?: string;
		parentHint: {
			hintType: 'read_documents' | 'read_json';
			artifactLabels: string[];
		};
	};
	scratchpad: {
		appendMarkdown: string;
		tailPreview: string;
	};
};
```

Rules:

1. Executor must always produce `result`.
2. If any `artifacts.type = "document"`, it must include `title` and `documentMarkdown`.
3. `result.parentHint.artifactLabels` must reference artifacts defined above.

### 3.3 Aggregator Output

Aggregator runs after children complete:

```ts
type AggregatorOutput = {
	synthesis: {
		summary: string;
		keyFindings: string[];
		gaps: string[];
	};
	artifacts: Array<{
		type: 'document' | 'json';
		label: string;
		title?: string;
		documentMarkdown?: string;
		jsonPayload?: Record<string, unknown>;
		isPrimary?: boolean;
	}>;
	result: {
		kind: 'json' | 'document' | 'hybrid';
		summary: string;
		successAssessment?: { met: boolean; notes?: string };
		primaryArtifactLabel?: string;
		parentHint: {
			hintType: 'read_documents' | 'read_json';
			artifactLabels: string[];
		};
	};
	next: {
		shouldReplan: boolean;
		replanReason?: string;
	};
	scratchpad: {
		appendMarkdown: string;
		tailPreview: string;
	};
};
```

---

## 4) Runtime Algorithm (Recursive)

### 4.1 Core Shape

Implement a single recursive function:

```pseudo
runNode(runId, nodeId):
  node = load node
  scratchpadId = ensure scratchpad
  emit status(planning)

  planner = callPlannerLLM(node, context)
  append scratchpad(planner.scratchpad)

  if planner.mode == "execute":
    return runLeafExecutor(node)

  persist plan
  emit plan events

  allChildren = []
  for band in planner.plan.bands (ordered):
    emit band status(waiting/executing)
    children = create child nodes for band steps
    allChildren += children
    run children in parallel (with concurrency cap)

  emit status(aggregating)
  childResults = load child results + artifacts + docs
  aggregator = callAggregatorLLM(node, childResults)
  append scratchpad(aggregator.scratchpad)
  persist artifacts/result
  emit parent_hint + node_result + node_completed

  if aggregator.next.shouldReplan and budget allows:
    emit replan_requested
    return runNode(runId, nodeId)

  return result
```

### 4.2 Concurrency Rules

1. Bands execute sequentially.
2. Steps within a band execute in parallel.
3. Cap parallelism with a small limiter (for example, 2-4).

---

## 5) Context Assembly (What the LLM Sees)

### 5.1 Planner Context

Planner should receive:

1. Node identity: `title`, `reason`, `success_criteria`, `depth`.
2. Parent ask: derived from parent step + success criteria (if available).
3. Budgets: depth limit, max bands, max steps per band, time budget.
4. Scratchpad tail (last N chars).
5. Existing plan summary (latest `tree_agent_plans` for this node).
6. Child summaries (if replanning).

### 5.2 Executor Context (Leaf)

Executor should receive:

1. The node task + reason + success criteria.
2. Explicit deliverable request (document, JSON, or both).
3. Scratchpad tail.
4. Relevant parent hints and child artifacts (if any).

### 5.3 Aggregator Context

Aggregator should receive:

1. All child results (envelopes).
2. All child artifacts (including document IDs + titles).
3. Lightweight child doc summaries:
    - `title`
    - short snippet
    - document id

Parents should synthesize based on what children explicitly returned, not by guessing.

---

## 6) Persistence + Events Mapping

### 6.1 Planner

On planner output:

1. `tree.node_status` planning.
2. Append scratchpad + emit `tree.scratchpad_updated`.
3. If planning:
    - Insert `tree_agent_plans`.
    - Emit:
        - `tree.plan_created`
        - `tree.plan_band_created`
        - `tree.step_created` (per step)

### 6.2 Child Creation

For each step:

1. Insert `tree_agent_nodes`.
2. Emit:
    - `tree.node_created`
    - `tree.node_delegated`

### 6.3 Executor + Aggregator Results

For any node result:

1. Persist artifacts:
    - documents in `onto_documents`
    - rows in `tree_agent_artifacts`
2. Emit:
    - `tree.artifact_created` (per artifact)
    - `tree.parent_hint`
    - `tree.node_result`
    - `tree.node_completed`

---

## 7) Budgets + Guards (Stop Runaway Trees)

Add explicit guardrails:

1. `maxDepth` (for example, 4).
2. `maxBandsPerPlan` (for example, 3).
3. `maxStepsPerBand` (for example, 4).
4. `maxChildrenPerNode` (derived from bands \* steps).
5. `maxReplansPerNode` (for example, 1-2).

If a guard triggers:

1. Force `mode = "execute"`.
2. Emit a `tree.node_status` message like `guard:maxDepth`.

---

## 8) SmartLLMService Usage

Use the existing service in the worker:

1. Planner: `profile = "balanced"` (or `"powerful"` on root).
2. Executor: `profile = "fast"` or `"balanced"`.
3. Aggregator: `profile = "balanced"`.
4. Always enable parse repair:
    - `validation.retryOnParseError = true`
    - `validation.maxRetries = 2`

Also thread `onUsage` into run metrics once we add usage tracking to Tree Agent.

---

## 9) Minimal Implementation Plan (Code Changes)

Target file: `apps/worker/src/workers/tree-agent/treeAgentWorker.ts`

### Step A - Extract orchestration helpers

Add internal helpers:

1. `runNode(nodeId, options)`
2. `callPlannerLLM(node, context)`
3. `callExecutorLLM(node, context)`
4. `callAggregatorLLM(node, context)`
5. `persistArtifactsFromLLMOutput(...)`
6. `emitScratchpadUpdate(...)`

### Step B - Planner + bands

Replace the demo plan with:

1. Planner call.
2. Persisted bands + steps.
3. Child node creation from steps.

### Step C - Executor + aggregator

1. Implement leaf execution using the executor schema.
2. Implement aggregation using child results + doc summaries.
3. Add replan loop guarded by budgets.

---

## 10) Validation Checklist

1. Root planner emits `tree.plan_created` quickly (graph spiders early).
2. Child nodes appear with correct parent edges.
3. Each child emits `tree.node_result` before `tree.node_completed`.
4. Parent emits `tree.parent_hint` referencing child artifacts.
5. Root produces a synthesis document and primary artifact.
