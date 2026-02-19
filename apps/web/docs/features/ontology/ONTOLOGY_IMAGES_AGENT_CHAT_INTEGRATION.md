<!-- apps/web/docs/features/ontology/ONTOLOGY_IMAGES_AGENT_CHAT_INTEGRATION.md -->

# Ontology Images in Agentic Chat

Status: Implemented (MVP)  
Last updated: 2026-02-19

## 1. What is implemented

Images are now first-class ontology assets and are integrated into agent context through OCR-derived text.

Implemented pieces:

- Storage + metadata: `onto_assets` and `onto_asset_links`
- OCR lifecycle: pending/processing/complete/failed/skipped
- Manual extracted text editing and OCR reprocess
- Project/task/document image attachment
- Inline document image embeds with stable render URLs:
    - `![alt](/api/onto/assets/<asset_id>/render)`
- Inline link sync on document save (role = `inline`)
- Ontology search includes images (`type = image`)
- Agent context highlights include image snippets (bounded + token-safe)

## 2. End-to-end flow

### 2.1 Ingestion + OCR

1. Client creates asset via `POST /api/onto/assets` and uploads to signed storage URL.
2. Client finalizes upload via `POST /api/onto/assets/[id]/complete`.
3. Asset OCR job (`extract_onto_asset_ocr`) is queued.
4. Worker runs OCR, writes:
    - `extracted_text`
    - `extraction_summary`
    - `extraction_metadata.last_ocr`
5. Asset status becomes `complete` (or `failed`/`skipped`).

### 2.2 Linking model

- Attachments are stored in `onto_asset_links` with `(entity_kind, entity_id, role)`.
- Roles currently used:
    - `attachment` for task/document/project panel associations
    - `inline` for markdown-embedded document images

### 2.3 Agent context loading

When chat loads project context, `OntologyContextLoader` now also loads recent project images (bounded count) and builds `project_highlights.images` with:

- `id`
- `title` (caption/alt/filename fallback)
- `ocr_status`
- `extracted_text_source`
- `extraction_summary` (truncated)
- `extracted_text_preview` (truncated)
- `created_at`, `updated_at`

This is rendered into prompt context under `### Project Context Highlights` -> `#### Images`.

## 3. How the AI agent uses images

## 3.1 Primary usage mode (today)

The agent reads OCR-derived text snippets in project context and uses them as normal textual evidence:

- Understand what an image contains (summary + extracted text)
- Reference image IDs in reasoning/results
- Prioritize relevant tasks/docs/goals based on image text
- Answer cross-entity questions where image text is relevant

The default context feed is intentionally bounded and truncated to keep token use stable.

## 3.2 Tool-based usage

- `search_ontology` can now return image hits (`type: "image"`), so image OCR text participates in cross-entity discovery.
- The agent can use ontology read flows and search to pivot from image hits to related project work.

## 3.3 Inline document behavior

- Editor insert action writes stable markdown image refs using `/api/onto/assets/<id>/render`.
- On document save, inline refs are diffed against current `inline` links:
    - Missing links are added
    - Removed refs are unlinked

This keeps document markdown and ontology links in sync for agent-aware retrieval.

## 4. OCR overwrite/transition behavior

Shared OCR transition helper logic now governs route + worker behavior:

- Manual OCR edits set source to `manual`, increment version, preserve prior auto OCR metadata in `last_auto_ocr`.
- Worker respects manual text unless `force_overwrite = true`.
- Status transitions (`pending`, `processing`, `complete`, `failed`, `skipped`) are generated from one shared helper surface.

## 5. Current limitations

- Agent context currently uses OCR text summaries/previews, not raw image pixels.
- No dedicated `get_onto_asset_details` agent tool yet (search + project context provide coverage for MVP).
- Image highlight list is bounded and not exhaustive by design.

## 6. Practical interaction examples

User asks:

- "What does the site photo show and does it affect today's task plan?"

Agent behavior:

1. Reads image snippets in project highlights.
2. Uses OCR text + summaries to infer relevant dependencies/risks/tasks.
3. Optionally searches ontology for deeper matches.
4. Responds with references to related tasks/docs and recommended actions.

User asks:

- "I updated the screenshot text; use the latest wording."

System behavior:

1. User edits extracted text (`PATCH /api/onto/assets/[id]/ocr`).
2. Source switches to `manual`.
3. Worker reprocess will not overwrite manual text unless explicitly forced.
