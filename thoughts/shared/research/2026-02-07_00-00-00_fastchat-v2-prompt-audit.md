---
title: "FastChat V2 Prompt Audit"
date: 2026-02-07
type: research
scope: agentic-chat-v2
path: thoughts/shared/research/2026-02-07_00-00-00_fastchat-v2-prompt-audit.md
---

# FastChat V2 - Prompt Audit & Token Metrics

## Source Files

| File | Role |
|------|------|
| `apps/web/src/routes/api/agent/v2/stream/+server.ts` | Endpoint orchestrator |
| `apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts` | System prompt assembly |
| `apps/web/src/lib/services/agentic-chat-v2/prompt-builder.ts` | Lightweight fallback prompt (unused in main path) |
| `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.ts` | LLM streaming loop |
| `apps/web/src/lib/services/agentic-chat-v2/context-loader.ts` | DB context fetching |
| `apps/web/src/lib/services/agentic-chat-v2/context-usage.ts` | Token estimation |
| `apps/web/src/lib/services/agentic-chat-v2/limits.ts` | Tool call limits |
| `apps/web/src/lib/services/agentic-chat-v2/tool-selector.ts` | Dynamic tool selection |

---

## 1. SYSTEM PROMPT (Master Prompt)

The system prompt is built by `buildMasterPrompt()` in `master-prompt-builder.ts`. It assembles three XML sections: `<instructions>`, `<context>`, and `<data>`.

### 1.1 Instructions Block (Static)

This is the **fixed** portion of the system prompt, identical for every request:

```xml
<instructions>
<identity>
You are BuildOS Agentic Chat V2. Help users organize projects, tasks, goals, plans, milestones, documents, and events with speed and precision.
</identity>
<platform_context>
BuildOS is a project ontology system. Each project contains structured entities and a document hierarchy (doc_structure).
</platform_context>
<data_model_overview>
Core entities: project, goal, milestone, plan, task, document, event, risk, requirement.
</data_model_overview>
<operational_guidelines>
Be concise. Ask at most one clarifying question when required. Use tools for data retrieval or mutations; do not guess. Reuse provided context and agent_state to avoid redundant tool calls.
</operational_guidelines>
<behavioral_rules>
Be direct, supportive, and action-oriented. Do not claim actions you did not perform.
</behavioral_rules>
<error_handling>
If data is missing or a tool fails, state what happened and request the minimum next input or retry.
</error_handling>
<proactive_intelligence>
Surface risks, gaps, or next steps only when they materially affect progress.
</proactive_intelligence>
<relationship_rules>
Relationship guide (flexible, aspirational):
- Early projects may start with only a goal or a handful of tasks
- Do not over-infer missing layers
- Ideal structure (over time):
  - Project should have goals
  - Goals can have milestones
  - Milestones can have plans
  - Plans contain tasks
  - Projects can also have events
</relationship_rules>
<doc_structure_rules>
Documents are organized by onto_projects.doc_structure (JSON tree).
- Do not create edges between documents.
- Other entities may link to documents as references.
- Keep document hierarchy derived from doc_structure.
</doc_structure_rules>
</instructions>
```

**Estimated token count (instructions block only): ~230 tokens** (920 chars / 4)

### 1.2 Context Block (Dynamic per request)

Populated from session metadata and the context loader. Example for a project-focused chat:

```xml
<context>
<context_type>project</context_type>
<project_id>abc-123</project_id>
<project_name>My Project</project_name>
<entity_id>abc-123</entity_id>
<focus_entity_type>none</focus_entity_type>
<focus_entity_id>none</focus_entity_id>
<focus_entity_name>none</focus_entity_name>
<agent_state>{"sessionId":"...","current_understanding":{"entities":[],"dependencies":[]},"assumptions":[],"expectations":[],"tentative_hypotheses":[],"items":[]}</agent_state>
<conversation_summary>none</conversation_summary>
</context>
```

**Estimated token count (context block):**
- Minimal (no agent state): ~40 tokens
- With agent state JSON: ~80-300+ tokens (grows with conversation)
- With conversation summary: adds ~50-200+ tokens

### 1.3 Data Block (Dynamic - loaded from DB)

This is the **heaviest** section. Contains serialized JSON of all loaded entities.

```xml
<data>
<json>
{
  "project": { "id": "...", "name": "...", "state_key": "...", ... },
  "doc_structure": { ... },
  "goals": [ ... ],
  "milestones": [ ... ],
  "plans": [ ... ],
  "tasks": [ ... ],
  "events": [ ... ],
  "documents": [ ... ]
}
</json>
</data>
```

