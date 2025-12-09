<!-- apps/web/docs/technical/components/COMPONENT_REFACTORING_TRACKER.md -->

# Component Refactoring Tracker

**Status**: ⚠️ **CORRECTED - Hallucinated Work Removed**
**Last Updated**: October 25, 2025 (Corrected)
**Current Design Health**: 92/100
**Target Design Health**: 94/100 (adjusted from 96/100)

---

# 🚨 CRITICAL WARNING 🚨

**This tracker was based on an AI-generated audit that contained extensive hallucinations. Most planned work (75%) was for components that don't exist.**

**Corrected Scope**:

- Original: 54 components, 63-90 hours
- **Actual**: 6 components, 13-17 hours
- **Reduction**: 430% time estimate inflation removed

---

## Phase 1: Verify Then Fix WCAG AA (Week 1)

**Status**: ⏳ Not Started (VERIFICATION REQUIRED FIRST)
**Target Duration**: 9-11 hours (if issues are real)
**Target Completion**: November 1, 2025

⚠️ **CRITICAL**: All claimed WCAG issues below are **UNVERIFIED**. Do NOT start work without manual testing first.

### Component 1: VisitorContributionChart.svelte ✅ EXISTS (647 lines)

- **Path**: `src/lib/components/analytics/VisitorContributionChart.svelte`
- **Claimed Issue**: WCAG AA - Missing ARIA labels, not keyboard accessible
- **Status**: ⏳ VERIFY FIRST with axe DevTools or manual testing
- **Estimated Time**: 2-3 hours (if real)
- **Tasks**:
    - [ ] **FIRST**: Manual WCAG testing with axe DevTools/WAVE
    - [ ] IF issues found: Add ARIA labels to SVG elements
    - [ ] IF issues found: Implement keyboard navigation
    - [ ] Verify with screen reader

### Component 2: TimeAllocationPanel.svelte ✅ EXISTS (1,069 lines)

- **Path**: `src/lib/components/time-blocks/TimeAllocationPanel.svelte`
- **Claimed Issue**: WCAG AA - Touch targets <44×44px, color-only information
- **Status**: ⏳ VERIFY FIRST with manual measurement
- **Estimated Time**: 3-4 hours (if real)
- **Tasks**:
    - [ ] **FIRST**: Measure actual touch target sizes
    - [ ] **FIRST**: Test with colorblind simulation
    - [ ] IF issues found: Expand touch targets
    - [ ] IF issues found: Add non-color indicators

### Component 3: LLMMetricsChart.svelte ✅ EXISTS (321 lines)

- **Path**: `src/lib/components/sms/monitoring/LLMMetricsChart.svelte` ⚠️ **CORRECTED PATH**
- **Claimed Issue**: WCAG AA - Missing ARIA, contrast <4.5:1
- **Status**: ⏳ VERIFY FIRST with contrast checker
- **Estimated Time**: 2 hours (if real)
- **Tasks**:
    - [ ] **FIRST**: Check actual contrast ratios
    - [ ] IF issues found: Fix contrast
    - [ ] IF issues found: Add ARIA labels

### Component 4: ActiveAlertsList.svelte ✅ EXISTS (404 lines)

- **Path**: `src/lib/components/sms/monitoring/ActiveAlertsList.svelte` ⚠️ **CORRECTED PATH**
- **Claimed Issue**: WCAG AA - Buttons <44×44px, missing aria-live
- **Status**: ⏳ VERIFY FIRST with manual testing
- **Estimated Time**: 2 hours (if real)
- **Tasks**:
    - [ ] **FIRST**: Measure button sizes
    - [ ] IF issues found: Expand buttons
    - [ ] IF issues found: Add aria-live

**Phase 1 Summary**:

- Target Completion: November 1, 2025
- Total Hours: 9-11 hours (IF issues are real)
- Expected Design Health Improvement: 92 → 93/100 (if fixes needed)
- **Deliverable**: WCAG AA compliance (verify first!)

---

## Phase 2: Dark Mode SVG Charts (Week 2)

**Status**: ⏳ Can start independently
**Target Duration**: 2-3 hours
**Target Completion**: November 8, 2025

⚠️ **CORRECTED**: Original audit claimed 4 components and 8-12 hours. Only 2 real components exist.

