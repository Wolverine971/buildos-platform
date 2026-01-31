<!-- docs/technical/web-research-assessment.md -->

# Agentic Chat – Web Search + Web Visit Assessment

## Scope

This document assesses the current **`web_search`** and **`web_visit`** tools in Agentic Chat. It is based on the implementation in:

- `apps/web/src/lib/services/agentic-chat/tools/websearch/`
- `apps/web/src/lib/services/agentic-chat/tools/webvisit/`
- `apps/web/src/lib/services/agentic-chat/tools/core/definitions/utility.ts`
- `apps/web/src/lib/services/agentic-chat/tools/core/executors/external-executor.ts`
- `apps/web/src/lib/services/agentic-chat/execution/tool-execution-service.ts`

## At-a-glance

- **`web_search`**: Tavily-backed live search with optional synthesized answer and a small set of ranked sources.
- **`web_visit`**: Direct HTTP fetch for a specific URL with SSRF protections, HTML parsing, optional LLM markdown conversion, and global caching.
- **Data scope**: External web content + Tavily search results; internal persistence in `web_page_visits` and tool execution logs.

---

## Tool surfaces

### `web_search` (Tavily)

**Where defined**: `apps/web/src/lib/services/agentic-chat/tools/core/definitions/utility.ts`

**Parameters**

- `query` (required)
- `search_depth`: `basic | advanced` (default: `advanced`)
- `max_results`: `1–10` (default: `5`)
- `include_answer`: boolean (default: `true`)
- `include_domains` / `exclude_domains`: array of domains

**Behavior**

- Calls Tavily via `tavilySearch` (`apps/web/src/lib/services/agentic-chat/tools/websearch/tavily-client.ts`).
- Forces `include_raw_content=false` and `include_images=false`.
- Normalizes and trims result snippets to **~400 chars**.
- Returns:
    - `query`, `answer`, `results[]` (`title`, `url`, `snippet`, `score`, `published_date`)
    - `follow_up_questions`
    - `info` block with search metadata + `fetched_at`

**Timeouts**

- Tool metadata sets **60s** timeout (enforced by `ToolExecutionService`).
- No explicit fetch timeout inside the Tavily client.

---

### `web_visit` (Direct HTTP + optional LLM markdown)

**Where defined**: `apps/web/src/lib/services/agentic-chat/tools/core/definitions/utility.ts`

**Parameters**

- `url` (required)
- `mode`: `auto | reader | raw` (default: `auto`)
- `output_format`: `markdown | text` (default: `markdown`)
- `max_chars`: default `6000`, cap `12000`
- `max_html_chars`: default `40000`, cap `120000`
- `persist`: default `true`
- `force_refresh`: default `false`
- `include_links`: default `false`
- `allow_redirects`: default `true`
- `prefer_language`: optional `Accept-Language` hint

**Fetch + parsing pipeline**

1. **URL validation**: http/https only, no credentials, fragment stripped.
2. **SSRF guard**: blocks localhost, private/reserved IP ranges, and private TLDs (`.local`, `.internal`, `.lan`, etc.). DNS lookup is required and revalidated on redirects.
3. **Fetch**: GET only, `Accept` favors HTML/text, **12s timeout**, **2MB size cap**, manual redirects (max 5).
4. **Content handling**:
    - HTML: `mode=auto` → reader extraction (removes nav/header/footer, favors `<article>`/`<main>`), meta extraction, text extraction, and sanitized HTML prepared for Markdown conversion.
    - Text/Markdown/JSON/XML: normalized to plain text.
    - Other content types: error.
5. **Optional link extraction**: up to 20 links, **deduped by host** (one link per host).
6. **Markdown conversion**: if HTML and `output_format=markdown` or `persist=true`, converts sanitized HTML to Markdown using `SmartLLMService` with a fixed prompt.

**Result payload**

- `content` (markdown or text), `content_format`
- `excerpt` (<=280 chars), `truncated`
- `title`, `canonical_url`, `meta`
- `links` (optional)
- `info` (timing, bytes, parser, html/markdown char counts, LLM usage)

**Timeouts**

- Fetch timeout: **12s** (`WEB_VISIT_TIMEOUT_MS` override).
- LLM conversion timeout: **25s** (`WEB_VISIT_LLM_TIMEOUT_MS` override).
- Tool metadata timeout: **60s** (via `ToolExecutionService`).

---

## Data surfaces (what the tools can read)

### External

- **Tavily Search API** (search index + synthesized answers).
- **Public web pages** via direct HTTP GET for:
    - `text/html`
    - `text/plain`
    - `text/markdown`
    - `application/json` / XML (treated as text)
- **LLM service** for HTML→Markdown conversion (input is sanitized HTML snippet).

### Internal

- **`web_page_visits`** (global cache): read/write for Markdown snapshots + metadata.
    - Used for cache hits when `persist=true` and `force_refresh=false`.
    - Stored fields include `url`, `final_url`, `canonical_url`, `meta`, `markdown`, timings, token usage, etc.
- **`chat_tool_executions`**: tool calls/results are logged when a session id is present.

---

## Capabilities

### Web search

- Live web discovery for current information.
- Basic/advanced search depth.
- Domain allow/deny lists.
- Returns ranked sources with snippets, plus an optional synthesized answer.

### Web visit

- Safe public URL fetch with SSRF protections.
- Reader-mode extraction for cleaner text.
- Optional Markdown conversion with structure preserved.
- Global cached snapshots to avoid repeated fetches.
- Optional outbound link list for follow-up research.

---

## Limitations

### Web search

- No caching or dedupe; repeated queries always call Tavily.
- No explicit fetch timeout at the Tavily client layer.
- Result content is **snippet-only** (no raw/full page data).
- No parameters for recency, language, or region beyond domain filters.

### Web visit

- **Static fetch only**: no JS rendering, no logins, no form submission.
- **Content-type limits**: no PDF/docx/binary support.
- Output truncation: max 12k chars returned even if more content is available.
- Markdown conversion can be lossy or fail (fallback to text).
- `include_links` returns at most **one link per host** (can miss relevant deep links).
- Global cache is **cross-user** (no per-user scoping or TTL).

---

## Functional assessment

**Strengths**

- Clear separation of discovery (`web_search`) vs. deep read (`web_visit`).
- Solid SSRF guardrails and size/time caps for `web_visit`.
- Markdown conversion + caching improves readability and repeat performance.
- Tool metadata + execution service provide consistent timeouts and logging.

**Gaps / risks**

- `web_search` has no client-level timeout or retry strategy.
- `web_visit` does not enforce allow/deny domain lists (only hardcoded SSRF rules).
- Global cache (`web_page_visits`) is shared across all authenticated users.
- Dynamic sites and document formats are unsupported, limiting coverage for modern sources.

**Overall**
The web tooling is **robust for static, public text content** and safe by default, with good ergonomics for research workflows. The largest functional constraints are **dynamic pages**, **document formats**, and **cache scoping**. For most research tasks, the tools work well; for product-grade “web browsing,” they are deliberately conservative and should be positioned as **read-only, static, and text-first**.

---

## Recommended next steps (optional)

1. Add **timeout + retry** support to the Tavily client.
2. Add **domain allow/deny** support to `web_visit` (configurable env allowlist/denylist).
3. Add **TTL or per-user cache scope** for `web_page_visits`.
4. Add **PDF/text extraction** for common document types.
5. Consider **JS-rendered mode** via a headless browser for dynamic pages.
