<!-- apps/web/docs/technical/audits/AGENTIC_CHAT_HARNESS_INDEPENDENT_REVIEW_2026-07-19.md -->

# Agentic Chat Modal and Model Harness Independent Review

**Date:** 2026-07-19  
**Scope:** Agentic chat modal, model routing, system prompt, skills, tool definitions, orchestration scaffolding, API/browser harnesses, and model-launch review process  
**Review mode:** Independent code trace plus focused local verification. No paid live-model runs were performed.

> **Implementation update, 2026-07-19:** The two P1 evaluation-integrity
> defects identified below are fixed. Scaffold variants now resolve to typed
> executable prompt/routing/recovery policies, prepared-prompt cache identity
> includes the prompt policy, and turn telemetry/prompt snapshots persist a
> computed prompt/tool fingerprint. The API harness and prompt replay runner now
> share the production SSE decoder plus a strict protocol validator. The
> remaining recommendations are qualification-suite and measured-deletion work.

## Executive conclusion

The system is materially stronger and better tested than the earlier findings implied. Two prior claims should be corrected:

1. The alleged preload/finalization mismatch is not a live defect. Server-preloaded skills are explicitly added to the effective loaded-skill ledger before both finalization repair and telemetry.
2. The 2,959-line modal is a maintainability concern, but it is not untested. Important behavior has been extracted into tested controllers, and the browser lane contains one live test plus four authenticated wiring tests.

The most important problem found was evaluation integrity: `FASTCHAT_EVAL_SCAFFOLD_VARIANT` was only a free-form telemetry label. It did not select a scaffold configuration, and most scaffold layers had no ablation switch. The implementation update above closes that prerequisite before the harness is used to decide which crutches a smarter model no longer needs.

The second confirmed defect was the harness SSE parser. It silently discarded malformed JSON frames and did not validate stream identity, ordering, or duplicates. The strict shared validator in the implementation update closes that gap.

The right direction is still "the model will eat your harness for breakfast," but the removal process needs a trustworthy experiment system. Delete behavioral coaching and redundant routing only after a pinned model passes a typed, fingerprinted ablation matrix. Do not classify authorization, write integrity, schema validation, deduplication, destructive-action controls, or event identity as removable model scaffolding.

## Findings

### P1 - Scaffold variants are labels, not executable experiment configurations

**Verdict: fixed 2026-07-19.**

`FASTCHAT_EVAL_SCAFFOLD_VARIANT` is read once and copied into the `orchestration_interventions` telemetry event:

- `apps/web/src/routes/api/agent/v2/stream/+server.ts:315`
- `apps/web/src/routes/api/agent/v2/stream/+server.ts:3475-3479`

The harness README is explicit that the label does not change runtime behavior:

- `apps/web/src/lib/tests/agentic-e2e/README.md:93-107`

The README asks the operator to change feature flags and the label together. That is not a reliable experiment contract:

- The label is free-form and can be wrong.
- The runtime does not reject an impossible or mislabeled combination.
- There are no runtime switches for most proposed removals, including the static root-skill catalog, domain sensing, skill preload, skill-gate repair, forced synthesis, and most recovery interventions.
- Telemetry records the claimed variant, not an immutable description of the actual assembled system.
- Reproducing an old result depends on remembering an undocumented set of environment values and code state.

This invalidates causal attribution. The harness can pin a model, but it cannot currently answer "did model X succeed without scaffold Y?" with enough rigor to delete Y.

**Required fix**

Introduce a typed `FastChatScaffoldVariant` resolved in one place. Each variant should explicitly control:

- static root-skill catalog
- operating-strategy skill coaching
- domain sensing
- automatic skill preload
- finalization skill gate and repair
- launch discovery surface
- legacy regex surface fallback
- forced synthesis
- autonomous recovery/supervisor interventions

Persist both:

- a stable variant ID
- a computed scaffold fingerprint derived from the resolved fields, prompt section IDs and hashes, initial tool names/schema hashes, and active repair/recovery policies

