<!-- docs/homework-planner-executor-fix-spec.md -->

# Homework Planner/Executor Improvement Spec

**Date:** 2026-01-26  
**Goal:** Stop repetitive, shallow iterations (“Search for this” every loop) by giving the planner real state, enforcing progress, and improving scratchpad fidelity.

---

## 1. Symptoms Observed

- Scratchpad shows nearly identical entries per iteration (e.g., “Iteration N: Search for X”).
- Planner/executor are not updating strategy based on prior work.
- Little/no evidence of plan decomposition or task hand-off to executors.

## 2. Likely Root Causes

1. **Thin context**: Planner only sees a raw scratchpad tail; it does not get structured “what changed” (tool results, executor outputs, new artifacts).
2. **No persistent plan state**: Planner isn’t maintaining a plan/steps; every iteration is a fresh “do something” loop.
3. **Executor feedback not fed back**: Executor tool results aren’t summarized into the next planner prompt.
4. **Weak progress checks**: Repetition can slip through because no-progress breaker triggers only after several identical iterations, and the planner isn’t forced to vary actions.
5. **Scratchpad logging is minimal**: It logs status text, not the concrete actions/results, so the model can’t “see” what actually happened.
6. **No anti-duplication guard**: Planner isn’t warned when repeating the same remaining_work/tool_calls across iterations.

## 3. Objectives

- Provide richer, structured state to each planner call so it can reason over what already happened.
- Persist and reuse plan/tasks so the system advances instead of reissuing the same action.
- Make scratchpad a reliable, detailed journal of actions/results.
- Add anti-repetition guards and stronger no-progress detection.
- Keep compatibility with project/multi-project scopes and existing tool set.

## 4. Proposed Changes (Backend)

### 4.1 Planner Input Enrichment

- Include a structured `last_iteration` block in the planner user prompt:
    - iteration number
    - tool_results (name, ok, short result/error)
    - executor_results (task title, summary of tool calls/outcomes)
    - new artifacts (created_docs/tasks, updated_docs/tasks)
    - progress_delta (boolean)
- Pass `no_progress_streak` and `remaining_work_last` to allow anti-duplication messaging.
- Keep scratchpad tail, but shrink to the last ~3 iterations to reduce noise and add a concise auto-summarized “recent history” section.

### 4.2 Plan State (Lightweight)

- Add `plan` object persisted in run metrics or a new `homework_run_plan` JSON:
    - steps: [{id, title, status, owner: planner|executor, iteration_last_touched}]
    - Planner must update step statuses; executor tasks can mark steps done.
- Include plan state in planner prompt and require the planner to:
    - create steps if missing
    - assign executor tasks from steps
    - mark completed steps when evidence exists.

### 4.3 Executor Feedback Loop

- After executor tasks finish, create a concise summary and feed it into `last_iteration` for the next planner call.
- Add a per-task short “result_snippet” (first 300 chars or brief bullet).

### 4.4 Scratchpad Fidelity

- Expand scratchpad entry template to include:
    - Actions executed (tool name + args key fields)
    - Results/errors (1–2 lines each)
    - New/updated entities (ids/titles)
    - Remaining_work and next_action_hint
    - Plan step updates
- Ensure entries are not duplicated: write once per iteration using a deterministic template.

### 4.5 Anti-Repetition & Progress Enforcement

- If `remaining_work` or `tool_calls` match the prior iteration, add a system hint: “Do not repeat the same action; choose a different approach or replan.”
- Tighten no-progress breaker to 2 consecutive identical action sets (configurable).
- If no progress and same tool set repeats, force a “replan” branch in the next iteration.

### 4.6 Artifacts & Evidence

- Aggregate artifacts per iteration and store in `homework_run_iterations.artifacts`:
    - created_documents/tasks, updated_documents/tasks, created_edges.
- Use these to auto-fill `completion_evidence` (e.g., when required entities are created/updated).

## 5. Proposed Changes (UI)

- Show the most recent 3 scratchpad entries with collapsible full view, so users can verify diversity of actions.
- Display plan steps (if present) with statuses and which iteration last touched them.
- Surface “no progress” warnings when streak > 1.

## 6. Implementation Steps (incremental)

1. Add `last_iteration` structured prompt block in `homeworkEngine.ts`; include executor/tool summaries and artifacts.
2. Add anti-duplication hinting and tighten no-progress breaker to 2 consecutive repeats.
3. Enhance scratchpad template with actions/results/artifacts and ensure single-write per iteration.
4. Persist lightweight plan JSON in `homework_runs.plan` (new nullable column) and thread into planner prompt; update on each iteration.
5. Feed executor summaries back into planner input.
6. UI: show recent scratchpad entries + plan steps; highlight waiting_on_user and no-progress.

## 7. Validation / Tests

- Simulate two iterations where the first repeats: expect planner to receive anti-repetition hint and produce different tool_calls.
- Verify scratchpad captures actions/results, not only progress text.
- Check that artifacts created in iteration N appear in `last_iteration` for iteration N+1 and reduce remaining_work.
- Ensure project/multi-project scopes still pass project_ids into planner/executor prompts.

## 8. Risks / Mitigations

- Prompt bloat: keep structured blocks concise and cap scratchpad tail.
- JSON parse failures: continue to use `validation.retryOnParseError`.
- Plan state drift: store plan JSON on the run and overwrite each iteration to avoid merges.

---

This spec keeps the existing tool set and loop but makes the planner stateful, informed by real outcomes, and explicitly discouraged from repeating identical actions.\*\*\*
