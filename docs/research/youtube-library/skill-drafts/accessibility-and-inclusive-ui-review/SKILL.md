---
name: accessibility-and-inclusive-ui-review
description: Audit a screen, component, or design-system primitive for accessibility per WCAG 2.2 AA. Covers semantic HTML first, ARIA-as-last-resort, focus management, keyboard navigation, screen-reader semantics, hiding-techniques taxonomy, reduced motion, and the 12+ canonical component patterns (toggle, dialog, accordion, tabs, tables, menu, notifications, forms). Use to back the BuildOS `accessibility-auditor` agent and to audit any user-facing screen before ship.
path: docs/research/youtube-library/skill-drafts/accessibility-and-inclusive-ui-review/SKILL.md
---

# Accessibility and Inclusive UI Review

Use this skill to audit any BuildOS screen, component, or design-system primitive against WCAG 2.2 AA and the inclusive-component canon. The skill pairs Heydon Pickering's component-first canon (per-component audit) with Sara Soueidan's screen-first audit (per-screen audit). The output is a portable skill an agent can use to review any user-facing surface — a single primitive in isolation, a composed component, or a full route — before it ships.

This is the **source backbone for the BuildOS `accessibility-auditor` agent.** When the agent is asked to review accessibility, this skill is what it should walk.

## When to Use

- Audit an Inkprint primitive (Button, Input, Dialog, Dropdown, Tab, Toggle) before adding it to the design system
- Review a route in `apps/web` (brain-dump, daily brief, project view, onboarding step, agentic chat) before merging
- Diagnose a specific reported accessibility issue (e.g. "tab order is broken on the project page")
- Audit AI-generated UI fragments (agentic chat responses, generated forms, dynamic dashboards) for accessibility regressions
- Pre-ship review of any screen that ships net-new interactive controls
- Pre-ship review of any change that touches focus management, modal behavior, or live-region announcements
- Spot-check a competitor or reference implementation for what to copy

**Do not use this skill for:** brand identity work, marketing-site visual review (use `marketing-site-design-review`), in-app UI quality without accessibility focus (use `ui-ux-quality-review`), or pure performance audits.

## Two Layers of Audit

This skill runs **two passes** that complement each other and should both be performed for any non-trivial review:

1. **Per-screen audit (Soueidan canon).** Walks the screen top-to-bottom: landmarks, heading order, focus order, focus visibility, keyboard reachability, hidden-content techniques, color contrast, dynamic content announcements. This catches the "does this screen ship broken?" issues that show up in production right now.
2. **Per-component audit (Pickering canon).** For every interactive primitive on the screen — button, accordion, tab, dialog, menu, table, toggle, card — verify the canonical accessible pattern. Fixes here propagate: fix the Inkprint `Dialog` once, and every dialog in the app is fixed.

The agent should always end with both passes documented separately so the user can act on screen-level issues immediately and queue component-level issues for design-system work.

## Foundational Principles

These are non-negotiable. Every finding should trace back to at least one of these.

- **Semantic HTML first; ARIA is a last resort.** _"If you're reaching for `role='button'` you should be using a `<button>`."_ ARIA exists to add semantics HTML cannot express; it never adds behavior. _"Aria is not there to add functionality to elements. It's only used to add semantic parity with HTML."_ The right element gets you 80% of accessibility for free.
- **Style off the state attribute, not a class.** Drive open/closed/pressed/selected visuals from `[aria-expanded='true']`, `[aria-pressed='true']`, `[aria-selected='true']` — not parallel classes. This is a deliberate fail-safe: if the visual works, the state attribute must be set, so screen readers can never disagree with the eyes.
- **The leverage point is the design system, not the screen.** A primitive built once, well, makes the entire product accessible by default. A primitive built once, badly, makes it inaccessible everywhere it's used. Fix Inkprint primitives first; screen-level fixes are second-best.
- **Keyboard navigation is the foundation, not an add-on.** Every interactive element must be Tab-reachable in a sensible order, activate on Enter/Space (button) or Enter (link), and never trap focus outside intentional modal contexts. If you can't reach a control with Tab, the screen ships broken.
- **Focus must move with the user, not stay where it was.** Whenever JS causes a "page-like" change — modal opens, route changes, content inserts, error appears — focus is the developer's responsibility to move. Modals open → focus inside; modals close → focus restored; SPA route changes → focus to the new view's heading.
- **Screen-reader users live in the accessibility tree, not the DOM.** Inspect the Chrome DevTools Accessibility tab. Every interactive element must have a meaningful `name`, the correct `role`, and accurate `state`. If the name is empty or the role is `group`, it's broken regardless of how it looks.
- **Inclusion considerations come before delight features.** A working keyboard model and screen-reader announcement matter more than a clever animation. Accessibility is a gradient — push toward inclusion with every decision; never declare "done."

