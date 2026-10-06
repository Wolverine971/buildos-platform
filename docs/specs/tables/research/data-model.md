<!-- docs/specs/tables/research/data-model.md -->

# Spreadsheets / Tables in BuildOS: data model, storage, linking research

Date: 2026-10-04. Read-only research. All prod queries were aggregate SELECTs via `supabase db query --linked`.

---

## 0. TL;DR

- **Recommendation: a table is a document.** Use an `onto_documents` row with `type_key = 'document.table'` as the table's identity. Store the structured data in a new child table, `onto_document_rows`, with one row per record, stable uuid ids, and JSONB cells keyed by column id. Keep the column schema small, on the document. The server keeps `onto_documents.content` up to date as a derived markdown projection of the grid.
- Making the table a document means the tree, edges, task links, search, embeddings, archive/restore/delete, project fold, organize moves, versions, chat focus, MCP doc ops, comments, activity logs and public pages all work with no new entity kind.
- The child row table gives stable row ids (so a task can link to a row), per-row agent edits with per-row concurrency, typed views, and no 200 KB body ceiling.
- A brand-new `onto_tables` entity kind is the cleanest model on paper, but it has to be taught to ~99 TS files plus ~41 SQL functions. The doc tree cannot hold it, because tree ids must be `onto_documents` ids.
- CSV-as-asset is the wrong storage for a living tracker. Keep it as an import/attach path only.

---

## 1. Ontology model today

### 1.1 Tables (generated types: `packages/shared-types/src/database.types.ts`)

**onto_documents** (`database.types.ts:13983`)

- Columns: `id, project_id (NOT NULL), type_key (free text), title, description, content (text), content_hash, outline (jsonb cache), children (jsonb mirror of tree children), props (jsonb), state_key (enum document_state: draft|in_review|ready|published|archived), search_vector (GENERATED), archived_at, deleted_at, created_by (onto_actors.id), created_at, updated_at`.
- The body is canonical in `content`. Writes still mirror it to `props.body_markdown` for backwards compatibility (`20260617010000_onto_documents_search_vector_content.sql`).
- `search_vector` is GENERATED: title (A) + content (B) + `jsonb_to_tsvector(props, string)` (C) (`20260617010000`).
    - **Landmine:** every string in `props` is indexed. Big data in props also ships in every graph load: `project-graph-loader.ts` `DOCUMENT_COLUMNS` includes `props`.
    - **Landmine (`20260701000000_fix_recency_guard_generated_column.sql`):** any new GENERATED column on onto_documents must be subtracted in `update_onto_documents_updated_at()`, or the recency guard silently breaks.
- Archive takes three forms: `archived_at` set, `deleted_at` set, or `state_key = 'archived'` with `archived_at` NULL (the tree archives by state). See `supabase/tests/archived_scope_guard.check.sql` header.
- `type_key` conventions seen in code and data:
    - `document.default`, `document.context.project` (Start Here), `document.context.thinking_log`, `document.knowledge.research`, `document.task.scratch`, `document.spec.*`, `document.knowledge.marketing`, `document.intake.client`.
    - Format is `domain.kind[.sub]`. There is no DB CHECK on `onto_documents.type_key`; `chk_type_key_format` exists only on `onto_templates`.

**onto_tasks**

- Columns: `id, project_id, type_key, title, description, state_key (task_state), priority, start_at, due_at, completed_at, facet_scale, idempotency_key, props, search_vector, archived_at, deleted_at, ...`

**onto_assets** (`20260426000000_add_ontology_assets_with_ocr.sql`)

- Columns: `kind TEXT default 'image'` (no CHECK), `storage_bucket 'onto-assets'`, `storage_path`, `storage_project_id` (immutable physical location), `content_type`, `file_size_bytes`, `width/height`, `alt_text`, `caption`, the `ocr_*` columns, `extracted_text`, `extraction_summary`, `search_vector` (trigger), `deleted_at`. There is no archived_at.
- The upload API is image-only: `apps/web/src/routes/api/onto/assets/+server.ts:129` requires an `image/*` content type and caps uploads at 25 MB.

