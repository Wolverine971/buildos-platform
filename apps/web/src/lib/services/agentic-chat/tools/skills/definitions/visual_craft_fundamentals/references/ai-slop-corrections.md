<!-- apps/web/src/lib/services/agentic-chat/tools/skills/definitions/visual_craft_fundamentals/references/ai-slop-corrections.md -->

# AI-Slop Deep Corrections & Text-on-Image Methods

Use this reference when rewriting AI-generated UI (v0, Lovable, Cursor, Bolt) after `ui_ux_quality_review`'s smoke test has fingerprinted it, or when placing text over photography (heroes, thumbnails, blog covers, OG images). The smoke test names eight patterns; this module adds four more fingerprints and the deep corrective recipes for all of them.

## Additional fingerprints beyond the smoke test

| AI slop pattern                                          | Why it reads as slop                                                                      | Corrective move                                                                                                 |
| -------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| White text dropped on hero photos with no overlay        | Method 0 default; legibility breaks on light photo regions                                | Apply Scrim by default, or Method 1 (35% overlay), or Method 4 (floor fade). Never ship Method 0 unless tested. |
| Every emphasized element at full up-pop                  | Big + bold + uppercase + high-contrast on titles AND subheads AND buttons; visual fatigue | Only the page title gets all up-pop. Subheads and CTAs combine up-pop with down-pop (e.g., big + thin + muted). |
| Default 1.5 line-height on all headings and body         | Browser default; never tuned to size                                                      | Override per role: ~1.0 for hero headlines, ~1.2 for sub-heads, ~1.5 for body.                                  |
| `text-2xl font-bold` on every heading regardless of role | No type-scale hierarchy; every level looks the same weight                                | Set the largest heading first (e.g., 48px), then derive smaller / thinner / more-spaced for H2/H3/labels.       |

## Deep corrective recipes (by named technique)

When rewriting slop, expect to apply at least these — each yields a before→after token pair:

- Replace single-shadow `box-shadow` recipes with **two-part ambient + direct shadows** on a 5-tier ladder (xs–xl), matching shadow tier to elevation.
- Replace `text-gray-400` / `text-slate-500` on colored backgrounds with a lighter S/B variant of the same hue (**hue rotation, not lightness**).
- Replace AI-default rainbow gradients (`from-blue-500 to-purple-500`) with **single-hue gradients** — rotate hue toward a brighter neighbor (blue → cyan) — or remove the gradient entirely.
- Swap Inter for Satoshi / Metropolis / Figtree, or pair Inter with a display headline font. Apply **-1% letter-spacing on display sizes**.
- Double the spacing values the generator ships (`p-4` → `p-8`-class moves). Menu items ≥ 2× text height. Sections ≥ 24–32px.
- Replace ghost / outline secondary buttons with **soft-solid** backgrounds derived from the text color at low alpha.
- Replace heavy borders on form fields, table rows, and card sections with off-white backgrounds, zebra striping, or spacing alone.
- On `rounded-2xl` + `shadow-md` + `border` stacks: pick one — two-part shadow OR border OR background-tint, not all three.
- Strip down-pop from page titles (full up-pop allowed) and add down-pop to every other emphasized element.
- Saturate the grey scale toward brand temperature (cool blue or warm yellow/brown); bump saturation at the lightest and darkest extremes.
- Override the browser default 125% line-height on every text role.
- Replace browser-default form controls (radios, checkboxes, select chevrons) with custom equivalents.

After rewriting, codify the diff as design-system tokens (Inkprint variables on BuildOS surfaces) so the same paste does not recur.

## Text-on-image methods

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
