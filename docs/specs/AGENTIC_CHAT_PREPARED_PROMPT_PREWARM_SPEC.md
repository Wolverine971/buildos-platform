<!-- docs/specs/AGENTIC_CHAT_PREPARED_PROMPT_PREWARM_SPEC.md -->

# Agentic Chat Prepared Prompt Prewarm Spec

Status: Proposed
Date: 2026-04-26
Owner: BuildOS Agentic Chat

Related:

- [Agentic Chat Prewarm Project Intelligence Spec](/Users/djwayne/buildos-platform/docs/specs/AGENTIC_CHAT_PREWARM_PROJECT_INTELLIGENCE_SPEC.md)
- [Agentic Chat Lite Prompt Consolidation](/Users/djwayne/buildos-platform/docs/specs/agentic-chat-lite-prompt-consolidation-2026-04-16.md)
- [OpenRouter Cost And Prompt Cache Audit](/Users/djwayne/buildos-platform/docs/reports/openrouter-cost-and-prompt-cache-audit-2026-04-16.md)
- [Agentic Chat Current Implementation](/Users/djwayne/buildos-platform/apps/web/docs/features/agentic-chat/README.md)

External references:

- [PostgreSQL `REFRESH MATERIALIZED VIEW`](https://www.postgresql.org/docs/current/sql-refreshmaterializedview.html)
- [Supabase Row Level Security](https://supabase.com/docs/guides/auth/auth-deep-dive/auth-row-level-security)
- [Supabase Database Functions](https://supabase.com/docs/guides/database/functions)
- [Supabase Cron](https://supabase.com/docs/guides/cron)
- [OpenRouter Prompt Caching](https://openrouter.ai/docs/features/prompt-caching)

## Purpose

Move the expensive first-turn chat preparation work from user-send time to modal-open or draft-time prewarm.

Today `/api/agent/v2/prewarm` prepares a short-lived context cache. The stream endpoint still has to resolve the session, load history, select tools, build the Lite system prompt, emit context usage, and persist the prompt snapshot before it can start the OpenRouter stream.

The target behavior:

```text
User opens AgentChatModal or starts typing
  -> POST /api/agent/v2/prewarm
  -> authenticate + authorize + load context + compose history + build system prompt artifact(s)
  -> store short-lived server-owned prepared prompt
  -> return opaque prepared_prompt_key

User clicks Send
  -> POST /api/agent/v2/stream with message + prepared_prompt_key
  -> authenticate + validate key belongs to this user/session/scope
  -> select prepared prompt artifact for the user message/tool profile
  -> immediately start OpenRouter stream
```

## Current Implementation Summary

Important current files:

| Area                       | File                                                                      |
| -------------------------- | ------------------------------------------------------------------------- |
| Frontend prewarm wrapper   | `apps/web/src/lib/components/agent/agent-chat-session.ts`                 |
| Frontend prewarm lifecycle | `apps/web/src/lib/components/agent/agent-chat-prewarm.svelte.ts`          |
| Modal send path            | `apps/web/src/lib/components/agent/AgentChatModal.svelte`                 |
| Prewarm endpoint           | `apps/web/src/routes/api/agent/v2/prewarm/+server.ts`                     |
| Stream endpoint            | `apps/web/src/routes/api/agent/v2/stream/+server.ts`                      |
| Context cache contract     | `apps/web/src/lib/services/agentic-chat-v2/context-cache.ts`              |
| Context loader             | `apps/web/src/lib/services/agentic-chat-v2/context-loader.ts`             |
| Lite prompt builder        | `apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts` |
| Tool surface router        | `apps/web/src/lib/services/agentic-chat-v2/tool-selector.ts`              |
| OpenRouter stream client   | `apps/web/src/lib/services/openrouter-v2-service.ts`                      |

Current facts:

- The prewarm endpoint authenticates with `safeGetSession()`, checks project or daily brief access where needed, loads `loadFastChatPromptContext()`, builds a `FastChatContextCache`, and returns `prewarmed_context`.
- The frontend stores only one `FastChatContextCache`, keyed by context type, project id, focus type, and focus entity id.
- The stream endpoint accepts `prewarmedContext`, but it still builds the `LitePromptEnvelope` on send.
- Project tool selection can depend on the user message. For example, project document or mutation-heavy turns route to larger surfaces in `selectFastChatTools({ contextType, latestUserMessage })`.
- Prompt snapshots already persist the full system prompt in `chat_prompt_snapshots`; prepared prompts can reuse that observability shape.

## Decision

Add a server-owned `agentic_chat_prepared_prompts` table for ephemeral prepared prompt artifacts.

Do not use a materialized view for the per-user, per-modal prepared system prompt. A materialized view is the wrong primitive for this part of the feature because:

- it is not parameterized by one user/modal request;
- refreshing it recomputes the backing query output;
- `REFRESH MATERIALIZED VIEW CONCURRENTLY` needs a qualifying unique index and still allows only one refresh at a time for that materialized view;
- storing sensitive per-user prompt text in a broadly accessible view/table shape increases the security blast radius.

Materialized views can still be useful in a later phase for shared, bounded aggregate fragments, such as project activity counts or project signal summaries. Those should live in a private schema and be exposed only through authenticated RPCs or app-server endpoints.

## Goals

- Reduce send-time `context_build_ms` to near-zero on prepared prompt hits.
- Avoid repeating backend context queries when the user sends shortly after modal open.
- Preserve the current Lite prompt behavior and prompt observability.
- Keep frontend API simple: pass `prepared_prompt_key` in addition to the user message.
- Keep the existing `prewarmed_context` response during rollout for compatibility and fallback.
- Support message-dependent project tool surfaces without rebuilding database context.
- Make stale, mismatched, consumed, or invalid keys fall back to the current stream path.

## Non-Goals

- Do not skip user authentication on `/api/agent/v2/stream`.
- Do not let the browser supply trusted prompt text or context payloads.
- Do not allow a key derived only from user id/project/time to authorize access.
- Do not make materialized view refresh part of the send path.
- Do not call OpenRouter during normal prewarm unless a separate, measured prompt-cache experiment is enabled.
- Do not reuse a prepared prompt after a successful turn; conversation history has changed.

## Security Position

The prepared prompt key is a cache lookup handle, not an auth token.

Required checks on stream:

1. `safeGetSession()` must succeed.
2. Prepared row `user_id` must equal the authenticated user id.
3. Context scope must match the stream request: context type, project id/entity id, focus type, focus entity id, and session id when present.
4. Row must be fresh and unconsumed.
5. Project/daily-brief scoped contexts should still run a cheap current access check before use.
6. Writes and tool execution continue through normal tool executors and RLS-aware APIs.

This design skips repeated context and prompt-building work. It does not bypass authentication, stream ownership, or write authorization.

## Prepared Key Format

Do not return a deterministic hash of user id, project id, and time. That is easier to predict and cannot be revoked cleanly.

Return an opaque key:

```text
pp_v1.<prepared_prompt_id>.<nonce>
```

Where:

- `prepared_prompt_id` is a UUID stored as the row primary key.
- `nonce` is at least 128 bits of cryptographically random base64url text.
- the database stores only `nonce_sha256`, not the raw nonce.
- stream lookup verifies `sha256(nonce)` before using the row.

The key should expire quickly, ideally 90 seconds for v1. It should be consumed once.

## Data Model

Add a table:

```sql
create table public.agentic_chat_prepared_prompts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  session_id uuid null references public.chat_sessions(id) on delete cascade,
  context_type text not null,
  entity_id uuid null,
  project_id uuid null,
  project_focus jsonb null,
  cache_key text not null,
  nonce_sha256 text not null,
  prompt_variant text not null default 'lite_seed_v1',
  context_cache_version integer not null,
  context_payload jsonb not null,
  conversation_summary text null,
  history_for_model jsonb not null default '[]'::jsonb,
  history_strategy text null,
  history_compressed boolean null,
  raw_history_count integer null,
  history_for_model_count integer null,
  prepared_surfaces jsonb not null,
  default_surface_profile text not null,
  context_payload_sha256 text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint uq_agentic_chat_prepared_prompt_nonce unique (nonce_sha256),
  constraint chk_agentic_chat_prepared_prompt_expiry check (expires_at > created_at)
);
```

Indexes:

```sql
create index idx_agentic_chat_prepared_prompts_user_expires
  on public.agentic_chat_prepared_prompts(user_id, expires_at desc);

create index idx_agentic_chat_prepared_prompts_cache_key
  on public.agentic_chat_prepared_prompts(user_id, cache_key, expires_at desc);

create index idx_agentic_chat_prepared_prompts_cleanup
  on public.agentic_chat_prepared_prompts(expires_at, consumed_at);
```

`prepared_surfaces` shape:

```ts
type PreparedPromptSurface = {
	surface_profile: string;
	tool_names: string[];
	tools_sha256: string | null;
	system_prompt: string;
	system_prompt_sha256: string;
	sections: unknown[];
	context_inventory: unknown;
	tools_summary: unknown;
	prompt_cost_breakdown?: unknown;
	tool_surface_report?: unknown;
	created_at: string;
};

type PreparedSurfaces = Record<string, PreparedPromptSurface>;
```

For `project` and `ontology`, prewarm should build four prompt variants from the same context payload:

- `project_basic`
- `project_write`
- `project_document`
- `project_write_document`

For `global` and `daily_brief`, build `global_basic`.

For `project_create`, build `project_create_minimal`.

This handles user-message-dependent tool routing without reloading context.

## Endpoint Contract

### `POST /api/agent/v2/prewarm`

Request stays compatible:

```json
{
	"session_id": "optional-session-id",
	"context_type": "project",
	"entity_id": "project-id",
	"projectFocus": {
		"focusType": "project-wide",
		"focusEntityId": null,
		"projectId": "project-id"
	},
	"ensure_session": false,
	"prepare_prompt": true
}
```

`prepare_prompt` defaults to `true` after rollout. During canary rollout it can be enabled with a feature flag.

Response:

```json
{
	"warmed": true,
	"cache_source": "fresh_load",
	"session": null,
	"prewarmed_context": { "version": 2, "key": "...", "created_at": "...", "context": {} },
	"prepared_prompt": {
		"key": "pp_v1.<uuid>.<nonce>",
		"id": "<uuid>",
		"expires_at": "2026-04-26T12:34:56.000Z",
		"cache_key": "v2|project|...",
		"prompt_variant": "lite_seed_v1",
		"default_surface_profile": "project_basic",
		"prepared_surface_profiles": [
			"project_basic",
			"project_write",
			"project_document",
			"project_write_document"
		],
		"system_prompt_sha256": "sha256-of-default-surface"
	}
}
```

The frontend stores `prepared_prompt.key` beside the existing `prewarmedContext`.

### `POST /api/agent/v2/stream`

Add request fields:

```ts
type FastAgentStreamRequest = {
	message: string;
	preparedPromptKey?: string | null;
	prepared_prompt_key?: string | null;
	prewarmedContext?: FastChatContextCache | null;
};
```

Stream behavior:

1. Authenticate.
2. Resolve session.
3. Persist user message asynchronously as it does today.
4. Select the surface profile from the user message.
5. Try to consume `prepared_prompt_key`.
6. If valid and the requested surface exists, use its `system_prompt`, `history_for_model`, and `context_payload`.
7. If valid but surface is missing, use stored `context_payload` to build only the needed prompt surface without database re-query.
8. If invalid, stale, mismatched, or consumed, fall back to current cache/fresh-load path.
9. Start `streamFastChat()` as soon as the prompt artifact is available.
10. Persist prompt snapshot and detailed observability without blocking the OpenRouter stream where possible.

## Stream Fast Path

Prepared prompt hit should avoid:

- `loadFastChatPromptContext()`
- `composeFastChatHistory()` when the prepared row has session-bound history
- `buildLitePromptEnvelope()`
- repeated context cache writes

It still performs:

- user auth
- session resolution
- cheap scope/key validation
- user-message-dependent tool profile selection
- OpenRouter request construction
- tool execution authorization at runtime

Pseudo-code:

```ts
const prepared = await consumePreparedPrompt({
  key: streamRequest.preparedPromptKey,
  userId,
  sessionId: session.id,
  contextType,
  entityId,
  projectFocus,
  selectedSurfaceProfile
});

if (prepared.hit) {
  systemPrompt = prepared.surface.system_prompt;
  promptContext = prepared.context_payload;
  historyForModel = prepared.history_for_model;
  tools = selectFastChatTools({
    contextType,
    surfaceProfile: prepared.surface.surface_profile
  });
  contextCacheSource = 'prepared_prompt';
} else {
  // existing session_cache/request_prewarm/fresh_load path
}

void persistPromptSnapshotAfterStreamStart(prepared);
await streamFastChat({ systemPrompt, history: historyForModel, tools, message, ... });
```

## Frontend Changes

`agent-chat-session.ts`:

- Extend `prewarmAgentContext()` return type with `preparedPrompt`.

`agent-chat-prewarm.svelte.ts`:

- Store `preparedPromptKey` and metadata beside `prewarmedContext`.
- Add `matchingFreshPreparedPrompt(key)` parallel to `matchingFreshContext(key)`.
- Invalidate when context key changes, expiry passes, or modal closes.
- Clear the prepared key after a send attempt uses it.

`AgentChatModal.svelte`:

- Include `preparedPromptKey` in the stream request when it matches the current context key.
- Keep sending `prewarmedContext` during rollout as fallback.

## Backend Changes

`context-cache.ts`:

- Keep existing context cache contract.
- Add prepared prompt key helpers in a separate module, for example `prepared-prompt-cache.ts`.

`/api/agent/v2/prewarm/+server.ts`:

- After building `promptContext`, also compose history if there is a session.
- Build prepared surfaces with `buildLitePromptEnvelope`.
- Insert `agentic_chat_prepared_prompts` row.
- Return `prepared_prompt`.
- Keep legacy `prewarmed_context` response.

`/api/agent/v2/stream/+server.ts`:

- Parse `preparedPromptKey`.
- Try prepared prompt consume before checking session/request context cache.
- Add `cache_source = 'prepared_prompt'`.
- Add miss reasons in timing metadata.
- Avoid blocking OpenRouter startup on prompt snapshot insert when using a prepared row.

`prompt-observability.ts`:

- Allow prompt snapshot row construction from a `PreparedPromptSurface`.
- Add `prepared_prompt_id`, `prepared_prompt_hit`, and `prepared_prompt_surface_profile` to request payload metadata.

`supabase/migrations`:

- Add table, RLS policies, indexes, cleanup function, and optional cron job.
- Add columns to `chat_turn_runs`:

```sql
alter table public.chat_turn_runs
  add column if not exists prepared_prompt_id uuid null references public.agentic_chat_prepared_prompts(id) on delete set null,
  add column if not exists prepared_prompt_hit boolean null,
  add column if not exists prepared_prompt_miss_reason text null,
  add column if not exists prepared_surface_profile text null;
```

## RLS And Privileges

Enable RLS:

```sql
alter table public.agentic_chat_prepared_prompts enable row level security;
```

Policies:

```sql
create policy "prepared_prompts_user_insert"
  on public.agentic_chat_prepared_prompts
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "prepared_prompts_user_select"
  on public.agentic_chat_prepared_prompts
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "prepared_prompts_user_update"
  on public.agentic_chat_prepared_prompts
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "prepared_prompts_service_role"
  on public.agentic_chat_prepared_prompts
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
```

If using helper RPCs, follow Supabase function guidance:

- default to `security invoker`;
- if `security definer` is required, set `search_path = ''`;
- fully qualify relation names;
- revoke broad execute grants and grant only the needed role.

## Cleanup

Prepared prompt rows should be short-lived.

Add a cleanup function:

```sql
create or replace function public.cleanup_expired_agentic_chat_prepared_prompts()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_deleted integer;
begin
  delete from public.agentic_chat_prepared_prompts
  where expires_at < now() - interval '10 minutes'
     or consumed_at < now() - interval '10 minutes';

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;
```

Schedule with Supabase Cron if available. Supabase Cron can run SQL or database functions inside Postgres, which avoids network round trips. The job should run every 5 to 15 minutes.

## Materialized View Option

Use materialized views only for slower shared fragments after measuring the v1 table approach.

Candidate later-phase materialized view:

```sql
create materialized view private.agent_project_signal_mv as
select
  p.id as project_id,
  max(l.created_at) as last_activity_at,
  count(*) filter (...) as recent_change_count,
  count(*) filter (...) as overdue_count,
  count(*) filter (...) as due_soon_count,
  count(*) filter (...) as upcoming_count
from public.onto_projects p
left join public.onto_project_logs l on l.project_id = p.id
...
group by p.id;
```

Rules if this is added:

- keep it in a private schema;
- do not expose it directly to PostgREST;
- index `project_id`;
- refresh via cron or background job, never synchronously during stream;
- combine it with live access checks through existing membership-aware functions;
- do not store per-user full system prompts in it.

## OpenRouter Prompt Cache Notes

OpenRouter already reports `cached_tokens` and `cache_write_tokens`, and the app persists those fields in `llm_usage_logs`.

This feature should not make a dummy prewarm OpenRouter call in v1. Reasons:

- the user message is not known yet;
- the current OpenRouter request builder does not pass `cache_control`;
- a dummy call adds cost and latency before we know the user will send;
- provider cache behavior varies by model and provider.

Better v1 work:

- keep stable prompt sections before dynamic context;
- avoid volatile timestamps in the stable prefix;
- use the prepared prompt to preserve identical system prompt text between prewarm and send;
- track `cached_prompt_tokens` by prepared prompt hit vs miss.

Possible phase 3:

- add `cache_control` passthrough to `OpenRouterChatRequest` and `buildOpenRouterChatCompletionBody`;
- experiment only on models/providers where explicit prompt caching is documented and cost-positive;
- compare time-to-first-token, cache write cost, cache read savings, and abandoned-prewarm waste.

## Observability

Add timing metadata:

- `prepared_prompt_requested`
- `prepared_prompt_hit`
- `prepared_prompt_miss_reason`
- `prepared_prompt_age_seconds`
- `prepared_prompt_surface_profile`
- `prepared_prompt_system_prompt_sha256`

Add admin dashboard slices:

- prepared prompt hit rate
- miss reason distribution
- p50/p90 `context_build_ms` by hit/miss
- p50/p90 time to first model token by hit/miss
- OpenRouter cached prompt tokens by hit/miss
- abandoned prepared prompt rate

Miss reasons:

- `missing_key`
- `bad_format`
- `not_found`
- `nonce_mismatch`
- `expired`
- `consumed`
- `user_mismatch`
- `session_mismatch`
- `scope_mismatch`
- `access_denied`
- `surface_missing`
- `parse_error`

## Rollout Plan

1. Add database table, RLS, indexes, cleanup function, and `chat_turn_runs` columns.
2. Add prepared prompt key helpers and tests.
3. Extend prewarm endpoint behind `FASTCHAT_PREPARED_PROMPT_PREWARM_ENABLED`.
4. Extend frontend to store and pass `preparedPromptKey`, while still passing `prewarmedContext`.
5. Extend stream endpoint to consume prepared prompts and fall back cleanly.
6. Add unit tests for valid hit, stale key, wrong user, wrong scope, consumed key, and surface profile routing.
7. Canary in development/admin traffic.
8. Compare metrics to baseline.
9. Remove or reduce request-carried `prewarmedContext` reliance after prepared prompts are stable.

## Test Plan

Backend unit tests:

- prewarm inserts a prepared prompt row with expected surface profiles.
- stream consumes a valid prepared prompt.
- stream rejects stale prepared prompt and falls back.
- stream rejects wrong nonce.
- stream rejects wrong user/session/scope.
- stream selects `project_write`, `project_document`, or `project_write_document` from the user message and uses the matching prepared surface.
- consumed rows cannot be reused.

Frontend tests:

- prewarm controller stores `preparedPromptKey`.
- key clears on modal close.
- key clears after send.
- key is not sent when context key drifts.
- legacy `prewarmedContext` still works when prepared prompt is absent.

Integration tests:

- project chat first turn with prepared prompt hit.
- global chat first turn with prepared prompt hit.
- project create first turn with prepared prompt hit.
- existing session turn where history is composed during prewarm.
- project access revoked after prewarm causes stream fallback or denial.

Performance checks:

- compare `context_build_ms` before/after.
- compare request-to-OpenRouter-start time.
- compare time-to-first-response.
- verify prompt snapshots still render in admin session detail.

## Acceptance Criteria

- On prepared prompt hit, stream does not call `loadFastChatPromptContext()`.
- On prepared prompt hit, stream does not call `buildLitePromptEnvelope()` unless the selected surface was not prebuilt.
- Invalid prepared keys never expose prompt/context data.
- A prepared key cannot be reused after a successful send.
- Tool execution still enforces normal runtime authorization.
- Existing `prewarmed_context` fallback remains functional.
- Admin timing shows `cache_source = 'prepared_prompt'`.
- Prepared prompt rows are cleaned up automatically.

## Risks And Mitigations

| Risk                                                      | Mitigation                                                                          |
| --------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| User opens modal but never sends, creating abandoned rows | Short TTL, cleanup cron, compact row shape                                          |
| Prompt goes stale between prewarm and send                | 90-second TTL, optional context fingerprint, fallback on mismatch                   |
| Tool surface selected from message was not prebuilt       | Prebuild all project surface profiles or rebuild prompt from stored context only    |
| Key treated as authorization                              | Keep auth/session/scope checks; token is cache lookup only                          |
| Materialized view leaks sensitive prompt text             | Do not store per-user prompts in materialized views; keep optional MVs private      |
| Prompt cache savings regress                              | Preserve stable prompt prefix and track OpenRouter cache metrics                    |
| Prompt snapshot insert delays stream                      | Persist snapshots asynchronously or copy from prepared artifact after stream starts |

## Recommendation

Implement the ephemeral prepared prompt table first. It directly matches the desired UX: prewarm does the expensive prompt preparation, send only verifies a short-lived key and starts the OpenRouter stream.

Use materialized views later only for measured database bottlenecks inside `load_fastchat_context` or `build_fastchat_project_intelligence`. They are better suited to shared aggregate data than one-off per-user prompt text.
