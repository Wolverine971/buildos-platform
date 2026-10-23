<!-- tasker/130-calendar-you-can-trust.md -->

# 130 — Calendar you can trust

**Status:** CHECKED by Claude 2026-10-18 — items 1–12 pass · **Priority:** P2 · **Opened:** 2026-10-18 · **Size:** ~2 days  
**Owner:** a Codex agent does the work and self-checks; Claude does a light check after · **Needs from DJ to start:** nothing

**Disposition:** All twelve items implemented. DJ authorized item 11's worker read-port scope expansion in the review follow-up; original item 2 is now complete. Items 1 and 3–7 remain as checked by Claude. Final follow-up report below supersedes the original blocked disposition and item 6's failed-status choice.

Source: the 2026-10-18 code triage, `docs/technical/reviews/CODE_TRIAGE_2026-10-18.md` (the plan and every other tracker). Bugs below were re-checked against commit `9735aa719` on 2026-10-18.

## What users get

"Add Mom's birthday Nov 3" makes an all-day event. A busy week stops looking free. A reconnect prompt stops producing duplicate events. Personal events stay in sync with Google. An MCP agent scoped to one project can no longer edit or delete events on another calendar (security).

## Files you own

- `apps/worker/src/workers/agentic-chat/tools/calendar-write-port.ts`
- `apps/worker/src/workers/agentic-chat/tools/calendar-read-port.ts` and `apps/worker/tests/agenticChatCalendarReadPort.test.ts` (DJ-approved item 11 expansion)
- `packages/agentic-chat-runtime/src/catalog/definitions/calendar.ts`
- apps/worker/src/workers/agentic-chat/mutations/tool-catalog.ts (calendar rows only)
- packages/agentic-chat-runtime/src/tools/calendar-reads.ts and external-ports.ts
- packages/agentic-chat-runtime/src/loop/write-ledger.ts (calendar reconnect handling ~:478 only)
- `packages/shared-agent-ops/src/calendar/*`
- `packages/shared-agent-ops/src/gateway/op-execution-gateway.calendar.ts`
- `apps/web/src/lib/services/agentic-chat/tools/core/executors/calendar-executor.ts`
- apps/web/src/lib/services/calendar-service.ts (start-only move only)
- the test files next to these

## Work, in this order

1. [x] **DONE — External-agent project fence bypassed for Google-id calendar edits/deletes**
    - Size M · now at `apps/web/src/lib/services/agentic-chat/tools/core/executors/calendar-executor.ts:1404`
    - What goes wrong: The gateway forces calendar_scope 'project', but the source-aware update/delete branch routes only by calendar_source_id or mapped event id. An MCP agent scoped to project X can edit or delete events on another calendar if it knows the ids.
    - Fix: For Google-id get/update/delete, resolve the project's project_calendars row (scoped to the user) and use its calendar_source_id; refuse a different caller-supplied id, and refuse when the project has none. Reads (:1012) have the same gap.
    - Regression test: `apps/web/src/lib/services/agentic-chat/tools/core/executors/calendar-executor.event-id-routing.test.ts`
2. [x] **DONE — Calendar list reports complete coverage when Google results were cut off**
    - Size M · now at `packages/agentic-chat-runtime/src/tools/calendar-reads.ts:972`
    - What goes wrong: Each source is capped at fetchLimit 100 and the merged list is sliced, but has_more only compares against the merged count. A busy 90-day window drops later Google events, the day looks free with coverage: complete, and the agent books over existing meetings. Same in google-calendar-read.service.ts:837.
    - Fix: listEvents returns a truncated flag (leftover page token or sliced merge); has_more = truncated || offset+limit < total, plus a warning. Same logic in the web executor (calendar-executor.ts:970).
    - Regression test: `packages/agentic-chat-runtime/src/tools/calendar-reads.test.ts`
3. [x] **DONE — Chat has no all-day event path**
    - Size M · now at `apps/worker/src/workers/agentic-chat/tools/calendar-write-port.ts:425`
    - What goes wrong: 'Add Mom's birthday Nov 3' with start_at '2026-11-03' creates a timed 12:00-12:30am event. The sync service and the Google writer both support all-day events, but the port never passes the flag and the schema has no all_day argument.
    - Fix: Add all_day to the create/update schemas and reviewed-argument rows; pass allDay:true with date-only bounds to OntoEventSyncService (which already supports it).
    - Regression test: `apps/worker/tests/agenticChatCalendarWritePort.test.ts`
