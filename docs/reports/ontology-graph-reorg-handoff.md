<!-- docs/reports/ontology-graph-reorg-handoff.md -->

# Ontology Graph Reorg Handoff

This doc summarizes the new project-graph reorganization capability and the paired full-graph read tool. It includes behavior rules, payloads, endpoints, and files to review for audit/bugs.

## Goal

Provide an agent-facing, node-centric tool that can reorganize (reparent/relink) a subset of ontology entities using existing FSM/auto-organizer rules, with a dry-run preview.

## Implemented Direction

- Reorg is **node-centric**: each node lists desired connections.
- Reorg updates only **listed nodes**. No new entities are created.
- Containment is recomputed via resolver rules (same precedence + project fallback rules).
- Semantic edges are rebuilt based on connections, with a **replace_auto** default for auto-managed semantics.
- Parent→child reparenting only applies when the **child is explicitly listed**.
- Dry-run returns **edge diff** without writes.
- Apply uses a **transactional RPC** with optimistic checks to prevent partial writes.
- A paired read tool returns **full ProjectGraphData** payload for LLM planning.

## Core Behavior Rules

- **Scope**: Only nodes in `nodes[]` are mutated; all node ids must be in the project.
- **Containment**:
    - Containment parents are derived from connections.
    - Per-node `mode` controls pruning:
        - `replace` removes existing containment edges not in desired parents.
        - `merge` merges existing parents and desired parents, then still applies parent precedence rules.
    - Precedence follows current FSM/relationship-policy rules.
- **Child Reparenting**:
    - Parent→child containment only applied when the child is also listed in `nodes[]`.
    - Unlisted children are not reparented, even if referenced by a listed parent.
- **Semantic**:
    - Auto-managed semantic rels: `supports_goal`, `targets_milestone`, `references`, `produces`, `depends_on`.
    - `semantic_mode=replace_auto` replaces only auto-managed rels; other semantics are preserved.
    - `semantic_mode=merge` merges semantics without pruning.
    - `semantic_mode=preserve` skips semantic changes.
- **Documents**:
    - If a document node has **no connections**, existing references are preserved.
    - Document containment changes only apply for document→document `has_part`.
- **Project Fallback**:
    - Uses existing resolver rules (tasks disable project fallback when they have structural links).

## New API Endpoints

- **Reorg (write)**: `POST /api/onto/projects/[id]/reorganize`
    - File: `apps/web/src/routes/api/onto/projects/[id]/reorganize/+server.ts`
- **Full Graph (read)**: `GET /api/onto/projects/[id]/graph/full`
    - File: `apps/web/src/routes/api/onto/projects/[id]/graph/full/+server.ts`

## New Database RPC

- **Apply Reorg (transactional)**: `apply_graph_reorg_changes(project_id, deletes, updates, inserts)`
    - File: `supabase/migrations/20260308000000_add_graph_reorg_rpc.sql`

## Reorg Payload (Node-Centric)

```json
{
	"project_id": "uuid",
	"nodes": [
		{
			"id": "uuid",
			"kind": "task",
			"connections": [
				{ "kind": "plan", "id": "uuid" },
				{ "kind": "goal", "id": "uuid", "intent": "semantic", "rel": "supports_goal" }
			],
			"mode": "replace",
			"semantic_mode": "replace_auto",
			"allow_project_fallback": true,
			"allow_multi_parent": false
		}
	],
	"options": {
		"mode": "replace",
		"semantic_mode": "replace_auto",
		"allow_project_fallback": true,
		"allow_multi_parent": false,
		"dry_run": true
	}
}
```

### Reorg Response

- `dry_run: true` returns a diff:

```json
{
  "dry_run": true,
  "node_count": 2,
  "counts": { "create": 3, "delete": 1, "update": 0 },
  "changes": {
    "edges_to_create": [...],
    "edges_to_delete": [...],
    "edges_to_update": [...]
  }
}
```

## Full Graph Payload

The full graph tool returns `ProjectGraphData`:

