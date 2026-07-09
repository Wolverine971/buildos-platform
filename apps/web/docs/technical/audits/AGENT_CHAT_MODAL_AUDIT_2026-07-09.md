<!-- apps/web/docs/technical/audits/AGENT_CHAT_MODAL_AUDIT_2026-07-09.md -->

# AgentChatModal Deep Audit — 2026-07-09

**Scope:** `apps/web/src/lib/components/agent/AgentChatModal.svelte` (2,758 lines), its 10 controller modules (`agent-chat-*.ts` / `*.svelte.ts`, ~9,500 LOC), its 13 UI subcomponents, `ui/Modal.svelte`, and the full frontend↔backend contract against `/api/agent/v2/stream`, `/api/chat/sessions/[id]*`, prewarm, close/classify, braindumps, and agent-to-agent endpoints.

**Method:** full manual read of the modal + mount-surface sweep, plus three parallel audit passes (controllers, UI subcomponents vs Inkprint/Hyperplexed bar, backend contract). All headline findings verified against source; the wire contract was verified by reading both emitter and handler. Audited as of the working tree (includes the uncommitted 2026-07-08 speed-fix wave).

**Overall read:** the architecture is genuinely good — the controller extraction is real (stream/SSE/prewarm/attachments/voice/shell-router all separately tested), event dedup and stale-run guards are solid, and the wire contract has no silent server→client drops. The problems cluster in four places: **the streaming hot path does O(conversation) work per animation frame**, **the prewarm speed feature defeats itself while the user types**, **several lifecycle paths leak or over-poll**, and **~700+ lines of verified-dead or duplicated code** create drift risk.

---

## TIER 1 — Streaming hot path (perf, fix first)

### 1.1 Full timeline rebuild on every streaming token flush — HIGH

`AgentChatModal.svelte:207-215` → `agent-chat-timeline.ts:679-793`

`liveTimelineItems = $derived.by(() => timelineItemsFromMessages(sessionId, messages))` feeds the always-mounted `AgentChatActivityTabs` (modal:2336), so it re-runs on **every** `messages` invalidation — i.e. every rAF-batched text flush and every activity update. Each run walks all messages and all thinking-block activities, calls `redactedJsonPreview` (`agent-chat-timeline.ts:198-241` — `JSON.parse` + double `JSON.stringify` up to 12KB per tool result), sorts, then `mergeAgentTimelineItems` builds a Map and sorts again, then `exportableStepCount` filters it a third time. A tool-heavy turn with a long streamed answer does ~20 JSON round-trips × ~60fps for the whole stream duration. Dominant main-thread cost per frame; mobile jank exactly during the "watch it work" moment.

**Fix:** derive timeline items from a structural version counter (bump only when a message is added/removed or an activity changes — not on text-content growth), or memoize per message id; make `redactedJsonPreview` lazy (compute on tab open / item expand).

### 1.2 Streaming assistant bubble re-parses full markdown every frame — HIGH

`AgentMessageList.svelte:310-315`, `markdown-text.ts:198-223`, `markdown.ts:255-267`

`shouldRenderAsMarkdown(content)` (regex battery + line split) and `{@html renderMarkdown(content)}` (marked + sanitize-html over the whole accumulated text) re-run per rAF flush of the growing message → O(n²) over the response length, and the `{@html}` swap replaces the bubble's DOM subtree each frame (kills mid-stream text selection, forces re-layout).

**Fix:** render plaintext (or append-only) during the stream, parse markdown once in `finalizeAssistantMessage`; or memoize by `(id, content.length)` with a throttle.

### 1.3 Prewarm aborts + reissues its POST on every keystroke — HIGH (verified in source)

`agent-chat-prewarm.svelte.ts:281-378` (tracked read at :294, skip-guard :310-315, cleanup :371-377), wired as `$effect(() => prewarm.orchestrate())` at `AgentChatModal.svelte:1114`

Pre-session (first-message compose), `orchestrate()` reads `getInputValue()` → the effect re-runs per keystroke; Svelte runs the prior cleanup first, which aborts the in-flight prewarm; the skip-guard only engages once `contextCacheReady`, which never becomes true while requests keep getting aborted. Typing faster than prewarm latency means the prepared prompt only materializes when the user pauses — defeating the exact first-token-speed path the 07-08 wave shipped — plus N aborted POSTs of server churn.

