<!-- tasker/156-ai-inbox-see-under-the-hood.md -->

# 156 — AI Inbox: see under the hood (watch it sort, for the inbox)

**Opened 2026-11-07 (DJ). High-level architecture for another agent to research, then build.**
Start by reading this file, then the two trackers it builds on:
[155 — Watch it sort, in real chat](155-watch-it-sort-in-chat.md) (the pattern) and
[149 — AI Inbox: Assistant's Desk](149-ai-inbox-assistants-desk.md) (what the inbox is today).

## What DJ asked for

> "In the AI inbox there's a lot of stuff happening. It pulls in data and gives me suggestions…
> I don't have enough context. I need to know what's going on under the hood, where information's
> going, … what tasks are being referenced, what documents are being referenced, and then be
> able to see it be organized — similar to what we did with the brain-dump organization view."

**The problem:** inbox cards show a conclusion ("Archive these 3 docs?", "Did this happen?",
"Want me to…?") without the trail behind it. DJ can't see:

- **Where the item came from:** which pass, signal or email, and when.
- **What it read:** which tasks, docs and goals, with links.
- **What it will change:** before → after, per record.
- **Where things land when he answers.**

**The goal:** every inbox item can show its whole path, signal → evidence → proposed change →
destination, and answering it visibly sorts the change into place, like the chat's "watch it
sort" view.

## Principles carried over from the chat work (151 → 153 → 155)

These are what made the chat version work; apply the same ones here.

1. **Same engine, real data.** The lab (`/lab/sort`, `/lab/chat`) proved the idea; the real
   feature moved onto the production engine instead of growing the lab. Here, build on the real
   inbox pipeline (project-loop passes, freshness radar, check-ins, email updates), not a parallel
   lab. A free replay or scratch page is fine for checking visuals.
2. **One provenance contract, many renderers.** In chat every step carries structured facts:
    - affected entities;
    - `field_changes` before → after (gateway `buildFieldChanges`);
    - `source_quote` (`from_quote`).

    One pure module (`agent-chat-step-details.ts`) turns them into rows. Do the same for the
    inbox: one shared shape on every inbox item, with each card kind rendering it.

3. **Meaning arrives through structured channels, never regex** (AGENTS.md):
    - what a card references comes from ids the pass used;
    - why it exists comes from the pass and signal fields;
    - which words of an email it came from comes from a quote the model copied and code located
      (`locateSourceQuote`, shared-types).
4. **Show, don't summarize.** Name the records with clickable links (new tab,
   `buildEntityHref`), show before → after values, and show the source words lit up. Counts alone
   ("3 tidy-ups") are what DJ is reacting against.
5. **Watch it sort.** When an answer applies, the change visibly flies to where it landed. Reuse:
    - `phrase-flight.ts` (chat);
    - `pile-fly.ts` and the Cleared pile (inbox, tasker 149).

    Reduced motion lands instantly.

6. **Free first, paid with approval.** Replays, fixtures, scratch pages and unit tests are free.
   Any live model run (a cleanup pass, Jev scoring, an email roll-up) needs DJ's explicit OK,
   stating scope, cost and the acting model.

## Phase 0 — research (free, do this before proposing a build)

Map the inbox end to end and write the findings here. For **each item kind** (check-ins / "Did
this happen?", "Still on?", "Pick a path", Tidy-ups, "Out of date", "Want me to…?", Done for
you, email updates, manager brief), answer:

| Question                                                                        | Where to look (starting points)                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| What creates it, when, and with which model or rule?                            | `apps/worker/src/workers/project-loop/` (cleanupPass, cleanupSynthesis, cleanupAutoApply, reviewRollup, scheduledAuditScan), `apps/worker/src/workers/freshness-radar/`, `apps/web/src/lib/server/inbox*.ts`, `email-project-updates.service.ts` |
| What did it read (records, emails, calendar)? Are those ids stored on the item? | `ProjectCleanupItemRow`, `ProjectCleanupSynthesis`, radar card payloads (`freshness-radar/card.ts`), `packages/shared-types/src/project-loops.types.ts`                                                                                          |
| What will answering change, and are before values known?                        | `project-cleanup-decisions.service.ts`, `project-cleanup-undo.service.ts`, `tree_operations`, doc-tree preview (`inbox/doc-tree-preview.ts`)                                                                                                     |
| What does the card show today, and what's missing?                              | `apps/web/src/lib/components/inbox/*`, `DashboardInboxModal.svelte`                                                                                                                                                                              |
| What survives a reload, and how long?                                           | the tables behind `/api/inbox/*`                                                                                                                                                                                                                 |

