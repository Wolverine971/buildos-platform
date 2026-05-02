---
title: 'UI/UX Quality Review: An Agent Skill For Product Interface Audits'
description: 'A source-lineaged agent skill for reviewing product screens, landing pages, dashboards, and mobile flows for flow, hierarchy, spacing, consistency, feedback, and responsive polish.'
author: 'DJ Wayne'
date: '2026-05-02'
lastmod: '2026-05-02'
changefreq: 'monthly'
priority: '0.9'
published: true
tags:
    [
        'agent-skills',
        'ui-ux',
        'design-review',
        'product-design',
        'interface-quality',
        'product-and-design',
        'buildos'
    ]
readingTime: 10
excerpt: 'A practical UI/UX review skill for agents: check flow before pixels, rank hierarchy before styling, enforce spacing and type systems, then add delight only when the foundation works.'
skillId: 'product-and-design/ui-ux-quality-review'
skillType: 'combo'
skillCategory: 'product-and-design'
providers: ['YouTube source analysis', 'BuildOS YouTube library']
compatibleAgents: ['BuildOS-compatible agents', 'Claude Code', 'Codex', 'portable Agent Skills']
stackWith:
    [
        'marketing-site-design-review',
        'visual-craft-fundamentals',
        'accessibility-and-inclusive-ui-review',
        'delightful-product-review'
    ]
skillSource: 'docs/research/youtube-library/skill-drafts/ui-ux-quality-review/SKILL.md'
lineagePath: 'docs/research/youtube-library/skill-drafts/ui-ux-quality-review/lineage.yaml'
lineagePeople:
    - 'Kole Jain'
    - 'Nesrine Changuel'
    - 'Lenny Rachitsky'
lineageStats:
    sources: 7
    primitives: 9
    sourceClaims: 10
    edges: 24
    candidateV2Sources: 3
lineageSources:
    - title: "7 UI/UX mistakes that scream you're a beginner"
      creator: 'Kole Jain'
      creatorType: 'Person'
      creatorUrl: 'https://www.youtube.com/@KoleJain'
      channelName: 'Kole Jain'
      channelUrl: 'https://www.youtube.com/@KoleJain'
      sourceType: 'youtube_video'
      url: 'https://www.youtube.com/watch?v=AH_ugxmLeUM'
    - title: 'Every UI/UX Concept Explained in Under 10 Minutes'
      creator: 'Kole Jain'
      creatorType: 'Person'
      creatorUrl: 'https://www.youtube.com/@KoleJain'
      channelName: 'Kole Jain'
      channelUrl: 'https://www.youtube.com/@KoleJain'
      sourceType: 'youtube_video'
      url: 'https://www.youtube.com/watch?v=EcbgbKtOELY'
    - title: 'The Complete Guide To Visual Hierarchy'
      creator: 'DesignSpo'
      creatorType: 'Organization'
      creatorUrl: 'https://www.youtube.com/@DesignSpo'
      channelName: 'DesignSpo'
      channelUrl: 'https://www.youtube.com/@DesignSpo'
      sourceType: 'youtube_video'
      url: 'https://www.youtube.com/watch?v=kK1TOpI948o'
    - title: 'The ULTIMATE Guide To Typography For Beginners'
      creator: 'DesignSpo'
      creatorType: 'Organization'
      creatorUrl: 'https://www.youtube.com/@DesignSpo'
      channelName: 'DesignSpo'
      channelUrl: 'https://www.youtube.com/@DesignSpo'
      sourceType: 'youtube_video'
      url: 'https://www.youtube.com/watch?v=AXpxZMRM1EY'
    - title: 'The ULTIMATE Color Theory Guide For Beginners'
      creator: 'DesignSpo'
      creatorType: 'Organization'
      creatorUrl: 'https://www.youtube.com/@DesignSpo'
      channelName: 'DesignSpo'
      channelUrl: 'https://www.youtube.com/@DesignSpo'
      sourceType: 'youtube_video'
      url: 'https://www.youtube.com/watch?v=tKCORDK0IZU'
    - title: 'The Golden Rule Of Web Design'
      creator: 'DesignSpo'
      creatorType: 'Organization'
      creatorUrl: 'https://www.youtube.com/@DesignSpo'
      channelName: 'DesignSpo'
      channelUrl: 'https://www.youtube.com/@DesignSpo'
      sourceType: 'youtube_video'
      url: 'https://www.youtube.com/watch?v=CASPWJUsHPM'
    - title: 'A 4-step framework for building delightful products'
      creator: 'Nesrine Changuel'
      creatorType: 'Person'
      channelName: "Lenny's Podcast"
      channelUrl: 'https://www.youtube.com/@LennysPodcast'
      sourceType: 'youtube_video'
      url: 'https://www.youtube.com/watch?v=tX6nwT1Bsuo'
