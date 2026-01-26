# BuildOS Design Library

A collection of reusable design systems, components, and utilities for BuildOS projects.

## 📦 Contents

### Inkprint Textures v1.0.0

A comprehensive texture library based on the BuildOS Inkprint Design System.

**Location:** `/design-library/inkprint-textures/`

**What's Included:**

- 7 semantic texture types (bloom, grain, pulse, static, thread, frame, strip)
- Complete color system with light/dark mode
- Shadow utilities
- Weight system (ghost, paper, card, plate)
- Atmospheric depth effects
- Interactive states (pressable, rim accents)
- Motion animations
- Layout utilities

**Get Started:**

- [README](./inkprint-textures/README.md) - Comprehensive documentation
- [QUICK_START](./inkprint-textures/QUICK_START.md) - Quick reference guide
- [demo.html](./inkprint-textures/demo.html) - Interactive demonstration

**Quick Import:**

```html
<link rel="stylesheet" href="/design-library/inkprint-textures/all-textures.css" />
```

**Example Usage:**

```html
<div class="bg-card border border-border rounded-lg p-6 tx tx-frame tx-weak">
	<h3>Card Title</h3>
	<p class="text-muted-foreground">Card content with frame texture</p>
</div>
```

---

## 🎨 Design Philosophy

All BuildOS design libraries follow these principles:

1. **Semantic over Decorative** - Design tokens convey meaning
2. **Performance First** - Optimized for speed and efficiency
3. **Accessible by Default** - WCAG 2.1 AA compliance
4. **Dark Mode Support** - Every component works in light and dark
5. **Responsive Design** - Mobile-first, works everywhere
6. **Progressive Enhancement** - Works without extras, better with them

## 📄 License

Part of the BuildOS platform. See main repository for license information.

---

**Version:** 1.0.0
**Last Updated:** 2026-01-25