## Per-Screen Audit Checklist (Soueidan canon)

Walk this list top-to-bottom on every screen reviewed. Cite WCAG criteria for each finding.

### Foundation

- [ ] Page has a `<html lang="...">` attribute (WCAG 3.1.1 Language of Page)
- [ ] Page has a meaningful `<title>` (WCAG 2.4.2 Page Titled)
- [ ] Exactly one `<h1>` per page; subsequent headings are explicit `<h2>`–`<h6>`, never relying on the HTML5 outline algorithm (vendors never shipped it)
- [ ] Heading order descends without skipping levels; heading levels reflect document structure, not visual size (a small visual heading is still an `<h1>` if it titles the main section) (WCAG 1.3.1 Info and Relationships, 2.4.6 Headings and Labels)
- [ ] Landmark elements present and semantic: `<header>`, `<nav>`, `<main>`, `<aside>`, `<footer>` (WCAG 1.3.1, 2.4.1 Bypass Blocks)
- [ ] Every landmarked region has a heading (or a `.sr-only` heading wired via `aria-labelledby`)
- [ ] Skip link is the first focusable element, visible on focus, targets `<main>` (WCAG 2.4.1)

### Semantics & ARIA (only-when-necessary checklist)

- [ ] No `role="button"` on `<div>`/`<span>`; every interactive control is a real `<button>` or `<a>` (WCAG 4.1.2 Name, Role, Value)
- [ ] No `role="link"` on non-links; links use `<a href>`
- [ ] `aria-expanded`, `aria-pressed`, `aria-current`, `aria-controls`, `aria-selected`, `aria-checked` used correctly on real interactive elements
- [ ] State styling is driven by attribute selectors (`[aria-expanded="true"]`), not by parallel classes
- [ ] No `aria-hidden="true"` on focusable content (creates a focus-visits-invisible-element bug)
- [ ] No positive `tabindex` values anywhere (`tabindex="3"`) — only `0` or `-1`
- [ ] `aria-label` used only when no visible text label exists; prefer visible text + `<label>` association
- [ ] `aria-labelledby` references real elements that contain the label text
- [ ] `aria-describedby` references real elements that contain supplementary description (errors, hints)
- [ ] No "aria role copy-paste from APG without testing" — the canonical patterns have shipped with bugs

### Keyboard

- [ ] Every interactive element reachable by Tab in a sensible source order (WCAG 2.1.1 Keyboard, 2.4.3 Focus Order)
- [ ] `Enter` activates links; `Enter` and `Space` both activate buttons
- [ ] `Space` toggles checkboxes
- [ ] Composite widgets (tabs, menus, radios, listboxes, sliders) use **roving tabindex** — exactly one element in the tab order at a time, arrow keys navigate within
- [ ] `Escape` closes dialogs, popovers, menus
- [ ] `Home`/`End` jump to first/last in tablists, comboboxes, menus
- [ ] No keyboard traps — Tab and Shift+Tab can always escape any region except an intentional modal (WCAG 2.1.2 No Keyboard Trap)
- [ ] No mouse-only interactions; every drag-and-drop has a keyboard alternative (WCAG 2.1.1)

### Focus Management

