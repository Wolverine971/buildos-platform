<!-- docs/technical/web-search-tooling.md -->

# Agentic Chat – Web Search Tooling

> Current architecture and delivery phases: [BuildOS Native Web Search Architecture Plan](../architecture/native-web-search/BUILDOS_NATIVE_WEB_SEARCH_PLAN.md).

## Goals

- Give the agent a safe, single entry point for live web research with citation-ready sources.
- Keep the orchestration consistent with existing tool patterns (schema, categories, result shape).
- Minimize token bloat by requesting concise results and trimming snippets before passing to the LLM.
- Use `web_visit` for deep reads once a specific URL is known.

## Tool surface (`web_search`)

- The tool accepts required `query` plus optional `search_depth` (`basic`|`advanced`), `max_results` (1-10, default 4), `include_answer` (default false), and domain allow/deny lists.
- Categorized under `tool.config` as `web_research` and pulled into the `base` tool group so it is available in all planner contexts.
- Metadata marks it as a `search` capability in `base`, `global`, `project_create`, and `project`
  contexts. Audit and forecast workflows run as skills inside project context and inherit it there.
- Result payload (from `performWebSearch`) includes:
    - `query`, optional `answer` only when explicitly requested, and `results[]` with discovery plus fetched-page evidence.
    - `follow_up_questions` passthrough.
    - `info`: provider/adapter provenance, depth, max results, include_answer, domain filters,
      fetch time, cache status, and page-fetch counts. Provider cost data is emitted only for a
      real cache miss and is not included in the model-facing compact payload.

## Implementation layout

- Shared core: `packages/shared-agent-ops/src/web/`
    - `native-search.ts`: request normalization, page selection/enrichment, and global page-cache
      URL policy.
    - `native-search-discovery.ts`: versioned provider adapter and provider-neutral discovery
      result.
    - `native-search-response.ts`: the response, diagnostics, and cache-state contract shared by
      Agentic Chat and durable Agent Runs.
    - `native-search-cache.ts`: versioned cache keys, L1/L2 orchestration, durable claim polling,
      Supabase RPC adaptation, and fail-open discovery behavior.
    - `native-search-evidence.ts`: Unicode-safe content hashing/chunking plus service-only immutable
      page-version receipt loading and persistence.
    - `search-cache.ts`: normalized request keys plus bounded local cache/single-flight behavior.
- Web adapter: `apps/web/src/lib/services/agentic-chat/tools/websearch/`
    - `types.ts`: aliases the shared tool-facing contracts.
    - `tavily-client.ts`: injects web runtime auth and fetch behavior into the shared discovery
      adapter.
    - `index.ts`: applies the shared request, discovery, response, and local-cache contracts.
- Tool wiring:
    - `ChatToolExecutor` switch handles `web_search` by delegating to `performWebSearch`, reusing the injected `fetchFn`.
    - `tools.config` registers `web_search` in the `web_research` category and the `base` group; `WEB_TOOLS` export added for convenience.
    - Agentic Chat's compact tool payload preserves the two fetched page bodies and their
      immutable version/chunk provenance so BuildOS synthesis can use the evidence rather than only
      discovery snippets.
    - Durable Agent Runs use the same shared contracts while retaining worker-specific paid-tool
      reservation and settlement hooks.

## Configuration

- Env var: `PRIVATE_TAVILY_API_KEY` (web environment). The client throws a clear setup error if missing.
- Defaults favor thorough discovery (`advanced`, 4 results), disable Tavily answer synthesis, and fetch the best 2 pages concurrently.
- `WEB_SEARCH_CACHE_TTL_MS` controls the short-lived normalized-query cache (default 5 minutes).
- `NATIVE_SEARCH_DURABLE_CACHE_ENABLED` enables the service-only cross-instance L2 cache after
  migration `20260802032000` is deployed. It defaults off for rollout safety.
- `WEB_VISIT_CACHE_TTL_MS` controls page freshness before conditional revalidation (default 15 minutes).

## LLM usage guidance (prompt-facing)

- Use `web_search` when the user requests external/current info or citations beyond BuildOS data.
- If the user provides a specific URL, prefer `web_visit` to fetch and summarize that page.
- Keep `search_depth=advanced` as the default discovery mode.
- Keep `max_results` modest (<=5) unless the user requests breadth; cite URLs in replies.
- Respect `include_domains`/`exclude_domains` if the user specifies trusted or blocked sources.

## Current cache behavior

- Equivalent normalized queries share a bounded process-local result cache and concurrent requests are coalesced.
- When the durable-cache flag is enabled, a SHA-256 versioned request key and expiring database
  owner lease coalesce paid discovery across web and worker instances. Stored queries/results are
  service-role-only; a database failure fails open to live discovery.
- Malformed stored payloads are rejected and invalidated instead of becoming a persistent poison
  entry.
- Durable hits retain provider/request provenance but strip provider credits and Agent Run billing,
  so cached work is never charged again.
- Persistent page cache entries store HTTP validators and revalidate stale content with conditional requests.
- Public cache-eligible pages are content-addressed into immutable page versions and bounded chunks.
  Search results may include `page_visit_id`, `page_version_id`, `page_version_number`,
  `page_content_hash`, and body-free `page_evidence_chunks` references with stable character
  selectors.
- Migrations `20260804020000` and `20260804020100` are deployed. The next architecture step is the
  bounded JavaScript-render escalation described in the linked plan.
