<!-- docs/specs/AGENTIC_CHAT_TURN_SUPERVISOR_SPEC_2026-05-23.md -->

# Agentic Chat Turn Supervisor Spec

Date: 2026-05-23

Status update, 2026-06-22: the deterministic supervisor, finalization guard,
checkpoint/resume service, and hidden telemetry remain live. The optional LLM
judge described in the original phase plan was removed on 2026-06-11 after
telemetry showed it had never run; see
`apps/web/docs/features/agentic-chat/AUDIT_2026-06-10_HOLISTIC_ASSESSMENT.md`.
References below to LLM judge rollout are retained only as superseded historical
context.

## Purpose

Build a hidden side-channel supervisor for Agentic Chat that observes a running turn, detects when the turn is no longer progressing, and can redirect the visible response without giving the supervisor direct tool-execution authority.

The supervisor should answer three product questions during a turn:

- Are we still making progress toward the user's request?
- Do we need to synthesize, ask the user, or keep working?
- Did the turn produce a real user-facing response after tool work?

This is not a second visible chat participant. It is runtime control and observability around the existing `streamFastChat` loop.

## Research Summary

External patterns support this shape:

- OpenAI Agents SDK treats guardrails and tracing as first-class runtime concerns around an agent run, including tool-call, guardrail, handoff, and custom-event traces. Guardrails can allow, reject, or halt a path, but the application owns orchestration and state.
- LangChain's supervisor/subagent pattern keeps centralized control in the main orchestrator and uses subagents/tools with isolated context. This validates the "compact digest, not full context" principle.
- LangGraph persistence and interrupts are the right mental model for mid-turn user questions: save durable state, surface a JSON-serializable interrupt payload, and resume from a stable thread/checkpoint pointer.

Local code already has the foundations:

- `streamFastChat` owns model/tool rounds, validation repair, read-loop escalation, forced no-tool synthesis, write ledgers, and final assistant text.
- `/api/agent/v2/stream` owns session resolution, SSE emission, turn-run persistence, prompt snapshots, turn events, and tool execution persistence.
- `chat_turn_runs`, `chat_turn_events`, `chat_prompt_snapshots`, and `chat_tool_executions` already provide most observability.
- Detached turn execution is already mostly implemented: SSE writes are best-effort, stream detachment does not cancel the server-owned turn, and explicit cancel is routed through `/api/agent/v2/stream/cancel`.

## Current-State Findings

### What Already Works

- Tool loops are capped by rounds/calls.
- Repeated read-only work is detected by `read-loop-escalation.ts` and `ContextGatheringLedger`.
- Validation failures can trigger repair instructions.
- Gateway/direct tool discovery can materialize direct tools mid-turn.
- A no-tool synthesis pass can be forced before the safety cap in some read-loop cases.
- Tool executions and turn events are persisted for post-run audit.
- If the client disconnects, the server keeps the turn running after SSE write failure by marking `streamDetached = true`.

### Gaps This Spec Addresses

- No single runtime component owns "is this turn still progressing?"
- Long silent turns only expose generic activity, not situational status.
- If tool work completes but the model produces no useful final answer, current persistence can fall back to weak text.
- Mid-turn clarification can be emitted, but there is no durable checkpoint/resume contract for supervisor interruption.
- Existing finalization guards are embedded in orchestration, not exposed as a clear policy surface.

## Product Requirements

1. The supervisor side channel is hidden from the user.
2. The supervisor can produce visible output only by intervening through normal chat surfaces:
    - `agent_state` details for progress status
    - `clarifying_questions` or assistant text for a mid-turn question
    - final assistant text when it forces synthesis or stops with a message
3. The supervisor does not rewrite or block individual tool calls before execution.
4. The supervisor can stop the current flow after observing progress and redirect the next model pass or final response.
5. If the supervisor asks a question, the system must persist enough state to continue when the user answers, even if the chat closes.
6. Client disconnect should not cancel the turn. Explicit Stop still cancels the turn.
7. The first implementation should prioritize:
    - no final answer after tool work
    - repeated failures
    - long silent turns

## Non-Goals

- Do not give the supervisor direct access to run workspace write tools.
- Do not expose a new visible "orchestrator" persona.
- Do not require full model-message checkpointing for phase 1 if a compact semantic checkpoint is enough.
- Do not replace the existing stream orchestrator, read-loop ledger, validation repair, or prompt eval system.
- Do not add broad pre-tool approval gates. This is observation and intervention, not approval review.

