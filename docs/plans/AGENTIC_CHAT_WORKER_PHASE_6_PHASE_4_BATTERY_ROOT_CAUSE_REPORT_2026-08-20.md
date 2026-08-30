<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_6_PHASE_4_BATTERY_ROOT_CAUSE_REPORT_2026-08-20.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-08-26; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Phase 6 · Phase 4 Battery — Root-Cause Report

**Date:** 2026-08-20 (investigation ran 22:15–23:00 EDT, same evening as the battery)
**Answers:** `AGENTIC_CHAT_WORKER_PHASE_6_PHASE_4_BATTERY_FAILURE_INVESTIGATION_HANDOFF_2026-08-20.md`
**Method:** Agent Surfaces Framework (`docs/architecture/agent-first-orchestration/AGENT_SURFACES_FRAMEWORK.md`) — audit the instrument first, then reconstruct what each model's window actually contained at the decision point.
**Evidence:** battery artifact (SHA `686d35ce…`, now preserved at `docs/plans/evidence/agentic_chat_worker_phase6_post_railway_phase4_battery_2026-08-20_49dcd5a2b.json`); retained prod rows for all 15 failed/control turns (`chat_prompt_snapshots`, `chat_tool_executions`, `llm_usage_logs`, `chat_turn_events`, `chat_turn_runs`); the four prior six-class artifacts; `git diff 36955954c..49dcd5a2b`.
**No behavior was changed. No paid battery was run.**

---

## 0. One-paragraph answer

The handoff framed this as three behavioral clusters on the agent. Reconstructing each decision from the retained prompt snapshots and tool rows shows something different: **every one of the 13 failures is explained by two harness-design facts and one instrument defect, none of which is new code at `49dcd5a2b`.** (1) All eight "over-clarification" turns were **vetoes by the semantic reviewer** (`gpt-5.6-luna`), not hesitation by the acting model — and every veto objected to the _form_ of the acting model's contract or batch (lumped target lists, a cardinality typo, an extra outcome, an inferred date, a partial batch), not to genuine user ambiguity. The reviewer's only exits are _approve exactly / declare read-only / ask the user_, so every form defect it catches becomes a user interruption. (2) All three "under-restraint" turns show the reviewer approving a guess while the three matching tasks sat in its own input; it is confirmation-framed and never made to enumerate candidates. (3) All three "relative-date" failures are the harness asserting in `America/New_York` against a prompt that says `Current time: 2026-08-21T00:17Z · Timezone: UTC` for a harness user whose profile timezone is `UTC` — it was Friday in the prompt, and "Friday" → `08-28` is correct for that context. That timezone hole is also **live for 112 of 120 real users**. Once the instrument artifact is removed, the run is statistically indistinguishable from the last passing battery (`p = 0.46`).

---

## 1. Instrument audit (done first, per the framework)

| #   | Finding                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Status        | Effect on this battery                                                                                 |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------ |
| I-1 | **Timezone split-brain.** `task-reschedule-cold-reference` computes `expectedFriday` with `nextWeekdayDate(now, 5, 'America/New_York')` (`harness/assertions.ts:470`). The harness user `76c04859…` has `users.timezone = 'UTC'` (nothing in `harness/` ever sets one). The prompt renders `- Current time: <ISO Z>` / `- Timezone: UTC` (`build-lite-prompt.ts:724-725`, fed by `context-loader.ts:1964 timezone: 'UTC'`). The scenario is therefore valid only while EDT and UTC share a calendar date — roughly 04:00–20:00 EDT. This battery ran 20:03–20:26 EDT. | **CONFIRMED** | Cluster 3 entirely (3/3 reschedule reps). Prior 3/3 passes ran at 12:48 EDT.                           |
| I-2 | **Underpowered comparison.** 3 reps/scenario cannot separate the pass rates actually in play (25–60% on a stochastic reviewer veto). Fisher exact: 5/18 vs 11/18 → `p = 0.092`; excluding the I-1 artifact, 5/15 vs 8/15 → `p = 0.46`. The handoff's "regressed sharply" is not supported.                                                                                                                                                                                                                                                                            | **CONFIRMED** | The headline number is noise plus I-1.                                                                 |
| I-3 | **No decision attribution in the artifact.** Control-tool rows (`declare_turn_contract`, `request_turn_clarification`, `approve_*`) do not record _which model_ emitted them. Attributing the eight clarifications to the reviewer required joining `llm_usage_logs` by timestamp (`routeId: openrouter_semantic_reviewer`) against `chat_tool_executions.sequence_index` by hand. tasker/56 §"decisive question" asked exactly this and the instrument still can't answer it.                                                                                        | **CONFIRMED** | The handoff could not see who decided, so it framed a reviewer-veto pattern as acting-model "caution." |
| I-4 | **`project-organize` is 0/12 on the worker across four batteries** (`091300f`, `870c3fe`, `33b4faec`, `49dcd5a2b`) and 3/3 on legacy once the worker-only assertion was removed (tasker/55). Framework rule: 0% across many trials is a broken task, not an incapable agent.                                                                                                                                                                                                                                                                                          | **CONFIRMED** | Not a regression. A structural worker-path problem (see H-2 below).                                    |

