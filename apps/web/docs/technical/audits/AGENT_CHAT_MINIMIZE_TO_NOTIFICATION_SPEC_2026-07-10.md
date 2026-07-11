<!-- apps/web/docs/technical/audits/AGENT_CHAT_MINIMIZE_TO_NOTIFICATION_SPEC_2026-07-10.md -->

# Agent Chat Minimize-to-Notification — Research + Design Spec (2026-07-10)

**Goal:** Minimize the agent chat modal while a turn is processing, let it keep working, show live status ("processing" → "response ready") in the notification stack, and reopen it to resume where you left off. Support multiple parked chats without the complexity of multiple open modals.

**Status:** BUILT + LIVE-VERIFIED 2026-07-10 (uncommitted). All 5 WPs shipped: `chat-session` notification type, `chat-session-notification.bridge.ts` (8 unit tests), header minimize button, close-while-streaming auto-park, card-click reopen via `buildos:open-agent-chat`, Navigation park-before-open coordination, dismiss = finalize. Live-proven end-to-end on localhost: park mid-stream → "Working on a response…" → "Response ready" + preview → reopen with full reply; idle park; dismiss. Deviation from spec: no `resolveParkedChatSession` on history-page reopen was needed beyond the `applyChatSessionSnapshot` hook (covers all reopen paths).