## Architecture

### Component Overview

```text
POST /api/agent/v2/stream
  resolves session, turn run, prompt, tools
  creates TurnSupervisor
  calls streamFastChat(...)

streamFastChat
  emits internal supervisor observations
  executes existing model/tool loop
  applies supervisor decisions at safe boundaries

TurnSupervisor
  builds compact TurnDigest
  applies deterministic rules
  returns TurnSupervisorDecision

checkpoint service
  persists supervisor interruptions and resume context

SSE/UI
  receives normal event types only
  no public "supervisor" event required
```

### Safe Intervention Boundaries

The supervisor should only intervene at boundaries where state is coherent:

- after an LLM pass finishes
- after a tool result is received
- after a tool round completes
- before the final answer is persisted
- while a long-running operation is active, for status-only updates

It should not interrupt mid-write or mutate tool arguments.

## Core Types

### TurnSupervisorObservation

```ts
type TurnSupervisorObservation =
	| { type: 'turn_started'; at: string }
	| { type: 'assistant_text_delta'; chars: number; at: string }
	| { type: 'llm_pass_completed'; pass: number; finishedReason?: string; usage?: unknown }
	| { type: 'tool_call_emitted'; toolName: string; toolCallId: string; argsPreview?: unknown }
	| {
			type: 'tool_result_received';
			toolName: string;
			toolCallId: string;
			success: boolean;
			error?: string | null;
			resultSummary?: string | null;
	  }
	| { type: 'tool_round_completed'; round: number; toolCallsMade: number }
	| { type: 'final_candidate'; text: string; finishedReason?: string }
	| { type: 'stream_detached'; at: string }
	| { type: 'turn_finished'; finishedReason?: string };
```

### TurnDigest

The digest is the compact data passed to deterministic supervisor rules and persisted as telemetry. It was originally also shaped for an optional LLM judge, but that judge path has been removed.

```ts
type TurnDigest = {
	turnRunId: string | null;
	sessionId: string;
	userId: string;
	contextType: ChatContextType;
	entityId?: string | null;
	projectId?: string | null;
	userMessage: string;

	elapsedMs: number;
	msSinceVisibleText: number | null;
	assistantTextChars: number;
	finalCandidateChars: number;

	llmPassCount: number;
	toolRoundCount: number;
	toolCallCount: number;
	validationFailureCount: number;

	recentTools: Array<{
		sequence: number;
		toolName: string;
		canonicalOp?: string | null;
		success?: boolean | null;
		errorClass?: string | null;
		resultSummary?: string | null;
	}>;

	progress: {
		successfulWrites: number;
		failedWrites: number;
		readRounds: number;
		lowNoveltyReadRounds: number;
		repeatedToolPatternCount: number;
		repeatedFailureCount: number;
		discoveredEntityCount: number;
	};

	risks: Array<
		| 'long_silence'
		| 'many_tool_calls'
		| 'repeated_failures'
		| 'low_novelty_reads'
		| 'near_tool_budget'
		| 'tools_without_final_answer'
		| 'empty_final_candidate'
	>;
};
```

### TurnSupervisorDecision

```ts
type TurnSupervisorDecision =
	| { action: 'continue'; reason?: string }
	| { action: 'emit_status'; message: string; reason: string }
	| { action: 'force_synthesis'; instruction: string; reason: string }
	| { action: 'ask_user'; question: string; checkpoint: TurnCheckpointPayload; reason: string }
	| { action: 'stop_with_message'; message: string; reason: string; finishedReason: string }
	| { action: 'flag_eval'; reason: string };
```

Decision handling:

- `continue`: no-op.
- `emit_status`: send normal `agent_state` with `state: 'thinking'` and useful `details`.
- `force_synthesis`: set `forceNoToolSynthesisPass = true` and append a system instruction for the next pass.
- `ask_user`: persist checkpoint, emit question, end the current visible turn with `finished_reason = 'supervisor_question'`.
- `stop_with_message`: emit and persist the message, then end the turn.
- `flag_eval`: record `chat_turn_events` only.

## Trigger Policy

The deterministic supervisor runs on every observation but only acts on thresholds.

### Status Triggers

Emit a status update when:

- no visible text has been emitted for 10 seconds and the turn is still active
- a tool call has been running for 12 seconds
- total elapsed turn time exceeds 20 seconds and the turn has tool activity

Cadence:

- first status at 10-12 seconds
- repeat no more than every 15 seconds
- maximum three status updates per turn unless explicitly configured

