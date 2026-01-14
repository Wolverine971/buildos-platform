# Inkprint v2: PNG Texture Evolution

> **Status:** Design Proposal
> **Created:** 2026-01-14
> **Related:** `INKPRINT_DESIGN_SYSTEM.md`, `TEXTURE_CANDIDATES.md`

---

## Executive Summary

This document proposes evolving the Inkprint design system from CSS-generated patterns to real PNG textures from TransparentTextures.com. The goal: **make weight feel like material, and semantic textures feel organic**.

### The Insight

With real textures, we can express weight through **physical material metaphor**:

```
Ghost  →  Dust/particles   (barely there)
Paper  →  Paper fibers     (working document)
Card   →  Woven fabric     (important, substantial)
Plate  →  Brushed metal    (immutable, permanent)
```

This creates an intuitive progression users will **feel** without thinking.

---

## 1. Current State vs Proposed

### Current: CSS-Generated Patterns

```css
/* All patterns feel similarly "digital" */
.tx-bloom::before {
  background-image: radial-gradient(...);  /* Dots */
}
.tx-grain::before {
  background-image: repeating-linear-gradient(45deg...);  /* Lines */
}
```

**Problems:**
- Synthetic, computer-generated feel
- All textures have similar visual "weight"
- Hard to distinguish at a glance
- Weight system is purely shadow/border based

### Proposed: PNG Textures + Material Weight

```css
/* Semantic textures with real depth */
.tx-bloom::before {
  background-image: url('/textures/stardust.png');  /* Real particles */
}

/* Weight IS material */
.wt-ghost::before {
  background-image: url('/textures/subtle-freckles.png');  /* Dust */
}
.wt-plate::before {
  background-image: url('/textures/brushed-alum.png');  /* Metal */
}
```

**Benefits:**
- Organic, tactile feel
- Weight communicates through material
- Clearer visual distinction
- Richer semantic expression

---

## 2. The Two-Dimensional Enhancement

### Dimension 1: Weight = Material (How Important)

Weight classes now carry **material textures** that communicate importance:

| Weight | Material Texture | Visual Feel | Use Case |
|--------|------------------|-------------|----------|
| `wt-ghost` | `subtle-freckles` | Dust, barely visible | Suggestions, uncommitted |
| `wt-paper` | `natural-paper` | Paper fibers | Standard working state |
| `wt-card` | `stressed-linen` | Woven fabric | Important, elevated |
| `wt-plate` | `brushed-alum` | Brushed metal | Immutable, system-critical |

### Dimension 2: Semantic Texture = Pattern (What Kind)

Semantic textures now use **real patterns** that communicate meaning:

| Texture | PNG Texture | Visual Pattern | Meaning |
|---------|-------------|----------------|---------|
| `tx-bloom` | `stardust` | Scattered particles | Ideation, newness |
| `tx-grain` | `sandpaper` | Fine sand grain | Execution, craftsmanship |
| `tx-pulse` | `corrugation` | Horizontal ridges | Urgency, momentum |
| `tx-static` | `broken-noise` | Dense noise | Blockers, risk |
| `tx-thread` | `connected` | Interlocking blocks | Relationships, links |
| `tx-frame` | `tiny-grid` | Fine grid | Structure, canon |

---

## 3. Implementation Options

### Option A: Replace CSS with PNGs (Same API)

**Approach:** Keep exact same class names, just swap implementation.

```css
/* Before */
.tx-bloom::before {
  background-image: radial-gradient(...);
}

/* After */
.tx-bloom::before {
  background-image: url('/textures/stardust.png');
  background-repeat: repeat;
}
```

**Pros:**
- Zero migration needed
- Same API for developers
- Easy rollback

**Cons:**
- Weight system still shadow-only
- Misses material metaphor opportunity

### Option B: Material Weight + Pattern Overlay

**Approach:** Weight provides material base, texture provides semantic overlay.

```css
/* Weight = material base (automatic with weight class) */
.wt-paper::before {
  background-image: url('/textures/natural-paper.png');
}

/* Texture = semantic overlay (applied on top) */
.tx-bloom::after {
  background-image: url('/textures/stardust.png');
  opacity: 0.03;
}
```

