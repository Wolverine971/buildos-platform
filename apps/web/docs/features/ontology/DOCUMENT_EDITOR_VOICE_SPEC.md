<!-- apps/web/docs/features/ontology/DOCUMENT_EDITOR_VOICE_SPEC.md -->

# Document Editor Voice Transcription Feature

## Overview

Add voice-to-text transcription capability to the DocumentEditor component, allowing users to dictate content directly into the rich text editor at their cursor position.

**Related Components:**

- `DocumentEditor.svelte` - Target component for this feature
- `TextareaWithVoice.svelte` - Reference implementation for voice UI patterns
- `voiceRecordingService.ts` - Shared voice recording service
- `voice.ts` - Low-level voice utilities (WebSpeech API, MediaRecorder)

## User Experience

### Recording Flow

1. User clicks floating mic FAB button in bottom-right of editor
2. Microphone permission is requested (if not already granted)
3. Recording begins - FAB turns red with pulse animation
4. Live transcript appears in floating overlay near FAB
5. User speaks, sees real-time preview of transcription
6. User clicks FAB again to stop recording
7. Final transcription is inserted at cursor position
8. FAB returns to ready state

### Visual States

| State        | FAB Appearance             | Overlay                 |
| ------------ | -------------------------- | ----------------------- |
| Ready        | Mic icon, subtle border    | Hidden                  |
| Recording    | MicOff icon, red bg, pulse | Shows live transcript   |
| Transcribing | Spinner, disabled          | Shows "Transcribing..." |
| Error        | Mic icon + error badge     | Error message briefly   |

## Technical Architecture

### Component Integration

```
DocumentEditor.svelte
├── Editor Header (title, save)
├── Toolbar (formatting)
├── Editor Content (TipTap)
│   └── [Cursor Position] ← Text inserts here
├── Voice FAB Button (NEW) ← Floating in bottom-right
│   └── Live Transcript Overlay (NEW)
└── Footer Stats Bar
```

### State Management

```typescript
// New state variables for DocumentEditor
let isRecording = $state(false);
let isInitializing = $state(false);
let isTranscribing = $state(false);
let voiceError = $state('');
let recordingDuration = $state(0);
let canUseLiveTranscript = $state(false);
let liveTranscriptPreview = $state('');
```

### Text Insertion Strategy

**Goal:** Insert transcribed text at current cursor position in TipTap editor.

```typescript
// TipTap provides cursor-aware insertion
function insertTranscription(text: string) {
	if (!editor) return;

	// Insert content at current cursor position
	editor.chain().focus().insertContent(text).run();
}
```

**Edge Cases:**

- Empty editor: Insert at start
- No focus: Focus editor, insert at end
- Selection active: Replace selection with transcription
- Cursor in middle of word: Insert between characters

### Voice Recording Integration

Reuse existing `voiceRecordingService` with custom callbacks:

```typescript
import {
	voiceRecordingService,
	type TranscriptionService
} from '$lib/services/voiceRecording.service';
import { liveTranscript } from '$lib/utils/voice';

// Initialize on component mount
voiceRecordingService.initialize(
	{
		onTextUpdate: (text: string) => {
			// Don't use this callback - we handle insertion ourselves
			// This is designed for textarea replacement, not cursor insertion
		},
		onError: (errorMessage: string) => {
			voiceError = errorMessage;
			isRecording = false;
			isInitializing = false;
		},
		onPhaseChange: (phase: 'idle' | 'transcribing') => {
			isTranscribing = phase === 'transcribing';
		},
		onPermissionGranted: () => {
			voiceError = '';
		},
		onCapabilityUpdate: (update: { canUseLiveTranscript: boolean }) => {
			canUseLiveTranscript = update.canUseLiveTranscript;
		}
	},
	customTranscriptionService
);
```

### Custom Transcription Handler

Since we need cursor-position insertion (not replacement like TextareaWithVoice), we need a custom transcription service:

```typescript
const transcriptionService: TranscriptionService = {
	async transcribeAudio(audioFile: File, vocabTerms?: string) {
		const formData = new FormData();
		formData.append('audio', audioFile);
		if (vocabTerms) formData.append('vocabularyTerms', vocabTerms);

		const response = await fetch('/api/transcribe', {
			method: 'POST',
			body: formData
		});

		if (!response.ok) {
			throw new Error('Transcription failed');
		}

		const result = await response.json();
		const transcript = result?.data?.transcript || result?.transcript;

		if (!transcript) {
			throw new Error('No transcript returned');
		}

		// Insert at cursor instead of replacing
		insertTranscriptionAtCursor(transcript);

		return {
			transcript,
			transcriptionModel: result?.data?.transcription_model,
			transcriptionService: result?.data?.transcription_service
		};
	}
};
```

## UI Components

