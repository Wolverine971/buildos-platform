<!-- docs/testing/AGENTIC_CHAT_PROMPT_TEST_PLAN.md -->

# Agentic Chat Prompt Test Plan

**Date:** 2026-04-03  
**Last updated:** 2026-04-12
**Scope:** `apps/web` agentic chat v2 with emphasis on prompt behavior, direct-tool routing, overview retrieval, and skill usage.

For the current hybrid direct-tool acceptance matrix, also use [Agentic Chat Hybrid Tool Surface Prompt Tests](/Users/djwayne/buildos-platform/docs/testing/AGENTIC_CHAT_HYBRID_TOOL_SURFACE_PROMPT_TESTS_2026-04-10.md).

## Purpose

This document defines how to test whether BuildOS agentic chat is behaving correctly at the prompt and runtime level.

It is meant to answer three questions:

1. What do we already cover with automated tests?
2. What prompt-level behaviors still need manual acceptance testing?
3. What exact prompts should we run to verify the chat is working properly in the workspace and inside a specific project?

## Current State

We do have meaningful automated coverage around key pieces of the chat stack, but we do **not** yet have a single true end-to-end prompt acceptance harness that:

- sends a real user prompt,
- captures the model's exact tool choices,
- validates the final answer quality,
- and snapshots the full prompt/tool trace for regression assertions.

So current coverage is best described as:

- **Good component-level coverage**
- **Good runtime-guardrail coverage**
- **Some targeted retrieval-path coverage**
- **No full prompt-to-answer acceptance harness yet**

## Existing Automated Coverage

### Prompt contract

File:

- `/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.test.ts`

What it covers:

- canonical direct-tool instructions are present
- capability catalog is injected
- skill catalog is injected
- overview guidance is present
- prompt tells the model to prefer `util.workspace.overview` and `util.project.overview` for status questions
- prompt tells the model to use preloaded direct tools when they fit
- prompt forbids routing normal work through a catch-all execution tool
- prompt includes required-ID guidance
- prompt excludes removed heuristic sections such as `Path heuristic` and `Good skill entry points`
- prompt compaction and prompt-time context shaping behavior

### Tool discovery / skill registry

Files:

- `/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat/tools/skills/skill-load.test.ts`
- `/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat/tools/core/tool-schema-compat.test.ts`
- `/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat-v2/tool-selector.test.ts`

What it covers:

- `skill_load` returns on-demand workflow playbooks
- `tool_search` and `tool_schema` support progressive disclosure
- gateway mode preloads context-specific direct tools
- direct-tool schemas stay aligned with canonical registry ops
- direct-tool schemas stay compact and callable by the exact tool names

### Runtime repair and tool-loop guardrails

File:

- `/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.test.ts`

What it covers:

- repeated read/discovery loops terminate cleanly
- repeated validation failures do not keep executing invalid writes
- exact canonical op schemas are validated before execution
- tool-call scratchpad leakage is blocked
- malformed or repeated tool patterns are repaired or stopped
- mixed-validity tool rounds do not poison all sibling calls

### Workspace / project overview retrieval

Files:

- `/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat/tools/core/executors/overview-helper.test.ts`
- `/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat/tools/core/executors/utility-executor.overview.test.ts`
- `/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat-v2/context-loader.test.ts`

What they cover:

- workspace overview payload construction
- project overview payload construction
- exact and ambiguous project-name matching
- owner/member project scoping for overview
- public-only project leakage prevention
- global context fallback loading from project summaries
- compact global context shaping for portfolio-style answers

## Known Coverage Gap

We still need a real acceptance harness for live prompt behavior.

What is missing today:

- a test that replays real prompts against the live chat runtime and records the resulting tool trace
- golden prompt dump assertions for important user intents
- automatic verification that a given prompt used the intended overview path or skill path
- automatic verification of final answer quality beyond structural/runtime checks

## How To Run Current Focused Tests

From the repo root:

