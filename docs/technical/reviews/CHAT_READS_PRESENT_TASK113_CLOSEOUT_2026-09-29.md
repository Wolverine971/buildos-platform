<!-- docs/technical/reviews/CHAT_READS_PRESENT_TASK113_CLOSEOUT_2026-09-29.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-09-29; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Task 113: Chat reads the present, not the archive (closeout)

**Opened and closed:** 2026-09-29. DJ closed it after a live replay passed.
**Disposition:** The bug DJ reported is fixed and verified in production: chat called archived
tasks live work. The migrations are applied and recorded, the code shipped in `14c020589` and
`6b6970605`, and a paid replay passed. DJ decided not to build the strict archive gate or the
"hide old finished work" default (see Decisions). The tracker was deleted under the tasker
maintenance rule, and its leftovers are listed at the end.

## What DJ saw

On the Wayne Strategies project (`f85b6c5f-59fb-4e4c-8654-748f793d8f4b`), DJ asked chat to "clean
up this project". Chat reported 16 archived tasks as "still todo, ~200 days past due". Told they
had been archived in July, it admitted the mistake, then called 4 more archived tasks "genuinely
live" in the same reply. DJ's ask: chat should work from present, future and backlog work, and
read the archive only when he asks for it.

## Root cause (verified on prod)

- **The chat context packet was the main leak, more than the list tools.**
    - `load_fastchat_context`, the project context every project chat turn starts from, filtered
      only `deleted_at`.
    - Its task ordering puts overdue work first, so archived `todo` tasks with March–June due dates
      took every slot.
    - Called against prod for f85b6c5f, **18 of 18 injected tasks were archived**, and none of the
      10 real open tasks made the cut.
    - The model's "live" claims in the follow-up reply were rows #1 and #12–13 of that packet.
- **The same gap existed elsewhere:**
    - `build_fastchat_project_intelligence`, the "overdue / due soon" digest.
    - Both search RPCs (`onto_search_entities`, `onto_search_semantic`).
    - The chat graph and document tree, and the checkpoint capture sweep, which writes titles into
      START HERE.
- **"Archived" was stored three different ways:**

    | How it was archived                                     | What it wrote                              | Readers that saw it                         |
    | ------------------------------------------------------- | ------------------------------------------ | ------------------------------------------- |
    | Task archived on the board (canonical since tasker 103) | `deleted_at` + `archived_at`               | None                                        |
    | Connector `update_onto_* {archived: true}`              | `archived_at` only                         | Every reader that filters only `deleted_at` |
    | Document archived from the tree                         | `state_key='archived'`, `archived_at` NULL | Readers that filter only `archived_at`      |

    Before the fix, prod held 34 connector-archived tasks, all on f85b6c5f (archived 2026-07-02).
    4 of the 9 archived documents still sat in their project's `doc_structure`.

- **Two amplifiers:**
    - The model opted into `archived: true` reads on its own: 9 calls in 30 days, all in DJ's
      cleanup sessions, none requested.
    - The archived-row marker was dropped by `compactTaskListPayload`.

## What shipped

**Data model: one meaning of "archived".**

- **Connector:** a task archive now sets `deleted_at` together with `archived_at`, as the board
  does.
    - Restore clears both, and never brings back a task that was deleted but not archived.
    - The connector's archive read (`applyArchivedFilter(..., 'task')`) finds archived tasks
      whatever their `deleted_at`.
    - Code: `packages/shared-agent-ops/src/gateway/op-execution-gateway.{tasks,normalization,search}.ts`.
- **`20260929150100_canonical_connector_task_archive.sql`:** backfilled the 34 half-archived tasks
  (`deleted_at = archived_at`). Their 26 calendar events were left alone, because deleting them
  would have pushed deletes to Google Calendar.

**SQL readers: `20260929150000_chat_reads_exclude_archived.sql`.**

- **Functions changed:**
    - `load_fastchat_context`: the global, project and focus-linked branches, plus events.
    - `build_fastchat_project_intelligence`.
    - `onto_search_entities` and `onto_search_semantic`.
- **Rules:**
    - A row is current when `deleted_at IS NULL AND archived_at IS NULL`.
    - A document also needs `state_key <> 'archived'`.
    - Events owned by an archived or deleted task are excluded.
    - The record a chat is opened on still loads, carrying `archived_at`, because opening it is the
      user's explicit choice.
- **How it was built:** from prod's live `pg_get_functiondef`, with count-asserted edits. The
  mirrors in `packages/shared-types/src/functions/` are updated.

**Chat code.**

- **`packages/agentic-chat-runtime/src/tools/record-scope.ts`:** `currentRecordsOnly` and
  `isArchivedOrDeletedRecord` cover all three archive forms.
- **Search:** the keyword-matched `archived` bucket is gone. The word "archived" in a query no
  longer opens the archive.
- **Chat `get_document_tree`:** drops archived nodes, lifts their live children to the archived
  node's place, and says "N archived documents are hidden".
- **Chat `get_onto_project_graph`:** drops archived records and every edge that reaches them.
  The web graph and tree routes are unchanged.
- **Task detail and `list_task_documents`:** chat reads current links only. The web task modal
  keeps its view.
- **Other readers:** the context finder, the context-loader fallback, the checkpoint capture sweep
  (`apps/worker/src/workers/chat/checkpoint/supabaseCheckpointPorts.ts`) and the email-scan
  project brief all skip archived records.
- **Explicit archive reads:**
    - An `archived: true` list or search marks each row `archived: true` and says "These are
      ARCHIVED records, not active work" in the message. Compaction keeps the row flag.
    - Task archive reads ignore `deleted_at` (`6b6970605`), so "were these archived?" finds
      board-shaped archives.