Status examples:

- "BuildOS is still working through the project context and checking which items need changes."
- "BuildOS found relevant project context and is now verifying the next step before answering."
- "BuildOS is waiting on a tool result, then it will summarize what changed."

These should be sent as `agent_state.details`, not appended to final assistant content.

In the UI, render these only inside the existing thinking/progress block. They should not create assistant message bubbles.

### Force-Synthesis Triggers

Force no-tool synthesis when:

- tool calls made >= 6 and no write has succeeded
- tool rounds >= 3 and all rounds are read/discovery
- low-novelty read rounds >= 2
- repeated tool pattern count >= 2
- remaining tool rounds <= 1 and any useful evidence exists
- final candidate is empty after successful tool work

### Ask-User Triggers

Ask the user instead of continuing when:

- the same required field failure repeats at least twice and the field cannot be inferred from context
- two or more plausible targets remain after reads
- continued tool calls would likely mutate the wrong entity

The question must be concise and single-focus.

### Stop-With-Message Triggers

Stop with a message when:

- tool budget is exhausted and no final synthesis can be produced
- repeated failures make progress impossible
- a final answer is missing after tool work and deterministic synthesis can produce a safe summary

## Removed LLM Judge

Superseded status, 2026-06-22: the optional LLM judge was deleted on 2026-06-11. Do not implement or re-enable the old `FASTCHAT_TURN_SUPERVISOR_LLM_*` path from this spec. The retained pieces are deterministic decisions plus `TurnSupervisorDecisionTrigger`/digest telemetry, which remain useful for calibration and admin audit without adding a model call inside the turn loop.

## Checkpoint and Resume

### Phase 1: Semantic Checkpoint

Add a new table:

```sql
create table public.chat_turn_checkpoints (
  id uuid primary key default gen_random_uuid(),
  turn_run_id uuid not null references public.chat_turn_runs(id) on delete cascade,
  session_id uuid not null references public.chat_sessions(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  checkpoint_type text not null,
  status text not null default 'active',
  reason text not null,
  digest jsonb not null default '{}'::jsonb,
  resume_context jsonb not null default '{}'::jsonb,
  supervisor_decision jsonb not null default '{}'::jsonb,
  question text null,
  resume_turn_run_id uuid null references public.chat_turn_runs(id) on delete set null,
  resume_started_at timestamptz null,
  created_at timestamptz not null default now(),
  resumed_at timestamptz null,
  expires_at timestamptz null
);
```

Indexes:

- `(session_id, status, created_at desc)`
- `(turn_run_id, created_at desc)`

RLS should mirror `chat_turn_events`: user insert/select for own rows only if needed, admin select, service role all.

`resume_context` should contain:

- compact user intent
- compact assistant lead-in/final text so far
- tool execution summaries
- known IDs discovered
- successful write summaries
- failed tool summaries
- supervisor reason and question
- instruction for the next turn: "Continue from this checkpoint; do not re-run completed reads unless the user's answer changes the target."

On next user message:

1. Load latest active checkpoint for the session.
2. Create the new turn run.
3. Soft-consume the checkpoint by setting `status = 'resuming'`, `resume_turn_run_id`, and `resume_started_at`.
4. Include checkpoint resume context in the model history as a system message.
5. Mark checkpoint `resumed` after the resumed turn completes successfully.
6. If the resumed turn fails or is cancelled before producing a final response, restore the checkpoint to `active` or let a cleanup job make stale `resuming` checkpoints eligible again.
7. Record the resumed checkpoint ID in `chat_turn_events` and assistant metadata.

This is "semantic resume": it prevents losing work and avoids re-running known reads, without requiring exact continuation of the suspended async function.

"Consume" means marking a checkpoint so it will not be injected into every future user turn forever. The recommended phase 1 behavior is soft consume on turn start and hard consume on successful completion. That gives the runtime duplicate protection without losing the checkpoint if the resumed turn crashes.

### Phase 2: Exact Loop Checkpoint

Exact resume would store compact model messages, pending repair instructions, tool counters, materialized tools, and ledger state. This is possible but higher risk because `streamFastChat` currently holds many local variables.

Defer exact resume until after phase 1 proves the product behavior.

## Stream and UI Contract

No new public supervisor event is required for phase 1.

Use existing events:

- `agent_state`: progress status in the thinking block.
- `clarifying_questions`: user question path if the UI wants structured questions.
- `text_delta`: only for final or hijacked assistant text that should be part of the assistant message.
- `done`: terminal boundary.

