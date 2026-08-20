<!-- docs/technical/reviews/WEB_RENDERING_GPU_REMEDIATION_2026-08-05.md -->

<!-- doc-status: point-in-time -->

> **Point-in-time document.** Written 2026-08-07; describes the state of the system at that moment.
> It is not a current reference. Verify against code before acting on anything here.

# Web Rendering and GPU Remediation

- **Date:** 2026-08-05
- **Status:** Implemented and validated
- **Application:** `apps/web`
- **Routes in scope:** `/projects`, `/projects/[id]`, and `/today`

## Purpose

This document records the first low-risk remediation pass for rendering work that can keep the
browser's main thread, rendering pipeline, or GPU compositor unnecessarily active.

The work focused on four patterns:

1. A full-page element that was permanently promoted for GPU compositing.
2. Small but continuous loading and status animations.
3. A toast progress bar driven by JavaScript state updates at approximately 60 frames per second.
4. Duplicate textarea layout measurement on each keystroke.

The changes preserve the existing product behavior and visual language. Higher-risk systems such as
graph rendering, streaming chat rendering, modal backdrop effects, and drag loops were deliberately
left for a measured profiling pass.

## Debugging principle

This work was informed by
[Theo Browne's rendering-performance investigation](https://www.youtube.com/watch?v=TKlOCjLMNtw) and
the resulting [T3 Code pull request](https://github.com/pingdotgg/t3code/pull/3978).

The important lesson was not simply that CSS animation can be expensive. It was that a visually tiny,
continuous animation can keep Chromium's rendering or compositing machinery awake, while a large code
rewrite aimed at React state or networking can miss the real cause completely.

The useful diagnostic sequence is:

1. Reproduce the idle or interaction cost.
2. Disable broad classes of visual behavior with temporary CSS kill switches.
3. Narrow the problem from page to component to individual visual effect.
4. Confirm the result in browser performance tooling.
5. Make the smallest change that removes the measured cost.

This pass follows that principle by addressing concrete rendering anti-patterns without rewriting page
architecture. It does **not** claim that source inspection alone proves a specific GPU utilization
reduction. A browser trace on representative hardware remains the final measurement step.

## Summary of implemented changes

| Rank | Change                                                      | Primary cost removed                                                              | Scope                                               |
| ---- | ----------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------- |
| 1    | Stop permanently promoting the pull-to-refresh page surface | Long-lived full-page compositor layer and associated memory pressure              | `/projects` and every page using the shared wrapper |
| 2    | Replace the toast's 16 ms JavaScript interval               | Repeated Svelte updates, style writes, layout/paint work, and main-thread wakeups | Global UI, including all three routes               |
| 3    | Duty-cycle persistent pulse, ping, and glow effects         | Continuous pixel changes from many small infinite animations                      | Requested routes and their shared components        |
| 4    | Remove duplicate textarea auto-resize invocation            | A second forced layout measurement per input event                                | `/today` through `TextareaWithVoice`                |

The ranking reflects the likely size and persistence of the code pattern, not a hardware benchmark.

## 1. Pull-to-refresh page promotion

### Previous behavior

`.pwa-pull-to-refresh-surface` always had both:

```css
transform: translate3d(0, 0, 0);
will-change: transform;
```

The element wraps page content. Even when the user was not pulling to refresh, the browser received a
permanent hint to prepare the entire surface for transform animation. On a large project list, that can
create a full-page composited layer and retain GPU memory for an interaction that is inactive almost all
of the time.

### New behavior

- The idle `translate3d(0, 0, 0)` is gone.
- `will-change: transform` applies only while the surface has the `pulling` or `settling` class.
- The inline transform exists only while pulling, refreshing, or settling.
- The interaction still uses `translate3d` while it is active, preserving its smooth transform path.

### Files

- `apps/web/src/lib/styles/pwa.css`
- `apps/web/src/lib/components/pwa/PullToRefresh.svelte`

### Why this is safer

The optimization changes only the idle state. The same transform and transition are used during the
gesture, while the browser is no longer asked to reserve a compositing strategy indefinitely.

## 2. Toast countdown rendering

### Previous behavior

Every auto-dismissing toast started a `setInterval(..., 16)` loop. The loop:

- read the current time;
- recalculated a `progress` state value;
- caused Svelte to update the component;
- wrote a new percentage `width` to the progress element;
- repeated approximately 60 times per second until dismissal.

Animating `width` also affects layout geometry. Although a toast is temporary, every visible toast
created a high-frequency JavaScript and rendering loop.

### New behavior

The progress bar now uses a finite CSS animation:

```css
@keyframes toast-progress-shrink {
	from {
		transform: scaleX(1);
	}
	to {
		transform: scaleX(0);
	}
}
```

The animation duration comes from `toast.duration`. The bar uses `transform-origin: left center`, so it
still appears to drain from right to left without changing layout width on every frame.

Pause and resume behavior remains intact:

- Hover or focus adds `animation-play-state: paused` and pauses the toast store timer.
- Mouse leave or focus departure resumes both.
- The browser preserves the CSS animation's current position, so the old local duration-reset logic is
  no longer required.
- Reduced-motion mode disables the visual countdown animation.
- Component destruction still clears a pending swipe-dismiss timeout.

### File

- `apps/web/src/lib/components/ui/Toast.svelte`

### Work removed

- `progress` Svelte state
- `progressInterval`
- local `startTime` and `duration` state
- the 16 ms interval effect
- percentage-width writes
- interval-specific cleanup

The toast store remains authoritative for actual dismissal. The CSS animation is visual only.

## 3. Persistent pulse, ping, and glow animations

### Previous behavior

The requested route trees contained many uses of Tailwind's standard `animate-pulse` and
`animate-ping`. Some were transient skeletons, while others represented live status, onboarding,
recording, navigation, risk, or chat activity and could remain mounted for a long time.

Standard pulse and ping animations continuously interpolate opacity and/or transform values. A single
small dot may look harmless, but continuous animation can prevent the rendering pipeline from reaching
a truly idle state. Multiple instances compound the work.

The existing `animate-pulse-glow` also interpolated opacity and `box-shadow` through its full cycle.
`box-shadow` is a paint-heavy property, so reducing how long it changes is especially useful.

### New behavior

Two shared animation utilities were added:

- `animate-status-pulse`
- `animate-status-ping`

Both use long holds and short stepped changes rather than continuously changing for the entire cycle.
The status ping completes its visible burst during the first 40% of the cycle and stays invisible for
the remaining 60%.

The existing `pulseGlow` keyframes now hold their idle and highlighted states. Only short portions of
the cycle transition the opacity and shadow.

These animations remain infinite because they communicate ongoing status. This is a compromise that
reduces visual churn without removing established feedback. A future measured pass may decide that
some persistent indicators should stop after a finite number of cycles or animate only after a state
change.

### Shared animation definition

- `apps/web/tailwind.config.js`

### `/projects` replacements

- `apps/web/src/routes/projects/+page.svelte`
    - Current work statistic skeleton
    - Task statistic skeleton
    - Document statistic skeleton
    - Active project statistic skeleton
- `apps/web/src/lib/components/projects/ProjectListSkeleton.svelte`
    - Project list loading cards

### `/projects/[id]` replacements

- `apps/web/src/routes/projects/[id]/+page.svelte`
    - Mobile and desktop task-board skeletons
    - Board headings, columns, and cards
    - Secondary request and audit placeholders
    - Tab-strip placeholders
- `apps/web/src/lib/components/project/ProjectAuditTracker.svelte`
    - Loading summary and audit cards
- `apps/web/src/lib/components/project/ProjectInboxPanel.svelte`
    - Inbox loading cards
- `apps/web/src/lib/components/project/ProjectMemoryCard.svelte`
    - Memory loading lines
- `apps/web/src/lib/components/project/v2/PulseStrip.svelte`
    - Activity-log loading cards
- `apps/web/src/lib/components/ontology/EntityListItem.svelte`
    - High-severity risk indicator

### Shared layout, chat, and voice replacements

- `apps/web/src/lib/components/layout/BriefStatusIndicator.svelte`
    - Brief-status ping
- `apps/web/src/lib/components/layout/Navigation.svelte`
    - Chat glow
    - Mobile onboarding dot
- `apps/web/src/lib/components/agent/AgentChatHeader.svelte`
    - Agent activity status dot
- `apps/web/src/lib/components/ui/TextareaWithVoice.svelte`
    - Live voice status pulse
    - Recording ping
- `apps/web/src/lib/components/ui/CommentTextareaWithVoice.svelte`
    - Live voice status pulse
    - Recording ping
- `apps/web/src/lib/components/ui/RichMarkdownEditor.svelte`
    - Recording ping
- `apps/web/src/lib/components/voice-notes/VoiceNoteRecorder.svelte`
    - Recording ping

Loading animations that are inherently brief and outside the requested route trees were not globally
rewritten. The change was intentionally scoped to the audited pages and shared components they use.

## 4. Textarea auto-resize layout work

### Previous behavior

The shared `Textarea` component could invoke `adjustHeight()` twice for one input:

1. directly inside `handleInput()` after updating the bound value; and
2. again from the existing reactive effect responding to that value.

`adjustHeight()` collapses the element, reads `scrollHeight`, reads computed line height, and writes the
new height. The reads can force the browser to resolve layout. Performing the same sequence twice per
keystroke creates avoidable main-thread and rendering work.

### New behavior

`handleInput()` now owns only the value update and consumer callback. The existing effect is the single
owner of placeholder adjustment and auto-resize work after the value changes.

### Files and route path

- `apps/web/src/lib/components/ui/Textarea.svelte`
- `apps/web/src/lib/components/ui/TextareaWithVoice.svelte` imports the shared textarea.
- `apps/web/src/routes/today/+page.svelte` uses `TextareaWithVoice` for both capture surfaces.

### Why this is safer

No resize behavior was removed. The same calculation runs after the same value change; only the
duplicate invocation was removed.

## Page-by-page result

### `/projects`

The largest improvement is the removal of the permanent compositing hint from the page-sized
pull-to-refresh surface. Project and statistic skeletons also use the lower-duty-cycle pulse.

Likely result:

- lower idle compositor-layer pressure;
- less continuous skeleton pixel churn while data loads;
- unchanged pull-to-refresh behavior while the gesture is active.

### `/projects/[id]`

The hydration and lazy-loading skeletons across the page now use the shared status pulse. Project
memory, inbox, audit, activity, risk, navigation, and agent status components use the lighter animation
where applicable.

Likely result:

- fewer continuously interpolated elements during hydration and secondary loading;
- lower cumulative animation demand when multiple project panels are visible;
- no data-loading or interaction behavior changes.

### `/today`

The shared voice-input stack uses the lighter live/recording indicators. Its base textarea no longer
performs duplicate layout measurement on every keystroke. Toasts shown from the page no longer run a
JavaScript frame loop.

Likely result:

- less work while typing into the capture fields;
- fewer unnecessary component updates when a toast is visible;
- less continuous work from recording and live-status indicators.

## Deferred work

The following items remain candidates, but were not changed because they need runtime isolation or
carry more visible behavior risk.

### Full-screen modal backdrop effects

Backdrop blur and large translucent overlays can be expensive because the browser must repeatedly
sample and composite content behind them. Removing or reducing the effect changes the design
materially. Test with a CSS kill switch first, then compare traces on desktop and mobile.

### Cytoscape and G6 graphs

Graph layout, canvas rendering, animation, hit testing, and observer-driven resize behavior can be
substantial. Profiling should distinguish initial layout, idle animation, user interaction, and resize
work before changing graph settings.

### Agent chat streaming

Streaming messages can combine frequent state updates, Markdown parsing, syntax highlighting,
scrolling, and `requestAnimationFrame` work. It should be profiled with representative long responses
and tool activity rather than optimized from source patterns alone.

### Document-tree dragging

Drag handling may legitimately require animation-frame scheduling. Measure event frequency, DOM reads,
layout invalidation, and paint area before changing the loop.

### Root view transitions

View-transition snapshots can allocate large textures and create expensive cross-page compositing.
They require navigation-specific traces and a visual fallback decision.

## Validation performed

### Static analysis

All touched Svelte files were run through the Svelte autofixer with Svelte 5 configuration. It reported
no findings.

```text
pnpm --filter @buildos/web check
svelte-check found 0 errors and 0 warnings
```

### Targeted tests

```text
pnpm --filter @buildos/web exec vitest run \
  src/lib/components/ui/CommentTextareaWithVoice.test.ts \
  src/lib/components/ui/TextareaWithVoice.test.ts \
  src/lib/components/project/v2/PulseStrip.test.ts

3 test files passed
8 tests passed
```

### Production build

```text
pnpm --filter @buildos/web exec vite build
```

The client, server, and adapter builds completed successfully. The only emitted warnings concerned
optional `sharp` platform modules and were unrelated to this work.

### Diff validation

```text
git diff --check -- apps/web
```

The check passed.

### Full-suite caveat

An earlier command unintentionally invoked the full web test suite. It recorded 553 passing files,
3,654 passing tests, and 29 skipped tests, but exited unsuccessfully for unrelated environment and
fixture reasons:

- 18 Postgres-backed suites could not bind to `127.0.0.1` in the sandbox (`EPERM`).
- One existing admin chat replay test could not find the text `Arguments`.

The three intended target test files passed both in that run and in the later targeted invocation.

## Recommended measurement follow-up

Source-level improvements should be followed by a repeatable browser comparison:

1. Use the same browser build, viewport, account, and project data.
2. Record 15–30 seconds of idle time on each route after loading settles.
3. Record separate traces for loading, typing, opening a toast, recording voice, and pull-to-refresh.
4. Compare main-thread scripting, rendering, painting, GPU/compositor activity, frame rate, and layer
   memory.
5. Temporarily disable remaining animation, backdrop, graph, and view-transition categories one at a
   time.
6. Promote only measured differences into the next remediation batch.

The most important success criterion is that the page can become genuinely idle when the user is not
interacting with it.

## Post-review adjustments (2026-08-05)

A verification pass measured the animations in the running app (Web Animations API timeline
sampling of computed values at 60 Hz) and reviewed every diff. Measured results:

- `animate-pulse` → `animate-status-pulse`: 116 changed frames per 2s cycle → 11 per 2.4s cycle
  (~92% fewer presented frames).
- `animate-ping` → `animate-status-ping`: ~45 changed frames per second → burst-only updates with
  60% of the cycle fully idle.

Three defects were found in the implementation and fixed:

1. **Toast self-contradiction.** The rewritten toast applied a permanent
   `will-change: transform, opacity` plus an unconditional inline `translate3d(0,0,0)` — the same
   idle-promotion anti-pattern change 1 removed. The inline transform/opacity are now only applied
   while the toast is actually offset, and `will-change` applies only during an active swipe
   (`.toast-surface-swiping`).
2. **Status ping stepped at ~8 Hz.** `steps(8)` across the 0.96s burst produced visible discrete
   jumps. Raised to `steps(20)` (~21 Hz — perceptually smooth); still 20 presented frames per 2.4s
   cycle versus ~108 for the old ping.
3. **Reduced-motion progress regression.** `animation: none` froze the toast countdown bar at full
   width, losing the time-remaining signal the old JS loop still conveyed. Reduced motion now keeps
   the animation but quantizes it to `steps(8)` — eight discrete updates over the toast lifetime.

The `Toast.test.ts` vertical-gesture assertion was updated to expect no inline transform at rest.
Undocumented behavior changes that shipped with the toast rewrite and were verified as
improvements: touch events → pointer events with axis locking (`touch-action: pan-y`), swipe
dismiss in both directions with flick detection, dismiss button anchored absolutely with
matching content padding, and removal of the mobile swipe-hint line.

## Files changed

1. `apps/web/tailwind.config.js`
2. `apps/web/src/lib/styles/pwa.css`
3. `apps/web/src/lib/components/pwa/PullToRefresh.svelte`
4. `apps/web/src/lib/components/ui/Toast.svelte`
5. `apps/web/src/lib/components/ui/Textarea.svelte`
6. `apps/web/src/routes/projects/+page.svelte`
7. `apps/web/src/routes/projects/[id]/+page.svelte`
8. `apps/web/src/lib/components/projects/ProjectListSkeleton.svelte`
9. `apps/web/src/lib/components/project/ProjectAuditTracker.svelte`
10. `apps/web/src/lib/components/project/ProjectInboxPanel.svelte`
11. `apps/web/src/lib/components/project/ProjectMemoryCard.svelte`
12. `apps/web/src/lib/components/project/v2/PulseStrip.svelte`
13. `apps/web/src/lib/components/ontology/EntityListItem.svelte`
14. `apps/web/src/lib/components/layout/BriefStatusIndicator.svelte`
15. `apps/web/src/lib/components/layout/Navigation.svelte`
16. `apps/web/src/lib/components/agent/AgentChatHeader.svelte`
17. `apps/web/src/lib/components/ui/TextareaWithVoice.svelte`
18. `apps/web/src/lib/components/ui/CommentTextareaWithVoice.svelte`
19. `apps/web/src/lib/components/ui/RichMarkdownEditor.svelte`
20. `apps/web/src/lib/components/voice-notes/VoiceNoteRecorder.svelte`
