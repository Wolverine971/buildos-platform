<!-- thoughts/shared/research/2026-01-09_voice-recording-spec.md -->
# Voice Recording Feature Specification

**Date:** 2026-01-09
**Status:** Reviewed (aligned with current codebase)
**Author:** Claude (AI Research)

---

## Executive Summary

This spec outlines the implementation strategy for voice note recording, storage, and playback in BuildOS. The codebase already has a solid voice recording foundation—the main gaps are **persistent storage** and **playback UI**.

---

## Current State Analysis

### Existing Voice Infrastructure

BuildOS already has a functional voice recording system for brain dumps:

| Component | Path | Purpose |
|-----------|------|---------|
| Voice Engine | `/apps/web/src/lib/utils/voice.ts` | Core MediaRecorder + Web Speech API |
| Voice Service | `/apps/web/src/lib/services/voiceRecording.service.ts` | Singleton wrapper with callbacks |
| Transcription API | `/apps/web/src/routes/api/transcribe/+server.ts` | OpenAI transcription endpoint |
| Recording UI | `/apps/web/src/lib/components/brain-dump/RecordingView.svelte` | Full recording interface |
| Voice Textarea | `/apps/web/src/lib/components/ui/TextareaWithVoice.svelte` | Textarea with embedded voice |

### Current Capabilities

- Dual-mode recording: Live transcription (Web Speech API) + audio fallback (MediaRecorder)
- Microphone pre-warming for instant start
- MediaRecorder format selection via feature detection (WebM, OGG, MP4, WAV, MP3; FLAC is accepted by the transcription API but not emitted by MediaRecorder)
- Audio capture constraints request mono, 16kHz, and ~64 kbps target bitrate (actual output varies by browser)
- Custom vocabulary for better transcription
- Retry logic with exponential backoff
- Proper resource cleanup

### Current Gap: No Audio Persistence

The current system records locally and sends audio to OpenAI for transcription, so **audio files are not stored**. For voice notes that users can replay, we need:

1. Supabase Storage bucket for audio files
2. Database table for audio metadata
3. Playback UI component

---

## Recommended Architecture

### Audio Format Strategy

Use feature detection (`MediaRecorder.isTypeSupported`) instead of UA sniffing. The existing `voice.ts` already picks the first supported type from a preferred list.

| Platform | Format | Codec | Why |
|----------|--------|-------|-----|
| Desktop Chrome/Firefox/Edge | WebM | Opus | Smallest files, excellent quality |
| Android | WebM | Opus | Native support, efficient |
| iOS Safari | MP4 | AAC | Only format iOS reliably supports for recording |
| Fallback | WAV | PCM | Universal but large files |

**Recommended settings for voice notes (current code defaults):**
- Sample rate: 16kHz (requested; browser may ignore)
- Channels: Mono
- Target bitrate: ~64 kbps (MediaRecorder option)
- Expected file size: ~480 KB per minute at 64 kbps

Preferred order in current code: `audio/webm`, `audio/ogg`, `audio/mp4`, `audio/wav`, `audio/mpeg`.

### Storage Architecture

```
Supabase Storage
└── voice_notes (private bucket)
    └── {user_id}/
        └── {voice_note_id}.{ext}
```

**RLS Policies Required:**
- Users can only upload to their own folder (`{user_id}/`)
- Users can only read/delete their own files
- Signed URLs for playback (short TTL, e.g., 1 hour; refresh on demand)

### Database Schema

```sql
-- Voice notes metadata table
CREATE TABLE voice_notes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,

  -- File info
  storage_path TEXT NOT NULL,           -- Path in Supabase Storage
  storage_bucket TEXT NOT NULL DEFAULT 'voice_notes',
  file_size_bytes INTEGER NOT NULL,
  duration_seconds NUMERIC(10, 2),
  mime_type TEXT NOT NULL,

  -- Transcription (optional)
  transcript TEXT,
  transcription_model TEXT,             -- e.g., 'gpt-4o-transcribe'
  transcription_status TEXT DEFAULT 'pending', -- pending, complete, failed, skipped
  transcription_error TEXT,

  -- Context (optional - for linking to other entities)
  linked_entity_type TEXT,              -- e.g., 'project', 'task', 'brain_dump'
  linked_entity_id UUID,

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),

  -- Soft delete
  deleted_at TIMESTAMPTZ
);

-- Indexes
CREATE INDEX idx_voice_notes_user_id ON voice_notes(user_id);
CREATE INDEX idx_voice_notes_linked ON voice_notes(linked_entity_type, linked_entity_id);

-- RLS
ALTER TABLE voice_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own voice notes"
ON voice_notes
FOR ALL
USING (auth.uid() = user_id);
```

