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
- **Four-cue button lighting recipe** (Erik Kennedy, 7 Rules). An outset button needs all four cues simultaneously, not just a drop shadow: (1) **dark bottom edge** where the button casts onto itself, (2) **slightly brighter top surface** implying a curved face catching light, (3) **subtle under-shadow** (drop shadow, not a stylistic glow), (4) **pressed state overall darker** — as if a hand blocked the light. A button with only the drop shadow is a fail — name the missing cue in the finding. Inputs do NOT get this recipe; they are inset (inner shadow goes in, not below).
- **Brightness-as-elevation for flat/low-shadow systems** (Erik Kennedy, 7 Rules — "flatty design"). When shadows are minimal by design, convey elevation by **surface brightness**: higher surfaces are brighter because they catch more sky light. Directly relevant to Inkprint's low-shadow texture language — on BuildOS surfaces, lift a raised element by making its surface a step brighter rather than reaching for a heavier shadow. Check: if two stacked surfaces are the same brightness and the only depth cue is a shadow the system has minimized, the higher surface is under-elevated — bump its brightness.
- **Optical adjustments over mathematical alignment.** A shadow that lifts equally to a smaller shadow at the same blur is wrong; perceived weight differs from measured weight. Trust the eye when math and perception disagree.

## Color

- **HSB or HSL, not hex.** Pick in HSB. Ship the hex. Never type a raw hex when picking. CSS: use `hsl()` so you can move S and B without breaking H.
- **Single-hue palette as the default.** One brand hue + grayscale neutrals + one accent. The brand hue produces dark text variants, lighter subtitles, backgrounds, accents, and eye-catchers entirely from S/B modulation (Stripe-blue, Linear-purple, Notion-near-monochrome).
- **9–10 shades per hue** (Tailwind-style). If a hue has only 3 shades available, the system is incomplete. No one-off hex values bleeding through component code.
- **Own the config; extend the scale, never a magic number** (Adam Wathan / Steve Schoger, RefactoringUI build). Take ownership of the token scales first: delete framework defaults you won't use, and seed colors/shadows/spacing from the design's exact values. When the design needs a value the scale lacks, **add a named scale step** — not a hand-set off-scale value. Wathan's worked examples: 60px hero text → add a `6XL` key ("by default we only go up to 5XL"); a 56px width between `w-16` and `w-12` → add `w-14`; a recurring 2px border → add a 2px step "of basically all this stuff." This is the operating discipline behind the guardrail "do not invent parallel token scales / every value on the system": off-scale hand values de-systematize the build; the fix is to name the step. Agent-check: a raw off-scale value (`width: 56px`, `margin-top: 13px`, a one-off hex) where a named token could exist is a finding — name the scale step instead.
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
- **Overlap adjacent borders with a negative margin** (Adam Wathan, RefactoringUI build). When an element's bottom border (e.g. `border-b-2`) sits flush against an adjacent element's matching border, the naive markup stacks the two into a doubled line (two 2px borders → a 4px line). Fix: pull the element up by exactly the border width with a negative margin (`-mb-2` = 2px) so the borders overlap perfectly — "now they overlap perfectly." Agent-check: a doubled/thick seam where two bordered surfaces meet is a finding; the fix is a negative margin equal to the border width (and the negative-margin step belongs on the scale per the own-the-config rule above), not removing a border that carries meaning.

- **Hover recolor rule** (Erik Kennedy, 7 Rules; second primary source: Adam Wathan / RefactoringUI build). Never change size, weight, or case on hover (those shift layout). The reliable recolor move: **white elements turn colored, colored elements turn white — and darken the background behind them.** A hover state that only nudges opacity, or that resizes/re-weights text, is a fail; specify the white↔color swap + background darken instead. Wathan's build adds the **process**: when the comp lacks a hover color, tune it live against the real button — "needs to be more saturated and lighter" — then **save the chosen value back into the config as a named token** (`indigo-light`, "the only place that color gets used"), so the hover hue is codified, not a one-off. The recolor should be a deliberate shift on the brand hue (more saturated + lighter), not an opacity drop.

## Icon weight

- **Balance perceived weight.** Solid icons cover more surface area than text and read heavier — soften the icon color so it perceives as the same weight as the label.
- **Match line height.** Icons next to text generally match the text's line height around them.
- One icon library per region; labeling rules and affordance basics live in `ui_ux_quality_review` — escalate there for foundational icon findings.