**Pros:**
- Two independent texture layers
- Material metaphor fully realized
- Maximum semantic expression

**Cons:**
- Two pseudo-elements needed
- More complex CSS
- Higher rendering cost

### Option C: Texture Includes Material (Recommended)

**Approach:** Each semantic texture has weight-aware variants built in.

```css
/* Semantic texture with material baked in */
.tx-bloom.wt-ghost::before {
  background-image:
    url('/textures/subtle-freckles.png'),
    url('/textures/stardust.png');
}

.tx-bloom.wt-paper::before {
  background-image:
    url('/textures/natural-paper.png'),
    url('/textures/stardust.png');
}
```

**Pros:**
- Single pseudo-element
- Best visual results
- Clear developer API

**Cons:**
- More CSS rules (24 combinations)
- Need to maintain matrix

---

## 4. Recommended Implementation: Hybrid Approach

### Phase 1: Semantic Textures Only

Replace CSS patterns with PNG textures. No material layer yet.

```css
.tx-bloom::before {
  background-image: url('/textures/stardust.png');
  background-repeat: repeat;
  opacity: var(--tx-opacity, 0.04);
}
```

**Files changed:** `inkprint.css`
**Migration:** None
**Risk:** Low

### Phase 2: Weight Material (Optional)

Add material textures to weight classes for enhanced depth.

```css
.wt-paper {
  /* existing shadow/border */
  background-image: url('/textures/natural-paper.png');
  background-blend-mode: overlay;
}
```

**Files changed:** `inkprint.css`, potentially `Card.svelte`
**Migration:** Test existing components
**Risk:** Medium

### Phase 3: Combined Matrix (Future)

Create purpose-built texture combinations for each semantic × weight intersection.

**Risk:** High complexity

---

## 5. CSS Implementation Details

### Texture Base Class

```css
.tx {
  position: relative;
}

.tx::before {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 1;
  border-radius: inherit;
  background-repeat: repeat;
  mix-blend-mode: multiply;
  opacity: var(--tx-opacity, 0.04);
}

.dark .tx::before {
  mix-blend-mode: screen;
}
```

### Semantic Texture Classes

```css
/* Bloom - scattered particles = emerging ideas */
.tx-bloom::before {
  background-image: url('/textures/stardust.png');
}

/* Grain - fine sand = craftsmanship */
.tx-grain::before {
  background-image: url('/textures/sandpaper.png');
}

/* Pulse - ridges = pressure/urgency */
.tx-pulse::before {
  background-image: url('/textures/corrugation.png');
}

/* Static - noise = disruption */
.tx-static::before {
  background-image: url('/textures/broken-noise.png');
}

/* Thread - interlocking = connections */
.tx-thread::before {
  background-image: url('/textures/connected.png');
}

/* Frame - grid = structure */
.tx-frame::before {
  background-image: url('/textures/tiny-grid.png');
}
```

### Weight Material Classes (Phase 2)

```css
/* Ghost - dust/particles */
.wt-ghost {
  background-image: url('/textures/subtle-freckles.png');
  background-blend-mode: soft-light;
  background-size: auto;
}

/* Paper - paper fibers */
.wt-paper {
  background-image: url('/textures/natural-paper.png');
  background-blend-mode: soft-light;
}

/* Card - woven fabric */
.wt-card {
  background-image: url('/textures/stressed-linen.png');
  background-blend-mode: soft-light;
}

/* Plate - brushed metal */
.wt-plate {
  background-image: url('/textures/brushed-alum.png');
  background-blend-mode: soft-light;
}
```

---

## 6. Dark Mode Considerations

### Blend Mode Switch

```css
/* Light mode: multiply darkens */
.tx::before {
  mix-blend-mode: multiply;
}

/* Dark mode: screen lightens */
.dark .tx::before {
  mix-blend-mode: screen;
}
```

### Material in Dark Mode

