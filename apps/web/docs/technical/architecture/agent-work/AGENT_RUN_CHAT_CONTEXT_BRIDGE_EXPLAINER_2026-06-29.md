<!-- apps/web/docs/technical/architecture/agent-work/AGENT_RUN_CHAT_CONTEXT_BRIDGE_EXPLAINER_2026-06-29.md -->

# Agent Run → Chat Context Bridge: How It Works & What We Fixed

**Date:** 2026-06-29
**Audience:** Anyone touching the agent-run status modal, the agentic chat, or
the AI Inbox chat path.
**Companion to:** `AGENT_RUN_CHAT_CONTEXT_BRIDGE_PLAN_2026-06-29.md` (the
implementation plan). This doc explains the _flow_ and the _why_ behind the six
corrections folded into that plan after a codebase stress-test audit.

---

## 1. The problem in one sentence

When a user opens an agent-run status modal and clicks **Chat**, the chat should
already know what the run was trying to do — its proposed document/task changes,
what failed, what is still pending — but today it only opens with generic
project context. We are adding a **server-side bridge** that prepares the chat
with that context before the modal opens.

---

## 2. The one mechanism everything depends on

Before any of the fixes make sense, you need to understand the single trick this
whole feature rides on:

> **Proposal context has two carriers: a visible seed message and a transient
> model-focus injection.**

Here is the verified chain of why that works:

```
We insert a row in chat_messages:
   role = 'assistant'
   content = "<human-readable summary of the run + its changes>"
   metadata = { ...bookkeeping... }
        │
        ▼
GET /api/chat/sessions/[id]   (restore on modal open)
   - returns messages where role IN ('user','assistant')
   - includes metadata
   → the seed message SHOWS UP in the chat UI
        │
        ▼
User types the next message → fast-chat stream
   - loadRecentMessages() pulls recent rows
   - keeps role IN ('user','assistant','system')
   - builds model history from message CONTENT
   → the seed's CONTENT is in the prompt the model sees
```

So a plain assistant message still does double duty: the **user reads it** in
the UI, and the **model reads it** on the next turn. This is exactly the
pattern the AI Inbox chat already uses, which is why we copied it.

**2026-06-30 correction:** visible seed content is necessary but not sufficient
for proposal chats. `POST /api/agent/v2/stream` now also reads proposal context
from `chat_sessions.agent_metadata` and injects it as a non-persisted system
history message titled `Proposal Focus` before the model call:

- `source:'ai_inbox'` → `proposal_context.llm_text`
- `source:'agent_run_context'` → `agent_run_context.llm_text`

That keeps vague follow-ups like "what are we trying to do?" anchored to the
active proposal even when the regular project/calendar context cache is sparse.

### The critical subtlety (Fix #3 lives here)

The normal chat-history loader is built from message **content only**. The
loader (`FastChatHistoryMessage`) does not send message metadata to the model.

That means:

- Per-message `metadata.proposal_context.llm_text` is not enough by itself.
- Session-level proposal metadata is now model-facing because the stream route
  explicitly bridges it into transient system history.
- The visible `content` (`humanText`) still needs enough substance for the UI,
  audit exports, and ordinary history continuity.

This is counter-intuitive and is the root of Fix #3 below.

---

## 3. The flow we are building (end to end)

```
┌─────────────────────────────┐
│ AgentRunModalContent.svelte │   user clicks "Chat"
│  handleOpenChat()           │
└──────────────┬──────────────┘
               │  POST /api/agent-runs/[id]/chat-session
               ▼
┌─────────────────────────────────────────────────────────────┐
│ NEW ROUTE: /api/agent-runs/[id]/chat-session                 │
│  1. requireAuth + load agent_runs by (id, user_id)           │
│  2. resolve scope (project vs global)                        │
│  3. find-or-create a chat session   ← Fix #2 (reuse rules)   │
│  4. build run context  ← shared helper, Fix #3 (humanText)   │
│  5. ensure ONE idempotent seed msg  ← Fix #1 (no agent_run_id)│
│  6. bump counters if reused         ← Fix #6                  │
│  7. return {session, context_type, entity_id, project_id}    │
│       ← Fix #4 (scope from session, not run)                 │
└──────────────┬──────────────────────────────────────────────┘
               │  dispatch  buildos:open-agent-chat  { chat_session_id, ... }
               ▼
┌─────────────────────────────┐
│ Navigation.svelte           │  catches event, sets initialChatSessionId
└──────────────┬──────────────┘
               ▼
┌─────────────────────────────┐
│ AgentChatModal              │  loadAgentChatSessionSnapshot()
│                             │  → restores seed message → renders + model history
└─────────────────────────────┘
```

