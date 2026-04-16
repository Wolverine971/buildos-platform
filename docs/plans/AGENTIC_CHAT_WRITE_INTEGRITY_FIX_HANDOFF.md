<!-- docs/plans/AGENTIC_CHAT_WRITE_INTEGRITY_FIX_HANDOFF.md -->

# Agentic Chat Write Integrity Fix Handoff

Status: Ready for architecture review and implementation
Date: 2026-04-16
Owner: BuildOS Agentic Chat

## Purpose

Give another agent enough context to verify and fix the highest-priority
agentic chat reliability issues found in the fantasy-novel replay audits.

The main requirement is architectural: do not solve these failures with prompt
text alone. The runtime and tool layer should make bad writes hard or
impossible, then final responses should be grounded in the actual write results.

## Source Of Truth

Primary audit:

- [Agentic Chat Fastchat vs Lite Flow Audit](../reports/agentic-chat-fastchat-vs-lite-fantasy-novel-flow-audit-2026-04-15.md)

Session audits:

- [Full fastchat run, 09e3ca0b](../../chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-09e3ca0b-8163-47-2026-04-15.md)
- [Full lite run, 5e74e634](../../chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-5e74e634-0992-49-2026-04-15.md)
- [Lite rerun, 74a4f0ef](../../chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-74a4f0ef-9607-4e-2026-04-16.md)
- [Lite confirmation-flow run, ac79da05](../../chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-ac79da05-7120-4b-2026-04-16.md)
- [One-turn fastchat repair pilot, 3f288e0f](../../chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-3f288e0f-a385-43-2026-04-15.md)

Related plans and reports:

- [Agentic Chat Lightweight Harness Plan](./AGENTIC_CHAT_LIGHTWEIGHT_HARNESS_PLAN.md)
- [Agentic Chat Lightweight Harness Continuation Handoff](./AGENTIC_CHAT_LIGHTWEIGHT_HARNESS_CONTINUATION_HANDOFF.md)
- [Agentic Chat Tool Surface Optimization Handoff](./AGENTIC_CHAT_TOOL_SURFACE_OPTIMIZATION_HANDOFF.md)
- [Agentic Chat Initial Seed Context Gap Analysis](../reports/agentic-chat-initial-seed-context-gap-analysis-2026-04-14.md)
- [Agentic Chat Context Packet Gap Analysis](../reports/agentic-chat-context-packet-gap-analysis-2026-04-14.md)
- [Agentic Chat Prompt Dump Assessment](../reports/agentic-chat-prompt-dump-assessment-2026-04-09.md)

## Code Map

Start by reading these files and following the call chain. The audit names
likely failure points, but the implementing agent should verify the current code
before editing.

Runtime and stream path:

- [Stream endpoint](../../apps/web/src/routes/api/agent/v2/stream/+server.ts)
- [Stream endpoint tests](../../apps/web/src/routes/api/agent/v2/stream/server.test.ts)
- [Stream orchestrator](../../apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts)
- [Stream orchestrator README](../../apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/README.md)
- [Round analysis](../../apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/round-analysis.ts)
- [Tool validation](../../apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/tool-validation.ts)
- [Tool arguments](../../apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/tool-arguments.ts)
- [Tool payload compaction](../../apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/tool-payload-compaction.ts)
- [Assistant text sanitization](../../apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/assistant-text-sanitization.ts)
- [Repair instructions](../../apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/repair-instructions.ts)

Tool execution and ontology writes:

- [Tool execution service](../../apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts)
- [Tool execution service tests](../../apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.test.ts)
- [Ontology write definitions](../../apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-write.ts)
- [Ontology write executor](../../apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-write-executor.ts)
- [Update strategy tests](../../apps/web/src/lib/services/agentic-chat/tools/core/update-strategies.test.ts)
- [Shared update value validation](../../apps/web/src/lib/services/agentic-chat/shared/update-value-validation.ts)
- [Tool argument enrichment](../../apps/web/src/lib/services/agentic-chat/shared/tool-arg-enrichment.ts)

