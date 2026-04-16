<!-- docs/plans/AGENTIC_CHAT_WRITE_INTEGRITY_COMPANION_ASSESSMENT.md -->

# Agentic Chat Write Integrity Companion Assessment

Status: Partially addressed; follow-up architecture work still open
Date: 2026-04-16
Owner: BuildOS Agentic Chat

## Purpose

This is a companion assessment to the existing
[Agentic Chat Write Integrity Fix Handoff](./AGENTIC_CHAT_WRITE_INTEGRITY_FIX_HANDOFF.md).
It captures the interpretation of the latest fantasy-novel replay failure and
the design reasoning behind a cleaner next direction.

This document is intentionally not an implementation checklist. It describes
what the latest evidence suggests about prompt, schema, validation, repair, and
final-answer behavior so a follow-up agent can reason from the same context.

## Status Update — 2026-04-16 (evening pass)

An earlier pass already addressed the structural harness work from the original
fantasy-novel audit:

- ✅ `latestUserMessage` routing is active in the stream endpoint
  ([`+server.ts:2801`](../../apps/web/src/routes/api/agent/v2/stream/+server.ts))
  and now also in the admin preview.
- ✅ Durable-text validation is consolidated to two layers: pre-execution in
  [stream-orchestrator/tool-validation.ts](../../apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/tool-validation.ts)
  (model-facing) and pre-DB in
  [ontology-write-executor.ts](../../apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-write-executor.ts).
  The redundant service-layer check and its mock-based tests were removed.
- ✅ Document-placement guidance added to both
  [lite](../../apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts)
  and [fastchat](../../apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts)
  prompts (dedicated doc + `move_document_in_tree` for named research, append
  for short progress, non-empty content required for append/merge).
