<!-- docs/technical/reviews/agentic-chat-harness-audit-2026-09-08/lane-J-eval-loop.md -->

# Lane J — The eval and iteration loop

**Question this lane answers.** How fast and how cheaply can DJ measure whether a prompt or harness
change made the cheap acting model (DeepSeek v4 flash) better?

**Answer in one paragraph.** Today the only instrument that grades the production acting model on
the production prompt is the live e2e harness, and it can only grade **deployed** worker code: the
harness admits turns into the one shared `agentic_chat_turn` queue that the Railway worker drains,
so a prompt edit costs a deploy, then ~11 minutes of serial model wall-clock for the 12 Cedar House
turns, before a number comes back. Money is not the constraint (a full battery is well under one
dollar of DeepSeek spend); the deploy dependency and wall-clock are. Meanwhile every production turn
already persists the exact opening request the model saw (`chat_prompt_snapshots.model_messages`
and `tool_definitions`, 14-day retention) and the full prompt-builder input
(`chat_turn_input_artifacts.prepared.contextPayload`, 7-day retention), and nothing harvests them.
The raw material for an offline, multi-model, first-pass replay exists in the database and the
grader/validator/fetch patterns exist in the worker test suite, but no script connects them. Around
that gap sits ~5,000 lines of eval machinery that no longer measures anything on the worker lane
(the prompt-eval scenarios and admin "Run eval"/"Replay" flow, the phase-a route eval and open-brief
control for a router that is not on the chat path, legacy attribution classes), plus 20 harness unit
tests that never run in CI because the whole directory is excluded from `pnpm test`.

Evidence file: `evidence/lane-J-measurements.json`. All line numbers are working tree at
`6d70b36e1` plus the uncommitted diff.

---

## 1. Subsystem map — how the loop runs today

1. **Entry.** `pnpm --filter @buildos/web test:agentic[:battery|:book|...]` runs
   `apps/web/vitest.config.agentic.ts` (serial, `retry: 1` by default, 120 s test timeout at
   `vitest.config.agentic.ts:61-67`; the battery script overrides retries to 0 at
   `apps/web/package.json:44`).
2. **Runner.** `apps/web/src/lib/tests/agentic-e2e/__tests__/agentic-scenarios.test.ts` logs in
   through `POST /api/auth/login` against a local dev server (`harness/auth.ts:47`), provisions the
   test user + actor with the service key (`harness/test-user.ts:44-66`), opens a Supabase Realtime
   client, and demands a `worker_realtime` lease (`harness/worker-client.ts:128-149`).
3. **Per turn.** `AgenticE2EWorkerClient.runTurn` (`worker-client.ts:151-300`) inserts a
   `chat_sessions` row directly, negotiates a lease, posts a worker admission, then waits up to
   315 s (`worker-client.ts:46`) for the durable terminal event, with a 30 s reconciliation retry.
   The turn is executed by **whatever worker drains the queue** — in practice the hosted Railway
   service (`apps/worker/src/workers/agentic-chat/host/consumer.ts:64` registers the single job type;
   there is no cohort/partition filter anywhere in `apps/worker/src` or
   `apps/web/src/lib/services/agentic-chat-v2`).
4. **Assertions.** Each scenario asserts on three surfaces: stream events (`turn.toolCalls`,
   `assistantText`), ground truth (`onto_*` rows through `harness/telemetry.ts`), and soft
   telemetry (`chat_turn_runs`, `chat_tool_executions`). Fuzzy turns add an LLM judge
   (`harness/judge.ts`, `profile: 'powerful'`).
5. **Scoring.** With `AGENTIC_BATTERY=cedar-house`, `harness/battery.ts` maps the Phase 0 result
   class of each turn onto the audit's 0–4 rubric (`battery.ts:42-49`), scores a scenario by its
   worst turn (`battery.ts:62-71`), and writes `/tmp/buildos-agentic-battery-<run>.json`.
6. **Evidence.** `AGENTIC_PHASE0_CAPTURE=true` additionally writes a 915-line-schema evidence
   report (`phase0/evidence-report.ts`), but refuses a dirty tree
   (`agentic-scenarios.test.ts:111-118`).
7. **Production telemetry.** `pnpm agentic:health` (`apps/web/scripts/agentic-health/`) reads
   `chat_turn_runs`, usage logs and observations for a window and prints 16 aggregate metrics; two
   outputs exist under `apps/web/output/agentic-health/` from 09-03.
8. **Persisted prompts.** The worker persists the exact opening request every turn:
   `turn-executor.ts:955-972` → `promptSnapshot.ts:74-86` →
   `persist_agentic_chat_prompt_snapshot_v3` with `p_model_messages` and `p_tool_definitions`
   (OpenAI wire format, built by `provider/request-builders.ts:381-411`). Retention is 14 days for
   snapshots and 2 days for rendered dumps
   (`supabase/migrations/20260830173250_agentic_chat_materialized_context_cache.sql:418-419`).
   The admission side stores the full prompt-builder input as
   `prepared.contextPayload` (`worker-turn-preparation.server.ts:618`) for 7 days
   (`packages/shared-types/src/agentic-chat-worker-contract.ts:11`).
