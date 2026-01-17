<!-- apps/web/docs/features/ontology/DOCUMENT_VERSIONING_CLUSTERING_SPEC.md -->

# Document Versioning (Clustered)

## Goal

Track document edits without noisy per-keystroke versions by clustering edits by user + time window, while keeping restore/audit readiness.

## Version boundaries

- Create version on: initial document creation; edits by a different user; edits by the same user after inactivity window; restores (future) always create a new version tagged as restore.
- Merge into current version when the same user edits within the merge window (default 60 minutes). Window end refreshes on each merged edit.
- Skip versioning for no-op writes (snapshot hash unchanged after the update).

## Merge window

- Global default: 60 minutes. No per-tenant flag. Optional per-document override only if a concrete use-case appears (stored in doc props or request override).

## Data captured (onto_document_versions)

- Columns: `document_id`, `number` (sequential per doc), `created_by` (actor), `created_at`, `storage_uri` (use `inline://document-snapshot`), `props` JSON.
- `props` shape:
    - `snapshot`: { title, content, description, props, state_key, type_key, project_id }
    - `snapshot_hash`: sha256 of snapshot; `previous_snapshot_hash`
    - `window`: { started_at, ended_at }
    - `change_count`: number of edits merged into this version
    - `change_source`: api/chat/agent (request-derived)
    - Flags: `is_merged` (true if >1 change), `pii_redacted` (true if snapshot omits flagged PII fields)
    - Restore metadata (future): `restored_by_user_id`, `restore_of_version`

## Write-path algorithm

1. After a successful document mutation, build `snapshot` (fields above) and `snapshot_hash`.
2. Load latest version for the document.
3. If no version exists → insert version 1 with window start/end = now.
4. If latest.created_by !== actor → insert new version with number = latest.number + 1.
5. If latest.created_by === actor and now - latest.window.ended_at ≤ merge window → merge:
    - update window.ended_at = now, snapshot/hash, change_count++, is_merged=true.
6. Otherwise insert a new version (latest.number + 1).
7. If snapshot_hash matches pre-update snapshot hash → skip version creation (no-op).

## Access/restore (future)

- Restore allowed only for admins and document owners; restoration creates a new version marked `is_restore` and `restored_by_user_id`.
- Require latest-version precondition to avoid clobbering concurrent edits; log restore events.

## Operational notes

- Periodic compaction/snapshotting can be added later to cap diff chains (today we store full snapshots inline).
- Emit audit log/metrics on create/merge/restore attempts; surface non-blocking warnings if versioning fails but the document update succeeds.
