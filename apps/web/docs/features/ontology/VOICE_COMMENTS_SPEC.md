<!-- apps/web/docs/features/ontology/VOICE_COMMENTS_SPEC.md -->

# Voice Transcription for Comments - Feature Specification

## Overview

Add voice transcription capability to the entity comments system, allowing users to record voice notes that are automatically transcribed and inserted at the cursor position within comment textareas.

**Status:** Draft Specification
**Author:** AI Assistant
**Date:** 2026-01-13
**Related Components:**

- `EntityCommentsSection.svelte`
- `EntityCommentThread.svelte`
- `TextareaWithVoice.svelte` (reference implementation)
- `RichMarkdownEditor.svelte` (reference implementation)

---

## Goals

1. **Frictionless voice input** - Allow users to quickly dictate comments without typing
2. **Cursor-aware insertion** - Insert transcribed text at the current cursor position
3. **Live transcript preview** - Show real-time transcription feedback during recording
4. **Voice note storage** - Optionally store audio recordings for reference
5. **Clean, minimal UI** - Maintain the compact comment design while adding voice functionality
6. **Accessibility** - Full keyboard and screen reader support

---

## User Experience

### Recording Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ Comment Textarea                                                │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ This is my comment text with cursor here|                   │ │
│ │                                                             │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ─────────────────────────────────────────────────────────────  │
│                                                                 │
│  [Status/Hint Area]                              [🎤] [Post]    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### State 1: Idle (Ready to Record)

```
┌─────────────────────────────────────────────────────────────────┐
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ Share an update or ask a question...                        │ │
│ │                                                             │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  Mentions: [[user:id|Name]]                      [🎤] [Post]    │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Voice button styling (Idle/Ready):**

- `border border-foreground/20 bg-card text-foreground`
- Hover: `border-foreground/40 bg-muted/50`
- Size: `h-7 w-7` (compact for comment footer)

### State 2: Recording Active

```
┌─────────────────────────────────────────────────────────────────┐
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ This is my comment text with cursor here|                   │ │
│ │                                                             │ │
│ │  ┌─────────────────────────────────────────────────────┐    │ │
│ │  │ 🟢 "I think we should move this to..."              │    │ │
│ │  └─────────────────────────────────────────────────────┘    │ │
│ │                                                             │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ● Listening 0:05 [Enter]                      [⏹️] [Post]     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Recording indicator styling:**

- Red pulsing dot with `animate-ping`
- Duration counter with `tabular-nums`
- Keyboard hint: `[Enter]` to stop

**Live transcript overlay:**

- Semi-transparent accent-colored badge
- Appears at bottom of textarea
- Shows real-time speech-to-text
- `border-accent/30 bg-accent/5 text-accent`

**Voice button styling (Recording):**

- `border-2 border-destructive bg-destructive text-destructive-foreground`
- Icon changes to `MicOff` (stop icon)

### State 3: Transcribing

```
┌─────────────────────────────────────────────────────────────────┐
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ This is my comment text with cursor here                    │ │
│ │ I think we should move this to the next phase|              │ │
│ └─────────────────────────────────────────────────────────────┘ │
│                                                                 │
│  ⟳ Transcribing...                              [⟳] [Post]     │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Transcribing indicator:**

- Loading spinner with accent color
- Button disabled during transcription

---

## Technical Architecture

### Component Hierarchy

```
EntityCommentsSection.svelte
├── CommentTextareaWithVoice.svelte  [NEW - wrapper component]
│   ├── Textarea.svelte               [existing]
│   ├── VoiceRecordingButton          [inline]
│   └── LiveTranscriptOverlay         [inline]
├── EntityCommentThread.svelte        [existing]
│   └── CommentTextareaWithVoice      [for edit/reply modes]
```

### Option A: Create New Wrapper Component (Recommended)

Create `CommentTextareaWithVoice.svelte` - a simplified version of `TextareaWithVoice.svelte` optimized for the compact comment use case.

**Pros:**

- Cleaner separation of concerns
- Can be optimized for comment-specific needs
- Easier to test in isolation

**Cons:**

- Some code duplication with `TextareaWithVoice.svelte`

### Option B: Extend TextareaWithVoice

Add props to `TextareaWithVoice.svelte` for compact mode.

**Pros:**

- No code duplication
- Single source of truth for voice textarea

**Cons:**

- Component becomes more complex
- May have unnecessary features for comments

### Recommendation

**Option A (New Component)** is preferred because:

1. Comments have unique layout requirements (footer with Post button)
2. Voice notes may not need persistent storage for comments
3. Simpler component = faster rendering in comment threads
4. Can evolve independently without affecting brain dump

---

## Component API Design

### CommentTextareaWithVoice.svelte

```typescript
interface Props {
	// Core textarea props
	value?: string; // Bindable comment text
	placeholder?: string;
	rows?: number;
	disabled?: boolean;
	size?: 'sm' | 'base'; // Comment size variants

