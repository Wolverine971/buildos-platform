<!-- apps/worker/src/workers/agentic-chat/README.md -->

# Agentic Chat worker composition

This directory owns queued Agentic Chat execution: artifact loading and validation, provider composition, reviewed read/mutation adapters, cancellation fences, persistence, and queue lifecycle behavior.

Production process ownership is exclusive: `src/chat-worker.ts` is the only entrypoint that constructs this composition, starts the Agentic Chat consumer, serves chat health, and publishes `/agentic-chat/capacity`. Starting that entrypoint is the enablement boundary, so incomplete production configuration fails startup. The general `src/index.ts` worker owns unrelated background queues and must not import this bootstrap or manufacture chat health/capacity.

The worker consumes shared contracts from `@buildos/shared-types`, static catalog policy from `@buildos/agentic-chat-runtime/catalog`, and portable execution semantics from the runtime's public subpaths. It must not import the web application or package source files directly.

Treat the decoded artifact tool surface as untrusted input. Provider surfaces fail closed, mutation admission remains a security fence, and retained unversioned surfaces stay readable only for the documented artifact-retention window. Web-only capability discovery must be resolved before admission rather than reimplemented here.

Gmail, Calendar, browser OAuth handoff, and worker-disabled image execution remain explicit web capability paths until reviewed worker parity lands. Their existence does not make the general worker a rollback host: compatible new turns stay worker-owned, and infrastructure uncertainty returns retryable unavailability.

## Calendar migration boundary

`tools/calendar-services.ts` composes the source-aware Calendar provider services shared with web
through `@buildos/shared-agent-ops/calendar/google-calendar-runtime`. It covers credential refresh,
source/default resolution, aggregated reads, event writes and compensating cleanup, and provider
project-calendar resources. Construct it per execution; it does not register tools or enable a lane.

The worker uses the OAuth client kind stored with each connection: dedicated Calendar grants need
`PRIVATE_GOOGLE_CALENDAR_CLIENT_ID` / `PRIVATE_GOOGLE_CALENDAR_CLIENT_SECRET`; migrated shared-login
grants need `PRIVATE_GOOGLE_CLIENT_ID` / `PRIVATE_GOOGLE_CLIENT_SECRET`. Both use the versioned
`PRIVATE_CALENDAR_TOKEN_ENCRYPTION_KEY_V1`. Missing configuration fails closed, with no fallback to
the other OAuth client or the singleton token table. Secret values stay server-side.

Before registering the seven Calendar tools, their adapters must derive `userId` from the trusted
claim, enforce project/task/ontology-event access separately from provider source ownership, preserve
the web's ontology-event and project-mapping behavior, and integrate the reviewed mutation/effect
ledger contracts. Calendar content reads must also participate in the read adapter's private-content
egress fence. The unavailable-tool policy and the Agent Run source-aware-user fallback guard remain
unchanged until those gates and the calendar end-to-end proof pass.

## Provider ownership

`provider/turn-provider.ts` coordinates provider rounds and delegates stable responsibilities to focused modules:

- `contracts.ts` owns provider-facing request, event, usage, and port contracts.
- `openrouter-client.ts` owns OpenRouter transport and wire decoding.
- `stream-tool-calls.ts` owns streamed tool-call assembly and finish validation.
- `feedback.ts` owns execution-feedback validation, normalization, and read memoization.
- `tool-surface.ts` owns the frozen artifact-surface decode and worker capability projection.
- `steps.ts` owns planning, read, and mutation step construction.
- `validation.ts` owns deterministic tool validation and approved-contract authorization.
- `protocol.ts` owns provider protocol parsing and canonical error construction.
- `provider-pass.ts` owns atomic provider-pass buffering, retry identity, cooldown marking, and response-size enforcement.
- `repair-policy.ts` owns bounded unavailable-skill, reviewer-mimicry, surface, and read-loop repair policy. A work tool called from a reduced surface is repaired onto the surface its phase owns (`surfaceFor(phase, admitted, { repair: true })`), never killed.
- `request-builders.ts` owns base provider requests, admission-context projection, continuation, validation repair, snapshots, usage, and client-request construction.
- `turn-phase.ts` owns the turn state machine: the `TurnPhase` union, the pure `nextTurnPhase` reducer over tool-round, disposition, reviewer, carve-out/completion, and budget events, and `surfaceFor`, the single place that decides which tools (and which `toolChoice`) a phase or reviewer lane may call. Every other surface builder draws its tool list from it.
- `review/controls.ts` owns worker-only reviewer tool definitions and immutable guidance.
- `review/decision-completion.ts` owns deterministic reviewer call completion, identity binding, candidate-ambiguity enforcement, and lane-specific fallback decisions.
- `review/contract-execution.ts` owns approved-contract completion and write-only carve-out request surfaces.
- `review/decision-handling.ts` owns reviewer fallback clarification, candidate ambiguity restraint, and bounded proposal-correction requests.
- `review/disposition.ts` owns complex-write contract/clarification gates, post-disposition surfaces, and disposition call-shape enforcement. Answer-only turns no longer declare or independently review a read-only disposition.
- `review/turn-contract.ts` owns contract-review requests, schema-derived field semantics, and project-create contract guidance.
- `write-routing.ts` owns the direct-write floor: one batch, at most three independent operations classified as ordinary in the mutation catalog. Direct calls are the acting model's simple-route declaration; contract-only, dependent, mixed, or larger batches are withheld for `declare_turn_contract`.
- `review/mutation-batch.ts` owns SHA-bound mutation-batch evidence, pending-review state, and final pre-execution review requests for the declared complex-write path.

The provider runs one acting-pass loop (`streamActingPass`) for the opening pass and every continuation; `options.phase` selects the few behaviours that differ (live-vision resolution and the pre-gate prose hold on the opening pass; reviewer-mimicry repair, the required-pass prose fallback, and contract-driven prose holding on continuations). There is no single-read `synthesize` bridge and no turn supervisor: the read-loop ladder, validation repair, the reviewer, and `request_turn_clarification` cover every job the supervisor had.

These modules are worker-private implementation details unless exported through the agentic-chat root. They must not import the turn coordinator back, and structural moves must preserve provider request JSON, prompt text, tool ordering, hashes, usage accounting, and terminal behavior.

## Executor side effects

`executorEffects.ts` is the one facade for the never-fatal ports the executor is composed with (prompt snapshots, execution observations, research and stated-future capture, consumption billing, timing snapshots, terminal-control error reports). Every effect is attempted, a failure is handed to its `on*Error` reporter, and a reporter that throws is swallowed; none of them can change the durable ledger, the published stream, or the terminal status. Ports that carry turn truth (control, publisher, tool executions, session handoff, mutation) stay fatal and are not behind the facade.

## Tool execution batches

One multi-result provider response is one execution batch. Optional `call_ref`/`after` fields express
same-response dependencies; since 2026-09-02 they are mounted only on the contract carve-out and
completion write surfaces (`withSchedulingSidecar` in `provider/tool-surface.ts`), never on reads or
controls, and the batching system message is sent only when a mounted tool carries them. They are
preserved in provider history and removed before domain validation or adapter dispatch. `toolExecutionGraph.ts` validates and layers the batch, while
`toolExecutionPolicy.ts` adds worker-owned resource conflicts and keeps unknown-scope mutations
serial.

Concurrent execution is the production default after the staged rollout. `CHAT_MAX_TOOL_CONCURRENCY=4`
remains the operational fan-out limit. Only audited row-local mutations can run concurrently;
worker-owned dependency and resource-conflict barriers keep unknown-scope or conflicting mutations
serial. Executor tests can still pass explicit false controls when they need to compare serial
behavior.
