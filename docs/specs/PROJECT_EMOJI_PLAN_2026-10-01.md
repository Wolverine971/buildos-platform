<!-- docs/specs/PROJECT_EMOJI_PLAN_2026-10-01.md -->

# Project Emojis (2026-10-01)

DJ's ask: the Projects tiles show initials ("BE" for Beyond Exit Planning). Replace them with two
emojis that stand for the project (💰 + 🚪), picked by a model from the project's own words. Owners
can change them by hand on the project page.

## How it works now (2026-10-02)

- **Picker.** GPT-6 Luna picks the emoji: `apps/worker/src/workers/project-emoji/project-emoji.ts`.
    - It reads the project's name, description, and START HERE, clipped to 1.2K and 1.5K characters.
    - It returns JSON: a first emoji, a second, and up to 6 alternates, each with a short reason.
    - The prompt asks for what the project _is_: the business, cause, product, or person. It weighs
      the name most and ignores this week's tasks and the format of the work.
- **Checks.** `checkEmojiPick` keeps only what passes, whatever the model wrote:
    - Every emoji must be one of 1,687 vetted emoji (`emoji-catalog.generated.ts`). The list is built
      from Unicode's list: Emoji 15.0 or older so they render on older phones and Windows, with no
      skin-tone or gendered duplicates. A dropped variation selector (❤ vs ❤️) is forgiven.
    - The second emoji must come from a different Unicode subgroup than the first, so no 💰 + 💵. A
      valid alternate is promoted when the second fails.
    - An answer without a valid first and second goes back to the model once, with the exact
      problems. If that fails too, the project keeps what it has.
- **Cost.** Each call is capped at $0.002 (`spendLimit`) and logged as `project_emoji_pick`.
    - Measured: about $0.00023 per project, about 860 tokens in and 450 out (thinking included), 3–9 s.
    - Luna's prices are $0.10/M input and $0.50/M output (OpenRouter, 2026-10-02).
- **New projects.** Migration `20261002160000_pick_project_emoji_on_insert.sql` adds an
  `AFTER INSERT` trigger on `onto_projects`. It queues one `pick_project_emoji` job per project,
  however the project was made (app, chat, or MCP).
    - The job runs a minute later, so START HERE usually exists by then.
    - The worker (`projectEmojiWorker.ts`) skips deleted projects and projects that already have
      emoji.
    - It writes only while `icon_emoji` is still empty, so an owner's own choice always wins.
    - Queueing is best effort and never blocks the insert.
    - Jobs wait in the queue until a worker that knows the job type is deployed.
    - Verified 2026-10-02: a throwaway project's insert queued exactly one job with a 60 s delay and
      the right metadata; the project was then deleted and the job cancelled.
- **Existing projects.** `apps/worker/scripts/project-emoji-backfill.ts`, used with
  `project-emoji-backfill.sql`, which dumps one person's projects:
    - dry run: free; prints a cost estimate;
    - live: paid; needs `PROJECT_EMOJI_LIVE=1`, `--user-id` and `--max-usd`; resumable;
    - `--sql`: writes the picks as SQL, skipping owner-chosen emoji.
- **Rebuilding the catalog.** `apps/worker/scripts/build-emoji-catalog.ts` writes the worker copy
  and the web picker's copy.

## Data model

`onto_projects.icon_emoji jsonb` (migration `20261001190000_project_icon_emoji.sql`):

```json
{ "glyphs": ["🏢", "🚪"], "source": "llm", "model": "openai/gpt-6-luna",
  "generated_at": "…", "input_hash": "…", "prompt_version": 1,
  "ranked": [["🏢", "business ownership and exit planning"], ["🚪", "the transition beyond an exit"], …] }
```

- **The emoji are stored as text.** `glyphs` holds the characters themselves; the tile prints them
  directly.
- **`source`** is `llm` for an automatic pick and `user` once someone chooses. An automatic pick
  never overwrites `user`.
- **`ranked`** holds the alternates and their reasons. They feed the picker's "Suggested" row.
- **`input_hash` and `prompt_version`** record which words and which prompt a pick came from, so a
  later re-pick can tell it is stale.
- **Machine-maintained.** Writing `icon_emoji` does not bump `updated_at`, so picks can't reorder
  anyone's Recent sort. It does not re-embed the project or cancel agent permissions either (trigger
  audit, 2026-10-01).
- **NULL keeps the initials.** An owner who chooses initials gets an empty `glyphs` list with
  `source: "user"`, so the automatic pick won't fill it.

## Display and editing

- **Projects tiles** (`DesktopTile.svelte`):
    - two emoji on desktop tiles and in the open card's header;
    - one in the dock and pickers;
    - faded on parked projects;
    - a faint light edge in dark mode, so dark glyphs (🔚 🦇) stay visible.
- **Projects page loading.** `lib/server/projects/project-emoji.ts` runs in parallel with the
  Projects page's existing reads.
- **The project page.** The emoji sit left of the title (`components/project/emoji/`).
    - Anyone with edit access taps them to open the picker, which offers:
        - two slots;
        - Suggested (the automatic pick's alternates);
        - search by name;
        - the full catalog by group;
        - "Use initials".
    - Saving calls `PUT /api/onto/projects/[id]/emoji` with `{ glyphs }`: 0–2 standard emoji, write
      access required.
    - The save marks the choice `source: "user"` and keeps the suggestions.
    - The page gets the emoji from its single first-paint call. Migration
      `20261001200000_project_skeleton_icon_emoji.sql` adds `icon_emoji` to
      `get_project_skeleton_with_access_v2`.

## How we got here

- **2026-10-01: Jev first, as DJ first described it.** TypeSafe's Jev ranks every emoji by
  probability.
    - Jev can only choose from options it is shown, so each pick carried the whole catalog: 11 Choice
      questions, about 33K input tokens, $0.0014 per project.
    - Its first picks matched current work rather than identity: Beyond Exit Planning got 📹📘. A
      prompt v2 helped (📖🔚).
- **2026-10-02: A/B against GPT-6 Luna on all 46 of DJ's projects.**
    - Luna picked all 46 on the first try for $0.0108, against Jev's $0.0645.
    - They agreed on the first emoji for 20 projects and on the exact pair for 6.
    - DJ liked some of each. He chose Luna as the one engine and asked that Jev not be kept beside it.
    - The Jev engine was removed.
    - DJ's 46 tiles now show Luna's pairs. Jev's old pair sits in each project's suggestions as plain
      data.
    - Comparison page: https://claude.ai/artifact/MysT4mUTyWCA4W3DsSZE7Y.

## Not built yet

- **Re-picks after major changes.** `input_hash` is ready for this. "Major" needs a definition; a
  rename, or a rewritten description, are candidates. `source: "user"` stays untouched either way.
- **Other users' existing projects.** About 75 projects belong to other users and still show
  initials. A backfill is about $0.02.
- **Search keywords.** Picker search matches Unicode names only: "money" finds 💰 but not 💵
  ("dollar banknote").
- **The Projects card header.** The in-place card on /projects doesn't open the picker yet.
- **Reasons in the picker.** Luna's reasons could show as tooltips on Suggested.
