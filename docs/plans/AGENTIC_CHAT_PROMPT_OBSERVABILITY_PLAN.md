<!-- docs/plans/AGENTIC_CHAT_PROMPT_OBSERVABILITY_PLAN.md -->

# Agentic Chat Prompt Observability Plan

**Date:** 2026-04-03  
**Status:** Proposed  
**Scope:** FastChat v2 prompt capture, turn-run tracing, admin analysis, and acceptance harness foundations.

## Goal

Build a proper end-to-end prompt acceptance system for BuildOS agentic chat by making prompt snapshots, tool traces, skill activity, and run outcomes queryable in the database.

The system should support:

- live-turn observability
- admin debugging and replay
- prompt/programmatic analysis
- acceptance tests for key user prompts

## Current Assessment

### What exists today

- Dev-only prompt dumps are written to local files in `/Users/djwayne/buildos-platform/apps/web/.prompt-dumps/` from [`stream-orchestrator.ts`](/Users/djwayne/buildos-platform/apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator.ts).
- Assistant message metadata stores a compact tool trace:
    - `fastchat_tool_trace_v1`
    - `fastchat_tool_trace_summary`
- Executed tool rows are persisted to [`chat_tool_executions`](/Users/djwayne/buildos-platform/packages/shared-types/src/database.types.ts#L2469) from [`+server.ts`](/Users/djwayne/buildos-platform/apps/web/src/routes/api/agent/v2/stream/+server.ts#L1782).
- LLM usage is persisted to [`llm_usage_logs`](/Users/djwayne/buildos-platform/packages/shared-types/src/database.types.ts#L3891).
- Timing rows are persisted to `timing_metrics` with `stream_run_id` inside metadata from [`+server.ts`](/Users/djwayne/buildos-platform/apps/web/src/routes/api/agent/v2/stream/+server.ts#L2201).
- Admin session tooling already reconstructs session detail from:
    - `chat_sessions`
    - `chat_messages`
    - `chat_tool_executions`
    - `llm_usage_logs`
    - `chat_operations`
    - `timing_metrics`

### What is missing

- No first-class per-turn run table keyed by `stream_run_id`
- No prompt snapshot stored in Postgres
- No structured representation of what the model actually saw
- No durable event trace for attempted tool calls, validation failures, skill loads, and routing decisions
- No direct programmatic join from a turn to:
    - the prompt
    - the first op family
    - the skills requested/loaded
    - each LLM pass
    - the final answer
- No scenario registry or eval-result storage for acceptance tests
- No admin query surface for prompt families, repeated failure patterns, or lane/skill regressions

## Core Recommendation

Make the **turn run** the primary unit of observability.

Today the system is mostly session-centric. For prompt analysis and acceptance testing, that is the wrong grain. The atomic thing we need is:

- one user turn
- one prompt snapshot
- one or more LLM passes
- zero or more tool attempts/executions
- one final answer or terminal failure

The existing `stream_run_id` is the right anchor for this. It already exists in the FastChat request flow and should become the canonical correlation key.

## Proposed Architecture

### Layer 1: Turn-run observability

Add a DB-backed observability layer centered on:

- `chat_turn_runs`
- `chat_prompt_snapshots`
- `chat_turn_events`

These become the system of record for prompt/run analysis.

### Layer 2: Existing typed analytics tables remain

Keep and continue using:

- `chat_messages`
- `chat_tool_executions`
- `llm_usage_logs`
- `timing_metrics`

But enrich them with `turn_run_id` and/or `stream_run_id` so they join cleanly back to the run.

### Layer 3: Acceptance harness on top of observability

Build the acceptance harness on the same stored turn-run data rather than inventing a parallel trace system.

That means:

- replayed/admin-triggered prompts create normal turn-run rows
- eval assertions point to those runs
- admin tooling and automated tests inspect the same artifacts

## Delivery Phases

## Phase 1: Establish turn-run storage

### Outcome

Every FastChat turn gets a first-class row and durable prompt snapshot in Postgres.

### Work

- Guarantee `stream_run_id` exists for every streamed request.
- Add `chat_turn_runs`.
- Add `chat_prompt_snapshots`.
- Add `chat_turn_events`.
- Add server-side persistence of:
    - prompt snapshot
    - routing/debug metadata
    - significant trace events
- Keep local file dumps in dev as a convenience mirror, not the source of truth.

### Why this phase first

Without a turn-run record, everything else is fragmented and brittle.

## Phase 2: Correlate existing telemetry

### Outcome

A single turn can be joined to tool rows, LLM usage rows, timing rows, and messages without heuristics.

### Work

- Add `turn_run_id` and `stream_run_id` correlation to `chat_tool_executions`.
- Add `turn_run_id`, `stream_run_id`, and `pass_index` correlation to `llm_usage_logs`.
- Add `turn_run_id` to `timing_metrics`.
- Store `user_message_id` and `assistant_message_id` on `chat_turn_runs`.
- Add derived summary fields on `chat_turn_runs`:
    - first help path
    - first skill path
    - first canonical op
    - first lane
    - tool round count
    - validation failure count

## Phase 3: Admin analysis surfaces

### Outcome

Admins can inspect prompt snapshots and trace runs directly from the app.

### Work

- Extend the admin chat session detail flow to show turn runs grouped by `stream_run_id`.
- Add prompt snapshot tab or panel.
- Add searchable filters:
    - context type
    - first op
    - first skill
    - finished reason
    - validation failure
    - prompt hash
- Add prompt/run comparison for two runs of the same scenario or same prompt family.

## Phase 4: Acceptance harness

### Outcome

We can run curated scenarios, store results, and detect regressions automatically.

### Work

- Add scenario registry
- Add eval run storage
- Add assertion result storage
- Add admin or CLI-triggered replay runner
- Start with single-turn scenarios from the existing prompt test plan

Recommended initial scenarios:

- workspace overview
- named project overview
- shared project visibility
- ambiguous project name
- calendar update with required ID resolution
- workflow audit
- failure-recovery for missing required parameters
- scratchpad leakage prevention

## Phase 5: Analysis and regression reporting

### Outcome

Prompt failures become queryable patterns instead of anecdotal UI observations.

### Work

- Add queries/views for:
    - validation-failure clusters
    - lane misrouting frequency
    - skill load frequency
    - prompt size vs failure correlation
    - repeated first-op regressions per scenario
- Add prompt-family grouping by prompt hash/signature
- Add eval trend views by branch/build/model

## What Should Be Stored

For each run, the DB should capture:

- exact model messages sent
- exact tools exposed
- request envelope
- context metadata
- history strategy
- gateway flag state
- prompt size metrics
- LLM pass metadata
- attempted tool calls
- validation failures
- executed tool results
- skill requested/loaded events
- final answer
- finished reason
- timing summary

## What Should Not Be Stored

- auth headers
- provider API keys
- cookies
- raw bearer tokens
- unbounded streaming text deltas

## Security And Privacy Direction

- Raw prompt snapshots should be admin/service-only.
- They should not be part of the normal end-user chat read path.
- Writes for prompt snapshots should use a service-role client or secure server-only path.
- Keep targeted redaction for known sensitive values where needed, but preserve enough fidelity for debugging.

## Proposed Rollout Strategy

### Step 1

Capture all eval/admin-triggered runs and keep live-user capture disabled or sampled.

### Step 2

Enable sampled live-user capture in production once storage shape and admin tooling are stable.

### Step 3

Enable broader capture only if:

- storage cost is acceptable
- redaction policy is settled
- admin tools are good enough to actually use the data

## Testing Strategy

### Unit / integration

- prompt snapshot serializer
- turn-run summary derivation
- event persistence
- correlation into `chat_tool_executions`
- correlation into `llm_usage_logs`
- admin payload builders for turn runs

### Acceptance

Use the scenario matrix in [AGENTIC_CHAT_PROMPT_TEST_PLAN.md](/Users/djwayne/buildos-platform/docs/testing/AGENTIC_CHAT_PROMPT_TEST_PLAN.md) as the initial harness input set.

### Manual admin validation

- run one prompt from UI
- confirm a `chat_turn_runs` row exists
- confirm prompt snapshot can be opened in admin
- confirm first op / first skill / finished reason match the actual run
- confirm trace includes invalid attempted calls when they occur

## Recommended Build Order

1. `chat_turn_runs`
2. `chat_prompt_snapshots`
3. `chat_turn_events`
4. Correlation into existing tables
5. Admin read APIs
6. Admin UI
7. Eval scenario runner
8. Assertion engine

## Decision Summary

The right path is not to improve local prompt dumps. The right path is to replace them as the primary artifact with DB-backed turn runs and prompt snapshots, then build the acceptance harness on top of that same observability layer.
