<!-- tasker/96-capture-followups-from-book-loop.md -->

# Tasker 96 — Capture follow-ups found by the book loop (after tasker 95)

**Status:** Second pass 2026-09-23: Finding 10 fixed, and findings 1, 5, 6 and 7 verified or fixed (see
"Results, 2026-09-23 second pass" at the end). Uncommitted. Open: one product fork on Current state,
Finding 8, and three small leftovers · **Opened:** 2026-09-22 · **Source:** book dogfood loop, isolated QA DB,
project `445dd429-db93-4878-90a9-b3ab1627a9f2`.
**Related:** tasker 95 (closed; design in
[START HERE design §6.3](../apps/web/docs/technical/architecture/PROJECT_START_HERE_DOC_DESIGN_2026-06-23.md)).

## How it was observed

After tasker 95 landed, the six book-loop sessions were backfilled on QA:
`chat-checkpoint-backfill.ts --user f4af62e7-… --project 445dd429-… --include-recent --apply`, spending $0.0035.
The result was 6 captured, 6 thinking-log entries and 6 reviews staged. The output snapshot is
`output/book-loop/docs-after-backfill.json`.

## Findings

1. **START HERE piles up again, at the "addition" level.** Additions auto-apply without checking them
   against content already in the doc:
    - **"What this book is"** gained three paragraphs that restate each other ("explicitly
      nonfiction…", "fully converted from fiction…", "core theme is social anti-fragility…").
    - **Decisions** gained "Nonfiction, not fiction" plus "Nonfiction confirmed" plus "Project fully
      converted to nonfiction", and "Theme direction: social anti-fragility" plus "Theme sharpened:
      social anti-fragility…".
    - **Production roadmap** gained two meta notes ("now fully aligned…", "Phase 2 is now…").
    - **Fix direction:** give the capture model the current section text and require it to _merge_
      rather than add: supersede a near-duplicate claim by rewriting that claim. A rewrite of an
      existing claim goes to review under the 95 rules, so decide whether "same claim, sharper wording"
      can auto-apply. Add a judge check to `capture-eval` that scores duplicate claims.
    - The sessions here repeat themselves because the loop replayed one message four times, but real
      users also repeat themselves across chats.
2. **Contradictions survive.** "Exclusions dropped" is a Decision, yet `Current state` still says
   Exclusions is "still blank" and `Open questions` still asks about Exclusions. Backfill locks
   `Current state` by design, but the live sweep should reconcile it. A decision that closes an open
   question should remove that question (a review-lane rewrite is fine).
3. **Meta noise.** "START HERE doc cleanup — should the doc be restructured?" was captured as an
   open question about the book, but it was a product complaint. Captured questions should concern the
   project's subject.
4. **Six staged reviews for one doc.** Tasker 95 says one pending proposal per project. Verify what
   the backfill did; it reported "6 review(s) staged".
5. **Thinking-log noise.** Pure logistics messages ("Where are we at? What do we have to do today?")
   and four identical replays became entries. Consider letting the capture model mark an entry as
   no-log through structured output, not regex. The user's-own-words rule still holds for real
   thinking.
6. **Chat context lists deleted documents.** The `capture-eval/e2e-qa` run "restores state" by
   deleting its thinking-log docs, but it left their IDs in `onto_projects.doc_structure` and
   `onto_project_logs`. The chat prompt's knowledge map and "Recent project changes" then showed three
   Thinking logs, and the model asked the user which one to use (t07). The same thing can happen
   whenever a document is deleted but still referenced. Fix both sides:
    - the e2e cleanup;
    - the context loader should drop references to documents that no longer exist or are
      soft-deleted.

## Already fixed (2026-09-22, uncommitted)

- `apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts` (identity/mission) now
  tells the chat that thinking is saved automatically: it should engage with the substance, never ask
  where to save it, and never write to the Thinking log. t07 asked "where should I record this?";
  the rerun t07b engaged in 15s with no tools.

## Moved from tasker 95 (closed 2026-09-23)

Tasker 95 (checkpoint capture) is live in production (`6660f80ce`). Its design and evidence now
live in `apps/web/docs/technical/architecture/PROJECT_START_HERE_DOC_DESIGN_2026-06-23.md` §6.3
and in `apps/worker/docs/WORKER_JOBS_AND_FLOWS.md`. DJ declined the production backfill. The
leftover work:

**Built 2026-09-23 but uncommitted (worker, shared-agent-ops, eval).** These address findings 1, 5
and 6 above in part:

- Section spacing is preserved, so a capture's diff shows only the changed lines
  (`applyStartHereSectionBodies`).
- The user's paragraph breaks are restored in the thinking log (`restoreParagraphBreaks`), and
  the prompt now asks for them.
- **Finding 1, in part:** every `add` carries a model-declared `restates: <bN>|null`, and code
  drops self-declared restatements. The judge now scores `restated_lines`.
- **Finding 5:** log passages carry a model-declared `kind`; `"instruction"` passages are not
  logged.
- **Finding 6, e2e side only:** `e2e-qa.mts` now seeds START HERE from the frozen fixture and
  restores an existing thinking log instead of deleting it. The context-loader side is still open.
- The kill switch (`CHAT_CHECKPOINT_CAPTURE_ENABLED=false`) now also stops the chat-close path and
  jobs already in the queue.

**Open:**

- [x] **Verify `restates` and `kind` on the real model** (2026-09-23): two judged eval runs scored 100
      with 0 restated lines and the log 100% in the user's words. Read by hand, both were clean on
      duplicates and log noise.
- [x] **Commit and deploy:** the batch above shipped in `f212700b1`, which is live on Vercel and
      Railway.
- [ ] **Browser check of the receipt chip and Undo.** Neither has ever been clicked in a real
      browser.
- [ ] **Measure turn latency before and after.** By design nothing runs in the turn, but no
      number exists.
- [ ] **Verify the `fiction_story_craft` fix** (explicit instructions are commissions in every
      mode; `evals.md` Task 4) with one paid run of that task. It needs approval.
- [ ] **Dead code** (still open, no user impact): `reconcileStartHereAuthoredSections` (tasker 93) has no production caller
      since `startHereCaptureProcessor.ts` was removed. Delete it along with its tests, or reuse it.
- [x] **Finding 4 checked (2026-09-23, QA):** superseding works. After the backfill, one proposal
      was `proposal_ready` and the rest were `cancelled`. "6 review(s) staged" counts stagings,
      not proposals left pending.
- **Ops landmine:** a local `pnpm dev` worker (`tsx watch src/index.ts`) with no env override loads
  `apps/worker/.env` = PRODUCTION and processes prod queue jobs next to Railway.
- **QA note:** the 01:17Z QA backfill's thinking log was deleted by the old e2e cleanup and
  rebuilt from receipt entries (`57a67a0e…`).

## More findings (t07–t10 capture, 2026-09-22, $0.0021)

7. **A candidate was promoted to a settled claim.** START HERE now reads "The one big reveal: effort looks
   different now…", and Vocabulary lists "Reveal — the book's central counterintuitive claim…". DJ
   explicitly said "I don't know… I think I'll know that at the end." BuildOS only offered it as a
   _candidate_. Capture must keep the user's certainty level: tentative ideas go under Open questions or
   "Candidates", never under Decisions or settled prose.
8. **Recall gaps.** DJ's YC "first users are the people you know" idea, "help people tell their
   stories", and "a modern Tools of Titans / 4-Hour Workweek with an AI twist" are in the thinking log
   but not in the START HERE synthesis. These may be judgment calls, but "the book's model is a modern
   Ferriss" is a durable positioning decision.
9. **The thinking log works.** t07–t10 are captured verbatim and in order.

## Finding 10: `Current state` echoes chat claims instead of project state (2026-09-23, QA)

This is the highest-impact item in this file, because it makes START HERE self-reinforcingly stale.
Last night the chat wrote a full first-pass outline into `Book Contract & Chapter Blueprint Template`
(t12, `update_onto_document` succeeded). This morning a fresh chat read the stale START HERE and said
"Blueprint: not started" (t13). The idle captures of both sessions then wrote into `Current state`:
"**Blueprint:** not started — first-pass chapter outline not yet drafted."

- The loop is: stale START HERE → the chat repeats it → capture records the chat's claim → START HERE
  stays stale.
- **Fix direction:** ground `Current state` in the project's own records rather than message text:
  document updated_at and content presence, task states, and write receipts from the session's tool
  executions (`chat_tool_executions` / the turn write ledger). Assistant prose is not evidence of
  state.
- Reproduce with `scripts/book-loop/checkpoint.sh --idle` on the QA clone. Sessions `4c9e4750…`
  (t07–t12) and `ef164c69…` (t13).

## Results, 2026-09-23 second pass

**Finding 10, fixed at the root.** QA records show what happened. At 04:40:44 the outline chat's capture
correctly wrote "Blueprint: first-pass chapter outline drafted". Six seconds later, the capture of
the read-only "where are we at?" chat (t13) overwrote it with that chat's stale "not started". Capture
treated assistant prose as news. Changes:

- `loadMessages` now also returns the chat's **write receipts** for the same window:
  `chat_tool_executions` rows that succeeded, are not reads, and carry `affected_entities`. The
  synthesis prompt lists them as `[cN] <tool>: <kind> "<title>"`, or says outright "Changes this chat
  saved: none."
- **A validator on structured output:** a Current state edit must cite `evidence`, either a user
  message id from this window or a `cN` receipt, or code drops it (`skipped: no_evidence`). Assistant
  messages carry no ids in the prompt, so an assistant's status read cannot be cited.
- **The prompt rule:** assistant text is not evidence. Work it claims counts only with a receipt, and
  a user's request is not its result.
- The eval fixture now carries the real receipts. Before, it had none, so a production input was
  missing from the eval.

Verification (DeepSeek V4 Flash, in memory, `probe-current-state.sh` replays the two real 04:40 captures):

| Case                                                                                          | Before the fix                                               | After the fix                                                                                        |
| --------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Outline chat, with its `update_onto_document` receipt                                         | wrote "drafted"                                              | 11/11 write "drafted"                                                                                |
| Status-only chat, no receipts                                                                 | wrote the stale "not started"                                | 11/11 leave the correct line alone; the model complies, and the code check never had to fire         |
| Eval fixture: the user asked to convert to nonfiction, the chat said "Nothing has landed yet" | Current state claimed "converted… type now nonfiction" (0/2) | 2/3 left alone; 1/3 still wrote "Project reframed… renamed, retyped" while citing the user's request |

**Other findings**

- **1 (pile-up):** `restates` holds on the real model (above).
- **2 (contradictions):** added "keep Current state consistent with Decisions" and "remove questions a
  decision settles". This is **partial**. When the chat itself drops Exclusions, Current state updates.
  But a stale line the chat never touches ("Exclusions (still blank)") survives every run, because
  capture only edits what the chat changes.
- **3 (meta noise):** added "Open questions are about the project, not about BuildOS or this
  document". Built, but not reproduced by the eval fixture.
- **5 (log noise):** `kind` holds. Instruction-only messages were skipped, and fidelity is 100%.
- **6 (deleted docs):** the product path is already safe. `atomic_document_delete` (2026-08-03) removes
  the document from `doc_structure`. The stale nodes came from the e2e deleting rows directly, which
  is fixed. The two dead Thinking-log nodes were pruned from the QA clone's tree (backup in the session
  scratchpad). **No loader change is needed.**
