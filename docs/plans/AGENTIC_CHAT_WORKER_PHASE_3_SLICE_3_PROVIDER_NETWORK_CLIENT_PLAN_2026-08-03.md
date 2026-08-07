<!-- docs/plans/AGENTIC_CHAT_WORKER_PHASE_3_SLICE_3_PROVIDER_NETWORK_CLIENT_PLAN_2026-08-03.md -->

# Agentic Chat Worker Phase 3 Slice 3 — Default-off Provider Network Client

**Prepared:** 2026-08-03 EDT
**Status:** Implemented locally and tested with fake HTTP streams; Slice 4 configures this client and Slice 5 mounts the bootstrap behind the default-false production flag. Capacity publication, internal routing, deployment, and paid provider calls remain closed.
**Authority:** The user's instruction to double-check the prior work and continue with the next item authorizes local implementation and validation. It does not authorize deployment, production traffic, an internal cohort, or a paid provider call.

## Migration status

This slice changes worker TypeScript, tests, and planning records only. The hosted Agentic Chat migration chain remains current through exact receipt `20260802037000`; no new migration is required or applied.

## Re-audit result

The Slice 2 executor and assembly still preserve the provider-start fence: constructing the client performs no I/O, and its async generator does not call `fetch` until the executor iterates it after `begin_agentic_chat_turn_execution` returns the exact start-winner receipt. Start denial, cancellation, input rejection, and an impossible out-of-cohort claim therefore remain network-free.

The network review also closed two protocol hazards before activation:

- an HTTP 200 response is not accepted unless its content type is `text/event-stream`, so a JSON/error page cannot become a false blank success; and
- `finish_reason=tool_calls` or `function_call` is rejected at the read-only adapter even if a provider omits the corresponding tool delta.

## Implemented boundary

### Explicit, bounded route policy

- `AgenticChatOpenRouterReadOnlyClient` implements the existing injected read-only provider-client port without importing or activating the Phase 3 assembly.
- It accepts one to four explicitly ordered HTTPS routes. Each route is either OpenRouter or an OpenAI-compatible direct endpoint, with canonical identifiers, models, credentials, base URLs, and protected headers.
- OpenRouter may declare at most three model fallbacks and defaults to provider fallback with data collection denied. Configuration that explicitly permits provider data collection is rejected.
- Direct routes cannot silently inherit OpenRouter provider routing or fallback-model behavior.
- Route configuration is cloned and frozen at construction. Session and prompt-cache affinity use the durable chat session identifier.

### Read-only request and stream behavior

- Requests contain the exact prepared system/history/current-input messages, `tool_choice: none`, no tool definitions, and streaming usage enabled.
- OpenRouter reasoning is requested as excluded from visible content. If a provider still emits reasoning channels, they are surfaced only as private reasoning events; visible text also passes through the shared thinking-tag filter.
- A route fallback is allowed only before an SSE response is accepted. After stream acceptance or any output, an error terminates that attempt and is never replayed on another route.
- The parser handles split chunks, CRLF frames, a final unterminated frame, `[DONE]`, and the live web behavior of safe natural stream close.
- Error frames, `finish_reason=error`, malformed usage, tool deltas, non-SSE success responses, and oversized buffers cannot become successful completion.
- The full request/stream lifetime has a bounded timeout, the SSE buffer is bounded, and non-stream error bodies are read only up to a fixed limit.

### Cancellation, pressure, and usage evidence

- Caller abort propagates the exact abort reason and records an aborted attempt; it is not converted into a provider error event.
- Timeouts, network failures, 408/409/425/429 responses, and 5xx responses are classified as retryable provider pressure. Protocol and policy violations remain permanent.
- Exact provider usage is accepted only when prompt, completion, and total token counts are coherent. Otherwise success/failure/abort accounting uses a conservative character-based estimate.
- Provider cost, request/model/provider identity, attempted routes, duration, durable turn/session identifiers, result status, and the estimated flag map into the shared durable LLM usage logger.
- Usage-observer failure is isolated from the turn result, matching the existing logging boundary.

## Deliberate non-use of the generic worker client

The shared worker `SmartLLMService.streamText()` still carries an explicit warning that its stream/error/routing/fallback behavior is not at live chat parity. This slice does not remove or bypass that warning. It adds a narrow no-tools Agentic Chat client behind the already-injected seam and ports the required live behavior directly from the web provider path.

## Validation

Validation after implementation:

- 7 focused files / 61 tests passed across consumer lifecycle, durable cohort rejection, prepared-provider ordering, read-only adapter protocol, provider capacity, fail-closed capacity collection, inert assembly, and the network client.
- Complete worker package: 84 files / 690 tests passed, with one explicit opt-in file/test skipped.
- Worker typecheck passed.
- Touched worker source lint passed without errors or warnings.
- The worker HTTP-module size guard passed with no new violation.
- Whole-worktree tracked diff check passed.

All provider tests use injected fake `fetch` implementations. No provider request or paid model call was made.

## Production boundary retained

- At Slice 3 completion no production entrypoint imported or started the Phase 3 assembly or network client; Slice 5 now mounts them through the default-off bootstrap.
- `AGENTIC_CHAT_WORKER_ENABLED` remains exactly false by default and no hosted flag was changed.
- No environment-to-route factory, capacity publisher, or web admission reader is connected.
- Web capacity observation defaults closed, browser worker admission remains unused, and new turns remain legacy SSE.
- Mutating tools, attachments, and provider tool execution remain unreachable.

## Continuation

Phase 3 Slice 4 is now recorded in `AGENTIC_CHAT_WORKER_PHASE_3_SLICE_4_OPERATIONAL_BOOTSTRAP_PLAN_2026-08-03.md`. It validates environment-to-route configuration, constructs the durable usage observer and hosted assembly only when explicitly enabled, exposes fail-closed in-process capacity evidence, and proves startup/drain health with injected dependencies while retaining `CHAT_CONCURRENCY=1` and the internal UUID cohort.

Slice 5 now mounts the default-off bootstrap in production code. Publishing capacity to web, changing the hosted flag or transport selection, admitting the first internal worker turn, and making the first paid provider call remain distinct activation decisions.
