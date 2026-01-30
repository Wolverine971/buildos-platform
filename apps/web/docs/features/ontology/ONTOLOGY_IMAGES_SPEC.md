<!-- apps/web/docs/features/ontology/ONTOLOGY_IMAGES_SPEC.md -->

# Ontology Images - Supabase Storage Integration Spec

Status: Draft
Owner: Platform/Ontology
Last updated: 2026-01-29

## Summary

Add first-class image assets to ontology entities, backed by Supabase Storage, with:

- Project-level image library (gallery)
- Inline image embedding in documents (Markdown)
- Attachments to tasks/plans/goals/risks/milestones
- Secure access via signed URLs and RLS

This spec aligns with existing patterns:

- Voice notes: storage bucket + database row + signed URL endpoint
- Email attachments: storage bucket + optimized variants
- Document rendering: Markdown -> sanitized HTML with <img> allowed

## Goals

- Store images in Supabase Storage and reference them from ontology entities.
- Support inline images inside document Markdown with stable, non-expiring references.
- Provide a project-wide image gallery with upload + browse + reuse.
- Support entity-linked image attachments (task/plan/goal/milestone/document/risk).
- Secure access using project membership (RLS) and signed URLs.

## Non-Goals

- Full asset management for non-images (video/audio). Images only for this phase.
- Public CDN sharing outside the app (future phase optional).
- Rich image editing or annotation.

## Key Design Decisions

1. **Private bucket + signed URLs**
    - Keep the bucket private; use short-lived signed URLs for rendering.
    - Prevents accidental leakage and enforces project access checks.
2. **Stable in-doc references**
    - Store Markdown like `![alt](/api/onto/assets/<id>/render)`
    - Backend generates signed URL on demand, avoiding expiry issues.
3. **Normalized asset metadata**
    - Single `onto_assets` table for image metadata.
    - `onto_asset_links` for flexible entity attachments.

## Data Model

### Table: `onto_assets`

- `id` UUID PK
- `project_id` UUID NOT NULL -> `onto_projects(id)`
- `kind` TEXT NOT NULL DEFAULT 'image'
- `storage_bucket` TEXT NOT NULL (e.g. 'onto-assets')
- `storage_path` TEXT NOT NULL
- `content_type` TEXT NOT NULL
- `file_size_bytes` BIGINT NOT NULL
- `width` INT NULL
- `height` INT NULL
- `alt_text` TEXT NULL
- `caption` TEXT NULL
- `metadata` JSONB NOT NULL DEFAULT '{}'::jsonb
- `created_by` UUID NOT NULL (actor)
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()
- `updated_at` TIMESTAMPTZ NOT NULL DEFAULT now()
- `deleted_at` TIMESTAMPTZ NULL

Indexes:

- `idx_onto_assets_project` on `(project_id)`
- `idx_onto_assets_kind` on `(kind)`
- `idx_onto_assets_deleted` on `(deleted_at)`
- `idx_onto_assets_props_gin` on `(metadata)` if needed

### Table: `onto_asset_links`

- `id` UUID PK
- `asset_id` UUID NOT NULL -> `onto_assets(id)` ON DELETE CASCADE
- `entity_kind` TEXT NOT NULL (task|plan|goal|milestone|document|risk|project)
- `entity_id` UUID NOT NULL
- `role` TEXT NOT NULL DEFAULT 'attachment' (inline|attachment|cover|gallery)
- `created_by` UUID NOT NULL
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT now()

Unique:

- `(asset_id, entity_kind, entity_id, role)`

Indexes:

- `idx_onto_asset_links_entity` on `(entity_kind, entity_id)`
- `idx_onto_asset_links_asset` on `(asset_id)`
- `idx_onto_asset_links_role` on `(role)`

## Storage Layout

Bucket: `onto-assets` (private)

Path scheme:

```
projects/<project_id>/assets/<asset_id>/original.<ext>
```

Rationale:

- Namespace by project for access control
- Asset ID stabilizes references
- Room for future variants (e.g., `thumb.webp`)

## API Endpoints

### Create Asset (signed upload)

`POST /api/onto/assets`

Request JSON:

```
{
  "project_id": "...",
  "content_type": "image/png",
  "file_name": "diagram.png",
  "file_size_bytes": 123456,
  "width": 1200,
  "height": 800,
  "alt_text": "Optional alt",
  "caption": "Optional caption"
}
```

