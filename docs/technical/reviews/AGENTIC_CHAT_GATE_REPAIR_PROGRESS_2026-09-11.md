<!-- docs/technical/reviews/AGENTIC_CHAT_GATE_REPAIR_PROGRESS_2026-09-11.md -->
<!-- doc-status: point-in-time -->

# Agentic Chat gate repair — implementation and verification

Date: September 11, 2026. Base commit: `38bf64c996314b80d989d04139bd9fcd23d52dd1`.
Status: Runtime repairs implemented; targeted live verification completed.
**No passing release gate.** Calendar credentials and a dedicated QA connection remain missing.

This implements the [repair plan](../../plans/AGENTIC_CHAT_GATE_REPAIR_PLAN_2026-09-10.md)
and supplements the [original rerun report](AGENTIC_CHAT_GATE_RERUN_RESULTS_AND_IMPLICATIONS_2026-09-10.md).
The old 38/52 score remains an unchanged historical record.

The original report's duration-loss diagnosis was an oracle error: all 15 task-create
receipts and all three update receipts already carried the correct numeric estimate.
The real write defects were missing dependency stages, stale legacy estimate text,
and recovery after project creation failed against missing fixture reference data.
The implementation preserves the worker-only engine and exact-argument review;
it finishes those boundaries rather than replacing the architecture again.

## Latest repeated results

`2026-09-11T16-08-04-213Z` ran Cases 2/4/8/11/14 three times with throughput sorting,
zero product retries, and verified web/worker/source provenance. It scored **18/20**
on this subset and **failed** the strict gate. Every raw turn and provider pass was retained.

| Case                                          | Correctness                                                                  | Wall times                        | Calls      |
| --------------------------------------------- | ---------------------------------------------------------------------------- | --------------------------------- | ---------- |
| 2, five tasks and three directed dependencies | 3/3; exact estimates/priorities; no rejected reviews                         | 54.0 / 52.3 / 52.1s, all <60s     | 10 each    |
| 4, narrow correction                          | 3/3; unrelated fields preserved; legacy text reconciled; no calendar effects | 22.445 / 29.986 / 18.3s, all <30s | 2 each     |
| 4, prepared readback                          | 3/3, correct saved date and 120-minute duration                              | 14.3 / 13.7 / 17.5s               | 1 each     |
| 8, exact document edit                        | 3/3                                                                          | 22.7 / 26.1 / 20.7s, all <30s     | 3 each     |
| 11, DST validation                            | 3/3, each judge 5/5; now six consecutive repetitions passed                  | See scorecard                     | 0 / 2 / 0  |
| 14, owner report                              | One quality failure, one quality pass, one judge infrastructure failure      | 27.5 / 40.8 / 36.9s               | 6 / 5 / 11 |

Case 4's slowest update had only 14ms of timing headroom. These are small repeated
samples, not a p95 guarantee. V4.1 now defaults to the tested throughput policy;
explicit provider order/sort overrides and fallback availability remain supported.
The V4 Flash default is unchanged.

The failed owner report answered “Are permits approved?” with “No” before admitting
the status was unknown. That denial is unsupported. The judge pointed instead to a
properly bounded sentence about the records; the original failing verdict is retained.
The final correction explicitly distinguishes unknown approval/payment status from
both affirmative and negative claims, and calibrates the rubric to accept bounded
record findings. It also honors requests for a brief report, stops overlapping
search/exploration loops, and removes a task-list response hint that encouraged
unnecessary detail reads. The system prompt remains under the unchanged 11,800-character cap.

The final owner-report diagnostic, `2026-09-11T16-24-01-884Z`, used the new default
with no experimental override. **All three passed correctness, timing and read limits**:

| Repetition | Wall time | Reads | Judge |
| ---------- | --------: | ----: | ----: |
| 1          |     22.4s |     4 |   5/5 |
| 2          |     31.9s |     7 |   4/5 |
| 3          |     19.6s |     4 |   5/5 |

The retained answers also underwent manual inspection. They distinguish saved
facts from unknown physical progress, permit approval and payments. Responses
were 242 / 357 / 382 words. All raw captures succeeded and provenance was verified
(`650930737b4ce970cb173a37ad441b5ebe2c5351c1efe18c8d0d582aae9461e1`).
This is a 4/4 diagnostic subset, not a full release pass.