- ✅ Lite safety language now includes the "I was unable to `<requested
action>`" script and a final-response-matches-write-set rule.
- ✅ `project.create.fantasy_novel` eval scenario added. Internal tool-call
  markup tokens added to `DEFAULT_FORBIDDEN_ASSISTANT_PATTERNS` so every
  scenario checks for markup leaks in assistant prose.

A follow-up pass addressed two items from this companion doc:

- ✅ XML-ish tool syntax removed from model-facing prompt text — see
  [XML-ish Tool Syntax Assessment](#xml-ish-tool-syntax-assessment) below.
- ✅ Document-link correction detector tightened to clause-level with a
  regression test for the false-positive case — see
  [Document-Link Correction Assessment](#document-link-correction-assessment)
  below.

Items still open for the next agent (priority order):

1. 🟡 **Rebuild final prose from the tool ledger for mutation-heavy turns.**
   See [Final-Answer Integrity Assessment](#final-answer-integrity-assessment).
   Prompt rule landed, but enforcement is still "append a caveat." Move to
   ledger-constrained rendering.
2. 🟡 **Run the next fantasy-novel replay.** See
   [Expected Next Test Results](#expected-next-test-results). The high-risk
   schema/replay/prompt cleanup has landed; the next datapoint should verify
   whether the model still attempts markup leakage or overclaims outcomes.
3. ✅ **Scope `update_strategy` to document tools only** — fixed 2026-04-16
   late pass. See [Update Strategy Confusion](#update-strategy-confusion).
4. ✅ **Redact bad durable content from repair replay history** — fixed
   2026-04-16 late pass. See [Repair Loop Risk](#repair-loop-risk).
5. ✅ **Chat turn bookends** — fixed 2026-04-16 late pass. See
   [Chat Turn Bookends](#chat-turn-bookends).
6. ✅ **Document type normalization** — fixed 2026-04-16 evening, forgiving
   policy. The `/api/onto/documents/create` endpoint now extracts `type_key`
   from the body and persists the requested value if it matches the document
   taxonomy; a malformed value silently falls back to `document.default` with
   a dev-mode warning (no rejection). PATCH applies the same forgiving rule
   — a bad `type_key` on update is dropped, but the rest of the update still
   succeeds. Tests cover valid type persists, missing type defaults, and
   malformed type falls back without rejecting the write. See
   [Document Type Normalization Investigation](#document-type-normalization-investigation)
   below for the original trace.

Verification after the earlier passes:

- 86 targeted unit tests pass across durable-text, tool-selector,
  tool-validation, tool-execution-service, repair-instructions, lite prompt,
  preview, shadow, and prompt-evaluator suites.
- `pnpm check` reports zero errors in any touched file (pre-existing repo-wide
  errors untouched).

Verification after the 2026-04-16 late pass:

- 50 focused tests pass across ontology write schemas/executors, stream
  validation, repair replay redaction, prompt bookends, lite prompt, and
  durable-text validation.
- `git diff --check` passes on the touched files.
- A full `pnpm run check` still fails on unrelated pre-existing repo-wide
  Svelte/type errors. The replay-redaction type issue found during review was
  fixed and no longer appears in that output.

## Primary Evidence

The newest repro is the three-turn lite session:

- [Recent lite session audit, 4703ab1b](../../chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-4703ab1b-5d31-4f-2026-04-16.md)
- [Turn 3 prompt dump, lite_seed_v1](../../apps/web/.prompt-dumps/fb-2026-04-16T16-35-31-374Z-lite-turn3.txt)

The broader background is still the earlier comparison audit:

- [Fastchat vs Lite Fantasy Novel Flow Audit](../reports/agentic-chat-fastchat-vs-lite-fantasy-novel-flow-audit-2026-04-15.md)
- [Original write-integrity handoff](./AGENTIC_CHAT_WRITE_INTEGRITY_FIX_HANDOFF.md)

The recent run happened on the shared FastChat V2 stream path:

- Runtime endpoint: [apps/web/src/routes/api/agent/v2/stream/+server.ts](../../apps/web/src/routes/api/agent/v2/stream/+server.ts)
- Prompt variant: `lite_seed_v1`
- Prompt builder: [apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts](../../apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts)
- Model lane/provider surface: [apps/web/src/lib/services/openrouter-v2-service.ts](../../apps/web/src/lib/services/openrouter-v2-service.ts) and [apps/web/src/lib/services/openrouter-v2/model-lanes.ts](../../apps/web/src/lib/services/openrouter-v2/model-lanes.ts)

## What The Latest Run Proved

The durable-write validator prevented a corrupt task description from being
persisted. The bad outgoing argument was:

```json
{
	"description": "Updated with notes on Damascus steel patterns, Celtic smith gods (Goibniu), medieval weapons, Japanese sword-making traditions, and regional forging differences. See linked Magic System Research Notes document.\"\n<parameter name=\"update_strategy\">replace"
}
```

That appears in the recent audit and the turn-3 prompt dump:

- [Recent audit, failed task update trace](../../chat-session-audit-i-m-starting-my-first-fantasy-novel-the-last-emb-4703ab1b-5d31-4f-2026-04-16.md)
- [Turn 3 prompt dump, tool execution summary](../../apps/web/.prompt-dumps/fb-2026-04-16T16-35-31-374Z-lite-turn3.txt)

The important interpretation is split:

- Data integrity improved: the polluted write was blocked before persistence.
- Agent behavior did not improve enough: the model still emitted internal
  tool-control syntax inside a durable user-visible field.
- Final-answer integrity remained weak: the final answer claimed the
  blacksmithing task was updated, then appended a failed-write disclosure that
  contradicted the earlier claim.

The guard worked, but the overall chat experience still looked broken because
the runtime allowed a mixed success/failure narrative rather than a clean
outcome summary.

## XML-ish Tool Syntax Assessment

✅ **Addressed 2026-04-16.** The literal `<parameter>`, `<tool_call>` examples
have been removed from the lite safety rule in
[build-lite-prompt.ts](../../apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts).
The new wording is abstract: "tool-control syntax or argument framing" must not
"leak into those strings; put control parameters in their own tool arguments,
not inside text fields." The fastchat master prompt never carried the literal
tokens, so no change was needed there. The runtime validator in
[durable-text-validation.ts](../../apps/web/src/lib/services/agentic-chat/shared/durable-text-validation.ts)
still recognizes and blocks all four tag classes
(`parameter_tag`, `tool_call_tag`, `function_call_tag`, `arguments_tag`).

Note for next agent: repair messages and validation error strings still
surface phrases like "contains internal tool-call markup" (see
[durable-text-validation.ts `formatDurableTextViolation`](../../apps/web/src/lib/services/agentic-chat/shared/durable-text-validation.ts)).
That is arguably model-facing too, since validation errors are returned in tool
results. The argument for keeping the current wording is that it names the
category without showing the literal token shape. Worth reviewing if markup
leaks persist after the other fixes land.

---

The latest evidence supports removing XML-ish internal tool syntax from
model-facing instructions, examples, and repair messages.

The existing runtime validator should still recognize and block that syntax if
it appears. The distinction is important:

- Runtime detection protects the database.
- Model-facing mentions can accidentally teach or reinforce the exact artifact
  that should not appear.

The current lite safety rule includes a literal negative example:

- [Lite prompt safety rules](../../apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts)

The bug predates that exact prompt text, so the negative example is probably not
the root cause. It is still likely counterproductive to put the literal
forbidden token shape in the model context. A cleaner model-facing rule would
refer to "tool-control syntax" or "internal tool syntax" without showing
angle-bracket examples.

Relevant runtime/code surfaces:

- [Shared durable-text validation](../../apps/web/src/lib/services/agentic-chat/shared/durable-text-validation.ts)
- [Stream tool validation](../../apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/tool-validation.ts)
- [Tool execution service validation](../../apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts)
- [Ontology write executor backstop](../../apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-write-executor.ts)

## Update Strategy Confusion

✅ **Addressed 2026-04-16 late pass.** The model-facing write schema now scopes
`update_strategy` / `merge_instructions` to `update_onto_document` only.
Task, project, goal, and plan update schemas no longer advertise document-like
merge controls.

Changes landed:

- [ontology-write.ts](../../apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-write.ts)
  — removed `update_strategy` and `merge_instructions` from
  `update_onto_task`, `update_onto_project`, `update_onto_goal`, and
  `update_onto_plan`. `update_onto_document` still exposes both fields.
- [types.ts](../../apps/web/src/lib/services/agentic-chat/tools/core/executors/types.ts)
  — removed the fields from non-document update arg types.
- [ontology-write-executor.ts](../../apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-write-executor.ts)
  — removed append/merge resolution for task, goal, and plan text updates.
  Those fields now update directly. Document updates keep append/merge
  semantics.
- [ontology-write.test.ts](../../apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-write.test.ts)
  — added regression coverage that only document updates expose merge strategy
  fields.
- [tool-executor.test.ts](../../apps/web/src/lib/services/agentic-chat/tools/core/tool-executor.test.ts)
  — updated non-document strategy tests to expect direct replacement and no LLM
  merge call.

Current behavior: if a stale model emits `update_strategy` on a task/goal/plan
update anyway, the schema no longer encourages that path and the executor does
not merge text. The runtime validation helper still ignores the stray strategy
keys when deciding whether a meaningful update exists, so a valid field update
can proceed while the stray strategy is effectively inert.

---

The recent failure looks like a boundary failure between a text field and an
adjacent control field. The model wrote a task `description`, then appeared to
try to express `update_strategy: "replace"` using an internal format inside
that same string.

The relevant schema is here:

- [Ontology write definitions](../../apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-write.ts)

The conceptual problem is that `update_strategy` was introduced because document
bodies can be large and need append/merge semantics. That mental model is
strongest for document content. In the current tool schema surface, similar
strategy fields also appear on non-document update tools such as task/project
description updates.

That creates a confusing product-language contract for the model:

- Documents have body content where append/merge is useful.
- Tasks and other ontology entities usually have direct scalar fields such as
  title, description, state, dates, priority, and props.
- A strategy parameter on tasks makes task updates feel like document updates,
  which may have contributed to the model treating strategy as a generic update
  control and leaking it into the task description.

The recommended design direction is a simpler model-facing schema boundary:

- Document body updates expose document-specific append/merge semantics.
- Routine task updates expose plain field replacement semantics.
- Any non-document merge behavior that remains useful internally is not
  necessarily part of the provider-visible schema.

That direction also reduces one-off rules. Instead of teaching special handling
for document updates and then relying on the model to infer which tools share
that behavior, the model sees a smaller difference: documents have large-body
update mechanics; tasks do not.

## Repair Loop Risk

✅ **Addressed 2026-04-16 late pass.** The model-visible assistant tool-call
replay now redacts invalid durable text before the failed tool call is added
back to the conversation history for repair.

Changes landed:

- [stream-orchestrator/index.ts](../../apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts)
  — calls `sanitizeToolCallsForReplay(..., { redactInvalidDurableText: true })`
  for assistant replay messages. Execution still receives the original
  normalized arguments; only the model-visible replay is redacted.
- [tool-arguments.ts](../../apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/tool-arguments.ts)
  — added recursive durable-text redaction for ontology durable write tools.
  It replaces bad string values with `[redacted invalid durable text]` without
  relying on path parsing, so nested `props` keys containing dots are handled
  correctly.
- [stream-orchestrator.test.ts](../../apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.test.ts)
  — added an end-to-end repair pass test asserting the rejected
  `<parameter ...>` string is absent from the next model input.
- [tool-arguments.test.ts](../../apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/tool-arguments.test.ts)
  — added nested-key coverage for `props["chapter.notes"]`.

Acceptance now covered by tests: after a durable-text rejection, the subsequent
model input preserves the validation fact but does not contain the rejected
durable string.

---

The orchestrator currently stores assistant tool calls back into the message
history for replay/repair:

- [Stream orchestrator](../../apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts)
- [Tool argument parsing/replay helpers](../../apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/tool-arguments.ts)

The latest bad argument was valid JSON, so generic malformed-JSON recovery did
not treat it as a tool-argument anomaly. It was semantically invalid only after
durable-text validation detected the internal syntax.

That creates a subtle repair risk: if a validation failure occurs after a
syntactically valid tool call, the replay history can still contain the exact
bad durable field value. The model may then see its own bad string during the
repair pass.

The cleaner design direction is that failed durable-write calls should be fed
back to the model as structured validation facts, not as full unredacted bad
durable content. The model needs to know which field failed and why. It does not
need to see the invalid string repeated.

## Final-Answer Integrity Assessment

🟡 **Partially addressed.** Added prompt rules stating that final responses
must match the actual write set and that discovery/schema is not completion.
The enforcement layer still appends a caveat after the fact instead of
rebuilding the prose from the tool ledger.

Next direction: treat the outcome summary as a constrained rendering step.
After tool execution the orchestrator already has a structured ledger of
successes and failures (see
[`round-analysis.ts`](../../apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/round-analysis.ts)
helpers). Feed that ledger as the only source of truth for phrasing "what
changed"; the model supplies context and interpretation around it, not the
verbs. Options: a second smaller model call that takes the ledger plus the
pre-tool user intent and writes the outcome paragraph; or a deterministic
template the model is forced to fill.

---

The latest final answer mixed incompatible claims:

- It said the blacksmithing research task was `in_progress` and its description
  was enhanced with research cross-links.
- It later appended a disclosure that a task update failed validation and did
  not persist.

That is better than silently omitting the failure, but it is still not a
trustworthy final answer. Appending a caveat does not correct the earlier
success claim.

Relevant files:

- [Repair instructions and final-answer integrity checks](../../apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/repair-instructions.ts)
- [Round analysis helpers](../../apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/round-analysis.ts)
- [Stream orchestrator finalization path](../../apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts)

The stronger architecture is an outcome-led final phase:

- Successful tool results are the only source for "what changed."
- Failed tool results are the source for "what did not change."
- Final prose is reconstructed or constrained from the write ledger rather than
  patched after the fact with a trailing correction.

This same principle applies to document type claims. In the recent run, the
model requested `document.knowledge.research`, but the persisted result was
`document.default`. A final answer that says the document is
`document.knowledge.research` is not grounded in the actual result.

The same principle also applies to link claims. Link/cross-link/placement words
should be backed by link or document-tree write results, not by general prose
references inside descriptions.

## Document-Link Correction Assessment

✅ **Addressed 2026-04-16.** The whole-answer regex in
[repair-instructions.ts](../../apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/repair-instructions.ts)
was replaced with a clause-level check. Both `looksLikeDocumentLinkClaim` and
`looksLikeDocumentPlacementClaim` now require the link/placement verb and the
document noun to appear within the same sentence (up to an 80-char gap, no
intervening `.!?\n`). A shared `hasClauseLevelMatch` helper handles both verb→noun
and noun→verb orders.

A regression test was added in
[repair-instructions.test.ts](../../apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/repair-instructions.test.ts)
reproducing the exact false-positive case from this doc: _"Created the project
with 7 tasks linked to the main goal. I also added an auto-generated context
document for the plot summary."_ The detector no longer fires on that input.

Existing positive coverage (e.g., "I created and linked the document to the
outline" still triggers the correction) continues to pass.

---

The previous correction guard produced a false-positive in turn 1 of the recent
session:

- The assistant said tasks were linked to the goal.
- The answer also mentioned an auto-generated context document elsewhere.
- A broad regex saw "linked" and "document" in the same final answer and
  appended "Correction: I did not create a document link."

That indicates the current document-link detector is too broad. Whole-answer
regexes are brittle for this class of claim. A narrower clause/sentence-level
interpretation is a better fit:

- "linked document", "document linked to X", "cross-linked the document", or
  "attached the document" are document-link claims.
- "tasks linked to the goal" is not a document-link claim merely because a
  document is mentioned elsewhere in the answer.

This is less about regex tuning in isolation and more about final-answer
grounding: claims should be evaluated close to the noun they modify and then
checked against successful operations.

## Chat Turn Bookends

✅ **Addressed 2026-04-16 late pass.** Both prompt paths now distinguish the
pre-tool lead-in from the post-tool outcome summary.

Changes landed:

- [master-prompt-builder.ts](../../apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.ts)
  — FastChat V2 communication guidance now says lead-ins are intent-only and
  must not state the final outcome, success, or persisted update until all tool
  calls complete.
- [build-lite-prompt.ts](../../apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts)
  — Lite safety/data rules now carry the same temporal discipline.
- [master-prompt-builder.test.ts](../../apps/web/src/lib/services/agentic-chat-v2/master-prompt-builder.test.ts)
  and [build-lite-prompt.test.ts](../../apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.test.ts)
  assert the bookend language is present.

This pairs with, but does not replace, the Final-Answer Integrity
ledger-rendering work above.

---

The desired interaction pattern has two useful bookends.

The first bookend is an immediate lead-in before tool execution. This is
important because tool calls can take time and the user should not sit in
silence. The lead-in should state intent, not completion:

```text
I'll save those research notes to the project and update the relevant tasks.
```

The second bookend is the final outcome after tools finish. This is where the
assistant can report actual changes:

```text
I created the research notes document and marked the magic-system task in progress.
The blacksmithing task description did not update because the write failed
validation, so that part did not persist.
```

The core distinction is temporal:

- Before tools: intent and scope.
- After tools: verified results only.

The final-answer layer should not inherit optimistic language from the lead-in
or from the model's planned tool calls. It should be grounded in completed tool
results.

## Prompt And Schema Alignment

Prompt guidance, tool schemas, runtime validation, repair messages, and final
answer checks should all describe the same mental model.

Current friction points:

- The historical prompt syntax and schema-confusion issues are now addressed:
  literal XML-ish examples were removed from model-facing prompt text, and
  non-document update tools no longer expose document-like strategy semantics.
- Validation errors are accurate but model-facing text can still mention the
  internal artifact category too concretely.
- Repair replay now redacts invalid durable strings, but final answers can
  still be patched with caveats instead of being rebuilt from outcomes.

The cleaner mental model:

- The model emits plain JSON tool arguments.
- User-visible durable fields contain only user-visible content.
- Document bodies have document-specific append/merge semantics.
- Ordinary task/entity fields are direct updates.
- Runtime validators enforce boundaries.
- Final answers report the tool ledger, not planned intent.

## Expected Next Test Results

The next fantasy-novel replay should be treated as a post-fix validation run,
not as a clean graduation run.

Expected improvements:

- `update_strategy` should appear only on document update calls, not task,
  goal, project, or plan updates.
- If the model attempts to put internal tool syntax into a durable field, the
  write should fail validation before persistence.
- The repair pass should not receive the rejected durable string in the
  assistant tool-call replay; it should see only the validation failure fact and
  a redacted placeholder.
- Pre-tool user-visible text should read as intent ("I'll update..."), not as
  completed work.
- Document append/merge language in both prompts should be interpreted as
  document-specific, not as a generic rule for tasks.

Risks that may still appear:

- The final answer may still overclaim or append a caveat after a false success
  statement, because ledger-rendered final prose is still open.
- The model may omit some successful writes from the final summary even if the
  tools ran correctly.
- Document placement and link claims still need close checking against actual
  `move_document_in_tree` or link operations.

Recommended test focus:

- Repeat the three-turn fantasy novel flow and inspect durable task/document
  strings for `<parameter`, `<tool_call`, `<function_call`, and `<arguments`.
- Confirm any rejected durable write is retried cleanly or disclosed.
- Confirm task updates use direct field replacement and do not include document
  merge controls.
- Confirm final response claims match actual successful write results, with
  special attention to task progress, document type, tree placement, and links.

## Related Test And Verification Surfaces

These tests and utilities are relevant because they already cover pieces of the
behavior or would naturally house regression cases:

- [Durable text validation tests](../../apps/web/src/lib/services/agentic-chat/shared/durable-text-validation.test.ts)
- [Stream tool validation tests](../../apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/tool-validation.test.ts)
- [Tool execution service tests](../../apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.test.ts)
- [Ontology document/tree tool tests](../../apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-doc-tree-tools.test.ts)
- [Ontology write definition tests](../../apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-write.test.ts)
- [Lite prompt tests](../../apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.test.ts)
- [Tool selector tests](../../apps/web/src/lib/services/agentic-chat-v2/tool-selector.test.ts)
- [Repair instruction tests](../../apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/repair-instructions.test.ts)
- [Tool argument replay/redaction tests](../../apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/tool-arguments.test.ts)
- [Prompt dump debug output](../../apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/prompt-dump-debug.ts)

## Residual Product Questions

The latest evidence raises a few product/architecture questions rather than
only code questions:

- Whether non-document description merge semantics are worth exposing to the
  model at all. _(Covered by [Update Strategy Confusion](#update-strategy-confusion) — the recommended answer is "no".)_
- Whether document type normalization should be fixed at creation time,
  final-answer time, or both. _(Creation/PATCH persistence is fixed with a
  forgiving API policy; final-answer grounding is still covered by
  [Final-Answer Integrity Assessment](#final-answer-integrity-assessment).)_
- Whether final responses should be fully ledger-rendered for mutation-heavy
  turns, or constrained by a ledger summary and then checked deterministically.
  _(Covered by [Final-Answer Integrity Assessment](#final-answer-integrity-assessment).)_
- Whether provider/model selection should be revisited for tool-heavy turns if
  a model repeatedly leaks internal tool-call grammar into JSON string fields.
  _(Open — worth revisiting once the other fixes land and we can measure
  residual leak rate per model.)_

The strongest near-term design reading is that prompt cleanup is necessary but
not sufficient. The prompt, schemas, validation errors, repair replay, and final
answer layer all need to communicate one consistent contract.

## Document Type Normalization Investigation

✅ **Fixed 2026-04-16 evening.** Root cause investigation is below for
reference; the fix is now in place in both create and PATCH endpoints.

**Fix landed (forgiving policy):**

- `/api/onto/documents/create/+server.ts` — `type_key` is extracted from the
  body and validated via `isValidTypeKey(value, 'document')` from
  `$lib/types/onto`. Valid values persist; malformed or mismatched values
  silently fall back to `document.default` (with a dev-mode warning). The
  write never fails because the type is bad.
- `/api/onto/documents/[id]/+server.ts` — PATCH uses the same forgiving rule:
  a malformed `type_key` is dropped from the update payload, but the rest of
  the update still proceeds.
- Tests in
  [`apps/web/src/routes/api/onto/documents/create/server.test.ts`](../../apps/web/src/routes/api/onto/documents/create/server.test.ts):
  valid `document.knowledge.research` persists; no `type_key` falls back to
  `document.default`; malformed `Task.default` falls back without rejecting.

**Policy note for future maintainers:** do not reintroduce strict rejection
here. Other ontology create endpoints (tasks, goals, plans) do not strictly
validate `type_key` either. Forgiving fallback keeps the agent loop moving and
matches the rest of the codebase. If strict validation is ever needed, apply
it at the agent-layer (tool schema) rather than the API.

The reference-only trace below is preserved for the next agent.

**The bug**: the document create API at
[/api/onto/documents/create/+server.ts](../../apps/web/src/routes/api/onto/documents/create/+server.ts)
destructures the request body at lines 51–63 but does not pull out
`type_key`. Line 210 then hardcodes `type_key: 'document.default'` in the
Supabase insert, silently dropping whatever type the agent requested. There is
no validation error because the DB insert always succeeds with the hardcoded
value.

**This is not a taxonomy gap.** The types the agent has been using are both
valid canonical types per
[apps/web/docs/features/ontology/TYPE_KEY_TAXONOMY.md](../../apps/web/docs/features/ontology/TYPE_KEY_TAXONOMY.md):

- `document.context.project` — canonical project context doc (line 277)
- `document.knowledge.research` — general research notes (line 278)

The agent is emitting correct taxonomy values. The API throws them away.

**Flow of the silent drop:**

- Tool definition
  ([ontology-write.ts](../../apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-write.ts))
  declares `type_key` as a parameter with the canonical families listed as
  examples. Good.
- Executor
  ([ontology-write-executor.ts `createOntoDocument`](../../apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-write-executor.ts))
  correctly passes `type_key: args.type_key` in the POST payload. Good.
- API endpoint
  ([api/onto/documents/create/+server.ts:51-63, 210](../../apps/web/src/routes/api/onto/documents/create/+server.ts))
  does not read `type_key` from the body and hardcodes the insert value. **Bug.**
- DB schema
  ([20250601000001_ontology_system.sql](../../supabase/migrations/20250601000001_ontology_system.sql))
  has `type_key text not null` with no CHECK constraint or enum. The hardcoded
  insert always passes, so the bug is silent.

**Recommended fix (preferred direction):**

1. Extract `type_key` from the request body destructuring in the create
   endpoint.
2. Validate against the taxonomy families using the regex in
   [TYPE_KEY_TAXONOMY.md](../../apps/web/docs/features/ontology/TYPE_KEY_TAXONOMY.md)
   (around line 492 per the reference taxonomy).
3. Replace the hardcoded insert with `type_key: validatedTypeKey ?? 'document.default'`.
4. Return `ApiResponse.badRequest()` listing valid families when an unknown
   type is submitted, so the agent gets an actionable error instead of silent
   coercion.
5. Add a targeted test: POST with `type_key: 'document.knowledge.research'`,
   assert the persisted row's `type_key` matches.

**Scope check**: also inspect the update path
(`/api/onto/documents/update` or equivalent) for the same pattern. The audit
observed type mismatches on creation only, but update should follow the same
contract — extract the field, validate, persist. Do not touch `type_key`
immutably once set unless product wants to allow retyping (probably not).

**Knock-on effect on the earlier handoff**: removing the silent coercion means
the agent's requested types finally persist. Any downstream code that reads
`onto_documents.type_key` and assumed `document.default` for all agent-created
docs will need checking. Candidates to grep: `document.default` string
occurrences outside the API endpoint, especially in UI rendering and
classification paths.

---

## Handoff Notes For The Next Agent

Recommended order of attack:

1. **Next replay/testing pass** — rerun the fantasy-novel flow and compare
   against [Expected Next Test Results](#expected-next-test-results). The
   schema/replay/prompt cleanup should reduce the markup leak and strategy
   confusion rate; the result should determine whether more prompt work is
   needed or whether remaining issues are mostly final-answer grounding.
2. **Final-answer ledger rendering** — larger architectural change. The
   residual overclaim rate should be smaller after schema scoping, replay
   redaction, and bookend prompt guidance, making the design choice
   (deterministic template vs. constrained second pass) clearer.
3. **Formal replay/eval coverage** — add the fantasy-novel sequence as a
   repeatable eval so the next prompt/runtime change can be measured against
   durable writes, final claims, and token/cost behavior.
4. **Project/document write surface tuning** — if the next replay still uses
   multiple discovery passes for common task/document writes, tune gateway
   surfaces rather than adding more prompt text.

Each item above has concrete file pointers in its section. The existing tests
in the Related Test And Verification Surfaces list are the right places to
house regressions.
