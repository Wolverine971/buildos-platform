<!-- docs/plans/AGENTIC_CHAT_GATE_REPAIR_PLAN_2026-09-10.md -->
<!-- doc-status: point-in-time -->

# Agentic Chat: corrected diagnosis and repair plan

**Reviewed:** September 10 EDT / September 11 UTC, 2026  
**Source:** `38bf64c996314b80d989d04139bd9fcd23d52dd1`, plus the working-tree gate files  
**Status:** Investigation and implementation plan; no runtime changes or new gate run

**Implementation follow-up:** See the [September 11 repair and verification record](../technical/reviews/AGENTIC_CHAT_GATE_REPAIR_PROGRESS_2026-09-11.md)
for changes made after this investigation, live results, and remaining acceptance work.

The simplification work has produced real gains. Keep the worker-only engine, read-by-default
behavior, safe calendar defaults, and review of exact mutation arguments. The next step is to
complete and validate that architecture at its boundaries.

**The rerun report misidentifies two important failure causes.** Its 38/52 score and failed strict
gate are valid records of what the harness reported. Its claim that task estimates were lost is
contradicted by retained database receipts. The project failures also begin with missing fixture
reference data, before the final allowlist error.

This plan supplements the [original rerun report](../technical/reviews/AGENTIC_CHAT_GATE_RERUN_RESULTS_AND_IMPLICATIONS_2026-09-10.md).
It does not retroactively rescore the run.

## 1. Where the improvement work stands

| Work                                       | Evidence in current source/history                                                                                                                  | Assessment                                                                                                                       |
| ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Read by default and streaming delivery     | Tracker 65; August 27–30 changes moved write review off ordinary reads and removed serial text-delivery waits                                       | Preserve. Rebuilding these mechanisms would repeat completed work.                                                               |
| One worker execution engine                | September 4: `35bbbd3c5` deleted the legacy web engine; `588943da9` consolidated names/validation; `439380dc5` consolidated execution/lease modes   | Preserve. Old tracker language about a second engine is historical, not the current architecture.                                |
| Harness cleanup and prompt/surface changes | September 8 audit; September 10 `9fb69953e` combines batch review, context/session cleanup, compaction, cancellation, routing and calendar defaults | Useful improvements landed together, making causal attribution difficult. Unit-suite success did not establish the live cutover. |
| Exact batch review                         | `9fb69953e`: actor proposes calls → reviewer approves digest → held calls execute                                                                   | Sound core property. Missing validation and continuation behavior make it incomplete for dependent workflows.                    |
| Session preparation/provenance             | `38bf64c99`: history preparation repair, surface changes, provenance support                                                                        | Cases 5/6 now pass 3/3. Preserve these improvements.                                                                             |
| Evaluation                                 | Three repetitions, no product retries, verified source/tree                                                                                         | Stronger than prior browser spot checks, but oracle and fixture defects contaminate diagnosis.                                   |

Eight cases passed behavior checks in every repetition. This is meaningful evidence for the tested
read/reason/document workflows, not a general reliability certification. Case 8 still misses timing.
The seven-day health report spans older releases and reports separate partial-disclosure,
sanitizer, cache and latency debt; it is not an acceptance test of the September 10 batch lane.

Do not start another broad deletion or model replacement while repairing this baseline.

## 2. Findings from the actual receipts

The [retained evidence extract](../../artifacts/agentic-chat-gate-reassessment-2026-09-10.json)
contains selected read-only queries from the isolated gate database, including tool arguments,
returned fields, errors, final responses and provider timing. No production database was queried or
changed. The seeded task rows have been cleaned up, so the duration evidence is the durable tool
execution receipts, not a fresh read of those original task rows.

### A. Duration loss is an oracle defect; one stale-text defect remains

The tool schema says estimates belong in `props.duration_minutes` and explicitly tells the model
to keep them out of descriptions. In contrast,
[`assertMinutesRecorded`](../../apps/web/src/lib/tests/agentic-e2e/scenarios/cedar-house/guards.ts)
only searches the title and description for a number.

- Case 2: **15/15 successful task-create receipts** carry the requested estimates:
  60, 90, 480, 60, 60 in each repetition.
