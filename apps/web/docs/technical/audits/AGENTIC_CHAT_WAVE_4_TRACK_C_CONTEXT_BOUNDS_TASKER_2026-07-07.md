<!-- apps/web/docs/technical/audits/AGENTIC_CHAT_WAVE_4_TRACK_C_CONTEXT_BOUNDS_TASKER_2026-07-07.md -->

# Agentic Chat Wave 4 Track C Context Bounds Tasker - 2026-07-07

Status: Draft 0.1 - handoff for an executing agent.
Owner: BuildOS agentic chat.
Primary source: `apps/web/docs/technical/audits/AGENTIC_CHAT_WAVE_4_CORRECTNESS_COST_PLAN_2026-07-06.md`.

## TL;DR

Track C is the Wave 4 context correctness and cost-control track. It should make the v2 chat
context loader predictable, bounded, and observable before more prompt-cache or route-level cleanup
continues.

Do **C1 and C2 first** in `context-loader.ts` and `context-loader.test.ts`:

- Make RPC and fallback context paths behaviorally equivalent.
- Push fallback limits into SQL instead of fetching broad rows and trimming in JavaScript.
- Constrain focus entity loads by `project_id`.
- Stop putting full document bodies or arbitrary `select('*')` payloads into prompt context.
- Add first-class `context_load_source` telemetry so RPC-null and fallback usage are queryable.

Then do **C3 and C4**:

- Reduce prepared-prompt row size after the context payload is already bounded.
- Schedule/extend retention for high-volume prompt artifacts.

## Required Reading

Read these before editing:

1. `apps/web/docs/technical/audits/AGENTIC_CHAT_BACKEND_AUDIT_2026-07-01_DEEP.md`
    - See the Wave 4 stub and findings C3/C4/C5.
2. `apps/web/docs/technical/audits/AGENTIC_CHAT_WAVE_4_CORRECTNESS_COST_PLAN_2026-07-06.md`
    - See `Track C - Context Correctness and Fetch Bounds`.
3. `apps/web/docs/technical/audits/AGENTIC_CHAT_PERFORMANCE_SPEED_AUDIT_TASKER_2026-07-07.md`
    - Useful performance confirmation: fallback project/entity context remains unbounded, Start Here
      still fetches full content on the RPC path, prepared prompts build multiple surfaces.
4. `apps/web/src/lib/services/agentic-chat-v2/context-loader.ts`
    - Main implementation target.
5. `apps/web/src/lib/services/agentic-chat-v2/context-loader.test.ts`
    - Main regression target.
6. `apps/web/src/routes/api/agent/v2/stream/+server.ts`
    - Consumes prompt context, session cache, prepared prompts, and timing state.
7. `apps/web/src/lib/services/agentic-chat-v2/turn-observability-writer.ts`
    - Writes `timing_metrics`; add queryable context-load telemetry here or in the state passed to it.
8. `apps/web/src/routes/api/agent/v2/prewarm/+server.ts`
    - Writes prepared prompt rows and session cache context.
9. `apps/web/src/lib/services/agentic-chat-v2/prepared-prompt-cache.ts`
    - Prepared prompt validation and surface helpers.
10. `apps/web/src/lib/services/agentic-chat-v2/prompt-observability.ts`
    - Prompt snapshot shape, including `rendered_dump_text`.
11. Relevant migrations:
    - `supabase/migrations/20260420000000_add_fastchat_context_rpc.sql`
    - `supabase/migrations/20260428000006_limit_fastchat_project_context_payloads.sql`
    - `supabase/migrations/20260428000015_add_chat_turn_observability_phase1.sql`
    - `supabase/migrations/20260502000002_agentic_chat_prepared_prompts.sql`
    - `supabase/migrations/20260701020000_enable_rls_timing_metrics.sql`

## Current State

The preceding Wave 4 stream-orchestrator work is already staged locally. Do not reopen that surface
unless a Track C change requires it.

Last reported verification from the previous slice:

