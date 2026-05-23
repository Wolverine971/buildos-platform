---
layout: docs
title: Connect Your Agents
slug: connect-agents
summary: One key. Every project. Connect Claude Code, OpenClaw, ChatGPT Actions, Codex, or any HTTP-capable tool to your BuildOS workspace with setup instructions tailored to the client.
icon: Plug
order: 9
lastUpdated: 2026-05-13
path: apps/web/src/content/docs/connect-agents.md
---

Your messy thinking lives in BuildOS. Your AI tools — Claude Code, OpenClaw, Codex, ChatGPT Actions, custom HTTP clients, and browser-based remote connectors — can read off the same sheet of paper instead of starting from zero each session.

Generate a key. Choose where you are installing it. BuildOS gives you the right storage instructions for that client. Local tools usually use env or MCP config. Private ChatGPT Actions use the Action authentication secret. Browser/cloud clients should use a remote connector with OAuth.

Per-project scope. Per-op write whitelist. Audit log. Rotate or revoke any time. No retraining your agents on your context every session.

## What agents should do first

BuildOS is usually a workspace with many projects. After an agent connects, it should:

1. Call `call.dial`.
2. Call `tools/list` and use the direct tool names it returns.
3. If it is about to work inside an existing project, call `get_onto_project_status` with the `project_id` first.

`get_onto_project_status` is the BuildOS equivalent of `git status` for a project. It returns the compact snapshot an agent needs before deeper reads or writes: project description, task/document/plan/goal/collaborator counts, active collaborators, recent changes, overdue and due-soon tasks, and upcoming events.

## Client profiles

Same BuildOS auth core. Different save location.

| Client profile                   | Best storage path                         | Status                                                       |
| -------------------------------- | ----------------------------------------- | ------------------------------------------------------------ |
| **OpenClaw**                     | OpenClaw env, SecretRef, or plugin config | BuildOS side ready; OpenClaw connector in progress           |
| **Claude Code**                  | Local MCP config env/header or adapter    | BuildOS gateway ready; MCP facade/adapter is the clean path  |
| **ChatGPT Actions**              | GPT Action API key secret                 | Ready for private GPTs; use OAuth before sharing broadly     |
| **Codex CLI / IDE**              | Codex MCP config env reference            | BuildOS gateway ready; MCP facade/adapter is the clean path  |
| **Claude browser / ChatGPT MCP** | Remote MCP OAuth connector                | Needs OAuth-backed remote connector, not pasted bearer token |
| **Custom HTTP / scripts**        | Your env file or secret manager           | Ready                                                        |

If your tool can make an HTTP request with a bearer token, it can call the gateway today. If the client runs in someone else's browser/cloud account, use OAuth-backed remote MCP instead of asking the model to remember a token.

## Generate an agent key

1. Go to [`/profile`](/profile) and open the **Agent Keys** tab.
2. Click **Generate**.
3. Choose the **Client Profile** for the place this key will be installed.
4. Pick a **scope**:
    - `read_only` — reads only, no writes.
    - `read_write` — reads plus the writes you whitelist.
5. Choose **which projects** the key can see — all of them or an explicit list.
6. If you picked `read_write`, whitelist the specific write ops.
7. Copy the profile-specific setup block. The one-time secret shows only once; BuildOS stores a prefix for identification and never the full key.
8. Save it in the profile's config, secret store, Action auth field, or connector backend.

[`/integrations`](/integrations) has the same flow plus the public landing page.

## Setting it up in Claude Code

Choose the **Claude Code** client profile when generating the key.

1. **Generate a key** as above. Copy the env block.
2. **Store it in local config or env** used by your BuildOS MCP adapter/facade. Never paste the token into chat input.
3. **Ask Claude to dial:**

    > "Connect to BuildOS and list my projects."

    Claude will use the configured BuildOS transport, open a session, and show your projects. When you pick a project, it should call `get_onto_project_status` before deeper reads or writes. Until the MCP facade ships, the JSON-RPC gateway at `POST /api/agent-call/buildos` is the fallback.

The env block looks like:

```env
BUILDOS_BASE_URL=https://build-os.com
BUILDOS_AGENT_TOKEN=boca_your_one_time_secret
BUILDOS_CALLEE_HANDLE=buildos:user:YOUR_USER_ID
BUILDOS_CALLER_KEY=claude-code:local:your-handle
```

## Setting it up in Cursor

Cursor uses the same env block. Drop it into your Cursor agent settings (the place where Cursor stores env vars and secrets for the workspace). Then prompt:

> "Connect to BuildOS, list my projects."

Cursor will use the bearer token to dial the gateway. Same tool surface as Claude Code. For project work, ask it to call `get_onto_project_status` first so it has the current project snapshot.