### Floating Action Button (FAB)

Position: Absolute, bottom-right of editor content area

```svelte
<!-- Voice Recording FAB -->
<div class="absolute bottom-4 right-4 z-20">
	<button
		type="button"
		onclick={toggleVoiceRecording}
		class={voiceButtonClasses}
		disabled={voiceButtonState.disabled}
		aria-label={voiceButtonState.label}
		aria-pressed={isRecording}
	>
		{#if voiceButtonState.isLoading}
			<LoaderCircle class="w-5 h-5 animate-spin" />
		{:else}
			<svelte:component this={voiceButtonState.icon} class="w-5 h-5" />
		{/if}
	</button>
</div>
```

**Styling (Inkprint Design System):**

```css
/* Ready state */
.voice-fab-ready {
	@apply h-12 w-12 rounded-full
           border border-foreground/20 bg-card text-foreground
           shadow-ink pressable
           hover:border-foreground/40 hover:bg-muted/50
           focus:outline-none focus-visible:ring-2 focus-visible:ring-ring;
}

/* Recording state */
.voice-fab-recording {
	@apply h-12 w-12 rounded-full
           border-2 border-destructive bg-destructive text-destructive-foreground
           shadow-ink-strong pressable
           hover:bg-destructive/90;
}

/* Loading/Transcribing state */
.voice-fab-loading {
	@apply h-12 w-12 rounded-full
           border border-border bg-muted/80 text-muted-foreground
           shadow-ink cursor-wait;
}
```

### Live Transcript Overlay

Position: Above the FAB, anchored to bottom-right

```svelte
{#if isRecording && liveTranscriptPreview && canUseLiveTranscript}
	<div class="absolute bottom-20 right-4 z-20 max-w-[280px] sm:max-w-[320px]" aria-live="polite">
		<div
			class="rounded-lg border border-accent/30 bg-accent/5 px-3 py-2
                    text-sm text-accent shadow-ink backdrop-blur-sm
                    dark:bg-accent/10 tx tx-bloom tx-weak"
		>
			<div class="flex items-center gap-2 mb-1">
				<span class="relative flex h-2 w-2">
					<span
						class="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent/60"
					></span>
					<span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent"></span>
				</span>
				<span class="text-xs font-medium text-accent">Live Preview</span>
			</div>
			<p class="m-0 line-clamp-4 whitespace-pre-wrap leading-snug text-foreground">
				{liveTranscriptPreview}
			</p>
		</div>
	</div>
{/if}
```

### Recording Status in Footer

Add recording duration indicator to existing footer:

```svelte
<!-- In footer stats bar, after word count -->
{#if isRecording}
	<span class="flex items-center gap-1.5 text-destructive">
		<span class="relative flex h-2 w-2 items-center justify-center">
			<span
				class="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive/60"
			></span>
			<span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-destructive"></span>
		</span>
		<span class="text-xs font-semibold">{formatDuration(recordingDuration)}</span>
	</span>
{:else if isTranscribing}
	<span class="flex items-center gap-1.5 text-accent">
		<LoaderCircle class="w-3 h-3 animate-spin" />
		<span class="text-xs font-semibold">Transcribing...</span>
	</span>
{/if}
```

## Implementation Steps

### Phase 1: Core Voice Integration

1. Add voice state variables to DocumentEditor
2. Initialize voiceRecordingService on mount
3. Add cleanup on destroy
4. Implement custom transcription handler for cursor insertion

### Phase 2: FAB Button

1. Add FAB button markup with proper positioning
2. Implement voice button state machine (ready, recording, loading, error)
3. Add proper styling following Inkprint design system
4. Add keyboard support (Escape to cancel recording)

### Phase 3: Live Transcript Overlay

1. Subscribe to liveTranscript store
2. Add floating overlay component
3. Add recording duration tracking
4. Add pulse animation for recording indicator

### Phase 4: Footer Integration

1. Add recording status to footer bar
2. Show duration while recording
3. Show "Transcribing..." state

### Phase 5: Edge Cases & Polish

1. Handle cursor position edge cases
2. Add error states and recovery
3. Add haptic feedback for mobile
4. Test on mobile devices
5. Add keyboard shortcuts (optional)

## Accessibility

- FAB has `aria-label` and `aria-pressed` attributes
- Live transcript overlay has `aria-live="polite"` for screen readers
- Recording status announced via `aria-live` region
- Keyboard accessible: Enter/Space to toggle recording, Escape to cancel
- Focus management: Return focus to editor after transcription

## Mobile Considerations

- FAB touch target: 48x48px minimum (we use h-12 w-12 = 48px)
- Overlay positioned to not overlap system UI
- Touch-friendly press states with `pressable` class
- `-webkit-tap-highlight-color: transparent` for clean feedback
- Haptic feedback on toggle (using existing `haptic` utility)