```bash
pnpm -C apps/web exec vitest run \
  src/lib/services/agentic-chat-v2/master-prompt-builder.test.ts \
  src/lib/services/agentic-chat/tools/skills/skill-load.test.ts \
  src/lib/services/agentic-chat/tools/core/tool-schema-compat.test.ts \
  src/lib/services/agentic-chat-v2/stream-orchestrator.test.ts \
  src/lib/services/agentic-chat/tools/core/executors/overview-helper.test.ts \
  src/lib/services/agentic-chat/tools/core/executors/utility-executor.overview.test.ts \
  src/lib/services/agentic-chat-v2/context-loader.test.ts
```

## Prompt Acceptance Test Matrix

Use these scenarios in the running app with:

- prompt dumps enabled
- UI tool trace visible, if available

For each scenario, capture:

- final assistant answer
- visible tool activity
- latest file in `apps/web/.prompt-dumps/`
- whether the answer stayed inside the correct scope

### A. Workspace And Project Status

| ID  | Prompt                                | Expected path                                          | Must happen                                                                                      | Must not happen                                            | Coverage today             |
| --- | ------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- | -------------------------- |
| A1  | `What is happening with my projects?` | `util.workspace.overview`                              | Returns concise cross-project summary with active, blocked, due-soon, risks, and upcoming events | Generic search/list churn before overview                  | Partial automated + manual |
| A2  | `What's going on with 9takes?`        | `util.project.overview`                                | Resolves named project and summarizes current status                                             | Wandering through root discovery, repeated search failures | Partial automated + manual |
| A3  | `What changed recently in 9takes?`    | `util.project.overview`                                | Uses recent activity from project overview                                                       | Starts with unrelated skills                               | Manual                     |
| A4  | `What is blocked across my projects?` | `util.workspace.overview`                              | Highlights blocked work across the user's own/shared projects                                    | Includes unrelated public projects                         | Manual                     |
| A5  | `What is due soon?`                   | `util.workspace.overview` or in-scope project overview | Uses current chat scope correctly                                                                | Loses scope and restarts discovery from scratch            | Manual                     |

### B. Scope And Access Control

| ID  | Prompt                                 | Setup                                                  | Expected result                                           | Failure signal                     | Coverage today             |
| --- | -------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------- | ---------------------------------- | -------------------------- |
| B1  | `What is happening with my projects?`  | User is member on a project they did not create        | Shared project appears in the overview                    | Only owned projects appear         | Partial automated + manual |
| B2  | `What's going on with Alpha?`          | Two accessible projects named `Alpha`                  | Chat asks one concise clarification or returns candidates | It silently picks one project      | Partial automated + manual |
| B3  | `What's going on with project <uuid>?` | Use a public-only project ID not in owner/member scope | Returns not found / inaccessible                          | Surfaces the public project anyway | Automated                  |

### C. Follow-Up And Context Reuse

| ID  | Prompt sequence                                                                   | Expected result                                                        | Failure signal                       | Coverage today |
| --- | --------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------------------------------------ | -------------- |
| C1  | `What's going on with 9takes?` then `What's blocked?`                             | Follow-up stays on `9takes` and answers from prior scoped context      | Repeats whole project-discovery flow | Manual         |
| C2  | `What is happening with my projects?` then `Which project needs attention first?` | Uses prior workspace overview and prioritizes                          | Rebuilds everything from scratch     | Manual         |
| C3  | `Show me more about the first one.`                                               | Uses prior answer context or asks one short clarification if ambiguous | Invents a project reference          | Manual         |

### D. Calendar Skill

| ID  | Prompt                                   | Expected path                                                     | Must happen                           | Must not happen                                       | Coverage today |
| --- | ---------------------------------------- | ----------------------------------------------------------------- | ------------------------------------- | ----------------------------------------------------- | -------------- |
| D1  | `What is on my calendar tomorrow?`       | `cal.skill` or direct `cal.event.list` after correct help         | Uses a bounded time range             | Blind mutation or missing time range                  | Manual         |
| D2  | `Move my 9takes review to Friday at 2pm` | Calendar guidance, then event resolution, then `cal.event.update` | Resolves exact event ID before update | Update attempts without `onto_event_id` or `event_id` | Manual         |
| D3  | `Connect 9takes to the right calendar`   | `cal.skill`                                                       | Uses project calendar mapping flow    | Treats it like a generic project read                 | Manual         |

### E. Documents And Organization

