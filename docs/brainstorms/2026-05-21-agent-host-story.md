---
date: 2026-05-21
title: BuildOS as Agent Host — Strategy & Architecture Riff
status: draft-for-riff
parent_strategy: docs/brainstorms/2026-05-21-buildos-canvas-strategy-and-phased-plan.md
target_phase: Phase D (ongoing parallel)
path: docs/brainstorms/2026-05-21-agent-host-story.md
---

# BuildOS as Agent Host — Strategy & Architecture

> Riffable brainstorm. Working hypothesis, not a decided architecture.

## The pitch in three lines

> Your AI agents forget. BuildOS remembers.
> Your AI agents work alone. BuildOS coordinates them.
> Your AI agents have shallow context. BuildOS holds the deep context.

## What "agent host" actually means

BuildOS is not trying to build a better agent. There are already great agents (Claude Code, Cursor, ChatGPT, custom Anthropic-SDK builds, OpenAI Assistants, future ones). BuildOS is the **persistent project layer** that any of these agents can connect to.

The model: **BuildOS is to AI agents what GitHub is to code editors.** GitHub doesn't try to be a better IDE. It's the durable state that any IDE can connect to. Cursor edits files. VSCode edits files. They both push to GitHub. GitHub holds the canonical state.

BuildOS plays this role for _projects, plans, goals, tasks, documents, actors_ — the things projects are made of.

## Why this is the right play

Three observations from the strategy work:

**1. Agents are commodifying.** Every IDE has an agent. Every chat app has an agent. Custom agents are getting easier to build (Anthropic SDK, MCP, OpenAI Agents API, etc.). The agent itself is becoming undifferentiated.

**2. The persistent layer is not commodifying.** State, memory, project structure, multi-actor coordination — these are HARD problems that no agent vendor wants to solve, because it's outside their core competency. The first platform that solves it well becomes infrastructure.

**3. Users will have multiple agents.** Already, a power user might use Claude Code for engineering, Cursor for code edits, ChatGPT for research, and a custom agent for domain work. The user has no central place where these agents share context. **BuildOS can be that place.**

This maps to DJ's earlier framing: BuildOS is the "go-between across agents." That was correct. The agent-host story is the architectural realization of that framing.

## The actor model — agents as first-class actors

The reason "actor" is a primitive (one of the 7) is exactly this: **an agent is an actor in BuildOS, indistinguishable from a human in the data model.**

Properties of an actor:

- Has an identity (display name, avatar, type)
- Has a type (human, agent, or system)
- Has permissions (read/write scopes, project access)
- Can be attributed (every action is logged with actor)
- Can be granted access (external-agent caller provisioning / scoped tokens today; agent membership or invites later)
- Can invite others (an agent can invite a human or another agent)

This unification is powerful:

- Multi-agent projects are just multi-actor projects with some actors flagged as agents
- Auditing is unified: who did what, regardless of human/agent
- Permissions are unified: same model whether granting a colleague or a Claude Code instance access

## What can an agent DO inside BuildOS?

The 7 primitives become the 7 core resource types in the agent-facing API:

| Resource          | Agent operations                                                                      |
| ----------------- | ------------------------------------------------------------------------------------- |
| **Project Group** | list, create, update once the Project Group model exists                              |
| **Project**       | create, read, update, list, archive                                                   |
| **Goal**          | create, read, update — both project-level and standalone (depending on primitive cut) |
| **Plan**          | create, read, update, version                                                         |
| **Document**      | create, read, update, append, query (semantic search)                                 |
| **Task**          | create, read, update, complete, list                                                  |
| **Actor**         | read (who's in this project), invite, list                                            |

Additional verbs not tied to primitives:

- **Subscribe** to changes (webhook or stream): notify when a task is completed, when a document is updated
- **Query context**: "summarize the state of this project," "find all decisions made in this project," "what's blocking the next task"
- **Suggest**: agents can propose changes that go through a review queue rather than auto-applying

## Permission model

Token-based, scoped, time-limited. This should build on the existing agent-call / external-agent caller infrastructure, not on human project invite acceptance.

Repo audit correction: `accept_project_invite` grants membership to an existing project for an invited user. It is useful precedent for project access semantics, but it is not the right primitive for external agent tokens or agent-host authentication.

When a user "connects an agent":

1. They generate a token in BuildOS
2. The token has a scope:
    - Workspace-wide (rare, only for trusted personal agents)
    - Project group (e.g., "all my BuildOS work")
    - Single project (most common)
    - Read-only vs write
3. Token can be revoked at any time
4. Token has an expiry (default 30 days, renewable)
5. All actions taken with the token are attributed to the agent-as-actor

Token issuance UI:

> "Connect Claude Code to BuildOS"
> Scope: [Workspace / Group / Project]
> Permissions: [Read-only / Read + Write]
> Expires: [30 days / 90 days / Never]
> Token: cm_xxx... [Copy] [Revoke]

## Connection protocols — pick one (or both)

### Option A: MCP (Model Context Protocol)

BuildOS exposes an MCP server. Any MCP-compatible agent (Claude Code, Claude Desktop, custom MCP clients) can connect.

**Pros:**

- Open standard, broad compatibility
- No custom integration per client
- Anthropic backing, growing adoption
- Maps cleanly to BuildOS's resource model

**Cons:**

- Still maturing
- Performance characteristics for high-volume queries unclear
- Limited to clients that support MCP

### Option B: REST/GraphQL API

BuildOS exposes a standard API. Agents connect with bearer tokens, make HTTP requests.

**Pros:**

- Universal — any agent that can make HTTP requests can use it
- Mature tooling and patterns
- Easier to debug, monitor, rate-limit

**Cons:**

- Each agent needs custom integration code
- Less ergonomic for agent developers
- Doesn't benefit from MCP ecosystem growth

### Recommendation: both, with MCP as primary

- **MCP** is the recommended path for end-users connecting standard agents (Claude Code, Claude Desktop, future MCP clients)
- **REST API** is available for custom integrations, agent frameworks that don't speak MCP, and BuildOS's own internal use
- The two share the same underlying authentication (token-based, actor-attributed) and the same resource model

This dual approach hedges against MCP not winning while still investing in the emerging standard.

## What multi-agent looks like

Imagine a single BuildOS project: _"Launch my Substack"_.

Connected actors:

- **DJ (human)** — the project owner
- **Claude Code (agent)** — used for technical work (building the Substack landing page, writing automations)
- **Custom research agent (agent)** — used for topic research, runs periodically
- **The user's accountability buddy (human, invited)** — read-only access, gets weekly briefs

Possible flows:

- Custom research agent appends 3 article ideas to the "Topics" document every Monday
- DJ uses Claude Code to draft the next article — Claude Code reads the project's plan + goal + relevant docs via MCP
- DJ marks the article task as complete in BuildOS via the web app
- The accountability buddy gets a notification via the brief that progress was made
- The next research run picks up where the last one left off, because the context persisted

**This is the platform play.** Without BuildOS, those four actors don't share context. With BuildOS, they all work against the same persistent state.

## Hard problems (genuinely hard, not waved away)

### 1. Conflict resolution

If Claude Code and the human both modify the same document at the same time — what wins?

Options:

- Last-write-wins (crude, dangerous for collaborative work)
- Operational transformation / CRDT (powerful but complex)
- Lock-on-edit (clear but blocks collaboration)
- Diff + review queue (agents propose, humans approve)

For v1: lock-on-edit with timeout + diff view. Agents that want to write get a soft lock; if the lock holder is idle, the next writer can take over. All changes show in a diff view that the project owner can revert.

### 2. Permissions granularity

Per-project is the default. But what about:

- Read access to a project but only specific documents?
- Write access to tasks but not documents?
- Time-bounded access (this agent has 1 hour to read)?

For v1: project-level, read/write split. Granular permissions come later when there's demand.

### 3. Rate limits and cost

If an agent is misconfigured and queries BuildOS 1,000x/minute, who pays?

For v1: per-token rate limits (configurable). The token owner pays for the costs. Aggressive default limits to prevent runaway.

### 4. Discovery — "which agents should I connect?"

A new user doesn't know what agents to connect. The product needs to suggest:

- "If you use Claude Code, connect it here →"
- "If you have a custom agent, here's how to set it up →"

For v1: 3-5 hand-picked agent integrations featured prominently, plus a generic MCP/API setup for everyone else.

### 5. The "background agent" problem

Some agents should run autonomously (research agent that wakes up Monday morning). BuildOS needs to support:

- Scheduling (cron-like)
- Triggers (when X happens, run Y)
- Worker processes that can take actions while the user is offline

For v1: defer this. Start with user-initiated agent actions. Background agents are a v2 feature.

## What BuildOS specifically does NOT do

To stay focused, BuildOS as agent host explicitly is NOT:

- A general agent framework (use Anthropic SDK, LangChain, OpenAI Agents API)
- A model provider (BuildOS doesn't run models itself; it routes via OpenRouter/etc. for its own AI features)
- An agent marketplace (don't host arbitrary agents; users connect their own)
- A workflow engine (no Zapier-style automation builder)

These are tempting feature additions that would dilute the platform play.

## Integration ladder

A staged rollout of the agent-host capability:

**Tier 1: BuildOS-native AI** (already exists)

- BuildOS's own AI assistant inside the product
- Powered by the smart-llm package, OpenRouter routing

**Tier 2: First-party MCP server** (Phase D, ~3-4 months)

- BuildOS exposes MCP endpoints for the 7 primitives
- Claude Code, Claude Desktop can connect
- Project-scoped tokens

**Tier 3: REST API public** (Phase D, ~4-6 months)

- Public-facing REST endpoints, mirrors MCP capabilities
- API keys, OpenAPI spec
- Enables custom integrations

**Tier 4: Featured integrations** (Phase D+, ~6-9 months)

- Curated "Connect [agent]" buttons for top platforms
- Pre-built MCP configurations
- One-click setup

**Tier 5: Background agents** (Phase D++, ~12+ months)

- Scheduled agent runs
- Triggered agent runs
- Multi-agent coordination primitives

## Marketing implication — the cross-agent narrative

If BuildOS is the agent-host, the marketing wedge becomes:

> "You use ChatGPT for research, Claude Code for engineering, Cursor for refactors, your own agent for niche stuff. They don't talk to each other. They don't remember each other. BuildOS holds the context across all of them."

This is a _technical_ positioning that complements the _emotional_ anti-AI positioning. The anti-AI positioning attracts the user. The agent-host positioning makes the product sticky.

It also creates a defensible moat: every new agent that supports MCP becomes a reason to use BuildOS, _without BuildOS doing any new work_. The MCP ecosystem's growth = BuildOS's growth.

## Connection to AI-Native Operator Index

DJ's `ai-influencers.md` doc identifies builders like Riley Brown, Pietro Schirano, and Swyx as targets. These people are _exactly_ the people who would use BuildOS as agent host:

- **Riley Brown** — uses Claude Code, Cursor, OpenClaw, Codex; needs cross-agent state
- **Pietro Schirano** — runs MagicPath, builds AI products; needs persistent project state
- **Swyx** — runs AI Engineer ecosystem; the whole crowd is multi-agent users

If the agent-host story works, these people are the _natural early adopters_. The pitch to them isn't "use BuildOS for productivity" — it's "use BuildOS as the durable layer under your agent stack."

## Open questions for DJ to riff on

1. **MCP-first or API-first?** Recommendation is both, but if pressed for sequencing, which ships first?
2. **Who's the first integration partner?** Riley Brown's Claude Code workflow? Pietro's MagicPath? Custom agents from AI engineer community?
3. **Should BuildOS publish its own MCP server publicly (open-source)?** This would dramatically increase adoption among AI engineers but also increases support burden.
4. **What's the pricing model for agent access?** Free for personal use, paid for orgs? Per-token? Per-action? This affects the architecture.
5. **Background agent support — v2 or never?** If never, BuildOS stays interactive-only. If v2, the architecture needs to plan for it now (scheduling, triggers, workers).
6. **How does this integrate with the existing BuildOS AI features?** The native AI vs. user-connected agents — are they two parallel systems or should they share infrastructure?
7. **What's the relationship to the daily brief?** Briefs are essentially scheduled agent outputs already. Is the brief system the prototype for background agents?

## The one-sentence version

BuildOS is the persistent project layer that AI agents connect to — the place where projects, plans, goals, tasks, documents, and people (human and agent) live across sessions, tools, and time.
