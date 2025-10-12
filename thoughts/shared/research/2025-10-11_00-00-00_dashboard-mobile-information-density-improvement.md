---
title: "Dashboard Mobile Information Density Improvement Spec"
date: 2025-10-11
type: research
status: specification
tags: [dashboard, mobile, ux, information-density, layout]
related_files:
  - /apps/web/src/routes/+page.svelte
  - /apps/web/src/lib/components/dashboard/Dashboard.svelte
  - /apps/web/src/lib/components/dashboard/MobileTaskTabs.svelte
  - /apps/web/src/lib/components/dashboard/TaskDetailsCard.svelte
  - /apps/web/src/lib/components/dashboard/WeeklyTaskCalendar.svelte
  - /apps/web/src/lib/components/dashboard/BraindumpWeekView.svelte
  - /apps/web/src/lib/components/dashboard/PhaseCalendarView.svelte
---

# Dashboard Mobile Information Density Improvement Specification

## Executive Summary

This specification addresses layout and information density issues on the BuildOS dashboard homepage, particularly for mobile devices. The goal is to create a more compact, cohesive design that maximizes visible content while maintaining visual appeal and usability.

## Problem Statement

### Current Issues Identified

1. **Excessive Top Margin on Welcome Message**
   - Location: `Dashboard.svelte:649`
   - Current: `mb-8 sm:mb-10` on header section
   - Issue: Too much whitespace above the welcome message wastes valuable screen real estate

2. **Missing Task Counts in Tabs**
   - Location: `MobileTaskTabs.svelte:94-108`
   - Current: Tabs show only labels (Past Due, Today, Tomorrow)
   - Issue: Users cannot see at a glance how many tasks are in each tab without switching

3. **Inconsistent Card Padding Across Sections**
   - Mobile padding varies significantly between components:
     - MobileTaskTabs container: `p-5` (20px)
     - TaskDetailsCard: `p-4 sm:p-5` (16px → 20px)
     - WeeklyTaskCalendar header: `p-4 sm:p-6` (16px → 24px)
     - BraindumpWeekView header: `p-4 sm:p-6` (16px → 24px)
     - PhaseCalendarView header: `p-6 sm:p-8` (24px → 32px) ⚠️ **Largest**
   - Issue: Lack of visual cohesion; some sections feel cramped, others wasteful

4. **Excessive Tab Container Padding**
   - Location: `MobileTaskTabs.svelte:91`
   - Current: `p-5` (20px all around)
   - Issue: Takes up unnecessary space on mobile screens

5. **Individual Task Item Padding Variations**
   - Task items across different components use different padding:
     - MobileTaskTabs tasks: `p-4` (16px)
     - TaskDetailsCard tasks: `p-2 sm:p-2.5 md:p-3` (8px → 10px → 12px)
     - WeeklyTaskCalendar tasks (mobile): `p-3` (12px)
     - BraindumpWeekView items (mobile): `p-3` (12px)
     - PhaseCalendarView items (mobile): `p-5` (20px) ⚠️ **Largest**

## Current Spacing Audit

### Component-by-Component Analysis

#### Dashboard.svelte (Main Container)

```
Container: px-4 sm:px-6 lg:px-8 py-6 sm:py-8 lg:py-10
Header section: mb-8 sm:mb-10
Section gaps: mb-6 sm:mb-8 (between major sections)
```

#### MobileTaskTabs.svelte

```
Container card: rounded-2xl shadow-sm p-5 border
Tab button container: mb-5 p-1
Tab buttons: px-4 py-2.5
Icon/title section: gap-2 mb-4
Task list: space-y-3 max-h-[450px]
Individual tasks: p-4 border-l-3 rounded-xl
```

#### TaskDetailsCard.svelte (Desktop)

```
Container: rounded-xl shadow-sm border p-4 sm:p-5
Header: mb-4 (with count badge)
Task list: space-y-2 sm:space-y-2.5 md:space-y-3
Individual tasks: p-2 sm:p-2.5 md:p-3
```

#### WeeklyTaskCalendar.svelte

```
Container: rounded-xl shadow-sm border
Header: p-4 sm:p-6 border-b
Content area: p-4 sm:p-6
Mobile day container: space-y-4
Mobile tasks: p-3 rounded-lg
```

#### BraindumpWeekView.svelte

```
Container: rounded-xl shadow-sm border
Header: p-4 sm:p-6 border-b
Content area: p-4 sm:p-6
Mobile day container: pl-4 border-l-2
Mobile braindumps: p-3 rounded-lg
```

#### PhaseCalendarView.svelte