**onto_asset_links**

- Columns: `asset_id, entity_kind CHECK IN (project, task, document, plan, goal, risk, milestone), entity_id, role CHECK IN (attachment, inline, gallery, cover), props`, plus a trigger that enforces project match.

**onto_edges** (`20250601000001_ontology_system.sql:398` plus a later denormalized `project_id`)

- Columns: `id, project_id, src_kind, src_id, rel, dst_kind, dst_id, props jsonb, created_at`.
- There are **no DB constraints on kinds or rel**. Validation lives in TS:
    - `packages/shared-agent-ops/src/ontology/edge-direction.ts:23-125`: `EntityKind` union, `RELATIONSHIP_DIRECTIONS`, `VALID_RELS`, canonical direction rules.
    - `apps/web/src/routes/api/onto/edges/+server.ts:56` `VALID_KINDS`.
    - `apps/web/src/routes/api/onto/edges/linked/+server.ts:81` `VALID_KINDS`.
    - Gateway: `op-execution-gateway.edges.ts` `prepareEdgeMutation` refuses cross-project edges and normalizes direction. The special rel `task_has_document` bypasses the rel resolver (`op-execution-gateway.edges.ts:24, 87-96`).
- Prod data holds 34 distinct rels, including legacy free-text ones like `has`, `documents`, `enabled`, `led_to` and `precedes`.

**onto_document_versions**

- Columns: `id, document_id, number, props (DocumentVersionProps), storage_uri ('inline://document-snapshot'), embedding, created_by`.
- Each version stores a full snapshot (title, content, description, props, state_key, type_key, project_id). Edits merge into 60-minute windows (`packages/shared-agent-ops/src/ontology/versioning.service.ts:9-37`).

**onto_project_logs**

- Columns: `entity_type CHECK check_entity_type_values IN (project, task, output, note, document, goal, milestone, risk, plan, event, requirement, decision, source, edge, member, invite)` (`20260508000000_project_activity_agent_events.sql:21-39`).
- `image` is not in the list: assets have no activity rows.

**onto_embeddings** (`20260828120000_semantic_discovery_embeddings.sql:32-51`)

- CHECK `entity_type IN (project, task, goal, plan, milestone, document, risk, requirement, event, image)`.
- Per-table AFTER triggers call `enqueue_onto_entity_embedding('document','title','description','content')` (line 200-204), which enqueues `embed_onto_entity` jobs → `apps/worker/src/workers/embeddings/embedEntityWorker.ts`.
- Chunking: `MAX_CHUNK_CHARS = 2400`, `MAX_CHUNKS_PER_ENTITY = 60` (`packages/shared-agent-ops/src/embeddings/entity-embedding.ts:85-87`), so roughly 144k chars are embedded per entity. Content-hash diffing means only changed chunks re-embed.

### 1.2 RLS pattern

- Every onto table uses `current_actor_has_project_access(project_id, 'read'|'write')` for SELECT/INSERT/UPDATE/DELETE, scoped `TO authenticated` (`20260827040932_scope_member_rls_policies_to_authenticated.sql`; asset policies at `20260426000000:141-185`).
- Storage policies key off path segment 2 = project id.

### 1.3 Document tree

