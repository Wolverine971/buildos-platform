<!-- docs/technical/reviews/AGENTIC_CHAT_FOLLOWUP_REVIEW_2026-09-02.md -->
<!-- doc-status: point-in-time -->

# Agentic chat independent follow-up review — September 2, 2026

An independent agent reviewed the retained failures and current source at `f28e8f7bc2fd41718c4141dc6d4fd40dd09a45d3`. The review was read-only. It confirmed two control-path defects with deterministic local probes and identified lifecycle and status-projection gaps. Recommendations below are proposed fixes; no application code was changed during this review.

## Migration and deployment verified

At **2026-09-03 02:15:27 UTC**, the configured BuildOS database had migration `20260902150000` recorded as `agentic_chat_recovery_throttle_backoff_seconds`. The seconds-based throttle/timeout formula and five-second jitter were present; infrastructure retry timing remained in minutes. `anon` and `authenticated` cannot execute the function; `service_role` can. The migration was applied in the previous continuation, and this fresh check confirms both its receipt and implementation. No duplicate application was necessary.

The current hosted worker reported release `f28e8f7bc2fd41718c4141dc6d4fd40dd09a45d3`, matching local HEAD and containing the pinned-provider 404 fix. Its database, recovery, and Realtime health were healthy. This supersedes the older release mismatch in the original test report. This review did not deploy anything.

[Database verification evidence](./agentic-chat-local-verification-2026-09-02/migration-reverification.json)

## Fresh rerun on the updated worker

Reran the two previously failing durable scenarios against `f28e8f7`, with retries disabled. **Both scenarios still failed, with different failure codes; the earlier pinned-provider 404 did not recur.**

| Scenario                                  | Result | Scenario duration | New evidence                                                                                                       |
| ----------------------------------------- | ------ | ----------------: | ------------------------------------------------------------------------------------------------------------------ |
| Document edit, then contextual tightening | Fail   |           206.9 s | Initial edit passed; follow-up ended `provider_forced_synthesis_failed` after 19 model passes and 20 tool attempts |
| Fully specified project creation          | Fail   |            23.9 s | First turn ended `provider_tool_validation_repair_exhausted`                                                       |

The initial document edit completed in 55.9 seconds and passed its durable assertions. Its follow-up took 141.3 seconds. Both newly failed turns had zero `chat_turn_effects` rows and zero successful effects; the document's Rollback section remained as written by the successful first turn. Retained turn IDs: initial document `27ccdd1f-3e12-43e3-a0a2-a12896971cef`, document follow-up `8a70a5a6-89bd-4ce2-b260-2dacccd3af7e`, project creation `0fe8286e-1cd0-4be2-a892-fa2347519ab4`.

Cleanup verification found zero remaining `review-followup` fixture projects and zero active turns among these three requests. Worker diagnostic records remain under the existing retention policy. [Raw rerun results](./agentic-chat-local-verification-2026-09-02/review-release-rerun.json).

## Recommended fixes

### P1 — Ground reviewer corrections in real tool capabilities and receipt fields

In the new document follow-up, the reviewer replaced the initial contract with invented postcondition fields such as `rollback_section_text` and `_rollback section contains the revised concise wording`. The fulfillment checker compares these fields against actual effect receipts, which cannot satisfy them. The document adapter only offers full `replace` or `append`. The reviewer subsequently rejected replacement for changing unrelated sections and append for duplicating Rollback. The turn accumulated 15 reads, including eight memo hits, and five control/review executions without attempting a mutation.

Validate corrected contracts against real receipt fields before accepting them: for this edit, use `required_fields:["content"]` and express the section-level requirement in `description`. Give the batch reviewer the original content/diff and teach it that full replacement can implement a section edit when other sections are preserved. Never require an unavailable section-edit strategy. Adding a dedicated section-edit tool is optional later work.

