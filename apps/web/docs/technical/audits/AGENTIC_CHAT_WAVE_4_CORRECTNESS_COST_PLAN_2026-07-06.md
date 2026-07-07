<!-- apps/web/docs/technical/audits/AGENTIC_CHAT_WAVE_4_CORRECTNESS_COST_PLAN_2026-07-06.md -->

# Agentic Chat Backend Wave 4 - Correctness Polish & Cost Plan

Date: 2026-07-06

Status: Draft 0.7 - planning started from the deep backend audit and spot-checked against the current working tree. Initial Wave 4 slices started: A1, A2, A3, A4, A5, A6, B1, and finalization-runner cleanup implemented locally with focused tests passing.

Source audit:

- `apps/web/docs/technical/audits/AGENTIC_CHAT_BACKEND_AUDIT_2026-07-01_DEEP.md`

## Purpose

Wave 4 should close the correctness and cost issues that remain after the Wave 1/2 data integrity and durability work, and after the Wave 3 security hardening. The theme is not "make the model smarter." It is to make the orchestrator, context loader, tool-result shaping, and prompt surface behave predictably under budget pressure.

The user-visible target:

- Read-only turns should not be mislabeled as failed mutations.
- Clarifying questions should not be overwritten by finalization fallbacks.
- Repetitive discovery loops should stop with useful evidence instead of burning the round budget.
- Skill and context payloads should arrive intact enough to be useful, while large fallback loads and prepared-prompt writes are bounded.
- The launch tool surface should get smaller without removing the lazy materialization path that lets writes still happen.

## Scope Guardrails

This plan assumes Wave 3 owns the security layer: prompt-injection write gating, materialization write policy, markdown image exfiltration, project access gates, bootstrap token hygiene, and rate limits.

Wave 4 can touch security-adjacent retention and logging when the primary reason is cost or data volume, but it should not redesign the write policy layer unless Wave 3 explicitly leaves that work behind.

D4b, the detached lambda lifecycle change, remains a Wave 2 tail item. Do not bury it inside Wave 4 unless there is an explicit go/no-go.

## Current-State Notes

The Wave 4 stub in the audit is stale in a few places. Spot checks in the current working tree show some items already have code-level mitigations:

| Finding | Current state       | Notes                                                                                                                                                                         |
| ------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| O2      | In progress         | Initial classifier fix is implemented and tested for read/status negatives plus assign/postpone/merge/tag/prioritize positives.                                               |
| O3      | In progress         | `supervisor_question` now bypasses finalization guard rewriting; tested with a prior successful read plus repeated missing-field writes and terminal finalization coverage.   |
| O4/O5   | In progress         | `skill_load` and `skill_reference_load` now carry the 20k skill budget through `addToolResultSecurityNotice`; large skill/reference payloads and output contracts are tested. |
| O9      | In progress         | Non-adjacent repeated tool fingerprints are now counted inside a bounded recent window for non-gateway/discovery loops; gateway evidence-read loops keep their ledger path.   |
| O10     | In progress         | `hasWriteAttempt` is now set only when a write reaches execution; validation-only writes no longer permanently suppress read-loop controls.                                   |
| O11     | In progress         | Near-budget force synthesis can now allow one exact write-only pass when prior discovery identified a concrete gateway write op.                                              |
| O12     | Partially addressed | Call-cap skips now synthesize tool results and no-tool synthesis suppression does not emit `onToolCall`; remaining discard paths need continued review as the loop changes.   |
| O13     | In progress         | Document organization recovery now breaks when `toolLimitNotice` fires in the validation-only branch; mid-recovery tool-call-limit behavior is covered.                       |
| O14     | Regression covered  | Same-round materialize-then-run now revalidates the just-materialized direct tool before execution.                                                                           |
| O15     | Regression covered  | Alias/op references now resolve to the materialized executable name before auto-exec.                                                                                         |
| O16     | Regression covered  | `onToolCall` callbacks in inspected paths are wrapped and covered.                                                                                                            |
| C3      | Open                | RPC and fallback context paths still diverge in project/global filters, project dates, focus constraints, and observability.                                                  |
| C4      | Open                | Fallback project loads still fetch unbounded task/goal/plan sets and only limit in JS. Focus entity uses `select('*')`.                                                       |
| C5      | Open                | Prepared prompt rows still store full `context_payload` and per-surface prompt material.                                                                                      |

## Implementation Progress

2026-07-06:

- A1 started: read/status wording such as "update me on the project" no longer trips explicit mutation repair, while assignment/postpone/merge/tag/prioritize commands are covered.
- A2 started: `supervisor_question` final text bypasses the finalization guard, preserving clarifying questions even after successful reads.
- A3 started: alternating repeated non-gateway read rounds now trip `tool_repetition_limit` before the full round cap, while gateway evidence-read saturation tests still use the context ledger/escalation path.
- A4 started: validation-only write calls mixed with reads no longer mark the turn as having reached write execution, so later read-only rounds still receive read-loop nudges/escalation.
- B1 started: `skill_load` and `skill_reference_load` payloads now carry the 20k skill budget through the untrusted-data wrapper instead of being re-capped at 6k.
- Verification: `pnpm exec vitest run src/lib/services/agentic-chat-v2/stream-orchestrator/repair-instructions.test.ts src/lib/services/agentic-chat-v2/stream-orchestrator.test.ts src/lib/services/agentic-chat-v2/stream-orchestrator/tool-payload-compaction.test.ts` passed with 94 tests, and `pnpm --filter @buildos/web check` passed.

2026-07-07:

- Phase 4 cleanup: finalization decisions were extracted into `finalization-runner.ts` with coverage for length continuation, no-tool synthesis retry/finalization, cancellation partial text, terminal finalization guard behavior, tool-limit separator streaming, duplicate-remainder avoidance, supervisor-question preservation, and truncated-answer finish reasons.
- B1 cleanup: short `skill_load` payloads now preserve `output_contract` content under a 4k field budget while retaining the 20k overall skill payload budget.
- A5 started: near-budget `force_synthesis` decisions now inspect discovered gateway write intent and, when a direct write tool can be materialized, run one write-only pass before final no-tool synthesis.
- A6 started: discard-path coverage now includes validation-only call handling, call-cap skipped results, read-batch call-cap skips, no-tool synthesis suppression, callback isolation, same-round materialized-tool validation, alias/op executable-name resolution, and document-organization recovery stopping when a tool limit fires mid-recovery.
- Verification: `pnpm exec vitest run src/lib/services/agentic-chat-v2/stream-orchestrator/finalization-runner.test.ts src/lib/services/agentic-chat-v2/stream-orchestrator.test.ts src/lib/services/agentic-chat-v2/stream-orchestrator/repair-instructions.test.ts src/lib/services/agentic-chat-v2/stream-orchestrator/tool-payload-compaction.test.ts` passed with 114 tests; `pnpm exec vitest run src/routes/api/agent/v2/stream/server.test.ts` passed with 17 tests; `pnpm --filter @buildos/web check` passed with 0 errors and 0 warnings.

## Track A - Orchestrator Correctness

### A1. Replace the explicit mutation heuristic with safer intent classification

Findings: O2

Primary files:

- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/repair-instructions.ts`
- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/repair-instructions.test.ts`
- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts`

Requirements:

- Exclude read/status phrases such as "update me on", "catch me up on", "what is the status of", and "where are we on".
- Add mutation verbs the audit called out: assign, unassign, postpone, defer, push, merge, split, label/tag, prioritize, deprioritize.
- Require a plausible command frame plus a mutable object or target state, not just a verb and an entity noun anywhere in the sentence.
- Keep the check conservative. False negatives are safer than false positives because actual write executions and `collectGatewayWriteIntentOps()` still provide stronger evidence later in the turn.

Regression cases:

- Read-only negatives: "update me on the project", "catch me up on this task", "what changed in the document", "is the meeting still on".
- Mutation positives: "assign this to me", "postpone the meeting to Friday", "merge these tasks", "rename the project", "mark the task done", "move the doc under Research".
- Finalization guard cases where a read-only synthesis mentions "updated" as historical context and must not become "I was unable to complete that change."

### A2. Preserve supervisor questions

Findings: O3

Primary files:

- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts`
- `apps/web/src/lib/services/agentic-chat-v2/turn-supervisor/finalization-guard.ts`
- `apps/web/src/lib/services/agentic-chat-v2/turn-supervisor/deterministic-supervisor.ts`

Requirements:

- Skip `applyFinalizationGuard()` when `finishedReason === 'supervisor_question'`.
- Alternatively pass an explicit `preserveClarifyingQuestion` flag to the guard and let it return `applied: false` for interrogative final candidates.
- Prefer changing the orchestrator boundary first; the guard should not have to infer all valid question phrasing.

Regression cases:

- Missing `project_id` question remains exactly the emitted question.
- Missing item id question remains exactly the emitted question.
- Tool failures that are not supervisor questions still get the normal honesty fallback.

