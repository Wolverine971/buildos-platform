<!-- docs/specs/tree-agent/tree-agent-design-spec.md -->

# Tree Agent - Live Orchestration + Graph UI Spec

**Date:** 2026-01-27  
**Status:** Draft  
**Owner:** Agents + Homework

## Intent

Tree Agent is a recursive planner/executor system that is designed for **observability-first UX**. The orchestration model and the UI are tightly coupled through an event stream so users can see the tree/graph form in real time as planning, delegation, execution, and aggregation happen.

Key idea: the source of truth is an append-only event log; the UI derives the live graph from those events.

---

## Experience Goals

1. The graph "spiders out" from the root as soon as planning begins.
2. Every node clearly shows what it is doing now: planning, executing, delegating, waiting, aggregating, done, failed.
3. Every node has a scratchpad that can be opened to inspect live reasoning/context.
4. Updates feel continuous (streamed), not stepwise (polling snapshots).

---

## Conceptual Model

### Roles are States, Not Types

Each node can act as:

- a **planner** when it decomposes work, and
- an **executor** when it performs or aggregates work.

This avoids needing different entity types for planner/executor. Instead, role transitions are expressed as status updates and events.

### Tree Shape with Parallel Bands

Plans are expressed as ordered "bands" where each band can run in parallel:

```text
[ task1, task2, [task3, task4], task5 ]
```

- Bands run sequentially.
- Steps inside a band run in parallel.
- Delegation creates child nodes.

---

## System Architecture (Event-Sourced)

### High-Level Flow

1. Root node is created.
2. Root emits `plan_created` and `step_created` events.
3. Executors emit status and progress events.
4. Nodes emit `delegated` events when they create children.
5. Children run and emit their own events.
6. Parents emit `aggregated` and `completed` (or `replan_requested`) events.
7. UI subscribes to the event stream and incrementally updates graph state.

### Why Event-Sourced

- Real-time UX maps naturally to event streams.
- The graph is just a projection of the event log.
- It supports replay, time travel, and debugging.
- It avoids brittle "replace entire graph on every tick" behavior.

---

## Data Model (Dedicated Tree Agent Tables)

Tree Agent should not reuse homework tables. Treat it as its own product surface with its own event stream and projection tables.

### Core Tables

- `tree_agent_runs`
    - `id`, `user_id`, `objective`, `status`, `root_node_id`, `created_at`, `updated_at`

- `tree_agent_nodes`
    - One row = one agent node = one step.
    - `id`, `run_id`, `parent_node_id`, `title`, `reason`, `success_criteria jsonb`
    - `band_index`, `step_index`, `depth`
    - `status`, `role_state` (planner|executor), `scratchpad_doc_id`
    - `started_at`, `ended_at`, `created_at`, `updated_at`

- `tree_agent_plans`
    - Plan versions authored by a node.
    - `id`, `run_id`, `node_id`, `version`, `plan_json`, `created_at`

- `tree_agent_artifacts`
    - Structured outputs that nodes produce and pass upward.
    - `id`, `run_id`, `node_id`, `artifact_type` (document|json|summary|other)
    - `document_id null`, `json_payload jsonb null`, `is_primary boolean`
    - `label`, `created_at`

- `tree_agent_events`
    - Append-only source of truth.
    - `id`, `run_id`, `seq`, `node_id`, `event_type`, `payload jsonb`, `created_at`

### Scratchpads (Documents as First-Class State)

Scratchpads remain `onto_documents`, but must be tightly linked to nodes:

- `type_key = document.tree_agent.scratchpad` (preferred) or a homework scratchpad type.
- props:

```json
{
	"doc_role": "tree_agent_scratchpad",
	"tree_agent_run_id": "<run>",
	"tree_agent_node_id": "<node>",
	"parent_node_id": "<parent>",
	"depth": 2
}
```

