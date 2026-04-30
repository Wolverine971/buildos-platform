---
title: 'ANALYSIS: Refactoring UI — Steve Schoger (CSS Day 2019)'
source_type: youtube_analysis
source_video: 'https://www.youtube.com/watch?v=7Z9rrryIOC4'
source_transcript: '../transcripts/2026-04-29_steve-schoger_refactoring-ui-css-day.md'
video_id: '7Z9rrryIOC4'
url: 'https://www.youtube.com/watch?v=7Z9rrryIOC4'
channel: 'CSS Day'
channel_url: 'https://www.youtube.com/@WebConferencesAmsterdam'
upload_date: 2019-06-17
duration: '44:13'
views: 68391
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
transcribed_date: '2026-04-29'
tags:
    - refactoring-ui
    - visual-craft
    - hierarchy
    - color-systems
    - shadows
    - depth
    - spacing
    - typography
    - tailwind
    - design-for-developers
    - ai-slop-detector
path: docs/research/youtube-library/analyses/2026-04-29_steve-schoger_refactoring-ui_analysis.md
---

# ANALYSIS: Refactoring UI — Steve Schoger (CSS Day 2019)

## Skill Combo Links

This source contributes to these multi-source skill combo indexes:

- [Product And Design Skill Combos](../skill-combo-indexes/PRODUCT_AND_DESIGN.md): Visual craft fundamentals (proposed); UI/UX quality review (extension); AI-era craft and quality moat; AI UI slop detector and rewrite (proposed)

## Source

