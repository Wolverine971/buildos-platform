<!-- tasker/67-agentic-chat-redundant-read-round-planning.md -->

# 67 — Agentic Chat: eliminate redundant read rounds in model planning

**Created 2026-08-27.** Split from completed Tasker 66 after the production concurrency canary
proved that worker scheduling is no longer the dominant constraint for multi-read turns.

## Kernel

The worker can now execute independent tool calls concurrently. The next job is to separate four
causes of extra passes that aggregate telemetry currently conflates: true exact rereads, independent
reads serialized by the model, intentional projection dependencies, and control/reviewer rounds.
Faster batches do not help enough when the model creates unnecessary batches, but a required second
projection or safety review must not be mislabeled as redundant planning.

Teach and measure a tighter planning contract:

- identify the complete set of independent reads before emitting the first tool round;
- batch those reads in one provider response whenever their arguments are already known;
- treat successful tool results as authoritative turn memory;
- do not repeat a logical read unless a named missing fact or post-mutation invalidation requires it;
- move to synthesis as soon as the requested evidence is present.

This is a model-planning and tool-feedback problem. Tasker 66 continues to own graph compilation,
execution safety, conflict serialization, and concurrency rollout. Tasker 65 owns the broader
read-default and cost program.

## Production evidence that triggered this task (initial aggregate interpretation)

The 2026-08-27 three-document canary was intended to compare three known documents. Three clean
production repetitions all grounded the final answer correctly, but every turn recorded eight
tool calls across three or four aggregate tool rounds:

- two turns emitted a width-three outline batch, then a width-three section batch later;
- one turn emitted widths four, one, and three across its read rounds;
- the first parallel batches took 1.544–2.120s versus 3.815–3.885s in the serial control, a 44–60%
  batch-level improvement;
- end-to-end turns still took 29.2–34.2s because the dependent section round and historical control
  passes dominated the saved adapter time.

The mixed task-update control was initially read as the other failure mode: three independent
discovery reads spread across separate rounds before a batched mutation proposal. The row-level
trace below shows those pre-mutation calls were contract/reviewer controls, not entity discovery.

The subsequent mutation-concurrency canary correctly emitted the final three updates as one
concurrent `[3]` layer, cutting that batch from 4.050–4.251s serial to 2.113–2.360s concurrent. Its
five pre-mutation calls were initially summarized as separate read rounds. They were actually
contract declaration/revision and reviewer decisions. Concurrency worked; write-policy passes
erased the gain, but they are not evidence of redundant reads.

At aggregate level this made **round construction quality** look like the next constraint after
worker concurrency. The trace below corrects what those aggregate `read_tool` counts actually
contained.

## Initial trace findings — 2026-08-27 ET / 2026-08-28 UTC

The retained production rows do **not** support the strongest version of the diagnosis above. They
show expensive extra provider passes, but the cited calls were not exact duplicate evidence reads.
Do not tune the prompt against the old aggregate `read_tool` label until the baseline is corrected.

### Three-document canary

The three retained turns were:

- turn `a88a2801-...` / stream `8c974e...`: eight calls across three tool rounds;
- turn `3d6320c1-...` / stream `d8b12e...`: eight calls across four tool rounds;
- turn `5e9722ac-...` / stream `71afc8...`: eight calls across four tool rounds.

Each turn made three `get_document_outline` calls for three distinct document IDs and then three
`read_document_section` calls for those same IDs. There were zero exact `(tool, canonical args)`
duplicates and zero turn-memo hits. The other two calls were the historical
`declare_read_only_turn` and read-only reviewer controls.

That outline -> section expansion was required by the mounted tool surface, not evidence that the
model forgot a completed read. The canary requested the documents' full contents, but its opening
`project_basic` surface exposed `get_document_outline` and `read_document_section`, not
`get_onto_document_details`. The section tool requires a heading anchor returned by the outline.
The current worker also keeps the artifact's tool list unchanged between continuation requests, so
the catalog comment that full-body details "materialize after document results" is not implemented
on this path.

