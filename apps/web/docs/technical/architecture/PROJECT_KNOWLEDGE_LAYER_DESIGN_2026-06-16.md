<!-- apps/web/docs/technical/architecture/PROJECT_KNOWLEDGE_LAYER_DESIGN_2026-06-16.md -->

# Project Knowledge Layer — Design

**Status:** Proposed
**Date:** 2026-06-16
**Owner:** DJ
**Scope:** How the agentic chat (and background agents) discover, read, use, and maintain project documents as living context.

---

## 1. Problem

A project contains tasks, documents, goals, plans, milestones, risks. **Documents hold the richest context** — vision, marketing plans, research, decisions — but today that context is effectively invisible to the agent unless the user explicitly points at a document. We want two things:

- **Retrieval:** when work touches a topic (e.g. "let's market this"), the agent should automatically find and pull the relevant document context.
- **Maintenance:** documents should be continually updated, cleaned, and cross-referenced as the project evolves — not just when the user says "go update this doc."

These feel like one problem but want **opposite solutions**: retrieval is a _read/index_ problem solved inline; maintenance is a _write/agency_ problem best solved out-of-band. Conflating them is the main design trap.

---

## 2. Current state (diagnosis)

### 2.1 We have inter-document structure, not intra-document structure

`onto_projects.doc_structure` (JSONB) is a well-built **tree of which documents exist**: folders, titles, descriptions, public status, order, children. Type defs in `apps/web/src/lib/types/onto-api.ts:296` (`DocTreeNode` / `DocStructure`). It is auto-maintained with optimistic locking + full history by `apps/web/src/lib/services/ontology/doc-structure.service.ts`.

What it does **not** contain is what's _inside_ each document. There is no representation of a document's headings/outline anywhere in the system. That is the missing layer.

> **The key composition:** `doc_structure` (hierarchy of docs) + per-document heading outline = one navigable table of contents for the entire project brain: **folders → docs → sections.**

### 2.2 The agent cannot find document content today — by construction

| Reason                                   | Evidence                                                                                                                                                                                        |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Document content isn't in context        | `context-loader.ts` preloads ~20 docs with only `id, title, state_key, created_at, updated_at` (`PROJECT_CONTEXT_DOCUMENT_LIMIT = 20`). Never `description`, never body.                        |
| Search is title-only                     | `search_onto_documents` matches on title; broader path is ILIKE on title/content/description. `onto_documents.search_vector` exists but is **never populated**. No semantic search.             |
| Doc-read tools gated behind write-intent | `tool-selector.ts` only pre-mounts `get_onto_document_details` / `get_document_tree` when a regex detects a _document-write_ turn. A "talk about marketing" turn never sees them.               |
| Prompt treats docs like any other entity | `build-lite-prompt.ts` — no "consult the knowledge base first" instruction. All behavior is reactive (`write-ledger.ts`, `context-gathering-ledger.ts` fire _after_ tool rounds, never before). |

### 2.3 No outline / TOC / summary extraction exists

`marked` + `gfmHeadingId` are used for rendering only (`apps/web/src/lib/utils/markdown.ts`, `markdown-nesting.ts`). No heading extraction, no section index. This design adds it; it duplicates nothing.

### 2.4 Existing assets we will reuse

- `projectContextSnapshotWorker.ts` (`apps/worker`) — already caches a project snapshot (15-min TTL) including `doc_structure` and per-entity highlights. Natural home for the knowledge map.
- `external-tool-gateway.ts` — single write path for `createDocument` / `updateDocument`, already computes content hashes + versions. Natural home for outline computation on write.
- `document_workspace` SKILL.md — governs placement/hierarchy/append rules. Natural home for read+capture behavioral guidance.
- Agent Work substrate (`apps/web/docs/technical/architecture/agent-work/`) — durable background runs with `scope_mode`, `allowed_ops`, `entities_touched` telemetry, and opt-in staging. Natural home for the Librarian.

---

## 3. Design principle: embeddings vs. the outline map

The reflex answer to "find relevant docs" is RAG/embeddings (and a dormant `search_vector` column invites it). **We deliberately do not lead with embeddings.**

At the scale of one human's project (tens of docs, not millions), an LLM **reasoning over a clean heading map** beats cosine similarity: it follows hierarchy, it's transparent ("'Marketing > Channels > Instagram' is relevant → read it"), it needs no embedding pipeline to keep fresh, and it degrades gracefully. Embeddings are the _scale_ answer; the outline map is the _taste_ answer for this scale.

Embeddings become a later optimization **only** if a single project's knowledge base grows large enough that the map no longer fits a cheap scan. The architecture below leaves room for that (the map is an index; a vector index would be a sibling index), but v1 ships without it.

