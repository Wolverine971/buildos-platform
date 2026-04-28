---
name: ui-ux-quality-review
description: Review app screens, landing pages, and product UI for beginner mistakes, missing states, visual hierarchy, spacing, consistency, icons, feedback, charts, and mobile polish. Use when auditing or improving interface quality.
path: docs/research/youtube-library/skill-drafts/ui-ux-quality-review/SKILL.md
---

# UI UX Quality Review

Use this skill to help an agent review a UI for practical quality issues. The review should focus on flow, clarity, consistency, feedback, and communication before decorative polish.

## When to Use

- Review a product screen, landing page, dashboard, or mobile flow
- Diagnose why a UI feels amateur or cluttered
- Improve visual hierarchy, spacing, typography, color, icons, or interaction states
- Audit charts and data visualization
- Give design feedback to a developer or founder
- Turn a rough wireframe into a more polished screen

Do not use this skill for full brand strategy, visual identity exploration, or accessibility audits that require WCAG-specific testing. Use a dedicated accessibility process for that.

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

- Plan flows on paper before designing screens.
- Every onboarding or setup flow needs skip, other, no-result, and recovery paths where relevant.
- Mobile needs more whitespace than most beginners expect.
- Use one primary font unless the design system says otherwise.
- Use color for meaning: success, warning, danger, focus, trust, selection, or category.
- In dark mode, create depth with surface contrast, not harsh borders or black shadows.
- If the shadow is the first thing noticed, it is too strong.
- Icons should generally match the text line height around them.
- Every user action needs a visible response.
- Microinteractions should confirm an action, not decorate the page at random.

## Common Fixes

- Replace generic "Home" title tags or labels with task-specific text.
- Add a clear first action to empty states.
- Convert repeated ad hoc elements into one component style.
- Standardize button sizes, radius, and icon placement.
- Remove decorative arrows when gestures or layout already imply movement.
- Add focus and error states to inputs.
- Add a saved-state indicator somewhere outside the clicked control if the state matters globally.
- Add axes and labels to charts even if the chart becomes less trendy.

## Output Format

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

For each issue, give:

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

## Source Attribution

Distilled from Kole Jain's [7 UI/UX mistakes that scream you're a beginner](https://www.youtube.com/watch?v=AH_ugxmLeUM) and [Every UI/UX Concept Explained in Under 10 Minutes](https://www.youtube.com/watch?v=EcbgbKtOELY). Local notes live in `docs/marketing/growth/research/youtube-transcripts/` and `youtube-design.md`.