---

## Implementation Options

### Option A: Extend Existing Voice Service (Recommended)

Leverage the existing `voiceRecording.service.ts` and add storage capabilities. Note: the current service does not surface the audio Blob, so add an `onAudioCaptured` callback or return the Blob from `stopRecording` before transcription.

**Pros:**
- Reuses proven recording logic
- Minimal code changes
- Consistent with existing patterns

**Cons:**
- Service is optimized for transcription flow, so you need a hook to capture audio for upload
- May need refactoring to avoid coupling voice notes to brain-dump text updates

### Option B: New Dedicated Voice Notes Service

Create a separate service specifically for voice notes:

**Pros:**
- Clean separation of concerns
- Purpose-built for record/store/playback
- Easier to maintain independently

**Cons:**
- Some code duplication
- More initial work

### Recommendation

**Option A** for the initial implementation, with clear interfaces that allow extraction later if needed.

---

## Component Design

### VoiceNoteRecorder Component

```svelte
<VoiceNoteRecorder
  onSave={(voiceNote) => {...}}
  onError={(error) => {...}}
  maxDuration={300}           <!-- 5 minutes (keep shorter if transcribing synchronously) -->
  showTranscript={true}
  linkedEntityType="project"
  linkedEntityId={projectId}
/>
```

**Features:**
- Record button with visual feedback (waveform or pulse)
- Duration display
- Live transcript preview (optional)
- Cancel/Save actions
- Upload progress indicator

### VoiceNotePlayer Component

```svelte
<VoiceNotePlayer
  voiceNote={voiceNoteData}
  showTranscript={true}
  compact={false}
/>
```

**Features:**
- Play/Pause toggle
- Progress bar with seek
- Duration display (current / total)
- Playback speed control (1x, 1.2x, 1.5x, 1.7x, 2x)
- Transcript display (if available)
- Delete action

### VoiceNoteList Component

```svelte
<VoiceNoteList
  voiceNotes={voiceNotes}
  onDelete={(id) => {...}}
  onSelect={(voiceNote) => {...}}
/>
```

---

## API Endpoints

### POST /api/voice-notes

Upload and create a new voice note.

**Request:** `multipart/form-data`
```
audio: File (required)
linkedEntityType: string (optional)
linkedEntityId: string (optional)
durationSeconds: number (optional)
transcribe: boolean (optional, default: false)
```

**Response:**
```json
{
  "id": "uuid",
  "storageBucket": "voice_notes",
  "storagePath": "user_id/note_id.webm",
  "mimeType": "audio/webm",
  "fileSizeBytes": 123456,
  "durationSeconds": 45.2,
  "transcript": "Hello this is a voice note...",
  "transcriptionStatus": "complete",
  "createdAt": "2026-01-09T12:00:00Z"
}
```

If `transcribe` is false or queued for background processing, return `transcript: null` and `transcriptionStatus: "pending"` or `"skipped"`.

### GET /api/voice-notes/:id/play

Get signed URL for playback (short-lived; refresh on demand).

**Response:**
```json
{
  "url": "https://...supabase.co/storage/v1/object/sign/...",
  "expiresAt": "2026-01-09T13:00:00Z"
}
```

### DELETE /api/voice-notes/:id

Soft delete a voice note (set `deleted_at`). Optionally remove the storage object immediately or via a retention job.

### GET /api/voice-notes

List user's voice notes with optional filters.

Default behavior should exclude `deleted_at` rows unless explicitly requested.

**Query params:**
- `linkedEntityType`: Filter by entity type
- `linkedEntityId`: Filter by specific entity
- `limit`: Pagination limit
- `offset`: Pagination offset

