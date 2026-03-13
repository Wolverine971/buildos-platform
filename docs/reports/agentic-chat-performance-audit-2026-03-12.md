<!-- docs/reports/agentic-chat-performance-audit-2026-03-12.md -->

# Agentic Chat Performance Audit

Date: 2026-03-12

## Scope

This audit focuses on the current V2 agentic chat frontend and its immediate backend dependencies:

- `apps/web/src/lib/components/agent/AgentChatModal.svelte`
- `apps/web/src/lib/components/agent/AgentMessageList.svelte`
- `apps/web/src/lib/components/agent/AgentComposer.svelte`
- `apps/web/src/lib/components/chat/ContextSelectionScreen.svelte`
- `apps/web/src/lib/components/agent/ProjectActionSelector.svelte`
- `apps/web/src/lib/components/agent/ProjectFocusSelector.svelte`
- `apps/web/src/lib/components/agent/project-entity-browser.ts`
- `apps/web/src/routes/api/agent/v2/prewarm/+server.ts`
- `apps/web/src/routes/api/agent/v2/stream/+server.ts`
- `apps/web/src/routes/api/onto/projects/+server.ts`
- `apps/web/src/routes/api/onto/projects/[id]/entities/+server.ts`
- `apps/web/src/lib/services/agentic-chat-v2/context-loader.ts`
- `apps/web/src/lib/services/agentic-chat-v2/session-service.ts`

This is a structural audit. I did not run full production profiling or benchmark the live stack. Findings are based on code-path review, request flow analysis, and the current frontend/backend contracts.

## Executive Summary

The chat is in better shape than a typical modal-driven agent UI:

- First-turn session identity is now stable.
- Fresh prewarm context is reused by the stream route instead of rebuilding prompt context every time.
- Selector UIs are lazy-loaded, debounced, and result-capped.
- Streaming text is already buffered with `requestAnimationFrame`.
- The message list already uses `content-visibility: auto`.

The remaining latency is mostly structural, not cosmetic. The biggest costs now come from:

1. Fetching too much project data for project search.
2. Repeating access checks and entity queries for every selector search request.
3. Serial backend work before first token on `/api/agent/v2/stream`.
4. Letting long sessions accumulate a large DOM without real virtualization.

## Current Hot Path

### First turn

1. User selects a context.
2. The modal does not immediately create a session anymore.
3. On actual chat intent, `ensureSessionReady()` may call `/api/agent/v2/prewarm` with `ensure_session`.
4. The first send calls `/api/agent/v2/stream` with the ensured `session_id` and any fresh `prewarmedContext`.
5. The stream route still does the following before the model can produce a first token:
    - `resolveSession()`
    - `loadRecentMessages()`
    - `composeFastChatHistory()`
    - resolve cached or fresh prompt context
    - build system prompt
    - start `streamFastChat()`

### Selector path

1. `ContextSelectionScreen` opens project selection lazily.
2. `GET /api/onto/projects` returns a limited list.
3. `ProjectActionSelector` and `ProjectFocusSelector` debounce and cap entity searches.
4. `GET /api/onto/projects/[id]/entities` runs on each type/search change.

## What Is Already Good

### Fast-path wins already in place

- `AgentChatModal.svelte` now avoids the old 450ms session handoff and reuses an in-flight bootstrap promise.
- `/api/agent/v2/stream` honors a fresh `prewarmedContext` and skips `loadFastChatPromptContext()` when the cache is fresh and the cache key matches.
- `AgentMessageList.svelte` avoids some scroll/render cost with `content-visibility: auto` and `contain-intrinsic-size`.
- Streaming text updates are batched in `AgentChatModal.svelte` instead of mutating the DOM for every SSE delta.
- Project and entity pickers no longer fetch everything up front.

These are meaningful improvements. The next gains are from reducing expensive requests, not from minor CSS or Svelte cleanup.

## Findings

### 1. Project search still fetches the full accessible project summary set before filtering

Severity: High
Impact: High in larger workspaces
Complexity: Small to medium

`GET /api/onto/projects` currently:

- resolves the actor via `ensure_actor_for_user`
- loads all accessible project summaries via `fetchProjectSummaries()`
- applies `search` by filtering in memory
- slices the filtered array to `limit`

Relevant paths:

- `apps/web/src/routes/api/onto/projects/+server.ts:47-80`
- `apps/web/src/lib/services/ontology/ontology-projects.service.ts:106-167`

Why this matters:

- Every debounced search still pays the cost of loading the full summary set.
- The returned project summary payload is not small. It includes counts, access metadata, next-step fields, and sanitized props.
- The UI is capped to 24 or 50 items, but the backend still computes the larger source set first.

Quick win:

- Add a selector-oriented server path that applies `search` and `limit` before materializing the full summary list.
- Prefer a dedicated RPC for selector use that returns only the fields the context picker needs.

Recommended shape:

- New RPC or route mode for `project search` returning only:
    - `id`
    - `name`
    - `description`
    - `state_key`
    - `type_key`
    - `facet_*`
    - light counts if they are genuinely needed

Expected effect:

- Lower query cost for project browsing.
- Lower response payload size.
- Better scaling as workspace/project count grows.

### 2. Entity selector search still pays redundant auth and existence checks on every request

Severity: High
Impact: Medium to high
Complexity: Small

`GET /api/onto/projects/[id]/entities` does the right thing functionally, but the helper stack is too expensive for a high-frequency search endpoint.

Relevant paths:

- `apps/web/src/routes/api/onto/projects/[id]/entities/+server.ts:50-143`
- `apps/web/src/lib/utils/api-helpers.ts:218-277`

Today each request can pay for:

1. `ensure_actor_for_user`
2. `current_actor_has_project_access`
3. `onto_projects` existence lookup
4. the actual entity query

Why this matters:

- The UI now debounces, but users still generate repeated searches while typing or switching tabs.
- `ProjectActionSelector` and `ProjectFocusSelector` can both hit the same endpoint for the same project in one modal session.

Quick wins:

- Add a lean project-read helper for selector endpoints that skips `ensure_actor_for_user` when the caller does not need the actor id.
- Skip the extra project existence read on high-frequency selector endpoints once access is confirmed.
- Add an in-memory client cache keyed by `projectId|type|search|limit` inside `project-entity-browser.ts` so both selectors can reuse recent results.

Expected effect:

- Lower query count per search.
- Faster perceived response when flipping between focus types or reopening selector views.

### 3. First-token latency is still gated by several serial backend steps

Severity: High
Impact: High
Complexity: Medium to large

The session race is fixed, but the first-token path still has several sequential steps in `/api/agent/v2/stream`.

Relevant paths:

- `apps/web/src/routes/api/agent/v2/stream/+server.ts:2172-2447`
- `apps/web/src/lib/services/agentic-chat-v2/session-service.ts:141-337`

Current order:

1. resolve session
2. emit session SSE
3. load recent messages
4. compose history
5. load or hydrate prompt context
6. build system prompt and context usage snapshot
7. start model streaming

Why this matters:

- Even with a warm client-side context cache, first token still depends on server session load and history fetch.
- Any slow DB read or metadata update stretches time-to-first-token.

Bigger change:

- Introduce a single bootstrap routine for the stream path that returns:
    - authoritative session
    - recent history slice or precompressed summary
    - prompt context snapshot
    - context usage summary if needed

That can be an RPC, a service-layer aggregator, or a specialized bootstrap endpoint used by the stream route.

Expected effect:

- Lower round-trip and DB orchestration overhead.
- More predictable first-token latency.
- Cleaner split between bootstrap work and token streaming.

### 4. The project/entity browse layer has no shared query cache across selector surfaces

Severity: Medium
Impact: Medium
Complexity: Small

The selector UIs are better than before, but `ContextSelectionScreen`, `ProjectActionSelector`, and `ProjectFocusSelector` each own their own fetch lifecycle. They do not share a short-lived cache or a deduped promise map.

Relevant paths:

- `apps/web/src/lib/components/chat/ContextSelectionScreen.svelte:73-171`
- `apps/web/src/lib/components/agent/ProjectActionSelector.svelte:189-252`
- `apps/web/src/lib/components/agent/ProjectFocusSelector.svelte:64-133`
- `apps/web/src/lib/components/agent/project-entity-browser.ts:18-44`

Why this matters:

- Opening a project, then narrowing to a focus, can refetch adjacent data that the user just saw.
- Search term clears and type switches can trigger requests that are individually fine but collectively chatty.

Quick win:

- Add a tiny session-scoped cache with:
    - key: `route + params`
    - value: `{ promise, data, ts }`
    - TTL: 30s to 120s

Use it only for selector browsing, not for mutable write surfaces.

Expected effect:

- Fewer repeated requests while navigating the modal.
- Faster response when switching back to a recent project/entity type.

### 5. Long chat sessions still grow the DOM linearly

Severity: Medium
Impact: Medium now, high for heavy users
Complexity: Medium to large

`AgentMessageList.svelte` already uses `content-visibility: auto`, which is useful, but it still renders the full message array.

Relevant paths:

- `apps/web/src/lib/components/agent/AgentMessageList.svelte:74-357`
- `apps/web/src/lib/components/agent/AgentMessageList.svelte:360-364`

Why this matters:

- `content-visibility` helps off-screen paint and layout, but the DOM still exists.
- Markdown-heavy assistant messages and long thinking blocks will still add memory pressure and slower list reconciliation over time.

Larger changes:

- Add windowing or segmented history rendering.
- Collapse older message groups into a “load older messages” boundary after a threshold.
- Consider rendering only the recent window plus anchored older blocks.

Expected effect:

- Better long-session responsiveness.
- Less jank when scrolling, resizing, or appending streamed responses.

### 6. Normal completion waits for assistant-message persistence before the turn fully closes

Severity: Medium
Impact: Medium
Complexity: Medium

On the normal path, `/api/agent/v2/stream` persists the assistant message before sending the final `done` event.

Relevant paths:

- `apps/web/src/routes/api/agent/v2/stream/+server.ts:2873-3016`

