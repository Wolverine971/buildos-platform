<!-- apps/web/docs/technical/audits/AGENTIC_CHAT_STREAM_TIMEOUT_SYNTHESIS_RECOVERY_RECOMMENDATIONS_2026-07-22.md -->

# Agentic Chat Stream Timeout and Synthesis Recovery Investigation

- **Date:** 2026-07-22
- **Status:** Research and recommendations only; no production behavior changed
- **Incident:** “Who are the relevant people in this project?”
- **Primary session:** `46ff46dc-ae2d-4be3-8fd7-f101c6d73a8b`
- **Project:** `2dcdb7d3-e1c5-4619-8d2a-6e733dae71cf`
- **Project name:** Operation Second Round — Job Search Sprint

## Executive summary

The failure was not caused by DigitalOcean being secretly deployed as part of BuildOS. BuildOS called OpenRouter for `deepseek/deepseek-v4-flash`; OpenRouter then selected DigitalOcean as one of the infrastructure providers that hosts that model. BuildOS currently allows provider fallback, so providers outside its preferred order can receive requests. DigitalOcean is therefore an indirect inference provider, not an application-hosting dependency.

The user’s request failed after the system had already gathered useful evidence. Across three attempts at the same goal, the agent completed 26 read-only tool calls and nine successful LLM passes, but returned no assistant answer. Seven additional LLM attempts failed. Every observed failure was a DeepSeek V4 Flash streaming attempt that hit the same hard 60,000 ms attempt timeout. Two user turns reached the existing forced-synthesis path; in each turn, both synthesis stream attempts timed out and the exception bypassed the deterministic finalization guard. The frontend ultimately received only the generic message “An error occurred while streaming.”

The system therefore has two different problems:

1. It did too much work for a bounded “identify the people” request.
2. After it had enough evidence, the final synthesis path was a single point of failure with no guaranteed recovery.

Simply increasing 60 seconds to a larger number is not a sufficient fix. It would reduce some false timeouts, but it would also make a bad tail slower and would still allow the turn to end without an answer. Likewise, adding several aggressive timeouts without evidence could prematurely interrupt valid reasoning, lower answer completeness, and increase duplicate inference cost.

The recommended approach is layered:

- Guarantee an honest terminal response from already-collected evidence, even when every synthesis model fails.
- Give forced synthesis a dedicated, heterogeneous model/provider route instead of repeating the same route.
- Emit structured progress immediately and update one visible status through gathering, synthesis, and recovery.
- Reduce the number of searches for people-list requests with an intent-specific aggregate read path.
- Test any longer deadline or delayed hedge only on side-effect-free, no-tool synthesis. Do not initially apply inter-token deadlines or hedging to tool-calling or write passes.
- Derive thresholds from measured percentiles and quality tests rather than adopting arbitrary “three deadline” numbers.

The earlier “three deadlines” framing should be revised. One of the three should be a user-feedback timer, not a model deadline. A second may become a delayed hedge trigger if testing supports it. Only the final one should be a hard operation ceiling.

## Questions this investigation answers

1. What happened in the failed conversation?
2. Why did DigitalOcean appear?
3. Why did forced synthesis not protect the user?
4. Would longer or multiple timeouts work, and could they damage quality?
5. What should be changed immediately, what should be tested, and in what order?

## Confidence labels

- **Confirmed:** directly supported by production records or current source code.
- **Strong inference:** the evidence fits the explanation, but the upstream provider’s internal cause is unavailable.
- **Proposal:** a design recommendation that still requires testing.

## Incident evidence

The exported audit is at `/Users/djwayne/Downloads/csa-who-relevant-people-project-20260722T221155Z.md`.

### What the user experienced

The user made the same substantive request across two sessions and then asked for status:

1. An earlier session asked the same people-identification question.
2. The exported session asked: “Who are the relevant people in this project? What people am I talking about and mentioning here? Tell me the rules.”
3. The same exported session later asked: “ok where are we at? did you identify these people?”

All three attempts failed to produce an assistant reply.

### Reconstructed attempt summary

| Attempt               | Successful read-only tools | Successful LLM passes | Failed LLM attempts | Approx. elapsed | End state                                                      |
| --------------------- | -------------------------: | --------------------: | ------------------: | --------------: | -------------------------------------------------------------- |
| Earlier exact request |                         11 |                     5 |                   2 |            235s | Forced synthesis attempted twice; both attempts timed out      |
| Exported turn 1       |                          4 |                     2 |                   3 |            211s | Failed during a later answer-producing pass; no reply          |
| Exported follow-up    |                         11 |                     2 |                   2 |            219s | Supervisor forced synthesis; both synthesis attempts timed out |
| **Total**             |                     **26** |                 **9** |               **7** |               — | **Zero assistant replies**                                     |

No mutations were performed and no project data was lost. The completed tools were reads.

### Evidence the system actually found

The read sequence searched candidate names including Brian Hicks, Anton Gorshkov, Adam Eklund, Ryan, and Curri, as well as organization references such as Genesis Air and Govini. These are **candidate mentions, not a validated final people list**. The full tool-result payloads were not durably retained on the failed read-only turns, so the final accepted list cannot be reconstructed with sufficient confidence from the audit alone.

This distinction matters: the system had enough evidence to provide a useful, qualified answer, but the failed-turn persistence design also made post-incident reconstruction worse than it should have been.

### Exact failure signature

The repeated production error was:

```text
LlmStreamPassAttemptError: LLM stream pass timed out after 60000ms
```

The operation was `fastchat_stream`. Failed OpenRouter generation IDs returned 404 when queried later, while completed generation IDs returned normal records. That supports, but does not prove, the interpretation that the failed upstream generations never reached OpenRouter’s durable completed-generation state.