### A3. Make repetition detection windowed, not only consecutive

Findings: O9

Primary files:

- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts`
- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/round-analysis.ts`
- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/round-analysis.test.ts`

Requirements:

- Replace `lastRoundFingerprint` + `repeatedRoundCount` with a bounded recent-fingerprint map.
- Count repeated fingerprints inside a sliding window, for example the last 6 tool rounds.
- Detect alternating loops such as A/B/A/B/A/B while not penalizing normal search -> detail -> write progression.
- Keep the existing stricter consecutive rule if useful, but it should no longer be the only detector.

Regression cases:

- `search_project(foo) -> list_onto_tasks -> search_project(foo) -> list_onto_tasks` trips repetition before the full 16-round budget.
- `search_project(foo) -> get_onto_task_details -> update_onto_task` does not trip.
- Repetition finalization preserves bounded read evidence instead of generic failure text.

### A4. Re-arm read-loop controls after validation-only write attempts

Findings: O10

Primary files:

- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts`
- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/round-analysis.ts`

Requirements:

- Track "executed write attempt" from actual `FastToolExecution` classification, not only emitted write-looking calls.
- A validation-failed write can count as write evidence for final honesty, but it should not permanently disable the context-gathering ledger and read-loop escalation if later rounds are read-only.
- Consider replacing the boolean with an object:
    - `executedWriteCount`
    - `failedWriteCount`
    - `validationOnlyWriteCount`
    - `lastWriteEvidenceRound`
- Re-enable read-loop escalation after N read-only rounds following a validation-only write.

Regression cases:

- Invalid `create_onto_document` call followed by repeated reads still gets read-loop nudges.
- Successful or failed executed writes still stop read-loop escalation.
- Final answers still disclose the failed validation when the user asked for a mutation.

### A5. Allow known write-intent carve-outs during near-budget synthesis

Findings: O11

Primary files:

- `apps/web/src/lib/services/agentic-chat-v2/turn-supervisor/deterministic-supervisor.ts`
- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts`
- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/repair-instructions.ts`

Requirements:

- When the supervisor forces synthesis near budget, inspect `collectGatewayWriteIntentOps(toolExecutions)` and explicit mutation intent.
- If the turn has a concrete write op and enough required arguments, allow only those identified write tools instead of setting `tools: undefined`.
- If required arguments are missing, prefer one clarifying question over a no-tool "tell me to go ahead" answer.
- Bound this carve-out tightly: one write round, exact identified tools only, then final synthesis.

Regression cases:

- Discovery identifies one `onto.task.update` with complete args near budget; the write can still execute.
- Discovery identifies a write but lacks the target id; the supervisor asks one question.
- Read-only near-budget turns still synthesize with no tools.

### A6. Audit all discarded `tool_call` paths

Findings: O12 plus verify-only coverage for O13/O14/O15/O16

Primary files:

- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts`
- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/tool-validation.test.ts`
- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/*.regression.test.ts`

Requirements:

- Enumerate every path after `pendingToolCalls` is populated that can break, cancel, suppress, or skip tool execution.
- For any path that already emitted `onToolCall`, emit a matching failed `onToolResult` and add a matching `role: 'tool'` message before any further LLM pass.
- Keep the current call-cap skipped-result behavior.
- Add regression coverage for the already-addressed O13/O14/O15/O16 cases so future refactors do not regress them.

Known verify-only assertions:

- Doc organization recovery stops when `toolLimitNotice` fires.
- Auto-exec revalidates just-materialized tools.
- Work-capability aliases resolve to `outcome_card_*` executable names.
- `onToolCall` exceptions do not crash orchestration.

## Track B - Skill Payload Budgeting

### B1. Remove skill payload double truncation

Findings: O4/O5

Primary files:

- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/tool-payload-compaction.ts`
- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/tool-payload-compaction.test.ts`

Requirements:

- Thread the intended payload budget through `addToolResultSecurityNotice()`.
- Apply truncation exactly once after the untrusted-data notice is added.
- Preserve 20k budget for `skill_load` and `skill_reference_load`.
- Preserve 6k budget for normal direct tool payloads.
- When truncation happens, report the true original length and the budget used.
- Avoid preview-of-preview output.

Regression cases:

- A 14k skill markdown body remains above 10k after notice wrapping.
- A 14k skill reference content body remains above 10k after notice wrapping.
- A non-skill tool payload still caps around 6k.
- Truncation metadata reflects the original pre-truncation payload, not a previous preview wrapper.

