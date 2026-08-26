<!-- docs/plans/AGENTIC_CHAT_WORKER_TASKER58_ISOLATED_TWO_SCENARIO_RERUN_2026-08-21.md -->

# Agentic Chat Worker — Tasker 58 Isolated Two-Scenario Rerun

**Date:** 2026-08-21  
**Scenarios:** `project-organize`, `task-multi-update`  
**Repetitions:** 3 each; 6 accepted worker turns total  
**Harness retries:** 0  
**Execution mode:** required `worker_realtime`  
**Outcome:** Tasker 58 closed; headline behavior remained 0/6 and exposed separate follow-up work.

## Bottom line

The production connection is now proven end to end and the Tasker 58 fixes held under live model
traffic. None of the three validation/truncation codes in Tasker 58 recurred. The valid run still
scored 0/6 because it encountered different failures:

- `project-organize`: one round-budget exhaustion and two reviewer/candidate-gate clarifications;
- `task-multi-update`: two hard `skill_load` allowlist rejections and one contract-reviewer
  clarification; and
- no strong-judge score was produced because every deterministic gate failed first.

This is not a passing behavior result. It is, however, valid evidence that the original JSON
truncation and contract-validation repair defects are fixed and that the remaining work is elsewhere.

## Production connection work completed before the run

The zero-spend worker preflight initially negotiated legacy transport. Inspection showed that the
dedicated E2E account was not in the Vercel routing cohort. A matching transport-lease secret was
also rotated onto both Vercel and Railway so its equality was known rather than inferred from an
unreadable sensitive Vercel value. The current canary user was preserved.

After the web release was rebuilt, the transport preflight passed. The first attempted scenario run
then exposed a second, worker-local gate: all six turns terminated as `internal_cohort_rejected`.
That attempt cost `$0.00`, and its artifact correctly marked the judge `not_reached`. The E2E account
was added to `AGENTIC_CHAT_INTERNAL_USER_IDS` while preserving the existing worker canary.

Final verified production state:

| Surface                   | Verification                                                                                |
| ------------------------- | ------------------------------------------------------------------------------------------- |
| Vercel web                | Deployment `dpl_4rGnrDsZm7sRUyX4eiSxReTx8imZ` Ready and owning `build-os.com`               |
| Railway worker            | Deployment `a44a151c-c3c2-4b49-aa2b-9fd2b331ee40` Success on application commit `648a24731` |
| Worker health             | database connected; realtime healthy; queue healthy; zero claim failures                    |
| Web routing cohort        | current canary preserved; dedicated E2E account added                                       |
| Worker execution cohort   | current canary preserved; dedicated E2E account added                                       |
| Transport lease           | one new random value installed on both web and worker                                       |
| Exact transport preflight | passed against `https://build-os.com` with no model turn                                    |

The two distinct cohort gates are intentional, but the preflight only tested the web routing gate.
That allowed six zero-cost worker-local rejections before the second gate was visible. A future
preflight should validate both cohorts, preferably through an authenticated no-provider admission
probe or a deployment-time cohort-parity check.

## Evidence-capture improvements

The rerun used evidence schema version 2 from clean commit `ff6e8eed6` (tree
`484237faee552b07fdb3a2169d22649ffeebfee3`) on branch
`codex/agentic-evidence-capture-20260821`. The application base was `648a24731`.

Compared with the prior artifact, schema v2:

- records the deterministic assertion separately from the strong-judge stage;
- records judge status as `not_configured`, `not_reached`, `passed`, `failed`, or `error`;
- retains judge score, threshold, pass/fail, and bounded reasoning when the judge runs;
- retains content-free provider-attempt observations: route, model, provider, duration, finish
  reason, and token counts;
- retains content-free tool execution boundaries and counts; and
- reports stage-level summary counts and execution-observation coverage.

No prompt bodies, hidden reasoning, tool argument bodies, tool result bodies, or unrestricted event
payloads are copied into the artifact. Local verification before the live run was 7/7 focused tests
plus a clean web typecheck.