	// Voice recording props
	enableVoice?: boolean; // Default: true
	voiceBlocked?: boolean; // Block during submission
	transcriptionEndpoint?: string; // Default: '/api/transcribe'
	vocabularyTerms?: string; // Custom vocabulary hints

	// Voice note storage (optional)
	voiceNoteSource?: string; // e.g., 'entity-comment'
	voiceNoteGroupId?: string | null; // For grouping recordings
	onVoiceNoteGroupReady?: (groupId: string) => void;
	onVoiceNoteSegmentSaved?: (voiceNote: VoiceNote) => void;
	onVoiceNoteSegmentError?: (error: string) => void;

	// Bindable state for parent
	isRecording?: boolean;
	isTranscribing?: boolean;
	voiceError?: string;
	recordingDuration?: number;

	// Snippets for customization
	actions?: Snippet; // Custom action buttons (e.g., Post)
	footer?: Snippet; // Custom footer content
}
```

### Usage in EntityCommentsSection.svelte

```svelte
<CommentTextareaWithVoice
	bind:value={newComment}
	placeholder="Share an update or ask a question..."
	size="sm"
	disabled={isSubmitting || !canWrite}
	voiceBlocked={isSubmitting}
	vocabularyTerms={projectName}
	voiceNoteSource="entity-comment"
