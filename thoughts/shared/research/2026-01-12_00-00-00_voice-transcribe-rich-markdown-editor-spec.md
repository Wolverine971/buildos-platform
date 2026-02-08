---
title: Voice Transcription for RichMarkdownEditor - Technical Specification
created: 2026-01-12
status: draft
type: feature-spec
path: thoughts/shared/research/2026-01-12_00-00-00_voice-transcribe-rich-markdown-editor-spec.md
---

# Voice Transcription for RichMarkdownEditor

## Overview

Add voice recording and transcription capability to `RichMarkdownEditor.svelte`, allowing users to dictate text that gets inserted at the current cursor position. This follows the patterns established in `TextareaWithVoice.svelte` but adapted for the rich markdown editor context.

## User Stories

1. As a user writing markdown content, I want to dictate text via voice so I can capture thoughts faster
2. As a user, I want my voice transcription inserted at my cursor position so I can add content anywhere in my document
3. As a user, I want to see a live preview of what I'm saying while recording
4. As a user, I want my voice recordings saved so I can reference them later

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Mode behavior | Edit mode only | Button disabled in preview mode - user must switch to edit mode first |
| Audio storage | Full voice note storage | Store recordings with group management like TextareaWithVoice |
| Live preview | Footer status area | Show live transcript in footer during recording |
| UI placement | Footer row | Add mic button and status to existing footer stats area |
| Selection behavior | Replace selection | If text is selected when recording starts, transcription replaces the selection |

## Implementation Status

**Status: COMPLETED**

The voice transcription feature has been fully implemented in `RichMarkdownEditor.svelte`.

## Technical Architecture

### Component Changes

#### Modified Files
- `apps/web/src/lib/components/ui/RichMarkdownEditor.svelte`

#### Dependencies (Already in codebase)
- `$lib/services/voiceRecording.service` - Voice recording singleton
- `$lib/services/voice-note-groups.service` - Group management
- `$lib/services/voice-notes.service` - Upload/update voice notes
- `$lib/utils/voice` - Live transcript store
- `$lib/utils/haptic` - Haptic feedback
- `lucide-svelte` - Icons (Mic, MicOff, LoaderCircle)

### New Props

```typescript
interface Props extends Omit<HTMLTextareaAttributes, 'value'> {
  // ... existing props ...

  // Voice recording props
  enableVoice?: boolean;              // Default: true - Enable voice recording
  voiceBlocked?: boolean;             // Default: false - Temporarily block recording
  voiceBlockedLabel?: string;         // Default: 'Recording unavailable right now'
  transcriptionEndpoint?: string;     // Default: '/api/transcribe'
  vocabularyTerms?: string;           // Custom vocabulary for transcription

  // Voice note storage props
  voiceNoteSource?: string;           // Source identifier for voice notes
  voiceNoteGroupId?: string | null;   // Bindable - current voice note group
  onVoiceNoteGroupReady?: (groupId: string) => void;
  onVoiceNoteSegmentSaved?: (voiceNote: VoiceNote) => void;
  onVoiceNoteSegmentError?: (error: string) => void;

  // Bindable voice state (for parent component access)
  isRecording?: boolean;
  isTranscribing?: boolean;
  voiceError?: string;
  recordingDuration?: number;
}
```

### State Management

```typescript
// Internal voice state
let isVoiceSupported = $state(false);
let isCurrentlyRecording = $state(false);
let isInitializingRecording = $state(false);
let _isTranscribing = $state(false);
let _voiceError = $state('');
let _canUseLiveTranscript = $state(false);
let liveTranscriptPreview = $state('');
let _recordingDuration = $state(0);
let microphonePermissionGranted = $state(false);
let voiceInitialized = $state(false);

// Cursor position tracking - CRITICAL for insertion
let cursorPositionBeforeRecording = $state<number | null>(null);
```

### Key Implementation Details

#### 1. Cursor Position Capture

