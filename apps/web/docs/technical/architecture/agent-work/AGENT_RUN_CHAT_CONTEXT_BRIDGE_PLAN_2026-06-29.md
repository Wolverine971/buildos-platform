<!-- apps/web/docs/technical/architecture/agent-work/AGENT_RUN_CHAT_CONTEXT_BRIDGE_PLAN_2026-06-29.md -->

# Agent Run Chat Context Bridge Plan

**Date:** 2026-06-29
**Status:** Implemented 2026-06-29 — shared service, status-modal API route, AI Inbox `agent_run` delegation, and status-modal UI wiring complete; manual smoke remains
**Related:** `AI_INBOX_DESIGN_2026-06-24.md`, `AI_INBOX_CLARIFIED_DECISIONS_SPEC_2026-06-26.md`, `HANDOFF_2026-06-19.md`, `02-STAGED-MUTATIONS.md`, `03-MONITORING-UI.md`
**Companion:** `AGENT_RUN_CHAT_CONTEXT_BRIDGE_EXPLAINER_2026-06-29.md` (flow walkthrough + rationale for the audit corrections)

> **Revision note (2026-06-29 audit):** This plan was verified against the live
> codebase. The core mechanism (durable assistant seed message → restored to UI
> and fed to model history) is confirmed working. Six correctness fixes were
> folded in after the audit. They are marked inline with **[AUDIT FIX]** and
> explained in the companion explainer doc. Summary:
>
> 1. The seed message must **not** carry `metadata.agent_run_id` (it would
>    collide with the modal's live-injection dedupe and suppress the worker
>    summary).
> 2. Session reuse must work in both opening orders: the status-modal route must
>    recognize inbox-created sessions, and the inbox `agent_run` chat path must
>    recognize parent/bridge sessions.
> 3. Model-facing detail must live in the **visible** `humanText`; `llmText` in
>    metadata is not read by the model today.
> 4. The returned `context_type`/`entity_id` must be resolved from the **reused
>    session**, not blindly from the run.
> 5. Premise correction: the Start Here capture path **does** create a
>    `proposal_ready` run directly, while normal review runs reach
>    `proposal_ready` through worker finalization. Also, "accepted/dismissed" is
>    a `change_set.status`, not a run status.
> 6. Seeding a reused session must bump `last_message_at`.

## Purpose

When a user opens an agent-run status modal and clicks **Chat**, the chat should
know exactly what the agent was trying to do. That means not just "this is a
project chat", but "this run proposed these document/task/goal changes, this
write failed, this change set is pending, and here is the relevant result/error
state."

Before this bridge, the status-modal Chat path did not guarantee that. The
implemented bridge prepares a durable chat session with explicit agent-run
context before opening `AgentChatModal`.

## Implementation Status

Implemented 2026-06-29:

- Shared server service:
  `apps/web/src/lib/server/agent-run-chat-session.service.ts`
- Focused service tests:
  `apps/web/src/lib/server/agent-run-chat-session.service.test.ts`
- Status-modal/Work Panel API route:
  `POST /api/agent-runs/[id]/chat-session`
- Route tests:
  `apps/web/src/routes/api/agent-runs/[id]/chat-session/server.test.ts`
- AI Inbox `agent_run` chat delegation through the shared service, so inbox and
  status-modal chats can reuse the same session in both opening orders.
- Inbox delegation test:
  `apps/web/src/lib/server/inbox-chat-session.service.test.ts`
- Status-modal `AgentRunModalContent.svelte` Chat wiring calls
  `POST /api/agent-runs/[id]/chat-session` before opening `AgentChatModal`, and
  passes the server-returned session/context in `buildos:open-agent-chat`.
- Client bridge helper + tests:
  `apps/web/src/lib/components/notifications/types/agent-run/agent-run-chat-session.client.ts`
  and
  `apps/web/src/lib/components/notifications/types/agent-run/agent-run-chat-session.client.test.ts`

Still next:

- Run manual smoke coverage for status-modal Chat from live notifications,
  Work Panel history, and AI Inbox opening order reuse.

