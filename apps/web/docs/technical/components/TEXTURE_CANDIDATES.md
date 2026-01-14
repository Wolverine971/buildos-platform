<!-- apps/web/docs/technical/components/TEXTURE_CANDIDATES.md -->
# BuildOS Texture Candidates from TransparentTextures.com

> **Purpose:** Curated texture selections with verified visual descriptions
> **Created:** 2026-01-14
> **Status:** Ready for Testing

---

## Overview

This document organizes the 95 downloaded textures from [Transparent Textures](https://transparenttextures.com) by their potential use in BuildOS's Inkprint design system. All descriptions are based on visual inspection of the actual PNG files.

### Selection Criteria

1. **Printmaking Aesthetic** - Textures that evoke ink, paper, press, engraving
2. **Readability First** - Must work as subtle backgrounds behind text
3. **Semantic Potential** - Can communicate meaning (state, weight, purpose)
4. **Light/Dark Compatibility** - Must work in both modes (blend modes)
5. **Subtlety** - No overwhelming patterns; texture as whisper, not shout

---

## 1. Weight System Textures

Weight communicates **importance and permanence**. These textures reinforce the hierarchy from ephemeral (ghost) to immutable (plate).

### 1.1 Ghost Weight (Ephemeral, Uncommitted)

*Suggestions, drafts, AI recommendations, uncommitted states*

| Texture | Actual Appearance | Recommendation |
|---------|-------------------|----------------|
| **subtle-freckles** | Very faint tiny crosses/plus shapes scattered on white. Almost imperceptible fine fabric-like pattern. | ⭐ **TOP PICK** - Perfect "barely there" quality |
| **cream-dust** | Extremely faint scattered dots, nearly invisible | Good backup - very ethereal |
| **retina-dust** | Fine vertical grain lines, like delicate linen weave | Good for subtle structure |
| **snow** | Soft, cloudy/foggy variations in lightness. Ethereal, like soft snow drifts | Interesting dreamy quality |
| **light-paper-fibers** | Very sparse scattered dark fiber specks on white | Too sparse, may look like dirt |
| **subtle-grey** | Dense fine noise texture, uniform gray appearance | More noise than ghost |

**Verdict:** `subtle-freckles` is ideal - the tiny crosses create a "suggestion" feel without being distracting.

---

### 1.2 Paper Weight (Standard Working State)

*Default UI surfaces, most cards, everyday working state*

| Texture | Actual Appearance | Recommendation |
|---------|-------------------|----------------|
| **natural-paper** | Scattered small dark specks/fibers on white, like recycled paper | ⭐ **TOP PICK** - Authentic paper feel |
| **paper** | Very subtle horizontal fiber striations, like fine paper stock | Clean, professional alternative |
| **paper-1** | Similar to paper, visible horizontal grain | Good variant |
| **paper-2** | Lighter paper texture | Subtle option |
| **rice-paper** | Delicate scattered fiber particles, handmade quality | Beautiful but may be too decorative |
| **handmade-paper** | Fine fiber texture with small scattered particles | Artisanal feel |
| **textured-paper** | Light gray with uniform fine grain, like quality stock | Very versatile |
| **beige-paper** | Coarser paper with visible grain and fiber | More textured, warmer |
| **cream-paper** | Warm-toned paper texture | Vintage feel |

**Verdict:** `natural-paper` gives authentic "working document" feel. `paper` is cleaner alternative.

---

### 1.3 Card Weight (Elevated, Important)

*Milestones, key decisions, committed items, important content*

| Texture | Actual Appearance | Recommendation |
|---------|-------------------|----------------|
| **cardboard-flat** | Light gray, fine uniform grain like chipboard material | ⭐ **TOP PICK** - Substantial but clean |
| **cardboard** | Coarser fibrous texture with visible grain and specks | More textured, organic |
| **stressed-linen** | Beautiful woven fabric with visible horizontal/vertical thread crossings. Medium gray. | ⭐ **EXCELLENT** - Premium fabric weight |
| **groovepaper** | Very subtle diagonal herringbone pattern | Premium paper feel |
| **white-linen** | Fine horizontal lines creating linen weave effect | Clean fabric option |
| **textured-paper** | Uniform fine grain, quality paper stock | Versatile |

**Verdict:** `stressed-linen` is stunning for important content - looks like quality fabric. `cardboard-flat` is cleaner/simpler.

---

### 1.4 Plate Weight (System-Critical, Immutable)

*Modals, system alerts, canonical views, permanent decisions*

| Texture | Actual Appearance | Recommendation |
|---------|-------------------|----------------|
| **brushed-alum** | Diagonal brush strokes like brushed metal, fine parallel lines | ⭐ **TOP PICK** - Clean industrial authority |
| **brushed-alum-dark** | Same diagonal brushed metal but with noise overlay, heavier | Good for dark mode emphasis |
| **gun-metal** | Small tile with diagonal crosshatch pattern | Very technical, structured |
| **dark-leather** | Rich pebbled leather grain with visible wear/patina | ⭐ **EXCELLENT** - Premium, permanent feel |
| **leather** | Classic white leather with organic pebbled grain | Refined, official |
| **squared-metal** | Regular grid of small dots like perforated metal | Industrial precision |
| **micro-carbon** | Very small, fine technical pattern | Too small to see effect |

**Verdict:** `brushed-alum` for clean authority, `dark-leather` for rich permanence.

---

## 2. Semantic Texture Replacements

### 2.1 Bloom (Ideation, Newness, Creative)

*Creation flows, new projects, drafts, onboarding, brain dumps*

| Texture | Actual Appearance | Recommendation |
|---------|-------------------|----------------|
| **stardust** | Scattered dark specks/particles on white, like dust or stars | ⭐ **TOP PICK** - Perfect "emerging ideas" feel |
| **little-pluses** | Scattered small plus signs/crosses, random distribution | Addition/creation metaphor |
| **twinkle-twinkle** | Subtle regular dot pattern, like distant stars | Delicate sparkle |
| **worn-dots** | Regular grid of subtle halftone dots | Organized bloom |
| **soft-circle-scales** | Overlapping circular/scale shapes | Organic growth pattern |
| **sprinkles** | Very small, scattered dots | Too small to see well |

**Verdict:** `stardust` is perfect - scattered particles = emerging/forming ideas.

---

### 2.2 Grain (Execution, Progress, Craftsmanship)

*Active work views, task lists, in-progress states*

| Texture | Actual Appearance | Recommendation |
|---------|-------------------|----------------|
| **sandpaper** | Very fine, uniform sandy grain | ⭐ **TOP PICK** - Literal work surface |
| **gray-sand** | Medium gray with fine granular texture, small dark specks | Good grainy feel |
| **white-sand** | Light sandy texture | Subtle grain |
| **diagonal-noise** | Fine diagonal lines/stripes | Directional progress |
| **cross-scratches** | Diagonal crosshatch scratches like etching marks | Hand-worked feel |
| **rough-diagonal** | Visible diagonal texture | More pronounced |

**Verdict:** `sandpaper` is ideal - craftsmanship association is strong.

---

### 2.3 Pulse (Urgency, Deadlines, Momentum)

*Today focus, deadlines, priority zones, time-sensitive*

| Texture | Actual Appearance | Recommendation |
|---------|-------------------|----------------|
| **corrugation** | Very small horizontal ridged lines | ⭐ **TOP PICK** - Physical pressure feel |
| **subtle-stripes** | Diagonal fine lines, subtle pinstripe | Clean urgency |
| **grilled-noise** | Chevron/herringbone V-pattern with noise | Interesting momentum feel |
| **wave-grid** | Fine wavy crosshatch grid, undulating lines | Pulsing energy |
| **pinstripe-light** | Fine striped pattern | Tight, precise |
| **vertical-cloth** | Dense vertical ribbed fabric like corduroy | Strong directional |

**Verdict:** `corrugation` or `grilled-noise` - both have urgency/momentum feel.

---

### 2.4 Static (Blockers, Risk, Overwhelm)

*Error states, warnings, needs triage, blocked items*

| Texture | Actual Appearance | Recommendation |
|---------|-------------------|----------------|
| **broken-noise** | Medium gray with dense granular noise, small dark specks | ⭐ **TOP PICK** - Disruption/interference |
| **noisy** | Light scattered noise/specks, random dots | Warning level |
| **tactile-noise-light** | Fine diagonal crosshatch with noise | Subtle static |
| **tactile-noise-dark** | Same pattern, darker | Error level |
| **shattered** | Bold geometric angular polygons like broken glass | ⚠️ Very strong - use sparingly |
| **grilled-noise** | Chevron pattern with noise | Could work |
| **grid-noise** | Diagonal crosshatch with noise | Structured chaos |

**Verdict:** `broken-noise` for serious issues, `noisy` for warnings. `shattered` is dramatic but may be too bold.

---

### 2.5 Thread (Relationships, Dependencies, Links)

*Shared projects, dependency graphs, linked entities*

| Texture | Actual Appearance | Recommendation |
|---------|-------------------|----------------|
| **woven-light** | Clear crosshatch/basketweave with intersecting lines | ⭐ **TOP PICK** - Literal weaving |
| **woven** | Same pattern, slightly darker | Good alternative |
| **connected** | Interlocking basketweave of rectangular blocks | ⭐ **EXCELLENT** - Network/connection feel |
| **reticular-tissue** | Interconnected network/web pattern like cellular tissue | Organic network |
| **weave** | Small tile with crossing lines | Basic weave |
| **black-thread** / **black-thread-light** | Fine thread patterns | Subtle |

**Verdict:** `connected` is excellent - clearly shows "things linked together". `woven-light` is more subtle.

---

### 2.6 Frame (Canon, Structure, Decisions)

*Primary containers, modals, canonical views, official content*

| Texture | Actual Appearance | Recommendation |
|---------|-------------------|----------------|
| **tiny-grid** | Fine regular grid pattern | ⭐ **TOP PICK** - Clean structure |
| **elegant-grid** | Diagonal diamond/argyle pattern | More decorative |
| **graphy** / **graphy-dark** | Graph paper pattern | Mathematical precision |
| **grid** | Larger grid pattern | May be too visible |
| **project-paper** | Grid/ruled pattern | Project planning feel |
| **notebook** | Faint horizontal ruling | Document structure |
| **squared-metal** | Regular dot grid | Industrial precision |
| **mirrored-squares** | Geometric square pattern | Symmetric order |

**Verdict:** `tiny-grid` is ideal - structure without distraction.

---

## 3. Special Purpose Textures

### 3.1 Decorative/Accent (Use Sparingly)

| Texture | Actual Appearance | Potential Use |
|---------|-------------------|---------------|
| **washi** | Beautiful concentric circle/sunburst patterns, Japanese paper | Hero sections, special moments |
| **soft-circle-scales** | Overlapping circular scales | Growth/expansion states |
| **egg-shell** | Fine bumpy/stippled surface | Tactile surfaces |

### 3.2 Background/Page Level

| Texture | Actual Appearance | Potential Use |
|---------|-------------------|---------------|
| **white-wall** | Subtle stucco/plaster texture, organic variations | Page backgrounds |
| **subtle-surface** | Very minimal texture | Near-invisible base |
| **white-texture** | Fine subtle surface | Clean backgrounds |

### 3.3 Heavy/Dark Elements

| Texture | Actual Appearance | Potential Use |
|---------|-------------------|---------------|
| **dark-leather** | Rich pebbled leather with patina | Premium dark surfaces |
| **vertical-cloth** | Dense vertical ribbed fabric (corduroy-like) | Headers, dividers |
| **brushed-alum-dark** | Brushed metal with noise | Dark mode emphasis |

---

## 4. Revised Recommendations

Based on actual visual inspection, here are my updated top picks:

### Weight System

| Weight | Primary | Backup | Notes |
|--------|---------|--------|-------|
| **Ghost** | `subtle-freckles` | `snow` | Tiny crosses = suggestion feel |
| **Paper** | `natural-paper` | `paper` | Authentic working document |
| **Card** | `stressed-linen` | `cardboard-flat` | Fabric = premium/important |
| **Plate** | `brushed-alum` | `dark-leather` | Metal/leather = permanent |

### Semantic Textures

| Meaning | Primary | Backup | Notes |
|---------|---------|--------|-------|
| **Bloom** | `stardust` | `little-pluses` | Particles = emerging ideas |
| **Grain** | `sandpaper` | `gray-sand` | Work surface = craftsmanship |
| **Pulse** | `corrugation` | `grilled-noise` | Ridges = pressure/urgency |
| **Static** | `broken-noise` | `noisy` | Dense noise = disruption |
| **Thread** | `connected` | `woven-light` | Interlocking = relationships |
| **Frame** | `tiny-grid` | `graphy` | Grid = structure/canon |

---

## 5. Testing Priority

### Round 1 - Core System (Test First)

```
Weight:
1. subtle-freckles.png (ghost)
2. natural-paper.png (paper)
3. stressed-linen.png (card)
4. brushed-alum.png (plate)

Semantic:
5. stardust.png (bloom)
6. sandpaper.png (grain)
7. corrugation.png (pulse)
8. broken-noise.png (static)
9. connected.png (thread)
10. tiny-grid.png (frame)
```

### Round 2 - Alternatives (If Round 1 Fails)

```
- snow.png (ghost alt)
- paper.png (paper alt)
- cardboard-flat.png (card alt)
- dark-leather.png (plate alt)
- little-pluses.png (bloom alt)
- gray-sand.png (grain alt)
- grilled-noise.png (pulse alt)
- noisy.png (static alt)
- woven-light.png (thread alt)
- graphy.png (frame alt)
```

---

## 6. Implementation Notes

### File Sizes (Considerations)

Some textures are quite large:
- `wood.png` - 526KB (avoid)
- `rice-paper-2.png` - 313KB (use rice-paper.png instead)
- `cardboard.png` - 203KB (use cardboard-flat.png at 33KB)
- `white-wall.png` - 261KB (large)

Prefer smaller tiles that repeat well:
- `tiny-grid.png` - 232B
- `corrugation.png` - 138B
- `gun-metal.png` - 152B
- `sprinkles.png` - 179B

### CSS Implementation

```css
/* Example: Weight-based texture */
.wt-ghost {
  background-image: url('/textures/subtle-freckles.png');
  background-repeat: repeat;
}

/* Example: Semantic texture with blend mode */
.tx-bloom::before {
  background-image: url('/textures/stardust.png');
  background-repeat: repeat;
  opacity: var(--tx-opacity, 0.04);
  mix-blend-mode: multiply;
}

.dark .tx-bloom::before {
  mix-blend-mode: screen;
}
```

---

## 7. Visual Summary

### Material Progression (Weight)

```
Ghost          Paper           Card              Plate
┌─────────┐   ┌─────────┐    ┌─────────┐      ┌─────────┐
│ · · · · │   │ ·  · ·  │    │ ═══════ │      │ ╲╲╲╲╲╲╲ │
│  · · ·  │   │  · ·  · │    │ ═══════ │      │ ╲╲╲╲╲╲╲ │
│ · · · · │   │ ·   · · │    │ ═══════ │      │ ╲╲╲╲╲╲╲ │
└─────────┘   └─────────┘    └─────────┘      └─────────┘
 freckles      natural-paper  stressed-linen   brushed-alum
 (dust)        (fibers)       (woven fabric)   (metal)
```

### Semantic Textures

```
Bloom          Grain          Pulse            Static
┌─────────┐   ┌─────────┐    ┌─────────┐      ┌─────────┐
│ *  *    │   │ ░░░░░░░ │    │ ─────── │      │ ▒▓░▒▓░▒ │
│   * *   │   │ ░░░░░░░ │    │ ─────── │      │ ░▒▓░▒▓░ │
│ *    *  │   │ ░░░░░░░ │    │ ─────── │      │ ▒░▓▒░▓▒ │
└─────────┘   └─────────┘    └─────────┘      └─────────┘
 stardust      sandpaper      corrugation      broken-noise
 (particles)   (fine grain)   (ridges)         (disruption)

Thread         Frame
┌─────────┐   ┌─────────┐
│ ▐▐ ▐▐▐  │   │ ┼─┼─┼─┼ │
│ ▐▐▐ ▐▐  │   │ ─┼─┼─┼─ │
│ ▐▐ ▐▐▐  │   │ ┼─┼─┼─┼ │
└─────────┘   └─────────┘
 connected     tiny-grid
 (interlocking) (structure)
```

---

## Next Steps

1. Create a test page to view textures at different opacities
2. Test each texture with actual BuildOS content
3. Verify dark mode compatibility with `screen` blend mode
4. Select final winners and implement in `inkprint.css`
