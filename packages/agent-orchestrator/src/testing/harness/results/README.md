<!-- packages/agent-orchestrator/src/testing/harness/results/README.md -->

# Phase A evaluation results

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
