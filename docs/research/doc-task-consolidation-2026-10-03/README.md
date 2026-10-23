<!-- docs/research/doc-task-consolidation-2026-10-03/README.md -->

<!-- doc-status: proposal -->

# Consolidating docs and tasks across nested projects

Research and plan, October 3, 2026. **Status: slices 0 and 1 BUILT locally, uncommitted; migrations
rehearsed, NOT applied; no paid call yet.** See [Build status](#build-status-2026-10-03). DJ picked
the ambitious version with Claude Code–style questions (see
[v2](#v2-dj-picked-ambitious-questions-like-claude-code)). Page for DJ (private):
https://claude.ai/artifact/MbdiBfC6Kz1xhVTCk8aKWP.

DJ nests projects (Wayne Strategies holds 7 client projects; BuildOS holds the demo video campaign).
He wants to tell BuildOS "I talked about these ideas in several projects; read them, keep the good
parts, and consolidate them under the main project", and to get the same for tasks. His worry:
"information could be lost if we just tell an agent, 'Hey, synthesize these documents.'"

## The idea

Don't merge documents. Merge **facts**, and give every fact a receipt.

A one-shot "synthesize these" prompt fails in predictable ways on DJ's real data. It invents the
contents of hollow docs, presents January plans as current, hides contradictions, and keeps junk
text. The fix is to make the unit of work a fact pulled from a source, and to require that every fact
ends in exactly one **fate**:

| Fate       | Meaning                                                   |
| ---------- | --------------------------------------------------------- |
| kept       | placed in a named section of the master doc               |
| merged     | same meaning as another kept fact                         |
| superseded | a newer fact replaces it (dated)                          |
| history    | true at the time, kept in a dated history section         |
| conflict   | disagrees with another fact; both shown, DJ decides       |
| missing    | the source claims content it doesn't contain (hollow doc) |
| dropped    | junk or a folder note, with a reason                      |

Code checks the ledger is complete (every fact has a fate) before the writer runs, and checks the
written doc against the ledger after. DJ reviews the exceptions (conflicts, missing, dropped), not
every line.

Facts also age differently. Durable facts (audience, rules, domains) merge. Status facts are
superseded by date. Plans whose dates have passed become history. Open questions are checked against
later facts and closed or carried forward.

## What chat can do today (from code, 2026-10-03)

- **Read children from a parent: yes.** The hub prompt lists child ids and says to read by
  `project_id`. Reads check membership, not the focused project (`worker-access-adapter.ts:73-90`).
- **Search a whole family: no.** Every search takes one `project_id` or the whole workspace. No
  `include_children`.
- **See a whole doc: often no.** `get_onto_document_details` shows the model 3,500 chars
  (`tool-payload-compaction.ts:1089-1129`). Sections come back at about 5.6K. The Wayne Strategies
  "Brand Direction & Rebrand History" doc is 77K chars.
- **Write into a child, move a doc across projects, link across projects: no.** Writes are fenced to
  the focused project (`table-adapter.ts:392-422`); cross-project edges are refused
  (`op-execution-gateway.edges.ts:69-74`). Tasks can move out of the focused project only.
- **Merge or dedupe: no operation exists.** The nightly review flags duplicate tasks
  (`taskPairs.ts`, `loop_conflict_kind: duplicate`) and proposes archiving duplicate docs, one project
  at a time, from metadata only.
- **Turn budget:** 12 model calls, 12K output tokens per call, 300 s. A five-doc merge needs 10–15
  reads before one large write.

So a cross-project consolidation is impossible in chat today, and a same-project one is a long,
lossy single turn. Neither needs a paid test to establish; the paid battery below measures the read
side and how the model plans.

## What already exists to build on

- **Job shell:** the project-loop worker (run row, cost cap, structured JSON via
  `SmartLLMService.getJSONResponse`, code checks, suggestion rows, fingerprint-checked approval, inbox
  card). Add the freshness radar's pattern of pure stages shared with an offline replay.
- **Staged change sets:** `agent_runs` with `status='proposal_ready'` and `commitChangeSet`
  (START HERE capture uses it).
- **Moves with one Undo:** organize preview → apply → undo journal (docs and tasks, 200 moves, 20
  projects). Not a chat tool today.
- **Doc structure:** `extractOutline` (no model), `onto_embeddings` chunked by section,
  `content_hash`, version history with restore, surgical section edits, archive with restore.
- **Task pairs:** `taskPairs.ts` scores pairs with Jev (20 tasks max); `moveOntoTaskAtomic`; task
  archive; `depends_on` / `blocks` edges.
- **Fold** (whole-project combine): rehearsed, not applied, nothing calls it.

## Proposed pipeline (DJ's four steps → six stages)

1. **Inventory** (free). Every doc in scope: project, title, type, dates, size, outline headings,
   description, `content_hash`. Exact twins come from equal hashes.
2. **Cluster** (cheap). Candidates from section embeddings, exact twins, and "misfiled" (a doc whose
   nearest neighbours live in another project of the family). One structured call per candidate picks
   an operation: merge, move, supersede, link, or leave alone, with a reason. **Checkpoint 1:** DJ
   approves the cluster plan. Moves and archives can apply here with no writing at all.
3. **Extract** (parallel, one reader per source). Facts with kind, date, entities and a verbatim quote.
   Code checks every quote exists in the source. Readers also flag hollow docs and junk spans.
4. **Reconcile** (one editor per cluster). Assigns every fact a fate and an outline section. Code
   rejects the result until every fact id appears exactly once.
5. **Write and check** (parallel per section). The writer sees only its section's facts and cites
   their ids. A yes/no check per kept fact ("does this section state F?") gives coverage; misses are
   rewritten once.
6. **Approve and apply** (**checkpoint 2**). One card: the draft master doc, its exceptions (conflicts,
   missing, dropped), source fates (archive with a "merged into" link, or move), task changes. Applied
   as one batch with one Undo.

Runs as a worker job, not inside a chat turn. Chat gets one compact tool to start it and a card to
follow it (tool surface and prompt are at their caps: 64,863 > 63,200 surface, 11,946 / 12,000
system prompt).

## Tasks: five kinds of overlap

| Kind          | Action                                                        | Real example                                                                                                                      |
| ------------- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| duplicate     | merge into one, carry notes, re-point links, archive the rest | BuildOS: "Twitter brand kit" + "Create Twitter visual brand guidelines" + "Define color palette and typography for Twitter posts" |
| part of       | make it a subtask or checklist item                           | "Create User Guide Suite" ⊃ "Create detailed BuildOS guide for people with ADHD"                                                  |
| sequence      | `depends_on` chain, often a plan                              | hackathon: format → scenario → landing page → recruit pilots                                                                      |
| siblings      | roll up under one parent-level task or milestone              | "Finalize and send … outreach" in Hannibal, Julian, Nomtastic                                                                     |
| done or stale | propose closing, citing the evidence                          | "Script 90-second launch video" (the script doc exists, Sep 19); Tacemus logo and mood board (superseded by the rebrand)          |
| misfiled      | move to the right project                                     | Wayne: "Initiate payment collection for Rod Chamberlin project" → Beyond Exit Planning                                            |

## Real clusters in DJ's projects

See [battery.md](battery.md) for the test battery and ground truth, and
[rod-ledger.json](rod-ledger.json) for the Rod cluster worked by hand.

## v2: DJ picked ambitious; questions like Claude Code

DJ (2026-10-03): when the run hits a decision (for example conflicting facts), "it should basically
ask me a question … generate the options for me: 'Do you want to do A, B, or something else?'", with
"chat about this specific thing" and "enter some text", "and then it can keep executing. This is what
Claude Code does really well in the terminal." No paid test now.

### The question card

Mirrors Claude Code's AskUserQuestion: a short header chip, the question, 2–4 options (label +
description), the recommended option first, and always "Type something" and "Chat about this".

| Piece           | Design                                                                                                                                                                                        | Built on                                                                                                                       |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Question record | header, question, options each bound to an exact effect (structured op patch), recommended option, evidence quotes with source ids, skip default, the run piece it holds up, look-alike count | new; general on purpose so chat, the steward and project review can reuse it                                                   |
| Pick an option  | the option's effect runs as written                                                                                                                                                           | the shared-doc confirm card pattern: `client_action` receipt, service-held effect, single-use POST, resolution survives reload |
| Type something  | one structured model call maps the text to an allowed effect or a custom instruction, shows the reading, waits for OK                                                                         | structured output, no regex (AGENTS.md)                                                                                        |
| Chat about this | chat opens with the question pinned and one tool to record the answer; the run resumes on that call                                                                                           | chat + one small tool                                                                                                          |
| Run state       | stages persist outputs; an answer enqueues a resume from the waiting piece                                                                                                                    | project-loop job shell, radar-style pure stages with offline replay                                                            |
| One Undo        | creates, archives, moves and links in one journal entry                                                                                                                                       | organize journal (moves today), extended                                                                                       |

**Ask rules.** Ask only when the evidence can't settle it, only DJ has the information, or the change
loses or closes something. Decide everything else and list it as "decided for you", each with Undo.
At most 4 on screen, ordered by how much they unblock. Look-alike decisions collapse into one
("applies to 2"). Only the piece a question touches waits; the rest of the run keeps going.
Unanswered questions wait at the final review. A change that loses or closes something never
applies on a default. The bench counts questions asked; too many is a failure.

Example: the Rod check-in date conflict (Feb 2 in the body, Feb 3 in the description) is **not**
asked. The body says "Monday, February 2nd", and Feb 2, 2026 was a Monday.

A full tidy of both families asks about 9 questions: 4 at the plan (Rod docs, intake twin, Tacemus,
county notes), 2 while writing the Rod doc (missing content ×2 as one question, both-sites open
question), and 3 for tasks (Script task done?, Twitter ×3, Rod payment with no recommendation).

### The run

1. Survey (inventory + clusters), about a minute.
2. **Plan questions** (≤4), plus a "decided for you" list.
3. Filing applies right away: moves and twin archives in one batch with Undo.
4. Merges run in parallel: extract → reconcile → write → check.
5. **Questions as they're found**; only their piece waits.
6. **Review and apply**: drafts, decided-for-you, skipped questions, one Undo.
7. Receipt; archived docs say "merged into …".

It starts from chat, and the run card lives in that chat. Open questions also wait in the inbox.

### Build order

| Slice    | What DJ can click                                                                                 | Free check                                                                              |
| -------- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| 0 (~2 d) | The question card: record, card, answer route, type, chat-about-this, keyboard, phone, inbox view | component + route tests with the page's decks as fixtures; browser walkthrough          |
| 1 (~3 d) | Family search in chat; survey; plan questions; moves and twin archives with one Undo              | offline bench on a Wayne + BuildOS snapshot, clusters vs [battery.md](battery.md)       |
| 2 (~4 d) | Docs merge: facts, fates, write, check, mid-run questions, review, apply                          | bench: Rod + Anne Arundel coverage, invented facts, conflicts surfaced, questions asked |
| 3 (~3 d) | Tasks: merge, subtask, sequence → plan, roll up, move, close with evidence                        | bench on the task clusters                                                              |
| 4 (~2 d) | Entry points (chat, inbox, drag docs together on Projects), remembered answers                    | the 12-turn live test (paid, needs DJ's OK)                                             |

## Open for DJ

- Ask like this everywhere (chat, steward, project review) or only in consolidation runs. The card is
  built general either way; chat needs prompt trimming (prompt and tool surface at their caps).
  Recommended: consolidation first, chat next.
- While a question waits: keep working on everything else (recommended) or pause the whole run.
- Unanswered questions wait at the final review; nothing that loses or closes something applies on a
  default (recommended), or expire after a day.

Settled 2026-10-03: ambitious, with Claude Code–style questions. Assumed but not confirmed by DJ
(my recommendations from v1): old docs archived with a "merged into" link; two checkpoints (plan,
then review), with questions between them as they come up.

## Build status (2026-10-03)

DJ (10-03): question cards only inside consolidation ("keep it lean, only to this document
consolidation thing"); while a card waits, keep working on what it doesn't touch; unanswered cards
wait at the final review.

**Built (uncommitted):**

- **Contract:** `packages/shared-agent-ops/src/consolidation/consolidation.ts`, exported as
  `@buildos/shared-agent-ops/consolidation`. It defines the operations (move, archive, keep), the
  question record, answers (option, skip, text, chat), drafts, the plan and clusters, and
  `planOps`.
    - Rules enforced in code: 2–4 options per card; the skip option keeps everything; a recommended
      option must be on the card.
- **Migrations** (rehearsed with `--role-probe`, passing in both orders with the unapplied fold
  files; NOT applied):
    - `20261003150000_consolidation_queue_type.sql`
    - `20261003150100_consolidation_runs.sql`, which adds the service-only tables `consolidation_runs`
      and `consolidation_questions`, and one open run per project.
    - The fold policy rows are classified from either file.
- **Generated types:** `database.types.ts` is hand-edited; regenerate it after the apply. The job
  metadata (`ConsolidationRunJobMetadata`) is in `queue-types.ts`.
- **Worker:** `apps/worker/src/workers/consolidation/`, registered as `consolidation_run`.
    - `survey.ts` is pure: short keys (P1, D12), twins by content hash, a groups prompt, a per-group
      decide prompt, key validation, and quote checks.
    - Archiving anything that is not an exact twin with a surviving copy is always asked.
    - `consolidationJob.ts` handles survey and replan, with a $0.25 cap per run, 4 groups decided at
      a time, and headings read from content when the outline is missing.
- **Web:**
    - `lib/server/consolidation/consolidation.service.ts`:
        - start;
        - answer by option or skip;
        - typed text and chat, read by a model and confirmed before anything runs;
        - veto a decided group;
        - cancel;
        - apply: moves as one Organize batch at the top of the destination (a doc travels with a folder
          moving to the same place), then archives with `promote_children`;
        - undo: the Organize undo, then restore and re-add to the tree.
    - Routes under `/api/consolidation/`.
    - The page at `/projects/[id]/consolidate/[run_id]`.
    - `ConsolidationQuestionCard` (keys 1–N, arrows, Enter, Skip, "Read it back", chat thread) and
      `ConsolidationRun` (polling, Needs you ≤4, Decided for you with "Leave it", Your answers, Apply
      N, receipt, Undo all).
    - Menu entry "Consolidate docs…" in the project ⋯ menu.
- **Script:** `apps/worker/scripts/consolidation-survey.ts` runs the survey with no run row and no
  writes. It is free by default; `--live` is paid.
    - Dry run on Wayne: 88 live docs, 8 projects, 11 pinned (START HERE ×7, thinking log ×2, shared
      folder), the intake twins found, headings for 63 of 88, a 36K-char groups prompt.
    - BuildOS: 30 docs, a 12.7K-char prompt.

**Review fixes (two adversarial reviewers, 18 findings, all but one fixed):**

- Apply/Undo routes get 60 s; progress (receipt, undo steps) is saved as work lands; a run stuck in
  `applying` recovers after 3 min, one stuck in `surveying` fails after 20 min; Cancel shows while
  surveying.
- One bad move no longer blocks Apply: the batch is previewed, and on refusal each move is previewed
  alone and the refused ones are reported. Moves go deepest-first; docs already in place are skipped;
  sub-projects the owner can't edit are left out of the run.
- Undo is retryable (`applied` until everything is back), restores each doc to its old parent and
  position with its sub-docs, and maps `review` → `in_review`.
- Late worker writes can't revive an applied or cancelled run (status-guarded writes); aborted jobs
  never write a partial plan; a replan that fails for good reopens its card; cards are validated with
  the web's parser before insert; empty labels get a label from what the option does.
- Twins: a plan-wide check stops two groups from each archiving one copy.
- All START HERE and thinking-log docs are pinned (Organize refuses them).
- The confirm line shows the option's real effect, not the model's sentence; Enter on Skip/Send
  does that button's action; polls can't reopen an answered card; Leave it is disabled during Apply
  and the plan is re-read under the lock; a removed collaborator loses the run's titles and excerpts.
- A moved folder's sub-docs are counted on its card ("Moves 1 doc and the 4 inside it"), from the tree
  at survey time (fixed 2026-10-04).

**Slice 2, merges (built, uncommitted):**

- Contract: `merge` op (2+ docs → one new doc in a target project; sources archived pointing to it),
  always asked; `planOps` holds a merge until its draft is `ready`; merge-question options carry fact
  `edits`; `questionEdits` applies the chosen option, or an unanswered card's recommendation only
  when it keeps or notes facts (never drops or replaces). Ledger: `parseLedgerFate`, `applyEdits`,
  `safeEdits`, `describeEdits`.
- Migration `20261003150100` adds `consolidation_merges` (service-only; ledger, markdown, coverage,
  one per group); fold policy rows in both files; rehearsed, both orders with the fold file.
- Worker `merge.ts` (pure) + `mergeJob.ts`: extract per source/chunk (quotes verified; unverified
  notes set aside and shown; hollow and junk flagged) → reconcile (one retry naming ledger gaps, then
  code repair that keeps) → questions (the editor's, plus every unsettled conflict and missing
  content; each ends in "Decide later") → write citing `[[F12]]` → check. Facts the prose misses are
  added word for word under "Also noted"; "Needs your eye" lists conflicts and missing content;
  "Sources" lists what was archived. The draft is written at once with safe defaults; each answer
  rewrites it (answers arriving mid-write get another pass). Typed answers become the owner's own
  facts. $0.15 cap per merge.
- Web: answering a group with a merge starts it; answering a merge card rewrites the draft; Retry for
  a failed merge; Leave it drops a merge (and withdraws its cards). Apply creates the doc like the
  create route (session insert, first version, top of the tree), then archives the sources with
  `replaced_by` the new doc; Undo archives the merged doc, then restores the sources.
  `ConsolidationMerge` shows progress, the fact accounting, every fact and where it went, flags, and
  the draft.

**Checks:**

- Tests: contract 15/15, survey 8/8, merge 7/7, card 7/7, merge panel 3/3, service 4/4.
- svelte-check: 0 errors over 10,364 files. Worker tsc and lint are clean.
- Not yet run live: no model call has been made against the merge prompts (paid; needs DJ's OK and
  the migrations applied).

**Live test (2026-10-04, DJ approved; migrations applied):**

- Both migrations applied to production one at a time and recorded; tables verified (RLS on, no anon or
  signed-in access, service writes). Hand-written types match the live columns; `pnpm gen:types` needs
  `SUPABASE_ACCESS_TOKEN` (not fetched).
- Run on Wayne Strategies (8 projects, 88 docs) through the real UI and queue, using
  `apps/worker/scripts/consolidation-runner.ts` (claims only `consolidation_run`; DJ's dev worker predates
  the job and was left alone). Run `3579661e…`.
- Survey: 9 groups, 8 cards, 1 decided — the 12 Rod Chamberlin docs filed in Wayne → Beyond Exit Planning,
  matching the hand-made ground truth. Merges recommended for UXM worldbuilding (3 docs) and WCAG proposal
    - template.
- Merge (UXM, 3 docs): after the fixes below, 131 facts, 126 placed, 125 stated by the prose, 1 added word
  for word; 113 keep, 10 open, 4 folded in, 3 history, 1 dropped. Nothing applied.
- Spend: **$0.0898** (36 calls, DeepSeek V4 Flash): survey $0.018, merges $0.072 — over the
  $0.03–0.08 estimate. $0.035 went to billed unusable responses (reconcile answers cut off at the output
  limit) and ~$0.035 to a re-run that verified the quote fix.
- Found and fixed (offline-tested, not yet re-run live): grouping timed out at 120 s (now 240 s; decide
  150 s); extraction timed out (reasoning off for extract/write/check, 6K-char chunks); reconcile took
  234 s (now 360 s) and its one-record-per-fact answer outgrew the output limit (now a compact format:
  ids under section headings, linked fates as pairs); **51 of 55 "unverified" notes were real** — quotes
  dropped markdown `**` (quote check now compares reader text); model text leaked keys ("D14", "P2") —
  keys are now replaced with titles and the prompts forbid them; the run's cost undercounted failed
  attempts ($0.050 shown vs $0.090 real) — caps and totals now come from `llm_usage_logs`; a sibling
  source was flagged "hollow"; table quotes joined cells.

**Slice 3, first piece (2026-10-04, built, offline-tested):** misfiled tasks move. The survey reads open
tasks (T keys, up to 200); tasks can join only misfiled groups and can only move (`move_tasks` op;
"Leave them" covers tasks via `keep.task_ids`). Apply puts them in the same Organize batch as the doc
moves (top of the destination, one Undo); the receipt says "Moved task …". Tests: contract 16, worker 21,
web 14, svelte-check 0. Not done, waiting on DJ: duplicates merge, "part of" (no `parent_task_id` on
`onto_tasks`: edge, checklist, or plan?), sequences, sibling roll-up (new task or milestone?), close with
evidence (done vs archive).

**Second review (2026-10-04, two read-only reviewers, 30 findings, all fixed but one):**

- Apply:
    - Organize hands out a token even when a move is blocked, and then the whole batch fails. A
      blocked move (prod has `calendar_sync_ready` off, so any misfiled task with a date) is now
      previewed alone and set aside with Organize's own message.
    - When moves would unlink relationships, clear task goal/plan/milestone links, or remove
      assignees, Apply returns `confirm` with Organize's lines and changes nothing until "Apply anyway".
    - Docs or tasks moved out of the family, archived, or deleted since the survey are left alone and
      listed. A doc is never archived in favor of one that is itself being archived.
    - Merges: refused when any source changed after the draft read it (`ledger.source_versions`), and
      held when the draft was written before the latest answer (`ledger.written_for` vs
      `answersFingerprint`).
    - The Organize batch id is saved before the batch runs, and a merged doc an interrupted Apply
      already made is reused.
- Undo runs in reverse order (archives, then merged docs, then the Organize batch). What Organize
  can't put back is listed as "left as they are", not claimed as undone. A doc restored by hand,
  deleted, or archived before Apply is skipped, and a batch that never landed counts as done.
- Merge pipeline (worker):
    - Writes are versioned on `consolidation_merges.updated_at`: an answer sets the row `pending`, and
      a stale write never saves as ready.
    - A retried job resumes from the stored ledger. Cards are withdrawn, never deleted. Typed answers
      become the owner's own words as facts.
    - Replaced facts must resolve to a placed fact, or they are kept as history.
    - Long quotes are checked before clipping. Unverified notes go into the doc under "Couldn’t find
      word for word". Junk-flagged facts get a visible `dropped` fate.
    - `safeEdits` no longer treats `merged` as safe. Chunks cut at boundaries. Caps re-read spend before
      each phase, and the run cap excludes merge spend. `consolidation_run` gets a 20-minute worker
      timeout.
- UI:
    - Polls while applying, and cards keep their slots.
    - A stalled or unstarted merge gets Start over / Try again.
    - Apply counts docs and tasks, not operations, and unverified notes are listed.
    - Someone who lost access to a sub-project stops seeing its titles, quotes and drafts.
- Not done: writing a "replaced by" pointer onto archived docs (nothing in the app shows it yet; the
  merged doc lists its sources).
- Tests: contract 21, worker 30, web 25 (10 new Apply/Undo tests on an in-memory database);
  svelte-check 0 errors; worker and shared typecheck and lint clean. No live model calls.

**Shipped state (2026-10-04 15:20):** DJ's `updates` commit `7f51e54fd` (pushed, merged as
`97a8d5004`) carries all of this except the held-draft check, the fresh retry dedup key and
formatting, which are uncommitted.

- The Railway worker deployed, so prod now claims `consolidation_run` jobs, including runs started
  from local dev.
- The Vercel web deploy failed on an unrelated invalid route export in `routes/today/+page.server.ts`;
  fixed locally, uncommitted.
- CI failed on the migration ledger check because `20260930220000` (the unapplied fold file) was
  edited. Leave it as committed: the next push compares against this one and passes; reverting
  would trip the check again.
- The project menu entry is not gated: the next successful web deploy shows "Consolidate docs…" to
  everyone with edit access.

**Live re-run (2026-10-04 evening, DJ approved; prod web + worker on `df81f97dc`):** $0.0437 total
(estimate $0.03–0.05).

- UXM merge, started over on run `3579661e` (prod worker): 141 facts; 138 placed and all 138 written
  into the prose (none appended); 3 folded in; 4 unverified (was 24, first test 55); no false "hollow"
  flag; no fact keys in the draft or cards; two merge cards; `source_versions` and `written_for`
  stored. 6.5 min end to end, $0.0395. The prose reads as a list of facts, one sentence each.
- Defect: reconcile with reasoning on spent both DeepSeek answers' 8,192 output tokens on reasoning and
  came back cut off ($0.0246 billed). The fallback (GPT-6 Luna) produced a ledger of about 2,500 tokens
  that passed every check. Fixed locally: reasoning off for reconcile too, 16,000-token output room for
  reconcile and write. Not yet re-run live.
- Defect: Retry refused an old draft the page showed as stalled (it checked the raw `ready` status).
  Fixed locally: Retry judges the merge the way the page does. The live restart ran from local dev.
- Fresh survey via `scripts/consolidation-survey.ts --live`: 5 calls, all DeepSeek, all succeeded,
  $0.0042, slowest 42 s (grouping timed out at 120 s in the first test). It found 4 groups, against 9 in
  the first test. Its output was lost: the script's summary crashed on a `move_tasks` op before
  writing anything. Fixed: raw output is saved first, and task moves print.

**Slice 3, task consolidation (2026-10-04 night, built, offline-tested, uncommitted):** DJ's picks
from the questions page (all five recommendations), plus his ask: "I want to basically just see a
visual of what the consolidation looked like."

| Kind          | What Apply does                                                                                                                                                              | Asked?                         |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| duplicates    | `merge_tasks`: the most complete task stays; the others become `☐ title` lines (plus their notes) in its description and are archived with `props.consolidation.merged_into` | always                         |
| part of       | `plan_tasks` (`sequence: false`): a plan named after the big task holds it and its pieces (`has_task` edges)                                                                 | decided only when high + clear |
| sequence      | `plan_tasks` (`sequence: true`): same, in order, and each step `depends_on` the one before                                                                                   | decided only when high + clear |
| siblings      | `rollup_tasks`: one new todo task in the parent with a `☐ title (Project)` line per sub-project task; the originals stay                                                     | decided only when high + clear |
| done or stale | `close_tasks`: `done` needs an evidence doc whose quote checks out; `completed_at` is the doc's date and the description cites it. `archived` adds a note and archives       | always                         |

- Apply runs task changes as step 3 (after the Organize batch, before doc archives). Every edit is a
  compare-and-set on `updated_at`; the receipt keeps each task's prior description, state,
  `completed_at` and props. Undo restores them in reverse, deletes created plan edges, soft-deletes
  created plans, and archives created roll-up tasks. A task edited after Apply is left alone and listed
  ("X: changed after Apply").
- Left alone and listed, never forced: tasks gone, moved out of the family, or already changed by an
  earlier op in the run; tasks with live calendar events (archiving deletes them); tasks already in a
  plan.
- The picture (`ConsolidationPicture.svelte`, model in `consolidation-picture.ts`): "What Apply will
  change" above the cards while the run is open, "What changed" on the receipt. Big counts ("12 → 9 open
  tasks", "88 → 86 docs"), fact chips ("3 tasks merged into 1", "2 tasks closed"), then one row per
  change: items on the left, the result on the right, curves between (converging for merges, dashed for
  roll-ups; a plan box with numbered steps and "waits on the step before"; struck-through for closed).
  Moves group by destination. Phones stack before over after with ↓. Six rows, then "Show all".
  Browser-checked on run `3579661e` (docs) and a scratch page with every task row kind, desktop and
  400 px, light and dark.
- Tests: contract 23, worker 37 (task grouping, decide, plan/roll-up/close checks), web 36 (task ops
  on an in-memory database incl. undo; picture model). svelte-check: 0 consolidation errors (2 in
  another session's tables code).
- Not yet run live (paid, needs DJ's OK): a survey that groups real tasks, and an Apply/Undo of task
  ops on prod data. (Done 2026-10-06, below.)

**Live task test (2026-10-06, DJ approved; code from `b3968cb4c`):** run `76c46502` on BuildOS (2
projects, 30 docs, 89 open tasks), started from the project menu on local web (prod database; the
Chrome profile on build-os.com is a different account). Wayne Strategies was the plan, but its 10-04
test run `3579661e` is still open and the browser-tool safety check blocked cancelling it.

- Survey: $0.0155, 2 min 20 s. 3 task groups, all asked: launch-video script into the production task
  (merge), guide suite + ADHD guide (plan), threat-modeling prototype into the War Room task (merge).
  No doc groups.
- Apply (my test answers, all recommended): the database diff against a snapshot was exactly 2 kept
  tasks with `☐` lines, 2 archived with `merged_into`, 1 plan, 2 `has_task` edges; nothing else
  touched. Preview and "What changed" picture both showed "89 → 87 open tasks".
- Undo: all 152 tasks field-for-field equal to the snapshot, both edges gone, plan soft-deleted.
- Defect, fixed offline: the grouping call on DeepSeek spent 8,022 of 8,192 output tokens reasoning and
  was cut off ($0.0105 billed); the GPT-6 Luna fallback found only 3 groups and missed the Twitter
  duplicates (3) and the hackathon sequence (4), which were in its input. Now 24,000 output tokens
  (reasoning stays on) and the instructions treat tasks as first-class. Not yet re-run live.
- Wording, fixed: the merge note said "(duplicates)" for "part of" merges; the receipt said "Added a
  checklist of duplicates" and "Merged into another task" (now names the task); "+ 1 as checklist
  lines"; the subtitle now counts open tasks.
- Not exercised live: roll-ups, close as done/archived, sequences with `depends_on`.

**Deploy order:** the worker claims job types as text (`job_type::TEXT = ANY(p_job_types)`), so
shipping code before the migrations breaks only this feature. Still, apply both migrations before
the next push so the menu item works.

**Not done yet:** a live re-run of the grouping fix (~$0.02–0.04), slice 4 entry points beyond the project menu (inbox, chat), a live re-run of
the offline fixes (paid; needs DJ's OK), and regenerated types (`pnpm gen:types` with
`BUILDOS_SUPABASE_TYPES_SOURCE=cli` and `SUPABASE_ACCESS_TOKEN`).