Deliverables:

- **A per-kind provenance gap table:** what we have, what's lost, what's cheap to keep.
- **A short "how the inbox works" explainer for DJ.** Use his real data: an interactive
  Artifact page showing one real item's journey, not a prose report.
- **Lean vs ambitious options** (below) with sizes. Interview DJ before building (his standing
  rule): lead with "describe what you're picturing for X" where his vision matters.

## Phase 0 findings (2026-11-09)

Explainer with four real items: https://claude.ai/artifact/DBqGhS1HwksTShhX5rcMVP

**Headline: the trail is mostly stored already; the cards hide it.** Production, last 30 days,
95 `project_suggestions` rows: 100% have `evidence_refs`, `rationale`, `why_now`, `confidence`,
`run_id`; every row with a change has `operations`. `ProjectCleanupView` already carries
`evidence_refs`, `why_now`, `first_seen_at`, `seen_count` and `tree_operations` to the browser,
and `InboxProjectCleanup.svelte` renders none of the first two. Record names are plain text
everywhere except the manager brief.

**So section A changes:** don't start with a new stored `InboxProvenanceV1` written by every pass.
Start with a read-time builder (`buildInboxItemDetails`) over the existing rows. It covers every
kind and old items with no migration. Add stored fields only for the gaps below.

### Gap table

| Kind                         | Stored, not shown                                                                                        | Dropped at write time (cheap to keep)                                 | Needs new work                                       |
| ---------------------------- | -------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- | ---------------------------------------------------- |
| Tidy-ups (doc_org, outdated) | cited records + reasons, why now, run id/time/cost, first seen, doc ids                                  | archived doc's parent path + descendants; held auto-apply scores      | full "looked at" set (only ≤6 cited refs are stored) |
| Pick a path (asks)           | records, why now, source                                                                                 | —                                                                     | asks live on the run's brief, replaced each pass     |
| Out of date (radar)          | everything: scores, thresholds, policy, chat message ids, from/to (`freshness_flags`, `freshness_scans`) | —                                                                     | read-time join; bundle id changes on rebuild; 72 h   |
| Want me to…? (audit)         | records, audit link/date                                                                                 | real model id (`model_used` is a label)                               | `confidence` is a constant by priority; don't show   |
| Done for you                 | four scores, model, question-set version, exact undo (`result.auto_apply`, `undo_operations`)            | the bar used (in code)                                                | radar auto-applies live on flags, not suggestions    |
| Check-ins                    | task ids, status; server returns `previous` + `task` per answer and the UI discards them                 | —                                                                     | no stored row, so no history                         |
| Email updates                | `task_id`, proposal, message id                                                                          | email snippet, task's current due date/state, gateway `field_changes` | quote needs prompt change + paid dry run; no Undo    |
| Your answers                 | decisions + results persist; `/api/inbox?status=decided` works, no UI reads it                           | gateway results in `replayLoopOperations` (keeps only counts)         | receipt shape for archives and tree moves            |

### Landmines

- **Model-written `preview.before/after` is unreliable** (TBPN item: both lists identical). Use
  the verifier's decoded operations (`decode-operations.ts`, already before → after) instead.
- **Two before/after shapes:** verifier's pre-formatted strings vs gateway `FieldChange`. The shared
  change row should take already-formatted strings.
- **Rows are rewritten each pass:** `run_id` is the first run, but the words may be from a later
  one. Say "first seen / last confirmed", never "written by run X".
- **Signals are prose** for the nightly review (no "94 days quiet" fields). The "Why it's here" line
  for those is pass + time + first seen + `why_now`, not structured facts. Radar and check-ins do
  have structured signals.
- **Receipts land late:** answer leaves at once, save fires after 5 s, re-verify can take minutes.
  Put the verified before → after on the Cleared-pile entry at answer time (it is
  fingerprint-checked at apply), and confirm on `applied`.
- **Fly targets:** the project tab and tidy-tree After rows exist; the tree re-keys on apply and
  kills a glow. `flyPhrase` takes any target; `pile-fly` is hard-wired to the pile.
- **Run-level view is computable today** from `project_loop_runs` (7 Nov: 6 projects, 7 items,
  1 auto-applied, $0.030). Skipped projects leave no row.
- `ProjectCleanupView` has three consumers (card, inbox index, chat opener): new fields optional.
- `routes/design-system/zz-sort-preview` is committed; remove it.
- Volume is small (about 50 pending items, 1 auto-apply in 30 days).

### Revised options

