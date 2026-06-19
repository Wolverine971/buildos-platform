<!-- apps/web/docs/technical/architecture/PROJECT_KNOWLEDGE_LAYER_HANDOFF_2026-06-19.md -->

# Project Knowledge Layer — Implementation Handoff

**Date:** 2026-06-19
**For:** the next agent picking up the Project Knowledge Layer
**Design doc:** [`PROJECT_KNOWLEDGE_LAYER_DESIGN_2026-06-16.md`](./PROJECT_KNOWLEDGE_LAYER_DESIGN_2026-06-16.md) (read this first — it has the full rationale, the 6-layer model, and the decision log)

---

## 0. TL;DR

**P1 is built and tested: Layers 0, 1, and 2 (chat-path).** The agentic chat can now _see_ every project's documents on a normal turn (a "Project Knowledge Map" in the system prompt), and pull in just the section it needs via two new tools (`get_document_outline` → `read_document_section`).

**One test is currently red** (`tool-surface-size-report`) — **not a regression in this work**; it's a budget guard that subsequent Agent Work additions blew past. See §5.

**Two things changed underneath this work since 2026-06-16** (Agent Work refactor):

1. The Layer 0 code (outline util + versioning hook) was **promoted into `@buildos/shared-agent-ops`**; the old `apps/web` files are now re-export shims. This is good — the worker shares it now. See §4.
2. **Agent Work (Phases 0–4) shipped**, which **unblocks Layer 5 (the Librarian)** — it no longer needs to wait on the substrate. See §7.

---

## 1. What the Project Knowledge Layer is