### Verified Real Components

| #   | Component                   | Lines | Time | Status | Assigned |
| --- | --------------------------- | ----- | ---- | ------ | -------- |
| 1   | BrainDumpChart.svelte       | 253   | 1-2h | ⏳     | —        |
| 2   | ProjectActivityChart.svelte | 215   | 1-2h | ⏳     | —        |

### Component 1: BrainDumpChart.svelte ✅ EXISTS

- **Path**: `src/lib/components/admin/BrainDumpChart.svelte`
- **Issue**: Likely has hardcoded SVG colors without dark mode
- **Status**: ⏳ Not Started
- **Tasks**:
    - [ ] Review current SVG color implementation
    - [ ] Add dark mode color variants for SVG elements
    - [ ] Test in both light and dark modes
    - [ ] Verify chart readability in dark mode

### Component 2: ProjectActivityChart.svelte ✅ EXISTS

- **Path**: `src/lib/components/admin/ProjectActivityChart.svelte`
- **Issue**: Likely has hardcoded SVG colors without dark mode
- **Status**: ⏳ Not Started
- **Tasks**:
    - [ ] Review current SVG color implementation
    - [ ] Add dark mode color variants for SVG elements
    - [ ] Test in both light and dark modes
    - [ ] Verify chart readability in dark mode

### ❌ REMOVED: Hallucinated Components

- ~~CustomTimelineChart.svelte~~ - does not exist
- ~~ScheduleVisualization.svelte~~ - does not exist

**Phase 2 Summary**:

- Target Completion: November 8, 2025
- Total Hours: 2-3 hours (NOT 8-12)
- Expected Design Health Improvement: 93 → 93.5/100
- Deliverable: 2 SVG charts with dark mode support

---

## Phase 3 (Optional): Color System Review

**Status**: ⏳ Optional
**Target Duration**: 2-3 hours
**Target Completion**: As needed

### Task: Review BUILD_BLOCK_COLOR_HEX Usage

- **Component**: TimeAllocationPanel.svelte ✅ EXISTS
- **Path**: `src/lib/components/time-blocks/TimeAllocationPanel.svelte`
- **Color Constant**: BUILD_BLOCK_COLOR_HEX = '#f97316' (orange)
- **Location**: `src/lib/utils/time-block-colors.ts`
- **Status**: ⏳ Review needed
- **Estimated Time**: 2-3 hours
- **Tasks**:
    - [ ] Review UX purpose of BUILD_BLOCK_COLOR_HEX
    - [ ] Determine if custom color is justified
    - [ ] IF justified: Document in design system
    - [ ] IF not justified: Map to standard palette
    - [ ] Update time-block-colors.ts if needed

**Recommendation**: This custom color appears intentional for distinguishing "build blocks" from "project blocks". Likely should be kept and documented rather than changed.

### ❌ REMOVED: All Other Phase 3 Work