- **Lean (~3–4 days, web only):** read-time builder; Why it's here + linked chips + What changes
  open by default on every kind; Done-for-you scores vs bar; check-ins link tasks and state the
  rule; fly to project tab/tree row; before → after kept on the Cleared-pile entry.
- **Ambitious (~8–10 days, web + worker):** Lean, plus the per-item timeline, the "last night's
  pass" view, a persistent history of answers, keeping the dropped facts (held scores, archive
  before-state, email quote + highlights, true gateway receipts), and chips/change rows shared
  with chat.

## DJ's picks (2026-11-09)

Ambitious. Trail **always visible** on the card (no click). Answers land on the **project tab,
then the pile**. Scores shown on **every tidy-up**, not only applied ones.

## Build log, round 1 (2026-11-09, uncommitted)

The trail on every card, from what is already stored.

- **Builder:** `inbox/inbox-item-trail.ts` (+test): origin line, why now, cited records as
  new-tab links (`buildEntityHref`), the auto-apply check as rows and a plain verdict.
- **Components:** `InboxItemTrail.svelte`, `InboxAutoCheck.svelte`.
- **Cleanup card:** every item and every ask shows the trail; "What changes" is open by
  default; Done for you shows its four scores against the bar.
- **Check-ins:** task titles link (new tab); the header states the rule; the Cleared-pile entry
  is a receipt ("To do → Done", "Due Nov 5 → Nov 13").
- **Email cards:** linked target task and before → after rows. `listEmailUpdateCards` takes
  `withCurrent` (one extra task read, list route only).
- **Landing:** `flyToPile(from, text, projectId)` flies to the project tab
  (`data-inbox-project-tab`), glows it, then drops into the pile.
- **Worker:** held tidy-ups keep their scores on `rollup.auto_check` (scores, bar, outcome);
  applied ones store the bar beside the scores. No migration (JSON on existing columns).
  Types: `ProjectCleanupAutoCheck`, `ProjectCleanupAutoApplyBar`.

**Checks:** web check 0 errors; eslint clean; inbox + dashboard + email suites pass (129);
shared-agent-ops 10; worker auto-apply + roll-up 37; worker and package typechecks clean.
**Seen in the browser:** temporary `/design-system/zz-inbox-trail-preview` (real Wayne
Strategies items, saves stubbed): trail, chips, scores, email rows render; an answer flies to
the tab, the tab glows, the pile shows the receipt; no console errors. **Delete that route and
`zz-sort-preview` before committing.**

**Not yet:** phone width; the real signed-in inbox; scores on held cards appear only after a
worker deploy and the next nightly review; the one existing Done-for-you row shows scores
without bars (recorded before the bar was stored).

## Build log, round 2 (2026-11-09, uncommitted)

DJ on the look-back view: no fixed picture; "what happened and what is suggested in an
abbreviated BLUF format where I can expand and see the details… organized… drill into the
info." Landing on the actual record: "use your best judgement" → kept fly-to-project-tab +
receipt; revisit after real use.

- **"What happened" in the inbox header** opens a view over the cards
  (`InboxActivity.svelte`): two bottom-line sentences and the last review's totals, then
  **What happened** and **What's suggested**, each grouped by project (one line each), each item
  one line with its state, opening into summary, records, changes, the check and a
  "How it got here" timeline.
- **Builder:** `inbox/inbox-activity.ts` (+test). State comes from status/result/feedback
  fields. Rows of one finding show as one waiting item.
- **Route:** `GET /api/inbox/activity` (signed-in client, RLS): waiting suggestions a review
  touched in the last 30 days, ones settled in the last 7, and that week's review runs.
  Operation args are trimmed to labels.

**Checks:** web check 0 errors, eslint clean, inbox + dashboard + email suites pass.
**Seen in the real signed-in inbox (local dev, live data):** the view loads in about 0.6 s
(1 change made for you, 5 closed on their own, 64 waiting across 12 projects); cleanup cards
show the trail with working links. No console errors.

**Known gaps:** check-in answers and email applies are not in "What happened" (they are not
suggestion rows); radar auto-applies likewise; the payload is about 260 KB.

**Still open:** true receipts from the save step, archive before-state, email quote
highlights (prompt change + paid dry run), chips shared with chat, phone width.

## Check-up (2026-11-13)

- **Committed and pushed** in DJ's `b6e04ab4a` (2026-11-09): rounds 1 and 2, web + worker.
- **Scratch pages went out with it.** `/design-system/zz-inbox-trail-preview` answered 200 on
  production with no sign-in and showed real Wayne Strategies document and task titles. Both
  `zz-` routes are now deleted in the working tree; **needs a commit + web deploy to take it
  down.**
