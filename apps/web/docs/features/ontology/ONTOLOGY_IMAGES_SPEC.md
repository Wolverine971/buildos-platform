<!-- apps/web/docs/features/ontology/ONTOLOGY_IMAGES_SPEC.md -->

# Ontology Images + OCR Specification (v2)

Status: Draft (implementation-ready)
Owner: Platform / Ontology
Last updated: 2026-02-19

## 1. Summary

BuildOS needs first-class image support inside ontology projects, with:

- Upload image files to Supabase Storage
- Attach images to ontology entities (project, task, document first)
- OCR and semantic extraction on upload so images are searchable and understandable by the system
- CRUD support for images, including manual updates to extracted text
- A new Images slot in project insight panels
- Entity-local image sections for task and document views

This spec replaces the older high-level draft and adds concrete OCR lifecycle, API contracts, UI integration points, and rollout criteria.

## 2. Product Scope

### 2.1 In Scope (MVP)

- Private image storage in Supabase bucket
- Image metadata and linkage in ontology DB tables
- OCR extraction pipeline (async job)
- Manual extracted-text updates
- Attach/unattach images to task/document/project
- Project page Images insight panel
- Document modal Images section
- Task edit modal Images section
- Delete image (soft delete + storage object cleanup)

### 2.2 Out of Scope (MVP)

- Public share links for anonymous users
- Non-image media (video/audio) in this feature
- In-image annotation tools (draw boxes, comments on pixels)
- Full DAM workflows (folders, rights metadata, approvals)

## 3. Core User Stories

1. As a user, I can upload an image into a project and see it in the project Images panel.
2. As a user, I can attach an existing project image to a task.
3. As a user, I can attach or inline an image in a document.
4. As a user, I can open an image and view/edit extracted OCR text.
5. As a user, I can trigger OCR re-processing when extraction quality is poor.
6. As a user, I can delete an image and remove it from linked entities.
7. As the system, I can use extracted image text in search and context loading.

## 4. Architecture Overview

### 4.1 Storage

- Bucket: `onto-assets` (private)
- Path format:

```text
projects/<project_id>/assets/<asset_id>/original.<ext>
```

### 4.2 Database

- `onto_assets`: one row per uploaded image
- `onto_asset_links`: many-to-many links between assets and ontology entities

### 4.3 Processing

- Upload completion queues OCR job
- Worker processes OCR and metadata extraction
- Result persisted to `onto_assets` OCR columns

### 4.4 Access model

- Same project membership model used by ontology entities
- DB RLS on `onto_assets` and `onto_asset_links`
- Storage policies enforce project-scoped path access
- Rendering uses signed URLs via backend endpoint

## 5. Data Model

## 5.1 Table: `onto_assets`

Required columns:

- `id uuid pk default gen_random_uuid()`
- `project_id uuid not null references onto_projects(id) on delete cascade`
- `kind text not null default 'image'`
- `storage_bucket text not null default 'onto-assets'`
- `storage_path text not null`
- `original_filename text null`
- `content_type text not null`
- `file_size_bytes bigint not null`
- `checksum_sha256 text null`
- `width int null`
- `height int null`
- `alt_text text null`
- `caption text null`
- `metadata jsonb not null default '{}'::jsonb`

OCR and understanding columns:

- `ocr_status text not null default 'pending'`
    - allowed values: `pending | processing | complete | failed | skipped`
- `ocr_error text null`
- `ocr_model text null`
- `ocr_version int not null default 1`
- `ocr_started_at timestamptz null`
- `ocr_completed_at timestamptz null`
- `extracted_text text null`
- `extracted_text_source text not null default 'ocr'`
    - allowed values: `ocr | manual`
- `extracted_text_updated_at timestamptz null`
- `extracted_text_updated_by uuid null references onto_actors(id)`
- `extraction_summary text null` (one short semantic summary)
- `extraction_metadata jsonb not null default '{}'::jsonb` (language, confidence, tokens, provider payload)
- `search_vector tsvector null`

Lifecycle columns:

- `created_by uuid not null references onto_actors(id)`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`
- `deleted_at timestamptz null`

Indexes:

- `idx_onto_assets_project on (project_id)`
- `idx_onto_assets_deleted on (deleted_at)` partial for active rows
- `idx_onto_assets_ocr_status on (ocr_status)`
- `idx_onto_assets_search_vector on using gin(search_vector)`

## 5.2 Table: `onto_asset_links`

- `id uuid pk default gen_random_uuid()`
- `project_id uuid not null references onto_projects(id) on delete cascade`
- `asset_id uuid not null references onto_assets(id) on delete cascade`
- `entity_kind text not null`
    - MVP supported values: `project | task | document`
    - future: `plan | goal | risk | milestone`
- `entity_id uuid not null`
- `role text not null default 'attachment'`
    - allowed values: `attachment | inline | gallery | cover`
- `props jsonb not null default '{}'::jsonb`
- `created_by uuid not null references onto_actors(id)`
- `created_at timestamptz not null default now()`

Constraints and indexes:

- unique: `(asset_id, entity_kind, entity_id, role)`
- `idx_onto_asset_links_entity on (entity_kind, entity_id)`
- `idx_onto_asset_links_asset on (asset_id)`
- `idx_onto_asset_links_project on (project_id)`

## 5.3 Triggers and derived fields

- `set_updated_at()` trigger on `onto_assets`
- search vector trigger populating from:
    - `coalesce(alt_text, '')`
    - `coalesce(caption, '')`
    - `coalesce(extraction_summary, '')`
    - `coalesce(extracted_text, '')`

## 6. OCR Lifecycle

## 6.1 State machine

1. `pending`: asset row created, upload not yet finalized
2. `processing`: OCR job started
3. `complete`: OCR text/summary stored
4. `failed`: OCR failed, retry allowed
5. `skipped`: explicit skip for unsupported image or user choice

## 6.2 Processing behavior

On upload completion:

- Set `ocr_status = 'pending'`
- Queue job `extract_onto_asset_ocr`
- Worker claims job and sets `ocr_status = 'processing'`
- Worker extracts:
    - `extracted_text`
    - `extraction_summary`
    - optional metadata in `extraction_metadata`
- Worker sets `ocr_status = 'complete'` or `'failed'`

### 6.3 Manual extracted-text update behavior

When user edits extracted text:

- `extracted_text` updated
- `extracted_text_source = 'manual'`
- `extracted_text_updated_at/by` set
- `ocr_version = ocr_version + 1`
- Prior auto OCR payload remains in `extraction_metadata.last_auto_ocr`

### 6.4 Re-run OCR behavior

`POST /api/onto/assets/[id]/ocr/reprocess`:

- queues new OCR pass
- if current source is `manual`, reprocess does not overwrite manual text unless `force_overwrite=true`

## 7. API Contracts

All endpoints are under `/api/onto/assets` and use existing auth + `current_actor_has_project_access`.

## 7.1 Create asset record + signed upload URL

`POST /api/onto/assets`

Request:

```json
{
	"project_id": "uuid",
	"file_name": "receipt.png",
	"content_type": "image/png",
	"file_size_bytes": 123456,
	"width": 1280,
	"height": 720,
	"alt_text": "optional",
	"caption": "optional"
}
```

Response:

```json
{
	"asset": { "id": "...", "ocr_status": "pending" },
	"upload": {
		"signed_url": "...",
		"storage_path": "projects/.../assets/.../original.png",
		"expires_at": "..."
	}
}
```

## 7.2 Complete upload

`POST /api/onto/assets/[id]/complete`

- Verifies object exists
- Updates size/dimensions if needed
- Queues OCR job

## 7.3 List project images

`GET /api/onto/assets?project_id=<id>&limit=50&offset=0&ocr_status=complete`

## 7.4 Get asset detail

`GET /api/onto/assets/[id]`

Returns asset, links, OCR metadata.

## 7.5 Render asset

`GET /api/onto/assets/[id]/render`

- checks access
- returns 302 to short-lived signed URL

## 7.6 Link asset to entity

`POST /api/onto/assets/[id]/links`

```json
{
	"entity_kind": "task",
	"entity_id": "uuid",
	"role": "attachment"
}
```

## 7.7 Unlink asset

`DELETE /api/onto/assets/[id]/links?entity_kind=task&entity_id=<uuid>&role=attachment`

## 7.8 Update metadata

`PATCH /api/onto/assets/[id]`

Allowed fields: `alt_text`, `caption`, `metadata`.

## 7.9 Update extracted text (manual)

`PATCH /api/onto/assets/[id]/ocr`

```json
{
	"extracted_text": "corrected text",
	"extraction_summary": "optional corrected summary"
}
```

## 7.10 Reprocess OCR

`POST /api/onto/assets/[id]/ocr/reprocess`

```json
{
	"force_overwrite": false
}
```

## 7.11 Delete asset

`DELETE /api/onto/assets/[id]`

Behavior:

- soft delete DB row (`deleted_at`)
- delete storage object (best effort, logged)
- cascade delete links or mark links deleted by FK cascade

## 8. Queue + Worker Integration

## 8.1 Queue type

Add queue enum entry:

- `extract_onto_asset_ocr`

Add metadata interface in `packages/shared-types/src/queue-types.ts`:

```ts
interface AssetOcrJobMetadata {
	assetId: string;
	projectId: string;
	userId: string;
	forceOverwrite?: boolean;
}
```

## 8.2 Queue helper

Add server helper analogous to voice notes:

- `apps/web/src/lib/server/asset-ocr-queue.service.ts`

## 8.3 Worker processor

Add worker implementation:

- `apps/worker/src/workers/assets/assetOcrWorker.ts`

Register in:

- `apps/worker/src/worker.ts`

## 8.4 OCR provider

MVP recommendation:

- Use existing OpenAI provider stack with vision-capable model
- Return structured JSON output with `extracted_text` and `summary`

Provider is swappable; DB/API contracts stay provider-agnostic.

## 9. UI Integration

## 9.1 Project page (`apps/web/src/routes/projects/[id]/+page.svelte`)

- Add `images` to `InsightPanelKey`
- Add new panel card in `insightPanels` derived list
- Add panel filters/sorts in `insight-panel-config.ts`
- Add create action to open image upload modal
- Show image count and OCR badges in panel list

### Required data changes

- `+page.server.ts` skeleton counts include `image_count`
- `get_project_skeleton` includes `image_count`
- `get_project_full` and `/api/onto/projects/[id]` include `images`

## 9.2 Document modal (`apps/web/src/lib/components/ontology/DocumentModal.svelte`)

- Add collapsible `Images` section in left rail
- Show linked images list with thumbnail, caption, OCR status
- Add `Attach image` action from project library
- Add `Upload image` action
- Add `Edit extracted text` in image detail modal

## 9.3 Task modal (`apps/web/src/lib/components/ontology/TaskEditModal.svelte`)

- Add `Images` section near linked entities
- Same attach/upload/edit/delete actions as document modal

## 9.4 Document editor inline insertion

- Replace URL-only image insertion prompt with image picker flow
- Insert stable URL form:

```md
![alt text](/api/onto/assets/<asset_id>/render)
```

- On document save, parse markdown and sync `role='inline'` links

## 10. Search + Context Integration

## 10.1 Ontology search

Extend `onto_search_entities` to include image hits:

- source: `onto_assets`
- searchable fields: `caption`, `alt_text`, `extraction_summary`, `extracted_text`
- response shape includes `entity_type='image'`

## 10.2 Agent context loading

For project-focused chat context:

- include top N recent/linked images with:
    - `id`, `caption`, `summary`, OCR snippet
- avoid full extracted_text payload unless specifically requested to keep token cost controlled

## 11. Security and RLS

## 11.1 Table policies

For `onto_assets` and `onto_asset_links`:

- `SELECT`: read access to project members (`read`)
- `INSERT/UPDATE/DELETE`: write access (`write`)
- enforce `project_id` consistency between asset and link rows

## 11.2 Storage policies

Bucket `onto-assets` on `storage.objects`:

- path segment `[1] = 'projects'`
- path segment `[2] = <project_id>`
- user must satisfy `current_actor_has_project_access(project_id, 'read'|'write')` depending on operation

## 11.3 Render endpoint hardening

- never expose raw storage path without auth
- always gate through backend permission check
- signed URL TTL short (5-60 min)

## 12. Observability

Log with existing error logging stack:

- upload initiation failure
- upload completion mismatch
- OCR queue enqueue failure
- OCR worker failure
- render URL generation failure

Metrics to track:

- `assets_uploaded_total`
- `assets_ocr_complete_total`
- `assets_ocr_failed_total`
- `assets_manual_text_updates_total`
- `assets_delete_total`
- OCR latency percentiles

## 13. Rollout Plan

### Phase 1: Data + API foundation

- migrations for tables, indexes, RLS, bucket policies
- core `/api/onto/assets/*` endpoints
- queue + worker OCR processor

### Phase 2: UI integration

- project Images panel
- task/document Images sections
- upload/link/delete UX

### Phase 3: Search + context

- add images to ontology search
- include image snippets in agent context

### Phase 4: quality improvements

- retry UI
- better OCR previews
- optional thumbnail generation

## 14. Acceptance Criteria

1. User can upload an image and see it in project Images panel.
2. User can attach existing image to a task.
3. User can attach existing image to a document.
4. OCR job runs automatically after upload completion.
5. OCR status is visible (`pending/processing/complete/failed`).
6. Extracted text is viewable on image detail.
7. User can edit extracted text and save manual override.
8. User can trigger OCR reprocess.
9. Manual text is not overwritten unless forced.
10. Deleting image removes it from task/document/project listings.
11. Non-members cannot access asset render endpoint.
12. Project skeleton and full payload include image data/count.
13. Project insight rail includes Images panel slot.
14. Errors are logged to ontology error pipeline.

## 15. Test Plan (MVP)

- Unit
    - OCR status transitions and overwrite rules
    - link uniqueness and project consistency validation
- API integration
    - create/complete/render/link/unlink/ocr patch/reprocess/delete
    - access control matrix (owner/member/non-member)
- Worker integration
    - queue enqueue, job claim, successful OCR, failure retry
- UI e2e
    - upload from project page
    - attach from task modal
    - attach from document modal
    - edit extracted text and verify persistence

## 16. Open Decisions

1. OCR model/provider default and cost guardrails.
2. Maximum image size/dimensions for MVP.
3. Whether to generate thumbnails eagerly or rely on storage transforms.
4. Whether to support plan/goal/risk/milestone links in MVP or immediately after MVP.

## 17. Proposed File/Module Touch List

Backend and DB:

- `supabase/migrations/*_onto_assets.sql`
- `packages/shared-types/src/database.schema.ts`
- `packages/shared-types/src/database.types.ts`
- `packages/shared-types/src/queue-types.ts`
- `apps/web/src/routes/api/onto/assets/...`
- `apps/web/src/lib/server/asset-ocr-queue.service.ts`
- `apps/worker/src/workers/assets/assetOcrWorker.ts`
- `apps/worker/src/worker.ts`

Project payload and page:

- `packages/shared-types/src/functions/get_project_skeleton.sql`
- `packages/shared-types/src/functions/get_project_full.sql`
- `apps/web/src/routes/projects/[id]/+page.server.ts`
- `apps/web/src/routes/projects/[id]/+page.svelte`
- `apps/web/src/lib/components/ontology/insight-panels/insight-panel-config.ts`

Entity modals:

- `apps/web/src/lib/components/ontology/TaskEditModal.svelte`
- `apps/web/src/lib/components/ontology/DocumentModal.svelte`
- `apps/web/src/lib/components/ontology/DocumentEditor.svelte` (if still active path)