The valid run had zero capture errors. It retained 2–76 execution observations per turn and made the
judge's `not_reached` state explicit for all six turns. One new evidence gap remains: the artifact
records `provider_tool_not_allowlisted` but not the rejected tool name. Payload-minimized Railway
typed-failure logs identified the tool as `skill_load` in both turns. That safe field should move
into durable execution observations so a future artifact is self-contained.

## Accepted run results

| Scenario            | Rep | Durable result     | Deterministic result | Judge       | Key retained evidence                                                                                  |          Cost |
| ------------------- | --: | ------------------ | -------------------- | ----------- | ------------------------------------------------------------------------------------------------------ | ------------: |
| `project-organize`  |   1 | failed / `error`   | failed               | not reached | `provider_round_budget_exceeded`; 17 provider requests; 21 read tools; no contract decision            | `$0.01531243` |
| `project-organize`  |   2 | completed / `stop` | failed               | not reached | acting contract → contract-reviewer revision → acting re-declaration → candidate-gate clarification    | `$0.01116158` |
| `project-organize`  |   3 | completed / `stop` | failed               | not reached | acting contract → contract-reviewer revision → acting re-declaration → contract-reviewer clarification | `$0.01797024` |
| `task-multi-update` |   1 | failed / `error`   | failed               | not reached | `provider_tool_not_allowlisted`; rejected name `skill_load`; one provider request                      | `$0.00040262` |
| `task-multi-update` |   2 | completed / `stop` | failed               | not reached | project read → acting contract → contract-reviewer clarification; no writes                            | `$0.00573760` |
| `task-multi-update` |   3 | failed / `error`   | failed               | not reached | `provider_tool_not_allowlisted`; rejected name `skill_load`; one provider request                      | `$0.00039589` |

Totals:

- headline assertion pass: 0/6;
- deterministic pass: 0/6;
- judge eligible: 0/6; judge scores: none;
- stream-error turns: 3/6;
- capture-error turns: 0/6; and
- model cost: `$0.05098036`.

## Tasker 58 exit check

| Required live absence                       | Result        |
| ------------------------------------------- | ------------- |
| `provider_tool_arguments_invalid`           | 0 occurrences |
| `provider_tool_validation_repair_exhausted` | 0 occurrences |
| `provider_tool_arguments_truncated`         | 0 occurrences |

Tasker 58 is closed. The new failures do not share its root cause:

- the organization budget failure was 17 successful acting-model provider rounds repeatedly reading
  documents until the round cap, not malformed/truncated JSON;
- the two task failures were an explicitly rejected, well-named but unadvertised tool
  (`skill_load`), not invalid arguments; and
- the three completed failures were reviewer/candidate-gate behavior, not execution-contract errors.

## What to investigate next

1. **`skill_load` prompt/tool-surface parity — first.** Two of three multi-task turns hard-failed on
   their first provider response. The prompt tells the model that skill-covered work must call
   `skill_load`, while the worker reported only 12 advertised tools and rejected that call. Feed the
   two durable turn IDs below to the agent already deep-diving `task-multi-update`:
   `ed9b065d-5207-4df9-949c-492002cf8daf` and
   `8cf3af09-d741-414a-9200-3c47f3537159`.
2. **Multi-task reviewer clarification — in parallel with item 1.** Rep 2 reached a valid durable
   completion but made no writes because the contract reviewer asked the user. This belongs in the
   existing multi-task behavioral deep dive.
3. **Project organization — parallel with the multi-task track.** Separate the 17-round read loop
   from the two revision-to-clarification paths. The former is a read strategy/budget problem; the
   latter is reviewer/candidate behavior.
4. **Evidence and preflight hardening — safe in parallel.** Persist rejected tool name in the
   allowlisted execution-observation payload and make preflight prove both routing and worker-local
   cohorts without a model call.
5. **Do not rerun this six-turn battery yet.** First make the two multi-task hard failures
   self-contained and resolve or intentionally ratify the organization read/reviewer behavior.

## Retained artifact

`docs/plans/evidence/agentic_chat_worker_tasker58_isolated_two_scenario_2026-08-21_ff6e8eed6.json`

- SHA-256: `10f67be03681728862587933cc6b063f50f664e954bd4cffa7b9d7b90d4612c0`
- bytes: `215964`
- schema: 2
- run id: `tasker58-isolated-accept-44761d98-504`
- repository dirty: false
