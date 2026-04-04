<!-- docs/specs/AGENTIC_CHAT_PROMPT_OBSERVABILITY_SPEC.md -->

# Agentic Chat Prompt Observability Spec

**Date:** 2026-04-03  
**Status:** Draft  
**Scope:** Database-backed prompt snapshots, turn-run tracing, admin analysis, and acceptance-harness support for FastChat v2.

## Objective

Persist the exact prompt/run artifacts for agentic chat in the database so BuildOS can:

- inspect what the model actually saw
- correlate prompt shape to tool behavior and answer quality
- replay and analyze problematic turns
- run acceptance scenarios and store pass/fail results programmatically

## Problem

Current observability is fragmented.

### Current artifacts

- local prompt dumps in dev only
- tool trace summary embedded in assistant message metadata
- executed tool rows in `chat_tool_executions`
- LLM usage rows in `llm_usage_logs`
- timing summary rows in `timing_metrics`
- admin session detail reconstructed from multiple sources

### Current limitations

- no first-class turn record
- no persisted prompt snapshot
- no durable record of attempted but invalid tool calls
- no durable record of skill request/load activity
- no easy query for “which runs misrouted away from overview?”
- no stored eval assertions or scenario outcomes

## Design Principles

### 1. Turn-first, not session-first

The unit of prompt analysis is a single streamed turn, not the whole chat session.

### 2. Structured before rendered

The primary artifact should be structured JSON plus exact text fields, not only a rendered `.txt` dump.

### 3. Reuse existing telemetry tables

Do not replace `chat_messages`, `chat_tool_executions`, `llm_usage_logs`, or `timing_metrics`. Correlate them.

### 4. Same artifacts for debugging and evals

The acceptance harness should use the same stored turn-run artifacts that admins inspect.

### 5. Sensitive by default

Prompt snapshots contain internal instructions and private user context. Treat them as admin/service-only artifacts.

## Canonical Correlation Key

Use `stream_run_id` as the canonical run-level correlation key.

### Rules

- If the client provides `stream_run_id`, preserve it.
- If the client does not provide it, the server must generate one before streaming begins.
- Every persisted artifact for that turn must be linkable to the same run.

`client_turn_id` remains useful for idempotency and client correlation, but `stream_run_id` is the durable turn-run key.

## Proposed Data Model

## 1. `chat_turn_runs`

One row per streamed user turn.

### Purpose

- primary join surface for prompt/run analysis
- one summary record per turn

### Columns

- `id UUID PRIMARY KEY`
- `session_id UUID NOT NULL REFERENCES chat_sessions(id)`
- `user_id UUID NOT NULL REFERENCES users(id)`
- `stream_run_id TEXT NOT NULL`
- `client_turn_id TEXT NULL`
- `source TEXT NOT NULL`
    - examples: `live_ui`, `admin_replay`, `eval_runner`, `api_manual`
- `context_type TEXT NOT NULL`
- `entity_id UUID NULL`
- `project_id UUID NULL`
- `gateway_enabled BOOLEAN NOT NULL DEFAULT false`
- `request_message TEXT NOT NULL`
- `user_message_id UUID NULL REFERENCES chat_messages(id)`
- `assistant_message_id UUID NULL REFERENCES chat_messages(id)`
- `status TEXT NOT NULL`
    - examples: `running`, `completed`, `failed`, `cancelled`
- `finished_reason TEXT NULL`
- `tool_round_count INTEGER NOT NULL DEFAULT 0`
- `tool_call_count INTEGER NOT NULL DEFAULT 0`
- `validation_failure_count INTEGER NOT NULL DEFAULT 0`
- `llm_pass_count INTEGER NOT NULL DEFAULT 0`
- `first_lane TEXT NULL`
    - examples: `overview`, `skill_first`, `direct_exact_op`, `unknown`
- `first_help_path TEXT NULL`
- `first_skill_path TEXT NULL`
- `first_canonical_op TEXT NULL`
- `history_strategy TEXT NULL`
- `history_compressed BOOLEAN NULL`
- `raw_history_count INTEGER NULL`
- `history_for_model_count INTEGER NULL`
- `cache_source TEXT NULL`
- `cache_age_seconds NUMERIC NULL`
- `request_prewarmed_context BOOLEAN NULL`
- `prompt_snapshot_id UUID NULL`
- `timing_metric_id UUID NULL`
- `started_at TIMESTAMPTZ NOT NULL`
- `finished_at TIMESTAMPTZ NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`
- `updated_at TIMESTAMPTZ NOT NULL DEFAULT now()`

### Constraints / indexes

- unique index on `stream_run_id`
- index on `(session_id, created_at desc)`
- index on `(context_type, created_at desc)`
- index on `(first_canonical_op, created_at desc)`
- index on `(first_skill_path, created_at desc)`
- index on `(status, created_at desc)`

## 2. `chat_prompt_snapshots`

One row per turn-run containing the exact prompt/model input artifacts.

### Purpose

- preserve what the model actually saw
- enable prompt diffing, clustering, and analysis
- replace file dumps as the system of record