**Product blast radius of I-1 (outside the harness):** `users.timezone` is `UTC` for 112/120 rows; the project/global chat prompt never carries a local date or weekday, only an ISO-Z instant. Any US user saying "friday", "tomorrow", "end of day" after ~20:00 local gets a prompt in which it is already the next day. The `project_create` path already does this right (`build-lite-prompt.ts:440`: `Current date: YYYY-MM-DD (timezone X). Resolve relative … forward from this date`); the general path does not.

---

## 2. Cluster 1 — the eight "over-clarifications" were reviewer vetoes

Attribution by `llm_usage_logs.routeId` × `chat_tool_executions.sequence_index`. In every row below the `request_turn_clarification` call follows a `routeId=openrouter_semantic_reviewer` request and precedes the acting model's tool-free synthesis pass.

| Turn           | Turn run                         | Who clarified            | Reviewer's stated objection (verbatim gist)                                                                                                                                          | Was the user's commission ambiguous?                                                                           |
| -------------- | -------------------------------- | ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| organize r1    | `7de4077c`                       | **batch reviewer**       | "batch creates the four folders but omits the six commissioned document moves" — after approving the contract                                                                        | No. Create-then-move is inherently two batches; moves need parent IDs that don't exist until the creates land. |
| organize r2    | `f1836dfb`                       | **contract reviewer**    | "names four folders … but sets the create minimum to 3. Should the contract require all 4?"                                                                                          | No. Cardinality typo by the acting model.                                                                      |
| organize r3    | `538cdca9`                       | **contract reviewer**    | "also changes the existing START HERE document … Should I include that content update?"                                                                                              | No. Extra outcome; reviewer cannot approve a subset.                                                           |
| complete r1    | `21f80366`                       | **batch reviewer**       | "proposed note adds '2026-08-20,' but you didn't state the call date"                                                                                                                | No. Acting model inferred the date from `due_at`.                                                              |
| reschedule r1  | `f112407f`                       | **contract reviewer**    | "the exact proposed contract omits the required date value" (contract summary said Aug 21, `required_fields` empty)                                                                  | No (but see I-1: in UTC context "Friday" _was_ ambiguous).                                                     |
| multi r1/r2/r3 | `7592b7dc` `e207d077` `dd95bc51` | **contract reviewer** ×3 | "includes 'Prep system design answers for Halcyon Labs' among the tasks to mark done" — the acting model declared one `update` outcome with `target_ids=[resume, linkedin, halcyon]` | No. Contract schema has no per-outcome value, so the lump reads as "completion set".                           |

**Mechanism (harness, `readOnlyProvider.ts`):**

- `buildTurnContractReviewRequest` (:2887) gives the reviewer tools `[approve_turn_contract_review, declare_read_only_turn?, request_turn_clarification]`; `buildMutationBatchReviewRequest` (:2977) gives `[approve_mutation_batch_review, request_turn_clarification]`. Both prompts end "Choose exactly one tool. Never rewrite, repair, broaden, or substitute."
- `streamTurnContractReview` (:1585) accepts the reviewer's `request_turn_clarification` as a completed tool round; `setPendingToolRound` (:581) then nulls `turnContract` / `approvedContractSha256`; the acting model gets a forced tool-free synthesis pass (`forceToolFreeRequest`, :2801) and narrates the question as its own ("I caught myself mid-step — let me clarify", multi r2).
- There is **no path from reviewer back to acting model.** A reviewer that finds the contract sloppy-but-safe has exactly one non-approving exit that keeps the turn alive, and it goes to the user.