---

## Transcription Workflow and Timeouts

- The current `/api/transcribe` route uses a 30s timeout with limited retries; keep synchronous transcription short (roughly <= 2-3 minutes).
- For longer notes, store audio first, mark `transcription_status` as `pending`, and process in a background job (queue/cron/edge function). Update the row when complete.
- If live transcript is available, you can skip or defer audio transcription to reduce latency.
- Reuse the existing `/api/transcribe` route (expects `audio` and optional `vocabularyTerms`) to stay aligned with current validation and retry logic.

---

## Mobile Considerations

### iOS Safari Specifics

1. **Format**: MP4/AAC is the only widely supported recording format; WebM is not supported on iOS
2. **Detection**: Use feature detection (`MediaRecorder.isTypeSupported`) instead of UA sniffing
3. **Permissions**: MediaRecorder support is iOS-version dependent and requires a user gesture; pre-warming may be blocked
4. **Gotcha**: Some iOS versions fail silently, so handle errors and disable UI gracefully

```typescript
const PREFERRED_MIME_TYPES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/mp4',
  'audio/wav',
  'audio/mpeg'
];

function getRecordingMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  return PREFERRED_MIME_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? null;
}
```

### Android Chrome

- Full WebM/Opus support
- Works reliably with standard MediaRecorder API

---

## Storage Bucket Setup

### Create Bucket (Supabase Dashboard or SQL)

```sql
-- Create private bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('voice_notes', 'voice_notes', false);
```

### RLS Policies

```sql
-- Allow authenticated users to upload to their own folder
CREATE POLICY "Users upload own voice notes"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'voice_notes'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to read their own files
CREATE POLICY "Users read own voice notes"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'voice_notes'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

-- Allow users to delete their own files
CREATE POLICY "Users delete own voice notes"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'voice_notes'
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = auth.uid()::text
);
```

---

## Playback Implementation

### HTML5 Audio API

Use standard `<audio>` element with custom controls for consistency with Inkprint design:

```typescript
class AudioPlayer {
  private audio: HTMLAudioElement;

  constructor(url: string) {
    this.audio = new Audio(url);
    this.audio.preload = 'metadata';
  }

  play() { return this.audio.play(); }
  pause() { this.audio.pause(); }
  seek(time: number) { this.audio.currentTime = time; }
  setPlaybackRate(rate: number) { this.audio.playbackRate = rate; }

  get duration() { return this.audio.duration; }
  get currentTime() { return this.audio.currentTime; }
  get isPlaying() { return !this.audio.paused; }

  onTimeUpdate(callback: (time: number) => void) {
    this.audio.addEventListener('timeupdate', () => callback(this.currentTime));
  }

  onEnded(callback: () => void) {
    this.audio.addEventListener('ended', callback);
  }
}
```

If you plan to render waveforms via Web Audio/Canvas, set `audio.crossOrigin = 'anonymous'` and ensure Storage CORS allows your app origin.

### Cross-Device Playback

If users play notes across devices, WebM recorded on desktop will not play on iOS. You have two viable options:

1. Store the original format and a server-side AAC/MP4 transcode (ffmpeg), then pick the best source with `canPlayType`.
2. Skip transcoding and only guarantee playback on devices that support the recorded format.

Example when you store both encodings:

```svelte
<audio controls>
  <source src={mp4Url} type="audio/mp4" />
  <source src={webmUrl} type="audio/webm" />
  Your browser doesn't support audio playback.
</audio>
```

---

## Variable Playback Speed Implementation

### Overview

Variable playback speed is essential for voice notes - users often want to listen faster to save time. The HTML5 Audio API provides native support via two key properties:

| Property | Purpose | Default |
|----------|---------|---------|
| `playbackRate` | Controls playback speed (0.5 to 4.0) | 1.0 |
| `preservesPitch` | Prevents chipmunk effect when speed changes | true |

### Supported Speed Options

Based on podcast app UX research and your requirements:

| Speed | Use Case | Notes |
|-------|----------|-------|
| **1x** | Normal playback | Default, natural pace |
| **1.2x** | Slight speedup | Very comfortable, barely noticeable |
| **1.5x** | Moderate speedup | Most popular choice, good balance |
| **1.7x** | Faster | Still comprehensible for most content |
| **2x** | Fast | Requires focus, best for familiar content |

### Browser Support

**`playbackRate`**: Supported in all modern browsers
- Valid range is browser-defined; clamp to 0.5 to 4.0 for safety
- Negative values (reverse playback) not widely supported

**`preservesPitch`**: Supported in most modern browsers but not fully standardized
- Use vendor-prefixed fallbacks when available (`mozPreservesPitch`, `webkitPreservesPitch`)
- Default behavior varies, so set it explicitly when supported

### Core Implementation

```typescript
// Playback speed options
const PLAYBACK_SPEEDS = [1, 1.2, 1.5, 1.7, 2] as const;
type PlaybackSpeed = typeof PLAYBACK_SPEEDS[number];

class VoiceNoteAudioPlayer {
  private audio: HTMLAudioElement;
  private currentSpeedIndex = 0; // Start at 1x

  constructor(url: string) {
    this.audio = new Audio(url);
    this.audio.preload = 'metadata';

    // Ensure pitch is preserved when supported
    const audioWithPitch = this.audio as HTMLAudioElement & {
      preservesPitch?: boolean;
      mozPreservesPitch?: boolean;
      webkitPreservesPitch?: boolean;
    };
    if ('preservesPitch' in audioWithPitch) audioWithPitch.preservesPitch = true;
    if ('mozPreservesPitch' in audioWithPitch) audioWithPitch.mozPreservesPitch = true;
    if ('webkitPreservesPitch' in audioWithPitch) audioWithPitch.webkitPreservesPitch = true;
  }

  // Get current playback speed
  get playbackRate(): PlaybackSpeed {
    return PLAYBACK_SPEEDS[this.currentSpeedIndex];
  }

  // Set specific playback speed
  setPlaybackRate(speed: PlaybackSpeed): void {
    const index = PLAYBACK_SPEEDS.indexOf(speed);
    if (index !== -1) {
      this.currentSpeedIndex = index;
      this.audio.playbackRate = speed;
    }
  }

  // Cycle to next speed (useful for single-button UI)
  cyclePlaybackRate(): PlaybackSpeed {
    this.currentSpeedIndex = (this.currentSpeedIndex + 1) % PLAYBACK_SPEEDS.length;
    const newSpeed = PLAYBACK_SPEEDS[this.currentSpeedIndex];
    this.audio.playbackRate = newSpeed;
    return newSpeed;
  }

  // Reset to normal speed
  resetPlaybackRate(): void {
    this.currentSpeedIndex = 0;
    this.audio.playbackRate = 1;
  }

  play() { return this.audio.play(); }
  pause() { this.audio.pause(); }
  seek(time: number) { this.audio.currentTime = time; }

  get duration() { return this.audio.duration; }
  get currentTime() { return this.audio.currentTime; }
  get isPlaying() { return !this.audio.paused; }

  // Adjusted duration based on playback speed
  get remainingTimeAtCurrentSpeed(): number {
    const remaining = this.duration - this.currentTime;
    return remaining / this.audio.playbackRate;
  }

  onTimeUpdate(callback: (time: number) => void) {
    this.audio.addEventListener('timeupdate', () => callback(this.currentTime));
  }

  onEnded(callback: () => void) {
    this.audio.addEventListener('ended', callback);
  }

  onRateChange(callback: (rate: number) => void) {
    this.audio.addEventListener('ratechange', () => callback(this.audio.playbackRate));
  }

  destroy() {
    this.audio.pause();
    this.audio.src = '';
  }
}
```

### Svelte 5 Component Implementation