Key rule: every node gets a scratchpad, and scratchpads are referenced both in `tree_agent_nodes.scratchpad_doc_id` and in events.

---

## Event Contract (Source of Truth)

### Minimal Node Identity

Each event should carry:

```ts
{
  runId: string;
  seq: number;
  nodeId: string;
  parentNodeId?: string;
  timestamp: string;
}
```

### Suggested Event Types

Events are small, frequent, and composable.

1. Node lifecycle

- `tree.node_created`
    - `{ nodeId, parentNodeId, title, depth, bandIndex, stepIndex }`
- `tree.node_status`
    - `{ nodeId, status, role, message?, progress? }`
- `tree.node_completed`
    - `{ nodeId, outcome, evidence?, metrics? }`
- `tree.node_failed`
    - `{ nodeId, error, retryable }`

2. Planning + bands + steps

- `tree.plan_created`
    - `{ nodeId, planId, version, summary? }`
- `tree.plan_band_created`
    - `{ nodeId, planId, bandIndex, stepIds[] }`
- `tree.step_created`
    - `{ nodeId, stepId, bandIndex, stepIndex, title, reason, successCriteria[] }`
- `tree.step_status`
    - `{ nodeId, stepId, status }`
- `tree.node_delegated`
    - `{ nodeId, childNodeId, stepId }`

3. Scratchpads + artifacts + result passing

- `tree.scratchpad_linked`
    - `{ nodeId, scratchpadDocId }`
- `tree.scratchpad_updated`
    - `{ nodeId, scratchpadDocId, tailPreview, updatedAt }`
- `tree.artifact_created`
    - `{ nodeId, artifactId, artifactType, documentId?, label? }`
- `tree.node_result`
    - `{ nodeId, result }` (see result contract below)
- `tree.parent_hint`
    - `{ nodeId, parentNodeId, hintType: "read_documents"|"read_json", artifactIds[], documentIds[] }`

4. Aggregation + replanning

- `tree.node_aggregated`
    - `{ nodeId, childIds[], summary, successAssessment }`
- `tree.replan_requested`
    - `{ nodeId, reason, basedOnChildIds[] }`

---

### Result Contract (Parent/Child Communication)

The most important contract in Tree Agent is how nodes return results. A node may return JSON, documents, or both. Parents should never guess; they should be told exactly what to read.

Suggested result envelope:

```ts
type TreeAgentResult = {
	kind: 'json' | 'document' | 'hybrid';
	summary: string;
	successAssessment?: { met: boolean; notes?: string };
	primaryArtifactId?: string;
	artifactIds: string[];
	documentIds: string[];
	jsonPayload?: Record<string, unknown>;
	scratchpadDocId?: string;
	scratchpadTail?: string;
};
```

Rules:

1. Every node emits `tree.node_result` before `tree.node_completed`.
2. Document outputs must be registered in `tree_agent_artifacts` and referenced via `artifactIds` and `documentIds`.
3. Parents should use the `tree.parent_hint` event to know what to read next.

This is what enables flows like: three executor nodes each create a document, and the planner node explicitly reads those three documents and produces a synthesis document.

---

## Execution Heuristics (When Recursion Stops)

Executors should stop decomposing (become leaves) when:

1. The task is small enough to execute directly.
2. Success criteria are locally testable.
3. Delegation budget is exhausted (depth, time, or token budget).
4. The node is already at max depth.

Make this explicit in events so the UI can show why a node stayed a leaf:

- `tree.node_status { status: "executing", role: "executor", message: "leaf_decision:direct" }`

---

## UI Architecture - Live Graph Projection

### Principle: Projection Store + Incremental Graph Updates

Do not rebuild the entire graph on each update. Instead:

1. Maintain a `TreeAgentGraphStore` that:
    - holds node/edge maps,
    - applies events incrementally,
    - tracks per-node status/role/scratchpad.
2. Feed the store into a graph component that can update nodes/edges in place.

### Suggested Frontend Pieces

