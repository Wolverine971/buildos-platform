<!-- thoughts/shared/research/2026-01-10_voice-notes-part-2-spec.md -->
# Voice Notes Part 2 - Agentic Chat + TextareaWithVoice Integration Spec

**Date:** 2026-01-10  
**Status:** Draft (approved direction)  
**Author:** Codex (AI Research)

---

## Executive Summary

We will extend voice notes so **every TextareaWithVoice recording is saved** as audio, **even when used only for transcription**, and **voice notes are grouped per message** in agentic chat. Each stop/start creates a separate segment inside a group, and the group is attached to the submitted chat message asynchronously. The chat UI will show a compact voice-note indicator, expand to reveal per-segment playback, and offer "Play All" with auto-advance and a small gap. History view will load chat sessions with attached voice notes.

This design keeps message sending fast and does not add latency to the agentic chat flow.

---

## Goals

1. **Always save audio** for TextareaWithVoice recordings (all contexts).
2. **Multi-segment grouping**: multiple start/stop recordings before send are grouped together.
3. **Attach to chat messages** when sending, without blocking the send.
4. **Playback UI**: indicator on message, expandable list of segments, per-segment play, Play All.
5. **Transcripts shown only in expanded panel**, not in the main chat bubble.
6. **History/resume**: chat sessions load with voice note attachments.
7. **Performance**: fully async uploads and attachment; no added latency.

---

## Non-Goals

- Cross-device transcoding (e.g., WebM -> MP4).
- Offline upload queueing or background sync.
- Waveform visualization (optional future).

---

## Current Code Touchpoints (Baseline)

- Recording + transcription UI: `apps/web/src/lib/components/ui/TextareaWithVoice.svelte`
- Recording engine: `apps/web/src/lib/services/voiceRecording.service.ts`
- Voice notes storage: `voice_notes` table + `/api/voice-notes`
- Agentic chat send: `apps/web/src/routes/api/agent/stream/+server.ts`
- Message persistence: `apps/web/src/routes/api/agent/stream/services/message-persister.ts`
- Chat session load: `apps/web/src/routes/api/chat/sessions/[id]/+server.ts`
- Chat UI: `apps/web/src/lib/components/agent/AgentChatModal.svelte`, `AgentMessageList.svelte`

---

## Architecture Overview

### Key Concepts

**Voice Note Segment:** One recorded blob per start/stop cycle.  
**Voice Note Group:** A logical bundle of segments produced while composing one message.

### High-Level Flow (Agentic Chat)

1. First recording in TextareaWithVoice creates a `voice_note_group_id` (draft).
2. Each stop creates a **segment** (voice note row) with `group_id` + `segment_index`.
3. Transcription completes and patches the note (transcript saved).
4. When user sends the message:
   - The `voice_note_group_id` is attached to the `chat_messages` row.
   - No blocking; the message send is not delayed by uploads.
5. In the chat UI:
   - Message shows a **voice indicator**.
   - Expanded view shows segments with playback + transcript.
   - "Play All" plays segments sequentially with a small gap.

### General Flow (All TextareaWithVoice)

Every TextareaWithVoice instance saves audio to voice_notes.  
If there is no immediate entity to attach, the group remains in **draft** status and is cleaned up later.

---

## Data Model

### New Table: `voice_note_groups`

```sql
CREATE TABLE voice_note_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- linkage (when attached)
  linked_entity_type TEXT,
  linked_entity_id UUID,
  chat_session_id UUID REFERENCES chat_sessions(id) ON DELETE SET NULL,

  -- status
  status TEXT NOT NULL DEFAULT 'draft', -- draft | attached | orphaned

  -- metadata
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_voice_note_groups_user ON voice_note_groups(user_id);
CREATE INDEX idx_voice_note_groups_linked ON voice_note_groups(linked_entity_type, linked_entity_id);
CREATE INDEX idx_voice_note_groups_session ON voice_note_groups(chat_session_id);

ALTER TABLE voice_note_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "voice_note_groups_user_access"
  ON voice_note_groups
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
```

### Update `voice_notes`

```sql
ALTER TABLE voice_notes
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES voice_note_groups(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS segment_index INTEGER,
  ADD COLUMN IF NOT EXISTS recorded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

CREATE INDEX idx_voice_notes_group_id ON voice_notes(group_id);
CREATE INDEX idx_voice_notes_group_segment ON voice_notes(group_id, segment_index);
```

**Notes**
- `voice_note_groups` is authoritative for linkage to entities.
- `voice_notes.linked_entity_*` can remain for non-group use cases, but group should be primary for TextareaWithVoice.

---

## API Design

### Voice Note Groups

**POST `/api/voice-note-groups`**  
Create a group (draft).

**Request**
```json
{
  "metadata": {
    "source_component": "agent_chat",
    "client_message_id": "uuid"
  }
}
```

**Response**
```json
{ "id": "uuid", "status": "draft" }
```

**PATCH `/api/voice-note-groups/:id/attach`**  
Attach to entity (chat message).

**Request**
```json
{
  "linkedEntityType": "chat_message",
  "linkedEntityId": "uuid",
  "chatSessionId": "uuid",
  "status": "attached"
}
```

### Voice Notes

**POST `/api/voice-notes`** (extended)
```text
audio: File
groupId: string (required for TextareaWithVoice)
segmentIndex: number
recordedAt: ISO string
transcript: string (optional)
transcriptionStatus: complete | pending | failed
transcriptionSource: live | audio
metadata: JSON
```