The critical difference from TextareaWithVoice is that transcribed text must be inserted at the cursor position, not appended:

```typescript
async function startVoiceRecording() {
  // ... validation checks ...

  // CRITICAL: Capture cursor position BEFORE recording starts
  if (textareaElement) {
    cursorPositionBeforeRecording = textareaElement.selectionStart ?? value.length;
  } else {
    cursorPositionBeforeRecording = value.length;
  }

  // Start recording...
}

function insertTranscriptionAtCursor(transcript: string) {
  const insertPos = cursorPositionBeforeRecording ?? value.length;

  // Determine spacing
  const needsSpaceBefore = insertPos > 0 && !value[insertPos - 1]?.match(/\s/);
  const needsSpaceAfter = insertPos < value.length && !value[insertPos]?.match(/\s/);

  const spacedTranscript =
    (needsSpaceBefore ? ' ' : '') +
    transcript.trim() +
    (needsSpaceAfter ? ' ' : '');

  // Insert at position
  const newValue = value.slice(0, insertPos) + spacedTranscript + value.slice(insertPos);
  setValue(newValue);

  // Update cursor position to end of inserted text
  const newCursorPos = insertPos + spacedTranscript.length;
  queueMicrotask(() => {
    textareaElement?.focus();
    textareaElement?.setSelectionRange(newCursorPos, newCursorPos);
  });

  // Reset cursor tracking
  cursorPositionBeforeRecording = null;
}
```

#### 2. Voice Recording Service Integration

```typescript
// Transcription service adapter - modified for cursor insertion
const transcriptionService: TranscriptionService = {
  async transcribeAudio(audioFile: File, vocabTerms?: string) {
    const startTime = performance.now();
    try {
      const result = await requestTranscription(audioFile, vocabTerms);

      // Queue update for voice note metadata
      queueTranscriptUpdate({
        transcript: result.transcript,
        transcriptionSource: 'audio',
        transcriptionStatus: 'complete',
        transcriptionModel: result.transcriptionModel,
        transcriptionService: result.transcriptionService,
        latencyMs: Math.round(performance.now() - startTime)
      });

      return result;
    } catch (error) {
      queueTranscriptUpdate({
        transcriptionSource: 'audio',
        transcriptionStatus: 'failed',
        transcriptionError: error instanceof Error ? error.message : 'Transcription failed'
      });
      throw error;
    }
  }
};

// Custom onTextUpdate callback that inserts at cursor
const voiceCallbacks: VoiceRecordingCallbacks = {
  onTextUpdate: (text: string) => {
    // The service appends to end - we need to intercept and insert at cursor
    // This is handled differently - see insertTranscriptionAtCursor
  },
  onError: (errorMessage: string) => {
    _voiceError = errorMessage;
    isCurrentlyRecording = false;
    isInitializingRecording = false;
  },
  onPhaseChange: (phase: 'idle' | 'transcribing') => {
    _isTranscribing = phase === 'transcribing';
  },
  onPermissionGranted: () => {
    microphonePermissionGranted = true;
    _voiceError = '';
  },
  onCapabilityUpdate: (update: { canUseLiveTranscript: boolean }) => {
    _canUseLiveTranscript = update.canUseLiveTranscript;
  },
  onAudioCaptured: handleAudioCaptured
};
```

#### 3. Mode-Aware UI

The mic button should be disabled in preview mode:

```typescript
const voiceButtonDisabled = $derived(
  disabled ||
  mode === 'preview' ||
  voiceBlocked ||
  !isVoiceSupported ||
  isInitializingRecording ||
  _isTranscribing
);
```

### UI Layout

#### Footer Layout (Updated)

