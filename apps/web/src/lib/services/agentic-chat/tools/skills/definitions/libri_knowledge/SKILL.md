---
name: Libri Knowledge
catalog_line: 'Libri, the BuildOS durable library: books, authors, categories, ingested videos. Check before web search.'
description: Libri is BuildOS's connected durable library and enrichment system; use this playbook for Libri access questions, stable people or author knowledge, books, categories, authors, and ingested YouTube videos before generic web search.
skill_type: procedure # procedure | strategy | reference | resource | policy | orchestration
altitude: domain # task | domain | meta
activation: progressive # always_on | progressive | invoked
preserve_markdown: true
legacy_paths:
    - libri
    - libri.skill
    - libri.knowledge.skill
    - libri.resource.resolve.skill
    - library.skill
path: apps/web/src/lib/services/agentic-chat/tools/skills/definitions/libri_knowledge/SKILL.md
---

# Libri Knowledge

<!--
  BLOCK ONTOLOGY (canonical order). Each block answers exactly one question; no concept is taught twice.
  Identity → Activation → Judgment → Procedure → Routing → Contract → Policy → Knowledge → Related Tools → Examples → Provenance.
  This file is skill_type: procedure. The inventory suggested `reference`, but the body's status-handling
  Workflow is a genuine ordered runbook, and the reference matrix forbids Procedure/Judgment/Routing. The
  dominant verb is *do* (answer-this-way, call-this-tool, handle-this-status), so the legal type is procedure.
  The reference flavor survives as the Knowledge block (the Query Patterns tool-call catalog). This skill
  routes only to TOOLS (resolve_libri_resource, query_libri_library, web_search), not to sibling skills, so
  there is no Routing block — tool calls stay inline in Procedure as the actions the runbook performs.
-->

## Identity

Libri is the durable library and enrichment system connected to BuildOS. BuildOS owns project context and agent orchestration; Libri owns library entities, enrichment state, research jobs, transcripts, book data, and librarian workflows.

This is a **procedure** skill at **domain** altitude: a runbook for answering Libri access, stable people/author, and library-inventory questions using Libri's resolver and library-query tools.

## Activation

- The user asks whether BuildOS has access to Libri or what Libri is.
- The user asks for stable information about a person, author, or thinker.
- The user asks what the library knows about someone.
- The user asks what books, genres/categories, authors, or YouTube videos Libri has.
- The user asks for top books in a category, books by genre/domain, or a structured Libri inventory/list.
- A project conversation needs durable background knowledge about a person without making BuildOS store a copy of Libri data.

## Procedure

1. For "Do you have access to Libri?" or "What is Libri?", answer directly that Libri is BuildOS's connected library/enrichment system when the integration is enabled.
2. For stable person or author questions where Libri may need to create/enrich a missing person, call `resolve_libri_resource` before generic `web_search`.
3. For read-only library inventory or richer structured data, call `query_libri_library`.
4. In project context, pass `project_id` only as provenance to resolver calls; do not create BuildOS ontology records or persistence rows for this slice.
5. If Libri returns `found`, answer from the structured Libri result. If the user asks for more books/category/video detail, follow with `query_libri_library`.
6. If Libri returns `queued` or `pending`, do not poll or wait for enrichment; report the compact Libri status and continue only with already available context unless the user asks for web research.
7. If Libri returns `configuration_error`, `resolver_unavailable`, or `error`, explain the structured status without exposing secrets or falling back into legacy enqueue behavior.
8. Use `web_search` first for latest/current/news/live facts, prices, laws, schedules, scores, or facts that depend on today's web.

## Contract

- BuildOS should treat Libri responses as structured tool results and let the final response layer choose user-facing phrasing.

## Policy

- `resolve_libri_resource` is enqueue-capable for people/authors. `query_libri_library` is read-only and should not be described as starting research.
- Do not expose Libri through the external agent-call gateway in this slice.
- Do not silently fall back to legacy Libri search-plus-ingestion behavior.
- Do not wait for enrichment jobs to finish.
- Never include `LIBRI_API_KEY` or raw configuration errors in model-visible text.
- If the Libri integration is disabled, say BuildOS does not currently have Libri enabled in this environment.

## Knowledge

Query patterns — the `query_libri_library` tool-call catalog. _Source: BuildOS-internal tool API conventions (`internal-default`); no external source._

- Library overview: `query_libri_library({ action: "overview" })`
- Search across library: `query_libri_library({ action: "search", query: "<text>", types: ["book", "author", "youtubeVideo"] })`
- Search books: `query_libri_library({ action: "search_books", query: "<title/topic/author>" })`
- List genres/categories: `query_libri_library({ action: "list_book_categories", response_depth: "detail" })`
- Top books in a genre/category/domain: `query_libri_library({ action: "list_books_by_category", category: "<genre>", limit: 10 })`
- List authors: `query_libri_library({ action: "list_authors", limit: 50 })`
- Get a specific author with books: `query_libri_library({ action: "get_author", query: "<author name>", response_depth: "detail" })`
- List ingested YouTube videos: `query_libri_library({ action: "list_videos", limit: 25 })`
- Search ingested YouTube videos: `query_libri_library({ action: "search_videos", query: "<topic/title/channel>" })`

## Related Tools

- `libri.resource.resolve`
- `libri.library.query`

## Examples

### User asks whether Libri is available

- If enabled, answer that BuildOS can use Libri as a connected library/enrichment source.
- Mention that BuildOS can resolve/enqueue person enrichment and can query Libri's books, categories, authors, and ingested YouTube videos.
- Do not claim write/persistence or external gateway support beyond the available tools.

### User asks "tell me about James Clear"

- Call `resolve_libri_resource` with `query: "James Clear"`, `types: ["person"]`, and a short reason.
- If status is `found`, summarize the returned Libri result.
- If the user asks for books or more library context, call `query_libri_library({ action: "get_author", query: "James Clear", response_depth: "detail" })`.
- If status is `queued` or `pending`, say Libri enrichment is queued or already in progress and do not wait.

### User asks "list the top 10 books in sales"

- Call `query_libri_library({ action: "list_books_by_category", category: "sales", limit: 10 })`.
- Present titles, authors, domains, and available enrichment/completeness cues from the structured result.

### User asks "what YouTube videos have you ingested?"

- Call `query_libri_library({ action: "list_videos", limit: 25 })`.
- Prefer title, channel, watch URL, analysis summary, topics, and transcript segment count when present.

## Provenance

- Libri is a specialized durable knowledge source, not a general replacement for web search. (`internal-default`)
