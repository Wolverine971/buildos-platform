<!-- docs/technical/implementation/OPENCLAW_BUILDOS_AGENT_BRIDGE_FOUNDATION_SPEC.md -->

# OpenCLAW + BuildOS Agent Bridge Foundation Spec

## Document Metadata

- Status: Draft
- Owner: BuildOS
- Audience: Product, platform, agent-runtime, and worker implementation
- Purpose: Define the first foundation for human + AI + agent collaboration between BuildOS and OpenCLAW

## Executive Summary

This spec defines the first real integration layer between BuildOS and OpenCLAW.

The key abstraction in this version is:

- every user has an internal BuildOS agent
- external systems like OpenCLAW do not talk to BuildOS in the abstract
- they call that user's BuildOS agent
- BuildOS decides whether to pick up or hang up based on caller identity, trust, scope, and policy

The goal is not to make one chatbot talk loosely to another chatbot. The goal is to make BuildOS the shared operational environment where:

- humans can interact with BuildOS directly
- humans can interact with external agents like OpenCLAW
- external agents can call a user's BuildOS agent through a typed, permissioned boundary
- BuildOS can delegate bounded work to external agents and record the results

The foundation is a collaboration substrate, not just a chat feature.

BuildOS remains the system of record for projects, tasks, goals, plans, documents, comments, and permissions. OpenCLAW becomes an external agent runtime that can call into a user's BuildOS agent, request context or actions through that agent, and return structured outputs back into BuildOS.

## Foundational Abstraction: The User's BuildOS Agent

Every user should have a canonical internal BuildOS agent.

This agent is not necessarily a permanently running process. It is a durable system identity and interaction boundary owned by BuildOS for that user.

Conceptually, it works like this:

- the user has a BuildOS agent
- that agent is the thing that "knows" the user's BuildOS workspace
- external agents do not reach directly into BuildOS tables or internal tools
- they call the user's BuildOS agent
- that agent decides what context to load, what tools to expose, and what actions are allowed

In practice, "knows the user's workspace" should mean:

- it has authority to resolve the user's visible projects, tasks, plans, goals, documents, comments, and related context on demand
- it does not need to preload every project into memory
- it should use BuildOS context loaders and permissions to assemble the right context for the current interaction

This keeps the abstraction clean:

- humans talk to their BuildOS agent
- OpenCLAW talks to the user's BuildOS agent
- BuildOS can use that same agent identity when coordinating internal automations or delegated work

## Why This Exists

The product direction behind this work is larger than "connect OpenCLAW."

What we are actually building is the base layer for mixed human/AI/agent collaboration inside BuildOS:

- a human should be able to ask BuildOS to coordinate work
- a human should be able to bring in an external agent like OpenCLAW
- a human should effectively have a persistent BuildOS agent identity that represents their workspace
- a BuildOS agent should be able to hand off a bounded task to another agent runtime
- every action should still land back in BuildOS as visible state, history, and artifacts

This creates a world where BuildOS is not only a project tool or chat UI. It becomes the operational interface where people and agents work against the same graph of projects, tasks, documents, and decisions.

## Product Intent

### What This Foundation Must Enable

1. A human can talk to BuildOS in the existing chat UI.
2. Every user has a stable internal BuildOS agent identity.
3. OpenCLAW can call that user's BuildOS agent through an authenticated call boundary.
4. BuildOS can decide whether to accept or reject an incoming external-agent call.
5. OpenCLAW can safely read BuildOS context through the user's BuildOS agent.
6. OpenCLAW can request approved mutations in BuildOS through that agent's narrow write tools.
7. BuildOS can track delegated work as calls, runs, events, outputs, and artifacts.
8. Long-running cross-agent work can survive retries, cancellation, and partial failure.

### What This Foundation Is Not

1. It is not a full rewrite of the current chat architecture.
2. It is not raw database access for OpenCLAW.
3. It is not an unbounded assistant-to-assistant conversation loop.
4. It is not an attempt to move all interactive chat into the worker.

## Call Model: "Phone Number" / "Pick Up or Hang Up"

The right mental model is a phone call.

OpenCLAW should not connect to BuildOS as a generic anonymous intelligence.
It should call a specific user's BuildOS agent.

That implies four things:

1. There is a callee.
   The callee is the user's internal BuildOS agent.

2. There is a caller.
   The caller is an identified external agent runtime or installation, such as OpenCLAW for that user.

3. There is a call gateway.
   BuildOS receives the incoming call, recognizes the caller, determines which BuildOS agent is being called, and decides whether to accept or reject the call.