### What did not cause the incident

- **Not a tool failure:** the 26 observed read calls succeeded.
- **Not a context-window overflow:** the forced-synthesis prompt was about 5,211 tokens and the synthesis context builder is bounded.
- **Not project corruption or a write conflict:** the turn was read-only.
- **Not the nearby client dynamic-import errors:** those were temporally nearby but did not align with the failed LLM pass chain.
- **Not evidence of a platform-wide outage:** the failures were concentrated on this model/route and incident window.

## Why DigitalOcean appeared

### Short answer

BuildOS did not call DigitalOcean directly. It called OpenRouter. OpenRouter routed the DeepSeek V4 Flash request to DigitalOcean’s inference endpoint.

A repository-wide search found no BuildOS runtime client, deployment configuration, or credential for DigitalOcean. The only unrelated references outside this memo were marketing-research transcripts. That supports the production trace: DigitalOcean entered through OpenRouter’s provider network, not through a direct BuildOS integration.

The chain was:

```text
BuildOS agent
  -> OpenRouter API
      -> DeepSeek V4 Flash model
          -> DigitalOcean-hosted inference endpoint
```

DigitalOcean now sells serverless and dedicated model inference, including DeepSeek V4 Flash. Its role here was GPU/model-serving infrastructure, not BuildOS application hosting. See [DigitalOcean Inference](https://docs.digitalocean.com/products/inference/) and its [available model catalog](https://docs.digitalocean.com/products/inference/details/models/).

OpenRouter’s public endpoint metadata for this model currently lists DigitalOcean with the exact routing tag `digitalocean`: [DeepSeek V4 Flash endpoints API](https://openrouter.ai/api/v1/models/deepseek/deepseek-v4-flash/endpoints). OpenRouter documents that it routes a model across multiple providers and that `order`, `only`, `ignore`, and `allow_fallbacks` control the choice: [provider routing documentation](https://openrouter.ai/docs/guides/routing/provider-selection).

### Why the current BuildOS configuration permits it

`openrouter-v2-service.ts` constructs provider config with:

- `allow_fallbacks: true`
- `data_collection: 'deny'`
- Zero Data Retention by default
- a preferred order for DeepSeek V4 Flash of `Baidu`, then `GMICloud`

An OpenRouter `order` is not an exclusive allowlist when fallbacks remain enabled. If the ordered endpoints are unavailable, incompatible with the request/privacy constraints, or fail, OpenRouter may select another compatible endpoint. DigitalOcean is one such endpoint.

There is also a configuration item to verify: BuildOS uses the display-style values `Baidu` and `GMICloud`, while OpenRouter’s provider directory reports the exact slugs `baidu` and `gmicloud`. OpenRouter’s current documentation tells callers to use exact provider slugs. The seven-day sample contained no Baidu or GMICloud attempt rows. This is a **configuration risk to test**, not a confirmed case-sensitivity bug; OpenRouter may normalize the values or the endpoints may simply have been excluded by other routing constraints.

### What can and cannot be concluded about DigitalOcean

The incident and short production sample justify a role-scoped canary that excludes DigitalOcean. They do **not** prove DigitalOcean is generally unreliable. OpenRouter’s public endpoint health statistics are rolling and changed during this investigation, so they should not be used as retrospective proof of the incident.

The stronger evidence is BuildOS’s own attempt-level telemetry for the exact model and workload. That evidence should drive a temporary circuit-breaker decision, followed by a controlled comparison.

## Current architecture and failure chain

### 1. A universal 60-second attempt timeout

`stream-orchestrator/llm-pass-runner.ts` defines:

```ts
const MAX_LLM_STREAM_ATTEMPTS = 2;
const LLM_PASS_TIMEOUT_MS = 60_000;
```

The timeout applies to every LLM stream attempt, regardless of pass role. A normal planning pass, a tool follow-up, and a final no-tool synthesis all receive the same attempt budget.

Each retry starts with a fresh assistant buffer. A logical pass can therefore consume roughly 120 seconds across two sequential attempts, plus retry delay and orchestration overhead. This explains why a “60-second timeout” produced turns lasting more than three minutes.

### 2. Retry is not explicitly heterogeneous

The OpenRouter service can try alternate model candidates when a request fails before a stream is accepted. Once a response stream is established, however, provider failover cannot transparently replace it after output has begun. OpenRouter documents the same boundary: pre-stream errors may be failed over; midstream failures cannot switch providers without creating a new generation. See [OpenRouter errors and debugging](https://openrouter.ai/docs/api/reference/errors-and-debugging).

When the orchestrator times out, its second attempt uses the same pass role, model profile, and model candidate list. OpenRouter may happen to pick another provider, but BuildOS does not require the recovery attempt to use a different model family or provider. In this incident, the recovery path repeated DeepSeek V4 Flash and failed again.

### 3. Forced synthesis exists, but it is not a completion guarantee

The deterministic supervisor is configured to force synthesis after ten tool calls or eight read rounds. It did so in two of the three attempts. The forced pass correctly disabled tools and used a bounded evidence prompt.

However, “force synthesis” currently means “ask an LLM to synthesize now.” It does not mean “the turn is guaranteed to return the best available answer.” If the synthesis LLM stream throws, the orchestrator exits through the exception path.

The supervisor heartbeat runs after 12 seconds and then every 15 seconds, but it only observes and emits status decisions. It does not interrupt or recover a blocked stream reader. Forced synthesis is checked at orchestration checkpoints; it cannot repair a synthesis pass that is itself stalled.

### 4. The deterministic finalization guard is bypassed

The codebase already has a finalization guard capable of building an honest fallback from successful tool evidence, including recursively extracting entity names and titles. This is the right primitive for graceful degradation.

The transport exception is thrown before normal terminal finalization reaches that guard. The result is a generic error even though successful evidence is in memory.

This is the central correctness defect: **model synthesis is treated as mandatory even after the agent has enough evidence to answer deterministically.**

### 5. Final synthesis is mostly invisible until completion

The orchestrator buffers assistant output. It has an early lead-in mechanism, but a turn-global lead-in flag can already have been consumed by earlier activity. As a result, final synthesis text may remain invisible until the model sends its terminal completion event.

The user can therefore see a spinner or generic activity while the model has already generated partial answer text. If the stream later stalls, the useful partial answer is discarded from the normal successful path.

### 6. The frontend receives transport life, not useful progress

The server emits SSE heartbeat comments every 12 seconds. The client uses a 45-second raw-stream inactivity timeout, so those bytes keep the connection alive. This prevents a dead socket from hanging forever, but comments are invisible to the user.

Supervisor status messages can be mapped to `agent_state`, but there is no typed turn phase such as `gathering`, `synthesizing`, or `recovering`. The force-synthesis decision is recorded as telemetry but does not itself emit an explicit “I found the evidence and am compiling the answer” state.

### 7. Failed read evidence is not durably represented

Write tools are incrementally persisted because they must survive crashes. Read tools are intentionally skipped on the incremental hot path and normally bulk-persisted when a turn completes.

On these failed turns, the bulk successful-turn path did not preserve the read trace and real counters. Consequently, the exported audit incorrectly reported zero tool calls and zero LLM passes even though its own event timeline showed tool activity.

Event records are batch-written, so their identical database timestamps preserve ordering but not exact per-event wall-clock timing.

### 8. The terminal error is too generic

The server catch sends:

```text
An error occurred while streaming.
```

That message does not say that research completed, that answer synthesis failed, whether retrying is safe, or whether any partial answer was retained. A previous graceful-error audit already identified this generic-error and partial-output gap.

## Seven-day production telemetry snapshot

This is a small, attempt-level sample queried during the investigation on 2026-07-22. It is useful for prioritization, not for declaring a universal provider ranking.

### All `agentic_chat_v2_stream` attempts

| Result  |   n |       p50 |       p90 |       p95 |       max |
| ------- | --: | --------: | --------: | --------: | --------: |
| Success |  62 |  14,381ms |  48,911ms |  52,283ms |  59,361ms |
| Failure |  11 | ~60,004ms | ~60,004ms | ~60,004ms | ~60,004ms |

All 11 failures were 60-second timeouts. All used DeepSeek V4 Flash.

### DeepSeek V4 Flash by observed provider

| Provider/result                   |   n |       p50 |       p95 | Interpretation                                   |
| --------------------------------- | --: | --------: | --------: | ------------------------------------------------ |
| DeepInfra success                 |  28 |   8,839ms |  47,828ms | Fastest and no failures in this small sample     |
| DigitalOcean success              |  19 |  30,116ms |  59,361ms | Slower tail pressed directly against the timeout |
| DigitalOcean failure              |   6 | ~60,002ms | ~60,002ms | Six attempt timeouts                             |
| SiliconFlow success               |  13 |  17,543ms |         — | One additional SiliconFlow timeout occurred      |
| Provider label `deepseek` failure |   4 | ~60,004ms | ~60,004ms | Four attempt timeouts                            |

DigitalOcean therefore had 19 successes and six failures in this sample. That is enough to justify testing an exclusion on **forced synthesis**, but the sample is too small and routing is too confounded to make a broader vendor claim.

### Pass-role behavior

| Pass role        |   n | Observed behavior                                                                               |
| ---------------- | --: | ----------------------------------------------------------------------------------------------- |
| Initial plan     |  14 | p50 10,219ms; p95 40,282ms; p95 first token 3,283ms                                             |
| Tool follow-up   |  33 | p50 13,001ms; p95 91,651ms because retries are included; first-token tail also expands on retry |
| Forced synthesis |   5 | 5,156ms, 9,909ms, 52,285ms, 79,542ms, and 116,229ms                                             |

The forced-synthesis sample is especially small, but it makes two points:

1. Some syntheses complete in under ten seconds.
2. Sequential retry makes the tail extremely long, and the current 60-second cutoff is close to the successful latency distribution.

## Reassessment of the “three deadlines” proposal

The concern about over-constraining the model is valid. The original proposal was too specific before the system had enough role-specific latency and quality data.

### What could go wrong with aggressive deadlines

- A first-token deadline can punish models that spend time in hidden reasoning before emitting text.
- An inter-token deadline can misclassify OpenRouter processing comments, reasoning chunks, network buffering, or a long structured token as a stall.
- Repeated hard cancellation can lower completeness and evidence coverage even when the eventual answer would have been correct.
- Retrying the same route increases latency and load without creating useful redundancy.
- Hedging too early duplicates a large fraction of requests and raises cost.
- Hedging tool-calling or mutation passes can create duplicate work or ambiguous side effects.
- A larger hard timeout alone makes failures slower.

Amazon’s timeout guidance is to choose a tolerable false-timeout rate and derive the timeout from measured downstream latency percentiles, with padding for network effects—not to select a round number by intuition. See [Timeouts, retries, and backoff with jitter](https://d1.awsstatic.com/builderslibrary/pdfs/timeouts-retries-and-backoff-with-jitter.pdf). Google SRE similarly recommends bounded retries, deadline propagation, cancellation, graceful degradation, and careful use of hedged requests: [Addressing cascading failures](https://sre.google/sre-book/addressing-cascading-failures/).

### Revised model: one deadline, one optional hedge, one feedback cadence

These should not all be called deadlines:

| Mechanism                  | Initial role                                                         | Interrupts the model? | Recommendation                                       |
| -------------------------- | -------------------------------------------------------------------- | --------------------- | ---------------------------------------------------- |
| User-feedback cadence      | Immediately acknowledge and update the visible phase                 | No                    | Implement first                                      |
| Delayed hedge trigger      | Start one heterogeneous backup synthesis while the primary continues | No                    | Experiment only, no-tool synthesis only              |
| Absolute operation ceiling | Stop consuming resources and enter deterministic recovery            | Yes                   | Keep, but set from measured percentiles by pass role |

Do **not** add an inter-token hard cutoff in the first implementation. Instrument semantic progress first: headers received, provider/model selected, processing comment received, reasoning delta received, answer delta received, terminal event received.

### Why a delayed hedge is different from a harsher timeout

A hedge does not have to cancel the original request. For a side-effect-free synthesis pass, BuildOS can start a different model/provider after the primary crosses a measured latency percentile, let both continue, validate both outputs, accept the first valid terminal answer, and cancel the loser.

That reduces tail latency without forcing the original model to think faster. It does add cost and load, which is why the trigger must be derived from observed latency and canary data. An AWS case study found that the best hedge point depended on measured workload percentiles and duplicate-request cost; that result should be treated as an example of the method, not copied as a BuildOS threshold: [request hedging case study](https://aws.amazon.com/blogs/database/how-global-payments-inc-improved-their-tail-latency-using-request-hedging-with-amazon-dynamodb/).

## Recommended synthesis experiment

### Scope

Test only `noToolSynthesisPass === true` initially. It is side-effect free, tools are disabled, and it is the exact role that failed in the incident.

Do not initially change:

- tool-planning deadlines,
- mutation passes,
- tool-execution deadlines,
- inter-token timeouts,
- the overall 285-second serverless turn ceiling.

### Hypotheses

1. A dedicated synthesis route using a different model family/provider will improve terminal completion more than simply waiting longer on DeepSeek V4 Flash.
2. A single longer synthesis ceiling will recover legitimate slow completions without reducing answer quality, but will not improve time to first visible feedback by itself.
3. A delayed heterogeneous hedge can reduce p95/p99 synthesis latency without quality loss if it is triggered near a measured tail percentile rather than at an arbitrary fixed second.
4. Deterministic evidence finalization can guarantee a useful terminal response when all model variants fail.

### Experiment arms

| Arm                                | Behavior                                                                                                  | Purpose                                                              |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| Control                            | Current 60s attempt, sequential retry with current routing                                                | Baseline                                                             |
| A: Longer single attempt           | One 120s ceiling, no sequential same-route retry                                                          | Measure recovered legitimate slow completions and false-timeout rate |
| B: Dedicated synthesis route       | One 120s ceiling on a reliable, role-specific model/provider route                                        | Separate routing quality from timeout length                         |
| C: Dedicated route + delayed hedge | Same as B; after a measured percentile, start one different model/provider and use the first valid answer | Test tail-latency improvement and duplicate-compute cost             |
| D: Deterministic recovery          | Inject failure of all LLM arms and finalize from collected evidence                                       | Prove the no-empty-terminal guarantee                                |

The 120-second value is a **test value**, not a final recommendation. It is intentionally above the current successful p95 and below the overall turn ceiling. The production value should be chosen from a larger, pass-role-specific latency distribution and an explicit false-timeout budget.

### Replay dataset

Use recorded or safely redacted production synthesis inputs plus synthetic edge cases:

- the exact 5,211-token incident synthesis prompt,
- short list answers,
- long narrative answers,
- zero-evidence turns,
- contradictory evidence,
- many similar names,
- organization names mixed with person names,
- evidence near the current 16-item synthesis cap,
- tool results with nested names/titles,
- partial evidence after a provider failure,
- prompts that legitimately require longer reasoning.

Start with at least 200 prompt-runs per arm if cost permits, then perform a power analysis using observed variance before making a broad rollout decision. Ensure the same prompt set is used across arms.

### Fault injection matrix

The test harness should simulate:

- no response bytes,
- OpenRouter processing comments only,
- reasoning deltas but no answer text,
- partial answer text followed by a stall,
- missing terminal `[DONE]`,
- explicit midstream error frame,
- first provider times out and second succeeds,
- first model times out and a different model succeeds,
- both model routes fail,
- caller aborts during synthesis,
- overall turn budget is nearly exhausted,
- frontend disconnects after partial output.

Every case must end in a typed terminal state and a persisted/recoverable user-facing result.

### Quality metrics

- factual support from supplied evidence,
- person-name precision and recall,
- evidence coverage,
- unsupported-claim/hallucination rate,
- instruction adherence,
- answer completeness,
- clear qualification of uncertainty,
- zero tool calls during forced synthesis,
- human preference on a stratified review sample.

Use deterministic assertions where possible and a judge model plus human review where necessary. The judge must not be the same model used by every experiment arm.

### Reliability, latency, and cost metrics

- terminal completion rate,
- missing-terminal-event rate,
- deterministic-fallback rate,
- time to first visible synthesis text,
- total synthesis duration p50/p90/p95/p99,
- whole-turn duration,
- false-timeout rate,
- hedge invocation rate,
- hedge win rate,
- duplicate inference cost,
- tokens and dollars per completed answer,
- provider/model-specific timeout rate.

### Proposed decision gates

These are starting review thresholds, not established SLOs:

- 100% of injected all-model-failure cases produce an honest deterministic terminal answer when usable evidence exists.
- No statistically material loss in evidence coverage, person precision/recall, or unsupported-claim rate. A non-inferiority margin of two percentage points is a reasonable starting proposal for review.
- A meaningful reduction in forced-synthesis p95 and turn-level no-answer failures.
- Hedge duplicate-compute rate and total cost increase remain within an explicitly approved budget; 20% is a possible initial ceiling for the experiment, not a permanent target.
- No hedged mutation/tool execution occurs.
- Every terminal path persists a typed outcome and correlation identifiers.

### Rollout

1. Offline replay and fault injection.
2. Shadow comparison if production privacy/cost rules allow it.
3. Five-percent forced-synthesis canary with a kill switch.
4. Twenty-five percent after quality and cost review.
5. Full rollout only after the provider/model and deterministic-recovery metrics hold.

## Recommendations

### P0 — Guarantee a terminal answer from collected evidence

Catch synthesis stream exhaustion at the orchestration boundary. If successful tool evidence exists:

1. preserve any valid partial assistant text,
2. invoke the finalization guard,
3. build a deterministic, explicitly qualified evidence summary,
4. persist it as interrupted/recovered rather than successful model synthesis,
5. send a typed `done` state.

For a people-list request, the deterministic fallback can safely say which person-like names were found, where possible, and which entries remain uncertain. It must not invent roles the tool evidence did not support.

If no usable evidence exists, return an honest scoped failure that says no answer could be assembled and offers a safe retry. The user should never receive only a generic transport error after several minutes of successful research.

### P0 — Preserve partial synthesis and never reset visible committed text

Once final synthesis has emitted meaningful answer text to the user, a retry or hedge must not erase it. Mark it as interrupted until a terminal answer is committed. If recovery succeeds, replace or complete it using explicit message-version semantics. If recovery fails, persist the partial with a clear “response interrupted” indicator.

Before any visible answer token is committed, the system may freely switch to a backup route. After commitment, recovery must avoid duplicate or contradictory text.

### P0 — Add structured phase progress

Add a typed SSE progress event rather than relying on invisible heartbeat comments and generic `agent_state` strings. Suggested phases:

```text
planning -> gathering -> synthesizing -> recovering -> completed
```

The event can include safe operational facts such as read count, elapsed time, and whether recovery is active. It must not expose chain-of-thought.

The frontend should update a single activity row instead of appending repetitive status rows. A reasonable UX is:

- immediate: “Looking through this project for people and references…”
- after reads: “Reviewed 8 project sources; compiling the people list…”
- on recovery: “The first response stalled; finishing from the information already found…”

The feedback cadence does not constrain the model and can ship independently of deadline experiments.

### P0 — Persist failed-turn evidence and real counters

Persist compact read evidence or the bounded read memo incrementally enough that a failed turn retains:

- tool name and arguments,
- success/failure,
- bounded result excerpt or evidence object,
- sequence index,
- pass role/model/provider,
- actual tool/pass counters.

The audit must never report zero tools and zero LLM passes when turn events prove otherwise. This is necessary for recovery, support, and provider evaluation.

### P0/P1 — Give forced synthesis its own route

Forced synthesis should not inherit the generic balanced text route by accident. Configure it explicitly by pass role:

- a primary synthesis model chosen for terminal reliability and evidence-grounded prose,
- a backup from a different model family and preferably a different infrastructure provider,
- a smaller role-appropriate output cap for list/summary tasks instead of the universal 8,000 tokens,
- explicit provider constraints compatible with ZDR and required parameters.

The current quality escalation happens only after a model-produced no-tool-synthesis retry condition. A transport retry stays on the same balanced route. Transport failure should instead trigger heterogeneous recovery immediately.

### P1 — Run a DigitalOcean exclusion canary, not a global ban

For DeepSeek V4 Flash forced synthesis only, test one of:

- `ignore: ['digitalocean']`, or
- an explicit `only` list of verified ZDR-compatible providers.

Use exact OpenRouter slugs. Also normalize/verify the current preferred slugs `baidu` and `gmicloud` and log the effective routing config.

Do not apply a global DigitalOcean ban from this incident alone. Provider capacity and health change. The long-term design should use BuildOS-observed circuit breakers by model, provider, and pass role, with minimum sample sizes, cooldown, and automatic re-entry canaries.

### P1 — Reduce work for people-identification intents

The system should not require 11 searches to answer “who are the relevant people in this project?” Add an aggregate read capability that returns bounded person mentions from:

- project title/description,
- goals and tasks,
- documents and document sections,
- activity/history where appropriate,
- linked contacts or person entities,
- frequency, source references, and confidence.

This can be a dedicated `get_project_people_context` read tool or an indexed/materialized people-mentions view. The model’s job becomes ranking and explaining a bounded evidence set, not repeatedly guessing names and launching another search.

The supervisor should have an intent-specific read budget for this operation and synthesize once coverage stops improving. A generic ten-tool threshold is too coarse.

### P1 — Make synthesis progress observable end-to-end

Record, without exposing private reasoning:

- request accepted,
- provider/model chosen,
- headers received,
- OpenRouter processing comment received,
- first reasoning delta,
- first answer delta,
- last answer delta,
- terminal event,
- abort reason,
- recovery route selected.

OpenRouter documents periodic SSE processing comments. BuildOS currently ignores non-`data:` lines; it can treat those comments as upstream liveness signals without showing their raw content to users. See [OpenRouter streaming](https://openrouter.ai/docs/api_reference/streaming).

### P1 — Use role-specific output and time budgets

The universal 8,000-token output cap is excessive for a people list and expands worst-case generation time. Select output caps by pass role and inferred answer shape. Keep enough room for a complete answer, but do not reserve essay-scale output for a bounded list.

Likewise, derive absolute ceilings independently for:

- initial planning,
- tool follow-up,
- forced synthesis,
- normal final synthesis.

This is not the same as pressuring the model with a prompt-level countdown. It is resource isolation at the orchestrator.

### P2 — Introduce an explicit turn state machine and recovery reserve

Represent the turn as durable states with typed transitions:

```text
planning
  -> gathering
  -> ready_to_synthesize
  -> synthesizing
  -> recovering
  -> completed | completed_degraded | failed
```

Reserve part of the overall turn budget for terminalization. Tool gathering must not consume the entire serverless window. When the reserve is reached, stop new research and enter synthesis/recovery with the evidence already collected.

### P2 — Define reliability SLOs and alerting

Track at least:

- percent of admitted turns with a terminal `done`,
- percent with a non-empty user-visible answer,
- time to first useful feedback,
- time to first answer text,
- synthesis failure rate by model/provider/pass role,
- recovered/degraded completion rate,
- turns whose persisted counters disagree with events.

Alert on clusters of attempt timeouts and no-answer turns. A circuit breaker cannot be trustworthy without these measurements.

## Recommended implementation order

### Phase 0 — Preserve the incident as a regression fixture

1. Store a redacted reconstruction of the incident’s forced-synthesis prompt/evidence as a test fixture. Mark it as reconstructed rather than byte-exact because the failed turn did not durably retain its full read-result payloads.
2. Add the fault-injection cases listed above.
3. Define typed terminal outcomes and measurement fields.

**Exit gate:** the current implementation reproduces the missing-answer failure in a deterministic test.

**Implementation progress (2026-07-22):** Phase 0’s timeout boundary is now characterized in `people-synthesis-timeout.regression.test.ts`, backed by the redacted reconstructed fixture in `test-fixtures/people-synthesis-timeout-2026-07-22.ts`. The LLM pass runner now exposes typed terminal outcomes and measurements for completion, timeout, missing completion, provider error, abort, and generic stream error. Focused tests cover successful completion, retry recovery, reasoning-only output, missing completion, partial output followed by exhausted timeout, provider error, and caller abort. The original characterization first proved the thrown timeout/no-answer behavior; Phase 1 now converts that same fixture into deterministic degraded completion.

### Phase 1 — Ship the no-empty-terminal guarantee

1. Catch exhausted LLM pass attempts specifically at no-tool synthesis.
2. Preserve partial output.
3. Invoke deterministic finalization from successful evidence.
4. Emit and persist `completed_degraded` or an equivalent typed outcome.
5. Fix real read/pass counters and retain bounded evidence on error.

**Exit gate:** every injected synthesis failure returns and persists an honest answer or a precise no-evidence failure; no generic-only terminal path remains.

**Implementation progress (2026-07-22):** Phase 1 is implemented at the forced no-tool synthesis boundary. A typed terminal synthesis failure other than caller abort is converted into `completed_degraded`; failures outside that boundary still propagate normally. The pass runner retains the longest usable partial across attempts, with the later attempt winning equal-length ties. The orchestrator rejects trivial fragments, preserves a usable partial answer, or invokes the existing finalization guard over successful read evidence. If no safe deterministic evidence summary is possible, it emits a precise synthesis/no-evidence response instead of the generic stream error.

The recovered failed pass is appended to `llmPasses`, including attempts, retry count, terminal outcome, byte-class counters, duration, and exhaustion state. The normal successful terminal path then persists the actual tool executions and corrected pass/read counts. The assistant message stores a typed `completion_outcome`, the SSE `done` event carries `completion_status` and `answer_source`, and observability records `synthesis_transport_recovered` plus failed-pass terminal fields. The database turn-run status remains the existing compatible `completed` value; `completed_degraded` is the more specific completion classification in event and assistant metadata.

Regression coverage now includes the reconstructed incident, deterministic person evidence (including ambiguity qualification), partial-output preservation, rejection of unusable fragments, precise no-evidence recovery, failed-pass serialization, read-evidence persistence, and the SSE terminal contract. The per-attempt 60-second timeout and retry policy are intentionally unchanged; user-visible phase feedback is implemented in Phase 2, while deadline experiments remain Phase 4.

### Phase 2 — Fix user feedback without changing model timing

1. Add typed turn phases.
2. Emit an immediate scoped acknowledgement.
3. Emit explicit synthesis and recovery states.
4. Update one frontend activity item and mark interrupted partial text.
5. Keep SSE heartbeats for transport liveness.

**Exit gate:** a user sees meaningful state within roughly one second and never waits silently for a minute, while model behavior is unchanged.

**Implementation progress (2026-07-22):** Phase 2 is implemented without changing model prompts, provider routing, retry counts, or the 60-second attempt timeout. The first sequenced SSE payload is now a scoped, typed `turn_phase: acknowledged` event (workspace, project, or brief). It is intentionally non-durable and excluded from the client’s turn-evidence set because it can precede admission; a denied turn therefore still rolls back its optimistic user message correctly.

The orchestrator reports deduplicated `planning`, `gathering`, `synthesizing`, and `recovering` phases, and the route adds `finalizing` before terminal persistence and `done`. `recovering` is emitted at the first synthesis retry boundary rather than after all attempts are already exhausted; non-retryable synthesis failures emit it at terminal recovery. These events are recorded as `turn_phase_changed` telemetry. The client updates one stable thinking-block activity in place across all phase changes, rather than adding a new status row for every transition. Existing tool activities, supervisor status messages, and transport heartbeats remain separate and unchanged.

The `done` event’s Phase 1 completion fields now control terminal presentation. A deterministic evidence recovery is shown as a completed recovered answer; `partial_model` and precise no-evidence completions finalize the thinking block as interrupted with an explicit note. Live partial-model messages receive `interrupted: true` and `interrupted_reason: synthesis_recovered`, and the same completion/interruption fields are persisted on the assistant message so a reload preserves the honest state.

The Phase 1 re-audit also found and closed a speculative-text seam: forced synthesis previously could emit a complete-looking sentence from attempt one before that attempt failed, then append a different retry result. Forced no-tool synthesis is now buffered until clean completion or degraded terminal recovery, ensuring the selected partial/fallback is emitted once. Typed phase feedback replaces the silence without exposing replaceable prose.

Coverage verifies acknowledgement-first ordering, the full incident phase sequence, single-item client phase updates, degraded terminal rendering, persisted completion metadata, forced-synthesis buffering, stream protocol compatibility, and the existing cancellation/error paths. The broader offline validation set passes 205 tests across the orchestrator, route, SSE handler, stream controller, and protocol. The shared-types package builds successfully, and the repository's canonical Svelte check reports 0 errors and 0 warnings. A final strict-indexing error discovered by that check in the phase-activity finalizer was guarded and revalidated before completion.

### Phase 3 — Create a dedicated forced-synthesis route

1. Route forced synthesis explicitly instead of through generic balanced text.
2. Make transport recovery heterogeneous by model family/provider.
3. Normalize and log exact OpenRouter provider slugs.
4. Canary `digitalocean` exclusion for this model/pass role.
5. Add role-specific output caps.

**Exit gate:** canary improves terminal completion and latency without quality regression or privacy-policy violations.

**Implementation progress (2026-07-22):** The dedicated forced-synthesis route is implemented behind a deterministic, server-side canary and defaults to `off`. Ordinary chat, tool-calling, write-intent, and non-forced answer passes retain their current routing. The dedicated variant uses an explicit cross-family candidate order (`z-ai/glm-5.2`, `deepseek/deepseek-v4-pro`, `minimax/minimax-m3` by default), rotates the primary model on the second transport attempt, applies a forced-synthesis-only 6,000-token output cap, and sends `provider.ignore: ["digitalocean"]`. Control/off traffic retains the existing generic route and 8,000-token cap. Pinned evaluation models override the canary so an eval cannot silently change its route.

The OpenRouter integration now normalizes provider preferences to lowercase API slugs, preserves the raw reported provider, and records a normalized provider slug when it can do so without guessing. The previous DeepSeek preference values `Baidu` and `GMICloud` are now sent as the documented `baidu` and `gmicloud` slugs. Privacy invariants remain additive: request-specific ignores are merged into the existing `data_collection: deny` and ZDR policy, and OpenRouter/provider fallbacks remain enabled. This is a scoped DigitalOcean canary, not a global ban.

Per-pass telemetry and persisted pass summaries now include the synthesis routing variant, requested model order, ignored provider slugs, output cap, retry-rotation flag, per-attempt model routes, raw provider, and normalized provider slug. This makes it possible to compare control and dedicated attempts without inferring configuration from model names. The implementation is covered by model-routing, pass-runner, OpenRouter request-shape, provider-normalization, incident-regression, and route tests.

Offline validation passes 270 tests across 14 timeout/streaming files, including the reconstructed incident, model selection and retry rotation, OpenRouter request construction, client phase handling, orchestration, protocol, and route behavior. The `@buildos/smart-llm` package also passes its TypeScript check. A completed repository-wide Svelte check after the Phase 3 source changes reported 18 errors, all in pre-existing concurrent database-schema work and none in the Phase 3 files; those unrelated errors are not addressed here.

Canary controls:

```dotenv
FASTCHAT_FORCED_SYNTHESIS_ROUTING=ab
FASTCHAT_FORCED_SYNTHESIS_ROUTING_SAMPLE_RATE=0.1
FASTCHAT_FORCED_SYNTHESIS_MODELS=z-ai/glm-5.2,deepseek/deepseek-v4-pro,minimax/minimax-m3
FASTCHAT_FORCED_SYNTHESIS_IGNORE_PROVIDERS=digitalocean
FASTCHAT_FORCED_SYNTHESIS_MAX_TOKENS=6000
```

Recommended rollout is 10% dedicated traffic first, followed by a hold-and-review before increasing exposure. Compare only `pass_role = forced_synthesis`, segmented by `forced_synthesis_routing_variant`. Promote only if the dedicated arm has no increase in `completed_degraded`, timeout/missing-completion, `answer_source = precise_no_evidence`, cancellation, or qualitative person-list errors; p95 pass duration and terminal completion should improve, and cost/output length must remain within the predeclared budget. Roll back by setting `FASTCHAT_FORCED_SYNTHESIS_ROUTING=off`; no code or global provider-setting change is required.

The Phase 3 code path is complete, but the exit gate is intentionally still open until production canary data exists. No production environment variable was changed as part of this implementation.

### Phase 4 — Run the deadline/hedge experiment

1. Compare the control, longer single attempt, dedicated route, and delayed hedge.
2. Select the hard ceiling from measured percentiles and a false-timeout budget.
3. Select a hedge trigger only if its p95/p99 benefit justifies duplicate cost.
4. Keep hedging restricted to no-tool synthesis until separately proven safe.

**Exit gate:** predeclared quality, reliability, latency, and cost gates pass.

### Phase 5 — Make people-list requests intrinsically cheaper

1. Add the aggregate people-context read path.
2. Add source/confidence metadata.
3. Apply an intent-specific search/read budget and coverage-stagnation rule.
4. Re-run the incident fixture and production canary.

**Exit gate:** the request completes with materially fewer read rounds and equal or better person precision/recall.

### Phase 6 — Generalize resilience

1. Add the durable turn state machine and terminal recovery reserve.
2. Add model/provider/pass-role circuit breakers.
3. Add SLO dashboards and alerts.
4. Schedule recurring replay/fault-injection tests.

## What not to do

- Do not merely raise 60 seconds and declare the incident fixed.
- Do not add a hard inter-token cutoff before semantic progress is instrumented and tested.
- Do not hedge tool-calling or mutation passes in the first rollout.
- Do not repeat the same model/provider route and call it failover.
- Do not globally ban DigitalOcean based on 25 observed attempts.
- Do not stream raw chain-of-thought or provider internals to the user.
- Do not discard collected evidence because the prose model failed.
- Do not let a failed turn report zero work when the work occurred.
- Do not make a deterministic fallback sound more certain than its evidence.

## Primary code touchpoints

| Concern                                                             | File                                                                                      |
| ------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| 60s attempt timeout and two sequential attempts                     | `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/llm-pass-runner.ts`        |
| Forced-synthesis construction, buffering, heartbeat, exception path | `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts`                  |
| Bounded synthesis evidence                                          | `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/synthesis-context.ts`      |
| Deterministic evidence fallback                                     | `apps/web/src/lib/services/agentic-chat-v2/turn-supervisor/finalization-guard.ts`         |
| Supervisor status/force thresholds                                  | `apps/web/src/lib/services/agentic-chat-v2/turn-supervisor/deterministic-supervisor.ts`   |
| Pass-role model routing                                             | `apps/web/src/lib/services/agentic-chat-v2/model-tiering.ts`                              |
| OpenRouter provider config and stream setup                         | `apps/web/src/lib/services/openrouter-v2-service.ts`                                      |
| Smart model/profile lists                                           | `packages/smart-llm/src/model-config.ts`                                                  |
| Output limits                                                       | `apps/web/src/lib/services/agentic-chat-v2/limits.ts`                                     |
| Terminal error, SSE, persistence hooks                              | `apps/web/src/routes/api/agent/v2/stream/+server.ts`                                      |
| Client inactivity/reconciliation                                    | `apps/web/src/lib/components/agent/agent-chat-stream-controller.svelte.ts`                |
| Agent-state rendering                                               | `apps/web/src/lib/components/agent/agent-chat-sse-handler.ts`                             |
| Shared SSE types                                                    | `packages/shared-types/src/agent.types.ts`                                                |
| Prior graceful-error audit                                          | `apps/web/docs/technical/audits/AGENTIC_CHAT_GRACEFUL_ERROR_HANDLING_AUDIT_2026-07-07.md` |

## External references

- [OpenRouter provider routing](https://openrouter.ai/docs/guides/routing/provider-selection)
- [OpenRouter model fallbacks](https://openrouter.ai/docs/guides/routing/model-fallbacks)
- [OpenRouter streaming](https://openrouter.ai/docs/api_reference/streaming)
- [OpenRouter errors and debugging](https://openrouter.ai/docs/api/reference/errors-and-debugging)
- [OpenRouter DeepSeek V4 Flash endpoints](https://openrouter.ai/api/v1/models/deepseek/deepseek-v4-flash/endpoints)
- [OpenRouter provider directory API](https://openrouter.ai/api/v1/providers)
- [DigitalOcean Inference](https://docs.digitalocean.com/products/inference/)
- [DigitalOcean available inference models](https://docs.digitalocean.com/products/inference/details/models/)
- [Amazon Builders’ Library: Timeouts, retries, and backoff with jitter](https://d1.awsstatic.com/builderslibrary/pdfs/timeouts-retries-and-backoff-with-jitter.pdf)
- [Google SRE: Addressing cascading failures](https://sre.google/sre-book/addressing-cascading-failures/)
- [AWS request-hedging case study](https://aws.amazon.com/blogs/database/how-global-payments-inc-improved-their-tail-latency-using-request-hedging-with-amazon-dynamodb/)
- [Vercel function duration](https://vercel.com/docs/functions/configuring-functions/duration)

## Reviewer checklist

The follow-up reviewer should challenge these points specifically:

1. Re-run the seven-day telemetry query and confirm that the sample unit is an LLM attempt, not a logical pass or user turn.
2. Capture the exact provider-routing object sent in production and verify whether OpenRouter normalizes `Baidu`/`GMICloud` or requires `baidu`/`gmicloud`.
3. Confirm which candidate providers satisfy the current ZDR and parameter requirements before approving an `only` list.
4. Reproduce the incident with the stored synthesis fixture and prove that the current exception bypasses terminal finalization.
5. Review the deterministic people-summary fallback for unsupported role/name claims and privacy-safe evidence handling.
6. Review the proposed 120-second experiment value; replace it with a percentile-derived value if a larger forced-synthesis dataset is available.
7. Model the cost and capacity effect of hedging at p80, p90, and p95 before choosing a production trigger.
8. Verify that partial-output preservation cannot duplicate text when a hedge or recovery answer wins.
9. Review compact read-evidence persistence for data minimization and retention requirements.
10. Confirm that the implementation sequence can ship the terminal guarantee and feedback changes independently of the hedge experiment.

## Bottom line

The priority is not to make the model hurry. The priority is to make the orchestration resilient:

1. gather less and more directly,
2. show useful progress,
3. use a reliable, role-specific synthesis route,
4. preserve partial and collected evidence,
5. guarantee deterministic terminalization,
6. then tune deadlines and hedges from measured data.

That sequence addresses the observed incident without trading answer quality for arbitrary speed limits.
