---
title: '7 UI/UX Mistakes That Scream Beginner: Lessons from Kole Jain'
description: 'A deep read of Kole Jain''s "7 UI/UX mistakes that SCREAM you''re a beginner" — flow before pixels, the three-step shadow recipe, the 10px corner-radius standard, and why subtraction beats addition.'
author: 'DJ Wayne'
date: '2026-05-04'
lastmod: '2026-05-04'
changefreq: 'monthly'
priority: '0.7'
published: true
tags:
    [
        'source-analysis',
        'ui-ux',
        'design-mistakes',
        'beginner-mistakes',
        'product-and-design',
        'figma'
    ]
readingTime: 11
excerpt: "Beginner UIs aren't broken from lack of skill — they're broken from a small set of repeatable, fixable mistakes. Polish comes from subtraction, consistency, and respect for the user's flow, not from adding more visual flair."
sourceTitle: "7 UI/UX mistakes that SCREAM you're a beginner"
sourceCreator: 'Kole Jain'
sourceUrl: 'https://www.youtube.com/watch?v=AH_ugxmLeUM'
sourceChannelUrl: 'https://www.youtube.com/@KoleJain'
lineagePeople:
    - 'Kole Jain'
lineageSources:
    - title: "7 UI/UX mistakes that scream you're a beginner"
      creator: 'Kole Jain'
      creatorType: 'Person'
      creatorUrl: 'https://www.youtube.com/@KoleJain'
      channelName: 'Kole Jain'
      channelUrl: 'https://www.youtube.com/@KoleJain'
      sourceType: 'youtube_video'
      url: 'https://www.youtube.com/watch?v=AH_ugxmLeUM'
relatedSkills:
    - 'ui-ux-quality-review'
path: apps/web/src/content/blogs/source-analyses/kole-jain-7-ui-ux-mistakes-beginner.md
---

# 7 UI/UX Mistakes That Scream Beginner: Lessons from Kole Jain