- File: `apps/web/src/lib/services/ontology/project-graph-loader.ts`
- Includes: project, plans, tasks, goals, milestones, outputs, documents, requirements, metrics, sources, risks, decisions, edges.

## Agentic Tools (Read + Write)

- **Read tool**: `get_onto_project_graph`
    - Definition: `apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-read.ts`
    - Executor: `apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-read-executor.ts`
    - Dispatch: `apps/web/src/lib/services/agentic-chat/tools/core/tool-executor-refactored.ts`
    - Metadata + context wiring:
        - `apps/web/src/lib/services/agentic-chat/tools/core/definitions/tool-metadata.ts`
        - `apps/web/src/lib/services/agentic-chat/tools/core/tools.config.ts`

- **Write tool**: `reorganize_onto_project_graph`
    - Definition: `apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-write.ts`
    - Executor: `apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-write-executor.ts`
    - Dispatch + metadata wiring same as above.

## New Core Service

- Reorg planner/applier:
    - File: `apps/web/src/lib/services/ontology/graph-reorganizer.ts`
    - Responsibilities:
        - Plan edge diffs from node-centric payloads.
        - Respect containment precedence + project fallback rules.
        - Rebuild auto-managed semantics with replace_auto default.
        - Apply diff or return dry-run.

## Guidance for Auditors

Focus review areas:

- **Containment merge behavior**: merge still applies precedence, which can drop lower-priority parents.
- **Edge scope**: planning only loads edges with src_id or dst_id in listed nodes; verify this is sufficient for all delete/update scopes.
- **Document zero-connection rule**: semantic changes should be skipped for listed documents with no connections.
- **Child reparenting**: ensure unlisted children are not reparented.
- **Dry-run diff**: verify delete/update/create counts match planned changes.
- **Apply RPC**: check advisory lock + optimistic checks to ensure conflicts surface instead of partial writes.

## Implementation References

- Reorg service: `apps/web/src/lib/services/ontology/graph-reorganizer.ts`
- Reorg endpoint: `apps/web/src/routes/api/onto/projects/[id]/reorganize/+server.ts`
- Full graph endpoint: `apps/web/src/routes/api/onto/projects/[id]/graph/full/+server.ts`
- Apply RPC migration: `supabase/migrations/20260308000000_add_graph_reorg_rpc.sql`
- DB types: `packages/shared-types/src/database.types.ts`
- Agentic tool defs:
    - `apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-read.ts`
    - `apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-write.ts`
    - `apps/web/src/lib/services/agentic-chat/tools/core/definitions/tool-metadata.ts`
    - `apps/web/src/lib/services/agentic-chat/tools/core/tools.config.ts`
- Executors + dispatcher:
    - `apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-read-executor.ts`
    - `apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-write-executor.ts`
    - `apps/web/src/lib/services/agentic-chat/tools/core/tool-executor-refactored.ts`

## Code Review Findings (Senior Engineer Audit)

**Review Date:** 2026-01-08
**Reviewer:** Claude Opus 4.5
**Files Reviewed:** All implementation files listed in Implementation References

### Critical Issues

#### 1. Missing Transaction Wrapper in `applyGraphReorgPlan` (CRITICAL)

**Location:** `apps/web/src/lib/services/ontology/graph-reorganizer.ts` lines 340-360

**Issue:** The apply function performs three sequential database operations without a transaction:

```typescript
// 1. Delete edges
if (plan.delete.length > 0) {
	const { error: delErr } = await supabase.from('ontology_edges').delete().in('id', plan.delete);
}

// 2. Update edges
for (const upd of plan.update) {
	const { error: updErr } = await supabase
		.from('ontology_edges')
		.update({ props: upd.props })
		.eq('id', upd.id);
}

// 3. Insert edges
if (plan.create.length > 0) {
	const { error: insErr } = await supabase.from('ontology_edges').insert(plan.create);
}
```

**Risk:** If operation 2 or 3 fails after operation 1 succeeds, the graph will be left in an inconsistent state with edges deleted but not replaced. This is a data integrity issue.