- Focused Wave 4 group: 114 tests passing.
- Stream route suite: 17 tests passing.
- `pnpm --filter @buildos/web check`: 0 errors/warnings.
- Staged diff whitespace check passed.

This tasker was written after a static pass over the current tree. It did not rerun those checks.

### Context loader facts to account for

- `loadFastChatContextViaRpc(...)` returns `null` on RPC error, missing payload, or unusable payload.
  The caller then falls through to fallback loaders. RPC-null on project context is not currently a
  first-class queryable event.
- Project RPC success still calls `attachProjectStartHere(...)`.
- `loadProjectStartHereDocument(...)` selects `id, title, content, props, created_at, updated_at`
  from up to 20 Start Here documents before choosing one.
- Global fallback uses `fetchProjectSummaries(...)`, filters paused projects in TypeScript, and then
  maps `start_at` and `end_at` to `null`.
- Global fallback uses all accessible project IDs for related goals/milestones/plans/tasks/events/logs
  queries. Some fetches have limits (`tasks`, `events`, `logs`), but goals, milestones, and plans are
  unbounded at SQL level.
- Project fallback loads goals, milestones, plans, tasks, documents, members, and logs. The main entity
  sets are mostly unbounded at SQL level.
- Project fallback task queries select `description` for every fetched task before renderer limits are
  applied.
- Focus fallback uses `select('*')` and `eq('id', focusEntityId)` for the focus row. It does not
  constrain the focus entity by `project_id`.
- Linked-edge loading interpolates `focusEntityId` into a raw `.or(...)` string:
  `src_id.eq.${focusEntityId},dst_id.eq.${focusEntityId}`.
- Linked entity fetches do use per-kind column configs, but the focus entity itself does not.

### Prepared prompt and retention facts to account for

- Prewarm writes `context_payload`, `history_for_model`, and `prepared_surfaces` into
  `agentic_chat_prepared_prompts`.
- Project/ontology prewarm can prepare multiple project surfaces for one row.
- `agentic_chat_prepared_prompts` already has
  `cleanup_expired_agentic_chat_prepared_prompts()` in
  `supabase/migrations/20260502000002_agentic_chat_prepared_prompts.sql`.
- The open work is to verify that cleanup is scheduled and to add bounded retention for prompt
  snapshots / prompt dumps where needed.
- `chat_prompt_snapshots` includes structured prompt fields and `rendered_dump_text`.

## Goals

Track C is done when:

- RPC and fallback context paths return equivalent project/global/focus semantics for active records.
- Fallback context loads are bounded at the database query level.
- Focus payloads use explicit per-kind field allowlists.
- Document focus payloads do not carry full `content` bodies into model context, session cache, or
  prepared prompt rows.
- Invalid focus IDs cannot enter linked-edge `.or(...)` query construction.
- RPC-null and fallback usage can be queried from turn/timing observability.
- Prepared prompt rows stay under a defined size ceiling for representative project and ontology
  contexts.
- Retention/cleanup for prepared prompts and prompt snapshots is either scheduled or explicitly
  documented as an operational follow-up with the exact missing hook.

## Non-Goals

Do not fold these into Track C:

- Do not decompose `apps/web/src/routes/api/agent/v2/stream/+server.ts` beyond the minimal telemetry
  wiring needed for context source.
- Do not redesign tool-surface selection or trim launch tool definitions. That belongs to Track D.
- Do not change model routing, orchestrator loop behavior, or tool-result compaction.
- Do not weaken access checks to preserve fallback behavior.
- Do not run broad generated type updates unless a migration actually changes generated DB types.
- Do not edit unrelated dirty files in the working tree.

## Implementation Plan

### Phase 0 - Baseline and test scaffolding

Start by adding or extending focused tests before changing loader behavior.

Targets:

- `apps/web/src/lib/services/agentic-chat-v2/context-loader.test.ts`
- Existing mock builders in that file. Refactor the mocks only as much as needed to assert query
  ordering, limits, and field selection.

