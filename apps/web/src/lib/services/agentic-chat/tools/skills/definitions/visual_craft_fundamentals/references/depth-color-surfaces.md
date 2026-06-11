<!-- apps/web/src/lib/services/agentic-chat/tools/skills/definitions/visual_craft_fundamentals/references/depth-color-surfaces.md -->

# Depth, Color & Surface Craft: Shadows, Palettes, Buttons, Forms

Use this reference when tuning shadows, elevation, color palettes, gradients, greys, dark mode, buttons, form inputs, or icon weight. These are threshold-bearing rules — cite the named technique in each finding and ship the fix as a before→after token or value pair.

## Shadows and depth

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
- **Optical adjustments over mathematical alignment.** A shadow that lifts equally to a smaller shadow at the same blur is wrong; perceived weight differs from measured weight. Trust the eye when math and perception disagree.

## Color

- **HSB or HSL, not hex.** Pick in HSB. Ship the hex. Never type a raw hex when picking. CSS: use `hsl()` so you can move S and B without breaking H.
- **Single-hue palette as the default.** One brand hue + grayscale neutrals + one accent. The brand hue produces dark text variants, lighter subtitles, backgrounds, accents, and eye-catchers entirely from S/B modulation (Stripe-blue, Linear-purple, Notion-near-monochrome).
- **9–10 shades per hue** (Tailwind-style). If a hue has only 3 shades available, the system is incomplete. No one-off hex values bleeding through component code.
- **Hue rotation, not lightness, for "lighter" colored text.** Different hues have different inherent luminance. Drag lightness up on a blue and you wash it out; rotate the hue toward the nearest bright hue (blue → cyan) and you keep saturation. For subtitles or muted text on a colored background: sample the background color, drag the picker toward the top-left in HSB (lighter, less saturated, same hue). Do not use `text-gray-400` on a colored background.
- **60/30/10 proportion.** 60% dominant, 30% secondary, 10% accent (CTAs and focal points only). Complementary palettes never split 50/50 — they clash.
- **Greys are not pure grey.** Saturate cool (blue) for a cool-temperature brand, warm (yellow/brown) for a warm-temperature brand. **Bump saturation at the lightest and darkest extremes** so the temperature stays consistent across the scale.
- **Yellow/green/bright CTA inversion.** White-on-yellow forces yellow into bronze. Use **dark text saturated toward the background hue** — yellow background → dark orange text, not pure black.
- **Dark-mode accents drop ~10–15% saturation** vs. light mode. Screens are additive emitters; saturated colors fatigue against dark backgrounds.
- **Warm advances, cool recedes.** Warm hues for focal points and danger; cool hues as ground state.

## Buttons and forms

- **Primary + secondary as visual weights, not visual styles.** Same shape, same radius, same height. Different background weight.
- **Soft-solid secondary button** instead of outline: soft solid background **derived from the text color** at low alpha. Cleaner and lighter than a ghost button.
- **Cap radius.** Pick one radius for the whole system (often 10px for small components, 8–12px for inputs/cards). Mixing 4px / 12px / 24px on the same screen is a tell.
- **CTA color from already-in-context highlight.** Pull the CTA color from a hue already present nearby. Add an inner white highlight + outer drop shadow for tactile realism.
- **Inputs are 40–48px tall.** Smaller reads as Bootstrap leftover.
- **Input length signals expected content.** Date field ≠ address field width.
- **Off-white input backgrounds on white panels.** Subtle background creates the boundary without a heavy border.
- **Replace browser default form controls** — radios, checkboxes, select chevrons. Custom every time.

## Icon weight

- **Balance perceived weight.** Solid icons cover more surface area than text and read heavier — soften the icon color so it perceives as the same weight as the label.
- **Match line height.** Icons next to text generally match the text's line height around them.
- One icon library per region; labeling rules and affordance basics live in `ui_ux_quality_review` — escalate there for foundational icon findings.