The final ordinary `pnpm agentic:gate`, `2026-09-11T16-42-50-637Z`, passed all
97 oracle tests and the isolated reference-data/RPC checks, then **failed Calendar
preflight** before starting services. The complete battery has not passed on the
final tree; results from different revisions are not combined into a release score.

- [Final owner-report scorecard](../../../output/agentic-gate/2026-09-11T16-24-01-884Z/scorecard.json)
- [Repeated write/DST diagnostic](../../../output/agentic-gate/2026-09-11T16-08-04-213Z/scorecard.json)
- [Final release-gate setup failure](../../../output/agentic-gate/2026-09-11T16-42-50-637Z/gate.json)

## Implemented

| Area               | Change                                                                                                                                                                                                          | Evidence                                                                                             |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Duration oracle    | Exact numeric `props.duration_minutes`; incidental prose cannot satisfy it                                                                                                                                      | Missing, string, and wrong-value negative tests                                                      |
| Dependencies       | Case 2 requires all three directed task `depends_on` edges and exact priorities                                                                                                                                 | Reversed/unrelated edge negative tests                                                               |
| Narrow update      | Canonical fixture plus explicit legacy estimate variant; unrelated props checked; prepared response must contain saved date and duration                                                                        | Cedar House oracle tests                                                                             |
| Isolated bootstrap | Versioned data-only upserts of 3 facet definitions and 20 values, readback and valid-facet RPC check                                                                                                            | Actual isolated database preflight passed                                                            |
| Calendar setup     | Early configuration and active connection/source checks; complete read still required in Case 10                                                                                                                | Missing OAuth configuration fails the gate                                                           |
| Raw evidence       | Before/after rows, receipts, actor response, routing/timing/token/cache/cost counters, judge input and attempts retained before cleanup; existing local prompt dumps retain exact provider requests and replies | Missing or pending provider captures fail evidence verification; no duplicate telemetry system       |
| Judge              | Two bounded attempts with usable separate timeouts and fallback chain; malformed verdicts are infrastructure errors; actual model/provider usage retained; low scores never retried                             | Judge tests; product retries remain zero                                                             |
| Reviewed stages    | Validate before review; execute exact approved calls; retire approval after execution; separately review subsequent dependent stages                                                                            | Create → returned IDs → reviewed link regression                                                     |
| Proposal text      | Hold unexecuted prose on both opening and subsequent reviewed stages; release the final answer from executed receipts                                                                                           | Regression reproduced premature text, then all 128 provider tests passed after the fix               |
| Recovery           | Reconciled failed batches may be corrected and reviewed; exact rejected proposals remain available as unexecuted evidence; exhausted corrections disclose saved and unsaved work without a permission question  | Failed-stage, partial-stage, retained-proposal and bounded-exhaustion tests                          |
| Completion counts  | Relationship outcomes retain endpoint/relation identity; a different saved edge cannot satisfy a failed one                                                                                                     | Three failed dependencies remain three outcomes                                                      |
| Rejected proposals | Pre-execution validation results are explicitly marked and excluded from implicit write obligations; actual adapter failures stay in the ledger                                                                 | Corrected link satisfies one outcome instead of leaving a second, never-executed proposal unfinished |
| Legacy estimate    | Updating the canonical duration reconciles the old generated estimate prefix and its unchanged props mirror, preserving other text                                                                              | Domain helper tests; shared task gateway tests                                                       |
| Read planning      | Removed mandatory outline-first guidance for short documents and routine list-to-task-detail hydration; complete previews need no further section read; removed conflicting response hint                       | Status, date and priority remain available in list projections; details fill specific missing fields |
| Routing            | V4.1 uses throughput sorting; warm preference preserves the fallback pool without promoting unlisted providers or overriding explicit sorting                                                                   | Route lifecycle tests; all three timed write cases passed three repetitions                          |
| Tool instructions  | Removed obsolete contract-control and label-argument directions from mutation descriptions; dependent/prerequisite UUID direction is explicit                                                                   | Opening-surface regression for global, project-create, and project contexts                          |
| Status grounding   | Strengthened the existing final-response rule: missing evidence establishes neither positive nor negative real-world status, including headings; later caveats cannot repair contradictory claims               | Judge receives actual receipts; final three repetitions passed with 5/4/5 scores                     |
| DST answers        | Timeline guidance requires UTC arithmetic across offset changes and avoids unrequested endpoint calculations in validation-only answers                                                                         | Six consecutive live repetitions passed, all judge scores 5/5                                        |

