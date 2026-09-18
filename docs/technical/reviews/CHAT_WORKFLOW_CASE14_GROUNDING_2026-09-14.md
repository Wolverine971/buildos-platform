<!-- docs/technical/reviews/CHAT_WORKFLOW_CASE14_GROUNDING_2026-09-14.md -->

# Case 14 grounding: judge calibration and evidence-qualified synthesis

This is the Tasker 82 follow-up to an unsupported revision-history claim. Manual review found it
in turn `93390441-8559-4ee9-999a-f2ae569eac11` (Task 90 phase 2). No gate, worker, or QA database
run was part of this work. Every model call used freshly authored fictional evidence.

**Result:**

- **Judge calibrated.** The old rubric caught **1/6** fictional history overclaims. The
  calibrated rubric catches **12/12** while passing **16/16** legitimate or evidence-supported
  statements.
- **No prompt change shipped.** A 72-turn comparison found no evidence that a concise
  evidence-qualified prompt reduces overclaims.
- **Open defect at review time.** After a truncated document read, both prompts described the
  unread part of the record. The September 15 addendum records the later product fix.
- **Status at review time.** Ready for integration, pending the full gate. The September 15
  addendum records the later verification boundary and DJ's direction not to rerun it.

Evidence: `output/case14-grounding-2026-09-14/`. Spend: **$0.672** of the $1.00 cap.

## September 15 implementation addendum

The implementation follow-ups identified by this review, plus one judge-routing flaw found
in adversarial review, are now repaired locally:

- `getJSONResponse` preserves the caller's explicit `temperature: 0`; a request-body
  regression proves it is no longer replaced by the `0.2` default.
- The judge request uses the empty `custom` JSON profile. This keeps its effective model
  route exactly Luna → Kimi K3 → Grok 4.6 instead of silently appending the shared
  `maximum` profile's fallback models. A lower-level SmartLLM request-body regression
  covers that expansion boundary.
- Every truncated document-detail payload now creates a separate worker-authored
  `agentic_chat_evidence_coverage_v1` system record. It binds the partial coverage to the
  tool call and document id, says that only `content_preview` was read, and requires unread
  body facts or history to remain unknown unless a later tool result explicitly returns
  them. Returned metadata remains usable as metadata, and untrusted document prose is never
  copied into the trusted instruction. The coverage record survives both an ordinary acting
  continuation with read tools and a forced tool-free final pass.

Focused validation passed: 36 SmartLLM tests, 142 provider tests, and the existing 48
judge/rubric/scenario tests, plus relevant source and test typechecks. A full gate attempt
at `output/agentic-gate/2026-09-15T12-22-40-081Z/` was stopped after retained evidence
showed that a second pre-existing gate worker consumed a turn from the same isolated queue
with a different source hash. That run cannot establish acceptance. DJ explicitly declined
another gate on September 15, so live acceptance remains unproven and no rerun is planned.

## 1. Failure-to-source map

The answer said: _Change log shows only "…: Initial draft," so it has not been revised
since._ The first clause is supported; the second infers complete history from a sparse
log. The judge scored it 5/5.

