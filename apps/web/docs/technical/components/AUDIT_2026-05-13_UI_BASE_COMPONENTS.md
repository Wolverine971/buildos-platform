<!-- apps/web/docs/technical/components/AUDIT_2026-05-13_UI_BASE_COMPONENTS.md -->

# UI Base Components Audit — 2026-05-13

**Scope:** All 25 components in `apps/web/src/lib/components/ui/`.
**Dimensions:** Svelte 5 runes compliance, WCAG 2.2 AA accessibility, Inkprint design system, HTML semantics, performance, memory safety, API design, dark mode.
**Method:** Four parallel deep-audit agents, line-by-line review.

---

## 🔴 Critical

### 1. Form input id wiring is broken end-to-end

`TextInput`, `Textarea`, `Select` all hardcode `id="input-error"` / `id="textarea-error"` / `id="select-error"` for helper/error nodes, and none expose an `id` prop for the actual control. `FormField` accepts `labelFor=...` but cannot thread it into the input.

- **Consequence:** Two inputs of the same kind on one page → duplicate DOM ids, `aria-describedby` pointing at the wrong error, `<label for>` never associating with the real control.
- **Files:** `TextInput.svelte:159-187`, `Textarea.svelte:240-259`, `Select.svelte:259-297`, `FormField.svelte:63`.
- **Fix:** Add `id` prop (auto-generated if missing) and derive `aria-describedby` / helper ids from it.

### 2. Modal infrastructure issues

File: `Modal.svelte`

- **Stale focus trap** (`:336-347`) — focusable elements queried once on open, never re-queried. Modals with conditional content trap focus on stale nodes.
- **Stale focus restoration** (`:334`) — `previousFocusElement` captured _after_ `await tick()`; by then it can already be `<body>`.
- **Stack-unaware Escape** (`:467`) — `<svelte:window onkeydown>` fires on ALL open modal instances. Two stacked modals → Escape closes both.
- **`stopPropagation` on every key** (`:195-199`) — breaks global hotkeys (cmd-K) while any modal is open.
- **Touch double-close** (`:186-193` + `:483-484`) — both `onclick` and `ontouchend` fire `onClose` twice on mobile.
- **No `inert` / `aria-hidden`** on background siblings — screen-reader virtual cursor escapes the trap.
- **Z-index `9999` hardcoded** across stacked modals.
- **Hydration-unsafe `modalId`** via `Math.random()` (`:167`).
- **Shared scroll-lock not ref-counted** — first modal close unlocks body while second is still open.

### 3. Voice editors — three serious bugs

Files: `RichMarkdownEditor.svelte`, `TextareaWithVoice.svelte`, `CommentTextareaWithVoice.svelte`.