9. **Local dumps.** `AGENTIC_CHAT_LOCAL_PROMPT_DUMPS=true` on a local `dev:chat` worker writes
   every outgoing request/response pair to `apps/worker/.prompt-dumps/` (`promptDump.ts:47-124`,
   48 h prune). The directory exists locally with only a README — no dumps retained.
10. **Deterministic worker tests.** `apps/worker/tests/agenticChatTurnProvider.test.ts` (10,881
    lines, 99 `it`) drives `AgenticChatTurnProviderAdapter` with scripted provider event arrays
    (`clientWith(events)` / `clientWithRounds(rounds)` at lines ~126-146). These test the
    harness's reaction to a model output, never the model's decision.
11. **Opt-in live model tests on the worker.** `agenticChatContractReviewer.live.test.ts` replays
    the _reviewer_ (real `buildTurnContractReviewRequest`, real `ONTOLOGY_WRITE_TOOLS`, real
    `AgenticChatOpenRouterClient`, pinned `GPT_56_LUNA_MODEL`) against 8 synthetic scenarios and
    grades the approved contract byte-for-byte (`assertCommission`, lines 222-262).
    `agenticChatToolExecutionGraphOpenRouter.live.test.ts` replays a **7-line synthetic system
    prompt and 7 fake tools** (`fixtures/agenticChatToolExecutionGraphModelScenarios.ts:64-122`)
    to test call_ref/after emission — it does not touch the production prompt.
12. **Admin.** `/admin/chat/sessions` shows turn runs, prompt snapshots (compact export includes
    `model_messages`/`tool_definitions`, `chat-session-audit-compact.ts:145-147`), a "Run eval"
    button (`+page.svelte:290`) and a "Replay scenario" panel (`+page.svelte:319`,
    `ReplayScenarioPanel.svelte`). The replay endpoint returns HTTP 410
    (`routes/api/admin/chat/evals/replay/+server.ts:5-13`).

---

## 2. Inventory of every eval/test surface

| Surface                                                                                                       | Drives                                                                        | What it measures                                                              | Cost to run                                                                                                      | Last touched / run                                                                                                                          | Verdict                                                                            |
| ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `test:agentic` (30 scenarios, ~40 turns)                                                                      | dev server → lease → **hosted** worker → hosted DB → production model         | Full-stack outcome per scenario; ground-truth rows                            | ~40 turns × 56 s mean = ~37 min serial; model spend < $1; judge on fuzzy turns; needs 3 env secrets + dev server | Files 09-04 (one-engine merge); no scorecard artifact found in `/tmp` or `artifacts/`                                                       | Load-bearing but slow; only measures deployed code                                 |
| `test:agentic:battery` (Cedar House, 11 cases / 12 turns)                                                     | same                                                                          | 0–4 per case, letter grade, diffable JSON                                     | ~12 × 56 s ≈ 11 min + up to 450 s/scenario timeout; < $0.50                                                      | Built 09-03/04; **the 27/52 number came from a manual browser battery, not this script** (`artifacts/agentic-chat-postdeploy-6d787284c.md`) | Right idea; scoring fidelity issues (J5); has never produced a committed scorecard |
| `test:agentic:phase0-evidence` (8 scenarios × 3 reps)                                                         | same                                                                          | Wilson-interval pass rates, retained evidence, provider observation allowlist | 24 scenario-runs, ~1–2 h; clean tree required                                                                    | Aug gate campaigns; no artifact since one-engine                                                                                            | Historical gate instrument; classifier reused by battery                           |
| `test:agentic:book`                                                                                           | same                                                                          | 4-turn creative journey checkpoints                                           | ~4–6 min                                                                                                         | 07-30                                                                                                                                       | Fine, niche                                                                        |
| `test:agentic:modal:*` (Playwright, 1,099 lines)                                                              | real browser → real app; `@wiring` intercepts transport, `@live` pays         | Client wiring (cancel, reconcile, attachments, prewarm)                       | Chromium install; `@live` 1 paid turn                                                                            | 09-04                                                                                                                                       | Not a model instrument; keep                                                       |
| `test:agentic:phase-a-route*` / `phase-a-control*` (1,235 lines)                                              | `@buildos/agent-orchestrator` `routeRequest` via SmartLLM (GLM 5.2 default)   | Router accuracy on a frozen 8+5 corpus                                        | 8×9 route calls                                                                                                  | `phase-a` corpus 07-25; scripts 09-04 (merge)                                                                                               | **Not on the chat path** — no production consumer (J4)                             |
| `open-brief-control.test.ts` (772 lines)                                                                      | hosted worker + agent-orchestrator harness                                    | Open-brief cohort behaviour                                                   | paid                                                                                                             | 08-24                                                                                                                                       | Same experiment as phase-a (J4)                                                    |
| `prompt-eval-scenarios.ts` + `prompt-evaluator.ts` + runner + comparison (1,659 lines src) + admin "Run eval" | Reads a persisted turn; no model call                                         | `first_lane`, `gateway_op`, event types                                       | free                                                                                                             | 07-24                                                                                                                                       | **Cannot pass on a worker turn** (J3)                                              |
| Admin "Replay scenario" panel                                                                                 | `/api/admin/chat/evals/replay`                                                | —                                                                             | —                                                                                                                | endpoint 410 since `439380dc5`                                                                                                              | Dead UI (J3)                                                                       |
| `agenticChatContractReviewer.live.test.ts`                                                                    | OpenRouter directly, pinned GPT-5.6-luna, production reviewer request builder | Reviewer decision + approved contract exactness on 8 synthetic cases          | 8–24 calls, ~$0.10                                                                                               | 09-04; results JSON in `artifacts/agentic-chat-ef4ad9a-reviewer-replay-results.json`                                                        | **Closest thing to a model-only replay** — reviewer only                           |
| `agenticChatToolExecutionGraphOpenRouter.live.test.ts`                                                        | OpenRouter directly, synthetic prompt/tools                                   | Whether a model can emit `call_ref`/`after`                                   | 5 scenarios × N                                                                                                  | 08-27                                                                                                                                       | Capability probe, not a harness eval                                               |
| `agenticChatTurnProvider.test.ts` and 71 other worker suites (40,983 lines)                                   | scripted provider events                                                      | Harness reaction to given model outputs                                       | vitest, ~1.7k tests                                                                                              | continuous                                                                                                                                  | Right; not a model instrument                                                      |
| Local prompt dumps (`promptDump.ts`)                                                                          | local `dev:chat` worker                                                       | Exact request/response per pass                                               | free; dev only                                                                                                   | 09-05; dir empty                                                                                                                            | Right; nothing consumes the dumps                                                  |
| `agentic:health`                                                                                              | read-only SQL over production                                                 | 16 aggregate metrics (kills, retries, reviewer share, control share, latency) | seconds                                                                                                          | two outputs 09-03                                                                                                                           | Right; outcome-blind (no correctness signal)                                       |
| `scripts/agentic-e2e/semantic/*`                                                                              | semantic search RPCs                                                          | Retrieval recall/dominance                                                    | embeddings                                                                                                       | 08-31                                                                                                                                       | Different subsystem (search), out of scope                                         |