### Columns

- `id UUID PRIMARY KEY`
- `turn_run_id UUID NOT NULL UNIQUE REFERENCES chat_turn_runs(id) ON DELETE CASCADE`
- `snapshot_version TEXT NOT NULL`
- `system_prompt TEXT NOT NULL`
- `model_messages JSONB NOT NULL`
- `tool_definitions JSONB NULL`
- `request_payload JSONB NULL`
- `prompt_sections JSONB NULL`
- `context_payload JSONB NULL`
- `rendered_dump_text TEXT NULL`
- `system_prompt_sha256 TEXT NOT NULL`
- `messages_sha256 TEXT NOT NULL`
- `tools_sha256 TEXT NULL`
- `system_prompt_chars INTEGER NOT NULL`
- `message_chars INTEGER NOT NULL`
- `approx_prompt_tokens INTEGER NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

### Notes

- `model_messages` should be the exact array sent to the model after history composition.
- `rendered_dump_text` is optional. It can be generated server-side for human debugging, but structured fields are the primary artifact.

## 3. `chat_turn_events`

Append-only event log for significant run events.

### Purpose

- capture attempted tool calls, validation failures, skill activity, and routing events that are not fully represented in typed tables

### Columns

- `id UUID PRIMARY KEY`
- `turn_run_id UUID NOT NULL REFERENCES chat_turn_runs(id) ON DELETE CASCADE`
- `session_id UUID NOT NULL REFERENCES chat_sessions(id)`
- `stream_run_id TEXT NOT NULL`
- `sequence_index INTEGER NOT NULL`
- `phase TEXT NOT NULL`
    - examples: `prompt`, `llm`, `tool`, `stream`, `finalize`
- `event_type TEXT NOT NULL`
    - examples:
        - `prompt_snapshot_created`
        - `llm_pass_completed`
        - `tool_call_emitted`
        - `tool_call_validation_failed`
        - `tool_result_received`
        - `skill_requested`
        - `skill_loaded`
        - `context_shift_emitted`
        - `done_emitted`
- `payload JSONB NOT NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

### Why an event table is needed

`chat_tool_executions` is valuable, but it is not enough by itself because acceptance debugging needs more than successful executions:

- attempted invalid tool calls
- help-path selection
- skill request/load events
- repair-path transitions

## 4. Eval tables

### `chat_prompt_eval_runs`

Stores one evaluation execution linked to a turn run.

Columns:

- `id UUID PRIMARY KEY`
- `turn_run_id UUID NOT NULL REFERENCES chat_turn_runs(id) ON DELETE CASCADE`
- `scenario_slug TEXT NOT NULL`
- `scenario_version TEXT NOT NULL`
- `runner_type TEXT NOT NULL`
    - examples: `admin_manual`, `scheduled`, `ci`, `local_cli`
- `status TEXT NOT NULL`
    - examples: `passed`, `failed`, `error`
- `summary JSONB NOT NULL`
- `started_at TIMESTAMPTZ NOT NULL`
- `completed_at TIMESTAMPTZ NULL`
- `created_by UUID NULL REFERENCES users(id)`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

### `chat_prompt_eval_assertions`

Stores per-assertion results for an eval run.

Columns:

- `id UUID PRIMARY KEY`
- `eval_run_id UUID NOT NULL REFERENCES chat_prompt_eval_runs(id) ON DELETE CASCADE`
- `assertion_key TEXT NOT NULL`
- `status TEXT NOT NULL`
    - examples: `passed`, `failed`, `skipped`
- `expected JSONB NULL`
- `actual JSONB NULL`
- `details TEXT NULL`
- `created_at TIMESTAMPTZ NOT NULL DEFAULT now()`

## Changes To Existing Tables

## `chat_tool_executions`

Add:

- `turn_run_id UUID NULL REFERENCES chat_turn_runs(id)`
- `stream_run_id TEXT NULL`
- `client_turn_id TEXT NULL`
- `tool_round INTEGER NULL`
- `sequence_index INTEGER NULL`
- `gateway_op TEXT NULL`
- `help_path TEXT NULL`
- `was_executed BOOLEAN NOT NULL DEFAULT true`

### Why

- allows direct join from run to executed tool rows
- separates executed rows from validation-only failures when needed

## `llm_usage_logs`

Add:

- `turn_run_id UUID NULL REFERENCES chat_turn_runs(id)`
- `stream_run_id TEXT NULL`
- `client_turn_id TEXT NULL`
- `pass_index INTEGER NULL`

### Why

- run-level correlation
- pass-level analysis
- direct mapping from prompt snapshot to LLM pass

## `timing_metrics`

Add:

- `turn_run_id UUID NULL REFERENCES chat_turn_runs(id)`

### Why

- one-hop join from run to timing row

## Persistence Flow

## Request start

1. Resolve or generate `stream_run_id`
2. Create `chat_turn_runs` row with `status = running`
3. Build prompt snapshot payload
4. Persist `chat_prompt_snapshots`
5. Update `chat_turn_runs.prompt_snapshot_id`

