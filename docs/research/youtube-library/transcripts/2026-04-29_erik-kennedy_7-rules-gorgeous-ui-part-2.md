---
title: '7 Rules for Creating Gorgeous UI — Part 2 (Erik Kennedy / Learn UI Design)'
source_type: article_reference
url: 'https://www.learnui.design/blog/7-rules-for-creating-gorgeous-ui-part-2.html'
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

# 7 Rules for Creating Gorgeous UI — Part 2

## Skill Combo Links

- [Product And Design Skill Combos](../skill-combo-indexes/PRODUCT_AND_DESIGN.md): UI/UX quality review (extension); Visual craft fundamentals (proposed); AI UI slop detector and rewrite (proposed)

## Source

- **Title:** 7 Rules for Creating Gorgeous UI — Part 2
- **Author:** Erik D. Kennedy
- **Publication:** Learn UI Design
- **URL:** https://www.learnui.design/blog/7-rules-for-creating-gorgeous-ui-part-2.html

## Rule 4: Learn the Methods of Overlaying Text on Images

Text placement over images requires specific technical approaches. The guide outlines six methods:

### Method 0: Direct Text on Image

Apply text directly without overlay. Requirements: dark image with minimal contrast edges, white text only, testing at all screen sizes. Generally not recommended for professional work.

### Method 1: Overlay the Whole Image

Apply translucent black across the entire image. Example: "The Upstart Website has a 35% opacity black filter." Works particularly well for thumbnails and when original images lack sufficient contrast.

### Method 2: Text-in-a-Box

Place white text inside a semi-transparent black rectangle. Highly reliable — maintains legibility regardless of underlying image. Colored boxes are possible but require restraint.

### Method 3: Blur the Image

Blur portions beneath text to improve readability. "iOS does a ton of background blurring." Can use out-of-focus photograph areas, though this method requires careful image consistency.

### Method 4: Floor Fade

Gradient fades toward black at image bottom while remaining transparent at center. Creates subtle legibility enhancement. "Medium collections use a slight text shadow to further increase legibility." Connects to Rule 1 — light naturally comes from above.

Advanced variation: "The floor blur" combines blur with fade technique.

### Bonus Method: Scrim

Elliptical gradient transitioning from translucent black (center) to transparent black (edges), positioned behind white text. Described as "probably the most subtle way of reliably overlaying text on images."

---

## Rule 5: Make Text Pop — and Un-pop

Text styling uses contrast across multiple dimensions:

**Available styling tools:**

- Size (larger/smaller)
- Color (higher/lower contrast; bright colors draw attention)
- Font weight (bold/thin)
- Capitalization (lowercase, UPPERCASE, Title Case)
- Italicization
- Letter spacing (tracking)
- Margins

Not recommended: underlining (implies links), text background color, strikethrough.

### Up-Pop and Down-Pop Concept

Styles divide into two categories:

- **Up-pop**: increases visibility (big, bold, capitalized, high-contrast)
- **Down-pop**: decreases visibility (small, low-contrast, thin weight)

> "Page titles are the only element to style all-out up-pop. For everything else, you need up-pop and down-pop."

**Key principle**: Combine competing properties. Emphasized elements should use more up-pop styles than down-pop, but both should be present. Example from Blu Homes: large numbers paired with "very light font-weight and lower-contrast color."

### Selected and Hovered Styles

Changing size, case, or weight during interaction risks layout shift. Better alternatives:

- Text color changes
- Background color shifts
- Shadows
- Slight animations (raising/lowering)

Strategy: "Turn white elements colored, or turn colored elements white, but darken the background behind them."

---

## Rule 6: Use Only Good Fonts

Focus on clean, simple, neutral fonts suitable for professional UI design. Four recommended free fonts:

### 1. Satoshi

From Indian Type Foundry's FontShare. Features quirky "a" and "g" glyphs while maintaining modern simplicity. Modern, friendly aesthetic.

### 2. Metropolis

Homage to Gotham and Proxima Nova. "Sturdy and simple" with capability for bold without aggression. Remains underused on web.

### 3. Source Sans

Humanist sans-serif with handwriting-based letterforms. Paired with "slight negative letter-spacing" of -1%, it achieves clean, considered appearance. Offers related Source Serif and Source Code variants.

### 4. Figtree

Author-designed font filling gap in free offerings. "Clean-yet-casual" appearance with rounded, playful features while maintaining neutrality.

### Font Resources

- **Google Fonts**: Largest free font source, though requires filtering
- **FontShare**: Lesser-known quality fonts via Indian Type Foundry
- **Adobe Fonts**: Premium access for Creative Cloud subscribers; recommended: Proxima Nova, Adelle Sans, DIN, Freight Text
- **Good Fonts Table**: Bonus database of 100+ fonts organized by category with usage notes

---

## Rule 7: Steal Like an Artist

> "Every artist should be a parrot until they're good at mimicking the best. Then go find your own style."

### Recommended Resources (Ranked)

**1. Dribbble**
Invitation-only design showcase with "bar-none the highest quality of UI work online." Recommended designers:

- Jamie Syke: "Posting new UI basically all the time" with consistent quality
- Balkan Brothers: Exceptional color and gradient work; maintain interest in flat design
- Elegant Seagulls: Alternatives to standard Bootstrap grids
- Cosmin Capitanu: Futuristic without garishness; strong color sense

**2. Layers**
Work-sharing platform attempting to dethrone Dribbble as primary UI design showcase.

**3. Mobbin**
Directory of 300,000+ mobile app screenshots filterable by UX pattern or interface element (login pages, user profiles, search results, etc.). Enables rapid research of specific interface components.

---

## Conclusion

The author emphasizes these rules require "observation, imitation, and telling your friends what works" rather than formal art school training.