- [ ] Visible focus indicator on every focusable element (WCAG 2.4.7 Focus Visible)
- [ ] Focus indicator contrast ≥ 3:1 against adjacent colors in both light and dark modes (WCAG 1.4.11 Non-text Contrast, 2.4.11 Focus Appearance — WCAG 2.2)
- [ ] `:focus-visible` used so focus rings appear on keyboard but not on mouse click
- [ ] Transparent outline (`outline: 2px solid transparent; outline-offset: 2px`) on buttons so Forced Colors / Windows High Contrast Mode can repaint a visible boundary
- [ ] **Modal opens** → focus moves into the modal (typically the first focusable element or the heading with `tabindex="-1"`)
- [ ] **Modal closes** → focus returns to the element that triggered it
- [ ] **SPA route change** → focus moves to the new view's heading; `document.title` updates (without this, every internal link is silent navigation for AT users)
- [ ] **Form error** → focus moves to the first invalid field or the error summary
- [ ] No focus on `aria-hidden="true"` or `display:none` content

### Hiding Techniques (the 4-by-2 matrix — pick the right one)

| Technique                                              | Hidden visually? | Hidden from a11y tree? | When to use                                                        |
| ------------------------------------------------------ | ---------------- | ---------------------- | ------------------------------------------------------------------ |
| `display: none`                                        | Yes              | Yes                    | Element should not exist for any user                              |
| `visibility: hidden`                                   | Yes              | Yes                    | Same as `display:none`; preserves layout space                     |
| `hidden` attribute (HTML5)                             | Yes              | Yes                    | Equivalent to `display:none`; survives CSS-disabled (Reader mode)  |
| `aria-hidden="true"`                                   | No               | Yes                    | Decorative or duplicative content (icon SVGs inside labeled buttons) |
| `inert`                                                | No (but inactive) | No (but unreachable) | Background content while a modal is open                           |
| `.sr-only` (clip + 1×1 + absolute)                     | Yes              | No                     | Screen-reader-only labels, headings, instructions                  |
| `tabindex="-1"`                                        | No               | No                     | Removes from tab order; still scriptable-focusable                 |
| `position:absolute; opacity:0; w/h:1px` + visual overlay | Yes            | No                     | Hide native `<input>` while keeping it touch-explorable            |

- [ ] Each hidden element uses the technique that matches intent
- [ ] No interactive control hidden off-canvas (`left:-9999px`) or shrunk to invisibility — kills explore-by-touch on mobile screen readers
- [ ] Native form inputs (checkbox, radio, file) layered on top of their visual replacements so a finger sweep finds them
- [ ] Decorative SVGs have `aria-hidden="true"` AND `focusable="false"`
- [ ] Background page is `inert` (or `aria-hidden="true"`) while a modal is open

### Screen Reader

- [ ] Every `<img>` has meaningful `alt` text (or `alt=""` if purely decorative) (WCAG 1.1.1 Non-text Content)
- [ ] Every interactive control has a non-empty accessible name
- [ ] Icon-only buttons have an accessible name via one of: visually-hidden text + decorative SVG (preferred), `aria-label`, or `aria-labelledby` referencing a hidden span
- [ ] Async/dynamic content updates reach a live region: `aria-live="polite"` for non-urgent, `aria-live="assertive"` (or `role="alert"`) only for genuine urgency (WCAG 4.1.3 Status Messages)
- [ ] Off-screen carousel/slider items are `inert` or `aria-hidden` so AT users only see what's currently visible
- [ ] Charts/visualizations have an alternative text view (description via `aria-describedby` and/or a paired `<table>`)

### Visual & Motion

- [ ] Color contrast: body text ≥ 4.5:1 (WCAG 1.4.3 Contrast Minimum, AA); large text ≥ 3:1; UI components and graphics ≥ 3:1 (1.4.11); 7:1 for AAA where feasible
- [ ] Both light and dark modes pass contrast — never check only one
- [ ] Color is **not** the only way information is conveyed (red border + icon + text, not red border alone) (WCAG 1.4.1 Use of Color)
- [ ] `prefers-reduced-motion: reduce` strips parallax, decorative animation, auto-advancing carousels, fade/slide transitions on appearing content (WCAG 2.3.3 Animation from Interactions)
- [ ] No animations longer than 5 seconds without a pause/stop control (WCAG 2.2.2 Pause, Stop, Hide)
- [ ] `prefers-color-scheme` honored
- [ ] Text scales to 200% zoom without loss of content or horizontal scrolling on main content (WCAG 1.4.4 Resize Text)
- [ ] Touch targets ≥ 24×24 CSS pixels (WCAG 2.5.8 Target Size Minimum, 2.2); ≥ 44×44 for Level AAA / iOS HIG / 2.5.5