Prompt and tool-surface behavior:

- [Lite prompt builder](../../apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts)
- [Lite prompt tests](../../apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.test.ts)
- [Fastchat master prompt builder](../../apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts)
- [Fastchat master prompt tests](../../apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.test.ts)
- [Prompt variant routing](../../apps/web/src/lib/services/agentic-chat-v2/prompt-variant.ts)
- [Tool selector](../../apps/web/src/lib/services/agentic-chat-v2/tool-selector.ts)
- [Gateway surface profiles](../../apps/web/src/lib/services/agentic-chat/tools/core/gateway-surface.ts)
- [Tool surface size report](../../apps/web/src/lib/services/agentic-chat-v2/tool-surface-size-report.ts)
- [Prompt observability](../../apps/web/src/lib/services/agentic-chat-v2/prompt-observability.ts)
- [Prompt eval scenarios](../../apps/web/src/lib/services/agentic-chat-v2/prompt-eval-scenarios.ts)
- [Prompt eval runner](../../apps/web/src/lib/services/agentic-chat-v2/prompt-eval-runner.ts)
- [Prompt replay runner](../../apps/web/src/lib/services/agentic-chat-v2/prompt-replay-runner.ts)

Document and task workflow guidance:

- [Document workspace skill](../../apps/web/src/lib/services/agentic-chat/tools/skills/definitions/document_workspace/SKILL.md)
- [Task management skill](../../apps/web/src/lib/services/agentic-chat/tools/skills/definitions/task_management/SKILL.md)
- [Project creation skill](../../apps/web/src/lib/services/agentic-chat/tools/skills/definitions/project_creation/SKILL.md)

## Issues To Verify

The next agent should verify each issue from the source audits before coding.
Use the audit report as a guide, not as a substitute for inspecting the traces
and code.

Suggested searches:

```bash
rg -n "<parameter name=|</parameter>|update_strategy" \
  chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-*.md

rg -n "fastchat_tool_trace_summary|Tool trace|No update fields provided|document.default" \
  chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-*.md

rg -n "update_onto_document|update_onto_task|No update fields provided|props" \
  apps/web/src/lib/services/agentic-chat apps/web/src/lib/services/agentic-chat-v2
```

Verify these findings:

1. Successful writes can persist internal tool markup.
2. `update_onto_document` append/merge can be attempted without meaningful
   content.
3. Failed writes can be omitted from final assistant responses.
4. Final responses can claim task progress, document type, document linking, or
   tree placement that the tool results do not confirm.
5. Compact trace summaries omit important writes and can label schema/discovery
   operations in ways that resemble real writes.
6. Project follow-up turns overuse discovery because common write tools are not
   preloaded in the basic project surface.
7. Document type keys requested by the model may normalize to
   `document.default`; final responses should not claim the requested type if
   the result differs.

## Priority Backlog

### P0. Reject Internal Tool Markup Before Persistence

Observed in:

- [Full fastchat run](../../chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-09e3ca0b-8163-47-2026-04-15.md)
- [Lite rerun, 74a4f0ef](../../chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-74a4f0ef-9607-4e-2026-04-16.md)
- [Lite confirmation-flow run, ac79da05](../../chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-ac79da05-7120-4b-2026-04-16.md)

Requirement:

- Durable user-visible strings must not persist internal tool syntax such as
  `<parameter name=`, `</parameter>`, `<tool_call`, or malformed tool-call tail
  fragments.
- Apply the guard to task titles/descriptions, document content/body markdown,
  project descriptions, goal descriptions, and other ontology write string
  fields.
- A rejected markup write should be treated as a failed write for retry and
  final-response disclosure.

Architecture note:

- Prefer a shared durable-text validation helper called from ontology write
  validation/execution. Do not bury this only in prompt instructions or final
  assistant text sanitization.