**Tools surface contributor:** `declare_turn_contract` outcomes carry `action / entity_kind / target_ids / required_fields / minimum_successful_effects` (`turn-contract.ts`). There is no per-outcome _change_ (field → value). "Mark A and B done; set C to top priority" cannot be expressed except as separate outcomes, and the tool description does not force that split, so `deepseek-v4-flash` lumps them 3/3. The reviewer is then correct that the artifact is wrong and has no way to say "re-declare."

**Model contributor:** every veto was triggered by a real sloppiness in the acting model's artifact (lump, typo, extra outcome, invented date). The cheap model authors the hard artifact; the expensive model only grades it. That is the delegation hierarchy inverted.

**Is this new?** No. The identical `declare → [approve] → request_turn_clarification` signature appears in `33b4faec` (complete r1, r2; multi r2; organize r2, r3), `870c3fe` (complete r3; multi r1, r2; organize r2, r3; reschedule r1), and `091300f`. Worker history on the reviewer-gated scenarios: multi-update 3/12, organize 0/12, complete 6/15. Today's multi 0/3 vs prior 3/9 → `p = 0.51`.

---

## 3. Cluster 2 — reviewer approved a guess with all three candidates in its window

All three `restraint` turn-2 reps: acting model declared `update [Send the launch email to the beta list]`; contract reviewer approved; batch reviewer approved; write landed.

- The reviewer's input (`turnRecord` = full acting-model messages, including the system prompt's `entity_refs.tasks`) lists all four tasks: _Finish the usage-based pricing migration_, _Draft the investor update email_, _Fix the email verification bug on signup_, _Send the launch email to the beta list_. Verified in all three prompt snapshots.
- Reviewer r3 wrote: _"the loaded task list contains exactly one matching email task: 'Send the launch email to the beta list'."_ Reviewers r1/r2: _"uniquely matching loaded task."_ All three batch reviewers repeated the "uniquely matching" claim.
- The prompt does say "If multiple loaded entities plausibly match a descriptive reference … request clarification," but the task it is handed is _"Approve the exact contract only if …"_ with the contract first in the user message. Nothing forces it to enumerate candidates before judging; it rationalizes the proposal it was shown (the same anchoring the prompt warns about in its second sentence).
- Not a context/retrieval defect (all three tasks present, no truncation). Not a session-history defect (turn-1 reply discussed the pricing task). Not provider-specific (r1/r2 on Azure `gpt-5.6-luna`, r3 on OpenAI `gpt-5.6-luna-20260709`; all failed).
- History: worker restraint 7/9 across the prior three batteries vs 0/3 today (`p = 0.045`) — the one comparison that is borderline significant. Legacy (no reviewer) is 1/3. The reviewer _does_ add restraint on average; it is just not enforced — it is requested in prose, which the framework's Harness spec calls out as "prompt-dependent invariants."

---

## 4. Cluster 3 — correct answer for the wrong clock

| Item                           | Value                                                                                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Prompt clock (all 3 snapshots) | `- Current time: 2026-08-21T00:17:43.256Z` / `- Timezone: UTC` → **Friday**                                                               |
| Harness user profile           | `users.timezone = 'UTC'`                                                                                                                  |
| Harness expectation            | `nextWeekdayDate(now, 5, 'America/New_York')` → `2026-08-21`                                                                              |
| r2 reviewer                    | _"The loaded UTC timeline is 2026-08-21 (Friday is 2026-08-28)"_                                                                          |
| r3 reviewer                    | _"current date as Friday 2026-08-21; the proposed next-Friday date 2026-08-28"_                                                           |
| r1 acting model                | declared Aug 21 in the summary; reviewer vetoed on missing `required_fields` (Cluster 1 mechanism) and the synthesis asked "this Friday?" |
| Date normalization layer       | none touched the value; `update_onto_task.due_at = 2026-08-28T15:00:00+00:00` is exactly what the acting model proposed                   |

Verdict: **instrument defect** (scenario asserts a timezone the system under test was never told) **plus a live product defect** (general chat prompt carries no local date/weekday and the user timezone column is unpopulated for 93% of users).

---

## 5. What changed in code between the last good live test and this run

`git diff 36955954c..49dcd5a2b` on the worker/runtime/harness: one prompt clause appended to `SEMANTIC_COMMISSION_GUIDANCE` line 4 (the tasker/56 "never tell the user their next step goes unrecorded — carry it on the matched entity" reword); the rest is plumbing (`writeFence.ts` arg envelope, publisher config, stalled-recovery reporting, production-profile env guards, `assertToolCalledForExecutionMode` in the harness). The reword reaches both acting and reviewer prompts (regression-guarded). Its only plausible fingerprint is complete r1, where the acting model carried outcome text and inferred a date the reviewer then vetoed — but r2 and r3 carried the same outcome text and passed. **Effect: not measurable at n=3; no evidence it caused any cluster.**