### Forms

- [ ] Every input has a `<label>` element with `for`/`id` association (or `aria-labelledby` to a visible label) (WCAG 1.3.1, 3.3.2 Labels or Instructions)
- [ ] Labels are top-aligned, not floating-label (Material-style); the field is a real box, not a bare line
- [ ] Placeholder is never the only label — it disappears on type
- [ ] Required fields marked with both visible "*" or "required" AND `aria-required="true"`
- [ ] Error messages associated with fields via `aria-describedby` (WCAG 3.3.1 Error Identification)
- [ ] `aria-invalid="true"` on fields in error
- [ ] Validation errors announced via a live region or focus moves to the error summary
- [ ] Success/save announcements use `aria-live="polite"` or `role="status"` (WCAG 4.1.3)

## Per-Component Pattern Catalog (Pickering canon)

For every interactive primitive on the screen, verify it matches the canonical accessible pattern. Each fix here propagates to every instance of that component in the app.

### Button

- Use a real `<button type="button">`, never `<div role="button">`
- Activates on `Enter` AND `Space`
- Has a non-empty accessible name (visible text or visually-hidden text + decorative icon)
- Visible focus indicator with `:focus-visible`
- Transparent outline fallback for Forced Colors Mode

### Toggle Button

- `<button aria-pressed="true|false">` with the label describing **the thing** being toggled, not the current state ("Mute" stays "Mute"; the pressed state communicates whether it's currently muted)
- Avoid checkbox-styled-as-switch unless the surrounding form semantics actually require a checkbox

### Disclosure / Accordion

- Real `<button>` placed **inside** the heading (not the heading inside the button — preserves heading-key navigation)
- Toggle `aria-expanded="true|false"` on the button
- `aria-controls` points at the id of the disclosed region
- CSS uses attribute selector `[aria-expanded="true"]`, not a class
- Native `<details><summary>` is a valid alternative when JS isn't required
- For a group (accordion): each section is its own headed disclosure; do NOT add roving-tabindex — let Tab move through the buttons naturally

### Modal / Dialog

- Prefer native `<dialog>` element with `showModal()` (modern browsers handle focus trap and `inert` for free)
- Fallback: `role="dialog"` + `aria-modal="true"` + `aria-labelledby` pointing at the dialog's heading
- **On open**: focus moves into the dialog (first focusable element or heading with `tabindex="-1"`)
- **While open**: focus is trapped inside; Tab cycles inside; Shift+Tab too; rest of page is `inert`
- **On Escape**: closes
- **On close**: focus restores to the element that triggered it
- _"There is no such thing as an accessible CSS-only modal overlay."_ Never roll your own; use Scott O'Hara's pattern, Radix Dialog, Headless UI Dialog, or native `<dialog>`

### Tabs

- Prefer an accordion. Tabs are heavier and don't degrade on small screens
- If tabs are required: progressively enhance from an in-page table-of-contents (`<a href="#section-id">`) into:
    - `role="tablist"` on the container
    - `role="tab"` on each tab; `aria-selected="true"` on the active one
    - `role="tabpanel"` on each panel; `aria-labelledby` references its tab
    - **Roving tabindex**: `tabindex="0"` on the active tab, `tabindex="-1"` on the rest
    - **Arrow keys** move focus between tabs; `Home`/`End` jump to first/last; Tab moves into the panel
    - Manual activation (move focus with arrows, activate with Enter/Space) avoids accidental panel switching

### Menu

- **Distinguish navigation menus from application menus.** Most "dropdown menus" are navigation — they should be `<nav>` + `<ul>` of links, **not** `role="menu"`
- `role="menu"` is for application-style menus with arrow-key keyboard model (cut/copy/paste, file operations)
- Application menu requires: `role="menu"` on container, `role="menuitem"` (or `menuitemcheckbox`/`menuitemradio`) on items, arrow keys navigate, Enter activates, Escape closes, focus returns to trigger

### Tooltip vs Toggletip

- **Tooltip**: hover/focus reveal of supplementary info that's never essential. `aria-describedby` references the tooltip
- **Toggletip**: click-revealed pop-up; contents go in `role="status"` so they're announced when revealed
- Do not conflate them; do not use a tooltip as the only way to surface critical info

### Notification / Live Region

- `aria-live="polite"` for non-urgent updates (default)
- `aria-live="assertive"` only for genuine urgency (interrupts whatever the user is doing — equivalent to all-caps shouting)
- `role="status"` implies `aria-live="polite"`; `role="alert"` implies `aria-live="assertive"`
- Avoid abusing `role="alert"` for routine status messages

### Tables

- Real `<table>` + `<thead>` + `<tbody>` + `<th scope="col|row">` for tabular data
- Use `<caption>` for the table's purpose
- Never use tables for layout
- Do **not** turn responsive tables into `display:block` lists — destroys the semantic relationship between cells and headers; use horizontal scroll or a stacking technique that preserves the `<table>` semantics

### Form Inputs

- **Checkbox**: real `<input type="checkbox">`; visual replacement layered ON TOP via opacity:0 + position:absolute (not off-canvas, not display:none); decorative SVG with `aria-hidden="true"`/`focusable="false"`
- **Radio**: same hide-pattern as checkbox; group with `<fieldset>` + `<legend>`
- **Switch**: prefer `<button aria-pressed="true|false">` (the toggle-button pattern) over checkbox-styled-as-switch
- All inputs: top-aligned `<label>`, never floating-label; box shape, never bare line

### Combobox / Autocomplete

- Reference: W3C ARIA Authoring Practices combobox pattern (with the caveat that APG patterns have shipped with bugs — test in real screen readers)
- `role="combobox"` on the input (or wrapper depending on pattern variant)
- `aria-expanded` on the combobox
- `aria-controls` points at the listbox id
- `aria-activedescendant` points at the focused option (option doesn't actually receive focus)
- `role="listbox"` on the popup; `role="option"` on each item; `aria-selected="true"` on the active option
- Arrow keys navigate options; Enter selects; Escape closes

### Card

- Heading (`<h2>` or `<h3>` depending on document structure) lives **inside** the card
- Real `<a>` on the title text — not the whole card
- Extend the click area via CSS `::before` overlay positioned over the card; visual click target is the whole card, but the link semantics live on the title only
- Whole-card-as-link kills text selection, hides every nested link from a screen-reader's link list, and creates a single non-descriptive accessible name

### Content Slider / Carousel

- Native horizontal scroll with `overflow-x: auto` — not custom JS-driven translation
- `IntersectionObserver` flips off-screen items to `inert` or `aria-hidden` so AT users only interact with what's currently visible
- Provide pause/stop controls if auto-advancing (WCAG 2.2.2)

## Failure-Mode Catalog

Name the failure mode + the fix. The agent should call out the specific anti-pattern by name.

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

Bonus failure modes (Soueidan-flagged):

- **`outline: none` reflex** — never remove focus styles unless you replace them with something at least as visible. _"You wouldn't hide the cursor for a sighted mouse user."_
- **Hard contrast everywhere (#000 on #fff)** — paradoxically harms low-vision users with light sensitivity (Irlen syndrome). Tone the dark to `#222` and the light to `#eee` while still passing WCAG.
- **WAI-ARIA copy-paste from APG without testing** — even canonical patterns have shipped with bugs.
- **Reinventing native elements** — every custom `<select>` ever audited is worse than the native one.
- **Hidden inputs off-canvas (`left:-9999px`)** — kills explore-by-touch on mobile screen readers. Layer the native input on top of the visual replacement instead.

## Top 10 SPA-Specific Pitfalls (BuildOS-relevant)

The 2019 talks predate the SSR-streaming era; these are the BuildOS-specific extensions.

1. **Route-change focus.** Every internal link in a SvelteKit SPA is a silent navigation for AT users by default. Wire `afterNavigate` to move focus to `<main>` (or the new view's `<h1>`) and update `document.title`. **The single biggest accidental SPA accessibility regression in BuildOS.**
2. **Modal focus management.** Use native `<dialog>` + `showModal()` where possible. Otherwise `role="dialog"` + `aria-modal="true"` + focus trap + restore-on-close + `inert` on the rest of the page.
3. **Async error announcement.** Form validation errors must be announced via a live region OR focus moved to the first invalid field. Silent error states are silently broken.
4. **Streaming content (daily brief, agentic chat).** New content streamed via SSE/WebSocket should be announced via `aria-live="polite"` (not assertive — don't interrupt while the user is reading). Debounce announcements to paragraph boundaries; don't announce every token.
5. **Dynamic content live regions.** When AI extracts projects/tasks from a brain-dump, the screen-reader user must be told something happened. Live region announces "X projects and N tasks extracted" + focus moves to the new content (or its heading).
6. **`$effect`-driven state changes.** Reactive runes that mutate the DOM are equivalent to JS-mutated DOM. Screen readers re-cache, but **focus does not move on its own**. Wherever a user action triggers content change, manually move focus.
7. **Toast/notification stacking.** Each toast must reach a live region — `role="status"` for non-critical ("Brain dump processed"), `role="alert"` for blocking errors ("Calendar sync failed"). Without this, toasts are visible-only.
8. **AI-generated UI.** Constrain agentic chat output to Inkprint primitives — don't let the agent emit arbitrary HTML/JSX. Each primitive is already accessible, so the composition is too. Run an axe-core pass on agent-generated DOM before showing it.
9. **Drag-and-drop.** Every drag interaction must have a keyboard alternative — buttons or arrow-key keyboard model. The visual drag is enhancement.
10. **Voice/recording UI.** Brain-dump voice intake must announce state via a live region: "Recording... Stop... Processing... Done. We extracted 3 projects and 8 tasks." Without this, the screen-reader experience doesn't mirror the visual one.

## Output Format

Return findings grouped by category. For each finding include: WCAG criterion + name, what's wrong, why it matters, specific fix, severity.

```
## Foundation Issues
- [WCAG 2.4.6 Headings and Labels] <issue>
  - What: <one-sentence problem>
  - Why it matters: <user impact, especially for AT users>
  - Fix: <specific code-level fix>
  - Severity: blocker | serious | moderate | minor

## Component-Pattern Issues (per-component)
### <Component name — e.g. Dialog, Tab, Toggle>
- [WCAG 4.1.2 Name, Role, Value] <issue>
  - ...

## Keyboard / Focus Issues
- [WCAG 2.4.7 Focus Visible] <issue>
  - ...

## Screen-Reader Issues
- [WCAG 4.1.3 Status Messages] <issue>
  - ...

## Visual / Motion / Contrast Issues
- [WCAG 1.4.3 Contrast Minimum] <issue>
  - ...

## Form Issues
- [WCAG 3.3.2 Labels or Instructions] <issue>
  - ...

## Roll-up
- Top 5 highest-impact fixes (ranked by leverage — primitive-level fixes outrank one-off page fixes)
- Component primitives that need design-system-level fixes (so the fix propagates)
- Estimated severity distribution (N blockers, N serious, N moderate, N minor)
- Items requiring human review (judgment calls — "does this dialog NEED to be a dialog?", art-direction trade-offs, ambiguous AT behavior)
```

**Severity definitions:**

- **Blocker**: AT users cannot complete a core flow (no keyboard reachability, no accessible name on a primary action, modal focus broken, route-change silent for screen readers)
- **Serious**: AT users can technically complete the flow but the experience is degraded (missing live region for async update, low contrast, missing error association)
- **Moderate**: Inconvenience but not a blocker (suboptimal heading order, redundant ARIA, mouse-only nice-to-have)
- **Minor**: Polish (focus indicator slightly off-brand, decorative SVG missing `focusable="false"`)

## Guardrails

- Do not add ARIA to fix what semantic HTML already provides — if you're reaching for `role="button"`, use a `<button>`
- Do not remove visible focus indicators (no `outline: none` without a replacement)
- Do not assume mouse-only interaction — every drag, hover, and click must have a keyboard equivalent
- Do not use `aria-hidden="true"` on focusable content — creates a focus-visits-invisible-element bug
- Do not announce success messages without a live region — toasts are silent for AT users by default
- Do not use color alone to communicate state — pair red borders with icons + text
- Do not skip heading levels — `<h1>` → `<h3>` is broken; use `<h2>` and style it small
- Do not put `role="button"` on non-button elements — does not add focusability or keyboard activation
- Do not roll your own modal — use native `<dialog>`, Radix, Headless UI, or Scott O'Hara's pattern
- Do not use positive `tabindex` values (`tabindex="3"`) — only `0` or `-1`; positive values shatter the natural tab order
- Do not declare a screen "accessible" — accessibility is a gradient; mark findings as "more inclusive" / "less inclusive" and rank fixes by leverage
- Do not assert pass/fail on judgment calls — surface them under "items requiring human review"

## Cross-Linked Skills

- `ui-ux-quality-review` — same in-app surface; pairs with this skill when a screen has both a11y and visual-quality issues
- `marketing-site-design-review` — public-facing pages; same accessibility rules apply but section-scorecard is different
- `visual-craft-fundamentals` — typography, color, contrast — feeds the visual half of accessibility (contrast ratios, color-as-only-signal)

## Source Attribution

This skill is the source backbone for the BuildOS `accessibility-auditor` agent and is distilled from two primary sources:

- **Heydon Pickering — _Inclusive Components_** (Smashing TV, 2019). Author of *Apps For All*, *Inclusive Design Patterns*, *Inclusive Components*; co-author of the [Inclusive Design Principles](https://inclusivedesignprinciples.org/); design-system consultant for the BBC, Bulb, and others. Provides the per-component canon and the failure-mode catalogue.
    - YouTube: https://www.youtube.com/watch?v=jw7bRnFbwAI (Smashing TV, 2019-11-18)
    - Local analysis: `docs/research/youtube-library/analyses/2026-04-29_heydon-pickering_inclusive-components_analysis.md`
- **Sara Soueidan — _Applied Accessibility: Practical Tips for Building More Accessible Front-Ends_** (Codegram / Full Stack Fest, 2019). Independent front-end UI engineer; widely cited accessibility writer. Provides the per-screen audit, the hiding-techniques taxonomy, and WCAG criteria mapping.
    - YouTube: https://www.youtube.com/watch?v=are7ZZgA86I (Codegram, 2019-09-05)
    - Local analysis: `docs/research/youtube-library/analyses/2026-04-29_sara-soueidan_applied-accessibility_analysis.md`

Pickering answers "what does an accessible accordion / dialog / combobox look like?" Soueidan answers "how do I audit a screen for the issues that show up in production right now?" Together they cover the two layers of an accessibility audit.

WCAG criteria explicitly cited: 1.1.1 Non-text Content, 1.3.1 Info and Relationships, 1.4.1 Use of Color, 1.4.3 Contrast Minimum, 1.4.4 Resize Text, 1.4.11 Non-text Contrast, 2.1.1 Keyboard, 2.1.2 No Keyboard Trap, 2.2.2 Pause Stop Hide, 2.3.3 Animation from Interactions, 2.4.1 Bypass Blocks, 2.4.2 Page Titled, 2.4.3 Focus Order, 2.4.6 Headings and Labels, 2.4.7 Focus Visible, 2.4.11 Focus Appearance (WCAG 2.2), 2.5.5 Target Size (AAA), 2.5.8 Target Size Minimum (WCAG 2.2), 3.1.1 Language of Page, 3.3.1 Error Identification, 3.3.2 Labels or Instructions, 4.1.2 Name Role Value, 4.1.3 Status Messages.
