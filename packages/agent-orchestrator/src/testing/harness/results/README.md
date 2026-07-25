<!-- packages/agent-orchestrator/src/testing/harness/results/README.md -->

# Phase A evaluation results

> **Integrity note, 2026-07-25 (evening).** Every SHA-256 below reproduces — but two of them
> briefly did not. `control-a2-v1.json` and `workflow-eval-invalid-zdr-v1.json` were reformatted
> from 2-space to tab indentation by a Prettier run, which left the parsed content identical and
> silently voided both recorded hashes while this file went on claiming they reproduced. Both have
> been restored to their exact original bytes and now hash to their recorded values again.
>
> Two guards were added so this cannot recur silently: this directory (plus `corpus/` and
> `fixtures/`) is in `.prettierignore`, and `results-manifest.test.ts` fails if any recorded hash
> stops reproducing. Never fix a hash mismatch by updating the recorded value — restore the file,
> unless the artifact is genuinely being replaced by a new run.
>
> **Derived analysis.** `pnpm --filter @buildos/agent-orchestrator reanalyze:routes` regenerates
> `analysis/ROUTE_REANALYSIS.md` — item accuracy, `pass@k`, `pass^k`, self-consistency, and a 4×4
> confusion matrix over the reports here. It reads only; it never modifies an artifact.

> **Policy note, 2026-07-25.** Every report below remains canonical for what it measured. Two policy
> changes made after the last of them mean some are no longer the current basis for a decision:
>
> - `route-eval-*.json` were produced under route prompt v4. Prompt v5 replaced v4's corpus-shaped
>   scope rules and added an ordered reason-code procedure, so the A1 confirmation must be rerun as
>   `route-eval-v5.json` before A2 proceeds.
> - The blind mechanic is now `phase-a-a2-blind-v2` (counterbalanced, hash
>   `ba2602e89290f76688b61ffc957f58591405de01547be0e493c657059ca774d2`). It was amended before any
>   pair was generated, so nothing here is affected.
>
> See [`PHASE_A_AUDIT_2026-07-25.md`](../../../../../../docs/architecture/agent-first-orchestration/PHASE_A_AUDIT_2026-07-25.md).

`control-baseline-v1.json` is the canonical A0 control-lane baseline for
`phase-a-frozen-v1`.

- Generated: 2026-07-24T22:23:20.529Z
- Lane: existing `agentic-chat-v2` stream endpoint
- Logical runs: 12 (C01 and C02 three times each; C04, C06, C07, C08, C09, and C12 once)
- Model observed: `deepseek/deepseek-v4-flash`, smart-llm `balanced` profile
- Providers observed: DeepInfra, DigitalOcean, and SiliconFlow through OpenRouter
- Correlated model requests: 63
- Canonical total cost: $0.062782
- SHA-256: `fc300f90b7376980424c9b4a8a8e4dc83f9d747a773b0585a019ffff41071768`

## Normalization

The first harness invocation inherited Vitest's global retry setting. C07 exhausted the
production runtime's bounded tool-follow-up retries, then Vitest repeated the whole scenario.
The raw temporary report therefore contained 13 entries. This canonical report keeps the first
C07 failure and drops only the framework-level duplicate, producing the 12 runs intended by the
evaluation design. The paid cost of the dropped framework retry was $0.00590265; it is not part
of the canonical lane cost. Runtime-internal retries remain in the retained run's timing and
cost. The Phase A test now sets `retry: 0` explicitly.

## Interpretation

`completed` means the SSE stream emitted its terminal event. A clean success additionally
requires no streamed error event. C07 emitted a terminal event after a bounded timeout, so the
report records 12 completed runs, 11 clean successes, and one error run. Failed runs remain in
all latency, cost, and acceptance aggregates.

Timing is client-observed: TTFT is the first SSE text event and total duration ends at the
terminal SSE event. Usage and cost come from `llm_usage_logs` rows correlated by `stream_run_id`.
The run used only read tools. Harness projects and chat sessions were removed after execution;
a final hosted-Supabase check found zero remaining Phase A harness projects.

## A1 route evaluation — first scored pass

`route-eval-v1.json` is the canonical first scored pass for the pinned CEO route mode.

- Generated: 2026-07-25T03:16:57.047Z
- Logical/scored route calls: 72/72 (nine per frozen scenario)
- Model/profile: `z-ai/glm-5.2`, smart-llm `powerful`
- Correct top-level route: 54/72 (75.0%)
- Exact reason-code agreement: 24/72 (33.3%, diagnostic only)
- Route latency p50/p95: 2,592/10,855 ms
- Total cost: $0.078734
- Infrastructure-invalid runs: 0
- Mutation/write calls: 0
- Pre-registered decision: **Change**
- SHA-256: `3f75d91718406443921c6717b4a09d3d61ae20133c81ad8aead94680a3df49ed`

