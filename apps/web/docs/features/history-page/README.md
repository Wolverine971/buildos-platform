<!-- apps/web/docs/features/history-page/README.md -->

# History Page

Capture and chat-session history/resumption feature for BuildOS.

## Overview

The history page displays past captures and chat sessions, allowing users to browse captured context, resume previous conversations, and queue missing chat summaries.

## Status

**Implemented** (December 2024)

**Performance refreshed** (July 2026)

## Key Documents

- [Chat Sessions History Spec](CHAT_SESSIONS_HISTORY_SPEC.md) - Full implementation spec covering database migration, chat classification, history page UI, and session resumption

## Key Features

- Chat session listing with classification
- Session resumption from history
- Database-backed session persistence
- Bounded `get_history_page_v1` RPC for paginated history data
- Indexed 3+ character search across captures and chat summaries
- Bounded initial skeleton rendering to avoid large DOM work on first paint

## Performance Notes

- `/history` does not fetch full user history from SvelteKit. The page streams paginated data from `public.get_history_page_v1`.
- Search terms shorter than 3 characters are ignored so the database stays on the indexed trigram search path.
- Filtered result counts are lower-bound estimates when exact counts would require scanning the full filtered result set.
- Supporting migrations: `20260707000000_history_page_perf_rpc.sql` and `20260707020000_history_page_perf_p2.sql`.

## Related

- `/apps/web/docs/features/agentic-chat/` - Agentic chat system
- `/apps/web/docs/features/chat-system/` - Chat system infrastructure