- **7 (certainty):** added "keep the user's certainty; an unsure idea goes under Open questions". In the
  eval, the undecided theme landed as "User is unsure yet. Candidate direction…", not as a decision.
- **8 (recall gaps):** not addressed. It is a judgment call, and the scope guard applies.

**Spend:** $0.036 of model calls over 12 runs (3 probes, 2 judged evals, 3 capture-only evals, 1
final probe, 1 lost-output probe).

**Known gap: a request can still be recorded as done.** When the user asks for a change, the chat
saves nothing, and capture runs, Current state can still claim the change happened. That happened
in about 1 run in 3 on the eval fixture after the "a request is not its result" rule, and 2 of 2
before it. The model cites the user's request as evidence. The code check can only confirm that a
real user message was cited, not whether it reports progress or asks for it, and telling the two
apart would mean classifying language.

**Structural fix, recommended when needed.** Decision on 2026-09-23 (DJ): hold, and document it.

- Auto-apply a Current state rewrite only when its `evidence` includes a `cN` receipt.
- A rewrite backed only by user messages joins the project's single "Update project START HERE"
  review proposal, the way removed and reworded lines already do.
- The rule reads a structured field, not language, so it closes the gap completely. The code change
  is small: in `checkpointCapture.ts`, route evidence-without-receipt Current state bodies into the
  review lane instead of `autoBodies`, then add a test.