`33b4faec → 36955954c` is where the line was first added; that was live-tested (tasker/56, 3/3 no clarification). Nothing between there and `49dcd5a2b` touches a decision path.

---

## 6. Surface attribution (the handoff's §12.8 split)

| Surface               | Finding                                                                                                                      | Confidence | Evidence                                                          |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------- |
| **Instrument**        | I-1 timezone split-brain (Cluster 3); I-2 power; I-3 no decision attribution; I-4 organize 0/12                              | Confirmed  | §1, snapshots, `assertions.ts:470`, `users` row                   |
| **Harness**           | H-1 reviewer decision space = {approve, read-only, ask user}; no reject-to-acting-model exit (Cluster 1, 8/8)                | Confirmed  | `readOnlyProvider.ts:1585-1700, :2887-3040`, tool rows            |
| **Harness**           | H-2 batch reviewer treats a partial batch of a multi-step contract as a defect (organize r1); sequenced contracts can't pass | Confirmed  | organize r1 rows; batch prompt "Do not approve only a subset"     |
| **Harness**           | H-3 candidate uniqueness requested in prose, never enforced (Cluster 2, 3/3)                                                 | Confirmed  | reviewer args vs snapshot `entity_refs`                           |
| **Tools**             | T-1 `declare_turn_contract` has no per-outcome change/value; heterogeneous updates get lumped (multi 3/3)                    | Confirmed  | `turn-contract.ts`, multi contracts                               |
| **Context-spawn**     | C-1 general prompt has no local date/weekday; `Timezone: UTC` hard-coded; `users.timezone` unpopulated                       | Confirmed  | `build-lite-prompt.ts:724`, `context-loader.ts:1964`, users query |
| **Model**             | M-1 acting model (`deepseek-v4-flash`) authors sloppy contracts that a stronger reviewer rejects; hierarchy inverted         | Inferred   | every veto had a real trigger; no swap ablation exists            |
| **Context-flow**      | The reword (only prompt diff) — no measurable effect                                                                         | Inferred   | n=3                                                               |
| **Railway/transport** | Healthy                                                                                                                      | Confirmed  | handoff §9; nothing here contradicts it                           |

---

## 7. Recommended remediation (ranked; nothing implemented)

Each row names the validating evidence that does **not** require a paid battery, then what the paid rerun would need to show.

| Rank | Fix                                                                                                                                                                                                                                                                                                                           | Surface                    | Cost             | Zero-spend validation                                                                                                        | Paid validation                                                          |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | ---------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| 1    | **Fix the clock.** Render `Current date: YYYY-MM-DD (Weekday), timezone <tz>` in the general prompt the way `project_create` already does; source `tz` from `users.timezone` with a browser-reported fallback on session start; make the harness seed its user's timezone explicitly and assert in that same zone.            | Context-spawn + Instrument | Small            | Unit test on the envelope; harness test that `expectedFriday` and the rendered prompt agree at 23:00 EDT (fixed clock).      | Reschedule 3/3 at any hour.                                              |
| 2    | **Give the reviewer a fourth exit: `reject_for_revision`.** Reason goes back to the acting model as a system instruction; one bounded retry; a second reject falls through to today's clarification. Reviewer still never rewrites the contract.                                                                              | Harness                    | Medium           | Provider unit tests with a scripted reviewer (existing `agenticChatReadOnlyProvider.test.ts` pattern); differential fixture. | Multi-update and organize move off 0/3; complete r1-type turns complete. |
| 3    | **Make candidate enumeration a required output.** `approve_turn_contract_review` gains `candidate_target_ids` (all loaded entities plausibly matching each descriptive reference); code rejects the approval when candidates ⊃ targets for a single-target outcome and forces clarification. "Models propose, code disposes." | Harness + Tools            | Medium           | Unit test with the restraint fixture's four tasks.                                                                           | Restraint turn-2 → 3/3 with candidates named.                            |
| 4    | **Batch reviewer checks subset, not completeness.** Replace "Do not approve only a subset of the SHA-bound batch" semantics with "every mutation in the batch must be inside the approved contract"; contract completion stays the harness's job (the `Continue until every declared outcome…` instruction already exists).   | Harness                    | Small            | Unit test: create-only first batch of a create+move contract is approvable.                                                  | Organize r1-type turns proceed to moves.                                 |
| 5    | **Per-outcome change on the contract schema** (`changes: [{field, value}]`) or, lean, a tool-description rule: "one outcome per distinct (action, value) pair — never mix completions and priority changes in one target list."                                                                                               | Tools                      | Small–Medium     | Contract parser tests; inspect rendered tool definition.                                                                     | Multi-update contracts stop lumping.                                     |
| 6    | **Record the decision author.** Persist `decided_by: acting \| contract_reviewer \| batch_reviewer` (+ model) on control-tool executions and surface it in the artifact summary.                                                                                                                                              | Instrument                 | Small            | Artifact schema test.                                                                                                        | Next handoff can attribute without joins.                                |
| 7    | **Model-swap ablation lane** (framework §6 item 6): same prompts/tools/harness, acting model = the reviewer's tier, 5 reps on the three reviewer-gated scenarios.                                                                                                                                                             | Model                      | Paid             | —                                                                                                                            | Tells you how much of Cluster 1 is M-1 vs H-1.                           |
| 8    | **Power.** Minimum 5 reps per scenario for any go/no-go, and report the binomial CI next to the count.                                                                                                                                                                                                                        | Instrument                 | Paid (more reps) | —                                                                                                                            | Stops 3-rep noise from reading as regressions.                           |

