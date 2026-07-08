<!-- apps/web/docs/technical/audits/AGENTIC_CHAT_PERFORMANCE_SPEED_AUDIT_TASKER_2026-07-07.md -->

# Agentic Chat Performance & Raw Speed Audit Tasker - 2026-07-07

Status: Draft 0.2 - starter audit opened from the 2026-07-01 deep backend audit, updated after the first 2026-07-07/08 performance cleanup pass.

Source audit:

- `apps/web/docs/technical/audits/AGENTIC_CHAT_BACKEND_AUDIT_2026-07-01_DEEP.md`

Related docs:

- `apps/web/docs/technical/audits/AGENTIC_CHAT_READ_TOOL_PARALLELIZATION_PLAN_2026-07-06.md`
- `apps/web/docs/technical/audits/AGENTIC_CHAT_STREAM_ORCHESTRATOR_SIMPLIFICATION_PLAN_2026-07-07.md`
- `apps/web/docs/technical/audits/AGENTIC_CHAT_WAVE_4_CORRECTNESS_COST_PLAN_2026-07-06.md`
- `apps/web/docs/technical/audits/AGENTIC_CHAT_FLOW_AUDIT_FOLLOWUPS_2026-07-06.md`

## Positioning

The 2026-07-01 deep audit correctly leaves **Wave 3 security hardening** as the next safety pass. This tasker is a parallel performance track. Do not use it to bury the remaining injection/access/rate-limit work.

The performance target is narrower: make live chat feel faster by reducing time-to-first-event, time-to-first-response, context-build latency, unnecessary prompt tokens, tool-round wall clock, and hidden write amplification.

## Current Baseline From Static + Script Pass

Read batching is now present in the current code:

- `streamFastChat` accepts `batchToolExecutor` at `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts:114`.
- Contiguous pure-read batching is implemented at `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts:1284`.
- The stream route wires `ToolExecutionService.batchExecuteTools(..., 3, { abortSignal })` at `apps/web/src/routes/api/agent/v2/stream/+server.ts:3762`.

Tool surface size baseline from:

```bash
./node_modules/.bin/tsx --tsconfig apps/web/tsconfig.json apps/web/scripts/report-agentic-tool-surface-sizes.ts
```

Key profiles after the D1 launch-surface trim:

| Surface                        | Tools |  Chars | Est. tokens |
| ------------------------------ | ----: | -----: | ----------: |
| `project_create_minimal`       |     1 |  5,774 |       1,444 |
| `project_calendar`             |    13 | 10,607 |       2,652 |
| `project_basic`                |    14 | 10,571 |       2,643 |
| `global_basic`                 |    11 |  9,659 |       2,415 |
| `project_write`                |    18 | 18,799 |       4,700 |
| `global_write` / `daily_brief` |    18 | 19,540 |       4,885 |
| `project_document`             |    18 | 16,073 |       4,019 |
| `project_write_document`       |    20 | 20,563 |       5,141 |

The current largest speed lever is still prompt/tool-surface size. The first trim removed roughly 1.2K-1.3K estimated tokens from several common launch surfaces. A misrouted project turn can still add roughly 2K-2.5K prompt tokens before the model reads the user message.

Timing primitives exist and now include the first hot-path splits:

- `timing_metrics` records `context_build_ms`, `tool_selection_ms`, `time_to_first_event_ms`, `time_to_first_response_ms`, and total request time in `apps/web/src/lib/services/agentic-chat-v2/turn-observability-writer.ts:242`.
- `timing_metrics.metadata.timing_summary.phases` also records `active_turn_lookup_ms`, `turn_admission_ms`, `prepared_prompt_consume_ms`, and `prompt_snapshot_insert_ms`.
- It still does not split context RPC vs fallback internals, Start Here load, live vision prep, or per-LLM-pass first byte.

## Starter Findings

### P1. Prompt snapshot insert blocks the first LLM pass

