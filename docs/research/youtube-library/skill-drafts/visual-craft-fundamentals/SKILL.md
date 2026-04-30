---
name: visual-craft-fundamentals
description: Take a UI from "not amateur" to "actually looks excellent" by applying operator-canon visual-craft techniques (two-part shadows, hue-rotation over lightness, up-pop / down-pop, HSB single-hue palettes, double-your-whitespace, named font pairings). Use as the level-up companion to `ui-ux-quality-review` and as the corrective lens for AI-generated UI from v0 / Lovable / Cursor.
path: docs/research/youtube-library/skill-drafts/visual-craft-fundamentals/SKILL.md
---

# Visual Craft Fundamentals

Use this skill to take a UI from "passes the beginner check" to "looks designed by someone who can see." The review is opinionated, numerical, and operator-grade. It refuses vibes-talk and ships in concrete moves: two-part shadows, hue rotation instead of lightness, up-pop paired with down-pop, single-hue HSB palettes, double-your-whitespace, named font pairings, and named text-on-image methods. Polish is tactics, not talent.

This skill is the **level-up sibling** of `ui-ux-quality-review` and the **corrective lens** for AI-generated UI from v0 / Lovable / Cursor / Bolt.

## When to Use

- Level up a screen that already passes the beginner-mistake bar but still feels generic
- Rewrite v0 / Lovable / Cursor / Bolt output before it ships
- Audit Inkprint tokens against operator canon (shadows, color scale, type scale, spacing)
- Tighten a marketing hero, dashboard card, or empty state from "fine" to "intentional"
- Diagnose why a screen reads as "Shadcn slop" or "default Tailwind"
- Pick fonts for a new brand surface or a marketing-site refresh
- Apply text-on-image overlays (hero photography, blog covers, OG images)

Do not use this skill for: brand identity creation from zero, full-flow UX review (use `ui-ux-quality-review`), section-by-section landing-page review (use `marketing-site-design-review`), assessment-funnel design (use `landing-page-scorecard-funnel`), accessibility audit (use a dedicated WCAG 2.2 AA process).

## Distinction from `ui-ux-quality-review`

`ui-ux-quality-review` catches **obviously broken**: missing states, cramped spacing, tiny touch targets, inconsistent components, mystery icons, no feedback on click. It is the "do not look like a beginner" pass.

This skill ships **obviously crafted**: surfaces that read as designed, not assembled. It assumes the beginner-check pass is already complete and applies Refactoring UI / Erik Kennedy / Schoger-grade moves on top — perceived-brightness color, decomposed two-part shadows, simultaneous up-pop and down-pop, single-hue palettes, and constrained type and spacing systems. Use them in sequence: first `ui-ux-quality-review`, then this skill.

## Foundational Principles

These are the load-bearing claims. Every operating technique below ladders into one of them.

- **Subtraction beats addition.** Almost every fix removes weight (fewer borders, softer icons, hue rotation instead of opacity drop, off-white instead of border, secondary button instead of primary, single-hue palette instead of three accent colors). Beginners add. Operators remove.
- **Hue rotation, not lightness, for "lighter" colored text.** Different hues have different inherent luminance. Drag lightness up on a blue and you wash it out; rotate the hue toward the nearest bright hue (blue → cyan) and you keep saturation. This applies to subtitles on colored backgrounds, gradients, and accent variants.
- **Whitespace is the default; content is the exception.** Start with too much space and remove only where it actually feels excessive. Adding space until it stops looking cramped stops you at the minimum acceptable point. Mobile needs more, not less.
- **Shadows are real-world physics with two light sources.** Every shadow decomposes into a tight ambient shadow (small offset, small blur, sits underneath the body) plus a soft direct shadow (larger offset, larger blur, room-light effect). One-shadow `box-shadow` is a tell.
- **Up-pop AND down-pop on every emphasized element.** Page titles are the only element allowed all-up-pop. Everything else combines an up-pop property (size, weight, contrast) with a down-pop property (thinner weight, muted contrast, looser tracking). Big + bold + high-contrast on every emphasis is the trap. Big + thin + muted is the pattern.
- **HSB color thinking, single-hue palettes.** Reason in HSB (Hue, Saturation, Brightness); ship in hex. Lock the hue, modulate saturation and brightness for the entire scale. Stripe-blue, Linear-purple, Notion-near-monochrome — all single-hue + grayscale + one accent.
- **Optical adjustments over mathematical alignment.** A shadow that lifts equally to a smaller shadow at the same blur is wrong; perceived weight differs from measured weight. Trust your eye when the math and the perception disagree.

