# Agent Work — 02 Staged Mutations (Optional Review-Before-Commit)

**Status:** Design · **Date:** 2026-06-15 · Part of the [Agent Work](./00-OVERVIEW.md) doc set.

An **opt-in** trust subsystem. Staging is **off by default** — runs mutate the user's data directly, exactly like the chat does today. When a caller asks for it (a `review` flag), the run instead produces a reviewable **Change Set** and waits for approval before anything lands.

> **Default = direct commit.** Review-before-commit is a capability you turn on, not overhead you manage on every run.

---

## 1. Design stance: staging is opt-in

The earlier version of this doc gated *all* mutating runs behind review. That's too much overhead for the common case — most runs are dispatched by a supervising human (or the chat orchestrator) who wants the work *done*, not queued for a second approval step.

So the model is inverted:

- **Default (`mutationMode: 'commit'`):** writes apply immediately. `entities_touched` is the receipt. Same trust posture as the chat today — the user (or supervisor) chose to run the agent, so it acts.
- **Opt-in (`mutationMode: 'stage'`):** the caller passes `review: true` on the brief. Writes are **staged into a Change Set** and committed atomically only after approval. Reads/external work are never staged regardless.

**When you'd turn review on:**
- You want to inspect a risky or large mutation before it lands ("restructure my whole project").
- An unsupervised/scheduled run will execute while you're away and you want a diff waiting for you, not a fait accompli.
- The supervisor agent decides a run's blast radius warrants a human check and sets `review: true` when it dispatches.

This is still dead-on for BuildOS positioning ("lead with relief") *when enabled*: *the system did the structuring work; here's the diff; approve it.* But it's a tool the user reaches for, not a tax on every run.

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
  id: string;                 // stable id for per-change approve/reject
  op: string;                 // registry op, e.g. 'onto.task.update'
  entity_type: 'task'|'project'|'document'|'goal'|'plan'|'calendar_event'|string;
  entity_id?: string;         // present for update/delete; absent for create
  action: 'create'|'update'|'delete';
  before?: Record<string, unknown>;   // current state (for update/delete) — for the diff UI
  after?: Record<string, unknown>;    // proposed state / draft payload
  rationale: string;          // why the agent proposes this
  decision?: 'approved'|'rejected'|'pending';
  applied_entity_id?: string; // filled on commit (esp. for creates)
  error?: string;             // filled if this change failed to apply
}
```

Stored in `agent_runs.change_set` (jsonb). A run that proposes changes ends with `status='proposal_ready'`.

---

## 3. How a run stages instead of mutates (only when review is on)

Write tools gain a **stage mode** that is engaged only when the run's `mutationMode === 'stage'`. The cleanest seam is at the executor layer (`ChatToolExecutor` / the ontology-write executor), not per-tool-handler:

- `RunContext` carries `mutationMode: 'commit' | 'stage'`, derived from the brief's `review` flag (see §3a).
- In `commit` mode (default), write ops execute normally — no Change Set, no extra path.
- In `stage` mode, a write op **does not perform the DB mutation.** It validates inputs, computes `before` (fetch current state) and `after` (the would-be payload), and appends a `ProposedChange` to the run's Change Set.
- The tool returns a synthetic success result (so the LLM's loop continues naturally) carrying the proposed-change id — which also flows into telemetry, so `entities_touched` vs `proposed_changes` stay consistent.

This keeps the LLM unaware of commit-vs-stage; the agent just "does the work," and the substrate decides whether that work lands now or after review.

### 3a. Where the `review` flag comes from

`review: boolean` (default `false`) is part of the dispatch brief (see 01). It maps to `agent_runs.review_required` and resolves `mutationMode`:

| Trigger | How `review` is set | Default |
|---|---|---|
| **chat** | Orchestrator passes `review` on `delegate_task` when it judges the blast radius warrants a check; the user can also ask ("let me review before you change anything"). | `false` |
| **manual** | A "Review changes before applying" toggle on the dispatch form. | `false` |
| **scheduled** | Saved on the schedule/Operative definition. **Recommended `true`** for unsupervised runs, but not forced. | `false` (UI nudges `true`) |
| **Operative (future)** | Per saved policy. | per policy |

> No `review` → no Change Set machinery runs at all. A read-only/research run never stages regardless of the flag (nothing to stage).

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
2. Applies each approved change via the **same executors** used in `commit` mode (so there's one mutation path, not two), inside a logical transaction where possible.
3. Records `applied_entity_id` per change; promotes applied changes into the run's `entities_touched`.
4. Sets Change Set `status` → `applied` / `partially_applied`; updates `agent_runs.status` → `completed`.
5. **Partial failure:** a failed change records `error` and does not roll back already-applied siblings unless they're declared dependent; the user sees exactly what landed. (Atomicity granularity is an open question — start per-change with clear reporting.)

---

## 6. Audit & reversal

- The Change Set is retained on the run forever → full audit of what was proposed vs applied vs rejected.
- `before` snapshots make **reversal** feasible (a future "undo this run" that re-applies `before`), though true reversal is out of scope for v1.

---

## 7. Open questions

- **Atomicity:** per-change vs whole-set transaction. Cross-entity dependencies (create project → create tasks in it) need ordering + dependency hints in `ProposedChange`.
- **Staleness:** if the user edits an entity between proposal and approval, `before` no longer matches. Detect drift on commit and surface conflicts rather than blindly applying `after`.
- **Coverage:** every write executor must support `stage` mode and emit a faithful `before`/`after`. Same registry-coverage concern as `entities_touched` (01 §5).
- **Calendar/external side effects:** Google Calendar writes aren't pure DB ops — staging them needs a dry-run representation and careful commit (idempotency).
