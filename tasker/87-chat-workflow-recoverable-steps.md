<!-- tasker/87-chat-workflow-recoverable-steps.md -->

# 87 — Make workflow steps recoverable with durable spending limits

**Created:** 2026-09-12  
**Status:** Pure runner can begin; 85's interface is frozen (2026-09-14). Step, dispatch, answer, resume, and recovery RPCs exist in QA. Note the frozen amendments: generation-scoped sequences with the resume RPC, and token-authorized settlement.  
**Depends on:** 83 role contract (done on 2026-09-14; [receipt](../docs/technical/reviews/CHAT_WORKFLOW_TASK83_BOUNDED_REVIEWS_2026-09-14.md)), 84 delivery boundary, 85 storage; 86 accepted before real integration.  
**Parallel with:** 86 admission/context and 88 UI on frozen interfaces.  
**Unblocks:** Live ordinary-chat review entry and final restart acceptance.

## Outcome

A worker restart after one specialist finishes reuses that accepted result and the
same prepared context. Only unfinished work may retry, within persisted attempts,
time and spending limits. Late workers cannot overwrite results. Streaming and
reconnect never produce a second answer. Recovery applies only to the explicitly
enforced read-only workflow; ordinary mutating turns keep their current policy.

Read [81](81-chat-workflow-implementation-program.md), 85's contract, 83's accepted
role/output limits ([Task 83 receipt](../docs/technical/reviews/CHAT_WORKFLOW_TASK83_BOUNDED_REVIEWS_2026-09-14.md),
section 3), and current recovery SQL. Current recovery only retries eligible
pre-start turns. Seven-minute stalled detection and the five-minute invocation
provider budget are different clocks; artifact expiry now uses `retain_until`.

## Build in three reviewable slices

Each slice is a runtime change set: focused validation and the coordinator's full
gate before stacking the next. New raw workflow activation stays off through slices
A/B until dispatch fencing and metering are integrated. One task owner preserves
continuity across these slices.

### A. Persistent runner with fakes

- Implement the fixed workflow runner using 85's store ports: accepted context,
  persisted plan/hash, stable step identities/dependencies, claim, execute, accept.
  Run independent ready specialists concurrently up to two and within shared capacity.
- Execute outside database transactions. Accept result + progress atomically under
  current processing token, execution generation, step attempt, plan hash and cancel
  state. Validate bounded reports and evidence; never use a model's self-verdict as
  authority to mark the request successful.
- Reload accepted state after uncertain responses; reuse completed results. Keep
  unfinished attempts distinguishable from accepted results. No recursive agents,
  dynamic task marketplace, mutation tools or unbounded replanning.

### B. Physical dispatch accounting and recovery

- At the actual provider dispatch boundary, reserve budget before each request,
  including planner, editor, corrective call, retry and fallback. A logical step
  reservation does not cover unmetered physical fallbacks. Settle usage idempotently;
  preserve uncertain charges when a crash/timeout loses the provider outcome.
- Use chat-owned storage through a cost adapter. Reuse existing calculation logic
  where appropriate; do not create fake `agent_runs` for foreign keys or bill twice
  through model-usage and cost-entry receipts. Record actual overruns and deny further
  spending; estimates do not guarantee the provider can never exceed the cap.
- Persist limits and the whole-run deadline once. Attempts, dispatch counts and
  spending do not reset on requeue. Preserve synthesis headroom and finalization
  time. Exhaustion produces a truthful partial result or failure, with a bounded
  model-free fallback if no synthesis dispatch can be admitted.
- Integrate 85's atomic recovery policy in `stalledRecovery.ts`/execution control.
  Requeue only eligible persisted read-only work with no domain effects. Use current
  authority, lifetime, artifact retention and durable counters; do not broadly relax
  ordinary retry guards. If a completed context has become inaccessible, fail access
  rather than using it or silently switching to fresh evidence.
- Release a parent provider lease before taking specialist slots. Respect existing
  process/shared admission limits with bounded abortable waits. No nested concurrency
  multiplication; saturation is not automatically a provider error.

### C. Stream reconciliation and real restart

- Preserve final-answer streaming through 84. Persist/identify accepted text and the
  final synthesis checkpoint so reconnect/terminal retry uses durable truth.
- Kill before synthesis, during streaming, after final text acceptance, and after a
  lost terminal response. Define a safe outcome for each cut: continue/reconcile
  accepted text or terminalize a partial answer; never append a newly regenerated
  answer to already visible text. Do not promise exactly-once provider execution.
- Stop fences future dispatch and result acceptance, aborts active requests, settles
  once and retains incurred/uncertain cost. A replaced worker's late results lose.
- With 86 integrated, activate the raw workflow only for the isolated internal cohort.
  Run a real process kill after one specialist result is accepted; restart and prove
  the completed specialist is not called again. Preserve original attempt identities,
  request/context hashes and the actual detection/requeue/finish times.

## Ownership

Own dedicated runner/store/cost adapters under
`apps/worker/src/workers/agentic-chat/workflow/`, inherited
`workflow/prototype-provider.ts` and `workflow/role-report.ts` (handed over when 83
closed on 2026-09-14), and narrow recovery/control changes.

Inherited from 83:

- Meter physical requests in the dispatch hook. The workflow's six-call limit
  counts application-level provider calls only. Client transport retries and
  route fallbacks inside a call are further physical requests.
- The OpenRouter client relabels a capped response as `length` only against its
  client-wide cap, not a smaller per-request `maxOutputTokens`. The workflow checks
  its own cap. Fix this at the dispatch boundary without changing ordinary-path
  fallback or timeout behavior.
- Reasoning is bounded only indirectly (effort `low` plus output caps). Add a direct
  reasoning bound only if measured truncation warrants it.
  The physical dispatch hook may touch `provider/openrouter-client.ts`/contracts;
  preserve its ordinary-path behavior, timeout and fallback tests. 85 remains SQL and
  shared-type owner. Coordinate composition/executor wiring with 81; 86 owns preparation.

Tasker 80 WP-3 owns ordinary/mutating-turn resumption. Share useful primitives without
enabling that broader recovery policy. No production rollout or fleet scheduler.

## Required proof and handoff

Use deterministic fakes for race/fault coverage before paid calls: duplicate claim,
concurrent completion, cancellation, stale generation, lost commit response,
dependency failure, no useful evidence, budget race, fallback charge, duplicate
settlement, unknown charges after restart, retry/deadline exhaustion, slow delivery,
and all synthesis cuts above. Test accepted outcomes, not implementation call order.

Run narrow workflow/executor/OpenRouter/recovery and SQL consumer fixtures via
`test-gate`; coordinator runs the full gate after each slice. The real restart test
must preserve one analyst/reviewer accepted result without rerunning it, show zero
domain writes, one final assistant result, retained uncertain exposure where injected,
and no changes to ordinary mutation recovery eligibility.

Return the runner transition map, dispatch/settlement ledger receipt, actual restart
timeline, source identity, focused/full gate evidence, and remaining limitations.
Task is accepted only after real kill/restart and streamed-output fault proof; an
in-memory fake recovery alone is insufficient. Hand UI-ready durable states to 88.