A deep read of Kole Jain's [7 UI/UX mistakes that SCREAM you're a beginner](https://www.youtube.com/watch?v=AH_ugxmLeUM) — a 7-minute Figma walkthrough redesigning a recipe app, mistake-by-mistake.

## Why this analysis exists

This is one of the source layers behind the BuildOS [`ui-ux-quality-review`](/agent-skills/ui-ux-quality-review) skill. The skill encodes specific patterns from this video — the three-step shadow recipe, the 10px corner-radius standard, the save → badge-dot pattern, the chart failure modes. This post is the long form: how Kole Jain teaches the same mistakes with concrete before-and-afters.

## Core thesis

Beginner UIs aren't broken from lack of skill — they're broken from a small set of repeatable, fixable mistakes. Polish comes from subtraction, consistency, and respect for the user's flow, not from adding more visual flair.

## TL;DR — the 8 mistakes

| #   | Mistake                      | One-line fix                                                                                             |
| --- | ---------------------------- | -------------------------------------------------------------------------------------------------------- |
| 1   | Bad user flow                | Sketch on paper before designing; cover edge cases (skip, no-results, empty states)                      |
| 2   | Overusing effects            | Strip gradients/shadows. If you must, use same-color gradients and soft light-gray shadows               |
| 3   | Tight spacing                | Use grids + auto layout. Mobile needs more whitespace than you think                                     |
| 4   | Inconsistent components      | Standardize corner radius (10px for small components), reuse components, use color/measurement variables |
| 5   | Bad icons                    | One icon library; consistent stroke/fill; tooltips for unfamiliar icons                                  |
| 6   | Redundant elements           | Kill arrows when swipe works; remove decorative strokes                                                  |
| 7   | Missing interactive feedback | Grayed-out states on click, loading spinners, badge dots after save                                      |
| 8   | (Bonus) Overdesigned charts  | Function over Dribbble-aesthetic. Show the axis. One bar per data point                                  |

## The mistakes (detailed)

### 1. User flow — the silent UX killer

**The diagnosis:** Designers build screens, not flows. The allergy screen has 6 preset options but no search bar (what if user is allergic to something else?) and no skip button (what if user has no allergies?).

**The fixes:**

- **Sketch on paper first.** Box-and-arrow flowcharts catch entire missing screens before pixels ever get pushed.
- **Audit for the most-commonly-missed elements:**
    - Navigation links
    - Hidden states (loading, empty, error, no-results)
    - Dynamic interactions (hovers, micro-interactions)
- **Add escape hatches:** skip buttons, "other" options, search-on-top-of-presets.
- **Small touches matter:** filter icon on search bar, save button up top.

> _"These are things you will miss if you don't plan out your flow, but users, they'll feel it instantly."_

### 2. Overusing effects — the addiction problem

**The diagnosis:** Beginners reach for shadows, glows, and gradients to make designs "feel premium." It does the opposite — it screams beginner.

**Gradients:**

- If you must use one, stay in the same color family (darker green → lighter green, not blue → green).
- Default to no gradient. _"Honestly, this would look way cleaner with no gradient at all. And that's usually the case."_

**Drop shadows — the three-step recipe:**

- Figma's default drop shadow is too harsh — don't just lower opacity.
- **Three-step shadow recipe:**
    1. Change shadow **color** to light gray (not pure black)
    2. Increase the **blur** significantly
    3. Or just remove the shadow entirely
- Heuristic: _"Less visual noise equals a better design."_

### 3. Spacing — most beginner UIs are too tight

**The diagnosis:** Things touching each other / small margins / no breathing room — the #1 visual signal of an amateur.

**The fixes:**

- **Grids:** 3-column grid for one screen, 2-column for another. Align elements to the grid as closely as possible. If breaking the grid still feels balanced, leave it.
- **Auto layout** for cards and chips with wonky layouts. Turn off **vertical trim** for pixel-perfect control.
- **Vertical spacing in stacks:** increase it to let things breathe and group naturally.
- **Mobile rule:** _"Especially on mobile screens, you'll need more space than you think."_

### 4. Inconsistent components — the easy-to-fix tell

**The diagnosis:** Same component drawn differently across the app (e.g., back button and skip button — same job, different design). Different corner radii on similar elements.

**The fixes:**

- **Corner radius standard:** 10 pixels for all smaller components. _"This is an important one that most designers miss."_
- **Match same-purpose elements:** identical search bars (only the prompting text differs), identical skip/back buttons in size + radius + style.
- **The consistency stack — use Figma's reusability primitives:**
    - **Styles** for colors
    - **Variables** for measurements
    - **Components** for UI elements

### 5. Icons — underrated power-up

**The diagnosis:** No icons = walls of text users must read. Mismatched icons (some filled, some outlined, different stroke widths) = visual chaos. Mystery icons with no labels = onboarding friction.

**Where to add icons:**

- On cards that are currently text-only (replace "Save" text with an icon).

**How to make them consistent:**

- Use **one library**. Recommendations:
    - **Flat Icons** (website) — pick "interface icons," then sort by stroke, width, and corner.
    - Download as **SVG** for best results.
    - **Figma plugins:** Feather Icons, Phosphor Icons.
- Match fill, line width, and style across all icons in a group.

**When to label:**

- Universal icons (house, bookmark, user) — no label needed.
- Ambiguous icons — add a **tooltip pop-up** for onboarding clarity.

**Pro tip — when mixed icon styles are okay:**

> _"It is okay to have different styles of icons in the same design, but only if they're visually separate."_

Example breakdown: navbar icons can differ from food icons can differ from recipe icons — because each set lives in its own region serving a different purpose.

### 6. Redundant elements — kill the clutter

**The diagnosis:** Decorative arrows, unnecessary strokes, and "stuff everywhere" trend-chasing. Each redundant element steals attention.

**The fixes:**

- Kill arrows when **swipe gestures** can replace them on mobile.
- Dim down button colors that don't need to demand attention.
- Strip strokes that aren't doing real work.
- **Contrast workaround:** if a stroke exists for accessibility/contrast reasons, dim it heavily instead of removing it.

### 7. Interactive feedback — the underused effects

**The diagnosis:** Mistake #2 was _overusing_ effects. This is the opposite: not enough feedback during interactions. Users click, nothing visible happens, they think the app is broken.

**Click feedback:**

- **Grayed-out state on click** — even a fraction of a second of visual change tells the user "the next screen is coming."
- **Loading spinner** if the wait is genuinely long.

**State-change feedback (the save-icon example):**

- Filling in the icon is good (step 1).
- **Step 2 — propagate the change:** add a red **badge dot** to the related tab (e.g., the Save tab) so the user sees the system-wide consequence of their action.

**Why this matters:** Feedback closes the action-result loop. No feedback = "did that work?" = re-tapping = bug reports.

### 8. Charts (Bonus) — function over Dribbble

**The diagnosis:** Charts are routinely overdesigned for portfolio aesthetics, destroying their actual job: communicating data.

**The crimes (a "Dribbble" chart):**

- No vertical axis → bars are unreadable.
- Rounded tops on bars → can't tell where the bar actually ends.
- 16 bars for 7 days of the week → meaningless visual padding.

**The fix:** Pick the boring, readable chart over the pretty one. _"Definitely less aesthetic, but conveys so much more useful information to the user."_

## Cross-cutting principles

These show up across multiple mistakes — they're the meta-rules of the video:

1. **Subtraction beats addition.** Most fixes are _removing_ things: gradients, shadows, arrows, strokes, redundant chart bars.
2. **Consistency is cheaper than creativity.** Same corner radius, same icon family, same component patterns — beginners think variety is interesting; pros know it's exhausting.
3. **Plan flows, not screens.** A beautiful screen with no skip button is a worse design than an ugly screen with a complete flow.
4. **Defaults are traps.** Figma's default drop shadow, default spacing, default everything — beginners ship them; pros tune them.
5. **Feedback is part of the UI.** A button that doesn't acknowledge the click is broken, even if the code works.
6. **Aesthetics serve communication.** The Dribbble chart loses to the boring chart because the goal is information transfer, not portfolio screenshots.

## Quotables

> _"These are things you will miss if you don't plan out your flow, but users, they'll feel it instantly."_

> _"Most of the time, less visual noise equals a better design."_

> _"Especially on mobile screens, you'll need more space than you think."_

> _"It is okay to have different styles of icons in the same design, but only if they're visually separate."_

> _"Definitely less aesthetic, but conveys so much more useful information to the user."_

## How BuildOS uses this

This source informs how the [`ui-ux-quality-review`](/agent-skills/ui-ux-quality-review) skill audits flow, consistency, feedback, and charts. Specific applications:

- **The 10px corner-radius rule** — apply uniformly across atom-level components (buttons, chips, search bars, cards) for instant cohesion.
- **The shadow recipe** — light-gray shadow color + heavy blur (or no shadow) instead of black-with-low-opacity. Worth auditing existing components for harsh defaults.
- **The Dribbble-chart trap** — the admin analytics dashboard should prioritize readable axes over aesthetic bars.
- **Save → badge dot** pattern — saving a brain dump or completing a task could trigger a small badge on the related tab to confirm the system state changed.
- **Tooltip-on-ambiguous-icons** — onboarding-cost insurance for any icon-only nav element.
- **The flow audit** — every onboarding/intake form should have a skip path and an "other" search escape.

## Related

- Skill: [`ui-ux-quality-review`](/agent-skills/ui-ux-quality-review) — encodes these patterns as agent-runnable checks.
- Companion source analysis: [The 4-Pixel Rule: Lessons from DesignSpo](/blogs/source-analyses/designspo-golden-rule-web-design) — the underlying spacing math.
- Source channel: [Kole Jain on YouTube](https://www.youtube.com/@KoleJain).
