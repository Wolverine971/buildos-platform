<!-- tasker/68-agentic-chat-worker-activity-log-session-attribution.md -->

# 68 — Agentic Chat: worker activity-log session attribution

**Created 2026-08-27.** Split from
[tasker 66](66-agentic-chat-tool-execution-graph.md) after serial and concurrent production mutation
canaries exposed the same best-effort activity-log failure.

**Status: complete (2026-08-27).** Local gateway/adapter coverage and the production mutation
canary both verify the corrected attribution contract.

## Kernel

Internal agentic-chat mutations use `chat_sessions.id`, but worker mutation adapters passed that UUID
through the shared gateway as `callSessionId`. The gateway correctly interprets that field as an
external `agent_call_sessions.id` and writes it to `onto_project_logs.agent_call_session_id`.
Postgres then rejects the activity row on the foreign key:

```text
onto_project_logs_agent_call_session_id_fkey
```

The domain mutation and authoritative `chat_turn_effects` receipt still succeed, but the project
activity feed silently loses one row per mutation and the worker emits noisy error logs.

## Correct contract

- External agent calls may populate `agent_call_session_id` from a real `agent_call_sessions` row.
- Internal agentic-chat worker calls populate `chat_session_id` from `chat_sessions`.
- The two identifiers are not interchangeable even though both are UUIDs.
- Do not weaken or remove either foreign key to hide an attribution bug.

## Implementation

- Added an explicit internal `chatSessionId` field to the shared worker gateway context.
- Passed the agentic-chat claim's session ID through that field from every worker mutation adapter.
- Forwarded `chatSessionId` to every shared gateway activity-log call.
- Left the external `callSessionId` path unchanged and kept `agent_call_session_id` null for
  internal worker calls.

No database migration is required: both attribution columns and their foreign keys already express
the intended contract. The defect was exclusively at the TypeScript gateway boundary.

## Test-first acceptance

- A real shared-gateway task mutation inserts an `onto_project_logs` row with the worker chat UUID
  in `chat_session_id` and `agent_call_session_id = null`.
- Shared task side effects pass internal chat attribution separately from external actor context.
- Every worker mutation adapter passes `chatSessionId`, never `callSessionId`.
- External gateway tests retain their existing `agent_call_session_id` behavior.
- A production mutation canary produces the expected activity rows with no
  `AsyncActivityLogger`/foreign-key errors.

## Exit

Focused worker/shared-agent-ops tests, source type-checking, and a production mutation canary are
green; the activity row is queryable by `chat_session_id`; the worker error scan is clean.

Local verification is green: all worker mutation-adapter attribution tests, the shared activity-log
tests, the 171-test shared-agent-ops suite, the 1,325-test worker suite, and both package typechecks
pass.

Production verification is also green on release
`c014b5ff4bcd74e99ef1c87457dee99c88156e8e`. The permanent pre-teardown assertion in
`task-multi-update` observed exactly three updated-task activity rows for the canary's internal chat
session, all with `agent_call_session_id = null`. All three authoritative effects succeeded, and a
deployment-wide 30-minute log scan contained no `AsyncActivityLogger` error.
