<!-- docs/specs/homework/homework-lesson.md -->

# BuildOS Homework (Long-Running Tasks) — Lesson Plan (Sixth-Grade Friendly)

## Goal (What you’ll learn)

- How Homework runs keep working in the background until they’re really done.
- Who does planning, tool use, fixing mistakes, and stopping safely.
- Where your notes and results live (workspace + scratchpad) and how to view them.

---

## 1) Big Picture (Why it exists)

- Normal chat ends when the model says “I’m done,” even if work isn’t finished.
- Homework adds a **run-level loop** in the worker that keeps going until the platform decides it’s done, paused, or out of budget.
- Runs survive tab closes, reconnects, and worker restarts.

```
You click "Start Homework" → API makes a run + queues job
Queue job → Worker picks it → Does one iteration → Saves results
If more to do → queues next job (same run) → repeats
If done/paused → sends notification + report
```

---

## 2) Main Parts (Who does what)

- **API (web app):** Start, view, cancel, or continue a run.
- **Queue + Worker:** One job = one iteration (durable and restart-safe).
- **Homework Engine (in worker):**
    - Planner: decides tools/tasks, can signal “ask user” or “stop”.
    - Tools: CRUD on projects/docs/tasks (scoped to your access).
    - Executors: mini agents that fan out tasks with limited tools.
    - Repairer: auto-fixes failed tool arguments once before giving up.
- **Stop guards:** Budgets, no-progress breaker, and an exit gate (needs exit_signal + evidence).

---

## 3) Data & Persistence (Where stuff lives)

- Tables: `homework_runs`, `homework_run_iterations`, `homework_run_events`.
- Workspace: `onto_documents` + `onto_edges`, tagged with `homework_run_id`.
- Metrics: tokens, cost, running_ms (only active work), per-iteration deltas.
- Report: JSON summary saved when the run finishes or stops.

```
homework_runs
  ├─ status, budgets, metrics, stop_reason
  ├─ workspace_document_id (root)
  └─ report (json)

homework_run_iterations (per loop)
  ├─ status, summary
  ├─ metrics: tokens, cost (for that iteration)
  └─ artifacts: tool/executor results

homework_run_events (timeline)
  └─ run_started, iteration_completed, run_stopped, waiting_on_user...
```

---

## 4) Life of a Run (Step-by-step)

1. Start on Homework page → API creates run + chat session + queues iteration 1.
2. Worker claims job; marks run running; creates iteration row.
3. Planner reads objective, workspace docs, scratchpad, and any user answers.
4. Planner outputs: status block + tool calls + executor tasks.
5. Engine executes tool calls (scoped). Failed calls get one repair pass.
6. Executors run limited tool calls in parallel.
7. Scratchpad updates with what happened.
8. Stop hook:
    - exit_signal + evidence → completed
    - needs_user_input → waiting_on_user (pauses, doesn’t burn budget)
    - budgets / no-progress → stopped
    - else → queue next iteration.
9. On stop/completion/fail/cancel → notification + optional report.

---

## 5) Safety & Budgets

- Wall-clock counts running time only; waiting does not eat budget.
- Cost/token caps; iteration cap.
- No-progress breaker: 3 empty iterations → stop with reason.
- Tool scoping: only projects you can access.

---

## 6) Repair Strategy (Self-fix)

- When a tool call fails:
    - Collect failing name/args/error.
    - LLM repair agent proposes up to 2 corrected calls.
    - Execute repaired calls; merge artifacts.

---

## 7) Workspace & Scratchpad (How notes work)

- Workspace root + scratchpad are auto-created (idempotent) and tagged with `homework_run_id`.
- **Scratchpad purpose:** running journal for each iteration (progress, remaining work, questions, tool results, executor tasks).
- **Append-only per iteration:** the engine adds a markdown block each loop so history stays intact.
- **Links:** created docs/tasks are tagged and, when possible, linked under the workspace root so you can browse the tree.
- **Visibility:** Run page shows scratchpad content; workspace tree shows documents.
- **Why this design:** keeps LLM context small (recent tail), keeps humans/auditors a full log, and allows search via indexes on homework props.

---

## 8) UI Cues & Notifications

- If the planner needs user input, the run status becomes **waiting_on_user**; the run page shows a banner + answer box; Continue resumes.
- Notifications fire on completed, stopped, failed, or canceled.
- Live metrics on run page: current cost, tokens, running time, and configured budgets.

---

## 9) How to guide the run

- Paused for input: add answers in the run page, click Continue.
- Stopped for budget: raise limits, click Continue.
- To save cost: narrow scope or reduce tool count in the prompt.

---

## 10) Quick glossary

- **Iteration:** One worker pass (planner → tools/executors → scratchpad).
- **Workspace:** Folder of docs/notes for this run.
- **Exit signal:** Model says “I’m done”; platform also checks evidence.
- **Artifacts:** Created/updated docs, tasks, edges.
- **Stop reason:** Why the run halted (completed, budget, no_progress, user_input, etc.).
