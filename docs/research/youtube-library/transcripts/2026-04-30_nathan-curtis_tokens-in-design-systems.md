---
title: 'Tokens in Design Systems — 10 Tips to Architect & Implement Design Decisions (Nathan Curtis / EightShapes)'
source_type: article_reference
url: 'https://medium.com/eightshapes-llc/tokens-in-design-systems-25dd82d58421'
author: Nathan Curtis
publication: EightShapes (Medium)
upload_date: 2016-06-24
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
indexed_date: '2026-04-30'
last_reviewed: '2026-04-30'
transcribed_date: '2026-04-30'
path: docs/research/youtube-library/transcripts/2026-04-30_nathan-curtis_tokens-in-design-systems.md
---

# Tokens in Design Systems: 10 Tips to Architect & Implement Design Decisions

## Skill Combo Links

- [Product And Design Skill Combos](../skill-combo-indexes/PRODUCT_AND_DESIGN.md): Design system architecture review (proposed); Visual craft fundamentals; AI-era craft and quality moat

## Source

- **Author:** Nathan Curtis
- **Publication:** EightShapes (Medium)
- **Date:** 2016-06-24
- **URL:** https://medium.com/eightshapes-llc/tokens-in-design-systems-25dd82d58421

## Introduction

Curtis opens with a code review moment where he discovered that design tokens function as visible specifications readable by both designers and developers. He argues for "putting design back in" to code variables through tokens that propagate decisions across an entire system.

## Core Concept Evolution

### Variables to Tokens Progression

**Variables**: Store atomic, reusable code values (e.g., `$color-neutral-20`). They answer "What options do I have?" but lack decision-making context.

**Design Decisions**: Apply options to specific contexts. A decision answers "What choice do I make?" Example: applying `$color-neutral-20` to "dark background color" transforms it into actionable guidance.

**Design Tokens**: Decisions propagated systematically across products, platforms, and teams. Inspired by Salesforce's approach, tokens centralize design decisions in accessible formats rather than burying them in developer repositories.

## Architecting Tokens: 6 Key Principles

### #1: Show Options First, Then Decisions Next

Structure token files to reveal the progression from foundational options (available colors, fonts) to applied decisions (text-color, background-color). This teaches atomic thinking: "building from options to decisions and simple to complex."

### #2: Start with Color & Font, and Don't Stop There

Begin tokenizing with color and typography — the obvious candidates — but expand systematically to encompass spacing, sizing, borders, shadows, and other visual concerns. The architecture must grow alongside design language maturity.

### #3: Vary Options Across Meaningful Scales

Implement consistent scaling models (t-shirt sizing: XS, S, M, L, XL; geometric progressions like 2, 4, 8, 16, 32; or custom terminology). Scales enable branching hierarchies — for example, `space-inset` variants like `space-inset-squish` and `space-inset-stretch` that share the same size options.

**Key consideration**: Design scales resilient enough to insert intermediate steps without restructuring existing values.

### #4: Invite Contribution, but Curate the Collection

Curtis proposes a "used three times" threshold for token candidacy. While any team member can propose tokens through reviews or Slack, designate a curator — someone architecturally minded — to maintain cleanliness. They scan proposals for naming precision, proper classification, and prevent excessive expansion.

### #5: Graduate Decisions from Components to Tokens

Encourage developers to stockpile component-specific variables at the top of style files (CSS/Stylus). This creates an inventory of token candidates. For example, form elements might use `$border-color-input-hover` (component-specific, poor token candidate) versus `$background-color-disabled` (reusable, strong token candidate). Regular review of these candidates prevents missed opportunities.

### #6: Cope with Systemic Change Predictably

Named tokens contain change risk better than generic variables. Searching for a generic `$color-neutral-20` across a codebase reveals unpredictable applications. Searching for `$text-color-microcopy` identifies precise, intentional usage — reducing refactoring risk and enabling confident systemic evolution.

## Implementing Tokens: 4 Technical Approaches

### #7: Make Token Data Reusable via JSON

Encode tokens in JSON — a hierarchical, platform-agnostic format. This enables transformation into multiple preprocessor formats (Sass, Stylus, Less), bridges to iOS/Android (with XML conversion), and ensures no technology locks teams into a single tool.

### #8: Manage & Read Token Data Easily via YAML

JSON's verbosity, syntax sensitivity, and lack of comment support make it difficult for manual curation — especially for designers unfamiliar with code. YAML solves this: readable, supports variables and comments, and remains hierarchical. Curtis's team uses `yamljs` to transform YAML into JavaScript objects during build processes, lowering barriers for designers to contribute pull requests directly.

### #9: Automate Documentation with Token Data

Thread token data structures into living style guide templates to power reference sections, themed component demonstrations, and accessibility scoring displays. This ensures documentation reflects actual system decisions and stays synchronized with implementation.

### #10: Embed Token Data in Design Tools Too

Extend tokens into design software (Sketch, Photoshop, InDesign) via plugin integration. Tools like InVision Craft consume JSON, creating a bridge between system source-of-truth and designer tools. While setup costs exist, mature systems justify the investment.

## Conclusion

Curtis frames tokens as a communication artifact unifying design and development language. Named tokens — meaningful and specific — enable confident collaboration across disciplines, making system maintenance predictable and cohesive outcomes achievable.
