<!-- docs/specs/AGENTIC_CHAT_TIMELINE_TABS_BRAINDUMP_ARCHITECTURE_2026-06-20.md -->

# Agentic Chat Timeline, Tabs, and Brain Dump Context Architecture

Date: 2026-06-20
Status: Initial implementation landed
Owner: BuildOS agentic chat

## Implementation Status

Initial implementation is in place for the requested first pass:

- User-facing timeline types and normalization were added in `agent-chat.types.ts` and `agent-chat-timeline.ts`.
- `GET /api/chat/sessions/[id]` now returns `timelineItems` assembled from messages, tool executions, turn runs, and filtered turn events.
- Chat export now prefers durable `timelineItems` and includes Steps, Tool Calls, Changes, and Conversation sections.
- `AgentChatModal` now has Chat, Steps, Tools, and Changes tabs backed by the normalized timeline, with live fallback from in-memory chat activity.
- Brain Dump detail and idempotent chat-session open/resume routes were added under `/api/onto/braindumps/[id]`.
- History Brain Dump cards now call the idempotent open/resume route instead of doing nothing when `chat_session_id` is missing.
- Brain Dump chat sessions render a context panel with original dump text, extracted fields, linked project metadata, and timeline-derived changes.
- The global brain chat launcher now uses the same Brain Dump open/resume route when the current History URL points at a selected Brain Dump.
- Rehydrated timeline entity refs are now enriched server-side from ontology tables, so sparse create/update/delete tool results can still show entity titles, project ids, and project/entity URLs where the current user has access.
- Tool execution rows now persist explicit `affected_entities` refs at write time through `chat_tool_executions.affected_entities`, with the session timeline preferring those refs and falling back to inference for older rows.
- Steps, Tools, and Changes entries now include an "Ask" action that switches back to Chat and pre-fills the composer with a concise reference to the selected timeline item, including status, summary, tool/error context, and related project/entity refs.
- Tool entries now expose bounded full JSON expansion for safe args/results. The same sensitive-key redaction pass that powers previews withholds full JSON whenever credentials, tokens, cookies, passwords, secrets, or oversized payloads are detected.
- Agent chat now has a user-facing support packet export that includes session/context metadata, correlation ids, linked entities, attention items, timeline entries, redacted tool previews, safe expanded JSON where available, and the conversation.

Schema change:

- `supabase/migrations/20260620110000_chat_tool_executions_affected_entities.sql` adds `chat_tool_executions.affected_entities jsonb not null default '[]'::jsonb`.
- Shape: `[{ kind, id, title?, projectId?, url?, operation? }]`.

Verified with:

- `pnpm --filter @buildos/web test -- src/lib/components/agent 'src/routes/api/chat/sessions/[id]/server.test.ts' src/routes/api/agent/v2/stream/server.test.ts src/lib/services/agentic-chat/tools/core/tool-executor.test.ts src/lib/services/agentic-chat/tools/core/tool-executor-libri.test.ts src/lib/services/agentic-chat/tools/core/search-telemetry.test.ts` (231 tests)
- `pnpm --filter @buildos/web test -- src/lib/components/agent/agent-chat-timeline.test.ts`
- `pnpm --filter @buildos/web test -- src/routes/api/chat/sessions/[id]/server.test.ts`
- `pnpm --filter @buildos/web test -- src/routes/api/agent/v2/stream/server.test.ts`
- `pnpm --filter @buildos/web test -- src/lib/components/agent/agent-chat-session.test.ts`
- `pnpm --filter @buildos/web test -- src/lib/components/agent/agent-chat-tool-presenter.test.ts`
- `pnpm --filter @buildos/web test -- src/lib/components/agent/agent-chat-step-export.test.ts` (steps export and support packet export)
- `pnpm --filter @buildos/web test -- src/lib/services/agentic-chat/tools/core/tool-executor.test.ts src/lib/services/agentic-chat/tools/core/tool-executor-libri.test.ts src/lib/services/agentic-chat/tools/core/search-telemetry.test.ts`
- `pnpm --filter @buildos/web check`

