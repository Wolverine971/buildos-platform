<!-- docs/technical/web-visit-markdown-spec.md -->

# Web Visit Markdown Capture Spec

Status: Implemented

## Goals

- Make `web_visit` return readable markdown for agents (preserve structure).
- Persist parsed markdown with relevant meta tags for reuse.
- Track visit metrics, including last visited time.

## Non-goals

- JS-rendered pages, logins, or form submission.
- Full crawler or multi-page ingestion.
- Paywall or CAPTCHA bypass.

## Current Behavior (Problem)

- `web_visit` extracts plain text only and strips structure.
- No HTML snapshot or meta tags are stored.
- No persistence for reuse or diagnostics.

## Proposed Flow

1. Fetch raw HTML with existing SSRF protections and size caps.
2. Extract meta tags and canonical URL from the HTML head.
3. Trim HTML (remove scripts, nav, footer, ads) and isolate main content.
4. Normalize relative links to absolute URLs.
5. Convert trimmed HTML to markdown via an LLM.
6. Persist markdown + meta + metrics in a new table (no HTML storage).
7. Return markdown (trimmed for token limits) + visit metadata.

## Data Model

### Naming

Preferred: `web_page_visits` (global, deduped by URL).
Alternates: `web_pages`, `web_page_snapshots`.

### Table: `web_page_visits`

- `id` UUID primary key
- `url` TEXT not null (original input URL)
- `final_url` TEXT not null (after redirects)
- `canonical_url` TEXT (from `<link rel="canonical">` or fallback to `final_url`)
- `normalized_url` TEXT not null (lowercase, no fragment, sorted query if applicable)
- `status_code` INTEGER not null
- `content_type` TEXT
- `title` TEXT
- `meta` JSONB (all relevant meta tags, key-value)
- `markdown` TEXT (full markdown output)
- `excerpt` TEXT (short preview for UI)
- `content_hash` TEXT (hash of trimmed HTML or markdown)
- `visit_count` INTEGER default 1
- `first_visited_at` TIMESTAMPTZ default now()
- `last_visited_at` TIMESTAMPTZ default now()
- `last_fetch_ms` INTEGER
- `last_llm_ms` INTEGER
- `last_llm_model` TEXT
- `llm_prompt_tokens` INTEGER
- `llm_completion_tokens` INTEGER
- `llm_total_tokens` INTEGER
- `bytes` INTEGER (response size)
- `error_message` TEXT (nullable, capture conversion failures)
- `created_at` TIMESTAMPTZ default now()
- `updated_at` TIMESTAMPTZ default now()

### Indexes

- Unique: `(normalized_url)`
- `last_visited_at desc` (recent history)

### RLS

- Global table (no `user_id`), deduped across users.
- Allow read for authenticated users.
- Write via service role (recommended) or a security definer RPC to avoid open writes.

## Meta Tags to Capture (Recommended)

- `title` (from `<title>` and fallback to `meta[property=og:title]`)
- `description` (`meta[name=description]` or `og:description`)
- `og:title`, `og:description`, `og:image`, `og:site_name`, `og:type`, `og:url`
- `twitter:title`, `twitter:description`, `twitter:image`, `twitter:card`
- `author`, `keywords`, `lang` (from `<html lang>`), `robots`
- `canonical_url` (`<link rel="canonical">`)

Store these in `meta` JSONB; expose key fields as top-level columns if needed later.

## Tool API Changes

### Args

- `output_format`: `text | markdown` (default `markdown`)
- `persist`: boolean (default `true`)
- `max_html_chars`: number (optional cap for LLM input)
- `force_refresh`: boolean (skip cache, default `false`)

### Response

- `content`: markdown (or text if requested)
- `content_format`: `markdown | text`
- `meta`: extracted meta tags (subset)
- `visit_id`: UUID (when persisted)
- `stored`: boolean
- `info`: include `llm_model`, `llm_ms`, `html_chars`, `markdown_chars`, token usage

## HTML Trimming Strategy

- Reuse existing tag removal for `script`, `style`, `noscript`, `svg`, `iframe`, `form`.
- For `mode=reader`, remove `header`, `footer`, `nav`, `aside`, and extract `<article>` or `<main>`.
- Keep structural tags needed for markdown conversion: `h1-h6`, `p`, `ul`, `ol`, `li`,
  `table`, `thead`, `tbody`, `tr`, `th`, `td`, `blockquote`, `pre`, `code`, `a`, `img`.
- Cap HTML length before LLM conversion (`WEB_VISIT_MAX_HTML_CHARS`, default 40k).

## LLM Conversion

- Use `SmartLLMService.generateTextDetailed` with a low-cost profile (`speed` or `balanced`).
- Prompt: convert HTML to markdown only, preserve structure, drop navigation/footer,
  normalize links, no extra commentary.
- If conversion fails, fallback to current text extraction so `web_visit` still returns content.

## Persistence and Caching

- Upsert by `(normalized_url)` to update `last_visited_at`, increment `visit_count`,
  and replace markdown/meta when content hash changes.
- Simple cache: when `persist=true` and `force_refresh=false`, return stored markdown
  for the normalized URL (no TTL yet).

## Telemetry

- Store fetch and LLM timing, bytes, and token usage in `web_page_visits`.
- Include `visit_id` in `chat_tool_executions.result` for traceability.

## Implementation Plan

1. Add `web_page_visits` migration + RLS + indexes.
2. Regenerate shared types (`packages/shared-types` and `apps/web` postgrest types).
3. Extend web_visit parsing to produce trimmed HTML + meta extraction (no HTML storage).
4. Add LLM markdown conversion and persistence in `ExternalExecutor.webVisit` using admin Supabase.
5. Update tool definition docs and `docs/technical/web-visit-tooling.md`.
6. Add targeted tests for meta extraction and markdown conversion prompt.

## Open Questions

- Default cache TTL?
- Which model profile is acceptable for cost and latency?