4. [x] **DONE — reconnect_required returns ok:false even though the BuildOS row was saved**
    - Size S · now at `apps/worker/src/workers/agentic-chat/tools/calendar-write-port.ts:946`
    - What goes wrong: The write ledger reads it as not persisted, so the user sees 'Not yet created', reconnects, asks again, and gets a duplicate event.
    - Fix: eventOutcome returns ok:true whenever the BuildOS row exists (synced:false + error_code + client_action); update write-ledger.ts:478 to match.
    - Regression test: `apps/worker/tests/agenticChatCalendarWritePort.test.ts`
5. [x] **DONE — Agent Run never updates/deletes Google copies of personal events**
    - Size S · now at `packages/shared-agent-ops/src/calendar/agent-run-calendar-port.ts:766`
    - What goes wrong: User-scope events store their mapping only in props, but update and delete loop over sync rows, so Google stays stale or orphaned. deleteGoogleEvent (:1573) treats 404/410 as a failure, so a BuildOS event already gone in Google can never be deleted.
    - Fix: With no usable sync row, patch/delete by props.external_event_id + external_calendar_id; treat 404/410 delete as done via the existing isMissingEventError.
    - Regression test: `packages/shared-agent-ops/src/calendar/agent-run-calendar-port.test.ts`
6. [x] **DONE — Skipped sync jobs leave events 'pending' forever**
    - Size S · now at `packages/shared-agent-ops/src/calendar/onto-event-sync.service.ts:1670`
    - What goes wrong: The stale_event_version, no_external_mapping, calendar_not_connected and project_calendar_unavailable branches return without setting sync_status. 69 live project events are stuck pending, 41 for users who do have a calendar connection.
    - Fix: Write a terminal sync_status on the three terminal skips (version-guarded); for stale_event_version, re-enqueue for the current version unless one is queued.
    - Regression test: `packages/shared-agent-ops/src/calendar/onto-event-sync.service.test.ts`
7. [x] **DONE — Round-1 leftover: start-only moves in the web CalendarService**
    - Round 1 made "move my 2-3pm meeting to 2:30" keep the meeting's length on the worker, the shared agent-run port and the web ontology path (`endForStartOnlyMove` in `agent-run-calendar-port.ts`). The web legacy `CalendarService` provider path (`apps/web/src/lib/services/calendar-service.ts`), which the calendar UI shares, still sends start without end. Apply the same rule there, and check the calendar UI's own update calls still send both bounds.

## Follow-up from Claude's check (2026-10-18)

Items 1 and 3–7 passed review; the MCP project fence (item 1) is done. Do items 8–10 and 12. Do item 11 only if DJ's prompt says it's approved. Owned files for these items: `packages/agentic-chat-runtime/src/catalog/definitions/calendar.ts`, `apps/web/src/lib/services/agentic-chat/tools/core/executors/calendar-executor.ts`, `calendar-datetime.ts`, `apps/web/src/lib/components/scheduling/CalendarItemPanel.svelte`, the calendar sync service you already own, `apps/worker/tests/agenticChatWorkerSurfaceBudget.test.ts`, `apps/web/src/lib/services/agentic-chat-v2/tool-surface-size-report.test.ts`, and the `catalog-fitness` snapshot.

8. [x] **DONE — An external agent asking for an all-day event gets a 48-hour timed one** (medium)
    - Now: the shared tool definition (`catalog/definitions/calendar.ts`) offers `all_day` and an exclusive `YYYY-MM-DD` end to every caller, including MCP connectors. Their calls run through the web `calendar-executor.ts`, which ignores `all_day`, and `calendar-datetime.ts:69` turns a date-only end into 23:59:59.
    - What goes wrong: `{start_at:'2026-11-03', end_at:'2026-11-04', all_day:true}` becomes a timed event from Nov 3 00:00 to Nov 4 23:59.
    - Fix: pass `allDay` and date-only bounds through the executor's create and update (the shared sync service already supports them), the same way the worker path does. Also accept end == start for an all-day create as a one-day event instead of rejecting it.
    - Regression tests: executor create and update with `all_day` → an all-day event with an exclusive end; end == start → one day.