## Setting it up in Claude Desktop and Claude browser

There are two different paths:

- **Local MCP config** behaves like Claude Code: env/header storage is fine if the server runs locally.
- **Claude browser or cloud-brokered remote connectors** need a public remote MCP server with OAuth. Browser chat is not a secret store, and Claude's cloud cannot read your local env.

For remote connectors, BuildOS should expose an MCP facade and OAuth flow. The generated profile currently marks this as `requires_oauth`.

## Setting it up in ChatGPT (Custom GPT)

Choose **ChatGPT Actions** for a private Custom GPT:

1. In your Custom GPT, add a new Action.
2. Use **API key** auth with **Bearer** placement, and paste the one-time BuildOS token into the Action authentication secret.
3. Import the OpenAPI artifact from the BuildOS bootstrap document.
4. Point it at `POST https://build-os.com/api/agent-call/buildos` with a JSON-RPC body.

The Custom GPT can then run `call.dial → tools/list → tools/call → call.hangup` like any other client.

For shared GPTs or workspace-wide installs, use OAuth instead of a single bearer token.

## Setting it up in ChatGPT Developer Mode

Choose **ChatGPT Developer Mode** only when you are building a remote MCP connector. Developer Mode is the right path for full read/write tools in ChatGPT, but it should be backed by a remote MCP server and OAuth, not a pasted BuildOS bearer token.

## Setting it up in OpenClaw

Choose **OpenClaw** when generating the key. Store the values in OpenClaw env, SecretRef, or plugin config. The OpenClaw-specific connector is still mid-build. Once it ships, it should read those values and call the BuildOS gateway. See [`/docs/integrations/openclaw/setup`](/docs/integrations/openclaw/setup) for the OpenClaw-only walkthrough.

## What you can scope

| Control                | What it does                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------- |
| **Mode**               | `read_only` blocks every write op. `read_write` allows the ones you whitelist.     |
| **Project scope**      | All projects or an explicit allowlist. Keys can't reach projects outside the list. |
| **Write op whitelist** | Per-op toggle for every mutation the gateway exposes.                              |
| **Audit trail**        | Every call is logged with the key prefix, the op, and the entity touched.          |

## Permission bundles

The Agent Keys UI leads with preset bundles. Pick one and you're done — the per-op matrix sits behind an **Advanced permissions** disclosure if you need finer control.

| Bundle                                        | What it grants                                                          |
| --------------------------------------------- | ----------------------------------------------------------------------- |
| **Read only**                                 | Every read op. No writes.                                               |
| **Author docs + tasks** (recommended default) | Reads plus `onto.document.create/update` and `onto.task.create/update`. |
| **Full read/write**                           | Reads plus every write op the gateway currently exposes.                |
| **Custom**                                    | Any per-op combination you pick in Advanced.                            |

Existing keys that still carry the old narrow default (task writes only) auto-upgrade to **Author docs + tasks** on the next call — no action needed.

Project creation is intentionally broader than project-scoped writes: `onto.project.create` requires `read_write` plus all-project access. If a key or MCP grant is limited to selected project IDs, it can update those projects but cannot create a new one because there is no pre-existing `project_id` to authorize.

## What's exposed

**Reads** (available on every key)

- `onto.project.list`, `onto.project.search`, `onto.project.get`, `onto.project.status.get`
- `onto.task.list`, `onto.task.search`, `onto.task.get`
- `onto.document.list`, `onto.document.search`, `onto.document.get`
- `onto.search`

**Writes** (require `read_write`)

- `onto.task.create`, `onto.task.update`
- `onto.document.create`, `onto.document.update`
- `onto.project.create`, `onto.project.update`
- `onto.goal.create`, `onto.goal.update`
- `onto.plan.create`, `onto.plan.update`
- `onto.milestone.create`, `onto.milestone.update`
- `onto.risk.create`, `onto.risk.update`

**Discovery**

- `skill_load`, `tool_search`, `tool_schema`

**Session methods**

- `call.dial`, `tools/list`, `tools/call`, `call.hangup`

## Getting Project Status

The project status op is `onto.project.status.get`, exposed by `tools/list` as `get_onto_project_status`. It is read-only and available on normal read grants.

Use it when an agent first attaches to a known project, before it starts searching individual tasks or documents. It returns:

- `overview`: short description, task/document/plan/goal/collaborator counts, count summary, and next step when available
- `collaborators`: active project members with actor ID, display name, email when available, role/access, role profile, and whether the member is the connected user
- `recent_changes`: most recent project log entries with entity type, action, title, timestamp, and source
- `upcoming`: overdue tasks, due-soon tasks, upcoming project events, and the time windows used