**PATCH `/api/voice-notes/:id`**
```json
{
  "transcript": "string",
  "transcriptionStatus": "complete",
  "transcriptionSource": "audio",
  "metadata": { "transcription_latency_ms": 1234 }
}
```

**GET `/api/voice-notes?groupId=...`**  
Fetch segments for one group.  
**GET `/api/voice-notes?groupIds=...`**  
Batch fetch for a session (comma-separated IDs).

**DELETE `/api/voice-notes/:id`**  
Soft delete segment (available to users).

### Chat Session Load (History/Resume)

**GET `/api/chat/sessions/:id?includeVoiceNotes=1`**

Response includes:
```json
{
  "session": {...},
  "messages": [...],
  "voiceNoteGroups": [...],
  "voiceNotes": [...]
}
```

This avoids N+1 client fetches.

---

## Client Integration

### TextareaWithVoice

Add a lightweight **voice capture manager**:

- **State**
  - `voiceNoteGroupId` (created on first segment)
  - `segmentIndex` (incremental)
  - `uploadQueue` (concurrency 2)

- **On stop recording**
  1. `voiceRecordingService.stopRecording()` returns Blob.
  2. Create (if needed) `voice_note_group_id`.
  3. Enqueue upload `POST /api/voice-notes` with groupId + segmentIndex.
  4. If transcript already exists from transcription pipeline, PATCH the note.

- **Callbacks**
  - `onVoiceNoteGroupReady(groupId)`
  - `onVoiceNoteSegmentUpdate({ segmentIndex, status, voiceNoteId })`

Uploads are **never awaited** in the stop handler; they run async.

### Agentic Chat (AgentChatModal / AgentComposer)

- Track `currentVoiceNoteGroupId` for the composer.
- On send:
  - Include `voice_note_group_id` in `/api/agent/stream` request body.
  - Include `voice_note_group_id` in `UIMessage.metadata`.
- On server:
  - Attach group to `chat_messages` after message persistence (async).

### Message UI

In `AgentMessageList.svelte`:

- If `message.metadata.voice_note_group_id`, show a **voice note badge**.
- Expand panel to:
  - Show list of segments (play individual).
  - Show transcript for each segment.
  - "Play All" sequential with 0.5s gap.
  - Allow deletion of segment.

Transcripts are **only** visible inside this expanded panel.

### History / Resumed Sessions

- Session load uses `includeVoiceNotes=1`.
- Hydrate message list with voice groups and segments.
- Badge + playback behaves the same.

---

## Play All Behavior

Implement a small playlist controller:

- Single audio element.
- Queue segments in `segment_index` order.
- Auto-advance on `ended`, wait 500ms, play next.
- Use the **same playback speed** across segments.
- Allow "Stop All".

---

## Deleting Individual Segments

From expanded panel:

- Delete action triggers a **confirmation modal** that shows:
  - Segment duration (e.g., `1:24`)
  - Transcript preview (full text if short, otherwise truncated with "Show more")
- On confirm, `DELETE /api/voice-notes/:id` deletes the segment and **purges storage**.
- Remove from UI list immediately.
- If group becomes empty:
  - Mark group as `orphaned` (or delete the group).

---

## Cleanup Strategy (Unsent Groups)

**Approved default:** delete draft groups after 24 hours.

Options:

1. **Server cron (preferred)**  
   Supabase scheduled job: delete `voice_note_groups` where `status='draft'` and `created_at < now() - interval '24 hours'`.  
   Cascade removes `voice_notes` and **purges storage objects**.

2. **Opportunistic cleanup**  
   On `/api/voice-note-groups` create or on app load, call cleanup endpoint to remove expired drafts.

---

## Performance & Latency

- Uploads are queued and fully async.
- Message sending **never waits** on uploads or group attach.
- Batched fetches for voice notes prevent N+1 queries.
- Playback URLs are signed on demand.

---

## Security & RLS

- `voice_note_groups` RLS mirrors `voice_notes` (user-scoped).
- Storage bucket policies already enforce per-user folder.
- Playback uses signed URLs only.

---

## UI/UX Requirements

- Message bubble: **voice indicator** (icon + count).
- Expanded panel:
  - Segment list with individual play.
  - Transcript visible per segment.
  - "Play All" with auto-advance + gap.
  - Delete per segment.
- Transcripts never shown in main bubble.

---

## Implementation Phases

1. **Schema & API**
   - Add `voice_note_groups` + `voice_notes` columns.
   - Extend voice note APIs and add group attach endpoint.
   - Update `/api/chat/sessions/:id` to include voice notes.

2. **TextareaWithVoice**
   - Create voice note group on first segment.
   - Upload segments async; patch transcript after transcribe.
   - Expose group id to parent.

3. **Agentic Chat**
   - Attach group id to message metadata + server attach.
   - Add UI indicator, expanded panel, and Play All.

4. **History**
   - Load voice notes with chat session.
   - Render attachments in resumed sessions.

---

## Decisions (from user)

- Transcripts shown only in expanded voice note panel.
- Voice notes saved for all TextareaWithVoice instances.
- Unsent groups should be deleted (reasonable TTL).
- Play All is sequential with auto-advance and a small gap.
- Use `voice_note_groups`.
- Allow deleting individual segments after send.

---

## Open Questions (None Blocking)

- None.