**Corollary — keep the outline deterministic.** The heading outline is a _pure function of `content`_: recompute on every save, no LLM, always fresh. This is a strictly stronger freshness property than the LLM-generated `description` field, which drifts. Reserve LLM work for enrichment (Librarian), never for the base outline.

---

## 4. Architecture overview

Six layers. Each is independently shippable; each lower layer makes the next trivial.

```
Layer 5  Librarian            background agent run: dedup, cross-link, refresh, reorg → STAGED suggestions
Layer 4  Capture              write durable conversation knowledge back into docs
Layer 3  Proactive read       "consult the knowledge map before acting on a topic"
─────────────────────────────────────────────────────────────────────────────────────
Layer 2  Section retrieval    get_document_outline + read_document_section (always available)
Layer 1  Knowledge Map        doc_structure + descriptions + h1/h2 headings, cached
Layer 0  Outline artifact     onto_documents.outline (jsonb), deterministic, computed on write
```

Layers 0–2 are deterministic plumbing that makes documents _usable at all_. Layer 3 is the behavior change you feel. Layers 4–5 make the knowledge base _self-improving_.

---

## 5. Layer 0 — Outline as a derived artifact

**Goal:** every document carries a fresh, machine-readable outline of its markdown headings.

### 5.1 Storage

Add a column to `onto_documents`:

```sql
ALTER TABLE onto_documents ADD COLUMN outline jsonb;
```

(Alternative considered: store on the `doc_structure` node. Rejected — it bloats the project-level tree, couples doc content to project structure, and forces a project-tree write on every doc edit. Keep intra-document data on the document.)

### 5.2 Shape

Nested tree mirroring heading hierarchy. Each node carries a char range covering itself **and its descendants**, up to the next heading of equal-or-higher level.

```ts
interface DocOutlineNode {
	level: number; // 1..6
	text: string; // heading text, plain (markdown stripped)
	anchor: string; // gfmHeadingId slug — stable read key
	char_start: number; // offset in content where this section begins
	char_end: number; // offset where it ends (next sibling/uncle or EOF)
	word_count: number; // words in this section's body (excl. children)
	children?: DocOutlineNode[];
}

interface DocOutline {
	version: 1;
	content_hash: string; // reuse the snapshot_hash already computed on write
	nodes: DocOutlineNode[];
}
```

### 5.3 Computation

- Pure function `extractOutline(markdown): DocOutline`. Reuse `marked`'s lexer + the existing `gfmHeadingId` slug logic so anchors match rendered anchors exactly.
- Wired into the single write path in `external-tool-gateway.ts` (`createDocument`, `updateDocument`) — same place `snapshot_hash` is computed. **No LLM, synchronous, ~free.**
- `content_hash` lets any consumer detect staleness cheaply.

### 5.4 Backfill

One-time worker job (or a column default + lazy compute on first read). Iterate existing `onto_documents`, compute, write. Idempotent; safe to re-run.

### 5.5 Acceptance

- Creating/editing a doc populates/refreshes `outline` in the same transaction.
- `outline.content_hash === document snapshot_hash` for any non-stale doc.
- Anchors round-trip with rendered HTML anchors (so deep links work).

---

## 6. Layer 1 — Project Knowledge Map

**Goal:** one compact, cached artifact that lets an agent (or human) scan the _whole_ project brain and decide what's relevant — the realization of "scan the headers, is this relevant? yes/no," but for all docs at once.

### 6.1 Shape

Compose `doc_structure` (hierarchy) + each doc's `description` + its **h1/h2 only** outline (truncated). h3+ is intentionally omitted from the map to keep it scannable; the agent zooms into h3+ via Layer 2 once it picks a doc.

Rendered, compact text form (token-budgeted) for the prompt — illustrative:

```
# Project Knowledge Map
- 📁 Marketing/
  - 📄 Go-to-Market Plan — "Channels, positioning, launch sequence" [doc_id: …]
      ## Positioning · ## Channels · ## Launch Sequence · ## Budget
  - 📄 Brand Voice — "Tone, vocabulary, do/don't" [doc_id: …]
      ## Voice Principles · ## Vocabulary · ## Examples
- 📁 Product/
  - 📄 Vision — "North star, 12-month bets" [doc_id: …]
      ## North Star · ## Bets · ## Non-Goals
```

### 6.2 Home

Extend `projectContextSnapshotWorker.ts` — it already serializes `doc_structure` and caches with a 15-min TTL. Add the map assembly there so it's pre-built and cheap to inject. Invalidate/rebuild on document write (the worker already keys off `source_updated_at`).

