---
title: 'ANALYSIS: 7 Rules for Creating Gorgeous UI — Erik Kennedy / Learn UI Design'
source_type: article_analysis
source_url:
    - 'https://www.learnui.design/blog/7-rules-for-creating-gorgeous-ui-part-1.html'
    - 'https://www.learnui.design/blog/7-rules-for-creating-gorgeous-ui-part-2.html'
source_transcript:
    - '../transcripts/2026-04-29_erik-kennedy_7-rules-gorgeous-ui-part-1.md'
    - '../transcripts/2026-04-29_erik-kennedy_7-rules-gorgeous-ui-part-2.md'
author: 'Erik D. Kennedy'
publication: 'Learn UI Design'
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
    - visual-craft
    - ui-design
    - typography
    - color-systems
    - whitespace
    - hierarchy
    - shadow-and-light
    - text-on-image
    - font-selection
    - dribbble
    - design-fundamentals
    - ai-ui-slop
path: docs/research/youtube-library/analyses/2026-04-29_erik-kennedy_7-rules-gorgeous-ui_analysis.md
---

# ANALYSIS: 7 Rules for Creating Gorgeous UI — Erik Kennedy / Learn UI Design

## Skill Combo Links

This source contributes to these multi-source skill combo indexes:

- [Product And Design Skill Combos](../skill-combo-indexes/PRODUCT_AND_DESIGN.md): Visual craft fundamentals (proposed); UI/UX quality review (extension); AI UI slop detector and rewrite (proposed)

## Source

- **Title (Part 1):** 7 Rules for Creating Gorgeous UI (2024 Update) — Part 1
- **Title (Part 2):** 7 Rules for Creating Gorgeous UI — Part 2
- **Author:** Erik D. Kennedy
- **Publication:** Learn UI Design (learnui.design)
- **URL (Part 1):** https://www.learnui.design/blog/7-rules-for-creating-gorgeous-ui-part-1.html
- **URL (Part 2):** https://www.learnui.design/blog/7-rules-for-creating-gorgeous-ui-part-2.html
- **Format:** Long-form essay pair, originally 2014, updated 2024
- **Audience:** Developers and UX designers who want gorgeous UI without art-school training

## Core Thesis

Kennedy's claim is the single most important sentence in this entire source stack for the BuildOS founder/engineer: **gorgeous UI is not a talent — it is a learnable set of seven specific, atomic, repeatable rules**. You don't need an art degree, you don't need "an eye for it," and you don't need taste-as-mystery. You need to look at good designs, name what's happening, and copy the moves. The seven rules cover light direction, color discipline, whitespace, text-on-image overlays, hierarchical contrast, font selection, and deliberate imitation. Each rule comes with named techniques and numerical guidelines (35% opacity, -1% letter-spacing, "twice text height" spacing) so the rule survives translation from intuition to checklist. The deepest move in the essay is anti-mystical: "every artist should be a parrot until they're good at mimicking the best." That collapses the gap between "I'm not a designer" and "I can ship a screen that looks intentional."

## TL;DR Rules Table

| #   | Rule                                       | One-line fix                                                                                                                                                                                                                  |
| --- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Light comes from the sky                   | Tops of elements are lighter; bottoms are darker. Buttons get a subtle shadow below + a slightly brighter top edge. Inset = inputs, sliders, checkboxes. Outset = buttons, cards, dropdowns, popups.                          |
| 2   | Black and white first                      | Build the screen in grayscale before any color. Then add ONE accent color. Think in HSB (Hue, Saturation, Brightness), not hex. Use a single hue and modulate S/B for variety.                                                |
| 3   | Double your whitespace                     | Treat whitespace as default; remove it intentionally. Menu items: vertical space ≈ 2× text height. List title to underline ≈ 15px. Between sections ≈ 25px. Top-nav text ≈ 20% of bar height.                                 |
| 4   | Learn methods of overlaying text on images | Pick a method by image: Method 0 (raw text), Method 1 (35% black overlay on whole image), Method 2 (text-in-a-box), Method 3 (blur), Method 4 (floor fade), Bonus (Scrim — radial gradient).                                  |
| 5   | Make text pop — and un-pop                 | Page titles use all up-pop. Everything else: combine up-pop (large, bold, high-contrast) WITH down-pop (thin, low-contrast). Never up-pop on its own except titles.                                                           |
| 6   | Use only good fonts                        | Free defaults: Satoshi, Metropolis, Source Sans (with -1% letter-spacing), Figtree. Premium via Adobe Fonts: Proxima Nova, Adelle Sans, DIN, Freight Text. Filter Google Fonts; don't browse it raw.                          |
| 7   | Steal like an artist                       | Mimic before inventing. Sources ranked: Dribbble (highest quality) → Layers → Mobbin (300k+ mobile screens, filterable by pattern). Named designers to study: Jamie Syke, Balkan Brothers, Cosmin Capitanu, Elegant Seagulls. |

