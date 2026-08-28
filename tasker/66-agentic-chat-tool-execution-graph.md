<!-- tasker/66-agentic-chat-tool-execution-graph.md -->

# 66 — Agentic Chat: explicit tool execution graph + concurrent batches

**Created 2026-08-27.** Split from
[tasker 65](65-agentic-chat-read-default-cost-program.md) so mutation-review policy and tool
execution concurrency can evolve independently.

**Status: complete (2026-08-27).** The graph runtime, staged production rollout, safety matrix,
model-capability decision, telemetry, mutation concurrency, and activity-attribution follow-up are
all verified. Redundant cross-round reads remain explicitly separated into
[tasker 67](67-agentic-chat-redundant-read-round-planning.md).

## Kernel

One model response can contain several tool calls, but the worker currently yields and awaits those
calls one at a time. That throws away the latency advantage of a multi-call response and leaves the
worker without an explicit representation of dependencies.

Make the provider round an execution batch:

- calls proposed together are **parallel by default**;
- sequential execution is the special case and must carry an explicit order/dependency plan;
- the worker validates the plan, adds deterministic conflict barriers, executes each ready layer
  concurrently, and returns results to the model in stable provider-call order.

This task does not decide when an independent semantic reviewer is required. Tasker 65 owns that
policy. When review applies, the canonical execution graph must be included in the reviewed hash so
approval binds both the exact calls and their execution semantics.

## Owner-intent interpretation to confirm

The originating discussion said both “by default ... sequentially” and “sequentially ... is a
special case.” Those rules conflict. This tracker uses the latter and recommended interpretation:
**same-round calls are parallel by default; sequential work is explicitly ordered.** If sequential
was intended as the default, reverse the default before implementation without changing the graph
or validation design below.

## Implementation status (2026-08-27)

The test-first slice is now implemented behind staged rollout gates:

- Provider tool schemas expose optional `call_ref` and `after` sidecars. The provider parser keeps
  their canonical form in model history but strips them before validation, review of domain values,
  idempotency, and adapter dispatch.
- `toolExecutionGraph.ts` compiles a bounded DAG, rejects invalid/missing/duplicate/cyclic
  dependencies before dispatch, inserts worker conflict barriers, hashes the canonical plan, and
  executes ready layers with bounded fan-out and stable provider-order results.
- `turn-executor.ts` buffers each multi-result provider round, reserves durable sequence numbers in
  provider order, executes compiled layers, invalidates read memoization before mutation layers,
  preserves successful sibling receipts, and emits explicit dependency-failure receipts.
- `toolExecutionPolicy.ts` independently gates read and mutation concurrency. Only audited row-local
  mutations can become parallel-safe; unknown-scope and high-impact mutations remain serial.
- Mutation semantic review hashes now bind all same-response calls, provider order, domain arguments,
  and model scheduling dependencies rather than hashing only an unordered-looking mutation subset.
- Structured graph telemetry records the canonical plan hash, layer widths, model edges, inserted
  worker serializations, failures/skips, observed concurrency, requested mode, per-call start offset
  and duration, measured graph wall time, estimated serial time, and estimated parallel savings.

### First production canary (2026-08-27)

Production was staged on Railway at exact release `ffd8237711ebf5e0a335021999a93687ceca65e4`.
The serial control passed a three-update task turn with a `[1,1,1]` mutation batch taking 5.087s.
Concurrent reads were then enabled alone with fan-out capped at four. A dedicated three-document
fixture produced a real `[3]` read layer with observed concurrency three and a 1.480s critical path,
versus 3.815s and 3.885s for the corresponding three-call serial read batches (about 61% lower batch
latency in the direct comparison).

The rollout did **not** pass its correctness gate. Concurrent tool-result publication raced on the
next durable UI-projection sequence and the turn failed closed with `read_tool_execution_failed` /
`Worker UI projection event identity is invalid`. Production was immediately restored to:

```bash
AGENTIC_CHAT_CONCURRENT_READS_ENABLED=false
AGENTIC_CHAT_CONCURRENT_MUTATIONS_ENABLED=false
CHAT_MAX_TOOL_CONCURRENCY=4
```

The local follow-up serializes per-turn semantic publication while leaving adapters concurrent. A
regression test holds the first result persistence open and verifies every emitted projection keeps
strictly increasing, unique event sequences. The focused worker battery is green (211 tests) and
source type-checking passes.

### Follow-up production rollout (2026-08-27)

