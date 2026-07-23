<!-- tasker/32-deep-research-chat-tool-and-progress-ui.md -->

# 32 — Deep Research Chat Tool & Progress Experience

**Created 2026-07-19.** Owner: Agentic Chat / product engineer.  
**Type:** user-facing product handoff.  
**Depends on:** tasks 29 and 31 P0; use task 30 report contract when available.

## Outcome

Agentic Chat can deliberately launch a bounded Deep Research run, explain its scope/cost before
starting, show truthful durable progress, and return/reopen the final result without holding an SSE
request open for ten minutes.

## Current gap

The durable Agent Run substrate and deep-research coordinator exist, but Deep Research is not yet a
first-class chat tool with a clear launch contract, approval/budget UX, progress model, and report
surface. A generic delegation pathway is not enough for users to understand what is spending money
or when it is safe to leave.

## Work packages

### WP-1 — Dedicated dispatch tool (P0)

Add a typed chat tool such as `deep_research.start` with objective, constraints, expected output,
project/global scope, cost ceiling, and optional source/date/domain preferences. Server policy
clamps user/model input to allowed depth, permissions, concurrency, and budget. The chat model may
propose a run; it may not broaden scope after dispatch.

Define the routing threshold separately from execution: ordinary web lookup stays synchronous;
multi-source/contradiction-heavy requests may offer Deep Research. Do not use a fragile fixed
“10-minute” classifier.

### WP-2 — Confirmation and estimates (P0)

Show scope, number of workstreams, permissions (`read-only web`), expected duration range, and
maximum spend before a user-triggered paid run where product policy requires confirmation. Make
the ceiling—not a misleading point estimate—the prominent number.

### WP-3 — Durable progress model (P0)

Render planning, child dispatch, each workstream’s state, synthesis, partial/failure, cancellation,
and budget exhaustion from persisted run events. Reconnect/reload must reconstruct the same state;
the browser must not be responsible for keeping the run alive.

### WP-4 — Control surface (P0)

Support cancel immediately and steering only at documented checkpoints. Explain that an already
accepted provider call may finish and consume its reserved amount. Prevent steering from adding
permissions, children, or budget without a new explicit authorization.

### WP-5 — Result and provenance UX (P1)

Inject a concise completion receipt into chat, link to the durable task-30 report, expose sources
and open questions, and label partial/low-confidence results clearly. Dedupe terminal messages by
root run id.

## Definition of done

- A user can start, leave, return, cancel, and reopen one bounded research run.
- UI progress is derived from durable state and survives reconnect.
- The displayed maximum spend matches the worker-enforced root ceiling.
- No chat-supplied argument can raise depth, concurrency, permission, or budget above policy.