QA notes:

- Support packet conversation export now preserves live thinking-block activity with the same formatting used by the steps export.
- The broader agent component suite exposed a stale `AgentComposer` test that assumed a single responsive "Attach existing project image" button. The component intentionally renders responsive controls; the test now asserts at least one matching action exists.
- Svelte diagnostics are clean.

Still intentionally left for later follow-up:

- A dedicated Brain Dump detail route/page beyond the current History-selected entry flow.
- Retry-from-step, filters, and search.

## Scope

This spec covers three related product and architecture changes:

1. Persist and rehydrate a user-facing execution timeline from tool executions and agent events, instead of relying on in-memory thinking blocks.
2. Add Steps, Tools, and Changes tabs inside the agentic chat modal.
3. Make the Brain Dump entry point open or resume a context-bound chat, with the original dump, extracted entities, linked project, and change history available beside the conversation.

This document is planning only. It intentionally does not specify final UI copy or implement product code.

## Current System Findings

The chat system already persists most of the raw material we need:

- `chat_tool_executions` stores tool name, category, gateway operation, args, result, status, errors, timing, token count, sequence index, message linkage, turn linkage, and stream linkage.
- `chat_turn_runs` stores turn-level lifecycle fields such as status, context type, entity id, project id, request message, assistant message id, start time, finish time, and finish reason.
- `chat_turn_events` stores lower-level turn events by phase and event type, but the normal user session API does not currently return these rows.
- `chat_messages.metadata` stores compact `fastchat_tool_trace_v1` data for assistant messages.
- `AgentChatModal` currently renders the chat stream through `AgentMessageList`, with restored tool activity converted back into thinking blocks.
- `AgentMessageList` renders thinking blocks and created entity cards inline, but there is no durable normalized timeline model behind the UI.
- `CreatedEntityCards` already has the right general link strategy for projects, documents, and project entities.
- Admin chat audit routes already assemble a richer timeline for support and debugging, but that data shape is admin-oriented and includes information that should not automatically become user-facing.
- `onto_braindumps` remains the canonical Brain Dump persistence table. The older `/api/braindumps/**` modal stack was intentionally deprecated. The active path is `/api/onto/braindumps/**`.
- `onto_braindumps.chat_session_id` already exists, which gives us the correct anchor for resuming context-bound chat.
- History can list Brain Dumps and can open an agent chat only when the Brain Dump already has `chat_session_id`. If that field is missing, the current path cannot reliably create or resume a chat.

## Shared Product Principles

- The user should be able to reload the page and still answer "what happened?" without losing tool history.
- The visible timeline should be user-safe, not a raw admin/debug dump.
- Chat remains the primary interaction surface. Steps, Tools, and Changes are supporting views, not separate products.
- Created and updated entities should be linkable wherever they appear.
- Brain Dump chat should use the surviving ontology Brain Dump path, not revive the deprecated legacy Brain Dump modal or legacy API.
- The first implementation should synthesize from existing persisted tables. A new timeline event table is not needed unless performance or replay fidelity becomes a real constraint.

## Spec 1: Persistent User-Facing Execution Timeline

### Goals

- Persist and rehydrate a durable execution timeline for every agent chat session.
- Build the timeline from persisted tool executions, turn runs, turn events, messages, and extracted entity references.
- Make the same timeline power reload, export, resume, support handoff, and the Steps, Tools, and Changes tabs.
- Keep the timeline stable after reload, even if in-memory thinking blocks are gone.
- Include links to affected projects, tasks, documents, and other entities when the information is available.

### Non-goals

- Do not expose admin-only prompt snapshots, full LLM payloads, hidden chain-of-thought, raw credentials, or unrestricted tool JSON to normal users.
- Do not introduce a new persistence table in the first version unless existing tables cannot support the required behavior.
- Do not make timeline rehydration depend on the assistant message metadata trace. That trace can remain a fallback, but the durable source should be database rows.

### Recommendation

The clear winner is to create a normalized user-facing timeline layer over existing persistence.

