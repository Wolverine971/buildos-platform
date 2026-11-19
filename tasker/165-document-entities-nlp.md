<!-- tasker/165-document-entities-nlp.md -->

# 165 — People, companies and things from documents (free NLP first)

**Status:** OPEN · **Opened:** 2026-11-17 · **Parent:** 160
**DJ (2026-11-17):** find people, companies and entities in documents, only recent documents
(last few months) from active accounts. "Documents are tricky because there's a lot of
information. I would love to try to use an NLP library to identify entities … that's free …
then we try to look for information on those entities later. Think in terms of how we scale this out."

## Facts

- DJ has 419 docs (`onto_documents`). Nothing reads docs for people today.
- Tasks use a paid fast model (`extract_task_entities`); docs are much longer, so a model per doc
  costs more and scales worse. Docs already have outlines/digests (tasker 150/152).

## Approach

1. **Free local NER in the worker (Node).** Candidates to bake off on real docs (dry, free):
    - `@huggingface/transformers` (transformers.js) with a BERT NER model (e.g.
      `Xenova/bert-base-NER`: PER / ORG / LOC / MISC), CPU, ~100 MB model, cached.
    - `compromise` (`.people()`, `.organizations()`): tiny and fast, lexicon-based, likely
      lower precision.
    - (Python spaCy is best-in-class but needs a Python runtime on Railway; only if the Node
      options are clearly bad.)
      Measure on ~30 of DJ's recent docs: precision on people/orgs (hand-check), time per doc,
      memory on the worker. A trained NER model is not regex classification; it's allowed.
2. **Filters:** documents `created_at` within the last 3 months, owners active (same definition
   as 162), not archived/deleted. Chunk long docs; skip code blocks/tables of numbers.
3. **Write path:** each mention → private knowledge entity (`created_via 'document'` or reuse
   `backfill`), linked to the doc (`knowledge_record_links`, record kind document), source per doc.
   Same identity rules as tasks: one-word person names reuse within the user's own notes, otherwise
   suggest; orgs match by name (+ the folded org key from 161 when it lands).
4. **Noise control:** keep entities mentioned ≥ 2 times or appearing in a heading/title, drop
   the user's own name, project names, and product/tool names that are already orgs DJ marked
   hidden. Optionally a cheap model pass only on the shortlisted names (paid, later, needs OK).
5. **Keep fresh:** run on doc create/update (debounced, content-hash skip), like tasks.
6. **Then enrich later** through 164's queue, never automatically.

## Done when

- Bake-off table (precision / speed / memory) on DJ's real docs → library picked.
- Dry run script prints what it would create for DJ; DJ OKs; live run writes; counts reported.
- New/edited recent docs feed the graph automatically.

## 2026-11-17 PM: bake-off, reader built, dry run for DJ (all free)

### Bake-off (30 of DJ's recent docs, seeded random sample, local, read-only)

Names kept for the precision check: ≥ 2 mentions in a doc (BERT also mean probability ≥ 0.8).
Precision = a random 40 distinct names per type, checked by hand.

|                    | BERT NER (`Xenova/bert-base-NER`, q8, transformers.js)                                                                            | `compromise` 14.20                                                                         |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| People precision   | **39/40 are people** (35/40 usable full names; 4 were surname/first-name fragments, now folded)                                   | 23–28/40 (Ferrari, Claude Opus, Glen Burnie, Nikola, "Nate Rempe (Omaha" tagged as people) |
| Org precision      | 30–34/40 (misses: Colossus, Tysons, SenseNova, Grok, "Baba", "Aviation")                                                          | 29/40 ("AI data", "Reddit post", "Breaking News", "Management")                            |
| Org recall         | 297 candidate orgs                                                                                                                | 76: missed OpenAI, Anthropic, Apple, Meta, SpaceX, Shopify (no lexicon entry)              |
| Speed              | 0.30 s / 10k chars (8 threads), 0.57 (2), **0.85 (1 thread)**; ~1.6 under heavy laptop load                                       | 0.02 s / 10k chars                                                                         |
| Peak memory        | ~355 MB process (≈ +150 MB for the model)                                                                                         | ~205 MB                                                                                    |
| Download / install | 109 MB model once (q8 ONNX + 0.7 MB tokenizer); transformers.js + onnxruntime-node **already ship in the worker** (kokoro-js TTS) | 4 MB package, no model                                                                     |
| Cold start         | 0.25–0.4 s load from disk cache; first use downloads                                                                              | none                                                                                       |

**Pick: BERT via transformers.js.** compromise is a lexicon/rule tagger (close to the keyword
lists AGENTS.md rules out) and misses most companies. spaCy not needed.

Railway: no new packages (lockfile +3 lines: `@huggingface/transformers@3.8.1` made a direct
worker dependency, same version kokoro-js already installs). The model downloads on first use per
container to `KNOWLEDGE_NER_CACHE_DIR` (default OS temp dir; re-downloaded after each deploy,
~109 MB from the HF CDN), loads lazily once per process (~+150 MB RSS, only in the process that
reads documents), one CPU thread by default (`KNOWLEDGE_NER_THREADS`). DJ's whole 3-month backlog
(154 docs, 1.6M chars) is ~2.5–4.5 min of one core.

### Built (UNCOMMITTED)

