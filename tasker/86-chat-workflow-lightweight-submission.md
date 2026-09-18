<!-- tasker/86-chat-workflow-lightweight-submission.md -->

# 86 — Admit the request quickly and prepare context in the worker

**Created:** 2026-09-12  
**Status:** Ready to implement against the frozen 85 contract (2026-09-14). The v4 admission RPC and context checkpoint exist in QA; `pg_temp.admit` in `supabase/tests/20260914203008_agentic_chat_workflow_v1.test.sql` is the reference call. Writers stay off until integration.  
**Depends on:** [85](85-chat-workflow-durable-contracts.md) contracts; accepted schema/readers before integration.  
**Parallel with:** 87's pure runner and 88's UI fixtures.  
**Unblocks:** Real runner integration in 87. Raw model execution stays off until then.

## Outcome

For an explicitly enabled text/project review, Send authenticates and durably saves
the request plus queue job without loading project content or constructing the model
prompt first. The worker publishes preparation progress, gathers authorized context,
and accepts an immutable prepared checkpoint. Unsupported and ordinary requests
retain their working prepared-admission behavior.

Read [81](81-chat-workflow-implementation-program.md), the frozen contract from 85,
and [the architecture's admission section](../apps/worker/src/workers/agentic-chat/djflow-architecture.md).
Current v3 admission requires a prepared artifact: this is a versioned contract
change, not moving one function below `enqueue`. Shared portable context extraction
already exists in `packages/agentic-chat-runtime/src/context/`; use it.

## Work

1. Add explicit per-submission review intent to the supported server contract.
   Authenticate, derive user identity, verify scope, enforce cohort/capability policy
   and existing admission limits. The browser cannot grant workflow access, tools,
   budgets, or read-only recovery eligibility.
2. Use 85's raw admission transaction to save bounded frozen history, immutable v4
   request, user message, turn and queue job. Return the existing usable turn/session
   identities promptly. No project-context read, compaction or model prompt assembly
   before acceptance on this path. Necessary authorization/history checks remain.
3. Avoid review-specific heavy prewarm while the explicit review mode is selected.
   Preserve ordinary chat's prepared lease. A stale prepared key is never authority
   to change the immutable request, skip access checks or submit both modes.
4. After claim, publish truthful gathering-context progress through 84's durable
   acceptance boundary. Recheck current project access; gather a compact context
   with a bounded timeout/abort signal and actual record versions. Cache is an
   optimization, not authorization. Cache hit/miss must produce supported parity.
5. Accept prepared context through 85's fenced checkpoint RPC; build model input
   only from accepted context and frozen history. Read back after uncertain commit
   responses. A retry reuses the accepted checkpoint, without rewriting the request.
6. Distinguish pending context from known context usage. Publish token/context usage
   only after it exists; do not show fabricated estimates to satisfy a legacy type.
   Give preparation failure/cancel a durable, user-readable terminal outcome.
7. Instrument click/request arrival, durable admission, queue claim, context start/end
   and provider-ready boundaries without logging private prompt content. Report
   before/after round trips and latency separately from later model generation.

## Ownership and scope

Own narrow changes under:

- `apps/web/src/routes/api/agent/v2/turns/` including worker admission schema.
- `apps/web/src/lib/services/agentic-chat-v2/worker-turn-admission.server.ts`,
  `worker-turn-preparation.server.ts`, input-artifact store and related tests.
- `apps/worker/src/workers/agentic-chat/workflow/context-loader.ts` and portable
  context services under `packages/agentic-chat-runtime/src/context/`.
- `executionInput.ts` only after 85's reader ownership handoff.

85 owns types/migrations; 87 consumes prepared input; 88 owns visible review mode.
Coordinate executor/bootstrap/config wiring through 81. Preserve Tasker 75's
ordinary prepared-admission lease and measurement path. The worker must not import
SvelteKit, `$lib`, web routes, or web application source.

Initial support is project text without attachments. Unsupported scope/media keeps
its existing supported flow and cannot silently discard user input. No mutation
tools, discovery automation, web search, or universal admission rewrite.

## Validation and acceptance

- Request-path spies prove no heavy project preparation occurs before raw admission;
  the worker performs it once after claim. Exercise fresh sessions and existing ones.
- Duplicate Send/retry returns one durable turn; changed text/intent/scope conflicts.
  Authorization revocation, stale history, capacity and cross-user requests fail safely.
- Cache hit/miss/stale paths use supported context; prewarm cannot overwrite request
  identity. Preserve ordinary prepared-hit/miss and unsupported media behavior.
- Context timeout, cancellation and ownership replacement prevent late attachment
  or model execution. A lost checkpoint response reuses durable truth.
- Crash before/after context acceptance is reconstructible from durable input using
  the store fixture. Full worker restart execution is 87/89's acceptance, not a claim
  made by this task's fake-provider test.
- Use a fake provider to prove end-to-end preparation before 87; do not enable paid
  v4 model execution without durable dispatch reservation. Keep the existing v3
  Workflow Lab available while this new path is gated off.

Start with focused `worker-turn-admission.test.ts`, `worker-turn-preparation.test.ts`,
`turn-input-artifact-store.test.ts`, worker execution-input/context tests, and shared
context tests in their owning packages. Run through `test-gate` serially, then the
coordinator's full gate. Record actual admission timing and call counts on matched
fixtures; demonstrate fewer pre-queue operations without claiming a subsecond SLA.

Return source identity, request-path trace, accepted checkpoint examples, tests,
ordinary-path parity results and the 87 handoff. Acceptance requires working raw
preparation plus a passing gate; real model activation remains 87's responsibility.