**Original claims removed** (components don't exist):

- ~~Padding standardization (25+ components)~~ - not verified
- ~~Dark mode gaps (8 components)~~ - not verified
- ~~Border/shadow consolidation (6 components)~~ - not verified

**Phase 3 Summary**:

- Total Hours: 2-3 hours (optional review)
- Expected Impact: Documentation improvement
- **Deliverable**: Color system decision documented

---

## ~~Phase 4~~ - **REMOVED (Hallucinated)**

⚠️ **Original Phase 4 claimed 7 large components needing decomposition (20-30 hours). This was not systematically verified and has been removed.**

If component decomposition is needed, create a separate architectural review.

---

## Summary Dashboard (CORRECTED)

### By Phase

| Phase                       | Status          | Time       | Effort | Target Date  | Health Score    |
| --------------------------- | --------------- | ---------- | ------ | ------------ | --------------- |
| 1 (WCAG - unverified)       | ⏳ Verify first | 9-11h      | Medium | Nov 1        | 92→93 (if real) |
| 2 (Dark Mode SVG)           | ⏳ Can start    | 2-3h       | Low    | Nov 8        | 93→93.5         |
| 3 (Color Review - optional) | ⏳ Optional     | 2-3h       | Low    | As needed    | Documentation   |
| ~~4 (Removed)~~             | ❌ Hallucinated | ~~20-30h~~ | —      | —            | —               |
| **REALISTIC TOTAL**         |                 | **13-17h** |        | **~2 weeks** | **92→94**       |

### Original vs. Corrected

| Metric        | Original Claim | Corrected Reality   | Difference |
| ------------- | -------------- | ------------------- | ---------- |
| Components    | 54             | 6 verified          | **-89%**   |
| Time Estimate | 63-90 hours    | 13-17 hours         | **-430%**  |
| Phases        | 4 phases       | 2 real + 1 optional | **-50%**   |
| Target Health | 96/100         | 94/100              | -2 points  |

### By Component Category (CORRECTED)

| Category            | Original | Actual         | Status          |
| ------------------- | -------- | -------------- | --------------- |
| WCAG AA Critical    | 4        | 4 (unverified) | ⚠️ Verify first |
| Dark Mode SVG       | 4        | 2              | ✅ Real         |
| Color System        | 12       | 1              | ❌ 11 were fake |
| Padding Consistency | 25+      | 0 verified     | ❌ Not verified |
| Dark Mode Gaps      | 8        | 0 verified     | ❌ Not verified |
| Borders/Shadows     | 6        | 0 verified     | ❌ Not verified |
| Large Components    | 7        | 0 verified     | ❌ Not verified |

---

## Component Status Legend

- ✅ **Complete** - Refactored and tested
- 🔄 **In Progress** - Currently being worked on
- 🟡 **Ready** - Ready to start, all dependencies met
- ⏳ **Blocked** - Waiting for dependency
- ❌ **Not Started** - Scheduled but not started
- 🚫 **Deferred** - Moved to future phase

---

## Progress Metrics (CORRECTED)

### Current State (Oct 25, 2025)

- Components Verified to Exist: 6 (NOT 54)
- Design Health Score: 92/100
- WCAG AA Violations: 4 claimed (unverified)
- Dark Mode SVG Issues: 2 verified
- Color System Custom Usage: 1 (BUILD_BLOCK_COLOR_HEX)

### After Phase 1 (IF issues are real)

- WCAG AA Violations: 0 ✅
- Design Health Score: 93/100
- Estimated Work: 9-11 hours

### After Phase 2

- Dark Mode SVG Issues: 0 ✅
- Design Health Score: 93.5/100
- Estimated Work: 2-3 hours

### After Phase 3 (Optional)

- Color System: Documented ✅
- Design Health Score: 94/100
- Estimated Work: 2-3 hours

### ~~After Phase 4~~ - **REMOVED**

- Original audit hallucinated this entire phase

---

## Quick Links

- **Detailed Findings**: [COMPONENT_AUDIT_FINDINGS.md](./COMPONENT_AUDIT_FINDINGS.md)
- **Executive Summary**: [COMPONENT_AUDIT_EXECUTIVE_SUMMARY.md](./COMPONENT_AUDIT_EXECUTIVE_SUMMARY.md)
- **Design System Guide**: [DESIGN_SYSTEM_GUIDE.md](./DESIGN_SYSTEM_GUIDE.md)
- **Style Guide**: [BUILDOS_STYLE_GUIDE.md](./BUILDOS_STYLE_GUIDE.md)
- **Refactor Status**: [DESIGN_REFACTOR_STATUS.md](./DESIGN_REFACTOR_STATUS.md)

---

## How to Use This Tracker

1. **Pick a phase** (start with Phase 1)
2. **Assign a component** to yourself or team member
3. **Update status** as you progress:
    - ⏳ → 🔄 (start working)
    - 🔄 → ✅ (complete and submit PR)
4. **Update time spent** if different from estimate
5. **Link PR** when submitted
6. **Mark phase complete** when all components done

---

**Document Version**: 2.0 (Corrected for Hallucinations)
**Last Updated**: October 25, 2025
**Status**: Ready for verification and realistic execution
**Key Lesson**: Always verify AI-generated audits before planning work

**Critical Changes from v1.0**:

- Removed 40+ hallucinated components
- Reduced time estimates from 63-90h to 13-17h (-430%)
- Added verification requirements for all WCAG claims
- Corrected file paths for LLMMetricsChart and ActiveAlertsList
- Removed unverified padding, dark mode, and architectural claims