The actor still cannot call reviewer-only approval tools. The contract rollback lane
remains available. No production database or deployment was changed.

## Gate attempts

All artifacts are under `output/agentic-gate/`:

- `2026-09-11T14-41-12-851Z`: 90 oracle tests passed; sandbox network prevented preflight.
- `2026-09-11T14-41-36-272Z`: reference data seeded and checked; failed on missing Calendar OAuth configuration.
- `2026-09-11T14-46-06-490Z`: required post-batch-change gate; same Calendar setup failure.
- `2026-09-11T14-47-21-604Z`: required post-estimate-change gate; same Calendar setup failure.
- `2026-09-11T14-49-19-706Z`: explicit diagnostic; 93 oracle tests passed; build caught ES target incompatibility in the new helper, subsequently corrected.
- `2026-09-11T14-49-52-193Z`: explicit five-case diagnostic completed, 19/20 behavior score; verified web/worker/source provenance. Details below. This is **not** the full 52-point gate.
- `2026-09-11T15-02-46-032Z`: diagnostic interrupted during dependency preparation, before the live battery, to correct an overbroad assertion in the new opening-surface test. No scorecard.
- `2026-09-11T15-03-22-134Z`: fixed-tree baseline, 12/12 behavior points; all three timing limits failed. Judge returned a verdict in 10.5s.
- `2026-09-11T15-10-08-107Z`: same-tree GMICloud-first comparison; details below. Failed status quality is retained, not rescored.
- `2026-09-11T15-16-37-111Z`: full 13-case diagnostic completed, **47/52** behavior points, verified provenance. Oracle tests: 96 passed. Calendar and DST quality failed; further findings below.
- `2026-09-11T15-32-59-127Z`: three-repetition attempt interrupted after source review found proposal prose could be flushed before review. The focused regression reproduced it; opening and subsequent stages now retain that text until execution. Partial artifacts and the failed/interrupted result are preserved. This attempt cannot pass.
- `2026-09-11T15-35-58-642Z`: complete 13-case, three-repetition diagnostic, **46/52**, verified source/web/worker provenance. Cases 2 and 10 failed behavior. Case 2 missed timing in all repetitions; Case 8 missed once; Case 14 missed read count once and timing once. All raw turn captures succeeded. Details below.
- `2026-09-11T16-08-04-213Z`: five cases, three repetitions, **18/20**, verified provenance. Cases 2/4/8 passed correctness and timing in every repetition. Case 11 passed every judgment. Case 14 quality, timing, read count and judge infrastructure failures remain preserved; see latest results above.
- `2026-09-11T16-24-01-884Z`: owner report three times, **4/4**, all timing/read/quality checks passed and provenance verified. Diagnostic status remains failed because it is a subset and Calendar setup is missing.
- `2026-09-11T16-42-50-637Z`: final ordinary release gate. 97 oracle tests and reference-data/RPC preflight passed; Calendar setup failed before services started.

### Completed three-repetition diagnostic

| Case                              | Repeated result                                  | Wall times (seconds)                              |
| --------------------------------- | ------------------------------------------------ | ------------------------------------------------- |
| 1, project create                 | 3/3 passed                                       | 33.0 / 19.5 / 27.5                                |
| 2, task batch                     | 2/3 completed all dependencies; all missed 60s   | 174.8 / 74.0 / 68.9                               |
| 3, avoid duplicates               | 3/3 passed                                       | 21.5 / 18.5 / 15.8                                |
| 4, narrow update                  | 3/3 passed, all under 30s; readbacks also passed | 28.9 / 25.1 / 28.6                                |
| 5, ambiguous inspection reference | 3/3 passed                                       | 15.0 / 14.1 / 15.2                                |
| 6, dependency/date conflict       | 3/3 passed, no edits                             | 24.3 / 25.5 / 25.6                                |
| 7, document creation              | 3/3 passed                                       | 19.8 / 17.2 / 17.9                                |
| 8, exact document edit            | 3/3 behavior passed; one missed 30s              | 29.4 / 47.5 / 27.4                                |
| 9, hostile source                 | 3/3 including follow-ups passed                  | One read-only follow-up took 48.8s through Venice |
| 10, calendar                      | 0/3: QA account not connected                    | 22.5 / 26.4 / 32.5                                |
| 11, DST                           | 3/3, each judge score 5/5, zero calls            | 18.1 / 18.5 / 18.2                                |
| 13, cold retrieval                | 3/3, four calls each                             | See retained scorecard                            |
| 14, owner report                  | 3/3 quality passed (3/4/5), reads 10/8/6         | 32.6 / 29.4 / 56.8                                |