## Operating Lessons

### Rule 1: Light Comes From the Sky

**Direct application:** Real-world lighting comes from above; UI lighting must too. When you build a button, give it four light cues simultaneously:

1. **Dark bottom edge** on unpressed buttons (where the button casts onto itself).
2. **Slightly brighter top surface** — implies a curved surface catching light.
3. **Subtle shadow beneath** the button (drop shadow, not stylistic shadow).
4. **Overall darker appearance when pressed** — as if a hand has blocked the light.

**Inset vs. outset taxonomy** (this is the rule's load-bearing classification — memorize it):

- **Inset** (recessed, receives less light, looks pressed in): text inputs, pressed buttons, slider tracks, unselected radio buttons, checkboxes.
- **Outset** (protruding, catches more light, looks raised): unpressed buttons, slider thumbs, dropdowns, cards, the selected portion of a radio button, popups.

**Numerical/named technique — "flatty design":** Flat design (post-2014) removed all shadow. Complete removal hurt usability. The current discipline is "flatty" — minimalist surfaces with subtle shadows where information is conveyed. **Higher surfaces are brighter** because they catch more sunlight; this is how you communicate elevation without heavy drop shadows.

**Do-not-do warnings:**

- Don't put light underneath an element. Bottom-up illumination reads as unsettling — uncanny valley for UI.
- Don't strip ALL shadow in the name of flat design; users lose pressed/unpressed and elevated/recessed information.
- Don't apply the same shadow recipe to inputs as to buttons. Inputs are inset; the inner shadow goes IN, not below.

### Rule 2: Black and White First

**Direct application:** The first pass of every screen is grayscale-only. Text, backgrounds, buttons, icons, dividers — all gray. **Color is the most complex visual variable**, so you defer it until layout, spacing, hierarchy, and structure are right. If a screen looks bad in black-and-white, color cannot fix it.

**Color application sequence** (ordered, do not skip):

1. Complete the design in pure grayscale.
2. Add a **single accent color** — one hue only.
3. If you must, advance to two colors, OR multiple saturation/brightness levels of one hue.
4. Stop. The instinct to add a third color is wrong.

**HSB color system** (named technique — this is operator-grade):

- Stop thinking in **RGB hex codes**. They don't map to perception.
- Think in **HSB (Hue, Saturation, Brightness)**. This aligns with how the eye reads color.
- For a single-hue palette: lock the Hue, vary Saturation and Brightness to derive darks, lights, backgrounds, accents, and eye-catchers — all from one hue. The whole palette stays harmonious automatically because the H value never changes.

**Single-hue palette move (named):** A single-hue design generates "darks, lights, backgrounds, accents, eye-catchers while maintaining visual harmony." This is why Stripe-blue, Linear-purple, and Notion-near-monochrome all read as confident — they didn't pick five colors; they picked one and modulated S and B.

**Quotable:** "Using multiple colors from one or two base hues is the most reliable way to accentuate and neutralize elements without making the design messy."

**Do-not-do warnings:**

- Don't pick three accent colors of equal saturation. The eye can't decide what to look at.
- Don't reach for a CSS palette generator before you've designed the gray version.
- Don't think in hex. Use HSB sliders (or `hsl()` in CSS) so you can move along S and B without breaking H.

### Rule 3: Double Your Whitespace

**Direct application:** Reverse the default. Most people add space when something looks cramped. Kennedy says: **start with twice as much space as you think you need; remove it only if you must**. Whitespace is the primary signal that a screen was designed, not slapped together.

**Numerical guidelines** (this is the most concrete rule in the essay — copy these literally):

- **Menu items:** vertical space = **2× the text height**.
- **List title to underline:** **15px**, which "exceeds font cap height" — meaning the underline should clear the top of the capital letters with room to spare.
- **Between different lists / sections:** **25px**.
- **Top navigation bar:** the text occupies only **~20% of the bar's height**. Same for icons. The other 80% is breathing room.

**The HTML default problem (named):** Unstyled HTML produces small fonts, minimal line-spacing, edge-to-edge content. This is the visual default the developer brain reaches for. The fix is mental: **whitespace is the default, content is the exception** — not the other way around.

**Hierarchy of spacing** (apply at all three levels):

1. Between lines of text (line-height).
2. Between individual elements (padding, margin).
3. Between element groupings (section gaps).

If only one level has generous spacing, the screen still looks crowded.

**Do-not-do warnings:**

- Don't fill empty space because it "looks empty." Empty space is the design.
- Don't size top-nav text or icons to fill the bar. Aim for ~20% occupation.
- Don't apply spacing only between sections; if line-height and padding are tight, the macro-spacing won't read.

### Rule 4: Methods of Overlaying Text on Images

**Direct application:** Text on a photo fails by default. Pick a method that matches the image. Kennedy lays out **six numbered techniques**, each with a specific use case and named example:

**Method 0 — Direct text on image.** White text dropped on the photo with no overlay. Requirements: dark image, minimal contrast edges in the text area, white text only, tested at all screen sizes. **Generally not recommended for professional work.** Treat this as "I checked, it works for this exact image."

**Method 1 — Overlay the whole image.** Apply translucent black across the entire photo. **Numerical guideline: 35% opacity black filter (the Upstart website example).** Best for thumbnails and any case where the source image lacks contrast for text.

**Method 2 — Text-in-a-box.** White text inside a semi-transparent black rectangle. **Most reliable method** — works regardless of underlying image. Colored boxes are technically allowed but require restraint; default to black.

**Method 3 — Blur the image.** Gaussian blur on the region under the text. "iOS does a ton of background blurring." Variation: use the naturally out-of-focus portion of the photograph. Risk: requires consistent image style — some photos won't have a good blur region.

**Method 4 — Floor fade.** A vertical gradient that fades to black at the bottom of the image and stays transparent at the center/top. Connects to Rule 1 — the darkness lives at the floor because that's where shadow naturally falls. **Named refinement: Medium-style text shadow** — a slight shadow on the text itself, on top of the floor fade, for additional legibility.

**Advanced variant: floor blur** — combine Method 3 (blur the bottom region) with Method 4 (gradient to dark at bottom).

**Bonus method — Scrim.** An **elliptical gradient** transitioning from translucent black at the center to transparent black at the edges, positioned behind white text. Kennedy calls this **"probably the most subtle way of reliably overlaying text on images."** This is the move that separates good UI from confident UI — it darkens only where the text is, leaving the rest of the photo untouched.

**Do-not-do warnings:**

- Don't ship Method 0 to production unless every image variant has been tested for contrast. One light photo breaks the screen.
- Don't use multiple methods on the same surface (a 35% overlay AND a blur AND a text shadow); the photo dies under the treatment.
- Don't put colored overlays on photographs unless the brand color demands it. Black is the safe default.

### Rule 5: Make Text Pop — and Un-pop

**Direct application:** The non-obvious move in this rule is "un-pop." Most amateur designers only know how to make text MORE visible. Kennedy's claim is that **every emphasized element needs both up-pop AND down-pop properties simultaneously**. A title that is simultaneously huge, bold, capitalized, and high-contrast is exhausting. A title that is huge AND bold but in a slightly faded gray reads as confident.

**Available styling tools** (the levers you have):

- Size (larger / smaller)
- Color (high-contrast / low-contrast; bright = attention, muted = recede)
- Font weight (bold / thin)
- Capitalization (lowercase, UPPERCASE, Title Case)
- Italicization
- Letter spacing (tracking — tighter or looser)
- Margins (more space = more importance)

**Tools NOT to use:**

- **Underlining** — implies a link, breaks navigation expectations.
- **Text background color** — looks like a highlighted form field or a button.
- **Strikethrough** — semantic meaning (deleted, completed).

**Up-pop / down-pop framework (named):**

- **Up-pop properties:** big, bold, capitalized, high-contrast, bright color.
- **Down-pop properties:** small, low-contrast, thin weight, muted color.

**The load-bearing rule:** _"Page titles are the only element to style all-out up-pop. For everything else, you need up-pop and down-pop."_ An emphasized non-title element should use **more up-pop styles than down-pop**, but **both must be present**.

**Named example — Blu Homes:** large numbers (up-pop: size) paired with "very light font-weight and lower-contrast color" (down-pop: weight + contrast). The number reads as the hero, but the weight keeps it from screaming.

**Selected and hovered states:** Changing size, case, or weight on hover causes layout shift. Avoid. Acceptable hover/selected moves:

- Text color change.
- Background color shift.
- Shadow appearance/change.
- Slight raise/lower animation (transform, not size).

**Hover strategy (named):** "Turn white elements colored, or turn colored elements white, but darken the background behind them."

**Do-not-do warnings:**

- Don't stack three up-pop properties on every emphasized element. Pick one or two; balance with down-pop.
- Don't use underline for emphasis — users will try to click.
- Don't change font size or weight on hover; the row will jump.
- Don't use text background color for emphasis — readers parse it as a button or input.

### Rule 6: Use Only Good Fonts

**Direct application:** Type choice is dispositive. A screen with bad font selection cannot be saved by good spacing, color, or hierarchy. Kennedy's bias is toward **clean, simple, neutral sans-serifs suitable for professional UI**. Avoid expressive display fonts in product UI.

**The four free fonts to know:**

1. **Satoshi** (Indian Type Foundry, FontShare). Has quirky `a` and `g` glyphs but stays modern and friendly. Best for: brands that want personality without looking unserious.

2. **Metropolis.** Homage to **Gotham and Proxima Nova**. Described as "sturdy and simple" — capable of bold without aggression. **"Underused on web."** Best for: brands that want geometric confidence without paying Adobe.

3. **Source Sans.** Humanist sans-serif with handwriting-derived letterforms. **Numerical guideline: pair Source Sans with -1% letter-spacing** for a clean, considered appearance. Comes with siblings (Source Serif, Source Code) — useful for full type families.

4. **Figtree** (designed by Kennedy himself). "Clean-yet-casual" with rounded, playful features but staying neutral enough for UI. Best for: filling the gap when you want approachable but not cute.

**Premium fonts via Adobe Fonts** (Creative Cloud subscribers):

- **Proxima Nova** — the workhorse of mid-2010s SaaS.
- **Adelle Sans** — humanist sans with personality.
- **DIN** — German engineering serious.
- **Freight Text** — premium serif for editorial moments.

**Sourcing strategy:**

- **Google Fonts** — largest free library, but **requires aggressive filtering**. Don't browse it raw; bring a target.
- **FontShare** (Indian Type Foundry) — lesser-known, high quality, free for commercial use.
- **Adobe Fonts** — premium catalog if you have Creative Cloud.
- Kennedy's "Good Fonts Table" — 100+ curated fonts with category and usage notes (subscriber resource).

**Do-not-do warnings:**

- Don't browse Google Fonts hoping inspiration strikes. You will pick something bad. Filter first.
- Don't pair a display font with another display font. Pair a display font with a clean body sans-serif.
- Don't reach for Comic Sans / Papyrus / any font with strong personality unless the project genuinely calls for it (a clown brand, a hand-drawn project).
- Don't use Source Sans at default letter-spacing. Tighten by -1%.

### Rule 7: Steal Like an Artist

**Direct application:** This is Kennedy's anti-mystical move. **Imitation is the curriculum.** Designers who reach gorgeous UI got there by parroting good designers until they had absorbed the moves, then finding their own style. The skill of mimicry IS the skill of design.

**Quotable:** _"Every artist should be a parrot until they're good at mimicking the best. Then go find your own style."_

**Resources, ranked:**

**1. Dribbble** — invitation-only design showcase. **"Bar-none the highest quality of UI work online."** Recommended designers to study (these are operator-grade picks):

- **Jamie Syke** — "Posting new UI basically all the time" with consistent quality. Volume + craft.
- **Balkan Brothers** — exceptional color and gradient work. They keep flat design relevant.
- **Elegant Seagulls** — alternatives to standard Bootstrap grids. Useful when you're tired of the same 12-column move.
- **Cosmin Capitanu** — futuristic without garishness. Strong color sense.

**2. Layers** — newer work-sharing platform attempting to dethrone Dribbble.

**3. Mobbin** — directory of **300,000+ mobile app screenshots, filterable by UX pattern or interface element** (login pages, profiles, search results, settings, onboarding). This is the killer research tool: when you need to design a "create new project" screen, you don't sketch — you filter Mobbin for "create flows" and study fifty real ones.

**Do-not-do warnings:**

- Don't try to invent a new pattern. The screen has been solved. Find good versions and copy.
- Don't browse Pinterest as your design research. The signal-to-noise ratio is wrong.
- Don't copy a screen wholesale (that's plagiarism); copy the _moves_ — spacing, hierarchy, color choices, type pairings.

