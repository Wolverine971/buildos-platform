<!-- docs/marketing/brand/media-kit-system.md -->

# Media Kit System — Hex Teardown + BuildOS Plan

**Date:** 2026-05-09
**Reference:** [Hex Media Kit (Notion)](https://hexhq.notion.site/a091e1bb7bb34019bc4ccf2e3da8645f?v=bb640f9e0ef4499198673561e42a93f0)
**Status:** Strategy doc — not yet executed

---

## Why this doc exists

We looked at Hex's public media kit and it's exceptionally tight. This doc captures what makes it work and translates it into a concrete BuildOS plan that builds on the existing Inkprint design system.

The headline: Hex shipped **~7 cards on a public Notion page**, not 50 assets on a custom site. They won by committing hard to one visual system and reusing it everywhere.

---

## What Hex is doing

### Visual system (deliberately tight)

- **One canvas:** near-black navy with a subtle blueprint grid + paper-grain noise. Every asset sits on the same ground, which is why a logo card, a founder photo, and a desktop wallpaper feel like one brand.
- **One accent color:** muted blush coral. That's it. Every chromatic moment.
- **One signature motif:** engineering-schematic illustration language — dotted vector arrows, dashed flow diagrams, crosshair targets, drafting marks, topographic contour lines (the desktop wallpaper is just contour ribbons + wordmark).
- **Custom display type:** PP Formula (blocky, dimensional) paired with GT Cinetype mono. The wordmark _is_ the type.
- **Editorial candids, not corporate headshots:** founders in a real workspace, warm cinematic light. The hardest asset to fake; does the most lifting for "real company."

### Delivery (the smartest part)

- Just a public Notion gallery view. No custom page, no CMS, no infra.
- Cards with file-type pills (SVG / PNG / EPS / TTF / JPG).
- Categories shown: Logos, Typography (PP Formula & GT Cinetype), Colors, Social Banner, Founder Photos, Zoom Bgs, Desktop Wallpapers.
- ~7 cards total. They didn't ship 50 things; they shipped one tight system applied 7 ways.

### Color palette (observed)

- Dominant: deep navy / near-black ground
- Accent: blush coral / muted pink (the wordmark color)
- Secondary tile palette (small accent squares): blush, teal, lavender, mustard yellow, slate, off-white

---

## How BuildOS does the same thing

The good news: **Inkprint is already analogous in spirit** (halftone-print, field-notes texture) to Hex's blueprint-grain system. The hard part is committing to it across every external surface.

### 1. Pick the single motif

Hex's motif is "schematic engineering." BuildOS's motif should be the product metaphor visualized:

> **Messy handwritten thought → structured graph.** Notebook scrawl coalescing into a clean tree or spec, with halftone paper grain unifying it.

That same motif becomes the OG image, the social banner, the desktop wallpaper, the deck cover, the press header — same motif, different crop.

### 2. Lock the canvas + one accent

- One textured paper/carbon background (Inkprint default).
- One signature accent — use Inkprint's existing accent. **Do not add a second.**
- Every social asset starts from the same canvas.

### 3. Ship the same 7-card kit (don't expand prematurely)

| Card               | Format                       | Notes                                               |
| ------------------ | ---------------------------- | --------------------------------------------------- |
| Logos              | SVG / PNG (transparent)      | Wordmark + mark, light + dark                       |
| Type specimen      | TTF / sample image           | Lock the display + mono pair                        |
| Colors             | Color tile + token reference | Ink palette                                         |
| Social banner      | PNG                          | Twitter/X + LinkedIn headers                        |
| Founder photos     | JPG                          | DJ in real workspace, natural light, half-day shoot |
| Zoom backgrounds   | PNG                          | 2–3 variants of the motif                           |
| Desktop wallpapers | JPG                          | Contour-style + clean variant                       |

Plus add (BuildOS-specific):

- OG image template (default + per-blog-category)
- Instagram carousel template (square + 4:5)
- LinkedIn post background template

### 4. Generation pipeline (where BuildOS can leapfrog Hex)

- **One Figma file** with variables for color / texture / wordmark slot. Every static asset is one frame export.
- **`/api/og` route in SvelteKit** using Satori + the Inkprint background SVG, so blog posts and product pages auto-generate branded OG cards on demand.
- **`pnpm gen:media` script** that re-exports the static set when tokens change.
- **One reusable Inkprint background SVG** committed to the repo so it never drifts across surfaces.

### 5. Delivery: copy Hex exactly

- Public Notion gallery at a vanity URL (e.g. `buildos.com/press` redirect, or just link the Notion page from the footer).
- Notion database with file-type pills, gallery view.
- Don't build a custom page. The Notion page IS the press kit.

### 6. Highest-leverage thing to do first

**Schedule the founder photo shoot.** Everything else can be Figma'd. Editorial workspace candids of DJ are the one asset competitors literally cannot replicate, and they make the rest of the kit feel like a real company instead of a deck.

---

## Open questions / next steps

- [ ] Decide: Notion gallery vs. dedicated `/press` SvelteKit page (recommend Notion for v1)
- [ ] Lock the single accent color from Inkprint tokens — confirm the choice
- [ ] Lock the display + mono type pairing
- [ ] Draft the Figma source file (variables-driven)
- [ ] Spec the `/api/og` Satori route
- [ ] Schedule founder photo shoot (location + photographer)
- [ ] Audit existing OG/social assets in `apps/web/static/` for inconsistencies before regenerating

---

## Related docs

- `apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md` — design system reference
- `docs/marketing/brand/BRAND_ASSET_INVENTORY.md` — current asset inventory
- `docs/marketing/brand/BUILDOS_BRAND_AESTHETIC_COMPLETE.md` — aesthetic guidelines
- `docs/marketing/brand/brand-guide-1-pager.md` — quick brand reference