## Operating Techniques

### Shadows and Depth

- **Two-part shadow recipe.** Every shadow in the system stacks two `box-shadow` declarations:
    - **Ambient** — tight, dark, small vertical offset, small blur. Sits under the body.
    - **Direct** — larger, softer, larger vertical offset, larger blur. The room-light effect.
- **Shadow ladder by elevation** (xs → xl):
    - **xs** — buttons, inputs, chips (1–2px offset, 2–4px blur)
    - **sm** — small panels, dropdowns
    - **md** — large panels, sticky bars
    - **lg** — popovers, sheets
    - **xl** — modals
- **Higher elevation → softer direct shadow with negative spread.** As an object floats higher, its body occludes more of the direct light source. Drop the direct shadow's opacity and use a small negative spread to mimic occlusion.
- **Light gray, never pure black.** Figma's default `0 4px 4px rgba(0,0,0,0.25)` is too harsh. Change shadow color to a light cool or warm gray. If still too heavy, remove the shadow entirely.
- **Inset vs. outset taxonomy.**
    - **Inset surfaces** (recessed, less light): text inputs, slider tracks, unchecked checkboxes, pressed buttons.
    - **Outset surfaces** (raised, catches light): unpressed buttons, slider thumbs, dropdowns, cards, popups, the selected portion of a radio.
- **Light comes from the sky.** Tops of outset elements are slightly brighter; bottoms slightly darker. Never illuminate from below — that reads as uncanny.

### Color

- **HSB or HSL, not hex.** Pick in HSB. Ship the hex. Never type a raw hex when picking. CSS: use `hsl()` so you can move S and B without breaking H.
- **Single-hue palette as the default.** One brand hue + grayscale neutrals + one accent. The brand hue produces dark text variants, lighter subtitles, backgrounds, accents, and eye-catchers entirely from S/B modulation.
- **9–10 shades per hue** (Tailwind-style). If a hue has only 3 shades available, the system is incomplete. No one-off hex values bleeding through component code.
- **Reduced contrast by hue rotation, not lightness.** For subtitles or muted text on a colored background: sample the background color, drag the picker toward the top-left in HSB (lighter, less saturated, same hue). Do not use `text-gray-400` on a colored background.
- **60/30/10 proportion.** 60% dominant, 30% secondary, 10% accent (CTAs and focal points only). Complementary palettes never split 50/50 — they clash.
- **Greys are not pure grey.** Saturate cool (blue) for a cool-temperature brand, warm (yellow/brown) for a warm-temperature brand. **Bump saturation at the lightest and darkest extremes** so the temperature stays consistent across the scale.
- **Yellow/green/bright CTA inversion.** White-on-yellow forces yellow into bronze. Use **dark text saturated toward the background hue** — yellow background → dark orange text, not pure black.
- **Dark-mode accents drop ~10–15% saturation** vs. light mode. Screens are additive emitters; saturated colors fatigue against dark backgrounds.
- **Warm advances, cool recedes.** Warm hues for focal points and danger; cool hues as ground state.

### Typography

