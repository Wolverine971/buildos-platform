<!-- tasker/67-agentic-chat-redundant-read-round-planning.md -->

# 67 — Agentic Chat: eliminate redundant read rounds in model planning

**Created 2026-08-27.** Split from
[tasker 66](66-agentic-chat-tool-execution-graph.md) after the production concurrency canary proved
that worker scheduling is no longer the dominant constraint for multi-read turns.

## Kernel

The worker can now execute independent tool calls concurrently, but the acting model frequently
re-reads the same entities or spreads independent discovery across later provider rounds. Faster
batches do not help enough when the model creates unnecessary batches.

Teach and measure a tighter planning contract:

- identify the complete set of independent reads before emitting the first tool round;
- batch those reads in one provider response whenever their arguments are already known;
- treat successful tool results as authoritative turn memory;
- do not repeat a logical read unless a named missing fact or post-mutation invalidation requires it;
- move to synthesis as soon as the requested evidence is present.

This is a model-planning and tool-feedback problem. Tasker 66 continues to own graph compilation,
execution safety, conflict serialization, and concurrency rollout. Tasker 65 owns the broader
read-default and cost program.

## Production evidence that triggered this task

The 2026-08-27 three-document canary required three known, independent document reads. Three clean
production repetitions all grounded the final answer correctly, but every turn recorded eight
tool calls across three or four provider rounds:

- two turns emitted a width-three read batch, then emitted another width-three read batch later;
- one turn emitted widths four, one, and three across its read rounds;
- the first parallel batches took 1.544–2.120s versus 3.815–3.885s in the serial control, a 44–60%
  batch-level improvement;
- end-to-end turns still took 29.2–34.2s because extra model passes and redundant tool rounds
  dominated the saved adapter time.

The mixed task-update control exposed the other failure mode. The model performed three independent
discovery reads as three separate one-call provider rounds before proposing the three mutations
together. All three repetitions were correct, but the reads received no concurrency benefit because
the model never placed them in the same round.

The subsequent mutation-concurrency canary made the constraint even clearer. All three repetitions
correctly emitted the final three updates as one concurrent `[3]` layer, cutting that batch from
4.050–4.251s serial to 2.113–2.360s concurrent. But each turn first emitted **five separate
one-read rounds**, increasing total tool calls from six to eight and end-to-end time from the
serial control's 34.5–39.6s to 47.6–53.6s. Concurrency worked; unnecessary provider passes erased
the gain.

The blatant constraint is now **round construction quality**, not whether the worker can execute a
valid parallel batch.

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

Prompt supplies three exact entity IDs and requests a comparison.

- exactly three logical entity reads;
- all three appear in the first provider tool round;
- no duplicate logical read in later rounds;
- synthesis begins after the first result batch.

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

- Derive a privacy-safe logical read key from tool name plus canonical resource identity and stable
  projection arguments; do not log returned content.
- Add per-turn telemetry for `read_call_count`, `unique_logical_read_count`,
  `redundant_read_count`, `read_provider_round_count`, first complete-evidence round, and justified
  post-mutation rereads.
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
- 100% turns with zero redundant logical reads;
- at least 80% of turns emit all three reads in one provider round;
- median read tool rounds ≤ 1 and median logical read calls = 3;
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
- Keep graph validation fail-closed; this task must not relax Tasker 66 dependency or conflict
  checks.
- Final-answer quality is necessary but insufficient: schedule correctness is a first-class test
  result.
- Do not optimize synthetic fixtures by embedding their entity names or exact call counts in the
  global prompt.

## Recommended order

1. WP-1 telemetry and baseline classification.
2. WP-2 transcript/result-contract trace.
3. Test-first acceptance fixtures.
4. WP-3 variants, one change at a time.
5. WP-4 production canary and prompt/model-route decision.