## Cross-Cutting Principles (What's Distinct About Kennedy)

A few things separate this source from the existing PRODUCT_AND_DESIGN stack (Kole Jain atomic fixes, DesignSpo typography, Refactoring UI):

1. **Numerical and named, not vibes.** Every Kennedy rule produces a number you can copy (35% opacity, -1% letter-spacing, 15px, 25px, 2× text height, 7:1 contrast, 20% bar height) or a named technique (HSB single-hue, Method 0–4, Scrim, floor fade, up-pop/down-pop, flatty design). DesignSpo has rules-of-thumb; Kennedy has rules with numbers. Kole Jain has corrections; Kennedy has constructive recipes.

2. **The up-pop/down-pop framework is unique in this stack.** No other source names the move where emphasized elements simultaneously raise AND lower their visibility. This is the rule that separates "founder-built screen" from "Linear-grade screen."

3. **HSB-not-hex is operator-grade color.** Most engineer/founder design content treats color as "pick a palette." Kennedy says: pick a hue, modulate saturation and brightness; you'll automatically get harmony. This is the cheat code that explains why Stripe / Linear / Vercel / Notion all look intentional with very few colors.

4. **Scrim and floor-fade are named techniques no other source in our library catalogues.** When BuildOS needs a marketing hero with text on photography, these are the moves to reach for.