Add coverage for:

- RPC-null project context falls back and records an observable source/error event.
- Fallback global context preserves project `start_at` and `end_at`.
- Fallback global context filters paused/archived/deleted projects the same way the RPC path does.
- Fallback focus entity cannot return an entity from another project.
- Document focus payload excludes full `content` and unknown arbitrary fields.
- Non-UUID focus IDs are rejected or ignored before linked-edge loading.
- A large mocked project uses SQL `.limit(...)` on project fallback entity queries before mapping.

### Phase 1 - C1 RPC/fallback parity and context source telemetry

Primary files:

- `apps/web/src/lib/services/agentic-chat-v2/context-loader.ts`
- `apps/web/src/lib/services/agentic-chat-v2/context-loader.test.ts`
- `apps/web/src/routes/api/agent/v2/stream/+server.ts`
- `apps/web/src/lib/services/agentic-chat-v2/turn-observability-writer.ts`

Recommended design:

- Add a context-load source field to the context object returned by `loadFastChatPromptContext(...)`.
  Suggested vocabulary:
    - `rpc`
    - `rpc_null_fallback`
    - `rpc_error_fallback`
    - `fallback`
    - `none`
- Keep `cache_source` separate. `cache_source` answers whether the turn used session/prepared/fresh
  context. `context_load_source` answers where fresh context came from.
- When context comes from session cache or prepared prompt, preserve the source in the cache entry if
  available. If not available, write `unknown_cached` rather than pretending it was fresh RPC.
- Add the field to `timing_metrics.metadata` or as a real column if a migration is justified. The
  acceptance requirement is that admins can query RPC-null/fallback rate by turn.
- Also patch the `chat_turn_runs` metadata/update path if that is the current primary admin surface for
  cache/source diagnostics.

Behavioral parity fixes:

- Compare fallback filters against the SQL RPC in
  `supabase/migrations/20260420000000_add_fastchat_context_rpc.sql` and later limiting migrations.
- Align paused/archived/deleted filtering between RPC and fallback. Do not hide active records that the
  RPC would include.
- Preserve `start_at` and `end_at` in global fallback project summaries. If the current summary RPC does
  not return dates, either update the summary source or add a narrow direct project query for those
  fields.
- For focus loads, require `project_id = projectId` in addition to `id = focusEntityId` for entity kinds
  that live under a project.

Regression expectations:

- A global fallback project row with `start_at: '2026-08-01'` and `end_at: '2026-09-01'` keeps those
  values in prompt context.
- A focus task with the right `id` but wrong `project_id` does not become `focus_entity_full`.
- A project RPC returning `null` produces fallback context and a queryable `context_load_source` value
  showing that fallback happened because RPC was null.

### Phase 2 - C2 SQL limits, field allowlists, and bounded document content

Primary files:

- `apps/web/src/lib/services/agentic-chat-v2/context-loader.ts`
- `apps/web/src/lib/services/agentic-chat-v2/context-loader.test.ts`

Add explicit constants for fallback fetch sizes. Name them so future maintainers can relate them to
the renderer limits, for example:

- `PROJECT_CONTEXT_GOAL_FETCH_LIMIT`
- `PROJECT_CONTEXT_MILESTONE_FETCH_LIMIT`
- `PROJECT_CONTEXT_PLAN_FETCH_LIMIT`
- `PROJECT_CONTEXT_TASK_FETCH_LIMIT`
- `PROJECT_CONTEXT_DOCUMENT_FETCH_LIMIT`
- `GLOBAL_CONTEXT_ENTITY_FETCH_LIMIT`
- `START_HERE_CANDIDATE_FETCH_LIMIT`

Use stable SQL ordering before `.limit(...)`. Prefer ordering that matches the existing JS ranking
helpers. Where the existing ranking helper depends on multiple fields, use a conservative SQL shortlist
and keep the final JS rank over that bounded shortlist.

Required query changes:

- Project fallback goals: add stable `.order(...)` and `.limit(...)`.
- Project fallback milestones: add stable `.order(...)` and `.limit(...)`.
- Project fallback plans: add stable `.order(...)` and `.limit(...)`.
- Project fallback tasks: add stable `.order(...)` and `.limit(...)`. Do not fetch unbounded
  descriptions.
- Project fallback documents: add stable `.order(...)` and `.limit(...)`.
- Global fallback goals/milestones/plans: add SQL-level limits. If a single global query cannot fairly
  limit per project, document the tradeoff and either use a bounded global shortlist or issue bounded
  per-project queries for the `lightProjects` only.
- Start Here: do not fetch full `content` for 20 candidates. Fetch candidate metadata first, choose the
  document, then fetch the selected document content only, or move the selection into an RPC that returns
  a bounded preview.

Focus payload allowlists:

- Replace focus `select('*')` with a per-kind config similar to `LINKED_ENTITY_CONFIG`.
- Include `project_id` in each focus select where the table supports it so project scoping is enforced.
- Strip unknown props before assigning `focus_entity_full`.
- For document focus:
    - do not include full `content`;
    - include `content_length`;
    - include a bounded `content_preview` or equivalent field;
    - keep the preview under the existing prompt/content constants.

Linked-edge safety:

- Validate `focusEntityId` as a UUID before calling `loadLinkedEntities(...)`.
- If invalid, return empty linked entities/edges and report a context-load error/metadata event.
- Keep `.or(...)` construction only after validation, or replace it with safer query construction that
  does not interpolate raw client input.

Regression expectations:

- A mocked 2,000-task project makes bounded query calls and produces a bounded prompt payload.
- Document focus payload does not include `content` or arbitrary props.
- Non-UUID focus IDs never reach `.or(...)`.
- Start Here query no longer fetches full bodies for all candidates.

### Phase 3 - C3 prepared prompt write amplification

Start only after Phase 2 has bounded the context payload.

Primary files:

- `apps/web/src/routes/api/agent/v2/prewarm/+server.ts`
- `apps/web/src/routes/api/agent/v2/prewarm/server.test.ts`
- `apps/web/src/lib/services/agentic-chat-v2/prepared-prompt-cache.ts`

Required changes:

- Add a sanitizer for prepared prompt context payloads if the loader-level shape is not enough.
- Ensure `context_payload.focus_entity_full` cannot contain full document bodies.
- Avoid storing the same rendered prompt material twice per surface unless there is measured need.
- Preserve prepared prompt trust-boundary checks:
    - nonce hash validation,
    - context payload hash,
    - tool/harness fingerprint rejection,
    - consumed/stale row rejection.
- Consider normalizing prepared surfaces to share common sections, but do not make this a broad schema
  migration unless a smaller row-shape change cannot meet the size target.

Test expectations:

- Prepared prompt rows for project and ontology contexts stay under a defined serialized byte ceiling.
- A stale tool/harness fingerprint is still rejected.
- Stream consumption still rebuilds `fastchat_context_cache` from a valid prepared prompt.

Suggested size policy:

- Pick an explicit ceiling in the test based on a representative large fixture.
- The ceiling should fail if a full document body or unbounded task list leaks into the row.
- Document the chosen ceiling in the test name or assertion message.

### Phase 4 - C4 retention and cleanup

Primary files:

- `supabase/migrations/*`
- Existing cron/retention code, if present.
- `apps/web/src/lib/services/agentic-chat-v2/prompt-observability.ts`
- Admin prompt snapshot/session detail surfaces if `rendered_dump_text` is gated or removed.

Current fact:

- `cleanup_expired_agentic_chat_prepared_prompts()` already exists.

Required checks:

- Find where Supabase cleanup/cron jobs are scheduled in this repo.
- Schedule `cleanup_expired_agentic_chat_prepared_prompts()` if it is not already scheduled in the
  deployed environment.