- **Held scores not yet seen in production.** The auto-apply check has not run since 11-07 (no
  `project_cleanup_auto_apply` usage rows after that; 1–2 reviews a night, none with a
  candidate), so 0 rows carry `rollup.auto_check`. Whether the worker deploy has the change is
  unconfirmed.

## Build log, round 3 (2026-11-13, uncommitted except the removal)

DJ: "go ahead and do all these things. Check your work."

- **Scratch pages:** deletion committed and pushed (`ad1f4c67f`, only those two files). Vercel
  did not start a deploy for that push, so the committed tree was deployed from a clean export
  with the CLI (`build-av8i4ovok`). Both pages now return 404 on production.
- **Receipts of what a save changed:** `server/suggestion-receipt.ts` (+test). On apply, the
  steps that landed are stored on `result.receipt` with the before values the integrity check
  read from live state just before the write (no extra reads). The cleanup POST returns one line
  per step; the Cleared-pile entry shows it once saved ("Move document · Brand Direction (Top
  level → Project Context and Strategy)"). "What happened" shows the receipt with a link and
  before → after rows. This also answers where a moved or archived record sat.
- **"What happened" now includes:**
    - "From your email" cards (waiting → suggested; applied / not now / expired → happened);
    - overdue tasks you settled (done, moved, dropped) and projects you paused or finished, read
      from each record's latest project log row by its before/after fields (your own direct
      changes only; a change later put back is left out). No schema change.
- **Email trigger words:** the model may return `quote`; code finds it in the email's
  **subject** and stores only the offsets (`email.subject_quote`); the card highlights those
  words. Words in the body are not kept: published claim G11 says email content is not stored.
- **One record chip:** `ui/RecordChip.svelte`, used by chat step rows and the inbox trail.

**Checks:** web check 0 errors; eslint clean; chat, inbox, dashboard, email and receipt suites
pass (954 tests). **Seen in the real signed-in inbox (local dev, live data):** cards use the
shared chip; "What happened" reads "1 change made for you, you answered 5, 4 closed on their own"
with settled tasks linked and Status: To do → Done. **Narrow width:** a 533 px popup (the
narrowest Chrome opens; below the phone breakpoint) showed no horizontal overflow on the TBPN
and Wayne Strategies cards or in "What happened" with all 71 items open.

**Worker:** Railway deployed `b6e04ab4a` on 2026-11-10, so the held-score change is live. It
has not been exercised: no review since then had a tidy-up to score.

**Pending DJ's OK (paid):**

- one review pass on a project with open tidy-ups to see held scores land (last measured
  2026-10-29: $0.0029 total, roll-up on `deepseek/deepseek-v4-flash`, check on
  `typesafe/jev-1.13`);
- an email-updates dry run to see whether the model fills `quote` (cost not measured yet).

**Open:** body-text email highlights (needs a decision on storing email words); receipts for
changes the worker applies on its own (they show the headline and exact undo today).

## Target architecture (high level; superseded in part by the findings above)

### A. One provenance shape on every inbox item

Add one shared type, e.g. `InboxProvenanceV1` in shared-types, filled in by every pass that
creates or updates an inbox item:

- `origin`: which pass or source (cleanup pass, radar, check-in rule, email update, audit), when
  it ran, model or rule, and the run id. This is the "how it got here" line.
- `signals[]`: the facts that triggered it, as structured fields: overdue since, quiet N days,
  Jev score with its threshold, the email message id. No prose parsing.
- `references[]`: records it read or depends on, `{kind, id, title, projectId}`. These become
  `buildEntityHref` links that open in a new tab.
- `changes[]`: what answering will do, per record: `{kind, id, op, field_changes[]}`, plus doc-tree
  moves as before → after paths. Reuse `FieldChange` (`shared-agent-ops/gateway/field-changes.ts`)
  so chat and inbox show changes the same way.
- `source_quote?`: for email- or message-driven items, the words the change came from, found in
  the source text by `locateSourceQuote`.

Older items without provenance render as today. Don't backfill unless Phase 0 shows it's cheap.

### B. Card anatomy (every kind)

1. **Why it's here:** one line from `origin` + `signals` ("Nightly tidy pass, 3:12 AM · last
   edited 94 days ago · Jev 0.88 ≥ 0.85").