## Researched Current State

### Previous Status Modal Chat Path

`AgentRunModalContent.svelte` dispatches a browser event:

```text
buildos:open-agent-chat
  sessionId: notification.data.parentSessionId
  contextType: notification.data.contextType
  entityId/projectId: notification.data.projectId
  source: agent_run
  runId
```

`Navigation.svelte` catches the event and opens `AgentChatModal` with
`initialChatSessionId`.

What this gives us:

- The parent session can be resumed when `agent_runs.parent_session_id` exists.
- The project/global context can be inferred from `context_type`, `entity_id`,
  and `agent_metadata.focus`.
- Saved messages in that session are loaded by
  `/api/chat/sessions/[id]`.

What it does not guarantee:

- No server step loads `agent_runs.change_set`.
- No server step loads `result.proposed_changes`.
- No server step inserts a run-context seed message.
- If the parent chat does not already contain a detailed summary, the next chat
  turn may only have general project context.

### AI Inbox Chat path

`DashboardInboxModal.svelte` calls:

```text
POST /api/inbox/[item_id]/chat-session
```

That route delegates to `createInboxChatSession()`, which already has useful
source-specific context builders:

- `project_suggestion`: uses `buildProjectSuggestionProposalContext()`.
- `calendar_suggestion`: summarizes calendar evidence and proposed tasks.
- `agent_run`: reads `agent_runs.change_set`, result summary/answer, goal, and
  instructions.

It creates or reuses a chat session, then inserts a visible assistant seed
message with proposal context. This seed is important because both the user and
the model can see it.

### Chat session restore and model history

`AgentChatModal` loads `initialChatSessionId` via
`loadAgentChatSessionSnapshot()`, which calls `/api/chat/sessions/[id]`.

The restore endpoint returns user-facing `user` and `assistant` messages.
The fast chat stream later calls `sessionService.loadRecentMessages()` and uses
those saved messages as model history.

Implication: a `role: 'assistant'` seed message is the durable context carrier.
A hidden metadata-only context packet is not sufficient unless the stream
endpoint is also taught to read it, which it currently is not for
`proposal_context`.

### Worker-injected run summaries

`agentRunWorker.ts` (`injectChatCompletionMessage`) injects an assistant
`agent_run_summary` message into `parent_session_id` whenever the run has a
parent session. That helps, but it is not enough for this bug:

- The summary does not reliably include detailed `change_set` before/after
  context. It is a narrative terminal update, not a structured proposal view.
- **[AUDIT FIX — premise clarified]** There are two proposal paths. Normal
  review runs are inserted queued and reach `proposal_ready` through
  `agentRunWorker.finalize()` when staged writes exist; those runs also get a
  worker `agent_run_summary` when they have `parent_session_id`. The Start Here
  capture path is separate: `startHereCaptureProcessor.createProposalRun()`
  creates a `proposal_ready` run directly with a pending `change_set`, result,
  metrics, and `parent_session_id`, then syncs it into the inbox. That direct
  path is a real reason the bridge must read `agent_runs.change_set` itself
  instead of assuming a worker summary exists.
- **[AUDIT FIX — dedupe collision]** `AgentChatModal.appendInjectedAgentMessage()`
  blocks any _live realtime-injected_ assistant message when a message with the
  same `metadata.agent_run_id` already exists (`messageHasAgentRun()`). If our
  seed carries `agent_run_id`, and it is inserted before the run finishes, the
  worker's terminal `agent_run_summary` will be **silently dropped** from the
  open chat. Therefore the seed must **not** set `metadata.agent_run_id`; it
  dedupes on its own distinct `idempotency_key` plus a `source`/`seed_message`
  marker (see §4).

## Decision

Do not open the agentic chat directly from the status modal.

Instead, add a server-mediated bridge:

```text
AgentRunModalContent
  -> POST /api/agent-runs/[id]/chat-session
  -> create/reuse session
  -> ensure durable assistant seed message
  -> return chat_session_id/context
  -> Navigation opens AgentChatModal
```