The publication fix was pushed and deployed at exact release
`3872446bc4594260f51e40448d9e99011561ba60`. With concurrent reads enabled alone, three isolated
production repetitions passed with strict telemetry and no retries. Independent batches reached
observed widths three and four with zero failed/skipped calls; the first width-three/four batch in
each turn took 1.544–2.120s versus the prior serial control's 3.815–3.885s. Durable projections and
event rows retained unique IDs and strictly increasing sequences, and the original projection
identity error did not recur.

After explicit owner approval, mutation concurrency was enabled with fan-out still capped at four.
Three isolated `task-multi-update` repetitions all passed their final database assertions. Each
three-update batch compiled as one `[3]` layer, observed concurrency three, and reported zero
failed/skipped calls. The concurrent mutation critical paths were 2.113s, 2.224s, and 2.360s versus
4.050–4.251s in the serial-mutation controls (roughly 45–50% lower). All nine durable effect rows
were unique, `succeeded`, and failure-free; every UI projection kept unique, increasing event
identities. Post-canary health was green with zero active turns, recovery candidates, or
attention-required turns.

End-to-end concurrent-mutation turns were nevertheless slower (47.6–53.6s versus 34.5–39.6s) because
the acting model emitted five separate one-read provider rounds before the mutation batch instead
of the control's three. That planning constraint is split into
[tasker 67](67-agentic-chat-redundant-read-round-planning.md).

The mutation canary also surfaced `AsyncActivityLogger` foreign-key failures when worker chat
session IDs were written to the legacy `agent_call_sessions`-backed project log. The same one-per-
mutation failures are present in the serial controls, so this is an existing activity-log
compatibility defect rather than a graph/concurrency regression; authoritative mutation receipts
and final domain state were unaffected.

Validated production configuration after rollout:

```bash
AGENTIC_CHAT_CONCURRENT_READS_ENABLED=true
AGENTIC_CHAT_CONCURRENT_MUTATIONS_ENABLED=true
CHAT_MAX_TOOL_CONCURRENCY=4
```

Model capability was also measured without Ollama using the new opt-in OpenRouter live suite. In the
final one-run closeout sample, `deepseek/deepseek-v4-flash`, the acting model observed in production,
passed 1/5 strict scheduling fixtures. `openai/gpt-5.6-luna` passed 2/5; an earlier sample passed 4/5,
which also demonstrates material run-to-run variance. Both routes safely used later provider rounds
but did not reliably express same-round known-argument sequencing or mixed fan-in.

The scheduling sidecars add 534 prompt tokens for DeepSeek (1,492 versus 958) and 328 for Luna (789
versus 461) across the seven-tool fixture. They remain in the protocol because they are useful when
produced correctly, but their cost and measured reliability rule them out as a correctness
dependency.

### Final `call_ref` / `after` scope decision

Same-round model-authored dependencies are **opportunistic optimization metadata**, not a required
product capability:

- no production workflow may require the model to emit `after` for correctness;
- worker-inferred conflict edges remain authoritative and serialize known resource conflicts;
- returned-value dependencies use a later provider round after the required receipt is available;
- a model-provided same-round graph is honored only when every reference resolves inside that round;
- missing, cyclic, duplicate, or cross-round references fail closed before dispatch;
- improving the model's tendency to issue compact batches belongs to
  [tasker 67](67-agentic-chat-redundant-read-round-planning.md), not this infrastructure release.

This closes the model-reliability question without treating current provider behavior as stronger
than the evidence supports.

### WP-6 executable safety matrix

`agenticChatToolExecutionGraphReleaseGate.test.ts` is the compact release gate for the dangerous
graph shapes, backed by the broader executor/provider suites:

| Case | Enforced result | Coverage |
| --- | --- | --- |
| Same-entity mutations | Worker conflict edge serializes them | release-gate + graph compiler tests |
| Create then update | Explicit same-round dependency produces ordered layers | release-gate test |
| Mixed read/write | Same resource serializes; unrelated sibling stays parallel | release-gate test |
| Sibling failure / timeout | Successful receipt remains attributable | release-gate + executor timeout tests |
| Cancellation | In-flight calls abort; undispatched dependents never start | release-gate + executor cancellation tests |
| Retry / replay | Existing logical-operation and durable-receipt fences remain intact | turn-executor replay/recovery tests |
| Reviewer hash mismatch | Scheduling or provider-order changes produce a different reviewed digest | mutation-review execution-plan tests |