The two top-level failure classes and the prompt-v2 rerun rationale are recorded in
[`A1_ROUTE_RESULTS.md`](../../../../../../docs/architecture/agent-first-orchestration/A1_ROUTE_RESULTS.md).

### Second scored pass

`route-eval-v2.json` records the full prompt-v2 rerun. It improved top-level route accuracy to
59/72 (81.9%) but remained in the Change band. C01 became 9/9; C09 remained 0/9. Thirteen repair
paths and three final C07 JSON failures showed that the longer prompt caused the pinned reasoning
model to exhaust the 900-token output budget on complex requests.

- Generated: 2026-07-25T03:27:47.519Z
- Route latency p50/p95: 3,140/24,307 ms
- Total cost: $0.161854
- Infrastructure-invalid runs: 0
- Pre-registered decision: **Change**
- SHA-256: `381ffa915ff1de6e606f7294d4c0dc4e417a4fb9f14f036a32c026f366ce2953`

### Third scored pass

`route-eval-v3.json` records prompt v3 with low reasoning effort. Accuracy reached 61/72 (84.7%)
and C09 became 9/9, but C01 and C08 regressed and direct latency materially worsened. Low
reasoning removed final JSON failures but was not a viable latency or classification mitigation.

- Generated: 2026-07-25T03:35:53.465Z
- Route latency p50/p95: 6,728/20,934 ms
- Total cost: $0.140776
- Infrastructure-invalid runs: 0
- Pre-registered decision: **Change**
- SHA-256: `22f58e6f234a15a382177a0f933bdd9cb2b313176ef663c0e3f9ddc9067fa59e`

### Fourth single-model pass

`route-eval-v4.json` reached 70/72 correct routes (97.2%) but remained Change because projected
direct p50/p95 were 12,832/15,691 ms, above both frozen bounds. Two workflow calls exhausted both
60-second attempts. Total cost was $0.194495. SHA-256:
`4fcf67e2d15309d14d0faf53035896543b26062a8b322083e90429d6863a9f31`.

### Model and strategy pilots

- `route-model-pilot-gemini-flash-lite-v1.json`: 19/24 correct; direct 1,044/1,260 ms;
  SHA-256 `cc7ac54237b66e3a23fd8b0ca62bbe3f390596d01c0354ba877212596d9b86d9`.
- `route-model-pilot-deepseek-v4-flash-v1.json`: 17/24 correct; direct 1,406/12,304 ms;
  SHA-256 `27a5dd05886ebd867d5e71c9f5bb962683dfcb534660aca95b6422bb36e01d9d`.
- `route-strategy-pilot-fast-review-v1.json`: Gemini primary plus bounded GLM review, 24/24
  correct; direct 929/1,200 ms; SHA-256
  `f6945bd7b0d594ab55f7ed484c34b692247c16188bc273dea382e89c0d2f668d`.

### Canonical A1 result

`route-eval-fast-review-v1.json` is the full 72-call confirmation of the frozen fast-first review
strategy.

- Generated: 2026-07-25T03:54:24.920Z
- Primary/reviewer: Gemini 3.1 Flash Lite `fast` / GLM 5.2 `powerful`
- Review policy: `phase-a-route-review-v1`
- Correct top-level route: 72/72 (100%)
- Direct route p50/p95: 898/1,310 ms
- Projected direct TTFT p50/p95: 9,758/11,159 ms (both pass)
- Total cost: $0.079365
- Infrastructure-invalid runs: 0
- Mutation/write calls: 0
- A1 route-slice decision: **Go**
- SHA-256: `ab886492a6a788eede2bc64c3c8692bc9fd362ef492ecab69930d217eb78d378`

### Prompt-v5 audited rerun

`route-eval-v5.json` is the canonical audited rerun under prompt v5. It is a **Change** result and
supersedes the earlier route-slice Go.

- Generated: 2026-07-25T15:03:09.666Z
- Primary/reviewer: Gemini 3.1 Flash Lite `fast` / GLM 5.2 `powerful`
- Correct top-level route: 58/72 (80.6%; bound 65/72)
- Comparison-scenario reason codes: 22/27 (81.5%; then-applicable bound 25/27)
- Direct route p50/p95: 1,016/1,174 ms
- Projected direct TTFT p50/p95: 9,876/11,023 ms (both pass)
- Reviewed calls / repairs: 19/17
- Mean/total model cost: $0.001167/$0.084033
- Infrastructure-invalid runs: 0
- Pre-registered decision: **Change**
- SHA-256: `f36419724637bddb5a11ae3a64fc4ddbbb200b36ef716b4bafe06cb95b5a4e20`

