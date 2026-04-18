<!-- apps/web/docs/features/agentic-chat/PROPOSAL_2026-04-18_GOD-COMPONENT-DECOMPOSITION.md -->

# AgentChatModal — God-Component Decomposition Proposal

> Date: 2026-04-18
> Parent audit: `AUDIT_2026-04-17_OVERVIEW.md` §5.1 (god-component decomposition)
> Target: `apps/web/src/lib/components/agent/AgentChatModal.svelte` — currently **4,254 LOC**, ~80 `$state`, 12 `$effect`, 99 rune sites.
> Goal: lift ~2,000 LOC of pure-ish logic into testable modules, leave the modal as shell + glue (~2,200 LOC), enable every subsequent §5 audit item.

---

## 0. Clarification on the parent audit

The parent audit §5 lists three items that overlap in scope:

- **#1** — god-component decomposition (umbrella)
- **#2** — extract the SSE event reducer
- **#8** — extract tool display formatters + consolidate mutation catalogs

§2 and §8 are sub-slices of §1 — the reducer is slice **B** below, the tool presenter is slice **C**. They are listed as separate deliverables in the audit doc, which would otherwise produce three PRs that each claim the same seam. Treat this proposal as the authoritative slice plan; §5.2 and §5.8 fold into their respective slices here. (Noted back into the audit in the closing section below.)

---

## 1. Guiding constraints

1. **No behavior change per slice.** Each slice lands as a refactor PR with a green typecheck, green agent tests, and a manual smoke of the modal.
2. **Low-risk first, high-risk last.** Pure extractions (format, reduce) before side-effect-heavy ones (effects, streams).
3. **Every slice must ship with tests.** The modal itself has no test file (§4.8). Extraction is how we make it testable — so each slice includes a colocated `*.test.ts` before the wiring PR lands.
4. **Factory pattern for state-dependent extractions.** Several helpers read modal `$state` (context type, entity id, project focus). Use `createXyz({ getContextType, getEntityId, … })` factories returning bound functions. Avoids passing context on every call and keeps the helper module free of Svelte runes.
5. **Reducer-first for event handling.** Extract the SSE switch as a pure reducer that returns state patches. The modal applies patches to its runes; the reducer stays a plain TS module.

---

## 2. Slice order (low → high risk)

| #   | Slice                                     | Est. LOC out | Est. modal LOC after | Risk    | Rationale                                                                                                                                                 |
| --- | ----------------------------------------- | -----------: | -------------------: | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **C — Tool display presenter**            |       ~1,000 |               ~3,250 | 🟢 Low  | Nearly-pure functions. Snapshot-testable. Folds in §4.4 mutation-catalog consolidation. Largest single extractable block.                                 |
| 2   | **B — SSE event reducer**                 |         ~380 |               ~2,870 | 🟢 Low  | Discriminated-union switch → pure reducer returning state patches. Replay-testable against SSE fixtures. First real client-side test coverage.            |
| 3   | **E — Voice adapter**                     |         ~130 |               ~2,740 | 🟡 Med  | Self-contained but touches DOM refs. Ideal middle step — forces the hook/store pattern before the controller rewrite.                                     |
| 4   | **D — Focus/context bootstrap + prewarm** |         ~280 |               ~2,460 | 🟡 Med  | Three effects with shared cache-key logic; drift risk (§4.4). Consolidates prewarm into one orchestrator.                                                 |
| 5   | **A — Session/stream controller**         |         ~850 |               ~1,600 | 🔴 High | Race surface. Three-ID guard, `AbortController`, supersede flow, timing state. Last because it benefits from every prior slice giving regression anchors. |

Total extraction target: ~2,640 LOC. Modal lands around 1,600–1,700 LOC — still not small, but comprehensible: Svelte template, lifecycle glue, agent-to-agent wizard mode, and slots for the extracted modules.

Sizing assumes worst case; in practice slices often shed more LOC than estimated because they eliminate per-use boilerplate.

---

## 3. Slice C — Tool display presenter

**Goal:** lift all tool-name → display-string logic, mutation tracking, and entity-name resolution out of the modal into a factory module.

### 3.1 What moves