**No surface** sends the production opening request to a model of DJ's choosing and scores the
first-pass tool decision. **No golden set** of (message, context, expected tool calls) exists for
the acting model. The nearest artefacts are the reviewer replay (reviewer only, synthetic context)
and the tool-graph probe (synthetic prompt).

---

## 3. The gap, precisely

### 3.1 Why a prompt change costs a deploy

`AgenticE2EWorkerClient.runTurn` posts a real admission (`worker-client.ts:201-216`). The web's
admission path enqueues one job type (`consumer.ts:64-71`), and `claim_agentic_chat_turn`
(`executionControl.ts:117`) has no cohort argument; `grep` for any partition/cohort env in
`apps/worker/src` and `apps/web/src/lib/services/agentic-chat-v2` returns nothing. The one-engine
handoff states it directly: "turns execute on the hosted Railway worker (there is no queue
partition), so the branch's worker code cannot be exercised live without deploying it"
(`docs/technical/reviews/ONE_ENGINE_BRANCH_HANDOFF_2026-09-04.md:55-63`), and option 3 there
(local worker on the hosted queue) "would compete with production for real users' turns".

The README's "Model/scaffold comparisons" section (`agentic-e2e/README.md:115-149`) documents
pinning a model with `FASTCHAT_EVAL_PINNED_MODELS`; that variable has **zero** non-test consumers
in `apps/web/src` or `apps/worker/src` (only `model-tiering.ts`, which is itself imported only by
`agentic-chat-v2/index.ts`). The acting model is fixed by the worker's Railway environment
(`apps/worker/src/workers/agentic-chat/host/config.ts:263-268`). So "run the battery under model X" is
not possible from the harness at all.

### 3.2 What already exists to close it

| Piece                                     | Where                                                                                                                                                | Status                           |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| Exact opening request per production turn | `chat_prompt_snapshots.model_messages`, `.tool_definitions`, `.system_prompt` (`promptSnapshot.ts:74-86`; format from `request-builders.ts:381-411`) | Persisted every turn, 14-day TTL |
| Full prompt-builder input per turn        | `chat_turn_input_artifacts` → `prepared.contextPayload` (`worker-turn-preparation.server.ts:618`)                                                    | 7-day TTL                        |
| What the model actually did               | `chat_tool_executions` (sequence, tool_name, arguments, success) and `chat_turn_events`                                                              | Persisted                        |
| Pure prompt re-render                     | `buildLitePromptEnvelope(input)` (`agentic-chat-lite/prompt/build-lite-prompt.ts:191`) — no I/O                                                      | Exists                           |
| Pure request assembly                     | `buildBaseProviderRequest` (`request-builders.ts:97`) from an execution input                                                                        | Exists, exported                 |
| Pure argument validator                   | `validateCompletedProviderCalls(calls, request, admittedTools)` (`provider/validation.ts:33`)                                                        | Exists, exported                 |
| Raw OpenRouter fetch with usage           | `agenticChatToolExecutionGraphOpenRouter.live.test.ts:55-109`                                                                                        | Exists (copy pattern)            |
| Trace grader pattern                      | `gradeToolGraphModelTrace` (`fixtures/agenticChatToolExecutionGraphModelScenarios.ts`)                                                               | Exists                           |
| Model pricing table                       | `packages/smart-llm/src/model-config.ts` (`cost`, `outputCost` per 1M)                                                                               | Exists                           |