```svelte
<!-- VoiceNotePlayer.svelte -->
<script lang="ts">
  import { onMount, onDestroy } from 'svelte';

  const PLAYBACK_SPEEDS = [1, 1.2, 1.5, 1.7, 2] as const;
  type PlaybackSpeed = typeof PLAYBACK_SPEEDS[number];

  interface Props {
    audioUrl: string;
    showTranscript?: boolean;
    transcript?: string;
    onEnded?: () => void;
  }

  let { audioUrl, showTranscript = false, transcript = '', onEnded }: Props = $props();

  // Reactive state using Svelte 5 runes
  let audio: HTMLAudioElement | null = $state(null);
  let isPlaying = $state(false);
  let currentTime = $state(0);
  let duration = $state(0);
  let playbackSpeed: PlaybackSpeed = $state(1);
  let speedIndex = $state(0);

  // Derived values
  let progress = $derived(duration > 0 ? (currentTime / duration) * 100 : 0);
  let formattedCurrentTime = $derived(formatTime(currentTime));
  let formattedDuration = $derived(formatTime(duration));
  let formattedRemainingTime = $derived(
    formatTime((duration - currentTime) / playbackSpeed)
  );

  function formatTime(seconds: number): string {
    if (!isFinite(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  function cycleSpeed() {
    speedIndex = (speedIndex + 1) % PLAYBACK_SPEEDS.length;
    playbackSpeed = PLAYBACK_SPEEDS[speedIndex];
    if (audio) {
      audio.playbackRate = playbackSpeed;
    }
  }

  function setSpeed(speed: PlaybackSpeed) {
    const index = PLAYBACK_SPEEDS.indexOf(speed);
    if (index !== -1) {
      speedIndex = index;
      playbackSpeed = speed;
      if (audio) {
        audio.playbackRate = speed;
      }
    }
  }

  function togglePlay() {
    if (!audio) return;
    if (isPlaying) {
      audio.pause();
    } else {
      audio.play();
    }
  }

  function seek(e: Event) {
    if (!audio) return;
    const target = e.target as HTMLInputElement;
    audio.currentTime = parseFloat(target.value);
  }

  function setPreservesPitch(target: HTMLAudioElement) {
    const withPitch = target as HTMLAudioElement & {
      preservesPitch?: boolean;
      mozPreservesPitch?: boolean;
      webkitPreservesPitch?: boolean;
    };
    if ('preservesPitch' in withPitch) withPitch.preservesPitch = true;
    if ('mozPreservesPitch' in withPitch) withPitch.mozPreservesPitch = true;
    if ('webkitPreservesPitch' in withPitch) withPitch.webkitPreservesPitch = true;
  }

  onMount(() => {
    audio = new Audio(audioUrl);
    audio.preload = 'metadata';
    setPreservesPitch(audio);

    audio.addEventListener('loadedmetadata', () => {
      duration = audio!.duration;
    });

    audio.addEventListener('timeupdate', () => {
      currentTime = audio!.currentTime;
    });

    audio.addEventListener('play', () => {
      isPlaying = true;
    });

    audio.addEventListener('pause', () => {
      isPlaying = false;
    });

    audio.addEventListener('ended', () => {
      isPlaying = false;
      currentTime = 0;
      onEnded?.();
    });
  });

  onDestroy(() => {
    if (audio) {
      audio.pause();
      audio.src = '';
    }
  });
</script>

<div class="voice-player bg-card rounded-lg p-4 shadow-ink">
  <!-- Progress bar -->
  <div class="mb-3">
    <input
      type="range"
      min="0"
      max={duration}
      step="0.1"
      value={currentTime}
      on:input={seek}
      class="w-full h-2 bg-muted rounded-lg appearance-none cursor-pointer"
    />
  </div>

  <!-- Controls row -->
  <div class="flex items-center justify-between">
    <!-- Play/Pause button -->
    <button
      on:click={togglePlay}
      class="pressable w-10 h-10 rounded-full bg-accent text-accent-foreground flex items-center justify-center"
      aria-label={isPlaying ? 'Pause' : 'Play'}
    >
      {#if isPlaying}
        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M6 4h4v16H6V4zm8 0h4v16h-4V4z"/>
        </svg>
      {:else}
        <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
          <path d="M8 5v14l11-7z"/>
        </svg>
      {/if}
    </button>

    <!-- Time display -->
    <div class="text-sm text-muted-foreground font-mono">
      {formattedCurrentTime} / {formattedDuration}
    </div>

    <!-- Playback speed button -->
    <button
      on:click={cycleSpeed}
      class="pressable px-3 py-1 rounded-md bg-muted text-foreground text-sm font-medium min-w-[3.5rem]"
      aria-label="Change playback speed"
      title="Click to cycle speeds: 1x → 1.2x → 1.5x → 1.7x → 2x"
    >
      {playbackSpeed}x
    </button>
  </div>

  <!-- Speed presets (optional expanded view) -->
  <div class="mt-3 flex gap-2 justify-center">
    {#each PLAYBACK_SPEEDS as speed}
      <button
        on:click={() => setSpeed(speed)}
        class="pressable px-2 py-1 rounded text-xs transition-colors
          {playbackSpeed === speed
            ? 'bg-accent text-accent-foreground'
            : 'bg-muted text-muted-foreground hover:bg-muted/80'}"
      >
        {speed}x
      </button>
    {/each}
  </div>

  <!-- Remaining time at current speed -->
  <div class="mt-2 text-center text-xs text-muted-foreground">
    {formattedRemainingTime} remaining at {playbackSpeed}x
  </div>

  <!-- Transcript (optional) -->
  {#if showTranscript && transcript}
    <div class="mt-4 p-3 bg-muted rounded-md text-sm text-foreground">
      <p class="font-medium text-muted-foreground mb-1">Transcript</p>
      <p>{transcript}</p>
    </div>
  {/if}
</div>
```

