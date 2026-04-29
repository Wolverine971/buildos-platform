---
title: '7 Rules for Creating Gorgeous UI — Part 1 (Erik Kennedy / Learn UI Design)'
source_type: article_reference
url: 'https://www.learnui.design/blog/7-rules-for-creating-gorgeous-ui-part-1.html'
author: Erik D. Kennedy
publication: Learn UI Design
upload_date: 2024-06-01
library_category: product-and-design
library_status: 'transcript'
transcript_status: available
analysis_status: missing
processing_status: needs_analysis
processed: false
buildos_use: both
skill_candidate: true
skill_priority: high
skill_draft: ''
public_article: ''
indexed_date: '2026-04-29'
last_reviewed: '2026-04-29'
transcribed_date: '2026-04-29'
---

# 7 Rules for Creating Gorgeous UI (2024 Update) — Part 1

## Skill Combo Links

- [Product And Design Skill Combos](../skill-combo-indexes/PRODUCT_AND_DESIGN.md): UI/UX quality review (extension); Visual craft fundamentals (proposed); AI UI slop detector and rewrite (proposed)

## Source

- **Title:** 7 Rules for Creating Gorgeous UI (2024 Update) — Part 1
- **Author:** Erik D. Kennedy
- **Publication:** Learn UI Design
- **URL:** https://www.learnui.design/blog/7-rules-for-creating-gorgeous-ui-part-1.html

## Introduction

This guide targets developers and UX designers seeking to improve their UI design capabilities through practical, analytical methods rather than art theory. The author emphasizes learning through deliberate practice and studying successful designs rather than intuitive aesthetic understanding.

## Rule 1: Light Comes From the Sky

**Core Principle:** Shadows and lighting effects communicate depth and hierarchy in flat interfaces by mimicking how light naturally illuminates objects from above.

### Key Concepts

Light from above creates specific visual cues:

- Tops of elements appear lighter (reflecting more light)
- Bottoms appear darker (shadowed areas)
- This mimics real-world perception where unnatural lighting (from below) appears unsettling

### Button Lighting Effects Example

A standard button demonstrates four light-related details:

1. Dark bottom edge on unpressed buttons
2. Slightly brighter top surface (curved surface illusion)
3. Subtle shadow beneath the button
4. Overall darker appearance when pressed (as if hand blocks light)

### Inset vs. Outset Elements

**Generally Inset** (recessed, receiving less light):

- Text input fields
- Pressed buttons
- Slider tracks
- Unselected radio buttons
- Checkboxes

**Generally Outset** (protruding, catching light):

- Unpressed buttons
- Slider buttons
- Dropdown controls
- Cards
- Selected radio button portions
- Popups

### The Flat Design Consideration

Flat design (introduced 2014) removed simulated depth, but complete removal of shadows reduced usability and information conveyance. Current practice uses "flatty design" — minimalist appearance with subtle shadows for clarity.

**Key insight:** "Higher surfaces are brighter — because they catch more of the sun's rays." Color variations convey height alongside minimal shadow effects.

---

## Rule 2: Black and White First

**Core Principle:** Design in grayscale before adding color to prioritize spacing, layout, and structure over chromatic decisions.

### Strategic Benefits

This constraint-based approach:

- Forces focus on spacing and arrangement (primary design concerns)
- Simplifies the most complex visual design element (color)
- Keeps designs clean and simple
- Prevents excessive color usage from creating visual chaos

### Color Application Process

**Step 1:** Complete design in black and white

**Step 2: Minimal Color Addition**

- Start with single-color accent additions (most effective method)
- Advance to two colors or multiple saturation levels of one hue
- Avoid overwhelming the design with excessive colors

### HSB Color System

Rather than RGB hex codes, use HSB (Hue, Saturation, Brightness) thinking:

- Aligns with natural color perception
- Allows predictable color modifications
- Single-hue designs: modify saturation and brightness for variety

**Single-hue approach generates:** darks, lights, backgrounds, accents, eye-catchers while maintaining visual harmony.

### Color Limitation Strategy

> "Using multiple colors from one or two base hues is the most reliable way to accentuate and neutralize elements without making the design messy."

---

## Rule 3: Double Your Whitespace

**Core Principle:** Abundant spacing between elements creates the appearance of thoughtful, polished design.

### HTML Default Problem

Unstyled HTML produces cramped layouts: small fonts, minimal line spacing, content stretched edge-to-edge. This aesthetic approach requires intentional spacing additions.

### Spacing Methodology

Shift mental model: treat whitespace as default; remove it intentionally rather than adding it as afterthought.

### Practical Spacing Examples

**Music player concept** demonstrates generous spacing:

- Menu items: vertical space equals **twice the text height**
- List titles: **15px space between title and underline** (exceeds font cap height)
- 25 pixels between different lists
- Top navigation: text occupies only 20% of bar height; icons similarly proportioned

### Spacing Benefits

Adequate whitespace applies across contexts:

- Forum designs appear inviting and simple
- Wikipedia redesigns look approachable despite complexity
- Messy interfaces become visually palatable

### Spacing Guidelines

Apply spacing at multiple hierarchical levels:

1. Between lines of text
2. Between individual elements
3. Between element groupings