Hidden observability uses `chat_turn_events`:

- `supervisor_status_emitted`
- `supervisor_decision`
- `supervisor_force_synthesis`
- `supervisor_question_checkpoint_created`
- `supervisor_finalization_guard_applied`
- `supervisor_eval_flagged`

## Persistence Semantics

### Normal Completion

- Persist assistant content from `finalAssistantText` after finalization guard.
- Persist tool executions as current code does.
- Persist supervisor decisions/events as turn events.

### Status Update

- Emit `agent_state`.
- Record turn event.
- Do not append to assistant message content.

### Supervisor Question

- Persist assistant question as an assistant message.
- Persist active checkpoint.
- Emit `clarifying_questions` or `text_delta` question.
- Emit `done` with `finished_reason = 'supervisor_question'`.
- Leave checkpoint active for the next user response.

Question turns should leave `chat_turn_runs.status = 'completed'` with `finished_reason = 'supervisor_question'` in phase 1. Do not add `waiting_on_user` to `chat_turn_runs.status` yet. Revisit that only after product testing shows that paused-run display or resume UX needs a first-class run status.

### Stream Detached

- Continue server execution.
- Record `stream_detached` observation and turn event.
- Do not emit more SSE events once detached.
- Persist final assistant message/tool rows for session restore.

## Finalization Guard

Add a deterministic finalization guard before assistant persistence and at the end of `streamFastChat`.

Rules:

- If no tool work happened, preserve current behavior.
- If any tool work happened and final text is empty, synthesize from tool trace.
- If successful writes happened and final text is only an intent lead-in, replace with outcome summary.
- If write attempts failed and none later succeeded for the target, say what did not change.
- Never claim a write unless the corresponding tool result succeeded.

This directly addresses the highest-priority failure: tools ran, but no useful response reached the user.

## Implementation Plan

## Implementation Status - 2026-05-23

Implemented:

- Deterministic supervisor types, digest helpers, status message selection, and finalization guard.
- `streamFastChat` observations for assistant deltas, LLM pass completion, tool calls, tool results, tool rounds, and final candidates.
- Supervisor decisions returned through `streamFastChat` metadata.
- `emit_status` mapped to existing `agent_state` SSE events for thinking-block-only progress updates.
- `force_synthesis` mapped to the existing no-tool synthesis path.
- Finalization guard applied before stream result return so persisted assistant text and visible deltas stay aligned.
- Supervisor decision and finalization guard telemetry recorded through `chat_turn_events`.
- Long-running operation heartbeat for both tool execution and LLM stream silence, routed through supervisor cadence limits and thinking-block `agent_state` updates.
- `chat_turn_checkpoints` migration and checkpoint service helpers for create with default 24-hour expiry, latest-active load with expiry filtering, soft consume, hard consume, explicit restore, status-aware stale recovery, and resume-system-message formatting.
- Endpoint resume injection: active checkpoints are loaded after session/active-turn resolution, soft-consumed after the new turn run exists, injected as hidden system context, and marked `resumed` only after successful completion.
- Failed or cancelled resumed turns restore their checkpoint to `active`; stale `resuming` checkpoints are recovered by inspecting the resume turn status so completed resume turns are marked `resumed` instead of being revived.
- Conservative `ask_user` handling for repeated validation-style write failures: the supervisor emits a question, the endpoint persists an active checkpoint, and the turn ends with `finished_reason = 'supervisor_question'`.
- Supervisor decision summary telemetry records action list plus trigger counts so deterministic monitor interventions are visible in hidden turn events.
- Admin chat session detail now highlights supervisor turn events with action, reason, source, trigger, question, and raw payload visibility.
- Prompt eval scenarios now cover supervisor question/checkpoint turns and finalization-guard answer recovery, with a `finished_reason` assertion for supervisor interruption.
- Focused tests for finalization guard, deterministic supervisor thresholds, stream integration, checkpoint service behavior, and route-level supervisor question persistence.

Deferred:

- Production calibration of the default thresholds after live traffic review.

Self-review notes:

- Supervisor failures must fail open. The current stream integration catches supervisor observation/digest errors and continues the main turn.
- Force synthesis should not preempt existing read-loop/context-ledger safeguards too early. The current default is intentionally conservative: six tool calls or six read-only rounds, while existing guards can synthesize earlier.
- Finalization guard summaries are deliberately generic in phase 1. Richer summaries should use persisted tool trace summaries or write-ledger summaries after we confirm the safety behavior in production-like turns.