This keeps `AgentChatModal` generic and moves source-specific context assembly
to the server, where the run row, change set, result, permissions, and
idempotency can be handled cleanly.

## Proposed Architecture

### 1. Extract shared agent-run context building

Create a server-safe helper, likely:

```text
apps/web/src/lib/server/agent-run-chat-context.service.ts
```

Responsibilities:

- Normalize `agent_runs.change_set` and `result.proposed_changes`.
- Prefer `change_set` from the row, fall back to `result.proposed_changes`.
- Summarize each change:
    - action/op
    - entity type
    - entity id
    - rationale
    - before/after field diffs
    - per-change error if present
- Include run-level context:
    - label
    - status
    - goal
    - instructions
    - expected output
    - scope mode
    - allowed ops
    - result summary/answer
    - result error/open questions when present
- Return:
    - `humanText`: visible assistant seed message. **[AUDIT FIX]** This is the
      only field the model actually reads on the next turn, so it must carry the
      model-facing substance — including truncated before/after change detail — not
      just a friendly human summary. The fast-chat history loader passes assistant
      message _content_ to the model but strips _metadata_ (`FastChatHistoryMessage`
      has no metadata field), so anything important must be in `humanText`.
    - `llmText`: compact source block stored in metadata for **future** prompt use.
      It is **not** read by the stream today. Treat it as forward-compat only; do
      not put context here that the model needs now.
    - optional operation summaries.

Refactor the existing `buildAgentRunContext()` logic from
`inbox-chat-session.service.ts` to use this helper, so Inbox Chat and
status-modal Chat stay consistent.

**[AUDIT FIX — bidirectional reuse]** The shared work cannot stop at the
formatter. The `agent_run` branch of `createInboxChatSession()` should delegate
to the same run-to-chat bridge service, or at least use the same session lookup
and seed-idempotency helper. Otherwise the reverse order still forks: if the
status modal opens the parent session first, the current inbox route will not
recognize that parent session because it only searches `ai_inbox` metadata and
`sourcePayload.chat_session_id`.

### 2. Add `POST /api/agent-runs/[id]/chat-session`

Route behavior:

1. Require authenticated user.
2. Load `agent_runs` by `id` and `user_id`.
3. Return 404 if missing.
4. Resolve chat scope:
    - If `run.context_type === 'project'` and `run.project_id`, use project chat
      scope.
    - Otherwise use the run context type when supported, falling back to global.
5. Try to reuse a session, in this priority order:
    - Prefer `run.parent_session_id` if it exists and belongs to the user.
    - **[AUDIT FIX — unify with inbox]** Otherwise look for a session the **inbox**
      already created for this run. The inbox keys those sessions as
      `agent_metadata.source = 'ai_inbox'` with
      `agent_metadata.source_ref_id = run.id` (and `source_type = 'agent_run'`) —
      **not** `agent_run_context`/`agent_run_id`. The reuse query must match that
      shape, or opening Chat from the status modal after using Inbox Chat will
      fork a second session for the same run.
    - Otherwise find a session this bridge previously created, keyed as
      `agent_metadata.source = 'agent_run_context'` with
      `agent_metadata.agent_run_id = run.id`.
    - Otherwise create a new chat session.
6. **[AUDIT FIX — scope from session, not run]** When a session is reused (parent
   or inbox), resolve the returned `context_type`/`entity_id`/`project_id` from
   the **reused session's** stored scope, not from the run. A run can target a
   project while its parent session is global; returning run-derived scope would
   make the modal apply project focus to a global session. Only newly created
   sessions take their scope from the run.
7. Ensure the seed message exists.
8. Return:

```ts
{
	created: boolean;
	seeded: boolean;
	session: ChatSession;
	chat_session_id: string;
	context_type: 'project' | 'global' | 'calendar' | string;
	entity_id: string | null;
	project_id: string | null;
}
```

### 3. Session reuse rules

Use the parent session when possible. That preserves continuity with the chat
that created or supervised the run.