- Case 4: **3/3 successful update receipts** carry `duration_minutes: 120`.
- Case 4 repetition 1 leaves “Allow 90 minutes” in the description. The final answer acknowledges
  the conflict and asks permission to fix it. That is a real incomplete semantic correction,
  not a failure to persist the structured estimate.
- The fixture stores duration in prose. Its seed path also leaves a legacy `props.description`
  copy with “90” in all three update receipts, even when the top-level description is corrected.

**Consequence:** Do not add a second duration field, parse arbitrary prose into persistence, or
change the database write contract based on this report. Fix the oracle, seed canonical estimates,
and retain a separate regression for correcting an explicitly superseded legacy prose estimate.
Prove preservation of unrelated props at key level; permitting the whole props object to change is
too permissive for a narrow-update test.

### B. Project creation has a three-step failure chain

In Case 1 repetitions 1 and 3:

1. The reviewer approves the batch successfully.
2. `create_onto_project` fails with
   `Facet validation failed ... scale=small: Unknown facet key ... stage=planning: Unknown facet key`.
3. Corrected project calls are rejected against the previous approval digest. The actor eventually
   emits a reviewer-only control and ends with `provider_tool_not_allowlisted`.

Read-only inspection found **zero rows** in both `onto_facet_definitions` and
`onto_facet_values`. The schema-only branch bootstrap omitted required reference data.
The repository migration contains the three definitions and their 20 values.

Repetition 1 also spends two reviews confusing “synthetic/fictional renovation test data” with
unsupported fiction-book project types. The adapter restriction is specifically
`project.creative.(novel|book|fiction|screenplay)`; its tool description is broader and ambiguous.

**Consequence:** Seed reference data and check it before model calls. Fix post-failure batch
transitions and make the fiction restriction precise. Do not grant the actor permission to call
reviewer controls: the original review decisions executed normally, and the final allowlist refusal
is downstream of the real faults.

### C. The five-task failure is dependent-write completion

Every Case 2 repetition creates five tasks with correct structured durations, but none completes
the three requested dependencies.

- Repetitions 1 and 3 execute no link calls and report that linking is unavailable.
- Repetition 2 attempts all three links with `src_label`/`dst_label`; the adapter rejects those
  unsupported arguments. It requires `src_id`/`dst_id`.
- Every repetition spends two rejected proposals and a third reviewer decision.
- The reviewer repeatedly asks for links using IDs that do not exist until the held creates run.
- The final response for repetition 2 correctly describes the three failed links but appends
  **“Done: 0 of 1 link”**. The terminal summary still loses cardinality.

This follows directly from the current provider loop:

- `takeWithheldMutationBatch` accepts proposals only before mutation, not after a previous batch
  reaches the `mutating` phase.
- `approvedMutationBatch` remains the comparison target for later proposals.
- `directSimpleMutationCompleted` uses “no turn contract” to recognize a direct write.
  Reviewed batches also have no turn contract, so successful reviewed work is forced toward
  tool-free synthesis.
- `call_ref`/`after` describe execution ordering; they do not substitute returned IDs into
  later arguments.
- The reviewer sees schemas only for the proposed tools. A creates-only proposal does not tell
  it that the admitted surface can also link entities.

See [turn-provider.ts](../../apps/worker/src/workers/agentic-chat/provider/turn-provider.ts),
[turn-phase.ts](../../apps/worker/src/workers/agentic-chat/provider/turn-phase.ts), and
[review/mutation-batch.ts](../../apps/worker/src/workers/agentic-chat/provider/review/mutation-batch.ts).

**Consequence:** Preserve exact-argument approval, but support successive reviewed batches.
Create tasks, obtain durable IDs, then propose/review the dependency calls. Approval of one
executable stage must not imply completion of the entire user request.

### D. The batch path bypasses normal proposal validation

`streamActingPass` withholds batches before `validateCompletedProviderCalls`.
`streamApprovedBatchExecution` emits the held calls without that validation. Adapter validation
still protects execution, but invalid calls can consume reviewer passes and arrive at adapters
after other calls in the batch have already succeeded.

The unsupported label links in Case 2 are a concrete example.

**Consequence:** Run deterministic argument/scope validation before review and hashing. Keep adapter
validation as the final execution boundary. Review approval should establish semantic authorization,
not substitute for tool-schema validation. Normalize only documented aliases/defaults before approval;
never silently rewrite approved values afterward.

### E. Latency comes from both repair passes and the selected provider route