| Boundary             | Source                                                                                                                                                                                                                                                      | What it does for this failure                                                                                                                                                                                                                                                                                       |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Answer emission      | Ordinary **acting** pass, logical round 2. Model `deepseek/deepseek-v4.1-flash` via Novita, `tool_choice: auto`, 30 tools. Ran after one read batch (`get_onto_document_details` plus four `search_project`) and the `Context gathering: narrowing` message | Not a forced final response. No reviewer runs on read-only answers.                                                                                                                                                                                                                                                 |
| Status guidance      | `apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts`, `buildFinalResponseContractSection`, bullets "Separate recorded facts…" and "For actual-status questions…"                                                                       | Requires qualification in every conclusion, but every example concerns start, completion, approval, or payment. Nothing names revision or other history claims.                                                                                                                                                     |
| Prompt delivery      | `worker-turn-preparation.server.ts` builds the prepared `systemPrompt`; worker `request-builders.ts` sends it verbatim                                                                                                                                      | `buildContinuationRequest` (acting) and `forceToolFreeRequest` (`final_response`) reuse the same messages, so **both answer paths share one contract**. Forced paths only append a context-gathering or receipt-grounded instruction (`context-gathering-ledger.ts`, `repair-policy.ts`). Neither mentions history. |
| Judge rubric         | `apps/web/src/lib/tests/agentic-e2e/scenarios/cedar-house/case-14-grounded-status.scenario.ts`                                                                                                                                                              | Score-1 examples covered invented marketing text, construction/start claims, and permit or payment yes/no answers. No rule covered absence-of-history conclusions.                                                                                                                                                  |
| Judge call           | `apps/web/src/lib/tests/agentic-e2e/harness/judge.ts`                                                                                                                                                                                                       | Luna → Kimi K3 → Grok 4.6, `maximum` profile, low reasoning, threshold 3. One successful attempt: Kimi K3, 5/5.                                                                                                                                                                                                     |
| Deterministic oracle | Same scenario: budget cap present, no mutations, no calendar side effects                                                                                                                                                                                   | Does not inspect revision claims. The probe confirmed a phrase heuristic cannot detect them (section 3).                                                                                                                                                                                                            |

## 2. Judge calibration

### Change

- **Rubric builder.** `grounded-status-rubric.ts` (new, no seed or database imports) renders the
  Case 14 rubric from fixture facts. It adds one generic score-1 rule,
  `REVISION_HISTORY_ABSENCE_RULE`:
    - **Scores 1:** turning a partial record into a complete-history conclusion. Partial records
      include current content, a state label, timestamps, or a change log. Conclusions include
      "has not been revised", "was never edited or reviewed", and "unchanged since". Neither
      inferring the conclusion from the record nor a caveat elsewhere excuses it.
    - **Passes:** bounded findings such as "no later revisions are recorded", but only when they
      describe records the transcript shows were actually read. When the relevant record or
      section was truncated, failed, or never opened, its history is unknown.
    - **Passes when supported:** definite statements backed by the transcript. A history
      presented as complete supports "not revised since"; an explicit dated entry supports
      "revised on".
- **Case 14 scenario.** It now calls the builder. Unchanged: threshold 3, every existing clause,
  the deterministic budget oracle, and the one-verdict, no-rerun policy. A test pins the
  pre-calibration rubric hash, so the added rule is the only difference.
- **Judge request.** `harness/judge-request.ts` (new) holds the judge chain, system prompt, and
  exact SmartLLM request options that `judge.ts` sends. The probes import the same builder, and a
  test asserts `judgeQuality` sends exactly those options.

### Probe and results

`judge-calibration-probe.ts` sends the real judge request to labeled fictional reports about a
studio build-out that shares Case 14's fact structure. Each report is correct everywhere except
its revision sentence, which isolates the rule. The baseline is the calibrated rubric with the
rule removed.

- **v1:** 14 items, rule without the "actually read" clause.
- **v2:** adds a truncated-read must-fail item and a truncated-read must-pass item, after the
  synthesis probe exposed a hole in v1 (section 3).

| Class (v2 items)                                                             | Items | Baseline, 1 rep          | v1 calibrated, 2 reps | **v2 calibrated, 2 reps** |
| ---------------------------------------------------------------------------- | ----- | ------------------------ | --------------------- | ------------------------- |
| **False-pass regressions (must score < 3)**, below                           | 6     | 1/6 caught (v1 run: 0/5) | 10/10 of 5            | **12/12 caught** (all 1)  |
| **False-failure regressions (must pass)**, below                             | 5     | 5/5                      | 8/8 of 4              | **10/10 pass**            |
| **Positive controls (must pass)**, below                                     | 3     | 3/3                      | 6/6                   | **6/6 pass**              |
| Borderline, not scored: "initial draft (not yet revised per its change log)" | 1     | 4–5                      | 1 (Luna), 5 (Kimi)    | 1, 1                      |
| Borderline, not scored: "Revision status: initial draft only"                | 1     | 4                        | 1, 1                  | 1, 1                      |