>
	{#snippet actions()}
		<Button
			variant="primary"
			size="sm"
			class="pressable"
			onclick={() => submitComment(null)}
			disabled={isSubmitting || !newComment.trim() || !canWrite}
		>
			{#if isSubmitting}
				<LoaderCircle class="w-3 h-3 animate-spin" />
				Posting...
			{:else}
				Post
			{/if}
		</Button>
	{/snippet}
</CommentTextareaWithVoice>
```

---

## Visual Design Specifications

### Voice Button States

| State                | Icon                  | Colors                                                                   | Cursor      |
| -------------------- | --------------------- | ------------------------------------------------------------------------ | ----------- |
| Ready                | `Mic`                 | `border-foreground/20 bg-card text-foreground`                           | pointer     |
| Recording            | `MicOff`              | `border-2 border-destructive bg-destructive text-destructive-foreground` | pointer     |
| Loading/Transcribing | `LoaderCircle` (spin) | `border-border bg-muted/80 text-muted-foreground`                        | wait        |
| Prompt (enable mic)  | `Mic`                 | `border-2 border-accent bg-accent/10 text-accent`                        | pointer     |
| Muted/Disabled       | `MicOff`              | `border-border bg-muted/60 text-muted-foreground/40`                     | not-allowed |

### Button Sizing

```css
/* Compact for comment footer */
.voice-btn-compact {
	@apply h-7 w-7 rounded-full;
}

/* Icon size */
.voice-btn-compact svg {
	@apply h-3.5 w-3.5;
}
```

### Live Transcript Overlay

```css
.live-transcript-overlay {
	@apply pointer-events-none absolute bottom-2 left-2 right-2;
	@apply max-h-16 overflow-hidden;
	@apply rounded-lg border border-accent/30 bg-accent/5;
	@apply px-2.5 py-1.5 text-xs text-accent;
	@apply shadow-ink backdrop-blur-sm;
}

/* Dark mode */
.dark .live-transcript-overlay {
	@apply bg-accent/10;
}
```

### Recording Status Bar

```css
.recording-status {
	@apply flex items-center gap-1.5 text-destructive text-xs;
}

.recording-dot {
	@apply relative flex h-2 w-2;
}

.recording-dot-ping {
	@apply absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive/60;
}

.recording-dot-core {
	@apply relative inline-flex h-1.5 w-1.5 rounded-full bg-destructive;
}
```

---

## Implementation Plan

### Phase 1: Core Infrastructure

1. **Create CommentTextareaWithVoice.svelte**
    - Copy minimal voice logic from TextareaWithVoice.svelte
    - Implement cursor position tracking
    - Add transcription at cursor insertion
    - Include live transcript overlay

2. **Add voice button to footer**
    - Position next to Post button
    - Implement all visual states
    - Add keyboard shortcuts (Enter to stop)

### Phase 2: Integration

3. **Update EntityCommentsSection.svelte**
    - Replace Textarea with CommentTextareaWithVoice
    - Add vocabulary terms prop (project name)
    - Handle voice states during submission

4. **Update EntityCommentThread.svelte**
    - Replace Textarea in edit mode
    - Replace Textarea in reply mode
    - Pass appropriate props

### Phase 3: Polish & Voice Notes

5. **Voice note storage (optional)**
    - Create voice note group for comments
    - Upload audio segments
    - Link to comment metadata

6. **Testing & Accessibility**
    - Keyboard navigation
    - Screen reader announcements
    - Mobile touch targets
    - Cross-browser testing

---

## Keyboard Shortcuts

| Key     | Action         | Context                               |
| ------- | -------------- | ------------------------------------- |
| `Enter` | Stop recording | While recording                       |
| `Space` | Stop recording | While recording (if textarea focused) |
| `Enter` | Submit comment | When not recording, with text         |

---

## Accessibility Considerations

### ARIA Attributes

```html
<!-- Voice button -->
<button
	aria-label="{voiceButtonState.label}"
	aria-pressed="{isRecording"
	?
	true
	:
	undefined}
	aria-disabled="{voiceButtonState.disabled}"
>
	<!-- Live transcript -->
	<div role="status" aria-live="polite" aria-atomic="true">{liveTranscript}</div>

	<!-- Recording status -->
	<span role="status" aria-live="assertive"> Recording: {duration} seconds </span>
</button>
```

### Focus Management

- Voice button should be in tab order
- After recording stops, focus returns to textarea
- Clear visual focus indicators on all interactive elements

---

## Error Handling

### Error States

| Error                | Message                             | Recovery                        |
| -------------------- | ----------------------------------- | ------------------------------- |
| Microphone denied    | "Enable microphone to record voice" | Show prompt variant button      |
| No microphone        | "No microphone found"               | Disable voice button            |
| Transcription failed | "Transcription failed - try again"  | Use live transcript as fallback |
| Browser unsupported  | (hidden)                            | Voice button not rendered       |

### Error Display

```svelte
{#if voiceError}
	<span role="alert" class="text-destructive text-xs px-2 py-0.5 rounded bg-destructive/10">
		{voiceError}
	</span>
{/if}
```

---

## Mobile Considerations

### Touch Targets

- Voice button minimum size: 44x44px on mobile
- Use `touch-manipulation` for faster response
- Disable `-webkit-tap-highlight-color`

### Responsive Layout

```svelte
<!-- Mobile: Stack vertically -->
<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
	<!-- Status/hints -->
	<div class="order-2 sm:order-1">...</div>

	<!-- Action buttons -->
	<div class="order-1 sm:order-2 flex items-center gap-2">
		<VoiceButton class="h-10 w-10 sm:h-7 sm:w-7" />
		<PostButton />
	</div>
</div>
```

---

## Testing Strategy

### Unit Tests

- [ ] Voice button state machine transitions
- [ ] Cursor position tracking and insertion
- [ ] Duration formatting
- [ ] Error handling

### Integration Tests

- [ ] Recording flow in new comment
- [ ] Recording flow in reply
- [ ] Recording flow in edit mode
- [ ] Submission with voice content

### Manual Testing

- [ ] Chrome/Safari/Firefox desktop
- [ ] iOS Safari
- [ ] Android Chrome
- [ ] Screen reader (VoiceOver, NVDA)
- [ ] Keyboard-only navigation

---

## Future Enhancements

1. **Audio playback** - Allow users to listen to recorded voice notes
2. **Voice note attachments** - Attach audio file to comment
3. **Multi-language support** - Allow switching transcription language
4. **Voice commands** - "Stop recording", "Cancel"
5. **Noise cancellation** - Enhanced audio preprocessing

---

## Files to Create/Modify

### New Files

- `src/lib/components/ui/CommentTextareaWithVoice.svelte`

### Modified Files

- `src/lib/components/ontology/EntityCommentsSection.svelte`
- `src/lib/components/ontology/EntityCommentThread.svelte`

### Optional New Files (Phase 3)

- Database migration for comment voice notes metadata

---

## Dependencies

**Already in codebase:**

- `voiceRecordingService` - Voice recording singleton
- `liveTranscript` store - Real-time transcription
- `uploadVoiceNote` / `updateVoiceNote` - Voice note storage
- `/api/transcribe` endpoint - Server-side transcription

**No new dependencies required.**

---

## Estimated Effort

| Phase                        | Effort    | Priority |
| ---------------------------- | --------- | -------- |
| Phase 1: Core Infrastructure | 4-6 hours | P0       |
| Phase 2: Integration         | 2-3 hours | P0       |
| Phase 3: Voice Notes         | 2-4 hours | P1       |
| Testing & Polish             | 2-3 hours | P0       |

**Total: 10-16 hours**

---

## Success Criteria

1. ✅ Users can record voice and see it transcribed into comments
2. ✅ Transcription inserts at cursor position
3. ✅ Live transcript shows real-time feedback
4. ✅ All voice button states are visually distinct
5. ✅ Works in new comment, reply, and edit modes
6. ✅ Keyboard accessible (Enter to stop)
7. ✅ Mobile-friendly touch targets
8. ✅ No regressions in existing comment functionality
