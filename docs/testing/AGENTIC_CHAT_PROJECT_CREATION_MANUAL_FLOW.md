<!-- docs/testing/AGENTIC_CHAT_PROJECT_CREATION_MANUAL_FLOW.md -->

# Agentic Chat Project Creation Manual Flow

**Date:** 2026-04-03  
**Scope:** Manual acceptance testing for BuildOS agentic chat project creation in `project_create` mode.

## Purpose

Use this document to manually test how BuildOS creates a new project through agent chat, how it shifts into the new project context, and what observability artifacts should be recorded.

This is a manual test flow, not a replay/eval harness document.

## Current Expected Behavior

Today, project creation is a specialized chat flow driven by `project_create` context.

What should happen:

1. Start in `project_create` mode, usually from `/projects/create`.
2. The agent should infer as much as it reasonably can from the user message.
3. If essential information is missing, it should ask at most 1-2 focused clarification questions.
4. If there is enough information, it should create the project with minimal appropriate structure.
5. The expected execution surface is direct project creation guidance and the exact project creation op:
    - help path: `onto.project.create`
    - tool: `create_onto_project`
6. After successful creation, chat should shift from `project_create` to `project` context.
7. Follow-up turns should operate on the new project without making the user restate the project ID.

## Important Current Reality

Project creation is not yet modeled as a first-class capability/skill pair in the new gateway catalog.

So for now, the expected pattern is:

- `project_create` context gives the model the right intent framing
- the model should use exact project creation help
- then call `create_onto_project`
- then continue in `project` context after the context shift

That is the correct behavior for the current system.

## Environment

Use these settings while testing:

- `AGENTIC_CHAT_TOOL_GATEWAY=true`
- prompt observability enabled
- admin chat audit page available

Recommended surfaces:

- create flow: `/projects/create`
- audit surface: `/admin/chat/sessions`

## What To Verify Every Time

For each scenario, capture:

- the exact user prompt
- the visible tool trace in chat
- the final assistant answer
- the resulting project name and structure in the product
- the resulting turn run in admin audit

In admin, verify:

- a `chat_turn_runs` row exists
- a prompt snapshot exists
- turn events show the project creation path
- successful creation emits a context shift
- follow-up turns land in project context

## Happy Path

### PC1. Fully Specified, Minimal Create

**Where:** `/projects/create`  
**Prompt:**

```text
Create a project called Podcast Launch for BuildOS. The goal is to publish the first 3 episodes by June 15. Tasks I already know about: define the show format, book the first 3 guests, and record the trailer.
```

**Expected behavior**

- The agent should create the project without a clarification round.
- It should keep structure minimal:
    - project
    - one goal because the outcome is explicit
    - the explicit tasks the user mentioned
- It should not invent unrelated plans, milestones, risks, or documents.
- After success, context should shift to the created project.

**Expected path**

- `project_create` context
- exact help for `onto.project.create` if needed
- `create_onto_project`
- context shift from `project_create` -> `project`

**Must not happen**

- repeated clarification when the prompt is already sufficient
- broad workspace/project search churn before creation
- random extra structure the user did not ask for
- staying in `project_create` after successful creation

## Clarification Path

### PC2. Too Vague To Create Cleanly

**Where:** `/projects/create`  
**Prompt:**

```text
Help me start a new project.
```

**Expected behavior**

- The agent should not blindly create a project.
- It should ask one short, focused clarification such as what kind of project this is or what outcome the user wants.
- It should remain in `project_create` context.

**Must not happen**

- immediate project creation with meaningless defaults
- long interview-style questioning
- context shift into `project` before a real project exists

## Structured Create

### PC3. User Explicitly Mentions Workstreams

**Where:** `/projects/create`  
**Prompt:**

```text
Create a wedding planning project. The main outcome is a smooth wedding day. I want two workstreams: venue and catering, and guest management.
```

**Expected behavior**

- The agent should create the project.
- It may create a goal plus two plans because the user explicitly described workstreams.
- It should still avoid inventing tasks, milestones, risks, or docs unless they were actually mentioned.
- After success, context should shift into the new project.

**Must not happen**

- flattening everything into random tasks
- creating a large graph full of unrequested entities

## Post-Create Continuation

### PC4. Follow-Up After Successful Create

Run this immediately after `PC1` or `PC3`.

**Prompt:**

```text
Add a task to research distribution channels.
```

**Expected behavior**

- The assistant should understand which newly created project is active.
- It should create the task in that project without asking for the project again.
- The turn should now be in `project` context, not `project_create`.

**Must not happen**

- asking “which project?”
- falling back to global discovery
- losing the context shift from the previous turn

## Safety / Minimality Check

### PC5. Do Not Overbuild The Project

**Where:** `/projects/create`  
**Prompt:**

```text
Create a project to learn Spanish.
```

**Expected behavior**

- The assistant should create a very small project.
- A good result is:
    - project
    - maybe one goal
- It should not create plans, tasks, milestones, risks, or documents unless the user asked for them.

**This scenario is important because**

The project creation tool guidance explicitly says to start simple. This is a good regression check against ontology overproduction.

## What Should Show Up In Admin

For a successful project creation turn, the admin audit should show something close to this:

- `context_type = project_create` on the creation turn
- a prompt snapshot for that turn
- tool path showing exact project creation help and/or project creation execution
- a `tool_result_received` event for the project creation op
- a `context_shift_emitted` event after success
- the next turn running in `project` context for the new project

For a clarification turn, the admin audit should show:

- `context_type = project_create`
- no success context shift yet
- no misleading project creation success message

## Pass / Fail Criteria

### Pass

A project creation scenario passes when:

- the agent asks only the minimum clarifications needed
- the created structure matches what the user actually asked for
- the project is successfully created
- context shifts to `project` only after success
- follow-up turns continue inside the created project
- no scratchpad text or malformed tool chatter leaks into the user-visible answer

### Fail

A project creation scenario fails when:

- the agent over-questions instead of creating
- the agent creates with meaningless defaults when critical info is missing
- the agent overbuilds the ontology graph
- the project is created but context does not shift
- follow-up turns lose the created project context
- internal reasoning or malformed tool chatter leaks into the chat UI

## Suggested Recording Template

Use this format while testing manually:

```text
Scenario:
Prompt:
Result:
Was project created? yes/no
Was context shifted? yes/no
Did follow-up stay in project? yes/no
Any validation failures?
Any scratchpad leakage?
Admin turn_run id:
Notes:
```

## Next Logical Automation Step

Once these manual checks feel stable, the next automation target should be a replayable project creation scenario in the eval harness so we can test:

- creation success
- clarification behavior
- context shift
- post-create follow-up grounding