## Error Handling

| Error                | User Message                | Recovery                                  |
| -------------------- | --------------------------- | ----------------------------------------- |
| Permission denied    | "Microphone access needed"  | Show settings prompt                      |
| No microphone        | "No microphone found"       | Display error in overlay                  |
| Transcription failed | "Couldn't transcribe audio" | Fall back to live transcript if available |
| Network error        | "Connection issue"          | Allow retry                               |

## Testing Checklist

- [ ] Voice recording starts/stops correctly
- [ ] Transcription inserts at cursor position
- [ ] Live transcript preview displays correctly
- [ ] FAB states (ready/recording/loading) are correct
- [ ] Recording can be cancelled with Escape
- [ ] Error states display and recover properly
- [ ] Mobile: Touch targets are adequate
- [ ] Mobile: Overlay doesn't interfere with keyboard
- [ ] Accessibility: Screen reader announces states
- [ ] Dark mode styling is correct
- [ ] Multiple recordings work consecutively
- [ ] Editor focus is maintained/restored appropriately

## File Changes Required

| File                    | Change                                        |
| ----------------------- | --------------------------------------------- |
| `DocumentEditor.svelte` | Add voice recording integration, FAB, overlay |
| No new files needed     | Reuses existing voice infrastructure          |

## Dependencies

All dependencies are already in the project:

- `voiceRecordingService` - Voice recording logic
- `liveTranscript` store - Real-time transcription preview
- `/api/transcribe` endpoint - Server-side transcription
- `lucide-svelte` - Icons (Mic, MicOff, LoaderCircle)
- `haptic` utility - Mobile haptic feedback

## Out of Scope

- Voice commands for formatting (e.g., "bold", "new paragraph")
- Multiple language support (defaults to en-US)
- Voice note saving/history (unlike TextareaWithVoice)
- Custom vocabulary terms per document

---

## Implementation Notes

### Completed: 2026-01-12

All phases have been implemented in `DocumentEditor.svelte`:

#### What Was Implemented

1. **Voice State Variables** (lines 94-106)
    - `isVoiceSupported`, `isRecording`, `isInitializingRecording`, `isTranscribing`
    - `voiceError`, `recordingDuration`, `canUseLiveTranscript`, `liveTranscriptPreview`
    - Subscription cleanup variables for duration and transcript stores

2. **Voice Button State Machine** (lines 119-177)
    - `VoiceButtonState` type with icon, label, disabled, isLoading, variant
    - `voiceButtonState` derived state handles: ready, recording, loading, muted
    - `voiceButtonClasses` derived state for Inkprint styling per state

3. **Custom Transcription Service** (lines 197-241)
    - Calls `/api/transcribe` endpoint with FormData
    - Parses response and extracts transcript
    - Calls `insertTranscriptionAtCursor()` instead of replacing textarea content

4. **Cursor-Position Insertion** (lines 243-260)
    - `insertTranscriptionAtCursor()` uses TipTap's chain API
    - Checks character before cursor to add space if needed
    - Sets `isDirty = true` to enable save button

5. **Voice Initialization** (lines 262-318)
    - Pre-warms microphone for faster recording start
    - Subscribes to duration and liveTranscript stores
    - Custom callbacks that don't use `onTextUpdate` (we handle insertion ourselves)

6. **Recording Functions** (lines 320-381)
    - `startVoiceRecording()` - handles initialization state
    - `stopVoiceRecording()` - cleans up and resets state
    - `toggleVoiceRecording()` - with haptic feedback for mobile

7. **Keyboard Handler** (lines 409-425)
    - `handleGlobalKeyDown()` listens for Escape to stop recording
    - `$effect` adds/removes listener based on `isRecording` state

8. **UI Components**
    - **FAB Button** (lines 1069-1097): Floating in bottom-right of editor content
    - **Live Transcript Overlay** (lines 1040-1067): Above FAB with pulse indicator
    - **Error Toast** (lines 1099-1112): Shows voice errors
    - **Footer Status** (lines 1120-1141): Recording duration and transcribing indicator

#### Key Decisions

- **No `onTextUpdate` callback usage**: Unlike TextareaWithVoice, we don't use the service's text update callback because we need cursor-position insertion, not replacement
- **Custom transcription service**: Intercepts the transcription result to call our cursor-aware insertion function
- **Escape key only**: Simplified keyboard handler (just Escape to stop), no Enter/Space since those are needed for editor input
- **Microphone pre-warming**: Reduces latency when user clicks record

#### Testing Notes

- Test with various cursor positions (start, middle, end of text)
- Test with active selection (should replace selection)
- Test on mobile with touch interactions
- Verify haptic feedback works on iOS/Android
- Check dark mode styling matches Inkprint design system