path: apps/web/src/content/blogs/agent-skills/ui-ux-quality-review.md
---

# UI UX Quality Review

Use this skill when an agent needs to review a product screen, landing page, dashboard, or mobile flow for practical quality issues. The review focuses on flow, clarity, consistency, feedback, and communication before decorative polish.

The key discipline is sequencing. The agent should not start by asking whether the interface is pretty. It should ask whether the user can complete the job, whether the screen has a visible hierarchy, whether components behave consistently, and whether the UI responds to user action.

## Skill Composition

This is a combo skill distilled from Kole Jain, DesignSpo, and Nesrine Changuel source layers.

| Primitive                      | Job                                                                                   | Primary source layer          |
| ------------------------------ | ------------------------------------------------------------------------------------- | ----------------------------- |
| Flow and states review         | Check completion, recovery, empty, loading, error, skip, and no-result states.        | Kole Jain                     |
| Visual hierarchy ranking       | Decide what is first, second, and third in primacy before styling.                    | DesignSpo hierarchy           |
| Spacing and layout system      | Audit gaps, padding, type sizes, and containers against a consistent scale.           | DesignSpo golden rule         |
| Typography system review       | Review type roles, line height, letter spacing, contrast, and face choice.            | DesignSpo typography          |
| Color and contrast review      | Check proportions, semantics, contrast, dark-mode saturation, and palette balance.    | DesignSpo color theory        |
| Component consistency review   | Normalize same-type components and remove accidental variation.                       | Kole Jain + DesignSpo         |
| Feedback and affordance review | Check states, icons, labels, tooltips, and microinteractions.                         | Kole Jain                     |
| Responsive fit review          | Verify controls, text, repeated items, and charts fit on mobile and desktop.          | Kole Jain + BuildOS synthesis |
| Delight and anti-delight audit | Identify valley moments, useful delight, surface-only decoration, and inclusion risk. | Nesrine Changuel              |

## When To Use

- Review a product screen, landing page, dashboard, or mobile flow.
- Diagnose why a UI feels amateur, cluttered, or hard to trust.
- Improve visual hierarchy, spacing, typography, color, icons, or interaction states.
- Audit charts and data visualization.
- Give design feedback to a developer or founder.
- Turn a rough wireframe into a more polished screen.

Do not use this skill as a full brand strategy process, visual identity exploration, or WCAG-specific accessibility audit. Pair it with a dedicated accessibility skill when semantics, keyboard behavior, or screen-reader behavior matter.

## Review Order

1. **Flow before pixels.** Check whether the user can complete the job, escape, skip, search, recover from errors, and handle empty or loading states.
2. **Hierarchy.** Identify the most important thing on screen. Make size, position, weight, color, imagery, and spacing agree with that priority.
3. **Spacing.** Look for cramped groups, inconsistent padding, and mobile layouts that need more breathing room.
4. **Consistency.** Reuse component patterns, radius, spacing, icon style, and button treatment for the same job.
5. **Visual noise.** Remove effects, strokes, arrows, gradients, shadows, and decorations that do not communicate.
6. **Icons and labels.** Use one icon family within a region. Add labels or tooltips for ambiguous icons.
7. **Feedback.** Check hover, active, focus, disabled, loading, success, error, warning, and saved states.
8. **Charts.** Prefer readable axes and honest data communication over portfolio aesthetics.
9. **Responsive fit.** Verify text, controls, and repeated items fit on mobile and desktop without overlap.

## Practical Heuristics

- Plan flows before designing screens.
- Every onboarding or setup flow needs skip, other, no-result, and recovery paths where relevant.
- Mobile needs more whitespace than most teams expect.
- Use one primary font unless the design system says otherwise.
- Use color for meaning: success, warning, danger, focus, trust, selection, or category.
- In dark mode, create depth with surface contrast, not harsh borders or black shadows.
- If the shadow is the first thing noticed, it is too strong.
- Icons should generally match the text line height around them.
- Every user action needs a visible response.
- Microinteractions should confirm an action, not decorate the page at random.

## Foundational Rules

Run these as concrete checks after the qualitative review.

### Hierarchy

Rank before style. Decide what is first, second, and third in primacy before picking sizes, fonts, or colors.

Keep one primary element, a few secondary elements, and make the rest uniform. If everything is loud, nothing stands out.

Use contrast levers intentionally. Beginners reach for size and color first, but hierarchy can also come from motion, task-relevant information, whitespace, imagery, faces, weight, and position.

Same-type components should share values: image size, font, weight, line height, border, radius, and padding.

### Typography

