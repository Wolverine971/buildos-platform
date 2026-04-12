<!-- docs/technical/implementation/OPENCLAW_BUILDOS_CALL_GATEWAY_V1_IMPLEMENTATION_SPEC.md -->

# OpenCLAW + BuildOS Call Gateway V1 Implementation Spec

Status: Historical foundation spec. For the current external-agent tool contract, use
[OpenClaw + BuildOS External Tool Gateway Spec](./OPENCLAW_BUILDOS_EXTERNAL_TOOL_GATEWAY_SPEC.md).

## Purpose

This document turns the foundation spec into a buildable v1.

It answers one question:

Are we ready to implement?

Answer:

- yes for a narrow v1
- no for the full long-term vision

We should start by implementing the inbound call boundary for a user's BuildOS agent, not full assistant-to-assistant freeform collaboration.

## Build-Start Line

The first implementation slice should support:

1. a durable internal BuildOS agent identity for each user
2. an authenticated inbound caller model for OpenCLAW
3. a call session that can be accepted or rejected
4. a small scoped direct-tool surface behind an accepted call
5. optional narrow writes exposed only when explicitly granted

This is enough to prove the abstraction and start integration safely.

## Readiness Assessment

### What Already Exists in the Repo

The repo already has strong implementation patterns we can reuse:

- user auth in web endpoints through `safeGetSession`
- project/actor authorization through `ensure_actor_for_user` and `current_actor_has_project_access`
- queue-backed long-running execution through `add_queue_job`, worker processors, and `queue.process(...)`
- durable run/event modeling through Tree Agent
- MCP-style request handling through the Google Calendar endpoint
- webhook/cron authentication patterns through bearer secrets and signature validation

### What Is Missing

The repo does not yet have:

1. a user-scoped BuildOS agent principal
2. an external caller identity model
3. an inbound call-session schema
4. a public BuildOS agent tool manifest distinct from internal tool definitions
5. a concrete external-agent auth contract

That means we are not ready to implement the entire OpenCLAW bridge, but we are ready to implement the first production-grade slice.

## Explicit V1 Scope

### In Scope

1. `user_buildos_agents`
2. `external_agent_callers`
3. `agent_call_sessions`
4. a call gateway endpoint
5. accepted-call-scoped `tools/list`
6. accepted-call-scoped `tools/call`
7. scoped direct tools for project, task, document, and search context

### Out of Scope

1. freeform `call.message` semantics
2. long-running OpenCLAW delegation from BuildOS
3. mutation-heavy tools
4. human approval workflows
5. outbound calls initiated by BuildOS agents
6. provider-neutral external-agent abstraction

## Key V1 Decision

V1 should be read-mostly.

Do not start with:

- assistant-to-assistant conversational bridging
- write-heavy mutations
- async run orchestration to OpenCLAW

Start with:

- caller identity
- call acceptance
- scoped context access

This keeps the first implementation small enough to ship and validate.

## V1 Auth Decision

### Decision

Use per-caller bearer tokens in v1.

Do not start with HMAC-signed payloads unless OpenCLAW integration mechanics require it.

### Why

This repo already uses bearer-secret patterns for trusted server-to-server calls and cron authorization.

Bearer tokens are enough for v1 if:

- tokens are generated randomly
- tokens are stored hashed
- tokens are scoped to one user and one caller installation
- all calls happen over TLS

This is simpler than HMAC while still giving us strong caller identity.

### V1 Caller Token Model

Each external caller gets:

- `caller_key`
  Stable logical identity, e.g. `openclaw:workspace:abc123`
- `token_prefix`
  Short visible token prefix for debugging and lookup
- `token_hash`
  SHA-256 hash of the full bearer token

Incoming request flow:

1. read `Authorization: Bearer <token>`
2. hash token server-side
3. look up active `external_agent_callers` row by hash
4. resolve the user and allowed BuildOS agent
5. continue only if caller is active and trusted

## V1 Policy Decision

V1 should support only two call outcomes:

- `accept`
- `reject`

Do not implement `challenge` in v1.

Reason:

- challenge implies approval UX
- approval UX implies new state transitions and human workflow design
- that is a second slice, not part of the first safe implementation

## V1 Call Flow

### Step 1: Dial

OpenCLAW sends:

- bearer token
- target `callee_handle`
- requested scope