9. [x] **DONE — The tool list is over its size budget**
    - Now: worker `tests/agenticChatWorkerSurfaceBudget.test.ts` is at 55,547 of 55,050; web `tool-surface-size-report.test.ts` is at 61,962 of 61,530. The new calendar wording from item 3 is the likely growth.
    - Fix: tighten the calendar tool descriptions until both pass. Don't raise the budgets; every chat turn pays for these bytes.
10. [x] **DONE — Users without Google see "Not synced to Google Calendar: calendar_not_connected"**
    - Now: item 6 saves `sync_status 'failed'` with a raw code for "not connected" and "sync off". `CalendarItemPanel.svelte:194` and `:642` show that as an error on project events. Suspect: one member's "not connected" job can overwrite the owner's `synced`.
    - Fix (Claude's call; DJ can veto): give "not connected" and "sync off" a neutral final status that the panel shows as nothing, or a quiet "Not on Google Calendar". Keep `failed` for real errors, and never let a skip overwrite `synced`. Check the allowed `sync_status` values first. If you need a new value, write a migration (new file, rehearse it, don't apply).
11. [x] **DONE — Finish item 2 (DJ approved)**
    - Ownership expands to `apps/worker/src/workers/agentic-chat/tools/calendar-read-port.ts` (it drops the truncation flag at ~297–318) and `apps/worker/tests/agenticChatCalendarReadPort.test.ts`. Also do the halves inside your own files: the web/MCP list in `calendar-executor.ts` (~990), `google-calendar-read.service.ts`, and `calendar-reads.ts:972`, which computes `has_more` from the merged count.
    - Why: a busy 90-day window can look free, so the agent can book over meetings.
12. [x] **DONE — Regenerate the `catalog-fitness` snapshot, last**
    - `apps/web/src/lib/services/agentic-chat/tools/core/catalog-fitness.test.ts` is stale from this tracker (calendar) and tracker 132 (`merge_llm` and `merge_instructions` removed). After items 8–9, run it once with `-u`. Check that the snapshot diff shows only calendar changes and the two removed merge fields.

## Rules

1. Read `AGENTS.md` first, and `apps/web/AGENTS.md` before touching anything under `apps/web`.
2. **Shared checkout.** Other agents are editing other files in this same checkout right now. Edit only the files under "Files you own" plus new test files next to them. Never revert, reformat, stash or check out changes you didn't make: no `git stash`, `git checkout -- <path>`, `git reset` or `git clean`. If a fix truly needs a file outside your list, stop that item and write it under "Blocked".
3. Before fixing each bug, confirm it still happens in the current code (line numbers drift). If it doesn't, mark it `NOT A BUG` or `ALREADY FIXED` with one line of evidence and move on.
4. Test first: write the regression test, run it and watch it fail, then fix and watch it pass. Say in the report that you saw it fail.
5. Narrow checks only; the laptop runs several agents at once. Use the commands under "Checks". Never run root `pnpm test:run`, `pnpm verify` or `pnpm pre-push`, and never pass `--maxWorkers`, `--pool` or `--no-isolate`. If `test-gate` refuses or queues a run, wait at least 60 s and retry once.
6. No paid or live model calls, no production database writes, and no Railway or Vercel changes.
7. Never decide what user or model text means with regex or keyword lists (AGENTS.md, "Never classify language with regex"). Route meaning through a structured channel: a tool argument, a Jev or turn-contract field, a `type_key`, a UI action.
8. Migrations: new file only (never edit an existing one), run `pnpm db:rehearse supabase/migrations/<file>.sql`, and **do not apply**. DJ applies.
9. Don't commit unless DJ asks. If he does, commit only your own files: `git commit -m "..." -- <your paths>`.

## Checks