- Lives in `onto_projects.doc_structure` jsonb: `{version, root: DocTreeNode[]}` where `DocTreeNode = {id (onto_documents.id), type?: folder|doc, title?, description?, public_*, order, children?}`. Types are in `packages/shared-agent-ops/src/ontology/onto-api.ts:296-392`.
- Each document's `children` column mirrors its tree children.
- Atomic writer is `onto_project_doc_structure_update_atomic` (`20260803010000_atomic_document_structure_mutation.sql`): version-checked, `FOR UPDATE` on the project row, children updates keyed by `document_id`. History lives in `onto_project_structure_history`.
- Service: `packages/shared-agent-ops/src/ontology/doc-structure.service.ts` (1407 lines).
- **Hard rule** (`apps/web/src/routes/api/onto/projects/[id]/doc-tree/images/+server.ts:1-9`): "Placement lives in onto_asset_links, never in doc_structure — doc_structure ids must stay onto_documents ids (atomic tree SQL, archive, and every tree reader assume it)."
- How images appear in the tree:
    - `GET /api/onto/projects/[id]/doc-tree/images` returns image rows plus image→document links.
    - Client `apps/web/src/lib/components/ontology/doc-tree/tree-images.ts` `groupTreeImages()` files each image under every visible linked document. Images with no visible link go to an "Images shelf".
    - Chat images reach the tree the same way, through asset links with `entity_kind = 'document'`.

### 1.4 Revisions and concurrency

- Editor saves:
    - `apps/web/src/lib/server/document-editor-revision.ts`: a sha256 over title/description/content/state is the concurrency token.
    - `canRebaseDocumentEditorSave` lets a plain editor save rebase; metadata, tree and archive writes stay strict.
    - Concurrency covers the whole document.
- Agent edits:
    - The `update_onto_document` tool takes `edits[{old_text,new_text}]` (one edit per changed line) or `section_edits` by heading (`packages/agentic-chat-runtime/src/catalog/definitions/ontology-write.ts:1338-1440`).
    - It refuses a replace that removes more than 30% of a long document unless `allow_large_deletion` is set.
    - These resolve through the `DocumentPatchV1` kernel (`@buildos/shared-agent-ops/ontology/document-patch`).
- Undo: `apps/web/src/lib/server/document-change-revert.service.ts` applies inverse patches with strict re-anchoring, then one guarded head + version write (`writeDocumentHeadAndVersion`).
- Proposals: `apps/web/src/lib/server/document-proposal.service.ts` and `onto_document_proposals`, with the patch pinned to `project_id`.
- Gateway cap: `MAX_DOCUMENT_CONTENT_BYTES = 200 * 1024` for agent/external document writes (`op-execution-gateway.core.ts:230, 399-407`).

### 1.5 Activity logging

- `logCreateAsync` / `logUpdateAsync` (`packages/shared-agent-ops/src/ops/async-activity-logger`) write `onto_project_logs` rows, constrained by the CHECK above.

---

## 2. Linking today

1. **Document ↔ document.** Almost always through tree parent/child, not edges. Prod has 2 doc→doc edges in total. The `has_part` rel is allowed for doc→doc, and `references` / `relates_to` work from documents.
2. **Task ↔ document.** Edge `src_kind='task', rel='task_has_document', dst_kind='document'`, with `props.role='scratch'` for the scratch pad.
    - Read path: `packages/agentic-chat-runtime/src/tools/ontology-task-documents.ts:9, 59-80` (`list_task_documents`).
    - Write path: `create_task_document` (`ontology-write.ts:549`) and op `onto.task.docs.create_or_attach`.
    - Prod: 7 such edges; 31 doc↔task edges of any rel.
3. **Generic links.** `link_onto_entities` / `unlink_onto_edge` → ops `onto.edge.link` / `onto.edge.unlink` → `prepareEdgeMutation`. The UI side is the `LinkedEntities` panel:
    - `apps/web/src/lib/components/ontology/linked-entities/linked-entities.types.ts` defines `EntityKind` and `ALLOWED_LINKS`.
    - The API at `/api/onto/edges/linked` and `/available` hard-codes a per-kind table fetch (`linked/+server.ts:281-325, 430-493`).
