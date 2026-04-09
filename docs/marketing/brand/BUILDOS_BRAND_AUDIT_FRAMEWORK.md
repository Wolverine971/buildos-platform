---
title: 'BuildOS Brand Audit Framework'
created: 2026-04-08
status: current
owner: DJ Wayne
related_docs:
    - /docs/marketing/brand/BUILDOS_BRAND_ARCHITECTURE.md
    - /docs/marketing/brand/brand-guide-1-pager.md
    - /docs/marketing/strategy/buildos-guerrilla-content-doctrine.md
path: docs/marketing/brand/BUILDOS_BRAND_AUDIT_FRAMEWORK.md
---

# BuildOS Brand Audit Framework

## Purpose

This is the working system for auditing BuildOS messaging, design, and campaign surfaces against the canonical brand architecture.

Use it to:

- identify drift
- prioritize fixes
- separate source-of-truth from legacy material
- keep future launches aligned

---

## Audit Labels

Every surface should get one label.

| Label           | Meaning                                                                                            | Action                                         |
| --------------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| **Canonical**   | Source-of-truth document or flagship surface                                                       | Protect it and use it to govern other work     |
| **Aligned**     | Matches the current brand stack                                                                    | Keep                                           |
| **Translation** | Uses different wording for a specific audience or channel, but stays inside the brand architecture | Keep with clear scope                          |
| **Drift**       | Conflicts with category, tone, or visual direction                                                 | Rewrite                                        |
| **Legacy**      | Useful historical reference, but no longer current                                                 | Mark clearly and stop using as source-of-truth |
| **Retire**      | Should be removed or replaced                                                                      | Delete or replace                              |

---

## Audit Questions

### Copy

- Does this lead with the public category or with AI?
- Does it describe BuildOS as a serious tool or as a magic trick?
- Does it use the canonical promise?
- Does it over-explain the moat too early?
- Is it speaking to the right audience for the surface?

### Visual Design

- Does this feel like a working surface, not a dashboard demo?
- Does it use paper / ink / amber / semantic texture correctly?
- Is there glow, sparkle, rainbow gradient, or “AI magic” signaling?
- Does motion feel calm and tactile rather than flashy?
- Would the UI feel stronger if it were 20% plainer?

### Brand Role

- Is this a core surface, a channel translation, a campaign, or a technical explanation?
- Is the wording correct for that role?
- Is this trying to invent a new category?

---

## Audit Tiers

### Tier 0: Source Of Truth

These govern the rest:

- brand architecture
- brand guide
- marketing strategy
- guerrilla doctrine
- primary design system

### Tier 1: Highest-Impact Live Surfaces

These are the first places users feel the brand:

- homepage
- SEO defaults
- auth and onboarding
- brain-dump flow
- chat entry points
- primary public navigation and landing pages

### Tier 2: Current Marketing Surfaces

- social bios
- platform strategies
- campaign docs
- founder narrative assets
- social carousels

### Tier 3: Technical / Investor / Internal

- fundraising decks
- technical essays
- product architecture docs
- prompt identity docs

These can use more technical language, but they should still respect the hierarchy.

---

## Initial Findings In This Repo

### Canonical / Aligned

- `docs/marketing/strategy/buildos-marketing-strategy-2026.md`
- `docs/marketing/brand/brand-guide-1-pager.md`
- `docs/marketing/strategy/buildos-guerrilla-content-doctrine.md`
- `apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md`
- `apps/web/src/lib/styles/inkprint.css`

### Drift: Live Product Copy

- `apps/web/src/lib/components/SEOHead.svelte`
  Problem: default title / description still center AI project collaboration.
- `apps/web/src/lib/constants/seo.ts`
  Problem: site description still describes BuildOS as an AI-powered productivity platform.
- `apps/web/src/routes/+page.svelte`
  Problem: body copy still uses AI-powered productivity framing instead of thinking-environment framing.

### Drift: Live Product Visual Tone

- `apps/web/src/lib/components/onboarding/OnboardingModal.svelte`
  Problem: glow, sparkles, “AI-powered insights.”
- `apps/web/src/lib/components/brain-dump/DualProcessingResults.svelte`
  Problem: multi-color gradients, blur blobs, sparkle iconography, AI-demo energy.
- `apps/web/src/lib/components/brain-dump/ParseResultsDiffView.svelte`
  Problem: purple/pink gradient header and summary treatment.
- `apps/web/src/lib/components/chat/ContextSelectionScreen.svelte`
  Problem: rainbow-coded option cards and hover theatrics push the product toward polished AI-tool energy.
- `apps/web/src/routes/help/+page.svelte`
  Problem: scale-heavy hover patterns add unnecessary SaaS gloss.

### Translation / Needs Scope Clarification

- `docs/marketing/brand/AI_PROJECT_COLLABORATION_PIVOT.md`
  Keep only as experience or campaign framing, not company category.
- `docs/marketing/social-media/instagram/COLLABORATION_PIVOT_CAROUSEL.md`
  Keep as a campaign / format reference, not source-of-truth for top-level positioning.

### Legacy

- `docs/marketing/social-media/instagram-strategy.md`
  Problem: ADHD-heavy front door and blue/yellow visual system conflict with current doctrine.
- `docs/marketing/social-media/LINKEDIN_STRATEGY.md`
  Problem: older context-engineering-first framing is useful, but too technical to govern current brand.
- `docs/marketing/brand/BUILDOS_BRANDING_COPY_INDEX.md`
  Problem: documents a previous “AI project collaboration” cleanup; should not be treated as current canon.

---

## Remediation Order

### Phase 1: Lock The Core

1. finalize brand architecture
2. mark legacy docs clearly
3. update hub docs and reading order

### Phase 2: Fix First Contact

1. homepage
2. SEO defaults
3. auth / onboarding copy
4. public social bios

### Phase 3: Remove AI-Theater Visual Drift

1. onboarding
2. brain-dump result flows
3. chat entry surfaces
4. public marketing cards with hover theatrics

### Phase 4: Reconcile Campaign System

1. authors
2. YouTubers
3. founder-builders
4. ADHD as affinity lane, not company category

---

## Campaign Audit Template

Use this for every campaign before it ships.

### 1. Role

- core brand surface
- channel translation
- audience campaign
- pain campaign
- proof campaign
- founder-truth campaign

### 2. Audience

- who is this for
- what pain is named
- what proof is shown

### 3. Brand Check

- does it still sound like a thinking environment
- does it still sound like a serious tool
- does it avoid AI spectacle
- does it avoid making ADHD the only front door

### 4. Phrase Check

- which canonical phrase appears
- which secondary phrase appears
- is any phrase being misused as a category

### 5. Visual Check

- working surface or product demo
- tactile or flashy
- plainspoken or magical

---

## Ongoing Governance Rule

Before new copy or design work ships, answer:

1. What role is this surface playing?
2. Which phrase owns that role?
3. Is this helping the user work or trying to impress them?
4. Would simplifying it make it more trustworthy?

If the answer to the last question is yes, simplify it.
