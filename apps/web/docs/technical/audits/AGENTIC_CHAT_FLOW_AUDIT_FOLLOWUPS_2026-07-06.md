<!-- apps/web/docs/technical/audits/AGENTIC_CHAT_FLOW_AUDIT_FOLLOWUPS_2026-07-06.md -->

# Agentic Chat Flow Audit Followups - 2026-07-06

These are the non-P1 findings from the full agentic chat flow audit. The P1 timeout/abort propagation issue was fixed separately in the service and streaming endpoint.

## P2 - Prepared prompts can be consumed before the turn lock

The streaming route can accept prepared prompt material before the turn is admitted and locked. If a newer turn wins the lock, the older request may still spend work preparing context/prompt state before it is rejected.

References:

- `apps/web/src/routes/api/agent/v2/stream/+server.ts:977`
- `apps/web/src/routes/api/agent/v2/stream/+server.ts:2827`
- `apps/web/src/routes/api/agent/v2/stream/+server.ts:2928`
- `apps/web/src/routes/api/agent/v2/stream/+server.ts:2954`

## P2 - Turn admission happens too late in the streaming hot path

The stream endpoint does substantial request, context, prompt, and observability setup before the turn lock/admission boundary. Moving admission earlier would reduce wasted work and make duplicate/overlapping turn behavior easier to reason about.

References:

- `apps/web/src/routes/api/agent/v2/stream/+server.ts:2616`
- `apps/web/src/routes/api/agent/v2/stream/+server.ts:2771`
- `apps/web/src/routes/api/agent/v2/stream/+server.ts:2841`
- `apps/web/src/routes/api/agent/v2/stream/+server.ts:2928`

## P2 - Read tool calls execute sequentially

The orchestrator executes tool calls one by one through `executeMultipleTools`, even when calls are independent reads. The service has batch-related code, but the main orchestration path does not exploit safe parallelism for independent read tools.

References:

- `apps/web/src/lib/services/agentic-chat/orchestration/stream-orchestrator/index.ts:1510`
- `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts:1940`

## P2 - Timezone is hard-coded to UTC in prompt context

Several prompt/context paths use UTC directly. This can make "today", due dates, and calendar reasoning wrong for users outside UTC, especially around midnight.

References:

- `apps/web/src/lib/services/agentic-chat/context/context-loader.ts:451`
- `apps/web/src/lib/services/agentic-chat/prompts/build-lite-prompt.ts:51`
- `apps/web/src/routes/api/agent/v2/stream/+server.ts:3317`

## P2 - Prompt snapshots store full prompt material

Prompt observability snapshots appear to persist full prompt bodies without a clear retention/redaction boundary. This is useful for debugging but risky for sensitive user/project data.

References:

- `apps/web/src/lib/services/agentic-chat/observability/prompt-observability.ts:315`
- `apps/web/src/lib/services/agentic-chat/observability/prompt-observability.ts:381`
- `apps/web/supabase/migrations/20260428000015_create_agent_prompt_observability.sql:72`
- `apps/web/supabase/migrations/20260428000015_create_agent_prompt_observability.sql:181`

## P3 - Stream request boundary is permissive for `context_type`

The request parser accepts broad context type values while downstream scope helpers assume a narrower set. Invalid or legacy values should be normalized or rejected at the boundary.

References:

- `apps/web/src/lib/services/agentic-chat/stream-request.ts:17`
- `apps/web/src/lib/services/agentic-chat/scope.ts:37`

## P3 - Gateway tool availability is not enforced at the service layer

Gateway tools use canonical schemas and can execute even when not included in the selected tool list. This may be intentional for discovery tools, but the policy boundary should be explicit per gateway tool.

References:

- `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts:517`
- `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts:1575`

## P3 - Tool failure logging is duplicated/noisy

Tool failures can be logged in both the execution service and the streaming route. The result is useful during debugging but can overcount a single failed call in production telemetry.

References:

- `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts:811`
- `apps/web/src/routes/api/agent/v2/stream/+server.ts:3996`