- `pnpm --filter @buildos/worker exec vitest run tests/agenticChatCalendarWritePort.test.ts tests/agenticChatCalendarReadPort.test.ts`
- `pnpm --filter @buildos/agentic-chat-runtime exec vitest run src/tools/calendar-reads.test.ts src/loop/`
- `pnpm --filter @buildos/shared-agent-ops exec vitest run src/calendar/ src/gateway/op-execution-gateway.calendar*`
- `pnpm --filter web exec vitest run src/lib/services/agentic-chat/tools/core/executors/ src/lib/services/calendar-service*`
- Packages are consumed through `dist`: after changing `@buildos/agentic-chat-runtime`, `@buildos/shared-agent-ops`, run `pnpm --filter <pkg> build` before typechecking or testing an app that imports it. If two agents build the same package at once and the build fails strangely, rerun it.
- `pnpm --filter @buildos/worker run typecheck`
- `pnpm --filter @buildos/worker run typecheck:tests`
- `pnpm --filter web run check` once at the end (heavy). If a local dev server is running, run `touch apps/web/vite.config.ts` afterwards; `check` deletes the dev proxy types and every page 500s until Vite restarts.
- `pnpm --filter web run typecheck:tests`
- Follow-up: `pnpm --filter @buildos/worker exec vitest run tests/agenticChatWorkerSurfaceBudget.test.ts` and `pnpm --filter web exec vitest run src/lib/services/agentic-chat-v2/tool-surface-size-report.test.ts src/lib/services/agentic-chat/tools/core/catalog-fitness.test.ts src/lib/services/agentic-chat/tools/core/executors/`

## Self-check before you report

- `git status --porcelain`: every file _you_ touched is in "Files you own" or is a new test next to one. Other agents' files will show up there too; leave them alone.
- Re-read your whole diff once as a skeptical reviewer. For each fix, name one more edge case and check it is handled or tested.
- Every regression test failed before its fix and passes now.
- Every command under "Checks" passed. Paste the pass counts.
- No new regex or keyword matching on user or model text. No paid calls. No migration applied.

## Report (reply to DJ with this, and update this file)

1. Each work item: `DONE`, `NOT A BUG`, `ALREADY FIXED`, `SKIPPED (why)` or `BLOCKED (why)`, with one line on what changed.
2. Files changed.
3. Commands run, with pass/fail counts, and confirmation that each regression test failed first.
4. Anything DJ must do: Optional paid live check (~$0.01): one chat calendar write against production. Needs DJ's OK.

Then in this file: tick each item, set **Status:** to `DONE — awaiting Claude check`, and add a dated line under "Log".

## Implementation report — 2026-10-18

Historical first-pass report. The follow-up report below resolves item 2 and replaces the neutral-skip behavior described here for item 6.

### Work items and skeptical review

| Item | Result  | Change and additional edge case checked                                                                                                                                                                                                                                                                                                                                                           |
| ---- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1    | DONE    | Google-id get/update/delete now require project access and the current user's project calendar source, pin that source, and reject mismatches. Missing source and mismatched caller source fail closed for all three operations.                                                                                                                                                                  |
| 2    | BLOCKED | Confirmed truncation is lost before the runtime receives worker results. Rule 2 requires stopping because the worker read port is not owned. No partial fix or claim of complete coverage correctness.                                                                                                                                                                                            |
| 3    | DONE    | Added `all_day` to create/update schemas and reviewed arguments. Date-only creates default to all-day, use an exclusive next-day end, and store local-midnight instants. Updates preserve all-day spans across DST; explicit `all_day:false` remains timed. Google-only updates reject the unsupported flag explicitly; changing the flag on a BuildOS event requires both bounds.                |
| 4    | DONE    | Persisted BuildOS events return `ok:true` while preserving Google sync failure/reconnect information; the existing receipt builder supplies `client_action`. The ledger also recognizes older saved reconnect receipts. Missing/unreadable saved rows remain uncertain; an argument ID alone cannot establish success.                                                                            |
| 5    | DONE    | Agent Run uses personal-event props mappings when there is no usable sync row. Google delete 404/410 is successful. Usable sync rows avoid duplicate provider writes; sync opt-out and other provider failures retain their behavior.                                                                                                                                                             |
| 6    | DONE    | Terminal skips write version-guarded `cancelled`/`failed` states. Stale live-event jobs enqueue the current version through the existing atomic queue deduplication key. A stale delete for a restored live event reconciles with an upsert; queue/status write failures propagate instead of silently completing.                                                                                |
| 7    | DONE    | Legacy CalendarService start-only moves preserve duration in both the Google payload and local tracking. UI inspection found TimeBlockDetailModal sends both bounds but EventEditModal can send only changed fields; the owned shared sync service now preserves timed/all-day duration there too. Explicit end values remain authoritative; all-day moves preserve calendar-day length over DST. |

