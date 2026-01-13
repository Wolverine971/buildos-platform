<!-- docs/marketing/brand/BRAND_ASSET_INVENTORY.md -->

# BuildOS Brand Asset Inventory

> **Status:** Current assets collected, gaps identified, actions recommended
> **Last Updated:** 2026-01-13

---

## Summary: Current State

| Category             | Status                     | Priority |
| -------------------- | -------------------------- | -------- |
| **Logo & Wordmark**  | Exists but needs evolution | High     |
| **Color System**     | Strong, documented         | Low      |
| **Typography**       | Implemented                | Low      |
| **Textures**         | CSS complete, need exports | Medium   |
| **Icons**            | Lucide integration working | Low      |
| **Marketing Images** | Gaps identified            | High     |
| **Social Templates** | Missing                    | High     |
| **Print Collateral** | Missing                    | Medium   |

---

## 1. Logo & Wordmark

### Current Assets

| Asset           | Location                                         | Format          | Status |
| --------------- | ------------------------------------------------ | --------------- | ------ |
| Logo Light Mode | `/apps/web/static/buildos-logo-light.svg`        | SVG             | Active |
| Logo Dark Mode  | `/apps/web/static/buildos-logo-dark.svg`         | SVG             | Active |
| Favicon         | `/apps/web/static/AppImages/`                    | PNG (all sizes) | Active |
| Twitter Card BG | `/apps/web/static/twitter-card-background-*.svg` | SVG             | Active |

### Analysis: Current Logo

The current logo is a **purple-to-blue gradient wordmark**:

- Light: `#9333ea` → `#2563eb`
- Dark: `#c084fc` → `#60a5fa`

**Issue:** The gradient doesn't align with the Inkprint aesthetic which uses a single warm amber accent.

### Recommendation: Logo Evolution

**Option A: Keep Gradient (Different from Inkprint)**

- Logo is "the brand mark" — allowed to differ from UI
- Gradient creates recognizable identity
- Purple → Blue suggests creativity → intelligence

**Option B: Evolve to Inkprint Palette**

- Amber wordmark with no gradient
- Complete alignment with design system
- Simpler, more print-friendly

**Recommendation:** Option A with caveat — create an "Inkprint variant" for in-product use that's amber/ink-colored.

### Needed Logo Assets

- [ ] **Logomark** — An icon-only version (currently no logomark exists)
- [ ] **Monochrome Versions** — Black and white only
- [ ] **Inkprint Variant** — Amber/ink colors for in-product
- [ ] **Social Profile Sizes** — Square crops for profile images
- [ ] **App Icon with Logomark** — Currently using generic icon

---

## 2. Color System

### Current Implementation

**Fully documented in:**

- `/apps/web/src/lib/styles/inkprint.css` — CSS variables
- `/apps/web/tailwind.config.js` — Tailwind config
- `/apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md` — Documentation

### Color Values (Reference)

```
Light Mode:
--background: hsl(40, 20%, 98%)   → #FAF9F6
--foreground: hsl(240, 10%, 10%) → #18181A
--accent: hsl(24, 80%, 55%)      → #EA6D20

Dark Mode:
--background: hsl(240, 10%, 6%)  → #0F0F11
--foreground: hsl(40, 10%, 92%) → #EBE9E4
--accent: hsl(24, 85%, 58%)     → #F5833B
```

### Needed Color Assets

- [ ] **Color Palette Export** — PNG/PDF for sharing with designers
- [ ] **Contrast Checker Results** — Documentation of accessibility
- [ ] **Color Usage Guide** — When to use each color (already in master doc)

---

## 3. Typography

### Current Implementation

**Primary Font:** Inter (web font via Google Fonts or local)
**Secondary Font:** IBM Plex Serif (optional, for notes)

**Font Stack:**

```css
font-ui:
	Inter,
	'Söhne',
	'GT America',
	system-ui,
	-apple-system,
	sans-serif;
```

### Needed Typography Assets

- [ ] **Web Font Configuration** — Verify optimal loading
- [ ] **Typography Scale Reference** — Visual sizes exported
- [ ] **Font License Documentation** — Inter is SIL Open Font License

---

## 4. Semantic Textures

### Current Implementation

All 7 textures implemented in CSS:

- Bloom (radial halftone)
- Grain (diagonal lines)
- Pulse (horizontal stripes)
- Static (noise SVG)
- Thread (crosshatch)
- Frame (grid)
- Strip (vertical lines)

**Location:** `/apps/web/src/lib/styles/inkprint.css`

### Needed Texture Assets

- [ ] **SVG Exports** — Standalone texture files for use outside CSS
- [ ] **Texture Sample Sheet** — Visual reference of all textures
- [ ] **Texture Usage Guide** — When to use each (in master doc)

---

## 5. Icons

### Current Implementation

Using **Lucide Icons** throughout the application.

Common icons:

- Target (goals)
- Flag (milestones)
- Calendar (plans)
- ListChecks (tasks)
- FileText (documents)
- AlertTriangle (risks)
- GitBranch (connections)

### Needed Icon Assets

- [ ] **Custom BuildOS Icons** — If needed for unique concepts
- [ ] **Icon Size Guide** — Standard sizes used

---

## 6. Marketing Images

### Current Assets

