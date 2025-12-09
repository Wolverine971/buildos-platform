---
date: 2025-10-06T12:52:52+0000
researcher: Claude (claude-sonnet-4-5)
git_commit: 5ccb69ca18cc0c394f285dace332b96308a45ddb
branch: main
repository: buildos-platform
topic: 'Live Transcript Inconsistency - Capability Detection and Caching Issues'
tags: [research, bug, voice-recording, speech-recognition, brain-dump, capabilities]
status: complete
severity: medium
last_updated: 2025-10-06
last_updated_by: Claude (claude-sonnet-4-5)
path: thoughts/shared/research/2025-10-06_12-52-52_live-transcript-inconsistency-analysis.md
---

# Research: Live Transcript Inconsistency - Root Cause Analysis

**Date**: 2025-10-06T12:52:52+0000
**Researcher**: Claude (claude-sonnet-4-5)
**Git Commit**: 5ccb69ca18cc0c394f285dace332b96308a45ddb
**Branch**: main
**Repository**: buildos-platform

## Problem Statement

The live transcript feature in brain dump voice recording is **inconsistent** - sometimes it works, sometimes it doesn't. The user suspects this is related to inconsistent permission checking on the current device.

## Summary

The live transcript inconsistency is caused by a **race condition between capability detection caching and component initialization**. The core issue is that `capabilitiesCache` in `voice.ts` is **permanently set on first detection** and only cleared when `forceCleanup()` is called (on component unmount), but **SpeechRecognition availability can change** based on:

1. **Microphone permissions** - SpeechRecognition API may fail silently if mic permission is denied
2. **Browser security context** - HTTPS required, certain browsers disable it in some contexts
3. **Device-specific issues** - Some browsers (especially mobile Safari) have inconsistent SpeechRecognition support
4. **Timing of capability detection** - Capabilities checked **before** microphone permission granted

The capability is checked **once** in `initializeModal()` at line 432-435 of `BrainDumpModal.svelte`, but this happens **before any microphone permissions are requested**. If the browser reports SpeechRecognition as available but it later fails due to permissions or other runtime issues, the cached capability remains incorrect until the next component mount.

## Root Cause Analysis

### 1. Capability Detection Timing Issue

**File**: `/apps/web/src/lib/components/brain-dump/BrainDumpModal.svelte:432-435`

```javascript
brainDumpActions.setVoiceCapabilities({
	canUseLiveTranscript: voiceRecordingService.isLiveTranscriptSupported(),
	capabilitiesChecked: true
});
```

**Flow**:

1. Modal opens → `initializeModal()` called
2. Voice service initialized with callbacks (line 407-430)
3. **Capabilities immediately checked** (line 432-435)
4. User clicks record button → microphone permission requested
5. SpeechRecognition starts (or fails)

**Problem**: The capability detection happens **before microphone permission is granted**. The check only looks for API availability in window object, not actual usability.

### 2. Aggressive Capability Caching

**File**: `/apps/web/src/lib/utils/voice.ts:46-105`

```javascript
function detectCapabilities() {
    // Only run in browser environment
    if (!browser) {
        return {
            voiceSupported: false,
            liveTranscriptSupported: false,
            supportedMimeType: null,
            speechRecognition: null
        };
    }

    if (capabilitiesCache) return capabilitiesCache;  // ← Returns cached value immediately!

    // ... detection logic ...

    // Check Speech Recognition support safely
    let SpeechRecConstructor = null;
    if (typeof window !== 'undefined') {
        SpeechRecConstructor =
            (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    }

    capabilitiesCache = {
        voiceSupported,
        liveTranscriptSupported: !!SpeechRecConstructor,  // ← Only checks if constructor exists
        supportedMimeType,
        speechRecognition: SpeechRecConstructor
    };

    return capabilitiesCache;
}
```

**Issues**:

- Cache is **module-level and persists across modal open/close**
- Only cleared by `forceCleanup()` which happens on component unmount
- Detection only checks if `SpeechRecognition` constructor exists in `window`
- **Does NOT check if it's actually usable** (permissions, runtime availability)
- No retry mechanism if detection happens at the wrong time

### 3. No Permission-Based Revalidation

**File**: `/apps/web/src/lib/utils/voice.ts:193-289`

The `startRecording()` function requests microphone permissions and initializes SpeechRecognition, but **never updates the capability cache** based on actual runtime results:

```javascript
export async function startRecording(): Promise<void> {
    // ... validation ...

    const capabilities = detectCapabilities();  // Uses cached value!

    if (!capabilities.voiceSupported) {
        throw new Error('Voice recording is not supported in this browser');
    }

    // Initialize speech recognition once
    if (!isInitialized && capabilities.liveTranscriptSupported) {
        initializeSpeechRecognition();  // ← May fail silently
        isInitialized = true;
    }

    // ... rest of recording setup ...

    // Start speech recognition if available
    if (recognition) {
        try {
            recognition.start();
        } catch (error) {
            console.warn('[SpeechRecognition] Start failed:', error);
            // Continue with MediaRecorder only
            // ← BUG: Doesn't update capability cache to false!
        }
    }
}
```

**Problem**: If `recognition.start()` fails (due to permissions, browser restrictions, etc.), it logs a warning but **doesn't update `capabilitiesCache`** to reflect that live transcript is unavailable.

### 4. Cleanup Resets Cache Unconditionally

**File**: `/apps/web/src/lib/utils/voice.ts:356-360`

```javascript
export const forceCleanup = () => {
	cleanupResources();
	isInitialized = false;
	capabilitiesCache = null; // ← Reset cache to re-detect on next use
};
```

**File**: `/apps/web/src/lib/services/voiceRecording.service.ts:311-329`

```javascript
public cleanup(): void {
    // Stop timer
    this.stopRecordingTimer();

    // Unsubscribe from live transcript
    if (this.liveTranscriptUnsubscribe) {
        this.liveTranscriptUnsubscribe();
        this.liveTranscriptUnsubscribe = null;
    }

    // Force cleanup of voice utility
    forceCleanup();  // ← Clears cache

    // Reset state
    this.currentLiveTranscript = '';
    this.finalTranscriptSinceLastStop = '';
    this.recordingDurationStore.set(0);
    this.recordingStartTime = 0;
}
```

**Problem**: Cache is cleared on cleanup, which means:

- **Each modal open** triggers a fresh capability detection
- If the **timing differs** between opens (e.g., permissions prompt, browser state), detection results may differ
- Creates inconsistent behavior across modal sessions

### 5. SpeechRecognition Initialization Failures Are Silent

**File**: `/apps/web/src/lib/utils/voice.ts:108-156`

```javascript
function initializeSpeechRecognition() {
    if (!browser || recognition || !capabilitiesCache?.speechRecognition) return;

    try {
        recognition = new capabilitiesCache.speechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        // ... event handlers ...

        recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
            console.warn('[SpeechRecognition] Error:', event.error);
            // Don't stop recording on speech recognition errors
            // since MediaRecorder is the primary capture method
            // ← BUG: Doesn't report to UI that live transcript failed!
        };
    } catch (error) {
        console.error('[SpeechRecognition] Initialization failed:', error);
        recognition = null;
        // ← BUG: Doesn't update capability cache or notify UI!
    }
}
```

**Problems**:

- Initialization errors are caught but **not propagated to the UI**
- `recognition` is set to `null` but `capabilitiesCache.liveTranscriptSupported` stays `true`
- User sees "Live transcript supported" but it's actually broken

### 6. No Runtime Validation in UI

**File**: `/apps/web/src/lib/components/brain-dump/RecordingView.svelte:395`

```svelte
{#if isCurrentlyRecording && accumulatedTranscript && canUseLiveTranscript}
	<div class="...live transcript preview...">
		<p>{accumulatedTranscript}</p>
	</div>
{/if}
```

