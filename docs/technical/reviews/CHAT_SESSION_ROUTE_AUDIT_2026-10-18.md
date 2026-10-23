<!-- docs/technical/reviews/CHAT_SESSION_ROUTE_AUDIT_2026-10-18.md -->
<!-- doc-status: point-in-time -->

# Agentic chat session route audit

**Date:** 2026-10-18. **Scope:** the current working tree, including existing uncommitted changes.

The session route has sound ownership checks and a well-contained deletion operation, but its restore contract is not reliable yet. Two problems deserve priority: normal users silently lose turn state because of database policies, and separate reads can return a completed turn without its reply. The investigation also found five smaller correctness defects and a performance opportunity.

Runtime code and production data were left unchanged. This audit adds regression reproductions and rename/ownership coverage. The seven `it.fails` cases intentionally describe unmet contracts; they are not fixes or passing behavior.

## Findings

### P1 Restore reads use a database role that cannot see turn state

The route reads `chat_turn_runs` and `chat_turn_events` with `locals.supabase`, the signed-in user's client. Production has RLS enabled on both tables, grants `authenticated` SELECT, and permits SELECT only through `is_admin()`. A non-admin owner's query therefore succeeds with an empty array. Adding `user_id = user.id` narrows a query but does not grant access through RLS.

This affects the full snapshot and the old `probe=active-turn` branch. Ordinary users get no turn status or persisted event steps, and `activeTurnRun` is null. The modal consequently does not arm its restore polling fallback. Its separate worker discovery effect can adopt active work through `/api/agent/v2/turns`, which limits the visible impact when discovery succeeds; that does not repair the incomplete snapshot or recover the fallback when discovery fails.

