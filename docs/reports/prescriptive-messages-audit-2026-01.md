# Prescriptive Messages Audit Report

**Date:** 2026-01-01
**Scope:** Ontology modals and UI components
**Status:** Complete

## Summary

This audit identified and addressed over-prescriptive messages in the BuildOS modal components. These messages attempted to dictate specific workflows or methodologies that may not apply to all users.

## Changes Made

### 1. PlanEditModal.svelte

**Removed:**

```
Align plan duration with sprint cadence. If work exceeds six weeks, consider splitting into phases.
```

**Location:** Timeline insight panel (lines 573-577)

**Reason:** Not all users follow sprint cadence. The suggestion to split plans at six weeks is arbitrary and may not fit various project management styles.

---

### 2. PlanEditModal.svelte (Header)

**Removed:**

```
Structure the execution blueprint
```

**Location:** Card header subtitle (line 415)

**Reason:** Redundant with "Plan details" label and unnecessarily prescriptive phrasing.

---

### 3. PlanCreateModal.svelte

**Removed:**

```
Keep duration realistic—plans over 45 days often perform better when split into phases.
```

**Location:** Timeline insight panel (lines 633-636)

**Reason:** Similar to above - arbitrary duration threshold that may not apply to all project types (e.g., long-term initiatives, research projects, strategic plans).

---

### 4. PlanCreateModal.svelte (Fallback Text)

**Changed:**

```
From: "Use this template as a launchpad. Layer in tasks, owners, and checkpoints after saving."
To:   "A flexible plan structure for your workflow."
```

**Location:** Template guidance fallback text (line 647)

**Reason:** The original text was overly instructive about how users should use the template.

---

## Messages Reviewed But Kept

The following messages were reviewed but determined to be **helpful contextual guidance** rather than over-prescriptive advice:

### Helpful UI Tips (Kept)

| Location                   | Message                                                              | Reason for Keeping              |
| -------------------------- | -------------------------------------------------------------------- | ------------------------------- |
| TaskStepsSection.svelte    | "Tip: Use Markdown formatting with checkboxes (- [ ]) to create..."  | Teaches feature usage           |
| ContributionChart.svelte   | "Tip: Tap any square to view that day's braindumps"                  | UI navigation hint              |
| QuickProjectModal.svelte   | "Tip: Use markdown formatting (## Headers, **bold**, - lists, etc.)" | Teaches feature usage           |
| CoreDimensionsField.svelte | "Core dimensions are automatically extracted when you process..."    | Explains feature behavior       |
| ProcessingModal.svelte     | Various loading tips                                                 | Entertainment during wait state |
| AdminTourStep.svelte       | "Tip: Click the 'History' button..."                                 | Onboarding guidance             |

### Onboarding Messages (Kept)

| Location                      | Message                                    | Reason for Keeping                 |
| ----------------------------- | ------------------------------------------ | ---------------------------------- |
| NewProjectModal.svelte        | "We recommend starting with a brain dump"  | First-time user guidance           |
| FirstTimeBrainDumpCard.svelte | "Pro tip: Focus on one project at a time." | Helpful for new users (borderline) |

---

## Distinction: Helpful Tips vs. Prescriptive Messages

**Helpful tips:**

- Explain how to use a feature
- Provide navigation hints
- Describe what the system does

**Over-prescriptive messages:**

- Dictate specific workflows or methodologies
- Impose arbitrary thresholds (e.g., "45 days", "six weeks")
- Tell users how they _should_ work rather than enabling them to work how they prefer

---

## Files Modified

1. `/apps/web/src/lib/components/ontology/PlanEditModal.svelte`
2. `/apps/web/src/lib/components/ontology/PlanCreateModal.svelte`

---

## Recommendations for Future Development

1. **Avoid arbitrary thresholds** - Don't suggest specific durations, counts, or limits unless they're system constraints
2. **Explain, don't prescribe** - Help users understand features without telling them how to use them
3. **User choice** - Trust users to make their own workflow decisions
4. **Contextual help** - Place tips where they explain functionality, not methodology
