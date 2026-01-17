<!-- apps/web/docs/features/ontology/DOCUMENT_VERSION_HISTORY_UI_SPEC.md -->

# Document Version History UI (Modal)

## Goals

- Let users browse, compare, and (for admins/owners) restore document versions without leaving the document modal.
- Respect clustered versioning (per-user, 60m window merges, no-op skips).
- Keep noise low and highlight authorship/time windows.

## Placement

- Surface inside the existing Document modal.
- Right rail: stack **Version History** panel above the existing **Activity** panel.
- Width: match Activity rail width; scroll independently from main document body.

## Layout

- **Header row**: “Versions” + badge showing count; “Last updated • <relative time>”.
- **Filters**: user filter (All, Me, specific users), time range (Last 24h/7d/All), search by title/content text (client-side against fetched metadata snippet).
- **List** (virtualized if >50):
    - Each item: version number (vN), primary timestamp (ended_at), user avatar/name, window label (e.g., “Clustered 12:05–12:42”), change source (api/chat/agent), change count badge if merged (>1).
    - Icons: merged indicator; restore marker (if is_restore).
    - Hover/active states highlight row.
- **Detail panel** (sticky under filters):
    - Selected version metadata: author, window, change count, source, flags (merged, restored), hash snippet.
    - Actions:
        - “View diff” (vs previous) primary.
        - “Compare to current” secondary.
        - “Restore” (admins/owners only) destructive style with confirm modal.
    - Content preview: small snippet (first 300 chars) and title/description changes summary if available.
- **Diff drawer/modal** (reuse existing `DiffView.svelte` patterns):
    - Toggle between “vs previous” and “vs current”.
    - Show side-by-side or inline diff of title, description, state_key, props/body content (markdown).
    - Skeleton while loading.

## States

- Loading: shimmer for list and detail; disable actions.
- Empty: “No versions yet” with hint “First save creates version history”.
- Error: inline alert with retry.
- Long list: paginate/virtualize; keep selection.
- Permission-gated restore: button hidden or disabled with tooltip if not admin/owner.

## Interactions

- Selecting a row loads metadata + enables actions.
- “View diff” fetches the version payload + adjacent version (previous/current) and opens diff drawer.
- “Compare to current” uses current document as RHS; if current == selected, disable.
- Restore flow:
    1. Click Restore (visible to admins/owners).
    2. Confirm modal: warn overwrite; show target version, timestamp, author; require checkbox “I understand this will overwrite current content”.
    3. Call restore endpoint with If-Unmodified-Since/version-precondition; on success, close and flash success; on failure, show conflict message.
- Activity panel stays visible below; rails scroll independently.

## Data & API expectations

- Need endpoints (to be implemented):
    - `GET /api/onto/documents/{id}/versions?limit&cursor&user_id&from&to`
        - Returns: id, number, created_by, created_at, props.snapshot_hash, props.window, props.change_count, props.change_source, flags (is_merged, is_restore), restored_by_user_id, restore_of_version (if set).
    - `GET /api/onto/documents/{id}/versions/{number}` → returns snapshot/diff metadata for diff rendering.
    - `POST /api/onto/documents/{id}/versions/{number}/restore` (admins/owners only) → creates new version tagged is_restore and replaces document content; enforces precondition on latest version.
- Props shape matches clustering spec (`snapshot`, `window`, `change_count`, `change_source`, `pii_redacted`, etc.).

## Visual cues

- Merged clusters: pill “Merged x edits”.
- Restore marker: small “Restored” tag and link to source version number.
- Change source: subtle chip (API / Chat / Agent).
- Time window: subdued text “12:05–12:42” or “~45m window”.
- Avatar + name for author; tooltip with email if available.

## Accessibility

- Keyboard: Up/Down to move selection; Enter to open diff; Cmd/Ctrl+Enter to restore (if allowed); Esc closes diff drawer.
- Announce selection and diff load with aria-live polite.
- Color contrast >= 4.5:1; focus outlines on list rows and buttons.

## Telemetry (non-blocking)

- version_list_opened, version_selected, version_diff_viewed (prev/current), version_restore_attempted/succeeded/failed; include document_id, version_number, source (api/chat/agent).

## Open follow-ups

- Decide if we show diff for props or only content/title/description/state; recommend top-level keys with redacted PII omitted.
- Add server pagination size (e.g., 50) and lazy-load older versions on scroll.