### Files changed

- `apps/web/src/lib/services/agentic-chat/tools/core/executors/calendar-executor.ts`
- `apps/web/src/lib/services/agentic-chat/tools/core/executors/calendar-executor.event-id-routing.test.ts`
- `apps/web/src/lib/services/calendar-service.ts` (start-only move only)
- `apps/web/src/lib/services/calendar-service.move.test.ts` (new)
- `apps/worker/src/workers/agentic-chat/tools/calendar-write-port.ts`
- `apps/worker/tests/agenticChatCalendarWritePort.test.ts`
- `apps/worker/src/workers/agentic-chat/mutations/tool-catalog.ts` (two calendar argument rows only)
- `packages/agentic-chat-runtime/src/catalog/definitions/calendar.ts`
- `packages/agentic-chat-runtime/src/loop/write-ledger.ts` (calendar reconnect block only)
- `packages/agentic-chat-runtime/src/loop/write-ledger.calendar.test.ts` (new)
- `packages/shared-agent-ops/src/calendar/agent-run-calendar-port.ts`
- `packages/shared-agent-ops/src/calendar/agent-run-calendar-port.test.ts`
- `packages/shared-agent-ops/src/calendar/onto-event-sync.service.ts`
- `packages/shared-agent-ops/src/calendar/onto-event-sync.service.test.ts`
- `tasker/130-calendar-you-can-trust.md`

As required by Checks, touched `apps/web/vite.config.ts` after the web checks to restart the running local Vite server; no content edit. Other agents' changes were left alone.

### Validation

All commands below ran through `test-gate run`. The two trailing-wildcard test selectors use equivalent Vitest path-prefix filters to avoid shell expansion.

| Command                                                                                                                              | Final result                          |
| ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------- |
| `pnpm --filter @buildos/worker exec vitest run tests/agenticChatCalendarWritePort.test.ts tests/agenticChatCalendarReadPort.test.ts` | PASS: 2 files, 57 tests, 0 failures   |
| `pnpm --filter @buildos/agentic-chat-runtime exec vitest run src/tools/calendar-reads.test.ts src/loop/`                             | PASS: 32 files, 467 tests, 0 failures |
| `pnpm --filter @buildos/shared-agent-ops exec vitest run src/calendar/ src/gateway/op-execution-gateway.calendar`                    | PASS: 15 files, 171 tests, 0 failures |
| `pnpm --filter web exec vitest run src/lib/services/agentic-chat/tools/core/executors/ src/lib/services/calendar-service`            | PASS: 8 files, 49 tests, 0 failures   |
| `pnpm --filter @buildos/shared-agent-ops build`                                                                                      | PASS                                  |
| `pnpm --filter @buildos/agentic-chat-runtime build`                                                                                  | PASS                                  |
| `pnpm --filter @buildos/worker run typecheck`                                                                                        | PASS: 0 errors                        |
| `pnpm --filter @buildos/worker run typecheck:tests`                                                                                  | PASS: 0/0 errors, at baseline         |
| `pnpm --filter web run check`                                                                                                        | PASS: 0 errors, 0 warnings            |
| `pnpm --filter web run typecheck:tests`                                                                                              | PASS: 0/0 errors, at baseline         |

Final total: **57 test files, 744 tests passed, 0 failed**. Both packages were rebuilt before the final consuming-app tests/type checks. Final command logs are `/tmp/task130-*.log`.

Test-first evidence: observed each implemented bug's targeted regression fail before its fix and pass after. Initial red cases included nine project-fence cases; four worker all-day cases and two shared timezone cases; two persisted reconnect receipts and the old-receipt ledger case; four personal-mapping/delete cases; four sync-skip cases; and the legacy start-only move. Subsequent review also exposed and fixed failing regressions for Google-only all-day rejection, status-write failure, restored stale deletes, and the editor's two shared start-only cases. Control tests cover explicit ends, explicit timed events, uncertain receipts, and provider errors.