4. **Inline mentions.** Syntax is `[[type:uuid|display]]` (`packages/shared-agent-ops/src/utils/entity-reference-parser.ts:42`). Valid types: project, task, document, note, goal, milestone, risk, plan, requirement, source, edge, user.
    - Used in `next_step_long`, chat summaries/checkpoints (`resolveEntityReferences`) and comments (user mentions → notifications via `entity-mention-notification.service.ts`).
    - **Document bodies do NOT render `[[...]]` as links.** `DocumentModal` uses `renderMarkdown` with no entity-ref pass, and mentions never create edges.
    - Prod: 4 of 530 docs contain `[[type:` mentions; 0 contain `/projects/<id>/documents/` URLs.
5. **Project graph.**
    - `get_onto_project_graph` is a TS loader, not an RPC: `packages/shared-agent-ops/src/ontology/project-graph-loader.ts:261-380`. It runs parallel per-table `.eq('project_id')` selects for plans, tasks, goals, milestones, documents, requirements, metrics, sources and risks, plus all edges.
    - There are no assets and no events beyond edges.
6. **Linked entities / relationships.**
    - `get_entity_relationships` / `get_linked_entities` (`packages/agentic-chat-runtime/src/tools/ontology-relationship-reads.ts:28-69`) use a hard-coded `RELATIONSHIP_ENTITY_CONFIG` kind→table map (project, task, plan, goal, document, milestone, risk, requirement). They query edges by `src_id`/`dst_id` (limit 50).
    - Ops: `onto.entity.relationships.get`, `onto.entity.links.get`.

**What a table needs to participate fully:** be a valid edge kind; be resolvable in every kind→table map (relationship reads, linked-entities API, gateway `LINK_ENTITY_SELECTS`/`loadEntityForAccess`, edge VALID_KINDS ×3); appear in `ALLOWED_LINKS`; be placeable in the tree; get a mention type; and support a row anchor (edge `props.row_id`). Prod has 0 edges with anchor props today.

---

## 3. Search + chat context + MCP registration

### Search RPCs (latest bodies in `supabase/migrations/20260929150000_chat_reads_exclude_archived.sql`; mirrors in `packages/shared-types/src/functions/*.sql`)

- `onto_search_entities` (line 1264):
    - A UNION ALL with one branch per type.
    - The document branch (1520-1555) filters `deleted_at IS NULL AND archived_at IS NULL AND state_key <> 'archived'` and matches on `search_vector` or trigram title/description.
    - The image branch (1599-1636) **does not filter `a.kind`**: any onto_assets row, a CSV included, returns as type `image`.
- `onto_search_semantic` (line 1672): joins `onto_embeddings` to each entity table with the same archive filters.
- Runtime: `packages/agentic-chat-runtime/src/tools/ontology-search.ts:31-42`.
    - `ONTOLOGY_SEARCH_ALLOWED_TYPES` = project, task, goal, plan, milestone, document, risk, event, requirement, image.
    - Lexical and semantic results are fused with RRF (`ontology-search-ranking.ts`).

### Chat context

- `load_fastchat_context` (same migration, line 443):
    - Lists up to 20 documents (id/title/state, linked-in-tree first) by recursing `doc_structure`.
    - For focus `document` it loads `to_jsonb(d)`, the full row. The runtime caps the focused body at 16k chars (`packages/agentic-chat-runtime/src/context/focused-document-context.ts:3`).
- Runtime context loader: `packages/agentic-chat-runtime/src/context/context-loader.ts` (3507 lines) and `context-models.ts` (`LightDocument`, focus unions).
- Web focus/context-shift unions: `apps/web/src/lib/types/agent-chat-enhancement.ts:449-458`.

### Standing rehearsal checks (`scripts/migration-rehearsal/rehearse.py:58-64`)

1. `supabase/tests/archived_scope_guard.check.sql`: seeds live and archived rows of every kind and asserts no archived id comes back from the packet, the digest or either search. A new kind added to those RPCs must also be seeded there.
2. `supabase/tests/project_fold_table_coverage.check.sql`: **any new column named `project_id`** (or an FK to onto_projects) must get a row in `private.project_fold_table_policy` in the same migration. A `move`/`repoint` action must also be implemented by the fold (`private.project_fold_implemented()`, `20260930220000_project_fold_foundation.sql:63-133, 197`).