| Asset               | Status                    | Quality |
| ------------------- | ------------------------- | ------- |
| Hero images         | Missing                   | N/A     |
| Feature screenshots | Missing (Inkprint styled) | N/A     |
| Blog header images  | Partial                   | Varies  |
| Comparison graphics | Missing                   | N/A     |

### Needed Marketing Images (Priority Order)

1. **Homepage Hero** — Brain dump → organized projects visualization
2. **Feature Screenshots** — With Inkprint styling, textures visible
3. **Project Lens Demo** — Zoom in/out visualization
4. **Ontology Graph** — Clean rendering of example project
5. **Before/After** — Chaos → Clarity transformation
6. **Blog Headers** — Template system with textures

### Recommended Style

- Screenshots should show real UI, not mockups
- Textures visible in backgrounds
- Amber accent prominent
- Show high information density (not whitewashed)
- Dark mode and light mode variants

---

## 7. Social Media Templates

### Current Assets

- Twitter card backgrounds exist (SVG)
- No post templates

### Needed Social Assets

| Platform  | Asset Type           | Status  |
| --------- | -------------------- | ------- |
| Twitter/X | Quote card template  | Missing |
| Twitter/X | Feature announcement | Missing |
| Twitter/X | Thread header/footer | Missing |
| LinkedIn  | Post image template  | Missing |
| LinkedIn  | Article header       | Missing |
| Instagram | Square post          | Missing |
| Instagram | Story template       | Missing |

### Template Style Requirements

- Use Inkprint textures (tx-frame or tx-bloom)
- Amber accent for highlights
- Micro-label pattern for categories
- Paper-like backgrounds

---

## 8. Print & Pitch Collateral

### Current Assets

- Brand docs (Markdown, not designed)
- No pitch deck
- No one-pager PDF

### Needed Print Assets

1. **Pitch Deck** (High Priority)
    - 10-15 slides
    - Inkprint styling
    - Context compounding narrative
    - Empire builder aesthetic

2. **One-Pager PDF** (High Priority)
    - What is BuildOS
    - Key features (ontology, agentic chat, brain dump)
    - ADHD-friendly positioning
    - Contact/signup

3. **Press Kit**
    - Logo files
    - Founder headshot
    - Boilerplate text
    - Key stats

---

## 9. Brand Guidelines Document

### Current State

Brand documentation exists in Markdown across multiple files:

- `BRAND_STRATEGY_2025.md`
- `brand-guide-1-pager.md`
- `buildos-brand-personality-profile.md`
- `INKPRINT_DESIGN_SYSTEM.md`
- `BUILDOS_BRAND_AESTHETIC_COMPLETE.md` (NEW)

### Needed

- [ ] **Unified Brand PDF** — Single document with visuals, for external sharing
- [ ] **Component Storybook** — Live examples of all patterns

---

## 10. Asset Checklist by Priority

### Immediate (Before Next Marketing Push)

- [ ] Logomark (icon-only version)
- [ ] Homepage hero image
- [ ] Twitter quote card template
- [ ] One-pager PDF
- [ ] 3-5 feature screenshots with Inkprint styling

### Short-term (Next 30 Days)

- [ ] Pitch deck
- [ ] Full social media template set
- [ ] Texture SVG exports
- [ ] Color palette export
- [ ] Blog header template system

### Medium-term (Next Quarter)

- [ ] Press kit
- [ ] Video thumbnail templates
- [ ] Unified brand guidelines PDF
- [ ] Component Storybook

---

## 11. File Structure Recommendation

Organize brand assets in:

```
/docs/marketing/brand/
├── assets/
│   ├── logos/
│   │   ├── buildos-wordmark-light.svg
│   │   ├── buildos-wordmark-dark.svg
│   │   ├── buildos-logomark-light.svg
│   │   ├── buildos-logomark-dark.svg
│   │   ├── buildos-wordmark-mono-black.svg
│   │   ├── buildos-wordmark-mono-white.svg
│   │   └── buildos-logomark-mono.svg
│   ├── colors/
│   │   └── inkprint-palette.pdf
│   ├── textures/
│   │   ├── tx-bloom.svg
│   │   ├── tx-grain.svg
│   │   ├── tx-pulse.svg
│   │   ├── tx-static.svg
│   │   ├── tx-thread.svg
│   │   ├── tx-frame.svg
│   │   └── tx-strip.svg
│   ├── social/
│   │   ├── twitter-quote-template.svg
│   │   ├── linkedin-post-template.svg
│   │   └── instagram-post-template.svg
│   └── screenshots/
│       ├── feature-braindump.png
│       ├── feature-ontology.png
│       ├── feature-agentic-chat.png
│       └── dashboard-overview.png
├── collateral/
│   ├── buildos-one-pager.pdf
│   ├── buildos-pitch-deck.pdf
│   └── buildos-press-kit.zip
└── guidelines/
    └── buildos-brand-guidelines.pdf
```

---

## Summary: Top 5 Actions

1. **Create Logomark** — Icon-only version needed for favicons, app icons
2. **Capture Feature Screenshots** — With Inkprint styling visible
3. **Design Social Templates** — Twitter quote card as first priority
4. **Build One-Pager PDF** — For investors, users, press
5. **Export Texture SVGs** — For use outside codebase

---

**See also:**

- `BUILDOS_BRAND_AESTHETIC_COMPLETE.md` — Full design rationale
- `BRAND_AESTHETIC_ONE_PAGER.md` — Quick reference
- `INKPRINT_DESIGN_SYSTEM.md` — Technical implementation