## During streaming

Persist significant `chat_turn_events`:

- LLM pass metadata
- tool call emitted
- tool validation failure
- tool result received
- skill requested / loaded
- context shift
- terminal status

## During existing persistence

When the route persists:

- `chat_messages`
- `chat_tool_executions`
- `llm_usage_logs`
- `timing_metrics`

it should attach `turn_run_id` and `stream_run_id`.

## Request completion

Update `chat_turn_runs` with:

- `assistant_message_id`
- `status`
- `finished_reason`
- `tool_round_count`
- `tool_call_count`
- `validation_failure_count`
- `llm_pass_count`
- first lane / skill / help path / op summary
- `finished_at`

## Prompt Snapshot Contents

The snapshot should preserve:

- exact system prompt text
- exact message array sent to the model
- exact tool definitions exposed to the model
- exact user message for the turn
- exact context payload used to build the prompt
- history composition metadata

Suggested `prompt_sections` structure:

```json
{
	"context_type": "global",
	"project_id": null,
	"entity_id": null,
	"gateway_enabled": true,
	"history_strategy": "compressed_summary_tail",
	"history_raw_count": 12,
	"history_for_model_count": 5,
	"system_prompt_sections": [
		"identity",
		"response_pattern",
		"buildos_capabilities",
		"capability_system",
		"skill_catalog",
		"tool_discovery"
	],
	"current_user_message": "What's going on with 9takes?"
}
```

## Admin Surface Requirements

## Extend existing admin tooling

Current admin session tooling is already valuable. Build on it.

### Add to session detail

- list of turn runs for the session
- prompt snapshot viewer
- event trace viewer
- “first lane / first skill / first op” summary
- direct links to matching tool rows and LLM usage rows

### Add run list API

Example endpoint:

- `GET /api/admin/chat/runs`

Filter ideas:

- date range
- context type
- first lane
- first op
- first skill
- finished reason
- validation failure present
- scenario slug

### Add run detail API

Example endpoint:

- `GET /api/admin/chat/runs/:id`

Returns:

- run summary
- prompt snapshot
- events
- linked tool rows
- linked llm rows
- linked timing row
- linked eval results if present

## Acceptance Harness Requirements

## Scenario model

The harness should support assertions like:

- first lane is `overview`
- first canonical op is `util.workspace.overview`
- first skill path is `workflow.audit.skill`
- disallowed op did not occur before allowed op
- validation failure count is zero
- final answer contains expected entity or project names
- no scratchpad leakage detected

## Recommended scenario source of truth

### Phase 1

Store scenario definitions in repo for version control.

### Phase 2

Optionally mirror them into DB for admin editing or ad hoc scenarios.

## Runner behavior

When a scenario is executed:

1. Start a run with explicit `source = eval_runner`
2. Use the normal FastChat route
3. Capture regular run artifacts in the same observability tables
4. Evaluate assertions after completion
5. Persist results to eval tables

## Security Model

Prompt snapshots and turn events are sensitive.

### Requirements

- admin-only read access
- service-role or secure server-only write path
- no direct end-user API access
- no persistence of secrets or auth headers

### Practical implementation

Use an admin Supabase client or secure server-only insert path for:

- `chat_turn_runs`
- `chat_prompt_snapshots`
- `chat_turn_events`
- eval tables

Regular chat session/message storage can remain on the existing user-scoped path.

## Retention Strategy

### Recommended default

- eval/admin replay runs: retain long-term
- sampled live runs: retain 30-90 days initially
- allow pinning specific runs for long-term debugging

### Why

Prompt snapshots are large and sensitive. Full retention for every live turn should be a deliberate policy choice, not the initial default.

## Migration Strategy

### Phase 1 migrations

- create `chat_turn_runs`
- create `chat_prompt_snapshots`
- create `chat_turn_events`
- add nullable correlation columns to existing tables

### Backfill

Do not attempt to backfill old prompt snapshots. They do not exist in structured form.

Limited backfill is acceptable for:

- `stream_run_id` from message metadata where recoverable
- timing row correlation where safe

## Success Criteria

The system is successful when:

- every eval run has a queryable prompt snapshot in DB
- every run can be joined to tool, LLM, timing, and message artifacts directly
- admins can inspect prompt/run traces without needing local `.prompt-dumps` files
- we can answer questions like:
    - “How often did workspace summary miss overview routing this week?”
    - “Which runs loaded `workflow.audit.skill` and still failed?”
    - “Which prompt family correlates with missing required parameter failures?”

## Non-Goals

- replacing existing session/message persistence
- storing every streaming text delta
- building a generic ML experiment platform
- solving all answer-quality evaluation in V1

## Recommended First Implementation Slice

Build the smallest slice that makes the system real:

1. `chat_turn_runs`
2. `chat_prompt_snapshots`
3. correlation into `chat_tool_executions`, `llm_usage_logs`, and `timing_metrics`
4. one admin run-detail API
5. one acceptance scenario runner using stored run artifacts

That is enough to move from local prompt dumps and anecdotal debugging to real prompt observability.