4. There is a session after pickup.
   If BuildOS accepts the call, the caller can interact with the user's BuildOS agent using an approved capability set.

The product behavior should feel like:

- OpenCLAW dials the user's BuildOS agent
- BuildOS checks who is calling
- BuildOS checks whether this caller is trusted and allowed for that user
- BuildOS either picks up the phone or hangs up the phone
- if BuildOS picks up, the call becomes an authenticated agent session
- during that session, OpenCLAW can ask questions, request context, and propose actions

This is a better abstraction than "assistant talks to assistant" because it makes identity, trust, and acceptance first-class.

## Primary Architectural Decision

### Decision

Do not move human chat transport into workers.

### Rationale

The current BuildOS split is already directionally correct:

- web owns auth, session creation, SSE streaming, and user-facing request handling
- worker owns retryable, long-running, queued execution

That means:

- user-facing interactive chat should stay on the web SSE path
- delegated external-agent runs should move onto the queue/worker path

### Practical Interpretation

Use the web app for:

- authentication
- permission checks
- starting runs
- streaming near-real-time updates to the UI
- human chat sessions

Use the worker for:

- OpenCLAW delegation
- long-running tool chains
- retries/backoff
- polling external agent state
- writing durable run events and outputs

## Current Repo Constraints and Reuse Targets

This spec assumes and reuses the existing BuildOS architecture:

- Web SSE chat endpoints already exist in `apps/web/src/routes/api/agent/v2/stream/+server.ts` and `apps/web/src/routes/api/agent/stream/+server.ts`.
- Typed tool execution already exists in `apps/web/src/lib/services/agentic-chat/tools/core/tool-executor-refactored.ts`.
- Compact context hydration already exists through `packages/shared-types/src/functions/load_fastchat_context.sql`.
- Queue-backed long-running execution already exists through `packages/shared-types/src/functions/add_queue_job.sql` and the worker entrypoint in `apps/worker/src/index.ts`.
- A precedent for agent-run lifecycle modeling already exists in the Tree Agent path under `apps/web/src/routes/api/tree-agent/runs/+server.ts` and `packages/shared-types/src/tree-agent.types.ts`.
- A precedent for MCP-style typed tool access already exists in `apps/web/src/routes/api/agent/google-calendar/+server.ts`.

This integration should align with those patterns instead of inventing a parallel stack.

## Core Design Principle

The bridge between BuildOS and OpenCLAW must be identity-first, typed, permissioned, observable, and replayable.

That means:

- identity-first: every interaction begins by determining who is calling which user's BuildOS agent
- typed: agent capabilities are explicit and schema-validated
- permissioned: every tool call runs through BuildOS auth and project access rules
- observable: every run, step, tool call, and mutation is recorded
- replayable: we can inspect what happened and retry bounded failures

## High-Level Model

There are three layers in this interaction model.

### 1. External Call Layer

OpenCLAW calls a user's BuildOS agent.

Examples:

- identify the user/workspace being called
- authenticate the caller
- ask BuildOS to accept or reject the call
- establish a call session if accepted

This should happen through a call gateway owned by BuildOS.

### 2. BuildOS Agent Interaction Layer

Once the call is accepted, OpenCLAW interacts with the user's BuildOS agent.

Examples:

- list my projects
- get the state of this project
- search tasks related to onboarding
- create a task
- append a comment to a document

This should happen through a typed capability surface exposed by the user's BuildOS agent, ideally MCP/JSON-RPC compatible.

### 3. BuildOS -> OpenCLAW Delegation Layer

BuildOS delegates work to OpenCLAW.

Examples:

- review this project and return recommendations
- synthesize this document set into a brief
- run a research workflow on this topic
- analyze project risk and return findings

This should happen through queued agent runs owned by the worker.

## Proposed Foundation

The first foundation has six layers.

### Layer 1: User BuildOS Agent Identity

BuildOS creates a durable internal agent identity for each user.

This identity is the canonical callee for:

- human chat interactions
- internal BuildOS agent operations
- external inbound calls from OpenCLAW

### Layer 2: Call Gateway

BuildOS exposes an inbound call boundary.

This layer answers:

- who is calling
- which user's BuildOS agent is being called
- whether the call should be accepted or rejected
- what capability profile is available if the call is accepted

### Layer 3: Capability Manifest

The user's BuildOS agent exposes a minimal, typed capability surface for external agents.

This is the "list to be used by OpenCLAW."

