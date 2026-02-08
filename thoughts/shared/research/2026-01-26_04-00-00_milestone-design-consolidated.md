---
title: 'Milestone Design - Consolidated Summary'
date: 2026-01-26T04:00:00Z
status: completed
tags: [design-system, inkprint, milestones, spacing, borders, visual-hierarchy, consolidated]
related:
    - /apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md
    - /apps/web/docs/technical/components/SPACING_BORDER_STANDARDS.md
path: thoughts/shared/research/2026-01-26_04-00-00_milestone-design-consolidated.md
---

# Milestone Section Design - Consolidated Summary

Consolidation of 14 research documents produced on 2026-01-26 during the complete
redesign of GoalMilestonesSection and MilestoneListItem components. This document
captures the final decisions and specifications after multiple design iterations.

---

## Problem Statement

The milestone section within goal cards had several design issues:

1. Competing visual weight -- triple-nested components with too many rounded corners
2. Inconsistent opacity values (mix of /30, /50, /70) not following semantic tokens
3. Border radius clash between EntityListItem (rounded-lg) and MilestoneSection (square)
4. Custom ultra-compact spacing (10px text, 10px icons) instead of documented standards
5. Badge counter vertical misalignment with parent EntityListItem
6. Border stacking when card wrapper borders overlapped with inner element borders

---

## Design Evolution

The work progressed through several iterations:

1. **Initial cleanup** -- Removed competing visual treatments, made milestones subordinate
2. **Semantic design** -- Added tx-frame texture and emerald color identity
3. **Minimal approach** -- Stripped all decoration (too invisible at 1/10 weight)
4. **Balanced design** -- Restored texture and emerald identity at 3/10 weight
5. **Standards compliance** -- Updated from ultra-compact (10px) to Compact/Nested (12px)
6. **Border strategy** -- Created three-layer border system to eliminate stacking
7. **Final verification** -- Audited against SPACING_BORDER_STANDARDS.md and INKPRINT_DESIGN_SYSTEM.md

---

## Final Design Specifications

### Visual Hierarchy

| Element              | Weight | Treatment                                    |
|----------------------|--------|----------------------------------------------|
| Goal EntityListItem  | 9/10   | tx-bloom, wt-paper, border-l-4 amber, shadow |
| Milestone zone       | 3/10   | tx-frame tx-weak, bg-emerald-50/5            |
| Milestone items      | 2/10   | Edge-to-edge, emerald hover                  |
| Add milestone CTA    | 5/10   | rounded-lg, pressable, accent hover          |

### Spacing (Compact/Nested Pattern per SPACING_BORDER_STANDARDS.md lines 77-91)

| Property    | Value             | Pixels  |
|-------------|-------------------|---------|
| Padding     | `px-3 py-1.5`    | 12px/6px |
| Gap         | `gap-2`          | 8px     |
| Icons       | `w-3.5 h-3.5`   | 14px    |
| Text        | `text-xs`        | 12px    |
| CTA padding | `px-3 py-2`     | 12px/8px |
| Badge       | `px-2.5 py-2.5`  | 10px/10px (matches EntityListItem height) |

Horizontal padding (px-3) matches the parent goal for left-alignment. Only vertical
padding reduces to indicate nesting hierarchy. All values align to the 8px grid.

### Border & Radius Strategy

**Three-layer border system (no stacking):**

- Card wrapper: `border-t border-r border-b border-border` (no left, avoids stacking)
- EntityListItem: `border` from wt-paper + `!border-l-4 !border-amber-500` (4px accent)
- MilestoneSection: `border-t border-l border-border` (separator + completes left edge)

**Dividers:** `divide-border/80` (80% opacity, matches tasks/plans/goals page-wide)

**Radius rules:**
- Card wrapper: `rounded-lg` with `overflow-hidden`
- EntityListItem: `!rounded-none !shadow-none` (wrapper owns corners and shadow)
- Structure (headers, items, show-more): No radius (edge-to-edge)
- CTAs (add, empty-state): `rounded-lg` (12px)
- Action buttons (complete, edit): `rounded-md` (8px)

### Texture & Color

**Textures (Inkprint Law 2):**
- Goal card: `tx-bloom tx-weak` -- aspiration, ideation
- Milestone section: `tx-frame tx-weak` -- canonical checkpoints (3% opacity)

**Emerald color identity (achievement/success):**

| Element        | Class                  | Opacity |
|----------------|------------------------|---------|
| Container bg   | `bg-emerald-50/5`     | 5%      |
| Flag icon      | `text-emerald-600`    | 100%    |
| Header hover   | `bg-emerald-50/20`   | 20%     |
| Item hover     | `bg-emerald-50/30`   | 30%     |
| Completed icon | `text-emerald-500`   | 100%    |

All dark mode variants use emerald-900 at reduced opacity.

### Typography

All text in the milestone section uses `text-xs` (12px) with semantic color tokens.
Badge counter uses `text-[10px]` as an exception (appropriate for counters).

### Motion

- Standard transitions: `transition-colors` at 150ms
- Slide expand/collapse: 120ms
- `pressable` class on CTAs and action buttons only, not on structural elements

---

## Files Modified

1. **GoalMilestonesSection.svelte** -- Container with tx-frame + emerald bg, section
   header with emerald flag, dividers at 80%, add/show-more/completed section elements.
   All spacing updated to Compact/Nested pattern.

2. **MilestoneListItem.svelte** -- Container spacing, icon sizes, text sizes, emerald
   hover states, edge-to-edge layout. Action buttons with proper radius.

3. **+page.svelte (Projects Detail)** -- Goal card wrapper with rounded-lg, shadow-ink,
   three-side border. EntityListItem overrides (!rounded-none, !shadow-none). Badge
   counter vertical alignment fix (py-1 to py-2.5).

---

## Inkprint Compliance

- **Law 1 (Readability Beats Texture):** 3% texture opacity, 12px text, 14px icons
- **Law 2 (One Surface = One Texture):** bloom for goals, frame for milestones
- **Law 3 (Meaning Is Consistent):** bloom = ideation, frame = canonical, emerald = achievement
- **Law 4 (Use Tokens):** All semantic tokens, proper light/dark variants, no hardcoded colors
- **Law 5 (Printed, Not Plastic):** Crisp borders, subtle textures, no glows or blur

---

## Key Learnings

1. **Nested components should be subordinate, not competing.** A 6-point visual weight
   gap (goal 9/10 vs milestones 3/10) creates clear hierarchy.

2. **Follow SPACING_BORDER_STANDARDS.md.** The Compact/Nested pattern (px-3 py-1.5,
   gap-2, w-3.5 h-3.5, text-xs) is explicitly documented for milestones under goals.
   Ultra-compact (10px) is only for badges and counters.

3. **Horizontal padding matches parent for alignment.** Only vertical padding reduces
   to show nesting.

4. **Use a wrapper for composite cards.** When EntityListItem and a nested section
   combine, a card wrapper owns rounded corners and shadow, inner elements override
   to !rounded-none !shadow-none.

5. **Three-layer border strategy prevents stacking.** Omit wrapper left border so
   EntityListItem and MilestoneSection each own their left edge independently.

6. **Divider opacity must match page-wide patterns.** All entity lists use
   divide-border/80; milestones must match for visual harmony.

---

**Status:** Complete and production-ready. No further design changes needed.