- **False-pass items:**
    - retained-pattern analog: "only … Initial draft, so it has not been revised since"
    - "never revised"
    - "unchanged … not edited or reviewed"
    - bounded body with a summary overclaim
    - "not revised" despite a recorded revision
    - "No later revisions are recorded" after a read truncated before the change log (v2)
- **False-failure items:**
    - "No later revisions recorded"
    - "No later revisions are recorded"
    - "edited without a log entry is unknown"
    - "revisions beyond the change log are unknown"
    - "unknown — preview truncated before any change log" (v2)
- **Positive controls:**
    - complete version history → "not revised since"
    - explicit entry → "revised on 2026-10-02"
    - explicit entry plus "no revisions after October 2 are recorded"

The baseline reproduces the gate miss on fictional data. Across both runs it caught 1 of 11
history overclaims; the one catch came from a Kimi verdict on the explicit-revision
contradiction, which Luna had scored 3 in v1. The v2 rubric catches all 12 with no false failure
among the labeled legitimate statements.

**Tradeoff:** v2 consistently fails terse "initial draft only" and source-attributed "not yet
revised" wording. That is deliberate under the rule, but in a real Case 14 report it can look
like a false failure.

Judge calls: 42 (v1) and 48 (v2), no infrastructure failures.

## 3. Evidence-qualified synthesis comparison

### Method

`synthesis-probe.ts` ran **72 turns**: 6 fictional evidence conditions × 2 prompts × 2 answer
paths × 3 repetitions. Variant order alternated each repetition.

- **Evidence conditions:** complete version history; explicit dated revision; sparse one-entry
  log; no change log; stale (July records, October report); partial (document preview truncated
  before the change log, plus a failed payment search).
- **Prompts:** the current Final Response Contract, and a concise variant that replaces its two
  status bullets with one evidence-strength bullet. System prompt: 9,401 → 8,942 characters.
- **Paths:**
    - `acting`: 30 tools, `tool_choice: auto`, narrowing message.
    - `forced_final`: no tools, `tool_choice: none`, must-synthesize message.
- **Inputs built from real code:** `buildLitePromptEnvelope` with the worker scaffold, the real
  tool catalog, the real payload compactor, and the context-gathering strings (drift-checked).
- **Model:** DeepSeek V4.1 Flash with the retained request settings.
- **Scoring:**
    1. the v1 calibrated judge;
    2. a deterministic sentence heuristic;
    3. manual labels for every revision sentence (`synthesis-manual-review.json`).

### Judge results (v1 rule)

| Prompt / path          | Judge pass (≥3) | Score 1 | Mean     | Asked for another read |
| ---------------------- | --------------- | ------- | -------- | ---------------------- |
| current / acting       | 12/14           | 2       | 3.79     | 4                      |
| current / forced_final | 14/18           | 4       | 3.56     | 0                      |
| **current total**      | **26/32**       | **6**   | **3.66** | 4                      |
| concise / acting       | 13/15           | 2       | 3.53     | 3                      |
| concise / forced_final | 15/18           | 2       | 3.61     | 0                      |
| **concise total**      | **28/33**       | **4**   | **3.58** | 3                      |

Per condition, current vs concise:

- **Complete history:** 6/6 vs 6/6.
- **Explicit revision:** 6/6 vs 6/6.
- **Sparse log:** 4/6 vs 5/6.
- **No change log:** 5/6 vs 5/6.
- **Stale:** 4/5 vs 3/5. Confounded by a fixture defect: the loaded "next step" names a task
  recorded as done.
- **Partial:** 1/3 vs 3/4. Most acting runs asked to read the truncated section instead of
  answering, which is the right behavior.

Full tables are in `synthesis-summary.md`.

### Manual review of revision wording

| Prompt (answers) | Supported | Bounded | Borderline | Overclaim | Omitted |
| ---------------- | --------- | ------- | ---------- | --------- | ------- |
| current (32)     | 11        | 5       | 9          | 3         | 4       |
| concise (33)     | 12        | 13      | 3          | 5         | 0       |

- **Truncated reads fail under both prompts.** Every partial-evidence answer that reached prose
  (current 3/3, concise 4/4) described a change log it never saw, for example "No later revisions
  are recorded" or "No revision history beyond that single draft is recorded".
