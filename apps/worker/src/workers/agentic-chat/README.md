<!-- apps/worker/src/workers/agentic-chat/README.md -->

# Agentic Chat worker composition

This directory owns queued Agentic Chat execution: artifact loading and validation, provider composition, reviewed read/mutation adapters, cancellation fences, checkpoints, persistence, and queue lifecycle behavior.

Production process ownership is exclusive: `src/chat-worker.ts` is the only entrypoint that constructs this composition, starts the Agentic Chat consumer, serves chat health, and publishes `/agentic-chat/capacity`. Starting that entrypoint is the enablement boundary, so incomplete production configuration fails startup. The general `src/index.ts` worker owns unrelated background queues and must not import this bootstrap or manufacture chat health/capacity.

The worker consumes shared contracts from `@buildos/shared-types`, static catalog policy from `@buildos/agentic-chat-runtime/catalog`, and portable execution semantics from the runtime's public subpaths. It must not import the web application or package source files directly.

Treat the decoded artifact tool surface as untrusted input. Provider surfaces fail closed, mutation admission remains a security fence, and retained unversioned surfaces stay readable only for the documented artifact-retention window. Web-only capability discovery must be resolved before admission rather than reimplemented here.

Gmail, Calendar, browser OAuth handoff, and worker-disabled image execution remain explicit web capability paths until reviewed worker parity lands. Their existence does not make the general worker a rollback host: compatible new turns stay worker-owned, and infrastructure uncertainty returns retryable unavailability.

## Provider ownership

`provider/turn-provider.ts` coordinates provider rounds and delegates stable responsibilities to focused modules:

- `contracts.ts` owns provider-facing request, event, usage, and port contracts.
- `openrouter-client.ts` owns OpenRouter transport and wire decoding.
- `stream-tool-calls.ts` owns streamed tool-call assembly and finish validation.
- `feedback.ts` owns execution-feedback validation, normalization, and read memoization.
- `tool-surface.ts` owns the frozen artifact-surface decode and worker capability projection.
- `steps.ts` owns planning, read, mutation, and pre-execution-failure step construction.
- `validation.ts` owns deterministic tool validation and approved-contract authorization.
- `protocol.ts` owns provider protocol parsing and canonical error construction.
- `provider-pass.ts` owns atomic provider-pass buffering, retry identity, cooldown marking, and response-size enforcement.
- `repair-policy.ts` owns bounded unavailable-skill, reviewer-mimicry, and read-loop repair policy.
- `request-builders.ts` owns base provider requests, admission-context projection, continuation, synthesis, validation repair, snapshots, usage, and client-request construction.
- `supervisor-runtime.ts` owns provider-facing supervisor state, directives, observations, and step draining.
- `review/controls.ts` owns worker-only reviewer tool definitions and immutable guidance.
- `review/decision-completion.ts` owns deterministic reviewer call completion, identity binding, candidate-ambiguity enforcement, and lane-specific fallback decisions.
- `review/contract-execution.ts` owns approved-contract completion and write-only carve-out request surfaces.
- `review/decision-handling.ts` owns reviewer fallback clarification, candidate ambiguity restraint, and bounded proposal-correction requests.
- `review/disposition.ts` owns read-only review, semantic disposition gates, post-disposition surfaces, and disposition call-shape enforcement.
- `review/turn-contract.ts` owns contract-review requests, schema-derived field semantics, and project-create contract guidance.
- `review/mutation-batch.ts` owns SHA-bound mutation-batch evidence, the one-call implicit-contract lane, pending-review state, and final pre-execution review requests. Multi-effect and dependent writes remain on the declared-contract path.

These modules are worker-private implementation details unless exported through the agentic-chat root. They must not import the turn coordinator back, and structural moves must preserve provider request JSON, prompt text, tool ordering, hashes, usage accounting, and terminal behavior.

## Tool execution batches

One multi-result provider response is one execution batch. Optional `call_ref`/`after` fields express
same-response dependencies; they are preserved in provider history and removed before domain
validation or adapter dispatch. `toolExecutionGraph.ts` validates and layers the batch, while
`toolExecutionPolicy.ts` adds worker-owned resource conflicts and keeps unknown-scope mutations
serial.

Concurrency is staged independently from graph validation:

- `AGENTIC_CHAT_CONCURRENT_READS_ENABLED=false`
- `AGENTIC_CHAT_CONCURRENT_MUTATIONS_ENABLED=false`
- `CHAT_MAX_TOOL_CONCURRENCY=4`

The graph still compiles when both gates are off, producing the existing serial behavior. Enabling
mutation concurrency affects only the audited row-local tools in the policy; it does not make every
mutation parallel-safe.