The server should assemble a `UserAgentTimelineItem[]` from:

- `chat_turn_runs`
- `chat_turn_events`
- `chat_tool_executions`
- `chat_messages`
- extracted created/updated/deleted entity references

The client should consume this normalized timeline instead of reconstructing user-visible history only from `ThinkingBlockMessage.activities`.

This keeps the implementation pragmatic:

- It reuses tables that already exist.
- It avoids another write path in the agent stream.
- It creates a single data contract for tabs, export, and future resume/support features.
- It lets us add a materialized timeline later if the query becomes expensive.

### Proposed API Shape

Preferred v1 option:

- Extend `GET /api/chat/sessions/[id]` to include `timelineItems`.
- Include `chat_turn_events` in the existing user-owned session query.
- Keep raw `toolExecutions` for backward compatibility during the transition.

Alternative:

- Add `GET /api/chat/sessions/[id]/timeline`.

Trade-off:

- Extending the existing session endpoint avoids an extra round trip and keeps reload simple.
- A separate timeline endpoint is cleaner if payload size becomes a concern or if the tabs should lazy-load.

Recommendation:

- Extend the existing endpoint first, with a server-side limit and a `truncated.timeline` flag if needed.
- Add a separate endpoint later only if sessions with large timelines become slow.

### Data Contract

```ts
type UserAgentTimelineItem = {
	id: string;
	sessionId: string;
	turnRunId?: string | null;
	streamRunId?: string | null;
	clientTurnId?: string | null;
	messageId?: string | null;

	source: 'turn_run' | 'turn_event' | 'tool_execution' | 'message' | 'entity_change';
	kind: 'step' | 'tool' | 'change' | 'message' | 'status';
	status:
		| 'pending'
		| 'running'
		| 'completed'
		| 'failed'
		| 'partial'
		| 'needs_input'
		| 'cancelled';

	timestamp: string;
	sequenceIndex?: number | null;

	title: string;
	summary?: string | null;
	detailPreview?: string | null;

	tool?: {
		name: string;
		category?: string | null;
		gatewayOp?: string | null;
		helpPath?: string | null;
		durationMs?: number | null;
		tokensConsumed?: number | null;
		argsPreview?: string | null;
		resultPreview?: string | null;
		errorMessage?: string | null;
		zeroResult?: boolean | null;
		resultCount?: number | null;
	} | null;

	projectRef?: EntityRef | null;
	entityRefs: EntityRef[];

	redaction?: {
		argsRedacted?: boolean;
		resultRedacted?: boolean;
		reason?: string | null;
	};
};

type EntityRef = {
	id: string;
	kind: 'project' | 'task' | 'document' | 'goal' | 'milestone' | 'risk' | 'event' | string;
	title?: string | null;
	projectId?: string | null;
	url?: string | null;
	operation?: 'created' | 'updated' | 'deleted' | 'linked' | 'read' | string;
};
```

### Timeline Assembly Rules

1. Turn runs become high-level status steps such as "Started agent turn", "Needs input", "Completed", or "Stopped".
2. Turn events become user-visible steps only when they describe meaningful progress. Noisy internal events should be filtered or summarized.
3. Tool executions become Tools tab entries and may also create summarized Steps entries.
4. Create/update/delete tool executions should produce Changes entries when we can identify affected entities.
5. Assistant and user messages remain in Chat, but important lifecycle messages can appear in Steps.
6. Timeline order should use `created_at`, then `sequence_index`, then stable source priority as a tie-breaker.
7. Every item gets a stable id such as `tool_execution:${id}` or `turn_event:${id}` so live and rehydrated data can dedupe.

### Entity Link Extraction

The first version should reuse existing created entity extraction logic from `agent-chat-tool-presenter`.

For update and link operations, we should add a small server-side normalizer that looks for:

- `project_id`
- `entity_id`
- `task_id`
- `document_id`
- tool result ids
- known gateway operation names

When an id is present but the title is missing, the timeline API can batch-enrich titles and URLs from project/entity tables.

Recommendation:

- v1: extract what is already present in args/results and generated tool summaries.
- v2: add batch enrichment for titles and URLs.
- v3: add explicit `affected_entities` metadata at tool execution write time if extraction remains fragile.

### Redaction and Safety

Timeline entries should prefer summaries and previews over full raw JSON.

Rules:

- Never expose secrets, tokens, credentials, provider access tokens, auth headers, or raw OAuth payloads.
- Truncate large args/results.
- Provide expandable raw details only after the redaction pass marks them safe.
- Treat admin-only fields as unavailable in user timeline APIs.

### Database and Indexing

No new table is recommended for v1.

Check existing indexes before implementation. If missing, likely useful indexes are:

- `chat_tool_executions(session_id, created_at)`
- `chat_tool_executions(session_id, turn_run_id, sequence_index)`
- `chat_turn_events(session_id, created_at)`
- `chat_turn_events(session_id, turn_run_id, sequence_index)`
- `chat_turn_runs(session_id, started_at)`

### Tests

Add focused tests for:

- Timeline assembly from tool executions and turn events.
- Redaction of sensitive args/results.
- Stable ordering when timestamps match.
- Created entity extraction and URL generation.
- Reloading a session and seeing the same timeline after in-memory thinking blocks are gone.
- Export using rehydrated timeline data.

## Spec 2: Steps, Tools, and Changes Tabs Inside Chat

### Goals

- Add user-facing tabs inside the agentic chat modal:
    - Chat
    - Steps
    - Tools
    - Changes
- Each entry should show status, timestamp, title, summary, and relevant project/entity links.
- Tools entries should include tool name, operation, args preview, result preview, duration, status, and error state.
- Changes entries should show what was created, updated, deleted, or linked, with direct navigation to the affected object.
- The tabs should work both live during an agent run and after reload from persisted timeline data.

### Recommendation

Build tabs as a separate presentation layer backed by `UserAgentTimelineItem[]`.

Do not overload `AgentMessageList` with timeline-specific rendering. It should remain responsible for the chat transcript.

Proposed components:

- `AgentChatTabs.svelte`
- `AgentTimelineList.svelte`
- `AgentTimelineEntry.svelte`
- `AgentToolEntry.svelte`
- `AgentChangeEntry.svelte`
- optional later: `AgentTimelineFilters.svelte`

### Chat Modal Integration

`AgentChatModal` should own the active tab state:

```ts
type AgentChatTab = 'chat' | 'steps' | 'tools' | 'changes';
```

Rendering model:

- `chat`: current `AgentMessageList`.
- `steps`: timeline entries where `kind` is `step`, `status`, or selected message milestones.
- `tools`: timeline entries where `kind` is `tool`.
- `changes`: timeline entries where `kind` is `change`, plus extracted entity refs from create/update/delete operations.

The composer should remain visible on all tabs. The user should be able to ask follow-up questions while inspecting Steps, Tools, or Changes.

### Live and Reloaded Data

The tabs need one merged timeline store:

- Live events from the current stream should update the timeline immediately.
- Rehydrated events from the session API should populate the timeline on load.
- Deduplication should use stable ids.
- Live local items should reconcile with persisted rows when the server response includes database ids.

Recommended approach:

1. Add a timeline store/derived value near the existing chat session state.
2. Convert live thinking block activity and tool stream events into the same `UserAgentTimelineItem` shape.
3. Replace live items with persisted versions when ids are known.
4. Keep existing thinking block rendering during transition so Chat behavior does not regress.

### Entry Design

All tab entries should share a compact row structure:

- status icon
- timestamp
- title
- one-line summary
- entity/project links
- expandable detail area

Tools detail area:

- tool name
- gateway operation
- args preview
- result preview
- result count or zero-result marker
- duration
- error message if failed

Changes detail area:

- operation
- entity kind
- entity title
- project link
- source tool or step
- timestamp

### Accessibility

The tab UI should use standard tab semantics:

- `role="tablist"`
- `role="tab"`
- `aria-selected`
- keyboard support for arrow navigation
- visible focus states

