<!-- apps/web/docs/technical/api/endpoints/voice-notes.md -->

# Voice Notes API

**Base Paths:** `/api/voice-notes`, `/api/voice-note-groups`

The Voice Notes API supports uploading audio recordings, storing transcripts, generating playback URLs,
and grouping multiple voice segments for a single message.

---

## Overview

- `voice_notes` stores audio metadata, transcripts, and storage paths.
- `voice_note_groups` links multiple segments to a single message or entity.
- Playback uses signed URLs returned from `/api/voice-notes/{id}/play`.

---

## Endpoints

### 1. `GET /api/voice-notes` - List Voice Notes

**Purpose:** Retrieve voice notes with optional filtering.

**File:** `src/routes/api/voice-notes/+server.ts`

**Authentication:** Required

#### Query Parameters

| Parameter          | Type     | Required | Description                            |
| ------------------ | -------- | -------- | -------------------------------------- |
| `linkedEntityType` | `string` | No       | Filter by linked entity type           |
| `linkedEntityId`   | `string` | No       | Filter by linked entity id             |
| `groupId`          | `string` | No       | Filter by a single voice note group id |
| `groupIds`         | `string` | No       | Comma-separated list of group ids      |
| `limit`            | `number` | No       | Max results (default: 50, max: 100)    |
| `offset`           | `number` | No       | Pagination offset                      |

#### Response

```typescript
{
  success: true,
  data: {
    voiceNotes: VoiceNote[]
  }
}
```

---

### 2. `POST /api/voice-notes` - Upload Voice Note

**Purpose:** Upload audio and create a voice note record.

**File:** `src/routes/api/voice-notes/+server.ts`

**Authentication:** Required

#### Body (multipart/form-data)

| Field                 | Type     | Required | Description                                |
| --------------------- | -------- | -------- | ------------------------------------------ |
| `audio`               | `File`   | Yes      | Audio file (webm/ogg/mp4/wav/mp3/aac)      |
| `durationSeconds`     | `number` | No       | Duration in seconds                        |
| `linkedEntityType`    | `string` | No       | Linked entity type                         |
| `linkedEntityId`      | `string` | No       | Linked entity id                           |
| `groupId`             | `string` | No       | Voice note group id                        |
| `segmentIndex`        | `number` | No       | Segment index within the group             |
| `recordedAt`          | `string` | No       | ISO timestamp of capture                   |
| `transcript`          | `string` | No       | Optional transcript                        |
| `transcriptionStatus` | `string` | No       | `pending`, `complete`, `failed`, `skipped` |
| `transcriptionSource` | `string` | No       | `live` or `audio` (stored in metadata)     |
| `transcriptionModel`  | `string` | No       | Model name used for transcription          |
| `metadata`            | `string` | No       | JSON string of metadata                    |
| `transcribe`          | `string` | No       | `true` to request server transcription     |

#### Response

```typescript
{
  success: true,
  data: VoiceNote
}
```

---

### 3. `GET /api/voice-notes/{id}/play` - Playback URL

**Purpose:** Generate a signed playback URL for a voice note.

**File:** `src/routes/api/voice-notes/[id]/play/+server.ts`

**Authentication:** Required

#### Response

```typescript
{
  success: true,
  data: {
    url: string;
    expiresAt: string;
  }
}
```

---

### 4. `PATCH /api/voice-notes/{id}` - Update Voice Note

**Purpose:** Update transcripts or transcription metadata.

**File:** `src/routes/api/voice-notes/[id]/+server.ts`

**Authentication:** Required

#### Body (JSON)

```typescript
{
  transcript?: string | null;
  transcriptionStatus?: string | null;
  transcriptionSource?: string | null;
  transcriptionModel?: string | null;
  transcriptionError?: string | null;
  metadata?: Record<string, unknown> | null;
}
```

#### Response

```typescript
{
  success: true,
  data: VoiceNote
}
```

---

### 5. `DELETE /api/voice-notes/{id}` - Delete Voice Note

**Purpose:** Soft-delete the voice note record and purge stored audio.

**File:** `src/routes/api/voice-notes/[id]/+server.ts`

**Authentication:** Required

#### Response

```typescript
{
  success: true,
  data: { id: string }
}
```

---

### 6. `GET /api/voice-note-groups` - List Voice Note Groups

**Purpose:** Retrieve voice note groups with optional filters.

**File:** `src/routes/api/voice-note-groups/+server.ts`

**Authentication:** Required

#### Query Parameters

| Parameter          | Type     | Required | Description                         |
| ------------------ | -------- | -------- | ----------------------------------- |
| `linkedEntityType` | `string` | No       | Filter by linked entity type        |
| `linkedEntityId`   | `string` | No       | Filter by linked entity id          |
| `chatSessionId`    | `string` | No       | Filter by chat session id           |
| `status`           | `string` | No       | `draft`, `attached`, `orphaned`     |
| `limit`            | `number` | No       | Max results (default: 50, max: 100) |
| `offset`           | `number` | No       | Pagination offset                   |

#### Response

```typescript
{
  success: true,
  data: { voiceNoteGroups: VoiceNoteGroup[] }
}
```

---

### 7. `POST /api/voice-note-groups` - Create Voice Note Group

**Purpose:** Create a draft voice note group (optionally with a client-provided id).

**File:** `src/routes/api/voice-note-groups/+server.ts`

**Authentication:** Required

#### Body (JSON)

```typescript
{
  id?: string;
  linkedEntityType?: string;
  linkedEntityId?: string;
  chatSessionId?: string;
  status?: string;
  metadata?: Record<string, unknown>;
}
```

---

### 8. `PATCH /api/voice-note-groups/{id}/attach` - Attach Voice Note Group

**Purpose:** Attach a group to an entity (message, brain dump, etc).

**File:** `src/routes/api/voice-note-groups/[id]/attach/+server.ts`

**Authentication:** Required

#### Body (JSON)

```typescript
{
  linkedEntityType: string;
  linkedEntityId: string;
  chatSessionId?: string;
  status?: string;
  metadata?: Record<string, unknown>;
}
```

---

### 9. `POST /api/voice-note-groups/cleanup` - Cleanup Draft Groups

**Purpose:** Delete draft groups older than a threshold and purge storage.

**File:** `src/routes/api/voice-note-groups/cleanup/+server.ts`

**Authentication:** Required

#### Body (JSON)

```typescript
{
  maxAgeHours?: number; // default: 24
  limit?: number; // default: 50
}
```
