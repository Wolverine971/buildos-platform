# Milestones Under Goals - UX Proposal

**Date:** 2026-01-16
**Status:** Draft
**Author:** Claude
**Feature Area:** Ontology System - Goals & Milestones

---

## Executive Summary

Milestones are conceptually and structurally children of goals, but the current UI displays them as independent entities in separate panels. This proposal outlines a UX redesign to nest milestones under their parent goals, creating a clearer hierarchy and more intuitive user experience.

---

## Current State Analysis

### Database Architecture (Already Supports Hierarchy)

The relationship between goals and milestones is already enforced at the database and API level:

```
onto_goals                    onto_milestones
├── id                        ├── id
├── project_id                ├── project_id
├── name                      ├── title
├── state_key                 ├── state_key
├── target_date               ├── due_at (required)
└── ...                       └── ...
        │                           │
        └───────── onto_edges ──────┘
                   src_kind: 'goal'
                   rel: 'has_milestone'
                   dst_kind: 'milestone'
```

**Key Finding:** The milestone creation API (`/api/onto/milestones/create`) already **requires** a goal parent. Milestones cannot be created without a goal relationship.

### Current UI Problems

| Issue | Impact |
|-------|--------|
| Separate panels for Goals and Milestones | No visual parent-child relationship |
| Users must mentally connect milestones to goals | Cognitive overhead |
| Milestone panel duplicates information | Wasted screen space |
| Creating milestones feels disconnected | Poor UX flow |

### Files Currently Involved

| File | Purpose |
|------|---------|
| `/apps/web/src/routes/projects/[id]/+page.svelte` | Project page with separate panels |
| `/apps/web/src/lib/components/ontology/GoalCreateModal.svelte` | Goal creation |
| `/apps/web/src/lib/components/ontology/MilestoneCreateModal.svelte` | Milestone creation |
| `/apps/web/src/lib/components/ontology/insight-panels/insight-panel-config.ts` | Panel configurations |

---

## Proposed UX Design

### 1. Goal Card with Nested Milestones

Each goal card in the insight panel will display its milestones inline:

```
┌─────────────────────────────────────────────────────────┐
│ 🎯 Launch MVP by Q2                              [Active]│
│ Target: March 30, 2026                                   │
├─────────────────────────────────────────────────────────┤
│ MILESTONES                                               │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ ○ Complete API integration              Feb 15      │ │
│ │   [In Progress]                                     │ │
│ ├─────────────────────────────────────────────────────┤ │
│ │ ○ User testing complete                 Mar 1       │ │
│ │   [Pending]                                         │ │
│ ├─────────────────────────────────────────────────────┤ │
│ │ ● Beta release                          Mar 15      │ │
│ │   [Completed ✓]                                     │ │
│ └─────────────────────────────────────────────────────┘ │
│                                                          │
│                    [+ Add Milestone]                     │
└─────────────────────────────────────────────────────────┘
```

### 2. Milestone Creation Flow (Context-Aware Modal)

When user clicks "+ Add Milestone" on a goal card:

```
┌──────────────────────────────────────────────────────────┐
│  Add Milestone                                      [×]  │
├──────────────────────────────────────────────────────────┤
│  For Goal: "Launch MVP by Q2"                            │
│  ───────────────────────────────────────────────────────│
│                                                          │
│  Title *                                                 │
│  ┌────────────────────────────────────────────────────┐  │
│  │ Complete API integration                           │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Due Date *                                              │
│  ┌────────────────────────────────────────────────────┐  │
│  │ 📅 February 15, 2026                               │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  Type                                                    │
│  ○ Delivery  ○ Phase Complete  ○ Review  ○ Deadline     │
│                                                          │
│  Description (optional)                                  │
│  ┌────────────────────────────────────────────────────┐  │
│  │                                                    │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│           [Cancel]              [Create Milestone]       │
└──────────────────────────────────────────────────────────┘
```

**Key Changes:**
- Modal header shows parent goal context
- `goal_id` is pre-set (hidden from user)
- User only fills in milestone-specific fields

### 3. Empty State (Goal with No Milestones)

```
┌─────────────────────────────────────────────────────────┐
│ 🎯 Learn Spanish                                 [Draft]│
│ Target: December 31, 2026                                │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────────────────────────────────────────────────┐│
│  │                                                     ││
│  │  No milestones yet                                  ││
│  │                                                     ││
│  │  Break this goal into measurable checkpoints        ││
│  │  to track your progress toward completion.          ││
│  │                                                     ││
│  │              [+ Add First Milestone]                ││
│  │                                                     ││
│  └─────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────┘
```

### 4. Visual States for Milestones

