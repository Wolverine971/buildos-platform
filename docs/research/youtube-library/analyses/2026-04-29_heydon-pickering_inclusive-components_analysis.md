---
title: 'ANALYSIS: Inclusive Components — Heydon Pickering (Smashing TV, 2019)'
source_type: youtube_analysis
source_video: 'https://www.youtube.com/watch?v=jw7bRnFbwAI'
source_video_alt: 'https://www.youtube.com/watch?v=C7uX6uvHnlQ'
source_transcript: '../transcripts/2026-04-29_heydon-pickering_inclusive-components-smashing.md'
source_transcript_alt: '../transcripts/2026-04-29_heydon-pickering_building-inclusive-components.md'
video_id: 'jw7bRnFbwAI'
video_id_alt: 'C7uX6uvHnlQ'
channel: 'Smashing Magazine'
library_category: product-and-design
library_status: 'analysis'
transcript_status: available
analysis_status: available
processing_status: ready_for_skill_draft
processed: false
buildos_use: both
skill_candidate: true
skill_priority: high
skill_draft: ''
public_article: ''
indexed_date: '2026-04-29'
last_reviewed: '2026-04-29'
analyzed_date: '2026-04-29'
tags:
    - accessibility
    - inclusive-design
    - design-systems
    - aria
    - semantic-html
    - progressive-enhancement
    - keyboard-navigation
    - screen-readers
    - focus-management
    - components
path: docs/research/youtube-library/analyses/2026-04-29_heydon-pickering_inclusive-components_analysis.md
---

# ANALYSIS: Inclusive Components — Heydon Pickering (Smashing TV, 2019)

## Skill Combo Links

This source contributes to these multi-source skill combo indexes:

- [Product And Design Skill Combos](../skill-combo-indexes/PRODUCT_AND_DESIGN.md): Accessibility and inclusive UI review (proposed); Design system architecture review (proposed); UI/UX quality review (extension)

This is the source backbone for the BuildOS `accessibility-auditor` agent (currently has none) and the foundational text for any BuildOS skill that audits a screen, primitive, or component for inclusion.

## Source