Initial capability groups:

- project context
- search
- task operations
- document read
- comments/notes
- run status

### Layer 4: Call Contract

Every accepted inbound interaction becomes a durable call session.

This is the abstraction that captures:

- caller identity
- callee identity
- acceptance or rejection
- policy decisions
- active capability scope

### Layer 5: Run Contract

All delegated cross-agent work is represented as a durable run with status, events, and outputs.

This is the core abstraction that lets:

- humans inspect progress
- BuildOS stream updates
- workers retry safely
- future agents reuse the same infrastructure

Calls and runs are related but not identical:

- a call is a communication/session boundary
- a run is a unit of delegated work
- one call may create zero or more runs

### Layer 6: Worker-Owned Delegation

When BuildOS hands work to OpenCLAW, that handoff becomes a queue job processed by the worker.

The worker is responsible for:

- preparing context snapshots
- calling OpenCLAW
- handling retries and backoff
- normalizing outputs
- writing run events and artifacts back to BuildOS

### Layer 7: Human-Facing Surface

The web app remains the user-facing layer.

It is responsible for:

- starting delegated runs
- rendering run history
- streaming run events
- allowing approval/rejection when needed

## First-Iteration Scope

### In Scope

1. A BuildOS capability manifest for OpenCLAW.
2. A durable user BuildOS agent identity.
3. A durable inbound call lifecycle.
4. A durable `agent_bridge_run` lifecycle.
5. Queue-backed worker execution for OpenCLAW tasks.
6. A minimal BuildOS call gateway and MCP/JSON-RPC capability surface.
7. A small set of safe read tools and narrow write tools.
8. UI-visible call and run progress.

### Out of Scope

1. Freeform chat loops between two opaque assistants.
2. Full bidirectional memory sharing between BuildOS and OpenCLAW.
3. Letting OpenCLAW call arbitrary internal BuildOS tools.
4. Exposing Supabase directly to OpenCLAW.
5. Moving the existing chat runtime entirely into workers.

## First Capability List for OpenCLAW

These capabilities should be exposed by the user's BuildOS agent, not by BuildOS as a generic anonymous backend.

The first external capability list should be intentionally narrow.

### Read Tools

1. `list_projects`
   Returns the user's visible projects with compact metadata.

2. `get_project_snapshot`
   Returns a compact project snapshot derived from BuildOS context loading.

3. `search_entities`
   Searches tasks, goals, plans, and documents inside the user's visible scope.

4. `list_project_tasks`
   Lists tasks for one project with filters like state, assignee, due window.

5. `get_document`
   Returns a document body and metadata with size limits.

6. `list_project_documents`
   Lists project documents and lightweight summaries.

7. `get_run_status`
   Returns current state of a delegated run.

### Narrow Write Tools

1. `create_task`
   Creates a task inside a project.

2. `update_task`
   Updates limited task fields like title, state, due date, assignee.

3. `append_comment`
   Adds a comment to an entity thread or document thread.

4. `create_run_artifact`
   Stores a structured output, summary, or generated note produced by a delegated run.

### Explicitly Deferred Tools

- broad ontology mutation
- plan/goal graph rewiring
- arbitrary document overwrite
- user/account/admin operations
- bulk destructive changes

## Why Typed Tools Instead of "Agent Talks to Agent"

If OpenCLAW and BuildOS agents exchange freeform chat only, several problems appear immediately:

- permissions become unclear
- reproducibility disappears
- retries become unsafe
- mutation intent becomes ambiguous
- auditability gets weak
- model drift starts changing operational behavior

Typed capabilities solve that by turning "talking" into structured interaction:

- OpenCLAW calls a user's BuildOS agent
- the BuildOS agent decides whether to accept the interaction
- OpenCLAW asks that agent for context through named tools
- BuildOS enforces access control and schemas
- BuildOS records the tool call and result
- BuildOS decides which mutations are allowed

That is the correct substrate for cross-agent collaboration.

## Proposed System Architecture

```text
Human UI
  -> Web app
    -> talk to user's BuildOS agent / start run / stream progress / approve actions
  -> BuildOS DB + Realtime
    -> source of truth for projects, tasks, docs, calls, runs, events
  -> Call Gateway
    -> identify caller / identify callee / accept or reject call
  -> Queue
    -> worker claims delegated jobs
  -> Worker
    -> prepares context / calls OpenCLAW / normalizes outputs / writes events
  -> OpenCLAW
    -> calls user's BuildOS agent / uses allowed capabilities / returns structured outputs
```