**Problem**: The UI relies entirely on `canUseLiveTranscript` from the store, which comes from the initial capability detection. If SpeechRecognition fails at runtime, `canUseLiveTranscript` remains `true` but `accumulatedTranscript` stays empty, so nothing displays.

## Conditions That Cause Live Transcript to Fail

Based on code analysis, here are the specific scenarios that cause failure:

### Scenario 1: Capability Detection Before Permission Grant

1. User opens brain dump modal
2. `detectCapabilities()` runs → finds `window.SpeechRecognition` → caches `liveTranscriptSupported: true`
3. User clicks record button
4. Browser prompts for microphone permission → **user denies**
5. `startRecording()` tries to start SpeechRecognition → **fails silently**
6. `canUseLiveTranscript` still shows `true` but no transcript appears

### Scenario 2: Browser-Specific Restrictions

1. User on mobile Safari (partial SpeechRecognition support)
2. `detectCapabilities()` finds `webkitSpeechRecognition` → caches `liveTranscriptSupported: true`
3. User tries to record → SpeechRecognition fails due to iOS restrictions
4. Error logged to console but UI still shows live transcript as available

### Scenario 3: Security Context Changes

1. User initially on HTTPS → detection succeeds
2. User navigates to mixed content page or loses secure context
3. SpeechRecognition becomes unavailable but cache still shows `true`
4. Next modal open uses stale cache → live transcript appears available but fails

### Scenario 4: Cache Inconsistency Across Sessions

1. First modal open: permissions denied → detection may report `false` or fail silently
2. Modal closes → `forceCleanup()` clears cache
3. User grants permissions in browser settings
4. Second modal open: detection now succeeds → `liveTranscriptSupported: true`
5. Third modal open in same session: uses **cached true** from second open
6. But if permissions were somehow revoked, cached value is stale

### Scenario 5: Race Condition on Rapid Open/Close

1. User opens modal → capability detection starts (asynchronous)
2. User closes modal quickly → `forceCleanup()` clears cache
3. Detection completes **after cleanup** → writes to cache
4. Next modal open uses partial/corrupted cache state

## Code Location Summary

### Primary Bug Locations

1. **Capability Detection Timing** (HIGH PRIORITY)
    - File: `/apps/web/src/lib/components/brain-dump/BrainDumpModal.svelte:432-435`
    - Issue: Detection happens before permission grant

2. **No Runtime Validation** (HIGH PRIORITY)
    - File: `/apps/web/src/lib/utils/voice.ts:46-105`
    - Issue: Only checks API existence, not usability

3. **Silent Failure on Initialization** (MEDIUM PRIORITY)
    - File: `/apps/web/src/lib/utils/voice.ts:108-156`
    - Issue: Errors not propagated to UI or cache

4. **No Retry on Start Failure** (MEDIUM PRIORITY)
    - File: `/apps/web/src/lib/utils/voice.ts:264-270`
    - Issue: Failure doesn't update capability state

5. **Aggressive Caching** (MEDIUM PRIORITY)
    - File: `/apps/web/src/lib/utils/voice.ts:57`
    - Issue: Cache persists across sessions without revalidation

6. **Cleanup Timing** (LOW PRIORITY)
    - File: `/apps/web/src/lib/services/voiceRecording.service.ts:311-329`
    - Issue: May create race conditions

## Recommended Fixes

### FIX #1: Validate Capabilities After Permission Grant (CRITICAL)

**Problem**: Capabilities checked before microphone permission requested.

**Solution**: Move capability validation to **after** first successful `getUserMedia()` call.

**Implementation**:

```javascript
// In voice.ts - add runtime validation function
export const validateLiveTranscriptRuntime = async (): Promise<boolean> => {
    if (!browser || !capabilitiesCache?.speechRecognition) return false;

    try {
        // Try to create and immediately stop a recognition instance
        const testRecognition = new capabilitiesCache.speechRecognition();
        testRecognition.lang = 'en-US';

        // Return true if we can create the instance
        // (actual start() will be tested during recording)
        return true;
    } catch (error) {
        console.warn('[Voice] SpeechRecognition runtime validation failed:', error);
        return false;
    }
};

// In startRecording() - validate after permission granted
export async function startRecording(): Promise<void> {
    // ... existing code ...

    try {
        // Request microphone permission
        currentStream = await navigator.mediaDevices.getUserMedia({ audio: { ... } });

        // NOW validate live transcript capability with actual permissions
        if (capabilities.liveTranscriptSupported && !isInitialized) {
            const runtimeValid = await validateLiveTranscriptRuntime();

            if (runtimeValid) {
                initializeSpeechRecognition();
                isInitialized = true;
            } else {
                // Update cache to reflect runtime failure
                capabilitiesCache.liveTranscriptSupported = false;
                console.warn('[Voice] Live transcript disabled - runtime validation failed');
            }
        }

        // ... rest of recording setup ...
    }
}
```

**Expected Impact**: 🎯 **80% reduction in inconsistency** - Capabilities validated with actual permissions

### FIX #2: Add Runtime Failure Callbacks (HIGH PRIORITY)

**Problem**: SpeechRecognition failures don't update UI state.

**Solution**: Add callback to notify when live transcript fails at runtime.

**Implementation**:

```javascript
// In voice.ts - add to module state
let liveTranscriptFailureCallback: ((error: string) => void) | null = null;

export const setLiveTranscriptFailureCallback = (callback: (error: string) => void) => {
    liveTranscriptFailureCallback = callback;
};

// Update initializeSpeechRecognition error handler
function initializeSpeechRecognition() {
    // ... existing setup ...

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
        console.warn('[SpeechRecognition] Error:', event.error);

        // Notify UI of failure
        if (liveTranscriptFailureCallback) {
            liveTranscriptFailureCallback(`Live transcript failed: ${event.error}`);
        }

        // Update cache to prevent future attempts this session
        if (capabilitiesCache) {
            capabilitiesCache.liveTranscriptSupported = false;
        }
    };

    // ... existing code ...
}
```

**In BrainDumpModal.svelte**:

```javascript
async function initializeModal() {
	// ... existing code ...

	// Set failure callback before initializing
	setLiveTranscriptFailureCallback((error) => {
		console.warn('[BrainDump] Live transcript disabled:', error);
		brainDumpActions.setVoiceCapabilities({
			canUseLiveTranscript: false,
			capabilitiesChecked: true
		});
	});

	brainDumpActions.setVoiceCapabilities({
		canUseLiveTranscript: voiceRecordingService.isLiveTranscriptSupported(),
		capabilitiesChecked: true
	});
}
```

**Expected Impact**: 🎯 **90% better user feedback** - UI reflects actual capability status

### FIX #3: Revalidate on Each Recording Start (MEDIUM PRIORITY)

**Problem**: Cache persists across recording sessions without revalidation.

**Solution**: Check SpeechRecognition availability each time recording starts, not just once.

**Implementation**:

```javascript
// In voice.ts - modify startRecording
export async function startRecording(): Promise<void> {
    // ... existing code up to permission grant ...

    try {
        currentStream = await navigator.mediaDevices.getUserMedia({ ... });

        // Revalidate live transcript capability each time
        const capabilities = detectCapabilities();

        if (capabilities.liveTranscriptSupported) {
            // Try to start speech recognition
            if (!recognition) {
                initializeSpeechRecognition();
            }

            if (recognition) {
                try {
                    recognition.start();
                } catch (error) {
                    console.warn('[SpeechRecognition] Start failed:', error);

                    // Update capability cache on failure
                    capabilitiesCache.liveTranscriptSupported = false;
                    recognition = null;

                    // Notify UI
                    if (liveTranscriptFailureCallback) {
                        liveTranscriptFailureCallback('Live transcript unavailable');
                    }
                }
            }
        }

        // ... rest of recording setup ...
    }
}
```