5. **"Steal like an artist" is anti-mystical pedagogy.** Most design content frames craft as taste. Kennedy frames craft as imitation curriculum + named techniques. This is the right framing for a non-designer founder.

6. **No accessibility, no IA, no information density.** This is the limit (see Critical Analysis below). Kennedy is great on visual surface; he is silent on whether the screen is the _right_ screen.

## Quotables

- "Every artist should be a parrot until they're good at mimicking the best. Then go find your own style."
- "Page titles are the only element to style all-out up-pop. For everything else, you need up-pop and down-pop."
- "Higher surfaces are brighter — because they catch more of the sun's rays."
- "Using multiple colors from one or two base hues is the most reliable way to accentuate and neutralize elements without making the design messy."
- "Probably the most subtle way of reliably overlaying text on images." (on Scrim)
- "Turn white elements colored, or turn colored elements white, but darken the background behind them."
- "iOS does a ton of background blurring."

## Practical Checklist (BuildOS UI Audit Version)

When auditing a BuildOS screen with Kennedy's rules, walk this checklist top to bottom:

**Light & Surface (Rule 1):**

- [ ] Are buttons unmistakably outset (subtle shadow below, slightly brighter top)?
- [ ] Are inputs / sliders / unchecked checkboxes unmistakably inset?
- [ ] Are pressed/active states darker (as if a hand blocked the light)?
- [ ] Is any element lit from below? (Fail if yes.)