### 6.3 Surfacing

Two modes (pick per context size):

- **Inject** the rendered map into project-scoped system prompts (it's small — titles + descriptions + h1/h2). This is the default and makes the agent _aware_ without a tool call.
- **Tool** `get_project_knowledge_map(project_id)` for when injection would be too large or for global/cross-project chats.

### 6.4 Acceptance

- Map fits a strict token budget (target: well under the current ~1,900–2,400 static catalog floor noted in the 2026-06-14 harness audit; truncate descriptions, cap headings per doc).
- Rebuilt within one snapshot cycle of any doc edit.
- Byte-stable when nothing changed (preserve OpenRouter prefix-caching).

---

## 7. Layer 2 — Section-level retrieval

**Goal:** turn "read the 200 KB doc" into "read the one relevant section." Three cheap hops: scan map → pick doc → read section.

### 7.1 Tools

```
get_document_outline(document_id)
  → full DocOutline (all levels). Cheap; lets the agent drill past the h1/h2 in the map.

read_document_section(document_id, anchor)
  → markdown body of that section (heading + content up to char_end).
    Re-parse content live on read (do NOT trust stored char ranges) so edits between
    snapshot and read can never return stale/incorrect slices. Stored outline is for
    scanning; live re-parse is for slicing.
```

(Alternative: add a `section` param to `get_onto_document_details`. Either works; discrete tools read more clearly in tool listings.)

### 7.2 Availability — the critical change

Mount these in **all project-scoped profiles**, not gated behind write-intent. Update `gateway-surface.ts` project profiles and `tool-selector.ts` so read/outline tools are present on plain conversational turns. (Write tools stay gated as today.)

### 7.3 Acceptance

- A topic-only turn (no write intent) has outline + section-read tools available.
- `read_document_section` returns correct content even if the doc was edited after the last snapshot.

---

## 8. Layer 3 — Proactive read behavior

**Goal:** the "talk about marketing → agent checks the marketing docs" magic.

### 8.1 Mechanism

- **Domain sensing already runs every turn** (`domain-sensing.ts`, renders "## Active Domain Signals"). Add a `consult_knowledge_base` capability that, when a domain signal fires _and_ the knowledge map contains a doc/section matching that domain, recommends scanning + reading before acting.
- **Prompt line** (in `build-lite-prompt.ts`, project context): _"Before answering or acting on a topic, scan the Project Knowledge Map. If a relevant document/section exists, read that section (read_document_section) before proceeding. Prefer existing project knowledge over re-deriving it."_
- This is the layer where a **skill** belongs (procedural: how to scan → select → read → cite). Likely a new `knowledge_retrieval` skill or an extension of an existing context skill.

### 8.2 Guardrails

- Bounded: scan map (free, in context) → at most a small number of section reads. Reuse `context-gathering-ledger.ts` novelty/round budgets so the agent doesn't read endlessly.
- The agent should _cite_ which doc/section it used, so retrieval is auditable.

### 8.3 Acceptance

- In a fresh project-scoped chat, mentioning a topic that has a relevant doc causes the agent to read the relevant section unprompted, and reference it.

---

## 9. Layer 4 — Capture (write knowledge back)

**Goal:** durable knowledge produced _in conversation_ lands in the right doc, instead of evaporating.

### 9.1 Mechanism

- Behavioral nudge in the `document_workspace` skill + prompt: _"When a conversation produces a durable decision, plan, or piece of context, append it to the most relevant existing document (or create one), following placement rules. Capture decisions; don't transcribe chatter."_
- Reuse existing `update_onto_document` append/merge strategies (already supported, already truth-checked by `write-ledger.ts` and the document-claim corrector).

### 9.2 Boundaries

- Reactive-but-encouraged, **not** silent. The agent proposes/performs a capture as an explicit, visible action — never a hidden background write during a read turn.
- Keep it conservative: over-capturing pollutes the knowledge base worse than under-capturing. Bias toward decisions and durable context, not running commentary.

---

## 10. Layer 5 — The Librarian

**Goal:** where "continually cleaned and cross-referenced" actually lives. A **background** maintenance agent, not inline chat behavior.

### 10.1 Why background, not inline

Making the chat agent do janitorial upkeep mid-conversation bloats every turn and distracts from the user's actual ask. Maintenance is naturally batch, periodic, and review-gated — exactly the Agent Work substrate's purpose.

### 10.2 What it does

A scheduled/triggered Agent Run (rides `agent-work/` substrate) that reconciles a project's knowledge base:

- **Regenerate outlines** for any doc whose `outline.content_hash` ≠ current hash (cheap safety net; Layer 0 keeps it fresh, this catches gaps).
- **Detect duplication / overlap** across docs (same topic in two places) → propose merge.
- **Propose cross-links** between related docs/sections.
- **Flag stale sections** (e.g. sections contradicting newer tasks/decisions — this is where an LLM pass is justified).
- **Suggest reorganization** of `doc_structure` (the existing `projectLoopWorker` already hints at this).

### 10.3 Critical constraint: staged, never silent

All Librarian output is **staged suggestions** (`review: true`), surfaced for human approval. Document content is high-trust, user-visible data; an autonomous rewrite that's subtly wrong is worse than no maintenance. Use `entities_touched` telemetry for ground-truth reporting of what it changed.

### 10.4 Dependency

Layer 5 rides on Agent Work, which is **pre-implementation**. It's the last layer for a reason. Layers 0–4 deliver most of the value and don't block on it.

---

## 11. Phasing & sequencing

| Phase                     | Layers  | Risk                         | Payoff                                                                    |
| ------------------------- | ------- | ---------------------------- | ------------------------------------------------------------------------- |
| **P1 — Foundation**       | 0, 1, 2 | Low (deterministic plumbing) | Agent can _find and read_ doc content at all; three-hop section retrieval |
| **P2 — Behavior**         | 3, 4    | Medium (prompt/skill tuning) | The "checks marketing docs" magic; conversation knowledge persists        |
| **P3 — Self-maintenance** | 5       | Higher (needs Agent Work)    | Knowledge base cleans/cross-links itself, review-gated                    |

Ship P1 end-to-end before touching P2 — the behavioral layer is only effective once the data, index, and tools exist. Writing the skill first (the tempting shortcut) instructs the agent to do something it has no efficient mechanism for.

---

## 12. Decisions & tradeoffs (log)

1. **Outline lives on `onto_documents`, not on `doc_structure` nodes.** Keeps intra-document data with the document; avoids project-tree writes on every doc edit.
2. **Deterministic outline, no LLM.** Pure function of content → always fresh, ~free. LLM reserved for Librarian enrichment.
3. **Map = h1/h2 only.** Scannability over completeness; h3+ reached via Layer 2 zoom-in.
4. **Section reads re-parse live.** Stored char ranges are for scanning/sizing, not slicing — avoids stale-offset bugs.
5. **Read tools ungated; write tools stay gated.** Reading is cheap and should always be possible; writing keeps its intent gate.
6. **Map over embeddings (for now).** Reasoning beats similarity at single-project scale; leave room for a vector sibling index later.
7. **Maintenance is background + staged, not inline + silent.** Protects high-trust doc content; keeps conversational turns lean.

---

## 13. Open questions

- **Map injection budget:** inject always, or inject only when domain sensing indicates a doc-relevant turn? (Leaning: always for project chats, it's small.)
- **Capture aggressiveness (Layer 4):** what's the exact bar for "durable knowledge"? Needs a few real sessions to calibrate.
- **Librarian trigger:** scheduled cadence, on-N-edits, or on session end? (Leaning: on session end + low-frequency cron.)
- **Outline for non-markdown content:** any docs that aren't markdown? (Research said content is markdown; confirm no exceptions.)
- **Embeddings threshold:** at what doc count / total size does the map stop being a cheap scan and justify a vector index?

---

## 14. Touch points (where the code lives)

- `packages/shared-types` — `onto_documents.outline` type; regen schema.
- `supabase/migrations/` — add `outline` column; backfill migration/worker.
- `apps/web/src/lib/utils/` — new `extractOutline()` (reuse `marked` + `gfmHeadingId`).
- `apps/web/src/lib/server/agent-call/external-tool-gateway.ts` — compute outline on create/update.
- `apps/worker/.../projectContextSnapshotWorker.ts` — assemble + cache the knowledge map.
- `apps/web/src/lib/services/agentic-chat/tools/core/definitions/ontology-read.ts` — `get_document_outline`, `read_document_section`, `get_project_knowledge_map`.
- `apps/web/.../tools/core/gateway-surface.ts` + `agentic-chat-v2/tool-selector.ts` — ungate read tools in project profiles.
- `apps/web/.../agentic-chat-lite/prompt/build-lite-prompt.ts` — inject map + consult-first instruction.
- `apps/web/.../tools/domains/domain-sensing.ts` — `consult_knowledge_base` capability.
- `apps/web/.../tools/skills/definitions/` — `knowledge_retrieval` skill; extend `document_workspace` for capture.
- Agent Work substrate (`apps/web/docs/technical/architecture/agent-work/`) — Librarian run definition (P3).

```

```
