# Agentic Chat Voice Modal Jumpiness

Date: 2026-04-12

## Summary

The current Agentic Chat recording behavior works functionally, but the UI has unstable transitions around mobile keyboard state, textarea focus, live transcript display, and stop/transcribe state changes. The main goal is to keep the existing recording and transcription behavior while making the modal feel physically stable.

## Observed Symptoms

- Tapping Record from a focused textarea on mobile closes the keyboard, starts recording, then reopens the keyboard.
- Stopping a recording briefly jumps the composer after the Stop button is tapped.
- Starting another recording or typing after a recording can make the modal appear to shift downward, as if the page behind the modal is being scrolled or focused.
- Sending while recording can briefly move through an idle-looking UI before transcription completes.

## Current Causes

### Mobile Focus Loop

The voice button is a normal button next to the textarea. On mobile, tapping it can blur the textarea and close the keyboard. After microphone startup finishes, `TextareaWithVoice.svelte` calls `textareaRef?.focus()`. That refocus reopens the keyboard and retriggers modal height calculations.

Result: keyboard closes, recording starts, keyboard opens again.

### Body Scroll Lock Churn

The modal body scroll lock changes behavior while an input is focused. On `focusin`, it switches from `position: fixed` body locking to `overflow: hidden` so iOS can position the focused input. On `focusout`, it restores `position: fixed`.

When the record tap causes blur and the recording code refocuses the textarea, that scroll lock mode toggles twice quickly. Mobile browsers can expose this as a small underlying page or modal shift.

### Composer Height Changes

The live transcript preview is rendered above the textarea in normal layout. When live transcript text appears, the composer grows. When Stop is clicked, the component immediately clears `isCurrentlyRecording` and `liveTranscriptPreview`, so the preview disappears before transcription state is fully active.

Result: composer collapses, then status/transcription state changes again.

### Missing Stopping State

The UI currently transitions from recording to "not recording" before it enters transcribing. During that gap, the composer can briefly show idle hints and ready buttons even though stop processing is still underway.

## Target UX

- Record should start voice capture without reopening the keyboard on mobile.
- Stop should feel like a stable state transition: recording -> stopping -> transcribing -> ready.
- The composer should reserve enough space for voice status and live transcript content so small state changes do not resize the modal.
- Sending while recording should wait for the stop/transcription path to settle before sending.
- Desktop keyboard affordances should continue to work where they are useful.

## Implementation Plan

1. Add mobile-aware focus handling to the voice textarea.
    - Do not refocus the textarea after recording starts on touch devices.
    - Keep desktop focus behavior for Enter/Space stop shortcuts.

2. Add an explicit stopping state.
    - Set stopping before awaiting `voiceRecordingService.stopRecording`.
    - Bind it upward only if the parent needs it, otherwise use it locally to stabilize UI.
    - Treat stopping like a busy voice state for buttons and status.

3. Stabilize the voice status area.
    - Keep a status/live-transcript region mounted while voice is active, stopping, or transcribing.
    - Avoid removing the region immediately on Stop.
    - Reserve a consistent minimum height for the status row or transcript preview region.

4. Improve send-while-recording coordination.
    - Prevent the pending auto-send effect from seeing the gap between recording and transcribing as "ready."
    - Include stopping state in the guard, or otherwise await the stop/transcription path directly.

5. Verify focused behavior.
    - Run Svelte type checking or a focused component test where practical.
    - Manually inspect the state transitions in the code path.
    - On device/browser, verify Record from focused textarea closes keyboard once and does not reopen it.

## Risk Notes

- The recording service should not be rewritten unless necessary. The issue is UI orchestration, not audio capture.
- Body scroll lock changes affect every modal, so fixes there should be conservative.
- Mobile browsers differ in how buttons, virtual keyboards, and `visualViewport` interact; the safest first fix is removing the forced mobile refocus.

## First Implementation Pass

Changed files:

- `apps/web/src/lib/components/ui/TextareaWithVoice.svelte`
- `apps/web/src/lib/components/ui/Textarea.svelte`
- `apps/web/src/lib/components/agent/AgentComposer.svelte`
- `apps/web/src/lib/components/agent/AgentChatModal.svelte`
- `apps/web/src/lib/components/agent/AgentComposer.test.ts`

What changed:

- Added an explicit voice stopping state between recording and transcribing.
- Bound the stopping state up through `AgentComposer` into `AgentChatModal`.
- Included stopping in send-disabled and auto-send guards so Send while recording cannot observe the recording/transcribing gap as ready.
- Avoided programmatic textarea refocus after recording starts on touch devices.
- Kept desktop textarea refocus with `preventScroll` so keyboard shortcuts still work without causing document scroll.
- Kept a voice activity panel mounted through recording, stopping, and transcribing to reduce composer collapse on Stop.
- Prevented Enter/Space keypresses that stop recording from also reaching the parent send handler.

Verification:

- `pnpm --filter @buildos/web test -- AgentComposer.test.ts` passed.
- Prettier check passed for touched Svelte/test files.
- Full `pnpm --filter @buildos/web check` is currently blocked by existing unrelated project errors.

## Follow-Up Adjustment

After testing the Stop Recording path, the voice activity panel could remain visible because stale live transcript text still existed after recording stopped. The panel now only renders while voice work is active: recording, stopping, or transcribing. During stopping/transcribing it shows a processing state, and on idle/error it clears the live transcript preview so the panel disappears once text has been applied or recording has fully stopped.

## Mobile Keyboard Sheet Anchor Adjustment

The Agentic Chat modal uses a bottom-sheet modal on mobile. When the keyboard opens, the sheet height is reduced with `calc(100dvh - var(--keyboard-height))`. Because the bottom sheet was still anchored to the bottom of the full viewport, reducing its height made the top edge drop down by roughly the keyboard height.

The sheet now adds a matching bottom margin while the keyboard is visible, so the reduced-height modal is anchored above the keyboard instead of behind it. The keyboard height utility also accounts for `visualViewport.offsetTop`, which avoids over-counting browser chrome or viewport panning as keyboard height.