**Color (Rule 2):**

- [ ] Did the screen exist in grayscale before color was added?
- [ ] Is there ONE accent color? (Or single-hue with S/B variations.)
- [ ] Are tokens defined in HSB / HSL — not raw hex?
- [ ] Is any element using a third unrelated hue? (Suspect.)

**Whitespace (Rule 3):**

- [ ] Menu items: vertical space ≥ 2× text height?
- [ ] List title to underline: ~15px (clears cap height)?
- [ ] Between sections: ~25px or more?
- [ ] Top nav text: ~20% of bar height?
- [ ] Whitespace exists at all three levels (line, element, group)?

**Text on Images (Rule 4 — marketing/blog):**

- [ ] Method picked deliberately (Method 1 / 2 / 3 / 4 / Scrim) and not Method 0?
- [ ] Method 1 overlay: ~35% black?
- [ ] Method 4 floor fade: gradient at bottom only, not whole image?
- [ ] Scrim used for hero text on photography (most subtle)?

**Up-pop / Down-pop (Rule 5):**

- [ ] Page title: full up-pop (the only element allowed this).
- [ ] Every other emphasized element: up-pop AND down-pop both present?
- [ ] Hover state changes color/background/shadow — NOT size or weight?
- [ ] No underlines for emphasis (only for links)?
- [ ] No text-background-color for emphasis (looks like a button)?

