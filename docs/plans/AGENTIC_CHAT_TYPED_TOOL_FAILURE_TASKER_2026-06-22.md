<!-- docs/plans/AGENTIC_CHAT_TYPED_TOOL_FAILURE_TASKER_2026-06-22.md -->

# Agentic Chat Typed Tool Failure Tasker

Status: implemented
Created: 2026-06-22
Owner: BuildOS agentic chat
Workstream: backend DRY / recovery policy / supervisor correctness

## Purpose

Give one agent enough context to make tool failure classification typed and shared across validation, repair, round analysis, and the deterministic supervisor.

The current runtime has several independent heuristics for "validation failure", "missing required field", "not found", "permission", "timeout", and "repeated failure". That duplication makes repair behavior fragile and makes future recovery work harder.

## Goal

Create one shared `ToolFailure` classification module and migrate existing failure parsing/classification to it without changing recovery behavior.

Recommended new file:

```text
apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/tool-failure.ts
```

Recommended test file:

```text
apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/tool-failure.test.ts
```

## Required Reading

Read these before editing:

1. `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/tool-validation.ts`
    - Produces validation errors such as `Missing required parameter: ...`.
2. `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/round-analysis.ts`
    - Extracts gateway required-field failures with its own regex.
3. `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/repair-instructions.ts`
    - Builds validation and failed-write repair instructions and has not-found heuristics.
4. `apps/web/src/lib/services/agentic-chat-v2/turn-supervisor/digest.ts`
    - Has `classifyToolError()`.
5. `apps/web/src/lib/services/agentic-chat-v2/turn-supervisor/deterministic-supervisor.ts`
    - Uses error classes for repeated validation and not-found recovery decisions.
6. `apps/web/src/lib/services/agentic-chat-v2/turn-supervisor/finalization-guard.ts`
    - Uses `classifyToolExecution()`.
7. Existing tests:
    - `stream-orchestrator/tool-validation.test.ts`
    - `stream-orchestrator/round-analysis.test.ts`
    - `stream-orchestrator/repair-instructions.test.ts`
    - `turn-supervisor/deterministic-supervisor.test.ts`
    - `turn-supervisor/finalization-guard.test.ts`

## Current State

Failure handling is duplicated:

- `tool-validation.ts` constructs string errors.
- `round-analysis.ts` parses required-field failures from strings with `Missing required parameter`.
- `repair-instructions.ts` checks for missing titles, task ids, project-create failures, not-found errors, and unrepaired failed writes.
- `turn-supervisor/digest.ts` classifies errors by substring into `validation`, `not_found`, `permission`, `timeout`, or `execution`.
- `deterministic-supervisor.ts` has additional repeated-failure maps and not-found recovery messaging.
- `tool-execution-service.ts` has older direct validation/error strings that still need to interoperate with the v2 path.

This is the right next backend DRY target after observability extraction.

## Recommended Design

Add a typed failure model:

```ts
export type ToolFailureKind =
	| 'validation'
	| 'missing_required_parameter'
	| 'invalid_argument'
	| 'not_found'
	| 'permission'
	| 'timeout'
	| 'tool_not_loaded'
	| 'transport'
	| 'execution';

export interface ToolFailure {
	kind: ToolFailureKind;
	toolName?: string | null;
	canonicalOp?: string | null;
	field?: string | null;
	message: string;
	retryable: boolean;
	userRecoverable: boolean;
}
```

Suggested helpers:

```ts
export function classifyToolFailure(params): ToolFailure | null;
export function parseRequiredParameterFailure(message: string): string | null;
export function isValidationFailure(failure: ToolFailure | null): boolean;
export function isNotFoundFailure(failure: ToolFailure | null): boolean;
export function buildFailureKey(failure: ToolFailure): string;
```

Keep string output for model-facing tool messages unless a caller is ready for structured payloads. This task is about one classification source, not a full protocol change.

## Implementation Tasks

