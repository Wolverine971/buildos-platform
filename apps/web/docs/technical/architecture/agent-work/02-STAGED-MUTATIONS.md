<!-- apps/web/docs/technical/architecture/agent-work/02-STAGED-MUTATIONS.md -->

# Agent Work — 02 Staged Mutations (Optional Review-Before-Commit)

**Status:** ✅ **SHIPPED 2026-06-19** (design 2026-06-15) · Part of the [Agent Work](./00-OVERVIEW.md) doc set. Pickup: [HANDOFF_2026-06-19](./HANDOFF_2026-06-19.md) §3.

An **opt-in** trust subsystem. Staging is **off by default** — runs mutate the user's data directly, exactly like the chat does today. When a caller asks for it (a `review` flag), the run instead produces a reviewable **Change Set** and waits for approval before anything lands.

> **Implementation map (2026-06-19):**
>
> - Stage path: `packages/shared-agent-ops/src/gateway/op-execution-gateway.ts` (`stageGatewayWriteOp`) + `op-execution.ts` (`AgentOpContext.mutationMode`, `executeWriteOp` stage branch).
> - Runner: `apps/worker/src/workers/agent-run/agentRunWorker.ts` (derives `mutationMode` from `review_required`, accumulates changes, finalizes `proposal_ready` + persists `agent_runs.change_set`).
> - Commit: `packages/shared-agent-ops/src/gateway/change-set.ts` (`commitChangeSet`) + `POST /api/agent-runs/[id]/commit`.
> - UI: `apps/web/.../notifications/types/agent-run/ChangeSetReview.svelte` (in the run modal + Work Panel detail).
> - Chat (approval flow #2): `delegate_task` `review` flag + `commit_change_set` tool (`UtilityExecutor.commitChangeSet`).
> - Coverage guard: `apps/worker/tests/changeSetCoverage.test.ts`.
>
> **Not yet implemented from this spec:** full **calendar** staging for external side effects and **auto-approve Operative policy** (approval flow #3 — Phase 6).
>
> **Implemented after initial ship:** commit-time **staleness/drift detection** now re-fetches known ontology rows for staged update/delete changes and fails stale changes instead of blindly applying `after`.

> **Default = direct commit.** Review-before-commit is a capability you turn on, not overhead you manage on every run.

---

## 1. Design stance: staging is opt-in

The earlier version of this doc gated _all_ mutating runs behind review. That's too much overhead for the common case — most runs are dispatched by a supervising human (or the chat orchestrator) who wants the work _done_, not queued for a second approval step.

So the model is inverted:

- **Default (`mutationMode: 'commit'`):** writes apply immediately. `entities_touched` is the receipt. Same trust posture as the chat today — the user (or supervisor) chose to run the agent, so it acts.
- **Opt-in (`mutationMode: 'stage'`):** the caller passes `review: true` on the brief. Writes are **staged into a Change Set** and committed atomically only after approval. Reads/external work are never staged regardless.

**When you'd turn review on:**

- You want to inspect a risky or large mutation before it lands ("restructure my whole project").
- An unsupervised/scheduled run will execute while you're away and you want a diff waiting for you, not a fait accompli.
- The supervisor agent decides a run's blast radius warrants a human check and sets `review: true` when it dispatches.

This is still dead-on for BuildOS positioning ("lead with relief") _when enabled_: _the system did the structuring work; here's the diff; approve it._ But it's a tool the user reaches for, not a tax on every run.

Review mode does **not** bypass tool policy. A run still needs `scope_mode='read_write'` and an `allowed_ops` set that includes the write op it is trying to stage. `read_only` runs cannot create proposals for writes.

---

## 2. Change Set model

```ts
interface ChangeSet {
	run_id: string;
	status: 'pending' | 'partially_applied' | 'applied' | 'rejected';
	changes: ProposedChange[];
	created_at: string;
}

interface ProposedChange {
	id: string; // stable id for per-change approve/reject
	op: string; // registry op, e.g. 'onto.task.update'
	entity_type: 'task' | 'project' | 'document' | 'goal' | 'plan' | 'calendar_event' | string;
	entity_id?: string; // present for update/delete; absent for create
	action: 'create' | 'update' | 'delete';
	before?: Record<string, unknown>; // current state (for update/delete) — for the diff UI
	after?: Record<string, unknown>; // proposed state / draft payload
	rationale: string; // why the agent proposes this
	decision?: 'approved' | 'rejected' | 'pending';
	applied_entity_id?: string; // filled on commit (esp. for creates)
	error?: string; // filled if this change failed to apply
}
```

Stored in `agent_runs.change_set` (jsonb). A run that proposes changes ends with `status='proposal_ready'`.

---

## 3. How a run stages instead of mutates (only when review is on)

Write tools gain a **stage mode** that is engaged only when the run's `mutationMode === 'stage'`. The cleanest seam is the worker-safe Agent Run tool adapter described in 01, backed by the ontology-write/calendar executors. Do not add staging as scattered one-off branches in individual API routes.

- `RunContext` carries `mutationMode: 'commit' | 'stage'`, derived from the brief's `review` flag (see §3a).
- In `commit` mode (default), write ops execute normally — no Change Set, no extra path.
- In `stage` mode, a stage-supported write op **does not perform the DB/external mutation.** It validates inputs, computes `before` (fetch current state) and `after` (the would-be payload), and appends a `ProposedChange` to the run's Change Set.
- Calendar writes are **not** stage-supported in v1. Review-mode runs may read calendar context when a `CalendarPort` is available, but `cal.event.create/update/delete` and `cal.project.set` are hidden from the tool catalog and rejected if called directly.
- The tool returns a synthetic success result (so the LLM's loop continues naturally) carrying the proposed-change id — which also flows into run-aware telemetry, so `entities_touched` vs `proposed_changes` stay consistent.

This keeps the LLM unaware of commit-vs-stage; the agent just "does the work," and the substrate decides whether that work lands now or after review.

### 3a. Where the `review` flag comes from

`review: boolean` (default `false`) is part of the dispatch brief (see 01). It maps to `agent_runs.review_required` and resolves `mutationMode`:

| Trigger                | How `review` is set                                                                                                                                                   | Default                    |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| **chat**               | Orchestrator passes `review` on `delegate_task` when it judges the blast radius warrants a check; the user can also ask ("let me review before you change anything"). | `false`                    |
| **manual**             | A "Review changes before applying" toggle on the dispatch form.                                                                                                       | `false`                    |
| **scheduled**          | Saved on the schedule/Operative definition. **Recommended `true`** for unsupervised runs, but not forced.                                                             | `false` (UI nudges `true`) |
| **Operative (future)** | Per saved policy.                                                                                                                                                     | per policy                 |

> No `review` → no Change Set machinery runs at all. A read-only/research run never stages regardless of the flag (nothing to stage).

If `review=true` but the run's scope is read-only, the dispatch endpoint should reject the brief up front or downgrade it to a read-only research run with a clear status message. Silent downgrade is not acceptable.

---

## 4. Approval flows

A Change Set can be approved three ways — all funnel through one commit endpoint:

1. **Human in the Work Panel** — reviews the diff, approves/rejects per change or whole, hits Apply. (Primary; see 03.)
2. **Orchestrator in chat** — when supervising, the orchestrator can present the proposal inline and, on the user's "yes," call a `commit_change_set(run_id, decisions)` tool. Keeps the human in the loop conversationally.
3. **Auto-approve policy** — a trusted Operative with `commit` policy applies immediately (still recorded as a Change Set for audit/reversal).

---

## 5. Commit

A single server-side `commitChangeSet(run_id, decisions)`:

1. Loads the Change Set; filters to `approved` changes.
2. For staged update/delete changes on known ontology tables, re-fetches the current row and compares it to the reviewed `before` snapshot. A mismatch marks that change stale and skips it.
3. Applies each approved fresh change via the **same worker-safe adapter/executors** used in `commit` mode (so there's one mutation path, not two), inside a logical transaction where possible.
4. Records `applied_entity_id` per change; promotes applied changes into the run's `entities_touched` with project/title/url metadata for the run detail and completion message.
5. Sets Change Set `status` → `applied` / `partially_applied`; updates `agent_runs.status` → `completed` or `partial`.
6. **Partial failure:** a failed change records `error` and does not roll back already-applied siblings unless they're declared dependent; the user sees exactly what landed. (Atomicity granularity is an open question — start per-change with clear reporting.)

---

## 6. Audit & reversal

- The Change Set is retained on the run forever → full audit of what was proposed vs applied vs rejected.
- `before` snapshots make **reversal** feasible (a future "undo this run" that re-applies `before`), though true reversal is out of scope for v1.

---

## 7. Open questions

- **Atomicity:** per-change vs whole-set transaction. Cross-entity dependencies (create project → create tasks in it) need ordering + dependency hints in `ProposedChange`.
- **Staleness beyond core ontology rows:** commit now detects drift for known ontology update/delete rows. Future work should decide how to represent drift for relationships, cross-entity dependencies, and external resources.
- **Coverage:** every write executor must support `stage` mode and emit a faithful `before`/`after`, or be explicitly unavailable in review mode. Same registry-coverage concern as `entities_touched` (01 §5). Keep tests that every op in `BUILDOS_AGENT_WRITE_OPS` is either stage-supported or explicitly categorized.
- **Calendar/external side effects:** Google Calendar writes aren't pure DB ops. V1 blocks them in review mode rather than committing behind the review UI. Full staging needs a dry-run external intent, idempotent commit replay, and clear conflict handling if the Google event/calendar changed after proposal.

## 8. Phase dependency

Do not start Phase 4 until Phase 1b can produce trustworthy committed-change receipts. Staging depends on the same op mapping, result-id extraction, and run-aware telemetry as direct commits; otherwise the proposal UI will look trustworthy while hiding gaps in what actually landed.