- The cost is friction: progress the user reports from outside BuildOS ("I finished chapter 3 in
  Docs") waits in the AI Inbox until approved.
- Why hold: the chat bug behind unbacked "done" claims (describing a change instead of calling the
  tool) was fixed on 09-22, and the common loop (status reads) is now 11/11.
- Revisit trigger: an unbacked "done" line shows up in Current state in the book loop or in
  production receipts.

Documented in START HERE design §6.3 ("Known gap" and "Recommended structural fix") and §12 question
2a.

**Files:** `apps/worker/src/workers/chat/checkpoint/{capturePrompts,checkpointCapture,memoryPorts,supabaseCheckpointPorts}.ts`,
`apps/worker/tests/chatCheckpointCapture.test.ts` (14 pass; 2 new), `scripts/book-loop/capture-eval/`
(`probe-current-state.{mts,sh}` new; fixture gained `savedChanges`). Worker typecheck and test-type
check are clean. The QA e2e (`e2e-qa.sh`) was not rerun.

**Still open from tasker 95:** browser check of the receipt chip and Undo; turn-latency number;
`fiction_story_craft` paid check; dead-code delete.

## Finding 11: decisions don't reach the documents they change (2026-09-23, prod)

"Exclusions dropped" has been in START HERE Decisions since 09-22, but the Book Contract doc still says
`**Exclusions:** [To be defined…]` and the Book Contract task still mentions "deliberate exclusions". The
chat trusts the contract (the source) over START HERE (the summary), so it keeps asking DJ about
Exclusions. Capture only edits START HERE. At minimum, capture should flag a decision that contradicts
a loaded source doc (for example as an Open question, "Contract still lists Exclusions — remove?"), or
the chat should apply the edit in-turn when the user gives the instruction. Surgical edits (tasker 98)
make that affordable.
