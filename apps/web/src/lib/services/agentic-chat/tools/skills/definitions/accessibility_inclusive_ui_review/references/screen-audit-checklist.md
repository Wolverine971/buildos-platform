<!-- apps/web/src/lib/services/agentic-chat/tools/skills/definitions/accessibility_inclusive_ui_review/references/screen-audit-checklist.md -->

# Per-Screen Audit Checklist

Use this reference when auditing a full screen, route, or page — or when the concern is keyboard, focus, headings/landmarks, hidden content, contrast, motion, forms, or screen-reader naming. Walk it top-to-bottom and cite the WCAG criterion for each finding. To verify name/role/state, inspect the Chrome DevTools Accessibility tab: screen-reader users live in the accessibility tree, not the DOM — if the name is empty or the role is `group`, it is broken regardless of how it looks.

## Foundation

- [ ] Page has a `<html lang="...">` attribute (WCAG 3.1.1 Language of Page)
- [ ] Page has a meaningful `<title>` (WCAG 2.4.2 Page Titled)
- [ ] Exactly one `<h1>` per page; subsequent headings are explicit `<h2>`–`<h6>`, never relying on the HTML5 outline algorithm (vendors never shipped it)
- [ ] Heading order descends without skipping levels; heading levels reflect document structure, not visual size (a small visual heading is still an `<h1>` if it titles the main section) (WCAG 1.3.1 Info and Relationships, 2.4.6 Headings and Labels)
- [ ] Landmark elements present and semantic: `<header>`, `<nav>`, `<main>`, `<aside>`, `<footer>` (WCAG 1.3.1, 2.4.1 Bypass Blocks)
- [ ] Every landmarked region has a heading (or a `.sr-only` heading wired via `aria-labelledby`)
- [ ] Skip link is the first focusable element, visible on focus, targets `<main>` (WCAG 2.4.1)

## Semantics & ARIA (only-when-necessary)

ARIA adds semantics HTML cannot express; it never adds behavior. The right element gets you 80% of accessibility for free.

- [ ] No `role="button"` on `<div>`/`<span>`; every interactive control is a real `<button>` or `<a>` (WCAG 4.1.2 Name, Role, Value)
- [ ] No `role="link"` on non-links; links use `<a href>`
- [ ] `aria-expanded`, `aria-pressed`, `aria-current`, `aria-controls`, `aria-selected`, `aria-checked` used correctly on real interactive elements
- [ ] State styling is driven by attribute selectors (`[aria-expanded="true"]`), not by parallel classes — a deliberate fail-safe: if the visual works, the state attribute must be set, so screen readers can never disagree with the eyes
- [ ] No `aria-hidden="true"` on focusable content (creates a focus-visits-invisible-element bug)
- [ ] No positive `tabindex` values anywhere (`tabindex="3"`) — only `0` or `-1`
- [ ] `aria-label` used only when no visible text label exists; prefer visible text + `<label>` association
- [ ] `aria-labelledby` references real elements that contain the label text
- [ ] `aria-describedby` references real elements that contain supplementary description (errors, hints)
- [ ] No ARIA role copy-paste from the APG without testing — the canonical patterns have shipped with bugs

## Keyboard

- [ ] Every interactive element reachable by Tab in a sensible source order (WCAG 2.1.1 Keyboard, 2.4.3 Focus Order)
- [ ] `Enter` activates links; `Enter` and `Space` both activate buttons
- [ ] `Space` toggles checkboxes
- [ ] Composite widgets (tabs, menus, radios, listboxes, sliders) use **roving tabindex** — exactly one element in the tab order at a time, arrow keys navigate within
- [ ] `Escape` closes dialogs, popovers, menus
- [ ] `Home`/`End` jump to first/last in tablists, comboboxes, menus
- [ ] No keyboard traps — Tab and Shift+Tab can always escape any region except an intentional modal (WCAG 2.1.2 No Keyboard Trap)
- [ ] No mouse-only interactions; every drag-and-drop has a keyboard alternative (WCAG 2.1.1)

## Focus Management

Whenever JS causes a "page-like" change — modal opens, route changes, content inserts, error appears — moving focus is the developer's responsibility.

- [ ] Visible focus indicator on every focusable element (WCAG 2.4.7 Focus Visible)
- [ ] Focus indicator contrast ≥ 3:1 against adjacent colors in both light and dark modes (WCAG 1.4.11 Non-text Contrast, 2.4.11 Focus Appearance — WCAG 2.2)
- [ ] `:focus-visible` used so focus rings appear on keyboard but not on mouse click
- [ ] Transparent outline (`outline: 2px solid transparent; outline-offset: 2px`) on buttons so Forced Colors / Windows High Contrast Mode can repaint a visible boundary
- [ ] **Modal opens** → focus moves into the modal (typically the first focusable element or the heading with `tabindex="-1"`)
- [ ] **Modal closes** → focus returns to the element that triggered it
- [ ] **SPA route change** → focus moves to the new view's heading; `document.title` updates (without this, every internal link is silent navigation for AT users)
- [ ] **Form error** → focus moves to the first invalid field or the error summary
- [ ] No focus on `aria-hidden="true"` or `display:none` content