Tasker 65 has since removed `declare_read_only_turn` and its reviewer from the normal read path. A
current-code replay should therefore establish the new baseline; the expected lean-surface schedule
is three parallel outlines, three parallel section reads, then synthesis: six evidence calls in two
evidence rounds, not eight calls in three or four aggregate tool rounds.

### Current production replay baseline — 2026-08-27 ET / 2026-08-28 UTC

The opt-in `tool-graph-parallel-reads` production fixture ran three times with zero harness retries
against healthy worker release `8f30ae511e625bc7146ae20a24d0fddfe0fc3817`. All three turns passed
grounding, no-mutation, stream, and durable-terminal assertions.

| Turn                                   | Durable turn time | Evidence calls | Evidence widths | Provider passes | Total tokens |            Cost |
| -------------------------------------- | ----------------: | -------------: | --------------- | --------------: | -----------: | --------------: |
| `518658e1-a882-4a34-b3d8-ed0d614dd7f1` |           25.479s |              6 | `[3,3]`         |               3 |       37,382 |     $0.00166419 |
| `b6c72040-8eac-40b6-8bcf-a651fa0d16aa` |           18.284s |              6 | `[3,3]`         |               3 |       37,356 |     $0.00116239 |
| `029f102b-db61-403b-8aaf-d6b828cf060f` |           23.014s |              6 | `[3,3]`         |               3 |       37,145 |     $0.00114331 |
| **Median**                             |       **23.014s** |          **6** | **`[3,3]`**     |           **3** |   **37,356** | **$0.00116239** |

Every run used `deepseek/deepseek-v4-flash` through DeepInfra and emitted:

1. three distinct `get_document_outline` calls in logical provider round 1;
2. three distinct `read_document_section` calls in logical provider round 2;
3. final prose with no tools in logical provider round 3.

Across all 18 calls there were zero exact duplicates, zero memo hits, zero tool failures, and zero
control/reviewer calls. Each run addressed three unique resources and added one section projection
after each outline. The current fixture therefore passes the lean scan/read acceptance schedule in
3/3 repetitions. Durable turn time is now 18.284–25.479s versus the historical 29.2–34.2s range,
consistent with Tasker 65 removing the two old read-only controls. It does **not** reproduce
redundant or one-read-per-round planning.

This establishes the practical baseline:

- If the product keeps the lean scan/read contract, there is no prompt-planning fix to make for this
  fixture. The model already batches every currently independent call.
- Reducing this turn from three provider passes to two requires a tool-surface/product change that
  makes full-body reads available upfront; it is not achieved by telling the model to skip the
  anchor dependency.
- Keep duplicate-read telemetry and targeted model fixtures, but require a current reproduction
  before changing the production prompt. The old aggregate canaries are not that reproduction.

### Cross-scenario battery handoff

The wider zero-retry production battery reinforced this track's corrected diagnosis: 17 additional
evidence reads contained zero exact duplicates and zero memo hits, and known sibling calls were
batched. It did expose four correctness failures and two expensive contract/reviewer loops unrelated
to redundant read planning. The complete scenario matrix, turn/stream receipts, source trace,
remediation packages, and production release gate now live in
[Tasker 70](70-agentic-chat-production-battery-remediation.md).

**Tasker 67 implication:** do not ship the proposed stop-and-batch prompt change from this evidence.
Keep exact-read telemetry and targeted fixtures here, and require a current redundant-read
reproduction before changing the production prompt.

### Task-update canaries

The retained serial control traced for this task did not contain three discovery reads. Its six
calls were a turn declaration, contract approval, mutation-batch approval, and three task updates.
Likewise, the traced mutation-concurrency turn `49949e5b-29de-4a19-8297-c7401d32df93` made five
pre-mutation control/reviewer calls followed by one width-three update batch. The five calls were:

1. `declare_turn_contract`;
2. `request_proposal_revision` after the reviewer rejected an uncommissioned state change;
3. a corrected `declare_turn_contract`;
4. `approve_turn_contract_review`;
5. `approve_mutation_batch_review`.

Those passes are real latency, but they belong to contract/reviewer policy rather than redundant
discovery planning. Treating every mechanically classified `read_tool` step as an evidence read
conflates the two problems and would optimize the wrong boundary.

### What the source trace establishes

- Continuation history is structurally correct: the worker appends the exact assistant tool calls,
  then one `role=tool` result per call with the matching `tool_call_id`, and retains that history on
  later passes.
- Tool feedback is compacted and wrapped with source/security metadata, but has no generic envelope
  for requested projection, complete versus partial coverage, or whether another read is necessary.
- The batching sidecar explains how same-response calls execute and how `after` dependencies work.
  It does not tell the model to enumerate all known independent reads, regard successful results as
  turn memory, or stop once the evidence set is complete.
- Exact within-turn read memoization already exists, clears before writes, and returns an explicit
  `served_from_turn_memo` marker. It prevents repeat adapter cost but still leaves a provider pass
  and tool-call record. None of these cited canaries used it.
- `chat_tool_executions` durably records sequence, tool, arguments, result, and provider call ID, but
  not the logical provider round. The execution graph logs round/layer data only through best-effort
  job logging, so current durable telemetry cannot reconstruct round construction by itself.

### Working diagnosis

There are three separate questions to test instead of one assumed failure:

1. **Tool-surface shape:** should a known-ID, full-content comparison expose the full-document read
   upfront, or intentionally require the lean outline -> section flow?
2. **Independent-call planning:** once all arguments are known, does a small rubric reliably cause
   the acting model to emit all sibling calls in one response?
3. **True duplicate planning:** after a successful exact read, does the model issue the same logical
   read again without failure, missing coverage, or post-write invalidation?

Only questions 2 and 3 are prompt/planner defects. Question 1 must be decided before the
three-call/one-round acceptance threshold is meaningful.

### Concrete implementation and test surface

- `apps/web/src/lib/tests/agentic-e2e/scenarios/tool-graph-parallel-reads.scenario.ts` is the existing
  production fixture. Its assertion currently accepts any three-or-more outline/section calls and
  does not grade exact duplicates, projections, or provider rounds. Tighten it only after selecting
  the direct-detail or lean scan/read contract above.
- `apps/worker/tests/fixtures/agenticChatToolExecutionGraphModelScenarios.ts` and its grader test are
  the right deterministic home for independent-read, lookup/fan-out, partial-result, and justified
  post-write reread schedules. The existing cases grade graph scheduling shapes, not result memory
  or redundant reads.
- `apps/worker/src/workers/agentic-chat/provider/request-builders.ts` owns both the short batching
  sidecar and exact continuation replay. Put any stop-and-batch variant behind a narrow prompt/config
  seam here rather than editing the large seed prompt first.
- `packages/agentic-chat-runtime/src/loop/tool-payload-compaction.ts` is the shared boundary for a
  completion/projection envelope. Any envelope must survive compaction and its size guard.
- `packages/agentic-chat-runtime/src/catalog/surfaces.ts` and the worker's immutable artifact surface
  determine whether full-document details are callable. Do not promise result-time materialization
  unless the worker actually updates the continuation tool surface.
- `apps/worker/src/workers/agentic-chat/tools/tool-execution.ts`, `turn-executor.ts`, and the corresponding
  Supabase ledger RPC/migrations are the durable telemetry path. The per-turn aggregate
  `tool_round_count` is not enough to attribute individual calls to evidence rounds.

## Questions to answer before changing the prompt

1. Are repeated calls exact logical duplicates, or are arguments/result projections materially
   different on the second call?
2. Does the provider history expose completed tool results clearly enough for the model to know a
   read already succeeded?
