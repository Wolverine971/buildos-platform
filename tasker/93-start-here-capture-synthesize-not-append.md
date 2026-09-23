<!-- tasker/93-start-here-capture-synthesize-not-append.md -->

# 93 — START HERE capture adds to the doc instead of rewriting it

**Created:** 2026-09-22. **Owner:** next implementation agent; DJ owns the product fork below.
**Status:** Code fix BUILT 2026-09-22. It was committed and pushed in `5f69e79bd` (DJ's "updates"
commit, 15:54); the worker deploy is unverified. Free local tests pass. DJ
DEFERRED the one-time cleanup (step 6) on 2026-09-22; do not run it without a fresh ask. The
optional paid check has not run and needs approval. See "Implementation log" at the end.
**Superseded 2026-09-23:** tasker 95's checkpoint capture replaced the close-time processor
(`startHereCaptureProcessor.ts`, deleted in `6660f80ce`), so "review the first live proposals" no
longer applies. `reconcileStartHereAuthoredSections` has no production caller now; it is tracked
in tasker 96. What remains here: the deferred damaged-doc cleanup (step 6).
**Scope:** the background job that runs after a chat and proposes START HERE updates. Do not
change the managed `status`/`map` regions or the Start Here type guard.

## Symptom (production evidence)

Project `445dd429-db93-4878-90a9-b3ab1627a9f2` ("100-Day Book Project"), START HERE document
`1fc5b3c2-4d63-4b4f-bcbb-58dec9262795` (`type_key = document.context.project`, 6,152 chars,
last updated 2026-08-30 16:30 UTC). Read-only production queries on 2026-09-22 show:

- `## What this is` has two contradictory paragraphs: a "fiction" one and a "nonfiction" one.
- `## Decisions` holds 8 bullets that say about 4 things. "Book Contract locked" and
  "Anti-fragility as backbone/core philosophy" each appear twice. Dates are the literal
  `_(YYYY-MM-DD)_` (×2) and `_(2025-04-14)_` (×6); the project was created 2026-08-20.
- `## Current state` stacks three paragraphs. The stale "No work on the template has been done
  yet" sits above "Day 1 complete".
- `## Vocabulary and mental model` defines Hidden knowledge, Leverage, Anti-fragile/Anti-fragility,
  and Hacks twice, with different wording.