### P0. Fix Document Update Semantic Validation

Observed in:

- [Full lite run, 5e74e634](../../chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-5e74e634-0992-49-2026-04-15.md)

Requirement:

- `update_onto_document` with `update_strategy: "append"` or
  `update_strategy: "merge_llm"` must require non-empty content.
- `merge_instructions` alone is not content.
- Empty objects and arrays, especially `props: {}`, must not count as meaningful
  update fields.
- Reject no-op updates before the API call and return a model-facing validation
  error.

Likely files:

- [Tool execution service](../../apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts)
- [Shared update value validation](../../apps/web/src/lib/services/agentic-chat/shared/update-value-validation.ts)
- [Ontology write executor](../../apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-write-executor.ts)
- [Ontology write definitions](../../apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-write.ts)

### P0. Enforce Failed-Write Disclosure

Observed in:

- [Full lite run, 5e74e634](../../chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-5e74e634-0992-49-2026-04-15.md)

Requirement:

- If a write fails and no successful retry repairs it, the final assistant
  response must disclose the failed persistence attempt.
- This should be runtime-backed. Prompt rules are useful, but not sufficient.

Likely files:

- [Stream orchestrator](../../apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts)
- [Round analysis](../../apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/round-analysis.ts)
- [Repair instructions](../../apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/repair-instructions.ts)
- [Lite prompt builder](../../apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts)
- [Fastchat master prompt builder](../../apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts)

### P0. Validate Final Answer Claims Against Actual Writes

Observed in:

- [Lite rerun, 74a4f0ef](../../chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-74a4f0ef-9607-4e-2026-04-16.md)
- [Lite confirmation-flow run, ac79da05](../../chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-ac79da05-7120-4b-2026-04-16.md)

Requirement:

- Do not claim task progress unless an actual task update succeeded.
- Do not claim a document type unless the create result confirms that type.
- Do not claim a document was linked, cross-linked, or placed unless a link or
  tree operation succeeded.
- Do not omit material successful writes from the user-facing summary.

Architecture note:

- Consider building a write-outcome ledger per turn. The final response phase can
  use that ledger to inject constraints or perform a deterministic post-check.

### P1. Improve Tool Trace Summaries

Observed across the full runs.

Requirement:

- Trace summaries should include every write and every failure.
- Schema lookups and discovery calls should be labeled as such, not as completed
  mutations.
- Do not truncate away later writes.

Likely files:

- [Stream endpoint](../../apps/web/src/routes/api/agent/v2/stream/+server.ts)
- [Prompt observability](../../apps/web/src/lib/services/agentic-chat-v2/prompt-observability.ts)
- [Prompt dump debug](../../apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/prompt-dump-debug.ts)

### P1. Add A Project Follow-Up Write Surface

Observed across the full runs.

Requirement:

- Common project follow-up turns should not require several discovery calls
  before task/document writes.
- Use deterministic routing first. Avoid adding an LLM semantic router in this
  slice unless the existing architecture already requires it.

Candidate surface:

```text
project_write:
  project_basic
  create_onto_task
  update_onto_task
  create_onto_document
  update_onto_document

project_document_write_light:
  project_basic
  list_onto_documents
  get_onto_document_details
  create_onto_document
  update_onto_document
  get_document_tree
  move_document_in_tree
```

Cross-link:

- [Tool Surface Optimization Handoff](./AGENTIC_CHAT_TOOL_SURFACE_OPTIMIZATION_HANDOFF.md)
- [Gateway surface profiles](../../apps/web/src/lib/services/agentic-chat/tools/core/gateway-surface.ts)
- [Tool selector](../../apps/web/src/lib/services/agentic-chat-v2/tool-selector.ts)

### P2. Define Document Placement And Type Rules

Requirement:

- Short progress snippets can append to a context/progress document.
- Substantial named research notes should create a dedicated document.
- Created research documents should be placed in the document tree when the
  product rule says they belong under a context doc or research area.