| Block                                                                                                                                                                                                              | Modal lines | LOC |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------- | --: |
| Entity constants (`ENTITY_NAME_FIELDS`, `ENTITY_SINGULAR_KEYS`, `ENTITY_PLURAL_KEYS`)                                                                                                                              | 1428–1450   |  23 |
| Entity name cache + `normalizeEntityLabel` / `cacheEntityName` / `getCachedEntityName`                                                                                                                             | 1450–1478   |  28 |
| `resolveContextEntityName` / `resolveEntityName` / `extractEntityDisplayName`                                                                                                                                      | 1480–1540   |  61 |
| `indexEntityRecord` / `indexEntityResults` / `indexEntitiesFromPayload` / `extractToolResultPayload` / `indexEntitiesFromToolResult`                                                                               | 1542–1658   | 117 |
| `buildEntityTarget`                                                                                                                                                                                                | 1660–1666   |   7 |
| `normalizeToolDisplayPayload`                                                                                                                                                                                      | 1668–1684   |  17 |
| Project-focus → cache `$effect`                                                                                                                                                                                    | 1686–1710   |  25 |
| `formatListPreview`                                                                                                                                                                                                | 1712–1719   |   8 |
| Calendar regexes + `normalizeCalendarTimeZone` / `formatDateOnlyLabel` / `formatClockLabel` / `normalizeOffsetLabel` / `formatExplicitTimezoneDateLabel` / `formatCalendarDateLabel` / `formatCalendarRangeTarget` | 1721–1869   | 149 |
| `TOOL_DISPLAY_FORMATTERS`                                                                                                                                                                                          | 1871–2131   | 261 |
| `TOOL_ACTION_PAST_TENSE` / `TOOL_ACTION_BASE_FORM` / `toPastTenseAction` / `toFailureAction` / `formatErrorMessage` / `formatErrorSuffix` / `capitalizeWord`                                                       | 2133–2209   |  77 |
| `OPERATION_VERBS` / `formatOperationEvent`                                                                                                                                                                         | 2211–2243   |  33 |
| `formatToolMessage`                                                                                                                                                                                                | 2248–2321   |  74 |
| `DATA_MUTATION_TOOLS` / `MUTATION_TRACKED_TOOLS` / `mutationCount` / `mutatedProjectIds` / `resetMutationTracking` / `safeParseArgs` / `resolveProjectId` / `recordDataMutation` / `buildMutationSummary`          | 2451–2566   | 116 |
| `showToolResultToast`                                                                                                                                                                                              | 2659–2691   |  33 |

**Total extractable: ~1,029 LOC.**

### 3.2 API shape

New file: `apps/web/src/lib/components/agent/agent-chat-tool-presenter.ts`

```ts
export interface ToolPresenterContext {
	getContextType(): ChatContextType | null;
	getEntityId(): string | undefined;
	getContextLabel(): string | null;
	getProjectFocus(): ProjectFocus | null;
	getResolvedProjectFocus(): ProjectFocus | null;
}

export interface ToolPresenter {
	// Display
	formatToolMessage(
		toolName: string,
		args: string | Record<string, any>,
		status: 'pending' | 'completed' | 'failed',
		errorMessage?: string
	): string;
	formatOperationEvent(op: Record<string, any>): {
		message: string;
		activityStatus: ActivityEntry['status'];
	};
	normalizeToolDisplayPayload(
		toolName: string,
		args: string | Record<string, any>
	): NormalizedToolDisplay;

	// Entity name cache
	cacheEntityName(kind: OntologyEntityKind | 'entity', id: string, name: string): void;
	resolveEntityName(
		kind: OntologyEntityKind | undefined,
		id?: string,
		candidateName?: string
	): string | undefined;
	indexEntitiesFromPayload(payload: Record<string, any>): void;
	indexEntitiesFromToolResult(toolResult: unknown): void;

	// Mutation tracking
	recordDataMutation(
		toolName: string | undefined,
		args: string | Record<string, unknown> | undefined,
		success: boolean,
		toolResult?: { data?: any }
	): void;
	resetMutationTracking(): void;
	buildMutationSummary(
		extra: Pick<DataMutationSummary, 'hasMessagesSent' | 'sessionId'>
	): DataMutationSummary;

	// Side-effectful display
	showToolResultToast(
		toolName: string,
		args: string | Record<string, unknown>,
		success: boolean
	): void;

	// Catalog (exposed for presenters / tests)
	readonly MUTATION_TRACKED_TOOLS: ReadonlySet<string>;
	readonly DATA_MUTATION_TOOLS: ReadonlySet<string>;
}

export function createToolPresenter(ctx: ToolPresenterContext): ToolPresenter;
```

### 3.3 Consolidation wins (§4.4)

- `DATA_MUTATION_TOOLS` (toast trigger) and `MUTATION_TRACKED_TOOLS` (mutation counter) collapse into one catalog with per-entry flags:

    ```ts
    const TOOL_CATALOG: Record<string, { mutates: boolean; toast: boolean }>;
    ```

    The two exported `Set`s remain as derived constants for backwards-compatible reads, but there is one source of truth.

