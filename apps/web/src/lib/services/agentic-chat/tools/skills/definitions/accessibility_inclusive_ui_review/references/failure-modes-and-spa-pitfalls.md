<!-- apps/web/src/lib/services/agentic-chat/tools/skills/definitions/accessibility_inclusive_ui_review/references/failure-modes-and-spa-pitfalls.md -->

# Failure-Mode Catalog & SPA Pitfalls

Use this reference when diagnosing a specific reported accessibility bug, or when the review involves SPA/dynamic behavior: route changes, modals, streaming or async content, toasts, live regions, drag-and-drop, voice UI, or AI-generated UI. Call out the specific anti-pattern by name and pair it with the fix.

## Named Failure Modes

1. **`role="button"` on a `<div>`** → use a real `<button>`. The role doesn't make it focusable, doesn't fire on Enter/Space, and erases whatever semantic the original element had.
2. **Heading turned into a button (button wraps the heading)** → put the `<button>` inside the heading. Wrapping the heading in a button destroys heading-key navigation.
3. **Click handlers on non-interactive elements** (`<div onClick>`) → use a `<button>`. `<div onClick>` is invisible to keyboard and screen-reader users.
4. **Whole-card link** → real `<a>` on the title, CSS `::before` overlay for click area extension. Whole-card link kills text selection and link-list navigation.
5. **Float-label inputs (Material-style)** → top-aligned label, box-shaped input. Google's own research caught up to instinct; people don't recognize float-labels as inputs.
6. **Placeholder as label** → real `<label>`. Placeholder vanishes the moment the user types.
7. **Dialog without focus management** → use native `<dialog>` or a tested implementation (Radix, Headless UI, Scott O'Hara). Silently broken for AT users.
8. **SPA navigation without focus + title update** → SvelteKit `afterNavigate` hook moves focus to `<main>` and updates `document.title`. Without this, every internal link is silent navigation for AT users.
9. **`aria-live="assertive"` for routine messages** → switch to `polite`. Assertive interrupts; users disable it.
10. **Class-based state styling** → `[aria-expanded="true"]` attribute selectors. With class-based styling, the visual can work while the AT-facing state attribute is wrong; impossible to catch by visual QA.
11. **Custom focus rings that disappear in Forced Colors Mode** → add `outline: 2px solid transparent; outline-offset: 2px`. In Forced Colors, `transparent` is repainted as a visible color, restoring the focus boundary.
12. **`outline: none` reflex** → never remove focus styles unless you replace them with something at least as visible. "You wouldn't hide the cursor for a sighted mouse user."
13. **Hard contrast everywhere (#000 on #fff)** → paradoxically harms low-vision users with light sensitivity (Irlen syndrome). Tone the dark to `#222` and the light to `#eee` while still passing WCAG.
14. **WAI-ARIA copy-paste from the APG without testing** → even canonical patterns have shipped with bugs; test in real screen readers.
15. **Reinventing native elements** → every custom `<select>` ever audited is worse than the native one.
16. **Hidden inputs off-canvas (`left:-9999px`)** → kills explore-by-touch on mobile screen readers. Layer the native input on top of the visual replacement instead.

## Top 10 SPA-Specific Pitfalls (BuildOS-relevant)

1. **Route-change focus.** Every internal link in a SvelteKit SPA is a silent navigation for AT users by default. Wire `afterNavigate` to move focus to `<main>` (or the new view's `<h1>`) and update `document.title`. The single biggest accidental SPA accessibility regression in BuildOS.
2. **Modal focus management.** Use native `<dialog>` + `showModal()` where possible. Otherwise `role="dialog"` + `aria-modal="true"` + focus trap + restore-on-close + `inert` on the rest of the page.
3. **Async error announcement.** Form validation errors must be announced via a live region OR focus moved to the first invalid field. Silent error states are silently broken.
4. **Streaming content (daily brief, agentic chat).** New content streamed via SSE/WebSocket should be announced via `aria-live="polite"` (not assertive — don't interrupt while the user is reading). Debounce announcements to paragraph boundaries; don't announce every token.
5. **Dynamic content live regions.** When AI extracts projects/tasks from a brain-dump, the screen-reader user must be told something happened. Live region announces "X projects and N tasks extracted" + focus moves to the new content (or its heading).
6. **`$effect`-driven state changes.** Reactive runes that mutate the DOM are equivalent to JS-mutated DOM. Screen readers re-cache, but **focus does not move on its own**. Wherever a user action triggers content change, manually move focus.
7. **Toast/notification stacking.** Each toast must reach a live region — `role="status"` for non-critical ("Brain dump processed"), `role="alert"` for blocking errors ("Calendar sync failed"). Without this, toasts are visible-only.
8. **AI-generated UI.** Constrain agentic chat output to Inkprint primitives — don't let the agent emit arbitrary HTML/JSX. Each primitive is already accessible, so the composition is too. Run an axe-core pass on agent-generated DOM before showing it.
9. **Drag-and-drop.** Every drag interaction must have a keyboard alternative — buttons or arrow-key keyboard model. The visual drag is enhancement.
10. **Voice/recording UI.** Brain-dump voice intake must announce state via a live region: "Recording... Stop... Processing... Done. We extracted 3 projects and 8 tasks." Without this, the screen-reader experience doesn't mirror the visual one.
