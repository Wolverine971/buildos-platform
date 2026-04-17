---
layout: docs
title: Connect External Agents
slug: connect-agents
summary: Let Claude Code, OpenClaw, or a custom agent work in your BuildOS projects — with scopes you control.
icon: Plug
order: 9
lastUpdated: 2026-04-17
path: apps/web/src/content/docs/connect-agents.md
---

BuildOS exposes a JSON-RPC gateway so external agents — Claude Code, OpenClaw, or anything you build yourself — can read and write in your projects the same way the in-app agent does. This replaces the old copy-and-paste-your-context workflow with a live, scoped connection.

## Why you'd want this

The in-app agent is where BuildOS does most of its work. But a lot of serious work happens outside BuildOS — in Claude Code when you're coding, in Claude Desktop when you're drafting, in your own tooling when you're automating. The gateway gives those tools the same view of your projects and the same ability to act on them, with permissions you actually control.

The difference is a snapshot versus an account. With the gateway, your external agent can read the current state of a project, write a new task, update a document, and see the result reflected back in BuildOS on the next view.

## Generate an agent key

1. Go to [`/profile`](/profile) and open the **Agent Keys** tab.
2. Click **Generate**.
3. Pick a **scope**:
    - `read_only` — reads only, no writes.
    - `read_write` — reads plus the writes you whitelist.
4. Choose **which projects** the key can see — all of them or an explicit list.
5. If you picked `read_write`, whitelist the specific write ops.
6. Copy the **connection prompt**. The one-time secret shows only once; BuildOS stores a prefix for identification and never the full key.
7. Paste into Claude Code or OpenClaw. Done.

[`/integrations`](/integrations) has the same flow plus per-agent setup notes.

## What you can scope

| Control                | What it does                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------- |
| **Mode**               | `read_only` blocks every write op. `read_write` allows the ones you whitelist.     |
| **Project scope**      | All projects or an explicit allowlist. Keys can't reach projects outside the list. |
| **Write op whitelist** | Per-op toggle for every mutation the gateway exposes.                              |
| **Audit trail**        | Every call is logged with the key prefix, the op, and the entity touched.          |

## What's exposed

**Reads** (available on every key)

- `onto.project.list`, `onto.project.search`, `onto.project.get`
- `onto.task.list`, `onto.task.search`, `onto.task.get`
- `onto.document.list`, `onto.document.search`, `onto.document.get`
- `onto.search`

**Writes** (require `read_write`)

- `onto.task.create`
- `onto.task.update`

**Discovery**

- `skill_load`, `tool_search`, `tool_schema`

**Session methods**

- `call.dial`, `tools/list`, `tools/call`, `call.hangup`

## One-click bootstrap

When you generate a key in the UI, BuildOS also produces a bootstrap URL:

```
GET /api/agent-call/bootstrap/<setupToken>
```

That endpoint returns the environment variables and a ready-to-paste prompt for Claude Code or OpenClaw, so you don't have to wire up the JSON-RPC client by hand.

## Custom agents

If you're building your own client, point it at:

```
POST https://build-os.com/api/agent-call/buildos
Authorization: Bearer <your agent key>
Content-Type: application/json
```

Payload is JSON-RPC. Start with `call.dial`, list your tools with `tools/list`, call them via `tools/call`, and close with `call.hangup`. Types live in `packages/shared-types/src/agent-call.types.ts`.

## Roadmap: external document ingestion

The next write ops planned for the gateway are `onto.document.create` and `onto.document.update`. When they ship, an external agent can author polished documents — research notes, specs, decisions — that flow into your project and show up in daily briefs. Design doc: `apps/web/docs/features/agent-call/EXTERNAL_RESEARCH_INGESTION_DESIGN.md`.

## Next

- [Reference & Help](/docs/reference)
- [Integrations](/integrations) — per-agent setup walk-throughs.
