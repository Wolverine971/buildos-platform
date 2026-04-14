// apps/web/src/lib/services/agentic-chat/tools/libri/guidance.ts
export const LIBRI_PERSON_RESOLUTION_GUIDANCE =
	'Libri is enabled as BuildOS\'s connected library and enrichment source. For questions about Libri access, durable person/author knowledge, books, book categories, authors, or ingested YouTube videos, load `skill_load({ skill: "libri_knowledge" })` when skill loading is available. Use `resolve_libri_resource` when a person may need enrichment, use `query_libri_library` for read-only structured library queries, and use `web_search` for current/live web facts.';