- Module-scope `entityNameCache` (modal line 1450) becomes per-presenter state — scoped to the presenter instance, which is created once per modal open. Addresses "shared across modal instances" concern.

### 3.4 Risk

- **Formatter precedence.** `formatToolMessage` has a `skill_load` early return and an unknown-tool fallback. Tests must cover both.
- **Entity resolution fallthrough.** `resolveEntityName` has four fallback sources (focus, cache by kind, cache by 'entity'). Test each.
- **Calendar timezone branches.** `formatCalendarDateLabel` has three branches (date-only, explicit-timezone, `Intl.DateTimeFormat`). Test fixtures for each.
- **Mutation-summary call site.** `buildMutationSummary` currently reads `selectedContextType` / `selectedEntityId` / `hasSentMessage` / `currentSession` directly. The extracted version takes caller-supplied extras (session id, hasMessagesSent) and derives context via the factory's getters. Single call site in modal — low risk.

### 3.5 Tests

`agent-chat-tool-presenter.test.ts`:

- `formatToolMessage` — snapshot rows for pending/completed/failed × representative families (search, create, update, delete, calendar range, skill_load, unknown).
- `formatOperationEvent` — list/search/read/create/update/delete × start/success/error.
- `resolveEntityName` — direct candidate → focus match → cache by kind → cache by 'entity' → undefined.
- `indexEntitiesFromPayload` — singular, plural, nested result, context_shift.
- `recordDataMutation` / `buildMutationSummary` — happy path + success=false suppression + create-project-with-clarifications suppression + project id fallback from tool result.
- `showToolResultToast` — mocked `toastService`; assert called only for `DATA_MUTATION_TOOLS`; assert message shape.
- Calendar formatters — date-only, ISO with explicit `Z`, ISO with `+05:30`, Intl fallback, invalid input.

---

## 4. Slice B — SSE event reducer

**Goal:** replace the 17-case switch in `handleSSEMessage` (modal L3137, ~350 LOC) with a pure reducer that maps `AgentSSEMessage` → state patch.

### 4.1 Shape

New file: `apps/web/src/lib/components/agent/agent-chat-sse-reducer.ts`

```ts
export interface SSEReducerContext {
	currentStreamRunId: number;
	activeTransportStreamRunId: string | null;
	activeClientTurnId: string | null;
	presenter: ToolPresenter;
	// Pure helpers to compose patches that modal applies
}

export type SSEPatch =
	| { kind: 'set_session'; session: ChatSession }
	| { kind: 'set_context_usage'; usage: ContextUsageSnapshot | null }
	| { kind: 'attach_server_timing'; timing: AgentTimingSummary }
	| { kind: 'set_last_turn_context'; context: LastTurnContext | null }
	| { kind: 'set_focus'; focus: ProjectFocus | null; logAction?: string }
	| { kind: 'set_agent_state'; state: AgentLoopState; details?: string }
	| { kind: 'add_clarifying_questions'; questions: unknown }
	| { kind: 'buffer_assistant_text'; content: string }
	| { kind: 'begin_tool_call' /* ... */ }
	| { kind: 'update_tool_status' /* ... */ }
	| { kind: 'record_operation'; operation: Record<string, any> }
	| { kind: 'record_skill_activity'; event: SkillActivityEvent }
	| { kind: 'record_context_shift'; shift: unknown }
	| { kind: 'stream_done' /* ... */ }
	| { kind: 'stream_error'; error: unknown };

export function reduceSSEEvent(event: AgentSSEMessage, ctx: SSEReducerContext): SSEPatch[];
```

The modal owns an `applyPatch(patch: SSEPatch)` function that reads runes and mutates them. The reducer produces patches from a single event; the modal iterates patches and applies them.

### 4.2 Value

- **Testable with recorded fixtures.** We can replay a real SSE transcript (captured via the existing admin session audit) through the reducer and assert the emitted patch sequence.
- **Confirms no unreachable branches** post-cleanup (audit §5.2). The duplicate `text_delta` / `text` case in `handleSSEMessage` (L3230) becomes a single patch emitter, and we surface whether both are still reachable.
- **Removes 17 inline tool-display calls.** The reducer emits patches; the presenter runs in the modal's patch handler, keeping effects out of the reducer.

### 4.3 Risk

- **Ordering of `flushAssistantText`.** The current switch flushes buffered text on any non-text event (L3138). The reducer must emit a `flush_text` patch first for non-text events. Encode as an invariant in the reducer; test via a `text_delta` → `tool_call` sequence.
- **Stale-run guarding.** The three-ID guard happens at the call site, not inside the reducer. The reducer is stateless per-event; it does not enforce "this patch is stale." The modal checks `event.runId !== activeStreamRunId` before calling `reduceSSEEvent`. Keeps the reducer pure.