## Next Implementation Plan

### Phase 2.5: Turn-Level Heartbeat - Complete

Files:

- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts`
- `apps/web/src/routes/api/agent/v2/stream/+server.ts`

Work:

- Add a turn-level supervisor heartbeat timer that emits `long_running_operation` observations for `llm_stream` or `turn_active`.
- Reuse supervisor cadence limits so status updates stay capped.
- Stop the timer on turn completion, cancellation, or error.
- Add a test with a delayed LLM stream that emits a thinking-block status before the model finishes.

Status:

- Implemented for `llm_stream` and `tool_execution`.
- Verified by a delayed LLM stream test in `stream-orchestrator.test.ts`.

### Phase 3A: Checkpoint Schema and Service - Complete

Files:

- `supabase/migrations/20260523000000_agentic_chat_turn_supervisor_checkpoints.sql`
- `apps/web/src/lib/services/agentic-chat-v2/turn-supervisor/checkpoint-service.ts`
- shared database types generated by the repo process

Work:

- Create `chat_turn_checkpoints`.
- Implement create, load latest active, mark resuming, mark resumed, and restore stale resuming checkpoint helpers.
- Add service tests around soft consume on turn start and hard consume on successful completion.

Status:

- Migration and service are implemented.
- Service tests cover active lookup, soft consume, hard consume, explicit restore, stale restore, status-aware stale recovery, and resume message formatting.
- Shared generated database types are not required by the service yet because it uses a narrow Supabase-like interface.

### Phase 3B: Resume Context Injection - Complete

Files:

- `apps/web/src/routes/api/agent/v2/stream/+server.ts`
- `apps/web/src/lib/services/agentic-chat-v2/session-service.ts` if history composition needs a helper

Work:

- Load latest active checkpoint before `streamFastChat`.
- Mark it `resuming` after the new turn run exists.
- Inject resume context as a system message.
- Mark it `resumed` only after the turn completes successfully.
- Restore or leave stale `resuming` checkpoints recoverable if the resumed turn fails.

Status:

- Implemented in the stream endpoint.
- Resume context is injected as a hidden system message after checkpoint soft-consume and before prompt context usage/snapshot/stream execution.
- Successful completion marks the checkpoint `resumed`; cancelled/failed resumed turns restore it to `active`.
- Stale `resuming` recovery now inspects `chat_turn_runs.status` so completed resume turns are marked `resumed` and failed/cancelled/orphaned resumes become active again.

### Phase 3C: Supervisor Ask-User Decision - Complete

Files:

- `apps/web/src/lib/services/agentic-chat-v2/turn-supervisor/deterministic-supervisor.ts`
- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts`
- `apps/web/src/routes/api/agent/v2/stream/+server.ts`

Work:

- Add conservative deterministic `ask_user` decisions for repeated non-inferable required-field failures and ambiguous targets.
- Persist checkpoint and assistant question.
- End current turn with `finished_reason = 'supervisor_question'` while keeping `chat_turn_runs.status = 'completed'`.
- Add tests for checkpoint creation and next-turn resume injection.

Status:

- Implemented for repeated validation-style write failures with no successful write.
- The stream orchestrator turns `ask_user` into the visible assistant question and stops the loop with `finished_reason = 'supervisor_question'`.
- The endpoint persists a `supervisor_question` checkpoint from the decision payload and emits a hidden `waiting_on_user` state update for the thinking block.
- Tests cover deterministic `ask_user` selection, stream interruption, checkpoint service behavior, route-level checkpoint creation/assistant metadata/final turn-run persistence for `finished_reason = 'supervisor_question'`, and route-level next-turn resume injection with checkpoint hard-consume on successful completion.

### Phase 0: Spec and Fixtures

- Add this spec.
- Identify 3-5 real turn exports that represent:
    - tools without final answer
    - repeated validation failure
    - long read loop
    - client detach then completed persistence

### Phase 1: Deterministic Supervisor Core

Files:

- `apps/web/src/lib/services/agentic-chat-v2/turn-supervisor/types.ts`
- `apps/web/src/lib/services/agentic-chat-v2/turn-supervisor/deterministic-supervisor.ts`
- `apps/web/src/lib/services/agentic-chat-v2/turn-supervisor/digest.ts`
- `apps/web/src/lib/services/agentic-chat-v2/turn-supervisor/status-messages.ts`
- `apps/web/src/lib/services/agentic-chat-v2/turn-supervisor/finalization-guard.ts`

