<!-- tasker/64-agentic-chat-tool-call-contract-compatibility.md -->

# 64 — Agentic Chat tool-call contract compatibility

**Created:** 2026-08-26

**Status:** Open

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