- **One primary font in product UI.** Pair only with display fonts on marketing surfaces.
- **Type scale (closed set):** 16, 20, 24, 28, 32, 40, 48, 64. Set the largest heading first, then derive smaller / thinner / more spaced.
- **Letter-spacing is inversely proportional to size.**
    - **Display sizes (48+): tighten by ~−1%** (-0.01em). Source Sans, in particular, is calibrated to want -1% across the board.
    - **Body sizes (16–20):** default tracking.
    - **Small text (12–14):** loosen slightly.
    - **Bold buttons:** add tracking so letters do not squish.
- **Line-height is inversely proportional to size.** ~1.0× for big headlines, ~1.5× for body. Override the browser default 125% — calibrated to be okay everywhere and great nowhere.
- **One hierarchy with four roles:** headings (2–3 levels, never all 6), paragraphs, buttons, labels. New screens assemble from this Lego set; never invent new roles per screen.
- **Body text contrast ≥ 4.5:1** (WebAIM AA), 7:1 where possible.
- **Match typeface category to brand voice.** Serif = traditional / editorial; sans-serif = modern / neutral; display = personality (headlines only, never body); script = elegant (rarely); mono = technical.
- **Font shortlist** (free, ship-ready):
    - **Satoshi** — modern friendly with quirky `a`/`g`. (FontShare)
    - **Metropolis** — Gotham/Proxima homage. Sturdy. Underused on web. (FontShare)
    - **Source Sans** — humanist sans; **always pair with -1% letter-spacing.**
    - **Figtree** — clean-yet-casual. Approachable without cute.
- **Premium picks** (Adobe Fonts): Proxima Nova, Adelle Sans, DIN, Freight Text.
- **System font in product, custom font on marketing** — Schoger 2019 default. Override only if the brand explicitly demands custom in product (Linear, Stripe, Granola).
- **Sourcing strategy.** Don't browse Google Fonts raw — bring a target. DevTools-inspect a site you like → look up the foundry → buy the bundle. FontShare and Adobe Fonts beat Google Fonts top-50 browsing.

### Spacing & Whitespace

- **4-pixel system, no exceptions.** Every spacing, padding, gap, container width, and font size is a multiple of 4px. Closed scale: 4, 8, 12, 16, 24, 32, 48, 64, 96.
- **Spacing assigned by relatedness:**
    - 4px = inside a composite element (icon + label)
    - 8px = list-item internal gap
    - 16px = inside a component
    - 24px = between components
    - 32px = between page sections
- **Double your whitespace.** Start with twice as much space as you think you need. Tighten only where it actually feels excessive.
- **Menu items:** vertical space ≈ **2× the text height**.
- **List title to underline:** ~**15px** (clears cap height with room).
- **Between sections:** ~**25px or more** at the base scale.
- **Top-nav text/icons:** occupy ~**20% of bar height**. The other 80% is breathing room.
- **Whitespace must exist at all three levels** simultaneously: between lines (line-height), between elements (padding/margin), between groupings (section gaps). If only one level breathes, the screen still looks crowded.
- **Mobile needs more whitespace than desktop**, not less. Cramped mobile is a tell.

### Up-pop / Down-pop

- **Up-pop properties:** larger size, bolder weight, higher contrast, capitalization, brighter color, more margin around it.
- **Down-pop properties:** smaller size, thinner weight, lower contrast, muted color, looser tracking.
- **Page titles get all up-pop.** This is the only element where stacking up-pop properties is allowed.
- **Every other emphasized element pairs at least one up-pop with at least one down-pop.** The hero number on a stat card: up-pop on size + down-pop on weight + down-pop on contrast. Big + thin + muted reads as confident. Big + bold + high-contrast reads as exhausting.
- **Forbidden emphasis tools:** underline (implies link), text background color (implies button or input), strikethrough (implies deleted/completed).
- **Hover/selected states** must not change size, weight, or case — they cause layout shift. Acceptable: text color change, background color shift, shadow appearance, slight raise/lower transform.

### Images and Overlays

Pick a numbered method for any text-on-image surface. Do not freelance.

