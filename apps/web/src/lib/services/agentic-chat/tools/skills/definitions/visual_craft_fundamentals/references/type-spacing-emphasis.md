<!-- apps/web/src/lib/services/agentic-chat/tools/skills/definitions/visual_craft_fundamentals/references/type-spacing-emphasis.md -->

# Type, Spacing & Emphasis Craft: Fonts, Whitespace, Up-pop / Down-pop, Hierarchy

Use this reference when tuning typography, picking or pairing fonts, normalizing spacing and whitespace, or fixing emphasis and visual hierarchy. These are threshold-bearing rules — cite the named technique in each finding and ship the fix as a before→after token or value pair.

## Typography

- **One primary font in product UI.** Pair only with display fonts on marketing surfaces.
- **Type scale (closed set):** 16, 20, 24, 28, 32, 40, 48, 64. Set the largest heading first, then derive smaller / thinner / more spaced.
- **Letter-spacing is inversely proportional to size.**
    - **Display sizes (48+): tighten by ~−1%** (-0.01em). Source Sans, in particular, is calibrated to want -1% across the board.
    - **Body sizes (16–20):** default tracking.
    - **Small text (12–14):** loosen slightly.
    - **Bold buttons:** add tracking so letters do not squish.
- **Uppercase text always gets extra letter-spacing** (Adam Wathan / Steve Schoger, RefactoringUI build). Every uppercase label, button, or section eyebrow (`SUBSCRIBE`, `DESIGN TIPS`, table headers) needs widened tracking (`tracking-wide`, ~+0.05em) so the caps don't squish — Schoger's standing habit: "always does that on uppercase stuff." Agent-check: any `uppercase` / all-caps element with default or tight tracking is a finding; fix is `+ tracking-wide`.
- **Line-height is inversely proportional to size.** ~1.0× for big headlines, ~1.5× for body. Override the browser default 125% — calibrated to be okay everywhere and great nowhere.
- **Set global type defaults once, then override per role** (Adam Wathan, RefactoringUI build). On the root/body, set the default family, default text color, and a global tight line-height (`leading-tight`), then switch body paragraphs specifically to `leading-normal` — UI elements keep the tighter default. Also enable site-wide anti-aliasing (`-webkit-font-smoothing: antialiased`, e.g. `antialiased`): design mocks render type with non-subpixel smoothing, so without it rendered type looks heavier than the comp — "looks a lot nicer on dark backgrounds." Agent-check: type that looks heavier than the reference on dark surfaces, or page-wide default leading left at the browser 125%, is a finding.
- **One hierarchy with four roles:** headings (2–3 levels, never all 6), paragraphs, buttons, labels. New screens assemble from this Lego set; never invent new roles per screen.
- **Body text contrast ≥ 4.5:1** (WebAIM AA), 7:1 where possible.
- **Match typeface category to brand voice.** Serif = traditional / editorial; sans-serif = modern / neutral; display = personality (headlines only, never body); script = elegant (rarely); mono = technical.
- **Font shortlist** (free, ship-ready):
    - **Satoshi** — modern friendly with quirky `a`/`g`. (FontShare)
    - **Metropolis** — Gotham/Proxima homage. Sturdy. Underused on web. (FontShare)
    - **Source Sans** — humanist sans; **always pair with -1% letter-spacing.**
    - **Figtree** — clean-yet-casual. Approachable without cute.
- **Premium picks** (Adobe Fonts): Proxima Nova, Adelle Sans, DIN, Freight Text.
- **System font in product, custom font on marketing** — the default split. Override only if the brand explicitly demands custom in product (Linear, Stripe, Granola).
- **Sourcing strategy.** Don't browse Google Fonts raw — bring a target. DevTools-inspect a site you like → look up the foundry → buy the bundle. FontShare and Adobe Fonts beat Google Fonts top-50 browsing.

## Spacing & whitespace

