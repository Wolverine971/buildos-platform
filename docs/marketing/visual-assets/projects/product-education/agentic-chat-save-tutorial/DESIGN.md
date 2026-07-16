<!-- docs/marketing/visual-assets/projects/product-education/agentic-chat-save-tutorial/DESIGN.md -->

# BuildOS Agentic Chat Tutorial — Design Guide

## 1. Visual Theme

BuildOS is light-first and editorial: warm paper surfaces, dark ink, quiet rules, and restrained printed textures. The visual system should feel like a working dispatch from a creator's desk, not a glossy SaaS commercial. Real product screens are the proof; composed frames only provide context, cropping, labels, and transitions. Burnt orange is the sole signal color and should appear once per frame at most.

## 2. Quick Reference

### Colors

- **Warm Paper** (`#FBFAF9`): primary canvas and light card surface.
- **Soft Paper** (`#F2F0EE`): secondary sections, inset panels, and quiet contrast.
- **Ink** (`#17171C`): primary text, dark CTA, and strongest rule.
    - On Warm Paper: `17.13:1` ✅
    - On Soft Paper: `15.71:1` ✅
- **Muted Ink** (`#666670`): body copy and metadata on light surfaces.
    - On Warm Paper: `5.45:1` ✅
    - On Soft Paper: `4.99:1` ✅
    - Do not use as text on Ink.
- **Rule** (`#D6D3CD`): borders, dividers, and diagram connectors; not body text.
- **Burnt Orange** (`#B85614`): one signal, selected state, or confirmation per frame.
    - White on Burnt Orange: `4.80:1` ✅
- **White** (`#FFFFFF`): text on Burnt Orange only; avoid as a page background.
- **Blue** (`#2563EB`): product-native informational state only; do not introduce it in tutorial overlays.
- **Taupe** (`#918978`): captured supporting neutral; decorative use only.

### Fonts

- **Display and body:** `system-ui`, with fallback `-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`.
- No downloadable fonts were captured; do not invent or bundle a branded font.
- Display: `60px / 600`, line-height `60px`, tracking `-1.5px`.
- Section heading: `30px / 600`, line-height `36px`, tracking `-0.75px`.
- Card heading: `18–24px / 600`, line-height `28–32px`.
- Body: `18px / 400`, line-height `28px`, color Muted Ink.
- Eyebrow/section marker: `10.4px / 400`, line-height `11.44px`, tracking `1.56px`, uppercase.
- UI labels and buttons: `14px / 600`.

## 3. Component Stylings

### Primary Ink Button

- Background: `#17171C`.
- Text: `#FBFAF9`.
- Padding: `12px 24px`.
- Height: `44px`.
- Radius: `9999px`.
- Shadow: `0 1px 2px rgba(0,0,0,.06), 0 2px 4px rgba(0,0,0,.04)`.
- Use for the final CTA only, not for explanatory labels.

### Burnt Orange Signal

- Background: `#B85614`.
- Text: `#FFFFFF`.
- Padding: `8px 12px`.
- Height: `44px`.
- Radius: `12px`.
- Border: `1px solid #B85614`.
- Use once per frame for the action currently being demonstrated.

### Standard Paper Card

- Background: `#FBFAF9`.
- Text: `#17171C`.
- Padding: `24px`.
- Radius: `12px`.
- Border: `1px solid #D6D3CD`.
- Shadow: `0 1px 2px rgba(0,0,0,.06), 0 2px 4px rgba(0,0,0,.04)`.

### Inset Work Card

- Background: `#F2F0EE`.
- Text: `#17171C`.
- Padding: `12px`.
- Radius: `8px`.
- Border: `1px solid #D6D3CD`.
- Shadow: inset `0 1px 2px rgba(0,0,0,.05)`.
- Use for quoted brain-dump text and the structured output list.

### Navigation Strip

- Background: `#F2F0EE`.
- Height: `65px`.
- Bottom shadow: `0 1px 2px rgba(0,0,0,.06), 0 2px 4px rgba(0,0,0,.04)`.
- Keep captured product navigation intact; never redraw it.

### Tutorial Callout

- Warm Paper label with Ink text and a `1px` Rule border.
- Small section marker above a short imperative phrase.
- Connector line uses Rule with clean, unmarked endpoints.
- No added glow, blur, gradient, glass, or floating neon treatment. The official Brain Bolt’s baked-in blue-purple glow is the sole brand-mark exception.

### Screen Receipt Frame

- Show real screenshots at their native `393×852` mobile aspect ratio inside an iPhone frame; never crop the left or right product edges.
- Crop only to remove irrelevant chrome or protect private information.
- Use an Ink keyline and a quiet paper shadow.
- Never rebuild, embellish, or generate BuildOS product UI.

## 4. Spacing & Layout

**Base unit:** `8px`.

| Token    |  Value | Use                              |
| -------- | -----: | -------------------------------- |
| hairline |  `1px` | rules and borders                |
| xs       |  `4px` | icon and eyebrow gaps            |
| sm       |  `8px` | tight labels and inline groups   |
| md       | `12px` | inset card padding               |
| lg       | `16px` | standard control gaps            |
| xl       | `24px` | card padding and grouped content |
| 2xl      | `32px` | frame margins                    |
| 3xl      | `40px` | major separation                 |
| section  | `64px` | scene-level rhythm               |

Radii are limited to `8px`, `12px`, and `9999px`. Layouts should retain calm negative space and one dominant element per frame. Product screens may be information-dense; the surrounding tutorial frame should not compete with them.

## 5. Iteration Guide

1. Use Warm Paper (`#FBFAF9`) as the canvas and Ink (`#17171C`) as the dominant text color in every composed frame.
2. Use Burnt Orange (`#B85614`) exactly once per frame to identify the active action, saved result, or current focus.
3. Treat real chat and project screens as receipts: frame and annotate them, but never crop their horizontal UI, recreate controls, or beautify their interface.
4. Use `system-ui` throughout; no external display font was captured and no substitute should masquerade as a BuildOS font.
5. Keep overlays to one short phrase plus one connector; explanations longer than two lines belong in the script, not on screen.
6. Use the captured paper textures at very low contrast (`rgba(24,24,27,.03)`); never add gradients, glassmorphism, glow, purple, or synthetic AI imagery.
7. Use Standard Paper Cards for explanation and Inset Work Cards for user input/output examples; both retain the `#D6D3CD` keyline.
8. Preserve sound-off comprehension: every beat needs a visible action, visible consequence, and a readable transition label.
9. End on the actual created project page or project list, then use one Ink pill CTA; do not end on an abstract logo animation.

## Truth and Privacy Boundaries

- Use a demo project and non-sensitive content.
- Blur or crop personal email, account information, unrelated projects, notifications, and private workspace data.
- Label any rehearsal or seeded demo data as an internal example.
- Do not imply that BuildOS saved or created an entity unless the recording visibly proves it.
- Do not imply autonomous background work beyond the observed agent response and resulting page state.
