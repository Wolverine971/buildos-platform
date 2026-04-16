# OpenRouter Cost And Prompt Cache Audit

Date: 2026-04-16

## Scope

Reviewed:

- `openrouter_activity_2026-04-16.csv`
- `openrouter-activity-20260416-014844.csv`
- `apps/web/.prompt-dumps/fb-2026-04-15T18-46-33-016Z-lite-turn1.txt`
- `apps/web/.prompt-dumps/fb-2026-04-15T18-47-34-159Z-lite-turn2.txt`
- `apps/web/.prompt-dumps/fb-2026-04-15T18-49-04-573Z-lite-turn3.txt`
- `apps/web/.prompt-dumps/fb-2026-04-15T18-40-52-008Z-fastchat-turn1.txt`
- `apps/web/.prompt-dumps/fb-2026-04-15T18-41-54-965Z-fastchat-turn2.txt`
- `apps/web/.prompt-dumps/fb-2026-04-15T18-44-59-904Z-fastchat-turn3.txt`
- `apps/web/src/routes/api/agent/v2/stream/+server.ts`
- `apps/web/src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.ts`
- `apps/web/src/lib/services/agentic-chat-v2/stream-orchestrator/index.ts`
- `apps/web/src/lib/services/agentic-chat/tools/core/gateway-surface.ts`
- `apps/web/src/lib/services/agentic-chat-v2/context-cache.ts`

OpenRouter references:

- [Reasoning tokens](https://openrouter.ai/docs/use-cases/reasoning-tokens)
- [Prompt caching](https://openrouter.ai/docs/features/prompt-caching)
- [Generation accounting endpoint](https://openrouter.ai/docs/api-reference/get-a-generation/~explorer)
- [Grok 4.1 Fast model page](https://openrouter.ai/x-ai/grok-4.1-fast)

## Executive Summary

The two OpenRouter exports line up closely enough that I do not see an accounting mismatch. The detailed export totals 4,200 rows and `$4.972841`; the summary export totals 4,209 requests and `$4.980738`. After mapping detailed versioned model slugs to summary canonical slugs, the remaining delta is 9 requests and `$0.007898`, about 0.16% of spend. That looks like export timing or export-scope drift, not a product-side cost bug.

The important product signal is not that Grok is too expensive by itself. Grok 4.1 Fast is the main spend driver, but it is also where prompt caching is already helping the most. The issue is that reasoning tokens and prompt volatility are doing more work than necessary. Grok had 927,952 reasoning tokens against 1,194,533 completion tokens, and the OpenRouter export shows `$0.612384` of Grok cache credit.

The biggest prompt-cache win is in the lite prompt. The lite prompt currently puts dynamic project context near the top, before stable strategy, safety, capability, and skill text. In the reviewed same-project lite turns, the actual shared prefix before the first difference was only 1,710 chars, or 13.4% of the turn 3 system prompt. Fastchat shared 13,561 chars, or 66.6%, because stable instructions come before context. That ordering likely leaves cache savings on the table.

Implementation update: the lite prompt has now been reordered so identity, operating strategy, safety rules, and static capability/skill metadata come before volatile focus and loaded-context sections. The former mixed `capabilities_skills_tools` section is now static, and the context-specific tool list moved to a later `tool_surface_dynamic` section.

## OpenRouter Export Reconciliation

| Export | Requests/rows | Cost | Prompt tokens | Completion tokens | Reasoning tokens |
| --- | ---: | ---: | ---: | ---: | ---: |
| Detailed export | 4,200 | `$4.972841` | 15,559,313 | 4,645,893 | 3,663,979 |
| Summary export | 4,209 | `$4.980738` | 15,613,263 | 4,654,012 | 3,670,761 |
| Delta | 9 | `$0.007898` | 53,950 | 8,119 | 6,782 |

Residual day/model diffs after model-slug normalization:

| Day/model | Summary minus detail |
| --- | ---: |
| `2026-04-16 / openai/gpt-4o-mini` | +3 requests, +`$0.002330` |
| `2026-04-16 / openai/gpt-5-nano` | +1 request, +`$0.001267` |
| `2026-04-14 / x-ai/grok-4.1-fast` | +1 request, +`$0.002090` |
| `2026-03-25 / openai/gpt-5-nano` | +2 requests, +`$0.001953` |
| `2026-04-01 / google/gemini-2.5-flash-lite` | +2 requests, +`$0.000257` |

Assessment: the exports are aligned for operational reporting. For product billing or analytics, use OpenRouter's exact per-generation `usage.cost` when available and keep the local static-price estimate only as a fallback.

## Spend Patterns

Cost by API key:

| API key | Rows | Cost |
| --- | ---: | ---: |
| `buildos` | 2,528 | `$3.652990` |
| `libri` | 1,664 | `$1.247994` |
| `9takes` | 8 | `$0.071857` |

Cost by app:

| App | Cost |
| --- | ---: |
| blank / unspecified | `$3.136985` |
| `BuildOS Next Steps Generator` | `$1.508856` |
| `library-app` | `$0.245034` |
| `9takes LLM` | `$0.071857` |

Model spend and behavior:

| Model | Cost | Requests | Notable pattern |
| --- | ---: | ---: | --- |
| `x-ai/grok-4.1-fast` | `$1.729067` | 699 | 8.72M prompt tokens, 1.19M completion tokens, 927,952 reasoning tokens, 4.08M cached prompt tokens, `$0.612384` cache credit |
| `openai/gpt-5-nano` | `$0.804752` | 948 | Reasoning-heavy and many capped outputs |
| `qwen/qwen3.6-plus` | `$0.779257` | 131 | Reasoning-heavy, fewer requests |
| `openai/gpt-4o-mini` | `$0.441367` | 713 | Moderate cost, broad utility lane |
| `minimax/minimax-m2.5` | `$0.274788` | 81 | Smaller share |
| `anthropic/claude-4-sonnet` | `$0.261204` | 56 | Smaller share |
| `deepseek/deepseek-r1` | `$0.252653` | 100 | Reasoning model spend |

Other patterns:

- Cache rows: 1,044 rows, `$1.937082` cost, 9,820,105 prompt tokens, 4,595,481 cached prompt tokens, `$0.655355` cache credit.
- Grok accounts for most of the cache benefit: 4,084,111 cached prompt tokens and `$0.612384` cache credit.
- Max-output rows: 704 rows, `$0.692646`; 703 are GPT-5 Nano. This is a strong signal of capped or undersized generation settings for that lane.
- Latency: average generation about 18.9s, p50 9.55s, p90 52.95s, p95 60.95s, p99 85.8s. TTFT average 3.28s, p50 414ms, p90 9.93s, p95 16.9s.

## Accounting Alignment

The current working tree has the right accounting direction:

- Prefer OpenRouter exact `usage.cost` over static local pricing estimates.
- Persist reasoning tokens separately from normal completion tokens.
- Persist cached prompt tokens and cache write tokens.
- Persist OpenRouter BYOK and upstream inference cost fields.
- Keep static pricing only as a fallback when OpenRouter does not return exact cost.

Relevant changed areas:

- `apps/web/src/lib/services/openrouter-v2-service.ts`
- `apps/web/src/lib/services/openrouter-v2/types.ts`
- `apps/web/src/lib/services/smart-llm/types.ts`
- `packages/smart-llm/src/types.ts`
- `packages/smart-llm/src/usage-logger.ts`
- `supabase/migrations/20260429000006_add_openrouter_usage_accounting.sql`
- `apps/web/src/lib/services/admin/llm-usage-costs.ts`
- Admin chat analytics and export code paths that now prefer `openrouter_usage_cost_usd`

Recommendation: keep a dashboard view that compares local stored `openrouter_usage_cost_usd` against periodic OpenRouter export totals by day, API key, app, model, and request id. The reconciliation threshold can be small, for example alert only above 1% daily cost drift or above `$0.25`, whichever is higher.

## Prompt Dump Findings

Prompt sizes from the reviewed fantasy-novel flow:

| File | Variant | Context | Turn | System prompt | Tool definitions | Provider payload |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| `fb-2026-04-15T18-46-33-016Z-lite-turn1.txt` | `lite_seed_v1` | `project_create` | 1 | 7,699 chars | 12,457 chars | 20,703 chars |
| `fb-2026-04-15T18-47-34-159Z-lite-turn2.txt` | `lite_seed_v1` | `project` | 2 | 12,534 chars | 10,724 chars | 25,005 chars |
| `fb-2026-04-15T18-49-04-573Z-lite-turn3.txt` | `lite_seed_v1` | `project` | 3 | 12,730 chars | 10,724 chars | 26,830 chars |
| `fb-2026-04-15T18-40-52-008Z-fastchat-turn1.txt` | `fastchat_prompt_v1` | `project_create` | 1 | 14,882 chars | 12,457 chars | 27,886 chars |
| `fb-2026-04-15T18-41-54-965Z-fastchat-turn2.txt` | `fastchat_prompt_v1` | `project` | 2 | 18,957 chars | 9,102 chars | 29,737 chars |
| `fb-2026-04-15T18-44-59-904Z-fastchat-turn3.txt` | `fastchat_prompt_v1` | `project` | 3 | 20,342 chars | 10,724 chars | 34,198 chars |

Lite section totals:

| Turn | Static sections | Dynamic sections | Mixed sections |
| ---: | ---: | ---: | ---: |
| Lite turn 1 | 2,176 chars, about 545 tokens | 1,567 chars, about 393 tokens | 3,626 chars, about 907 tokens |
| Lite turn 2 | 2,176 chars, about 545 tokens | 6,295 chars, about 1,575 tokens | 3,733 chars, about 934 tokens |
| Lite turn 3 | 2,176 chars, about 545 tokens | 6,491 chars, about 1,623 tokens | 3,733 chars, about 934 tokens |

Actual shared-prefix comparison:

| Pair | Actual shared prefix | Normalized timestamp/UUID prefix | First difference |
| --- | ---: | ---: | --- |
| Lite turn 1 to turn 2 | 726 chars, 5.8% of turn 2 system prompt | 726 chars, 6.5% normalized | Context type changes from `project_create` to project focus |
| Lite turn 2 to turn 3 | 1,710 chars, 13.4% of turn 3 system prompt | 1,747 chars, 15.4% normalized | `context_meta.generated_at`, `cache_age_seconds`, and counts |
| Fastchat turn 1 to turn 2 | 4,894 chars, 25.8% of turn 2 system prompt | 4,894 chars, 27.6% normalized | Tool surface changes |
| Fastchat turn 2 to turn 3 | 13,561 chars, 66.6% of turn 3 system prompt | 13,628 chars, 72.2% normalized | Context payload timestamp and counts |

Main cache finding: lite is cheaper than fastchat overall, but lite is worse shaped for prefix caching. The prompt starts with stable identity text, then quickly moves into dynamic focus, loaded context, timeline, timestamps, recent changes, and counts. The stable operating strategy, capabilities, skill catalog, and safety rules come after that dynamic block, so they cannot help much with prefix reuse.

## Static Vs Dynamic Prompt Content

Currently static or mostly static:

- Identity and mission.
- Operating strategy.
- Safety and data rules.
- Capability descriptions.
- Skill metadata, as long as the registry is stable.
- General tool-use principles.

Currently dynamic:

- Context type and project focus.
- Project id, project name, focus entity, focus entity name.
- Loaded context JSON.
- `context_meta.generated_at`.
- `cache_age_seconds`.
- `project_intelligence.generated_at`.
- Counts of tasks/documents/recent changes.
- Recent changes with microsecond timestamps.
- Current time.
- Timeline and relative-date labels.
- History and current user message.

Mixed:

- The lite "Capabilities, Skills, and Tools" section combines static capability/skill text with context-specific direct tool names. This should be split. Static capability and skill metadata should live in the stable prefix. Context-specific tool-surface names should move later or be omitted from text when the provider tool definitions already supply the schemas.

## Agentic Chat Flow Findings

The route currently selects tools before prompt construction:

- `selectFastChatTools({ contextType })` maps context type to a static gateway profile.
- There is no lightweight prompt classifier yet.
- `project` and `ontology` use `project_basic`.
- `project_create` uses `project_create_minimal`.
- `calendar` uses `project_calendar`.
- `global`, `general`, `daily_brief`, and `brain_dump` use `global_basic`.

The route then loads or reuses prompt context:

- App-side context cache TTL is 2 minutes.
- The cache key is based on context type, project id, focus type, and focus entity id.
- Even when cached context is reused, `cache_age_seconds` is annotated into the model-facing prompt. That field changes over time and is not usually model-actionable.

The lite prompt is then built:

- `buildLitePromptEnvelope` does not receive a stable `now`, so it defaults to the current wall-clock time.
- It serializes a bounded loaded context index into the model-facing prompt.
- It includes both exact context timestamps and a "Current time" line.

The stream orchestrator sends:

- System prompt first.
- Then model history.
- Then current user message.
- Provider tools are sent separately.

During tool rounds:

- The original system prompt stays first.
- Assistant tool-call replay and tool results are appended.
- Repair instructions and materialized-tool notices are appended as later system messages.

Assessment: the orchestration shape is reasonable for cache because the first system message stays first. The main issue is the content order inside the lite system prompt and a few volatile fields inside early model-facing context.

## Recommendations

### 1. Reorder the lite prompt for a stable prefix

Recommended lite section order:

1. Prompt title and variant.
2. Identity and mission.
3. Operating strategy.
4. Safety and data rules.
5. Static capability catalog.
6. Static skill metadata.
7. Current focus and purpose.
8. Loaded context index.
9. Timeline and recent activity.
10. Loaded data and retrieval boundaries.
11. Context-specific tool surface summary, only if still needed.

Expected effect: same-context lite prompt prefix reuse should improve materially. In the reviewed turn 2 to turn 3 pair, the usable prefix was about 1.7k chars. Moving stable sections ahead of dynamic context could put roughly 5.9k chars of stable or mostly stable lite content before the first dynamic payload.

### 2. Split the mixed tools section

Change `capabilities_skills_tools` into two sections:

- `capabilities_skills_static`: static capability names and skill summaries.
- `tool_surface_dynamic`: current direct tools and discovery tools.

This keeps stable product knowledge cacheable while allowing a future classifier to vary tool profiles without invalidating the core instruction prefix.

### 3. Remove volatile accounting metadata from the model prompt

Keep these in prompt dumps, prompt snapshots, and analytics, but do not send them to the model unless the user specifically asks about runtime diagnostics:

- `context_meta.generated_at`
- `cache_age_seconds`
- `project_intelligence.generated_at`
- Microsecond `changed_at` values in recent-change refs

The model usually needs "recent changes exist" and entity ids, not exact generation timestamps. Exact timestamps are valuable for observability but bad for prompt-cache reuse.

### 4. Make time granularity intent-aware

Default to date-level or timezone-aware day framing for normal project chat:

- Good default: `Today: <YYYY-MM-DD>, timezone: America/New_York`.
- Only include exact current time for calendar, scheduling, deadline, reminder, or "right now" requests.

This is a natural fit for the future lightweight classifier, but the prompt can already be improved by moving exact time later in the prompt and avoiding millisecond precision.

### 5. Keep Grok, but control reasoning by operation

Grok 4.1 Fast should remain the main executor/tool-calling model for complex project work. The smarter change is routing and reasoning policy:

| Operation | Suggested lane |
| --- | --- |
| Tool-heavy project executor | Grok, low or medium reasoning only when needed |
| Simple direct tool args | Grok minimal/low reasoning or cheaper structured model |
| Classification/routing | Cheap fast model, no reasoning or minimal reasoning |
| Title/summary/extraction | Cheap fast model, no reasoning |
| Final short synthesis after tools | Cheap fast model or Grok minimal |

Do not use `reasoning.exclude` as a cost-control mechanism. It can hide reasoning from the response, but it does not mean the model avoided using or billing reasoning tokens.

### 6. Add cache-aware observability

Track these by day, model, prompt variant, context type, and operation type:

- `cached_prompt_tokens / prompt_tokens`
- `cache_write_tokens`
- `reasoning_tokens / completion_tokens`
- `openrouter_usage_cost_usd`
- `finished_reason = max_tokens`
- `tool_calls_per_turn`
- `llm_passes_per_turn`
- `prompt_static_prefix_hash`
- `prompt_dynamic_context_hash`

The hash fields would make prompt-cache regressions easier to detect before looking at OpenRouter exports.

### 7. Use a classifier later, but clean the prompt first

A lightweight classifier is the right direction, but it should come after the lite prompt gets a stable prefix. Otherwise varying tool profiles per turn could accidentally make cache behavior worse.

Classifier target output should be very small:

```json
{
  "intent": "answer|read|write|document|calendar|project_create|research|unclear",
  "context_need": "none|loaded_context|overview|search|details",
  "tool_profile": "none|global_basic|project_basic|project_write|project_document|project_calendar|project_create_minimal",
  "reasoning": "none|minimal|low|medium",
  "needs_exact_time": false
}
```

For the current codebase, the lowest-risk classifier win would be tool-profile selection:

- Read/status turns can stay on `project_basic`.
- Task creation/update turns can use `project_write`.
- Document-heavy turns can use `project_document`.
- Calendar turns can use `project_calendar`.
- Pure conversational turns can use no tools or a very small read-only surface.

## Priority Plan

P1:

- Done: reorder lite prompt sections so stable strategy/safety/capability text comes before dynamic context.
- Done: split static capability/skill text from dynamic tool-surface text.
- Remove `cache_age_seconds` and exact generated-at timestamps from model-facing lite context.

P2:

- Add cache-aware prompt hashes to prompt snapshots.
- Add dashboard rows for cached prompt share, reasoning share, and exact OpenRouter cost by prompt variant.
- Normalize recent-change refs to date-level precision unless the task is time-sensitive.

P3:

- Add the lightweight classifier as a small, cheap, no-reasoning or minimal-reasoning preflight.
- Use classifier output to select tool profile, exact-time need, and reasoning level.
- A/B test classifier routing against the reordered lite prompt so cache improvements are measured separately from routing improvements.

## Bottom Line

OpenRouter export alignment looks good. Cost tracking should now use OpenRouter exact `usage.cost`, and the current working tree is moving that direction.

The main opportunity is prompt shape. Lite is already cheaper than fastchat in the reviewed flow, but its dynamic-first ordering is bad for cache reuse. Reordering stable lite instructions ahead of volatile context is the most obvious near-term win. After that, a small classifier can make routing smarter without undermining cache behavior.