1. Add `tool-failure.ts` and `tool-failure.test.ts`.
2. Move the required-parameter regex into the new module.
3. Update `round-analysis.ts` to use `parseRequiredParameterFailure()`.
4. Update `turn-supervisor/digest.ts` so `classifyToolError()` delegates to the new classifier. Keep the old return type if downstream code expects strings.
5. Update `repair-instructions.ts` to use typed helpers for:
    - missing required field checks
    - not-found failed write handling
    - failure disclosure grouping
6. Update `deterministic-supervisor.ts` only as needed to consume the shared class/key helpers.
7. Add compatibility tests showing current repair decisions are unchanged.
8. Consider adding typed metadata to validation issue objects, but only if it does not force large call-site churn.
9. Update this doc after implementation with final exported types and known deferred conversions.

## Non-Goals

Do not do these in this task:

- Do not change tool schemas.
- Do not change model-facing validation message text unless required by tests.
- Do not rewrite the full repair-instruction file.
- Do not change deterministic supervisor thresholds.
- Do not change write-ledger semantics.
- Do not alter final answer sanitization.

## Risk Areas

- Existing tests assert exact repair text in places. Prefer preserving text and only changing how failures are classified internally.
- `missing` currently maps to `not_found` in `classifyToolError()`. Be careful not to classify generic "missing required parameter" as `not_found`.
- Validation and not-found recovery drive different supervisor actions.
- Tool names and gateway ops can both appear; include canonical op when available.
- Some old execution-service errors still flow as strings.

## Acceptance Criteria

- Required-field parsing exists in one module.
- Tool error classification exists in one module.
- Round analysis, repair instructions, and turn supervisor use the shared classifier/helpers.
- Existing repair and supervisor behavior is preserved.
- New tests cover representative strings:
    - `Tool validation failed: Missing required parameter: task_id`
    - `Missing required parameter: document_id`
    - `Task not found`
    - `permission denied`
    - `timed out`
    - unknown execution failure

## Suggested Verification

Run focused tests:

```bash
pnpm --filter @buildos/web test -- \
  src/lib/services/agentic-chat-v2/stream-orchestrator/tool-failure.test.ts \
  src/lib/services/agentic-chat-v2/stream-orchestrator/tool-validation.test.ts \
  src/lib/services/agentic-chat-v2/stream-orchestrator/round-analysis.test.ts \
  src/lib/services/agentic-chat-v2/stream-orchestrator/repair-instructions.test.ts \
  src/lib/services/agentic-chat-v2/turn-supervisor/deterministic-supervisor.test.ts \
  src/lib/services/agentic-chat-v2/turn-supervisor/finalization-guard.test.ts
```

Then run the stream endpoint tests:

```bash
pnpm --filter @buildos/web test -- src/routes/api/agent/v2/stream/server.test.ts
```

## Implementation Notes

Implemented 2026-06-22:

- Added `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/tool-failure.ts`.
- Exported `ToolFailureKind`, `ToolFailure`, `ClassifyToolFailureParams`, `classifyToolFailure()`, `parseRequiredParameterFailure()`, `parseInvalidArgumentFailure()`, `isValidationFailure()`, `isNotFoundFailure()`, and `buildFailureKey()`.
- Migrated required-field extraction in `round-analysis.ts` to `parseRequiredParameterFailure()`.
- Migrated supervisor error classification in `turn-supervisor/digest.ts` to delegate through `classifyToolFailure()` while preserving legacy digest classes such as `validation` and `not_found`.
- Migrated repeated-failure keying and missing-field extraction in `deterministic-supervisor.ts` to the shared typed helpers.
- Migrated repair-instruction missing-field checks, not-found retry recognition, and failed-write disclosure grouping to the shared typed helpers.
- Added `tool-failure.test.ts` coverage for required-parameter, invalid-argument, not-found, permission, timeout, and execution failures.

Deferred:

- `ToolValidationIssue` still carries string errors only. Typed metadata can be added later when callers are ready to consume it.
- Model-facing validation text remains unchanged.
- Older non-v2 `tool-execution-service.ts` errors still interoperate as strings; no protocol-level structured payload change was made.