| Turn                 | Wall time | Logged model passes | Actor time | Reviewer time |
| -------------------- | --------: | ------------------: | ---------: | ------------: |
| Case 2, repetition 1 |     59.7s |                   7 |      25.5s |         15.9s |
| Case 2, repetition 2 |     65.3s |                   7 |      24.5s |         14.8s |
| Case 2, repetition 3 |    181.9s |                   8 |     146.7s |         15.3s |
| Case 4, repetition 1 |    122.0s |                   6 |      99.6s |          6.9s |

The 181.9s turn includes an **83.7s DeepInfra opening pass**. The narrow update includes two
DeepInfra acting passes of **41.6s and 42.6s**. These are logged provider response durations, not
a claim that every remaining millisecond is harness overhead.

The run actually requested **DeepSeek V4.1 Flash**. The provider preference comment in
`config.ts` cites measurements for **V4 Flash**, and puts DeepInfra first. V4.1 was added as an
explicitly selectable model in `9fb69953e`; it was not made the automatic default there.
The run also switches between DeepInfra, GMICloud and Novita and returns both alias and dated model
IDs. This warrants a model-specific route experiment, not a conclusion that all routing or pinning
is broken.

**Consequence:** Remove futile repair passes first, then compare provider/model settings on a fixed
tree and fixture. Preserve requested model, resolved model, provider, fallback reason and pass role
in the gate artifact. Do not assume a cheaper reviewer will fix the dominant tail.

### F. Owner reporting over-expands evidence

The successful owner reports use ten evidence calls, with zero exact duplicate tool/argument pairs
in the inspected traces. The excess is overlapping projections:

- outline followed by full document details;
- outline → section → full details for the same short document;
- overview plus project details, and task lists plus task details;
- several discovery tools checking adjacent questions.

Use Tracker 67's existing distinction between exact duplicates and additional projections.
Caching identical reads alone will not solve this. First inspect whether compaction preserves the
facts already returned and whether each expansion fills a specific missing fact. Preserve honest
unknowns while reducing calls.

## 3. Implementation sequence

### Package 1 — Make the gate trustworthy and reproducible

**Files:** Cedar House `guards.ts`, `fixture.ts`, Cases 2/4 and their focused tests;
`scripts/agentic/gate.ts`; gate documentation; evidence capture.

- Assert numeric `props.duration_minutes` exactly. Make missing/wrong values fail even if the
  expected number appears incidentally in a title or description.
- Seed canonical duration props; keep a separate legacy-prose correction scenario. For Case 4,
  check the exact due date and estimate, unchanged identity/priority/state/prerequisite, unchanged
  unrelated props, and the actual content of its prepared readback.
- Check dependency relation **type and direction**, not any edge between the two IDs. Retain the
  current prompt's documented prose fallback where applicable; the repaired supported linking
  path should demonstrate all three real directed edges.
- Seed versioned, non-user reference data from repository definitions. Preflight facet
  definitions/values and a valid-facet RPC check, required schema/RPCs and private Realtime access.
  A schema-only export is insufficient.
- Finish the isolated calendar connection and credential setup before a full release gate.
  Fail early with a setup result when unavailable; never silently omit Case 10.
- Capture per-turn tool receipts, before/after snapshots, model routing/timing and judge input/output
  before fixture cleanup, including failures. Current gate configuration disables Phase 0 capture,
  leaving investigation dependent on the isolated database.
- Separate judge infrastructure failure from product behavior. Permit a bounded judge-only regrade
  of the retained response; preserve the first timeout and never retry the product turn to improve
  its score.
- Include the currently untracked gate runner/support files and setup docs in the eventual reviewed
  change. The committed workflow points at machinery that is not yet all in Git.

**Proof:** Focused oracle tests reject wrong structured durations and wrong/reversed relationships;
fresh isolated bootstrap has required reference rows; retained evidence survives cleanup.
Run `pnpm agentic:gate` and retain the new baseline before runtime work.

### Package 2 — Complete the reviewed-batch lifecycle

**Files:** Worker `provider/turn-provider.ts`, `turn-phase.ts`, `validation.ts`,
review request/control builders, relevant execution receipts and finalization code.