### MCP / external agent ops

- `packages/shared-types/src/agent-call.types.ts:25-89` lists the op catalog in `BUILDOS_AGENT_READ_OPS` / `BUILDOS_AGENT_WRITE_OPS`.
- Wiring:
    - `packages/shared-agent-ops/src/gateway/op-execution-gateway.config.ts` holds schemas, `EXTERNAL_TABLES`, `LINK_ENTITY_SELECTS` and `ARCHIVABLE_ENTITY_KINDS` (lines 13-27, 280-309).
    - `op-execution-gateway.core.ts:234+` holds `EXTERNAL_OP_HANDLERS`.
    - `packages/agentic-chat-runtime/src/catalog/registry.ts:85` maps tool name → op.
- Stored grants whose `allowed_ops` is NULL default to every op for their mode. Grants with an explicit list will NOT pick up new `onto.table.*` ops.

### Chat write tool path

- The path is: catalog definition (`agentic-chat-runtime/src/catalog/definitions/*.ts`) → taxonomy/surfaces/classification/validation/payload-compaction/write-ledger/turn-contract → worker `mutations/tool-catalog.ts` reviewed spec + `table-adapter.ts` + receipt builders → gateway op.
- A single tool, `update_onto_document`, is referenced in ~22 files.

---

## 4. Real-data evidence (prod, aggregate only, 2026-10-04)

| Metric                                                     | Value                                                                                        |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| Live documents                                             | 530                                                                                          |
| Docs containing a GFM markdown table (`\|---\|` separator) | **62 (11.7%)** across 16 projects, 3 actors                                                  |
| Total table blocks                                         | 142 (median 1 per doc, max 18)                                                               |
| Table lines per tabled doc                                 | p50 13, p90 35, max 124                                                                      |
| Tabled docs by type                                        | research 15, default 12, spec.technical 9, project/Start Here 6, marketing 4, spec.process 3 |
| Doc length                                                 | p50 1.1k chars, p95 13.4k, max 77k; tabled docs p50 7.6k                                     |
| Assets                                                     | 6 (all images); 3 asset links                                                                |
| Edges                                                      | 2,001 (34 distinct rels); doc↔task 31; task_has_document 7; doc↔doc 2                      |
| Docs with `[[type:` mentions                               | 4                                                                                            |
| Doc versions                                               | 509 (4.8 MB); onto_documents 15 MB; edges 2.1 MB; embeddings 76 MB                           |
| Live tasks                                                 | 1,161                                                                                        |

How to read it:

- Tables already come out of research and spec work, mostly written by the agent.
- They are small (dozens of rows, not thousands).
- Linking from documents is rare, and inline mentions are nearly unused.

---

## 5. Options evaluated

### (a) Pure document variant: CSV or markdown table in `content`

- **Fit:** everything works on day 0, including tree, edges, task docs, search, embeddings, versions, archive, fold, organize, MCP, public pages and export. Rendering a GFM table as a grid is a frontend-only change, and the 62 existing docs (142 tables) benefit at once.
- **Row link:** no stable row ids. Ids would have to live in the text (a hidden id column), which users and LLMs break.
- **Agent row edits:** markdown rows are single lines, so the existing `edits[{old_text,new_text}]` handles one-row changes decently. Bulk or structured changes (add a column, sort, fill effort) are brittle text surgery. LLM tables break when a cell contains a pipe.
- **Concurrency:** whole-document revision hash, so two writers on different rows conflict or rebase.
- **Views:** every sort/filter/group/sum must re-parse markdown; there is no typed column.
- **Size:** 200 KB gateway cap; the tsvector 1 MB limit; the focused-doc 16k preview.
- **Migration cost:** none.