- Above the first authored section, an unmanaged preamble from project creation ("Welcome to your
  100-day book workspace … fiction production model for a ~60,000-word novel") also contradicts the
  nonfiction direction. The capture job never touches it, so it stays stale.

DJ suspected a separate loop, and he is right. The writer is the worker's post-chat
classification job, not the chat turn. The project has 5 `agent_runs` labeled
`Update project START HERE`: 3 `completed` (applied), 1 `partial`, and 1 `failed`
("stranded: no active worker"; its change set is still `pending`). They were created between
2026-08-22 and 2026-08-30. Each one appended to the doc, and DJ approved each one in the AI Inbox.

## Root cause

Path: `apps/worker/src/workers/chat/chatSessionClassifier.ts:504` →
`processStartHereCaptureProposals` (`apps/worker/src/workers/chat/startHereCaptureProcessor.ts:235`)
→ `appendStartHereAuthoredSectionUpdates` (`packages/shared-agent-ops/src/ontology/start-here.ts:431`)
→ staged `onto.document.update` with `update_strategy: 'replace'` (processor `:319-330`) →
agent run with `review_required: true` → AI Inbox approval.

1. **The job can only append.** `appendToAuthoredSection` (`start-here.ts:397-413`) inserts the
   new markdown at the end of the section's bounds. The only way to change a section is to add
   to it. Nothing replaces, supersedes, or removes older text.
2. **The capture model never sees the current doc.** `buildCapturePrompt` (processor `:139-155`)
   sends the project name, session summary, and the last 24 chat messages. Existing START HERE
   content is never included. The model cannot tell that "Book Contract locked" is already
   recorded, or that "No work done yet" is now false. Each session re-derives the same facts
   in new words.
3. **Dedupe is exact-match and limited to one response.** `normalizeUpdates` (`:111-125`) keys on
   `section:markdown` within one LLM response. It never compares against the document, so
   reworded repeats always get through.
4. **The dates are invented.** The system prompt example is literally
   `"- **Decision** - rationale. _(YYYY-MM-DD)_"` (`:76`), and neither prompt contains today's
   date. `buildCapturePrompt` drops `created_at` (`:149-151`). A `fast`-profile model either copies
   the placeholder or guesses a date from its training data (hence 2025-04-14).
5. **Human review does not help.** Each proposal's diff shows only additions
   (`DocumentProposalDiff.svelte`), and every addition looks reasonable by itself. The drift guard
   in `packages/shared-agent-ops/src/gateway/change-set.ts:224` protects against concurrent edits,
   not against content that is semantically redundant.

Confidence: **high** for 1–4 (code plus matching production rows); **medium** that no other writer
contributed. The chat agent can also call `update_onto_document`; check the document's version
history before the one-time cleanup.

## Fix direction: reconcile, don't append

1. **Give the model the current sections and the date.** Pass the authored body
   (`stripStartHereManagedRegions(ensured.document.content)`) and `today` in the user's timezone
   into the prompt. Move `ensureProjectStartHereDocument` (`:280`) to run before the LLM call.
   Replace the `YYYY-MM-DD` example with an instruction to use the supplied date. Code sets the
   date: reject or overwrite any date that is not today or taken from a message's `created_at`.
2. **Return whole sections, not snippets.** Change the response contract to
   `{ sections: [{ section, markdown, rationale }] }`, where `markdown` is the complete new body
   for that section, merged with what is already there. Rules for the prompt:
    - One canonical paragraph for _What this is_. When the direction changed, newest wins.
    - _Current state_ is a snapshot: replace it, never accumulate history.
    - _Decisions_: one bullet per decision. A superseded decision is rewritten or struck through,
      not repeated.
    - _Vocabulary_: one definition per term.
    - _Open questions_: remove questions the chat answered.
3. **Add a code-side replace helper.** Add `replaceStartHereAuthoredSections(body, updates)` in
   `start-here.ts`, next to the append helper and reusing `findSectionBounds`. It swaps only the
   named sections' bodies and leaves managed fences and unnamed sections alone. Keep
   `sanitizeStartHereAuthoredMarkdown`.
4. **Add deterministic guards after the model runs.**
    - Normalized-text dedupe of Decision bullets (strip dates and punctuation, compare bold titles).
    - Cap each section's length.
    - If a returned section is empty while the current one is not, keep the current one
      (the model must not be able to wipe a section).
5. **Keep one pending proposal per project.** Before staging, mark any older pending
   `Update project START HERE` run for the same project as superseded. Otherwise two stale
   append proposals can still be approved in sequence. The `partial` run shows this already
   happened.
6. **Clean up the existing doc once.** _(Deferred by DJ, 2026-09-22.)_ Run the new reconciler against doc `1fc5b3c2…` as a normal
   reviewable proposal. Do not edit it directly in production. The pre-section "Welcome…" preamble
   is outside authored sections. Flag it in the proposal, or fold it into _What this is_.

**Product fork for DJ (veto-able):** keep human review for full-section rewrites, with the diff
showing removals. Do not auto-apply. Rewrites can delete text the user wrote by hand, so review
stays the safety net, and the diff finally shows what gets replaced.

## Acceptance criteria

- A capture over the fixture below produces ≤1 paragraph in _What this is_ (nonfiction), ≤5
  distinct Decision bullets with no duplicate titles, and a single _Current state_ paragraph with
  no "No work … done yet".
- No `YYYY-MM-DD` literal and no date before the project's `created_at` ever reaches a staged
  proposal (enforced in code, not only by the prompt).
- Managed `status`/`map` regions stay byte-identical, and the staged content still excludes them
  (the existing `stripStartHereManagedRegions` contract).
- A second capture of the same chat proposes nothing, because the reconciled output equals the
  current body (`:310` short-circuit).
- Creating a new proposal marks any older pending proposal for the same project superseded.

## Tests (free, local; no model calls)

- **Fixture:** save the production authored body of doc `1fc5b3c2…`, captured 2026-09-22, as
  `packages/shared-agent-ops/src/ontology/__fixtures__/start-here-100-day-book.md`. Its content is
  DJ's own project, and the other documents it references are ids only.
- **Unit tests in `start-here.test.ts`:** `replaceStartHereAuthoredSections` replaces only the
  target section; the managed fences survive; an empty-section update is rejected; Decision dedupe
  collapses the fixture's two "Book Contract locked" bullets.
- **Processor test** in `apps/worker/tests/startHereCaptureProcessor.test.ts` with a mocked
  `SmartLLMService` and supabase:
    - The prompt includes the current authored body and today's date.
    - A canned model reply containing `YYYY-MM-DD`/2025 dates is corrected or rejected.
    - A reply identical to the current body stages nothing.
    - An older pending run is superseded.
- **Regression:** extend `apps/web/src/lib/services/ontology/start-here.regression.test.ts` with
  the fixture. Replay the four historical captures as canned replies and assert the end state has
  no duplicate headings, terms, or decisions.
- **Optional paid check:** one live capture against a disposable copy of the fixture. It is paid,
  so ask DJ first with the model and cost stated.

## Implementation log (2026-09-22)

**Built (in `5f69e79bd`):**

- `packages/shared-agent-ops/src/ontology/start-here.ts`: `readStartHereAuthoredSections`,
  `replaceStartHereAuthoredSections` (also collapses duplicate headings and inserts missing sections
  in canonical order, outside the map fence), `stripStartHereAuthoredSections`,
  `normalizeStartHereDateStamps`, `dedupeStartHereBulletList` (stemmed bold-title key, newest
  wins, `~~struck~~` bullets kept), and `reconcileStartHereAuthoredSections` (empty / too_long /
  locked / unchanged guards; per-section caps in `START_HERE_SECTION_MAX_CHARS`).
- `apps/worker/src/workers/chat/startHereCaptureProcessor.ts`: ensures the doc before the LLM
  call. The prompt now carries the current sections (as `<section>` blocks), read-only outside
  text, today's date and the project's creation date in the user's timezone, and day-stamped
  messages. The reply contract is `{ sections, outside_note? }`; the old `updates` shape is
  ignored. The new capture builds on the newest non-stale pending proposal, and older
  `proposal_ready` runs become `cancelled` with a `superseded:` error.
- `packages/shared-agent-ops/src/inbox-index.ts`: a `cancelled` run with a `superseded:` error
  maps to inbox `expired` ("Replaced by a newer proposal"), not `blocked`.
- Fixtures: `__fixtures__/start-here-100-day-book.md` (prod doc, byte-exact) and
  `…pre-capture.md` (the doc before the first capture, from run e893c246's `before`).
  `**/__fixtures__/**` was added to `.prettierignore`.
- Design doc §6.3 is updated.

**Deviations from the plan above:**

- Dates: an invalid stamp is DROPPED, not rewritten to today. A placeholder on a bullet that
  already existed also drops, because its real date was never captured. Only a placeholder on a
  new bullet becomes today. The guard covers `_(date)_` stamps; dates in prose are untouched.
- One proposal per project: instead of discarding the older pending proposal's content, the new
  capture uses it as the base when it still applies cleanly, so nothing already captured is lost.
- The review diff already showed removals (`UnifiedDiffView`). No UI change was needed.

**Tests (free):** shared `start-here.test.ts` 19; worker `startHereCaptureProcessor.test.ts` 6 plus
`inboxIndex.test.ts` (+1); web `start-here.regression.test.ts` 18. The replay test shows the OLD
append pipeline over the four reconstructed captures reproduces the production doc's sections
exactly. The reconcile path with a lazy "paste current + snippet" model ends with no duplicate
headings, terms, or Book Contract/100-day decisions, and no invented dates. Typecheck
(shared-agent-ops, worker) and eslint are clean. The shared-agent-ops dist was rebuilt.

**Known limits:** semantic duplicates with different titles ("Anti-fragility as core philosophy"
vs "…as backbone") and stacked paragraphs in _What this is_ / _Current state_ rely on the model.
The deterministic layer only catches same-title repeats. Rewrites can drop still-true text, and
human review is the safety net.

**Prod sizing (read-only, 2026-09-22):** 123 START HERE docs; 43 capture runs from 3 users;
only DJ has ever applied one; 7 docs with applied captures carry placeholder or pre-2026
stamps; 5 capture runs are still `proposal_ready`.

**Side finding, since fixed (2026-09-22):** run `aecfb6b1…` is DJ's approval from 2026-09-04.
The commit claimed the run, executed nothing, and `agentRunStrandedSweep` finalized it as
`failed`. The sweep now routes `running` runs that carry `commit_started_at` to
`recoverStalledCommit` in `change-set.ts`: nothing applied -> back to review; some applied ->
honest `partial`. See `02-STAGED-MUTATIONS.md` §5 step 7. Run `aecfb6b1` itself was left as-is
(an old append-style proposal).

**Pending:**

- Confirm the Railway worker is running `5f69e79bd` or later; the web app gets the inbox mapping.
  The post-commit doc edits in this file, `tasker/README.md`, the design doc §6.4 and the
  activation plan are still uncommitted.
- After deploy, review the first real proposals: the diff should show removals, there should be
  at most one pending proposal per project, and no invented dates.
- Optional paid live check on a disposable copy. It needs DJ's approval, with the model and cost
  stated.
- Step 6 cleanup of the damaged docs: DEFERRED by DJ (2026-09-22). This is 7 docs, all DJ's.
  They are fixed only when a new capture touches a section, or by a future librarian pass
  (design doc §6.4).

**Docs updated:** `PROJECT_START_HERE_DOC_DESIGN_2026-06-23.md` (§6.3 contract, §6.4 librarian
scope, surface table, P5, touch points, open question 2);
`AGENTIC_CHAT_PROMPT_LESSONS_POCOCK_2026-09-22.md` (the proposed Start Here tool must rewrite
through the reconciler, not append); `activation-start-here-daily-brief-plan-2026-07-10.md`
(sample only post-deploy capture runs); and `tasker/README.md`.