Addressed in the current working tree. The stream route now captures a deferred prompt-snapshot persistence closure when prompt context is ready, but it does not build or insert the snapshot before calling `streamFastChat`. The snapshot task is scheduled after the first text delta is emitted; tool-only or empty-text turns schedule it after `streamFastChat` returns. Thrown cancellation/error paths schedule the same detached task after emitting their terminal response path.

References:

- Prompt snapshot closure is prepared after context is ready in `apps/web/src/routes/api/agent/v2/stream/+server.ts`.
- The first `onDelta` schedules the detached snapshot task after the text delta has been emitted.
- `TurnObservabilityWriter.flushWithBudget(...)` still gives the detached snapshot task a bounded chance to persist before the stream closes.

Why it matters:

- Snapshot build + insert is no longer on the user-visible hot path before the first model byte.
- The snapshot contains full prompt material, tool definitions, context payload, sections, cost breakdown, and tool surface report.
- Observability remains available through the detached snapshot row, `prompt_snapshot_created` event, and turn-run `prompt_snapshot_id` link when the insert succeeds.

Recommended next scan:

- Compare p50/p95 time-to-first-response before/after the deferred snapshot path.
- Check `prompt_snapshot_created` event rate and `chat_turn_runs.prompt_snapshot_id` fill rate after deploy.
- Consider sampling prompt snapshots if detached snapshot persistence still pressures total request time or flush budget.

### P1. Turn admission and prepared prompt consumption happen late

Partially addressed in the current working tree. The route now inserts the authoritative `chat_turn_runs` row before prepared-prompt consumption, history loading, context loading, or prompt construction. The prepared prompt is no longer consumed by a request that loses the running-turn unique constraint.

References:

- Session resolves at `apps/web/src/routes/api/agent/v2/stream/+server.ts:2616`.
- Active-turn lookup happens at `apps/web/src/routes/api/agent/v2/stream/+server.ts:2649`.
- Running turn row is now inserted before `consumePreparedPrompt`.
- Prepared prompt consumption is extracted to `apps/web/src/lib/services/agentic-chat-v2/prepared-prompt-consumer.ts`.

Why it matters:

- This closes the most direct prepared-prompt race: a losing request should not burn a prewarmed prompt.
- Work done before admission is now limited to auth/access, session resolution, active-turn cleanup, and stale supervisor checkpoint recovery.
- Prepared prompt consume now has its own timing so the hit path can be measured separately from history/context work.

Recommended next scan:

- Verify in production telemetry that `prepared_prompt_hit=false` / conflict turns no longer update `agentic_chat_prepared_prompts.consumed_at`.
- Consider moving stale supervisor checkpoint recovery after admission if its query cost shows up in p95 time-to-admission.

### P1. Context RPC still pays a Start Here side query

Partially addressed. Project context still attaches Start Here with an extra side query, but the loader now fetches candidate metadata first and fetches `content` only for the selected Start Here document.

References:

- RPC path starts at `apps/web/src/lib/services/agentic-chat-v2/context-loader.ts:2897`.
- On project RPC success, it still calls `attachProjectStartHere(...)` at `apps/web/src/lib/services/agentic-chat-v2/context-loader.ts:2909`.
- `loadProjectStartHereDocument` fetches Start Here candidates without `content`, then fetches body content for the selected document only.

Why it matters:

- This adds an extra DB round trip to the "fast" RPC path.
- It no longer fetches full content for up to 20 candidates.
- The same work hits prewarm and live fresh-load turns.

Recommended next scan:

- Move Start Here selection into the context RPC if the remaining side query shows up in p95 context builds.
- Add `start_here_load_ms` telemetry.
- Compare project fresh-load `context_build_ms` with and without Start Here content.

### P1. Fallback project/entity context remains unbounded

Confirmed. The fallback path still fetches broad entity sets and limits mostly in JS, not SQL.

References:

- Project fallback loads all goals, milestones, plans, tasks, members, and documents for a project with no SQL limits on the main entity sets at `apps/web/src/lib/services/agentic-chat-v2/context-loader.ts:2429`.
- Tasks select descriptions and no `.limit()` at `apps/web/src/lib/services/agentic-chat-v2/context-loader.ts:2455`.
- Focus entity uses `.select('*')` at `apps/web/src/lib/services/agentic-chat-v2/context-loader.ts:2648`.
- Global fallback pushes some limits, but still loads all project ids before querying related tables at `apps/web/src/lib/services/agentic-chat-v2/context-loader.ts:2201`.

Why it matters:

- Fallback should be rare, but when it occurs it can become the slowest path for large projects.
- Focused document chats can pull full document bodies into context, session cache, and prepared-prompt rows.

Recommended next scan:

- Make RPC-null/fallback rate visible in `timing_metrics`.
- Push top-N limits into SQL for fallback tasks/goals/plans/documents.
- Replace `select('*')` focus loads with a per-entity column whitelist and capped text fields.

### P2. Project surface routing can inflate prompt size on read-only wording

Confirmed. The project surface router still uses broad regexes. `looksLikeProjectMutationTurn` treats words like `update`, `progress`, `done`, and `task` as mutation signals.

References:

- Project routing picks `project_write`, `project_document`, or `project_write_document` at `apps/web/src/lib/services/agentic-chat-v2/tool-selector.ts:48`.
- Mutation regex lives at `apps/web/src/lib/services/agentic-chat-v2/tool-selector.ts:74`.
- `project_basic` is ~3,871 tokens; `project_write` is ~5,928 tokens; `project_write_document` is ~6,468 tokens from the size script.

Why it matters:

- "Update me on the project" can route to a write-heavy profile even when the turn is read-only.
- The user pays this cost on every LLM pass in the turn.
- It also increases the chance of unnecessary tool deliberation.

Recommended next scan:

- Reuse the stricter mutation-intent classifier being built for Wave 4, or add read/status phrase negatives directly to the surface router.
- Persist selected `prepared_surface_profile` / `surface_profile` in timing analytics and compare latency by profile.
- Add regression cases for read-only "update me / catch me up / status" prompts.

### P2. Prepared prompt prewarm builds four project surfaces every time

Confirmed. Project and ontology prewarm prepares `project_basic`, `project_write`, `project_document`, and `project_write_document`.

References:

- `resolvePreparedSurfaceProfiles(project|ontology)` returns four profiles at `apps/web/src/lib/services/agentic-chat-v2/prepared-prompt-cache.ts:188`.
- Prewarm builds each surface sequentially at `apps/web/src/routes/api/agent/v2/prewarm/+server.ts:200`.
- It stores `context_payload`, `history_for_model`, and `prepared_surfaces` in one row at `apps/web/src/routes/api/agent/v2/prewarm/+server.ts:223`.

Why it matters:

- This shifts latency off the send path only when the prepared prompt is actually consumed.
- It increases DB write size and CPU on chat open.
- It may be the right trade only if hit rate is high and the common selected profile is unpredictable.

Recommended next scan:

- Pull live hit/miss rate from `timing_metrics` by `prepared_prompt_requested`, `prepared_prompt_hit`, `prepared_prompt_miss_reason`, and `prepared_prompt_surface_profile`.
- Build only the predicted/default profile first; lazily build alternate profiles only when the user message implies them.
- Track prewarm row byte size and insert duration.

### P2. Read-tool batching exists, but production impact is not measurable

Confirmed. Read batching logs are dev-only and not persisted as turn events.

References:

- Batch start/completion logs are under `if (dev)` at `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts:1355` and `:1386`.
- Tool result rows carry per-tool duration, but not "these tools ran in one batch" metadata, at `apps/web/src/routes/api/agent/v2/stream/+server.ts:1898`.

Why it matters:

- The 2026-07-06 read parallelization plan is implemented, but we cannot tell how often it fires in production, which tools batch, or how much wall clock it saves.

Recommended next scan:

- Persist `read_tool_batch_started/completed` as compact `chat_turn_events` or `timing_metrics.metadata`.
- Add fields: batch size, tool names, duration, max individual duration, success/failure counts.
- Compute "estimated sequential ms - batch wall ms" for read-heavy turns.