- **Singleton voice service collision** — `TextareaWithVoice` and `CommentTextareaWithVoice` both call `voiceRecordingService.initialize(...)` without a `clientId`. Mounting two at once corrupts callbacks (audio in input A uploads into input B's group). Only `RichMarkdownEditor` is correct.
- **Global keydown intercepts Space/Enter document-wide while recording** — sibling inputs can't receive these keys. All three components affected.
- **No `AbortController` on transcribe/upload `fetch` calls** — promises resolve into destroyed `$state` after unmount.

### 4. ConfirmationModal uses `createEventDispatcher`

Forbidden in Svelte 5 per CLAUDE.md. Also `isOpen` is not `$bindable`, inconsistent with the rest of the modal family. (`ConfirmationModal.svelte:3,29,46-58`.)

### 5. WelcomeModal — accidental backdrop tap permanently dismisses

File: `WelcomeModal.svelte:63-88`.

- `handleDismiss` runs on every close path (backdrop, Escape) and writes localStorage. One stray tap → modal is gone forever.
- `$effect` that recomputes `effectiveIsOpen = isOpen && !hasBeenDismissed` creates a binding loop.

### 6. FormModal double-submit + missing per-field a11y

File: `FormModal.svelte:405,191-203`.

- `onsubmit` with no `if (loading) return` guard → double-submit window on rapid Enter.
- No `aria-invalid` / `aria-describedby` per field. Validation runs only on submit; errors render as a top banner unlinked from inputs (fails WCAG 3.3.1).
- Checkbox hardcodes `aria-invalid={false}` even on error.

### 7. Alert.svelte — class list is non-reactive + always-assertive

File: `Alert.svelte`.

- `containerClasses` is a plain `const` (`:80`), not `$derived` — variant changes silently don't update the DOM.
- `role="alert"` hardcoded for all variants (`:84`) — info/success interrupt screen readers.

### 8. Toast — always-assertive

`Toast.svelte:172-173` — `role="alert"` hardcoded overrides conditional `aria-live`. Non-errors interrupt screen readers.

### 9. TabNav — missing arrow-key navigation

`TabNav.svelte:42-63` — `role="tab"` is set but no Left/Right/Home/End arrow nav and no roving `tabindex`. Partial WCAG fail.

### 10. DiffView — color-only signal

`DiffView.svelte:76-103` — additions/removals signaled only by background color. Fails WCAG 1.4.1 ("Use of Color"). No `+`/`−` gutter symbols.

### 11. MarkdownToggleField — controlled-vs-uncontrolled bug

File: `MarkdownToggleField.svelte`.

- `$effect(() => { internalValue = value; })` (`:54-56`) overwrites in-flight user typing every time the parent's `value` changes (debounced-save pattern triggers this).
- `<div role="button">` instead of a real `<button>` (`:159-169`).
- Double-labeling: `aria-label` + `aria-labelledby` set on the same element (`:168`).

### 12. UnifiedDiffView — separator expand does nothing

`UnifiedDiffView.svelte:33-35` — `isSeparatorExpanded` is defined but never called in the template. The expand/collapse button toggles state with no visual effect.

### 13. Button — `type="button"` not overridable

`Button.svelte:155` — `type="button"` hardcoded before `{...restProps}`; consumers can't reliably set `type="submit"`.

---

## 🟡 Should fix

### Cross-cutting patterns

- **Inkprint token drift.** `Badge`, `Alert`, `InfoModal`, `DiffView`, `UnifiedDiffView`, `FormModal` close-button red, and `Toast` icon colors use raw Tailwind palette (`bg-emerald-50`, `bg-rose-50`, `text-primary-600`, etc.) instead of Inkprint semantic tokens. `Button` and `ConfirmationModal` already use semantic tokens — they're the model.
- **`prefers-reduced-motion` honored inconsistently.** Missing/partial in `Modal`, `ToastContainer`, `Toast`, `MarkdownToggleField`.
- **`icon: any` is dominant icon typing.** `TextInput:14`, `Alert:38`, `TabNav:8` (old `ComponentType`). No shared `IconComponent` type.
- **Mirror-state-to-bindable anti-pattern** in all three heavy editors — 4–7 `$effect` blocks per file mirroring internal `$state` to `$bindable` props. Wasteful, risks ping-pong.
- **Legacy callback event shape.** `TabNav.svelte:21` exposes `onchange?: (event: { detail: string })` — leftover `createEventDispatcher` shape.
- **Manual `setTimeout` instead of `tick()`** in `MarkdownToggleField:65`, `Toast:130`.
- **`onMount` still used in Svelte 5 code** in `Toast.svelte`. Should be `$effect` with cleanup return.

### Modal family API inconsistency

| Component         | `isOpen` API          | Event API                     |
| ----------------- | --------------------- | ----------------------------- |
| Modal             | `$bindable`           | callbacks                     |
| ConfirmationModal | plain                 | callbacks + legacy dispatcher |
| InfoModal         | `$bindable`           | callback                      |
| WelcomeModal      | `$bindable` + derived | callbacks                     |
| FormModal         | plain                 | callback props                |

Pick one — either all bindable or all controlled. Footer styling duplicated 3 ways. Header override hacks in WelcomeModal/FormModal indicate base Modal's header is too rigid. No `role="alertdialog"` opt-in for destructive confirms.

### Other items

- `Toast.svelte:88` — 60fps JS interval per toast for progress bar. CSS `animation: progress {duration}ms linear` is cheaper.
- `ToastContainer` — no max-visible cap, no `role="region"` + `aria-label`.
- `Textarea.svelte:162-181` — `adjustHeight` reads computed style + writes height inside `$effect` on every keystroke. Layout-thrash risk.
- `DiffView`/`UnifiedDiffView` — no virtualization. Will tank on long diffs from agentic chat context edits.
- `UnifiedDiffView.svelte:114-125` — separator toggle button missing `aria-expanded` / `aria-controls`.
- `UnifiedDiffView.svelte:57-62` — uses `border-l-3` (not a default Tailwind class — verify custom or replace with `border-l-2`/`border-l-4`).
- `FormModal.svelte:267-278` — `roundToNearestFifteen()` defined but never called (dead code).
- `FilterGroup.svelte:50-56` — toggle buttons missing `aria-pressed`.
- `FilterGroup.svelte:47` — relies on global `.micro-label` class.
- `Card.svelte:111` — `hoverable={true}` cards have no keyboard contract.
- `Badge.svelte:39-40` — `default` and `secondary` variants are identical.
- `LoadingSkeleton.svelte:13` — no `role="status"` / `aria-busy`; misleadingly named (it's a centered spinner, not a content-shaped skeleton).
- `Select.README.md:287` — example uses Svelte 4's `onsubmit|preventDefault=` modifier (invalid in Svelte 5). Icon-size table is wrong.
- `Toast.svelte:218` — dismiss button only renders for `dismissible` toasts; auto-dismiss non-dismissible toasts can't be removed by keyboard / SR.

---

## 🟢 Refactor opportunity

**Voice editors duplicate ~2,400 lines across three files.** Functions like `requestTranscription`, `enqueueUpload`, `processUploadQueue`, `buildVoiceButtonState`, `getVoiceButtonClasses`, `applyTranscriptUpdate`, `uploadVoiceSegment` are byte-for-byte identical between `TextareaWithVoice` and `CommentTextareaWithVoice`.

Proposed extraction:

- `voice/useVoiceController.svelte.ts` (~450 LOC) — owns recording lifecycle, AbortController, per-instance clientId, scoped keydown listener. **Fixes the singleton collision, fetch leaks, and global keydown bug in one place.**
- `voice/useVoiceNoteUploader.svelte.ts` (~220 LOC) — upload queue + group state machine.
- `voice/VoiceButton.svelte` (~120 LOC).
- `voice/VoiceStatusRow.svelte` (~80 LOC).

Net: ~2,400 lines deleted, three bugs fixed once instead of three times.

Note: `rich-markdown-editor-voice.ts` already has helpers (`normalizeVoiceTranscript`, `preserveInsertedVoiceSpacing`, `canReplaceInsertedVoiceRange`) that `TextareaWithVoice` / `CommentTextareaWithVoice` don't use — those still do destructive whole-value overwrites on every live-transcript chunk, clobbering in-flight user typing.

---

## ✅ Clean

- `CardHeader.svelte`, `CardBody.svelte` — no notable issues.
- Svelte 5 runes migration is essentially complete across the core primitives (no `export let`, `$:`, `<slot>`, `on:click`, or `createEventDispatcher` in that group). The one exception is `ConfirmationModal.svelte`.

---

## Memory leak audit (heavy editors)

| Resource                | RichMarkdownEditor            | TextareaWithVoice       | CommentTextareaWithVoice |
| ----------------------- | ----------------------------- | ----------------------- | ------------------------ |
| Duration store sub      | ✅                            | ✅                      | ✅                       |
| Live transcript sub     | ✅                            | ✅                      | ✅                       |
| `voiceRecordingService` | ✅ (clientId scoped)          | ❌ no clientId          | ❌ no clientId           |
| Global keydown listener | ✅ lifecycle / ❌ scope       | ✅ lifecycle / ❌ scope | ✅ lifecycle / ❌ scope  |
| Transcribe `fetch`      | ❌ no AbortController         | ❌ no AbortController   | ❌ no AbortController    |
| Upload queue `fetch`es  | ❌ no AbortController         | ❌ no AbortController   | ❌ no AbortController    |
| `addedFeedbackTimeout`  | ✅                            | n/a                     | n/a                      |
| `onDestroy` async race  | ✅ (`.finally(cleanupVoice)`) | ❌ fire-and-forget      | ❌ fire-and-forget       |
| CodeMirror EditorView   | ✅                            | n/a                     | n/a                      |

---

## Fix order (lowest risk first)

1. **Form-field id wiring** (TextInput / Textarea / Select / FormField). ~1h. Big a11y win, low blast radius.
2. **Small independent correctness bugs:** Alert `const → $derived` + role, Toast role/aria-live, Button `type` prop, MarkdownToggleField controlled bug + real `<button>`, WelcomeModal localStorage gate, FormModal double-submit guard, UnifiedDiffView separator expand, ConfirmationModal createEventDispatcher removal.
3. **DiffView color-only a11y** — add `+`/`−` gutter.
4. **TabNav arrow-key nav + onchange shape.**
5. **Inkprint token sweep** — Badge, Alert, InfoModal, DiffView/UnifiedDiffView, FormModal close button → semantic tokens.
6. **Modal infrastructure** — focus-trap re-query, stack-aware Escape, scroll-lock ref-counting, `inert` on background, `alertdialog` opt-in.
7. **Voice editor extraction** (confirm scope first — biggest payoff, biggest change).