An early `test-gate` invocation with a quoted multiword `-t` filter lost the quoting and selected 26 worker test files, including an unrelated PostgreSQL test that failed its sandbox IPC preflight. That diagnostic run was not counted as passing. Removed the name filter; all final commands above used explicit file/path selectors and passed. No gate refusal or queued-run retry was needed.

Self-check complete: reviewed `git status --porcelain`, reread the owned diff and new tests, checked an additional edge case per fix, and passed scoped `git diff --check`. Official Svelte analysis of the inspected editor found no issues; no Svelte component was changed. No semantic regex/keyword classifier added (date-only validation uses structured ISO dates). No paid/live model calls, production writes, migrations, deploys, or commits.

### DJ follow-up

- Expand item 2 ownership to the worker calendar read port and its tests, then finish truncation propagation and coverage warnings end to end.
- Claude can review the six completed fixes now. Optional production chat calendar-write validation was **not run**; it needs DJ's explicit approval. The tracker estimate is unverified against the acting model's measured spend.

## Follow-up implementation report — 2026-10-18

DJ approved item 11's ownership expansion in Assignment B. Items 1 and 3–7 were preserved. Waited for tracker 132 item 9's declaration-build repair before runtime builds, and for item 10 before the final snapshot refresh. No heap limit was raised.

### Work items and skeptical review

| Item   | Result              | Change and additional edge case checked                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------ | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1      | DONE, preserved     | Project-scoped Google get/update/delete fence retained; mismatched or absent project calendar sources still fail closed.                                                                                                                                                                                                                                                                                                                                                |
| 2 / 11 | DONE                | Provider page tokens and sliced merged results carry `truncated` through shared services, worker, runtime, and web/MCP. Both source-aware and legacy reads report degraded coverage, partial results, `has_more:true`, and an explicit warning against inferring availability. Exact-cap reads without another page stay complete; at offset 299 no unusable next offset is returned.                                                                                   |
| 3      | DONE, preserved     | Worker all-day arguments and reviewed schema retained; DST and explicit timed-event tests still pass.                                                                                                                                                                                                                                                                                                                                                                   |
| 4      | DONE, preserved     | Saved BuildOS writes remain successful during reconnect; unreadable or missing receipt rows remain uncertain.                                                                                                                                                                                                                                                                                                                                                           |
| 5      | DONE, preserved     | Personal-event mapping fallback and idempotent Google 404/410 deletion retained; sync opt-out and real provider errors still behave as before.                                                                                                                                                                                                                                                                                                                          |
| 6      | DONE, refined by 10 | Terminal skips and stale-version requeue retained; legitimate no-connection/sync-off skips now use the neutral status below. Version and write-error guards remain tested.                                                                                                                                                                                                                                                                                              |
| 7      | DONE, preserved     | Start-only moves retain duration in CalendarService and shared sync; explicit end bounds and calendar-day spans across DST remain covered.                                                                                                                                                                                                                                                                                                                              |
| 8      | DONE                | Web/MCP creates and updates forward `allDay` and exclusive civil-date bounds. Missing or equal create ends become the next calendar day. Existing all-day start-only moves delegate span preservation to shared sync; explicit `false` stays timed, flag changes need both bounds, and Google-only flag updates fail explicitly.                                                                                                                                        |
| 9      | DONE                | Calendar descriptions shortened by 765 serialized characters from the failing follow-up baseline. Worker global is 54,782/55,050 and project is 72,172/72,460; web global is 61,197/61,530. No budget changed. Required source IDs, exclusive all-day ends, and scope rules remain described.                                                                                                                                                                           |
| 10     | DONE                | `calendar_not_connected` and unavailable/disabled project-calendar skips save `sync_status:'skipped'`, clear the error, and atomically exclude `synced` rows while matching the event version. Real provider failures remain failed. Read-only production catalog inspection confirmed both sync-status columns are unrestricted `text` without a check/enum constraint, so no migration is needed. The panel only warns for `failed`; no component edit was necessary. |
| 12     | DONE                | Ran catalog fitness once with `-u`, after items 8–11 and tracker 132 items 9–10. Reviewed the snapshot: only five calendar definitions, document `merge_llm`/`merge_instructions` removal, and derived sizes/hashes changed. Tool names, counts, ordering, and unrelated definitions stayed fixed. A subsequent ordinary run passed.                                                                                                                                    |