| ID  | Prompt                                  | Expected path         | Must happen                                                      | Must not happen                        | Coverage today |
| --- | --------------------------------------- | --------------------- | ---------------------------------------------------------------- | -------------------------------------- | -------------- |
| E1  | `Organize the unlinked docs in 9takes`  | `onto.document.skill` | Loads document tree once, then moves unlinked docs deliberately  | Repeated invalid tree moves            | Manual         |
| E2  | `Create a project brief doc for 9takes` | `onto.document.skill` | Creates document in the correct place with correct project scope | Creates doc without project resolution | Manual         |

### F. Workflow Skills

| ID  | Prompt                                                | Expected path                                          | Must happen                                             | Must not happen                                | Coverage today |
| --- | ----------------------------------------------------- | ------------------------------------------------------ | ------------------------------------------------------- | ---------------------------------------------- | -------------- |
| F1  | `Audit the health of 9takes`                          | project overview first, then `workflow.audit.skill`    | Produces deeper structural assessment than plain status | Responds with generic overview only            | Manual         |
| F2  | `Forecast what is likely to slip in 9takes`           | project overview first, then `workflow.forecast.skill` | Uses milestones, tasks, risks, and sequencing signals   | Treats it as a simple search/list task         | Manual         |
| F3  | `Turn this into tasks:` followed by a messy paragraph | `onto.task.skill`                                      | Creates or proposes tasks thoughtfully                  | Creates low-quality task spam without judgment | Manual         |

### G. People Context

| ID  | Prompt                        | Expected path                                | Must happen                                  | Must not happen                       | Coverage today |
| --- | ----------------------------- | -------------------------------------------- | -------------------------------------------- | ------------------------------------- | -------------- |
| G1  | `Who do I know at Acme?`      | `util.people.skill` then contact/profile ops | Searches contact/profile data safely         | Exposes sensitive values by default   | Manual         |
| G2  | `Update Sarah's email to ...` | `util.people.skill`                          | Resolves candidate correctly before mutation | Blind update against the wrong person | Manual         |

### H. Failure Recovery And Safety

| ID  | Prompt                                                    | Expected result                                            | Failure signal                                                                             | Coverage today             |
| --- | --------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------- |
| H1  | Prompt that requires a mutation without an explicit ID    | Chat reads/searches first, then mutates once it has the ID | Repeated `Missing required parameter` failures                                             | Partial automated + manual |
| H2  | Any normal user prompt                                    | User sees a clean answer or clean tool lead-ins            | Visible scratchpad like `No, wait`, raw function-call JSON, or XML/function-call fragments | Partial automated + manual |
| H3  | Prompt that triggers one bad tool call plus one valid one | Valid tool call still runs                                 | Entire batch is skipped because one sibling call failed validation                         | Automated                  |

## Manual Test Procedure

For each scenario:

1. Start a fresh chat when testing initial-routing behavior.
2. Use an existing chat when testing follow-up grounding behavior.
3. Record the exact user prompt.
4. Save the latest prompt dump from `apps/web/.prompt-dumps/`.
5. Capture the visible tool trace from the UI.
6. Mark:
    - correct tool family chosen
    - correct scope used
    - final answer usefulness
    - any retries, loops, or validation failures

## Pass / Fail Criteria

A scenario passes when all of the following are true:

- the chat chose the correct retrieval or skill lane
- the tool path stayed inside the user's intended scope
- the answer was grounded in BuildOS data, not generic filler
- the tool loop did not thrash
- no scratchpad or schema chatter leaked into the user-visible answer

A scenario fails if any of the following happen:

- wrong scope
- repeated missing-arg errors
- repeated root/help/search churn for a simple question
- wrong skill or no skill when one is clearly needed
- final answer is generic despite available data
- visible internal reasoning leaks into the UI

## Recommended Next Step

The next testing upgrade should be a dedicated prompt acceptance harness for `apps/web` that:

- runs a curated list of prompts,
- captures the prompt dump and tool trace,
- asserts the first intended op family or skill path,
- and snapshots the final assistant answer shape.

That would turn the highest-value scenarios in this document into deterministic regression tests instead of relying on manual checking alone.