1. Realtime subscription service

- `TreeAgentRealtimeService`
    - Subscribes to `tree_agent_events` via Supabase realtime.
    - Filters to `tree.*` events.
    - Emits normalized events to the store (or event bus).

2. Projection store

- `treeAgentGraph.store.ts`
    - `applyEvent(event)`
    - `applyEvents(events[])`
    - derived selectors: `nodes`, `edges`, `activeNodeIds`, `stats`

3. Graph view

- `TreeAgentGraph.svelte`
    - Can be a wrapper around Cytoscape.
    - Uses store deltas to update Cytoscape incrementally:
        - add node
        - update node data + classes
        - add edge
        - relayout selectively (or debounced).

---

## Reusing OntologyGraph vs Bespoke Graph

### What OntologyGraph already does well

- Cytoscape setup + layout plugins.
- Styling system and dark mode handling.
- Good base for graph rendering.

### Gaps for live Tree Agent

Current `OntologyGraph.svelte`:

- Replaces all elements on each change.
- Has no notion of streaming events or partial updates.
- Uses ontology type/state semantics, not agent semantics.

### Recommendation

Build a Tree Agent specific graph component that borrows patterns but changes the update model.

Two viable approaches:

1. **Fastest path (adapter on top of OntologyGraph)**
    - Keep OntologyGraph but drive it with a projection that only changes occasionally.
    - Accept full rebuilds early; add debouncing (e.g., 300-600ms) to reduce thrash.

2. **Better path (bespoke TreeAgentGraph)**
    - Copy the Cytoscape bootstrap patterns.
    - Replace the `$effect` full rebuild with incremental updates:
        - `cy.getElementById(id).data(nextData)`
        - `cy.add(...)` only for new elements
        - relayout on a debounce window

Given the "spider out live" requirement, approach (2) will feel meaningfully better.

---

## Supabase Realtime Strategy (Pub/Sub That Scales)

Use Supabase Realtime as the transport layer, but prefer Broadcast over raw Postgres Changes for the event stream.

Supabase recommends Broadcast as the more scalable and secure option for database-driven realtime updates. Postgres Changes are simpler but have scaling and throughput limitations, especially with many subscribers and RLS checks.

### Recommended Pattern

1. `tree_agent_events` is the source of truth.
2. A database trigger broadcasts new events to a run-scoped channel.
3. Clients subscribe to that channel and apply events incrementally.

Supabase provides database helpers for this:

- `realtime.broadcast_changes(...)` for structured change broadcasts.
- `realtime.send(...)` for custom payload broadcasts.

Realtime Broadcast messages are transported via Supabase Realtime channels over websockets.

### Channel Topology

- Topic: `tree-agent:run:<runId>`
- Private channel recommended.
- Optional secondary topics:
    - `tree-agent:node:<nodeId>` for node detail panels.
    - `tree-agent:docs:<runId>` for scratchpad/doc hints.

---

## Node Semantics for Visualization

Treat visualization as a contract, not just styling.

### Node Type

Use a single type: `agent_node`, and encode semantics in:

- `status`
- `role`
- `depth`
- `bandIndex`
- `stepIndex`

### Suggested Status Values

Keep the set small and meaningful:

- `planning`
- `delegating`
- `executing`
- `waiting`
- `aggregating`
- `completed`
- `failed`
- `blocked`

### Visual Encoding Suggestions

- Shape: consistent to reduce cognitive load (e.g., rounded rectangle).
- Border style:
    - dashed = planning/delegating
    - solid = executing/aggregating
- Color:
    - warm/active for planning/executing
    - cool/idle for waiting
    - green for completed
    - red for failed
- Badges/overlays:
    - role badge: `P` (planner) / `E` (executor)
    - live pulse while active
    - small band index tag

---

## Scratchpads at Every Node

### Requirements

Each node should have a scratchpad document that:

1. Captures context + reasoning + notes.
2. Can be opened from the node.
3. Streams updates (or at least updates frequently enough to feel live).
4. Serves as a durable artifact that can be explicitly referenced by parent nodes.

### Scratchpads + Artifacts + Results (Critical Flow)

Scratchpads are not just logs; they are part of the communication protocol:

1. A planner delegates a step to a child node.
2. The child writes working state to its scratchpad.
3. The child may create one or more artifact documents.
4. The child emits:
    - `tree.artifact_created` for each artifact document.
    - `tree.node_result` with explicit document IDs / artifact IDs.
    - `tree.parent_hint` telling the parent what to read.
5. The parent reads the referenced documents and/or JSON payloads.
6. The parent writes a synthesis document and emits its own result.

This flow must be encoded in both the events and the prompts so that nodes reliably "return what was asked for."

### Hybrid Update Strategy (Documents + Meta Events)

Use both:

1. Document updates for the actual scratchpad/artifact content.
2. Tree Agent meta-events that tell parents and the UI what to read.

Recommendation:

- Broadcast `tree_agent_events` for the orchestration stream (primary).
- Use document realtime (or light polling) for scratchpad bodies, and pair it with `tree.scratchpad_updated` / `tree.parent_hint` so parents do not need to guess which documents changed.

### Storage Pattern

Continue using `onto_documents`:

- `type_key = document.tree_agent.scratchpad` (preferred)
- props:

```json
{
	"doc_role": "tree_agent_scratchpad",
	"tree_agent_run_id": "<run>",
	"tree_agent_node_id": "<node>",
	"parent_node_id": "<parent>",
	"depth": 2
}
```

Link scratchpads to the node tree through:

- event fields (`scratchpadDocId`), and/or
- `onto_edges` such as `document_has_document`.

### UI Pattern

On node selection:

1. Show a side panel with:
    - current status + role
    - step details (reason + success criteria)
    - recent events timeline for that node
    - scratchpad preview + "Open"
2. Allow switching between graph and scratchpad quickly.

---

## Pseudocode - End-to-End Wiring

### Backend (event emission)

```pseudo
function emit(runId, nodeId, type, payload):
  seq = next_seq(runId)
  insert tree_agent_events { run_id: runId, seq, node_id: nodeId, event_type: type, payload }

function create_node(runId, parentNodeId, step):
  nodeId = uuid()
  emit(runId, nodeId, "tree.node_created", { parentNodeId, step })
  scratchpadId = ensure_scratchpad(runId, nodeId, parentNodeId)
  emit(runId, nodeId, "tree.scratchpad_linked", { scratchpadId })
  return nodeId

function run_node(runId, nodeId, task):
  emit(runId, nodeId, "tree.node_status", { status: "planning", role: "planner" })
  plan = maybe_make_plan(task)
  if plan is null:
    emit(runId, nodeId, "tree.node_status", { status: "executing", role: "executor" })
    result = execute(task)
    artifactIds = persist_artifacts(runId, nodeId, result)
    emit(runId, nodeId, "tree.node_result", { result: to_result_envelope(result, artifactIds) })
    emit(runId, nodeId, "tree.node_completed", { outcome: "success" })
    return result
  else:
    planId = persist_plan(runId, nodeId, plan)
    emit(runId, nodeId, "tree.plan_created", { planId, version: plan.version })
    allChildren = []
    for band in plan.bands:
      emit(runId, nodeId, "tree.plan_band_created", { planId, bandIndex: band.index, stepIds: band.stepIds })
      childPairs = parallel_map(band.steps, step => ({ step, childId: create_node(runId, nodeId, step) }))
      allChildren = allChildren.concat(childPairs.map(p => p.childId))
      parallel_map(childPairs, p => run_node(runId, p.childId, p.step.task))
    emit(runId, nodeId, "tree.node_status", { status: "aggregating", role: "executor" })
    childResults = load_child_results(allChildren)
    summaryDocId = synthesize_document(runId, nodeId, childResults)
    summaryArtifactId = persist_artifact(runId, nodeId, "document", summaryDocId, true)
    emit(runId, nodeId, "tree.node_result", {
      result: {
        kind: "document",
        summary: "Synthesis complete",
        primaryArtifactId: summaryArtifactId,
        artifactIds: [summaryArtifactId],
        documentIds: [summaryDocId]
      }
    })
    emit(runId, nodeId, "tree.node_completed", { outcome: "success" })
    return summaryDocId
```