- Add bounded retention for `chat_prompt_snapshots`.
- Decide whether `rendered_dump_text` remains always-on, admin-gated, sampled, or dropped when structured
  prompt fields are sufficient.
- Preserve admin debugging for recent incidents.

Regression expectations:

- Existing admin session detail/export tests still pass.
- Prompt eval/replay tests that read prompt snapshots still pass or are updated to use structured fields.
- The cleanup migration is idempotent.

## Verification Commands

Run focused checks first:

```bash
pnpm --filter @buildos/web test:run -- src/lib/services/agentic-chat-v2/context-loader.test.ts
pnpm --filter @buildos/web test:run -- src/routes/api/agent/v2/prewarm/server.test.ts
pnpm --filter @buildos/web test:run -- src/routes/api/agent/v2/stream/server.test.ts
pnpm --filter @buildos/web test:run -- src/lib/services/agentic-chat-v2/turn-observability-writer.test.ts
```

Then run the typecheck:

```bash
pnpm --filter @buildos/web check
```

If C4 changes prompt snapshots or admin payloads, also run:

```bash
pnpm --filter @buildos/web test:run -- src/lib/services/agentic-chat-v2/prompt-observability.test.ts
pnpm --filter @buildos/web test:run -- src/routes/api/admin/chat/sessions/[id]/session-detail-payload.test.ts
pnpm --filter @buildos/web test:run -- src/lib/services/agentic-chat-v2/prompt-eval-runner.test.ts
pnpm --filter @buildos/web test:run -- src/lib/services/agentic-chat-v2/prompt-replay-runner.test.ts
```

Optional but useful after C2/C3:

```bash
pnpm --filter @buildos/web report:agentic-tools
```

This does not measure context payload size directly, but it helps keep prompt/tool cost changes
separated from context-loader changes.

## Acceptance Checklist

- [ ] Required reading completed.
- [ ] Context-loader tests cover RPC-null, fallback parity, focus scoping, document focus bounds, and
      non-UUID focus IDs.
- [ ] Fallback global project summaries preserve `start_at` and `end_at`.
- [ ] Fallback focus queries constrain by `project_id`.
- [ ] Focus entity loading uses explicit column lists.
- [ ] Document focus payload contains `content_length` plus bounded preview, not full `content`.
- [ ] Project fallback entity queries have SQL-level limits and stable ordering.
- [ ] Global fallback related-entity queries are bounded.
- [ ] Start Here no longer fetches full content for all candidates.
- [ ] `context_load_source` or equivalent telemetry is queryable in timing/turn metadata.
- [ ] Prepared prompt payloads stay under an explicit size ceiling.
- [ ] Prepared prompt validation behavior is unchanged.
- [ ] Prepared prompt cleanup is scheduled or the exact operational blocker is documented.
- [ ] Prompt snapshot retention and `rendered_dump_text` policy are resolved.
- [ ] Focused tests and `pnpm --filter @buildos/web check` pass.

## Risk Notes

- `context-loader.ts` has high blast radius. It feeds live stream turns, prewarm, session cache,
  prepared prompts, prompt snapshots, and admin replay/eval surfaces.
- Avoid route decomposition while doing C1/C2. Keep the stream route changes to telemetry/state wiring.
- Be careful with global fallback fairness. A single `.limit(...)` across all projects is bounded but can
  starve quieter projects; per-project bounded queries are more work but preserve better parity.
- Do not rely only on truncating after fetch. Track C is specifically about reducing fetch and storage
  pressure at the source.
- The fallback path should be rare, but when it runs it is often on the hot path after RPC failure. Treat
  fallback as production behavior, not as a debug-only escape hatch.

## Suggested First PR Shape

Keep the first PR to C1/C2:

1. Tests for current bad behavior.
2. Context source metadata.
3. Fallback global date/filter parity.
4. Focus project scoping and UUID validation.
5. SQL limits and field allowlists.
6. Start Here bounded fetch.

Leave prepared-prompt normalization and retention scheduling for the next PR unless the first PR is small.
