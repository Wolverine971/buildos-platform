<!-- apps/web/src/lib/tests/layout-shift/README.md -->

# Layout-shift harness

Catches the "I changed something and the page jumped / closed / reloaded" class of bug
on every surface that has the item reader: the Projects card (`/projects`), the project
page (`/projects/[id]`) and Today (`/today`), plus History (`/history`) and the chat
modal opened over each of them.

```bash
pnpm --filter @buildos/web dev                  # a BuildOS dev server
LAYOUT_SHIFT_BASE_URL=http://localhost:5173 pnpm --filter @buildos/web test:layout-shift
```

Free: no model calls. Takes about two minutes.

## What it does

1. Signs in as the dedicated test user (`AGENTIC_TEST_USER_*` in `apps/web/.env`), never
   a real account, and seeds one throwaway project (`LSH · …`, eight tasks with due dates
   so they also show on Today). The project is deleted afterwards; leftovers older than
   six hours are swept on the next run. Seeding fires the task triggers that queue background
   jobs (entity extraction, embeddings); the harness drops those pending jobs right after the
   seed, before a worker claims them.
2. On each reader surface it opens a task and walks: In progress → Done → To do →
   Blocked → Done → next task → Archive → Undo → open "Chat about this" and Esc → close.
   On History (needs a past chat on the test user) it refetches the list the way closing
   a chat does, then opens a past chat and closes it.
3. After every action it compares the page before and after (`judge.ts`): did the card,
   list or reader close or get rebuilt, did anything move, did the list reorder, did the
   open row leave or jump, did the reader switch items, did the window scroll.

Every write the page sends is answered by the **shadow server** (`shadow.ts`) and never
reaches the database. Later reads are patched to agree with those writes, so a refetch
doesn't look like a bounce that couldn't happen for real.

## Reading the report

`apps/web/test-results/layout-shift/<time>/report.md`, plus before/after screenshots for
every failing step. "Shift score" is the browser's own layout-shift number for the step,
there to help diagnose; the pass/fail rules are the structural ones above.

A step marked **inconclusive** means the dev server hot-reloaded during it (another
session saved a file). Rerun.

## Options

| Variable                | Default                 |                                                                    |
| ----------------------- | ----------------------- | ------------------------------------------------------------------ |
| `LAYOUT_SHIFT_BASE_URL` | `http://localhost:5173` | Must be BuildOS; the run refuses another app.                      |
| `LAYOUT_SHIFT_SURFACES` | all                     | Comma list matched against surface names, e.g. `today`, `history`. |
| `LAYOUT_SHIFT_STRICT`   | `1`                     | `0` writes the report without failing the test.                    |
| `LAYOUT_SHIFT_HEADED`   | `0`                     | `1` shows the browser.                                             |

The browser is Playwright's Chromium when it is downloaded, otherwise the installed
Chrome with a fresh temporary profile.

## Adding a surface or a step

A surface is a name and an `open(page, fixture)` that ends with a task open in the
reader (`SURFACES` in `layout-shift.live.test.ts`). A step is an action plus what must
hold afterwards (`STEPS`). The judge and shadow have unit tests that run in CI
(`judge.test.ts`, `shadow.test.ts`); the live run is excluded from `pnpm test`.

On a busy machine Chrome can crash mid-run ("Target crashed"); run one surface at a time
with `LAYOUT_SHIFT_SURFACES`.

Not covered yet: phone width (the reader is a sheet there), docs and goals in the reader,
and chat edits arriving while a card is open (sending a message costs money).