### (b) New `onto_tables` (schema JSONB) + `onto_table_rows` (JSONB cells, stable ids)

- **Fit:** the cleanest model, but it is a new entity kind. It must be added to:
    - edge kinds (edge-direction, 2 web VALID_KINDS, gateway entity access);
    - relationship/linked-entities maps and `ALLOWED_LINKS`;
    - the project graph loader;
    - both search RPCs plus the archived guard seeds;
    - the embeddings CHECK, trigger and composer;
    - the project_logs CHECK, purge, fold (policy + implementation + unfold) and organize moves;
    - the chat context packet and focus unions;
    - gateway ops, MCP, catalog, taxonomy, the worker mutation catalog, receipts, comments, public pages and export.
- That is about 99 TS files plus 41 SQL functions. The doc tree cannot hold it, because tree ids must be document ids, so it needs an images-style shelf and links. Images, the most recent kind, reached only 16 of those 99 files: partial participation is the realistic outcome.
- **Row link:** good. Rows could be their own edge kind, or anchors.
- **Agent edits, concurrency, views:** best.
- **Migration cost:** highest; a weeks-long tail of "tables don't show up in X".

### (c) CSV file in Supabase storage (onto_assets) + parsed preview

- **Fit:**
    - The asset path is image-only (upload API, the tree endpoint filters `kind='image'`, OCR, and the search branch labels every asset `image`).
    - Links only through `onto_asset_links`, whose roles are attachment/inline/gallery/cover.
    - No archived_at, so assets are outside the archive model.
- **Row link:** none (file offsets).
- **Agent edits:** every edit rewrites the whole file through storage.
- **Versions:** one new object per edit.
- **Search:** only through extracted text.
- **Concurrency:** last write wins.
- **Verdict:** right only for "attach the source CSV/XLSX I uploaded", as an import into (d).

### (d) RECOMMENDED: document-backed table (hybrid of a and b)

**Schema**

- `onto_documents` row with `type_key = 'document.table'` (allow `document.table.<flavor>`, e.g. `document.table.tracker`).
- Small column schema at `props.table = {version, columns:[{id, name, type: text|number|date|select|checkbox|url|entity_ref, options?}], views?:[...]}`. Keep it small, since props is indexed and shipped in graph loads.
- New child table `onto_document_rows`:
    - `id uuid PK` (stable row id)
    - `document_id uuid FK → onto_documents ON DELETE CASCADE`
    - `position numeric` (fractional ordering)
    - `cells jsonb` (keyed by column id)
    - `version int` (per-row optimistic concurrency)
    - `created_by, created_at, updated_at, deleted_at`
    - Indexes on `(document_id, position)`, plus GIN on cells if filtering moves server-side.
- **No `project_id` column.**
    - RLS goes through the parent: `EXISTS (SELECT 1 FROM onto_documents d WHERE d.id = document_id AND current_actor_has_project_access(d.project_id,'read'))`. That is a PK lookup, cheap at tens to thousands of rows.
    - This keeps the fold coverage check green with no fold, organize or unfold changes: documents move with ids intact and rows follow by FK.
    - Project hard delete cascades through the documents delete.
    - The trade-off is breaking the "denormalized project_id everywhere" convention. Worth it.

**content becomes a derived projection**

- The server rewrites `content` as a GFM table (all rows up to a cap, then "… N more rows") inside the same RPC or transaction as the row write.
- For free, this keeps search_vector, embeddings, chat reads (`get_onto_document_details`, `read_document_section`), export, public pages and version snapshots working.
- The editor shows the grid, not the text. The existing `update_onto_document` text editing must be refused for `document.table`, in favour of row tools.
- **Embedding churn:** a row edit changes content, the AFTER UPDATE trigger enqueues an embed job, and content-hash diffing re-embeds only changed chunks. That is fine, but consider coalescing (the job dedup key already includes entity id).

