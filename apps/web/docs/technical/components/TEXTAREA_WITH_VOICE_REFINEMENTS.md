<!-- apps/web/docs/technical/components/TEXTAREA_WITH_VOICE_REFINEMENTS.md -->

# TextareaWithVoice Component Refinements Spec

> **Created:** 2026-01-11
> **Status:** Completed
> **Completed:** 2026-01-11
> **Components:** `TextareaWithVoice.svelte`, `AgentComposer.svelte`
> **Priority:** High (contained bugs - now fixed)

---

## Overview

This document outlines refinements needed for the `TextareaWithVoice` component and its integration with `AgentComposer` in the agentic chat modal. The goal is to create a seamless, polished voice input experience following Inkprint design principles.

### Files Affected

| File              | Path                                                      |
| ----------------- | --------------------------------------------------------- |
| TextareaWithVoice | `apps/web/src/lib/components/ui/TextareaWithVoice.svelte` |
| AgentComposer     | `apps/web/src/lib/components/agent/AgentComposer.svelte`  |

---

## Issues by Priority

### HIGH PRIORITY - Bugs

#### 1. `buildVoiceButtonState` Uses Wrong Variables

**Location:** Lines 604, 607, 674, 684 in `TextareaWithVoice.svelte`

**Problem:** The function receives parameters but uses closure variables instead, causing TypeScript warnings and potential state sync issues.

```typescript
// Parameters are destructured but NEVER used:
const { isTranscribing, voiceError, ... } = params;

// Instead, it incorrectly uses internal state variables:
if (_isTranscribing) { ... }  // Line 674 - should use `isTranscribing` param
if (!microphonePermissionGranted && (hasAttemptedVoice || _voiceError)) { ... }  // Line 684
```

**TypeScript Warning:**

```
[Line 604:4] 'isTranscribing' is declared but its value is never read. [6133]
[Line 607:4] 'voiceError' is declared but its value is never read. [6133]
```

**Fix:** Replace `_isTranscribing` with `isTranscribing` and `_voiceError` with `voiceError` in the function body.

---

#### 2. Status Row Gate Blocks Action Buttons When Voice Disabled

**Location:** Line 1004 in `TextareaWithVoice.svelte`

**Problem:** Current condition prevents action buttons from showing when voice is disabled.

```svelte
<!-- Current - blocks buttons when enableVoice=false -->
{#if enableVoice && showStatusRow}

<!-- Should be -->
{#if showStatusRow}
```

**Impact:** If a consumer sets `enableVoice={false}` but provides `actions` snippet, buttons won't appear on desktop.

**Fix:** Change condition to `{#if showStatusRow}` and wrap voice-specific content in separate `{#if enableVoice}` blocks inside.

---

### MEDIUM PRIORITY - UX Issues

#### 3. Duplicate Error Display

**Location:**

- `TextareaWithVoice.svelte` Lines 1089-1096
- `AgentComposer.svelte` Lines 142-150

**Problem:** Both components display `voiceErrorMessage`, creating redundant error badges.

**Fix Options:**

- A) Remove error display from `AgentComposer` (prefer - keeps logic centralized)
- B) Pass a prop to `TextareaWithVoice` to hide its error display
- C) Use the `status` snippet in `AgentComposer` instead of separate display

**Recommendation:** Option A - remove lines 136-166 from `AgentComposer.svelte` or at minimum remove the error badge (keep "Working" indicator).

---

#### 4. Unused `idleHint` Prop

**Location:** Lines 45, 107 in `TextareaWithVoice.svelte`

**Problem:** Prop is defined with default value but never rendered.

```typescript
idleHint = 'Use the mic to dictate your update.',  // Never used
```

**Fix:** Remove the prop entirely, or render it in the idle state hint area.

---

#### 5. Keyboard Hint Only Shows "Space"

**Location:** Lines 1027-1030 in `TextareaWithVoice.svelte`