Work:

- Build digest state from observations.
- Implement deterministic decisions.
- Add unit tests for thresholds and finalization guard.

### Phase 2: Orchestrator Integration

Files:

- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts`
- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/shared.ts`

Work:

- Add optional supervisor param to `streamFastChat`.
- Emit observations at safe boundaries.
- Handle `force_synthesis`, `stop_with_message`, and finalization guard.
- Return supervisor metadata in stream result.

### Phase 3: Endpoint Integration

Files:

- `apps/web/src/routes/api/agent/v2/stream/+server.ts`
- `apps/web/src/lib/services/agentic-chat-v2/turn-supervisor/checkpoint-service.ts`

Work:

- Instantiate supervisor with turn/session metadata.
- Convert `emit_status` to existing `agent_state` SSE.
- Record supervisor decisions in `chat_turn_events`.
- Persist active checkpoints for `ask_user`.
- Load active checkpoint on next request and inject resume context.

### Phase 4: Checkpoint Migration

Add migration:

- `supabase/migrations/YYYYMMDDHHMMSS_agentic_chat_turn_supervisor_checkpoints.sql`

Work:

- Create `chat_turn_checkpoints`.
- Add RLS policies.
- Add indexes.
- Regenerate shared database types if that is the repo process.

### Phase 5: Optional LLM Judge - Removed/Superseded

Original files, now removed:

- `apps/web/src/lib/services/agentic-chat-v2/turn-supervisor/llm-judge.ts`
- `apps/web/src/lib/services/agentic-chat-v2/turn-supervisor/llm-judge.test.ts`

Original work, superseded:

- Add JSON schema.
- Gate by an explicit runtime flag during rollout.
- Timeout and fallback to deterministic decision.

Status:

- Removed on 2026-06-11. The live supervisor is deterministic; trigger/digest telemetry remains.

### Phase 6: Admin and Evals

Work:

- Add supervisor event visibility to admin chat session detail.
- Extend prompt eval scenarios with:
    - no final answer after tools
    - repeated failure asks question or stops safely
    - long read loop forces synthesis
- Add metrics:
    - intervention count
    - force synthesis count
    - supervisor question count
    - finalization guard replacement count

## Acceptance Criteria

- Tool-using turns never persist only a pre-tool lead-in when successful writes or useful reads happened.
- A long silent turn emits at least one accurate status update without polluting final assistant content.
- Repeated failures produce either a targeted question or a safe stop message before exhausting the user experience.
- A supervisor question creates an active checkpoint and the next user message receives that checkpoint as resume context.
- Client disconnect still allows final turn persistence.
- Explicit Stop still cancels.
- Supervisor decisions are visible in admin/debug telemetry but hidden from normal users.

## Resolved Phase 1 Defaults

- Do not add `waiting_on_user` to `chat_turn_runs.status` in phase 1.
- Render long-running status updates only in the thinking/progress block.
- Use soft checkpoint consumption on next-turn start and hard consumption on successful completion.
- Default checkpoint expiry is 24 hours.

## Remaining Open Decisions

1. Should checkpoint expiry remain fixed at 24 hours or become context-specific after testing?

## Recommended Initial Defaults

- Status silence threshold: 10 seconds.
- Repeated status interval: 15 seconds.
- Max status updates per turn: 3.
- Force synthesis after: 6 tool calls or 6 read-only tool rounds without a write. Existing read-loop and context-ledger guards can synthesize earlier.
- Ask user after: 2 repeated missing-field failures where field cannot be inferred.
- Checkpoint expiry: 24 hours.

## References

- OpenAI Agents SDK guardrails: https://openai.github.io/openai-agents-js/guides/guardrails/
- OpenAI Agents SDK tracing: https://openai.github.io/openai-agents-python/tracing/
- OpenAI Agents SDK guide: https://developers.openai.com/api/docs/guides/agents
- LangChain subagents/supervisor pattern: https://docs.langchain.com/oss/python/langchain/multi-agent/subagents
- LangGraph persistence: https://docs.langchain.com/oss/javascript/langgraph/persistence
- LangGraph interrupts: https://docs.langchain.com/oss/python/langgraph/interrupts
- Local detached turn plan: `docs/specs/AGENTIC_CHAT_DETACHED_TURN_EXECUTION_PLAN.md`
- Local deterministic behavior assessment: `docs/reports/agentic-chat-deterministic-behavior-assessment-2026-04-21.md`