- **4-pixel system, no exceptions.** Every spacing, padding, gap, container width, and font size is a multiple of 4px. Closed scale: 4, 8, 12, 16, 24, 32, 48, 64, 96.
- **Spacing assigned by relatedness:**
    - 4px = inside a composite element (icon + label)
    - 8px = list-item internal gap
    - 16px = inside a component
    - 24px = between components
    - 32px = between page sections
- **Double your whitespace.** Start with twice as much space as you think you need. Tighten only where it actually feels excessive. Adding space until it stops looking cramped stops you at the minimum acceptable point.
- **Menu items:** vertical space ≈ **2× the text height**.
- **List title to underline:** ~**15px** (clears cap height with room).
- **Between sections:** ~**25px or more** at the base scale.
- **Top-nav text/icons:** occupy ~**20% of bar height**. The other 80% is breathing room.
- **Whitespace must exist at all three levels** simultaneously: between lines (line-height), between elements (padding/margin), between groupings (section gaps). If only one level breathes, the screen still looks crowded.
- **Mobile needs more whitespace than desktop**, not less. Cramped mobile is a tell.

## Layout patterns

Concrete, named layout recipes — apply the fill-in pattern verbatim, don't freelance the structure.

- **Equal-height cards with bottom-pinned footers — the flex chain** (Adam Wathan, RefactoringUI build). When a card grid needs every card the same height and a footer (link, meta, CTA) pinned to the bottom regardless of title length, a single `flex` declaration won't do it — you need the full chain. Fill-in recipe:
    1. Each grid **column/track** → `flex flex-col`. (A flex parent makes children fill the parent's height; `flex-col` keeps items full-width — `flex-1` on the column "defeats our width," so use `flex-col`.)
    2. The **card** itself → `flex flex-col` (e.g. image stacked over a content section).
    3. The card's **content section** → `flex-1` ("fill all available space") so content height equalizes across cards.
    4. That same content section → also `flex flex-col justify-between`, pushing the title to the top and the footer to the bottom. (`mt-auto` on the footer is an equivalent alternative.)
    - Rationale: _"When a parent is set to display flex the child elements will fill the parent's height by default."_ Agent-check: a card grid with ragged heights, or a footer floating mid-card instead of pinned to the bottom, is a finding — the fix is the full column→card→content-`flex-1`→`justify-between` chain, not a lone `flex`.

## Up-pop / down-pop

- **Up-pop properties:** larger size, bolder weight, higher contrast, capitalization, brighter color, more margin around it.
- **Down-pop properties:** smaller size, thinner weight, lower contrast, muted color, looser tracking.
- **Page titles get all up-pop.** This is the only element where stacking up-pop properties is allowed.
- **Every other emphasized element pairs at least one up-pop with at least one down-pop.** The hero number on a stat card: up-pop on size + down-pop on weight + down-pop on contrast. Big + thin + muted reads as confident. Big + bold + high-contrast reads as exhausting.
- **Forbidden emphasis tools:** underline (implies link), text background color (implies button or input), strikethrough (implies deleted/completed).
- **Hover/selected states** must not change size, weight, or case — they cause layout shift. Acceptable: text color change, background color shift, shadow appearance, slight raise/lower transform.

## Visual hierarchy

- **One primary, a few secondary, the rest uniform.** Per section AND across the whole page. If everything is loud, nothing stands out.
- **Rank before style.** Decide what is 1st, 2nd, 3rd in primacy before picking sizes, fonts, or colors. Hierarchy is a ranking decision, not a styling decision.
- **Contrast levers in order:** motion, task-relevant info, white space, faces, color, size, weight, imagery, extra elements, deliberate misalignment. Beginners reach for color/size and skip the higher-ranked levers.
- **Cohesion rule.** Same-type components share every value: image size, font, weight, line height, border, radius, padding. Change one, change them all.
- **Composition matches scan path.** Z-pattern for minimalist hero/poster; F-pattern for text-heavy pages; top-to-bottom for cards/lists.
- **Borders are the amateur tool.** Use spacing, color shifts, and typography first. If a border is required, drop opacity and use it only to associate elements.
- **Headings as labels, not headlines** in tables and dense data: small, bold, **uppercase**, softer color. Don't let the table header steal attention from the data.
