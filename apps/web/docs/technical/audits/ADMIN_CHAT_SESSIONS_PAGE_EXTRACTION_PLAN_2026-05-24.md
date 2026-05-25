<!-- apps/web/docs/technical/audits/ADMIN_CHAT_SESSIONS_PAGE_EXTRACTION_PLAN_2026-05-24.md -->

# Admin Chat Sessions Page — Extraction Plan

**Target file:** `apps/web/src/routes/admin/chat/sessions/+page.svelte`
**Status:** Proposal — not yet implemented
**Author:** Claude (assessment) + DJ
**Date:** 2026-05-24

---

## Why we're doing this

`+page.svelte` for the admin chat session audit view has grown to **5,048 lines** in a single file. A line-count audit on 2026-05-24 broke it down as:

| Block                | Lines       | Size            |
| -------------------- | ----------- | --------------- |
| `<script lang="ts">` | 2 – 1943    | **1,942 lines** |
| Markup               | 1944 – 5032 | **3,089 lines** |
| `<style>`            | 5033 – 5048 | 16 lines        |

Some complexity here is real — audit/replay UIs are inherently dense, and events flow in from several producers (turn supervisor, tool executors, prompt snapshots, eval runner, libri extractor) and need normalization before they can be displayed. The page is also doing legitimate work: tool-lifecycle merging, conversation-turn assembly, libri panel rendering, two timeline presentations (per-turn drawer + full audit timeline), modal orchestration, URL sync, and an eval/replay control surface.

But ~70% of the bulk is accidental. Three forces are responsible:

1. **No component boundaries.** Every panel — sessions list, filters, replay picker, libri panel, conversation replay, audit timeline, tool-call card, supervisor-event card, prompt-snapshot card — is a natural component seam and none are extracted.
2. **Two presentations of the same data.** The per-turn "BuildOS activity" drawer (markup lines ~2770–3398) and the "Full Audit Timeline" section (~3401–5020) render largely overlapping events with overlapping templates and helpers. Drift risk is high; every change has to be made in both places.
3. **Service logic living in a page.** A ~310-line tool-lifecycle merging engine, a ~140-line conversation-turn assembler, libri display builders, payload extractors, and 17 domain types live inside the route's `<script>` block. They have **zero unit tests** even though they encode real domain rules.

The risks this creates:

- **Performance.** Svelte will update granular DOM nodes, but the current single-component reactive graph still keeps unrelated state, derivations, and a huge template in one invalidation boundary. Large derivations like `conversationTurns` and `visibleTimelineGroups` can recompute on state changes that are unrelated to their actual inputs.
- **Maintainability.** ~50 helpers + 17 types + a 2,800-line modal means navigation is by scroll, and small edits are high-risk.
- **Hidden complexity.** The tool-lifecycle merger is a serious piece of domain logic buried in a Svelte file. If it breaks, you'll debug it without isolated tests.
- **Reactive graph fragility.** Use of `untrack` + manual `replaceState` for URL sync is a signal the selection/modal state has been hard to wrangle inside one component.

The goal of this extraction is not to add features. It's to make the page **safe to evolve** — split domain transforms into pure, testable modules, keep UI-only display helpers near the components, and split markup into components that each have one clear job.

---

## Current state (what's actually in the file)

### Script section (1,942 lines)