- If the backend normalizes a requested `type_key` to `document.default`, final
  responses should report the actual result, not the requested type.

Likely files:

- [Document workspace skill](../../apps/web/src/lib/services/agentic-chat/tools/skills/definitions/document_workspace/SKILL.md)
- [Ontology write definitions](../../apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-write.ts)
- [Ontology write executor](../../apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-write-executor.ts)

### P2. Reduce Heavy Skill Loads

Requirement:

- Default to compact skill guidance for routine task/document follow-ups.
- Use full examples only for risky or unfamiliar workflows.

Cross-link:

- [Lightweight Harness Plan](./AGENTIC_CHAT_LIGHTWEIGHT_HARNESS_PLAN.md)
- [Tool Surface Optimization Handoff](./AGENTIC_CHAT_TOOL_SURFACE_OPTIMIZATION_HANDOFF.md)
- [Task management skill](../../apps/web/src/lib/services/agentic-chat/tools/skills/definitions/task_management/SKILL.md)

## Recommended Architecture

Use layered enforcement:

1. Prompt guidance: steer the model toward correct behavior and accurate final
   summaries.
2. Pre-execution validation: catch invalid or dangerous tool arguments before
   the executor/API call.
3. Domain write validation: enforce ontology-specific semantics close to the
   write executor, including durable-text hygiene and document append/merge
   content requirements.
4. Write outcome ledger: record actual writes, failures, warnings, normalized
   fields, and rejected payloads for the current turn.
5. Final-answer integrity: constrain or check final user-facing text against the
   write outcome ledger.
6. Observability: persist trace summaries that include all writes and failures.

This should prevent the two worst classes of failure:

- bad payloads that fail silently or get omitted from the final response;
- bad payloads that succeed and pollute durable project data.

## Implementation Plan

### Phase 0. Baseline Verification

Before editing:

- Read the primary audit and the four full session audits.
- Reproduce the exact evidence with `rg` searches.
- Trace the current write path from stream orchestrator to tool execution to
  ontology write executor.
- Identify where validation currently happens and where write results are
  summarized.

Deliverable:

- Short implementation note in the PR or handoff comment explaining where each
  class of validation currently lives.

### Phase 1. Durable Text Hygiene Guard

Implement a shared guard for durable user-visible strings.

Suggested shape:

- Add a helper near shared validation code, likely under
  [agentic-chat/shared](../../apps/web/src/lib/services/agentic-chat/shared).
- Detect obvious internal tool-call artifacts.
- Return structured validation details: field path, matched pattern, severity,
  and safe model-facing error.
- Call it from ontology write validation/execution for task, document, project,
  goal, and other durable text fields.

Tests:

- `update_onto_task` rejects description with `<parameter name=`.
- `update_onto_document` rejects content/body markdown with `<parameter name=`.
- Create/update project and goal string fields reject the same pattern if those
  writes are supported in the same executor path.
- Clean markdown with normal angle brackets remains allowed where reasonable.

### Phase 2. Document Update Semantic Guard

Make document update validation semantic, not only syntactic.

Rules:

- Append/merge requires non-empty content/body text.
- `merge_instructions` does not count as content.
- Empty objects and arrays are no-ops.
- A payload with only `document_id`, `update_strategy`, `merge_instructions`, and
  empty `props` should fail before API execution.

Tests:

- The bad lite payload from the audit is rejected before executor/API write.
- Valid append with content succeeds.
- Non-content metadata updates still work if the schema supports them.

### Phase 3. Write Outcome Ledger And Final-Response Integrity

Add or reuse a per-turn structure that records:

- write tool name/canonical op;
- target entity ID and title when available;
- requested fields;
- actual result fields after backend normalization;
- success/failure;
- validation rejection details;
- warnings such as requested document type differing from actual type.

Use this ledger to:

- disclose unrepaired failed writes;
- prevent unsupported claims in final answers;
- mention material successful writes.

Implementation options:

- Prefer a deterministic injected final-answer constraint summary before the
  last model pass.
- If there is already a repair/finalization mechanism in the orchestrator, plug
  into that rather than building a parallel path.

Tests:

- Failed document append produces final text that says the document was not
  updated.
- A task-progress claim is blocked or corrected when no task update happened.
- A document type claim uses the actual persisted type.
- "Linked" is not used unless a link/tree operation succeeded.

### Phase 4. Trace Summary Rewrite

Trace summaries should be useful for audits without reading full timelines.

Suggested format:

```text
Tool trace: 12 calls, 5 writes, 1 failure.
Writes: update_task ok x1; create_task ok x2; create_document ok x1; update_document failed x1.
Reads/discovery: skill_load ok x1; list_tasks ok x1; list_documents ok x1; tool_search ok x4.
Failures: update_document append rejected: missing content.
```

Tests:

- Schema lookups are reported as schema/discovery, not as write operations.
- Later writes are not omitted.
- Failures always appear.

### Phase 5. Project Write Surface Routing

After write integrity is protected, reduce discovery overhead.

Implement deterministic routing for common project mutation turns:

- progress/update/finished/done;
- add/create task;
- save/capture notes;
- research notes/document/outline/spec.

Keep this scoped:

- Do not preload the full document surface for every project turn.
- Keep `tool_search` and `tool_schema` as fallback.
- Measure provider tool definition size after adding any direct tools.

Tests:

- Tool selector exposes expected direct tools for mutation-like project turns.
- Provider payload size stays within an accepted bound.
- Existing read-only project turns do not gain excessive write tools.

### Phase 6. Document Placement And Type Rules

Update prompt/skill/tool guidance after runtime protections are in place.

Rules to encode:

- append short progress snippets to an existing context/progress doc;
- create a dedicated doc for substantial named research notes;
- place dedicated research docs in the document tree when appropriate;
- never claim a requested document type if the result normalizes it.

Tests:

- Research-note replay chooses either the product-approved dedicated doc path or
  an explicitly accepted append path.
- If a dedicated doc is created and placement is required, a tree operation is
  expected.

### Phase 7. Formal Replay/Eval Coverage

Add this fantasy-novel flow to prompt/replay regression coverage.

Assertions:

- Initial project has exactly one primary goal.
- The seven user bullets become seven tasks.
- Goal-task relationships exist.
- Chapter 2 progress updates the existing outline task.
- Revision and Chapter 3 tasks are created.
- Invalid document append is rejected before API execution.
- Failed writes are disclosed.
- Durable text fields reject internal tool-call artifacts.
- Final answers do not claim task progress, document type, tree placement, or
  links unless successful tool results support those claims.
- Research notes follow the selected product rule for document creation vs append.
- Token/tool-call/cost metrics are recorded by prompt variant.

## Acceptance Criteria

- No ontology write can persist obvious internal tool-call markup in durable
  user-visible text.
- `update_onto_document` append/merge cannot execute without meaningful content.
- Empty `props: {}` no longer counts as a meaningful update.
- Failed writes are disclosed unless a retry succeeds.
- Final responses are grounded in the actual write outcome ledger.
- Trace summaries include all writes and all failures.
- Project follow-up turns need at most one discovery pass for common task and
  document writes.
- Dedicated research documents are placed according to the selected document
  workspace rule.
- Document type claims match actual persisted results.
- The fantasy-novel replay scenario covers these regressions.

## Notes For The Implementing Agent

- Start by verifying the audit evidence and current code. Do not assume the
  exact fix points from this document are still correct.
- Prefer a small shared validation module over duplicated checks in every tool.
- Keep prompt changes last or paired with runtime enforcement.
- Preserve the existing `/api/agent/v2/stream` path and the lite/fastchat prompt
  variant routing.
- Avoid broad refactors unless the write path cannot be made reliable without
  them.
- Keep tests focused on observed failures first, then add broader coverage after
  the core guards are stable.