The final local gate is 1,325 worker tests passing with 12 skipped across 151 passing files and three
opt-in live files skipped, plus 171 shared-agent-ops tests passing across 34 files. Both package
typechecks pass. The only first-pass failures were four localhost HTTP tests blocked by the sandbox;
all five tests in that file passed when localhost binding was permitted.

The mutation-canary activity-log defect is separated and fixed under
[tasker 68](68-agentic-chat-worker-activity-log-session-attribution.md). Internal worker mutations
now populate `chat_session_id` and leave the external `agent_call_session_id` null; no foreign-key or
RLS weakening is part of the fix.

### Final production closeout (2026-08-27)

Railway deployment `d811be48-7747-4c5d-b1f0-1439562ba2c8` is successful on exact release
`c014b5ff4bcd74e99ef1c87457dee99c88156e8e`, matching `origin/main`. All four chat-worker instances
reported running.

The first closeout canary stopped with `provider_stream_error` after a contract-review revision. It
failed closed before mutation reservation: zero `chat_turn_effects` existed and no domain mutation
ran. The next two isolated `task-multi-update` runs passed without harness retries. The final run
(`49949e5b-29de-4a19-8297-c7401d32df93`) recorded:

- three distinct `update_onto_task` effects, all `succeeded`, with no failure codes;
- one mutation layer with widths `[3]`, observed concurrency three, and no failed or skipped calls;
- per-call durations of 1.471s, 1.723s, and 2.495s;
- 2.495s actual graph time versus 5.689s estimated serial time, a 3.194s (56%) saving;
- exactly three pre-teardown task activity rows attributed to the internal `chat_session_id`, each
  with `agent_call_session_id = null`;
- no `AsyncActivityLogger` errors in the deployment-wide 30-minute scan.

The production worker reports the exact release healthy, database and realtime connected, zero
active turns, zero recovery candidates, zero attention-required turns, and zero consecutive claim
or recovery failures. Final production settings are concurrent reads on, concurrent mutations on,
and maximum tool concurrency four.

The activity-attribution assertion now lives permanently in the `task-multi-update` production E2E
scenario and executes before fixture teardown. Web `svelte-check` passes with zero errors and zero
warnings.

Rollout configuration defaults safe/off:

```bash
AGENTIC_CHAT_CONCURRENT_READS_ENABLED=false
AGENTIC_CHAT_CONCURRENT_MUTATIONS_ENABLED=false
CHAT_MAX_TOOL_CONCURRENCY=4
```

Deterministic infrastructure, provider, executor, policy, review-binding, and model-scenario tests
are green. Per owner direction, no local Ollama server is expected. OpenRouter is the recorded live
model evaluation; strict same-round capability is diagnostic rather than a release prerequisite
because the supported correctness path does not depend on it.

## Test-first acceptance baseline (2026-08-27)

The executable contract was authored before implementation and lives in:

- `apps/worker/tests/agenticChatToolExecutionGraph.test.ts` — DAG compilation, validation,
  conflict barriers, stable hashing, bounded concurrent execution, result ordering, partial
  failure, cancellation, and mutation-layer memo invalidation.
- `apps/worker/tests/fixtures/agenticChatToolExecutionGraphModelScenarios.ts` — five project-work
  prompts covering default parallel calls, explicit same-round sequencing, mixed fan-in,
  returned-value sequencing across rounds, and sequential setup followed by parallel fan-out.
- `apps/worker/tests/agenticChatToolExecutionGraphModelScenarios.test.ts` — deterministic tests that
  prove the capability grader rejects plausible-but-wrong schedules.
- `apps/worker/tests/agenticChatToolExecutionGraphOllama.live.test.ts` — opt-in live Ollama runs
  against the same fixtures, with configurable repetitions and minimum pass rate.
- `apps/worker/tests/agenticChatToolExecutionGraphOpenRouter.live.test.ts` — opt-in live OpenRouter
  runs against the same fixtures, used for the deployed acting-model comparison when Ollama is not
  available.
- `apps/web/src/lib/tests/agentic-e2e/scenarios/tool-graph-parallel-reads.scenario.ts` — opt-in paid
  production canary that seeds three documents, requires three independent reads, verifies the
  grounded answer, and rejects mutations.

The implementation seam is `apps/worker/src/workers/agentic-chat/toolExecutionGraph.ts`, with
worker-owned resource policy in `toolExecutionPolicy.ts` and production integration in
`turn-executor.ts`.

Run the deterministic model-grader contract (green before implementation):

```bash
pnpm --filter @buildos/worker exec vitest run \
  tests/agenticChatToolExecutionGraphModelScenarios.test.ts
```

Run the infrastructure acceptance contract:

```bash
pnpm --filter @buildos/worker exec vitest run \
  tests/agenticChatToolExecutionGraph.test.ts
```

Run a local Ollama capability evaluation:

```bash
OLLAMA_TOOL_GRAPH_MODEL=qwen3:8b \
OLLAMA_TOOL_GRAPH_RUNS=3 \
OLLAMA_TOOL_GRAPH_MIN_PASS_RATE=0.67 \
pnpm --filter @buildos/worker exec vitest run \
  tests/agenticChatToolExecutionGraphOllama.live.test.ts
```

`OLLAMA_BASE_URL` defaults to `http://127.0.0.1:11434`. Live model tests remain skipped unless
`OLLAMA_TOOL_GRAPH_MODEL` is set.

Run the equivalent OpenRouter capability evaluation (with `PRIVATE_OPENROUTER_API_KEY` loaded):

```bash
OPENROUTER_TOOL_GRAPH_MODEL=deepseek/deepseek-v4-flash \
OPENROUTER_TOOL_GRAPH_RUNS=3 \
OPENROUTER_TOOL_GRAPH_MIN_PASS_RATE=0.67 \
pnpm --filter @buildos/worker exec vitest run \
  tests/agenticChatToolExecutionGraphOpenRouter.live.test.ts
```

Run the isolated production read canary only after intentionally selecting the target worker
configuration:

```bash
AGENTIC_TOOL_GRAPH_PRODUCTION_CANARY=true \
AGENTIC_E2E_BASE_URL=https://build-os.com \
AGENTIC_E2E_EXECUTION_MODE=worker_realtime \
PRIVATE_AGENTIC_CHAT_WORKER_URL=https://agentic-chat-worker-production.up.railway.app \
AGENTIC_SCENARIOS=tool-graph-parallel-reads \
pnpm --filter @buildos/web exec vitest run --config vitest.config.agentic.ts \
  src/lib/tests/agentic-e2e/__tests__/agentic-scenarios.test.ts --retry=0
```

## Former serial behavior verified before implementation

The provider already collected every completed tool call in one model response into one
`PendingToolRound`, but the executor formerly awaited each emitted step inside the stream loop. The
new executor retains the provider round as the batch boundary and dispatches only after the entire
graph validates.

Relevant boundaries:

- `apps/worker/src/workers/agentic-chat/provider/turn-provider.ts` — collects/normalizes a provider
  round and emits its tool steps.
- `apps/worker/src/workers/agentic-chat/turn-executor.ts` — buffers and executes a validated batch.
- `apps/worker/src/workers/agentic-chat/provider/steps.ts` — maps completed provider calls to
  executable read/mutation steps.
- `apps/worker/src/workers/agentic-chat/provider/review/mutation-batch.ts` — canonical exact-batch
  hashing when semantic review applies.

## Desired model contract

Do not ask the model to predict infrastructure details such as queue capacity or adapter latency.
Ask it only to state semantic dependencies it knows:

- independent calls may be proposed in the same round with the default parallel behavior;
- a call that requires another call's returned value must be proposed in a later provider round;
- a same-round call that only requires another side effect to finish first must declare `after`;
- explicit sequencing uses stable model-supplied call references, never array position alone;
- invalid, cyclic, missing, or cross-batch dependencies fail before any call dispatches.

### Smallest schema experiment

Prototype the least expensive representation before committing it to every tool schema:

```json
{
	"call_ref": "update_task",
	"after": ["create_project"]
}
```

Candidate encodings, in preferred investigation order:

1. **Round-as-barrier with a small optional scheduling sidecar.** Same-round calls run in parallel;
   only exceptional known-argument ordering carries `call_ref`/`after`. The worker strips the
   sidecar before adapter validation and dispatch.
2. **One batch-plan control call accompanying the actual calls.** Avoids repeating scheduling fields
   but must prove reliable binding to provider tool-call IDs without an extra model pass.
3. **A composite dispatcher tool.** Consider only if the first two cannot work; nesting all tool
   schemas inside one meta-tool risks a large prompt/schema regression and weakens existing typed
   boundaries.

Do not ship orchestration metadata as ordinary domain arguments. It is worker-owned protocol data,
must be removed before the mutation adapter boundary, and must not affect domain idempotency hashes
except through the separate canonical execution-plan hash.

## Worker-owned safety and correctness

The model's graph is a scheduling request, not unquestioned authority. Before dispatch, the worker
must compile it into a deterministic directed acyclic graph and apply these constraints:

- every call reference is unique and every dependency resolves inside the batch;
- the graph is acyclic and bounded by existing call/round budgets;
- calls with no dependency edge form a ready layer;
- results retain original provider-call order even when completion order differs;
- cancellation stops undispatched layers and propagates to in-flight calls;
- every call retains independent durable call/result transitions and failure receipts;
- one failure does not silently erase successful sibling receipts;
- retry/replay retains current logical-operation IDs and idempotency behavior;
- a mutation invalidates the read memo before its layer dispatches;
- mutation/read combinations cannot observe a nondeterministic mid-layer state.

The worker must also calculate conservative resource-conflict keys from tool metadata and exact
arguments. Calls that touch the same entity or a parent/child scope known to conflict must be
serialized or rejected even if the model omitted an edge. Start conservative and loosen only with
measured evidence.

## Work packages

### WP-1 — Characterize and choose the protocol

- Inventory every admitted read, control, and mutation tool and identify which arguments can produce
  a stable conflict key.
- Verify OpenRouter/provider behavior for multiple tool calls and whether stable model-supplied call
  references survive streaming and retries.
- Measure token cost of each candidate scheduling schema.
- Decide whether later-round submission alone covers returned-value dependencies and which real
  cases still need same-round `after` metadata.
- Record the final wire format and default explicitly.

**Exit:** one canonical execution-plan type and encoding, with prompt-token delta and fixtures from at
least two supported model/provider routes.

### WP-2 — Compile provider rounds into an execution DAG

- Add a pure compiler from completed provider calls + scheduling metadata to validated ready layers.
- Reject missing references, duplicates, cycles, illegal cross-round edges, oversized graphs, and
  inconsistent batch IDs before dispatch.
- Add deterministic worker conflict edges from tool metadata/resource keys.
- Keep provider-call ordering for model feedback and durable projections.

**Exit:** exhaustive unit tests for graph validation, layering, conflict insertion, and stable result
ordering.

### WP-3 — Concurrent read execution

- Execute one independent read layer concurrently with bounded per-turn fan-out.
- Preserve individual timeouts, validation failures, logging, memo behavior, cancellation, and
  supervisor observations.
- Return all results only after the layer reaches a terminal state.

**Exit:** parallel read fixture is materially faster than the serial baseline and produces identical
ordered feedback/receipts.

### WP-4 — Concurrent ordinary mutations

- Enable concurrency only for mutation tools whose adapters and conflict-key contracts have been
  audited.
- Keep high-impact, conflicting, unknown-scope, and explicitly ordered mutations serialized.
- Define partial-failure behavior plainly; do not imply transactionality across independent adapters.
- Bind the canonical execution graph into exact-batch semantic review when tasker 65 requires review.

**Exit:** independent mutations overlap in timing; conflicts never overlap; partial failures remain
recoverable and fully attributable.

### WP-5 — Prompt, telemetry, and presentation

- Teach the acting model with compact positive examples: same-round independent reads/updates,
  returned-value dependency in a later round, and explicit same-round ordering.
- Record requested mode, compiled layers, inserted conflict edges, per-call start/end, maximum
  concurrency, and serial-versus-parallel wall time.
- Present one coherent work phase rather than interleaved internal call noise.

**Exit:** execution behavior is explainable from telemetry without prompt dumps, and the scheduling
instructions do not erase the token/latency gains.

### WP-6 — Canary and staged rollout

- Feature-flag concurrent reads and mutations separately.
- Canary reads first, then low-risk mutations.
- Cover same-entity updates, create-then-update, mixed read/write rounds, one sibling failure,
  cancellation, timeout, retry/replay, and reviewer-hash mismatch.
- Compare end-to-end latency, adapter error rate, duplicate effects, and reconciliation outcomes to
  the serial baseline.

**Exit:** canaries show latency improvement with zero ordering, replay, or mutation-integrity
regressions before widening traffic.

## Non-goals

- Do not use concurrency to bypass semantic review or high-impact confirmation policy.
- Do not promise atomic transactions across unrelated tools/adapters.
- Do not let the model set numeric concurrency limits or override worker conflict edges.
- Do not parallelize dependent calls merely because their arguments happen to be available.
- Do not add a large always-on orchestration schema without measuring its prompt cost.

## Product exit

For a provider round containing `N` independent calls, elapsed tool time approaches the slowest call
plus bounded orchestration overhead instead of the sum of all `N` calls. Dependent and conflicting
work remains deterministic, exact result ordering is preserved, and production telemetry proves
both the overlap and the absence of mutation-integrity regressions.