---

## 5. Slice E — Voice adapter

**Goal:** consolidate voice recording state into a single `useVoiceAdapter()` hook that exposes the state the modal renders.

### 5.1 What moves

- Voice state: `voiceInputRef`, `isVoiceRecording`, `isVoiceInitializing`, `isVoiceStopping`, `isVoiceTranscribing`, `voiceErrorMessage`, `voiceSupportsLiveTranscript`, `voiceRecordingDuration`, `voiceNoteGroupId`, `voiceNotesByGroupId`, `pendingSendAfterTranscription` (modal L379–390).
- Functions: `stopVoiceInput`, `cleanupVoiceInput`, `upsertVoiceNoteInGroup`, `removeVoiceNoteFromGroup`, `handleVoiceNoteSegmentSaved`, `handleVoiceNoteSegmentError` (modal L607–655).

### 5.2 Shape

Two options: a TS factory returning `$state` proxies (Svelte 5 runes-in-module), or a colocated `.svelte.ts` module. We'll prefer the `.svelte.ts` form since the state is reactive and the modal imports runes already.

File: `apps/web/src/lib/components/agent/agent-chat-voice.svelte.ts`

```ts
export function createVoiceAdapter(deps: { toast: typeof toastService }): {
	state: {
		/* all reactive fields as getters */
	};
	bindRef(ref: TextareaWithVoiceComponent | null): void;
	handleSegmentSaved(note: VoiceNote): void;
	handleSegmentError(message: string): void;
	stop(): Promise<void>;
	cleanup(): Promise<void>;
};
```

### 5.3 Risk

- **Reactivity boundary.** Runes exported from `.svelte.ts` require careful destructuring. Either use `$state` proxies accessed via getter or use a class (`class VoiceAdapter { #isRecording = $state(false); get isRecording() { return this.#isRecording; } }`). Both work in Svelte 5. Pick class for type clarity.
- **Send-after-transcription flag.** `pendingSendAfterTranscription` participates in the stream-controller sequence (slice A). Keep the adapter exposing it, let slice A consume it.

### 5.4 Tests

`agent-chat-voice.test.ts` — unit test the non-ref logic: `upsertVoiceNoteInGroup` sort stability, `removeVoiceNoteFromGroup` pruning empty keys, `handleSegmentError` no-op on empty message.

---

## 6. Slice D — Focus/context bootstrap + prewarm

**Goal:** unify the three prewarm effects (modal L1035–1237) into one orchestrator and pull the focus/context init helpers into a module.

### 6.1 What moves

- `ENABLE_V2_PREWARM` gate, prewarm orchestrator effect (L1116–1184), prewarm invalidator effect (L1186–1196), `initialProjectFocus` init effect (L1199–1237), `initialChatSessionId` load trigger effect (L1240+).
- Helpers: `buildSessionBootstrapTarget`, `buildContextLabelForAction`, `initializeFromAutoInit`, `mapActionToContextType`, `applyProjectAction`, `primeProjectContext`, `handleContextSelect`, `handleFocusSelection`, `handleFocusClear`, `openFocusSelector`.

### 6.2 Shape

File: `apps/web/src/lib/components/agent/agent-chat-bootstrap.svelte.ts`

A class or factory that the modal wires up in a single place:

```ts
export class ChatBootstrapController {
	constructor(deps: ChatBootstrapDeps);
	// Reactive state
	get prewarmedContext(): FastChatContextCache | null;
	// Commands
	selectContext(detail: ContextSelectionDetail): void;
	selectFocus(focus: ProjectFocus): void;
	clearFocus(): void;
	primeFromAutoInit(config: AutoInitProjectConfig): void;
	primeFromInitialFocus(focus: ProjectFocus): void;
	// Lifecycle
	onOpen(): void;
	onClose(): void;
}
```

### 6.3 Risk

- **Cache-key drift (§4.4).** Good news: consolidating the three `buildFastChatContextCacheKey` call sites into one orchestrator resolves the drift risk.
- **Order of effects.** `initialProjectFocus` reset → prewarm. Must preserve current order; doc the sequence.
- **Embedded-vs-modal close divergence** (modal L1039–1053). `handleClose()` runs only for embedded; regular Modal triggers its own `onClose`. The bootstrap controller must respect both paths.

### 6.4 Tests

Mock `prewarmAgentContext`, drive sequences: open → select project → type (draft prewarm) → send → close. Assert:

- one prewarm per distinct cache key
- no duplicate warm on idle re-render
- invalidate fires on focus change
- no warm when session already live and no draft

---

## 7. Slice A — Session/stream controller

**Goal:** extract the send/receive/cancel machinery into a controller class the modal drives.

### 7.1 What moves

- `activeStreamRunId` / `activeTransportStreamRunId` / `activeClientTurnId` (three-ID guard).
- `currentStreamController` (AbortController), timing state (`activeStreamTiming`, `_lastCompletedStreamTiming`), `hasFinalizedSession`, `hasSentMessage`.
- `ensureSessionReady` (L478), `cancelSessionBootstrap`, `buildSessionBootstrapTarget`, `sendMessage` (L2849, ~250 LOC), `handleStopGeneration` (L3712), `reportStreamCancellationReason` (L3672), `markAssistantInterrupted`, `finalizeAssistantMessage`, `scheduleAssistantTextFlush`, `bufferAssistantText`, `flushAssistantText`.
- Timing helpers `buildClientStreamTimingState`, `recordClientStreamEvent`, `attachServerTiming`, `summarizeClientStreamTiming`, `finalizeClientStreamTiming` (L270–357).

### 7.2 Shape

File: `apps/web/src/lib/components/agent/agent-chat-stream-controller.svelte.ts`

```ts
export class AgentStreamController {
	constructor(deps: StreamControllerDeps);
	// Reactive state
	get isStreaming(): boolean;
	get activeTiming(): ClientStreamTimingState | null;
	// Commands
	send(input: SendInput): Promise<void>;
	stop(
		reason: 'user_cancelled' | 'superseded' | 'error',
		opts?: { awaitCancelHint?: boolean }
	): Promise<void>;
	dispose(): void;
}
```

`deps` includes: the bootstrap controller (for session ensure), the presenter (for tool display during SSE), an SSE reducer factory, a patch applier, and callbacks for message list + thinking block mutations.

### 7.3 Risk (🔴 HIGH — per audit §4.3)

- **Three-ID guard parity.** Must preserve `activeStreamRunId` semantics across `send`, `stop`, SSE callbacks. Property-test: any interleaving of `send()` / `stop('superseded')` leaves exactly one controller live.
- **`awaitCancelHint` latency.** `handleStopGeneration('superseded', { awaitCancelHint: true })` blocks the next send on the cancel-hint POST. Audit asks to measure this; the controller extraction gives us one place to instrument.
- **Session hydration on superseded streams** (L3016–3018). Intentional behavior; encode as a test.
- **`done` vs `onComplete` double-flip** of `isStreaming` (audit §4.3). Extraction gives one site; add a regression test.

### 7.4 Tests

- State-machine property tests for send/stop interleaving.
- Fixture replay: "rapid double-send supersede" scenario with captured SSE.
- Network-drop scenario: `onError` mid-stream → assistant message marked interrupted, thinking block marked interrupted.

---

## 8. Per-slice PR checklist

Each slice lands as its own PR. PR template:

- [ ] New module + colocated `*.test.ts`, both green.
- [ ] `pnpm --filter=web typecheck` clean.
- [ ] Modal diff shows only call-site replacements + deletions; no semantic changes in moved code (confirmed by `git diff -b -w` review).
- [ ] Manual smoke: open modal in `global`, `project`, and resumed-session modes; send a message; receive a tool call + result; close. Zero console errors.
- [ ] LOC delta on `AgentChatModal.svelte` reported in the PR description.
- [ ] Audit doc updated: mark the relevant §5 item (2 or 8) "closed via slice B/C."

---

## 9. What this unlocks in the §5 backlog

Once slices C + B land:

- Item 3 (state machine) becomes feasible — state is named and bounded.
- Item 4 (stream lifecycle) becomes testable — the three-ID guard lives in the controller and has property tests.
- Item 10 (error surfaces) becomes a review of the reducer's error-patch cases.
- Item 11 (memory leaks) becomes a review of each extracted module's `dispose()`.

Items 2 and 8 are subsumed by this proposal. Recommend updating the audit §5 list to collapse them into item 1 with the slice roadmap above.

---

## 10. Execution order

1. ✅ **This proposal.**
2. **Slice C** — tool display presenter + tests + modal wiring. (In progress.)
3. **Slice B** — SSE reducer + tests + modal wiring.
4. **Slice E** — voice adapter + tests + modal wiring.
5. **Slice D** — bootstrap controller + tests + modal wiring.
6. **Slice A** — stream controller + tests + modal wiring.
7. Follow-up: revisit §5 items 3, 4, 10, 11 with the new seams in place.
