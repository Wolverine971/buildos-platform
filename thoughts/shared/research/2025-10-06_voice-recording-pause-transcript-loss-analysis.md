---
title: "Voice Recording Pause Transcript Loss Analysis"
date: 2025-10-06
status: complete
type: bug-analysis
tags: [voice-recording, speech-recognition, transcript-loss, webkit-speech-api]
related:
  - apps/web/src/lib/utils/voice.ts
  - apps/web/src/lib/services/voiceRecording.service.ts
  - apps/web/src/lib/components/brain-dump/BrainDumpModal.svelte
---

# Voice Recording Pause Transcript Loss Analysis

## Problem Statement

Users report that when they pause while speaking during voice recording, previously spoken content is sometimes lost. Only the speech after the last pause is retained.

**User Experience**:

- User speaks: "I need to create a project"
- User pauses (silence)
- User continues: "and add some tasks"
- Result: Only "and add some tasks" is kept, "I need to create a project" is lost

## Root Cause Analysis

### The Critical Bug

**Location**: `/Users/annawayne/buildos-platform/apps/web/src/lib/utils/voice.ts:118-134`

The `onresult` event handler for SpeechRecognition **ONLY processes results from the current recognition session** and does not preserve results from previous sessions.

```typescript
recognition.onresult = (event: SpeechRecognitionEvent) => {
  let finalText = "";
  let interimText = "";

  // Process only new results for better performance
  for (let i = event.resultIndex; i < event.results.length; i++) {
    const transcript = event.results[i][0].transcript;
    if (event.results[i].isFinal) {
      finalText += transcript + " ";
    } else {
      interimText += transcript;
    }
  }

  const combinedText = (finalText + interimText).trim();
  liveTranscript.set(combinedText); // ⚠️ OVERWRITES previous content
};
```

### The Auto-Restart Problem

**Location**: `/Users/annawayne/buildos-platform/apps/web/src/lib/utils/voice.ts:142-150`

When SpeechRecognition detects silence or reaches its internal timeout, it fires the `onend` event and auto-restarts:

```typescript
recognition.onend = () => {
  // Auto-restart if still recording (improves reliability)
  if (get(isRecording) && recognition) {
    try {
      recognition.start();
    } catch (error) {
      console.warn("[SpeechRecognition] Failed to restart:", error);
    }
  }
};
```

**The Problem**: When recognition restarts, it creates a **NEW recognition session**. The `event.results` array in the new session only contains results from AFTER the restart, not before.

### Why Transcript Loss Occurs

1. **User speaks**: "I need to create a project"
2. **SpeechRecognition**: Processes and sets `liveTranscript.set("I need to create a project")`
3. **User pauses**: Silence detected
4. **SpeechRecognition**: `onend` fires, recognition restarts
5. **User continues**: "and add some tasks"
6. **NEW Recognition Session**: `event.results` ONLY contains "and add some tasks"
7. **Bug**: `liveTranscript.set("and add some tasks")` **OVERWRITES** the previous text
8. **Result**: First part of speech is lost

### The Misconception

The comment says "Process only new results for better performance" but this is **INCORRECT**. The `event.resultIndex` only helps skip already-processed results **within the same recognition session**, NOT across sessions after a restart.

## Impact Analysis

### What Gets Lost

- **Any speech before a pause**: If the user pauses mid-sentence or between thoughts
- **Multi-sentence recordings**: Each silence-triggered restart loses previous content
- **Long recordings**: More pauses = more transcript loss
- **Natural speech patterns**: People naturally pause while thinking

### What Still Works

- **Single continuous speech**: If no pauses long enough to trigger restart
- **Short utterances**: Brief recordings without pauses
- **Audio recording**: The MediaRecorder captures the full audio (but live transcript is lost)

### Current Workarounds in Code

The system has a fallback mechanism in `voiceRecording.service.ts:154-159`:

```typescript
const shouldTranscribeAudio =
  audioBlob &&
  audioBlob.size > 1000 && // Minimum size to avoid empty recordings
  (!this.isLiveTranscriptSupported() || // iOS doesn't support live transcription
    !capturedLiveTranscript || // No live transcription captured
    capturedLiveTranscript.length < 10); // Very short live transcription
```