- **Method 0** — Direct text on image. White text, no overlay. Allowed only when the image is uniformly dark, the image variants have all been tested, and the text is white. Generally not recommended for production.
- **Method 1** — Whole-image overlay. **35% black filter** across the entire photo. Default for thumbnails and any image lacking contrast for text.
- **Method 2** — Text-in-a-box. White text inside a semi-transparent black rectangle. **Most reliable** — works regardless of underlying image.
- **Method 3** — Blur. Gaussian blur on the region under the text (or use a naturally out-of-focus portion). Requires consistent image style.
- **Method 4** — Floor fade. Vertical gradient fading to black at the bottom only. Pair with a slight Medium-style text shadow for additional legibility.
- **Bonus — Scrim.** Elliptical gradient: translucent black at the center, transparent at the edges, sized to the text. **The most subtle reliable method.** Default for hero text on photography.
- **Advanced — Floor blur.** Method 3 + Method 4 combined: blur the bottom region and gradient to dark at the bottom.
- **Do not stack overlays.** A 35% overlay AND a blur AND a text shadow kills the photo. Pick one method.
- **Black is the safe default for overlays.** Colored overlays only when the brand explicitly demands.

### Icons

- **One library per region.** No mixing Heroicons + Lucide + Phosphor on the same screen.
- **Match line height.** Icons next to text generally match the text's line height around them.
- **Balance perceived weight.** Solid icons cover more surface area than text and read heavier — soften the icon color so it perceives as the same weight as the label.
- **Label ambiguous icons** with text or tooltips. The Safari default `<select>` chevron is the modern equivalent of `<font face="Times New Roman">`.
- **Replace browser default form controls** — radios, checkboxes, select chevrons. Custom every time.

### Buttons and Forms

- **Primary + secondary as visual weights, not visual styles.** Same shape, same radius, same height. Different background weight.
- **Cap radius.** Pick one radius for the whole system (often 10px for small components, 8–12px for inputs/cards). Mixing 4px / 12px / 24px on the same screen is a tell.
- **CTA color from already-in-context highlight.** Pull the CTA color from a hue already present nearby. Add an inner white highlight + outer drop shadow for tactile realism.
- **Inputs are 40–48px tall.** Smaller reads as Bootstrap leftover.
- **Input length signals expected content.** Date field ≠ address field width.
- **Off-white input backgrounds on white panels.** Subtle background creates the boundary without a heavy border.
- **Secondary button alternative to outline:** soft solid background **derived from the text color** at low alpha. Cleaner and lighter than a ghost button.

### Visual Hierarchy

- **One primary, a few secondary, the rest uniform.** Per section AND across the whole page. If everything is loud, nothing stands out.
- **Rank before style.** Decide what is 1st, 2nd, 3rd in primacy before picking sizes, fonts, or colors. Hierarchy is a ranking decision, not a styling decision.
- **Contrast levers in order:** motion, task-relevant info, white space, faces, color, size, weight, imagery, extra elements, deliberate misalignment. Beginners reach for color/size and skip the higher-ranked levers.
- **Cohesion rule.** Same-type components share every value: image size, font, weight, line height, border, radius, padding. Change one, change them all.
- **Composition matches scan path.** Z-pattern for minimalist hero/poster; F-pattern for text-heavy pages; top-to-bottom for cards/lists.
- **Borders are the amateur tool.** Use spacing, color shifts, and typography first. If a border is required, drop opacity and use it only to associate elements.
- **Headings as labels, not headlines** in tables and dense data: small, bold, **uppercase**, softer color. Don't let the table header steal attention from the data.

## AI-Slop Detection Patterns

These are the canonical fingerprints of v0 / Lovable / Cursor / Bolt output. Detect them by name; rewrite by named technique.

