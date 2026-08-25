# Agentic Chat worker composition

This directory owns queued Agentic Chat execution: artifact loading and validation, provider composition, reviewed read/mutation adapters, cancellation fences, checkpoints, persistence, and queue lifecycle behavior.

The worker consumes shared contracts from `@buildos/shared-types`, static catalog policy from `@buildos/agentic-chat-runtime/catalog`, and portable execution semantics from the runtime's public subpaths. It must not import the web application or package source files directly.

Treat the decoded artifact tool surface as untrusted input. Provider surfaces fail closed, mutation admission remains a security fence, and retained unversioned surfaces stay readable only for the documented artifact-retention window. Web-only capability discovery must be resolved before admission rather than reimplemented here.

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
- `review/controls.ts` owns worker-only reviewer tool definitions and immutable guidance.

These modules are worker-private implementation details unless exported through the agentic-chat root. They must not import the turn coordinator back, and structural moves must preserve provider request JSON, prompt text, tool ordering, hashes, usage accounting, and terminal behavior.