Relevant code: [receipt fulfillment](../../../packages/agentic-chat-runtime/src/loop/turn-contract.ts#L1283), [document tool modes](../../../apps/worker/src/workers/agentic-chat/mutations/tool-catalog.ts#L102), [mutation reviewer construction](../../../apps/worker/src/workers/agentic-chat/provider/review/mutation-batch.ts#L91).

The inspected records did not retain the rejected replacement bodies, so whether the first replacement actually modified unrelated text remains unproven. The invented contract fields and absence of mutations are confirmed.

Regression: section-only tightening preserves every other section; reviewer corrections with impossible receipt fields are rejected before approval.

### P1 — Recover from repeated provider violations within existing retry limits

The document turn's final two Alibaba passes returned `finish_reason:"tool_calls"` despite `tool_choice:"none"`. The HTTP builder correctly omitted tool definitions, and forced synthesis cleared the tool surface. The existing single synthesis retry stayed ineffective and ended `provider_forced_synthesis_failed`.

Treat this as a provider capability violation: clear/penalize the provider pin and use the existing bounded retry on another route. Keep tool execution disabled and report truthfully when no edit occurred. Do not add more retries.

Relevant code: [tool-free request](../../../apps/worker/src/workers/agentic-chat/provider/request-builders.ts#L69), [HTTP tool surface](../../../apps/worker/src/workers/agentic-chat/provider/openrouter-client.ts#L938), [synthesis retry](../../../apps/worker/src/workers/agentic-chat/provider/turn-provider.ts#L1817).

Project creation showed another non-progressing repair: DeepInfra repeated the same 293-token declaration in the opening pass and both repair passes. Four create outcomes supplied optional symbolic labels without `changes.title`. Validation correctly emitted the specific error each time; the model ignored it.

Make the project-create instructions distinguish outcome `id` from optional symbolic `label`, omit labels when no later outcome references them, and provide a complete labelled-create example containing `changes:[{field:"title",value:"Define format"}]`. Align conditional schema requirements with runtime semantics. Detect identical invalid resubmissions and use the remaining repair allowance on a different route instead of repeating the same pinned provider. Do not infer real entity titles from symbolic labels or weaken label binding.

Relevant rule: [labelled-create title requirement](../../../packages/agentic-chat-runtime/src/loop/turn-contract.ts#L495).

Regressions: a tool-bearing response with tools disabled must never execute tools and must recover or fail truthfully within the existing limit; identical invalid labelled-create declarations must produce bounded recovery, followed by exact requested project structure.

### P1 — Repair invalid clarification arguments before execution

The failed long-answer turn supplied candidate labels that its question paraphrased instead of naming verbatim. The shared control validator requires each label verbatim. A deterministic local probe confirmed that the same invalid call passes `validateToolCalls` with no issues but fails control execution. The execution adapter throws that failure, producing `read_tool_execution_failed` before any checkpoint is created.

Extend the shared tool preflight to validate `request_turn_clarification` semantics, as it already validates `declare_turn_contract`. Return `ToolValidationIssue` and reuse the existing two-round repair loop. Keep runtime validation intact as the final guard.

Relevant code: [semantic rule](../../../packages/agentic-chat-runtime/src/loop/turn-contract.ts#L792), [preflight gap](../../../packages/agentic-chat-runtime/src/loop/tool-validation.ts#L160), [terminal conversion](../../../apps/worker/src/workers/agentic-chat/tools/execution-adapter.ts#L336), [existing repair loop](../../../apps/worker/src/workers/agentic-chat/provider/turn-provider.ts#L1314).

Regression: paraphrased labels → validation feedback → corrected question → successful clarification. Repeated invalid arguments must exhaust the bounded repair allowance without a write.

### P1 — Allow answer-only prose to leave a false clarification gate

A local probe classified the educational example `Ask early readers: "Which topic should the next email cover?"` as a clarification question. The classifier scans the whole answer, including quotations. The worker then enters a required disposition gate whose options are contract declaration, clarification, or reads; it has no answer-only exit.

Give this terminal-prose gate a bounded tool-free answer exit when no durable action is commissioned, and distinguish example questions from questions that actually block the user's request. Keep gates for real proposed mutations strict. The live first-pass prose was withheld and not retained, so this exact classifier trigger is not proven for the original incident.

Relevant code: [prose classifier](../../../packages/agentic-chat-runtime/src/loop/repair-instructions.ts#L1546), [gate transition](../../../apps/worker/src/workers/agentic-chat/provider/turn-provider.ts#L571), [available gate choices](../../../apps/worker/src/workers/agentic-chat/provider/turn-phase.ts#L223).

Regression: answer-only advice containing quoted questions and an explicit no-tools request must complete; a genuinely ambiguous mutation must still ask for clarification.

### P2 — Preserve admission state when minimizing

The park payload omits pending admission and only checks streaming/restored state. An idle card stops probing. Simply adding `isStartingStream` is insufficient: discovery can return empty before admission creates the turn and falsely announce completion.

Track pending admission separately, retain request identity, and update the card when admission resolves. Defer hard teardown until admission settles or transfer the pending request's lifecycle to the parked observer. Start completion checks only once there is authoritative admission evidence.

Relevant code: [park payload](../../../apps/web/src/lib/components/agent/AgentChatModal.svelte#L1997), [probe lifecycle](../../../apps/web/src/lib/services/chat-session-notification.bridge.ts#L101).

Regression: admission delayed beyond the first probe, accepted/rejected admission, minimize/close during bootstrap, and completion before the admission response arrives.

### P2 — Project exact turn status through an ownership-checked server API

The new active probe only lists `worker_realtime` turns, although legacy streaming can still use it. An empty worker list incorrectly means finished for a running legacy turn. The notification bridge also treats disappearance from the active list as success, even after failure or cancellation, and may preview an older answer.

Use a minimal server projection with explicit authenticated user/session ownership filters that supports both modes. Retain the parked turn's identity, retrieve its terminal status, and preview only its assistant message. The worker's existing turn-by-ID endpoint already provides an authoritative status path.

The full session snapshot separately reads turn/status/event tables through the ordinary user client, while fresh policy inspection confirms admin-only SELECT. This loses terminal status and timeline information on reload. Reuse a safe server projection for that path too. Preserve current browser restrictions on control tables; do not restore broad SELECT grants.

Relevant code: [worker-only probe](../../../apps/web/src/lib/components/agent/agent-chat-session.ts#L342), [mode filter](../../../apps/web/src/lib/services/agentic-chat-v2/worker-turn-gateway.server.ts#L90), [session snapshot queries](../../../apps/web/src/routes/api/chat/sessions/[id]/+server.ts#L531).

Regression: running legacy turn, queued worker, failed/cancelled turn with a previous answer, unauthorized session, malformed receipt, and terminal history reload.

### P2 — Fix shared browser-client initialization beyond chat

The modal fallback correctly resolves the shared browser client, but root context is only installed from initial layout data. Public-page → SPA login can leave it absent. The dashboard brief widget still assumes it exists.

Provide a stable browser client/context before dependent components initialize, or consistently use the shared singleton in the remaining consumers. Preserve the intended lazy initialization on public pages where practical.

Relevant code: [root context initialization](../../../apps/web/src/routes/+layout.svelte#L74), [dashboard consumer](../../../apps/web/src/lib/components/dashboard/DashboardBriefWidget.svelte#L55).

Regression: public-page SPA login into dashboard/chat, authenticated reload, and sign-out/sign-in.

## Wrong-request answer: confirmed symptom, uncertain cause

The integer request was present in admission and in the final prompt message, yet the answer addressed the previous failed newsletter request. That earlier request remained in history without a terminal failure marker. It is a plausible contributor, not a proven cause.

Add bounded terminal-outcome context when projecting failed/cancelled history, then evaluate an unrelated exact-output request immediately afterward. Avoid changing caching or adding a blanket model reviewer without evidence. The subsequent exact-output browser check passed.

## Verification to perform after fixes

Use deterministic repair/lifecycle regressions first, then repeat the original browser and durable follow-up scenarios. A passing provider request alone is insufficient: verify exact turn association, terminal status, unchanged unrelated document sections, and fixture cleanup.