| AI Slop Pattern | Why It Reads as Slop | Corrective Move |
| --- | --- | --- |
| `rounded-2xl` + `shadow-md` + `border` stacked on every card | Triple belt-and-suspenders; no sense of when to use what | Pick one. Two-part shadow OR border OR background-tint — not all three. |
| `text-slate-500` / `text-gray-400` on every muted element | Pure grey on colored backgrounds reads dull; no brand temperature | Replace with a lighter S/B variant of the brand hue. Use the down-popped version of the brand color. |
| `shadow-md` everywhere with no elevation distinction | Single flat shadow; no two-part decomposition; nothing reads as elevated vs. nested | Define a 5-tier shadow ladder, each two-part (ambient + direct). Match shadow tier to elevation. |
| `bg-gradient-to-r from-blue-500 to-purple-500` | The "AI gradient" — two distant hues blended; no taste signal | Rotate hue across a single hue family (blue → cyan), or remove gradient entirely. |
| Inter, Inter, Inter | Single biggest visual fingerprint of AI-generated UI in 2025–2026 | Swap to Satoshi / Metropolis / Figtree, or pair Inter with a display headline (Geist, Source Serif). Apply -1% letter-spacing on display sizes. |
| Default `p-4` / `gap-4` / `space-y-4` everywhere | Tight Tailwind defaults; no inverse-whitespace pass; menu items at ~1× text height | Double the spacing values v0 ships. Menu items ≥ 2× text height. Sections ≥ 24–32px. |
| Outline buttons everywhere (`border` + `bg-transparent`) | Ghost buttons feel weightless and sit awkwardly next to filled CTAs | Replace with soft-solid based on text color at low alpha. |
| White text dropped on hero photos with no overlay | Method 0 default; legibility breaks on light photo regions | Apply Scrim by default, or Method 1 (35% overlay), or Method 4 (floor fade). Never ship Method 0 unless tested. |
| Every emphasized element at full up-pop | Big + bold + uppercase + high-contrast on titles AND subheads AND buttons; visual fatigue | Only the page title gets all up-pop. Subheads and CTAs combine up-pop with down-pop (e.g., big + thin + muted). |
| Borders separating every form field, table row, and card section | Borders as the only hierarchy lever; cluttered | Replace with zebra striping, off-white background blocks, or spacing alone. |
| Default 1.5 line-height on all headings and body | Browser default; never tuned to size | Override per role: ~1.0 for hero headlines, ~1.2 for sub-heads, ~1.5 for body. |
| `text-2xl font-bold` on every heading regardless of role | No type-scale hierarchy; every level looks the same weight | Set the largest heading first (e.g., 48px), then derive smaller / thinner / more-spaced for H2/H3/labels. |

**Slop-detector pass:** Walk the surface, name each pattern by row, propose the corrective move in concrete tokens (Tailwind classes, Inkprint variables), codify the diff so the same paste does not recur.

## Common Fixes

When reviewing, expect to rewrite at least these:

- Replace single-shadow `box-shadow` recipes with two-part ambient + direct shadows on a 5-tier ladder.
- Replace `text-gray-400` on colored backgrounds with a lighter S/B variant of the same hue.
- Replace AI-default rainbow gradients with single-hue gradients (rotate hue toward a brighter neighbor).
- Swap Inter for Satoshi / Metropolis / Figtree, or pair Inter with a display headline font.
- Add -1% letter-spacing to all display-size headings (and across the board for Source Sans).
- Replace ghost / outline secondary buttons with soft-solid backgrounds derived from the text color at low alpha.
- Replace heavy borders on form fields, table rows, and card sections with off-white backgrounds, zebra striping, or spacing alone.
- Apply Scrim or Method 1 / Method 4 to every text-on-image surface; ban Method 0 from production unless explicitly tested.
- Strip down-pop from page titles (full up-pop allowed) and add down-pop to every other emphasized element.
- Saturate the grey scale toward brand temperature (cool blue or warm yellow/brown), and bump saturation at the lightest and darkest extremes.
- Override browser default 125% line-height on every text role.
- Replace browser-default form controls (radios, checkboxes, select chevrons) with custom equivalents.