**Estimated token count (data block):**
- Empty/no context: ~5 tokens
- Global context (all projects + goals + milestones + plans + activity): **500-5,000+ tokens** depending on user's project count
- Project context (single project with all entities): **200-3,000+ tokens** depending on entity count
- Entity focus (project + focus entity + linked entities + edges): **300-4,000+ tokens**

---

## 2. USER PROMPT

The user prompt is **passed through directly** with no wrapping or transformation:

```
messages = [
  { role: "system", content: <master prompt above> },
  ...history (last 10 messages),
  { role: "user", content: <raw user message> }
]
```

There is **no user prompt template**. The user's message text is sent as-is.

---

## 3. CONTEXT TYPES

Defined in `ChatContextType`. The system supports these context types:

| Context Type | What Gets Loaded | Scope Hint (from prompt-builder.ts) |
|---|---|---|
| `global` | All user's projects + their goals, milestones, plans, recent activity | "General BuildOS assistant across projects and tasks." |
| `project` | Single project + all its goals, milestones, plans, tasks, events, documents, doc_structure | "Project-focused assistant. Ask for specific project details when needed." |
| `project_audit` | Same as `project` (treated as project context) | (none - falls through to project) |
| `project_forecast` | Same as `project` (treated as project context) | (none - falls through to project) |
| `ontology` | Project context if projectFocus has projectId | "Ontology-focused assistant. Ask for specific entity details when needed." |
| `calendar` | No data loaded (tools handle calendar) | "Calendar-focused assistant. Ask for dates or time constraints when needed." |
| `project_create` | No data loaded | "Project creation assistant. Keep questions minimal and focused." |
| `general` | Normalized to `global` | (mapped to global) |
| `entity` (with projectFocus) | Project + focus entity full record + linked entities via edges | (inherits from project) |

### Context Type Normalization

```
"general" -> "global"
undefined  -> "global"
everything else -> passed through as-is
```

---

## 4. TOKEN METRICS & BUDGETS

### Token Budget

| Setting | Value | Source |
|---|---|---|
| **Default token budget** | **8,000 tokens** | `context-usage.ts` DEFAULT_FASTCHAT_TOKEN_BUDGET |
| **Token estimation method** | `Math.ceil(text.length / 4)` | chars/4 approximation |
| **Budget status thresholds** | `ok` < 85%, `near_limit` >= 85%, `over_budget` > 100% | |

### Token Breakdown (Typical Request)

| Component | Estimated Tokens | Notes |
|---|---|---|
| **Instructions (static)** | ~230 | Fixed, never changes |
| **Context metadata** | ~40-300 | Grows with agent_state |
| **Data block (global)** | ~500-5,000+ | All projects + entities |
| **Data block (project)** | ~200-3,000+ | Single project entities |
| **History (10 msgs)** | ~200-2,000+ | Last 10 messages loaded |
| **User message** | ~10-500 | Varies |
| **TOTAL (light session)** | ~500-1,500 | New session, few entities |
| **TOTAL (heavy session)** | ~3,000-8,000+ | Many entities, long history |

### History Window

| Setting | Value |
|---|---|
| **Messages loaded** | Last **10** messages |
| **Source** | `sessionService.loadRecentMessages(session.id, 10)` |

### Tool Limits

| Setting | Default | Env Override |
|---|---|---|
| **Max tool calls per session** | **40** | `FASTCHAT_MAX_TOOL_CALLS` |
| **Max tool rounds (LLM loops)** | **8** | `FASTCHAT_MAX_TOOL_ROUNDS` |

### Context Cache

| Setting | Value |
|---|---|
| **Cache TTL** | 2 minutes (120,000ms) |
| **Cache version** | 1 |
| **Storage** | `chat_sessions.agent_metadata.fastchat_context_cache` |
| **Cache key format** | `v2|{contextType}|{projectId}|{focusType}|{focusEntityId}` |

---

## 5. TOOL SELECTION

Tools are dynamically selected based on context type + message content.

### Web Tools (conditional)
Enabled only when message matches web intent patterns:
- Keywords: `web`, `internet`, `online`, `google`, `search the web`, `browse`, `look up`, `news`, `website`, `url`, `citation`, `cite`
- URL patterns: `https://`, `www.`
- Tools: `web_search`, `web_visit`

