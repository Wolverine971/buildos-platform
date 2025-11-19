# Actionable Insight Agent — Research Chat Specification

Goal: add an “AI agent chat” mode in `AgentChatModal` that lets a user pick a project, pick the “actionable insight agent,” set a goal, and have the agent read the project (tasks/goals/plans/docs) to pursue that goal. First iteration is read-only and does not auto-generate a research doc (doc writing can be added later if the user explicitly asks).

## User Flow (UI)

- Entry: AgentChat modal gets a tab/mode switch for “AI agent chat.”
- Select project (required) → select agent (single option: “Actionable Insight Agent”) → enter goal → submit.
- Conversation stream reuses existing chat UI; shows tool/thinking blocks. No doc badge in v1 (can be added later if the user asks for a doc).
- Follow-up messages stay scoped to the same session/project; user can request re-run/refine.

## Session Lifecycle (happy path)

1. Create research chat session (projectId, agentId, goal, userId).
2. Orchestrator hydrates context snapshot (project metadata, tasks/goals/plans, docs list).
3. LLM produces a read-only plan (what to read/inspect, in what order).
4. Execute plan with tools (list/read/search ontology data only). Cache artifacts per session to avoid repeats.
5. Stream findings/analysis back to UI; doc writing is deferred unless explicitly requested later.
6. Allow follow-ups to read more or refine; same session id.

## Frontend Changes (AgentChatModal)

- New mode toggle: “AI agent chat” (keep existing default mode).
- Project selector (reuse project context selector); disable send until project selected.
- Agent selector (single option now, list-ready later).
- Goal input box (single-line or textarea) shown when agent selected; submit creates research session.
- Stream handling: reuse existing SSE handler; no `doc_ready` in v1.
- Persist context chip showing project + agent name; option to reset.

## Backend/API Surface (proposed)

- `POST /api/agent-research/sessions` → body `{ projectId, agentId, goal }` → returns session + first streamed tokens.
- `POST /api/agent-research/sessions/:id/messages` → follow-up user prompts; streams assistant replies.
- `GET /api/agent-research/sessions/:id` → session state summary.
- SSE payloads include: `session`, `agent_state`, `tool_call`, `tool_result`, `message`, `error` (no `doc_ready` in v1).

## Orchestration Responsibilities

- Context hydrate: project metadata, tasks/goals/plans, documents (titles + ids), recent project chat (optional).
- Planning: LLM creates a bounded read-only plan (max steps/tool calls/time).
- Execution: tool calls with budgets, debounce duplicate reads.
- Output: stream analysis/findings inline; doc writing is deferred to later iteration if user asks.
- Traceability: every finding links to `sourceRefs` (ids + snippet/hash) in session metadata.

## Tools Needed (reused/extended)

- `list_project_tasks|goals|plans(projectId)`
- `get_task|goal|plan(id)`
- `list_project_documents(projectId)` + `get_document(id)`
- `summarize_text(content, focus)` (optional helper)
- Guardrails: read-only, no repo access in v1; size limits on docs; max concurrent calls; redact secrets.

## Data Models (proposed)

```
agent_research_sessions
  id (uuid PK)
  project_id (uuid, FK projects)
  user_id (uuid)
  agent_id (text) -- e.g., actionable_insight_agent
  goal (text)
  status (enum: active/completed/failed/aborted)
  last_message_id (uuid?, FK agent_research_messages)
  created_at, updated_at
  metadata jsonb    -- budgets, params, version

agent_research_messages
  id (uuid PK)
  session_id (uuid FK agent_research_sessions)
  role (enum: user/assistant/tool/system)
  content (text)          -- raw content (may be partial for streaming)
  tool_name (text?)
  tool_args jsonb?
  tool_call_id (text?)
  created_at
  tokens_used int?
  model_used text?

agent_research_runs   -- optional per “execution” instance
  id (uuid PK)
  session_id (uuid FK)
  status (enum: planning/executing/synthesizing/completed/failed)
  started_at, completed_at
  error text?
  stats jsonb          -- tool call counts, time, tokens

research_artifact_refs
  id (uuid PK)
  session_id (uuid FK)
  ref_type (enum: task/goal/plan/doc/other) -- ontology-only in v1
  ref (jsonb)          -- e.g., {taskId}, {goalId}, {planId}, {docId}
  snippet text?        -- optional excerpt
  importance smallint? -- 1-5
  created_at
```

TypeScript shared types should mirror these tables and expose DTOs:

- `ResearchSession`, `ResearchMessage`, `ResearchRun`, `ResearchArtifactRef`
- Request DTOs: `CreateResearchSessionRequest { projectId; agentId; goal; }`, `SendResearchMessageRequest { content; }`
- SSE event union: `session | message | run | agent_state | tool_call | tool_result | error` (no doc_ready in v1).

## Output (v1)

- Inline streamed analysis/findings in chat; no automatic doc generation in this iteration (doc writing can be a follow-up when explicitly requested).

## Guardrails and Budgets

- Max tool calls per session and per run; max read size per file; limit search results.
- Cache artifact hashes per session to avoid re-reading unchanged files.
- Redact secrets; enforce read-only; skip large binary docs.
- Timeouts for SSE stream; heartbeat events to keep UI responsive.

## Observability

- Log tool invocations (name, args hash, latency, status).
- Track tokens per message and per run; surface in session metadata.
- Error surfaces: transient (retry) vs terminal (fail session) with messages back to UI.

## Extensibility Notes

- Agent selector can load from `agent_definitions` table (id/name/description/capabilities/model_config).
- Additional agents (code review, project audit) reuse the same session and doc models.
- Doc output can be added later as an optional follow-up flow.