**Linking**

- Table ↔ task: reuse `task_has_document` (`create_task_document` attaches an existing doc) or `link_onto_entities`. No change needed.
- Row ↔ task: same edge with `props.row_id` (and optionally `props.row_label`). Readers that do not know about rows still show "linked to <table>". Add a `[[table_row:...]]`-free deep link `/projects/:pid/documents/:docId?row=:rowId`.
- Doc → table: add an inline embed syntax handled by `renderMarkdown`, e.g. `[[document:uuid|Name]]`, which documents do not render today. Turning mentions into links in doc bodies is a small, generally valuable change. A future `::: table uuid view=x` block can embed a live view.
- Versions: for `document.table`, put the rows (array) in the version snapshot (`DocumentSnapshot.props` or a new snapshot field) so restore can rewrite rows. Cap the snapshot size.

**New tool/op surface (the only "learn about it" work)**

- Ops: `onto.table.rows.get` (filter/sort/limit), `onto.table.rows.upsert` (batch, with expected row versions), `onto.table.rows.delete`, `onto.table.columns.update`, and `onto.table.create` (or `onto.document.create` with a `table` arg).
- Chat tools: `get_table_rows`, `upsert_table_rows`, `update_table_columns`, plus the worker mutation catalog rows and receipts.
- MCP picks these up through the op catalog.

**Activity:** log as `entity_type = 'document'` with `after_data.row_ids` (no CHECK change).

**Migration cost:** 1 table + RLS + 1 RPC for atomic row write and projection + `GRANT authenticated`. `db:rehearse --role-probe`.

### Scorecard

|                          | (a) doc text      | (b) new kind           | (c) CSV asset                  | (d) doc + rows                                  |
| ------------------------ | ----------------- | ---------------------- | ------------------------------ | ----------------------------------------------- |
| Tree placement           | free              | needs shelf/links      | via asset link                 | free                                            |
| Edges / task link        | free              | ~10 maps               | asset_links only               | free                                            |
| Row → task link          | no                | yes                    | no                             | yes (edge props.row_id)                         |
| Search / embeddings      | free              | 2 RPCs + CHECK + guard | image-labelled, extracted text | free (projection)                               |
| Chat context / MCP       | free              | many unions            | weak                           | free reads + new row tools                      |
| Revisions                | free (text)       | build new              | file copies                    | snapshot + rows                                 |
| Agent row edits          | text patch        | best                   | rewrite file                   | best                                            |
| Concurrency              | whole doc         | per row                | last write wins                | per row                                         |
| Size                     | 200 KB / 1 MB tsv | large                  | 25 MB file                     | large (projection capped)                       |
| Fold / organize / delete | free              | policy + impl          | free                           | free (no project_id)                            |
| Code paths to teach      | 0 (+ grid UI)     | ~99 TS + ~41 SQL       | ~10 + fixes                    | ~15-20 (new tools + editor branch + projection) |

---

## 6. Plug-in checklist for (d)

DB

- [ ] `supabase/migrations/<ts>_document_table_rows.sql`: `onto_document_rows` + RLS through the parent document (read/write) + updated_at trigger + an RPC `onto_document_table_write_atomic(p_document_id, p_expected_doc_updated_at, p_row_ops jsonb, p_columns jsonb)` that locks the doc row, applies the row ops with per-row version checks, rewrites `content`/`props.table`, and returns the new versions. `GRANT EXECUTE ... TO authenticated` (functions are private by default); check `auth.uid()` if it is SECURITY DEFINER.
- [ ] No `project_id` column, so no fold policy row is needed. If one is added, a policy row plus fold/unfold implementation is mandatory.
- [ ] `pnpm db:rehearse <file> --role-probe`. DEFAULT_CHECKS will run.
- [ ] `pnpm gen:all` (types).

shared-agent-ops