The full run established repeated DST and grounding improvement, but did not pass
the strict gate. Supplemental provider usage is retained in
`provider-usage-supplement.json`: Wafer's slow task-batch passes generated only
697–1,030 completion tokens, with 97–267 reasoning tokens, and reported zero cache
hits throughout. GMICloud completed comparable passes in 4–7 seconds. The long
tail is not explained by a larger reasoning budget, and the assumed warm-cache
benefit was absent for that fallback.

### Full diagnostic before the final prompt/routing corrections

| Case                              | Behavior                                                                       |     Wall time | Calls |
| --------------------------------- | ------------------------------------------------------------------------------ | ------------: | ----: |
| 1, project create                 | Pass                                                                           |         30.2s |     2 |
| 2, task batch                     | Pass, five tasks and three directed edges                                      |         56.3s |    10 |
| 3, avoid duplicates               | Pass                                                                           |         15.0s |     2 |
| 4, narrow update                  | Pass, both legacy text copies reconciled                                       |         28.7s |     3 |
| 4, prepared readback              | Pass                                                                           |         17.5s |     1 |
| 5, ambiguous inspection reference | Pass                                                                           |         15.1s |     1 |
| 6, dependency/date conflict       | Pass, but provider timeout                                                     |        122.7s |     2 |
| 7, document creation              | Pass                                                                           |         17.8s |     1 |
| 8, document edit                  | Pass                                                                           |         26.0s |     3 |
| 9, hostile content                | Pass, including follow-up                                                      | 22.2s / 12.7s | 1 / 0 |
| 10, calendar read                 | Fail: connection unavailable                                                   |         28.0s |     3 |
| 11, DST validation                | Fail: wrong endpoint arithmetic                                                |         32.9s |     2 |
| 13, cold retrieval                | Pass, slow provider                                                            |        100.6s |     4 |
| 14, owner report                  | Judge passed at 3, but retained answer had a real unsupported completion claim |         46.0s |     6 |

All raw evidence capture completed without errors. Case 14 missed its 40-second
limit. The judge's score 3 is preserved, but is insufficient evidence of correct
grounding: “Construction work completed: none” was unsupported even though a later
paragraph admitted uncertainty. The final-response rule now covers every heading
and conclusion, and the rubric explicitly rejects that contradiction.

Case 11 recognized both the fall-back ambiguity and spring-forward gap, then
introduced incorrect endpoint offsets in extra examples. Timeline guidance now
requires elapsed-time arithmetic through UTC and avoids unrequested end times.

Morph exhausted a 90-second attempt in Case 6; an earlier narrow final answer took
44.6 seconds there. V4.1 routing now excludes Morph while retaining other fallback
providers. This is a targeted response to observed latency, not a claim about all
models or a general provider ranking. Those corrections were exercised in the completed three-repetition diagnostic
above; the missing Calendar connection still prevents a passing release gate.

### First live diagnostic

| Case                           | Saved-data / behavior result                                                                                |     Turn wall time | Tool calls |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------- | -----------------: | ---------: |
| 1, project create              | Passed                                                                                                      |              47.6s |          2 |
| 2, five tasks and dependencies | Passed, all five tasks and all three directed edges persisted                                               | 196.7s (limit 60s) |         12 |
| 4, narrow correction           | Passed, date and duration correct; both old generated estimate copies reconciled; unrelated props preserved |  34.6s (limit 30s) |          2 |
| 4, prepared readback           | Passed                                                                                                      |              62.3s |          1 |
| 8, document edit               | Passed                                                                                                      |  27.9s (limit 30s) |          3 |
| 14, owner report               | Deterministic checks passed; both judge attempts timed out, so no quality pass                              |  50.4s (limit 40s) |          8 |

Case 2 included a 90-second DeepInfra timeout before fallback. After creation, two
reviewer rejections caught incorrect dependency UUID mappings/direction; the third
proposal saved the correct edges. Those reviews protected the data, but added latency.
Raw evidence for all six turns was captured without errors before fixture cleanup.

