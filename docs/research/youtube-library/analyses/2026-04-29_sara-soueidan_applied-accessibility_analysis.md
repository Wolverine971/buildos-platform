---
title: 'ANALYSIS: Applied Accessibility — Practical Tips for Building More Accessible Front-Ends — Sara Soueidan'
source_type: youtube_analysis
source_video: 'https://www.youtube.com/watch?v=are7ZZgA86I'
source_transcript: '../transcripts/2026-04-29_sara-soueidan_applied-accessibility.md'
video_id: 'are7ZZgA86I'
channel: 'Codegram'
channel_url: 'https://www.youtube.com/@Codegram'
upload_date: 2019-09-05
duration: '01:12:01'
views: 5614
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
    - a11y
    - wcag
    - aria
    - semantic-html
    - focus-management
    - screen-readers
    - svg-accessibility
    - inclusive-design
    - front-end
path: docs/research/youtube-library/analyses/2026-04-29_sara-soueidan_applied-accessibility_analysis.md
---

# ANALYSIS: Applied Accessibility — Practical Tips for Building More Accessible Front-Ends — Sara Soueidan

## Skill Combo Links

This source contributes to these multi-source skill combo indexes:

- [Product And Design Skill Combos](../skill-combo-indexes/PRODUCT_AND_DESIGN.md): Accessibility and inclusive UI review (proposed); UI/UX quality review (extension); Visual craft fundamentals (proposed)

## Source