## Hiding Techniques (pick the one that matches intent)

| Technique                                                | Hidden visually?  | Hidden from a11y tree? | When to use                                                          |
| -------------------------------------------------------- | ----------------- | ---------------------- | -------------------------------------------------------------------- |
| `display: none`                                          | Yes               | Yes                    | Element should not exist for any user                                |
| `visibility: hidden`                                     | Yes               | Yes                    | Same as `display:none`; preserves layout space                       |
| `hidden` attribute (HTML5)                               | Yes               | Yes                    | Equivalent to `display:none`; survives CSS-disabled (Reader mode)    |
| `aria-hidden="true"`                                     | No                | Yes                    | Decorative or duplicative content (icon SVGs inside labeled buttons) |
| `inert`                                                  | No (but inactive) | No (but unreachable)   | Background content while a modal is open                             |
| `.sr-only` (clip + 1×1 + absolute)                       | Yes               | No                     | Screen-reader-only labels, headings, instructions                    |
| `tabindex="-1"`                                          | No                | No                     | Removes from tab order; still scriptable-focusable                   |
| `position:absolute; opacity:0; w/h:1px` + visual overlay | Yes               | No                     | Hide native `<input>` while keeping it touch-explorable              |

- [ ] Each hidden element uses the technique that matches intent
- [ ] No interactive control hidden off-canvas (`left:-9999px`) or shrunk to invisibility — kills explore-by-touch on mobile screen readers
- [ ] Native form inputs (checkbox, radio, file) layered on top of their visual replacements so a finger sweep finds them
- [ ] Decorative SVGs have `aria-hidden="true"` AND `focusable="false"`
- [ ] Background page is `inert` (or `aria-hidden="true"`) while a modal is open

## Screen Reader

- [ ] Every `<img>` has meaningful `alt` text (or `alt=""` if purely decorative) (WCAG 1.1.1 Non-text Content)
- [ ] Every interactive control has a non-empty accessible name
- [ ] Icon-only buttons have an accessible name via one of: visually-hidden text + decorative SVG (preferred), `aria-label`, or `aria-labelledby` referencing a hidden span
- [ ] Async/dynamic content updates reach a live region: `aria-live="polite"` for non-urgent, `aria-live="assertive"` (or `role="alert"`) only for genuine urgency (WCAG 4.1.3 Status Messages)
- [ ] Off-screen carousel/slider items are `inert` or `aria-hidden` so AT users only see what's currently visible
- [ ] Charts/visualizations have an alternative text view (description via `aria-describedby` and/or a paired `<table>`)

## Visual & Motion

- [ ] Color contrast: body text ≥ 4.5:1 (WCAG 1.4.3 Contrast Minimum, AA); large text ≥ 3:1; UI components and graphics ≥ 3:1 (1.4.11); 7:1 for AAA where feasible
- [ ] Both light and dark modes pass contrast — never check only one
- [ ] Color is **not** the only way information is conveyed (red border + icon + text, not red border alone) (WCAG 1.4.1 Use of Color)
- [ ] `prefers-reduced-motion: reduce` strips parallax, decorative animation, auto-advancing carousels, fade/slide transitions on appearing content (WCAG 2.3.3 Animation from Interactions)
- [ ] No animations longer than 5 seconds without a pause/stop control (WCAG 2.2.2 Pause, Stop, Hide)
- [ ] `prefers-color-scheme` honored
- [ ] Text scales to 200% zoom without loss of content or horizontal scrolling on main content (WCAG 1.4.4 Resize Text)
- [ ] Touch targets ≥ 24×24 CSS pixels (WCAG 2.5.8 Target Size Minimum, 2.2); ≥ 44×44 for Level AAA / iOS HIG / 2.5.5
- [ ] No hard contrast everywhere (#000 on #fff) — paradoxically harms low-vision users with light sensitivity (Irlen syndrome). Tone the dark to `#222` and the light to `#eee` while still passing WCAG

## Forms

- [ ] Every input has a `<label>` element with `for`/`id` association (or `aria-labelledby` to a visible label) (WCAG 1.3.1, 3.3.2 Labels or Instructions)
- [ ] Labels are top-aligned, not floating-label (Material-style); the field is a real box, not a bare line
- [ ] Placeholder is never the only label — it disappears on type
- [ ] Required fields marked with both visible "\*" or "required" AND `aria-required="true"`
- [ ] Error messages associated with fields via `aria-describedby` (WCAG 3.3.1 Error Identification)
- [ ] `aria-invalid="true"` on fields in error
- [ ] Validation errors announced via a live region or focus moves to the error summary
- [ ] Success/save announcements use `aria-live="polite"` or `role="status"` (WCAG 4.1.3)