**Problem:** Recording can be stopped with both Space and Enter (Lines 891, 900), but hint only shows Space.

```svelte
<!-- Current -->
<kbd>Space</kbd>

<!-- Should show both, or just Enter (more intuitive) -->
<kbd>Enter</kbd>
```

**Fix:** Update hint to show `Enter` (primary) or both shortcuts.

---

#### 6. Mobile Hint Doesn't Account for Voice State

**Location:** Lines 1072-1074 in `TextareaWithVoice.svelte`

**Problem:** Shows "use voice" even when voice is blocked/disabled.

```svelte
<!-- Current - always shows -->
<span class="text-xs text-muted-foreground md:hidden"> Tap send or use voice </span>

<!-- Should be conditional -->
{#if enableVoice && !voiceBlocked}
	<span>Tap send or use voice</span>
{:else}
	<span>Tap send</span>
{/if}
```

---

#### 7. Separator Dot Uses Incorrect Color Token

**Location:** Line 1064 in `TextareaWithVoice.svelte`

**Problem:** `text-border` is semantically incorrect for text color.

```svelte
<!-- Current -->
<span class="text-border">·</span>

<!-- Should be -->
<span class="text-muted-foreground/50">·</span>
```

---

#### 8. Long Error Messages Can Break Layout

**Location:** Lines 1091-1096 in `TextareaWithVoice.svelte`

**Problem:** No truncation on error badge - long messages could overflow.

**Fix:** Add `max-w-xs truncate` or `line-clamp-1` to the error span.

```svelte
<span role="alert" class="... max-w-[200px] truncate">
	{_voiceError}
</span>
```

---

### LOW PRIORITY - Polish/Cleanup

#### 9. Dead Derived Values

**Location:** Lines 555-556 in `TextareaWithVoice.svelte`

**Problem:** Empty strings still being applied to classes.

```typescript
// Remove these entirely
const textareaPaddingRight = '';
const textareaBorderRadius = '';
```

Also clean up template at Line 948:

```svelte
<!-- Current -->
class={`${textareaPaddingRight} ${textareaBorderRadius} ${textareaClass}`.trim()}

<!-- Should be -->
class={textareaClass}
```

---

#### 10. Outdated Comment

**Location:** Line 936 in `TextareaWithVoice.svelte`

**Problem:** Comment no longer accurate after button relocation.

```svelte
<!-- Current (outdated) -->
<!-- Textarea: rounded-t only when status row is shown (seamless connection) -->

<!-- Should be -->
<!-- Textarea with optional live transcript preview overlay -->
```

---

#### 11. Legacy `createEventDispatcher` Pattern

**Location:** Lines 86-88, 754, 886 in `TextareaWithVoice.svelte`

**Problem:** Uses old Svelte 4 pattern alongside Svelte 5 bindable props.

```typescript
// Old pattern (can remove)
const dispatch = createEventDispatcher<{ input: { value: string } }>();
dispatch('input', { value });

// Already has Svelte 5 pattern
value = $bindable('');
```

**Fix:** Remove `createEventDispatcher` and `dispatch` calls. Component already supports binding.

---

#### 12. Live Transcript Preview Lacks `aria-live`

**Location:** Lines 960-971 in `TextareaWithVoice.svelte`

**Problem:** Screen readers won't announce live transcript changes.

**Fix:**

```svelte
<div
    class="pointer-events-none absolute ..."
    aria-live="polite"
    aria-atomic="true"
>
```

---

#### 13. `aria-pressed` During Loading States

**Location:** Lines 986, 1124 in `TextareaWithVoice.svelte`

**Problem:** Button shows `aria-pressed={isCurrentlyRecording}` even during loading/initializing states.

**Fix:**

```svelte
aria-pressed={voiceButtonState.variant === 'recording' ? true : undefined}
```

---

## Integration Observations

### AgentComposer Status Row Redundancy

**Location:** Lines 136-166 in `AgentComposer.svelte`

The AgentComposer has its own status row showing:

- Voice error badge (duplicate)
- "Working" badge (unique - good)

**Recommendation:**

- Remove the error badge from AgentComposer (let TextareaWithVoice handle it)
- Keep the "Working" badge OR move it into TextareaWithVoice via the `status` snippet prop

### Button Order Differs Between Desktop and Mobile

| View    | Order          | Rationale                               |
| ------- | -------------- | --------------------------------------- |
| Desktop | `[Send] [Mic]` | Reading order left-to-right             |
| Mobile  | `[Mic] [Send]` | Thumb reachability (Send on right edge) |

This is **intentional** and should be preserved.

---

## Implementation Checklist

### Phase 1: Bug Fixes (Required)

- [x] Fix `buildVoiceButtonState` to use destructured params instead of closure variables
- [x] Change status row condition from `enableVoice && showStatusRow` to `showStatusRow`
- [x] Wrap voice-specific status content in `{#if enableVoice}` blocks

### Phase 2: UX Improvements (Recommended)

- [x] Remove duplicate error display from AgentComposer
- [x] Remove unused `idleHint` prop
- [x] Update keyboard hint to show Enter (or both Enter/Space)
- [x] Make mobile hint conditional on voice availability
- [x] Change separator dot color to `text-muted-foreground/50`
- [x] Add truncation to error badge

### Phase 3: Polish (Optional)

- [x] Remove dead `textareaPaddingRight` and `textareaBorderRadius` derived values
- [x] Update outdated comment on line 936
- [x] Remove `createEventDispatcher` (keep only Svelte 5 binding pattern)
- [x] Add `aria-live="polite"` to live transcript preview
- [x] Fix `aria-pressed` to only be true during active recording

---

## Implementation Summary

All refinements have been successfully implemented on 2026-01-11.

### Key Changes Made

**Bug Fixes:**
- Fixed `buildVoiceButtonState` to properly use destructured parameters (`isTranscribing`, `voiceError`) instead of closure variables (`_isTranscribing`, `_voiceError`)
- Changed status row condition to `{#if showStatusRow}` so action buttons appear even when voice is disabled
- Added `{#if enableVoice}` guards around voice-specific UI elements

**UX Improvements:**
- Removed duplicate error display from `AgentComposer.svelte` (kept "Working" badge only)
- Removed unused `idleHint` prop from interface and $props() destructuring
- Updated keyboard hint from "Space" to "Enter"
- Made mobile hint conditional: shows "use voice" only when voice is enabled and not blocked
- Fixed separator dot color from `text-border` to `text-muted-foreground/50`
- Added `max-w-[200px] truncate` to error badge to prevent layout overflow

**Code Quality:**
- Removed dead derived values (`textareaPaddingRight`, `textareaBorderRadius`)
- Updated outdated comment to "Textarea with optional live transcript preview overlay"
- Removed legacy `createEventDispatcher` pattern (now uses Svelte 5 `$bindable()` only)
- Added `aria-live="polite"` and `aria-atomic="true"` to live transcript preview
- Fixed `aria-pressed` to only be `true` during active recording state

---

## Testing Notes

After implementation, verify:

1. **Voice recording flow** - Start, stop, transcribe works correctly
2. **Button visibility** - Buttons show in status row on desktop (>480px)
3. **Mobile layout** - Buttons show in mobile action bar (<480px)
4. **Voice disabled** - Action buttons still appear when `enableVoice={false}`
5. **Error states** - Error badge shows once (not duplicated)
6. **Keyboard shortcuts** - Enter and Space both stop recording
7. **Screen reader** - Live transcript announced, button states clear
8. **Dark mode** - All states render correctly in both themes

---

## Related Documentation

- [Inkprint Design System](/apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md)
- [Modal Components](/apps/web/docs/technical/components/modals/README.md)
- [Mobile Responsive Best Practices](/apps/web/docs/technical/MOBILE_RESPONSIVE_BEST_PRACTICES.md)