The server should emit that computed configuration in the prompt snapshot and turn telemetry. The harness should reject a result whose expected variant and computed fingerprint do not match.

**Implemented:** unknown variant IDs fail at server launch. Supported variants
control the static catalog, skill coaching, domain sensing, preload, skill-gate
repair, lean discovery, legacy fallback, soft forced synthesis, and autonomous
recovery. Hard safety finalization remains explicit and non-removable. Prewarm
and live cache checks use the same prompt policy. Strict harness mode requires
the resolved config/fingerprint and can assert expected values.

### P1 - The API harness silently accepts malformed or incoherent SSE

**Verdict: fixed 2026-07-19.**

`parseFrame` catches JSON errors and returns `null`:

- `apps/web/src/lib/tests/agentic-e2e/harness/sse-client.ts:109-123`

The reader then ignores null frames:

- `apps/web/src/lib/tests/agentic-e2e/harness/sse-client.ts:195-206`

It also overwrites `streamRunId` from any event carrying a string and does not validate:

- expected `stream_run_id`
- expected `client_turn_id`
- monotonic `sequence_index`
- duplicate `event_id`
- terminal event uniqueness
- stream closure without a terminal event

The production modal/controller has stronger identity, stale-event, duplicate, and reconciliation behavior. The API harness should not implement a looser version of the protocol it is meant to verify.

**Required fix**

Extract or reuse the production SSE decoder and protocol reducer in a non-UI collect mode. Malformed data frames, identity changes, duplicate terminal events, invalid ordering, and unexplained closure must fail a harness turn. Heartbeats and valid comment frames can remain ignorable.

The prompt replay runner has the same silent JSON-drop pattern in `parseReplayStream` and should use the same shared implementation:

- `apps/web/src/lib/services/agentic-chat-v2/prompt-replay-runner.ts:72-137`

**Implemented:** both evaluators use `SSEProcessor` through one strict collector.
It requires object payloads, exact `stream_run_id` and `client_turn_id`,
contiguous positive `sequence_index`, canonical unique `event_id`, exactly one
terminal `done`, no events after `done`, and a terminal event before closure.
The modal reuses the same framework-neutral stale/duplicate guard in lenient
mode so legacy events without envelope metadata remain product-compatible.

### P2 - The active E2E catalog does not exercise the scaffold layers under review

**Verdict: expand before any broad deletion.**

The API/runtime harness registers five scenarios:

- document create
- document edit with context
- project organize
- task create
- calendar move

The calendar scenario is unconditionally skipped:

- `apps/web/src/lib/tests/agentic-e2e/scenarios/catalog.ts:11-17`
- `apps/web/src/lib/tests/agentic-e2e/scenarios/calendar-move.scenario.ts:15-20`

The four active scenarios are useful write-integrity checks, but they do not directly assert:

- domain discovery quality
- skill discovery quality
- automatic preload
- skill-gate satisfaction without repair
- skill output-contract quality
- static-catalog dependence
- lean discovery behavior
- forced synthesis dependence

There is a separate prompt-eval catalog with audit, forecast, cold email, YouTube, UI/UX, calendar, overview, project creation, and safety scenarios:

- `apps/web/src/lib/services/agentic-chat-v2/prompt-eval-scenarios.ts`

That catalog is much closer to what scaffold ablation needs, but it is not the same model/scaffold matrix as the E2E harness. Some expectations may also be stale. For example, several outcome-card scenarios require `outcome_card_load`, while the current preloaded prompt tells the model not to call `outcome_card_load` for cards already covered by preload:

- expected calls: `prompt-eval-scenarios.ts:143-198`
- current preload behavior: `apps/web/src/lib/services/agentic-chat/tools/domains/domain-sensing.ts`

**Required fix**

Create one launch-qualification suite that can replay both deterministic stateful scenarios and skill-covered quality scenarios against every pinned model/scaffold pair. Assertions must distinguish:

- native success
- model self-repair
- supervisor rescue
- finalization-guard rescue
- hard failure