```svelte
<!-- Footer stats row - MODIFIED -->
<div class="flex flex-wrap items-center justify-between gap-3 px-4 py-2 border-t border-border bg-muted/50 text-xs text-muted-foreground">
  <!-- Left side: Stats OR Recording Status -->
  <div class="flex items-center gap-4">
    {#if enableVoice && isCurrentlyRecording}
      <!-- Recording indicator -->
      <span class="flex items-center gap-1.5 text-destructive">
        <span class="relative flex h-2 w-2">
          <span class="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive/60"></span>
          <span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-destructive"></span>
        </span>
        <span class="font-semibold">Listening</span>
        <span class="font-bold tabular-nums">{formatDuration(_recordingDuration)}</span>
      </span>
    {:else if enableVoice && _isTranscribing}
      <!-- Transcribing indicator -->
      <span class="flex items-center gap-1.5 text-accent">
        <LoaderCircle class="h-3 w-3 animate-spin" />
        <span class="font-semibold">Transcribing...</span>
      </span>
    {:else}
      <!-- Normal stats -->
      <span>{stats.words} words</span>
      <span>{stats.chars} characters</span>
    {/if}
  </div>

  <!-- Middle: Live transcript preview (during recording) -->
  {#if enableVoice && isCurrentlyRecording && liveTranscriptPreview}
    <div class="flex-1 max-w-md truncate text-accent">
      <span class="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">Live:</span>
      {liveTranscriptPreview}
    </div>
  {/if}

  <!-- Right side: Character limit OR Voice button + Error -->
  <div class="flex items-center gap-2">
    {#if enableVoice && _voiceError}
      <span role="alert" class="max-w-[150px] truncate text-destructive text-xs">
        {_voiceError}
      </span>
    {/if}

    {#if enableVoice}
      <button
        type="button"
        class={voiceButtonClasses}
        onclick={toggleVoiceRecording}
        disabled={voiceButtonDisabled}
        aria-label={voiceButtonState.label}
        title={voiceButtonState.label}
      >
        {#if voiceButtonState.isLoading}
          <LoaderCircle class="h-4 w-4 animate-spin" />
        {:else}
          <svelte:component this={voiceButtonState.icon} class="h-4 w-4" />
        {/if}
      </button>
    {/if}

    {#if maxLength && !isCurrentlyRecording}
      <div class="flex items-center gap-2 text-[11px] uppercase tracking-wide">
        <span>Remaining: {Math.max(0, maxLength - stats.chars)}</span>
        <div class="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
          <div
            class="h-full bg-accent transition-all"
            style={`width: ${Math.min(100, Math.round((stats.chars / maxLength) * 100))}%`}
          ></div>
        </div>
      </div>
    {/if}
  </div>
</div>
```

### Voice Note Storage Integration

Following the pattern from TextareaWithVoice:

```typescript
// Voice note group management
let voiceNoteGroupId = $bindable<string | null>(null);
let groupStates = new Map<string, GroupState>();
let groupCreatePromises = new Map<string, Promise<string>>();
let lastTranscriptionTarget: { groupId: string; segmentIndex: number } | null = null;

type GroupState = {
  segmentIndex: number;
  segments: Map<number, SegmentState>;
};

type SegmentState = {
  voiceNoteId?: string;
  pendingTranscript?: PendingTranscriptUpdate;
};

function getOrCreateGroupId(): string {
  if (voiceNoteGroupId) return voiceNoteGroupId;
  const newGroupId = crypto.randomUUID();
  voiceNoteGroupId = newGroupId;
  onVoiceNoteGroupReady?.(newGroupId);
  startGroupCreation(newGroupId);
  return newGroupId;
}

function handleAudioCaptured(audio: Blob | null, meta: { durationSeconds: number }) {
  if (!audio || audio.size === 0) {
    onVoiceNoteSegmentError?.('No audio captured');
    return;
  }

  const groupId = getOrCreateGroupId();
  const groupState = getOrCreateGroupState(groupId);
  groupState.segmentIndex += 1;
  const segmentIndex = groupState.segmentIndex;

  lastTranscriptionTarget = { groupId, segmentIndex };

  // Upload voice segment
  enqueueUpload(() => uploadVoiceSegment({
    groupId,
    segmentIndex,
    audioBlob: audio,
    durationSeconds: meta.durationSeconds,
    recordedAt: new Date().toISOString(),
    transcript: capturedTranscript || undefined,
    transcriptionStatus: capturedTranscript ? 'complete' : 'pending',
    transcriptionSource: capturedTranscript ? 'live' : undefined
  }));
}
```