3. Are tool results missing a completion/coverage signal that causes defensive rereads?
4. Do semantic-contract, mutation-review, or final-response gates force extra passes in which the
   model opportunistically calls tools again?
5. Does the system prompt explicitly say when to batch known reads and when to stop reading, or only
   explain what individual tools do?
6. Is read memoization hiding the runtime cost while leaving duplicate planning invisible to the
   model and telemetry?
7. Does the deployed acting model improve with a small scheduling rubric, or is a stronger model
   route required for multi-step planning?

Do not assume this is fixed by adding more prompt prose. Trace actual round history and result
shapes first, then run the smallest controlled prompt/tool-feedback experiment.

## Acceptance scenarios — write these before implementation

Use deterministic fixtures plus opt-in live model runs. Grade the emitted schedule, not just the
final prose.

### A. Known independent reads

Prompt supplies three exact entity IDs and requests a full-content comparison. Run one explicitly
selected surface contract:

- **Direct-detail variant:** expose `get_onto_document_details`; expect exactly three detail reads in
  the first evidence round and then synthesis.
- **Lean scan/read variant:** expose outline plus section reads; expect three parallel outlines,
  followed by three parallel section reads once anchors are known, and then synthesis.

For both variants, require zero exact duplicate reads. Do not grade a section projection as a
duplicate of the outline projection merely because both address the same document.

### B. Lookup then parallel fan-out

Prompt supplies names but not IDs.

- one necessary lookup round is allowed;
- once IDs are known, all independent entity reads appear in one later round;
- no entity is read twice without an explicit invalidation reason.

### C. Mixed read then write

Prompt requests three independent task updates whose IDs must first be discovered.

- independent discovery reads are batched in one round;
- the mutation batch follows only after required IDs/versions are known;
- no discovery read repeats between the read and mutation phases;
- final database state contains exactly the three commissioned changes.

### D. Legitimate reread after mutation

Prompt requests an update and then verification.

- the post-mutation read is accepted only because the mutation invalidated the earlier snapshot;
- telemetry classifies it as a justified reread, not redundant planning;
- the model does not repeat unrelated reads.

### E. Partial/missing result

One tool result deliberately omits a required field or returns a retryable failure.

- only the affected entity may be read again;
- successful sibling reads are not repeated;
- the model names the missing fact or failure that justified the follow-up.

## Work packages

### WP-1 — Make redundant planning observable

- Derive two privacy-safe identities: an exact read key from tool name plus canonical resource and
  projection/pagination arguments, and a resource key for grouping multiple projections of the same
  entity. Do not log returned content.
- Classify calls as evidence read, control, review, mutation, retry/replay, or memo-served. The raw
  runtime `read_tool` type is not a sufficient product metric.
- Add per-turn telemetry for `evidence_read_call_count`, `unique_exact_read_count`,
  `exact_duplicate_count`, `unique_resource_count`, `additional_projection_count`,
  `evidence_provider_round_count`, `control_provider_round_count`, first complete-evidence round,
  and justified post-mutation rereads.
- Persist the logical provider round (or an equivalent durable per-pass identity) on tool execution
  telemetry. Preserve graph layer widths durably rather than relying only on best-effort job logs.
- Distinguish model duplicates from worker retries, replay, and memo-cache hits.
- Add an admin/eval summary that correlates redundant reads with model route, provider, prompt
  version, pass count, latency, tokens, and cost.

**Exit:** the current three-document and mixed-task behaviors are attributable from durable
telemetry without inspecting user content.

### WP-2 — Trace the provider transcript and result contract

- Capture a redacted fixture of each model request across the affected turns: tool-call history,
  tool-result ordering, result identifiers, cache/memo markers, and the instructions present on
  every pass.
- Verify that every completed read result is replayed once, attached to the correct provider call,
  and described as complete or partial.
- Check whether result truncation, projection shape, or semantic-event interleaving makes a
  successful read appear unresolved.
- Verify whether control/reviewer passes remount read tools or restate the original objective in a
  way that invites another discovery cycle.

