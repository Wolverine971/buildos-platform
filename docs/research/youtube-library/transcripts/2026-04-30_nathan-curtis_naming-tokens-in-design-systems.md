---
title: 'Naming Tokens in Design Systems — Terms, Types, and Taxonomy (Nathan Curtis / EightShapes)'
source_type: article_reference
url: 'https://medium.com/eightshapes-llc/naming-tokens-in-design-systems-9e86c7444676'
author: Nathan Curtis
publication: EightShapes (Medium)
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
path: docs/research/youtube-library/transcripts/2026-04-30_nathan-curtis_naming-tokens-in-design-systems.md
---

# Naming Tokens in Design Systems: Terms, Types, and Taxonomy

## Skill Combo Links

- [Product And Design Skill Combos](../skill-combo-indexes/PRODUCT_AND_DESIGN.md): Design system architecture review (proposed); Visual craft fundamentals

## Source

- **Author:** Nathan Curtis
- **Publication:** EightShapes (Medium)
- **URL:** https://medium.com/eightshapes-llc/naming-tokens-in-design-systems-9e86c7444676

## Overview

Curtis's essay establishes a comprehensive framework for organizing design token names across design systems. The piece addresses how teams can create shared vocabulary for visual style decisions that span design tools, code, and documentation.

## Core Structure: Four Level Groups

Curtis organizes token levels into four primary groupings:

**Base Levels** form the backbone:

- _Category_ (e.g., `color`, `font`, `space`)
- _Property_ (e.g., `text`, `background`, `size`)
- _Concept_ (e.g., `feedback`, `action`, `heading`)

**Modifiers** distinguish specific applications:

- _Variant_ (e.g., `primary`, `secondary`, `success`)
- _State_ (e.g., `hover`, `focus`, `disabled`)
- _Scale_ (enumerated, ordered, bounded, proportional, or t-shirt sizes)
- _Mode_ (typically `light`/`dark` surface contexts)

**Object Levels** scope tokens to specific uses:

- _Component group_ (e.g., `forms`)
- _Component_ (e.g., `input`, `button`)
- _Element_ (nested parts like `left-icon`)

**Namespace Levels** establish scope:

- _System_ name or acronym (e.g., `esds`, `slds`)
- _Theme_ (e.g., `ocean`, `courtyard`)
- _Domain_ (e.g., `consumer`, `retail`)

## Key Principles

**Avoid homonyms**: Terms like "type" and "text" create ambiguity across contexts. Curtis recommends "font" over "typography" for length considerations.

**Homogeneity within, heterogeneity between**: Group similar concepts together while keeping distinct purposes separate. Don't conflate `visualization` colors with `commerce` colors despite potential overlap.

**Flexibility vs. specificity trade-off**: Generic tokens like `$color-success` offer reusability but sacrifice precision. Including properties like `$color-background-success` adds clarity at the cost of flexibility.

**Explicit vs. truncated defaults**: Systems may assume default "light" mode and only append `on-dark` modifiers, or maintain parallel construction with both variants explicit.

**Start local, promote gradually**: Identify component-specific tokens locally first, then promote to global scope only when 3+ components share the need. This avoids premature globalization and unnecessary namespace pollution.

**Theme ≠ Mode**: Themes (brand variations) operate orthogonally to color modes (light/dark). Both can coexist in sophisticated systems.

## Common Categories and Variants

**Color concepts** include:

- `feedback` (success, warning, error, information)
- `action` (primary, secondary, tertiary)
- `visualization` (charting, data patterns)
- `commerce` (sale, clearance, inventory)

**Typography concepts** include:

- `heading` (levels 1-5)
- `body` (s, m, l sizes)
- Special cases like `eyebrow` or `lead`

**Interactive states** cover:

- `default`, `hover`, `press`/`active`, `focus`, `disabled`, `visited`, `error`

**Scale types** encompass:

- Enumerated (heading levels)
- Ordered (Material's 50-900 spectrum)
- Bounded (lightness 0-100)
- Proportional (1-x, 2-x, half-x multipliers)
- T-shirt sizing (s, m, l, xl)

## Naming Conventions Across Systems

Curtis surveys six prominent systems' approaches to a single concept — primary action hover color:

Different systems apply levels in varying depths, orders, and specificity. Bloomberg, Salesforce, Orbit, Morningstar, Infor, and Adobe each structure the same semantic meaning differently, illustrating the lack of universal convention.

## Order Patterns (Non-Binding)

While no prevailing order exists, Curtis observes tendencies:

- Namespaces prepend first
- Base levels occupy the middle
- Modifiers typically append last
- Object levels establish subordinate context
- Mode modifiers often conclude

## Polyhierarchy and Aliasing

When the same decision appears in multiple classification schemes, Curtis advocates storing it once then aliasing across contexts. Example: `$ui-controls-color-text-error = $color-feedback-error`. This maintains semantic completeness while preventing duplication and hedging against future divergence.

## Completeness Principle

No token requires all possible levels. Avoid redundantly duplicating tuples with unnecessary modifiers. Include only levels sufficient to distinguish intentional design decisions.

**Bad example**: `$esds-shape-tile-corner-radius-default-on-light` and `$esds-shape-tile-corner-radius-default-on-dark` when the property doesn't vary by mode.

**Good example**: `$esds-shape-tile-corner-radius` (concise, sufficient).

## Practical Workflow

Curtis recommends emergent practices:

1. Define tokens locally within component specs or stylesheets
2. Identify patterns across multiple components
3. Promote shared decisions to global token collections
4. Update all references to use the promoted token
5. Remove redundant local declarations

This gradualist approach prevents debate about premature abstraction while establishing natural consensus around truly shared patterns.
