---
layout: docs
title: Connect Your Agents
slug: connect-agents
summary: One key. Every project. Connect Claude Code, Cursor, Claude Desktop, ChatGPT, or any HTTP-capable tool to your BuildOS workspace so they read off the same sheet of paper instead of starting from zero each session.
icon: Plug
order: 9
lastUpdated: 2026-05-11
path: apps/web/src/content/docs/connect-agents.md
---

Your messy thinking lives in BuildOS. Your AI tools — Claude Code, Cursor, Claude Desktop, ChatGPT, anything that can call HTTP — can read off the same sheet of paper instead of starting from zero each session.

Generate a key. Paste it into your AI tool's config. Now that tool can see your projects, read your tasks and docs, and (if you allow it) write back to them.

Per-project scope. Per-op write whitelist. Audit log. Rotate or revoke any time. No vendor SDK. No OAuth dance. No retraining your agents on your context every session.

## Tools that work today

Same key. Same env block. Different paste location.

| Tool                      | Status                | Where the env goes                     |
| ------------------------- | --------------------- | -------------------------------------- |
| **Claude Code**           | Works today           | Claude Code config file (env section)  |
| **Cursor**                | Works today           | Cursor agent settings (env / secrets)  |
| **Claude Desktop**        | Works today           | Claude Desktop connector config        |
| **ChatGPT (Custom GPT)**  | Works today           | Custom GPT Actions auth (Bearer token) |
| **Custom HTTP / scripts** | Works today           | Your own env file or secret store      |
| **OpenClaw**              | Connector in progress | OpenClaw plugin / secret config        |

If your tool can make an HTTP request with a bearer token, it can connect.

## Generate an agent key

1. Go to [`/profile`](/profile) and open the **Agent Keys** tab.
2. Click **Generate**.
3. Pick a **scope**:
    - `read_only` — reads only, no writes.
    - `read_write` — reads plus the writes you whitelist.
4. Choose **which projects** the key can see — all of them or an explicit list.
5. If you picked `read_write`, whitelist the specific write ops.
6. Copy the **connection prompt**. The one-time secret shows only once; BuildOS stores a prefix for identification and never the full key.
7. Paste into your tool's config (see per-tool subsections below).

[`/integrations`](/integrations) has the same flow plus the public landing page.

## Setting it up in Claude Code

Claude Code is the most common path. Setup is three lines.

1. **Generate a key** as above. Copy the env block.
2. **Paste it into your Claude Code config** — wherever it stores env vars for that workspace. Never paste the token into chat input.
3. **Ask Claude to dial:**

    > "Connect to BuildOS and list my projects."

    Claude will hit `POST /api/agent-call/buildos` with the bearer token, open a session, and show your projects. From there you can ask it to read a project's tasks, draft a document, or — if your key allows write — update a task.

The env block looks like:

```env
BUILDOS_BASE_URL=https://build-os.com
BUILDOS_AGENT_TOKEN=boca_your_one_time_secret
BUILDOS_CALLEE_HANDLE=buildos:user:YOUR_USER_ID
BUILDOS_CALLER_KEY=claude-code:install:your-handle
```

## Setting it up in Cursor

Cursor uses the same env block. Drop it into your Cursor agent settings (the place where Cursor stores env vars and secrets for the workspace). Then prompt:

> "Connect to BuildOS, list my projects."

Cursor will use the bearer token to dial the gateway. Same tool surface as Claude Code.

## Setting it up in Claude Desktop

Claude Desktop's connector config accepts the same env block. After pasting:

> "Connect to BuildOS using the configured credentials and show my projects."

The desktop client opens a scoped session and exposes the same read/write tools.

## Setting it up in ChatGPT (Custom GPT)

ChatGPT goes through Custom GPT Actions:

1. In your Custom GPT, add a new Action.
2. Use **Bearer** auth, with `BUILDOS_AGENT_TOKEN` as the value.
3. Point it at `POST https://build-os.com/api/agent-call/buildos` with a JSON-RPC body.

The Custom GPT can then run `call.dial → tools/list → tools/call → call.hangup` like any other client.

## Setting it up in OpenClaw

The OpenClaw-specific connector is still mid-build. Once it ships, the same env block works without changes. See [`/docs/integrations/openclaw/setup`](/docs/integrations/openclaw/setup) for the OpenClaw-only walkthrough.

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

## What's exposed

**Reads** (available on every key)

- `onto.project.list`, `onto.project.search`, `onto.project.get`
- `onto.task.list`, `onto.task.search`, `onto.task.get`
- `onto.document.list`, `onto.document.search`, `onto.document.get`
- `onto.search`

**Writes** (require `read_write`)

- `onto.task.create`, `onto.task.update`
- `onto.document.create`, `onto.document.update`
- `onto.project.create`, `onto.project.update` _(coming soon — registered but not yet wired)_
- `onto.goal.create`, `onto.goal.update` _(coming soon)_
- `onto.plan.create`, `onto.plan.update` _(coming soon)_
- `onto.milestone.create`, `onto.milestone.update` _(coming soon)_
- `onto.risk.create`, `onto.risk.update` _(coming soon)_

**Discovery**

- `skill_load`, `tool_search`, `tool_schema`

**Session methods**

- `call.dial`, `tools/list`, `tools/call`, `call.hangup`

## Saving a markdown document from an external agent

The headline v1 write op is `onto.document.create`. Any connected tool can save a markdown artifact into a specific project in a single call.

```json
{
	"method": "tools/call",
	"params": {
		"call_id": "<your call id>",
		"name": "onto.document.create",
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

## One-click bootstrap

When you generate a key in the UI, BuildOS also produces a bootstrap URL:

```
GET /api/agent-call/bootstrap/<setupToken>
```

That endpoint returns the env block and a ready-to-paste connection prompt — so you don't have to wire the JSON-RPC client by hand. Works for any tool that can read an env block.

## Custom agents

If you're building your own client, point it at:

```
POST https://build-os.com/api/agent-call/buildos
Authorization: Bearer <your agent key>
Content-Type: application/json
```

Payload is JSON-RPC. Start with `call.dial`, list your tools with `tools/list`, call them via `tools/call`, and close with `call.hangup`. Types live in `packages/shared-types/src/agent-call.types.ts`.

## Roadmap

- **`onto.document.create` / `onto.document.update`** — **shipped.** External agents can author markdown documents directly into projects.
- **`onto.project.create` / `onto.project.update`** — registered, wiring in progress. Will let agents spin up projects before writing docs/tasks.
- **Goals, plans, milestones, risks** — registered, wiring in progress. Rounds out the write surface so anything the internal agent can do is also available through the gateway.

Design doc: `apps/web/docs/features/agent-call/MULTI_SURFACE_CONTENT_IDEA_WORKFLOW.md`.

## Next

- [Reference & Help](/docs/reference)
- [Integrations](/integrations) — per-agent setup walk-throughs.