## Call Lifecycle

### Core Call States

Proposed call status values:

- `dialing`
- `ringing`
- `accepted`
- `rejected`
- `active`
- `waiting_on_human`
- `ended`
- `failed`

### Call Acceptance Decision

When an inbound external-agent call arrives, BuildOS must evaluate:

1. Who is calling?
2. Which user's BuildOS agent are they trying to reach?
3. Is this caller registered for that user?
4. What scope is this caller requesting?
5. Should the call be auto-accepted, require approval, or be rejected immediately?

This is the literal "pick up or hang up" boundary.

### Acceptance Outcomes

- `accept`
  BuildOS creates an active call session and returns the allowed capability profile.

- `reject`
  BuildOS records the rejection and returns no active capability surface.

- `challenge`
  BuildOS pauses on human approval before allowing the call to continue.

## Run Lifecycle

### Core Run States

Proposed run status values:

- `queued`
- `preparing_context`
- `dispatching`
- `running`
- `waiting_on_human`
- `synthesizing`
- `completed`
- `failed`
- `canceled`

### Event Types

Proposed event types:

- `run.created`
- `run.context_prepared`
- `run.dispatched`
- `run.heartbeat`
- `run.tool_requested`
- `run.tool_result`
- `run.output_created`
- `run.awaiting_approval`
- `run.approved`
- `run.rejected`
- `run.completed`
- `run.failed`
- `run.canceled`

This should follow the same event-first mindset as Tree Agent rather than hiding all execution inside opaque logs.

## Proposed Data Model

The exact schema can change, but the concepts should be stable.

### `user_buildos_agents`

Represents the internal BuildOS agent identity for a user.

Suggested fields:

- `id`
- `user_id`
- `agent_handle`
  Example: `buildos:user:{user_id}`
- `status`
  Values: `active`, `paused`, `revoked`
- `default_policy jsonb`
- `metadata jsonb`
- `created_at`
- `updated_at`

### `agent_call_sessions`

Represents an inbound or outbound call involving a user's BuildOS agent.

Suggested fields:

- `id`
- `user_buildos_agent_id`
- `direction`
  Values: `inbound`, `outbound`
- `caller_type`
  Values: `human`, `openclaw`, `buildos_agent`, `automation`, `admin`
- `caller_id`
- `callee_type`
  Values: `buildos_agent`, `openclaw`
- `callee_id`
- `status`
- `requested_scope jsonb`
- `granted_scope jsonb`
- `connection_id` nullable
- `accepted_by_actor_id` nullable
- `rejection_reason` nullable
- `started_at`
- `ended_at` nullable
- `metadata jsonb`

### `agent_bridge_runs`

Represents one delegated cross-agent run.

Suggested fields:

- `id`
- `user_id`
- `agent_call_session_id` nullable
- `user_buildos_agent_id`
- `project_id` nullable
- `session_id` nullable
- `source_surface`
  Values: `human_chat`, `buildos_agent`, `automation`, `admin`
- `source_agent`
  Values like `buildos`, `openclaw`, `tree_agent`
- `target_agent`
  Values like `openclaw`
- `objective`
- `status`
- `context_type`
- `context_entity_id` nullable
- `capability_profile`
- `requested_by_actor_id` nullable
- `queue_job_id` nullable
- `started_at`
- `completed_at`
- `error_message` nullable
- `metadata jsonb`
- `metrics jsonb`

### `agent_bridge_events`

Append-only lifecycle events for a run.

Suggested fields:

- `id`
- `run_id`
- `seq`
- `event_type`
- `status_snapshot` nullable
- `payload jsonb`
- `created_at`

### `agent_bridge_artifacts`

Structured outputs produced by the run.

Suggested fields:

- `id`
- `run_id`
- `artifact_type`
  Values: `summary`, `finding`, `document`, `task_batch`, `json`
- `title`
- `content_markdown` nullable
- `content_json` nullable
- `entity_refs jsonb`
- `created_at`

### `external_agent_connections`

Connection metadata for external runtimes.

Suggested fields:

- `id`
- `user_id`
- `provider`
  Example: `openclaw`
- `status`
- `auth_mode`
- `scopes jsonb`
- `metadata jsonb`
- `last_checked_at`

### `external_agent_callers`

Represents caller identities that are allowed to dial a user's BuildOS agent.

Suggested fields:

- `id`
- `user_id`
- `provider`
  Example: `openclaw`
- `caller_key`
  Stable identifier for the external installation, runtime, or workspace