Create a new session only when:

- `parent_session_id` is null.
- The parent session was deleted, archived, or belongs to another user.
- The parent session cannot be loaded.

For a new project-scoped session:

- `context_type = 'project'`
- `entity_id = run.project_id`
- `chat_type = 'agent_run'` or `'project'`
- `title = 'Chat: <run.label>'`
- `summary = run.goal`
- `message_count = 1`
- `last_message_at = now`
- `agent_metadata.focus` should use the project-wide focus shape already used
  by inbox chat sessions.
- Insert `chat_sessions_projects` when `project_id` exists.

For a reused session (parent or inbox):

- Do not rewrite the session title unless necessary.
- Optionally merge a shallow metadata patch via
  `merge_chat_session_agent_metadata`, but avoid overwriting unrelated
  `fastchat_*` metadata. (This RPC shallow-merges with `||`, so a top-level patch
  is safe but will replace, not deep-merge, nested keys.)
- **[AUDIT FIX]** When the seed is actually inserted into a reused session, bump
  the session's `last_message_at` (and increment `message_count`) so the session
  sorts/orders correctly. The "new session" branch sets `message_count = 1`
  because it always creates; the reuse branch must update counters explicitly.

### 4. Seed message idempotency

Insert a visible assistant seed message with metadata like:

```ts
{
  source: 'agent_run_context',
  // [AUDIT FIX] Intentionally NO agent_run_id here — see below.
  run_id: run.id,            // safe correlation key; NOT the dedupe field the modal watches
  seed_message: true,
  idempotency_key: `agent-run-context:${run.id}`,
  run_status: run.status,
  context_version: 1,
  proposal_context: {
    llm_text: context.llmText  // forward-compat only; not read by the stream today
  }
}
```

Before insert, look up an existing message in the same session with:

```text
role = 'assistant'
metadata contains { idempotency_key: 'agent-run-context:<run.id>' }
```

If found, do not insert another seed. This mirrors the existing chat message
idempotency convention in `createFastChatSessionService().persistMessage()`,
which dedupes on `(session_id, user_id, role, metadata.idempotency_key)`.

**[AUDIT FIX — critical] Do NOT set `metadata.agent_run_id` on the seed.**
`AgentChatModal.appendInjectedAgentMessage()` treats
`chat_messages.metadata.agent_run_id` as the dedupe key for _live
realtime-injected_ assistant messages: if any message in the open session
already has a given `agent_run_id`, a newly arriving one is dropped. The
worker's terminal `agent_run_summary` carries `agent_run_id`. So if our seed
also carried `agent_run_id` and was inserted while the run was still active, the
worker's terminal summary would be **silently suppressed** in the open chat. Use
a non-watched correlation key (e.g. `run_id`) for traceability, and dedupe the
seed purely via `idempotency_key` + `source: 'agent_run_context'`.

### 5. UI changes

Update `AgentRunModalContent.handleOpenChat()`:

1. Set local `openingChat = true`.
2. `POST /api/agent-runs/${runId}/chat-session`.
3. On success, dispatch `buildos:open-agent-chat` with returned
   `chat_session_id`, `context_type`, `entity_id`, and `project_id`.
4. Minimize the status modal.
5. On failure, keep modal open and show a toast.

Keep `Navigation.svelte` as the shell-level opener. It already knows how to
open `AgentChatModal` from an event.

### 6. What not to do

- Do not make `AgentChatModal` fetch `agent_runs` directly.
- Do not depend on `agent_metadata.proposal_context` alone unless the stream
  endpoint is updated to read it.
- Do not create a separate "agent run chat" modal.
- Do not force the user into the inbox to get proper context.
- Do not create a new database table for this slice.

## Stress Test Matrix