Timeline entries that expand should be buttons or `details` controls with clear keyboard behavior.

### Export Integration

The existing agentic chat export should prefer the normalized timeline when available.

Recommended export sections:

- Conversation
- Steps
- Tool calls
- Changes
- Open questions
- Linked entities

The export should work after reload, which is the main reason the persistent timeline matters.

### Trade-offs

Keeping Chat as the default tab is the least disruptive path.

Steps, Tools, and Changes as separate tabs are clearer than one timeline with filters because:

- Most users want "what happened?" first.
- Tool details can be noisy.
- Changes deserve direct linking and should not be buried under internal activity.

Filters can come later after the tabs are in use.

## Spec 3: Brain Dump Icon Opens or Resumes Context-Bound Chat

### Goals

- Clicking a Brain Dump entry point should open an existing chat session for that Brain Dump, or create one if it does not exist.
- The chat should carry the original dump text as context.
- The chat should show extracted Brain Dump data such as title, summary, topics, processing status, and linked project/entity refs.
- The side panel should show change history from the same timeline model used by the chat tabs.
- This should use `onto_braindumps`, not the deprecated legacy Brain Dump API.

### Product Interpretation

There are two related entry points:

1. Brain Dump items in History.
2. The brain-style chat launcher in navigation when the current UI context is a Brain Dump or captured dump.

The implementation should support both through the same idempotent "open Brain Dump chat" API.

### Recommendation

Add an idempotent server route:

```txt
POST /api/onto/braindumps/[id]/chat-session
```

Behavior:

1. Verify the current user owns the Brain Dump.
2. If `onto_braindumps.chat_session_id` exists and the session still belongs to the user, return that session id.
3. If no chat session exists, create one.
4. Seed the session with the Brain Dump content and metadata.
5. Update `onto_braindumps.chat_session_id`.
6. Return the session id and Brain Dump context payload.

This avoids making the client decide whether to create, resume, or repair session linkage.

### Supporting Detail API

Add or confirm a detail route:

```txt
GET /api/onto/braindumps/[id]
```

Response should include:

- id
- title
- content
- summary
- topics
- status
- error message if processing failed
- metadata
- processed timestamp
- chat session id
- linked project/entity refs when available

The existing list endpoint intentionally avoids returning full raw content by default. A detail endpoint is the right place to return content after ownership is verified.

### Chat Session Creation

When creating a session from a Brain Dump:

- Set session metadata/source to `onto_braindump`.
- Store the Brain Dump id in session metadata.
- Store the original Brain Dump text in the first user message or a system/context metadata field that the agent runtime can load.
- If Brain Dump metadata already includes a project id, set the session project context.
- If no project id exists, keep the chat global but keep the Brain Dump context panel visible.

Recommended metadata shape:

```ts
{
  source: 'onto_braindump',
  source_id: braindump.id,
  source_kind: 'captured_context',
  project_id?: string,
  linked_entity_ids?: string[]
}
```

### Brain Dump Context Panel

Add a side panel inside `AgentChatModal` when `brainDumpContext` is present.

Proposed component:

- `BrainDumpContextPanel.svelte`

Panel sections:

- Original dump text, collapsed by default when long.
- Extracted title, summary, and topics.
- Processing status and error state.
- Linked project.
- Linked entities.
- Change history, derived from timeline Changes entries.

The panel should not replace the chat. It should make the chat explainable and easier to resume.

### History Integration

Current History behavior can open a Brain Dump chat only when `chat_session_id` already exists.

Update flow:

1. User clicks a Brain Dump item in History.
2. Client calls `POST /api/onto/braindumps/[id]/chat-session`.
3. Server returns session id and context.
4. Client opens `AgentChatModal` with that session id and Brain Dump context.

This turns old Brain Dumps into resumable chat contexts instead of dead history items.

### Navigation Integration

Navigation already opens context-aware agent chat for projects and tasks.

For Brain Dump context:

- If the current route or selected item has a Brain Dump id, use the same open-chat endpoint.
- Otherwise keep the current global/project/task behavior.

