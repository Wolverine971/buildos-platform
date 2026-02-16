<!-- apps/web/docs/technical/issues/FASTCHAT_EVENT_WINDOW_IMPLEMENTATION_2026-02-15.md -->

# FastChat Event Window Plan and Implementation (2026-02-15)

## Goal

Time-box project-context events in Agentic Chat V2 so the model sees only recent and near-future events by default, while still allowing explicit deeper calendar lookups via tools.

## Agreed Plan

1. Add a canonical context event window in V2 loader: `past_days = 7`, `future_days = 14` (UTC).
2. Enforce this window immediately in app code:

- Filter RPC-loaded events before returning project context.
- Add `start_at` window filters to fallback project-event query.

3. Add explicit `events_window` metadata to project context data so the model can see exact bounds.
4. Update DB RPC via new migration to apply the same event window in `load_fastchat_context`.
5. Keep shared SQL snapshot in sync with the migration.
6. Update prompt contract text to state events are time-boxed and that broader lookup should use `cal.event.list` + `timeMin/timeMax`.
7. Add tests for context-loader window behavior and prompt guidance.
8. Validate output with a fresh prompt dump where events are in-window and `events_window` exists.

## Implementation Status

- [x] Context loader now has canonical constants (`7`/`14`) and UTC ISO window generation.
- [x] RPC-loaded project events are filtered in memory to the canonical window.
- [x] Fallback project-event query now applies `.gte('start_at', window.start_at)` and `.lte('start_at', window.end_at)`.
- [x] `ProjectContextData` now includes `events_window` metadata.
- [x] New migration added to time-box `load_fastchat_context` events query.
- [x] Shared SQL function snapshot updated with the same event predicates.
- [x] Prompt guidance updated to explain the time-box and explicit calendar range lookup.
- [x] Unit tests added/updated for loader behavior and prompt guidance.
- [ ] Fresh runtime prompt dump validation (requires running an authenticated chat turn against live context).

## Files Updated

- `apps/web/src/lib/services/agentic-chat-v2/context-models.ts`
- `apps/web/src/lib/services/agentic-chat-v2/context-loader.ts`
- `apps/web/src/lib/services/agentic-chat-v2/context-loader.test.ts`
- `apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts`
- `apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.test.ts`
- `supabase/migrations/20260424000007_timebox_fastchat_context_events.sql`
- `packages/shared-types/src/functions/load_fastchat_context.sql`

## Validation Checklist

- Run:
    - `pnpm --filter @buildos/web test -- src/lib/services/agentic-chat-v2/context-loader.test.ts src/lib/services/agentic-chat-v2/master-prompt-builder.test.ts`
- Manual runtime verification:
    - Trigger a new Agentic chat turn in project context.
    - Inspect new file in `apps/web/.prompt-dumps/`.
    - Confirm `data.events[*].start_at` is within `[now-7d, now+14d]`.
    - Confirm `data.events_window` exists with `past_days: 7` and `future_days: 14`.
