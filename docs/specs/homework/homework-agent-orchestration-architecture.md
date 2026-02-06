<!-- docs/homework-agent-orchestration-architecture.md -->

# Recursive Planner + Executor Architecture

**Date:** 2026-01-27  
**Status:** Draft  
**Owner:** Homework Agents

## Overview

Agents form a recursive tree. The root is a Planner that drafts a plan (ordered steps that may include parallel groups). Each step is executed by an Executor. An Executor can either perform the work directly or briefly switch into a Planner role to break the task into its own sub-plan and delegate to child Executors. Roles are fluid: Planner → Executor when dispatching; Executor → Planner when decomposing.

## Core Concepts

- **Task:** `description`, `reason`, `successCriteria[]`, `id`.
- **Step:** either a single Task or a `ParallelGroup` (list of Steps that must all finish).
- **Plan:** ordered list where each element may be a Step or a ParallelGroup; effectively an array of arrays: `[task1, task2, [task3, task4], task5]`.
- **Result:** `{ taskId, status, notes, evidence }`.
- **Context:** carries resources, constraints, lineage metadata.

## Termination Heuristic (leaf decision)

An Executor executes directly when:

1. Complexity is low/medium and well understood.
2. Required resources are available in-context.
3. Success criteria are concrete and locally testable.
   Otherwise it drafts a sub-plan and delegates.

## Control Flow (pseudo)

```pseudo
type Task = { id, description, reason, successCriteria[] }
type Step = Task | ParallelGroup
type ParallelGroup = list<Step>      // run all in parallel
type Plan = list<Step>               // ordered; each entry may be parallel
type Result = { taskId, status: ok|fail, notes, evidence }

function orchestrate(rootTask):
  rootPlan = make_plan(rootTask)                 // Planner role
  return run_plan(rootPlan, initial_context())

function run_plan(plan, ctx):
  results = []
  for step in plan:                              // sequential across top-level
    results.append(run_step(step, ctx))
    if any_fail_hard(results.last): break
  return results

function run_step(step, ctx):
  if step is Task: return run_executor(step, ctx)
  if step is ParallelGroup:
    // fan-out then join
    return parallel_map(step, s => run_step(s, ctx))

function run_executor(task, ctx):
  if can_execute_directly(task, ctx):
    return execute_task(task, ctx)
  else:
    subPlan = make_plan(task)                    // Executor becomes Planner
    subResults = run_plan(subPlan, ctx.extend(task))
    return aggregate(task, subResults)

function can_execute_directly(task, ctx):
  return is_low_complexity(task)
      and resources_available(task, ctx)
      and successCriteria_testable(task)

function aggregate(parentTask, subResults):
  summary = evaluate_against_success(parentTask.successCriteria, subResults)
  return { taskId: parentTask.id, status: summary.status, notes: summary.notes, evidence: subResults }
```

## Behavioral Notes

- Planner may re-plan after aggregation if success criteria are unmet.
- Parallelism is confined to `ParallelGroup`; outer list is strictly ordered.
- Post-order aggregation bubbles evidence upward; each node emits a Result.
- Context may carry safety guards, budgets, and delegation limits to prevent runaway recursion.