### P2. Streaming failover still retries broad open errors without a gate

Still confirmed from the previous deep audit in the current file.

References:

- Streaming attempts loop through lane models at `apps/web/src/lib/services/openrouter-v2-service.ts:1567`.
- Any non-abort open error is stored and the loop continues until attempts are exhausted at `apps/web/src/lib/services/openrouter-v2-service.ts:1600`.

Why it matters:

- A deterministic request error can add multiple failed network round trips before the first byte.
- 429s have no visible jitter/backoff in this path.

Recommended next scan:

- Gate streaming failover with the same retryability rules used by the JSON path.
- Add `llm_open_attempt_ms`, attempt count, status code, and first-byte timing to pass metadata.

### P3. History load fetches attachment extracted text on every history request

Confirmed. `loadRecentMessages` loads recent messages, then if message ids exist it fetches attachment rows with a joined `onto_assets(...)` projection including `extraction_summary` and `extracted_text`.

References:

- History messages load at `apps/web/src/lib/services/agentic-chat-v2/session-service.ts:597`.
- Attachment load with joined asset text fields starts at `apps/web/src/lib/services/agentic-chat-v2/session-service.ts:630`.

Why it matters:

- Most turns do not need full extracted attachment text in the history path.
- This can inflate `history_load_ms` for media-heavy sessions.

Recommended next scan:

- Split attachment metadata from extracted text.
- Load extracted text only when the prompt composer will actually include it or when live vision/attachment continuity needs it.
- Add `history_attachment_load_ms` and attachment row count to timing metadata.

## Audit Phases

### Phase 0 - Measure before changing behavior

1. Query the last 7-14 days of `timing_metrics`, `chat_turn_runs`, `chat_tool_executions`, and `llm_usage_logs`.
2. Segment by context type, cache source, prepared prompt hit/miss, surface profile, tool count, tool rounds, finished reason, and model lane.
3. Report p50/p75/p95 for:
    - `time_to_first_event_ms`
    - `time_to_first_response_ms`
    - `request_to_context_ready_ms`
    - `context_build_ms`
    - `history_load_ms`
    - `response_generation_ms`
    - `assistant_persist_ms`
    - `total_request_ms`
4. Add missing timing fields before implementing large fixes.

### Phase 1 - First-byte hot path

Start with changes that reduce time before the first model byte:

1. Move/sampling-detach prompt snapshot insertion.
2. Move turn admission before prepared-prompt consumption and history/context work.
3. Split context timing into RPC, fallback, Start Here, and focus entity phases.
4. Tighten project surface routing for read-only wording.

### Phase 2 - Context and prewarm efficiency

1. Bound fallback query sizes.
2. Move Start Here into the RPC or make it a two-step metadata/content fetch.
3. Audit prepared-prompt hit rate and row size.
4. Build fewer prewarm profiles unless data proves all four are needed.

### Phase 3 - Tool-round wall clock

1. Persist read-batch telemetry.
2. Audit pure-read classification false negatives.
3. Look for common read sequences that are not contiguous because discovery/materialization sits between them.
4. Keep writes sequential and preserve result order.

### Phase 4 - LLM/pass efficiency

1. Gate streaming failover by retryability.
2. Add first-byte and attempt timing per LLM pass.
3. Request enough OpenRouter usage/cache fields to answer whether cache affinity is working.
4. Trim static prompt/tool prose once profile routing data shows where tokens are going.

## Acceptance Criteria

- A follow-up audit report includes real p50/p95 latency numbers from production or staging telemetry.
- Each recommended code change cites the timing metric it should move.
- `time_to_first_response_ms` and `context_build_ms` are segmented by `cache_source`, `prepared_prompt_hit`, `surface_profile`, and `context_load_source`.
- Prompt snapshot writes are no longer a required pre-LLM synchronous step.
- Prepared prompts are not consumed before a turn owns the running-turn lock.
- Read batching has production-visible telemetry.
