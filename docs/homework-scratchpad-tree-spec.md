<!-- docs/homework-scratchpad-tree-spec.md -->

# Homework Scratchpad Tree Spec

**Date:** 2026-01-26  
**Purpose:** Design nested scratchpad documents so planner and executors share a structured, linked research/work tree.

---

## Goals

- Treat the homework workspace as a tree of markdown docs (nodes) rather than one long scratchpad.
- Give each executor its own child scratchpad, linked to the main scratchpad, so parallel work stays organized.
- Let the planner read summaries (and tails) of child scratchpads and roll them up into the main plan.
- Preserve durability and auditability: every node is an `onto_document` tagged with `homework_run_id`.

## Core Model

```
workspace (document.homework.workspace)
└─ main scratchpad (document.homework.scratchpad.root)
   ├─ plan doc (document.homework.plan) — optional structured steps
   ├─ executor branch A (document.homework.scratchpad.exec)
   ├─ executor branch B (document.homework.scratchpad.exec)
   └─ iteration summaries (document.homework.summary.iteration)
```

### Document Types (type_key)

- `document.homework.workspace` — root
- `document.homework.scratchpad.root` — main scratchpad (planner log + rollups)
- `document.homework.scratchpad.exec` — one per executor/task branch
- `document.homework.plan` — structured plan (steps/state)
- `document.homework.summary.iteration` — optional per-iteration snapshot

### Edges

- `document_has_document` links:
    - workspace → main scratchpad
    - workspace → plan doc
    - main scratchpad → executor scratchpads
    - main scratchpad → iteration summary docs

### Props

Each doc carries:

```json
{
  "homework_run_id": "<run>",
  "doc_role": "workspace|scratchpad_root|scratchpad_exec|plan|iteration_summary",
  "branch_id": "<uuid or task title>",
  "iteration": <int>,
  "owner": "planner|executor",
  "tags": ["homework", "..."]
}
```

---

## Planner / Executor Responsibilities

### Planner

- Writes to **main scratchpad** each iteration:
    - plan updates, remaining work, questions
    - links to child executor scratchpads (edge insert)
- Spawns executor tasks; for each task, create a child scratchpad if missing:
    - type: `document.homework.scratchpad.exec`
    - props.branch_id = task id/title, owner = executor
    - edge: main scratchpad → child scratchpad

### Executors

- Write to their own **executor scratchpad**:
    - actions, tool calls, results, findings
    - keep it append-only per iteration
- Can create child docs (notes/findings) under their branch if needed.

### Rollups

- Each iteration, planner reads:
    - tail of main scratchpad
    - short summaries of each executor scratchpad (e.g., last 1–2 entries)
- Planner updates main scratchpad with a “branch rollup” section referencing the child scratchpads.

---

## Prompting Changes

- Planner prompt includes:
    - main scratchpad tail
    - list of executor scratchpad summaries (title, branch_id, last summary)
    - instruction: “If assigning executor tasks, ensure each has a linked executor scratchpad. Do not repeat identical actions; update plan and branch notes.”
- Executor prompt includes:
    - its branch scratchpad tail
    - workspace/project ids
    - instruction: “Log results to your executor scratchpad; if you create docs, link under workspace or your branch.”

---

## Storage & Retrieval

- Creation:
    - main scratchpad and plan created with workspace bootstrap.
    - executor scratchpad created lazily on first executor task.
- Query:
    - select executor scratchpads via `props->>'doc_role' = 'scratchpad_exec'` and `props->>'homework_run_id' = run`.
    - edges used to build tree in UI.

---

## UI Ideas

- Show tree: workspace → main scratchpad → child executor scratchpads.
- In run page, list recent entries from main scratchpad and each active executor branch.
- Click executor branch to view its log.

---

## Open Questions

- How many executor scratchpads to keep visible (pagination/limits)?
- Do we auto-summarize old entries to control context size?
- Should plan doc hold structured JSON of steps vs. markdown?

---

## Implementation Phases

1. Data model: add doc_role/type conventions; ensure edges created for executor scratchpads.
2. Engine: create/find executor scratchpad per task; log executor outputs there; rollup summaries into planner prompt and main scratchpad.
3. UI: render tree with branch nodes; show branch summaries; link to docs.
