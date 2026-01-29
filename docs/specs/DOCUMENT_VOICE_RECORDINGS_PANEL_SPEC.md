<!-- docs/specs/DOCUMENT_VOICE_RECORDINGS_PANEL_SPEC.md -->

# Document Voice Recording Panel Specification

## Overview

Add a compact voice recordings section to the document edit modal that lists recordings made for a document, with clear timestamps and playback controls. Voice note uploads from the document editor should be linked to the document so the panel can query them directly.

## Status

| Attribute | Value                                                       |
| --------- | ----------------------------------------------------------- |
| Status    | Draft -> Implemented                                        |
| Created   | 2026-01-28                                                  |
| Owner     | Web app                                                     |
| Related   | `apps/web/src/lib/components/ontology/DocumentModal.svelte` |

## Problem Statement

Document voice recordings are currently captured via the editor, but they are not linked to the document and are not visible anywhere in the document modal. Users need a small, low-noise section that shows recordings made for the current document, with timestamps.

## Goals

- Link voice note uploads from the document editor to the document entity.
- Show a compact voice recordings panel in the document modal (desktop right rail and mobile settings area).
- Display a clear timestamp for each recording (absolute time), plus duration and playback.
- Keep the section small and non-invasive.

## Non-Goals

- Building a new transcription pipeline or altering transcription behavior.
- Adding advanced grouping or playlist features beyond existing voice note groups.
- Changing the voice recording UI inside the editor.

## UX / UI

### Placement

- Desktop: Right rail panel (near version history and activity log).
- Mobile: Inside the collapsible "Document Settings" section.

### Panel Behavior

- Header: "Voice recordings" with count and a refresh action.
- Body: Compact list of recordings, newest first.
- Empty state: "No recordings yet."
- Each item shows:
    - Timestamp (absolute date + time)
    - Duration
    - Playback controls (existing compact player)

## Data & API

### Write Path

When the document editor uploads voice note segments:

- Set `linked_entity_type = 'document'`
- Set `linked_entity_id = <document id>`
- Preserve `recorded_at` where available
- Keep existing `group_id` and metadata

### Read Path

Query voice notes by document:

```
GET /api/voice-notes?linkedEntityType=document&linkedEntityId=<document id>
```

## Implementation Outline

1. Extend `RichMarkdownEditor` with optional props for `voiceNoteLinkedEntityType` and `voiceNoteLinkedEntityId`.
2. Pass the document linkage props from `DocumentModal`.
3. Create a `DocumentVoiceNotesPanel` component:
    - Loads voice notes via `listVoiceNotes`.
    - Renders a compact `VoiceNoteList`.
    - Exposes `refresh()` and `upsertVoiceNote()` for live updates.
4. Add timestamp modes to `VoiceNoteList` (relative vs absolute).
5. Wire the editor callbacks to update the panel on new recordings.

## Edge Cases

- New document (no ID yet): panel hidden and uploads remain unlinked.
- Older notes without `recorded_at`: fall back to `created_at`.
- Upload errors: surface via existing toast/error handling.

## Logging / Telemetry

- Reuse `logOntologyClientError` for panel fetch failures.
- No new telemetry required.

## Test Plan

Manual checks:

1. Open an existing document, record a short voice note, stop.
2. Verify a new entry appears in the panel with a timestamp and duration.
3. Verify playback works and the timestamp is absolute (date + time).
4. Delete a voice note and ensure it disappears.
5. Mobile: open Document Settings and verify the panel is visible and populated.

## Rollout

No migrations required. Feature is behind the existing UI and uses existing voice notes APIs.