**Iteration 2 (same day): KEEP-ALIVE PARK — seamless resume.** DJ reported the DB-snapshot reopen felt like "a weird stale state" (mid-turn, only persisted data exists — streamed text isn't saved until turn end). Fix: minimize no longer tears the client down. The modal component stays MOUNTED in Navigation with a new `hidden` prop — the inner `<Modal isOpen={isOpen && !hidden}>` closes all chrome (`{#if isOpen}` children, scroll lock, ESC), while the stream controller, messages, and realtime stay live in the script scope. Reopen = unhide: instant, mid-stream, tool calls still animating. Because Navigation lives in the layout, the parked chat survives client-side route changes. Mechanics: `onParked` callback → Navigation keeps `parkedChatSessionId` (mount condition `showChatModal || parkedChatSessionId !== null`); same-session open request or nav chat button = seamless unhide; different-session request = `hardParkAndClose()` (card + teardown, DB-snapshot resume) then clean remount; card dismiss fires `buildos:chat-session-dismissed` so Navigation unmounts the hidden instance (after `markSessionFinalized()` to avoid a duplicate close). The DB-snapshot path remains the fallback after full page reload. Live-verified: parked mid-stream on /today, navigated to /projects, card streamed status flip, reopened seamlessly (token count grew while hidden 5.6k→9.2k; second turn streamed to completion while parked and rendered live on unhide).

---

## 1. Research findings (what exists today)

### 1.1 Server-side turn durability — ALREADY EXISTS ✅

The single biggest enabler is already shipped: **an in-flight chat turn survives client disconnect.**

- `apps/web/src/routes/api/agent/v2/stream/+server.ts` runs the LLM/tool loop in a detached async IIFE (opens ~line 1232) and returns the SSE response immediately (line 4211). The turn's lifetime is NOT the request's lifetime.
- The turn is aborted only by an internal `turnAbortController` (lines 1024–1033), never by `request.signal` — there is no request-abort wiring at all. Abort fires on:
    1. Timeout: `FASTCHAT_DETACHED_TURN_MAX_DURATION_MS` = **285s** (lines 311–314); route `config.maxDuration = 300`.
    2. Explicit cancel: `startFastChatCancelWatcher` (lines 584–637) polls `chat_sessions.agent_metadata` every 750ms for a cancel hint written by `POST /api/agent/v2/stream/cancel`.
- On SSE write failure the route sets `streamDetached = true`, logs "FastChat stream detached; continuing turn execution" (lines 1177–1203), and keeps going. All `!streamDetached` guards gate only SSE emissions — DB writes always happen. The assistant message persists to `chat_messages` (line 3785) and `chat_turn_runs` finalizes to `completed` + `assistant_message_id` (lines 3965–3969) regardless of whether anyone is listening.
- **Hard limit:** durability is bounded by the ~285–300s serverless invocation. Longer work already has an escape hatch: the `delegate_task` chat tool spawns a fully durable worker-side `agent_run` (which already has its own notification type).

### 1.2 Client resume machinery — ALREADY EXISTS ✅

- Durable in-progress marker: `chat_turn_runs` row inserted `status:'running'` at admission (`turn-admission.ts:125–140`); stale runs force-cancelled.
- Lightweight probe: `GET /api/chat/sessions/[id]?probe=active-turn` (`routes/api/chat/sessions/[id]/+server.ts:405–421`) returns turn-run status without the full snapshot.
- Full snapshot: same endpoint returns `session, messages, toolExecutions, turnRuns, timelineItems, voiceNotes`; `buildAgentChatSessionSnapshot` (`agent-chat-session.ts:782–869`) rebuilds the whole UI state, detects `activeTurnRun`, injects an "active turn" placeholder.
- In `AgentChatModal.svelte`: `applyChatSessionSnapshot` (1315–1345) shows "BuildOS is still finishing the latest response…" and arms `probeActiveTurnAndRefresh` (749–796) — exponential-backoff polling until the run goes terminal, then a full reload picks up the persisted assistant message. `reconcileTurnFromSession` (1375–1426) handles matching by `stream_run_id`/`client_turn_id`.
- **There is no live SSE re-attach/replay.** Resume is a DB reload + poll. That's fine — it matches the "stateless resume" DJ wants.
- Realtime hook that could upgrade polling later: the modal already subscribes to `chat-messages:{sessionId}` INSERTs (lines 319–337), but the handler only appends messages carrying `metadata.agent_run_id` (agent-run injected), ignoring normal turns (early return at 288).

### 1.3 Modal close today = full teardown ❌ (this is the gap)

- `AgentChatModal.svelte` state is ALL component-local `$state` (`messages` line 224, `currentSession` line 228, the stream controller instance line 496). Every mount site gates with `{#if openFlag}`, so close = unmount = client state gone. No always-mounted instance exists (Navigation's is also `{#if}`-gated, line 1508).
- Close path: `handleClose` → `releaseSessionResources('close')` (1950–1990) → `finalizeSession()` (POSTs `/api/chat/sessions/{id}/close` + classify, keepalive) + `stream.disposeActiveStream({ reconcile: false })` + realtime unsubscribe + voice/attachments cleanup.
- Note: `disposeActiveStream` only aborts the client fetch — it does NOT hit the cancel endpoint. So **even today, closing mid-turn lets the server finish and persist**; the user just never finds out. Only `stopGeneration()` (user "Stop") actually cancels server-side.
- The `/close` endpoint doesn't kill the turn either — it just updates context fields and queues classification.
- **No minimize affordance exists** in AgentChatModal/AgentChatHeader (header has only secondary actions, view-project, export, admin, X — `AgentChatHeader.svelte:640–651`).
- Single-session model: one `currentSession` per instance, no multi-session registry. Only client-side session breadcrumb anywhere is `briefChatSession.store.ts` (briefId→sessionId map).

### 1.4 Notification stack — generic and ready to host this ✅

- Store: `stores/notification.store.ts`. Full lifecycle API: `add/update/remove/expand/minimize/minimizeAll/setStatus/setProgress`. State = `Map<id, Notification>` + `stack` + single `expandedId`. Persists to **sessionStorage** (`buildos_notifications_v2`, 30-min TTL, same-tab). Action functions are stripped on serialize and must be re-registered by a bridge on init.
- Chrome: `NotificationStackManager` (mounted once in `+layout.svelte:1106`) → `NotificationStack` (bottom-right, `MAX_VISIBLE = 5`, "+N more" overflow) → `MinimizedNotification` (lazy-loads a per-type minimized view) + a single `NotificationModal` for `expandedId`.
- Type registration is hardcoded switches in `MinimizedNotification.svelte` (~lines 29–98) and `NotificationModal.svelte` (~lines 28–93), plus the type union + interface in `types/notification.types.ts` (lines 43–49, 322–327).
- Existing types: `agent-run` (realtime-driven bridge mirroring `agent_runs` table), `project-synthesis` (self-driven streaming bridge — the best reference for "operation continues while minimized"), `calendar-analysis`, `time-block`. **Brain dump no longer uses this system** — it was folded into agentic chat; the notifications README is stale.
- Bridges live in `lib/services/*-notification.bridge.ts`, initialized in `+layout.svelte:484–510` (`initNotificationBridges`). Bridges own add/update, progress streaming, and re-attaching actions after sessionStorage hydration.
- **There is no `chat-session` notification type and no dead code for one.**

### 1.5 Reopen mechanism — ALREADY EXISTS ✅

The agent-run → chat handoff is the exact pattern to reuse: `AgentRunModalContent.handleOpenChat` dispatches window event **`buildos:open-agent-chat`** with `{ sessionId, contextType, entityId, projectId }`; `Navigation.svelte` listens (~lines 490–512, listener at 661) and opens its AgentChatModal instance with `initialChatSessionId`. The snapshot loader + reconcile machinery does the rest.

---

## 2. Proposed design

### 2.1 Model: one open modal, N minimized chat cards

- At most **one chat modal open** at a time (matches today's single-instance reality and the notification system's single `expandedId`).
- **Multiple minimized chats** are allowed — each is a `chat-session` notification card in the stack with its own status. This delivers "multiple chats at once" (kick off a long turn, minimize, start another chat) without concurrent-modal complexity.
- Opening a minimized chat while another chat modal is open → auto-minimize the current one first (symmetric, no data loss since sessions are server-persisted).

### 2.2 Minimize semantics vs close semantics

- **Minimize** (new header button, chevron-down/minus icon next to X):
    - Skips `finalizeSession()` entirely (session stays open, no classify).
    - Calls `stream.detachActiveStream({ reconcile: false })` (server turn keeps running — already true).
    - Hands `{ sessionId, contextType, entityId, projectId, title, lastUserMessage, activeTurnRun? }` to the chat-session bridge, which adds/updates the notification card.
    - Then unmounts the modal as today.
- **Close (X)** keeps today's behavior (finalize + classify + teardown), EXCEPT: if a turn is actively streaming, close **auto-minimizes instead** (DJ's stated need: "close it while it's processing" → it should park, not vanish). A truly-idle chat X'ed = ended, no card.
- Implementation: parameterize `releaseSessionResources(reason)` — a `'minimize'` reason skips `finalizeSession` and the notification handoff happens before unmount.

### 2.3 The `chat-session` notification card

Minimized card shows:

- Chat title (session title or first-user-message snippet) + context chip (project name / "Today" / general).
- **Status**: `processing` (spinner + "Working…") while a turn run is active → `success` ("Response ready" + assistant snippet) when terminal-completed → `error`/timeout states ("Timed out — reopen to continue") → `idle` (just a parked chat, no polling).
- Click → reopen the full chat modal (see 2.5). **No expanded NotificationModal state** — the "expanded" form of a chat notification IS the chat modal itself. The minimized view intercepts click itself (or uses a `view` action) rather than calling `notificationStore.expand()`, so we never compete for the single `expandedId` slot or nest a chat inside `NotificationModal`.

### 2.4 The bridge: `chat-session-notification.bridge.ts`

Modeled on the project-synthesis bridge (self-driven) + agent-run bridge (hydration re-attach):

- `minimizeChatToNotification(payload)` — called by the modal; dedupes by `sessionId` (one card per session), `add()` or `update()`.
- If minimized with an active turn: bridge runs the **probe loop** against `GET /api/chat/sessions/[id]?probe=active-turn` (reuse `probeActiveTurnRun` from `agent-chat-session.ts:327` with the same backoff schedule). On terminal: `setStatus('success')` + fetch the assistant message snippet for the card. Turn cap is 285s, so polling is bounded and cheap.
- On init (post-hydration): re-attach actions to persisted `chat-session` cards and re-probe any still marked `processing` (reconcile against reality — the turn likely finished or timed out during reload).
- **Dismissing a card = ending the chat**: bridge fires the `finalizeSession` equivalent (`POST /api/chat/sessions/{id}/close` keepalive + classify) so parked-then-abandoned sessions don't stay open forever. This also answers "who closes a session that's minimized and never reopened" — dismissal or sessionStorage TTL expiry (30 min) does.
- Register init/cleanup in `+layout.svelte` `initNotificationBridges`.

### 2.5 Reopen path

- Card click → dispatch `buildos:open-agent-chat` with `{ sessionId, contextType, entityId, projectId }` → Navigation's existing handler opens AgentChatModal with `initialChatSessionId` → existing `loadChatSession` → `applyChatSessionSnapshot` already handles both cases:
    - Turn still running → "BuildOS is still finishing…" + probe → auto-refresh on completion.
    - Turn finished → full history including the new assistant message.
- Bridge removes the card on successful reopen.
- If another chat modal is open, Navigation handler minimizes it first (2.1).

### 2.6 Out of scope for v1 (explicitly)

- Live SSE re-attach / token-by-token replay after reopen. (DB reconcile is enough; the existing "still finishing…" affordance covers the gap.)
- Multiple simultaneously OPEN modals.
- Embedded chat surfaces (`BriefChatModal` embedded mode) — minimize only from standard modal mounts.
- Turns > 285s — that's `delegate_task` → durable agent run territory, which already has its own notification card.
- Realtime `chat_turn_runs` subscription (upgrade path replacing the probe loop; polling is fine for a ≤285s window).

---

## 3. Work packages

| WP   | What                                                                                                                                                                                                            | Files                                                            | Size |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---- |
| WP-1 | `chat-session` notification type plumbing: type union + interface + guard; switch cases in `MinimizedNotification.svelte`; `ChatSessionMinimizedView.svelte` (no ModalContent — card click bypasses `expand()`) | `types/notification.types.ts`, `components/notifications/*`      | S    |
| WP-2 | Bridge service: add/update/dedupe by session, probe loop, status transitions, hydration re-attach, dismiss = finalize session                                                                                   | `services/chat-session-notification.bridge.ts`, `+layout.svelte` | M    |
| WP-3 | Modal minimize path: header minimize button; `releaseSessionResources('minimize')` variant skipping `finalizeSession`; close-while-streaming → minimize; handoff payload to bridge                              | `AgentChatModal.svelte`, `AgentChatHeader.svelte`                | M    |
| WP-4 | Reopen: card click → `buildos:open-agent-chat`; auto-minimize currently-open chat on cross-open; remove card on reopen                                                                                          | `ChatSessionMinimizedView.svelte`, `Navigation.svelte`           | S    |
| WP-5 | Polish: "response ready" snippet on card, timeout/error states, unread pulse, cap on parked chats (stack already caps at 5 visible)                                                                             | bridge + views                                                   | S    |

Rough total: ~1 focused day. The heavy machinery (detached turn execution, snapshot/reconcile/probe, notification stack, reopen event) all exists; this is wiring + one new notification type.

## 4. Open decisions for DJ

1. **Close-while-streaming = auto-minimize** (recommended) vs. a confirm dialog vs. keeping X as hard-close always.
2. **Idle-chat minimize** — allow parking non-processing chats too (recommended: yes, cheap and useful), or only minimize during processing?
3. **Dismiss = end session** (recommended) — comfortable with card dismissal finalizing/classifying the session?
4. Cap on concurrent parked chats (recommend soft cap 3–4; stack shows 5).

## 5. Key file index (for implementation session)

- Modal + teardown: `apps/web/src/lib/components/agent/AgentChatModal.svelte` (releaseSessionResources 1950, handleClose 1992, applyChatSessionSnapshot 1315, probeActiveTurnAndRefresh 749, realtime 284–343)
- Stream controller: `apps/web/src/lib/components/agent/agent-chat-stream-controller.svelte.ts` (detachActiveStream 839, disposeActiveStream 934, stopGeneration 875)
- Snapshot/probe: `apps/web/src/lib/components/agent/agent-chat-session.ts` (buildAgentChatSessionSnapshot 782, probeActiveTurnRun 327)
- Session GET + probe: `apps/web/src/routes/api/chat/sessions/[id]/+server.ts` (385–624; probe 405–421)
- Stream route (durability): `apps/web/src/routes/api/agent/v2/stream/+server.ts` (detach 1177–1203, timeout 311, finalize 3965)
- Notification store: `apps/web/src/lib/stores/notification.store.ts`; types: `apps/web/src/lib/types/notification.types.ts`
- Chrome: `apps/web/src/lib/components/notifications/{NotificationStackManager,NotificationStack,MinimizedNotification,NotificationModal}.svelte`
- Reference bridges: `apps/web/src/lib/services/{project-synthesis,agent-run}-notification.bridge.ts`
- Reopen event: `AgentRunModalContent.svelte` handleOpenChat (~375) + `Navigation.svelte` `buildos:open-agent-chat` handler (~490–512, 661) + modal mount 1508–1522