The key architectural decision: **the modal stays dumb.** It just loads a
session by id. All the run-specific work (reading the change set, formatting it,
deciding which session to use, idempotency) happens server-side in the new
route. That mirrors how `/api/inbox/[item_id]/chat-session` already works.

---

## 4. The six fixes, explained

Each fix below has: **what the audit found**, **why it bites**, and **what we
changed**.

### Fix #1 — Do not put `agent_run_id` on the seed message (the real bug)

**What the audit found.** `AgentChatModal.appendInjectedAgentMessage()` dedupes
_live, realtime-injected_ assistant messages by `metadata.agent_run_id`:

```js
// AgentChatModal.svelte (~line 249)
function messageHasAgentRun(runId) {
	return messages.some((m) => m.metadata?.agent_run_id === runId);
}
// when a new message arrives over realtime:
if (messages.some((m) => m.id === row.id) || messageHasAgentRun(agentRunId)) return; // dropped
```

Separately, the worker (`agentRunWorker.ts → injectChatCompletionMessage`)
injects a terminal `agent_run_summary` message that **does** carry
`agent_run_id`, into the same `parent_session_id`.

**Why it bites.** Our original seed metadata also included `agent_run_id`.
Picture the common timeline:

```
run still active
  → user clicks Chat → seed inserted (agent_run_id = X)   ✅ shown
  → run finishes
  → worker injects agent_run_summary (agent_run_id = X) over realtime
  → modal sees a message with agent_run_id X already exists → DROPS the summary ❌
```