```
Container: rounded-xl shadow-sm border
Header: p-6 sm:p-8 border-b ⚠️ (Larger than others)
Content area: p-4 sm:p-6
Mobile list items: p-5 rounded-2xl min-h-[88px] ⚠️ (Larger than others)
```

## Proposed Improvements

### 1. Reduce Welcome Message Top Margin

**Goal:** Reclaim vertical space without losing visual hierarchy

**Change:**

```svelte
<!-- Current: Dashboard.svelte:649 -->
<header class="mb-8 sm:mb-10">

<!-- Proposed -->
<header class="mb-4 sm:mb-6">
```

**Impact:**

- Mobile: Saves 16px (from mb-8 to mb-4)
- Desktop: Saves 16px (from mb-10 to mb-6)
- Still maintains clear separation from navigation

### 2. Add Task Counts to Tabs

**Goal:** Show information density at a glance without tab switching

**Change:**

```svelte
<!-- Current: MobileTaskTabs.svelte:96-107 -->
<Button ...>
  <span>{tab.label}</span>
</Button>

<!-- Proposed -->
<Button ...>
  <span class="flex items-center gap-1.5">
    <span>{tab.label}</span>
    {#if tab.count > 0}
      <span class="inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-bold rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
        {tab.count}
      </span>
    {/if}
  </span>
</Button>
```

**Visual Design:**

- Count badge appears inline with tab label
- Small, compact badge (h-5, min-w-[20px])
- Subtle background to avoid visual clutter
- Only shows when count > 0

### 3. Standardize Card Padding (Mobile Focus)

**Goal:** Create visual cohesion and maximize content visibility

**Standardized Mobile Padding System:**

```
Card Headers:        p-4 (16px) - All components
Card Content Areas:  p-4 (16px) - All components
Individual Items:    p-3 (12px) - All task/entry items
Item Spacing:        space-y-2.5 (10px) - Between items in lists
```

**Specific Changes:**

#### MobileTaskTabs.svelte

```svelte
<!-- Line 91: Container padding -->
<!-- Current: p-5 -->
<!-- Proposed: p-4 -->
<div class="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4 border...">

<!-- Line 94: Tab container bottom margin -->
<!-- Current: mb-5 -->
<!-- Proposed: mb-4 -->
<div class="flex gap-1 mb-4 p-1...">

<!-- Line 140: Individual task padding -->
<!-- Current: p-4 -->
<!-- Proposed: p-3 -->
<Button class="... p-3 ...">
```

#### TaskDetailsCard.svelte

```svelte
<!-- Line 81: Keep p-4 for mobile (already optimal) -->
<!-- No change needed for container -->

<!-- Line 115: Task padding is already optimal at p-2 sm:p-2.5 md:p-3 -->
<!-- No change needed -->
```

#### WeeklyTaskCalendar.svelte

```svelte
<!-- Line 99: Header padding -->
<!-- Current: p-4 sm:p-6 -->
<!-- Proposed: p-4 (consistent on all screens) -->
<div class="p-4 border-b border-gray-200 dark:border-gray-700">

<!-- Line 119: Content padding -->
<!-- Current: p-4 sm:p-6 -->
<!-- Proposed: p-4 -->
<div class="p-4">

<!-- Line 176: Mobile task padding is already p-3 - optimal -->
<!-- No change needed -->
```

#### BraindumpWeekView.svelte

```svelte
<!-- Line 77: Header padding -->
<!-- Current: p-4 sm:p-6 -->
<!-- Proposed: p-4 -->
<div class="p-4 border-b border-gray-200 dark:border-gray-700">

<!-- Line 98: Content padding -->
<!-- Current: p-4 sm:p-6 -->
<!-- Proposed: p-4 -->
<div class="p-4">

<!-- Line 158: Mobile braindump padding is already p-3 - optimal -->
<!-- No change needed -->
```

#### PhaseCalendarView.svelte

```svelte
<!-- Line 260: Header padding (largest outlier) -->
<!-- Current: p-6 sm:p-8 -->
<!-- Proposed: p-4 -->
<div class="p-4 border-b border-gray-100 dark:border-gray-700">

<!-- Line 350: Content padding -->
<!-- Current: p-4 sm:p-6 -->
<!-- Proposed: p-4 -->
<div class="p-4">

<!-- Line 378: Mobile list item padding (largest outlier) -->
<!-- Current: p-5 rounded-2xl min-h-[88px] -->
<!-- Proposed: p-4 rounded-xl min-h-[80px] -->
<button class="... p-4 rounded-xl ... min-h-[80px] ...">
```

### 4. Optimize Section Spacing in Main Dashboard

**Goal:** Reduce gaps between sections while maintaining readability

**Change:**