**This helps iOS users** (who don't have live transcription) but doesn't solve the problem for desktop Chrome/Safari users who rely on live transcription.

## Technical Details

### SpeechRecognition Event Flow

**Normal Flow (No Pause)**:

```
start() → onstart → onaudiostart → onsoundstart → onspeechstart
         → onresult (interim) → onresult (interim) → onresult (final)
         → onspeechend → onsoundend → onaudioend → onend
```

**With Auto-Restart (Pause)**:

```
start() → onstart → onresult (final: "part 1") → onend
         → start() → onstart → onresult (final: "part 2") → onend
                                          ↑
                                    ONLY has "part 2"
```

### The event.results Array

According to Web Speech API spec:

- `event.results` is a **SpeechRecognitionResultList** containing results from the **CURRENT session**
- `event.resultIndex` is the index where new results start (to avoid reprocessing)
- When recognition restarts, you get a **NEW** `event.results` array that **DOES NOT** include previous session results

### Browser Behavior

- **Chrome**: Restarts after ~5-10 seconds of silence
- **Safari**: Restarts after ~3-5 seconds of silence
- **Edge**: Similar to Chrome
- **Firefox**: Does not support Web Speech API

## The Unused Variable: `finalTranscriptSinceLastStop`

**Location**: `/Users/annawayne/buildos-platform/apps/web/src/lib/services/voiceRecording.service.ts:40`

```typescript
private finalTranscriptSinceLastStop: string = '';
```

This variable was **designed to accumulate transcript across restarts** but is:

- ✅ Initialized in `startRecording()` (line 111)
- ❌ **NEVER UPDATED** during recording
- ✅ Reset in `stopRecording()` (line 178)

**This is the smoking gun** - the infrastructure for transcript accumulation exists but is not connected to the `onresult` handler.

## Solution Requirements

To fix this bug, we need to:

1. **Accumulate final results across restarts**: Store final transcripts in a persistent variable
2. **Preserve previous content**: Don't overwrite `liveTranscript` with only current session results
3. **Distinguish final vs interim**: Final results should be accumulated, interim should be temporary
4. **Handle text updates correctly**: Ensure accumulated text flows back to the UI

## Proposed Fix

### Option 1: Use `finalTranscriptSinceLastStop` (Recommended)

Modify `/Users/annawayne/buildos-platform/apps/web/src/lib/utils/voice.ts`:

```typescript
// Add module-level accumulator
let accumulatedFinalTranscript = "";

// In initializeSpeechRecognition():
recognition.onresult = (event: SpeechRecognitionEvent) => {
  let newFinalText = "";
  let interimText = "";

  // Process only new results for better performance
  for (let i = event.resultIndex; i < event.results.length; i++) {
    const transcript = event.results[i][0].transcript;
    if (event.results[i].isFinal) {
      newFinalText += transcript + " ";
    } else {
      interimText += transcript;
    }
  }

  // Accumulate final results
  if (newFinalText) {
    accumulatedFinalTranscript += newFinalText;
  }

  // Combine accumulated final + current interim
  const combinedText = (accumulatedFinalTranscript + interimText).trim();
  liveTranscript.set(combinedText);
};

// Reset accumulator when starting recording
export async function startRecording(): Promise<void> {
  // ... existing code ...

  // Reset accumulator
  accumulatedFinalTranscript = "";
  liveTranscript.set("");

  // ... rest of function ...
}

// Clear accumulator when stopping
export function stopRecording(): Promise<Blob | null> {
  return new Promise((resolve) => {
    // ... existing code ...

    // In cleanupResources() or onstop:
    accumulatedFinalTranscript = "";

    // ... rest of function ...
  });
}
```

### Option 2: Use Service-Level Accumulator

Keep accumulation in `voiceRecording.service.ts` and update the service's `liveTranscript` subscription:

```typescript
// In voiceRecording.service.ts
this.liveTranscriptUnsubscribe = liveTranscript.subscribe((transcript) => {
  // Check if this is a final result (ends with period, question mark, etc.)
  // or accumulate differently
  if (transcript && !this.currentLiveTranscript.endsWith(transcript)) {
    this.finalTranscriptSinceLastStop += transcript + " ";
  }
  this.currentLiveTranscript = this.finalTranscriptSinceLastStop + transcript;
});
```

**Verdict**: Option 1 is cleaner because it fixes the bug at the source (voice.ts) rather than trying to work around it in the service layer.

## Testing Strategy

### Manual Testing Scenarios

1. **Pause Mid-Sentence**:
   - Speak: "I need to create a new project"
   - Pause for 5 seconds
   - Speak: "with several tasks"
   - **Expected**: "I need to create a new project with several tasks"

2. **Multiple Pauses**:
   - Speak: "First part"
   - Pause 5 seconds
   - Speak: "Second part"
   - Pause 5 seconds
   - Speak: "Third part"
   - **Expected**: "First part Second part Third part"

3. **Long Recording**:
   - Speak continuously for 30 seconds with natural pauses
   - **Expected**: All speech captured, no loss

4. **Very Short Pause**:
   - Speak: "Quick pause" (pause 1 second) "continue"
   - **Expected**: "Quick pause continue" (no restart triggered)

### Automated Testing

Add test to verify transcript accumulation:

```typescript
// voice.test.ts
describe("SpeechRecognition transcript accumulation", () => {
  it("should accumulate transcripts across auto-restarts", async () => {
    // Mock SpeechRecognition with auto-restart
    // Simulate first session: "part one"
    // Simulate restart
    // Simulate second session: "part two"
    // Assert final transcript: "part one part two"
  });
});
```

## Files to Modify

1. **Primary Fix**:
   - `/Users/annawayne/buildos-platform/apps/web/src/lib/utils/voice.ts`
     - Lines 118-134: Update `onresult` handler
     - Lines 215-217: Reset accumulator in `startRecording()`
     - Lines 189: Reset accumulator in `cleanupResources()`

2. **Optional Cleanup**:
   - `/Users/annawayne/buildos-platform/apps/web/src/lib/services/voiceRecording.service.ts`
     - Line 40: Either use `finalTranscriptSinceLastStop` or remove it
     - Lines 66-68: Update subscription logic if needed

3. **Documentation**:
   - Add comments explaining the accumulation logic
   - Document the auto-restart behavior

## Related Issues

- **iOS Users**: Already use audio transcription fallback (works correctly)
- **Desktop Chrome/Safari**: Affected by this bug
- **Rate Limiting**: Not related to this issue (handled by `stopRecording`)
- **Transcript Duplication**: Separate issue (handled by similarity check in service)

## Performance Considerations

### Memory Impact

- Minimal: Only stores accumulated string during active recording
- Automatically cleared on stop/cleanup

### Processing Impact

- Negligible: Simple string concatenation
- No change to event processing frequency

### User Experience

- **Before**: Frustrating loss of content, unpredictable behavior
- **After**: Reliable capture of full speech, better UX

## Edge Cases

1. **Very Long Recording (10+ minutes)**:
   - Accumulated string could get large
   - Consider max length limit or warning

2. **Rapid Start/Stop**:
   - Ensure accumulator is properly reset
   - Test cleanup in various scenarios

3. **Browser Differences**:
   - Chrome vs Safari restart timing differs
   - Test on multiple browsers

4. **Network Issues**:
   - Not applicable (Web Speech API is local)

## Conclusion

The bug is a **simple but critical oversight** in the `onresult` handler:

- ❌ Current code: `liveTranscript.set(combinedText)` overwrites previous content
- ✅ Fixed code: Accumulate final results, then append interim results

The fix is straightforward and low-risk:

1. Add accumulator variable
2. Append final results to accumulator
3. Combine accumulator + interim for display
4. Reset accumulator on start/stop

**Estimated Effort**: 30 minutes to implement, 30 minutes to test
**Risk**: Low (isolated to voice recording, doesn't affect other features)
**Impact**: High (fixes critical UX bug affecting all desktop voice users)

## Implementation Priority

**HIGH PRIORITY** - This affects core functionality and user trust. Users expect voice recording to work reliably, and losing content mid-recording is a show-stopping bug.
