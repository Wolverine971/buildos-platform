---
title: "New User Experience: Competing CTAs Visual Audit"
date: 2026-02-12
category: ux-audit
tags: [new-user, onboarding, cta, ux, first-visit]
status: pending
priority: medium
path: thoughts/shared/research/2026-02-12_00-00-00_new-user-competing-ctas-audit.md
---

# New User Experience: Competing CTAs Visual Audit

## Context

During new-user experience improvements (Feb 2026), we identified that a first-time user with zero projects is exposed to multiple competing calls-to-action simultaneously. While each CTA is individually correct, the combined effect may overwhelm or confuse new users.

## Problem Statement

When a brand-new user logs in for the first time:

1. **Dashboard empty state** — "Create your first project" button (navigates to `/projects/create`)
2. **Navigation pulsing dot** — Accent-colored ping on "Brain Dump & Chat" button (draws attention to open chat)
3. **Onboarding prompts** — Onboarding setup prompts in the nav bar ("Complete Setup" / "Personalize BuildOS")

All three are visible at the same time on first visit. They compete for attention and point in different directions.

## What Needs Auditing

### 1. Visual Hierarchy Conflicts
- Which CTA should a new user click first?
- Are the visual weights (size, color, animation) communicating the right priority?
- Does the pulsing dot on the nav bar distract from the dashboard CTA?

### 2. Redundant Paths
- Dashboard CTA goes to `/projects/create` (opens AgentChatModal)
- Brain Dump & Chat button also opens AgentChatModal
- Are these two paths confusing or complementary?

### 3. Onboarding vs. Project Creation
- Onboarding prompts ask user to "Complete Setup" (profile, preferences)
- Dashboard CTA asks user to "Create your first project"
- Which should come first? Should onboarding block project creation?

### 4. Mobile Experience
- On mobile, all three CTAs compete in a smaller viewport
- The pulsing dot may be less visible or more distracting on mobile
- Navigation drawer behavior adds complexity

## Files to Review

| File | What to Check |
|------|--------------|
| `apps/web/src/lib/components/dashboard/AnalyticsDashboard.svelte` | Empty state CTA (lines ~349-370) |
| `apps/web/src/lib/components/layout/Navigation.svelte` | Pulsing dot (lines ~480-490), onboarding prompts (multiple locations) |
| `apps/web/src/lib/components/chat/ContextSelectionScreen.svelte` | New user CTA in chat modal |
| `apps/web/src/routes/projects/+page.svelte` | Projects page empty state |

## Potential Solutions (To Evaluate)

### Option A: Sequential Disclosure
- Show only the dashboard CTA on first visit
- Hide pulsing dot until after first project is created
- Show onboarding prompts after first project

### Option B: Unified Entry Point
- Single prominent CTA on first visit that combines project creation + onboarding
- Remove competing CTAs in favor of one clear path

### Option C: Contextual Suppression
- If dashboard empty state is visible, suppress the pulsing dot
- If onboarding < 50%, suppress project-creation CTA and prioritize onboarding
- Use progressive disclosure based on user state

## Recommendation

This should be an end-to-end visual audit done with screenshots at each breakpoint (mobile, tablet, desktop). Walk through the first-time user journey from login to first project creation and document every CTA encountered, then choose one of the approaches above (or a hybrid).

## Related Changes

These changes were already made to improve the new-user experience:
- ContextSelectionScreen: Disabled non-project options for new users
- Dashboard: Updated empty state messaging and CTA
- Projects page: Removed developer jargon from empty state
- Chat seed message: Made warmer and more inviting
- Navigation: Added pulsing dot (scoped to `!completedOnboarding`)
- Toast: Context-aware post-creation guidance