**Exit:** classify each redundant call as prompt/planner behavior, ambiguous tool feedback, provider
history defect, or an intentional retry/invalidation.

### WP-3 — Run the smallest planning experiments

Evaluate these as separate variants so effects remain attributable:

1. **Stop-and-batch rubric:** a short situational instruction to enumerate known independent reads,
   emit them together, and synthesize once evidence is complete.
2. **Tool-result completion marker:** explicit resource identity, requested projection, success, and
   whether another read is necessary.
3. **Turn read ledger:** compact model-visible list of logical reads already satisfied, updated
   between passes.
4. **Tool availability shaping:** do not remount discovery/read tools on a synthesis-only pass when
   all required evidence is already present.
5. **Model route comparison:** acting production model versus the smallest route that reliably
   passes the scheduling fixtures.

Prefer the least invasive variant that fixes both duplicate reads and one-read-per-round behavior.
Do not mask weak planning by silently dropping a model call unless the worker can prove exact
semantic equivalence and return the prior result with an explicit duplicate receipt.

### WP-4 — Add release gates and production canary

- Extend the Tasker 66 model-scenario grader with the five acceptance scenarios above and run
  multiple repetitions per model route.
- Add an opt-in production canary assertion for maximum logical reads and read rounds, alongside
  the existing grounding and no-collateral-mutation assertions.
- Compare baseline and candidate on schedule pass rate, redundant calls, provider passes, tokens,
  cost, first-batch critical path, and end-to-end latency.
- Canary the winning variant behind a prompt/config flag with immediate rollback.

**Exit:** production repetitions meet the thresholds below without reducing answer grounding,
write restraint, or mutation correctness.

## Success thresholds

For the known-three-document fixture, over at least five production repetitions:

- 100% grounded final answers;
- 100% turns with zero exact duplicate reads;
- direct-detail variant: at least 80% emit all three reads in the first evidence round, with median
  evidence rounds ≤ 1 and median evidence calls = 3;
- lean scan/read variant: at least 80% emit width three in each of the two dependency-ordered
  evidence rounds ≤ 2 and median evidence calls = 6;
- no increase in tool failures, projection reconciliation, or recovery attention;
- materially lower model passes, token cost, and end-to-end latency than the 2026-08-27 baseline.

For the mixed read/write fixture:

- all independent discovery reads share one provider round in at least 80% of repetitions;
- all commissioned mutations and only those mutations are applied;
- no cross-batch `after` references and no weakening of worker-owned conflict barriers.

If the acting model cannot meet these thresholds after a small rubric/result-contract change, record
that result and make model routing an explicit product/cost decision rather than growing an
unbounded prompt.

## Guardrails

- Never reuse a cached read across a mutation that invalidates its resource scope.
- Never suppress an intentionally different projection, pagination request, or freshness check as
  a duplicate.
- Keep graph validation fail-closed; this task must not relax the completed Tasker 66 dependency or
  conflict checks.
- Final-answer quality is necessary but insufficient: schedule correctness is a first-class test
  result.
- Do not optimize synthetic fixtures by embedding their entity names or exact call counts in the
  global prompt.

## Recommended order

1. **WP-0 baseline correction — document fixture complete:** current production is six unique reads
   in two width-three evidence rounds, zero controls, and zero duplicates. Remove the task-update
   control from this planner baseline because its extra passes are contract/reviewer policy, not
   discovery reads.
2. Decide whether the known-document fixture is testing direct full-body reads or the lean
   outline -> section contract; make the mounted surface and expected call budget match.
3. WP-1 telemetry with exact-read/resource identities and durable provider-round attribution.
4. WP-2 redacted transcript/result-contract trace.
5. Test-first acceptance fixtures.
6. WP-3 variants, one change at a time. Start with surface shaping if the product wants direct full
   documents; otherwise start with the small stop-and-batch rubric.
7. WP-4 production canary and prompt/model-route decision.
