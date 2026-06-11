<!-- apps/web/src/lib/services/agentic-chat/tools/skills/definitions/accessibility_inclusive_ui_review/references/component-patterns.md -->

# Per-Component Pattern Catalog

Use this reference when the surface contains interactive primitives — or when reviewing or building a design-system primitive in isolation. For every interactive primitive present, verify it matches the canonical accessible pattern below. Each fix here propagates: fix the design-system Dialog once and every dialog in the app is fixed, so primitive-level fixes outrank one-off page fixes.

## Button

- Use a real `<button type="button">`, never `<div role="button">`
- Activates on `Enter` AND `Space`
- Has a non-empty accessible name (visible text or visually-hidden text + decorative icon)
- Visible focus indicator with `:focus-visible`
- Transparent outline fallback for Forced Colors Mode

## Toggle Button

- `<button aria-pressed="true|false">` with the label describing **the thing** being toggled, not the current state ("Mute" stays "Mute"; the pressed state communicates whether it's currently muted)
- Avoid checkbox-styled-as-switch unless the surrounding form semantics actually require a checkbox

## Disclosure / Accordion

- Real `<button>` placed **inside** the heading (not the heading inside the button — preserves heading-key navigation)
- Toggle `aria-expanded="true|false"` on the button
- `aria-controls` points at the id of the disclosed region
- CSS uses attribute selector `[aria-expanded="true"]`, not a class
- Native `<details><summary>` is a valid alternative when JS isn't required
- For a group (accordion): each section is its own headed disclosure; do NOT add roving-tabindex — let Tab move through the buttons naturally

## Modal / Dialog

- Prefer native `<dialog>` element with `showModal()` (modern browsers handle focus trap and `inert` for free)
- Fallback: `role="dialog"` + `aria-modal="true"` + `aria-labelledby` pointing at the dialog's heading
- **On open**: focus moves into the dialog (first focusable element or heading with `tabindex="-1"`)
- **While open**: focus is trapped inside; Tab cycles inside; Shift+Tab too; rest of page is `inert`
- **On Escape**: closes
- **On close**: focus restores to the element that triggered it
- "There is no such thing as an accessible CSS-only modal overlay." Never roll your own; use Scott O'Hara's pattern, Radix Dialog, Headless UI Dialog, or native `<dialog>`

## Tabs

- Prefer an accordion. Tabs are heavier and don't degrade on small screens
- If tabs are required: progressively enhance from an in-page table-of-contents (`<a href="#section-id">`) into:
    - `role="tablist"` on the container
    - `role="tab"` on each tab; `aria-selected="true"` on the active one
    - `role="tabpanel"` on each panel; `aria-labelledby` references its tab
    - **Roving tabindex**: `tabindex="0"` on the active tab, `tabindex="-1"` on the rest
    - **Arrow keys** move focus between tabs; `Home`/`End` jump to first/last; Tab moves into the panel
    - Manual activation (move focus with arrows, activate with Enter/Space) avoids accidental panel switching

## Menu

- **Distinguish navigation menus from application menus.** Most "dropdown menus" are navigation — they should be `<nav>` + `<ul>` of links, **not** `role="menu"`
- `role="menu"` is for application-style menus with arrow-key keyboard model (cut/copy/paste, file operations)
- Application menu requires: `role="menu"` on container, `role="menuitem"` (or `menuitemcheckbox`/`menuitemradio`) on items, arrow keys navigate, Enter activates, Escape closes, focus returns to trigger

## Tooltip vs Toggletip

- **Tooltip**: hover/focus reveal of supplementary info that's never essential. `aria-describedby` references the tooltip
- **Toggletip**: click-revealed pop-up; contents go in `role="status"` so they're announced when revealed
- Do not conflate them; do not use a tooltip as the only way to surface critical info

## Notification / Live Region

- `aria-live="polite"` for non-urgent updates (default)
- `aria-live="assertive"` only for genuine urgency (interrupts whatever the user is doing — equivalent to all-caps shouting)
- `role="status"` implies `aria-live="polite"`; `role="alert"` implies `aria-live="assertive"`
- Avoid abusing `role="alert"` for routine status messages

## Tables

- Real `<table>` + `<thead>` + `<tbody>` + `<th scope="col|row">` for tabular data
- Use `<caption>` for the table's purpose
- Never use tables for layout
- Do **not** turn responsive tables into `display:block` lists — destroys the semantic relationship between cells and headers; use horizontal scroll or a stacking technique that preserves the `<table>` semantics

## Form Inputs

- **Checkbox**: real `<input type="checkbox">`; visual replacement layered ON TOP via opacity:0 + position:absolute (not off-canvas, not display:none); decorative SVG with `aria-hidden="true"`/`focusable="false"`
- **Radio**: same hide-pattern as checkbox; group with `<fieldset>` + `<legend>`
- **Switch**: prefer `<button aria-pressed="true|false">` (the toggle-button pattern) over checkbox-styled-as-switch
- All inputs: top-aligned `<label>`, never floating-label; box shape, never bare line

## Combobox / Autocomplete

- Reference: W3C ARIA Authoring Practices combobox pattern (with the caveat that APG patterns have shipped with bugs — test in real screen readers)
- `role="combobox"` on the input (or wrapper depending on pattern variant)
- `aria-expanded` on the combobox
- `aria-controls` points at the listbox id
- `aria-activedescendant` points at the focused option (option doesn't actually receive focus)
- `role="listbox"` on the popup; `role="option"` on each item; `aria-selected="true"` on the active option
- Arrow keys navigate options; Enter selects; Escape closes

## Card

- Heading (`<h2>` or `<h3>` depending on document structure) lives **inside** the card
- Real `<a>` on the title text — not the whole card
- Extend the click area via CSS `::before` overlay positioned over the card; visual click target is the whole card, but the link semantics live on the title only
- Whole-card-as-link kills text selection, hides every nested link from a screen-reader's link list, and creates a single non-descriptive accessible name

## Content Slider / Carousel

- Native horizontal scroll with `overflow-x: auto` — not custom JS-driven translation
- `IntersectionObserver` flips off-screen items to `inert` or `aria-hidden` so AT users only interact with what's currently visible
- Provide pause/stop controls if auto-advancing (WCAG 2.2.2)
