---
layout: docs
title: Agentic Chat
slug: agentic-chat
summary: The in-app agent that reads, writes, searches, and schedules across your ontology.
icon: MessageSquare
order: 4
lastUpdated: 2026-04-17
---

Agentic chat is the primary interaction surface in BuildOS. It's an agent that has tools — not a chatbot. It can read your projects, tasks, documents, and calendar; create and update entities; and search the web when it needs context. It's context-aware, so what it does depends on where you are when you open it.

## Where to find it

- **Nav icon.** The default entry point. Opens the chat modal with a context picker.
- **Brief card on the dashboard.** Opens the brief-scoped chat — split-pane on desktop, bottom-sheet on mobile — with the brief already loaded.
- **Inside an entity.** Documents and milestones have their own chat entry that scopes the conversation to that entity.
- **Pre-chat picker.** Before your first message, the context selection screen shows what context will apply and lets you switch.

## The 8 contexts

The agent operates in a context mode. The mode decides which tools are available and how the agent frames the conversation. Modes auto-switch based on where you are.

| Context | Purpose | When it activates |
| --- | --- | --- |
| `global` | Cross-project or workspace-wide work | Default from the nav on a non-entity page |
| `project` | Updates and insights for a single project | Open on a project detail page |
| `ontology` | Cross-ontology work using the full tool catalog | Power-user mode |
| `calendar` | Schedule coordination, availability | From calendar surfaces |
| `daily_brief` | Act on a generated brief | From the dashboard brief card |
| `daily_brief_update` | Tune brief cadence and notifications | From brief settings |
| `project_create` | Guided new-project creation | From the "new project" flow |
| `general` | Legacy fallback | Shouldn't appear — `global` replaces it |

## What the agent can do

**Reads**

- List and search projects, tasks, documents, goals.
- Get details on a specific task or project.
- List your calendar events.
- Pull workspace and user-profile overviews.
- Look up schema info for a field (`get_field_info`).

**Writes**

- Create tasks, projects, and documents.
- Update tasks and projects.
- Create calendar events.

**Discovery**

- `skill_load`, `tool_search`, `tool_schema` — the agent can introspect and load additional skills mid-conversation.

**Web**

- `websearch` via Tavily for live research.
- `webvisit` to fetch and parse a specific URL.

Every entity the agent writes is typed and indexed, so it shows up in search, briefs, and the rest of the product exactly like anything you created yourself.

## Try these prompts

**Global**

- "What should I work on today?"
- "Summarize what happened across all my projects this week."
- "Which projects have stalled in the last 10 days?"
- "Find tasks that are blocked and tell me why."

**Project-scoped**

- "What's blocking this project?"
- "Draft a plan for launching by March."
- "Which tasks are overdue and why?"
- "Update the context doc with what I learned yesterday."

**Calendar**

- "Find me 2 hours tomorrow for focus work."
- "Schedule the top 3 tasks from this project this week."

**Brief**

- "Turn today's priorities into calendar blocks."
- "Explain why this task is on today's brief."

**Project create**

- "Help me scope a new book project."
- "I want to launch a newsletter — break that into phases."

## A note on the architecture

There are three agentic-chat services in the codebase (`agentic-chat`, `agentic-chat-v2`, `agentic-chat-lite`). Only **v2** is user-facing. The others are library and shadow-testing infrastructure that you shouldn't have to think about.

## Next

- [Calendar & Time Blocks](/docs/calendar)
- [Daily Briefs](/docs/daily-briefs)
- [Connect External Agents](/docs/connect-agents) — extend the same capabilities to Claude Code and OpenClaw