**Fix:** track a boolean `hasDraft` (derived, or read input via `untrack` after the key-match guard) instead of the raw string; and when `key === inflight.key` with a request in flight, return a no-op cleanup instead of aborting.

### 1.4 Prod pays for a dev-only token counter on every keystroke — MEDIUM

`AgentChatModal.svelte:421-440` → `agent-chat-formatters.ts:57-66`; consumer `AgentChatHeader.svelte:285-287`

`displayContextUsage` runs `estimateConversationTokens` over **all** messages on every `messages`/`inputValue` change, feeding a header pill that returns `null` unless `dev`. Every prod keystroke re-scans the transcript for a pill that never renders.

**Fix:** gate the derived on `dev` (or ship the pill in prod and cache the per-message sum, adding only the draft estimate).

### 1.5 Supporting hot-path hygiene — LOW/MEDIUM

- `messages` is a deep `$state` proxy holding large tool payloads (`result`, `streamEventsPreview`, `affectedEntities` stored into activity metadata at modal:1745-1791). Every update path is already copy-and-replace → `$state.raw` + reassignment keeps identical semantics, removes proxy overhead and the over-broad subscriptions feeding 1.1. (modal:202)
- `agent-chat-stream-controller.svelte.ts:210-215` — `activeStreamRunId`, `activeTransportStreamRunId`, `activeClientTurnId`, and both timing structs are `$state` with **zero reactive readers** (grep-verified); each write pays signal overhead per SSE event. Make them plain private fields. `recordClientStreamEvent` (:240-255) also allocates up to 3 fresh objects per `text_delta` to feed only a debug log.
- `AgentChatActivityTabs.svelte:87-96` — new `Intl.DateTimeFormat` per item per update; hoist to module scope.

---

## TIER 2 — Correctness, lifecycle & network

### 2.1 2-second full-snapshot polling during a restored active turn — HIGH (perf/cost)

`AgentChatModal.svelte:447, 689-698, 1212-1215` ↔ `api/chat/sessions/[id]/+server.ts:385-602`

While a restored turn is `running`, the modal re-fetches the **full session snapshot** every 2s: ~8 queries per hit (session, 400 messages + attachments join, tool executions LIMIT 1000, turn runs, turn events LIMIT 1000, voice groups/notes) plus `buildAgentTimeline` + per-kind entity enrichment. Detached turns can run 285s → ~140 heavy loads, no backoff, and each poll wholesale-replaces `messages` (resetting local UI state on those objects). The reconcile retry loop (modal:1250-1301, 8× at 1.2s) compounds it after a transport drop.

**Fix:** poll a lightweight "is the turn still running" probe (turn-run row only), do the full reload once on transition; add backoff.

### 2.2 401/402/429 stream failures collapse to a generic error — HIGH (UX/billing)

`agent-chat-stream-controller.svelte.ts:607-608, 715`; `agent-chat-session.ts:216-218`; server `hooks.server.ts:520-567`

The stream POST throws `HTTP ${status}` without reading the body; users see "Failed to send message. Please try again." The server's 402 consumption-freeze guard returns a specific `frozenMessage` + `billing_state` that frozen users never see — they get a dead-end retry prompt. Same gap in `prewarmAgentContext` (returns `null` on any `!ok`) → `ensureSessionReady` says "Unable to prepare a chat session right now." for frozen/expired accounts.

**Fix:** parse the error body on `!response.ok`; branch on status (401 → re-auth cue, 402 → billing message, 429 → retry-later).

### 2.3 Programmatic close leaks the live stream and skips finalization — MEDIUM

`AgentChatModal.svelte:1025-1050`

The `!isOpen` effect branch calls `handleClose()` only when `embedded`. A parent flipping `isOpen` programmatically (store-driven close, route change) leaves the SSE stream mutating `messages` behind a closed modal and skips `finalizeSession('close')` (classification), `notifyDataMutation`, voice/attachment cleanup — all deferred to `onDestroy`, which never runs for mount sites that keep the component mounted. Most mount sites wrap in `{#if}` so unmount saves them, but Navigation and any persistent host hit this.

**Fix:** route the non-embedded `wasOpen → !isOpen` transition through the same teardown as `handleClose` (minus `onClose` callback), and consolidate the three overlapping cleanup paths (close / isOpen-effect / onDestroy) into one `teardown()`.