| Case                                                                                                                                                                    | Expected behavior                                                          | Guardrail                                                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Run has `parent_session_id`                                                                                                                                             | Reuse parent session and seed run context into it                          | Validate session belongs to user                                                         |
| Run has no parent session                                                                                                                                               | Create new project/global chat session                                     | Include `agent_metadata.source = 'agent_run_context'`                                    |
| Start Here proposal                                                                                                                                                     | Seed includes target document/update context from `change_set`             | Use `change_set`/`result.proposed_changes`, not entities touched                         |
| Normal worker run already injected `agent_run_summary`                                                                                                                  | Insert richer context seed once                                            | Use distinct `idempotency_key`                                                           |
| User clicks Chat repeatedly                                                                                                                                             | Same session, no duplicate context messages                                | Metadata idempotency lookup                                                              |
| Run is `proposal_ready`                                                                                                                                                 | Seed says changes are staged and still pending                             | Include run status and change set status                                                 |
| Run is `partial` with failed changes                                                                                                                                    | Seed includes per-change errors                                            | Summarize `change.error`                                                                 |
| Change set already applied/rejected (the "accepted/dismissed" decision lives on `change_set.status`, not on `run.status` — run stays `proposal_ready`/`completed`/etc.) | Chat still opens read-only discussion context                              | Read `change_set.status` (`applied`/`rejected`), include current run + change-set status |
| Run is still running                                                                                                                                                    | Chat opens with current goal/instructions/status; change set may be absent | Make no promise of final proposed changes                                                |
| Change set is empty                                                                                                                                                     | Seed falls back to goal/instructions/result/error                          | Do not block chat                                                                        |
| Parent session missing/deleted                                                                                                                                          | Create a new session                                                       | Do not fail solely because parent is gone                                                |
| Project id missing                                                                                                                                                      | Open global chat                                                           | Keep `project_id = null`                                                                 |
| Huge change set                                                                                                                                                         | Truncate field diffs and cap number of changes shown                       | Include count and "truncated" note                                                       |
| Unauthorized run                                                                                                                                                        | 404 or forbidden, no session/message insert                                | Query by `id` and `user_id`                                                              |
| Existing inbox chat session exists for same run                                                                                                                         | Prefer parent session if present; otherwise reuse run-context session      | Avoid splitting into many chats                                                          |
| Chat opened from notification stack and Work Panel                                                                                                                      | Same endpoint and same seed behavior                                       | Do not duplicate client logic                                                            |

## Holistic Integration Notes

### AI Inbox

The inbox chat route already proves the pattern: source-specific server context,
visible assistant seed, then `AgentChatModal` with `initialChatSessionId`.

This bridge should reuse the same agent-run context helper so:

- Inbox Chat for `agent_run` items and status-modal Chat show the same content.
- Future improvements to change summaries apply to both surfaces.
- The inbox remains a durable queue, but it is not required to open a useful
  discussion.

### Notification Stack and Work Panel

`AgentRunModalContent` is used for live notifications and synthesized history
runs. A route-based bridge works for both, as long as `runId` exists.

The modal already keeps Chat available whenever `canOpenChat` is true, which in
practice spans active runs (`queued`, `running`, `paused`, `needs_input`,
`proposal_ready`) **and** terminal runs (`completed`, `partial`, `failed`,
`cancelled`). The bridge must therefore handle the terminal/empty-change-set
cases gracefully (fall back to goal/result/error), not just the active and
proposal cases. A loading state prevents repeat clicks while the bridge route is
running.

### AgentChatModal

No architectural change needed. It already:

- loads a session by id,
- restores assistant seed messages,
- derives project focus from `session.agent_metadata.focus`,
- loads recent messages into model history on the next stream turn.

### Fast Chat Stream

The stream path already includes recent saved assistant messages in model
history. That is why the seed must be a normal assistant message.

Future enhancement: the stream endpoint could explicitly read
`agent_metadata.proposal_context.llm_text`, but that is not required for this
fix and would be a broader prompt-contract change.

### Change Set Commit

This bridge does not approve or reject anything. It only prepares discussion
context. Accept/Dismiss still flow through:

- `POST /api/agent-runs/[id]/commit`
- `commit_change_set`
- inbox decide adapters

This avoids mixing "talk about it" with "apply it."

### Worker Summaries