```css
/* Weight materials need different blends in dark */
.dark .wt-paper {
  background-blend-mode: overlay;
  opacity: 0.15; /* Stronger in dark */
}
```

---

## 7. Performance Considerations

### File Size Budget

| Priority | Texture | Size | Notes |
|----------|---------|------|-------|
| High | tiny-grid.png | 232B | Tiny, efficient |
| High | corrugation.png | 138B | Tiny, efficient |
| High | subtle-freckles.png | ~2KB | Small tile |
| High | stardust.png | ~4KB | Small tile |
| Medium | sandpaper.png | ~8KB | Medium tile |
| Medium | natural-paper.png | ~5KB | Medium tile |
| Low | stressed-linen.png | ~15KB | Larger, detailed |
| Low | brushed-alum.png | ~10KB | Larger, detailed |

**Total budget:** ~50KB for all textures

### Loading Strategy

```css
/* Preload critical textures */
@layer textures {
  .tx-frame::before { background-image: url('/textures/tiny-grid.png'); }
  .tx-grain::before { background-image: url('/textures/sandpaper.png'); }
}
```

### Lazy Loading Non-Critical

```js
// Load weight materials only when used
if (document.querySelector('.wt-card')) {
  const link = document.createElement('link');
  link.rel = 'prefetch';
  link.href = '/textures/stressed-linen.png';
  document.head.appendChild(link);
}
```

---

## 8. Migration Path

### Step 1: Add PNG textures to `/static/textures/`

Already done.

### Step 2: Create test page

Route: `/design-system/inkprint-v2`
Shows all textures at different opacities with real content.

### Step 3: A/B test critical paths

Compare CSS vs PNG textures on:
- Dashboard cards
- Project cards
- Task lists
- Modals

### Step 4: Full rollout

Update `inkprint.css` with PNG backgrounds.

### Step 5: Optional material weights

Decide if weight-as-material adds value or complexity.

---

## 9. Decision Matrix

| Criteria | CSS Patterns | PNG Textures | PNG + Material |
|----------|--------------|--------------|----------------|
| Visual richness | 3/5 | 4/5 | 5/5 |
| Performance | 5/5 | 4/5 | 3/5 |
| Maintainability | 5/5 | 4/5 | 3/5 |
| Semantic clarity | 3/5 | 4/5 | 5/5 |
| Developer simplicity | 5/5 | 5/5 | 4/5 |
| **Total** | 21/25 | 21/25 | 20/25 |

**Recommendation:** Start with PNG Textures (Phase 1). Evaluate Material Weights (Phase 2) based on user feedback.

---

## 10. Next Steps

1. **[ ] Create test page** at `/design-system/inkprint-v2`
2. **[ ] Test all textures** at different opacities
3. **[ ] Verify dark mode** with screen blend
4. **[ ] Performance audit** with Lighthouse
5. **[ ] User testing** on key flows
6. **[ ] Decision point:** Proceed to full implementation?

---

## Appendix: Texture File Reference

### Semantic Textures (Primary)

| Name | File | Purpose |
|------|------|---------|
| Bloom | `stardust.png` | Ideation, newness |
| Grain | `sandpaper.png` | Execution, progress |
| Pulse | `corrugation.png` | Urgency, momentum |
| Static | `broken-noise.png` | Blockers, risk |
| Thread | `connected.png` | Relationships |
| Frame | `tiny-grid.png` | Structure, canon |

### Material Textures (Weight)

| Weight | File | Purpose |
|--------|------|---------|
| Ghost | `subtle-freckles.png` | Ephemeral |
| Paper | `natural-paper.png` | Standard |
| Card | `stressed-linen.png` | Important |
| Plate | `brushed-alum.png` | Immutable |

### Backup Textures

| Primary | Backup | Notes |
|---------|--------|-------|
| stardust | little-pluses | More geometric |
| sandpaper | gray-sand | More visible |
| corrugation | grilled-noise | Chevron pattern |
| broken-noise | noisy | Lighter |
| connected | woven-light | More subtle |
| tiny-grid | graphy | Graph paper |