Lean bundle: 1 + 4 + 6 (clock, batch-subset, attribution) — small, zero new behavior for users except correct dates, and it removes two of the three clusters' _causes_. Ambitious bundle: 1–6 together — this is the reviewer becoming a real second opinion instead of a veto-to-user, and it is the change that would let the worker path beat legacy on the scenarios legacy wins by not having a reviewer at all.

---

## 8. Things the handoff asked that are now answered

- _Which model made the final `request_turn_clarification` in each turn?_ The semantic reviewer (`gpt-5.6-luna`), 8/8. Never the acting model.
- _Did any reviewer reject a correct declaration?_ Every declaration it rejected had a real form defect; none had a genuinely unresolved user choice.
- _In organize r1, why could clarification override an approved contract?_ It didn't override the contract review — it was the **batch** reviewer at the write boundary, vetoing a partial first batch.
- _Did the reviewers see all three email tasks?_ Yes, in every rep. They asserted uniqueness anyway.
- _Did prompt length, repeated reads, or provider fallback correlate?_ No. Failures occurred at 34K and 120K prompt tokens, on DeepInfra/Alibaba/Sail (acting) and Azure/OpenAI (reviewer) alike. Organize r1's 13 document reads were the acting model probing headingless docs (`read_document_section(anchor: body)` × 6 → "no section"), a tools/results-half issue, separate from the veto.
- _Where did `2026-08-28` enter?_ Acting model's contract `required_fields` in r2/r3, approved twice, written verbatim. It was the right Friday for a prompt that said it was already Friday.
- _Harness validity?_ I-1 through I-4. Keep separate from product behavior — except I-1 is also product.

---

## 9. Remediation implemented (2026-08-20, same evening) — ambitious bundle, harness-first

DJ chose the ambitious bundle and ruled out a model change ("assume it's the harness"). Everything
below is built and unit-gated; **nothing is committed, deployed, or live-tested yet.**

### 9.1 Reviewer action space (`apps/worker/src/workers/agentic-chat/readOnlyProvider.ts`, `readOnlyTool.ts`)

- New reviewer-only control tool **`request_proposal_revision`** `{ reason, required_correction }`.
  Offered to the contract reviewer and the mutation-batch reviewer **once per lane per turn**
  (`MAX_CONTRACT_REVISIONS_PER_TURN = 1`, `MAX_MUTATION_BATCH_REVISIONS_PER_TURN = 1`); the second
  review of a lane offers only approve / read-only / clarify, so a model that cannot correct itself
  still ends with the user, never in a loop.
- **Contract revision** voids the contract and re-opens the semantic disposition gate with the
  reviewer's reason + required correction as a system instruction ("did not reach the user"); the
  acting model re-declares through the normal SHA-bound review.
- **Batch revision** withdraws only the exact batch; the approved contract stands; the acting model
  gets its full write surface back with the correction and re-proposes; the new batch is reviewed
  again.
- **Batch reviewer judges subset, not completeness.** Prompt now states that contracts routinely
  execute across several batches (create parents before moving children) and that completion of the
  remaining outcomes is the harness's job. This is the organize-r1 fix.
