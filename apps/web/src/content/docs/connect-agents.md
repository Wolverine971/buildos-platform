---
layout: docs
title: Connect External Agents
slug: connect-agents
summary: Let Claude Code, OpenClaw, or a custom agent read and write to your BuildOS ontology.
icon: Plug
order: 9
lastUpdated: 2026-04-17
---

BuildOS exposes a JSON-RPC gateway so external agents — Claude Code, OpenClaw, or anything you build yourself — can operate on your ontology the same way the in-app agent does. This replaces the old copy-and-paste workflow with a live, scoped connection.

## Why connect an external agent

Everything the in-app agent can do on behalf of your ontology, an external agent can do through the gateway — with scoping you control. It's the difference between giving Claude Code a snapshot and giving it an account it can actually work in.

## Walkthrough: generate an agent key

1. Go to [`/profile`](/profile) and open the **Agent Keys** tab.
2. Click **Generate**.
3. Pick your **scope**:
   - `read_only` — reads only, no writes.
   - `read_write` — reads plus the writes you whitelist.
4. Choose which **projects** the key can see — all of them or an explicit list.
5. If you chose `read_write`, whitelist the specific write ops (`onto.task.create`, `onto.task.update`).
6. Copy the **connection prompt** — the one-time secret is shown only once. BuildOS stores a prefix for identification, never the full key.
7. Paste the prompt into Claude Code or OpenClaw. You're connected.

The [`/integrations`](/integrations) page has the same flow plus deeper per-agent setup notes.

## Scope model

| Control | What it does |
| --- | --- |
| **Mode** | `read_only` blocks every write op; `read_write` allows the ops you whitelist. |
| **Project scope** | All projects or an explicit allowlist. Keys can't touch projects outside the list. |
| **Write op whitelist** | Per-op toggle for every mutation the gateway exposes. |
| **Audit trail** | Every call is logged with the key prefix, op, and entity touched. |

## Available operations

**Reads — available on every key**

- `onto.project.list`, `onto.project.search`, `onto.project.get`
- `onto.task.list`, `onto.task.search`, `onto.task.get`
- `onto.document.list`, `onto.document.search`, `onto.document.get`
- `onto.search`

**Writes — require `read_write` scope**

- `onto.task.create`
- `onto.task.update`

**Discovery**

- `skill_load`, `tool_search`, `tool_schema`

**Session methods**

- `call.dial`, `tools/list`, `tools/call`, `call.hangup`

## One-click OpenClaw bootstrap

When you generate a key through the UI, BuildOS also produces a bootstrap URL:

```
GET /api/agent-call/bootstrap/<setupToken>
```

That endpoint returns the environment variables and a ready-to-paste prompt for Claude Code or OpenClaw, so you don't have to wire up the JSON-RPC client by hand. The bootstrap page is part of the key-generation flow.

## Custom agents

If you're building your own agent, point it at:

```
POST https://build-os.com/api/agent-call/buildos
Authorization: Bearer <your agent key>
Content-Type: application/json
```

The payload is JSON-RPC. Start with `call.dial`, list your tools with `tools/list`, call them via `tools/call`, and close with `call.hangup`. The type definitions live in `packages/shared-types/src/agent-call.types.ts`.

## Roadmap: document create and update

The next write operations planned for the gateway are `onto.document.create` and `onto.document.update`. These let an external agent author polished documents — research notes, specs, decisions — that flow into your daily briefs. See the design doc in `apps/web/docs/features/agent-call/EXTERNAL_RESEARCH_INGESTION_DESIGN.md` for the full plan.

## Next

- [Reference & Help](/docs/reference)
- Detailed integration walk-throughs live at [`/integrations`](/integrations).