- `apps/worker/src/workers/knowledge/documentEntityText.ts`: markdown → plain chunks (≤ 1,200
  chars, ≤ 100k per doc) + title/heading list. Structural cleanup only (code, URLs, images, HTML,
  markers; table cells and list items stay separate; line breaks kept).
- `apps/worker/src/workers/knowledge/documentNer.ts`: lazy BERT loader + word-piece → span
  assembly with offsets; names never run across a line break or `/ ; |`.
- `apps/worker/src/workers/knowledge/documentEntityPlan.ts`: noise control + the write batch.
  Kept = person/org with mean probability ≥ 0.85, named ≥ 2× or in the title/a heading. Dropped:
  the user's name (and its single words), project names, hidden entries, one-word person names
  the graph doesn't have yet. "Coogan" folds into the only "John Coogan" in the doc. Write =
  private entries (via `backfill`, so the store's identity rules for the user's own notes apply)
    - `knowledge_record_links` (record_kind `document`, quote = words around the first mention).
      No source rows: a mention backs no fact, and links upsert, so re-runs write nothing new.
- **Link-only for AI research docs** (`document.knowledge.research`, 79 of DJ's 154 recent docs):
  there a name is linked only when it is already in the graph or kept from the owner's other
  docs in the same run; no new entries, no one-word people. Without this the run would create
  1,466 entries, mostly public figures and big companies from research briefs.
- `apps/worker/scripts/knowledge-docs-entities.ts`: dry by default; `--live` needs
  `KNOWLEDGE_DOCS_LIVE=1`. Filters: created in the last 3 months, not deleted/archived, project
  still open to the owner, owner active (tasker 162 definition). `--link-only-types`,
  `--exclude-type`, `--limit`, `--threads`, `--out`.
- 9 tests in `documentEntityPlan.test.ts`; worker typecheck clean. No migration: `created_via`
  `backfill`, record kind `document` and the card's "In your work" document links all exist.

### Dry run for DJ (free, local model, nothing written)

`pnpm exec tsx scripts/knowledge-docs-entities.ts --user-email <DJ>`

- 154 docs (1,631k chars). Kept 246 distinct names (58 people, 188 orgs), 466 document links.
- **152 new entries (12 people, 140 orgs)**; 94 already in the graph get document links.
- Dropped mentions: low confidence 2,399 · one mention 601 · first name only 314 · project 112 ·
  self 54 · not in graph (research docs) 5,870.
- Existing entries that gain doc links: Phil (7 docs), Larry Fox (5), John Merson (5), Rod
  Chamberlin (4), Emily Jashinsky (4), Casey Fenske (3), OpenAI (25), SpaceX (11), Bid Desk (4).
- New people (all 12): Abdul El…, Alex Lieberman, Beth Wirfs, Brian Hicks, Ian Miner, Johnny
  Huynh, Lindsay Clancy, Michael Rainey, Nathan DiGregorio, Phil Valeo, Phillip Velayo, Tommy
  Christopher.
- New orgs, good: Redline Training Company, C4 Planning Solutions, MetroStar Systems, Vannevar
  Labs, Webworld Technologies, Maryland Content Authority, Sabio Coding Bootcamp, Anduril,
  Palantir, DoorDash, Procore, PlanHub.
- New orgs, junk (~26 of 152, ≈ 83% precision on new entries): GPU, Email, Desk, Discovery
  notes, Agentic Platform, FDE, GraphQL, DC, UAS, ICP, "Logan" (a person typed as org).
  Raising the bar to 0.9 halves the junk (26 → 14) but loses 24 good names; kept at 0.85.
- Near-duplicates the store will keep separate until the folded org key (161) lands: Anduril /
  Anduril Industries, Palantir / Palantir Technologies, Red Cell / Red Cell Partners, Phil Valeo /
  Phillip Velayo.

Live (needs DJ's OK; writes production, no spend):
`KNOWLEDGE_DOCS_LIVE=1 pnpm exec tsx scripts/knowledge-docs-entities.ts --user-email <DJ> --live`

### Keep fresh (sketch, not built)

1. Hook: the embedding trigger already queues `embed_onto_entity` whenever a document's title,
   description or content changes (every writer), and that job refreshes the outline. After it,
   queue `extract_document_entities` with a per-document dedupe key and ~10 min delay (debounce
   while someone is typing).
2. State: new table `onto_document_entity_state (document_id pk, content_hash, reader_version,
outcome, entity_count, read_at)` (one migration, like `onto_task_entity_state`). The job skips
   when `content_hash` + reader version match; skips owners who are not active, deleted/archived
   docs, and projects the owner left (same `canOpenProject` rule as task sync).
3. Job: load the model once per process on the general worker (or Libri if memory is tight),
   read, pick, `store.record(..., { via: 'system' })`; drop this doc's `system`/`backfill` links
   for names no longer in the text (entries stay). Bump `reader_version` when the rules change.
4. Cost: zero per doc; ~0.1–1 s CPU for a typical doc. Enrichment stays manual via 164's queue.

## 2026-11-17 evening: LIVE for DJ (free)

154 docs, 281.8 s of model time on one core (local laptop): 148 new entries (12 people, 136 orgs),
100 existing linked, 468 document links, 0 problems. DJ's graph now 570 entries (147 people, 416
orgs), 1,059 links. Code UNCOMMITTED; keep-fresh path not built yet.