### 2.4 Hung stream = infinite spinner + unbounded 2.5s timer respawn — MEDIUM

`agent-chat-stream-controller.svelte.ts:676-681` (`timeout: 0` → SSEProcessor inactivity timer disabled); `AgentChatModal.svelte:340-356`

If the server hangs without closing the socket, `isStreaming` stays true forever (desktop send blocked) and `scheduleAgentRunMessageFallback` re-arms itself every 2.5s with no attempt cap while streaming. Client has no self-defense for the known "no SSE heartbeat" gap.

**Fix:** pass a generous inactivity timeout (e.g. 90–120s since heartbeats arrive every 12s as SSE comments — note SSEProcessor must count comments as activity), and cap fallback re-arms (~5 attempts). Also: the fallback does a **full snapshot reload** to pick up one injected message — fetch the single message instead (modal:340-356).

### 2.5 Deny-path orphans the optimistic user bubble — MEDIUM

`agent-chat-sse-handler.ts:606-623`; `agent-chat-stream-controller.svelte.ts:728-734`; server `+server.ts:1505-1515`

On semantic denies (`active_turn_running`, access denied) the server rejects before persisting the user message, but the client only removes the optimistic bubble in the transport-catch path — the SSE `error` handler leaves it and doesn't restore the input. The bubble silently vanishes on the next snapshot reload; reads as data loss.

**Fix:** on terminal `error` events for the active turn, remove the optimistic message and restore the draft (but never clobber newer typed text — see 2.9).

### 2.6 `createdEntitiesBuffer` survives user cancel, flushes into next turn — MEDIUM

`agent-chat-sse-handler.ts:354, 577-623`

Cancel/supersede aborts the transport so neither `done` nor `error` arrives; the handler-closure buffer isn't reachable from `clearPendingToolState`. Turn A's created-task chip appears attached to turn B.

**Fix:** expose a `reset()` on the handler and call it from `clearPendingToolState`.

### 2.7 Realtime `chat_messages` channel never removed when session goes null — LOW

`AgentChatModal.svelte:318-321` — no else-branch; after `resetConversation` the old channel stays subscribed until a new session or destroy. Resource leak only (insert handler checks session id).

### 2.8 First-turn transport loss can't reconcile — MEDIUM

`agent-chat-stream-controller.svelte.ts:323-335, 473-475` — `buildTurnReconcileRequest` needs `getCurrentSession()?.id`; a prepared-prompt first turn that dies before its `session` event can't reconcile — the (server-completed) turn only appears on reopen. Narrow window, but it targets exactly the new-session fast path from the speed wave.

**Fix:** thread the prewarm-known session id (or the stream-created session id from the cancel-hint state) into the reconcile request.

### 2.9 Small correctness items — LOW

- `sendMessage` failure clobbers newer draft text with the failed message (`stream-controller:732`) — only restore if input is still empty.
- Failed `tool_result` stores the whole event envelope as `metadata.result`: server nulls `result` on failure, and `result ?? data ?? tool_result ?? toolResult` falls through to the envelope (modal:1679-1680).
- Post-`done` window: old `AbortController` intentionally leaked when a send lands between `done` and socket close; `stopGeneration`'s cancel-hint wait can race the natural-completion nulling (`stream-controller:850-859`) — null-check before `.abort()`.
- Tool result arriving after `done` is parked in `pendingToolResults` forever (sse-handler:548-554) — server-bug-only path.
- Attachment upload continues (create POST + `/complete`) after removal mid-hash (`agent-chat-attachments.svelte.ts:627-796`) — re-check `#hasAttachment` after each await.
- Unbounded per-mount collections: `seenTerminalAgentRunIds` (modal:255), presenter `entityNameCache` (`agent-chat-tool-presenter.ts:558`). Bounded in practice; clear on `resetConversation`.
- close→classify possible double-queue when the keepalive close response drops after the server queued classification (modal:1824-1858 ↔ `close/+server.ts:146-160`) — verify `queueChatSessionClassification` dedupes.

---

## TIER 3 — UX & accessibility

### 3.1 Switching tabs destroys chat view state — HIGH (one-line pattern fix)

