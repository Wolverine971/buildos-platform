<!-- docs/technical/web-visit-tooling.md -->

# Agentic Chat - Web Visit Tooling (Direct URL Fetch)

## Goals

- Give the agent a safe, read-only way to fetch and summarize a known URL.
- Keep the wiring consistent with existing tool patterns (definitions, metadata, categories, executor).
- Minimize token bloat with hard caps, excerpting, and optional link lists.
- Complement `web_search`: discovery happens there, deep reads happen here.

## Non-goals

- No form submission, logins, or session-based browsing.
- No paywall or CAPTCHA bypass.
- Not a general browser automation tool.
- No JS-rendered page support in v1.

## Tool surface (`web_visit`)

- Definition added to `apps/web/src/lib/services/agentic-chat/tools/core/definitions/utility.ts`.
- Categorized under `web_research` and included in the `base` tool group.
- Metadata marks it as a `read` capability with contexts `base`, `global`, `project_create`, `project`, `project_audit`, `project_forecast`.
- Parameters:
    - `url` (string, required): Absolute http/https URL.
    - `mode` (`auto` | `reader` | `raw`, default `auto`): Content extraction mode.
    - `max_chars` (number, default 6000, cap 12000): Max characters returned.
    - `include_links` (boolean, default false): Include a trimmed list of outbound links.
    - `allow_redirects` (boolean, default true): Follow redirects up to a fixed cap.
    - `prefer_language` (string, optional): Hint for `Accept-Language`.
- Result payload:
    - `url`, `final_url`, `status_code`, `content_type`, `title`
    - `content` (clean text), `excerpt`, `truncated` (boolean)
    - `links` (optional, `{ url, text }[]`)
    - `info`: `fetched_at`, `mode`, `bytes`, `fetch_ms`, `parser`

## Implementation layout

- New web tools folder: `apps/web/src/lib/services/agentic-chat/tools/webvisit/`
    - `types.ts`: request/response contracts and normalized payload.
    - `url-client.ts`: fetch with timeout, size limits, redirect handling, and SSRF checks.
    - `parser.ts`: HTML -> text extraction and link harvesting.
    - `index.ts`: `performWebVisit` orchestrator with normalization + truncation.
- Tool wiring:
    - `ExternalExecutor` handles `web_visit` and reuses injected `fetchFn`.
    - `tool-executor-refactored.ts` switch routes `web_visit` to the external executor.
    - `tools.config.ts` registers `web_visit` in `web_research` and `base`.

## Extraction pipeline

1. Validate URL (http/https only, no auth, no fragments in fetch key).
2. SSRF guard: block localhost, link-local, RFC1918, metadata IPs, and non-public DNS.
3. Fetch with `AbortController` timeout (default 12s) and size cap (default 2 MB).
4. Normalize content:
    - `text/html`: use heuristic HTML extraction when `mode=reader` or `auto`.
    - `text/plain` or `text/markdown`: pass through with whitespace normalization.
    - Unsupported types: return a clear error with `content_type`.
5. Truncate to `max_chars`, set `truncated=true` if clipped.
6. Optional: extract top N links (dedupe by host, cap 20).

## Security and safety

- SSRF protection with post-redirect revalidation.
- Hard byte limits to avoid memory spikes.
- No cookies or stateful storage; do not send user auth headers.
- Rate limit per session (ex: 5/min) and log to `chat_tool_executions`.
- Explicitly block local/reserved IP ranges and private TLDs (`.local`, `.internal`, `.lan`).

## Configuration

- `WEB_VISIT_TIMEOUT_MS` (default 12000)
- `WEB_VISIT_MAX_BYTES` (default 2_000_000)
- `WEB_VISIT_MAX_CHARS` (default 6000)
- Optional allow/deny domain lists to constrain fetch scope.

## LLM usage guidance (prompt-facing)

- Use `web_visit` when the user provides a specific URL or asks to review a known page.
- Use `web_search` to discover sources; follow with `web_visit` for a deep read.
- If the user names a site but not a page, ask for the exact URL or offer to search.

## Future enhancements

- JS-rendered mode via Browserless/Playwright for dynamic pages.
- PDF/Docx extraction when `content_type` is supported.
- Per-session caching to avoid repeat fetches.
- Shallow link-following (`depth=1`) for small site maps.