**Status:** Resolved. Apply now uses `apply_graph_reorg_changes` RPC with a single transaction + advisory lock.

---

#### 2. Race Condition Between Plan and Apply Phases (MEDIUM)

**Location:** `apps/web/src/lib/services/ontology/graph-reorganizer.ts`

**Issue:** No optimistic locking exists between when the plan is computed and when it's applied. The workflow is:

1. Load current edges
2. Compute diff plan
3. Apply plan

If another process modifies edges between steps 1-2 and step 3, the apply will operate on stale data and may:

- Delete edges that were already modified
- Create duplicate edges
- Overwrite concurrent changes

**Status:** Resolved. The RPC enforces optimistic checks (expected props + endpoints) and returns a 409 conflict on mismatch.

---

### Low-Priority Issues

#### 3. `arePropsEqual` Strict Equality Bug (LOW)

**Location:** `apps/web/src/lib/services/ontology/graph-reorganizer.ts` line ~180

**Issue:** The function uses `===` for comparing values:

```typescript
function arePropsEqual(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
	// ...
	if (aVal !== bVal) return false; // This fails for nested objects
}
```

For nested objects, `{} !== {}` always returns `true` (different references), so identical nested objects will incorrectly trigger updates.

**Impact:** May cause unnecessary edge updates when props contain nested objects, but won't cause data corruption.

**Status:** Resolved. Deep comparison now handles nested objects/arrays.

---

### Verified Working ✓

The following behaviors were verified as correctly implemented:

1. **Document Zero-Connection Rule:** When a document node has no connections in the request, `semanticMode` is correctly set to `'preserve'` (line 145), preventing unwanted semantic edge deletion.

2. **Child Reparenting Scope:** Child reparenting only applies when the child is explicitly in the `nodes[]` array. The filter at line 225 correctly checks `nodeSet.has(c.child_id)`.

3. **Project Kind Rejection:** The endpoint correctly validates that `project` kind is not included in the nodes array (line 31 of reorganize endpoint).

4. **Edge Loading Scope:** The edge query correctly filters to edges where `src_id` OR `dst_id` is in the listed node IDs, ensuring all relevant edges are considered.

5. **Containment Precedence:** The resolver correctly applies FSM precedence rules via `relationship-resolver.ts` and `containment-organizer.ts`.

6. **Dry-Run Mode:** Returns computed diff without applying changes when `dry_run: true`.

---

### Architecture Assessment

**Strengths:**

- Clean separation between planning (`planGraphReorg`) and application (`applyGraphReorgPlan`)
- Node-centric API design simplifies agent reasoning
- Reuses existing FSM rules via resolver/organizer services
- Good use of TypeScript for payload validation
- Dry-run mode enables safe agent experimentation

**Areas for Improvement:**

- Transaction safety (see Critical Issue #1)
- Concurrency handling (see Medium Issue #2)
- Consider adding idempotency keys for apply operations
- Consider adding audit logging for graph mutations

---

### Recommended Tests

The following test cases should be added:

**Unit Tests (graph-reorganizer.ts):**

1. `planGraphReorg` returns correct create/delete/update counts
2. Document with zero connections preserves existing semantics
3. Child reparenting respects `nodes[]` scope
4. Containment precedence rules are applied
5. `merge` mode combines existing and desired parents
6. `replace_auto` only touches auto-managed semantic edges

**Integration Tests (API endpoints):**

1. Full reorganization flow with dry_run=true
2. Full reorganization flow with dry_run=false
3. Validation error when project kind in nodes
4. Authorization check for non-owner access
5. Concurrent modification handling (once implemented)

**Edge Cases:**

1. Empty nodes array (should be no-op)
2. Single node with self-referential connection attempt
3. Circular containment prevention
4. Large batch (100+ nodes) performance

---

## Testing Status

No automated tests were added or run for this change set.

**Recommendation:** Before production deployment, at minimum:

1. Fix Critical Issue #1 (transaction wrapper)
2. Add unit tests for core planning logic
3. Add integration test for happy-path reorganization
