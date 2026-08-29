<!-- tasker/71-semantic-discovery-search.md -->

# 71 — Semantic discovery search + golden-standard reorientation

**Created:** 2026-08-28

**Status:** Active — Phase 2 gate PASSED 2026-08-29. Embeddings route via
OpenRouter (OpenAI-credits blocker dissolved); Tier-1 battery 0.986 mean
recall with text-embedding-3-small (beat gemini/qwen3 in A/B); prod backfill
complete (~2,400 chunks, NN sanity verified); discovery-ranking boost fix
landed. Remaining: push main to deploy + live chat smoke. Details in the
strategy doc's Implementation log.

**Priority:** P1 — capability build (agentic chat discovery), gated phases

## Kernel

Agentic chat's targeted search (FTS + trigram via `onto_search_entities`) is healthy, but
there is no **discovery** path: "find everything related to marketing" only works on
literal keyword overlap. Build a pgvector-backed semantic layer (one `onto_embeddings`
table + worker embedding pipeline + `onto_search_semantic` RPC), expose it as a new
separate tool `explore_project`, then hybrid-RRF the smart path, and finally build the
gather→plan→update agent behavior. Release gate is the **golden standard scenario**:
"reorient my whole marketing direction" (GS-1) and "strategically insert an Instagram
campaign" (GS-2) on a seeded fixture project, graded on coverage/grounding/coherence from
DB ground truth.

**Full strategy, architecture, phasing, eval plan:**
`docs/architecture/semantic-discovery/README.md`

## Phase checklist

- [x] Phase 1 — embedding infra CODE-COMPLETE (migration + DB triggers +
      `embed_onto_entity` worker job + backfill script; hardened embeddings client
      lives in shared-agent-ops rather than smart-llm). Migration applied to prod
      2026-08-29; worker + Vercel keys verified present. Pending: backfill run
      (blocked on OpenAI org credits).
- [x] Phase 2 — RPC + `explore_project` + surfaces + telemetry CODE-COMPLETE;
      Tier-1 retrieval gate PASSED 2026-08-29 (0.986 mean recall, 0 dominance
      failures; battery + fixture in `apps/web/scripts/agentic-e2e/semantic/`).
      Residual: deploy (push main) + live chat smoke.
- [ ] Phase 3 — hybrid RRF in smart path + project-access scoping fix (both RPCs);
      June 8-query smoke stays ≥7/8
- [ ] Phase 4 — gather→plan→update behavior + approval UX; seeded marketing fixture;
      GS-1/GS-2 batteries pass

## Landmines (details in strategy doc)

- Legacy pgvector stack (`search_similar_items`, `EmbeddingManager`,
  `generate-embeddings.ts`, `onto_document_versions.embedding`) is dead and targets
  pre-ontology tables — replace, never reuse.
- `onto_search_entities` scopes by `created_by`, hiding shared entities — do not replicate
  in the semantic RPC; fix in phase 3.
- Embeddings route through OpenRouter (`PRIVATE_OPENROUTER_API_KEY`, request
  model `openai/text-embedding-3-small`, identical vectors); a direct OpenAI
  key is only the fallback. The old "OpenRouter has no embeddings endpoint"
  claim is obsolete as of 2026-08.
- Embed documents from `content`, never the legacy `props.body_markdown` mirror.
