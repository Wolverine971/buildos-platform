<!-- docs/specs/PROJECTS_DESKTOP_PLAN_2026-10-01.md -->

<!-- doc-status: built -->

# Projects desktop: plan

Status: **built (2026-10-01), all three phases, local and not pushed.** DJ approved the prototype
("looks amazing, lets do it"). Clickable prototype with DJ's real projects (private):
<https://claude.ai/artifact/RV3MEXTUKYjC3EiVMiXiG1>. See [Build status](#build-status-2026-10-01).

Related: [PROJECT_HIERARCHY_2026-09-30.md](../architecture/PROJECT_HIERARCHY_2026-09-30.md) (the
nesting, shared-shelf and move backend this page drives).

## The vision (DJ, 2026-10-01)

Today a project goes inside another only through the child's ⋯ menu → "Move under…", one project
at a time. DJ wants the Projects page to work like a computer desktop:

- Projects are **compact**: just the name. Hovering shows a little more: the next step and the
  description.
- You **drag projects into other projects** with a quick confirm, and **drag them back out**. You
  can see which projects are inside which.
- **Opening a project expands its card to take the whole space**, like the old mobile command
  center (deleted 2026-08-26 in `094760094`: `MobileCommandCenter` / `CommandCenterPanel`,
  compact 56px tiles that expanded to full width while the others wrapped). Collapsing shrinks it
  back.
- The open card has **tabs**: nested projects, documents, tasks and goals. Documents can be
  expanded to show the docs inside them.
- From the Docs tab you can **drag a document into another project**, with the same quick
  confirm.

## Settled forks (DJ's picks)