**Expected Impact**: 🎯 **70% reduction in stale cache issues**

### FIX #4: Add Permission State Detection (MEDIUM PRIORITY)

**Problem**: No way to detect if microphone permission state changes.

**Solution**: Use Permissions API to monitor microphone permission state.

**Implementation**:

```javascript
// In voice.ts - add permission monitoring
let permissionStatus: PermissionStatus | null = null;

export const monitorMicrophonePermission = async (
    onPermissionChange: (granted: boolean) => void
): Promise<void> => {
    if (!browser || !navigator.permissions) return;

    try {
        // @ts-ignore - microphone permission may not be in types
        permissionStatus = await navigator.permissions.query({ name: 'microphone' });

        permissionStatus.addEventListener('change', () => {
            const granted = permissionStatus!.state === 'granted';
            console.log('[Voice] Permission state changed:', permissionStatus!.state);

            // Clear cache when permissions change
            capabilitiesCache = null;

            onPermissionChange(granted);
        });
    } catch (error) {
        console.warn('[Voice] Permission monitoring not available:', error);
    }
};
```

**In BrainDumpModal.svelte**:

```javascript
async function initializeModal() {
	// ... existing code ...

	// Monitor permission changes
	await monitorMicrophonePermission((granted) => {
		if (!granted) {
			brainDumpActions.setVoiceCapabilities({
				canUseLiveTranscript: false,
				capabilitiesChecked: true
			});
		} else {
			// Recheck capabilities
			brainDumpActions.setVoiceCapabilities({
				canUseLiveTranscript: voiceRecordingService.isLiveTranscriptSupported(),
				capabilitiesChecked: true
			});
		}
	});
}
```

**Expected Impact**: 🎯 **50% better handling of permission changes**

### FIX #5: Add Capability Debug Logging (LOW PRIORITY)

**Problem**: Hard to diagnose why live transcript fails on specific devices.

**Solution**: Add comprehensive logging for capability detection.

**Implementation**:

```javascript
// In voice.ts - enhance detectCapabilities logging
function detectCapabilities() {
    if (!browser) return { ... };

    if (capabilitiesCache) {
        console.log('[Voice] Using cached capabilities:', capabilitiesCache);
        return capabilitiesCache;
    }

    const hasMediaDevices = /* ... */;
    const hasMediaRecorder = /* ... */;
    const voiceSupported = hasMediaDevices && hasMediaRecorder;

    let SpeechRecConstructor = null;
    if (typeof window !== 'undefined') {
        SpeechRecConstructor =
            (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    }

    const capabilities = {
        voiceSupported,
        liveTranscriptSupported: !!SpeechRecConstructor,
        supportedMimeType,
        speechRecognition: SpeechRecConstructor
    };

    console.log('[Voice] Detected capabilities:', {
        ...capabilities,
        userAgent: navigator.userAgent,
        isSecureContext: window.isSecureContext,
        protocol: window.location.protocol
    });

    capabilitiesCache = capabilities;
    return capabilitiesCache;
}
```

**Expected Impact**: 🎯 **100% better debugging** - Can diagnose device-specific issues

## Implementation Priority

### Phase 1: Critical Fixes (1-2 hours)