Worker `agent_run_summary` messages remain useful terminal updates. They should
not be treated as a replacement for explicit run-context seeding, because they
are not guaranteed to include the staged proposal details.

## Implementation Order

1. **Done:** Add the shared server helper for agent-run chat context.
2. **Done:** Add a shared run-to-chat session service that both the new
   status-modal route and the existing inbox `agent_run` chat path can call.
3. **Done:** Add `POST /api/agent-runs/[id]/chat-session`.
4. **Done:** Refactor `inbox-chat-session.service.ts` so `agent_run` source
   items use the same session lookup, seed idempotency, and context helper as
   the new bridge.
5. **Done:** Add route/service tests for ownership, parent-session reuse,
   inbox-session reuse in both directions, new-session creation, idempotent seed
   insertion, and context content.
6. **Done:** Update `AgentRunModalContent.svelte` to call the endpoint before
   dispatching `buildos:open-agent-chat`.
7. **Done:** Add focused client-helper tests for the modal-to-route response
   contract.
8. **Done:** Update manual smoke docs with the shared seeded-session behavior.
9. **Next:** Run manual smoke in the browser against live data for notification
   stack, Work Panel history, and AI Inbox opening-order reuse.

## Test Plan

### Service tests

- Builds context from `run.change_set`.
- Falls back to `result.proposed_changes`.
- Includes failed per-change errors.
- Includes Start Here document proposal fields.
- Handles empty/malformed change set without throwing.
- Truncates long values.

### Route tests

- Unauthorized user receives 401.
- Missing run receives 404.
- Run owned by another user is not opened.
- Reuses valid `parent_session_id`.
- Reuses a status-modal/parent session when opening the same run from AI Inbox.
- Reuses an AI Inbox session when opening the same run from the status modal.
- Creates a new project session when no parent session exists.
- Creates a global session when no project exists.
- Inserts exactly one seed message for repeated calls.
- Returns the session/context payload expected by the UI.

### UI/manual smoke

- Open failed agent-run modal, click Chat, verify chat opens and first visible
  context references the failed run/change.
- Open Start Here proposal, click Chat, verify context mentions the Start Here
  document update and staged review state.
- Click Chat twice, verify no duplicate seed messages.
- Open Chat from AI Inbox and from status modal for the same run, verify the
  proposal context is consistent.
- Accept or dismiss remains separate from Chat and still updates inbox/status
  state.

## Acceptance Criteria

- From any agent-run status modal with a valid `runId`, Chat opens the full
  `AgentChatModal`.
- The opened chat contains a visible assistant seed message that explains the
  run and any staged/failed/proposed changes.
- The next user message in that chat has the seed in model history.
- Repeated Chat clicks do not duplicate seed messages.
- Parent sessions are reused when valid; new sessions are created when needed.
- No existing Accept/Dismiss/commit behavior changes.
- Inbox Chat and status-modal Chat share the same agent-run context formatter.

## Risks and Open Questions

- **Parent session noise:** Reusing the parent chat can add a seed message to an
  older conversation. This is acceptable because it preserves continuity, but
  the seed should be concise and idempotent.
- **Multiple related runs in one session:** A chat can supervise several agent
  runs. The idempotency key must be per run id, not per session.
- **Very large changes:** The seed must summarize, not dump entire document
  bodies. The full payload can remain in metadata for future use.
- **Already-decided proposals:** Chat should still work, but text must clearly
  say the current status so the user does not think a pending decision remains.
- **Future prompt contract:** If we later want invisible high-fidelity context,
  add explicit stream support for `agent_metadata.proposal_context`. Do not rely
  on that for this fix.

## Conclusion

The plan should work cleanly with the existing system because it follows the
already-shipped AI Inbox chat pattern: server-side source context, durable
assistant seed message, then normal `AgentChatModal` session restore.

The key architectural correction is to make the agent-run status modal use the
same kind of context-preparation step that the inbox already uses. Project
context alone is not enough; the bridge must translate the run row's change set,
result, errors, and current status into chat-readable context before the modal
opens.