Prompt tuning against the frozen eight stopped after this result. The prescribed architectural
fallback now selects workflow topology from observable request features, so reason-code agreement
is diagnostic prospectively. The 58/72 top-level route score remains unchanged and blocks A2.

### Routing mitigation v2 and cold holdout

`route-eval-mitigation-v2.json` is the one-shot full confirmation of
`phase-a-route-review-v2`. `route-eval-holdout-v1.json` immediately follows it with no code,
prompt, corpus, label, model, or threshold edit.

- Frozen confirmation: 61/72 routes (84.7%), 25/27 comparison reasons, 23 reviewed calls,
  1,221/21,269 ms overall p50/p95, $0.082816 total, 0 infrastructure-invalid; **Change**.
- Cold holdout: 15/15 routes and reasons, 0 reviewed calls, 938/1,572 ms p50/p95, $0.008147 total,
  0 infrastructure-invalid; reported only.
- C09 remained 0/9. Six results were `direct/status_summary`, one was context research, and two
  model-matched scope calls produced no output after exhausting their budget.
- The holdout validates only the fast direct/capability path; it did not exercise the scope
  classifier.
- Mitigation report SHA-256:
  `07b78b69c5eb285bc5ce344ca8cdc93afa0376193632ab61a8fadfee87abbdd3`.
- Holdout report SHA-256:
  `32c0f21fd770d4c293ddcf2679c399af8243e1210fc4b7784e7905ec24d55b87`.

No tuning or rerun is authorized from these corpora. A2 remains blocked.

## A2 fresh control cohort

`control-a2-v1.json` is the canonical fresh nine-run control cohort used for the A2 blind
comparison. It contains three runs each for C06, C07, and C08.

- Generated: 2026-07-25T04:59:28.538Z
- Scored runs: 9/9
- Infrastructure-invalid runs / replacements: 0/0
- Clean completions: 6/9
- Required-check passes: 0/9
- TTFT p50/p95: 6,556/14,744 ms
- Total-duration p50/p95: 105,109/198,425 ms
- Mean/total cost: $0.007787 / $0.070084
- Mutation/write calls: 0
- SHA-256: `735a445023a62c37ceec538349f5c77499da3e5dc04cb9a7d7207f5f36ee2338`

All three C07 runs ended with `finishedReason: "error"` — `"An error occurred while streaming."`
after only `skill_load` / `skill_reference_load` calls, producing 73–173 characters of assistant
text. **This is a crashed turn, not a timeout.** An earlier revision of this file called it "the
production lane's model-matched timeout after its internal retry"; `A2_PROGRESS.md` retracted that
characterization and the artifact agrees with the retraction — there is no timeout in it.

Per amendment 4 of the falsification plan, C07 is therefore **excluded from the primary blind-win
denominator** and reported separately: a crashed control arm is a harness failure under the frozen
invalid-run rule, and three near-certain workflow wins against it say nothing about architecture.
It can re-enter the primary set only after a control cohort for C07 completes normally.

C06 and C08 completed cleanly but failed their frozen citation checks.

## A2 workflow ZDR-invalid attempts

`workflow-eval-invalid-zdr-v1.json` preserves the first C06 workflow attempt and its one
permitted replacement. Both are infrastructure-invalid because OpenRouter has no
`deepseek/deepseek-v4-pro` endpoint matching SmartLLM's zero-data-retention request. Neither
attempt produced a DeepSeek completion or entered the score.

- Generated: 2026-07-25T04:40:32.511Z
- Attempts / scored runs: 2/0
- Scored workflow outputs: 0
- Total operational cost: $0.023824
- Mutation/write calls: 0
- SHA-256: `25576e641bf8db1e9527b65e02ec15041038155739128eee921d88bbc15d60ca`

DJ approved non-ZDR provider handling for the anonymized Phase A inputs on 2026-07-25. The
evaluation-only transport opt-in is implemented and locally verified. The workflow cohort and
blind packet remain ungenerated because the later routing-mitigation-v2 confirmation also returned
Change at 61/72. See
[`A2_PROGRESS.md`](../../../../../../docs/architecture/agent-first-orchestration/A2_PROGRESS.md).