### Files changed in this follow-up

- `apps/web/src/lib/services/agentic-chat/tools/core/executors/calendar-executor.ts`
- `apps/web/src/lib/services/agentic-chat/tools/core/executors/calendar-executor.all-day.test.ts` (new)
- `apps/web/src/lib/services/agentic-chat/tools/core/executors/calendar-executor.multi-account.test.ts`
- `apps/web/src/lib/services/agentic-chat/tools/core/executors/calendar-datetime.ts`
- `apps/web/src/lib/services/agentic-chat/tools/core/executors/calendar-datetime.test.ts`
- `apps/web/src/lib/services/agentic-chat/tools/core/__snapshots__/catalog-fitness.test.ts.snap`
- `apps/worker/src/workers/agentic-chat/tools/calendar-read-port.ts`
- `apps/worker/tests/agenticChatCalendarReadPort.test.ts`
- `packages/agentic-chat-runtime/src/catalog/definitions/calendar.ts`
- `packages/agentic-chat-runtime/src/tools/calendar-reads.ts`
- `packages/agentic-chat-runtime/src/tools/calendar-reads.test.ts`
- `packages/agentic-chat-runtime/src/tools/external-ports.ts`
- `packages/shared-agent-ops/src/calendar/agent-run-calendar-port.ts`
- `packages/shared-agent-ops/src/calendar/agent-run-calendar-port.test.ts`
- `packages/shared-agent-ops/src/calendar/google-calendar-read.service.ts`
- `packages/shared-agent-ops/src/calendar/google-calendar-read.service.test.ts`
- `packages/shared-agent-ops/src/calendar/onto-event-sync.service.ts`
- `packages/shared-agent-ops/src/calendar/onto-event-sync.service.test.ts`
- `tasker/130-calendar-you-can-trust.md`

The first-pass file list above is preserved. As required, touched `apps/web/vite.config.ts` after web checking to restart the running local Vite server, without changing its content. Budget test files and CalendarItemPanel were inspected but not edited.

### Final validation

All heavy commands ran sequentially through `test-gate run`. Combined the budget/catalog tests with the required worker/web selectors to avoid extra processes. The trailing-wildcard selectors use equivalent Vitest path prefixes.

| Command                                                                                                                                                                                                                                                      | Result                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- |
| `pnpm --filter @buildos/shared-agent-ops build`                                                                                                                                                                                                              | PASS                                                        |
| `pnpm --filter @buildos/agentic-chat-runtime build`                                                                                                                                                                                                          | PASS, including declarations at the existing memory limit   |
| `pnpm --filter web exec vitest run src/lib/services/agentic-chat/tools/core/catalog-fitness.test.ts -u`                                                                                                                                                      | PASS: 1 file, 6 tests; 1 snapshot updated, one refresh only |
| `pnpm --filter @buildos/worker exec vitest run tests/agenticChatCalendarWritePort.test.ts tests/agenticChatCalendarReadPort.test.ts tests/agenticChatWorkerSurfaceBudget.test.ts`                                                                            | PASS: 3 files, 68 tests, 0 failed                           |
| `pnpm --filter @buildos/agentic-chat-runtime exec vitest run src/tools/calendar-reads.test.ts src/loop/`                                                                                                                                                     | PASS: 32 files, 469 tests, 0 failed                         |
| `pnpm --filter @buildos/shared-agent-ops exec vitest run src/calendar/ src/gateway/op-execution-gateway.calendar`                                                                                                                                            | PASS: 15 files, 177 tests, 0 failed                         |
| `pnpm --filter web exec vitest run src/lib/services/agentic-chat/tools/core/executors/ src/lib/services/calendar-service src/lib/services/agentic-chat-v2/tool-surface-size-report.test.ts src/lib/services/agentic-chat/tools/core/catalog-fitness.test.ts` | PASS: 11 files, 75 tests, 0 failed                          |
| `pnpm --filter @buildos/worker run typecheck`                                                                                                                                                                                                                | PASS: 0 errors                                              |
| `pnpm --filter @buildos/worker run typecheck:tests`                                                                                                                                                                                                          | PASS: 0/0 errors, at baseline                               |
| `pnpm --filter web run check`                                                                                                                                                                                                                                | PASS: 0 errors, 0 warnings; ran once at the end             |
| `pnpm --filter web run typecheck:tests`                                                                                                                                                                                                                      | PASS: 0/0 errors, at baseline                               |