Add at least:

- ambiguous skill discovery
- exact skill discovery
- skill-covered craft output
- project audit and forecast
- tool discovery on a lean surface
- native mutation with domain sensing bypassed
- mixed task/document write
- cross-project move
- clarification/continuation
- malformed tool arguments
- empty final answer
- repeated read loop
- long-context turn

### P2 - Model routing is failover, not model qualification

**Verdict: establish a model-launch gate.**

The current automatic tool route is:

1. `deepseek/deepseek-v4-flash`
2. `tencent/hy3`
3. `xiaomi/mimo-v2.5`
4. `poolside/laguna-xs-2.1`
5. `deepseek/deepseek-v4-pro`
6. `z-ai/glm-5.2`
7. `minimax/minimax-m3`

Source:

- `packages/smart-llm/src/model-config.ts:508-536`

The first-pass fast tier is:

- `tencent/hy3`
- `xiaomi/mimo-v2.5`
- `poolside/laguna-xs-2.1`
- `deepseek/deepseek-v4-flash`

Source:

- `apps/web/src/lib/services/agentic-chat-v2/model-tiering.ts:4-9`

The OpenRouter V2 service resolves an ordered lane and starts with the first model, passing later models as fallbacks. It does not distribute normal turns across all listed models:

- `apps/web/src/lib/services/openrouter-v2/model-lanes.ts:122-161`
- `apps/web/src/lib/services/openrouter-v2-service.ts:1567-1680`

Consequences:

- The first healthy model dominates production behavior.
- Later models may receive mostly degraded-provider or failover traffic.
- A model being present in the route does not mean its agentic quality was validated.
- Hand-maintained catalog smartness/speed/capability metadata cannot substitute for task-level results.
- A stale review can describe models no longer in the active lane. The previous tracker's Qwen reference is one example; Qwen is not in the current normal tool route.

**Required model-launch gate**

For every model added, promoted, reordered, or materially version-changed:

1. Re-read the current assembled system prompt and tool schemas.
2. Pin every pass to that exact model.
3. Run baseline and approved lean variants over the full qualification suite.
4. Compare native success, rescue rate, schema/validation errors, pass count, TTFT, p50/p95 latency, token/cost, and judged output quality.
5. Review failures by scaffold layer, not only aggregate score.
6. Admit the model to a lane only with a dated evaluation artifact and exact model ID.
7. Re-run the prompt-deletion queue. A stronger model launch should create deletion work, not only routing work.

### P2 - The static root-skill catalog is a credible deletion candidate, not an immediate deletion

**Verdict: ablate by model; likely remove from stronger-model variants.**

Every normal turn receives a generated root-skill table:

- `apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts:796-846`

The same turn can also receive:

- ranked dynamic domain signals
- outcome cards
- recommended skill IDs
- a preloaded skill
- operating-strategy instructions requiring `skill_search` or `skill_load`

Source:

- `build-lite-prompt.ts:672-708`
- `build-lite-prompt.ts:768-793`

The July 10 prompt audit measured the capabilities/skills/tools section at 12,124 characters, with about 8.7k characters in the root-skill table:

- `apps/web/docs/technical/audits/AGENTIC_CHAT_PROMPT_QUALITY_AUDIT_2026-07-10.md:45`

The canonical project template plus tool definitions is still measured at 28,641 characters, about 7,161 estimated tokens:

- `apps/web/src/lib/services/agentic-chat-lite/prompt/prompt-size-budget.test.ts:174-185`

The table is a substantial always-on tax and overlaps with progressive discovery. However, it may still help ambiguous discovery on weaker models. Removing it without a model-specific ablation would trade measurable prompt savings for an unknown routing regression.

**Recommended variants**

- `baseline`: current behavior
- `no_static_skill_catalog`: retain concise skill-system explanation, dynamic signals, search, preload, and gate
- `model_led_skill_discovery`: also remove imperative skill-routing examples, retain only tool descriptions and hard output contracts
- `no_server_skill_routing`: disable sensing/preload/gate, retain on-demand skill tools