The user would never see the run actually complete in that chat. Worse, the
audit also corrected a premise (see Fix #5) that revealed the worker injects a
summary for **every** run with a parent session — so this collision is the
normal case, not a rare one.

**What we changed.** The seed no longer sets `metadata.agent_run_id`. It keeps a
non-watched `run_id` for traceability and dedupes purely on its own
`idempotency_key` (`agent-run-context:<run.id>`) plus `source:
'agent_run_context'`. The seed and the worker summary now coexist instead of
fighting.

---

### Fix #2 — Reuse must also recognize the Inbox's session (no forked chats)

**What the audit found.** The plan's stated goal is "Inbox Chat and status-modal
Chat share the same chat." But the two paths key their sessions **differently**:

| Path                                       | `agent_metadata.source` | run identifier field     |
| ------------------------------------------ | ----------------------- | ------------------------ |
| AI Inbox (`inbox-chat-session.service.ts`) | `'ai_inbox'`            | `source_ref_id = run.id` |
| This bridge (original draft)               | `'agent_run_context'`   | `agent_run_id = run.id`  |

**Why it bites.** Suppose a run has no `parent_session_id` (it was not started
from a chat). The user opens **Inbox Chat** first → a session is created keyed
`source='ai_inbox'`. Later they open the **status modal** and click Chat. The
bridge searches for `source='agent_run_context'`, finds nothing, and **creates a
second session** for the same run. Now there are two parallel conversations and
the "shared context" promise is broken.

**What we changed.** The shared run-to-chat session lookup now needs to be used
by both the new status-modal route and the existing AI Inbox `agent_run` chat
path. Its lookup order is:

1. `run.parent_session_id` (if owned by the user),
2. an **inbox** session: `source='ai_inbox'` AND `source_ref_id=run.id`,
3. a prior **bridge** session: `source='agent_run_context'` AND `agent_run_id=run.id`,
4. otherwise create new.

Sharing the _formatter_ was never enough; the two surfaces have to share session
_identity_.

**Extra stress-test finding.** The reverse order matters too. If the status
modal opens the parent session first, the current inbox chat service would not
find it because `findExistingChatSession()` only searches linked
`chat_session_id` and `ai_inbox` metadata. So the implementation should not
only teach the status route to recognize inbox sessions; it should route
`agent_run` inbox chats through the same bridge service or shared lookup helper.

---

### Fix #3 — Put core detail in `humanText`, and bridge `llmText` at stream time

**What the audit found.** See §2's subtlety. The fast-chat history loader passes
assistant **content** to the model and **drops metadata**. Nothing in the stream
reads `metadata.proposal_context.llm_text`.

**Why it bites.** The original framing was "`humanText` = friendly visible
summary; `llmText` = the detailed source block (in metadata) for the model."
That was backwards until the stream bridge existed: the model read the visible
text and ignored metadata. If before/after change detail only lived in
`llmText`, the model was blind to exactly the context this feature exists to
provide.

**What we changed.** `humanText` (the visible content) must still carry the
model-relevant substance — including truncated before/after change diffs — so
the UI and chat export remain intelligible. `llmText` in session metadata is no
longer merely forward-compat: the stream endpoint now injects it into model
history as `Proposal Focus` for `ai_inbox` and `agent_run_context` sessions.

---

### Fix #4 — Return the _session's_ scope, not the _run's_ scope

**What the audit found.** The route returns `context_type` / `entity_id` /
`project_id` to the modal so it knows how to set up. The draft derived those
from the run.

**Why it bites.** A run can target a project while its **parent session is
global** (the user kicked it off from a global chat). If we reuse that global
session but return the run's _project_ scope, the modal will try to apply
project focus to a session that is actually global. If we return the global
scope, the proposal chat loses the project context the user expects.

**What we changed.** When a compatible session is **reused**, the returned scope
comes from that session's stored scope. A project-scoped run now treats
`project_id` as authoritative and does not reuse a global parent session; it
creates or reuses a project-scoped bridge session. Only newly created sessions
take their scope from the run.

**2026-06-30 header/context correction.** `AgentChatModal` still lets proposal
sessions keep proposal-specific titles such as `Chat: Update project START
HERE`, but project-session restore now uses `agent_metadata.focus.projectName`
for the selected context label. That makes the header and follow-up stream
context read as the actual project, while the proposal seed remains the visible
thread context.

---

### Fix #5 — Premise corrections (Start Here path; status vs. change-set status)

**What the audit found.** Two factual errors in the plan's narrative:

1. **"The Start Here capture path does not create a `proposal_ready` run
   directly."** It does. `startHereCaptureProcessor.createProposalRun()` inserts
   an `agent_runs` row with `status='proposal_ready'`, a pending `change_set`,
   `result.proposed_changes`, zeroed metrics, and `parent_session_id`, then
   syncs it into the inbox. Normal review runs are the ones that start queued
   and reach `proposal_ready` through `agentRunWorker.finalize()`.
2. **"Run was already accepted/dismissed."** `accepted`/`dismissed` are not
   `agent_run_status` values. The enum is `queued | running | paused |
needs_input | proposal_ready | completed | partial | failed | cancelled`.
   Accept/dismiss is a decision recorded on **`change_set.status`**
   (`applied` / `rejected`), while the run stays `proposal_ready`/`completed`.

**Why it matters.** (1) The Start Here path is an even stronger reason to make
the bridge read `agent_runs.change_set` directly: that path has the staged
proposal data but does not get a normal worker-finalization summary. Normal
parent-session worker runs still need the seed too, because the worker summary
lacks structured before/after detail and can collide with the seed if the seed
uses `agent_run_id` (Fix #1). (2) Seed text that wants to say "this was already
accepted/dismissed" must read `change_set.status`, not `run.status`, or it will
report the wrong thing.

**What we changed.** Corrected both statements in the plan and pointed the
"already decided" seed logic at `change_set.status`.

---

### Fix #6 — Bump `last_message_at` when seeding a reused session

**What the audit found.** The plan sets `message_count = 1` and
`last_message_at = now` only on the **new session** branch (because creation
always writes one message). The reuse branch inserts a seed but did not update
the session's counters.

**Why it bites.** Sessions are ordered by `last_message_at` / `updated_at`.
Inserting a message into a reused session without bumping those leaves the
session sorting stale (it can appear older than it is, or not float to the top
of recent lists).

**What we changed.** When the seed is actually inserted into a reused session,
explicitly bump `last_message_at` and increment `message_count`.

---

## 5. What did NOT need to change (verified safe)

- **The seed-as-context mechanism** works exactly as the plan assumed (§2).
- **Schema is fine.** Every column the route reads off `agent_runs` exists:
  `project_id, context_type, change_set, result, status, label, goal,
instructions, expected_output, scope_mode, allowed_ops, parent_session_id`.
  (An early audit note worried about `entity_id`/`agent_metadata` on
  `agent_runs` — false alarm: `entity_id` is a derived _output_ of the route,
  and `agent_metadata.focus` lives on `chat_sessions`, not the run.)
- **Idempotency convention** matches `persistMessage()` —
  `(session_id, user_id, role, metadata.idempotency_key)`.
- **`merge_chat_session_agent_metadata`** exists and shallow-merges; safe for a
  top-level metadata patch.
- **Event dispatch / Navigation / modal restore** all behave as described.
- **No change** to Accept/Dismiss/commit — this bridge only prepares discussion
  context; applying changes still flows through `/api/agent-runs/[id]/commit`.

---

## 6. The mental model to keep

1. **A visible assistant message is the context.** Not metadata, not a side
   channel — the message the user can see is the same one the model reads.
2. **Therefore the visible text must be self-sufficient** for the model
   (Fix #3).
3. **`chat_messages.metadata.agent_run_id` is a reserved dedupe key** owned by
   the worker-summary path; the seed must not reuse it (Fix #1).
4. **One run = one chat session**, across Inbox and status modal, so the reuse
   key must be cross-recognized in both opening orders (Fix #2) and the returned
   scope must match the session you actually reused (Fix #4).

If you remember those four things, the rest of the plan is mechanical.