Use one hierarchy with four practical roles: headings, paragraphs, buttons, and labels.

Set line height by role. Big headlines can sit close to 1.0x. Body text usually needs around 1.5x. Do not trust browser defaults blindly.

Letter spacing should match size and weight. Buttons and small uppercase labels usually need more spacing than large body text.

Use rem on the web so user zoom does not break layout.

### Color

Reason in HSB when selecting color, then ship in hex or RGB.

Use the 60/30/10 proportion rule: dominant ground, secondary support, and accent only for focal points.

Reject pop-psychology color shortcuts. Color reads through context, connotation, relationship, and culture.

Warm hues advance; cool hues recede. Use that intentionally.

Dark-mode accents usually need lower saturation than light-mode accents.

### Spacing

Use a 4-pixel-derived system for spacing, padding, gaps, widths, and font sizes.

Closed spacing scale:

```txt
4, 8, 12, 16, 24, 32, 48, 64, 96
```

Common assignments:

- 4px inside composite elements, like icon plus label.
- 8px inside list items.
- 16px inside components.
- 24px between components.
- 32px or more between sections.

If the screen depends on 13px, 27px, or "looks about right," the agent should flag it.

## Delight Layer

Run this only after the foundational review. Delight does not rescue broken flow.

Use three questions:

1. Does this remove friction at a valley moment?
2. Does this anticipate a need the user recognizes as theirs?
3. Does this exceed expectations after the need is anticipated?

Then classify the proposed delighter:

| Type            | Solves functional need? | Solves emotional need? | Verdict                                                |
| --------------- | ----------------------- | ---------------------- | ------------------------------------------------------ |
| Low delight     | Yes                     | No                     | Fine for most of the product.                          |
| Surface delight | No                      | Yes                    | Use sparingly, only when the moment has weight.        |
| Deep delight    | Yes                     | Yes                    | Best target. The feature works and honors the emotion. |

Reject delight that creates inclusion risk: default-on celebrations in unknown contexts, manipulative pseudo-personal pushes, gamification that punishes lapses, or confetti over a trivial action.

## Output

Return findings grouped by:

- flow and missing states
- hierarchy and content clarity
- spacing and layout
- consistency and components
- visual noise
- icons and affordances
- interaction feedback
- charts and data display
- mobile and responsive risk
- delight and anti-delight risks, when relevant

For each issue, include:

- what is wrong
- why it matters
- specific fix
- priority: high, medium, or low

## Guardrails

- Do not recommend decorative gradients, extra cards, or ornamental effects as the first fix.
- Do not prioritize visual novelty over task clarity.
- Do not remove labels from unfamiliar icon-only controls without adding tooltips.
- Do not make every element the same visual weight.
- Do not assume desktop spacing works on mobile.
- Do not allow off-scale spacing or font-size values.
- Do not trust default line height for all type roles.
- Do not split complementary color palettes 50/50.
- Do not pick color by typing arbitrary hex values.
- Do not make everything important by stacking contrast levers.

## Source Lineage

This skill is distilled from seven source layers.

- Kole Jain's [7 UI/UX mistakes that scream you're a beginner](https://www.youtube.com/watch?v=AH_ugxmLeUM) supplies the beginner mistake taxonomy, flow-before-polish posture, missing states, feedback, and consistency checks.
- Kole Jain's [Every UI/UX Concept Explained in Under 10 Minutes](https://www.youtube.com/watch?v=EcbgbKtOELY) supplies broad concept coverage for affordances, feedback, data presentation, and interaction review.
- DesignSpo's [The Complete Guide To Visual Hierarchy](https://www.youtube.com/watch?v=kK1TOpI948o) supplies rank-before-style, contrast levers, cohesion, and composition patterns.
- DesignSpo's [The ULTIMATE Guide To Typography For Beginners](https://www.youtube.com/watch?v=AXpxZMRM1EY) supplies type roles, line-height rules, letter-spacing rules, and typeface matching.
- DesignSpo's [The ULTIMATE Color Theory Guide For Beginners](https://www.youtube.com/watch?v=tKCORDK0IZU) supplies HSB reasoning, 60/30/10 proportions, warm/cool behavior, and dark-mode saturation guidance.
- DesignSpo's [The Golden Rule Of Web Design](https://www.youtube.com/watch?v=CASPWJUsHPM) supplies the 4-pixel mathematical system, spacing scale, type scale, and container math.
- Nesrine Changuel's [A 4-step framework for building delightful products](https://www.youtube.com/watch?v=tX6nwT1Bsuo) supplies the delight pillars, delight grid, anti-delight checks, and demotivator inversion.

The lineage file for the agent-readable draft maps these source claims into primitive skills, guardrails, output artifacts, and source-claim edges.