`AgentChatModal.svelte:2344` unmounts `AgentMessageList` behind `{#if activeChatTab === 'chat'}`. Repro: scroll up → Steps tab → back to Chat: container remounts at `scrollTop 0` (auto-scroll doesn't fire — `messageCount` unchanged), every user bubble replays `bubble-send`, every created-entity chip replays its 1.6s ink-bloom, `userHasScrolled` is stale. The fix pattern is already in the same file: keep mounted, toggle `hidden` (like `ContextSelectionScreen` at modal:2523-2526). **Also fixes the dangling `aria-controls` on 3 of 4 tabs (a11y, axe-flagged)** — `AgentChatActivityTabs.svelte:151` references panel ids that don't exist when unmounted.

### 3.2 Thinking log doesn't follow the action — MEDIUM

`ThinkingBlock.svelte:468-471` — 5.25rem scroll box, no auto-scroll: tool call #5+ appends below the fold; the "watch it work" beat goes dark mid-turn. Auto-scroll to newest while `status === 'active'`, respecting manual scroll (same rule as the message list).

### 3.3 Screen readers never hear the answer — MEDIUM

Live regions exist for errors (modal:2375), interrupts, and the thinking block — but streamed assistant text has none. Announce politely on `finalizeAssistantMessage` ("BuildOS replied"), don't make the streaming bubble live. Related: `ThinkingBlock`'s `role="status"` is implicitly atomic (`:121-122`) — a 15-tool turn re-announces the whole block 15+ times; scope the live region to a one-line current-activity element.

### 3.4 Dark-mode overrides in Modal.svelte are compiled away — MEDIUM (verified via compile)

`Modal.svelte:937-945` uses `.dark .modal-container` without `:global(...)` — Svelte prunes it as unused (`css_unused_selector`); the dark card background + `--shadow-ink-strong` overrides never ship. Fix: `:global(.dark) .modal-container`. (Siblings ThinkingBlock/AgentMessageList do this correctly.)

### 3.5 Smaller UX/a11y items — LOW

- Dropping an image while streaming navigates the browser away: `AgentComposer.svelte:150-172` early-returns without `preventDefault` when disabled/streaming → browser opens the file. Always `preventDefault`, show a "can't attach right now" hint.
- Chat scroll region lacks `tabindex="0"` (siblings have it) — modal:2345, `AgentMessageList:158-163`.
- Modal focus trap matches invisible elements (`Modal.svelte:379-421` + the always-mounted hidden `ContextSelectionScreen`) — filter with `el.checkVisibility?.()`.
- `ChatSessionAuditActions` desktop menu lacks Escape/arrow-key/focus-in handling its siblings have (:222-266) and never repositions on resize.
- `ThinkingBlock` sniffs completion from copy strings ("complete", "ready for your response", `:22-34`) — drive off `status`/`agentState` only.
- Microcopy: `statusMeta` labels `pending` as "Running" and leaks raw enums for unknown statuses (`Tabs:104-118`); `formatTime` hardcodes `en-US` (`agent-chat-formatters.ts:12-17`) while the Steps tab uses user locale — two locales on one screen.
- `ThinkingBlock` uses emoji as icons (don't theme, ignore Inkprint tokens, per-platform rendering) — swap for the Lucide set already imported in `AgentChatActivityTabs.svelte:3-13`.

---

## TIER 4 — Dead code, duplication, drift hazards

### 4.1 Delete the camelCase dual-reads (~100 lines) — verified vestigial

The server has emitted snake_case only since 2026-06-10 (`agentic-chat-v2/types.ts:126-133`); restored snapshots read DB snake_case columns directly. Every camel fallback is dead: `AgentChatModal.svelte:1684-1743` (8 ladders, ~60 lines), `agent-chat-sse-handler.ts:161-168, 180-202`, `agent-chat-timeline.ts:708-753`. Delete rather than abstract.

### 4.2 250-line live/restored tool-formatter fork — HIGH drift risk

`agent-chat-session.ts:331-740` reimplements `agent-chat-tool-presenter.ts:799-1406` (target extractors + a hand-maintained past-tense mirror of `TOOL_DISPLAY_FORMATTERS`). Already lagging: no `search_project`, `get_field_info`, contact tools. Collapse into one shared tool-display table (action + target extractor per tool; tense applied by caller).

### 4.3 Dead SSE handlers & oversized event union

Client handles 5 event types the server never emits: `text`, `clarifying_questions` (incl. `addClarifyingQuestionsMessage` dep), `focus_active`/`focus_changed` (incl. `logFocusActivity` dep), `operation` (unreachable: `upsertOperationActivity`, `presenter.formatOperationEvent`, all of `agent-chat-operation-activity.ts` + its test). `skill_activity` is emitted **dev-only** (`+server.ts:2897, 3070`) — prod reconstructs from `skill_load` tool events; undocumented client-side. `AgentSSEMessage` (`agent.types.ts:407-517`) advertises a contract ~40% wider than the wire; `FastAgentStreamEvent` (`agentic-chat-v2/types.ts:118-145`) is the accurate union — retire or annotate the legacy one.

### 4.4 Dead state/props/branches (grep-verified)

- `ontologyLoaded` is write-only-false (modal:407, 883, 2502); the header badge it gates can never render; no `ontology_loaded` SSE case exists. Wire it or delete state + prop + header branch.
- Hidden-tool machinery unreachable: `normalizeToolDisplayPayload` hardcodes `hidden: false` (`agent-chat-tool-presenter.ts:1412-1422`) → `hiddenToolCallIds` (modal:391), hidden branches in sse-handler (:94-96, 450-455, 530-534) all dead.
- Zero-importer exports: `CONTEXT_BADGE_CLASSES`/`DEFAULT_CONTEXT_BADGE_CLASS` (constants:39-49), `formatCompressionTimestamp` (formatters:38-50), `formatListPreview` (presenter:327-334), `hasActiveTransport` (stream-controller:230-232); plus ~10 internal-only exports that can drop `export` (stream-controller:130/142/188; session:56/173; attachments:11-13/46/50/59).
- `detachActiveStream`'s reconcile branch is production-dead (every caller passes `reconcile: false`); modal passes router defaults verbatim (`hasMultipleAgentHelpers: false`, `researchAgentId`) making the true-branch unreachable (modal:162-163, router:70-71, 151-153).
- `ThinkingBlock.ACTIVITY_STYLES.prefix` defined for 8 types, never rendered (:76-105); `color` classes inert on emoji glyphs.
- Modal re-declares `ActivityUpdateResult` identical to the sse-handler export (modal:1638-1642); `PREPARED_PROMPT_SEND_WAIT_MS` duplicated (stream-controller:157 vs prewarm:89); voice-note sort comparator duplicated (voice:69-74 vs session:1016-1021); `isRecord`/`stringValue`/`numberValue` triplet duplicated (session:265-282, timeline:96-111); UUID regex ×3.

### 4.5 Structural simplification

- Stream-controller teardown block hand-rolled 5× with subtle variations (:346-357, 646-655, 659-672, 688-696, 716-726) → one `#finishRun()` (~60 lines saved, drift removed).
- ~15 one-line wrapper functions forwarding to `shellRouter.*` (modal:899-945) and 3 trivial pass-through deriveds (modal:173-183) — call the router directly from the template.
- `StreamControllerDeps` (27 fields) / `SSEHandlerDeps.state` (20 fields) are getter/setter mirrors of the router + stream instances; both already receive the live `voice` adapter directly — pass `shellRouter`/narrow facades the same way and delete most of the lambda plumbing (modal:460-523, 1978-2031). Note `StreamControllerVoiceDeps` types voice as data but the controller **writes** it (:372, 559) — type it as the adapter.
- `shellRouter.resolvedProjectFocus`/`defaultProjectFocus` are plain getters re-wrapped in `$derived.by` in the modal — make them `$derived` fields on the router; today every read constructs a fresh focus object (referentially unstable).
- `AgentComposer`'s 9-way `$bindable` voice relay (:52-81) → bind the adapter object once.
- Header export-menu rows duplicated verbatim desktop/mobile (`AgentChatHeader:513-545` vs `:630-662`) — use a `{#snippet}` like `ChatSessionAuditActions` already does.
- Extraction candidates to shrink the modal below ~2,000 lines: agent-run realtime + fallback block (modal:227-366), thinking-block management (modal:1515-1810), assistant text buffering (modal:2148-2252), and the inline agent-to-agent footer template (modal:2589-2708) → components/modules with existing test patterns.

### 4.6 Latent traps (document or pin)

- `SSEProcessor.handleParsedEvent` (`sse-processor.ts:279-304`) routes agent events by sniffing generic fields (`status`, `complete`, top-level `error`) — a future flat event with any of those fields gets swallowed or misrouted into full turn-reconciliation. Pin the agent stream to type-dispatch-only parsing.
- `done.finished_reason` unknown values render as success (sse-handler:218-237) — benign while every deny pairs with an `error` event; add a default-unknown guard.
- `agent_state.contextType` required in the legacy type, omitted in 3 of 4 server emissions — fix the type.

---

## What's verifiably good (don't churn)

Keyed each on `message.id` + `content-visibility: auto` in the message list; rAF batching of token flushes; auto-scroll keyed to message count, not content; event_id/sequence dedupe + stale-run filtering; out-of-order tool_result parking; the cancel dual-channel design (hint POST + abort, correctly ordered); prewarm hold-for-send window; WAI-ARIA tablist with roving tabindex; modal stacking + background `inert`; reduced-motion coverage (global guard + explicit gates on signature moments); heartbeat-as-SSE-comment handling; request-id serialization on session loads; the close/destroy `hasFinalizedSession` guard.

---

## Recommended fix waves

**Wave 1 — hot path (biggest user-felt win, ~1 day): ✅ DONE 2026-07-09** (uncommitted; 262/262 agent tests + typecheck green)

- 1.3 prewarm keystroke churn → `getHasDraftInput()` boolean dep (memoized `$derived` in the modal) + deferred-abort re-claim in `orchestrate()` so same-key effect reruns keep the in-flight POST; `reset()` now drops the in-flight request. Regression test added.
- 1.1 timeline rebuild → per-message + per-activity WeakMap memoization in `timelineItemsFromMessages` (sound because all updates are copy-on-replace; invariant documented at both sites).
- 1.2 markdown re-parse → new `streamingMessageId` prop on `AgentMessageList`; the streaming bubble re-parses at most every 150ms with a trailing parse, cached html in between; finalized messages keep the parse-once path.
- 1.4 dev-only token counter → `displayContextUsage` gated on `dev`.
- 1.5 hygiene → stream-controller run-guard/timing fields de-`$state`d + timing mutated in place; `messages`/`persistedTimelineItems` → `$state.raw`; `Intl.DateTimeFormat` hoisted in `AgentChatActivityTabs`.

**Wave 2 — lifecycle & network (~1 day): ✅ DONE 2026-07-09** (uncommitted; 269/269 agent + 534/534 agentic-chat-v2 tests + typecheck green)

- 2.1 snapshot polling → new `?probe=active-turn` mode on the session GET (single turn-runs query vs ~8-query snapshot) + client `probeActiveTurnRun()`; the modal polls with 2s→4s→8s→10s-cap backoff and does ONE full reload when the turn goes terminal. Backoff restarts on fresh snapshot evidence.
- 2.2 error surfacing → `AgentRequestError` + `buildAgentRequestError` in agent-chat-session.ts (message = status-aware user-facing text; 402 carries the server's freeze guidance, 401 → re-auth cue, 429 → slow-down). Stream POST and `prewarmAgentContext` both throw it; the prewarm orchestrator catches + arms the 10s retry-block (plus a new no-cache skip-guard so frozen accounts don't re-POST per rerun).
- 2.3 (+2.7) unified teardown → `releaseSessionResources(reason)` in the modal is the single close path (button, programmatic isOpen flip, unmount, embedded). Programmatic close no longer leaks the live stream or skips finalize/classification/mutation broadcast. Also releases the realtime `chat_messages` channel, agent-run fallback timers, and `seenTerminalAgentRunIds`.
- 2.4 hung stream → SSE inactivity timeout 45s (server heartbeats every 12s; SSEProcessor counts raw chunk bytes as activity, so comments reset it); timeout routes into turn reconciliation. Agent-run message fallback capped at 5 re-arms while streaming. Single-message fetch skipped deliberately: realtime is the fast path, the capped fallback does at most one full reload per terminal run.
- 2.5 deny-path bubble → controller tracks `receivedTurnEvidence` (post-admission event types only — the initial `agent_state` and `session` fire BEFORE the server's deny checks, verified in +server.ts); an error-terminal turn with zero evidence rolls back the optimistic user message and restores the draft/attachments.
- 2.6 buffer reset → `createSSEHandler` now returns `AgentSSEMessageHandler` with `resetTurnState()`; wired into `clearPendingToolState` (turn start), `resetConversation`, and teardown, so a cancelled turn's created-entity chips can't flush into the next turn.
- 2.8 first-turn reconcile → **deferred**: a prepared-prompt first turn that dies before its `session` event has no session id client-side; a real fix needs a server lookup endpoint (find turn by `client_turn_id`). Window is milliseconds-wide; revisit if telemetry shows it.
- Bonus (from 2.9): `stopGeneration` null-guards the post-await abort; failed-send draft restore no longer clobbers text typed mid-flight.

**Wave 3 — UX/a11y (~half day): ✅ DONE 2026-07-09** (uncommitted; 271/271 agent tests + typecheck green)

- 3.1 chat pane kept mounted behind `hidden` (no more scroll reset / animation replay on tab return) + explicit scrollTop save/restore across tab switches (some browsers clamp a display:none scroller to 0) + `tabindex="0"` on the chat tabpanel. Tabs now emit `aria-controls` only for panels that exist (fixes the dangling references, AY-1).
- 3.2 thinking log auto-follows the newest entry while the turn is active; manual scroll-up pauses following, scroll-to-bottom resumes (same rule as the message list).
- 3.3 SR: polite "BuildOS replied" announcement on assistant-message finalize (streaming bubble deliberately not live); ThinkingBlock's atomic `role="status"` container removed — the `role="log"` activity list announces only new entries.
- 3.4 `Modal.svelte` dark overrides fixed with `:global(.dark)` (card bg + shadow-ink-strong now actually ship). Also: focus trap filters to visible elements (`checkVisibility` + `offsetParent` fallback) so hidden-but-mounted content can't swallow the Tab wrap.
- 3.5 composer swallows image drops while disabled/streaming (`dropEffect: 'none'`) instead of letting the browser navigate to the file; ThinkingBlock completion driven by `status`/`agentState` only (copy-sniffing removed) and emoji icons replaced with themed Lucide icons (also deletes dead `prefix`/inert `color`-on-emoji, DC-1/ID-2); Tabs `pending` label "Queued" (was "Running") + unknown statuses humanized; `formatTime` uses the user's locale (was hardcoded en-US next to a user-locale formatter on the same screen).
- Deferred: `ChatSessionAuditActions` desktop-menu keyboard contract (file under active edit in a parallel workstream).

**Post-implementation adversarial review (2026-07-09):** independent verify pass over all Wave 1+2 changes — 9 of 11 areas confirmed sound (copy-on-replace invariant verified in every writer; deferred-abort interleavings exhausted; 12s heartbeat vs 45s timeout verified transport-level; probe columns/scoping schema-checked). Three findings, all fixed:

1. Deny rollback could misfire on a persisted-then-failed turn (server persists fire-and-forget, context-build failure swallowed, first LLM pass dies before any evidence event). Fixed by making the deny explicit: `emitErrorThenDone` (used only by pre-persistence deny paths) now stamps `turn_rejected: true` on the error event; the client rolls back ONLY on that flag, with the evidence check kept as a safety net. Regression test added for the evidence-free unflagged error.
2. Prewarm retry-window/TTL expiry had no re-trigger after the keystroke-dep removal (prepared prompt could stall until an unrelated dep flipped). Fixed with a timer-driven `refreshTick` the orchestrator effect tracks; wakes at retry-window end and at prepared-prompt expiry. Test added.
3. Latent embedded-host wedge: probe/reconcile loops gated on `isOpen`, which the code documents as possibly-false in embedded mode. Gates now use `isSurfaceActive` (`embedded || isOpen`).

Plus two robustness fixes from self-review: the active-turn probe loop re-arms if its one full reload fails (previously stalled with send blocked), background-refresh failures no longer surface an error banner mid-conversation, and the realtime channel explicitly resubscribes on reopen of a still-mounted modal (the unified teardown had made reopen silently realtime-dead).

**Wave 4 — cleanup (~1 day, mostly deletion):**
4.1 camelCase deletion → 4.3 dead handlers + union → 4.4 dead state/exports → 4.2 formatter-table merge → 4.5 structural simplification (teardown helper, deps narrowing, wrapper removal, extractions).

Test surface: controllers all have sibling tests (935 green as of 07-09); Wave 1/2 changes land inside tested modules — extend those tests rather than adding modal-level ones. `agent-chat-operation-activity.ts` + test get deleted in Wave 4.