Everything needed is present; what is missing is ~500 lines of glue and a labelled corpus.

---

## 4. The Cedar House battery as an instrument

Source: `apps/web/src/lib/tests/agentic-e2e/scenarios/cedar-house/`. 11 registered cases, 12
turns, 6 write cases, 2 cold-session cases, 1 judged case, 3 pending calendar cases
(`cedar-house.test.ts:26,71-93`).

| Case                                  | Mechanisms conflated in one pass/fail                                                                                                       | Isolates one mechanism?      | Flaky by construction?                                                                                                                                                                                                                                                   | Note                                                             |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- |
| 1 project create (`case-01`)          | context routing to `project_create`, exact name preservation, civil-date storage, description fidelity, restraint (no tasks/events) — 5     | No                           | **Yes**: exact-name match (`case-01:67-76`) on a harness name of the form `AE2E · run=<label>-<12hex> · [QA BATTERY] Cedar House Renovation · <8hex>` (`harness/seed.ts:29-34`); a cheap model that trims or normalises `·` fails a case whose point is dates and budget | Split name check into a soft check; move run-id into description |
| 2 task batch (`case-02`)              | 5 creates, due dates, priority mapping, minutes text, prerequisite text, todo state, no events — 7                                          | No                           | Partly: prerequisite is asserted as **description text** (`case-02:81-88`) although the prompt says "as relationships if supported"; a model that correctly links `link_onto_entities` edges but writes no prose fails                                                   | Accept edge OR text                                              |
| 3 no duplicate (`case-03`)            | idempotent read-before-write                                                                                                                | **Yes**                      | No                                                                                                                                                                                                                                                                       | Best-shaped case                                                 |
| 4 narrow update (`case-04`)           | same-row identity, 2 fields, no collateral fields, no event — 3 but all one behaviour ("narrow edit")                                       | Mostly                       | No                                                                                                                                                                                                                                                                       | Good                                                             |
| 5 ambiguous reference (`case-05`)     | restraint + question + names both candidates                                                                                                | **Yes**                      | Low (`?` + two tokens)                                                                                                                                                                                                                                                   | Good                                                             |
| 6 dependency conflict (`case-06`)     | restraint + mentions "permit" + one of six ordering words                                                                                   | **Yes**                      | Low                                                                                                                                                                                                                                                                      | Good                                                             |
| 7 document create (`case-07`)         | verbatim 5-section fidelity + restraint                                                                                                     | Mostly                       | No                                                                                                                                                                                                                                                                       | Oracle source; fine                                              |
| 8 document edit (`case-08`)           | same-doc identity, two replacements, one append, preservation of four blocks                                                                | Mostly (all "in-place edit") | No                                                                                                                                                                                                                                                                       | Good detector for "said it would, never did"                     |
| 9 hostile source (`case-09`, 2 turns) | verbatim storage incl. override block, no injection landing, then read-only summary with negation-aware `$95,000` regex (`case-09:129-137`) | No                           | **Yes**: hostile-text behaviour is the noisiest model behaviour in the set, and turn 2's text regex can pass a summary that _repeats_ the cap with any of five hedge words                                                                                               | Keep, but score turns separately                                 |
| 13 cold retrieval (`case-13`)         | name resolution of the noisy harness name in a cold session, then three exact quotations                                                    | No                           | Partly (name)                                                                                                                                                                                                                                                            | Prompt names the project by the full harness string              |
| 14 grounded status (`case-14`)        | budget present, no false-absence regex, then judge at ≥3                                                                                    | Judge does the isolating     | Judge route issue (J6)                                                                                                                                                                                                                                                   | Only judged case                                                 |
| 10–12 calendar                        | pending (`cases-10-to-12-calendar.pending.ts`)                                                                                              | —                            | Would be transport-bound (live Google reads)                                                                                                                                                                                                                             | Correctly excluded                                               |

Three of eleven cases isolate one mechanism (3, 5, 6). Two are flaky by construction for a reason
unrelated to the behaviour under test (1, 9). Case 2 is the battery's most load-bearing write case
and is the least diagnosable when it fails: seven independent ways to lose all four points.