### Frontend (projection + graph updates)

```pseudo
realtime.onEvent(event => store.applyEvent(event))

store.applyEvent(event):
  switch event.type:
    case "tree.node_created":
      upsertNode(event.nodeId, { parentId, title, status: "planning" })
      upsertEdge(parentId -> nodeId)
    case "tree.node_status":
      patchNode(event.nodeId, { status, role, message })
    case "tree.scratchpad_linked":
      patchNode(event.nodeId, { scratchpadDocId })
    case "tree.node_completed":
      patchNode(event.nodeId, { status: "completed", outcome })

graph.applyDelta(delta):
  for node in delta.newNodes: cy.add(node)
  for node in delta.updatedNodes: cy.get(node.id).data(node.data)
  for edge in delta.newEdges: cy.add(edge)
  debouncedRelayout()
```

---

## Implementation Plan (Phased)

### Phase 1 - Tables + Event Schema + Result Contract

1. Create dedicated tables: `tree_agent_runs`, `tree_agent_nodes`, `tree_agent_plans`, `tree_agent_artifacts`, `tree_agent_events`.
2. Finalize `tree.*` event types and the result envelope.
3. Build `TreeAgentGraphStore` that can apply events.
4. Keep polling as a fallback, but derive graph from events locally.

### Phase 2 - Realtime Streaming via Broadcast

1. Add a trigger that broadcasts inserts on `tree_agent_events` to `tree-agent:run:<runId>`.
2. Subscribe clients to broadcast channels (private).
3. Normalize and apply only `tree.*` events.
4. Add debounced relayout and incremental updates.

### Phase 3 - Scratchpads + Node Panel + Doc Flow

1. Ensure every node has a scratchpad doc.
2. Implement artifact docs + `tree.node_result` + `tree.parent_hint`.
3. Show scratchpad and artifact previews per node.
4. Add node detail panel with live timeline + scratchpad.

---

## Feedback on Your Plan (What I Agree With / Adjust)

### Strong parts

- The recursive role flip (planner <-> executor) is the right mental model.
- Visualizing delegation as a graph is exactly the right UX for trust.
- Scratchpads per node is the right abstraction for inspectability.

### Important adjustments

1. Make the event stream the first-class contract.

Without this, "live updates" devolve into polling snapshots and full graph rebuilds. If we treat events as the product, everything else becomes a projection.

2. Prefer "bands" over raw nested arrays in storage.

Instead of `[task1, [task2, task3]]`, store:

```json
{
  "bands": [
    { "index": 0, "steps": [...] },
    { "index": 1, "steps": [...] }
  ]
}
```

This makes parallelism explicit and simpler to render.

3. Treat documents as part of the result protocol.

Executor nodes must return results in an explicit envelope that points to JSON payloads and/or artifact documents. Parents should read only what children reference via `tree.node_result` and `tree.parent_hint`.

4. Plan for relayout thrash early.

Live graphs will relayout constantly unless relayout is:

- debounced,
- incremental, or
- constrained (e.g., by depth bands).

---

## Open Questions to Resolve Next

1. Do we store `success_criteria` as markdown, JSON, or both?
2. How strict should the result envelope validation be at runtime?
3. What is the relayout policy: time-based debounce, node-count threshold, or both?

---

## Related Docs

- `docs/tree-agent-llm-orchestration-spec.md`