### Speed Persistence

Remember user's preferred playback speed across sessions:

```typescript
// utils/playback-speed-storage.ts
const STORAGE_KEY = 'voice_note_playback_speed';

export function getStoredPlaybackSpeed(): PlaybackSpeed {
  if (typeof window === 'undefined') return 1;
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored) {
    const speed = parseFloat(stored);
    if (PLAYBACK_SPEEDS.includes(speed as PlaybackSpeed)) {
      return speed as PlaybackSpeed;
    }
  }
  return 1;
}

export function storePlaybackSpeed(speed: PlaybackSpeed): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, speed.toString());
}
```

### Database Schema Addition (Optional)

If you want per-user server-side speed preference:

```sql
-- Add to users table or create preference table
ALTER TABLE users ADD COLUMN preferred_playback_speed NUMERIC(2,1) DEFAULT 1.0;

-- Or create a dedicated preferences table
CREATE TABLE user_preferences (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  voice_note_playback_speed NUMERIC(2,1) DEFAULT 1.0,
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### UI/UX Best Practices

1. **Single-button cycle**: Tap speed button to cycle through options (most common pattern)
2. **Visual indicator**: Always show current speed on the button (e.g., "1.5x")
3. **Preset buttons**: Optionally show all speeds as tappable chips for direct selection
4. **Remaining time**: Show adjusted remaining time based on current speed
5. **Memory**: Remember last-used speed (localStorage or database)
6. **Reset on new audio**: Consider resetting to 1x when loading a new voice note, or preserving user preference
7. **Accessibility**: Include aria-labels describing current speed and what button does

### Edge Cases to Handle

```typescript
// Handle audio element not ready
function safeSetPlaybackRate(audio: HTMLAudioElement | null, rate: number) {
  if (!audio) return;

  // Wait for audio to be ready
  if (audio.readyState >= HTMLMediaElement.HAVE_METADATA) {
    audio.playbackRate = rate;
  } else {
    audio.addEventListener('loadedmetadata', () => {
      audio.playbackRate = rate;
    }, { once: true });
  }
}

// Clamp rate to valid range
function clampPlaybackRate(rate: number): number {
  return Math.max(0.5, Math.min(4.0, rate));
}