This keeps the navigation button simple and avoids special-case client session creation.

### Linked Project and Entity Strategy

v1 sources:

- Brain Dump metadata if a project/entity id is already present.
- Chat session project id.
- Timeline Changes entries after the agent creates or updates entities.
- Created entity extraction from tool results.

v2 improvement:

- Add explicit associations if Brain Dumps need many-to-many links to projects/entities.

Potential options:

- A generic edge table if one already exists in the ontology layer.
- A dedicated `onto_braindump_links` table if not.

Recommendation:

- Do not add a new link table for v1. Use existing metadata plus timeline-derived links first.
- Revisit a link table only if users need Brain Dumps to be first-class linked artifacts across many projects/entities.

### Trade-offs

Storing the original Brain Dump as a first user message makes the chat transcript clear and exportable.

Storing it only in metadata is cleaner internally but less obvious to users after reload.

Recommendation:

- Create a visible seeded user/context message for new Brain Dump chats.
- Mark it with metadata so it can be styled as "Original Brain Dump" rather than treated like a normal user question if desired.

## Implementation Phases

### Phase 1: Timeline Model and API

- Add shared `UserAgentTimelineItem` types.
- Add server-side timeline assembly utility.
- Extend the user chat session API with `timelineItems`.
- Include filtered `chat_turn_events`.
- Add redaction and preview helpers.
- Add unit tests for assembly, ordering, redaction, and entity refs.

### Phase 2: Export Uses Durable Timeline

- Update agentic chat export to use `timelineItems`.
- Keep fallback to existing message/thinking block reconstruction.
- Verify export after page reload.

### Phase 3: Chat Tabs

- Add Chat, Steps, Tools, and Changes tab state to `AgentChatModal`.
- Add timeline list components.
- Render links to affected projects/entities.
- Keep composer visible across tabs.
- Verify live stream and reload behavior.

### Phase 4: Brain Dump Chat Resume

- Add `GET /api/onto/braindumps/[id]`.
- Add `POST /api/onto/braindumps/[id]/chat-session`.
- Update History Brain Dump opening to call the idempotent endpoint.
- Pass Brain Dump context into `AgentChatModal`.
- Add `BrainDumpContextPanel`.

### Phase 5: Entity Link Enrichment

- Add batch title/url enrichment for entity refs.
- Improve update/delete operation extraction.
- Consider explicit affected entity metadata at tool execution write time if needed.

## Additional Suggestions For Later

These are not part of the requested first pass, but they are natural follow-ups:

- "Retry from here" for failed or partial agent turns.
- Timeline search and filters.
- Diff view for document/task updates.
- Pin/bookmark important timeline events.
- User-facing "needs input" queue across sessions.
- A shareable internal support link to a specific session timeline event.
- Explicit notification when a tool could not write because the current context was read-only.

## Open Decisions

1. Should timeline data be returned from `GET /api/chat/sessions/[id]`, or should tabs lazy-load from a separate timeline endpoint?

    Recommendation: extend the existing endpoint first.

2. Should the original Brain Dump appear as a visible seed message?

    Recommendation: yes, but style it as original context so it does not feel like a newly typed prompt.

3. Should Brain Dump linked entities use a new link table immediately?

    Recommendation: no. Use metadata plus timeline-derived entity refs first.

4. Should raw tool args/results be expandable in the user UI?

    Recommendation: show redacted previews in v1. Add safe expansion later after the redaction rules are tested.

5. Should the tabs be Chat, Steps, Tools, Changes or only Steps, Tools, Changes?

    Recommendation: keep Chat as the default first tab. It preserves the current interaction model while adding the requested views.

## Ready-to-Build Checklist

Before implementation starts:

- Confirm the final timeline API shape.
- Confirm whether Brain Dump seeded context should be visible in Chat.
- Confirm tab placement in the modal header/body.
- Check existing database indexes before adding migrations.
- Inventory tool names/gateway operations that create, update, delete, or link entities.
- Decide the initial redaction denylist and max preview lengths.