2. **What it looked at:** reference chips, clickable (the chat's `step-entity` style).
3. **What will change:** before → after rows (the chat's `step-change`), or the doc-tree diff.
4. **The answer controls** as today; the Cleared pile and Undo stay.

Build these as small shared components (for example a `ProvenanceStrip`, `ReferenceChips` and
`ChangeRows`), fed by one pure `buildInboxItemDetails(item)` module that mirrors
`buildStepDetails`. Chat and inbox should end up sharing the chip and change-row pieces.

### C. Watch it sort, in the inbox

- **When an item is answered:** its change flies from the card to its destination (project,
  doc-tree slot, or the Cleared pile), and the destination row glows. This replaces "the card just
  disappears."
- **For email and check-in items:** the source words light up by kind, the same as the chat's
  `UserMessageText` marks.
- **When the inbox opens after a pass:** optionally sort new items into their groups visibly
  (the demo's arrival). Phase 0 decides whether this helps or is noise.

### D. "How it got here" (the under-the-hood view)

A per-item timeline, expandable from the card:

1. **Signal:** what tripped it.
2. **Pass:** which job, when, which model or rule, and cost if known.
3. **Decision:** Jev score vs bar, or the model's structured reason field.
4. **Card:** what was proposed.
5. **Your answer.**
6. **What changed:** the receipt, with Undo.

Optional: a run-level view, "Last night's pass looked at 12 projects, made 7 items, auto-applied
2," so DJ sees the pipeline, not just its output.

## Lean vs ambitious (to refine after Phase 0; pitch both to DJ)

- **Lean (~3–5 days):**
    - the provenance shape on the two or three busiest kinds (likely tidy-ups, check-ins, "Out of
      date");
    - "Why it's here", reference chips and before → after on those cards;
    - the fly-to-destination on apply.
- **Ambitious (~2 weeks):**
    - provenance on every kind, written by every pass;
    - the full "How it got here" timeline;
    - email source-word highlights;
    - the run-level pass view;
    - shared chip and change-row components used by both chat and inbox.

## Reuse list (from 155, already built)

| What                                             | Where                                                                                                                                        |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Quote finder (exact → close → fuzzy)             | `packages/shared-types/src/source-quote.ts`                                                                                                  |
| Links for any record kind                        | `buildEntityHref` in `packages/shared-types/src/record-routes.ts`                                                                            |
| Before → after from a gateway update             | `packages/shared-agent-ops/src/gateway/field-changes.ts` (task, goal, milestone, plan, risk, project and doc updates return `field_changes`) |
| Step → links/changes/receipt (pattern to mirror) | `apps/web/src/lib/components/agent/agent-chat-step-details.ts`                                                                               |
| Phrase marks + split                             | `agent-chat-phrase-marks.ts`, `UserMessageText.svelte`                                                                                       |
| Flight + landed glow                             | `apps/web/src/lib/components/agent/phrase-flight.ts`; the inbox has `inbox/pile-fly.ts`                                                      |
| Chip/badge/change-row styles                     | `ThinkingBlock.svelte` (`.step-entity`, `.step-action`, `.step-change`) — extract when shared                                                |
| Scripted visual check                            | the pattern in `routes/design-system/zz-sort-preview` (a temporary scratch route; delete it before committing)                               |

## Rules for the agent

- **Process:**
    - interview DJ before a nontrivial build;
    - pitch lean and ambitious;
    - make technical calls yourself.
- **Paid runs:** ask before every one, with scope, cost and the acting model. Never report an
  unrun paid check as passing.
- **Never classify language with regex.**
- **pnpm only.** Run the narrowest tests (`pnpm --filter <pkg> exec vitest run <files>`) and
  respect test-gate.
- **svelte-check kills the dev server:** run `touch apps/web/vite.config.ts` after it.
- **Migrations:**
    - rehearse with `pnpm db:rehearse`;
    - never edit an existing migration file;
    - ask before production writes.
- **Commits:** only DJ commits, and always with explicit pathspecs. Other sessions share these
  files.
- **Copy:**
    - never name Jev in user-facing copy (say "the check" or show the score without the name);
    - Inkprint tokens, light and dark, phone width.
- **Never generate images.**

## Status

- [x] Phase 0 research + explainer + options (2026-11-09) → waiting on DJ's pick
- [x] A. Provenance: read-time builder + held scores stored (round 1)
- [x] B. Card anatomy (round 1; phone + signed-in check pending)
- [x] C. Watch it sort (fly to project tab, pile receipts, subject highlights; body-text highlights need a storage decision)
- [x] D. How it got here (per-item timeline + What happened view, round 2)
- [ ] Finish: reload restore (done via What happened), narrow width (done, 533 px), browser check (done), paid live check (needs DJ's OK)