// Handle rate change during playback
// (some browsers may briefly glitch - usually not noticeable)
```

### Testing Checklist

- [ ] Speed changes work during playback
- [ ] Speed changes work when paused
- [ ] `preservesPitch` prevents chipmunk effect at all speeds
- [ ] Speed persists when seeking within track
- [ ] Speed button shows correct current value
- [ ] Remaining time updates correctly with speed changes
- [ ] Works on iOS Safari (MP4 files)
- [ ] Works on Android Chrome (WebM files)
- [ ] If transcoding is enabled, WebM recordings play on iOS via MP4 fallback
- [ ] Speed preference persists across page reloads
- [ ] Keyboard accessibility for speed controls
- [ ] Long recordings queue transcription and update `transcription_status` correctly

---

## Security Considerations

1. **Never expose direct storage URLs** - Always use signed URLs via API
2. **Signed URL expiration** - short TTL (e.g., 1 hour) for playback, shorter for uploads
3. **RLS enforcement** - User isolation at database and storage level
4. **File validation** - Verify MIME type before storage and treat client-provided duration as advisory
5. **Size limits** - Enforce max file size (e.g., 50MB = ~10 min at high quality)
6. **Rate limiting** - Prevent abuse of transcription API

---

## File Size Estimates

| Duration | WebM Opus (64kbps) | MP4 AAC (128kbps) | WAV (uncompressed) |
|----------|-------------------|-------------------|-------------------|
| 1 minute | ~480 KB | ~960 KB | ~5 MB |
| 5 minutes | ~2.4 MB | ~4.8 MB | ~25 MB |
| 10 minutes | ~4.8 MB | ~9.6 MB | ~50 MB |

**Recommendation:** Use WebM Opus for non-iOS, keep synchronous transcription short, and consider MP4 transcoding if cross-device playback is required.

---

## Implementation Phases

### Phase 1: Core Infrastructure
- Create Supabase storage bucket with RLS policies
- Create `voice_notes` database table
- Add upload API endpoint (`POST /api/voice-notes`)
- Add playback URL endpoint (`GET /api/voice-notes/:id/play`)
- Decide cross-device playback strategy (store one format vs. transcode to MP4)
- Decide transcription flow for long notes (sync vs. background)

### Phase 2: Recording Component
- Create `VoiceNoteRecorder` component
- Integrate with existing voice utility code
- Extend `voiceRecording.service.ts` or use `voice.ts` directly to capture the audio Blob
- Handle iOS/Android format differences
- Add upload progress feedback

### Phase 3: Playback Component
- Create `VoiceNotePlayer` component
- Custom controls matching Inkprint design
- Playback speed control
- Transcript display

### Phase 4: Integration
- Create `VoiceNoteList` component
- Add voice notes to relevant features (projects, tasks, brain dumps)
- Add delete functionality

### Phase 5: Polish
- Waveform visualization during recording
- Audio waveform display during playback
- Background upload with offline queue
- Compression optimization

---

## Questions to Resolve

1. **Transcription**: Should voice notes be auto-transcribed on upload, or on-demand?
2. **Linking**: Which entities should support voice notes? (Projects, Tasks, Brain Dumps, standalone?)
3. **Sharing**: Will voice notes ever be shareable between users?
4. **Cross-device playback**: Is MP4 transcoding required for WebM recordings from desktop?
5. **Quotas**: Storage limits per user? (e.g., 1GB, 100 notes)
6. **Retention**: Auto-delete old notes? Soft delete with recovery period?

---

## References

### Recording & Storage
- [MediaRecorder API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
- [Supabase Storage Documentation](https://supabase.com/docs/guides/storage)
- [Web Audio API - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [Audio Element - MDN](https://developer.mozilla.org/en-US/docs/Web/HTML/Element/audio)

### Playback Speed
- [HTMLMediaElement.playbackRate - MDN](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/playbackRate)
- [HTMLMediaElement.preservesPitch - MDN](https://developer.mozilla.org/en-US/docs/Web/API/HTMLMediaElement/preservesPitch)
- [Web Audio playbackRate explained - MDN](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Audio_and_video_delivery/WebAudio_playbackRate_explained)
- [Pocket Casts Playback Effects](https://support.pocketcasts.com/knowledge-base/playback-effects/)
- [Podcast App Playback Speeds - Marco.org](https://marco.org/2013/10/18/podcast-app-playback-speeds)

### BuildOS Codebase
- Existing voice implementation: `/apps/web/src/lib/utils/voice.ts`
- Voice service: `/apps/web/src/lib/services/voiceRecording.service.ts`
- Transcription API: `/apps/web/src/routes/api/transcribe/+server.ts`