The problem (DJ's words): documents hold the richest project context, but the agent can't find or use it unless explicitly told, and docs aren't continually maintained. Two sub-problems with _opposite_ solutions:

- **Retrieval** (read/index, solved inline) — "which docs/sections matter right now, pull them in."
- **Maintenance** (write/agency, solved out-of-band) — "docs stay updated, cleaned, cross-referenced."

The solution is a 6-layer system. **P1 = Layers 0–2** (the deterministic plumbing that makes documents _usable at all_). P2 = L3–L4 (behavior). P3 = L5 (the background Librarian).

```
L5  Librarian       background agent run: dedup, cross-link, refresh → STAGED suggestions   [NOW UNBLOCKED]
L4  Capture         write durable conversation knowledge back into docs                     [not started]
L3  Proactive read  "consult the knowledge map before acting on a topic"                    [not started]
────────────────────────────────────────────────────────────────────────────────────────
L2  Section read    get_document_outline + read_document_section (chat path)                [DONE]
L1  Knowledge Map   doc_structure + titles + descriptions, in the project prompt            [DONE]
L0  Outline artifact onto_documents.outline (jsonb), deterministic, on write                [DONE]
```

---

## 2. Status by layer

| Layer                    | Status           | Notes                                                                               |
| ------------------------ | ---------------- | ----------------------------------------------------------------------------------- |
| **L0** Outline artifact  | ✅ Done + tested | Promoted to `@buildos/shared-agent-ops` (see §4)                                    |
| **L1** Knowledge Map     | ✅ Done + tested | Document-level map (titles + descriptions + hierarchy), project/ontology turns only |
| **L2** Section retrieval | ✅ Done + tested | **Chat path only.** MCP/agent-API parity is a tracked follow-up (see §6)            |
| **L3** Proactive read    | ⬜ Not started   | The "talk about marketing → it auto-reads the marketing doc" behavior               |
| **L4** Capture           | ⬜ Not started   | Write durable conversation knowledge back to docs                                   |
| **L5** Librarian         | ⬜ Not started   | **Now unblocked** — Agent Work substrate shipped                                    |

---

## 3. Exactly what was built (file by file)

### Layer 0 — Outline as a derived artifact

- **`packages/shared-agent-ops/src/utils/document-outline.ts`** — pure, deterministic, no LLM. Exports: `extractOutline`, `getSectionByAnchor`, `hashDocumentContent`, `isOutlineStale`, `countOutlineNodes`, `collectOutlineAnchors`, types `DocOutline`/`DocOutlineNode`/`DocumentSection`.
    - Anchors come from `marked-gfm-heading-id`'s `getHeadingList()` so they match rendered HTML ids. Offsets come from the block lexer (top-level token `raw` reconstructs the source). The two passes are zipped by index.
    - `getSectionByAnchor` **re-parses live** content — never trusts stored char ranges — so a section read is correct even after edits.
    - _(Was originally `apps/web/src/lib/utils/document-outline.ts`; moved here by the Agent Work refactor. The web path is now a re-export shim.)_
- **`apps/web/src/lib/utils/document-outline.ts`** — re-export shim → `@buildos/shared-agent-ops/utils/document-outline`.
- **`supabase/migrations/20260616010000_add_document_outline.sql`** — adds `onto_documents.outline jsonb` AND rewrites the `update_onto_documents_updated_at` trigger to be **outline-aware**: a write that only changes `outline` (and `updated_at`) preserves the prior `updated_at`. This is critical — without it, refreshing the derived cache would bump the recency/audit timestamp and pollute snapshots, recency sorting, and project loops. The guard: `(to_jsonb(new) - 'outline' - 'updated_at') = (to_jsonb(old) - 'outline' - 'updated_at')`.
- **`packages/shared-agent-ops/src/ontology/versioning.service.ts`** — `createOrMergeDocumentVersion` calls `persistDocumentOutline(supabase, documentId, snapshot.content)` whenever a version is created/merged (i.e. content changed). Best-effort (try/catch, never breaks the version write). This is the **central content-write hook** — gateway, web routes, task docs, restore all funnel through it.
    - **Known gap (by design):** writers that bypass versioning (tree-agent worker, homework engine, instantiation service) leave the outline stale. Harmless because the read tools recompute live. A backfill/repair could be added later.
- **Types:** `onto_documents.outline` added to `packages/shared-types/src/database.types.ts` and `database.schema.ts`. ⚠️ **Hand-edited** — run `pnpm gen:all` to regenerate properly against the DB.

### Layer 2 — Section retrieval (chat path)

Two new chat tools wired end-to-end:

- **Definitions:** `apps/web/.../tools/core/definitions/ontology-read.ts` — `get_document_outline`, `read_document_section`.
- **Metadata:** `.../definitions/tool-metadata.ts` — both, `category: 'read'`, `contexts: ['project']`.
- **Executor:** `.../executors/ontology-read-executor.ts` — `getDocumentOutline()` and `readDocumentSection()`. They reuse the existing private `loadAgentDocumentDetails()` (RLS-scoped supabase read) + the pure utils. **No new API route, no gateway op.**
- **Arg types:** `.../executors/types.ts` — `GetDocumentOutlineArgs`, `ReadDocumentSectionArgs`.
- **Dispatch:** `.../tools/core/tool-executor.ts` — two new `case` branches.
- **Catalog:** `.../tools/core/tools.config.ts` — added to `TOOL_CATEGORIES.ontology` + `TOOL_GROUPS.project`.
- **Surface (ungating):** `.../tools/core/gateway-surface.ts` — both added to `PROJECT_BASIC_DIRECT_TOOL_NAMES`, so they're available on _every_ project turn (not gated behind a document-write turn). The heavy full-body `get_onto_document_details` was deliberately **not** ungated.

### Layer 1 — Project Knowledge Map

- **`apps/web/.../agentic-chat-lite/prompt/build-lite-prompt.ts`** — new `buildProjectKnowledgeMapSection(focus, data)` + `renderKnowledgeMapNodes()`. Renders the `doc_structure` summary (already in `ProjectContextData`) as an indented folder/doc map with titles + truncated descriptions + `[id: <uuid>]`, and instructs the agent to scan it then use the L2 tools. Budget caps: **60 nodes / 2200 chars / 100-char descriptions.** Renders for `project`/`ontology` contexts only; null (skipped) otherwise.
- **`apps/web/.../agentic-chat-lite/prompt/types.ts`** — added `'project_knowledge_map'` to `LitePromptSectionId` and the section is inserted into `LITE_PROMPT_SECTION_ORDER` (after `location_loaded_context`).
- Data flow confirmed: the stream endpoint (`routes/api/agent/v2/stream/+server.ts:3676`) spreads `...promptContext` into `buildLitePromptEnvelope`, and `promptContext.data` is the `ProjectContextData` which carries `doc_structure` (`context-models.ts:275`). No extra query, no RPC change, no worker change.

---

## 4. ⚠️ Landmine: shared-agent-ops promotion (changed since the session)

Between the implementation session (2026-06-16) and now (2026-06-19), the Agent Work refactor moved document versioning + the outline util into **`@buildos/shared-agent-ops`** so the worker's Agent Run runner shares them. As a result:

- `apps/web/src/lib/services/ontology/versioning.service.ts` → **re-export shim**.
- `apps/web/src/lib/utils/document-outline.ts` → **re-export shim**.
- The real implementations (with the L0 hook and outline logic intact) live in `packages/shared-agent-ops/src/{ontology/versioning.service.ts, utils/document-outline.ts}`.

**Implication:** edit the **shared-agent-ops** copies, not the web shims. After editing shared-agent-ops, it may need a build (`pnpm build --filter=@buildos/shared-agent-ops`) for the worker to pick up changes; the web app resolves the package directly. The `dist/` artifacts already reflect the current code.

This is actually a _win_ for L5 (Librarian) — the background runner can reuse the exact same outline + versioning code.

---

## 5. ⚠️ Currently failing test (decide the budget)

`apps/web/src/lib/services/agentic-chat-v2/tool-surface-size-report.test.ts` →
`keeps deterministic preloaded profiles below target payload sizes`: **expected 15482 ≤ 12000.**

**Why:** This session set the `project_basic` budget to **12000** when the surface serialized to ~11684 (after adding the 2 L2 tools). Since then, **Agent Work Phase 4 added `delegate_task` + `commit_change_set` to `PROJECT_BASIC_DIRECT_TOOL_NAMES`** (see commit `b764fe1f`), pushing it to **15482**. Nobody updated the budget guard. This is **not** a Project Knowledge Layer bug — it's the guard catching unbudgeted surface growth (exactly its job).

**Recommended remediation (next agent's call):**

- **Option A (likely correct):** bump the threshold to ~16000 with a dated justification comment (matching the existing comment history in that test), acknowledging `delegate_task` + `commit_change_set` + the 2 L2 tools are all deliberately always-on.
- **Option B (worth considering):** the project_basic opening menu is getting large (~15.5k chars). Reconsider whether all of `delegate_task`, `commit_change_set`, and the L2 tools must be always-on, or whether some should materialize via lean discovery. This ties into the broader harness catalog-bloat concern (see the 2026-06-14 harness audit).

The L2 budget comment I added (11000→12000, dated 2026-06-16) is in that test file and explains the +1067 for the two retrieval tools.

---

## 6. Key architecture findings & decisions (don't re-derive these)

1. **Two separate tool execution subsystems.** In-product chat tools dispatch through `ontology-read-executor.ts` → internal `/api/onto/...` routes (or direct supabase reads). The MCP / BuildOS Agent API uses `external-tool-gateway.ts` ops gated by `BUILDOS_AGENT_SUPPORTED_OPS` (`packages/shared-types/src/agent-call.types.ts`). **L2 was wired into the chat path only** (DJ's explicit choice). MCP parity = a tracked follow-up: add `onto.document.outline.get` + `onto.document.section.get` ops (type union + handler + `EXTERNAL_OP_HANDLERS` + tool def). The pure utils already exist to back them.
2. **Map over embeddings.** At single-project scale (tens of docs), an LLM reasoning over a clean map beats vector similarity — transparent, hierarchical, no embedding pipeline. `onto_documents.search_vector` exists but is unused; leave it. Embeddings are a later optimization only if a project's KB gets huge.
3. **The L1 map is document-level, not heading-level (deliberate).** Titles + descriptions + hierarchy go in every project turn; per-doc h1/h2 headings are reached on demand via `get_document_outline`. This respects the token budget and matches progressive disclosure: the map is the _doc-level_ scan, the outline tool is the _doc-internal_ scan. (If doc-level proves insufficient in practice, the follow-up is to fold h1/h2 into the map — `extractOutline` already produces them.)
4. **The outline is deterministic; reserve LLM work for the Librarian.** It's a pure function of content → recompute on save, ~free, always fresh. Stronger freshness than the LLM-written `description` field.
5. **Maintenance is background + staged, never inline + silent.** Doc content is high-trust user-visible data. The Librarian (L5) must emit staged suggestions for review, not silent rewrites.

---

## 7. Next steps

### P2 — the behavior layer (highest user-visible value)

- **L3 — Proactive read.** Wire a `consult_knowledge_base` capability into `domains/domain-sensing.ts` (runs every turn) + a prompt line in `build-lite-prompt.ts`: "before acting on a topic, scan the Project Knowledge Map; if a relevant doc/section exists, read it first." Add a `knowledge_retrieval` skill (the procedural how-to). This is what turns "the agent _can_ read docs" into "the agent _does_, unprompted." Bound it with the existing `context-gathering-ledger.ts` novelty/round budgets.
- **L4 — Capture.** Prompt/skill nudge (extend `document_workspace` SKILL.md): when a conversation produces a durable decision/plan/context, append it to the right doc (reuse `update_onto_document` append/merge). Conservative bar — capture decisions, not chatter. Visible action, never a silent background write.

### P3 — L5 Librarian (NOW UNBLOCKED)

Agent Work Phases 0–4 shipped (durable runs, `scope_mode`/`allowed_ops`, `entities_touched` telemetry, staged mutations with `stage → proposal_ready → commit` + `ChangeSetReview` UI + `commit_change_set`). See `apps/web/docs/technical/architecture/agent-work/HANDOFF_2026-06-19.md`. The Librarian is now a natural fit: a background Agent Run that reconciles a project's KB (regenerate stale outlines, dedup, propose cross-links, flag stale sections, suggest reorg) and emits everything as **staged suggestions** via the shipped review flow. It can reuse the shared-agent-ops outline + versioning code directly.

---

## 8. Pre-merge checklist

- [ ] `pnpm gen:all` — regenerate DB types (the `onto_documents.outline` addition to `database.types.ts`/`database.schema.ts` was hand-edited).
- [ ] Decide + fix the `tool-surface-size-report` budget (§5).
- [ ] `pnpm check` — full `svelte-check` was skipped during the session (slow). Run it.
- [ ] Apply the migration `20260616010000_add_document_outline.sql` (and consider a one-time backfill of `outline` for existing docs — not required for correctness since reads recompute live, but makes the first map/scan complete).
- [ ] Verify `@buildos/shared-agent-ops` builds if you touch it (`pnpm build --filter=@buildos/shared-agent-ops`).

## 9. Tests (this work)

Green (run from `apps/web`):

- `src/lib/utils/document-outline.test.ts` — 16 tests (extraction, anchors, code-fence exclusion, char ranges, section slicing, staleness)
- `src/lib/services/ontology/versioning.service.test.ts` — 3 tests (incl. outline persisted on version write)
- `src/lib/services/agentic-chat/tools/core/executors/ontology-read-executor.outline.test.ts` — 4 tests (outline, section, miss-with-anchors, not-found)
- `src/lib/services/agentic-chat-lite/prompt/build-lite-prompt.test.ts` — knowledge-map render test + updated global-seed assertion
- ❌ `src/lib/services/agentic-chat-v2/tool-surface-size-report.test.ts` — fails on budget, see §5

**Not ours:** 5 pre-existing failures in `src/lib/services/agentic-chat/tools/core/tool-executor.test.ts` (the `update_onto_document` merge_llm path) — verified pre-existing by stashing this work and re-running.

---

## 10. How to try it live

1. Apply the migration. 2. Open chat scoped to a project that has documents with markdown headings. 3. The system prompt should contain a `## Project Knowledge Map` section listing the docs. 4. Ask about a topic a doc covers — the agent has `get_document_outline` / `read_document_section` available and can scan→read. (L3 is what will make it do so _proactively_ without being asked.)
