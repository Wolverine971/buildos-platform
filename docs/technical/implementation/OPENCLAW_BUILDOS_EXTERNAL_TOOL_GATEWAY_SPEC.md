<!-- docs/technical/implementation/OPENCLAW_BUILDOS_EXTERNAL_TOOL_GATEWAY_SPEC.md -->

# OpenClaw + BuildOS External Tool Gateway Spec

Date: 2026-04-11
Status: Current external-agent direct-tool contract

## Purpose

This document defines how external agents like OpenClaw should discover and execute BuildOS tools.

The current contract follows the same direction as the agentic chat hybrid tool surface:

- BuildOS keeps the outer call/session protocol stable.
- BuildOS returns a scoped list of typed direct tools after `call.dial`.
- `skill_load`, `tool_search`, and `tool_schema` remain support tools.
- Normal reads and writes execute through direct tool names.
- Generic execution wrappers are not part of the current model-facing contract.

This supersedes the earlier gateway-only design that taught external agents to execute through generic wrappers.

## Stable Outer Protocol

External agents call:

```text
POST /api/agent-call/buildos
Authorization: Bearer <BUILDOS_AGENT_TOKEN>
Content-Type: application/json
```

Supported methods:

- `call.dial`
- `tools/list`
- `tools/call`
- `call.hangup`

The bearer token identifies the registered external caller. The accepted call session constrains which tools can be listed and called.

## Current Tool Surface

After `call.dial` succeeds, `tools/list` returns:

1. Discovery/support tools:
    - `skill_load`
    - `tool_search`
    - `tool_schema`
2. Scoped direct tools derived from the granted BuildOS ops.

Examples of direct tools:

- `list_onto_projects`
- `search_onto_projects`
- `get_onto_project_details`
- `list_onto_tasks`
- `search_onto_tasks`
- `get_onto_task_details`
- `list_onto_documents`
- `search_onto_documents`
- `get_onto_document_details`
- `search_ontology`
- `create_onto_task`
- `update_onto_task`

Write tools appear only when the caller is granted `read_write` scope and the corresponding write op is in `allowed_ops`.

## Execution Model

The model-facing action should be the direct tool.

Preferred flow:

1. Use the current context and the `tools/list` response first.
2. If the exact tool is unknown, call `tool_search`.
3. If the exact arguments are uncertain, call `tool_schema`.
4. Call the returned direct `tool_name` with concrete arguments.

Example:

```json
{
	"method": "tools/call",
	"params": {
		"call_id": "<call_id>",
		"name": "list_onto_tasks",
		"arguments": {
			"project_id": "<project_uuid>",
			"limit": 20
		}
	}
}
```

For a write:

```json
{
	"method": "tools/call",
	"params": {
		"call_id": "<call_id>",
		"name": "update_onto_task",
		"arguments": {
			"task_id": "<task_uuid>",
			"state_key": "done",
			"idempotency_key": "openclaw-task-update-123"
		}
	}
}
```

The `idempotency_key` and `dry_run` arguments are external write metadata. BuildOS strips those before calling the underlying task handler and uses them for write safety.

## Scope And Policy

BuildOS filters direct tools from the accepted call scope.

Read access can expose:

- project list/search/get
- task list/search/get
- document list/search/get
- ontology search

Read-write access can additionally expose:

- task create
- task update

Project scoping is enforced inside each tool handler. A caller must not infer the existence of scoped-out entities from direct tool failures.

## OpenClaw Plugin Shape

OpenClaw should use a dedicated BuildOS plugin or connector.

The connector should:

1. read `BUILDOS_BASE_URL`, `BUILDOS_AGENT_TOKEN`, `BUILDOS_CALLEE_HANDLE`, and `BUILDOS_CALLER_KEY` from secure config,
2. call `call.dial`,
3. call `tools/list`,
4. register or proxy the returned direct tools for the model,
5. call BuildOS `tools/call` when the model invokes a BuildOS tool,
6. reuse or refresh the call session as needed,
7. call `call.hangup` when the session is finished.

OpenClaw may prefix the model-facing names locally if needed to avoid conflicts, but the BuildOS `tools/call` request should send the BuildOS tool name returned by `tools/list`.

## Prompt Guidance

Tell OpenClaw:

```text
Use the configured BuildOS credentials.

Dial BuildOS, list the available BuildOS tools, and use the scoped direct tools returned by tools/list.

Use tool_search only when the exact BuildOS tool is unclear.
Use tool_schema before first-time or uncertain writes.
After tool_schema, call the returned direct tool_name with concrete arguments.

Do not ask the user to paste BuildOS secrets into normal chat.
Never guess project_id, task_id, document_id, or other required IDs.
If a write tool returns FORBIDDEN, inspect the granted scope and allowed ops before retrying.
```

## What Not To Document

Do not teach external agents to execute normal BuildOS work through generic wrappers.

Do not document old flat public tools such as:

- `list_projects`
- `get_project_snapshot`
- `search_entities`

Do not tell users to paste live BuildOS tokens into normal chat. Tokens belong in OpenClaw plugin config, env config, or secret storage.

## Runtime Source Files

- `/packages/shared-types/src/agent-call.types.ts`
- `/apps/web/src/lib/server/agent-call/agent-call-service.ts`
- `/apps/web/src/lib/server/agent-call/external-tool-gateway.ts`
- `/apps/web/src/lib/server/agent-call/bootstrap-link.service.ts`
- `/apps/web/src/lib/components/profile/AgentKeysTab.svelte`