Why this matters:

- Users can see the full answer but still wait for the UI to become fully idle.
- This shows up as “feels sticky at the end” rather than “feels slow at the beginning.”

Possible improvement:

- Move assistant-message persistence and tool-execution persistence farther off the critical path.
- Keep idempotency keys.
- Emit the final turn metadata needed by the client before write-heavy cleanup where possible.

Tradeoff:

- If persistence becomes fully asynchronous, resume-after-refresh consistency becomes slightly more complex.
- This is a good candidate only if traces show DB writes are materially affecting end-of-turn latency.

### 7. The project list route is optimized for correctness, not for search relevance

Severity: Medium
Impact: Medium
Complexity: Medium

Even after search is server-side, the current behavior still wants better ranking semantics for selector use.

Relevant paths:

- `apps/web/src/routes/api/onto/projects/+server.ts:55-80`
- `apps/web/src/routes/api/onto/projects/[id]/entities/+server.ts:97-116`

Why this matters:

- Selector UX speed is not just latency. It is also “did the right thing appear in the first few results”.
- `ilike '%query%'` plus default ordering is acceptable, but not ideal once data grows.

Bigger change:

- Use ranked search for project/entity pickers.
- For projects, match exact-prefix and exact-name above description hits.
- For entities, consider trigram or FTS-backed ranking for names/titles.

Expected effect:

- Fewer keystrokes.
- Lower likelihood of users forcing broad result limits.

### 8. Context cache reuse is effective, but the cache contract is still short-lived and per-session

Severity: Low to Medium
Impact: Medium in active workflows
Complexity: Medium

Fresh `prewarmedContext` is used correctly, but the cache TTL is only 2 minutes and the server-side cache lives in session metadata.

Relevant paths:

- `apps/web/src/lib/services/agentic-chat-v2/context-cache.ts:5-73`
- `apps/web/src/routes/api/agent/v2/prewarm/+server.ts:154-209`
- `apps/web/src/routes/api/agent/v2/stream/+server.ts:2347-2427`

Why this matters:

- It works well inside one active modal session.
- It is less effective across quick reopenings, focus toggles, or adjacent sessions on the same context.

Bigger change:

- Introduce a context snapshot cache keyed by user + context key + mutation version, not just by chat session metadata.
- Invalidate on ontology writes instead of relying mainly on time-based freshness.

Expected effect:

- Better reuse across modal reopenings and adjacent sessions.
- Fewer repeated context loads without increasing staleness risk.

## Prioritized Quick Wins

### 1. Make project search server-side and selector-specific

Best near-term performance ROI.

Do:

- Add a lightweight project-search RPC or route mode.
- Apply `search` and `limit` before building the full result payload.

### 2. Strip redundant auth work from the entity search endpoint

Best near-term backend simplification for selector speed.

Do:

- Replace `verifyProjectAccess()` on this route with a lean access check.
- Avoid `ensure_actor_for_user` and extra existence queries on every debounced search.

### 3. Add short-lived client query caching for selector requests

Best near-term frontend polish.

Do:

- Cache recent project and entity results in `project-entity-browser.ts` and the project list loader.
- Reuse in-flight promises for identical requests.

### 4. Add latency instrumentation for first-token and end-of-turn time

Do this before larger backend work.

Track:

- modal send click to first SSE event
- first SSE event to first text delta
- final text delta to `done`
- selector search request time

Without this, the next round of optimization will be partly guesswork.

## Bigger Structural Changes Worth Considering

### 1. Bootstrap bundle for stream startup

Return session + context + history bundle from one backend operation before model start.

Why it is worth it:

- This directly attacks time-to-first-token.

Why it is larger:

- It changes the shape of the stream bootstrap path and likely touches tests, service composition, and observability.

### 2. Shared mutation-aware context snapshot cache

Move beyond a short TTL in session metadata.

Why it is worth it:

- Context loading is one of the most expensive backend steps that can still be reused safely if invalidation is explicit.

### 3. Windowed or segmented message rendering

Why it is worth it:

- This prevents long chats from slowly degrading the UI even if the backend is fast.

### 4. Ranked search and indexed lookup for project/entity pickers

Why it is worth it:

- It improves both speed and selector quality once ontology data grows.

## Recommendation Order

If the goal is to improve performance without destabilizing the product, the best order is:

1. Server-side project search with lighter payloads.
2. Lean auth path plus request caching for project/entity selectors.
3. First-token instrumentation.
4. Stream bootstrap bundling.
5. Long-session message list virtualization.
6. Context cache redesign if traces still show context load dominating.

## Bottom Line

The chat is not slow because the frontend is doing obviously wasteful DOM work. Most of the easy UI mistakes have already been corrected.

The next material wins are:

- make selector APIs cheaper
- reduce duplicated request work across selector surfaces
- shorten the serialized backend bootstrap path before first token
- stop long sessions from growing an unbounded interactive DOM

If only two performance changes are taken next, they should be:

1. server-side project search with lighter selector payloads
2. lean auth plus shared caching for entity selector queries

Those are the fastest improvements with the lowest product risk.