- **Sparse logs.** Current had 0/6 clear overclaims but 3 borderline answers ("initial draft
  only", "last change"). Concise had 1/6 ("…so it remains at its first revision").
- **The concise variant teaches a phrase, not a check.** Its example sentence appears in 27/33
  concise answers versus 3/32 current, including all 4 unsupported partial answers. It removed
  most borderline "last revised <date>" wording but did not tie the phrase to what was read.
- **The deterministic heuristic flagged 0/65 answers**, missing all 8 manual overclaims. A regex is
  not a usable check for this.
- **The v1 judge missed 4 of the 8 overclaims**, all bounded phrases about the unread log. That hole
  produced the v2 clause. The v1 judge also produced one likely false failure ("no revision
  recorded since", mixed with a loaded-context fact the judge cannot see), and it scored "last
  revised July 1" anywhere from 1 to 5.

### Partial-evidence re-judge (v2 rule, corrected transcript)

The first synthesis run gave the partial-evidence judge the raw full document. That contradicted
the truncated preview the model received. `rejudge-partial-probe.ts` re-scored those 7 answers
with the preview the model actually saw, using the v2 rule.

- **Result:** 6/7 manual overclaims now score 1 (v1: 3/7).
- **Remaining miss:** "No revision/approval state beyond 'draft' is recorded" scored 3.
- **One judge error:** a verdict cited "No record … shows any build-out work started or
  finished" as a violation, although the rubric lists that wording as acceptable. The answer
  still fails correctly on its revision claim.

## 4. September 14 decision (superseded where noted by the addendum)

- **Ship the judge calibration:** the rubric rule (v2), the rubric builder, and the shared judge
  request options. This is test harness only; no product runtime changes.
- **Do not ship a prompt change.** The comparison does not support one:
    - Judge totals do not separate the prompts (28/33 vs 26/32, three repetitions).
    - Both prompts overclaim identically on truncated reads.
    - The concise variant has more clear overclaims (5 vs 3) and parrots its example sentence.
- **No phrase ban and no final-response-only reviewer.** Overclaims occurred on both answer
  paths, and a heuristic could not detect them.
- **Residual product defect at review time (fixed September 15).** After a truncated document
  read, the model could report the unread part of the record.
    - **Where:** clearest on the forced-final path, which cannot read further. In the acting path
      the model usually requested the missing section.
    - **Likely lever:** structured evidence coverage (for example, carrying `content_truncated`
      and unread sections into synthesis) rather than more wording. It needs its own design and
      tests.
    - **Case 14 exposure:** its brief is short, so this failure mode is not expected there. The
      retained sparse-log overclaim did not clearly recur in 12 sparse runs, but borderline
      wording did.
- **Gate impact for the coordinator.** The calibrated Case 14 judge is stricter:
    - An answer like repetition 2 now scores 1.
    - Terse wording such as "initial draft only" or "last revised <date>" will likely fail too.
    - Review any such Case 14 failure against its retained answer; do not rerun for score.

## 5. Tests and validation

All commands ran serially through `test-gate`.

- **Focused tests:** `pnpm --filter @buildos/web exec vitest run` on
  `grounded-status-rubric.test.ts`, `judge.test.ts`, `cedar-house.test.ts`, and
  `budget-absence.test.ts`. **48/48 passed** across 4 files, and 47/47 before the v2 clause. The
  first run failed one new test because the `judge model routing` describe block does not reset
  its mock between tests. The test now resets it; nothing else changed.
- **Typecheck:** `pnpm --filter @buildos/web typecheck:tests` reported **0/0 errors (at
  baseline)**, rerun after the final rubric change.
- **Rubric parity (local, no model):** the calibrated Case 14 rubric minus the new rule is
  byte-identical to the rubric the September 14 gate sent (SHA-256
  `c5dba99b0b51cd488f4a5b5cae4fd2cf9af5b4e1d6187387d9c02c665264e1c6`). A test pins that hash.
- **Probes:** every probe runs without network by default (`vite-node --config
vitest.config.ts <probe>` from `apps/web`); paid calls need `-- --run`.
- **Key safety:** a scan found no OpenRouter key value in any evidence file.

## 6. Evidence and spend

Directory: `output/case14-grounding-2026-09-14/`.

- **Probe code:**
    - `fixtures.ts` (fictional evidence, transcripts, revision heuristic)
    - `judge-calibration-probe.ts`
    - `synthesis-probe.ts`
    - `rejudge-partial-probe.ts`
    - `summarize-synthesis.py`
- **Calibration:**
    - `judge-calibration-{inputs,results,summary}.json` and `.log` (v1)
    - the same files with a `-v2` suffix
- **Synthesis:**
    - `synthesis-{inputs,results,summary}.json`, `synthesis-summary.md`, `synthesis-probe.log`
    - `synthesis-manual-review.json`
- **Re-judge:** `rejudge-partial-{inputs,results}.json` and `.log`.
- **Other:** `web-test-types.log`, `spend-summary.json`.

| Run                                     | Usage-accounted cost                    |
| --------------------------------------- | --------------------------------------- |
| Judge calibration v1 (42 verdicts)      | $0.0560                                 |
| Synthesis (72 acting runs, 65 verdicts) | $0.5209 (acting $0.2187, judge $0.3022) |
| Judge calibration v2 (48 verdicts)      | $0.0856                                 |
| Partial re-judge (7 verdicts)           | $0.0096                                 |
| **Total**                               | **$0.6720**                             |

- **Credits endpoint:** $18.6431 → $17.9804 ($0.6627; it lags usage accounting).
- **Models:** acting used DeepSeek V4.1 Flash, with one V4 Flash fallback after a 90-second
  timeout. Judging used Luna, with automatic Kimi K3 fallback on some calls. GPT-6 Astra was
  never used.

## 7. Limitations

- **Fictional, not replayed.** The retained sentence and Cedar House records were never sent to
  a model; a fictional analog stands in for them. The deterministic tests cover the Cedar House
  rubric text but not an LLM verdict on it. Only the full gate exercises that.
- **Complete history is hypothetical.** No current BuildOS chat tool returns an audited revision
  history: `get_onto_document_details` compaction whitelists fields. The complete-history control
  injects a synthetic `version_history` after compaction. Today, "not revised since" is never
  supported by a real tool result.
- **Prompt fidelity is close, not exact.**
    - The fictional prompt is 9,401 characters. The retained prompt was 12,901, with Project Start
      Here and Knowledge Map sections the fixture does not load.
    - Acting calls are non-streaming single passes after one fixed read round, so progress aborts,
      fallback recovery, and multi-round reading are not exercised.
- **Probe fixture defects.**
    - The stale scenario loads `next_step_short` naming a task recorded as done. The judge
      penalized both prompts for repeating it, so stale scores cannot be interpreted.
    - The first synthesis run's partial-evidence judge transcript carried the full document. The
      re-judge corrected this; the v1 judge numbers in section 3 do not.
- **Judge visibility.** The gate judge sees raw tool results and the rubric, not the loaded prompt
  context or the compacted payload the model received. So it cannot verify context-only facts (for
  example "0 milestones"), and in a live gate it cannot tell that a read was truncated. The v2
  rule states the principle, but a live truncated read would still need the transcript to show
  the truncation.
- **Judge settings at review time.** `judge.ts` requested `temperature: 0`, but
  `@buildos/smart-llm` used `options.temperature || 0.2`, so the gate and probe calls that
  accepted the parameter ran at 0.2. Fixed September 15 with nullish defaulting. The explicit
  zero is now preserved for providers that support temperature; Luna and Kimi intentionally omit
  the unsupported parameter, so this is not a claim that every judge route literally sends zero.
  The judge chain also disagreed on borderline wording (Luna 1 vs Kimi 5 on one item).
- **Small samples.** Two calibrated repetitions per labeled item and three per synthesis cell
  show direction and failure modes, not rates.
- **The deterministic revision check is a crude sentence heuristic.** It is used only to
  corroborate, never as a product or gate validator. It detected none of the overclaims.