- [ ] `packages/shared-agent-ops/src/ontology/`: table schema types, projection renderer (rows → GFM), row-op validator.
- [ ] `versioning.service.ts`: include rows in snapshots for `document.table`; restore path.
- [ ] Gateway: new ops in `agent-call.types.ts` + `op-execution-gateway.config.ts` schemas + `op-execution-gateway.core.ts` handlers. Make `onto.document.update` refuse body edits on `document.table`.

agentic-chat-runtime and worker

- [ ] `catalog/definitions/` (new table tools), `catalog/registry.ts`, `taxonomy.ts`, `surfaces.ts`, `loop/tool-classification.ts`, `tool-validation.ts`, `tool-payload-compaction.ts`, `write-ledger.ts`, `turn-contract.ts`, `worker-tool-policy.ts`, `shared-types/agentic-chat-worker-contract.ts`.
- [ ] Worker `mutations/tool-catalog.ts` rows, `table-adapter.ts`, `receipt-builders.ts`, `provider/validation.ts`, `write-routing.ts`.
- [ ] Context: when a `document.table` is focused, send schema + row count + the first N rows instead of a 16k text preview (`focused-document-context.ts`).

web

- [ ] Grid view/editor branch in `DocumentModal.svelte` / the document route, keyed on `type_key`. A doc-tree icon for `document.table` (`DocTreeNode.svelte`).
- [ ] "Render existing markdown tables as grids" (read-only) for the 62 docs, as an optional quick win.
- [ ] `renderMarkdown`: resolve `[[document:uuid|label]]` to links in document bodies.
- [ ] LinkedEntities: show `props.row_id` anchors on task↔table edges.

---

## 7. Landmines

1. **The tree holds documents only.** `doc_structure` ids must be `onto_documents` ids (`doc-tree/images/+server.ts:4-7`). Anything that is not a document needs a side shelf like images.
2. **Fold coverage check.** A new `project_id` column fails the rehearsal without a policy row, and `move` needs a real fold implementation plus unfold (`project_fold_table_coverage.check.sql`).
3. **Archived scope guard.** A new kind added to `load_fastchat_context` / the search RPCs must filter archived rows and be seeded in `archived_scope_guard.check.sql`.
4. **Generated columns on onto_documents** must be subtracted in the `update_onto_documents_updated_at` guard (`20260701000000`).
5. **props is indexed and shipped widely.** Rows in `props` would bloat `search_vector` and every graph/project load (`project-graph-loader.ts` `DOCUMENT_COLUMNS`). Keep only the column schema there.
6. **Size limits.** The 200 KB gateway cap on doc content (`op-execution-gateway.core.ts:230`); the tsvector 1 MB hard limit (an insert errors when exceeded); embeddings cover about 144k chars. The projection must be capped.
7. **The asset search branch ignores kind.** Any non-image asset surfaces as `image` (`20260929150000:1599-1636`). The tree endpoint filters `kind='image'`; the upload API rejects non-images.
8. **CHECK constraints** that a new kind would hit: `onto_embeddings.chk_onto_embeddings_entity_type`, `onto_project_logs.check_entity_type_values`, `onto_asset_links.entity_kind`.
9. **Explicit `allowed_ops` lists** on existing connector grants will not include new table ops (NULL lists default to all ops).
10. **Editor/agent text edits on a derived body.** If `content` becomes a projection, both the editor and `update_onto_document` must be blocked for `document.table`, or a text edit gets silently overwritten by the next row write.
11. **Embedding churn.** Each row write updates `content`, which enqueues an embed job. Content-hash diffing limits the cost, but bulk agent upserts should go through one RPC call, not N updates.
12. **Never regex-classify** (AGENTS.md). Detecting "is this research output a table?" must come through a tool argument (e.g., `create_onto_document({type_key:'document.table', table:{columns, rows}})`), not by sniffing pipes in model prose. Parsing a CSV or GFM structure is a structured format and is fine.