If the agent does not know the project ID yet, it can list/search projects first, or pass a `query` if the status tool is available and the project name is clear.

```json
{
	"method": "tools/call",
	"params": {
		"call_id": "<your call id>",
		"name": "get_onto_project_status",
		"arguments": {
			"project_id": "<project uuid>"
		}
	}
}
```

## Saving a markdown document from an external agent

The headline v1 write op is `onto.document.create`, exposed by `tools/list` as `create_onto_document`. Any connected tool can save a markdown artifact into a specific project in a single call.

```json
{
	"method": "tools/call",
	"params": {
		"call_id": "<your call id>",
		"name": "create_onto_document",
		"arguments": {
			"project_id": "<project uuid>",
			"title": "Research: creator distribution loops",
			"content": "# Research\n\nFull markdown body here...",
			"description": "Initial pass on distribution tactics",
			"state_key": "draft",
			"idempotency_key": "claude-code:<project>:research-creator-distribution-loops:2026-05-11"
		}
	}
}
```

Notes:

- Content is stored as-is. No H1/H2 tree parsing; the markdown you send is the markdown we save.
- Content cap is **200 KB** per document. Larger bodies return `VALIDATION_ERROR`.
- `body_markdown` is accepted as a legacy alias for `content` on create and update.
- `onto.document.update` defaults to **replace**. It also accepts `update_strategy: "append"` and `update_strategy: "merge_llm"`; on the external gateway, `merge_llm` gracefully falls back to append when no merge worker is available.
- `parent_document_id` is optional; omit it to land at the project root.
- `parent_id` is also accepted as a legacy alias on the external gateway when a model uses the internal `create_onto_document` naming.
- `position` is optional on create for sibling ordering within the project document tree.
- Documents created through the gateway are tagged with `props.origin = "external_agent"` for auditability.

## Creating a project from an external agent

The project creation op is `onto.project.create`, exposed by `tools/list` as `create_onto_project`. It uses the same `ProjectSpec` contract as internal BuildOS project creation: include `project`, `entities`, and `relationships`; use empty arrays when the new project should start minimal.

```json
{
	"method": "tools/call",
	"params": {
		"call_id": "<your call id>",
		"name": "create_onto_project",
		"arguments": {
			"idempotency_key": "claude-code:project:creator-launch-plan:2026-05-21",
			"project": {
				"name": "Creator Launch Plan",
				"type_key": "project.business.product_launch",
				"description": "Plan and assets for launching the creator product."
			},
			"entities": [],
			"relationships": []
		}
	}
}
```

Notes:

- `project.type_key` must use the `project.{realm}.{domain}` format, for example `project.business.product_launch`.
- `entities` can include initial `task`, `document`, `goal`, `plan`, `milestone`, `risk`, `requirement`, `metric`, and `source` records using `temp_id` references.
- `relationships` connects `temp_id` entities to each other. The project itself is implicit and should not be a relationship endpoint.
- Optional `context_document` creates a `document.context.project` document linked to the project.
- Remote MCP read/write grants include project create/update. Project creation is omitted from `tools/list` when the grant is scoped to selected project IDs.

## One-click bootstrap

When you generate a key in the UI, BuildOS also produces a bootstrap URL:

```
GET /api/agent-call/bootstrap/<setupToken>
```

That endpoint returns an `agent_profile_bootstrap_v1` document with:

- the BuildOS env block
- client-specific storage targets
- setup steps
- artifacts such as a ChatGPT Action OpenAPI schema or MCP config target notes
- guidance to call `get_onto_project_status` first for existing project work
- OAuth guidance for browser/cloud clients

It is short-lived and returns `Cache-Control: no-store`.

## Custom agents

If you're building your own client, point it at:

```
POST https://build-os.com/api/agent-call/buildos
Authorization: Bearer <your agent key>
Content-Type: application/json
```

Payload is JSON-RPC. Start with `call.dial`, list your tools with `tools/list`, call them via `tools/call`, and close with `call.hangup`. Types live in `packages/shared-types/src/agent-call.types.ts`.

## Roadmap

- **Project, document, task, goal, plan, milestone, and risk writes** — **shipped.** External agents can create and update the same core ontology primitives used by internal BuildOS chat, subject to scope, write audit, and idempotency.
- **Content idea wrappers** — still planned. They should compose the shipped primitives rather than inventing a separate top-level entity.

Design doc: `apps/web/docs/features/agent-call/MULTI_SURFACE_CONTENT_IDEA_WORKFLOW.md`.

## Next

- [Reference & Help](/docs/reference)
- [Integrations](/integrations) — per-agent setup walk-throughs.