- **`FASTCHAT_CONTEXT_CACHE_VERSION`** 5 → 6.

**Standing guard.**

- `supabase/tests/archived_scope_guard.check.sql` seeds one project with live, finished and
  archived rows in all three forms, plus embeddings.
- It checks 7 modes: the project, global and focus packet; the project and global digest; keyword
  search; and semantic search. It fails if any archived id comes back, and also if a live kind
  goes missing.
- **It failed on prod's pre-fix functions (the project packet leaked 7 of 9 archived ids) and
  passes on prod now.**
- `scripts/migration-rehearsal/rehearse.py` runs it on every production rehearsal
  (`DEFAULT_CHECKS`; `--no-default-checks` skips it). A later migration that drops the filter fails
  rehearsal before it reaches prod.

## Verification

- **Rehearsal:** both migrations passed `pnpm db:rehearse` against prod's schema with no security
  findings.
- **Prod apply** (DJ OK; one file at a time; recorded with `migration repair`):
    - The before-hashes of all four functions matched the rehearsal snapshot. The after-hashes
      matched the rehearsal output. Grants were unchanged.
    - The live f85b6c5f packet went from **18/18 archived to 0/18**, with the 10 open tasks first.
    - Keyword search for referral, Julian, Rebecca and newsletter returned 0 archived tasks.
    - The digest held 0 archived ids.
    - The backfill changed exactly the 34 baseline tasks (the id md5 matched). 0 half-archived
      tasks remain in prod.
    - The tasks' statement-level `trg_agentic_chat_context_invalidation_upd` trigger invalidated
      the project's chat context cache.
- **Free tests:**
    - Connector: 6.
    - Runtime: 81 for record scope, search, structure, task detail, task documents, the context
      finder and the context loader, plus 57 for list reads and compaction.
    - Worker email-scan: 17. Web cache: 16. Rehearsal tool: 17.
    - The runtime, worker and shared-agent-ops typechecks are green.
- **Paid replay** (DJ approved; deployed `6b6970605`; fresh session `eaabc827`;
  `deepseek/deepseek-v4.1-flash`; **$0.144**). The ws01–ws03 messages were replayed verbatim:
    - ws01 "clean up, what's out of date?": "10 open tasks, 0 overdue". Every flagged item is a live
      record. The original run said 16 archived tasks were ~200 days overdue.
    - ws02 "anything else out of date?": it mentions the old content tasks only as "already exist
      but are **archived** (July)".
    - ws03 "double-check they were archived in July": "Your archive hunch: confirmed". It lists
      every podcaster, iCode and government task as archived, and correctly keeps "Email Jinal" as
      the one live government-adjacent task.
    - No writes in any turn. Acting cost was $0.137, against $0.199 for the original three turns.

## Adversarial review

Before the build, two independent reviewers attacked the plan. Both said "works, with fixes".
Adopted from their findings:

- The digest function was missed. So were the global and focus packet branches and the
  keyword-matched `archived` search bucket.
- The connector's own archive read would have gone blank after the writer change.
- The two document archive forms, and live "Due:" events of archived tasks.
- A context-cache bump was needed.
- A mocked guard can't see SQL. Hence the rehearsal guard, which runs real SQL.
- The repeated lists come from state-splitting, not from missing rows.
- An opening-pass Jev gate alone leaks, because the gate and repair passes rebuild the full tool
  surface.

## Decisions (DJ, 2026-09-29)

- **No strict archive gate:** a separate `list_archived_records` tool admitted only by a Jev
  intent check.
    - With rows marked, a stray archive read costs tokens but no longer produces a wrong answer. In
      the replay, ws01's cost about 1% of tool output.
    - Reads can also help. ws02's "what would keeping it involve?" was answered truthfully by "its
      tasks exist but are archived".
    - A strict gate would add a new failure mode, a false "not found", whenever Jev misjudges the
      message or times out.
    - Revisit if the monitoring query below shows stray reads growing.
- **No "hide old finished work" default:** list reads keep returning finished records.
    - ws01 used old completed tasks to find real cleanup, such as stale "pending Rod's compliance
      review" text on closed tasks.
    - Archived rows, not finished ones, caused the bug.

## Leftovers

- **Repeated state-split task lists:** moved to
  [109](../../../tasker/109-agentic-chat-session-spend.md), next step 5.
- **Optional polish, untracked, about an hour, free:**
    - Reword the `archived` parameter ("only when the user asks about archived records, or when the
      answer depends on whether something was already archived; default lists already exclude
      them"), in `packages/agentic-chat-runtime/src/catalog/definitions/ontology-read.ts`.
    - Put `archived_at` on archive-read rows and keep it through compaction. ws03 could not confirm
      "back in July" from the rows.
- **Known debt, untracked:** the remaining keyword buckets in `ontology-search-ranking.ts`
  (overdue, done, blocked…) still classify query text by keywords, which breaks AGENTS.md's regex
  rule.
- **Text written earlier can't be fixed by filtering reads.** The history of session `916e340c`
  still holds the false claims; use a fresh session. The "Tacemus — START HERE" document (last
  refreshed 2026-07-01) still describes archived work. Tasker 112's project cleanup covers stale
  documents.
- **Monitoring query:** unprompted archive reads in the last two weeks. Judge whether each read
  was requested from the turn's user message.

    ```sql
    select e.created_at::date, e.tool_name, e.session_id
    from chat_tool_executions e
    where (e.arguments ->> 'archived') = 'true' and e.created_at > now() - interval '14 days'
    order by 1 desc;
    ```

- **Adding a chat reader of project records:** scope it with `record-scope.ts`, or select
  `archived_at` and mark archived rows. For SQL functions, the rehearsal guard enforces this.
