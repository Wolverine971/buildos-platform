<!-- docs/specs/ONTOLOGY_IMAGES_ENGINEERING_CHECKLIST.md -->

# Ontology Images + OCR Engineering Checklist

Source spec: `apps/web/docs/features/ontology/ONTOLOGY_IMAGES_SPEC.md`
Last updated: 2026-02-19
Status: In progress

## Phase 0: Project Tracking

- [ ] Create implementation branch and baseline status snapshot
- [ ] Confirm migration naming and deployment order
- [ ] Confirm feature flag behavior (if needed for staged rollout)
- [ ] Define verification matrix for backend, worker, and UI

## Phase 1: Data Foundation (DB + Types)

### 1.1 Schema + Policies

- [x] Add migration: `onto_assets` table
- [x] Add migration: `onto_asset_links` table
- [x] Add indexes and `updated_at` trigger
- [x] Add search vector trigger/function for assets
- [x] Add RLS policies for `onto_assets`
- [x] Add RLS policies for `onto_asset_links`
- [x] Add private storage bucket `onto-assets`
- [x] Add storage object policies scoped to project access

### 1.2 Queue + Functions

- [x] Add queue enum value `extract_onto_asset_ocr`
- [x] Update `get_project_skeleton` function to include `image_count`
- [x] Update `get_project_full` function to include `images` list

### 1.3 Shared Types

- [x] Update `packages/shared-types/src/queue-types.ts` for OCR job metadata/result
- [x] Update shared DB schema/type artifacts as needed by app code

## Phase 2: Backend APIs

### 2.1 Core Asset Routes

- [x] `POST /api/onto/assets` (create asset record + signed upload URL)
- [x] `GET /api/onto/assets` (project list + optional entity filters)
- [x] `GET /api/onto/assets/[id]` (asset detail)
- [x] `PATCH /api/onto/assets/[id]` (metadata updates)
- [x] `DELETE /api/onto/assets/[id]` (soft delete + storage cleanup)
- [x] `POST /api/onto/assets/[id]/complete` (verify + queue OCR)
- [x] `GET /api/onto/assets/[id]/render` (signed URL redirect)

### 2.2 Linking Routes

- [x] `POST /api/onto/assets/[id]/links` (link to project/task/document)
- [x] `DELETE /api/onto/assets/[id]/links` (unlink)

### 2.3 OCR Routes

- [x] `PATCH /api/onto/assets/[id]/ocr` (manual extracted text update)
- [x] `POST /api/onto/assets/[id]/ocr/reprocess` (queue OCR retry/reprocess)

### 2.4 Reusable Server Helpers

- [x] Add `asset access` helper(s) for project/entity authorization checks
- [x] Add queue helper `apps/web/src/lib/server/asset-ocr-queue.service.ts`
- [x] Add shared OCR update helper for status transitions and overwrite rules

## Phase 3: Worker OCR Processing

- [x] Add worker module `apps/worker/src/workers/assets/assetOcrWorker.ts`
- [x] Register queue processor in `apps/worker/src/worker.ts`
- [x] Implement OCR extraction request and response parsing
- [x] Persist OCR fields/status/error in `onto_assets`
- [x] Implement idempotency/retry semantics

## Phase 4: Project Data Integration

- [x] Update `GET /api/onto/projects/[id]` to return `images`
- [x] Update `GET /api/onto/projects/[id]/full` to return `images`
- [x] Update `apps/web/src/routes/projects/[id]/+page.server.ts` skeleton counts with `image_count`
- [x] Update project refresh/hydration flows to populate `images` state

## Phase 5: UI Integration

### 5.1 Reusable UI Components

- [x] Create `ImageUploadModal` (new upload flow)
- [x] Create `ProjectImageLibrary` or equivalent picker list
- [x] Create `EntityImagesPanel` (list/link/unlink/edit text/delete)
- [x] Create `AssetDetailModal` with OCR text editor

### 5.2 Project Page

- [x] Add `images` insight panel key and config
- [x] Add images panel in right-rail section list
- [x] Add image count and preview items
- [x] Add upload action from panel

### 5.3 Document + Task Modals

- [x] Add Images section to `DocumentModal.svelte`
- [x] Add Images section to `TaskEditModal.svelte`
- [x] Support attach existing + upload new
- [x] Support edit extracted text + reprocess OCR + delete

### 5.4 Inline Document Embeds

- [x] Replace URL prompt image insertion with library/upload picker
- [x] Insert stable `![alt](/api/onto/assets/<id>/render)` references
- [x] Sync inline links on document save

## Phase 6: Search + Context

- [x] Add image fields to ontology search function(s)
- [x] Add image snippets to agent project context load (bounded count)
- [x] Ensure token-safe truncation of extracted text in context responses

## Phase 7: Testing and Verification

### 7.1 DB + API

- [ ] Migration smoke check
- [x] API route tests for create/list/get/update/delete/link/unlink
- [x] Access-control tests (authorized vs unauthorized)

### 7.2 Worker

- [x] Queue enqueue/claim flow test
- [x] Success path OCR test
- [x] Failure path OCR test (status set to failed + error captured)

### 7.3 UI

- [x] Project page images panel render + actions
- [x] Task modal image attachment flow
- [x] Document modal image attachment flow
- [x] Manual OCR text edit persistence

### 7.4 Current Verification Log

- [x] `pnpm --filter @buildos/shared-types typecheck` passed
- [x] `pnpm --filter @buildos/worker typecheck` passed
- [x] `pnpm --filter @buildos/web exec eslint ...` on changed image-related files (no errors)
- [x] Filtered `pnpm --filter @buildos/web check` scan across touched image/search files (no local diagnostics)
- [x] `pnpm --filter @buildos/web exec vitest run src/routes/api/onto/assets/server.test.ts src/routes/api/onto/assets/[id]/server.test.ts src/routes/api/onto/assets/[id]/links/server.test.ts src/lib/server/asset-ocr-queue.service.test.ts src/lib/components/ontology/ImageAssetsPanel.test.ts`
- [x] `pnpm --filter @buildos/worker test:run tests/assetOcrWorker.test.ts`
- [ ] `pnpm --filter @buildos/web check` full pass (blocked by existing repo-wide typecheck baseline unrelated to image feature)
- [ ] Migration smoke check command run in local environment (blocked: `supabase`/`psql` CLIs unavailable in this execution environment)

## Phase 8: Rollout

- [x] Add release notes
- [x] Monitor OCR failure rate and storage/render errors
- [x] Add follow-up tickets for non-MVP entity kinds and thumbnail pipeline