### Keyboard Shortcuts

```typescript
// Stop recording on Enter or Space when recording is active
function handleTextareaKeyDown(event: KeyboardEvent) {
  if (isCurrentlyRecording && (event.key === ' ' || event.key === 'Enter')) {
    event.preventDefault();
    event.stopPropagation();
    stopVoiceRecording();
  }
}

// Global keydown handler for stopping recording (works even when textarea not focused)
$effect(() => {
  if (browser && isCurrentlyRecording) {
    const handler = (event: KeyboardEvent) => {
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        stopVoiceRecording();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }
});
```

## Testing Plan

### Unit Tests
1. Cursor position capture on recording start
2. Text insertion at correct position
3. Voice button state machine (ready, recording, transcribing, error)
4. Mode awareness (disabled in preview mode)
5. Keyboard shortcuts for stop recording

### Integration Tests
1. Full recording → transcription → insertion flow
2. Voice note group creation and segment upload
3. Error handling and recovery
4. Multiple recording sessions in same editor instance

### Manual Testing Checklist
- [ ] Voice button appears in footer row
- [ ] Button disabled in preview mode
- [ ] Recording starts when clicking mic
- [ ] Live transcript appears in footer during recording
- [ ] Recording stops on Enter/Space
- [ ] Transcribed text inserts at cursor position
- [ ] Voice notes uploaded to storage
- [ ] Error states display correctly
- [ ] Works on mobile devices
- [ ] Dark mode styling correct
- [ ] Responsive layout works

## Implementation Steps

### Phase 1: Core Voice Integration
1. Add voice-related imports and props
2. Add voice state variables
3. Implement voice service initialization/cleanup
4. Add transcription service adapter

### Phase 2: Cursor Position Handling
1. Implement cursor position capture before recording
2. Create `insertTranscriptionAtCursor` function
3. Test insertion at various positions (start, middle, end)

### Phase 3: UI Integration
1. Modify footer layout to accommodate voice controls
2. Add mic button with proper Inkprint styling
3. Add recording status indicator
4. Add live transcript preview area
5. Add error display

### Phase 4: Voice Note Storage
1. Copy voice note group management from TextareaWithVoice
2. Implement `handleAudioCaptured` callback
3. Implement upload queue and segment management
4. Test voice note creation and updates

### Phase 5: Polish
1. Add keyboard shortcuts
2. Add haptic feedback for mobile
3. Implement mode awareness (disable in preview)
4. Add proper ARIA labels and accessibility
5. Test dark mode and responsive behavior

## Edge Cases

1. **Cursor at end of document** - Insert normally with space before if needed
2. **Cursor at start of document** - Insert with space after if needed
3. **Selection active** - Replace selection with transcription
4. **Empty document** - Insert without extra spacing
5. **Recording cancelled** - Reset cursor position, no insertion
6. **Transcription fails** - Show error, optionally use live transcript
7. **maxLength exceeded** - Truncate inserted text to fit limit
8. **Switch to preview during recording** - Stop recording first
9. **Component unmount during recording** - Cleanup properly

## Security Considerations

1. Transcription endpoint already exists and handles auth
2. Voice note storage uses existing RLS policies
3. No new attack vectors introduced

## Performance Considerations

1. Microphone pre-warming on mount (same as TextareaWithVoice)
2. Upload queue with concurrency limit (MAX_CONCURRENT_UPLOADS = 2)
3. Lazy initialization of voice service
4. Cleanup on unmount to prevent memory leaks