Response:

```
{
  "asset": { ... },
  "upload": {
    "url": "<signed upload url>",
    "path": "projects/.../assets/.../original.png",
    "expires_at": "..."
  }
}
```

Notes:

- Server validates project access.
- Server creates `onto_assets` row with status `pending` in `metadata`.
- Server returns signed upload URL from Supabase Storage.

### Complete Asset Upload

`POST /api/onto/assets/[id]/complete`

Request JSON:

```
{ "width": 1200, "height": 800 }
```

Response:

```
{ "asset": { ... } }
```

Notes:

- Marks `metadata.status = 'ready'` and updates dims if missing.

### Render Asset (signed URL proxy)

`GET /api/onto/assets/[id]/render?width=600&format=webp`

Behavior:

- Checks access to project.
- Calls Supabase storage to create signed URL.
- Optional transform query params passed to Storage API if supported.
- Returns 302 redirect to signed URL or JSON `{ url, expiresAt }`.

### Link Asset to Entity

`POST /api/onto/assets/[id]/links`

Request JSON:

```
{ "entity_kind": "document", "entity_id": "...", "role": "inline" }
```

### Unlink Asset

`DELETE /api/onto/assets/[id]/links?entity_kind=document&entity_id=...&role=inline`

### Delete Asset

`DELETE /api/onto/assets/[id]`

Behavior:

- Soft delete `onto_assets.deleted_at`
- Remove storage object
- Remove `onto_asset_links`

## Document Embedding Flow

### Authoring

- Document editor adds an "Insert Image" button.
- Picker modal:
    - Upload new image (signed upload flow)
    - Or select existing project image
- On selection, insert Markdown:
  `![Alt text](/api/onto/assets/<id>/render)`

### Sync Links

- On document save, server parses markdown for `/api/onto/assets/<id>/render`.
- For each asset ID found:
    - Ensure `onto_asset_links` with role `inline`.
- Remove `inline` links no longer present.

## UI Integration

### Project Page

- Add "Images" panel in right sidebar (like Documents/Plans/Tasks).
- Panel shows a grid of recent images, count, and upload button.
- Clicking image opens preview modal with:
    - Title/alt/caption edit
    - Copy embed markdown
    - Delete (if allowed)

### Document Modal

- Add toolbar action: `Insert Image`.
- Add image picker modal with tabs: "Upload" / "Project Library".

### Entity Modals (Task/Plan/Goal/Risk/Milestone)

- Add "Images" subpanel listing attachments.
- Allow linking/unlinking images.

## Security & Access Control

### DB RLS

- `onto_assets` and `onto_asset_links` use `current_actor_has_project_access`.
- Select allowed for project members, insert/update/delete requires write access.

### Storage RLS

- On `storage.objects`, allow read/write when:
    - Path contains project_id in segment 2, and
    - Actor has access to that project.
- Use `storage.foldername(name)` to parse the path segments.

### Signed URL TTL

- Use short TTL (e.g., 1 hour) to prevent long-lived public access.

## Migration Plan

1. Create tables `onto_assets` and `onto_asset_links`.
2. Add updated_at trigger for `onto_assets`.
3. Add RLS policies for both tables.
4. Add Storage bucket `onto-assets` (private).
5. Add Storage RLS policies on `storage.objects`.

## Observability

- Log asset create/upload/render failures via existing ontology error logger.
- Track metrics: assets created per project, render requests, upload errors.

## Edge Cases

- Deleted assets referenced in documents should render a placeholder (404 -> image not found UI).
- Upload completed but DB insert failed -> cleanup storage object.
- Unreferenced assets should still appear in gallery; optional retention policy can prune.

## Open Questions

1. Should we allow public projects to serve images without signed URLs?
2. Do we need server-side optimization (webp/thumbnail) or rely on Storage transforms?
3. Should assets support non-image types (future)?

## Implementation Checklist (MVP)

- [ ] Add migrations for `onto_assets` and `onto_asset_links`
- [ ] Create storage bucket `onto-assets`
- [ ] Add API routes for create/complete/render/link/unlink/delete
- [ ] Add image picker modal + insert markdown in DocumentModal
- [ ] Add project Images panel with upload + browse
- [ ] Parse document markdown and sync `inline` links on save