**Scoring fidelity (J5).** The manual rubric distinguishes 1 ("material failure with useful/
accurate recovery") from 0 ("failed or misleading success"). `battery.ts:42-49` maps
`behavior_failure` → 1 and `transport_failure` → 0, and `classifyPhase0TurnResult`
(`phase0/evidence-report.ts:409-424`) yields `behavior_failure` for any deterministic assertion
failure regardless of what the assistant claimed. So the automated battery cannot emit the audit's
0 for case 8's "promised, never did" shape — it scores that 1. The single most user-damaging
failure class (misleading success) is invisible to the diffable number.

**Judge (J6).** `harness/judge.ts:3-6` says the judge "deliberately uses a STRONG JSON route
(`powerful`) so grading is not bottlenecked by the same weak models we're stress-testing". The
`powerful` JSON route is `[gemini-3.7-flash, glm-5.3-flash, glm-5.2, deepseek-v4-pro,
gpt-5.6-luna, grok-4.6, deepseek-v4-flash]` (`packages/smart-llm/src/model-config.ts:651-659`):
first choice is a flash model and the last fallback is the acting model under test.

**Economics.** From the 09-04 receipts, 11 turns averaged 55.9 s (median 55.3 s;
`artifacts/agentic-chat-postdeploy-6d787284c.md`, "Selected reproducible evidence"). A serial
12-turn battery is ~11 minutes of model time plus seed/teardown, bounded by 450 s per scenario
(`agentic-scenarios.test.ts:59`). At $0.098/M input the acting-model spend is cents; the reviewer
and judge add a few more cents. Time and the deploy dependency are the cost, not dollars.

---

## 5. What is over-built or dead

### 5.1 Prompt-eval scenarios, evaluator, runner, comparison, admin buttons — dead on the worker lane (J3)

`apps/web/src/lib/services/agentic-chat-v2/prompt-eval-scenarios.ts` declares 13 scenarios
(lines 53-310). All 13 carry `requiredEventTypes` containing `'done_emitted'`; 8 carry
`requiredObservedOps` (e.g. `util.workspace.overview`, `cal.event.list`, `onto.project.create`);
4 carry `expectedFirstLane`; two require `supervisor_*` events. The evaluator checks these against
`toolExecutions[].gateway_op` (`prompt-evaluator.ts:81`), `event.event_type === 'skill_loaded'`
(`:136`), and `turnRun.first_lane` (`:272-279`).

On the worker lane none of these are ever populated:

- The read-tool ledger RPC inserts `gateway_op, help_path` as `NULL, NULL`
  (`supabase/migrations/20260804036000_agentic_chat_read_tool_execution_ledger.sql:333-343`);
  the worker's `persistRead` passes no such fields (`toolExecution.ts:131-157`).
- No worker or runtime module writes `first_lane` / `first_canonical_op` (`grep` over
  `apps/worker/src`, `packages/*/src` excluding generated types: 0 hits). The only writer,
  `apps/web/src/lib/services/agentic-chat-v2/turn-observability-writer.server.ts` (576 lines), is
  imported by nothing but its own test.
- The worker persists terminal `done` (`streamPublisher.ts:546`) and semantic event types equal to
  the SSE message `type`; `done_emitted` / `prompt_snapshot_created` exist only in
  `packages/agentic-chat-runtime/src/lifecycle-observability.ts:151-153`, whose sole export
  `projectAgenticChatWorkerLifecycleObservationsV1` has 0 consumers in `apps/worker/src` and
  `apps/web/src`.

Consequence: pressing "Run eval" on `/admin/chat/sessions` (`+page.svelte:290`) against any worker
turn records a failed `chat_prompt_eval_runs` row for every scenario. The neighbouring "Replay
scenario" panel (`+page.svelte:319`, `ReplayScenarioPanel.svelte`, 94 lines) posts to an endpoint
that returns 410 `REPLAY_RETIRED` (`routes/api/admin/chat/evals/replay/+server.ts:5-13`).
`tasker/80:183` already notes one of the 13 "can no longer pass on the worker lane".

Size: 1,659 lines of source + 799 lines of tests + 3 API routes + 1 panel + 576 lines of dead
observability writer.

### 5.2 Phase-A route eval, open-brief control, `@buildos/agent-orchestrator` (J4)

`phase-a/route-mode-eval.test.ts` imports `routeRequest`, `ROUTE_SYSTEM_PROMPT`,
`buildPhaseAWorldCard` from `@buildos/agent-orchestrator` (lines 14-29). Neither `apps/worker/src`
nor `apps/web/src` (excluding tests and `agentic-e2e/`) references any of those symbols; the
package's only importers outside itself are `apps/web/package.json:81`,
`apps/web/tsconfig.phase-a.json`, `apps/worker/tsconfig.phase-a.json`, and the two e2e folders.
The package is 10,783 lines. The frozen corpus is 8 + 5 scenarios
(`packages/agent-orchestrator/src/testing/harness/corpus/phase-a*.json`). Five package scripts
(`package.json:46-50`) and 13 of the harness's 35 env knobs exist for this. The memory note for
the experiment reads "Phase A closed unmeasured".

### 5.3 Legacy attribution path and README sections (J8, J12)

`harness/attribution.ts` keeps `readTurnAttribution` over `llm_pass_completed` /
`orchestration_interventions` events (lines 93-124) and a `supervisor_rescued` outcome class
(lines 8, 67-89); the worker path `readWorkerTurnAttribution` returns `interventions: null` and
therefore classifies every fully-attributed turn as `native` (`:157-181`) — including turns that
needed truncation retries or validation repair. The per-turn attribution log line the runner prints
(`agentic-scenarios.test.ts:388-396`) is thus uninformative on the only lane that exists.

`README.md:115-149` (model/scaffold comparisons) and `:150-168` (local dev caveats about
`vite dev` not finalising `chat_turn_runs`, and the follow-up "release" hack) describe the deleted
web engine. `releaseTurnForFollowup` (`telemetry.ts:237-255`) only touches rows still `running`,
which after `assertTurnRunCompleted` are none — harmless, but the README steers a reader to a
model-pinning workflow that cannot work.

### 5.4 Harness unit tests that never run (J7)

`apps/web/vitest.config.ts:134` excludes `**/lib/tests/agentic-e2e/**` from `pnpm test`;
`.github/workflows/ci.yml` has no agentic entry. Twenty test files under `agentic-e2e/` make no
network call (`harness/assertions.test.ts`, `battery.test.ts`, `worker-client.test.ts`,
`phase0/evidence-report.test.ts`, `scenarios/cedar-house/cedar-house.test.ts` — the oracle-drift
guard whose header says it exists so drift is "checked here instead of being discovered
mid-battery" — and 15 more). They run only when someone runs the **paid** config without a
scenario filter, because `vitest.config.agentic.ts:58` includes every `*.test.ts` in the tree.
The battery script names one file explicitly, so the guard does not run before a battery either.

### 5.5 Phase 0 evidence capture (keep the classifier, retire the rest later)

`phase0/evidence-report.ts` is 915 lines; the battery uses two exports
(`classifyPhase0TurnResult`, `readPhase0RepositoryState`). The capture path (clean-tree refusal,
provider observation allowlist projection, Wilson intervals, table footprints) served the Aug gate
campaigns. It is not wrong; it is a second, heavier scoring path that a replay corpus would make
redundant. Not a delete today.

---

## 6. Proposed minimal loop — "harness for cheap models"

Goal: after editing a prompt section, a tool description, or a schema, get a per-model table of
first-pass tool choice + argument validity + tokens + latency + dollars in under ten minutes, for
under a dollar, with no deploy and no dev server.

### 6.1 Shape

```
apps/worker/scripts/agentic-eval/
  pull-corpus.mjs          # DB → corpus/<turn_run_id>.json (messages, tools, context, observed calls)
  corpus/                  # committed; ~50 real DJ turns, scrubbed (see 6.4)
  expectations.json        # hand-labelled per turn: expected tool set / forbidden / arg predicates
  replay.ts                # corpus × models × N → OpenRouter first pass → runs/<stamp>.jsonl
  grade.ts                 # tool-set match + validateCompletedProviderCalls + expectation predicates
  report.mjs               # per-model table: correct %, arg-valid %, mean prompt tokens, p50 latency, $
  rerender.ts              # (phase 2) contextPayload → buildLitePromptEnvelope → buildBaseProviderRequest
  README.md
```

The worker package is the right home: it owns `request-builders.ts`, `validation.ts`,
`openrouter-client.ts`, and the OpenRouter route config, and `tsx` is already a dev dependency
(`apps/worker/package.json:11-12`).

### 6.2 Two replay modes

1. **Model-swap replay (phase 1).** Send `model_messages` + `tool_definitions` exactly as persisted.
   Measures: how N models behave on the _same_ prompt. Pure `fetch`; the request body is the
   snapshot plus `model`, `tool_choice: 'auto'`, `temperature: 0`, `usage: {include: true}`,
   `provider: { order: [...], allow_fallbacks }` — the same body shape as
   `agenticChatToolExecutionGraphOpenRouter.live.test.ts:70-83`.
2. **Prompt-change replay (phase 2).** Rebuild the request from the artifact's `contextPayload`
   with the _current_ `buildLitePromptEnvelope` (pure, `build-lite-prompt.ts:191`) and
   `buildBaseProviderRequest` (`request-builders.ts:97`), then replay. Measures: did my prompt or
   schema edit change the cheap model's first pass. Needs the web prompt builder, so this file runs
   under `apps/web` with `vite-node` (the repo already has that pattern:
   `report:agentic-tools` at `package.json:69`).

Both modes score only the **first pass**. That is deliberate: it is the pass the cheap model gets
wrong most (tool choice, missing/invalid arguments, contract vs direct write), it needs no tool
execution, and it is the cheapest possible unit. Multi-round behaviour stays with the live battery.

### 6.3 Grading

Per replayed call, four booleans and three numbers:

- `tool_set_ok` — set of called tool names ⊇ expected and ∩ forbidden = ∅ (expectations.json).
- `args_valid` — `validateCompletedProviderCalls(calls, request, tools).length === 0`
  (`validation.ts:33`); this reuses the production validator, so schema edits are graded by the
  same code that will reject the model in production.
- `contract_lane_ok` — for write turns, did it declare/skip `declare_turn_contract` as expected
  (the direct-vs-contract routing the 09-02 audit added).
- `predicates_ok` — optional per-turn JSON predicates on arguments (e.g. `due_at` date equals
  `2026-09-22`, `title` equals the quoted string). Small DSL: `{ path, op, value }`.
- `prompt_tokens`, `completion_tokens`, `latency_ms` from the OpenRouter usage block; dollars from
  `model-config.ts` `cost`/`outputCost`.

Report is one table per corpus tag (read / narrow-write / batch-write / restraint / cold) and one
per model, plus a diff against the previous run file.

### 6.4 Corpus

- Source: `chat_prompt_snapshots` joined to `chat_turn_runs` (user = DJ, last 14 days, `status =
completed | failed`) and `chat_tool_executions` for the observed first round. ~50 turns spanning
  the three surfaces; add the 12 Cedar House prompts by running the live battery once with
  snapshot export on, so the offline set and the live set share cases.
- Labelling: `expectations.json` is written by hand from the observed calls, correcting where the
  deployed model was wrong. Two to three hours for 50 turns. This is the "golden set" that does
  not exist today.
- Scrub: replace email addresses and calendar attendee names in `model_messages` (regex), keep
  project data (it is DJ's own). Commit under `apps/worker/scripts/agentic-eval/corpus/`.
- Freshness: `pull-corpus.mjs --since` re-pulls; snapshots older than 14 days are gone, so the
  committed copy is the durable one.

### 6.5 Effort and cost

| Item                                                                       | Hours     |
| -------------------------------------------------------------------------- | --------- |
| `pull-corpus.mjs` (service-key select, join, write JSON, scrub)            | 2         |
| `replay.ts` (fetch, concurrency 4, retries, usage capture, JSONL)          | 2         |
| `grade.ts` (import validator, expectation DSL, contract-lane check)        | 3         |
| `report.mjs` (tables, diff vs previous run)                                | 1         |
| Label 50 turns                                                             | 2–3       |
| README + `package.json` script `eval:replay`                               | 0.5       |
| **Phase 1 total**                                                          | **10–12** |
| Phase 2 `rerender.ts` (contextPayload → envelope → request; artifact pull) | 4–6       |

Run cost at ~15k prompt tokens per call (measured canonical payload is 12.5k est tokens before
live data, `prompt-size-budget.test.ts:238-240`; worker tool bytes 31–34k per surface,
`agenticChatWorkerSurfaceBudget.test.ts:120-125`), using `model-config.ts` prices:

| Corpus × reps | deepseek-v4-flash | gpt-5.6-luna | gemini-3.7-flash | deepseek-v4-pro | glm-5.2 | all five |
| ------------- | ----------------- | ------------ | ---------------- | --------------- | ------- | -------- |
| 12 × 1        | $0.02             | $0.04        | $0.07            | $0.08           | $0.17   | $0.38    |
| 50 × 1        | $0.07             | $0.15        | $0.28            | $0.33           | $0.69   | $1.52    |
| 50 × 3        | $0.22             | $0.45        | $0.84            | $0.98           | $2.08   | $4.57    |
| 100 × 3       | $0.44             | $0.90        | $1.69            | $1.96           | $4.15   | $9.14    |

Wall-clock: 150 calls at concurrency 4 and 5–15 s each is 3–9 minutes. Machine memory: one Node
process, no vitest, no dev server.

### 6.6 Files touched

New: the directory above. Edited: `apps/worker/package.json` (one script),
`apps/worker/src/workers/agentic-chat/README.md` (one section pointing at it). Optional: a
`--export-snapshots` flag on the e2e battery so each Cedar House turn's snapshot lands in the corpus
(`agentic-scenarios.test.ts` after `waitForTurnRun`, ~20 lines).

### 6.7 What this does not replace

The live battery still owns: multi-round behaviour, ground-truth writes, reviewer interaction,
calendar/email transport, and the 12-pass cap. The replay is the **inner** loop; the battery is the
**outer** loop run before a deploy. The health script stays the production loop.

---

## 7. Findings

| ID  | Sev | Kind                    | Title                                                                                                |
| --- | --- | ----------------------- | ---------------------------------------------------------------------------------------------------- |
| J1  | P1  | eval gap / architecture | A prompt change cannot be measured without a deploy                                                  |
| J2  | P1  | capability gap (eval)   | No golden corpus and no offline first-pass replay, though every input is already persisted           |
| J3  | P1  | dead code / bug         | Prompt-eval scenarios, evaluator, and admin Run-eval/Replay cannot pass on the worker lane           |
| J4  | P2  | over-engineering        | Phase-A route eval, open-brief control and `@buildos/agent-orchestrator` have no production consumer |
| J5  | P2  | eval gap                | Battery scoring cannot emit the rubric's 0 for "misleading success"                                  |
| J6  | P2  | eval gap                | Judge route starts with a flash model and falls back to the acting model                             |
| J7  | P2  | eval gap                | 20 harness unit tests (incl. the Cedar House oracle guard) never run in CI or before a battery       |
| J8  | P3  | prompt/doc quality      | README documents model pinning and scaffold variants the worker never reads                          |
| J9  | P2  | eval gap                | Cedar House cases 1, 2, 9, 13 conflate mechanisms or fail on harness-name noise                      |
| J10 | P3  | cost                    | Battery economics: time and deploy dependency, not dollars                                           |
| J11 | P3  | bug                     | Worker attribution reports `native` for every attributed turn                                        |

Details for each are in §3–§5 above; the structured output carries the same eleven findings with
evidence, cheap-model impact, fix, effort, and risk.

---

## 8. What is right and must not be undone

- **Ground-truth assertions over `onto_*` rows** (`harness/telemetry.ts`, `assertions.ts`), and the
  explicit rule that a scenario failing because the product is broken "is doing its job — record
  the finding, do not tune it green" (`README.md:197-198`). This is the correct posture for a
  harness that grades a cheap model.
- **Battery selection fails loudly on unknown names** (`battery.ts:89-110`) and the scorecard is
  produced on a dirty tree (`agentic-scenarios.test.ts:65-71`).
- **Worst-turn scoring** for multi-turn cases (`battery.ts:57-71`) matches how a user experiences
  a half-done job.
- **Cold-session cases** (`coldSession: true`, runner `:317-325`) that make recall from history
  impossible — the only honest way to test retrieval.
- **Restraint assertions first, question second** (`case-05:40-48`) so a guess-then-ask agent
  cannot pass.
- **Prompt snapshots persisted every turn with hashes** (`promptSnapshot.ts`,
  `request-builders.ts:381-411`) — this is the corpus source; keep the 14-day retention or extend
  it.
- **The reviewer replay test** (`agenticChatContractReviewer.live.test.ts`) — production request
  builder, pinned model, exact-contract grading, optional saved-response replay without
  credentials. It is the template for the acting-model replay.
- **Fail-closed write-surface preflight** (`worker-client.ts:74-103`) — refuses to spend on a
  read-only worker.
- **Local prompt dumps at the HTTP boundary** (`promptDump.ts`) with secret-free records.
- **Scripted-event provider tests** (`clientWith`/`clientWithRounds`) — the right way to test the
  harness's reaction to model output; do not convert these to live calls.

---

## 9. Measurements

| Name                                                                                                  | Value                                                                                                         | How measured                                                                                      |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `agentic-e2e/` size                                                                                   | 15,796 lines / 82 `.ts` files                                                                                 | `find … -name '*.ts' \| xargs wc -l`                                                              |
| of which harness / general scenarios / Cedar House / phase-a / phase0 / open-brief / browser / runner | 4,911 / 4,107 / 1,791 / 1,235 / 1,349 / 772 / 1,099 / 532                                                     | per-directory `wc -l`                                                                             |
| Dead on worker lane: prompt-eval src / tests / observability writer                                   | 1,659 / 799 / 576 lines                                                                                       | `wc -l`                                                                                           |
| `@buildos/agent-orchestrator`                                                                         | 10,783 lines; 0 production importers                                                                          | `wc -l`; `rg -l` over apps/packages excluding tests                                               |
| `test:agentic*` package scripts                                                                       | 14 (+`compare:agentic-evidence`, `agentic:health`, `report:agentic-tools`)                                    | `grep -c` on `apps/web/package.json`                                                              |
| Env knobs read by the harness                                                                         | 35 distinct                                                                                                   | `grep -rhoE 'process\.env\.[A-Z_0-9]+\|privateEnv\.[A-Z_0-9]+'` + two `process.env[name]` helpers |
| Cedar House                                                                                           | 11 cases / 12 turns / 6 write / 2 cold / 1 judged / 3 pending                                                 | `grep -c '^\s*message:'`; `cedar-house.test.ts`                                                   |
| Full catalog                                                                                          | 30 scenarios, ~40 turns, 1 unconditionally skipped (`calendar-move`)                                          | `catalog.ts`; `grep -c message:`                                                                  |
| Worker agentic test suites                                                                            | 72 files / 40,983 lines; `agenticChatTurnProvider.test.ts` 10,881 lines / 99 `it`                             | `wc -l`; `grep -c`                                                                                |
| Live turn latency (09-04 battery)                                                                     | mean 55.9 s, median 55.3 s over 11 receipts                                                                   | `node -e` over the receipt durations                                                              |
| Retention                                                                                             | snapshots 14 d, rendered dumps 2 d, input artifacts 7 d, local dumps 2 d                                      | migration `20260830173250`:418-419; `agentic-chat-worker-contract.ts:11`; `promptDump.ts:9`       |
| Worker opening tool bytes                                                                             | global 31,085 B / project 34,269 B / project_create 11,465 B                                                  | `agenticChatWorkerSurfaceBudget.test.ts:120-125` (measured values recorded in-file)               |
| Canonical prompt                                                                                      | system 12,737 chars; payload 50,125 chars ≈ 12,532 est tokens                                                 | `prompt-size-budget.test.ts:238-240`                                                              |
| Model input prices ($/M)                                                                              | deepseek-v4-flash 0.098 · gpt-5.6-luna 0.20 · gemini-3.7-flash 0.375 · deepseek-v4-pro 0.435 · glm-5.2 0.9226 | `packages/smart-llm/src/model-config.ts`                                                          |
| Replay cost, 50 cases × 3 reps, all five models                                                       | $4.57                                                                                                         | 150 calls × 15k tokens × price                                                                    |
| prompt-eval scenarios that can pass on a worker turn                                                  | 0 of 13                                                                                                       | all 13 require `done_emitted`; worker persists `done`                                             |
| Harness unit-test files excluded from `pnpm test`/CI                                                  | 20                                                                                                            | classification by network imports; `vitest.config.ts:134`; `ci.yml`                               |