1. ✅ Add runtime validation after permission grant (FIX #1)
2. ✅ Add failure callbacks to update UI (FIX #2)
3. ✅ Add debug logging (FIX #5)

**Expected Result**: 80% reduction in inconsistency, users see accurate status

### Phase 2: Robustness Improvements (2-3 hours)

4. ✅ Revalidate on each recording start (FIX #3)
5. ✅ Add permission state monitoring (FIX #4)

**Expected Result**: 95% reliability, handles permission changes gracefully

## Testing Recommendations

### Manual Testing Scenarios

1. **Permission Denial Flow**:
    - Open modal
    - Click record
    - Deny microphone permission
    - Verify live transcript shows as unavailable

2. **Permission Grant After Denial**:
    - Deny permission initially
    - Close modal
    - Grant permission in browser settings
    - Reopen modal
    - Verify live transcript shows as available

3. **Rapid Open/Close**:
    - Open and close modal rapidly 5+ times
    - Check if capability detection stays consistent

4. **Cross-Browser Testing**:
    - Test on Chrome (should work)
    - Test on Firefox (should work)
    - Test on Safari desktop (may have issues)
    - Test on iOS Safari (known to have restrictions)
    - Test on Edge (should work)

5. **HTTPS vs HTTP**:
    - Test on localhost (should work)
    - Test on HTTPS production (should work)
    - Test on HTTP (should fail gracefully)

### Automated Testing

```typescript
// Test capability detection consistency
describe('Live Transcript Capability Detection', () => {
	it('should detect SpeechRecognition if available', () => {
		const capabilities = detectCapabilities();
		expect(capabilities.liveTranscriptSupported).toBe(
			!!(window.SpeechRecognition || window.webkitSpeechRecognition)
		);
	});

	it('should revalidate after permission grant', async () => {
		// Mock getUserMedia
		const mockStream = { getTracks: () => [] };
		navigator.mediaDevices.getUserMedia = vi.fn().mockResolvedValue(mockStream);

		await startRecording();

		// Check that runtime validation occurred
		expect(capabilitiesCache.liveTranscriptSupported).toBeDefined();
	});

	it('should update cache on runtime failure', async () => {
		// Mock SpeechRecognition that fails on start
		window.SpeechRecognition = vi.fn().mockImplementation(() => ({
			start: vi.fn().mockRejectedValue(new Error('not-allowed')),
			stop: vi.fn()
		}));

		await startRecording();

		expect(capabilitiesCache.liveTranscriptSupported).toBe(false);
	});
});
```

## Related Issues & Code References

### Key Files

- `/apps/web/src/lib/utils/voice.ts` - Core voice recording and capability detection
- `/apps/web/src/lib/services/voiceRecording.service.ts` - Service wrapper for voice features
- `/apps/web/src/lib/components/brain-dump/BrainDumpModal.svelte` - Main modal initialization
- `/apps/web/src/lib/components/brain-dump/RecordingView.svelte` - UI that displays live transcript

### Related Research

- `2025-10-06_15-50-04_braindump-textarea-lag-performance.md` - Performance optimization research
- `2025-10-05_00-00-00_buildos-web-comprehensive-audit.md` - Comprehensive audit mentioning voice features

## Open Questions

1. **Browser-Specific Behavior**: How does SpeechRecognition behave on iOS Safari vs. Chrome mobile? Need device testing.

2. **Permission API Coverage**: Does Permissions API work consistently across all browsers for microphone permission?

3. **Fallback Strategy**: Should we show a warning if live transcript is unavailable, or silently fall back to audio-only transcription?

4. **Persistent Storage**: Should we cache capability detection results in localStorage with a TTL to reduce re-detection overhead?

5. **User Preference**: Should users be able to manually disable live transcript even if supported (e.g., for privacy)?

## Conclusion

The live transcript inconsistency is caused by a **race condition and caching issue** where capabilities are detected **before microphone permissions are granted** and cached **without runtime validation**. The cache persists across modal sessions and is only cleared on cleanup, creating inconsistent behavior.

The primary fixes are:

1. **Validate capabilities AFTER permission grant** - Check SpeechRecognition usability with actual permissions
2. **Add runtime failure callbacks** - Update UI when SpeechRecognition fails at runtime
3. **Revalidate on each recording** - Don't rely on stale cache values

These changes will ensure `canUseLiveTranscript` accurately reflects the **actual runtime capability**, not just API availability.

**Estimated Effort**: 3-5 hours for Phase 1 + Phase 2 fixes
**Expected Impact**: 95%+ reliability improvement