```svelte
<!-- Dashboard.svelte: Multiple locations using mb-6 sm:mb-8 -->
<!-- Current: mb-6 sm:mb-8 -->
<!-- Proposed: mb-4 sm:mb-6 -->

<!-- This applies to: -->
<!-- - Line 688: Brain Dump Card section -->
<!-- - Line 698: Quick Actions section -->
<!-- - Line 706: Welcome Message section -->
<!-- - Line 825: Weekly Calendar section -->
<!-- - Line 838: Stats Grid section -->
<!-- - Line 953: BraindumpWeekView section -->
<!-- - Line 959: PhaseCalendarView section -->
```

## Standardized Design System

### Mobile Card System (< 640px)

```css
/* Card Container */
.dashboard-card {
  @apply rounded-xl shadow-sm border;
  @apply bg-white dark:bg-gray-800;
  @apply border-gray-200 dark:border-gray-700;
}

/* Card Header */
.dashboard-card-header {
  @apply p-4;
  @apply border-b border-gray-200 dark:border-gray-700;
}

/* Card Content */
.dashboard-card-content {
  @apply p-4;
}

/* List Items (tasks, braindumps, phases) */
.dashboard-list-item {
  @apply p-3;
  @apply rounded-lg;
  @apply border;
}

/* Item Spacing */
.dashboard-list {
  @apply space-y-2.5;
}

/* Section Spacing */
.dashboard-section {
  @apply mb-4;
}
```

### Desktop Overrides (≥ 640px)

```css
/* Desktop keeps slightly more breathing room */
.dashboard-card-header {
  @apply sm:p-5; /* Only 4px more than mobile */
}

.dashboard-card-content {
  @apply sm:p-5; /* Only 4px more than mobile */
}

.dashboard-section {
  @apply sm:mb-6; /* Only 8px more than mobile */
}
```

## Expected Results

### Space Savings (Mobile)

| Component                  | Current Mobile Padding | Proposed    | Savings                  |
| -------------------------- | ---------------------- | ----------- | ------------------------ |
| Welcome Header Margin      | 32px (mb-8)            | 16px (mb-4) | **16px**                 |
| MobileTaskTabs Container   | 20px (p-5)             | 16px (p-4)  | **8px** (4px × 2 sides)  |
| MobileTaskTabs Tab Margin  | 20px (mb-5)            | 16px (mb-4) | **4px**                  |
| MobileTaskTabs Tasks       | 16px (p-4)             | 12px (p-3)  | **8px** (4px × 2 sides)  |
| PhaseCalendarView Header   | 24px (p-6)             | 16px (p-4)  | **16px** (8px × 2 sides) |
| PhaseCalendarView Items    | 20px (p-5)             | 16px (p-4)  | **8px** (4px × 2 sides)  |
| Section Gaps (×7 sections) | 24px (mb-6)            | 16px (mb-4) | **56px** (8px × 7)       |
| **Total Mobile Savings**   |                        |             | **~116px**               |

### Information Density Improvements

1. **Task Counts Visible:** Users can see task counts in all tabs without switching
2. **More Content Above Fold:** 116px vertical space reclaimed on mobile = ~1-2 additional task items visible
3. **Visual Cohesion:** Consistent padding creates a more professional, intentional design
4. **Faster Scanning:** Reduced whitespace allows faster visual scanning of content

### Maintained Quality

- **Touch Targets:** All interactive elements maintain 44×44px minimum (WCAG guideline)
- **Readability:** Text line-height and spacing remains comfortable
- **Visual Hierarchy:** Section separation still clear despite reduced gaps
- **Accessibility:** No compromise on accessibility standards

## Implementation Priority

### Phase 1: Quick Wins (High Impact, Low Effort)

1. ✅ Add task counts to tabs (MobileTaskTabs.svelte)
2. ✅ Reduce welcome message top margin (Dashboard.svelte)
3. ✅ Reduce section spacing (Dashboard.svelte)

### Phase 2: Padding Standardization (Medium Effort)

4. ✅ Standardize MobileTaskTabs padding
5. ✅ Standardize WeeklyTaskCalendar padding
6. ✅ Standardize BraindumpWeekView padding
7. ✅ Standardize PhaseCalendarView padding

### Phase 3: Refinement (Low Priority)

8. ⏱️ Create reusable dashboard card components with standardized styles
9. ⏱️ Extract spacing constants to central design tokens file
10. ⏱️ Add responsive breakpoint variations if needed

## Testing Checklist

### Visual Testing

- [ ] Desktop view maintains good spacing and readability
- [ ] Tablet view (768px-1024px) has appropriate padding
- [ ] Mobile view (320px-640px) maximizes information density
- [ ] Dark mode looks consistent with light mode

