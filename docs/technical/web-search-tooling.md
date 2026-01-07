<!-- docs/technical/web-search-tooling.md -->

# Agentic Chat – Web Search Tooling (Tavily)

## Goals

- Give the agent a safe, single entry point for live web research with citation-ready sources.
- Keep the orchestration consistent with existing tool patterns (schema, categories, result shape).
- Minimize token bloat by requesting concise results and trimming snippets before passing to the LLM.
- Use `web_visit` for deep reads once a specific URL is known.

## Tool surface (`web_search`)

- Definition added to `apps/web/src/lib/chat/tool-definitions.ts` with required `query` plus optional `search_depth` (`basic`|`advanced`), `max_results` (1-10, default 5), `include_answer` (default true), and domain allow/deny lists.
- Categorized under `tool.config` as `web_research` and pulled into the `base` tool group so it is available in all planner contexts.
- Metadata marks it as a `search` capability with contexts `base`, `global`, `project_create`, `project`, `project_audit`, `project_forecast`.
- Result payload (from `performWebSearch`) includes:
    - `query`, `answer` (if Tavily provides one), `results[]` with `title`, `url`, `snippet`, `score`, `published_date`.
    - `follow_up_questions` passthrough.
    - `info`: provider (`tavily`), depth, max results, include_answer, domain filters, fetched_at.

## Implementation layout

- New web tools folder: `apps/web/src/lib/services/agentic-chat/tools/websearch/`
    - `types.ts`: Tavily request/response contracts plus the normalized tool-facing payload.
    - `tavily-client.ts`: Thin POST client to `https://api.tavily.com/search`, handles auth and error formatting.
    - `index.ts`: `performWebSearch` orchestrator that normalizes args, clamps limits, calls Tavily, trims snippets, and returns the ChatToolExecutor-friendly payload.
- Tool wiring:
    - `ChatToolExecutor` switch handles `web_search` by delegating to `performWebSearch`, reusing the injected `fetchFn`.
    - `tools.config` registers `web_search` in the `web_research` category and the `base` group; `WEB_TOOLS` export added for convenience.

## Configuration

- Env var: `PRIVATE_TAVILY_API_KEY` (web environment). The client throws a clear setup error if missing.
- Defaults favor thorough searches (`advanced`, 5 results, Tavily answer enabled) but allow fast/filtered runs via arguments.

## LLM usage guidance (prompt-facing)

- Use `web_search` when the user requests external/current info or citations beyond BuildOS data.
- If the user provides a specific URL, prefer `web_visit` to fetch and summarize that page.
- Prefer `search_depth=basic` for quick fact checks; use `advanced` for research/comparisons.
- Keep `max_results` modest (<=5) unless the user requests breadth; cite URLs in replies.
- Respect `include_domains`/`exclude_domains` if the user specifies trusted or blocked sources.

## Future enhancements

- Add caching of recent queries per session to avoid duplicate calls.
- Expose `include_raw_content` as an advanced flag if we later add longform summarization.
- Add telemetry around latency/accuracy for provider tuning.