**Evidence:** [turn query](/Users/djwayne/buildos-platform/apps/web/src/routes/api/chat/sessions/[id]/+server.ts:481), [event query](/Users/djwayne/buildos-platform/apps/web/src/routes/api/chat/sessions/[id]/+server.ts:541), [policy definitions](/Users/djwayne/buildos-platform/supabase/migrations/20260428000015_add_chat_turn_observability_phase1.sql:160), [working gateway boundary](/Users/djwayne/buildos-platform/apps/web/src/routes/api/agent/v2/turns/+server.ts:80), and production `pg_policies`, table privileges, and `relrowsecurity` inspected on the audit date. This behavior follows [Supabase's RLS access model](https://supabase.com/docs/guides/database/postgres/row-level-security).

**Repair:** after session ownership is established, use a server-owned reader with explicit session and user predicates to return a bounded, allowlisted UI projection. Keep private worker tables private. Remove the unused legacy probe or make it use the same reader. Add a role-aware integration check; fixed-array query mocks cannot catch this defect.

### P1 A turn can finish between reads and leave its reply absent

The route reads messages, then attachments and tool executions, then turn status. If the worker commits its assistant message and terminal status after the message read, the later query sees `completed` while the returned message array still lacks the assistant message. The client sees no active turn and does not schedule a refresh.

This also escapes the independent discovery path: discovery starts after the snapshot establishes the session and lists only queued/running turns, so it can return empty after completion. The modal's direct message subscription accepts injected agent-run and freshness messages, not ordinary worker replies. A reload is then needed to recover the absent reply. The database row is not lost.

**Evidence:** [message read](/Users/djwayne/buildos-platform/apps/web/src/routes/api/chat/sessions/[id]/+server.ts:387), [later turn read](/Users/djwayne/buildos-platform/apps/web/src/routes/api/chat/sessions/[id]/+server.ts:481), [snapshot application](/Users/djwayne/buildos-platform/apps/web/src/lib/components/agent/AgentChatModal.svelte:1623), [message subscription filter](/Users/djwayne/buildos-platform/apps/web/src/lib/components/agent/AgentChatModal.svelte:470). A deterministic test commits the reply immediately after the message read and reproduces the inconsistent response. This is a reproduced interleaving, not a measured production incidence rate.

**Repair:** return lifecycle state and messages from a consistent database snapshot, or implement an explicit version/reconciliation contract. A narrower repair can read lifecycle state before messages and verify that a returned terminal `assistant_message_id` is present before declaring the snapshot complete. Simply parallelizing the current reads does not establish consistency.

### P2 Background classification can overwrite a successful manual rename

PATCH correctly writes the owner's title. Downstream, the classification worker remembers whether the original title was a placeholder, waits for an LLM response, and then writes an automatic title based on that old decision. Its final UPDATE filters only by session ID. A manual rename committed during classification is overwritten even though PATCH returned success.

**Evidence:** [rename update](/Users/djwayne/buildos-platform/apps/web/src/routes/api/chat/sessions/[id]/+server.ts:675), [early placeholder decision](/Users/djwayne/buildos-platform/apps/worker/src/workers/chat/chatSessionClassifier.ts:275), [unconditional promotion](/Users/djwayne/buildos-platform/apps/worker/src/workers/chat/chatSessionClassifier.ts:450). The worker regression reproduces this with a fully mocked model call.

**Repair:** write classification fields independently and promote the title only with a compare-and-set against the title originally read. An explicit manual-title field or provenance flag would also avoid interpreting a user-chosen title as a placeholder.

### P2 Queued turns are treated as inactive by the restore client

The snapshot mapper finds only `status === 'running'`. A legitimate queued worker turn therefore produces neither `activeTurnRun` nor the waiting note/polling state, even if the route successfully returns the row. Both admission and the working active-turn gateway treat queued and running as active. The independent discovery path can mask this bug, but the restore contract itself is wrong.

**Evidence:** [snapshot active-state check](/Users/djwayne/buildos-platform/apps/web/src/lib/components/agent/agent-chat-session.ts:1212), [gateway active-state check](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat-v2/worker-turn-gateway.server.ts:105).

**Repair:** share one typed active-status predicate and test queued, running, completed, failed, and cancelled states across snapshot and gateway consumers. Fix this with the RLS problem so queued restores do not remain broken after turn rows become visible.

### P2 Messages and activity use unrelated history windows

The response combines 400 messages, 1,000 tools, 1,000 events, and five runs selected independently across the entire session. With 401 messages and an old tool linked to the excluded first message, the timeline still contains that tool. The conversation mapper filters message-linked tools against its visible messages, so the conversation and timeline disagree. Conversely, a tool-heavy window can silently lose tool details while retaining its messages, and only message truncation is reported.

**Evidence:** [tool window](/Users/djwayne/buildos-platform/apps/web/src/routes/api/chat/sessions/[id]/+server.ts:470), [timeline assembly](/Users/djwayne/buildos-platform/apps/web/src/routes/api/chat/sessions/[id]/+server.ts:609), [client tool filtering](/Users/djwayne/buildos-platform/apps/web/src/lib/components/agent/agent-chat-session.ts:910). The 401-message reproduction confirms the mismatch. Production at inspection had a maximum of 22 user/assistant messages and 75 tools per session, so these capacity failures were not demonstrated against a current production conversation.

**Repair:** define a single visible turn/message window and load its associated tools and events, plus the current active turn. Make any additional activity cap explicit in the response. Use stable ordering and a cursor if older history is supported.

### P2 Database failures are reported as missing conversations

The session lookup combines `sessionError || !session` into a 404. A timeout, unavailable database, or permission/configuration error is therefore presented as “Chat session not found.” The same pattern exists in PATCH and the pending-change probe. It also weakens server-error monitoring, which receives a 4xx response for an infrastructure failure.

**Evidence:** [GET error mapping](/Users/djwayne/buildos-platform/apps/web/src/routes/api/chat/sessions/[id]/+server.ts:375), [PATCH error mapping](/Users/djwayne/buildos-platform/apps/web/src/routes/api/chat/sessions/[id]/+server.ts:671). Injecting SQLSTATE `57014` produces 404 in the regression.

**Repair:** validate the session UUID, distinguish absence from database errors with `maybeSingle()` or an explicit error-code branch, and pass real database failures through `ApiResponse.databaseError`. Keep the same missing/foreign-session response to preserve ownership privacy.

### P3 Exactly 400 messages incorrectly triggers the truncation notice

`messages.length >= MESSAGE_LIMIT` cannot distinguish exactly 400 stored messages from a longer conversation. The client tells the user messages were omitted even when all messages are present.

**Evidence:** [truncation flag](/Users/djwayne/buildos-platform/apps/web/src/routes/api/chat/sessions/[id]/+server.ts:600). The exact-limit regression reproduces the false notice.

**Repair:** fetch 401 rows, determine `hasMore`, then return the latest 400 in chronological order. This avoids a separate COUNT query.

## Performance and design

The current route bounds row counts, but does not bound response bytes. It loads raw tool `arguments` and `result`, builds a timeline representation from those payloads, and sends both representations to the browser. The browser then processes raw tools again to reconstruct activity and change cards. The attachment query similarly transfers full OCR text before reducing it to a preview in JavaScript.

Read-only production measurements across the latest 100 updated sessions found:

| Measurement                                       | Result                                      |
| ------------------------------------------------- | ------------------------------------------- |
| Largest single tool result                        | 329,534 bytes from `get_onto_project_graph` |
| Arguments/results in a 16-tool session            | 518,907 bytes                               |
| Largest aggregate arguments/results in the sample | 672,250 bytes across 75 tools               |
| Largest session `agent_metadata` in the sample    | 68,051 bytes                                |

These are SQL text byte counts of stored fields, not compressed HTTP transfer measurements. They establish that the current row limits do not ensure a small restore response. Workspace tool results are deliberately stored intact by [the storage projector](/Users/djwayne/buildos-platform/packages/agentic-chat-runtime/src/tools/tool-storage-projection.ts:156), so the upstream writer does not impose a general payload bound for this endpoint.

A basic nonempty global restore makes six sequential route-level reads: session, messages, attachments, tools, runs, and events. Workflow recovery and voice notes add more. [Entity lookups](/Users/djwayne/buildos-platform/apps/web/src/lib/server/chat-entity-lookups.ts:101) await each entity kind serially; the pending-change helper can then repeat IDs already fetched for the timeline/focus. PATCH reads a full session row solely to establish existence before its separately ownership-filtered UPDATE. Production already has useful session/recent indexes for messages and tools and a session/user/date index for events; there is no basis here for claiming missing indexes are the main bottleneck.

The next design should have a typed UI snapshot contract with explicit active state, window/cursor information, and bounded display projections. Keep the route responsible for authentication, input validation, status mapping, and invoking that reader. Move attachment projection and entity enrichment into testable server helpers; the UI may share pure presentation helpers without making component-folder types the transport contract.

Preserve the receipts needed for document/table undo and proposal cards when reducing tool payloads. Fetch expanded tool details on demand, and avoid transferring a full project graph merely to display a short activity label. After the core snapshot is consistent, parallelize independent enrichment with a small concurrency limit and reuse one lookup map for focus, timeline, and pending targets. Measure response bytes and per-phase timings before and after; this audit did not benchmark deployed HTTP latency.

## Checks that held up

- GET and PATCH check session ownership before returning session content or performing the rename. Focus/entity enrichment uses the user-scoped client and preserves RLS.
- The privileged workflow read happens after ownership is established, filters both user and session, and selects only `projection->workflow`. It does not read the private full stream/context snapshot.
- DELETE delegates to `delete_my_chat_session`. The deployed definition matches the reviewed implementation: it checks `auth.uid()`, locks the session row, refuses queued/running turns, handles guarded worker children and voice-note cleanup, and deletes in one transaction. The foreign-key lock prevents new turn insertion racing past the delete. This RPC was inspected, not executed against production.
- Rename accepts only the title field, trims it, bounds its length, and rejects unauthorized requests. Its cross-writer race is in the classifier, not a missing owner predicate in PATCH.
- Newest-first retrieval followed by reversal preserves the intended latest-message window. Latest-generation filtering suppresses old turn-event attempts. Existing tests cover workflow recovery, saved focus labels, persisted image attachments, and deletion error mapping.

## Validation and repair order

All test runs used `test-gate`, one Vitest worker, and local mocks. No paid model/API test, live chat turn, migration, or production mutation was run.

| Test group                                                     | Outcome                                  |
| -------------------------------------------------------------- | ---------------------------------------- |
| Existing route, session mapper, timeline, pending-change tests | 93 passed                                |
| New route audit tests                                          | 7 passed, 6 expected failures reproduced |
| Classification worker tests including rename race              | 5 passed, 1 expected failure reproduced  |
| Total                                                          | 105 passed, 7 expected failures          |

Reproductions are in [server.audit.test.ts](/Users/djwayne/buildos-platform/apps/web/src/routes/api/chat/sessions/[id]/server.audit.test.ts) and [chatSessionClassifierLibri.test.ts](/Users/djwayne/buildos-platform/apps/worker/tests/chatSessionClassifierLibri.test.ts:241). Remove each `.fails` modifier when its corresponding defect is fixed. The new query fake applies filters, sort order, limits, and snapshot copying; the RLS reproduction models the access behavior confirmed in production, rather than invoking production during tests.

Recommended order:

1. Restore the correct server boundary for turn state and include queued turns in active state.
2. Establish message/lifecycle consistency and test finishing during restore and between restore and discovery.
3. Guard automatic title promotion against a concurrent manual rename; correct database-error mapping.
4. Unify history windows, fetch one extra message for truncation, and reduce payloads/serial enrichment.

The passing tests are useful behavioral checks, but do not certify live performance or repair the seven reproduced defects. Role-aware database checks and a browser restore test should accompany implementation of the first two repairs.

## Repair follow-up — 2026-10-18

The seven findings above are now repaired in the working tree. The audit narrative records the original behavior; the regression tests no longer use `it.fails`.

- **Private turn state:** the authenticated route first verifies session ownership, then calls the server-only `get_chat_session_restore_v1` reader. The reader repeats the owner/session predicate. The legacy active-turn probe also uses the server client with explicit owner/session filters. Private worker-table policies remain unchanged.
- **Completion race:** one `STABLE` SQL statement returns messages, lifecycle state, tools, events, and workflow projections from the same MVCC snapshot. A completion after that snapshot leaves the returned turn active, so restore polling remains armed. The next snapshot contains both the terminal row and its reply. The existing terminal writer inserts the reply and updates the turn in one transaction.
- **Rename race:** both classifier paths persist classification separately, then promote the title only if the stored title still equals the original value (including SQL NULL). Owner predicates are included on both writes. Manual renames win without discarding useful classification.
- **Queued restore:** queued and running turns both arm the restored client's active state.
- **History windows:** associated runs, tools, events, and workflows follow the visible message window, with active turns retained. Explicit tool/event cap flags reach the client and produce an activity truncation notice. Message and activity ordering includes stable ID tie-breakers.
- **Error mapping:** missing/foreign sessions remain 404; database failures in GET, PATCH, and the pending-change probe remain server errors. Malformed identifiers are rejected before querying. PATCH uses one ownership-filtered update instead of a full-row existence read.
- **Exact limit:** the SQL reader fetches 401 messages, returns the latest 400, and sets truncation only when the extra row exists.

The route is now 293 lines. Database reading and the transport contract are in [chat-session-restore.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/server/chat-session-restore.ts) and [the snapshot types](/Users/djwayne/buildos-platform/apps/web/src/lib/types/chat-session-restore.ts); attachment, voice, and entity enrichment are in [chat-session-enrichment.ts](/Users/djwayne/buildos-platform/apps/web/src/lib/server/chat-session-enrichment.ts).

### Performance changes and evidence

A nonempty global restore with no ontology-title or voice lookups now makes **three core calls instead of six**: the ownership/header read, the coherent snapshot RPC, and the attachment RPC. Workflow recovery is included in the snapshot. Independent attachment, voice, and entity enrichment overlap; title requests use at most three concurrent queries and batches of at most 100 IDs. Focus, timeline, and pending-change targets share the same lookup map. The focused tests assert the three-call path and lookup reuse/concurrency.

Large stored tool arguments/results are projected in the database using an 8 KiB preview budget. Executable document/table undo receipts and proposal envelopes stay lossless; their writer-side bounds remain authoritative. A synthetic graph containing a 330,000-character description produced a **2,162-byte projected tool row** in the SQL check. This is fixture evidence, not a deployed latency benchmark or a universal response-size guarantee. Full stored results are unchanged.

The HTTP response carries each tool payload once. It omits duplicate expandable timeline JSON, which the browser reconstructs with the same redaction logic. Session runtime caches are excluded at the database field-selection boundary. Turn request labels are capped at 1,000 characters because the actual user content is already in the messages. Asset OCR is limited to 1,600 characters and its summary to 700 before database transfer. The attachment RPC uses invoker rights to preserve asset/project RLS and returns a single JSON array so PostgREST's row cap cannot silently cut off the 3,200-attachment window.

### Validation and rollout

Focused free coverage now comprises **153 web tests and 9 worker tests**, including all seven original reproductions, UI detail/redaction restoration, lookup budgets, title promotion from null, and the no-message classifier fallback. The document/table undo and proposal-card suites pass. The shared-types build, web Svelte/TypeScript check (zero errors and warnings), and worker typecheck pass.

[chat_session_restore.check.sql](/Users/djwayne/buildos-platform/supabase/tests/chat_session_restore.check.sql) runs against a disposable database loaded with production's schema. It exercises the ordinary-user/private-table boundary, server ownership, an MVCC completion interleaving, 400/401 messages, excluded old tools, activity caps, temporary attachment ownership, real asset OCR projection, large graph reduction, and lossless executable receipts. The role probe and all four standing checks pass with **zero new security, API, or data findings**. The role probe retains one pre-existing anonymous read failure (one before, one after); authenticated reads have zero failures. The fixture explicitly restores Supabase's service-role BYPASSRLS attribute because the rehearsal bootstrap copies role names but not role attributes, and rolls it back with the fixtures.

The migration is [20261018193727_chat_session_restore_snapshot.sql](/Users/djwayne/buildos-platform/supabase/migrations/20261018193727_chat_session_restore_snapshot.sql). **Apply this migration before deploying the route.** It has been rehearsed, not applied to production. The route intentionally reports an unavailable snapshot RPC as a server error rather than falling back to the inconsistent independent reads. No paid model/API tests, production data writes, deployment, or live latency benchmark were performed. Existing unrelated workspace changes were preserved.
