---
title: 'Don Norman — Signifiers, Affordances, and Design (Essay Summaries from JND.org)'
source_type: article_reference
url: 'https://jnd.org/'
author: Don Norman
publication: JND.org
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
path: docs/research/youtube-library/transcripts/2026-04-30_don-norman_signifiers-and-affordances-essay-summaries.md
---

# Don Norman — Signifiers, Affordances, and Design

## Skill Combo Links

- [Product And Design Skill Combos](../skill-combo-indexes/PRODUCT_AND_DESIGN.md): Information architecture and interaction fundamentals (proposed); UI/UX quality review

## Source Note

> **Source coverage is summary-level.** Don Norman's canonical essays at JND.org are copyrighted (originally published in ACM _Interactions_) and the WebFetch service refused full reproduction. This document is a synthesis of (a) explicit summary content returned by WebFetch and WebSearch, and (b) widely-documented canonical material from _The Design of Everyday Things_ and Norman's interaction-design teaching that aligns with the source essay arguments. Direct citations are flagged. Read alongside the original essays at the URLs below.

## Canonical Norman Essays at JND.org

| Essay                                       | URL                                                       | Coverage                                                                   |
| ------------------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------- |
| Affordances and Design                      | https://jnd.org/affordances-and-design/                   | Norman's clarification post-DOET: "perceived affordance" matters in design |
| Signifiers, not affordances                 | https://jnd.org/signifiers-not-affordances/               | The 2008 ACM _Interactions_ essay introducing the signifier concept        |
| Affordance, Conventions and Design (Part 2) | https://jnd.org/affordance-conventions-and-design-part-2/ | Historical context with Gibson; conventions vs affordances                 |
| Design as Communication                     | https://jnd.org/design-as-communication/                  | Signifiers and affordances in physical vs virtual contexts                 |
| Looking Back, Looking Forward               | https://jnd.org/looking-back-looking-forward/             | Norman re-emphasizes the affordance-vs-signifier distinction               |

## Key Concepts (Source-Attributed)

### Affordance (Gibson's original definition)

> "The word 'affordance' was originally invented by the perceptual psychologist J.J. Gibson (1977, 1979) to refer to the actionable properties between the world and an actor (a person or animal)." — Norman, "Affordances and Design"

An affordance is a relationship between an object's properties and an actor's capabilities — not a feature of the object alone. A chair affords sitting because chairs have a sittable property and humans have the capability to sit.

### Perceived Affordance (Norman's design contribution)

In design, what matters is not whether an action is objectively possible, but whether the user **perceives that some action is possible**. Norman's contribution to design discourse was distinguishing _perceived_ affordances from _real_ affordances. A touchscreen and a non-touchscreen both _afford_ touching; only one provides meaningful feedback when touched.

### Signifier (Norman's later refinement)

> "A 'signifier' is some sort of indicator, some signal in the physical or social world that can be interpreted meaningfully." — Norman, "Signifiers, not affordances"

Norman concluded that "perceived affordance" was muddling the conversation. He introduced **signifier** as the cleaner term for what designers actually need to attend to: signs, perceptible signals, of what can be done.

- **Affordance** = what actions are possible (a property of the relationship)
- **Signifier** = how people discover those possibilities (a perceptible cue)

### The Designer's Job

> "Affordances determine what actions are possible. Signifiers communicate where the action should take place." — widely cited from Norman's IxDF essay

A flat plate on a door _signifies_ pushing. A handle _signifies_ pulling. A scroll bar's position _signifies_ a scrolling-related action. Most digital interface design is signifier work, not affordance work — designers cannot change what the touchscreen affords, but they choose the signifiers that reveal how to use it.

## Norman's Four Principles for Screen Interfaces

From "Affordances and Design" (2008 / 2013 update):

1. **Follow conventions** in imagery and interactions. Designers often conflate affordances with cultural conventions and constraints. Scroll bar placement and behavior are learned conventions, not inherent affordances — arbitrary but effective design choices that should be honored.

2. **Use words** to label actions explicitly. Where signifiers are weak or ambiguous, language disambiguates.

3. **Apply metaphors** cautiously. Metaphors guide initial understanding but break down at scale; don't lean on them past their useful range.

4. **Maintain coherent conceptual models** so learning transfers across interface elements. A user who learns one part of the system should be able to predict how the rest will behave.

## The Two Pillars of Good Design (DOET / Norman canon)

> "The two most important features of good design are discoverability and understanding."

- **Discoverability**: Can the user figure out what actions are possible and where to perform them?
- **Understanding**: Once discovered, can the user form a correct mental model of how the system works?

Discoverability fails when signifiers are absent or misleading. Understanding fails when the conceptual model is incoherent or hidden.

## Norman's Seven Stages of Action (DOET canon)

The Norman model for how users interact with any product:

1. Forming the goal (what do I want to achieve?)
2. Forming the intention (what do I want to do?)
3. Specifying an action (how do I do it?)
4. Executing the action (do it)
5. Perceiving the state of the world (what happened?)
6. Interpreting the state (what does it mean?)
7. Evaluating the outcome (did it match my goal?)

Two "gulfs" can break this:

- **Gulf of Execution**: when the system makes it hard to figure out how to act on intention
- **Gulf of Evaluation**: when the system makes it hard to interpret what happened after the action

Designers reduce the gulfs by improving signifiers (execution) and feedback (evaluation).

## Norman's Three Levels of Emotional Design (from _Emotional Design_, 2003)

Cross-reference with calm-software / delightful-product schools:

- **Visceral**: immediate, sensory, pre-conscious response
- **Behavioral**: usability, performance, learnability
- **Reflective**: meaning, identity, story-telling about the product

Calm software emphasizes the behavioral level (clean usability) and the reflective level (the product reflects values the user wants to see in themselves). Delightful products emphasize the visceral level (immediate sensory pleasure) and the reflective level (social-emotional motivators — proud, cool, connected).

## Application Notes

Norman's framework is the foundational layer underneath every other product-and-design skill in this index:

- `ui-ux-quality-review` and `visual-craft-fundamentals` operate at the **signifier** level (style as signal).
- `accessibility-and-inclusive-ui-review` formalizes signifier semantics for screen-reader users (every actionable element must have a perceivable cue, in a non-visual modality).
- `calm-software-design-review` and `delightful-product-review` operate at Norman's **reflective and behavioral** levels.
- `customer-discovery-through-switching-forces` (PRODUCT_STRATEGY) intersects Norman's **goal formation** stage.