## Output Format

Return findings grouped by domain with severity and a concrete fix:

```
Domain: <shadows | color | typography | spacing | hierarchy | images | icons | buttons-forms>

Finding: <named principle violated, e.g., "Two-part shadow not decomposed">
Evidence: <quoted class string or component snippet>
Severity: <high | medium | low>
Fix: <concrete tokens or technique name>
```

Then a roll-up:

- **Top 5 highest-impact fixes** across the surface (ranked by perceived polish gain)
- **AI-slop patterns detected** with named row from the table above
- **Foundational rule violations** (4-pixel scale, type roles, single-hue palette, contrast levers)
- **Token diffs** that codify the fix in Inkprint so the same paste does not recur

## Guardrails

- Do not add gradients, glows, or extra cards as the first fix. Subtraction beats addition.
- Do not use lightness alone to make a colored element "lighter" — rotate the hue.
- Do not type raw hex values when picking color. Pick in HSB; ship the hex.
- Do not stack three up-pop properties on every emphasized element. Only the page title gets full up-pop.
- Do not use a single flat `box-shadow` to communicate elevation — decompose into ambient + direct.
- Do not override font weight or font size on hover; layout shift kills polish.
- Do not put colored overlays on hero photography unless the brand explicitly demands it. Black is the safe default.
- Do not let a single screen carry more than one icon library, more than two fonts (one display + one body), or more than one corner radius scale.
- Do not split a complementary color palette 50/50.
- Do not allow off-scale spacing values (13px, 27px) — every value lives on the 4-pixel system.

## Cross-Linked Skills

- `ui-ux-quality-review` — sibling skill. Run first; this skill ships on top.
- `marketing-site-design-review` — section-by-section landing-page review using shared foundational rules.
- `landing-page-scorecard-funnel` — assessment-driven funnel scoring.

## Source Attribution

Distilled from operator canon. Local analyses linked.

- **Steve Schoger / Refactoring UI — CSS Day 2019** (PRIMARY). Two-part shadows, hue rotation for perceived brightness, 9-shade single-hue palette, soft-solid secondary buttons, "headings are labels not headlines," temperature-saturated greys, "think outside the database." Analysis: `docs/research/youtube-library/analyses/2026-04-29_steve-schoger_refactoring-ui_analysis.md`. Source: https://www.youtube.com/watch?v=7Z9rrryIOC4
- **Erik D. Kennedy / Learn UI Design — 7 Rules for Creating Gorgeous UI** (PRIMARY). Light-from-the-sky inset/outset taxonomy, HSB single-hue palettes, double-your-whitespace numerics, Methods 0–4 + Scrim for text-on-image, up-pop / down-pop framework, named font shortlist, "steal like an artist." Analysis: `docs/research/youtube-library/analyses/2026-04-29_erik-kennedy_7-rules-gorgeous-ui_analysis.md`.
- **Kole Jain — 7 UI/UX Mistakes That Scream You're a Beginner** (supporting). Three-step shadow recipe (light-gray color, increased blur, or remove), 10px corner-radius standard, mobile-needs-more-whitespace, "less visual noise = better design." Analysis: `docs/marketing/growth/research/youtube-transcripts/2025-06-07-kole-jain-7-ui-ux-mistakes-beginner-ANALYSIS.md`.
- **DesignSpo — Visual Hierarchy / Typography / Color Theory** (supporting). 60/30/10 proportion rule, type scale, contrast lever ranking, F-pattern vs Z-pattern composition, complementary palettes never split 50/50. Analyses in `docs/research/youtube-library/analyses/`: `2026-04-29_designspo-visual-hierarchy_analysis.md`, `2026-04-29_designspo-typography_analysis.md`, `2026-04-29_designspo-color-theory_analysis.md`.