- **Talk title:** "Inclusive Components" / "Building Inclusive Components"
- **Speaker:** Heydon Pickering (author of _Apps For All_, _Inclusive Design Patterns_, _Inclusive Components_; co-author of _Inclusive Design Principles_; design-system consultant for the BBC, Bulb, and others; _Every Layout_ with Andy Bell)
- **Channel:** [Smashing Magazine](https://www.youtube.com/@SmashingMagazineVideos)
- **Recordings:**
    - https://www.youtube.com/watch?v=jw7bRnFbwAI — Smashing TV, 01:26:16, 2019-11-18
    - https://www.youtube.com/watch?v=C7uX6uvHnlQ — alt cut, 01:49:55, 2019-11-07
- **Companion text:** _Inclusive Components_ (Smashing Magazine book); the public blog at inclusive-components.design is the same canon

The two recordings are essentially the same talk delivered twice; this analysis treats them as one source and supplements with Heydon's wider, well-known patterns from the book that the talk references but doesn't unpack.

## Core Thesis

Accessibility is not a checklist applied at the end of a project — it is a structural property of components, and design systems are the single best lever to fix or break it at scale. Heydon's argument runs in three claims:

1. **You don't make interfaces accessible. You make accessible interfaces.** Accessibility belongs inside the act of designing and building each component, not in a remediation pass after launch. As soon as you frame the work as "I shipped X, now make X accessible," it is already too late and very expensive.

2. **Design systems propagate accessibility — for good or ill.** A component built once, badly, becomes badly inaccessible everywhere it is reused. The same leverage works in reverse: a component built once, well, makes the entire product accessible by default. The relationship between accessibility and design systems is therefore _the_ leverage point, not an afterthought.

3. **Accessibility is a gradient, not a binary.** "It's not either accessible or not accessible. It's _more_ accessible or _less_ accessible." Inclusion bends; you push it toward inclusion or away from it with every decision. The job is to anticipate where each component could fail for someone — keyboard user, screen-reader user, low-power-device user, cognitively overloaded user, low-vision user — and to fix it at the component level before the failure can propagate.

The corollary that Heydon hammers: lean on **semantic HTML** first, **progressive enhancement** second, and reach for ARIA only as a last resort. Most accessibility failures happen when developers reach for ARIA roles to paper over the wrong base element. The WebAIM survey he cites is brutal: the more ARIA on a page, the _less_ accessible it tends to be.

## TL;DR Rules Table — Component Patterns

The talk spends most of its concrete time on the **collapsible / accordion**, but Heydon explicitly references the larger _Inclusive Components_ catalogue (collapsibles, tabs, content sliders, dialogs, theme switches, to-do lists, notifications, cards, tables, menus, toggles). The fixes below combine what he says in the talk with the canonical fixes from the book that the talk points at.

| #   | Component                         | Most important accessible-pattern fix                                                                                                                                                                                                                                           |
| --- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Collapsible / disclosure          | Wrap a real `<button>` _inside_ the heading (not the heading inside the button). Toggle `aria-expanded="true                                                                                                                                                                    | false"` on the button. Style off the state attribute, not a class. JS enhances; without JS the content is just visible.                        |
| 2   | Accordion (group of collapsibles) | Same rules as collapsible. Each section is its own headed disclosure. Don't add roving-tab-order keyboard logic — let Tab move through the buttons naturally.                                                                                                                   |
| 3   | Tabs                              | Prefer an accordion. If you must use tabs: progressively enhance from a same-page table-of-contents (`<a href="#section-id">`) into `role="tablist"` / `role="tab"` / `role="tabpanel"`. Implement arrow-key navigation between tabs, `Home`/`End` to jump, manual activation.  |
| 4   | Modal / dialog                    | Move focus into the dialog when it opens; trap focus inside; restore focus to the trigger when it closes. Announce contents (label the dialog with `aria-labelledby`). `<dialog>` element is preferred where supported.                                                         |
| 5   | Toggle button (on/off)            | Use a `<button>` with `aria-pressed="true                                                                                                                                                                                                                                       | false"`. Don't use a checkbox styled as a switch unless the surrounding semantics genuinely match a form control.                              |
| 6   | Cards                             | Don't make the whole card a link (destroys text selection, multi-link semantics). Use a real `<a>` on the title and a "pseudo-link" via CSS `::before` to extend the click target.                                                                                              |
| 7   | Tables                            | Use real `<table><thead><tbody>` with `<th scope="col                                                                                                                                                                                                                           | row">`. Do not turn tables into `display: block` lists for "responsiveness" — you destroy the semantic relationship between cells and headers. |
| 8   | Notifications / live regions      | Use `aria-live="polite"` for non-urgent updates, `aria-live="assertive"` only for genuinely urgent ones. Avoid abusing `role="alert"` for routine status messages.                                                                                                              |
| 9   | Menus / dropdowns                 | If it's a list of links → it's a `<nav>` with a `<ul>`, not `role="menu"`. `role="menu"` is for application-style menus with arrow-key keyboard model. Most "dropdown menus" are navigation, not menus.                                                                         |
| 10  | Content slider / carousel         | Native horizontal scroll with `overflow-x: auto`. Use `IntersectionObserver` to mark off-screen items invisible to screen readers (e.g. `inert` / `aria-hidden`) so AT users have a comparable experience. Don't reinvent scroll with JS-only buttons.                          |
| 11  | Tooltip vs toggletip              | Tooltip = hover/focus reveal of supplementary info, never essential. Toggletip = click-revealed pop-up with `role="status"` so the contents are announced. Don't conflate them.                                                                                                 |
| 12  | Theme switch (light/dark)         | Honor `prefers-color-scheme`. Switch via custom properties, not duplicated stylesheets. The simplest "invert" theme can be a CSS filter; an actual designed dark theme should use token-level light/dark pairs.                                                                 |
| 13  | Form inputs                       | Real `<label>` always, never placeholder-as-label. Box-shaped inputs with the label in the standard top position. Don't reinvent the floating-label "Material" input — Heydon's whole rant about Google's UX research catching up to instinct lives here.                       |
| 14  | Headings                          | Exactly one `<h1>` per page. Numbered `<h2>`–`<h6>` thereafter. Browsers still don't implement the HTML5 outline algorithm, so do _not_ rely on nested `<section><h1>`. Compute heading level explicitly (e.g. via React Context — see his "Heading Levels in Design Systems"). |
| 15  | Icons                             | Inline `<svg>` with `stroke="currentColor"` so it inherits text color and respects `prefers-color-scheme` and Windows High Contrast Mode automatically.                                                                                                                         |
| 16  | Focus indicators                  | Always visible by default. Use `:focus-visible` to keep mouse users from seeing a giant outline on click while keyboard users still get one. Add a transparent `outline` so Windows High Contrast Mode can repaint it as a visible box.                                         |
| 17  | Reduced motion                    | Respect `prefers-reduced-motion`. Strip non-essential transitions/animations. (His drum-machine work and _Every Layout_ both lean on this.)                                                                                                                                     |
| 18  | Single-page-app view changes      | When a "page" changes without a real navigation, move focus to the new view's heading and update the document title so screen readers announce the change. Otherwise the SPA is silently broken for AT users.                                                                   |
| 19  | Skip links                        | First focusable element on the page. Visible on focus. Targets the main landmark. Don't bury it.                                                                                                                                                                                |
| 20  | Buttons vs links                  | Button = changes state in place. Link = navigates somewhere. Heydon's collapsible Q&A specifically: a button is the right choice when the disclosed content is the _next_ element in source order; a link is right when you're truly jumping someplace.                         |

## Operating Lessons

### 1. Progressive enhancement first, ARIA last

Heydon's order of precedence is non-negotiable:

1. **Structured semantic HTML first.** Render a working version on the server. Headings, lists, paragraphs, buttons, links, forms. If JavaScript fails to load, the user gets the content.
2. **CSS to style.**
3. **JavaScript to enhance.** JS turns the static structure into the interactive component. If JS fails, you've lost interactivity but not the content.
4. **ARIA only where HTML cannot already express the semantics.** "If you're reaching for `role="button"` you should be using a `<button>`."

His worked example: a collapsible should ship from the server as a heading + paragraph. The JS then runs `wrapContent()` and `buttonifyHeading()` to insert a real `<button>` (with the heading text moved into it) inside the `<h2>`. If the JS toggle function fails, you don't end up with a broken button — you end up with the content visible by default, which is _better_ than a non-working component.

> "If I did the markup on the server such that it already included the buttons but then JavaScript didn't run, we'd get something _worse_ than if we hadn't tried to make it a collapsible at all."

The ARIA-is-last-resort rule has a specific failure mode: people put `role="button"` on a heading or `<div>`. That makes a screen reader call it a button — but it isn't keyboard-focusable, doesn't fire on `Enter`/`Space`, and (worse) destroys the underlying heading semantic. Screen-reader users who navigate by heading (the `2` key in JAWS/NVDA) lose that landmark. The fix is always: **use the right element, then augment it with state-only ARIA** like `aria-expanded`, `aria-pressed`, `aria-controls`, `aria-current`.

### 2. Semantic HTML as the load-bearing layer

Heydon's heuristic for any new component: walk through the native elements and ask "does HTML already do this?" Before you build a custom toggle, look at `<input type="checkbox">`, `<button aria-pressed>`, `<details><summary>`. Before you build a custom dropdown, look at `<select>` and `<details>`.

Headings deserve special care because they are still broken in 2019 (and largely still broken in 2026):

- **The HTML5 outline algorithm was never implemented by browsers.** Tim Berners-Lee proposed it; vendors didn't ship it.
- Therefore nesting `<section><h1>` and expecting it to compute as h2/h3/h4 _does not work_. Screen readers see a flat sea of h1s — useless for navigation.
- The fix in component frameworks: compute heading level explicitly. Heydon recommends React Context (the Sophie Alpert pattern) to know what depth you're at and render the right `<h2>`/`<h3>`/`<h4>`. His "Heading Levels in Design Systems" post on Medium is the reference.

### 3. The Inclusive Design Principles (his co-authored framework)

Heydon co-wrote the [Inclusive Design Principles](https://inclusivedesignprinciples.org/) with Henny Swan, Ian Pouncey, and Léonie Watson. They are the broader context that goes beyond WCAG:

1. **Provide comparable experience** — match the function, not the form, across modalities.
2. **Consider situation** — temporary disability, network conditions, distraction.
3. **Be consistent** — within your interface and with web conventions ("don't put navigation at the bottom because everyone else puts it at the top").
4. **Give control** — let users adjust to their preferences (zoom, motion, theme, density).
5. **Offer choice** — multiple ways to complete the same task.
6. **Prioritise content** — the content is the product; chrome serves it.
7. **Add value** — features should genuinely help, not just exist.

WCAG tells you criteria. The Inclusive Design Principles tell you posture. WCAG is "is this checkbox labeled?". IDP is "should this even be a checkbox?".

### 4. Component teardowns Heydon explicitly walks through (or points at)

#### Collapsible / accordion (worked example in the talk)

- Server-rendered as heading + paragraph.
- JS enhancement wraps the heading text in a `<button>` placed _inside_ the heading.
- The button gets `aria-expanded="false|true"` toggled on click.
- CSS uses an attribute selector (`[aria-expanded="true"]`) — not a class — to drive the open/closed visuals. This is a deliberate fail-safe: if the visual works, the state must be set; if you styled off a class, you could ship a broken `aria-expanded`.
- Iconography (plus/minus or chevron) is inline SVG with `stroke="currentColor"` so it inherits theme color.
- Tab order: native — every button is naturally focusable.
- Accordion above tabs by default. Accordions degrade gracefully on small screens because each section just stacks; tabs don't.

#### Tab interfaces (with all his caveats)

- "Probably you should use an accordion." If you must:
- Progressively enhance from an in-page table of contents.
- Use `role="tablist"` / `role="tab"` / `role="tabpanel"`.
- `aria-selected` on the active tab; `tabindex="-1"` on the inactive ones (roving tab-index).
- Arrow keys move between tabs; Tab moves into the panel.
- The BBC's GEL design system, which Heydon worked on, ran user research that contradicted the team's assumptions about tabs — the lesson is that even canonical WAI-ARIA Authoring Practices patterns sometimes lose to user reality.

#### Dialog / modal (the canonical SPA failure)

- Move focus into the dialog when opened.
- Label the dialog (`aria-labelledby` pointing at the dialog's heading).
- Trap focus inside while open.
- Restore focus to the trigger element when closed.
- Use `<dialog>` natively where you can; otherwise `role="dialog"` + `aria-modal="true"`.
- Without these, screen-reader users have no idea anything happened — visually a thing appeared, but the focus and announcement don't follow.

#### Toggle (on/off switch)

- `<button aria-pressed="true|false">` with the label describing the _thing_ being toggled, not the current state. ("Mute" stays "Mute"; the pressed state communicates whether it's currently muted.)

#### Cards

- Don't make the whole card one giant `<a>`. That breaks text selection, hides every nested link from a screen reader's link list, and creates a single non-descriptive accessible name.
- Instead: a real `<a>` on the title, and a CSS-only "pseudo-link" that extends the click area (using `::before` overlay).

#### Content slider

- Native horizontal scroll, not custom JS-driven translation.
- `IntersectionObserver` flips off-screen items to invisible (`inert` or `aria-hidden`), giving AT users the same affordance the visual user has — they only interact with what's currently visible.

#### Notification / live region

- `aria-live="polite"` is the default for non-blocking updates.
- `aria-live="assertive"` is for genuine urgency only — overusing it is the audio equivalent of all-caps shouting.
- `role="status"` and `role="alert"` are roles that imply live regions.

#### Theme / dark mode

- Drive everything off CSS custom properties keyed to `prefers-color-scheme`.
- Inline SVG inherits `currentColor`, so it changes for free.
- Avoid maximum contrast (`#000` on `#fff`) — Irlen syndrome and other low-vision conditions can find ultra-high contrast painfully optical-illusory. Tone the dark to `#222` and the light to `#eee` while still passing WCAG.

### 5. Focus management — what JS must do that HTML can't

Anywhere a "page-like" change happens without a real page navigation, the developer is responsible for moving focus and announcing. This is the central SPA gotcha.

- **Modal opens** → focus into the modal, on the first focusable element or the heading (with `tabindex="-1"`).
- **Modal closes** → focus back to the trigger.
- **SPA route change** → focus to the new view's heading, update `document.title`, optionally announce via a live region.
- **Form submission with inline error** → focus the first invalid field (or the error summary) so the user is taken to the problem.
- **Inline content insertion** (e.g. expand an accordion that was scrolled past) → consider whether to scroll-into-view _and_ whether focus should move.

Heydon's rule: when JS is what makes something happen, JS is what tells the browser (and through it the screen reader) that something happened.

### 6. Screen-reader behavior expectations

What a developer should _expect_ a screen reader to do:

- **Re-cache the DOM** as JS mutates it. This is why `aria-expanded` flipping is announced — the SR sees the new attribute on the element it's reading.
- **Announce focused elements** when focus moves. So programmatic `element.focus()` is the "say this now" call.
- **Read live regions** when their content changes (with `aria-live` or implicit roles).
- **Navigate by landmarks, headings, links, form fields, buttons.** This is why each of those needs to actually _be_ the right element — heading-key navigation is the screen-reader user's table of contents.
- **NOT** read everything in source order linearly — they jump. So the page must be navigable by structure, not by reading from the top.

### 7. Keyboard navigation patterns

Native keyboard model, in roughly the order Heydon expects them:

- **Tab / Shift+Tab** — moves focus through interactive elements in DOM order.
- **Enter** — activates links and submits default form buttons.
- **Space** — activates buttons; toggles checkboxes.
- **Arrow keys** — move within composite widgets: tablists, radio groups, menus, listboxes, sliders.
- **Escape** — closes dialogs, popovers, menus.
- **Home / End** — first/last in lists, tablists, comboboxes.

The composite-widget rule: inside a tablist or menu, only one item is in the tab order at a time (`tabindex="0"` on the active, `tabindex="-1"` on the rest). Arrow keys move focus _within_ the widget. Tab takes you _out_ of it. This is the WAI-ARIA "roving tabindex" pattern.

### 8. Reduced motion

`@media (prefers-reduced-motion: reduce)` should strip:

- Parallax.
- Decorative animations.
- Auto-advancing carousels.
- Fade/slide transitions on appearing content (or shorten them dramatically).

Functional motion (a focus indicator, a state change indicator) can stay, but should be quick and small. The user has actively asked the OS to dial motion down because it makes them sick.

### 9. Affordance and high-contrast mode

The transparent-outline trick is one of Heydon's tightest practical tips. Windows High Contrast Mode (now Forced Colors) strips backgrounds and shadows. Buttons that relied on a fill+shadow combination dissolve into bare text — losing their _affordance_ (they no longer look pressable).

The fix: every button gets `outline: 2px solid transparent; outline-offset: 2px;`. In normal mode you don't see it. In High Contrast Mode, the system repaints `transparent` as a visible color — and now the button has a visible boundary. Same trick is required on focus indicators that previously relied on a filled background.

### 10. Failure modes (Heydon's catalogue of "don't do this")

- **`role="button"` on a `<div>`** — does _not_ make it focusable, does _not_ make it activate on `Enter`/`Space`, does erase whatever semantic the original element had.
- **Heading turned into a button** — destroys heading-key navigation.
- **Click handlers on non-interactive elements** — `<div onClick>` is invisible to keyboard and screen-reader users.
- **Whole-card link** — kills text selection and link list navigation.
- **Float-label inputs (Material)** — Google's own research eventually told them what instinct already said: people don't recognize them as inputs. The line under the field reads as a divider between sections of the form.
- **Placeholder as label** — vanishes the moment the user starts typing.
- **Dialog without focus management** — silently broken for AT users.
- **SPA navigation without focus + title update** — silently broken for AT users.
- **`aria-live="assertive"` for routine messages** — equivalent to shouting; users disable it.
- **Class-based state styling** — the visual can work while the AT-facing state attribute is wrong; impossible to catch by visual QA.
- **Hard contrast everywhere** — paradoxically harms low-vision users with light sensitivity.
- **Custom focus rings that disappear in High Contrast Mode** — invisible focus = no keyboard usability.
- **Reinventing native elements** — every custom `<select>` Heydon has ever audited is worse than the native one.
- **WAI-ARIA copy-paste from authoring practices without testing** — even the canonical patterns have shipped with bugs (he saw this directly in BBC tab research).

### 11. The relationship between design systems and accessibility

This is the subtitle of Heydon's whole career arc, and the through-line of _Inclusive Components_.

A design system is:

- **A leverage multiplier.** The component you build once gets used a thousand times.
- **A vector for both quality and dysfunction.** "If you create a rubbish component in the first place, you'll be propagating badness everywhere."
- **The right unit of accessibility work.** WCAG criteria are abstract (perceivable, operable, understandable, robust); components are concrete. People build _things_, not criteria. He explicitly tried to write _Inclusive Design Patterns_ organized by criterion (keyboard, screen reader, language, etc.) and got writer's block — because that's not how anyone actually works.
- **The forcing function.** Once accessibility lives inside the component, it can't be skipped. A team can't "forget" to make the date picker accessible if the only date picker in the system is already accessible.

The corollary: **the design system is the agent's primary surface area.** Auditing one screen catches one screen's problems. Auditing the design-system primitives that screen is built from catches every screen built on those primitives, forever.

## Cross-Cutting Principles

- **You make accessible interfaces. You don't make interfaces and then make them accessible.** Accessibility is structural, not a remediation pass.
- **Semantic HTML > ARIA always.** The right element gets you 80% of accessibility for free. ARIA adds state to the right element; it doesn't substitute for it.
- **Accessibility is a gradient, not a binary.** Push toward inclusion; never declare "done."
- **The design system is the leverage point.** Fix the primitive, fix every screen that uses it.
- **Trust your instincts; don't reinvent conventions for fun.** Material-style float-labels were a research-validated mistake. Boxes work. Top-aligned labels work. Don't break what ships.
- **Progressive enhancement protects everyone, not just AT users.** The same architecture that survives a JS failure on a flaky train ride also survives a screen reader.
- **Components, not criteria, are the unit of work.** Organize your accessibility audits around real things you build, not abstract guideline numbers.
- **Not everything that exists should be accessible — some things shouldn't exist.** Inclusion includes ethics. Accessible surveillance is still surveillance.

## Quotables

> "You don't make interfaces accessible. You make accessible interfaces. Because I'm a designer and that's how I want other people to work."

> "Accessibility is not a binary thing. It's not either accessible or not accessible. It's _more_ accessible or _less_ accessible."

> "If you're reaching for `role="button"` you should be using a button."

> "Creating a design system which is inaccessible is obviously a problem. But also we need to think systematically about the way we approach accessibility — it's not just a box-checking thing."

> "If you're going to use ARIA, only use it for things that can't be done with HTML in the first place."

> "WCAG criteria are organized in terms of the criteria itself rather than the component. People build things, not criteria."

> "Try not to exclude people, rather than trying to include everyone."

> "Everything that exists should be accessible, but not everything should exist."

> "Lean on established conventions. What should be innovative is the content and the functionality, not the way we create the functionality."

> "I make accessible interfaces. I don't make interfaces accessible."

## Practical Checklist — How an agent should audit a screen

When auditing a BuildOS screen for inclusive components, walk this list:

**Foundation**

- [ ] Exactly one `<h1>` per page. Subsequent headings are explicit `<h2>`–`<h6>`, not nested-section h1s.
- [ ] Landmark elements present: `<header>`, `<nav>`, `<main>`, `<footer>`. `<main>` is the skip-link target.
- [ ] Skip link is the first focusable element and visible on focus.
- [ ] All interactive controls are real `<button>` or `<a>` (not `<div>`/`<span>`).
- [ ] Forms have real `<label>` elements, not placeholder-as-label or floating-label patterns.
- [ ] Tables for tabular data use `<table>`, `<thead>`, `<tbody>`, `<th scope>`.

**Semantics & ARIA**

- [ ] No `role="button"` on non-buttons. No `role="link"` on non-links.
- [ ] `aria-expanded`, `aria-pressed`, `aria-current`, `aria-controls`, `aria-selected` used correctly on real interactive elements.
- [ ] State styling is driven by attribute selectors (`[aria-expanded="true"]`), not by parallel classes.
- [ ] No `aria-hidden="true"` on focusable content.
- [ ] Live regions exist where async updates happen; `aria-live="polite"` by default, `assertive` only when warranted.

**Keyboard**

- [ ] Every interactive element reachable by Tab in a sensible source order.
- [ ] Composite widgets (tabs, menus, radios) use roving `tabindex` + arrow-key navigation.
- [ ] `Escape` closes dialogs, menus, popovers.
- [ ] No focus traps outside of intentional modal contexts.
- [ ] Visible focus indicator on every focusable element (including `:focus-visible` differentiation).
- [ ] Transparent outline on buttons so High Contrast Mode can repaint a visible box.

**Focus management**

- [ ] Modal opens → focus moves into the modal.
- [ ] Modal closes → focus returns to the trigger.
- [ ] SPA route change → focus moves to the new view's heading; `document.title` updates.
- [ ] Form errors → focus moves to first invalid field or error summary.

**Screen reader**

- [ ] Every image has meaningful `alt` (or `alt=""` if decorative).
- [ ] Every interactive control has a non-empty accessible name.
- [ ] Off-screen carousel items are `inert` or `aria-hidden` so AT users only see what's visible.
- [ ] Status messages reach a live region.

**Visual & motion**

- [ ] Color contrast ≥ 4.5:1 for body text, 3:1 for large text — both in light and dark mode.
- [ ] Color is not the _only_ way information is conveyed.
- [ ] `prefers-reduced-motion` strips decorative animation.
- [ ] `prefers-color-scheme` respected.
- [ ] Text scales to 200% zoom without horizontal scroll on the main content.

**Component-level**

- [ ] Each design-system primitive (button, input, dialog, dropdown, tab, toggle, card, table, accordion) has a documented accessible behavior — not just a visual style.
- [ ] No reinventing native controls without a documented reason and a documented accessible implementation.

## Application to BuildOS

### A. The `accessibility-auditor` agent

This is the source backbone the `accessibility-auditor` currently lacks. Concrete shape it should take:

- **Inputs:** a route, page, or component in the BuildOS web app.
- **Process:** walk the Practical Checklist above, but organized around component primitives first (audit Inkprint primitives in isolation), then screen-level composition (audit the route).
- **Reference canon:** Heydon's _Inclusive Components_ book + the Inclusive Design Principles + WAI-ARIA Authoring Practices (with caveats). When patterns conflict with WAI-ARIA APG, prefer the Heydon variant — APG has documented bugs.
- **Output shape:** issues grouped by **component primitive** (so the fix propagates), not by screen. A finding like "`<Dialog>` doesn't move focus to the heading on open" should fix every dialog in the app, not the one screen the auditor was looking at.
- **Severity model:** not pass/fail. Use Heydon's gradient — _more inclusive_ / _less inclusive_ — and rank fixes by leverage (primitive-level fixes outrank one-off page fixes).
- **Failure-mode library:** seed the agent with Heydon's failure-mode catalogue (section 10 above) so it can name the specific anti-pattern when it spots one (`role="button"` on `<div>`, whole-card link, float-label input, etc.).

### B. Inkprint primitives

Per CLAUDE.md, Inkprint is BuildOS's design system and the leverage point for everything below. Heydon's lens, applied:

- **Button** — must be a real `<button>`. Variants for primary/secondary/ghost/destructive. Transparent outline for High Contrast Mode. `:focus-visible` ring for keyboard users; no ring on mouse-click. Honor `aria-pressed` for toggle variants and `aria-expanded` + `aria-controls` for disclosure triggers.
- **Input** — top-aligned labels, never floating. Box shape, never bare-line. Real `<label htmlFor>`. Error states wired to `aria-describedby` pointing at the message; `aria-invalid="true"` when in error.
- **Dialog** — wraps `<dialog>` natively where possible, with `role="dialog"` + `aria-modal="true"` fallback. Auto focus-management baked in: focus into the dialog, trap, restore on close. Labelled by its heading via `aria-labelledby`. `Escape` closes.
- **Dropdown** — distinguish navigation dropdowns (which are `<nav>` + `<ul>` of links, not `role="menu"`) from action menus (which are `role="menu"` with full keyboard model). Currently most "dropdowns" in apps are mis-classified as menus; audit which is which.
- **Tab** — provide an accordion variant by default, tab variant only when explicitly requested. Tab variant uses real `role="tablist"` + arrow-key navigation, `aria-selected`, roving tabindex.
- **Toggle / switch** — `<button aria-pressed>`, label describes the thing, not the state. Avoid checkbox-styled-as-switch unless surrounding form semantics require it.
- **Focus state** — global token. `:focus-visible` ring on every interactive primitive. Dark-mode and light-mode variants both ≥ 3:1 against background. Transparent outline fallback for Forced Colors.
- **Contrast tokens** — verify the token system passes WCAG AA at body text and large text in both modes. Heydon's "tone the contrast down from `#000`/`#fff`" applies — `bg-card` and `text-foreground` should be slightly tempered.

### C. Daily-brief and brain-dump screens

- **Brain-dump entry surface** — the `<textarea>` is the most important input in the product. It needs a real `<label>`, a non-disappearing label, and an accessible name that explains what to write. The "voice note → transcript" flow should announce the transcription via a live region (`aria-live="polite"`) so a screen-reader user knows their voice was captured.
- **Brain-dump processing UI** — when AI-extracted projects/tasks appear, focus should move to the new content (or to a heading announcing "X new items extracted"), and the live region should describe the change. Without this, the screen-reader user doesn't know anything happened.
- **Daily-brief output** — the brief is long-form HTML. Headings must be a real outline (h1 = "Today's Brief", h2 per project, h3 per task group). Each section is a navigable landmark. "Mark as done" buttons on tasks are real `<button aria-pressed>` toggles.
- **Notifications / status** — every "Brief ready", "Brain-dump processed", "SMS sent" toast must reach a live region. Otherwise these are silent for AT users.
- **Time-sensitive content** (today's tasks, upcoming events) — never rely on color alone (red = overdue) to convey state; pair with text or icon.

### D. Onboarding flow

Onboarding is the highest-leverage moment for accessibility because failure here costs the user forever — they bounce before they can configure anything.

- **Step transitions** — each step is a "page-like" change in a SPA. Move focus to the step's heading. Update `document.title`.
- **Step indicator** — if it's "Step 2 of 5", communicate it as `<nav aria-label="Onboarding steps">` with `aria-current="step"` on the active one, not just visual styling.
- **Form fields per step** — top-aligned labels, real `<label>`, error focus management.
- **"Skip for now" / "Continue" buttons** — primary action visually distinguished and a real `<button>`. Don't make "Skip" easier to find than "Continue" by accident — use weight/contrast (Heydon's affordance principle), not just position.
- **Voice / brain-dump tutorial step** — the moment the user records their first brain-dump, the screen-reader experience must mirror the visual one. Live region announces "Recording... Stop... Processing... Done. We extracted 3 projects and 8 tasks. Here they are."

## Critical Analysis — Where Heydon's framework gets harder

Heydon's canon is shaped by 2015–2019 web — server-rendered HTML, jQuery-style progressive enhancement, vanilla JavaScript or component libraries that produced traditional DOM. Three areas where applying it cleanly to a 2026 BuildOS gets harder:

### 1. SPA frameworks (Svelte 5, React, Vue) and client-side state

Heydon's "render meaningful content from the server first, then JS enhances" model is tension-y with a SvelteKit SPA-style route that hydrates from a JSON payload. The mitigation:

- **SSR everything that can be SSR'd.** Don't render skeletons; render the real headings, paragraphs, and content shapes server-side, then hydrate.
- **Treat every reactive runes-driven state change as the equivalent of a JS-mutated DOM.** Screen readers will see the change because they re-cache; but _focus does not move on its own_. Wherever `$effect` causes a content change that the user did, manually move focus.
- **Route-change hooks must do the SPA work.** SvelteKit's `afterNavigate` hook is the right place to move focus to `<main>` and update the title — without it, every internal link is a silent navigation for AT users. This is the single biggest accidental SPA accessibility regression in the BuildOS app.

### 2. Custom components beyond his catalogue

_Inclusive Components_ covers ~12 patterns. Real BuildOS UI has dozens that aren't in the book: ontology trees, project graph views, drag-and-drop kanban, calendar week views, SMS conversation surfaces, agentic chat threads, voice-recording UI, brain-dump processing visualizations.

These need first-principles work using Heydon's _posture_ rather than his catalogue:

- **Reduce to a known primitive where possible.** A "drag-and-drop kanban" is structurally a list of lists; the keyboard model can be `Move up/down/left/right` via buttons or arrow keys, with the visual drag as enhancement.
- **Provide an alternative interaction.** Drag-and-drop must always have a non-drag fallback (buttons, keyboard, menu).
- **Don't invent new ARIA roles.** If you can't find an existing role that fits, the component is probably the wrong abstraction — break it down further.
- **Test with a real screen reader and a real keyboard, not axe-core.** Static analysis catches a fraction of the issues. Heydon's career is built on _using_ the tools, not running linters.

### 3. AI-generated UIs

The current frontier — UIs assembled at runtime by LLM agents — fights Heydon's whole frame. His framework assumes a designer/developer made the component once and got to test it. AI-generated UIs are made fresh per session and may differ per user.

The implication for BuildOS, which has agentic chat producing surfaces:

- **Constrain the generative space to known primitives.** Don't let an agent output arbitrary HTML/JSX; let it select from Inkprint primitives. Each primitive is already accessible, so the composition is too.
- **The "design system as accessibility leverage" point doubles for AI UIs.** If the agent can only emit accessible building blocks, it can only build accessible compositions.
- **Static checks at generation time.** Run an axe-core pass on agent-generated DOM before showing it; don't rely on post-hoc review.
- **Heydon's deeper warning applies hardest here:** "Everything that exists should be accessible, but not everything should exist." An agent that fluently generates _yet another carousel_ is not progress.

### 4. The "trust your instincts" rule cuts against research-led teams

Heydon repeatedly says rely on convention and instinct over over-research (the Material-input rant). For BuildOS's small team this is good guidance — we won't run 600-person studies. But it has a failure mode: instincts encoded in 2019 don't always survive 2026. The honest version: when convention and instinct say one thing, follow them; when they conflict (which is common in AI-product UI), borrow from peers in the segment, and test with five real users before committing.

### 5. The talk underspecifies the agent layer

Heydon's framework is for _humans designing components_. It does not directly answer: how should an _agent_ audit a screen? The Practical Checklist above is my translation of his framework into agent-executable form. The translation is imperfect — agents will catch the structural patterns (missing `<label>`, wrong heading order) but miss the judgment calls (does this dialog _need_ to be a dialog?). The `accessibility-auditor` agent should always end with "human review recommended for: …" and surface the judgment-call items rather than assert pass/fail on them.

---

**Bottom line.** Heydon's _Inclusive Components_ is the right backbone for BuildOS's accessibility work because it organizes around the same unit of work BuildOS already organizes around — the component primitive in a design system. Wire his catalogue into Inkprint, wire his failure-mode list into the `accessibility-auditor` agent, and the leverage compounds: fix once, fix everywhere.