| Range       | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2 – 36      | Imports                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| 38 – 204    | **17 domain types**: `SessionListItem`, `PromptEvalScenario`, `SessionTurnRun`, `TimelineGroupKind`, `TimelineGroupCounts`, `TimelineGroup`, `ToolLifecycleDisplayState`, `ConversationMessageRole`, `ConversationMessage`, `ConversationToolCall`, `ConversationTurn`, `LibriCandidateDisplay`, `LibriHandoffResultDisplay`, `LibriExtractionDisplay`, `LibriHandoffDisplay`, plus a couple inline ones                                                                                                                                                                                                                                      |
| 206 – 266   | ~25 `$state` cells across pagination, filters, modal, eval, replay, timeline filters, expansion sets                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| 268 – 316   | URL ↔ selected-session sync (`currentSessionIdFromUrl`, `replaceState`, `untrack`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| 318 – 393   | Timeline derivations: `replayTimeline`, `visibleTimeline`, `visibleTimelineGroups`, `selectedReplayScenario`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 395 – 581   | Async fetchers: `loadSessions`, `loadSessionDetail`, `loadEvalScenarios`, `runPromptEval`, `runScenarioReplay`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 583 – 685   | UI event handlers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 687 – 845   | Formatters + classifiers: `eventTypeLabel`, `eventIcon`, `eventSeverityClasses`, `timelineDotClasses`, `formatDateTime`, `formatNumber`, `formatCurrency`, `formatDuration`, `statusBadge`, `prettyJson`, `payloadField`, `stringValue`, `toNumericValue`, `truncateText`, `pluralize`                                                                                                                                                                                                                                                                                                                                                        |
| 847 – 1003  | Timeline grouping engine: `timelineEventPriority`, `timelineEventSequence`, `compareTimelineEvents`, `compareTimelineGroups`, `createEmptyTimelineGroupCounts`, `applyEventToTimelineGroup`, `createStandaloneTimelineGroup`, `createTurnTimelineGroup`, `groupRequestPreview`                                                                                                                                                                                                                                                                                                                                                                |
| 1021 – 1338 | **Tool-lifecycle merging engine** (~317 lines): `toolTracePayload`, `preferredToolPayloadValue`, `toolDisplayName/Success/Duration/Tokens/Arguments/Result/Error`, `isTraceToolPayload`, `isToolCallEmittedEvent`, `isToolOutcomeEvent`, `isToolDetailTurnEvent`, `findMatchingToolOutcomeEvent`, `shouldHideMergedToolOutcomeEvent`, `mergeToolLifecyclePayload`, `mergeToolLifecycleRawPayload`, `toolLifecycleTitle`, `toolLifecycleSummary`, `toolLifecycleDisplayState`                                                                                                                                                                  |
| 1090 – 1116 | Eval helpers: `updateSelectedEvalScenario`, `evalAssertionCount`, `payloadSummaryAssertionCount`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| 1339 – 1691 | Conversation-turn assembly: `recordFromUnknown`, `normalizeConversationRole`, `conversationRoleLabel`, `messageCreatedAt`, `buildConversationMessage`, `messageSortValue`, `timelineMessageId`, `createConversationTurn`, `addMessageToConversationTurn`, `assignAuditEventToConversationTurn`, `linkedTool*FromPayload`, `firstNonEmptyString`, `toolMetadataFromPayload`, `sourceLabelForToolEvent`, `toolStatusLabel`, `toolQualityRank`, `conversationToolCallFromEvent`, `toolDedupKey`, `buildConversationToolCalls`, `conversationMessageIsLong`, `metadataEntries`, `metadataValueLabel`, `recordArray`, `stringArray`, `numberArray` |
| 1715 – 1792 | Libri display: `formatLibriLabel`, `formatConfidence`, `libriStatusClasses`, `buildLibriExtractionDisplay`, `buildLibriHandoffDisplay`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| 1794 – 1937 | `conversationTurns = $derived.by(...)` — 140-line tree builder joining messages, turn runs, tool events, supervisor events, prompts, evals                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| 1938 – 1941 | `displayedGroupItemCount`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

### Markup section (3,089 lines)

| Range       | What                                                                                                                                  |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| 1944 – 1948 | `<svelte:head>`                                                                                                                       |
| 1950 – 1979 | `AdminPageHeader` with timeframe + refresh                                                                                            |
| 1981 – 2049 | Filter/search form                                                                                                                    |
| 2050 – 2112 | Replay scenario picker                                                                                                                |
| 2113 – 2249 | Sessions list + pagination                                                                                                            |
| 2251 – 5029 | **Session detail Modal (~2,779 lines)**                                                                                               |
| 2274 – 2401 | Session metrics header                                                                                                                |
| 2403 – 2613 | Libri extraction/handoff panel                                                                                                        |
| 2615 – 3398 | Conversation replay: per-turn header, user messages, "BuildOS activity" drawer (supervisor / tool / LLM / prompt), assistant messages |
| 3401 – 5020 | Full Audit Timeline: filters + grouped events (re-renders many of the same event types)                                               |
| 5033 – 5048 | `<style>` — only `min-height` for the workspace                                                                                       |

---

## Target architecture

The page becomes a thin shell that composes a small number of feature components. Domain transforms live in `lib/services/admin/` as pure functions with unit tests. UI class/icon mapping lives with the admin chat components so service files do not import Svelte components.

```
+page.svelte                           ← shell only (load, filters, list, modal mount)
├── SessionFilters.svelte              ← search + status/context/sort + apply
├── ReplayScenarioPanel.svelte         ← scenario picker + replay status
├── SessionList.svelte                 ← list + pagination + select
└── SessionDetailModal.svelte
    ├── SessionMetricsHeader.svelte    ← title, user, error chips, metric tiles, export
    ├── LibriPanel.svelte              ← libri extraction + handoff results
    ├── ConversationReplay.svelte
    │   ├── ConversationTurnHeader.svelte
    │   ├── ConversationMessage.svelte   ← long/short, tokens, errors
    │   └── BuildOsActivityDrawer.svelte
    │       ├── SupervisorEventCard.svelte
    │       ├── ToolCallCard.svelte
    │       ├── LlmCallCard.svelte
    │       └── PromptSnapshotCard.svelte
    └── AuditTimeline.svelte
        ├── TimelineFilters.svelte
        └── TimelineGroupCard.svelte    ← reuses SupervisorEventCard, ToolCallCard, LlmCallCard, PromptSnapshotCard
```

Service layer:

```
lib/services/admin/
├── chat-session-audit-export.ts          (already exists)
├── chat-session-audit-types.ts           NEW — shared audit payload, page, timeline, conversation, libri, and eval types
├── chat-session-audit-formatters.ts      NEW — dates, numbers, currency, duration, pluralize, prettyJson, truncate
├── chat-session-audit-payload.ts         NEW — payloadField, stringValue, toNumericValue, recordFromUnknown, recordArray, stringArray, numberArray, firstNonEmptyString, metadataEntries, metadataValueLabel
├── chat-session-audit-timeline.ts        NEW — event priority/sequence/compare, group counts, createStandalone/TurnGroup, groupRequestPreview, eventTypeLabel, replay/visible timeline builders
├── chat-session-audit-tool-lifecycle.ts  NEW — the ~310-line tool-lifecycle merger
├── chat-session-audit-conversation.ts    NEW — buildConversationTurns (the 140-line derivation logic) + all message/tool helpers it calls
├── chat-session-audit-libri.ts           NEW — buildLibriExtractionDisplay, buildLibriHandoffDisplay, formatLibriLabel, formatConfidence
└── chat-session-audit-evals.ts           NEW — evalAssertionCount, payloadSummaryAssertionCount, optional fetch wrappers with injected fetch
```

UI helper layer:

```
lib/components/admin/chat/
└── session-audit-ui.ts                   NEW — statusBadge, eventSeverityClasses, timelineDotClasses, libriStatusClasses, eventIcon
```

Each new service file gets a sibling `*.test.ts`. Existing `chat-session-audit-export.ts` already follows this pattern. UI helper tests are optional unless the helper starts doing logic beyond stable mapping tables.

---

## Extraction plan (phased)

The phases are ordered so each is independently mergeable and the page keeps working after each phase.

## Progress

| Phase   | Status      | Verification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | Notes                                                                                                                                                                                                                                                                                             |
| ------- | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 0 | ✅ Complete | `pnpm --filter @buildos/web test -- src/routes/admin/chat/sessions/page.test.ts src/lib/services/admin/chat-session-audit-export.test.ts 'src/routes/api/admin/chat/sessions/[id]/session-detail-payload.test.ts'` — 11 passed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Existing page/export/payload tests are the baseline before moving code. User-identifying fixture capture remains a follow-up if a broader real-session regression anchor is needed.                                                                                                               |
| Phase 1 | ✅ Complete | `pnpm --filter @buildos/web test -- src/routes/admin/chat/sessions/page.test.ts src/lib/services/admin/chat-session-audit-export.test.ts src/lib/services/admin/chat-session-audit-formatters.test.ts src/lib/services/admin/chat-session-audit-payload.test.ts 'src/routes/api/admin/chat/sessions/[id]/session-detail-payload.test.ts'` — 16 passed; `pnpm --filter @buildos/web check` — 0 errors                                                                                                                                                                                                                                                                                                            | Extracted shared audit types, formatters, payload helpers, and UI-only status/icon mapping. `+page.svelte` is down to 4,696 lines.                                                                                                                                                                |
| Phase 2 | ✅ Complete | `pnpm --filter @buildos/web test -- src/routes/admin/chat/sessions/page.test.ts src/lib/services/admin/chat-session-audit-export.test.ts src/lib/services/admin/chat-session-audit-formatters.test.ts src/lib/services/admin/chat-session-audit-payload.test.ts src/lib/services/admin/chat-session-audit-timeline.test.ts src/lib/services/admin/chat-session-audit-tool-lifecycle.test.ts src/lib/services/admin/chat-session-audit-conversation.test.ts src/lib/services/admin/chat-session-audit-libri.test.ts src/lib/services/admin/chat-session-audit-evals.test.ts 'src/routes/api/admin/chat/sessions/[id]/session-detail-payload.test.ts'` — 24 passed; `pnpm --filter @buildos/web check` — 0 errors | Extracted timeline grouping/filtering, tool lifecycle merging, conversation assembly, Libri display, and eval count helpers. `+page.svelte` is down to 3,628 lines.                                                                                                                               |
| Phase 3 | ✅ Complete | `pnpm --filter @buildos/web test -- src/routes/admin/chat/sessions/page.test.ts src/lib/services/admin/chat-session-audit-export.test.ts src/lib/services/admin/chat-session-audit-formatters.test.ts src/lib/services/admin/chat-session-audit-payload.test.ts src/lib/services/admin/chat-session-audit-timeline.test.ts src/lib/services/admin/chat-session-audit-tool-lifecycle.test.ts src/lib/services/admin/chat-session-audit-conversation.test.ts src/lib/services/admin/chat-session-audit-libri.test.ts src/lib/services/admin/chat-session-audit-evals.test.ts 'src/routes/api/admin/chat/sessions/[id]/session-detail-payload.test.ts'` — 24 passed; `pnpm --filter @buildos/web check` — 0 errors | Extracted `SessionFilters`, `ReplayScenarioPanel`, `SessionList`, and the modal shell. `+page.svelte` is down to 587 lines; `SessionDetailModal.svelte` holds the remaining 2,905-line modal body for Phase 4.                                                                                    |
| Phase 4 | ✅ Complete | `pnpm --filter @buildos/web test -- src/routes/admin/chat/sessions/page.test.ts src/lib/services/admin/chat-session-audit-export.test.ts src/lib/services/admin/chat-session-audit-formatters.test.ts src/lib/services/admin/chat-session-audit-payload.test.ts src/lib/services/admin/chat-session-audit-timeline.test.ts src/lib/services/admin/chat-session-audit-tool-lifecycle.test.ts src/lib/services/admin/chat-session-audit-conversation.test.ts src/lib/services/admin/chat-session-audit-libri.test.ts src/lib/services/admin/chat-session-audit-evals.test.ts 'src/routes/api/admin/chat/sessions/[id]/session-detail-payload.test.ts'` — 24 passed; `pnpm --filter @buildos/web check` — 0 errors | Decomposed the modal into focused panels and card components. `SessionDetailModal.svelte` is 133 lines; `AuditTimeline.svelte` is 99 lines; `ConversationReplay.svelte` is 70 lines. The page remains 585 lines because it still owns URL sync, fetching, eval/replay actions, and derived state. |

### Phase 0 — Freeze the current behavior

**Goal:** create a small baseline before moving code, so the extraction can be checked mechanically instead of by eyeballing a 5,000-line diff.

1. Run the existing page and payload tests once before extraction.
2. Capture one representative `ChatSessionAuditPayload` fixture that includes messages, streamed tool lifecycle events, linked tool execution rows, supervisor events, prompt snapshots, eval runs, and libri data. Scrub user-identifying content before committing it.
3. Add or extend characterization tests around the current page behavior that matters most: deep-linked modal URL state, merged tool calls, supervisor event visibility, libri panel visibility, and export availability.

### Phase 1 — Lift pure helpers and types into services

**Goal:** delete ~600 lines of formatters/classifiers/payload helpers/types from the page with zero behavior change.

1. Create `chat-session-audit-types.ts` and move the 17 page-local types. Also move/re-export `AuditTimelineEvent`, `AuditTimelineSeverity`, `AuditTimelineType`, `AuditPromptEvalRun`, `AuditTurnRun`, and `ChatSessionAuditPayload` so the page, `chat-session-audit-export.ts`, and `session-detail-payload.ts` have one shared type surface.
2. Create `chat-session-audit-payload.ts` — move `payloadField`, `stringValue`, `toNumericValue`, `recordFromUnknown`, `recordArray`, `stringArray`, `numberArray`, `firstNonEmptyString`, `metadataEntries`, `metadataValueLabel`. Add tests for each (these are pure value extractors).
3. Create `chat-session-audit-formatters.ts` — move `formatDateTime`, `formatNumber`, `formatCurrency`, `formatDuration`, `prettyJson`, `truncateText`, `pluralize`. Tests: locale-stable strings. Keep Tailwind class mappers out of this file.
4. Create `lib/components/admin/chat/session-audit-ui.ts` and move UI-only mappers (`statusBadge`, `eventSeverityClasses`, `timelineDotClasses`, `libriStatusClasses`, `eventIcon`) there.
5. Page imports from the new modules. Run `pnpm --filter @buildos/web check` and the targeted page tests.

**Expected page size after Phase 1:** ~4,400 lines (~600 fewer).

### Phase 2 — Lift the timeline grouping + tool lifecycle + conversation assembly

**Goal:** delete the heavy domain logic (~900 lines) from the page and put tests around it.

1. Create `chat-session-audit-timeline.ts` — move `turnEventName`, `isSupervisorTimelineEvent`, `isReplayVisibleEvent`, event priority/sequence/compare, counts, `createStandalone/TurnTimelineGroup`, `groupRequestPreview`, and `eventTypeLabel`. Export `buildReplayTimeline`, `buildVisibleTimeline`, and `buildVisibleTimelineGroups` as pure functions.
2. Create `chat-session-audit-tool-lifecycle.ts` — move the whole tool merger (`toolTracePayload` through `toolLifecycleDisplayState`). This is the highest-priority test target: cover emitted-only, outcome-only, matched emit+outcome, hidden merged outcome, trace payload, validation failure, duplicate/mismatched call ids, and out-of-order events.
3. Create `chat-session-audit-conversation.ts` — move `buildConversationMessage`, `addMessageToConversationTurn`, `assignAuditEventToConversationTurn`, `conversationToolCallFromEvent`, `buildConversationToolCalls`, `toolDedupKey`, etc. Export `buildConversationTurns({ detail, replayTimeline })` as the single entry point so the caller controls whether prompt-snapshot-created turn events are hidden. Tests: feed the sanitized fixture payload, assert tree structure and tool-call dedupe.
4. Create `chat-session-audit-libri.ts` — move libri builders and classifiers.
5. Create `chat-session-audit-evals.ts` — move eval count helpers. Move `runPromptEval` / `runScenarioReplay` request construction only if the wrappers accept an injected `fetch` and do not own page side effects such as reloading detail or selecting the replayed session.
6. Page now imports `buildReplayTimeline`, `buildConversationTurns`, `buildVisibleTimeline`, `buildVisibleTimelineGroups`, and `toolLifecycleDisplayState` and calls them inside `$derived.by`.

**Expected page size after Phase 2:** ~3,500 lines (script down to ~400 lines; markup unchanged).

### Phase 3 — Extract the small component seams

**Goal:** detach the sessions list, filters, replay panel, and modal shell from the page.

1. `SessionFilters.svelte` — Svelte 5 props: `$bindable` `searchQuery`, `selectedStatus`, `selectedContextType`, `selectedSortBy`, `selectedSortOrder`; callback prop `onApply()`. Preserve current behavior: search submit resets `currentPage`; status/context/sort changes can still reload through the parent effect.
2. `ReplayScenarioPanel.svelte` — props: scenarios, `$bindable` selected slug, running, error, last result; callback prop `onRun()`.
3. `SessionList.svelte` — props: sessions, isLoading, error, selectedSessionId, currentPage, totalSessions, pageSize; callback props `onSelect(sessionId)`, `onPreviousPage()`, `onNextPage()`.
4. `SessionDetailModal.svelte` — props: `$bindable isOpen`, sessionDetail, isLoadingDetail, detailError, and the callbacks it needs (`onClose`, `onExport`, `onRunPromptEval`, timeline filter callbacks, etc.). Initially this is a thin wrapper holding the whole 2,779-line modal body unchanged.
5. URL sync stays in `+page.svelte`.

**Expected page size after Phase 3:** `+page.svelte` ~250 lines. `SessionDetailModal.svelte` ~2,800 lines.

### Phase 4 — Decompose the modal body

**Goal:** split the modal into single-responsibility components, deduplicate the "BuildOS activity" drawer and the audit timeline.

1. `SessionMetricsHeader.svelte` — title, user chips, error pill, metric tiles, export button, export-format buttons.
2. `LibriPanel.svelte` — libri extraction + handoff cards.
3. Shared event-card components (the deduplication win):
    - `SupervisorEventCard.svelte`
    - `ToolCallCard.svelte` — accepts the merged lifecycle state from `toolLifecycleDisplayState`.
    - `LlmCallCard.svelte`
    - `PromptSnapshotCard.svelte`
4. Add a small event display view model if needed so both the drawer and full timeline pass the same shape into the shared cards. Do not make the cards depend on raw page-local state.
5. `ConversationReplay.svelte` composes a list of `ConversationTurnHeader` + `ConversationMessage` + `BuildOsActivityDrawer` (which renders the per-turn `SupervisorEventCard` / `ToolCallCard` / `LlmCallCard` / `PromptSnapshotCard`).
6. `AuditTimeline.svelte` composes `TimelineFilters` + a list of `TimelineGroupCard`s, where `TimelineGroupCard` renders the same shared event cards.
7. After this, "BuildOS activity drawer" and "Full Audit Timeline" share their event rendering. Any change to how a tool call is displayed touches one component, not two.

**Actual sizes after Phase 4:**

- `+page.svelte`: 585 lines. This is higher than the early estimate because the page still owns URL sync, fetching, replay/eval actions, and derived state instead of moving those effects into a route store.
- `SessionDetailModal.svelte`: 133 lines (composition only).
- `AuditTimeline.svelte`: 99 lines, with `TimelineGroupCard`, `TimelineEventCard`, `TimelineFilters`, `PromptEvalPanel`, and event-type detail components handling the nested timeline UI.
- `ConversationReplay.svelte`: 70 lines, with `ConversationTurnHeader`, `ConversationMessageBubble`, `BuildOsActivityDrawer`, `SupervisorEventCard`, and `ConversationToolCallCard` handling the replay UI.
- Largest remaining card component: `TimelineTurnEventDetails.svelte` at 174 lines.

### Phase 5 — Optional follow-ups

- Add a feature flag or query param to choose between "drawer view" and "audit timeline view" if both turn out to serve different audiences. Right now we ship both because we're afraid to delete either; once they share components, picking one is cheap.
- Move URL sync into a small `useChatSessionUrl()` helper.
- Memoize `conversationTurns` / `visibleTimelineGroups` keyed on `sessionDetail.session.id` so opening/closing the modal doesn't recompute.
- Precompute searchable timeline text once per event instead of `JSON.stringify`-ing payloads during every filter pass.

---

## Risks

- **Behavior drift in tool-lifecycle merging.** This is the highest-risk extraction. Mitigation: write the unit tests in Phase 0/2 against a scrubbed fixture payload captured from a real session **before** moving the code, then confirm the page still renders identically.
- **Reactive graph regressions.** `$derived.by` blocks that depended on `untrack` for URL sync can subtly change when split across components. Mitigation: keep URL sync in `+page.svelte` and pass `selectedSessionId` as a prop down to `SessionList` and `SessionDetailModal`.
- **UI/service boundary drift.** `eventIcon`, badge class mappers, and Tailwind classes should stay in component/UI helper files; pure service files should return data and labels, not Svelte component constructors.
- **Modal lazy-loading regressions.** Do not dynamically import `SessionDetailModal` during the first extraction. If lazy loading is introduced later, confirm the loading skeleton still shows during the chunk fetch.
- **Path alias drift.** Prefer the repo's existing `$lib/components/...` and `$lib/services/admin/...` imports. The `$components` alias exists, but this codebase mostly imports components through `$lib/components`.

## Verification per phase

- `pnpm --filter @buildos/web check`
- `pnpm --filter @buildos/web test -- src/routes/admin/chat/sessions/page.test.ts src/lib/services/admin/chat-session-audit-*.test.ts src/routes/api/admin/chat/sessions/[id]/session-detail-payload.test.ts`
- Manual smoke: open `/admin/chat/sessions`, pick a session with tool calls + supervisor events + libri extraction, confirm the conversation replay and full audit timeline render identically to pre-extraction.
- Capture one scrubbed real `ChatSessionAuditPayload` as a JSON fixture before starting Phase 2 — that's the regression anchor for the merger and the conversation builder.

## Out of scope

- No new features.
- No styling changes beyond moving classes with their components.
- No changes to the `/api/admin/chat/*` API surface.
- No changes to `chat-session-audit-export.ts` other than re-exporting types from `chat-session-audit-types.ts`.

## Open questions

1. Do we actually need both the "BuildOS activity" per-turn drawer and the "Full Audit Timeline" long-term, or is one of them the canonical view? Answering this would let Phase 5 delete a whole panel.
2. Is the libri panel only used by a small number of sessions? If so, lazy-load `LibriPanel.svelte` only when the current display condition is true: candidates, ignored candidates, or handoff data exists.
3. Should `buildConversationTurns` move down into `packages/shared-utils` so the worker or other admin tools can reuse it? Probably not yet — keep it web-side until a second consumer appears.
