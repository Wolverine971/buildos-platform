<!-- docs/marketing/brand/BRAND_AESTHETIC_ONE_PAGER.md -->
# BuildOS Brand Aesthetic — One-Pager

> **The quick-reference guide for design decisions.**
> See `BUILDOS_BRAND_AESTHETIC_COMPLETE.md` for full rationale.

---

## The Core Identity

**BuildOS = Context Infrastructure for Empire Builders**

Not a task app. Not a planner. A **workshop for your thinking** where context compounds into capability.

---

## The Three-Word Summary

**Printed. Tactile. Intentional.**

| Word | Meaning |
|------|---------|
| **Printed** | Paper/ink aesthetic, not glass/glow |
| **Tactile** | Textures you can feel, weight you sense |
| **Intentional** | Every element has a reason |

---

## Color System (Paper + Ink + Accent)

### Light Mode (Paper Studio)
```
Background:  Warm off-white    #FAF9F6
Foreground:  Deep ink black    #18181A
Accent:      Warm amber        #EA6D20
```

### Dark Mode (Ink Room)
```
Background:  Near-black        #0F0F11
Foreground:  Warm off-white    #EBE9E4
Accent:      Bright amber      #F5833B
```

### Rules
- Never use raw grays (`gray-700`, `slate-200`)
- Always use semantic tokens (`text-foreground`, `bg-card`)
- One accent color only (amber-orange)

---

## The 7 Semantic Textures

| Texture | Class | Meaning | Use For |
|---------|-------|---------|---------|
| **Bloom** | `tx tx-bloom` | Ideation, new | Brain dumps, drafts |
| **Grain** | `tx tx-grain` | Execution | Active tasks |
| **Pulse** | `tx tx-pulse` | Urgency | Today focus, deadlines |
| **Static** | `tx tx-static` | Blocked | Errors, warnings |
| **Thread** | `tx tx-thread` | Connected | Shared, linked |
| **Frame** | `tx tx-frame` | Canonical | Primary containers |
| **Strip** | `tx tx-strip` | Separator | Headers, transitions |

### Intensity
- `tx-weak` (3%) — Default for most UI
- `tx-med` (6%) — Headers, sections
- `tx-strong` (10%) — Background-only

---

## Typography Quick Reference

| Role | Class | Use |
|------|-------|-----|
| Hero | `text-3xl sm:text-5xl font-semibold` | Page titles |
| Section | `text-2xl sm:text-3xl font-semibold` | Major sections |
| Card Title | `text-lg font-semibold` | Panel headers |
| Body | `text-sm sm:text-base` | Content |
| Micro-Label | `text-[0.65rem] uppercase tracking-[0.15em]` | Metadata |

---

## Shadow System

```css
shadow-ink          /* Standard cards */
shadow-ink-strong   /* Modals, overlays */
shadow-ink-inner    /* Inputs, insets */
```

---

## Motion

| Speed | Duration | Use |
|-------|----------|-----|
| Fast | 120ms | Hover, press |
| Default | 180ms | Entry, exit |
| Slow | 260ms | Complex |

**Key Animation:** `animate-ink-in` — Elements settle like ink on paper.

**Tactile Interaction:** `.pressable` — Buttons depress 1px on click.

---

## Component Patterns

### Primary Card
```svelte
<div class="bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak">
  ...
</div>
```

### CTA Button
```svelte
<button class="bg-accent text-accent-foreground rounded-lg shadow-ink pressable">
  Build Context
</button>
```

### Error State
```svelte
<div class="bg-card ... tx tx-static tx-weak">
  ...
</div>
```

---

## The Five Laws

1. **Readability > Texture** — Remove texture if it hurts reading
2. **One Texture Per Surface** — No stacking
3. **Consistent Meaning** — Pulse = urgency everywhere
4. **Semantic Tokens Only** — No random colors
5. **Printed, Not Plastic** — Crisp edges, no neon

---

## Before You Ship Checklist

- [ ] Uses semantic color tokens?
- [ ] Texture is weak intensity for text areas?
- [ ] Shadows use `shadow-ink` system?
- [ ] Interactive elements have `pressable`?
- [ ] Works in both light and dark mode?
- [ ] Responsive on mobile?
- [ ] Focus states visible?

---

## The Voice in Design

**DJ says:** "I tinker, I work, I build."
**Design shows:** Textured surfaces, workshop aesthetic, visible craft.

**DJ says:** "AI should know your work."
**Design shows:** Context prominently displayed, memory visible.

**DJ says:** "Your brain isn't broken."
**Design shows:** No shame in messy states, validates chaos.

---

## The Emotional Targets

| Moment | User Should Feel |
|--------|------------------|
| First glance | "This is different. Professional but warm." |
| First use | "Everything has weight. Serious tool." |
| First week | "It knows what I'm doing." |
| First month | "My empire is building." |

---

**Full documentation:** `BUILDOS_BRAND_AESTHETIC_COMPLETE.md`
**Design system:** `INKPRINT_DESIGN_SYSTEM.md`