- **Title:** Refactoring UI — Practical Solutions to Common UI Design Problems
- **Speaker:** Steve Schoger (co-author, _Refactoring UI_ with Adam Wathan; designer at Tailwind Labs)
- **Channel:** [Web Conferences Amsterdam / CSS Day](https://www.youtube.com/@WebConferencesAmsterdam)
- **URL:** https://www.youtube.com/watch?v=7Z9rrryIOC4
- **Duration:** 44:13
- **Upload Date:** 2019-06-17
- **Views (at index):** 68,391
- **Format:** Live redesign of a fictional flight-booking app, top-to-bottom, narrating every micro-decision

## Core Thesis

Polish is not talent — it is **tactics**. A non-designer can take a Bootstrap-default UI to "looks like a real product" by applying a small repeatable kit of moves: pick colors and fonts by stealing from professionals, use a constrained palette (9–10 shades per hue), build hierarchy through size + weight + color (not borders), use perceived brightness instead of lightness when adjusting hue, layer shadows in two parts to mimic real light, prefer fewer borders and softer alternates (off-white backgrounds, zebra striping, color blocks), and start with **too much** whitespace then remove. Every fix is small; the compounded effect is dramatic.

## TL;DR Rules Table

| #   | Rule                                                 | Concrete fix                                                                                            |
| --- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| 1   | Steal colors and fonts                               | Land-Book, SiteInspire, Dribbble color picker; Tailwind defaults; sample colors from shots you like     |
| 2   | Use a constrained palette                            | 9–10 shades per single hue (Tailwind-style). Avoid "40 unique text colors and 50 unique backgrounds"    |
| 3   | Hero text needs consistent contrast                  | Add semi-transparent overlay, desaturate + multiply blend a brand color, or pick a negative-space photo |
| 4   | Don't use grey text on colored backgrounds           | Sample the background, raise saturation/lightness — make text **closer to background**, not grey        |
| 5   | Use perceived brightness, not lightness              | Rotate hue toward the nearest bright hue (e.g. blue → cyan) instead of dragging lightness               |
| 6   | Start with too much whitespace, then remove          | Inverse of "add until it stops looking bad" — overshoot, dial back                                      |
| 7   | Input length should suggest expected content         | A date field should be ~half the size of an address field; make affordances literal                     |
| 8   | Inputs need 40–48px height                           | Total height = font size + padding. Generous targets read as designed, not default                      |
| 9   | Off-white inputs on white panels                     | Subtle background creates distinction without a heavy border — fine line "not too much, not disabled"   |
| 10  | Replace browser default form controls                | Custom radios, checkboxes, and select chevrons. Default Safari controls scream "unstyled"               |
| 11  | Balance weight and contrast                          | Solid icons next to text look heavy → soften icon color so weight perceives as equal                    |
| 12  | Yellow/green CTAs need dark text, not white          | Invert: dark text on bright background. Saturate the dark text toward the background hue                |
| 13  | Use multiple shadow levels for z-axis                | Small (buttons/inputs) → medium (dropdowns) → large (panels) → x-large (modals)                         |
| 14  | Shadows have two parts                               | Tight ambient shadow (small offset, small blur) + soft direct shadow (larger offset, larger blur)       |
| 15  | Higher elevation → subtler ambient + negative spread | The further the object floats, the more its body covers the direct light                                |
| 16  | Use color to convey depth                            | Lighter = closer, darker = further. Push tables back with off-white backgrounds                         |
| 17  | Use fewer borders                                    | Replace borders with: zebra striping, light-grey background blocks, off-white alternates, spacing       |
| 18  | Headings are labels, not headlines                   | Small, bold, **uppercase**, softer color. Don't let table headers steal attention from data             |
| 19  | Think outside the database                           | Combine columns, drop redundant labels (1295 with $ is obviously a price), enrich with images           |
| 20  | Right-align numbers, use tabular figures             | `font-feature-settings: 'tnum'` for column alignment without monospace                                  |
| 21  | Buttons: alternative to outline = soft solid         | Solid background **based on the text color** with low alpha — cleaner than ghost buttons                |
| 22  | Cards don't need explicit "View" buttons             | Whole card is the affordance (Airbnb, YouTube). Save the click target visual real estate                |
| 23  | Crop images to fixed aspect ratio                    | `background-size: cover` on a fixed container — defeats messy aspect-ratio mismatch                     |
| 24  | Use color-coded pills/badges for state               | Soft-tint background + dark text (better contrast than white-on-red)                                    |
| 25  | Alternate page-section backgrounds                   | Solid color blocks per section beat one big white scroll. Marketing-page pattern                        |
| 26  | Greys are not pure grey                              | Saturate with blue (cool) or yellow/brown (warm). Bump saturation on the lightest/darkest shades        |
| 27  | Match grey temperature to brand color                | Cool brand → cool greys. Warm brand → warm greys. Or invert intentionally (Basecamp)                    |
| 28  | Pick fonts the way you pick colors                   | DevTools-inspect sites you like → look up the foundry → buy the bundle. Don't only browse Google Fonts  |
| 29  | System fonts in product, custom fonts on marketing   | App = San Francisco / system stack. Marketing site = custom personality                                 |

## Operating Lessons

### 1. Hero contrast — never trust the photo

> "Photos are pretty dynamic, they have a lot of light areas and a lot of dark areas and you need to give text consistent contrast."

A hero image with text overlay fails the moment the photo's brightness varies behind the text. Three escalating fixes:

1. **Semi-transparent overlay** (cheapest). Tones down highlights, raises legibility. Inversion: white overlay + dark text.
2. **Desaturate + colorize.** Bring image into Figma → click thumbnail → drag saturation to 0 → adjust contrast/brightness → add a solid color fill on top → set blend mode to **multiply** → tune opacity. Same effect via CSS `mix-blend-mode: multiply` but with limited browser support; Schoger recommends doing it in design tools.
3. **Duotone.** ShapeFactory's Duotone tool maps two colors to highlights/lowlights (the "Spotify album cover" effect). Pulls images directly from Unsplash.

**Operator move:** treat any text-on-photo block as a contrast bug until proven otherwise. Mandatory overlay or colorization.

### 2. Color systems — steal, then constrain

Schoger's color workflow has two phases:

**Phase 1 — find the palette.** Browse Land-Book, SiteInspire, Dribbble. When you see a combination you like, sample it. Dribbble's color picker (three-dot menu → color) lets you search shots **by color**, returning palettes hand-picked by professional designers. Most Dribbble shots show the palette in the bottom-right.

**Phase 2 — constrain it.** Map the stolen colors to Tailwind's default palette (or any constrained system with ~9–10 shades per hue). Why constrain:

- "I find it much easier to work with a constrained palette than aimlessly picking colors from a color picker."
- Without it: "40 unique text colors and 50 unique background colors where many of the colors are very close to each other" — the css.stats.com Facebook stats Schoger cites are a horror show.
- With it: a single hue with 9 shades carries body text + secondary text + disabled text + heading + dark UI chrome without ever opening a color picker.

**Operator move:** if a color is not in the system, it does not exist. Adding a new shade is a contribution, not a one-off.

### 3. Don't use grey text on colored backgrounds

> "What we're trying to achieve is reduced contrast. You want to make text closer to the background color, not grey."

The default move (lighter grey for hero subtitles) looks "off on a colored background." The default-default move (`opacity: 0.7`) "results in the text looking a little dull and washed out."

**The right move:** sample the background color, push saturation/lightness up. In an HSB picker, drag the picker toward the **top-left** for a lighter, less-saturated version of the same hue. The result is **softer** without going grey.

If using a constrained system: the lighter shades of the same hue family (e.g. `blue-300`) are pre-tuned for this.

### 4. Use perceived brightness instead of lightness

This is the single most expert move in the talk.

Different hues have different inherent **luminance**: yellow at 50% lightness reads brighter than blue at 50% lightness. Schoger plotted hue-vs-perceived-brightness — yellow peaks, blue troughs, and the curve is **non-linear**.

The trick:

- Want lighter text on a blue background? Don't drag lightness up (loses saturation).
- **Rotate the hue** toward the nearest bright hue. Blue → cyan. Cyan reads brighter than blue at the same lightness, but stays vivid.
- Same trick produces "sexy gradients" (rotate hue across the gradient instead of just darken/lighten).

**Operator move:** treat hue rotation as a peer of lightness when adjusting accessible color contrast.

### 5. Whitespace — the inverse algorithm

> "Start with way too much whitespace and then remove it until you're sort of happy with the result."

Most developers add space until it stops looking cramped. Problem: you stop at the first acceptable point — the **minimum**. Schoger's inverse algorithm:

1. Open every spacing dial to absurd values.
2. Step through the design — the over-spaced version looks "right" in context even if components feel airy in isolation.
3. Tighten only where it actually feels excessive.

This produces designs that breathe instead of designs that survive.

### 6. Input affordances

- **Length signals expected content.** A date field at 100% width is a lie. Half-width is honest. Get them all on one row on desktop because their honest length permits it.
- **Total input height: 40–48px.** Schoger: "the size of the font plus the padding around it." Inputs smaller than this read as bootstrap leftovers.
- **Off-white background.** On a white panel, an input bordered-only is visually weak. A subtle off-white background creates the boundary without a heavy border. "There's a fine line of just enough to create that distinction, but not too much where it looks disabled."
- **Add icons to support text — but balance weight.** Solid icons cover more surface area than text, so they read heavier. **Soften the icon color** so it perceives as the same weight as the label. "Counterbalance making heavier elements feel lighter, even though the weight hasn't changed at all."
- **Replace browser defaults.** Custom radios, checkboxes, and select-arrow chevrons. The Safari default is the modern equivalent of `<font face="Times New Roman">`.

### 7. CTA color inversion (yellow/green problem)

> "It's always difficult to achieve high contrast ratios with white text on bright colors like yellow or green."

White-on-yellow forces the yellow to darken into bronze. Don't.

**Invert:** dark text on the bright background. Saturate the dark text toward the background hue (yellow background → dark **orange** text, not pure black). Same logic as rule 3 in reverse.

### 8. Depth — the three techniques stacked

To make a card pop on a page, Schoger uses three techniques **at once**:

1. **Overlap elements.** Negative-margin the panel so it sits between the hero section and the table section. Visual proof that the panel is "in front of" the rest.
2. **Heavy shadow.** Schoger's shadow ladder (smallest to largest):
    - **xs** — buttons, inputs (1–2px offset, 2–4px blur)
    - **sm** — dropdowns, small panels
    - **md** — large panels (the search panel in his demo gets this)
    - **lg / xl** — modals
3. **Color depth.** "Lighter objects feel closer to us than darker objects." The card is white; the section behind it is a **subtle off-white**. The off-white pushes everything-not-the-card backward.

The combination produces unmistakable z-axis hierarchy.

### 9. Shadows have two parts

The single best technical takeaway in the talk:

> "Shadows are typically created by more than one light source... ambient and direct."

Real-world shadows decompose into:

- **Ambient shadow** — tight, dark, small vertical offset, small blur radius. Sits "underneath" the object.
- **Direct shadow** — larger, softer, larger vertical offset, larger blur radius. The shadow your room light casts.

In CSS this is two `box-shadow` declarations stacked. As an object floats higher:

- Direct shadow grows (more offset, more blur).
- Direct shadow becomes **subtler** in opacity ("the body of the object covers the direct light source more").
- Use **negative spread** on the direct shadow at high elevation to mimic the body occluding the light.

This is what makes Tailwind's `shadow-md` / `shadow-lg` look real and Bootstrap's defaults look pasted-on.

### 10. Use fewer borders

> "Whenever possible, use fewer borders. Borders make a design look pretty cluttered."

Replacements (in priority order):

1. **Spacing alone** — let air do the work.
2. **Background color shifts** — off-white, light-tinted, or alternating zebra stripes.
3. **A faint border with reduced opacity, only when associating elements** — Schoger's nav uses a 1px white border at low opacity to "associate elements on the left with elements on the right."

The "grey box around checkboxes" trick: tint the background of a group of related controls instead of bordering them. "A nice way of creating a border without actually having a border."

### 11. Tables — the densest payoff section

- **Right-align numbers and dates.** Decimals in the same column.
- **Tabular figures.** `font-feature-settings: 'tnum';` makes proportional fonts lock to monospace widths for numerics only — no font swap required.
- **Zebra striping** replaces row borders.
- **Headings as labels, not headlines.** Small, **bold uppercase** with a softer color. "Headings like this should be a bit more subtle." Bold-uppercase treatment maintains "heading status" while softer color/size keeps focus on the data.
- **Right-side action buttons darken a column.** Replace heavy primary buttons with **secondary treatment** for repeated row actions.
- **Secondary button alternative:** instead of an outline/ghost button, use a **soft solid background derived from the text color** with low alpha. Cleaner, less visual weight.
- **Underline-replacement for links.** Generic chevron/arrow icon to the right of link text reads as "clickable" without underline noise.

### 12. Think outside the database

> "If columns don't need to be sortable, try consolidating secondary information."

Each table column does **not** need to be a UI column. Combine:

- Hotel name + city + star rating into one cell with hierarchy (large primary + smaller secondary).
- Drop redundant labels: `$1295` is obviously a price; `vacationspots.com` is obviously a URL.
- Add **images** where the data supports it (hotel photo cell).

This is a data-design move, not a CSS move. It's the highest-leverage table fix in the talk.

### 13. Cards and aspect ratios

- **Crop images to a fixed aspect ratio container** with `background-size: cover`. Solves heterogeneous photo sizes without pre-processing.
- **Whole card = clickable.** "Sites like Airbnb and YouTube are great examples of how card-based layouts can get away without including buttons and they still managed to look clickable." Save the visual real estate for content.
- **Color-coded badges/pills** for ephemeral state ("only 5 left", "best value"). Soft-tint background + dark text — same logic as the yellow CTA inversion. Better contrast than white-on-red and reads less alarming.

### 14. Page-section background variation

- Hero, mid-section, newsletter, footer should not all be the same white.
- Apply brand color to high-emphasis sections (newsletter on brand-blue), darker treatment to footer.
- **Background patterns** add texture (Schoger's HeroPatterns SVG library, ~100 patterns). Especially useful at section transitions on marketing sites.

### 15. Greys are not grey

> "Pure greys can make a UI look pretty dull and unnatural."

The temperature trick:

- **Cool palette** (blue brand, technical product) → saturate greys with **blue**.
- **Warm palette** (red, orange, purple brand, friendly product) → saturate greys with **yellow or brown**.
- Even a small shift "tips the temperature." Crank it up if the brand calls for strong direction.
- **Critical:** in HSL, when generating lighter and darker shades, **increase saturation at the extremes** to maintain a consistent temperature. Without this, the lightest and darkest greys look "washed out compared to the greys closer to 50% lightness."

Counter-example: Basecamp deliberately pairs blue brand with **warm** greys — taste move, not a rule.

### 16. Picking fonts (the same way as colors)

The amateur path: browse Google Fonts top-50.

Schoger's path:

1. Find a site you like (Land-Book, SiteInspire, the Bootstrap themes page).
2. Open DevTools, check `font-family`.
3. Google the font name → find the **foundry**.
4. Buy the foundry's bundle — get 5–10 fonts you'd never have found.
5. Reuse across projects.

His pick for the demo (Hanken Design's "Barter Exchange") came from this exact pipeline.

**System vs custom:**

- **In product:** system font stack (San Francisco on Mac). "I especially like using the system font stack on an app experience."
- **On marketing sites:** custom font for personality.

### 17. Q&A — accessibility and brand color collisions

Two operator-grade answers buried at the end:

- **Accessibility tooling:** the `Contrast` macOS menu-bar app (by Matt Smith / Sam Soffes) for sampling and checking contrast ratios live. WCAG-aware, monitor-aware (Retina vs projector contrast differs).
- **What if the brand color collides with a status color?** (e.g., the brand is red and so are alerts.) Schoger doesn't have a clean rule but offers a heuristic: most sites are white + grey for chrome, brand color for primary action. If the brand color is red, **use a tone of red** (lighter, less saturated) for chrome and reserve **full red** for high-severity alerts.

## Cross-Cutting Principles

- **Polish is a function of subtraction.** Almost every fix removes weight (fewer borders, softer icons, hue rotation instead of opacity drop, off-white instead of border, secondary button instead of primary).
- **Real-world physics earns visual credibility.** Shadows have two light sources. Lighter colors recede. Higher elevation lifts the body away from light. Every "looks designed" move maps to something physical.
- **Hierarchy is built from size + weight + color, not boxes.** Borders are the amateur tool. Spacing, color shift, and typography are the professional tools.
- **Constrain choices upstream so downstream decisions are cheap.** A 9-shade palette + a 4-step shadow ladder + a 3-tier type scale removes 95% of design micro-decisions before you sit down.
- **Steal taste; don't synthesize it.** Browse, sample, copy structure, swap in your colors. The talk's color, font, and pattern workflows are all "find a designer's output and reverse-engineer."
- **Override every browser default.** Bootstrap defaults, default form controls, default fonts, default 125% line-height, default greys — every default is a tell.

## Quotables

- _"I like to show how you can use **tactics instead of talent** to do a design."_
- _"Don't use grey text on colored backgrounds. We need to make text closer to the background color, not grey."_
- _"Start with way too much whitespace and then remove it."_
- _"Lighter objects feel closer to us than darker objects."_
- _"Headings should be a bit more subtle. Small, bold, uppercase with a softer color."_
- _"Use fewer borders. Borders make a design look pretty cluttered."_
- _"Pure greys can make a UI look pretty dull and unnatural. Saturate them."_
- _"Shadows have two parts."_
- _"You can use a soft solid background **based on the text color** instead of an outline button."_
- _"You don't need a label to identify it. 1295 is a price because it has a dollar value."_

## Practical Checklist (Apply to BuildOS UI)

Use this as a per-screen audit list. Each item is a yes/no.

**Color and contrast**

- [ ] Every color used is in the Inkprint token system. No one-off hex values.
- [ ] Each hue has 9–10 shades available (not 2).
- [ ] No grey text on colored backgrounds — secondary text on tinted backgrounds is a lighter shade of the **same hue**.
- [ ] Hero sections with photos have an overlay, colorization, or duotone treatment.
- [ ] When adjusting "lighter" colors over a colored background, hue is rotated toward a brighter hue, not just lightened.
- [ ] Greys are saturated cool (blue) or warm (brown/yellow) to match brand temperature, not pure neutral.
- [ ] Lightest and darkest grey shades have **bumped saturation** to maintain temperature.

**Spacing and density**

- [ ] Every layout was started with too much whitespace, then tightened — not the inverse.
- [ ] Inputs are 40–48px tall.
- [ ] Input lengths reflect expected content (date ≠ address width).
- [ ] No element is bordered when spacing or background tint would do.

**Depth and shadows**

- [ ] Shadow ladder defined: xs/sm/md/lg/xl with consistent blur+offset+spread.
- [ ] Every shadow is **two-part** (ambient + direct).
- [ ] Direct shadow has reduced opacity and negative spread at higher elevations.
- [ ] Lighter color = closer to user; darker/off-white = recessed.
- [ ] Cards/panels combine overlap + shadow + color depth, not just shadow.

**Form and interactive elements**

- [ ] Browser default radios, checkboxes, selects are replaced.
- [ ] Inputs on white panels have a subtle off-white background.
- [ ] Icons next to text are softer than the text (balanced visual weight).
- [ ] Yellow/green/bright CTAs use **dark text** saturated toward the background hue, not white.
- [ ] Secondary buttons use soft-tint solid backgrounds (text-color-derived) instead of outlines.

**Tables and dense data**

- [ ] Numbers and dates are right-aligned with `font-feature-settings: 'tnum'`.
- [ ] Table headers are small/bold/uppercase/softer color, not bold-large headlines.
- [ ] Borders replaced with zebra striping or background blocks.
- [ ] Combine columns where possible; drop labels when data implies them.

**Cards, lists, and badges**

- [ ] Card images cropped via fixed-ratio container + `background-size: cover`.
- [ ] Cards are clickable as a whole; explicit "View" buttons removed where possible.
- [ ] State badges use soft-tint background + dark text (not white-on-red).

**Typography**

- [ ] Product UI uses system font stack; marketing uses one custom font with personality.
- [ ] Default 125% line-height overridden — closer to 1.0 for hero, 1.5 for body.
- [ ] Type scale derived from a constrained set of sizes/weights, not invented per screen.

**Sectioning**

- [ ] Page sections vary in background (white, off-white, brand-color, dark).
- [ ] No screen is one continuous white expanse.

## Application to BuildOS

### A. Inkprint design system audit

Schoger's principles map directly onto the Inkprint design system. Use this analysis to:

- **Audit the Inkprint color tokens against the constrained-palette rule.** Confirm each hue has ~9 shades; if any hue has only 3, expand it. The `text-foreground` / `bg-card` / `shadow-ink` token names already imply a system, but verify there are no one-off hex values bleeding through component code.
- **Audit Inkprint's grey scale for temperature.** BuildOS branding leans cool / serious / "thinking environment." Greys should be saturated toward blue, not pure neutral. Check if the lightest and darkest greys have boosted saturation.
- **Verify a documented shadow ladder exists.** Inkprint's `shadow-ink` should not be one shadow — it should be a tier (xs/sm/md/lg/xl), each composed of ambient + direct halves. If it's currently one flat shadow, this is the highest-leverage Inkprint upgrade in this analysis.
- **Cross-reference Inkprint's texture utilities (`tx-bloom`, `tx-grain`).** These are BuildOS's "halftone" answer to Schoger's "saturated greys" — texture replacing flatness. Confirm they have light/dark variants.

### B. Daily-brief screens

The daily-brief is BuildOS's most data-dense surface. Schoger's table playbook applies:

- Right-align time-sensitive numbers (durations, counts, deadlines) and apply tabular figures.
- Brief headers (project name, section labels) should be **small bold uppercase** with softer color — not bold-large headlines that compete with body content.
- Replace any borders separating brief sections with off-white background blocks or zebra-striped item lists.
- "Think outside the database": combine project-name + last-updated + status into a single cell with hierarchy, instead of three columns. This is a structural change, not a CSS one.

### C. Brain-dump UI

The brain-dump editor is a writing surface; restraint matters more than visual interest:

- The text input itself should have generous height (well past 48px) and a subtle off-white background within the surrounding card.
- Any "AI extracted" panels (extracted projects, tasks, context) sit at a lower z-depth — push them back with off-white backgrounds, not borders.
- Status badges ("processing", "extracted", "needs review") should use soft-tint pills, not high-contrast alarming colors.
- Hero/empty-state imagery (if any) needs colorization or overlay — never raw photo with text.

### D. Marketing site

The "thinking environment for people making complex things" positioning needs Schoger's marketing-site patterns:

- Custom font on marketing pages, system font in product (Schoger's explicit recommendation).
- Section background alternation (white → off-white → brand color → dark) so the page reads as composed, not a single scroll.
- Hero photography colorized to brand temperature, not raw stock photos.
- HeroPatterns-style SVG textures at section transitions where Inkprint's halftone language wants to express itself.

### E. AI-slop detector — using Schoger as the corrective lens

This is the most important application for the gap audit's gap #4 ("AI-Generated UI Critique"). Run any v0 / Lovable / Cursor / Bolt output through Schoger's checklist:

**The "AI slop" patterns Schoger's framework catches:**

1. **Default Tailwind shadows uncomposed.** AI tools emit `shadow-md` everywhere with no two-part decomposition. → Tell.
2. **Pure grey text on coloured CTAs.** AI generates `text-gray-400` on `bg-blue-600`. → Schoger rule 3 violation.
3. **Outline buttons everywhere.** AI defaults to `border` + `bg-transparent` for secondary. → Replace with soft-solid based on text color.
4. **`rounded-2xl` + `shadow-lg` + `border` stacking.** Triple-belt-and-suspenders styling. Pick one.
5. **Pure greys (slate-400, gray-500) untinted.** No temperature. → Saturate cool or warm.
6. **Default 1.5 line-height across all headings.** AI doesn't adjust line-height by font size.
7. **Photos pasted into hero blocks without overlay.** AI doesn't compose hero treatments.
8. **Borders separating every form field, table row, and card section.** No use of background tint or zebra striping.
9. **`gap-4` / `space-y-4` everywhere with no inverse-whitespace pass.** AI starts tight, never overshoots first.
10. **No type-scale hierarchy.** Every heading is `text-2xl font-bold` regardless of role.

**The slop-detector skill prompt:** "Apply Schoger's Refactoring UI checklist to this v0 output. For each rule violated, name the rule, quote the violation, and propose a concrete fix in Tailwind classes."

Pair Schoger with Ryo Lu's "AI knows Shadcn well; your job is to paint over it" framing and you have the canonical operator pipeline for taking generated UI to a brand-consistent finish.

## Critical Analysis — What to Take vs Leave

### Where the talk is dated (June 2019)

- **No mention of dark mode discipline.** The whole talk assumes a light-mode product. Inkprint's dark mode contracts are not addressed. Pair with Josh Comeau's dark mode writing.
- **Variable fonts and font features** are mentioned only in passing (`tnum`). The 2026 web has a much richer typographic toolkit. Pair with the DesignSpo typography analysis.
- **WCAG accessibility** is mentioned only as a Q&A afterthought. The "soft tint dark-text-on-yellow" and "use perceived brightness" tricks accidentally improve accessibility, but Schoger does not frame his rules in WCAG 2.2 AA terms. **Do not** use this analysis as an accessibility audit substitute — gap #2 in the gap audit (accessibility canon) is a real, separate need.
- **Container queries, modern CSS layout (subgrid, `:has()`)** did not exist when this talk was filmed. Some "do this in CSS, but with limited support" caveats are now outdated — most can be done in CSS today.
- **No mention of motion or micro-interactions.** The framework treats UI as static composition. Layer Val Head / Pasquale D'Silva on top.

### Where the framework still over-indexes on Bootstrap-era problems

- The "remove borders" advice is calibrated against Bootstrap's heavy-bordered defaults. Tailwind / shadcn era apps already trend underbordered; over-applying this rule produces structureless soup.
- "System font in product, custom font on marketing" is a 2019-era opinion. In 2026, products like Linear, Stripe, and Granola **do** use custom fonts in product successfully — the system-font default is no longer canonical operator wisdom.

### Where the framework is timeless and should anchor BuildOS skills

- The **hue-rotation-for-perceived-brightness** trick is the deepest insight in the talk and applies forever.
- **Two-part shadows** as a physical model is the highest-leverage technical move and translates 1:1 into modern CSS.
- **Constrained palette + 9-shade hue scales** is the single best argument for token-driven design systems and predates Inkprint's existence.
- **"Start with too much whitespace and remove"** is an anti-cargo-cult heuristic that beats every "spacing scale" argument because it forces you to feel the design, not arithmetic it.
- **"Think outside the database"** is the rare design rule that's actually a data-modeling rule. It's what separates Linear-class UI from generic CRUD UIs and applies directly to BuildOS's daily-brief and project-list surfaces.

### Take, leave, and extend

| Take                                                 | Leave                                             | Extend with                                                              |
| ---------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------ |
| Two-part shadows                                     | "Use system fonts in product"                     | Josh Comeau on dark mode shadows                                         |
| Hue rotation for perceived brightness                | "WCAG can be a Q&A afterthought"                  | WCAG 2.2 AA + Sara Soueidan accessible color                             |
| Constrained palette + 9-shade scales                 | "CSS blend modes have limited browser support"    | Modern CSS color-mix(), oklch                                            |
| Start-with-too-much-whitespace heuristic             | "Always replace borders" (overcorrection in 2026) | Erik Kennedy on density tuning                                           |
| Off-white inputs / panels for depth without borders  | —                                                 | shadcn theming patterns                                                  |
| "Think outside the database"                         | —                                                 | Don Norman on affordance + Alan Cooper on archetypes                     |
| Soft-solid secondary buttons derived from text color | —                                                 | Radix headless primitives + Inkprint button tokens                       |
| Card-as-clickable-affordance                         | —                                                 | Apple HIG on touch targets + accessibility focus state                   |
| Inverse-whitespace algorithm                         | —                                                 | Calm-software canon (Linear, Things, 37signals) for restraint discipline |