Final test total, excluding the duplicate snapshot-refresh run: **61 files, 789 tests passed, 0 failed**. Packages were rebuilt before final app checks. Logs are `/tmp/task130b-*.log`.

Test-first evidence: observed 12 all-day/date-normalization failures, both size-budget failures, four neutral-status failures, three shared source-truncation failures, two runtime-truncation failures, one legacy-page-token failure, two worker-propagation failures, and two web/MCP-propagation failures before their fixes. All pass now. Initial legacy test setup was corrected to reach the mocked Google page before recording its meaningful red result. Exact-output fixtures were updated for the added `truncated:false` field after new regression cases passed; those intermediate failures are not counted as passes. Targeted green runs covered all-day 19/19, sync 49/49, shared readers 38/38, runtime reads 41/41, worker reads 29/29, and web multi-account 15/15 before the final groups above.

Some targeted runs queued behind other sessions and were automatically admitted by the gate; paused further heavy work for at least 60 seconds after observed queues. No refusal or timeout required a retry. Final checks respected the gate and worker caps.

Re-read the owned diff and new tests, checked the additional edge cases above, reviewed `git status --porcelain`, and passed scoped `git diff --check`. Only owned files and the explicitly authorized additions were edited; other agents' changes were preserved. Official Svelte analysis of the inspected panel condition reported no issues. No language classification regex was added; date checks validate structured ISO values. No paid/live model calls, production writes, migrations, deploys, or commits.

### DJ follow-up

- Claude can review the completed follow-up. No ownership approval or migration application is needed.
- Optional production chat calendar-write validation was **not run**. It requires DJ's explicit approval; the tracker's ~$0.01 figure is unverified against the acting model's measured spend.

## Blocked

- None. DJ approved ownership of the worker calendar read port and its tests for item 11; original item 2 is implemented end to end.

## Log

- 2026-10-18: Codex completed follow-up items 8–12 and original item 2 with DJ's approved read-port expansion, preserving checked items 1 and 3–7. Waited for tracker 132 items 9–10, refreshed catalog fitness once last, and reviewed only intended calendar/merge-field snapshot changes. Final checks: 789/789 tests across 61 files, both package builds, worker/web source and test type checks passed. Tool budgets pass unchanged; self-check complete. Set DONE — awaiting Claude check. No commit, migration, deployment, or paid/live validation.
- 2026-10-18: Codex completed items 1 and 3–7, recorded item 2 as BLOCKED under Rule 2, and finished the self-check. Final checks: 744/744 tests, both package builds, worker/web source and test type checks passed. Set DONE — awaiting Claude check with the blocked item explicitly retained; no commit or live/paid validation.
- 2026-10-18: created from the code triage (Claude).
- 2026-10-18 (Claude light check of 126–135): items 1 and 3–7 pass review; the security fence is done. Reopened with items 8–12: all-day through the web/MCP executor, two size budgets over, neutral status for users without Google, item 2 pending DJ, and the snapshot.
- 2026-10-18 (Claude check of the follow-ups): items 8–12 pass.
    - All-day events now pass through the web/MCP executor, and end == start becomes one day. A date-only start with no `all_day` now becomes an all-day event (structural; fine).
    - Truncation now sets `has_more` and warns "don't infer availability".
    - The new `skipped` status is valid: `onto_events.sync_status` is text with no check constraint, checked against the production schema. A skip never overwrites `synced`.
    - Both size budgets pass, and the snapshot was regenerated.
    - Minor: the project calendar settings modal labels unknown statuses "Pending".