- **Candidate enumeration is a required output.** `approve_turn_contract_review` gains required
  `reference_candidates: [{ reference, candidates: [{ id, title }] }]` and the reviewer prompt says
  "enumerate before judging". Deterministic floor (`findAmbiguousReferenceCandidates`): if the
  reviewer lists ≥2 candidates for one reference and the contract targets only some of them, the
  approval is converted into a `request_turn_clarification` that names the candidates
  (`decidedBy: harness_candidate_gate`). Triggers from the reviewer's own enumeration, never from
  pattern-matching its prose.
- Contract reviewer prompt now separates the two exits explicitly: clarification only when a choice
  genuinely belongs to the user; revision when the commission is clear but the contract misstates it.
- Post-clarification synthesis instruction tells the acting model to ask plainly and not narrate
  internal review ("I caught myself mid-step" class of text).
- Acting-side disposition gate gains one sentence: one outcome per distinct change.

### 9.2 Decision attribution (`providerContract.ts`, `readOnlyProvider.ts`, `fixtureTurnExecutor.ts`, `readOnlyTool.ts`, harness `phase0/evidence-report.ts`)

- `AgenticChatControlDecisionAuthorV1 = acting_model | contract_reviewer | mutation_batch_reviewer | read_only_reviewer | harness_review_fallback | harness_candidate_gate`.
- Provider tags every control call; `read_tool` steps carry `decidedBy`; the executor passes it to
  the read-tool port; the adapter stamps `decided_by` into the persisted `result` JSON of control
  tools only. Battery artifacts now expose `toolExecutions[].decidedBy` and a per-turn
  `controlDecisions[]` list. The next handoff can say who decided without joining usage logs.

### 9.3 Contract schema (`packages/agentic-chat-runtime/src/loop/turn-contract.ts`, web `definitions/gateway.ts`)

- Optional per-outcome `changes: [{ field, value }]`; change fields are unioned into
  `requiredFields` so fulfillment already enforces them; included in the dedupe key and in the JSON
  the reviewer sees. Tool definition carries the rule: _"mark A and B done and make C top
  priority" is two outcomes, not one update with three targets._

### 9.4 Clock (`apps/web` context loader, lite prompt, new `POST /api/users/timezone`, harness)

- Loader resolves `users.timezone` (IANA-validated, UTC fallback) and carries it into both prompt
  paths. Timeline frame renders `Current date: YYYY-MM-DD (Weekday), HH:mm local time in <tz>`,
  the UTC instant, the zone, and a relative-date rule (weekday name = next occurrence; if today is
  that weekday, one week out unless "today"). Browser zone is persisted once per page load from the
  chat client when the stored value is null/'UTC'. Harness pins its user to `HARNESS_TIMEZONE`
  (America/New_York) and asserts in that zone.

### 9.5 Gates run

| Gate                                                         | Result                                                                |
| ------------------------------------------------------------ | --------------------------------------------------------------------- |
| worker `pnpm typecheck` (TS7)                                | clean                                                                 |
| worker `pnpm test:run`                                       | 1093 passed, 1 skipped (incl. 3 new provider flows + 3 adapter tests) |
| worker eslint on changed files                               | 0 errors                                                              |
| runtime `pnpm test:run` / `typecheck`                        | 260 passed / clean                                                    |
| web `evidence-report.test.ts`                                | 2 passed                                                              |
| web prompt / harness / context-loader tests + `svelte-check` | see §9.6 (clock agent report)                                         |

### 9.6 What validates it (DJ decides when)

1. **Zero-spend:** already-run unit gates above; `pnpm pre-push` before any commit.
2. **Paid, gated on DJ:** the standing three-scenario worker battery
   (`task-complete-cold-reference`, `restraint-noop-and-ambiguity`, `task-multi-update`) plus
   `task-reschedule-cold-reference` and `project-organize`, **5 reps each**, run once in the evening
   EDT on purpose. Read `controlDecisions` in the artifact first: the expected signature is
   `request_proposal_revision` by a reviewer followed by a re-declaration and an approval — and zero
   reviewer-authored `request_turn_clarification` on multi-update/organize/complete.
3. Deploy order matters: the runtime package must be rebuilt and both web (tool definition, clock)
   and the dedicated chat worker (reviewer lanes) must ship together; a worker without the web
   definition change still works (`changes` is optional), and a web without the worker change still
   works (legacy path has no reviewer).