### Calendar Tools (conditional)
Enabled when:
- Context is `calendar` or `project`/`project_audit`/`project_forecast`/`ontology`
- OR message matches: `calendar`, `schedule`, `meeting`, `event`, `availability`, `appointment`, `reminder`, `deadline`, `time`, `date`
- Tools: `list_calendar_events`, `get_calendar_event_details`, `create_calendar_event`, `update_calendar_event`, `delete_calendar_event`, `get_project_calendar`, `set_project_calendar`

### Base Tools
All other tools come from `getToolsForContextType()` which is configured per context type in the tools.config.

---

## 6. LLM CONFIGURATION

| Setting | Value |
|---|---|
| **Profile** | `balanced` |
| **Operation type** | `agentic_chat_v2_stream` |
| **Tool choice** | `auto` (when tools present) |
| **Streaming** | Always on |
| **Prompt version** | `v2-fast-2026-02-06` |

---

## 7. FULL ASSEMBLED SYSTEM PROMPT (Template)

Below is the complete system prompt template with placeholders for dynamic values:

```
<instructions>
<identity>
You are BuildOS Agentic Chat V2. Help users organize projects, tasks, goals, plans, milestones, documents, and events with speed and precision.
</identity>
<platform_context>
BuildOS is a project ontology system. Each project contains structured entities and a document hierarchy (doc_structure).
</platform_context>
<data_model_overview>
Core entities: project, goal, milestone, plan, task, document, event, risk, requirement.
</data_model_overview>
<operational_guidelines>
Be concise. Ask at most one clarifying question when required. Use tools for data retrieval or mutations; do not guess. Reuse provided context and agent_state to avoid redundant tool calls.
</operational_guidelines>
<behavioral_rules>
Be direct, supportive, and action-oriented. Do not claim actions you did not perform.
</behavioral_rules>
<error_handling>
If data is missing or a tool fails, state what happened and request the minimum next input or retry.
</error_handling>
<proactive_intelligence>
Surface risks, gaps, or next steps only when they materially affect progress.
</proactive_intelligence>
<relationship_rules>
Relationship guide (flexible, aspirational):
- Early projects may start with only a goal or a handful of tasks
- Do not over-infer missing layers
- Ideal structure (over time):
  - Project should have goals
  - Goals can have milestones
  - Milestones can have plans
  - Plans contain tasks
  - Projects can also have events
</relationship_rules>
<doc_structure_rules>
Documents are organized by onto_projects.doc_structure (JSON tree).
- Do not create edges between documents.
- Other entities may link to documents as references.
- Keep document hierarchy derived from doc_structure.
</doc_structure_rules>
</instructions>

<context>
<context_type>{contextType}</context_type>
<project_id>{projectId | "none"}</project_id>
<project_name>{projectName | "none"}</project_name>
<entity_id>{entityId | "none"}</entity_id>
<focus_entity_type>{focusEntityType | "none"}</focus_entity_type>
<focus_entity_id>{focusEntityId | "none"}</focus_entity_id>
<focus_entity_name>{focusEntityName | "none"}</focus_entity_name>
<agent_state>{JSON.stringify(agentState) | "none"}</agent_state>
<conversation_summary>{conversationSummary | "none"}</conversation_summary>
</context>

<data>
<json>
{JSON.stringify(loadedContextData, null, 2) | "none"}
</json>
</data>
```

---

## 8. MESSAGE ARRAY SENT TO LLM

```json
[
  { "role": "system", "content": "<full master prompt above>" },
  { "role": "user",   "content": "<historical msg 1>" },
  { "role": "assistant", "content": "<historical msg 2>" },
  // ... up to 10 history messages ...
  { "role": "user",   "content": "<current user message>" }
]
```

If tool calls occur, the loop appends:
```json
  { "role": "assistant", "content": "...", "tool_calls": [...] },
  { "role": "tool", "content": "<tool result JSON>", "tool_call_id": "..." },
  // ... then LLM is called again
```

Max 8 tool rounds, max 40 tool calls total.

---

## 9. UNUSED FALLBACK PROMPT (prompt-builder.ts)

There is also a simpler `buildFastSystemPrompt()` in `prompt-builder.ts` that is **NOT used** in the main flow (the master prompt builder takes precedence). It exists as a fallback inside `stream-orchestrator.ts` only if no `systemPrompt` is passed:

```
You are BuildOS Agentic Chat V2.
Priorities: speed, clarity, correctness.
Keep responses concise unless the user asks for depth.
Ask at most one clarifying question if required to proceed.
Do not claim to have executed tools or actions.
Context: {contextType}. {scopeHint}
System prompt version: v2-fast-2026-02-06
```

**~45 tokens.** This would only fire if `buildMasterPrompt()` throws an error and no system prompt is provided.