- Validate the proposed calls before semantic review.
- Distinguish direct-write completion from reviewed-batch completion explicitly.
- Treat a reviewed batch as one executable stage. After successful creates, retain their IDs and
  permit a new proposal of already commissioned dependent work. The reviewer checks that stage
  against the original request and prior receipts; each new stage gets its own digest.
- Let a **proven non-applied** failed proposal be corrected and reviewed with a fresh digest.
  Preserve successful receipts. Uncertain or partially applied effects require reconciliation or
  honest partial completion, not a blind retry of the entire batch.
- Ensure the reviewer knows the relevant admitted capabilities and the difference between work
  that can execute now and work that needs returned IDs.
- Keep reviewer-only controls off the actor surface. Carry decisions as bounded feedback and
  retain one bounded mimicry repair, followed by a receipt-grounded terminal if it fails.
- Render completion against actual effect identities and user-visible remaining work. “Five tasks
  created; zero of three dependencies saved” must remain exact. The new runtime
  `mutationBatchFulfilment` helper currently matches successes only by tool name and is not wired
  into production callers; do not adopt it unchanged for multiple batches.
- Clarify the project tool's fiction-type restriction without excluding ordinary synthetic QA data.

**Smallest useful path:** two reviewed stages for create-then-link. Do not introduce another
actor-authored symbolic contract language or add magical label substitution to ordinary tool args.

**Proof:** Use real advertised schemas plus deterministic provider fixtures to cover approval,
rejection/revision, malformed arguments, known non-applied failure, partial/uncertain failure,
creates followed by UUID links, and attempted actor reviewer-control calls. Assert both the
executed arguments and the durable result. Then the formal gate: Case 1 3/3, five tasks plus three
dependencies 3/3, zero duplicate effects, truthful partial counts, and all existing safety cases.

### Package 3 — Close the remaining narrow-update semantics

The structured write already works. Repair only the reproduced legacy-text behavior:
an instruction to replace 90 with 120 minutes authorizes correcting that specific estimate while
preserving the prerequisite and unrelated text. Do not ask the user to authorize the same correction
again. Determine which legacy `props.description` consumers still read it before changing or
removing that field; avoid a broad data migration.

**Proof:** canonical fixture and legacy-prose variant both pass, unrelated fields remain unchanged,
the prepared readback says 120, and no calendar event is produced. Run the formal gate.

### Package 4 — Reduce latency and read expansion with fixed comparisons

- On the corrected lifecycle, measure passes and provider time separately from tool execution,
  database work and delivery. Reuse existing telemetry rather than adding a second metrics system.
- For Case 14, prefer one sufficient document read over outline/section/full-body expansion;
  preserve budget, permit evidence and unknowns. Target at most eight calls and under 40 seconds.
- Evaluate V4.1 provider preferences against the exact model in use. Compare a controlled route
  candidate and, if useful, the previous actor model with the same reviewer and fixtures. Keep
  fallback availability and per-turn cache behavior measurable.
- Keep the strict timing thresholds: Case 2 under 60s; Cases 4/8 under 30s; Case 14 under 40s.
  Do not raise them to declare the repair successful.

**Proof:** paired results with complete routing/pass receipts, then the three-repetition gate.
If the tail remains, identify whether the missed budget is provider generation, extra reasoning,
tool overhead or delivery before the next change.

## 4. Working rules and release decision

Run the narrowest tests for changed files, serially under the repository's resource limits.
After each package/change set, run `pnpm agentic:gate` before stacking another change, preserve the
scorecard and name any remaining failures. A diagnosis run with fewer repetitions is not acceptance.
Calendar/setup or judge failure cannot be labeled product success.

Keep `CHAT_MUTATION_BATCH_LANE=false` available as rollback while this work proceeds. Do not switch
the user's live deployment as part of planning. Do not delete the contract fallback until the full
52/52 provenance-verified gate, strict timing/call limits and a deployed-build verification are
retained. Removing the fallback is a separate final change, not a cleanup bundled with the repair.

Keep the seven-day health debts visible in Tracker 80, but defer unrelated resumability expansion,
general sanitizer cleanup, cheaper-reviewer rollout and further context-stack deletion. They should
not obscure the smaller set of defects this run actually demonstrates.

**Recommended first implementation:** Package 1. It prevents another expensive rerun from blaming
working duration persistence and exposes the dependency failure that the current first assertion
hides. Then finish the batch lifecycle using those corrected tests.