**Type (Rule 6):**

- [ ] Is the body font on the "good list" or comparable (Satoshi, Metropolis, Source Sans, Figtree, Inter, Geist, Proxima Nova, Adelle Sans)?
- [ ] Is letter-spacing tuned (-1% for Source Sans; tightened on display sizes)?
- [ ] Is a display font being misused for body? (Fail.)

**Imitation (Rule 7):**

- [ ] Has the screen been compared to 5+ similar screens on Mobbin / Dribbble before shipping?
- [ ] Is the layout doing something genuinely novel, or is it borrowing from a vetted pattern?

## Application to BuildOS

### A. Inkprint Tokens

Apply Kennedy's rules to the existing Inkprint design system:

1. **Surface taxonomy (Rule 1).** Audit Inkprint to confirm token-level distinction between **inset surfaces** (input fields, slider tracks, unchecked boxes, pressed buttons) and **outset surfaces** (cards, popups, dropdowns, primary buttons, the daily-brief card). The `shadow-ink` token is doing some of this work — verify it has BOTH an inset variant (inner shadow, slightly darker top) AND an outset variant (drop shadow + slightly brighter top edge). The synesthetic/halftone aesthetic of Inkprint can lean further into "flatty" — minimal shadows, but never zero.

2. **HSB color refactor (Rule 2).** Audit Inkprint color tokens. If they are defined in raw hex, refactor to HSL/HSB so the BuildOS brand hue is a single value and S/B modulate the rest of the palette. This is the rule that makes Linear-purple / Stripe-blue look confident — Inkprint should pick a hue and own it. Single-hue palette + grayscale neutrals + ONE accent should be the rule for in-product UI.

3. **Whitespace doubling (Rule 3).** Audit Inkprint spacing tokens (`space-*`). Are menu items achieving ~2× text height vertically? Are section gaps ~25px+ at the base scale? Are top-nav text and icons sized at ~20% of nav bar height? If any token's smallest variant is below "comfortable," kill it. Kennedy's bias is toward more space, not less.

4. **Up-pop / down-pop typography pairing (Rule 5).** The existing typography roles (heading, paragraph, button, label) should each be inspected for whether they combine up-pop AND down-pop properties. Daily-brief headings should not be max-bold-max-contrast-max-size all at once; they should be large + bolder, but at a slightly muted contrast. Page titles are the only element allowed full up-pop. Codify this in Inkprint's text role definitions.

### B. Daily-Brief / Brain-Dump Screens

The two highest-value BuildOS surfaces, audited rule by rule:

1. **Daily Brief (consumer-grade reading surface).**
    - Apply **Method 4 floor-fade** if any hero photography exists (rare in product UI, but the same gradient logic applies to long card hovers).
    - The brief headline should be **large + bolder + slightly muted contrast** (up-pop on size + weight, down-pop on color). This is Kennedy's Blu Homes pattern.
    - The body of the brief: thinner weight, ~1.5× line-height (DesignSpo cross-link), comfortable horizontal margins. Whitespace at all three levels — between lines, between paragraphs, between sections.
    - "Generate Brief" / "Send Notification" CTAs: outset buttons with subtle shadows below + slightly brighter top edges. Pressed state darker.

2. **Brain-Dump screen.**
    - Input field is **inset** — inner shadow, no drop shadow, slight darkening of the top edge to imply depth.
    - Submit button is **outset** — confidently raised with bottom shadow.
    - Use grayscale + ONE BuildOS accent for emphasis (the "send" or "process" state). Resist multi-colored status indicators.
    - Whitespace around the input field should be generous — at least 2× the text height of any nearby element. Cramped brain-dump UI feels stressful, which is exactly the wrong vibe.

### C. Marketing Pages

The marketing surface is where Kennedy's text-on-image rules matter most:

1. **Hero photography** (if used): apply **Scrim** by default for hero headlines. Most subtle, most reliable. Avoid Method 0 (raw text on photo) entirely.

2. **Section banners with photography**: Method 1 (35% black overlay) for thumbnails and Method 4 (floor fade) for full-bleed sections. Add a slight text shadow per the Medium-style technique.

3. **Hero typography**: full up-pop on the H1 (this is the one place full up-pop is allowed). Subhead: down-pop in proportion — thinner weight and slightly muted color so it doesn't fight the H1.

4. **Single-hue palette with one accent**: marketing pages should NOT use the full design-system palette. Pick the BuildOS hue, modulate S/B for sections, accent ONE color (the CTA color). This is the discipline that makes Linear and Stripe marketing pages feel intentional.

5. **Whitespace doubling**: marketing sections should have aggressive vertical breathing room — Kennedy's "double your whitespace" applies most loudly here. Cramped marketing pages read as untrustworthy.

### D. AI-Generated Component Review (Kennedy as a "Slop Detector")

This is where Kennedy's rules become BuildOS's strongest weapon against gap #4 in the audit (`ai-ui-slop-detector-and-rewrite`). When v0 / Lovable / Cursor outputs land in the BuildOS codebase, run them against Kennedy's framework:

1. **Rule 1 slop signal — generic shadow recipes.** v0 ships components with the same `shadow-md` on everything. Kennedy demands a distinction between inset and outset. Refactor inputs to inset, buttons to outset, popups to outset with stronger shadow. Kill flat shadows that don't communicate depth.

2. **Rule 2 slop signal — palette generators / hex-defined tokens.** AI tools default to Tailwind's slate/neutral/blue palette and stop. Re-derive the palette in HSB with one BuildOS hue. Replace `text-slate-500` with the down-popped version of the BuildOS hue. This is the move that makes a Shadcn screen stop looking like a Shadcn screen.

3. **Rule 3 slop signal — default Tailwind spacing (p-4, gap-4 everywhere).** AI components ship with `p-4` / `gap-4` and call it done. Audit against Kennedy's numerical guidelines: menu items 2× text height, sections 25px+, top-nav text 20% of bar height. **Double the spacing values v0 ships and re-evaluate.**

4. **Rule 4 slop signal — text directly on hero images.** v0 and Lovable will happily drop white text on a photo with no overlay (Method 0). Replace with Method 1 (35% overlay) or Method 4 (floor fade) or Scrim. This is the single biggest visual upgrade you can make to AI-generated marketing pages.

5. **Rule 5 slop signal — every emphasized element at full up-pop.** AI-generated screens stack big + bold + uppercase + high-contrast on titles, subheads, AND buttons. Result: visual fatigue. Apply Kennedy's principle — only the page title gets full up-pop. Subheads and buttons must combine up-pop with down-pop. This is the framework that turns "Shadcn slop" into something that looks designed.