### B2. Add lightweight payload truncation telemetry

Reason:

The cost work needs to show whether payload compaction is helping and whether it is destroying useful skill/reference content.

Requirements:

- Add per-turn counters for model payload chars by category: direct tool, gateway meta, skill, context/read evidence.
- Add a truncation count and max original length.
- Use existing observability/event hooks where possible; avoid a new table unless Wave 5 has already introduced one.

## Track C - Context Correctness and Fetch Bounds

### C1. Make RPC and fallback context paths behaviorally equivalent

Findings: C3

Primary files:

- `apps/web/src/lib/services/agentic-chat-v2/context-loader.ts`
- `apps/web/src/lib/services/agentic-chat-v2/context-loader.test.ts`
- `apps/web/src/routes/api/agent/v2/stream/+server.ts`
- `apps/web/src/lib/services/agentic-chat-v2/turn-observability-writer.ts`

Requirements:

- Align paused/archived/deleted filters between RPC and fallback.
- Preserve project `start_at` and `end_at` in fallback global summaries.
- Constrain fallback focus entity fetches by `project_id`.
- Treat RPC-null for project-path context as a first-class observable event; do not silently hide it in payload-only metadata.
- Add queryable `context_load_source` or equivalent telemetry alongside `cache_source`.

Regression cases:

- Fallback global context includes project dates.
- Fallback focus entity cannot splice in a cross-project entity.
- RPC-null project load is visible in timing/turn metadata.

### C2. Push fallback limits into SQL and whitelist focus columns

Findings: C4

Primary files:

- `apps/web/src/lib/services/agentic-chat-v2/context-loader.ts`
- `apps/web/src/lib/services/agentic-chat-v2/context-loader.test.ts`

Requirements:

- Add SQL-level `.limit()` and stable ordering to fallback goals, milestones, plans, tasks, documents, and global portfolio fetches.
- Stop selecting every task description when the renderer will keep only 18 tasks; rank/order in SQL first, then map.
- Replace focus `select('*')` with explicit column lists per entity kind.
- For document focus, carry `content_length` plus a bounded preview, not the full body.
- Rewrite linked-edge loading to avoid interpolated `.or()` strings with raw client ids; validate UUIDs at the boundary or use safer query construction.
- Keep START HERE content bounded and avoid fetching 20 full document bodies just to choose one.

Regression cases:

- A mocked 2,000-task project produces bounded query calls and bounded prompt payload.
- Document focus payload does not include full `content` or arbitrary props.
- Non-UUID focus ids are rejected or ignored before linked-edge queries.

### C3. Reduce prepared-prompt write amplification

Findings: C5

Primary files:

- `apps/web/src/routes/api/agent/v2/prewarm/+server.ts`
- `apps/web/src/routes/api/agent/v2/prewarm/server.test.ts`
- `apps/web/src/lib/services/agentic-chat-v2/prepared-prompt-cache.ts`

Requirements:

- Do not store the same rendered prompt material twice per surface unless there is a measured need.
- Cap or strip `context_payload.focus_entity_full`, especially document bodies.
- Consider normalizing prepared surfaces to:
    - canonical context payload hash
    - per-surface prompt hash
    - one shared section store per prepared row
    - profile-specific metadata only where it differs
- Keep the prepared-prompt cache validation behavior intact; this is a storage-shape and size change, not a trust-boundary change.

Regression cases:

- Prepared prompt rows for project/ontology contexts stay under a defined size ceiling.
- Prepared prompt hit behavior still rejects stale tool/harness fingerprints.
- Stream consumption still rebuilds `fastchat_context_cache` from a valid prepared prompt.

### C4. Retention and cleanup jobs for high-volume prompt artifacts

Findings: S10/S12 in the Wave 4 stub

Primary files:

- `apps/web/supabase/migrations/*`
- existing cron/retention routes
- `apps/web/src/lib/services/agentic-chat-v2/prompt-observability.ts`

Requirements:

- Schedule `cleanup_expired_agentic_chat_prepared_prompts()`.
- Add bounded retention for prompt snapshots and large prompt dumps.
- Drop or gate duplicate `rendered_dump_text` if the structured prompt fields are sufficient.
- Keep admin-only debugging usable for recent incidents.

## Track D - Prompt Surface Cost and Route Decomposition

### D1. Trim the launch tool surface

Source:

- The deep audit identifies tool definitions as the largest prompt-size lever, especially `project_write` and Corsair/MCP-adjacent tools.

Primary files:

- `apps/web/src/lib/services/agentic-chat/tools/core/gateway-surface.ts`
- `apps/web/src/lib/services/agentic-chat-v2/tool-surface-size-report.ts`
- `apps/web/scripts/report-agentic-tool-surface-sizes.ts`

Requirements:

- Capture a before/after size report with `pnpm --filter @buildos/web report:agentic-tools`.
- Move rarely used write/document/Corsair tools behind discovery or result-driven materialization.
- Keep directly preloaded tools for the most common first-turn read and explicit write paths.
- Do not regress Wave 3 materialization policy. Tool-surface trimming must use the policy gate, not bypass it.

Success target:

- Reduce the largest launch profiles by at least 20 percent in serialized tool-definition chars, or document why a smaller reduction is safer.

### D2. Decompose the stream route after behavior is pinned

Primary file:

- `apps/web/src/routes/api/agent/v2/stream/+server.ts`

Requirements:

- Do this after Tracks A-C have regression coverage.
- Extract behavior-preserving modules first:
    - request/admission and turn lock
    - prepared prompt consumption
    - context loading and cache source resolution
    - observability/timing finalization
    - SSE event emission helpers
- Keep one thin route owner that wires dependencies together.
- Do not combine decomposition with behavior changes except import path rewiring.

Rationale:

The route remains the main collision point for Wave 2/3/4 changes. Decomposition is valuable, but doing it before the correctness fixes increases merge risk and makes regressions harder to isolate.

## Suggested Sequencing

1. **PR 0 - Verify drift and lock regressions.** Add tests for the items that appear already fixed: O13/O14/O15/O16 and current O12 call-cap behavior.
2. **PR 1 - Small correctness fixes.** A1 and A2 together: mutation intent classifier and supervisor-question preservation.
3. **PR 2 - Skill payload budget.** B1, with optional B2 telemetry if it is cheap.
4. **PR 3 - Orchestrator loop control.** A3, A4, A5, and the remaining A6 discard-path audit.
5. **PR 4 - Context parity and bounds.** C1 and C2, with queryable `context_load_source` included so before/after can be measured.
6. **PR 5 - Prepared prompt and retention cost.** C3 and C4.
7. **PR 6 - Tool-surface trim.** D1 after materialization policy from Wave 3 is stable.
8. **PR 7 - Route decomposition.** D2 only after the behavioral tests are green.

Parallelization:

- PR 2 can run independently from PR 1.
- PR 4 can start while PR 3 is underway, but avoid changing `stream/+server.ts` telemetry fields in both at once.
- PR 6 should wait for Wave 3's materialization policy and PR 4's observability.

## Verification Plan

Targeted unit/regression tests:

```bash
pnpm --filter @buildos/web test:run -- \
  src/lib/services/agentic-chat-v2/stream-orchestrator/repair-instructions.test.ts \
  src/lib/services/agentic-chat-v2/turn-supervisor/finalization-guard.test.ts \
  src/lib/services/agentic-chat-v2/stream-orchestrator/round-analysis.test.ts \
  src/lib/services/agentic-chat-v2/stream-orchestrator/tool-payload-compaction.test.ts \
  src/lib/services/agentic-chat-v2/context-loader.test.ts \
  src/routes/api/agent/v2/prewarm/server.test.ts \
  src/routes/api/agent/v2/stream/server.test.ts
```

Typecheck:

```bash
pnpm --filter @buildos/web check
```

Cost reports:

```bash
pnpm --filter @buildos/web report:agentic-tools
```

Manual/replay scenarios to add before closing Wave 4:

- "Update me on this project" should produce a status summary, not a mutation failure.
- Missing required field should persist the supervisor question exactly once.
- Alternating search/list loop should stop with useful read evidence before max rounds.
- Skill-heavy request should receive enough loaded skill text to follow the workflow and guardrails.
- Large project fallback context should stay bounded without loading all task descriptions or document bodies.
- Prepared prompt prewarm for a large project should produce row sizes below the agreed ceiling.

## Done Criteria

Wave 4 is done when:

- O2/O3/O4/O5/O9/O10/O11 and the remaining O12 discard paths have focused tests.
- Verify-only O13/O14/O15/O16 cases have regression tests or are explicitly marked no longer applicable.
- C3/C4 fallback behavior is bounded, source-observable, and tested.
- C5 prepared-prompt amplification is reduced or has a measured ceiling with retention.
- Tool-surface report shows a concrete reduction or a documented no-go.
- `pnpm --filter @buildos/web check` passes.
- The final plan notes what was deferred to Wave 5 observability or route decomposition.