BuildOS:

- authenticates caller
- resolves target user BuildOS agent
- evaluates policy
- creates `agent_call_sessions`
- returns `accepted` or `rejected`

### Step 2: List Tools

If the call is accepted, OpenCLAW requests:

- `tools/list`

BuildOS returns only the tools allowed by:

- caller status
- user policy
- call scope

### Step 3: Call Tools

OpenCLAW uses:

- `tools/call`

BuildOS executes only the public BuildOS agent tools allowed for that call.

### Step 4: Hang Up

OpenCLAW or BuildOS ends the call with:

- `call.hangup`

BuildOS marks the call session ended.

## V1 API Contract

### Endpoint

`POST /api/agent-call/buildos`

### Supported Methods

- `call.dial`
- `tools/list`
- `tools/call`
- `call.hangup`

### Explicitly Excluded in V1

- `call.message`
- `call.accept`
- `call.reject`

Those are not needed because acceptance is decided during `call.dial`.

## Request / Response Shapes

### `call.dial`

Request:

```json
{
	"method": "call.dial",
	"params": {
		"callee_handle": "buildos:user:USER_ID",
		"requested_scope": {
			"mode": "read_only",
			"project_ids": ["uuid"]
		},
		"client": {
			"provider": "openclaw",
			"caller_key": "openclaw:workspace:abc123"
		}
	}
}
```

Success response:

```json
{
	"call": {
		"id": "uuid",
		"status": "accepted",
		"callee_handle": "buildos:user:USER_ID",
		"granted_scope": {
			"mode": "read_only",
			"project_ids": ["uuid"]
		}
	}
}
```

Rejected response:

```json
{
	"call": {
		"id": "uuid",
		"status": "rejected",
		"reason": "caller_not_allowed"
	}
}
```

### `tools/list`

Request:

```json
{
	"method": "tools/list",
	"params": {
		"call_id": "uuid"
	}
}
```

Response:

```json
{
	"tools": [
		{
			"name": "list_projects",
			"description": "List projects visible to the user BuildOS agent",
			"inputSchema": {}
		}
	]
}
```

### `tools/call`

Request:

```json
{
	"method": "tools/call",
	"params": {
		"call_id": "uuid",
		"name": "get_project_snapshot",
		"arguments": {
			"project_id": "uuid"
		}
	}
}
```

### `call.hangup`

Request:

```json
{
	"method": "call.hangup",
	"params": {
		"call_id": "uuid"
	}
}
```

## V1 Public Tool Manifest

These tools should be implemented as public BuildOS agent tools, not direct exposure of the internal full agent tool registry.

### Read Tools

1. `list_projects`
2. `get_project_snapshot`
3. `search_entities`
4. `list_project_tasks`
5. `list_project_documents`
6. `get_document`

### Why These

- enough to let OpenCLAW inspect a user workspace
- enough to validate scoping and authorization
- enough to prove the BuildOS-agent-as-callee model
- low risk compared with write paths

### Narrow Writes Deferred

Defer these until after read-path validation:

- `create_task`
- `update_task`
- `append_comment`

## V1 Data Model

### `user_buildos_agents`

Suggested columns:

- `id uuid primary key`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `agent_handle text not null unique`
- `status text not null`
- `default_policy jsonb not null default '{}'::jsonb`
- `metadata jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

V1 policy:

- create lazily on first use
- one row per user

### `external_agent_callers`

Suggested columns:

- `id uuid primary key`
- `user_id uuid not null references auth.users(id) on delete cascade`
- `provider text not null`
- `caller_key text not null`
- `token_prefix text not null`
- `token_hash text not null unique`
- `status text not null`
- `policy jsonb not null default '{}'::jsonb`
- `metadata jsonb not null default '{}'::jsonb`
- `last_used_at timestamptz null`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Unique suggestion:

- unique `(user_id, provider, caller_key)`

### `agent_call_sessions`

Suggested columns:

- `id uuid primary key`
- `user_buildos_agent_id uuid not null references user_buildos_agents(id) on delete cascade`
- `external_agent_caller_id uuid not null references external_agent_callers(id) on delete cascade`
- `direction text not null default 'inbound'`
- `status text not null`
- `requested_scope jsonb not null default '{}'::jsonb`
- `granted_scope jsonb not null default '{}'::jsonb`
- `rejection_reason text null`
- `started_at timestamptz not null default now()`
- `ended_at timestamptz null`
- `metadata jsonb not null default '{}'::jsonb`

### Optional V1 Event Table

If we want immediate traceability, add:

`agent_call_events`

Suggested columns:

- `id uuid primary key`
- `call_session_id uuid not null references agent_call_sessions(id) on delete cascade`
- `seq bigint null`
- `event_type text not null`
- `payload jsonb not null default '{}'::jsonb`
- `created_at timestamptz not null default now()`

This follows the same pattern as `tree_agent_events`.

## Authorization Model

### Layer 1: Caller Auth

Resolve caller from bearer token.

### Layer 2: Callee Resolution

Resolve `callee_handle` to `user_buildos_agents`.

### Layer 3: Scope Policy

Reject if:

- caller is revoked
- caller is not registered for that user
- requested scope exceeds caller policy

### Layer 4: Tool-Level Authorization

Each tool call must still enforce:

- project access
- document access
- entity existence
- scope restrictions from the accepted call

## Implementation Mapping to Existing Code

### Reuse As-Is

- `safeGetSession` patterns for human-facing routes
- `ensure_actor_for_user` for user actor resolution
- `current_actor_has_project_access` for project checks
- `load_fastchat_context.sql` for compact project snapshots
- `ApiResponse` response helpers
- Tree Agent event-table pattern
- worker queue registration pattern

### New Code Needed

1. `apps/web/src/routes/api/agent-call/buildos/+server.ts`
2. `apps/web/src/lib/server/agent-call/` service layer
3. `packages/shared-types/src/agent-call.types.ts`
4. migration for `user_buildos_agents`, `external_agent_callers`, `agent_call_sessions`
5. public BuildOS agent tool registry

## Suggested File Layout

### Web

- `apps/web/src/routes/api/agent-call/buildos/+server.ts`
- `apps/web/src/lib/server/agent-call/agent-call-service.ts`
- `apps/web/src/lib/server/agent-call/caller-auth.ts`
- `apps/web/src/lib/server/agent-call/callee-resolution.ts`
- `apps/web/src/lib/server/agent-call/public-tool-registry.ts`
- `apps/web/src/lib/server/agent-call/public-tool-executor.ts`

### Shared Types

- `packages/shared-types/src/agent-call.types.ts`

### Database

- new migration for the three new tables

## V1 Build Sequence

### Step 1

Add schema and shared types:

- `user_buildos_agents`
- `external_agent_callers`
- `agent_call_sessions`

### Step 2

Implement caller auth:

- bearer token parsing
- token hashing
- caller lookup

### Step 3

Implement call gateway:

- `call.dial`
- `call.hangup`

### Step 4

Implement public read tools:

- `list_projects`
- `get_project_snapshot`
- `search_entities`
- `list_project_tasks`
- `list_project_documents`
- `get_document`

### Step 5

Add logging and tests:

- accepted call
- rejected call
- scoped tool list
- rejected tool call outside scope

## Testing Requirements

### Endpoint Tests

1. missing bearer token returns unauthorized
2. revoked caller returns unauthorized
3. unknown callee handle returns not found or forbidden
4. accepted call returns granted scope
5. rejected call is persisted

### Tool Tests

1. `tools/list` requires accepted call
2. `tools/call` requires accepted call
3. project-scoped call cannot read another project
4. document access respects scope

### Migration / RLS Tests

1. user-scoped rows are isolated
2. server-side/admin access for trusted gateway code works

## What We Should Not Build Yet

Do not implement in the first pass:

- async polling to OpenCLAW
- worker-based OpenCLAW runs
- write tools
- approval UX
- freeform `call.message`

Those belong in phase two.

## Phase Two After V1

After the inbound call gateway works for scoped direct tools, the next slice should add:

1. narrow write tools
2. human approval model
3. `agent_bridge_runs`
4. worker job types for OpenCLAW delegation

That is when the larger bridge vision becomes implementable without guessing.

## Decision

We are ready to implement a narrow v1 now.

We are not ready to implement the full OpenCLAW + BuildOS bridge in one pass.

The correct next move is:

- build the user BuildOS agent identity
- build the caller-authenticated inbound call gateway
- ship the scoped direct public tool surface

That gives us a stable substrate for the rest of the system.