6. **Rule 6 slop signal — Inter everywhere.** Every AI-generated screen in 2025-2026 uses Inter. It's a fine font. It's also the single biggest visual fingerprint of AI output. Swap to Satoshi, Metropolis, Figtree, or pair Inter with a display headline font (Geist, Source Serif). Apply Source Sans's -1% letter-spacing rule wherever a humanist sans is used.

7. **Rule 7 slop signal — every screen looks like every other AI-generated screen.** Run the Mobbin test: search the pattern (e.g., "settings page") and look at 20 real apps. Steal moves from the best three. The AI-generated default is the worst possible mimicry source — it's the average of average.

**Output of an AI-slop audit using Kennedy:** a rewrite that names the slop pattern (Rule N violation), proposes the fix (Kennedy's named technique), and codifies the diff in Inkprint tokens so it doesn't recur on the next v0 paste.

## Critical Analysis — Limits of the Framework

Kennedy's seven rules are the most operator-grade visual-craft canon in this entire library. They are also explicitly **scoped to visual surface, not interaction or structure**. The limits matter:

1. **No accessibility.** Kennedy doesn't address WCAG, contrast ratios beyond aesthetic preference, focus states, keyboard navigation, screen-reader semantics, motion sensitivity, or inclusive color palettes. A screen that passes all seven rules can still fail an accessibility audit. **Pair Kennedy with the gap #2 source pull (Heydon Pickering, Sara Soueidan, Adrian Roselli, WCAG 2.2 AA) before treating an audit as complete.**

2. **No information architecture.** Kennedy assumes the screen is the right screen — that the navigation, task model, and content structure have already been decided. He does not address "is this the right thing to show the user?" For that, gap #7 (Don Norman, Alan Cooper, Peter Morville, Jesse James Garrett) is required. A gorgeous screen of the wrong information is still wrong.

3. **Bias toward consumer / marketing UI.** Kennedy's examples (Upstart, Medium, Blu Homes, Dribbble) skew toward consumer brand surfaces and marketing pages. The rules transfer well to BuildOS marketing surfaces. They transfer less well to **B2B information density** — dashboards, settings pages, dense data tables, multi-pane editors. The "double your whitespace" rule, applied literally to a Linear-style triage view or a Stripe Dashboard transactions table, would destroy the signal density users actually want. Kennedy is silent on density. Cross-link with Stripe dashboard / Linear / Atlassian density writing once that source pull lands (gap #3).

4. **No motion or micro-interaction guidance.** The "selected and hovered styles" section is the closest Kennedy comes; it's a single paragraph. For motion as a pattern language, Val Head / Pasquale D'Silva / Rachel Nabors are needed (currently missing from the library).

5. **No design-system architecture.** Kennedy gives you the rules for one good screen. He does not give you the architecture for tokens, primitive components, contribution models, or multi-brand systems. For Inkprint-as-a-system rather than Inkprint-as-a-styling, gap #3 (Brad Frost, Nathan Curtis, Una Kravets) is needed.

6. **Dribbble bias.** Kennedy's "steal like an artist" canon is heavily Dribbble-anchored. Dribbble is a portfolio platform — it optimizes for static beauty over usability. A founder mimicking Dribbble pages risks shipping screens that are visually striking but interactionally broken. **Mobbin is the better recommendation Kennedy himself gives** (filterable real-app screenshots). Lean Mobbin-heavier than Dribbble-heavier when applying Rule 7 to BuildOS.

7. **2014 update, 2024 refresh — but still pre-AI-era.** The essay does not address AI-generated UI patterns, which is the dominant slop problem of 2026. Kennedy's framework is the right _tool_ to fight AI slop (see "AI-Generated Component Review" above), but he doesn't apply it that way himself. That synthesis is BuildOS's job.

**Bottom line:** Kennedy is the right operator-grade source for _every visual surface_ in BuildOS, the strongest single source for the proposed `visual-craft-fundamentals` skill, and the load-bearing reference for the proposed `ai-ui-slop-detector-and-rewrite` skill. He is not sufficient on his own. Pair with Refactoring UI (Wathan/Schoger), accessibility canon (gap #2), and IA fundamentals (gap #7) for a complete review framework.