Promote the leanest variant that preserves quality for each production model. Do not force every model to use the same amount of scaffolding.

### P2 - Legacy regex surface routing remains, but deterministic routing as a whole should stay

**Verdict: remove only the fallback after coverage proves structured intent is sufficient.**

The earlier description of "regex tool-surface routing" was too broad. Current turn preparation first builds a structured `FastChatTurnIntent`, uses it to choose bounded surfaces, excludes delete/unlink from autonomous materialization, preserves pending writes across turns, and decides whether a native mutation should bypass domain sensing:

- `apps/web/src/lib/services/agentic-chat-v2/turn-preparation.ts:92-177`
- `apps/web/src/lib/services/agentic-chat-v2/turn-intent.ts`
- `apps/web/src/lib/services/agentic-chat-v2/tool-selector.ts:56-89`

Those controls reduce tool-menu size and latency and enforce useful safety policy. They are not merely teaching a weak model how to reason.

A legacy regex fallback remains for project document/mutation surfaces:

- `tool-selector.ts:91-132`

A separate regex hot-loads the cross-project task move tool:

- `tool-selector.ts:134-152`

The removal target is the fallback, not structured intent. First add differential tests showing that all existing fallback-positive utterances map to an equivalent structured operation and surface. Then remove `resolveProjectSurfaceProfileForTurn`. Evaluate the cross-project detector separately because `move_onto_task` is a purpose-built operation and may still need explicit materialization until structured intent represents source and destination project semantics.

### P2 - Prompt rules still carry workarounds for retired model behavior

**Verdict: put on the first ablation queue.**

The system prompt contains behavior motivated by Grok 4.1 Fast regressions:

- flattened strategy structure to avoid header mirroring: `build-lite-prompt.ts:672-683`
- mandatory 1-2 sentence pre-tool lead-in: `build-lite-prompt.ts:692`
- anti-echo instruction: `build-lite-prompt.ts:918-922`
- corresponding assistant-text sanitization patterns in `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/assistant-text-sanitization.ts`

Grok 4.1 Fast is not in the current active routes. Comments are not model input, but the behavior they motivated remains in the prompt and sanitizer. Historical protections should not live forever solely because a retired model once needed them.

The lead-in rule is particularly questionable. It adds visible latency and text before tool execution and is repeated in multiple prompt branches and final-response guidance. Test:

- no mandatory lead-in
- concise status emitted by runtime only
- current prompt behavior

Measure perceived TTFT, premature success claims, scratchpad leakage, and final answer quality. Keep post-tool grounding and write-truth rules regardless of lead-in outcome.

### P2 - Lean discovery is implemented and tested but has remained dark

**Verdict: canary now, then default on if production telemetry agrees.**

`FASTCHAT_LEAN_DISCOVERY` reduces the launch surface to `skill_search` and `domain_search`; the orchestrator can materialize the other discovery tools on demand:

- `apps/web/src/lib/services/agentic-chat/tools/core/gateway-surface.ts:15-41`
- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts:260-276`

Focused tests cover selection and on-miss `skill_load` materialization. The implementation has existed since June 14 and remains default off according to the audit documentation.

This is a better first reduction than deleting all domain/skill routing. It removes initial schema noise without removing capability. Run the full model matrix with it and canary it on the weakest active first-pass model. If native success and rescue rates hold, make it the baseline and delete the full-launch branch after a rollback window.

### P2 - Skill retrieval quality is heuristic and the skill corpus is under-evaluated

**Verdict: improve evaluation before expanding the catalog.**

The current source catalog contains:

- 52 skills
- 66 reference files
- about 1.3 MB of skill markdown
- about 445 KB of reference content
- 11 `evals.md` files

`skill_search` uses token and substring scoring over IDs, names, summaries, aliases, usage text, related operations, children, references, and dependencies:

- `apps/web/src/lib/services/agentic-chat/tools/skills/skill-search.ts:91-131`

This is transparent and deterministic, but it has predictable weaknesses:

- repeated generic terms can dominate
- confidence is a normalized score, not a calibrated probability
- lexical mismatch can hide the right skill
- large or overlapping metadata can bias ranking
- only a minority of skills carry local eval artifacts

Do not compensate by adding more global prompt catalog text. Build a retrieval benchmark with expected top-k roots/children, hard negatives, ambiguous requests, and no-skill requests. Track top-1, top-3, false activation, and downstream judged quality. A stronger model can choose better among good candidates, but it cannot recover a skill the deterministic retriever never returns unless the full catalog remains in prompt.

### P3 - Modal size is a maintainability risk, not the previously claimed test vacuum

**Verdict: downgrade; refactor opportunistically.**

`AgentChatModal.svelte` is 2,959 lines:

- `apps/web/src/lib/components/agent/AgentChatModal.svelte`

However, substantial behavior is already extracted into directly tested modules, including stream control, prewarm, attachments, voice, shell routing, SSE handling, session logic, formatting, tool presentation, export, and timeline logic.

The browser lane contains:

- one paid live prewarm/send/render test
- stop/cancel identity wiring
- accepted-stream closure reconciliation
- next-turn continuity context
- temporary image upload and canonical attachment reference

Source:

- `apps/web/src/lib/tests/agentic-e2e/browser/agent-chat-modal.spec.ts:262-665`

The remaining risk is cross-controller composition state, not an absence of tests. Continue extracting cohesive orchestration and add focused composition tests for:

- open, close, park, reset, and hydration interactions
- modal versus embedded host behavior
- context selector to focus to send wiring
- project-scoped durable attachment/OCR readback
- session realtime updates during an active run

Do not create one enormous component test simply to cover a line-count metric.

## Corrected prior findings

### Preload/finalization mismatch

**Prior claim:** a server preload says the gate is satisfied, but finalization only honors history or an actual `skill_load`, causing redundant repair and false telemetry.

**Corrected verdict:** false in the current code and already handled since commit `c5543f758` on 2026-07-09.

The route builds `skillGateHistoryLoadedSkillIds` from:

- history-loaded skill IDs
- the session used-domain ledger
- `skillGatePreload.skillId`

Source:

- `apps/web/src/routes/api/agent/v2/stream/+server.ts:2642-2659`

That effective ledger is passed to both the finalization gate and telemetry:

- gate: `+server.ts:2666-2673`
- telemetry: `+server.ts:3433-3445`

Unit tests prove that a relevant prior ledger skill satisfies repair and telemetry:

- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/repair-instructions.test.ts:723-730`
- `repair-instructions.test.ts:863-879`

No production fix is needed. Add one focused route-level regression test proving `skill_preloaded_id -> no redundant repair -> skill_gate_satisfied` so future reviews do not have to infer the integration from separate tests.

### Modal direct coverage

**Prior claim:** the modal was only indirectly covered.

**Corrected verdict:** overstated. The modal has a real browser integration lane plus extensive direct tests for extracted controllers. The maintainability concern remains, but severity should be P3 unless a concrete state-interaction bug is found.

### Regex routing

**Prior claim:** regex-driven tool routing should be removed.

**Corrected verdict:** partially valid. Structured deterministic intent is the primary router and should remain. Remove the legacy regex fallback only after differential coverage; do not delete safety-aware surface selection wholesale.

## What is scaffolding versus product correctness

### Candidate model crutches

These should be independently switchable and evaluated for deletion:

- static root-skill catalog
- repeated skill-routing examples in the system prompt
- mandatory pre-tool lead-in
- anti-echo wording tied to retired models
- domain sensing
- automatic skill preload
- skill-gate finalization repair
- legacy regex surface fallback
- forced synthesis after tool work
- repeated-read escalation wording
- autonomous recovery interventions

### Keep as deterministic controls

These protect users or preserve system truth and should not be delegated solely to model intelligence:

- authentication and authorization
- project/entity access checks
- tool argument and schema validation
- exact ID and scope enforcement
- destructive delete/unlink confirmation policy
- write deduplication/idempotency
- successful-write ledger and outcome integrity
- partial-failure reporting
- tool-result prompt-injection boundaries
- SSE stream identity, ordering, stale-event rejection, and reconciliation
- usage, model, provider, and intervention attribution
- bounded tool/pass/time/token limits

The test for removal is not "could a smart model usually do this?" It is "is this a behavioral aid, or is it enforcing an invariant the application owns?"

## Recommended ablation sequence

### Phase 0 - Make experiments trustworthy

1. **Done:** implement typed scaffold variants and computed fingerprints.
2. **Done:** share the production SSE decoder/protocol guard with both harnesses.
3. **Done:** make malformed or incoherent event streams hard failures.
4. Merge the prompt-eval and stateful E2E scenario inventories into one model/scaffold runner.
5. Persist exact prompt hash, tool-schema hash, model ID, provider, route position, pass role, and intervention path.

No harness deletion decision should be accepted before Phase 0.

### Phase 1 - Remove low-risk menu and prompt noise

1. Turn on lean discovery in canary.
2. Remove the static root-skill catalog for stronger pinned models.
3. Remove the mandatory lead-in and stale Grok-specific anti-echo coaching.
4. Remove the legacy regex surface fallback once differential tests pass.

These changes are high-value because they reduce every-turn tokens, tool-schema noise, or visible latency without removing write safety.

### Phase 2 - Test model-led routing

1. Remove operating-strategy skill examples while retaining concise tool descriptions.
2. Disable automatic preload but keep search/load available.
3. Disable domain sensing while keeping model-led discovery.
4. Compare native completion and quality, not merely eventual success after rescue.

If rescue rate rises materially, the model is not actually ready to eat that layer.

### Phase 3 - Test orchestration rescue removal

1. Disable skill-gate repair.
2. Disable forced synthesis.
3. Reduce repeated-read and validation recovery interventions.
4. Keep hard limits and application invariants.

This phase should be model-specific. A strong model can use a leaner runtime while a cheaper fast model keeps more assistance.

## Acceptance metrics

Every model/scaffold result should report:

- task success against ground truth
- judged output quality for craft/advisory tasks
- native success rate
- self-repair rate
- supervisor/finalization rescue rate
- tool selection accuracy
- argument/schema validation failures
- redundant reads and tool calls
- pass count and tool-round count
- TTFT and total latency, p50 and p95
- prompt/tool/result/output tokens
- estimated cost
- malformed/invalid protocol events
- incomplete, ungrounded, or falsely claimed writes

Primary promotion rule: no statistically meaningful regression in user outcome or safety, with lower prompt cost, latency, or intervention rate. "Eventually succeeded after the harness rescued it" is not equivalent to native success.

## Verification performed

Focused web tests:

- 10 files passed
- 193 tests passed
- covered prompt assembly/budget, domain sensing, preload, repair, turn intent, tool selection, turn preparation, model tiering, and OpenRouter lane routing

Focused Smart LLM tests:

- 3 files passed
- 31 tests passed
- covered model config, selection, fallback order, and streaming/model failover behavior

Browser test discovery:

- 5 modal tests discovered
- 1 `@live`
- 4 `@wiring`

The Svelte MCP autofixer was attempted against `AgentChatModal.svelte` but did not complete and produced no result before being stopped. No claim of a clean analyzer result is made.

Paid live-model and external-calendar scenarios were not run.

## Final recommendation

Do not start by deleting the gate, preload, or deterministic routing. Start by fixing experiment integrity. Then:

1. canary lean discovery
2. ablate the static root-skill catalog
3. remove stale model-specific prompt coaching
4. retire legacy regex fallback
5. test model-led skill routing
6. test removal of repair and forced synthesis last

At every model launch, the launch review should produce two outputs: whether the model enters the route, and which existing scaffold layers that model makes obsolete. A model upgrade that only changes a model ID and never deletes or simplifies anything should be treated as an incomplete launch review.