- **Title:** Applied Accessibility: Practical Tips for Building More Accessible Front-Ends
- **Speaker:** Sara Soueidan (independent front-end UI engineer; widely cited accessibility writer; Smashing Magazine contributor)
- **Channel:** [Codegram](https://www.youtube.com/@Codegram) — Full Stack Fest 2019 conference recording
- **URL:** https://www.youtube.com/watch?v=are7ZZgA86I
- **Duration:** 01:12:01
- **Upload Date:** 2019-09-05
- **Views (at index):** 5,614
- **Format:** Conference talk built from real client-project case studies (an unnamed publishing site, Khan Academy 2018 Annual Report). Live coding interludes in Chrome DevTools. Heavy use of macOS VoiceOver Rotor demos.

## Core Thesis

Accessibility is not specialist consulting work that gets bolted on at the end of a project. It is **hands-on front-end work that ships every day** — the responsibility of every front-end developer who writes HTML, CSS, SVG, or JavaScript. Soueidan's lens: most accessibility wins come from using **the correct native HTML element for the job** and resisting the temptation to invent custom controls. ARIA exists to patch what HTML cannot express — never to replace it. Or, in the canonical formulation she keeps returning to: _"Aria is not there to add functionality to elements. It's only used to add semantic parity with HTML."_

The corollary, which she demonstrates over and over: a `<div>` with `role="button"` and `tabindex="0"` is **never as good as a `<button>`**. By the time you have wired up keyboard handlers, focus management, and ARIA attributes, you have rebuilt — badly — what `<button>` ships natively. The cheapest accessibility decision is upstream: pick the right element on day one.

She frames the work in three planes that the talk circles back to repeatedly:

1. **Document structure** — semantic landmarks and headings give screen-reader users a navigable skeleton via the Rotor.
2. **The accessibility tree** — a parallel structure to the DOM, derived from your markup and styles, that determines what assistive tech actually sees.
3. **Interaction semantics** — focus visibility, keyboard operability, hidden-but-accessible content, and alternative views for visual-only data.

## TL;DR Rules Table

| #   | Rule                                                                  | Concrete guideline                                                                                                                                       |
| --- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Semantic HTML before everything                                       | Use the element that describes the content. `<button>` for buttons, `<nav>` for nav, `<main>` for main, `<h1>`–`<h6>` for headings.                      |
| 2   | Use HTML5 landmarks; do not skip them                                 | `<header> <nav> <main> <aside> <footer>`. ~80% of screen-reader users navigate by regions (WebAIM survey).                                               |
| 3   | Provide a heading for every landmarked region                         | If the design has no visible heading for the main content, add a screen-reader-only `<h1>`. Reference it from `<main>` via `aria-labelledby`.            |
| 4   | Follow heading order; never skip levels                               | Heading levels reflect document structure, not visual size. A small heading is still an `<h1>` if it titles the main section.                            |
| 5   | A `<div role="button" tabindex="0">` is never as good as a `<button>` | You will rebuild Enter/Space activation, focus order, and accessibility-tree role — badly. Use the native element.                                       |
| 6   | ARIA is a last resort                                                 | "Aria is not there to add functionality to elements. It's only used to add semantic parity with HTML." Adding `role="button"` does not make it a button. |
| 7   | Inspect the accessibility tree                                        | Chrome DevTools → Accessibility tab. Every interactive element should have a meaningful name and role.                                                   |
| 8   | Hide visually OR from assistive tech, never accidentally both         | Pick the right hiding technique for the job (see hiding-techniques table below).                                                                         |
| 9   | Icon buttons need an accessible name                                  | Use a visually hidden text label, `aria-label`, or `aria-labelledby`. Hide the SVG with `aria-hidden="true"` and `focusable="false"`.                    |
| 10  | Never remove focus indicators                                         | A visible focus state is a WCAG requirement. If you remove the default, you must replace it with something at least as visible.                          |
| 11  | Use `:focus-visible` (with a polyfill) for keyboard-only focus rings  | Show focus on keyboard tabbing, not on mouse click. Use the `focus-visible` polyfill until browser support catches up.                                   |
| 12  | Match focus contrast to the design — but never fall below visible     | Focus rings can be on-brand. They cannot be invisible. Hover and focus styles do not need to match — focus should be more prominent.                     |
| 13  | Hide interactive controls so they remain explorable by touch          | Position absolute + opacity 0, sized 1×1, layered on top of the visual replacement. Never `display:none` or off-canvas.                                  |
| 14  | Use `<object>` for charts you want to make accessible                 | Provides built-in fallback content slot. Add `role="img"`, `aria-label` for the title, `aria-describedby` for the data description.                      |
| 15  | Always provide an alternative text view of charts                     | SVG accessibility support is "highly inconsistent." Don't rely on ARIA-roled SVG alone. Pair the chart with a description or table.                      |
| 16  | Use modal dialogs sparingly; never roll your own                      | "There is no such thing as an accessible CSS-only modal overlay." Use a tested implementation (Soueidan recommends Scott O'Hara's).                      |
| 17  | Use `tabindex="-1"` to remove things from the tab order               | Especially `<object>`/iframe-like embeds that trap focus. Never use positive `tabindex` values — they break the natural tab order.                       |
| 18  | `<svg focusable="false">` to prevent IE/legacy double tab stops       | Older IE/Edge made `<svg>` elements focusable by default. Set `focusable="false"` to keep tab order clean.                                               |
| 19  | Test with the Rotor (or NVDA/JAWS equivalents)                        | If your headings list is empty, your landmarks are missing, or your icon button announces "group," your structure is broken.                             |
| 20  | Test with the keyboard                                                | Tab through every screen. If you can't reach a control, or you can't see where you are, the screen is not accessible.                                    |

### Hiding-techniques table (Soueidan's full taxonomy)

| Technique                                              | Hidden visually? | Hidden from assistive tech? | When to use                                                                                              |
| ------------------------------------------------------ | ---------------- | --------------------------- | -------------------------------------------------------------------------------------------------------- |
| `display: none`                                        | Yes              | Yes                         | Element should not exist for any user. Removed from DOM and a11y tree.                                   |
| `visibility: hidden`                                   | Yes              | Yes                         | Same as `display:none` for a11y; preserves layout space.                                                 |
| `hidden` attribute (HTML5)                             | Yes              | Yes                         | Equivalent of `display:none`. Useful when CSS is disabled (reader mode, Pocket, Safari Reader).          |
| `aria-hidden="true"`                                   | No               | Yes                         | Hide decorative or duplicative content from screen readers. Common on icon SVGs inside labelled buttons. |
| `focusable="false"` (on SVG)                           | No               | No                          | Removes the SVG from keyboard tab order in legacy IE/Edge. Pair with `aria-hidden`.                      |
| `.sr-only` (clip + 1×1 + absolute)                     | Yes              | No                          | Provide names/labels for screen-reader users only — headings, icon-button labels.                        |
| `tabindex="-1"`                                        | No               | No                          | Removes from the tab order; still scriptable focusable via `.focus()`.                                   |
| `position:absolute; opacity:0; w/h:1px` (with overlay) | Yes              | No                          | Hide native `<input>` while keeping it explorable by touch. Layer it on top of the visual replacement.   |

## Operating Lessons

### 1. Semantic HTML first — the substrate of every accessible site

Soueidan's opening move: **"Semantic HTML is descriptive HTML. Each HTML element describes the type of content that it creates."** A heading is an `<h2>`, a paragraph is a `<p>`, a navigation is a `<nav>`, a button is a `<button>` — **not a `<div>`**.

The argument is not stylistic. Sighted users get the page skeleton "just by quickly scanning with their eyes." A non-sighted user can only get that skeleton if the markup encodes it. HTML5 sectioning elements (`<section>`, `<main>`, `<nav>`, `<header>`, `<footer>`, `<aside>`) translate the visual hierarchy into a structural one that assistive tech can navigate.

She illustrates the consequence with the **Microsoft "Bingo Bakery" gamified video**: a screen-reader user named Hope tries to order a birthday cake. With no landmarks she gets stuck cycling through 18 unlabeled links. With landmarks she teleports to `main` instantly. With headings she swings between section titles. Each layer of semantics is a gameplay mechanic that turns "impossible" into "effortless."

The operating consequence: **landmarks and headings are not a polish pass.** They are the primary interface for ~80% of screen-reader users (Soueidan cites the WebAIM screen-reader user survey). If your `<main>` has no heading, the Rotor reads the description paragraph as the title — which is wrong _and_ unhelpful.

### 2. Document structure case study — the "resources tagged with generative" page

The most valuable extended example in the talk. A page lists articles tagged with "generative." Soueidan's first instinct was to mark the sidebar (`<aside>`) with the heading "Resources tagged with generative" inside it. Three problems emerged:

1. **The heading was incomplete.** "Resources tagged with" without "generative" is meaningless when the Rotor reads it standalone.
2. **The heading was in the wrong region.** Visually it titled the main content; structurally she had nested it under `<aside>`.
3. **The main region had no heading at all** — so the Rotor read the description paragraph as a stand-in title.

The fix had three moves:

1. Wrap the entire phrase ("Resources tagged with generative") in one `<h1>` with a `<span>` around "generative" for visual styling. The screen reader hears one complete heading.
2. Move the heading **out** of the sidebar at the markup level, even though CSS Grid keeps it visually positioned where the design demands.
3. Use `aria-labelledby` on `<main>` pointing at the heading's `id`, so the Rotor announces the right title for the main region.

**The deeper lesson:** _heading levels follow document structure, not visual size._ The page heading was visually small (almost paragraph-sized) and a developer would naturally reach for `<h6>`. It is still an `<h1>`, because it titles the main section. Style it small in CSS. Mark it semantically as the main heading.

### 3. The accessibility tree — what assistive tech actually sees

> "If you're a front-end developer, you need to be familiar with the accessibility tree if you want to build accessible user interfaces."

Browsers build a parallel tree alongside the DOM, populated only by **meaningful** elements. `<div>` and `<span>` are excluded — they are generic containers with no semantic role. Native HTML elements map implicitly: `<img alt="...">` becomes an a11y node with `role="image"` and `name="<alt text>"`. `<button>Submit</button>` becomes a node with `role="button"` and `name="Submit"`.

Soueidan's live-coding demo:

1. `<div>Submit</div>` — a11y tree shows a "group" with no name. Screen reader announces nothing useful.
2. Add `role="button"` — name now exposed via text content, role correct. Looks good?
3. Try to tab to it — fails (divs aren't focusable).
4. Add `tabindex="0"` — now tabbable, but Enter/Space don't activate it. You'd have to wire that in JavaScript.
5. **Just use `<button>`** — same CSS class, every behavior comes for free. "I'm applying the same class name to both the div and the button and they look exactly the same. Why not just use the button to begin with?"

**Inspecting the tree:** Chrome DevTools → Accessibility tab (next to Styles). Click any element and read off `name`, `role`, `value`, `state`. If the name is empty or the role is wrong, your component is broken regardless of how it looks.

### 4. ARIA — a last resort with strict semantics

Soueidan's most-quoted line: _"Aria is not there to add functionality to elements. It's only used to add semantic parity with HTML."_ Adding `role="button"` to a `<div>` does not make it a button — it only makes assistive tech announce the role. You still have to add tab order, keyboard handlers, focus management, and disabled-state behavior yourself, and you will get parts of it wrong.

The three ARIA labelling attributes she walks through, with strict distinctions:

- **`aria-label="menu"`** — provides the accessible name directly as a string. Overrides any text content inside the element. Useful when there is no visible text. Example: an icon button with no text gets `aria-label="Menu"`. Caveat: invisible to translation tools and accessibility audits that read the DOM.
- **`aria-labelledby="someId"`** — references another element's content as the accessible name. The referenced element can be hidden (via the `hidden` attribute or `display:none`) and still be exposed as the name. Announced **before** the role.
- **`aria-describedby="someId"`** — same referencing model, but announced **after** the role and used for descriptions, not names. Used for the Khan Academy chart pattern below.

**The icon-button playbook (four techniques, in order of preference):**

1. **Visible icon + visually hidden text** — `<button><svg aria-hidden="true" focusable="false">…</svg><span class="sr-only">Menu</span></button>`. Screen reader hears "Menu, button." Most translatable, least error-prone.
2. **`aria-label` on the button** — `<button aria-label="Menu"><svg aria-hidden focusable="false">…</svg></button>`. The label overrides any inner text.
3. **`aria-labelledby` referencing a hidden span** — useful when the label is reused or already exists elsewhere on the page.
4. **Use the SVG as the label** — give the SVG a `<title>` and let the a11y API use SVG content as the button name. _"There are certain browser/screen-reader combinations that have bugs with these"_ — verify in Scott O'Hara's published test matrix.

### 5. Focus management — a WCAG requirement, not a nice-to-have

> "A visible focus is a requirement for a site to be considered accessible under the Web Content Accessibility Guidelines. If you don't have a visible focus style, your website is not accessible."

The single most violated rule in production front-end. The `outline: none` reflex (because the default browser ring "doesn't match the design") leaves keyboard users with no way to tell where they are on the page. Soueidan's analogy: _"You wouldn't hide the cursor for a sighted mouse user. Why would you hide their way to tab through the page?"_

The full focus playbook:

1. **Never remove focus styles unless you replace them.** Default browser rings are inconsistent (Chrome blue/orange ring; Firefox/IE thin dotted line — sometimes barely visible). It's _good practice_ to override them with a consistent, well-contrasted custom ring.
2. **Custom focus rings should:**
    - Have good color contrast against every background they appear on.
    - Be complementary to the shape and size of the element (not a generic blanket outline).
    - Be **consistent across browsers** (which the default is not).
    - Be **applied only on keyboard focus**, not on mouse click.
3. **`:focus-visible` is the modern selector** — fires only on keyboard focus. Browser support is improving but was minimal at recording time. Use the [`focus-visible` polyfill](https://github.com/WICG/focus-visible) for cross-browser support today.
4. **Patrick Lauke's CSS-only enhancement pattern** (referenced explicitly in the talk):

    ```css
    /* All focus gets the default style as a baseline */
    button:focus {
    	outline: 2px solid orange;
    }
    /* Browsers that support :focus-visible undo it for non-keyboard focus */
    button:focus:not(:focus-visible) {
    	outline: none;
    }
    /* And get a richer style for keyboard focus only */
    button:focus-visible {
    	outline: 3px solid orange;
    	box-shadow: 0 0 0 4px rgba(255, 165, 0, 0.3);
    }
    ```

5. **Polyfill version uses a class:**

    ```css
    button:focus {
    	outline: 2px solid orange;
    }
    button:focus:not(.focus-visible) {
    	outline: none;
    }
    button.focus-visible {
    	outline: 3px solid orange;
    }
    ```

    Soueidan flags a real-world bug she hit: defining both `:focus-visible` and `.focus-visible` in the same rule causes browsers without native support to ignore the entire declaration block, breaking the polyfill. **Separate the two declarations.**

6. **Focus styles do not need to match hover styles.** Hover users already know where their cursor is; focus users are relying on the indicator. _"Unless you give them something very prominent that they can easily see, they could be confused — they don't know where they are on the page."_
7. **Focus indicators can be on-brand.** Soueidan's Khan Academy work used an organic green active state and a popping yellow focus state — both fit the art direction; both met contrast requirements.

### 6. Modal dialogs — almost always wrong

Direct quote, repeated emphatically: _"There is no such thing as an accessible CSS-only modal overlay. There is no such thing as using the checkbox hack to open a modal dialog and being accessible. That is not accessible."_

What an accessible modal dialog actually requires:

- **Open:** move focus to the dialog (typically the first focusable element or the close button).
- **Trap focus inside the dialog** while it is open — Tab should cycle inside; Shift+Tab too.
- **Escape closes the dialog.**
- **On close, return focus to the element that triggered it.**
- **`aria-modal="true"` and `role="dialog"`** with `aria-labelledby` (or `aria-label`) and `aria-describedby` for the dialog's title and body.
- **Inert or `aria-hidden`** on the rest of the page so screen-reader virtual cursors do not reach background content.

Soueidan's recommendation: **use Scott O'Hara's tested implementation** rather than rolling your own. She uses it in every client project. (Modern equivalents: `<dialog>` with the polyfill, Radix Dialog, Headless UI Dialog, or Reach UI Dialog — any of which encode the focus-trap and restore-focus behaviors.)

### 7. SVG and data visualizations — accessibility is your job, not the format's

> "SVG is not equipped with the semantics needed to convey the content of that information to the user."

SVG charts are images. Screen readers announce them as images and stop. The data — the actual point of the chart — is not exposed. The talk's central case study is the **Khan Academy 2018 Annual Report** site, which had many static charts.

**Embedding choice matters.** Soueidan walks through 6 techniques (background-image, `<img>`, `<picture>`, `<iframe>`, `<object>`, inline `<svg>`) and lands on `<object>` for the Khan Academy charts because:

- **External file** — keeps the HTML clean.
- **Cacheable** — the SVG file caches across visits.
- **Has a built-in fallback content slot** — anything between the opening and closing `<object>` tags is rendered if the SVG fails to load.
- **Scriptable** — JavaScript can reach into the SVG document if needed.
- **Animatable.**

The accessibility scaffolding she layered on:

1. **Add `role="img"`** — otherwise the object is announced as "frame" with the file path as the name. (Also a frame trap: needs `tabindex="-1"` to remove it from tab order, since you don't want the chart focusable.)
2. **Add `aria-label`** for the chart title — e.g., "Khan Academy math usage in Long Beach."
3. **Provide a description** — the fallback content between `<object></object>` is _not_ exposed to screen readers in this configuration. So instead, put the description in an off-screen element and reference it with **`aria-describedby`**. The description is announced after the role, exactly where you want the data.

Final markup pattern:

```html
<object
	data="chart.svg"
	role="img"
	tabindex="-1"
	aria-label="Math usage in Long Beach"
	aria-describedby="chart-desc"
>
	<!-- visible only if the SVG fails to load -->
	Math usage in Long Beach: 14,000 students used Khan Academy in 2018, up from 9,000 in 2017…
</object>
<p id="chart-desc" class="sr-only">
	14,000 students used Khan Academy in 2018, up from 9,000 in 2017…
</p>
```

**SVG accessibility support is "highly inconsistent."** Even with ARIA roles applied to inner SVG elements (Léonie Watson's bar-chart-as-table technique using `role="table"`, `role="row"`, `role="columnheader"`), browser/screen-reader combinations vary. Always pair the chart with an alternative text view — table, description, or both.

### 8. Hiding content — four options, only two of which preserve accessibility

Soueidan dedicates a whole section to this because the wrong choice is the most common accessibility regression in custom controls. The full taxonomy:

- **`display: none`** and **`visibility: hidden`** — remove the element from both the DOM and the accessibility tree. Use only when the element should not exist for any user.
- **`hidden` attribute** — HTML5 native. Equivalent to `display:none`. Useful where CSS may not run (reader mode, Pocket, Safari Reader).
- **`aria-hidden="true"`** — keeps the element visible but removes it from the a11y tree. The standard pattern for decorative SVG icons inside labeled buttons.
- **`.sr-only` class** (Scott O'Hara's pattern) — visually hidden, accessibility-tree-visible:

    ```css
    .sr-only {
    	position: absolute;
    	width: 1px;
    	height: 1px;
    	padding: 0;
    	margin: -1px;
    	overflow: hidden;
    	clip: rect(0, 0, 0, 0);
    	white-space: nowrap;
    	border: 0;
    }
    ```

**Critical detail:** even an element hidden with `display:none` or the `hidden` attribute can still be referenced by `aria-labelledby` or `aria-describedby` and exposed as a name/description for another element. The hidden-but-still-labelling pattern is a legitimate ARIA technique.

### 9. Custom checkboxes — and the "explore by touch" trap

The most counter-intuitive lesson in the talk. The natural "accessible checkbox" pattern:

- Hide the native `<input type="checkbox">`.
- Show a styled SVG square that visually replaces it.
- Toggle the SVG via the `:checked` sibling selector.

The wrong way to hide the input:

- **Move it off-canvas** (`position:absolute; left:-9999px`) — kills explore-by-touch.
- **Shrink it with `.sr-only`** — too small for a touch target to find.

**Why "explore by touch" matters:** mobile screen-reader users often run a finger across the screen, hearing whatever is directly under their finger announced. If the native input is off-canvas, their finger never finds it and they cannot toggle the control. If it is shrunk to 1×1, they may not be able to interact with it.

**The right way:**

1. `position: absolute` (remove from layout).
2. `width: 1px; height: 1px` (Chrome enlarges this to a more reasonable hit target).
3. `opacity: 0` (visually hidden).
4. **Layer the native input on top of the visual replacement** — wherever the toggle visually appears, the native input must be hit-testable in the same place.
5. Apply your custom focus style to the SVG (using `:focus + svg` or sibling selectors).
6. `aria-hidden="true"` and `focusable="false"` on the visual SVG (it's decorative — the native checkbox carries the semantics).

Soueidan attributes this to Scott O'Hara: _"99% of all of the tutorials on the internet that teach you how to create accessible styled checkboxes do not mention the thing with the explore-by-touch."_

The same rule applies to **any interactive element you visually replace**: file inputs, radio buttons, toggle switches. Position the native control where the user's finger expects it.

### 10. Tab order, `tabindex`, and the `<svg focusable>` gotcha

- `tabindex="0"` — adds an element to the natural tab order at its DOM position. Use sparingly; prefer native elements that are already focusable.
- `tabindex="-1"` — removes from the tab order; element is still scriptable-focusable via `.focus()`. Useful for: the `<object>` chart trap; modal dialogs receiving programmatic focus on open.
- **Positive `tabindex` values** (`tabindex="3"`) — _"We should never ever do that. We should never ever ever do that. It messes up with the tab order of the page."_ Always 0 or -1.
- `<svg focusable="false">` — pre-Edge legacy IE makes `<svg>` elements focusable by default, producing two tab stops on a button-with-icon (one for the button, one for the SVG inside). Set `focusable="false"` on every decorative SVG to keep the tab order tight. Soueidan has _personally encountered this in Firefox_ as recently as the talk; treat it as defensive hygiene even today.

## Cross-Cutting Principles

1. **Use the platform.** Native HTML is the cheapest, most-tested accessibility solution. The work is choosing the right element, not patching the wrong one.
2. **ARIA is a last resort.** It exists to express semantics HTML cannot. It does not add behavior; it only describes.
3. **Two trees, one truth.** What's in the DOM and what's in the accessibility tree can diverge. Inspect both. Both must be right.
4. **Hide _from one_, never from both, unless that's the goal.** Visually hidden ≠ accessibility-hidden. Pick the technique that matches the intent.
5. **Tab through every screen.** If you can't tab to a control, can't see where you are, or get trapped in an iframe-like, the screen ships broken.
6. **Test with a real screen reader.** VoiceOver (Mac) and the Rotor are free. NVDA (Windows) is free. JAWS is the industry standard. Hearing your UI is a different debugging modality from reading it.
7. **Custom interactive components are expensive.** Modals, accordions, comboboxes, toggle switches all require keyboard handling, focus management, ARIA roles, and live testing. If a tested implementation exists, use it.
8. **Mobile screen-reader users explore by touch.** Anything you hide must remain hit-testable where the user's finger expects it.

## Quotables

> "Aria is not there to add functionality to elements. It's only used to add semantic parity with HTML."

> "If you're a front-end developer, you need to be familiar with the accessibility tree if you want to build accessible user interfaces."

> "There is no such thing as an accessible CSS-only modal overlay."

> "A visible focus is a requirement for a site to be considered accessible under the Web Content Accessibility Guidelines. If you don't have a visible focus style, your website is not accessible."

> "Just because a heading looks small doesn't mean that it is an h6 or h5. Use appropriate heading levels and then style them in your CSS any way you want."

> "If you don't use semantic HTML you take away your users' ability to navigate your content, which can cause a lot of frustration and counter-productivity, and which is really mean."

> "You wouldn't want to hide the cursor for a sighted mouse user. So why would you want to hide their way to tab through the page?"

> "Some users explore your websites by touch. If the checkbox is hidden off-canvas, I'm never going to find it."

## Practical Checklist (Audit a Screen for Accessibility)

A reviewer-grade walkthrough an agent or developer should run on every screen before shipping. The **Soueidan front-end version** — pair with the Heydon Pickering "component canon" view to cover both screen audits and component primitives.

**Document structure**

- [ ] Page has a `<main>` with at least one heading; every landmark (`<header>`, `<nav>`, `<aside>`, `<footer>`) is semantic, not a generic wrapper.
- [ ] Heading order descends without skipping; levels reflect document structure, not visual size.
- [ ] Visually-absent region headings are provided via `.sr-only` and wired with `aria-labelledby`.

**Interactive elements**

- [ ] Every clickable thing is a `<button>` or `<a>`, not a `<div>` with handlers.
- [ ] Every form input has a `<label>` (or `aria-labelledby`); icon-only buttons have an accessible name.
- [ ] Decorative SVGs have `aria-hidden="true"` and `focusable="false"`.
- [ ] Custom controls have correct ARIA roles + states (`aria-expanded`, `aria-selected`, `aria-pressed`) and full keyboard support.
- [ ] No positive `tabindex` values anywhere.

**Focus management**

- [ ] Tab visits every interactive element in a sensible order with a clearly visible indicator in both light and dark modes.
- [ ] `:focus-visible` is used so focus rings appear on keyboard but not on mouse click; focus contrast ≥ 3:1 (WCAG 2.4.11).
- [ ] Modals: focus moves in on open, traps inside, Escape closes, focus restores to the trigger.

**Color, contrast, hidden content, dynamic content, media, testing**

- [ ] Contrast: body text ≥ 4.5:1 (WCAG AA); large text + UI components + focus indicators ≥ 3:1. Verify with WebAIM contrast checker, axe, Stark, Polypane.
- [ ] Each hidden element uses the technique matching intent; no interactive control is off-canvas or shrunk so small it can't be touched; native inputs are layered on top of their visual replacements.
- [ ] Async updates use `aria-live="polite"`; loading/save/error states are announced; errors are associated via `aria-describedby` + `aria-invalid="true"`.
- [ ] Every `<img>` has a meaningful `alt`; charts have an alternative text view; videos have captions; animations honor `prefers-reduced-motion`.
- [ ] Tab the entire screen with no mouse; run VoiceOver or NVDA + Rotor (Headings, Landmarks, Form Controls, Links); inspect the Chrome DevTools Accessibility tab; run axe / Lighthouse / WAVE.

## Application to BuildOS

### 1. The `accessibility-auditor` agent — Soueidan + Pickering as joint backbone

The BuildOS `accessibility-auditor` agent is currently listed but un-sourced. Soueidan's talk is the **operator-grade source** for screen-level audits — the front-end developer's pragmatic checklist. Heydon Pickering's _Inclusive Components_ is the **component canon** — how each individual UI primitive (toggle, accordion, dialog, tab, combobox, menu, autocomplete) should be built from the inside out. Pair them:

- **Pickering** answers: "What does an accessible accordion look like? What does an accessible combobox look like?"
- **Soueidan** answers: "How do I audit a screen for the issues that show up in production right now? How do I make this Khan Academy chart usable by a screen reader?"

The agent's prompt should split into two passes:

1. **Screen-level audit** (Soueidan checklist above): landmarks, heading order, focus order, focus visibility, keyboard reachability, color contrast, dynamic content announcements, hidden-content techniques.
2. **Component-level audit** (Pickering reference): for every interactive primitive on the screen, verify it matches the canonical pattern for that component (correct ARIA role, correct keyboard model, correct focus management).

WCAG criteria the agent should explicitly cite (drawn from the talk plus the natural extensions): 1.1.1 (Non-text Content), 1.3.1 (Info and Relationships), 1.4.3 (Contrast Minimum), 1.4.11 (Non-text Contrast), 2.1.1 (Keyboard), 2.4.3 (Focus Order), 2.4.6 (Headings and Labels), 2.4.7 (Focus Visible), 2.4.11 (Focus Appearance, WCAG 2.2), 3.3.1 (Error Identification), 3.3.2 (Labels or Instructions), 4.1.2 (Name, Role, Value), 4.1.3 (Status Messages).

### 2. Inkprint primitives — bake the Soueidan rules into the design system

Inkprint should encode these rules as token-level decisions so individual components stop having to make them:

- **Focus token.** A single `--focus-ring` token (color, width, offset) used by every interactive primitive. Tested for ≥ 3:1 contrast against every Inkprint surface (`bg-card`, `bg-foreground`, `bg-muted`, etc.) in both light and dark modes. Triggered on `:focus-visible`, never on `:focus` alone.
- **`.sr-only` utility.** Inkprint should expose Scott O'Hara's exact pattern as a utility class (or Tailwind plugin) so components can drop in screen-reader-only labels for icon buttons and visually hidden headings.
- **Dialog primitive.** A tested `Dialog` component (Radix Dialog or equivalent) with focus trap, focus restore, escape-to-close, `aria-modal="true"`, and `inert` on the rest of the page. Soueidan's "no CSS-only modals" rule means no BuildOS feature should ship a one-off modal.
- **Dropdown/Menu primitive.** Tested keyboard model — Up/Down arrows navigate items, Enter activates, Escape closes, focus returns to the trigger.
- **Tabs primitive.** Tested ARIA `tablist`/`tab`/`tabpanel` pattern with arrow-key navigation between tabs (not Tab, which leaves the tablist).
- **Toggle switch.** Native `<input type="checkbox">` with the explore-by-touch-safe hide pattern (position absolute, opacity 0, layered over the visual replacement). Custom Inkprint toggles should NOT roll their own checkbox-hack.
- **Icon-button utility.** Standardized so every icon button in BuildOS receives a `.sr-only` label or `aria-label`. Decorative SVGs default to `aria-hidden="true"` and `focusable="false"`.

### 3. Form-heavy screens — project create, brain-dump intake, settings

These screens are the highest concentration of interactive controls in BuildOS. The Soueidan rules to apply:

- Every input has a visible `<label>` (or a visually hidden one wired via `for`/`id`).
- Required fields use `aria-required="true"` AND a visible "\*" or "required" label.
- Error states use `aria-invalid="true"` AND associate the error message via `aria-describedby` so the screen reader announces the error when focus enters the field.
- Success/save announcements use a polite live region — when "Brain dump saved" appears, it should be announced to assistive tech.
- Multi-step flows (project create → tasks → context) should announce step transitions; focus should move to the new step's heading when the step changes.
- The brain-dump intake textarea is the single most important input in the product — verify keyboard shortcuts (Cmd+Enter to submit) are documented in `aria-keyshortcuts` and visible in tooltips.

### 4. Dynamic content surfaces — daily brief streaming, chat, live updates

The single accessibility category Soueidan does not directly cover (the talk predates the SSR-streaming era) but that BuildOS heavily uses. Apply by extension:

- **Daily brief streaming.** As content streams in, the appearance of new sections should be announced via a polite live region (not assertive — the user doesn't need to be interrupted while reading). Each new section heading gets a subtle "loaded" announcement; the focused element doesn't move.
- **Agentic chat.** Each new message from the assistant appears in a live region (`aria-live="polite"` on the message log container, with `aria-atomic="false"` so only the new message is announced). Streaming-in tokens should not announce on every token — debounce or wait for paragraph boundaries.
- **Notifications.** The notification stack should use `role="status"` for non-critical updates ("Brain dump processed") and `role="alert"` for blocking errors ("Calendar sync failed").
- **SSE-driven UI updates.** When the dashboard re-renders project state from a server event, focus should NOT move (would interrupt keyboard users); the change should be announced if it's user-relevant.

### 5. Charts and data visualizations — daily brief, project metrics

If BuildOS adds any chart UI (project velocity, brief frequency, calendar heatmap, etc.), apply the Khan Academy pattern:

- Embed via `<object>` (or inline SVG with proper labelling) and a `tabindex="-1"`.
- `role="img"` and an `aria-label` providing the chart title.
- An `aria-describedby` reference to a visually hidden text description of the actual data.
- Pair the visualization with a real `<table>` (or expandable list) that screen-reader users can navigate.

## Critical Analysis — What Needs Updating for 2026

### What still holds (and probably always will)

- The "use semantic HTML first" thesis is **more** correct in 2026 than in 2019. React Server Components, Astro, and SvelteKit have collectively swung the pendulum back toward server-rendered HTML. The rules of the platform are reasserting themselves.
- The "ARIA is a last resort" framing is now part of the official ARIA Authoring Practices Guide ("No ARIA is better than bad ARIA"). This rule has aged perfectly.
- The four hiding techniques and their accessibility-tree consequences are unchanged. CSS has not added new ways to hide things in this taxonomy.
- The explore-by-touch rule for hiding native inputs is, if anything, more important: touchscreens have only become more dominant.
- The icon-button playbook (visually-hidden text > `aria-label` > `aria-labelledby`) remains canonical.

### What's outdated

- **`:focus-visible` browser support.** In 2019 it was Chrome-only with a polyfill. In 2026 it has full browser support across Chromium, Firefox, and Safari. The polyfill is no longer needed for the vast majority of users — `:focus-visible` can be used directly with a sensible fallback for ancient browsers. Soueidan's polyfill section is historical, not load-bearing.
- **`<svg focusable="false">`.** The IE/Edge bug she calls out is mostly dead. Modern Edge (Chromium-based) does not exhibit it. Still worth setting defensively but not the urgent fix it once was.
- **The 7:1 contrast ratio guidance.** This was Soueidan's mention of WCAG AAA. WCAG 2.2 (2023) updated guidance, and APCA (the Advanced Perceptual Contrast Algorithm, expected for WCAG 3) replaces simple ratio math with perceptual luminance calculations that better match how humans perceive contrast. The 4.5:1 (AA) and 7:1 (AAA) ratios still apply for WCAG 2.x compliance, but APCA is the future and is already worth using as a secondary check.
- **Custom checkbox patterns.** The `<input type="checkbox">` is now stylable with `accent-color` (limited but useful) and CSS Grid + `appearance: none` patterns are more robust. The "hide native + show SVG" pattern is still the gold standard for full visual control, but the bar for "you have to roll your own" has dropped.
- **`<dialog>` element.** Browser support for the native HTML `<dialog>` is now strong. It handles many of the modal-accessibility concerns (focus trap with `showModal()`, `inert` on background) without requiring Scott O'Hara's full custom implementation. Pair with a polyfill for older browsers and a `useDialog`-style wrapper for focus-restore-on-close.

### What the talk does not cover (and BuildOS needs to add)

- **`prefers-reduced-motion`.** The talk pre-dates this becoming a routine concern. BuildOS uses motion in the brain-dump processing animation, daily brief streaming, and Inkprint texture transitions — every animation should respect `@media (prefers-reduced-motion: reduce)`.
- **`prefers-color-scheme` / dark mode contrast.** Inkprint requires both light and dark modes; the contrast checks need to run against both palettes.
- **Live regions for streaming UI** (RSC, SSE, real-time updates). The 2019 talk doesn't cover the live-region patterns BuildOS needs for daily brief streaming and chat.
- **AI-generated UI components.** The 2026 problem: developers (or agents) ship `<div role="button">` patterns because the LLM hallucinated them from training data. The Soueidan + Pickering pairing is the correction lens — but a fresh pass on "what's the LLM about to get wrong" (icon-button labels missing, ARIA roles applied to native elements, focus indicators removed because the model copied a styling tutorial) is worth adding to the BuildOS `accessibility-auditor` prompt.
- **Mobile/touch-specific accessibility.** Touch target size (≥ 44×44 CSS pixels per WCAG 2.5.5), gesture alternatives, orientation-lock avoidance, viewport-zoom not disabled. These are 2026 baseline expectations the talk doesn't address.
- **`<dialog>`, `popover` API, anchor positioning.** Modern HTML features that simplify what Soueidan had to build manually with focus traps and JS positioning. Worth adopting.
- **Cognitive accessibility / inclusive content.** The talk is screen-reader and keyboard-focused. Cognitive load, plain language, error recovery patterns, and forgiving interactions (the "skip button" rule from Kole Jain's analysis, the no-feedback failure mode from Nesrine Changuel) are not covered. Pair Soueidan with Kat Holmes's _Mismatch_ for the inclusive-design layer.

### What to take vs. leave for BuildOS

**Take (building blocks of the `accessibility-auditor` agent):** semantic HTML before ARIA; heading-order and landmark-driven document structure; the hiding-techniques table; the icon-button accessible-name playbook; the focus-visibility rule; the `<object>` + `aria-describedby` chart pattern; "tab through every screen" testing; "inspect the accessibility tree" debugging; the explore-by-touch rule; the "don't roll your own modal" rule.

**Leave or update:** the `:focus-visible` JS polyfill (use the native selector with `:focus:not(:focus-visible)` fallback); the urgency of `<svg focusable="false">` (defensive only in 2026); the strict 4.5:1 / 7:1 contrast ratios (still applicable, but check APCA in parallel); the hand-rolled custom checkbox markup (native CSS has caught up enough for many cases).

**Add (Soueidan didn't cover, BuildOS needs):** `prefers-reduced-motion` for every Inkprint animation; `aria-live` patterns for streaming UI (daily brief, chat, notifications); touch-target size and mobile-screen-reader patterns; native `<dialog>` adoption with a focus-restore wrapper; an LLM-output accessibility audit pass that specifically scans for AI-generated `<div role="button">`-style code.
