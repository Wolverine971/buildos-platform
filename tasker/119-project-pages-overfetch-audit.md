<!-- tasker/119-project-pages-overfetch-audit.md -->

# 119 — Project pages: cut the queries the new reader UI no longer needs

**Status:** AWAITING DJ · **Priority:** P2 · **Opened:** 2026-10-05 · **Owner:** DJ (an agent is executing)

**Why:** On 10-05 the project page, the doc page and the task page moved to the Projects card's
reader (`ReaderPanes`; see `docs/specs/PROJECTS_DESKTOP_PLAN_2026-10-01.md` and memory
"Project Page Reader 2026-10-05"). Docs and tasks now open in a side reader, not modals. The
doc and task pages are the reader at full width, beside a rail. The data these pages load was
designed for the old UI. The pages are fast today, but some reads probably feed nothing anymore,
and some reads happen twice. DJ: "identify it and then fix it."

## Scope (surfaces, every state)

| Surface                                                                  | Code                                                                                                                                                                                                    |
| ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/projects/[id]`: Overview, Tasks (board + folded list), Docs, Activity  | `routes/projects/[id]/+page.server.ts` (skeleton RPC + streamed `get_project_full_v2_initial`), `ProjectWorkspace.svelte`, `project-page-data-controller.ts`, `ProjectDocumentsSection` / `DocTreeView` |
| The reader on any surface (doc, task or goal open; chat open)            | `lib/components/projects/desktop/ReaderPanes.svelte`, `DesktopReader.svelte`, `entity-modal-data.ts`                                                                                                    |
| `/projects/[id]/documents/[id]` and `/tasks/[id]`                        | `lib/server/projects/project-item-page.ts`, `ProjectItemPage.svelte`, `GET /api/onto/projects/[id]/card`                                                                                                |
| `/projects` (card + reader), only as far as the shared reader touches it | `ProjectDesktop.svelte`, `DesktopProjectCard.svelte`                                                                                                                                                    |

## Leads to confirm or kill (from a quick read; not yet verified)

1. **Full initial payload vs. what renders.** `get_project_full_v2_initial` fills `documents`,
   `events`, plans, milestones, risks and more. With the reader, doc bodies come from `/full` per
   item and the Docs tab uses the doc tree. Check every field in the RPC's payload for a reader in
   the workspace. Drop or narrow fields with none, such as doc `content` and event windows Overview
   never shows.
2. **The doc tree polls every 30 s** (`pollInterval={30000}`), even on Overview or Tasks, and even
   while the tab is hidden. Mutation events already refresh it. Is the poll still needed? At least
   stop it when the tab or the Docs view is hidden.
3. **The reader reads twice after its own change.** A task state change calls `onChanged` →
   `refreshEntity` → `dataMutationEvents` → the workspace bumps `readerReload` → the reader re-reads
   the task, and its task docs, that it just wrote. Skip the reload for the reader's own writes.
4. **"Docs for this task"** (added 10-05) makes a `/api/onto/tasks/[id]/documents` read on every task
   opened. Could `/full` return the linked docs (or a count) in the same read? Or load the list only
   when someone looks at it?
5. **The item page refetches on every window focus** (`ProjectItemPage.svelte`: reader reload + the
   whole card). Throttle it (only after N minutes away), or rely on mutation events.
6. **Endpoints the old pages used that may now be dead:**
    - `GET /api/onto/projects/[id]` (the heavy one; now only the item page's archived-project fallback);
    - `/api/onto/projects/[id]/events?limit=1000`;
    - `/api/onto/edges/linked` (still used by `LinkedEntities`?);
    - `/api/onto/documents/[id]/full` and `/api/onto/tasks/[id]/full` callers that pass no `include_linked`.

    Find every caller across the monorepo (`apps/web`, `apps/worker`, `packages/*`, including the MCP
    server and the agent tools) before calling anything dead.

7. **Duplicate reads on one page load.** Look for:
    - family, freshness and start-here reads fired by both the loader and an `onMount`;
    - `prepareEntityModalData` handoffs that miss, so the reader reads again;
    - two components reading the same endpoint.
8. **RPC bodies.** For each RPC these pages call (`get_project_skeleton*`, `get_project_full_v2_initial`,
   `current_actor_has_project_member_access`, `get_project_route_access_state`, doc-tree, card
   snapshot), look for joins or subqueries whose output nothing reads now.

## Method

1. **Inventory before changing anything.** For each surface and state, list every network request
   and RPC: endpoint, caller, bytes, ms, and which UI piece reads each field. Measure on DJ's real
   9takes project (`05c40ed8-9dbe-4893-bd64-8aeec90eab40`) through the local web dev server
   (`:5181`, signed in as DJ in Chrome). Use `fetch()` from the page for bytes and ms, and the
   network panel or `read_network_requests` for the request list. These are read-only GETs. Local
   dev reads the production database, so **never write**.
2. **Trace each field to a consumer** (grep the component tree). No consumer means drop it. A
   consumer only in a closed or rare state means load it lazily.
3. **Fix the clear wins** in code with tests. Keep behavior identical: the same UI, the same
   refresh-after-mutation behavior, the same access errors.
4. **Re-measure** and record before → after below.

## Rules for the executing agent

- **No paid tests.** No chat messages sent, no model calls, no `agentic:prod-battery`.
- **No production writes** (local dev uses the prod DB). Reads only.
- **RPC / SQL changes:** write a new migration file and never edit an existing one. Rehearse it with
  `pnpm db:rehearse supabase/migrations/<file>.sql` (free). Do **not** apply it to production. List it
  under "Awaiting DJ" with the rehearsal result. If a payload shrink needs an RPC change, make the
  web code tolerate both the old and the new payload, so either deploy order is safe.
- **Dead endpoints:** delete a web route only when nothing in the monorepo calls it **and** it is not
  part of the public or agent API (`/api/agent*`, `/api/mcp*`, `/api/v1*`, anything an MCP tool or
  the worker could hit). Otherwise list it here.
- **Validation:** run narrow vitest files (`pnpm --filter web exec vitest run <files>`) and
  `pnpm --filter web check`. Heavy runs go through `test-gate`. After `check`, run
  `touch apps/web/vite.config.ts`, because svelte-check knocks out the dev server's proxy types.
  Never fan out parallel suites.
- **Don't commit.** DJ commits. Other sessions have uncommitted work in this tree, so touch only the
  files this tracker needs.
- Finish by re-checking the surfaces in the browser:
    - desktop: Docs reader, Tasks fold, the doc and task pages, Esc / J / K;
    - phone: a 500px popup, checked through the DOM.

## Exit

Every lead is confirmed and fixed, or killed with a reason. The before → after table is filled in.
Tests and `check` are green. Browser re-check passes. Anything needing DJ (migrations, deleting a
public endpoint) sits under "Awaiting DJ". Then move the results into
`docs/specs/PROJECTS_DESKTOP_PLAN_2026-10-01.md` (a "Data diet" note) and delete this tracker.

## Findings (agent fills in)

Measured 2026-10-05 on 9takes (44 tasks) through local dev (`:5176`) against the production
database, with `fetch()` from the page. Times swing ±0.5 s run to run on this path, so the table
claims bytes and request counts only, except where the change is large.

### Request inventory, before → after

| Surface / state                           | Request                                       | Before                       | After                     | Change                                                                                                    |
| ----------------------------------------- | --------------------------------------------- | ---------------------------- | ------------------------- | --------------------------------------------------------------------------------------------------------- |
| Project page load (all tabs)              | `full?profile=v2-initial`                     | 98.3 KB                      | 73.7 KB                   | Task descriptions 29.2 → 5.6 KB: the board shows one line and none for done tasks                         |
| Project page load                         | START HERE doc `GET /api/onto/documents/[id]` | 62.2 KB                      | 32.6 KB                   | `search_vector` (29.7 KB) no longer sent                                                                  |
| Open a doc in the reader                  | `documents/[id]/full`                         | 8.4 KB, 3.6 KB of it index   | index gone                | `search_vector` dropped (no detail payload contains it now; checked doc/task/goal)                        |
| Open a task in the reader                 | `tasks/[id]/full` + `tasks/[id]/documents`    | 2 requests (5 KB + 0.1 KB)   | 1 request (4.0 KB)        | The doc list rides in `/full` (`include_task_documents=true`); the second ~0.8 s read is gone             |
| Open a goal in the reader                 | `goals/[id]/full`                             | 3.4 KB                       | 2.9 KB                    | `search_vector` dropped                                                                                   |
| Task page `/projects/[id]/tasks/[id]`     | server item read + client docs read           | item + 1 client `/documents` | item only, 0 client reads | Docs list comes with the server load                                                                      |
| Doc editor (`DocumentModal`) access check | `GET /api/onto/projects/[id]`                 | 627.9 KB · ~2 s              | 0.1 KB · ~0.8 s           | `?view=access` returns `{ id, name }` after the same access checks                                        |
| Item page, archived-project fallback      | `GET /api/onto/projects/[id]`                 | 627.9 KB · ~2 s              | 0.1 KB                    | Same `?view=access`                                                                                       |
| Alt-tab back (< 60 s away)                | Workspace: START HERE; item page: item + card | 62 KB; item + 28.6 KB card   | 0 requests                | Refresh only after ≥ 60 s away (`onReturnAfterAway`)                                                      |
| Reader's own change (workspace)           | the open item's `/full`                       | read twice                   | read once                 | The workspace skips its reload for the reader's own notify (unit-tested; not live, writes are off-limits) |

### Leads

1. **Full initial payload: FIXED (part).** Task descriptions went out whole for every task, done
   ones included. The board shows them `line-clamp-1` and none for done tasks
   (`TaskKanbanBoard.svelte:937-941`). `toBoardTask` (`project-full-api-helpers.ts`) now cuts them
   to 240 characters and sends none for done tasks. Kept: doc descriptions (small), `doc_structure`
   and `events` (Docs tree and Activity read them), `context_document` (START HERE card).
2. **Doc tree polling: KILLED.** It runs only on the Docs tab, only while the page is visible, with
   `include_documents=false` (`DocTreeView.svelte:722-770`). It catches changes made elsewhere,
   such as agents and other devices, that mutation events never see.
3. **Reader reads twice after its own change: FIXED in the workspace.** `readerAnnouncing` in
   `ProjectWorkspace.svelte` skips the `readerReload` bump while the reader's own change is being
   announced. The `/projects` card was already fine. Chat's live updates and its close-time notify
   fire at different times, so they are not a duplicate.
4. **Task docs request: FIXED.** `/api/onto/tasks/[id]/full?include_task_documents=true` returns
   `task_documents` (id, title, state, type) from `lib/server/task-document-summaries.ts`, in the same
   `Promise.all` as linked entities and assignees. A failure there still returns the task. The task
   workspace keeps `/tasks/[id]/documents` (it needs whole bodies).
5. **Focus refetch: FIXED** on the item page and on the workspace's START HERE read. The new
   `lib/utils/return-refresh.ts` fires only after ≥ 60 s away (blur or tab hidden, then back).
6. **Dead endpoints: none deleted.**
    - `GET /api/onto/projects/[id]`: no in-app GET caller left apart from `?view=access`. Its
      DELETE and PATCH are live. See Awaiting DJ.
    - `projects/[id]/events`: alive. It serves mutation refresh (`project-mutation-refresh.ts:182`)
      and TaskEditModal. Nothing calls it with `limit=1000`.
    - `edges/linked`: alive, used by `linked-entities.service.ts:200`.
    - `/full` without `include_linked`: TaskEditModal and DocumentModal still want linked entities.
7. **Duplicate reads on load: mostly KILLED.**
    - Family and the `prepareEntityModalData` handoff each read once.
    - The skeleton's `counts` are always zero and nothing reads them. That is dead plumbing with no
      query cost, so it was left alone.
    - `/api/agent-runs?limit=25&view=summary` fires twice on every page load, from the app shell. It
      is out of scope; see Awaiting DJ.
8. **RPC bodies: PROPOSED, not written.** `get_project_full_v2_initial` still builds every task's
   whole description in SQL (`classified_tasks`, migration `20260904000000`). The trim now happens
   at the endpoint, so the browser gets the saving but the database and the network hop to Vercel
   don't. See Awaiting DJ.

**Also:** `loadReadableOntologyDetailRow` (`packages/agentic-chat-runtime`) now strips
`search_vector` for every detail GET: documents, tasks, goals, plans, milestones and risks. The
doc, task and goal `/full` routes select explicit columns from `lib/server/onto-detail-columns.ts`.
A compile-time check there fails `check` when a table gains a column the list doesn't name.

**Tests:**

- 17 web test files / 101 tests: project `/full`, workspace, item pages, reader, entity-modal-data,
  return-refresh.
- New: `task-document-summaries.test.ts` (2) and `tasks/[id]/full/server.test.ts` (3).
- `agentic-chat-runtime` detail reads: 9/9.
- `pnpm --filter web check`: 0 errors, 0 warnings.

**Browser, desktop:**

- Docs reader opens with one `/full` request.
- Tasks: click and J each made one `/full` request.
- The task page lists its doc with no client read.
- A doc list matches the old `/documents` endpoint.
- A quick blur/focus made 0 requests.

**Not verified:** the 500px phone check. Chrome blocked the popup twice. No layout code changed,
only data plumbing and one template field rename in `DesktopReader`.

### Awaiting DJ

- **SQL trim of task descriptions** in `get_project_full_v2_initial`: same cut as `toBoardTask`, in a
  new migration. It would save database work and the server hop. The endpoint trim already covers
  the browser, so either deploy order is safe. Not written; worth it only if the RPC shows up as slow.
- **The heavy `GET /api/onto/projects/[id]`** (628 KB, ~2 s): nothing in the app reads the full
  version now. The options are to slim it to what an outside caller would plausibly need, or leave
  it. It is not under `/api/agent*`, `/api/mcp*` or `/api/v1*`, but it is a guessable public URL.
- **`/api/agent-runs` twice on every page load** (app shell, not these pages). This is a separate
  small fix.
- **Deploy note:** the `search_vector` strip in `packages/agentic-chat-runtime` takes effect in prod
  through the normal build (dev resolves `src`). The web routes' explicit columns cover doc, task and
  goal `/full` either way.
- **500px phone re-check** of the reader sheet (popup blocked here).
- On sign-off, move this into the spec's "Data diet" note and delete the tracker (Exit).