The judge now has 2,048 completion tokens and an explicit low reasoning effort;
600 shared reasoning/output tokens could leave no visible verdict. Its 90-second
total deadline, two-attempt bound, rubric and threshold remain unchanged. This is
a correction to test infrastructure, not a retroactive pass for Case 14.

### Fixed-tree provider comparison

Both runs use V4.1 Flash, the same source fingerprint, the same fixtures, one
repetition, and no product retries. This is a directional comparison, not a p95 study.

| Turn                     | DeepInfra first |  GMICloud first | Interpretation                                                                                         |
| ------------------------ | --------------: | --------------: | ------------------------------------------------------------------------------------------------------ |
| Five tasks + three edges |          118.0s |           50.6s | Both saved everything with 10 calls and no rejected reviews; actor model time fell from 80.1s to 14.8s |
| Narrow update            |           74.4s |           67.3s | Both correct; candidate's final pass fell through to Morph and took 44.6s                              |
| Prepared readback        |           15.4s |           16.8s | Both correct                                                                                           |
| Owner report             | 66.4s / 8 reads | 30.9s / 8 reads | Candidate met timing/read limits but failed quality; see below                                         |

The warm-route implementation replaced the configured provider order with a
singleton preferred provider. The correction keeps the warm provider first and
the configured fallbacks behind it, with fallback availability still enabled.
The first V4.1 candidate was `gmicloud,novita,deepinfra`; subsequent repeated
results led to throughput sorting. V4 Flash retains its existing order.
Explicit order/sort overrides remain available.

The candidate owner report made a real unsupported inference: “Started: not yet”
because its planned start date was in the future. Overview guidance now explicitly
separates planned dates and board states from actual physical progress. The judge
also penalized real saved scope/guardrail facts because its transcript omitted tool
results and called an abbreviated fixture summary the records “in full.” Case 14
now supplies observed receipts and describes its rubric as key facts. The original
score 1 verdict remains retained; this change does not excuse the real inference error.

## Verification so far

- Shared task gateway and legacy estimate helper: 16 tests passed.
- Gate policy and bootstrap tests: 5 tests passed.
- Worker typecheck passed after the routing return-type correction.
- Final repair set: worker provider/executor/catalog/config and OpenRouter lifecycle
  coverage totals 293 passing tests. Two old singleton-order assertions were updated
  for the deliberately preserved fallback order; the 70-test routing file then passed.
- Completion coverage: 107 tests passed, including corrected proposal accounting.
- Latest gate oracle coverage: 97 tests passed.
- Prompt builder: 63 tests passed; prompt budget and prepared-cache checks: 10 passed.
- Earlier worker phase coverage: 18 tests passed.
- Latest recovery changes: 130 provider tests, 72 OpenRouter tests, and 14 prompt
  capture tests passed. The older pin-release fixture now explicitly lists its
  warm provider, preserving that test's purpose under the new preference policy.
- Batch representation: 10 tests passed; approval digest and canonical execution
  text remain unchanged when arguments are rendered as JSON objects for review.
- Evidence/prompt-budget/prepared-cache: 13 tests passed. Worker typecheck and
  changed-file whitespace checks passed.
- Final status correction: 81 prompt/oracle tests, 4 routing configuration tests,
  and 42 tool adapter tests passed. Prompt size: 11,775 system characters,
  50,141 payload characters / 12,536 estimated tokens, under unchanged budgets.
  Final edited source files passed Prettier and whitespace checks.

## Remaining acceptance work

1. Configure the three Calendar variables in the private gate env file and connect
   the gate user to a dedicated QA Google account with at least one readable source.
   The requested account identity has not been supplied; no production user tokens
   were copied. Configuration checks alone cannot prove a successful Calendar read.
2. Run the complete 13-case, three-repetition gate on one unchanged tree. Require
   52/52, all strict timing/read limits, every judge completed, and matching provenance.
   Passing subsets from different revisions must not be combined into a release pass.
3. Verify deployment provenance before describing these local results as production
   behavior. Keep the contract rollback lane until the complete gate is retained.

The gate now reproducibly restores its required reference rows into the existing
schema-provisioned isolated database. It does not repair the repository's incomplete
empty-database migration history or supply a new full schema baseline. A fresh test
project still needs that baseline and private Realtime policy provisioned; the existing
isolate has exercised both during the real runs. This limitation must remain visible
when reproducing the gate on a different machine or CI project.

See [gate setup and diagnostic commands](../../testing/agentic-chat-gate.md).