- `status`
  Values: `trusted`, `pending`, `revoked`
- `policy jsonb`
- `metadata jsonb`
- `created_at`
- `updated_at`

## Queue Jobs

Delegated external-agent work should use new queue job types rather than overloading chat routes.

Proposed initial job types:

- `agent_bridge_dispatch`
- `agent_bridge_poll`
- `agent_bridge_finalize`

### Responsibilities

`agent_bridge_dispatch`

- validate run
- load capability profile
- hydrate compact context snapshot
- call OpenCLAW
- write initial execution events

`agent_bridge_poll`

- poll or resume long-running external execution if needed
- refresh heartbeat
- ingest partial outputs

`agent_bridge_finalize`

- synthesize final outputs into BuildOS artifacts
- create tasks/comments if explicitly approved or allowed
- complete the run

## API / Contract Surface

### A. BuildOS Agent Call Gateway

Proposed path:

- `POST /api/agent-call/buildos`

Supported methods:

- `call.dial`
- `call.accept`
- `call.reject`
- `call.message`
- `call.hangup`
- `tools/list`
- `tools/call`

This endpoint is the phone boundary.

The expected flow is:

1. OpenCLAW dials the user's BuildOS agent.
2. BuildOS identifies the caller and callee.
3. BuildOS accepts, rejects, or challenges the call.
4. If accepted, the call session can use `tools/list` and `tools/call` within the granted scope.

### B. BuildOS Capability Surface Behind an Accepted Call

Optional implementation detail:

- `POST /api/mcp/buildos`

Supported methods:

- `tools/list`
- `tools/call`

If this separate endpoint exists, it should require an accepted `call_id` and only expose tools granted by the call gateway.

### C. Run Management Endpoints for the BuildOS UI

Proposed paths:

- `POST /api/agent-bridge/runs`
- `GET /api/agent-bridge/runs/:id`
- `POST /api/agent-bridge/runs/:id/cancel`
- `POST /api/agent-bridge/runs/:id/approve`
- `POST /api/agent-bridge/runs/:id/reject`

### D. Streaming / Realtime

The web layer should stream run updates to the UI using:

- SSE from a web endpoint backed by durable run events
- or Realtime subscriptions on `agent_bridge_events`

The worker should never become the direct UI transport layer.

The same principle applies to call sessions:

- call status should also be durably queryable and streamable from the web layer

## Context Contract

The context handed to OpenCLAW should be compact, explicit, and versioned.

### Context Principles

1. Send snapshots, not raw database access.
2. Prefer compact summaries over full graph dumps.
3. Include enough entity IDs for tool follow-ups.
4. Version the payload shape.

### Proposed Context Shape

```json
{
	"version": "v1",
	"context_type": "project",
	"project": {
		"id": "uuid",
		"name": "Project Name",
		"state_key": "active",
		"description": "..."
	},
	"highlights": {
		"tasks": [],
		"goals": [],
		"plans": [],
		"documents": []
	},
	"recent_activity": [],
	"available_tools": [
		"get_project_snapshot",
		"search_entities",
		"list_project_tasks",
		"get_document",
		"create_task",
		"append_comment"
	]
}
```

The compact project snapshot should be derived from existing BuildOS context loading instead of duplicating ontology read logic.

This context should be assembled by the user's BuildOS agent after a call is accepted, not pre-exposed before trust and scope are established.

## Human Approval Model

Not every agent action should auto-apply.

The first iteration should distinguish between:

### Auto-Allowed

- read operations
- run artifact creation
- non-destructive notes/comments in designated surfaces

### Approval Required

- creating multiple tasks
- modifying task ownership
- changing plan or goal structure
- overwriting documents
- any bulk mutation

This keeps the system trustworthy while still allowing useful delegation.

## Security Model

### Hard Rules

1. OpenCLAW never gets direct Supabase credentials.
2. Every inbound external interaction begins with caller identification.
3. Every BuildOS capability call runs through BuildOS authentication and authorization.
4. External agent calls are scoped to the target user's BuildOS agent and project visibility.
5. Secrets, tokens, and raw internal system prompts are never exposed through the capability layer.
6. Tool schemas are allowlist-based, not discover-everything-based.

### Threats to Plan For

- spoofed caller identity
- prompt injection from document content
- privilege confusion across projects
- agent-generated bulk mutations
- replayed external requests
- stale capability assumptions across versions

## Observability Requirements

This system must be easy to debug.

Track:

- caller identity
- callee BuildOS agent identity
- call acceptance or rejection reason
- run creation source
- queue job linkage
- context snapshot version
- external agent latency
- tool calls requested by OpenCLAW
- tool call latency and outcome
- approval wait time
- final artifact count
- token/cost metrics when available

## UX Requirements

The human should never feel like work disappeared into a black box.

The UI must show:

- which BuildOS agent is being used
- who is calling or which external agent is connected
- who started the run
- which agent is doing the work
- current status
- recent events
- pending approvals
- artifacts created
- final summary

This matters because the product goal is collaborative work between humans and agents, not hidden background automation.

## Implementation Phases

### Phase 0: Foundation Decision

Make these architecture decisions explicit:

1. BuildOS remains system of record.
2. Every user gets a BuildOS agent identity.
3. Web keeps interactive chat transport.
4. Worker owns delegated external-agent execution.
5. OpenCLAW integration happens through a call gateway, typed capabilities, and durable runs.

### Phase 1: BuildOS Agent Identity + Call Gateway

Deliverables:

1. Define the user BuildOS agent abstraction.
2. Define caller/callee identity rules.
3. Add `agent_call_sessions` and caller registration models.
4. Add the inbound BuildOS call gateway.

Success criteria:

- OpenCLAW can dial a user's BuildOS agent and BuildOS can accept or reject the call.

### Phase 2: Capability Manifest

Deliverables:

1. Define initial external tool list.
2. Create schemas and result envelopes.
3. Expose the capability surface behind an accepted call.
4. Restrict to read-heavy and narrow-write actions.

Success criteria:

- OpenCLAW can discover and call safe tools on the user's BuildOS agent.

### Phase 3: Run Lifecycle

Deliverables:

1. Add run/event/artifact tables.
2. Add shared types for run status and events.
3. Link runs to call sessions and user BuildOS agents.

Success criteria:

- BuildOS can persist delegated work created from an accepted call.

### Phase 4: Worker Delegation

Deliverables:

1. Add queue job types for dispatch/poll/finalize.
2. Add worker processor for OpenCLAW-bound runs.
3. Add retries, cancellation, and failure handling.

Success criteria:

- BuildOS can queue a delegated run and process it out-of-band.

### Phase 5: Human Review + Streaming

Deliverables:

1. Show call progress and run progress in the UI.
2. Show approvals when mutations require confirmation.
3. Stream or subscribe to event updates.

Success criteria:

- A human can see when their BuildOS agent received a call, accepted work, and what happened next.

### Phase 6: BuildOS Agent Delegation

Deliverables:

1. Let a BuildOS agent initiate outbound calls or delegated runs.
2. Add internal handoff patterns between BuildOS agents and OpenCLAW.
3. Preserve durable call and run context across those handoffs.

Success criteria:

- BuildOS agents can collaborate with OpenCLAW through the same call and run contracts as humans.

## Explicit Non-Decision

This spec does not yet decide whether OpenCLAW itself uses:

- synchronous request/response execution
- long-lived session threads
- polling-based run state
- webhook callbacks into BuildOS

The bridge should be designed so any of those can fit behind the worker adapter.

## Open Questions

1. Should the first human-facing surface live inside the existing agent chat UI, or as a separate "delegated run" UI?
2. Which narrow write actions should be auto-allowed in v1?
3. Should the user's BuildOS agent have one stable handle format, or should handles be provider-specific aliases?
4. Should OpenCLAW receive one compact project snapshot only, or be expected to fetch most details tool-by-tool?
5. Do we want a provider-neutral external-agent adapter from day one, or a direct OpenCLAW adapter first?
6. How should approval prompts appear in chat versus elsewhere in the UI?

## Recommended Next Step

The immediate next implementation step should be:

1. define the user BuildOS agent identity model
2. define the inbound call lifecycle and `agent_call_sessions` schema
3. define the v1 OpenCLAW capability manifest exposed by that agent
4. define the `agent_bridge_runs` and `agent_bridge_events` schema
5. queue delegated runs through the worker instead of attempting assistant-to-assistant freeform chat

That is the minimum real foundation for the collaboration model this product wants.

## Summary Decision

The foundation we are building is a human/AI/agent collaboration layer inside BuildOS.

OpenCLAW should plug into that layer through:

- a user-scoped BuildOS agent identity
- an authenticated call boundary
- typed BuildOS agent capabilities
- durable delegated runs
- worker-owned execution
- human-visible progress and approvals

That gives BuildOS a clean path from "AI chat feature" to "shared operating environment for people and agents."