| Fork                                  | Pick                                                                                                                                                                         |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop look                          | **Icon grid.** Each project is a tile with its name under it. Parents look like folders with an "N inside" badge, and their children live inside rather than on the desktop. |
| Where the others go when a card opens | **The card fills the space and the others dock.** The rest of the projects shrink into a slim dock on the right (a bottom strip on phones) and stay drop targets.            |
| Arrangement                           | **Auto-sorted.** BuildOS keeps the order (Recent, or By activity); dragging only nests, un-nests or moves things. No saved positions.                                        |
| Tile colors (added later that day)    | **Color = pulse, bars = amounts.** See [Tile colors and bars](#tile-colors-and-bars-v2-2026-10-01).                                                                          |

## Decisions made for DJ (vetoable)

- **Monogram tiles.** Generated project icons are switched off app-wide
  (`PROJECT_ICON_DISPLAY_ENABLED = false` in `ProjectIcon.svelte`), and only 4 of DJ's 46
  projects have one. Each tile shows two letters in Plex Mono with a printed halftone. The first
  build inked tiles by type family with a status dot; v2 replaced both with the pulse color (see
  below). If the icons are turned back on later, they replace the monogram.
- **Folder tiles** get a folder tab. Children appear on the desktop only in search results,
  labeled "in Wayne Strategies".
- **Every drop asks first, then offers Undo.** The confirm is a small popover anchored to the
  drop target (a bottom sheet on phones). Enter moves and Esc cancels. A toast with Undo follows.
- **Rule violations explain themselves while you drag.** The ghost under the pointer says why a
  target refuses: "Wayne Strategies holds projects, so it stays on the desktop" or "Redline is
  inside Wayne Strategies. Projects nest one level deep." The target dims.
- **Dock.** It lists top-level projects, with a Desktop slot first for taking a project out.
  Holding a dragged item over a folder for 650ms **springs it open** to show its sub-projects, so
  docs and tasks can go straight into a child. A chevron on the folder does the same without a
  drag.
- **Card tabs.**
    - Tabs: Inside (top-level projects only, since children can't hold projects), Docs, Tasks,
      Goals.
    - It opens on Inside when the project has children, otherwise on Docs.
    - A child's card has a **Take out of {parent}** button and a breadcrumb back to the parent.
    - Dragging a project from the dock into an open card puts it inside that project.
- **What moves:**
    - Projects (nest, un-nest, re-parent), docs (with their nested docs) and undated tasks.
    - **Dated tasks show a lock** while `calendar_sync_ready` is off. **Goals don't move** (no
      backend yet).
- **No-drag path for every drag.** Each row has a Move button, the desktop has a right-click
  menu, and keyboard users press M on a focused item. All three open a "Move to…" list with the
  same rules and confirm. This also covers phones.
- **Phones:**
    - Press and hold (about 360ms) picks an item up; a tap opens it. The 9px move tolerance keeps
      scrolling working.
    - The dock becomes a bottom strip and the confirm becomes a bottom sheet.
    - There is no hover card.
- **The desktop replaces the row list** as the default Projects view; the admin-only graph tab
  stays.

## Backend: what exists, what's new

| Action                      | Endpoint                                                              | Notes                                                                                                                                                                           |
| --------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Desktop data                | `/projects` loader (`fetchProjectSummaries` + `loadVisibleParentIds`) | Already returns name, description, next step, counts, `access_level` and `parent_project_id`; children are derived client-side. One request. v2 adds `signals` per project.     |
| Nest / re-parent / take out | `PUT /api/onto/projects/[id]/parent`                                  | Attach needs admin on both projects and detach needs admin on either; one level enforced server-side (409/403 with messages). Undo means re-PUT the previous parent.            |
| Move a doc or task          | `POST /api/onto/organize/preview` → `apply`, `undo`                   | `kind: 'document' \| 'task'`, journaled batch, scoped preview token. Dated tasks are refused while `calendar_sync_ready` = false.                                               |
| **New:** card data          | `GET /api/onto/projects/[id]/card`                                    | One light request per open: doc tree (titles from `doc_structure`), open tasks (top N), goals, children with next steps. Prefetched on hover intent so a click opens instantly. |

Client-side rule checks mirror the server: one level deep, admin for nesting, write access for
moves, and the pinned "Shared with sub-projects" folder never drags. The server stays the
authority, and a refused move rolls back with its message.

**The confirm for a doc or task move** starts its organize preview the moment you drop. The
Move button enables when the token returns, about 150ms later, and the body shows the preview's
real impact ("Its 2 nested docs move with it").

## Build phases

1. **Desktop and nesting** (about 2 days):
    - icon grid, hover card, Recent / By state, search;
    - open card with read-only tabs and the dock;
    - drag-to-nest, take out, confirm, Undo;
    - Move to… menu;
    - the new `/card` endpoint with hover prefetch.
2. **Moving docs and tasks** (about 1.5 days): drag from the Docs and Tasks tabs to the dock,
   spring-loaded dock folders, organize preview → apply → undo, and the lock on dated tasks.
3. **Phone and polish** (about 1 day):
    - long-press drag, bottom dock and sheet;
    - focus management and aria-live announcements;
    - reduced motion;
    - browser walkthrough at desktop and phone width on throwaway projects.

Optional later: a chat tool to nest projects ("put Redline and UXM under Wayne Strategies"),
behind the same admin rules.

## Risks

- **Scale.** 46 projects fit on one screen. Past about 150, rely on search and By activity, and
  virtualize the grid.
- **Shared projects.** On projects DJ doesn't administer, nesting tiles show a lock with the
  reason.
- **Touch drag versus scroll.** Long-press plus a move tolerance usually works on iOS and
  Android. Verify on DJ's phone.
- **Generic tiles.** If monograms feel generic, re-enable generated icons for projects that have
  one.

## Validation

- Free: unit tests for the drop rules (shared with the Move to… list), component tests for card
  tabs and the confirm, and route tests for `/card`.
- Browser walkthrough on throwaway projects (soft-delete afterwards): nest, re-parent, take out,
  undo, doc move with nested docs, undated task move, dated task lock, and refusals.
- No paid tests are needed. Nothing here calls a model.

## Build status (2026-10-01)

Code lives in `apps/web/src/lib/components/projects/desktop/`. `ProjectDesktop.svelte` is the
orchestrator. It uses `DesktopTile`, `DesktopHoverCard`, `DesktopProjectCard`, `DesktopDock` and
`DesktopMovePopover`. Pure rules are in `desktop-model.ts` and `desktop-rules.ts`. The calls are in
`desktop-moves.ts`. Drag is in `useDesktopDrag.svelte.ts`. The new endpoint is
`GET /api/onto/projects/[id]/card`. The row list it replaced (`ProjectStateRow`,
`CollapsibleStateSection`, `ProjectListSkeleton`, `nestProjectList`) is deleted.

**Changed from the plan:**

- **Opening the full page.** Double-click is gone, because a single click already swaps the tile
  for its card. Tiles are real links instead: Cmd/Ctrl-click opens the project in a new tab, and
  the card has an **Open project** button.
- **The open card lives in shallow history.** It is stored in `page.state.desktopCard` together
  with the depth, so Back closes it and Collapse returns past every card that was opened.
- **Confirms anchored on the dock open beside it, not over it.**
- **Toasts during a drag.** They sit over the dock: top-right on wide screens, bottom on phones.
  While you drag they fade and let the pointer through to the target underneath.
- **The card keeps its tab after a move**, even when the move empties that tab.
- **Undo removes its own toast**, so it can't be pressed twice.

**Verified live (local dev against prod, as DJ, on throwaway projects that were soft-deleted
afterwards):**

- Hover card.
- Opening a card: Inside by default when the project has sub-projects, Docs otherwise.
- Real mouse drags:
    - nest on the desktop;
    - drag from the dock into an open card to nest;
    - drag a sub-project out to Desktop in the dock;
    - drag a doc to the dock, with the server preview before Move enables, then Undo ("Moved
      back.").
- Refusals:
    - "Alpha holds projects, so it stays on the desktop";
    - dated task locked;
    - START HERE and the shared folder marked "Stays".
- Move button → picker → confirm for a task.
- Escape steps back one layer at a time (confirm, then card) and focus returns to the tile.
- Back closes the card.
- At 500px wide (a popup window, since Chrome resize does nothing here):
    - five columns, no sideways scroll;
    - the dock is a fixed bottom strip;
    - the card is full width;
    - Move opens as a bottom sheet;
    - search is hidden while a card is open.

**Not verified:**

- Long-press drag on a real phone. Touch can't be driven from this browser.
- Light mode, by eye.
- Spring-loaded dock folders during a held drag. These are covered by code but not exercised
  live.

**Tests:** route test for `/card`; drop rules and copy; component tests for:

- keyboard nesting (M, pick, confirm, Undo);
- refusals;
- opening a card in shallow history;
- moving a doc with its nested docs through preview → apply (request body asserted);
- Collapse going back past every card that was opened.

## Tile colors and bars (v2, 2026-10-01)

DJ asked what the tile colors meant. They meant project type, which told him nothing. He wanted
colors that "semantically mean something", picked **color = pulse, bars = amounts** from the
pitched options, then asked for a D and a T bar, a T bar split by where tasks stand, no goals bar,
and the overdue count badge. Pitch with his real data (private):
<https://claude.ai/artifact/WxpqrcG6DV9JojSWckszCK>.

**Every color means one thing everywhere** (`desktop-colors.css`): green = moving / in progress,
purple = being shaped, amber = gone quiet, gray = parked / backlog, red = overdue, blue =
scheduled, ink = documents.

**Tile color is the project's pulse, from what happened, not the status field** (DJ rarely
updates it). Rules in `projectPulse` (`desktop-signals.ts`):

1. Status paused, completed or cancelled → **Parked** ("Marked paused"). This is the only use of
   the field.
2. A task finished in the last 14 days → **Moving**.
3. No recorded change in 60 days → **Parked**.
4. A change in the last 14 days → **Being shaped** ("Worked on 3 days ago, nothing finished yet").
5. Otherwise → **Gone quiet**.
6. Signals didn't load → no color.

"Change" means a row in `onto_project_logs` (app, chat, agents and forms). It skips bulk system
writes that bump `updated_at`, such as the Sep 4 backfill.

**Bars (full-size tiles only):**

- **D**: documents beyond START HERE, which every project has.
- **T**: open tasks, split overdue / in progress / scheduled / backlog. A task is overdue when its
  due date has passed, which wins over everything else. In progress comes next. Blocked tasks sit
  in the backlog. Any other task with a future start or due date is scheduled, and the rest is
  backlog.
- Bar length is the project's **rank** among the viewer's projects, from 18% to 100%. One huge
  project (85 open tasks) doesn't flatten everyone else's bars.

**Red badge**: the overdue count (capped at 99+).

**Where it shows:**

- A key strip above the grid; each item's tooltip gives its rule.
- The hover card: pulse chip, the reason, the task mix with counts, "15 docs · status active".
- The card header and the Tasks tab, where task glyphs and the dated-lock chip use the same
  colors.
- The tile's label for screen readers: "9takes, being shaped, 11 overdue, 34 open tasks, 0 docs".
- **By state became By activity**, grouping tiles by pulse (Moving, Being shaped, Gone quiet,
  Parked, No history yet). A saved "By state" choice maps to it.

**Data:** `loadProjectSignals` (`apps/web/src/lib/server/projects/desktop-signals.ts`) runs
inside the loader's existing `Promise.all`. It makes two reads with the viewer's client:

- open tasks plus tasks finished in the last 14 days;
- the last 60 days of project logs, newest first, stopping once every project has a row.

Both page through 1000-row pages, at most 5 per read, with ids in chunks of 120. PostgREST
aggregates are off, so the rows are counted in the app. There is no migration and no model call.
If the reads fail, `signals` is null and the tiles go neutral. Moves patch the counts in place
(`shiftTask`).

**DJ's numbers at build time:**

- 436 open tasks: 359 backlog, 65 overdue, 10 in progress, 2 scheduled.
- Desktop: 3 moving (Beyond Exit, 9takes, Wayne Strategies), 7 being shaped, 5 gone quiet, 16
  parked.

**Verified live (local dev against prod, read-only):**

- tile colors and badges match the data;
- the key strip;
- the hover card on Operation Second Round ("20 overdue · 6 backlog");
- By activity headings.

**Not verified:** light mode and phone width, by eye.