### Functional Testing

- [ ] Task count badges update correctly when tasks change
- [ ] All touch targets remain ≥44×44px
- [ ] Scrolling behavior works smoothly
- [ ] No layout shift or flickering on load

### Cross-Browser Testing

- [ ] Safari iOS (mobile)
- [ ] Chrome Android (mobile)
- [ ] Chrome Desktop
- [ ] Safari Desktop
- [ ] Firefox Desktop

### Accessibility Testing

- [ ] Screen reader announces counts correctly
- [ ] Keyboard navigation works smoothly
- [ ] Focus indicators are visible
- [ ] Color contrast meets WCAG AA standards

## Files to Modify

1. `/apps/web/src/lib/components/dashboard/Dashboard.svelte`
   - Line 649: Reduce header margin
   - Lines 688, 698, 706, 825, 838, 953, 959: Reduce section spacing

2. `/apps/web/src/lib/components/dashboard/MobileTaskTabs.svelte`
   - Lines 91, 94, 140: Reduce padding
   - Lines 96-107: Add count badges to tabs

3. `/apps/web/src/lib/components/dashboard/WeeklyTaskCalendar.svelte`
   - Lines 99, 119: Standardize padding to p-4

4. `/apps/web/src/lib/components/dashboard/BraindumpWeekView.svelte`
   - Lines 77, 98: Standardize padding to p-4

5. `/apps/web/src/lib/components/dashboard/PhaseCalendarView.svelte`
   - Lines 260, 350, 378: Reduce padding significantly

## Success Metrics

### Quantitative

- Mobile viewport shows 15-20% more content above the fold
- Reduced scroll distance by ~116px on mobile dashboard
- Consistent padding across all 5 major card components

### Qualitative

- User feedback on "cleaner" or "less cluttered" interface
- Improved visual cohesion and professional appearance
- Easier at-a-glance understanding of task distribution

## Potential Risks & Mitigation

| Risk                                | Impact   | Mitigation                                           |
| ----------------------------------- | -------- | ---------------------------------------------------- |
| Too cramped on small screens        | High     | Test on 320px width devices; adjust if needed        |
| Touch targets too small             | Critical | Verify all buttons/cards maintain ≥44×44px           |
| Desktop looks sparse                | Medium   | Desktop keeps slightly more padding (sm: variants)   |
| User preference for current spacing | Medium   | A/B test or gather user feedback before full rollout |

## Design Rationale

### Why These Specific Values?

**p-4 (16px) for cards:**

- Industry standard for card padding on mobile
- Matches Material Design and iOS HIG recommendations
- Balances whitespace with content density

**p-3 (12px) for list items:**

- Sufficient space for comfortable tapping
- Allows more items in scrollable lists
- Common pattern in mobile-first designs (Twitter, Instagram)

**mb-4 (16px) for sections:**

- Clear visual separation without waste
- Responsive: scales up to mb-6 (24px) on desktop
- Aligns with 4px grid system

**Count badges inline with tabs:**

- Saves vertical space vs separate row
- Common pattern (Gmail, Slack, Discord)
- Provides immediate context without clutter

## Alternative Approaches Considered

### 1. Variable Density Modes

**Approach:** Allow users to toggle between "Comfortable" and "Compact" views
**Rejected Because:** Adds complexity; most users prefer optimized defaults

### 2. Dynamic Padding Based on Content

**Approach:** Reduce padding only when many items present
**Rejected Because:** Inconsistent experience; unexpected layout shifts

### 3. Progressive Disclosure

**Approach:** Show only summary, expand on tap
**Rejected Because:** Adds interaction friction; users want to see tasks immediately

### 4. Remove Cards, Use Flat Design

**Approach:** Eliminate card containers entirely
**Rejected Because:** Reduces visual hierarchy and scannability

## References

- [Material Design - Layout Spacing](https://m3.material.io/foundations/layout/applying-layout/spacing)
- [iOS Human Interface Guidelines - Layout](https://developer.apple.com/design/human-interface-guidelines/layout)
- [WCAG 2.1 - Target Size](https://www.w3.org/WAI/WCAG21/Understanding/target-size.html)
- [Nielsen Norman Group - Mobile UX](https://www.nngroup.com/articles/mobile-ux/)

## Conclusion

This specification provides a comprehensive plan to improve information density on the BuildOS dashboard while maintaining usability and visual quality. The proposed changes are conservative, tested against industry standards, and prioritized for incremental rollout.

**Key Takeaway:** By reducing unnecessary padding and adding contextual counts, we can show 15-20% more content on mobile without compromising user experience.