| State | Icon | Text Style | Color Token |
|-------|------|------------|-------------|
| Pending | ○ (hollow circle) | Normal | `text-muted-foreground` |
| In Progress | ◐ (half-filled) | Normal | `text-foreground` |
| Completed | ● (filled) + ✓ | Optional strikethrough | `text-success` / green |
| Missed | ○ (hollow) + ✗ | Normal | `text-destructive` / red |

### 5. Interaction Patterns

| Action | Behavior |
|--------|----------|
| Click goal card header | Expand/collapse milestone section |
| Click individual milestone | Open `MilestoneEditModal` |
| Click "+ Add Milestone" | Open `MilestoneCreateModal` with goal pre-linked |
| Hover milestone | Show quick actions (edit, mark complete) |
| Complete all milestones | Visual indicator on goal card |

### 6. Collapsed Goal View

When a goal is collapsed, show summary information:

```
┌─────────────────────────────────────────────────────────┐
│ ▶ 🎯 Launch MVP by Q2                    [Active] 2/4 ● │
└─────────────────────────────────────────────────────────┘
```

- `▶` indicates expandable
- `2/4 ●` shows milestone progress (2 of 4 completed)

---

## Implementation Plan

### Phase 1: Remove Milestone Panel

**Files to Modify:**

| File | Change |
|------|--------|
| `/apps/web/src/routes/projects/[id]/+page.svelte` | Remove milestone panel from insight panels array |
| `/apps/web/src/lib/components/ontology/insight-panels/insight-panel-config.ts` | Remove or deprecate `MILESTONE_CONFIG` |

### Phase 2: Create Milestone List Components

**New Components:**

| Component | Purpose |
|-----------|---------|
| `MilestoneListItem.svelte` | Compact milestone row for display within goal card |
| `GoalMilestonesSection.svelte` | Collapsible section containing milestone list + add button |

**Location:** `/apps/web/src/lib/components/ontology/`

### Phase 3: Enhance Goal Card

**Files to Modify:**

| File | Change |
|------|--------|
| Goal card component (or create new) | Add milestones section with expand/collapse |
| `MilestoneCreateModal.svelte` | Accept `goalId` prop to pre-link relationship, show goal context |

### Phase 4: Data Loading

**Considerations:**
- Load milestones with goals in a single query (join via `onto_edges`)
- Or lazy-load milestones when goal is expanded
- Cache milestones to avoid refetching on collapse/expand

---

## Open Questions

### 1. Filtering Behavior

**Options:**
- A) Filter milestones independently of goals
- B) Always show all milestones for visible goals
- C) Filter goals, and show filtered milestones within each

**Recommendation:** Option C - Filter at goal level, with optional milestone state filter within expanded goals.

### 2. Progress Indicator

**Question:** Should we show milestone completion progress on the goal card header?

**Options:**
- A) Show fraction: `2/4` milestones
- B) Show progress bar
- C) Show percentage: `50%`
- D) No indicator

**Recommendation:** Option A (`2/4 ●`) - concise and informative.

### 3. Quick Actions

**Question:** Allow inline state toggles (mark complete) or require opening the edit modal?

**Options:**
- A) Inline toggle only for state changes
- B) Always require edit modal
- C) Inline toggle with confirmation

**Recommendation:** Option A for speed, with edit modal for full details.

### 4. Goal Card Expansion Default

**Question:** Should goals be expanded or collapsed by default?

**Options:**
- A) All expanded
- B) All collapsed
- C) Expand goals with pending/in-progress milestones
- D) Remember user preference per goal

**Recommendation:** Option C - show active work by default.

---

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Clicks to create milestone | 3+ (find panel, click add, fill form) | 2 (click add on goal, fill form) |
| Visual clarity of goal-milestone relationship | None | Immediate |
| Screen space efficiency | 2 panels | 1 panel |
| User confusion about milestone ownership | Common | Eliminated |

---

## Appendix: State Definitions

### Goal States

| State | Description |
|-------|-------------|
| `draft` | Goal is being planned, not yet active |
| `active` | Goal is currently being worked on |
| `achieved` | Goal has been successfully completed |
| `abandoned` | Goal was cancelled or deprioritized |

### Milestone States

| State | Description |
|-------|-------------|
| `pending` | Milestone has not been started |
| `in_progress` | Work is underway toward this milestone |
| `completed` | Milestone has been achieved |
| `missed` | Milestone due date passed without completion |

---

## References

- Database schema: `/packages/shared-types/src/database.schema.ts`
- Goal creation API: `/apps/web/src/routes/api/onto/goals/create/+server.ts`
- Milestone creation API: `/apps/web/src/routes/api/onto/milestones/create/+server.ts`
- Insight panel config: `/apps/web/src/lib/components/ontology/insight-panels/insight-panel-config.ts`
- Inkprint Design System: `/apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md`
