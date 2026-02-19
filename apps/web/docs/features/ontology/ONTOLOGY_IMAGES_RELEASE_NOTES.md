<!-- apps/web/docs/features/ontology/ONTOLOGY_IMAGES_RELEASE_NOTES.md -->

# Ontology Images + OCR Release Notes

Release date: 2026-02-19  
Status: Ready for staged rollout

## Summary

BuildOS ontology projects now support first-class image assets with OCR extraction, entity linking, and agent-context integration.

## What shipped

- New data model and storage support for image assets:
    - `onto_assets`
    - `onto_asset_links`
    - private storage bucket `onto-assets`
- Asset API surface for full image lifecycle:
    - create/list/detail/update/delete
    - render signed URL redirect
    - link/unlink to ontology entities
    - complete upload and OCR reprocess
    - manual OCR text update
- OCR queue + worker processing:
    - queue type `extract_onto_asset_ocr`
    - worker extraction with status transitions (`pending|processing|complete|failed|skipped`)
    - manual text preservation unless force-overwrite
- Project/task/document UI integration:
    - right-rail images insight panel on project page
    - reusable image upload modal, project library picker, and asset detail modal
    - task/document image sections for attach/upload/edit/delete
    - inline document markdown image references using stable render URLs
- Search + agent context integration:
    - image fields indexed in ontology search
    - OCR snippets included in project context highlights for agent chat

## New components

- `apps/web/src/lib/components/ontology/ImageUploadModal.svelte`
- `apps/web/src/lib/components/ontology/ProjectImageLibrary.svelte`
- `apps/web/src/lib/components/ontology/AssetDetailModal.svelte`
- Refactor: `apps/web/src/lib/components/ontology/ImageAssetsPanel.svelte`

## Validation snapshot

- API route tests:
    - `apps/web/src/routes/api/onto/assets/server.test.ts`
    - `apps/web/src/routes/api/onto/assets/[id]/server.test.ts`
    - `apps/web/src/routes/api/onto/assets/[id]/links/server.test.ts`
- Queue helper test:
    - `apps/web/src/lib/server/asset-ocr-queue.service.test.ts`
- Worker OCR tests:
    - `apps/worker/tests/assetOcrWorker.test.ts`
- UI flow tests:
    - `apps/web/src/lib/components/ontology/ImageAssetsPanel.test.ts`

## Rollout notes

- `supabase` and `psql` CLIs were unavailable in this execution environment, so migration smoke-checking must be run in staging/prod deployment pipelines.
- Full `pnpm --filter @buildos/web check` remains blocked by pre-existing repo-wide diagnostics unrelated to this feature.
