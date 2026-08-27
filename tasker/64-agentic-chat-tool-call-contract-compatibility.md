<!-- tasker/64-agentic-chat-tool-call-contract-compatibility.md -->

# 64 — Agentic Chat tool-call contract compatibility

**Created:** 2026-08-26

**Status:** Complete

**Priority:** P1
**Type:** Live contract investigation and test normalization

## Why this exists

The live web Agentic Chat stream still constructs `ToolExecutionService`, whose decoder accepts both
the canonical OpenAI-style tool shape and a legacy flat shape. The shared public types expose only
the canonical shape:

- Canonical call: `{ id, type: 'function', function: { name, arguments: string } }`
- Legacy call: `{ id, name, arguments: object | string }`
- Canonical definition: `{ type: 'function', function: { name, description, parameters } }`
- Legacy definition: `{ name, description, parameters }`

The 4,590-line `tool-execution-service.test.ts` suite was recently added using the legacy shape for
most cases while annotating those fixtures as the canonical shared types. That currently produces
209 test-type diagnostics and, more importantly, means the broad behavior suite exercises the
compatibility fallback instead of the primary live ingress shape.

This is not dead code. `apps/web/src/routes/api/agent/v2/stream/+server.ts` still instantiates the
service, and `tool-execution/call-decoder.ts` plus `tool-execution/schema-validator.ts` deliberately
read legacy fields with `Reflect.get`.

## Investigation

1. Trace every production caller of `ToolExecutionService.executeTool`, `batchExecuteTools`, and
   `validateToolCall`; record which payload shape reaches each boundary.
2. Check persisted/replayed payloads, worker/legacy handoff paths, provider adapters, and external
   ingress before concluding that the flat form is unused.
3. Decide whether legacy compatibility is:
    - still required at an untyped external boundary,
    - temporarily required with a retirement date, or
    - unreachable and safe to remove.
4. Keep malformed/legacy data typed as `unknown` until it crosses an explicit compatibility parser.
   Do not broaden the canonical shared types merely to make fixtures compile.

## Production trace (2026-08-26)

- `ToolExecutionService` has one production construction site:
  `apps/web/src/routes/api/agent/v2/stream/+server.ts`. Its single-call adapter passes the
  orchestrator's `ChatToolCall` directly to `executeTool`; its batch adapter applies
  `maybeInjectProjectId` and passes the resulting `ChatToolCall[]` to `batchExecuteTools`.
- Provider events cross `FastAgentStreamEvent` as canonical `ChatToolCall` values. Before execution,
  `stream-orchestrator/llm-pass-runner.ts` reads and rewrites only
  `toolCall.function.name`/`toolCall.function.arguments`. The live route contract test also asserts
  canonical nested calls and definitions at both execution adapters.
- Tool definitions originate in the typed Agentic Chat catalog and remain
  `ChatToolDefinition[]` through turn preparation, gateway materialization, and skill
  materialization. No flat definition producer reaches the service.
- `validateToolCall` has no production caller outside the service facade; current direct callers are
  tests. Live execution validates through the service's argument pipeline using the same canonical
  definitions.
- Persisted `chat_messages.tool_calls`, prepared-prompt history, and worker frozen-history artifacts
  are replay inputs for provider history, not calls into `ToolExecutionService`. The worker uses its
  own runtime/execution path and never constructs this service.
- No reachable flat production caller was found. Flat call/definition support is retained
  temporarily behind the explicit `unknown` compatibility parsers because persisted JSON validation
  is intentionally shallow and historical payload provenance is not versioned. Review removal by
  **2026-09-09** in a separate change after sampling persisted payloads; do not broaden the shared
  canonical types in the meantime.

## Implementation result (2026-08-26)

- The broad service suite now builds canonical nested calls and definitions. Object arguments are
  serialized once into `function.arguments`, matching provider ingress; intentionally malformed
  strings remain strings for decoder/error coverage.
- Flat compatibility is isolated in clearly named decoder and schema-validator suites. Legacy
  fixtures stay `unknown` until the parser normalizes them, with no double casts.
- The service suite's 209 diagnostics are eliminated. The web test-type debt now measures 540 and
  the baseline is pinned to 540.
- Verification passed: 127 focused execution/decoder/schema tests, 45 live stream route tests,
  production `svelte-check` with 0 errors and 0 warnings, and the web test-type gate at its new
  baseline.

## Recommended implementation

1. Add small canonical test builders for tool calls and tool definitions. Builders should serialize
   canonical `function.arguments` exactly as the provider does.
2. Migrate the broad service behavior suite to those canonical builders so it exercises the live
   contract by default.
3. Retain a small, clearly named compatibility suite for flat calls/definitions in
   `call-decoder.test.ts` and `schema-validator.test.ts` while compatibility remains intentional.
4. If production tracing proves the legacy shape unreachable, remove the compatibility reads and
   their isolated tests in a separate reviewed change.
5. Run the focused service tests, the live stream route tests, web production typecheck, and web test
   typecheck. Lower the test-type debt baseline by the verified diagnostic reduction.

## Acceptance criteria

1. The broad `ToolExecutionService` suite uses canonical nested calls and definitions by default.
2. Legacy compatibility is either documented with explicit boundary tests or removed with caller
   evidence; it is not silently preserved through casts.
3. No blanket `as any`, `as unknown as`, non-null assertions, or weakened compiler settings are used
   to clear the diagnostics.
4. Tool argument serialization, schema validation, same-turn ownership, virtual handlers, batch
   execution, and the live stream call contract retain focused passing coverage.
5. The web test-type baseline is lowered by the verified reduction and cannot regress silently.

## Non-goals

- Retiring the live legacy Agentic Chat route or worker fallback architecture.
- Rewriting `ToolExecutionService` as part of test normalization.
- Expanding `ChatToolCall` or `ChatToolDefinition` into permissive catch-all types.
- Deleting compatibility behavior without tracing real callers and persisted payloads.
