<!-- thoughts/shared/research/2026-01-16_goal-milestone-section-in-modal-spec.md -->
# Goal Milestones Section in GoalEditModal

> **Date:** 2026-01-16
> **Status:** Specification
> **Context:** Milestones are subgoals that always belong to a parent goal. Users should be able to create/view/manage milestones directly from within the goal they belong to.

---

## Problem Statement

Currently, milestones can only be created from:
1. The project page via goal cards (GoalMilestonesSection)
2. The standalone "Create Milestone" button in the command center

However, when a user is viewing/editing a goal in the **GoalEditModal**, they cannot see or manage milestones for that goal. This breaks the mental model of "milestones as subgoals" and forces users to close the modal to work with milestones.

---

## Proposed Solution

Add a **Milestones Section** to the GoalEditModal sidebar that:
1. Displays existing milestones for this goal
2. Allows creating new milestones inline
3. Allows quick navigation to edit existing milestones
4. Shows progress toward goal completion

---

## Visual Design

### Layout Position

The milestones section should appear in the **right sidebar** of the GoalEditModal, between "Linked Entities" and "Tags":

```
┌─────────────────────────────────────────────────────────────────┐
│ HEADER: Goal Name, Created/Updated dates            [Chat] [X] │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────┐  ┌─────────────────────┐  │
│  │                                 │  │                     │  │
│  │  MAIN FORM (2 cols)             │  │  SIDEBAR (1 col)    │  │
│  │                                 │  │                     │  │
│  │  • Goal Name                    │  │  • Linked Entities  │  │
│  │  • Description                  │  │                     │  │
│  │  • Goal Details                 │  │  ┌─────────────────┐│  │
│  │  • Priority + Target Date       │  │  │ MILESTONES (NEW)││  │
│  │  • Success Criteria             │  │  │                 ││  │
│  │  • State                        │  │  │ [Progress bar]  ││  │
│  │                                 │  │  │                 ││  │
│  │                                 │  │  │ ○ Milestone 1   ││  │
│  │                                 │  │  │ ◐ Milestone 2   ││  │
│  │                                 │  │  │ ● Milestone 3   ││  │
│  │                                 │  │  │                 ││  │
│  │                                 │  │  │ [+ Add]         ││  │
│  │                                 │  │  └─────────────────┘│  │
│  │                                 │  │                     │  │
│  │                                 │  │  • Tags             │  │
│  │                                 │  │  • Goal Information │  │
│  │                                 │  │  • Activity Log     │  │
│  │                                 │  │                     │  │
│  └─────────────────────────────────┘  └─────────────────────┘  │
│                                                                 │
│  COMMENTS SECTION                                               │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│ FOOTER: [Delete]                              [Cancel] [Save]   │
└─────────────────────────────────────────────────────────────────┘
```

### Component Design: GoalMilestonesSidebarSection

A new sidebar card component that fits the Inkprint design system:

```
┌─────────────────────────────────────┐
│ ○ MILESTONES                   2/5  │  ← Collapsible header with progress
├─────────────────────────────────────┤
│ ████████░░░░░░░░░░░░░  40%          │  ← Progress bar (optional, minimal)
├─────────────────────────────────────┤
│ ○  Set up CI/CD                Due: Jan 20  │  ← Pending milestone
│ ◐  Implement auth              Due: Jan 25  │  ← In progress milestone
│ ● ✓ Design wireframes          Done         │  ← Completed (muted)
├─────────────────────────────────────┤
│           [+ Add Milestone]                 │  ← Add button
└─────────────────────────────────────┘
```

### Visual States by Milestone State

| State       | Icon           | Text Color           | Row Style              |
|-------------|----------------|----------------------|------------------------|
| pending     | `○` Circle     | `text-muted-foreground` | Normal                 |
| in_progress | `◐` CircleDot  | `text-foreground`    | Normal                 |
| completed   | `●✓` CheckCircle2 | `text-muted-foreground` | Strikethrough title |
| missed      | `○✗` XCircle   | `text-destructive`   | Normal                 |

### Inkprint Styling

```css
/* Container Card */
bg-card border border-border rounded-lg shadow-ink tx tx-frame tx-weak

/* Header */
px-3 py-2 border-b border-border
text-xs font-semibold text-muted-foreground uppercase tracking-wide

/* Progress Bar */
h-1.5 rounded-full bg-muted
/* Fill: */ bg-emerald-500/70

/* Milestone Row */
px-3 py-2 flex items-center gap-2
hover:bg-accent/5 cursor-pointer transition-colors pressable

/* Add Button */
px-3 py-2 text-center text-xs text-accent hover:bg-accent/10
```

---

## Interaction Design

### 1. Viewing Milestones

- Section is **expanded by default** if milestones exist
- Section is **collapsed** if no milestones (shows empty state when expanded)
- Progress indicator shows `completed/total` count
- Milestones sorted: active first (by due date), then completed at bottom

### 2. Creating a Milestone

**Option A: Inline Quick Create (Recommended)**

Clicking "Add Milestone" shows an inline form within the sidebar:

```
┌─────────────────────────────────────┐
│ ○ MILESTONES                   2/5  │
├─────────────────────────────────────┤
│ ○  Existing milestone 1             │
│ ○  Existing milestone 2             │
├─────────────────────────────────────┤
│ ┌─────────────────────────────────┐ │
│ │ What's this milestone?          │ │  ← Title input (auto-focus)
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ 📅 Due date (optional)          │ │  ← Date picker
│ └─────────────────────────────────┘ │
│      [Cancel]  [Create Milestone]   │  ← Action buttons
└─────────────────────────────────────┘
```

- **Auto-focus** title input when form appears
- **Enter key** creates milestone
- **Escape key** cancels
- Minimal fields: just title and optional due date
- After creation: form stays open for rapid entry (can create multiple)
- Success: New milestone appears in list with subtle animation

**Option B: Open MilestoneCreateModal**

Clicking "Add Milestone" opens the full MilestoneCreateModal:
- Pre-populated with goalId and goalName
- User fills out full milestone details
- Modal closes, GoalEditModal refreshes milestones

**Recommendation:** Start with **Option B** (simpler), add Option A later if needed.

### 3. Editing a Milestone

- Clicking a milestone row opens `MilestoneEditModal`
- Changes are saved in the edit modal
- After close, GoalEditModal refreshes milestone list

### 4. Quick Actions

**Toggle Complete** (on hover, desktop only):
- Shows a checkmark button on incomplete milestones
- Clicking toggles between pending/in_progress → completed
- Already completed milestones show uncomplete option

**More Menu** (optional, for mobile):
- Edit
- Mark Complete/Incomplete
- Delete

### 5. Empty State

When goal has no milestones:

```
┌─────────────────────────────────────┐
│ ○ MILESTONES                    0   │
├─────────────────────────────────────┤
│                                     │
│     No milestones yet               │
│     Break this goal into            │
│     measurable checkpoints          │
│                                     │
│     [+ Add First Milestone]         │
│                                     │
└─────────────────────────────────────┘
```

### 6. Terminal Goal States

When goal is **achieved** or **abandoned**:
- "Add Milestone" button is **disabled/hidden**
- Existing milestones are still viewable
- Show subtle message: "Goal is [state] - milestones locked"

---

## Data Flow

### Loading Milestones

Current `/api/onto/goals/[id]/full` endpoint returns `linkedEntities` but not milestones specifically. Two options:

**Option A: Fetch via edges**

```typescript
// In GoalEditModal, after loading goal:
const milestonesResponse = await fetch(
  `/api/onto/edges?src_kind=goal&src_id=${goalId}&rel=has_milestone&dst_kind=milestone`
);
const { edges } = await milestonesResponse.json();

// Then fetch milestone details for each edge.dst_id
// OR use a batch endpoint
```

**Option B: Extend /full endpoint (Recommended)**

Update `/api/onto/goals/[id]/full` to include milestones:

```typescript
// Response shape:
{
  data: {
    goal: { ... },
    linkedEntities: { ... },
    milestones: [           // NEW
      { id, title, due_at, state_key, ... },
      ...
    ]
  }
}
```

### Creating Milestones

Reuse existing endpoint:
```
POST /api/onto/milestones/create
{
  project_id: string,
  title: string,
  due_at?: string,
  goal_id: string  // Creates edge automatically
}
```

### Updating Milestones

Reuse existing endpoint:
```
PATCH /api/onto/milestones/[id]
{
  title?: string,
  due_at?: string,
  state_key?: string
}
```

### Refreshing After Changes

After milestone create/update/delete:
1. Invalidate cached milestones
2. Re-fetch from API
3. Update UI with new data

---

## Component Structure

### New Components

1. **`GoalMilestonesSidebarSection.svelte`**
   - Standalone sidebar card for milestones
   - Props: `goalId`, `goalName`, `goalState`, `projectId`, `milestones`, `onMilestoneCreated`, `onMilestoneUpdated`
   - Handles display, progress, add button, quick toggle

2. **Optional: `MilestoneInlineCreateForm.svelte`**
   - Inline form for quick milestone creation
   - Props: `goalId`, `projectId`, `onCreated`, `onCancel`
   - Just title + due date fields

### Modified Components

1. **`GoalEditModal.svelte`**
   - Add `milestones` state variable
   - Load milestones on mount (via extended /full endpoint or separate fetch)
   - Render `GoalMilestonesSidebarSection` in sidebar
   - Handle milestone modal navigation

2. **`/api/onto/goals/[id]/full/+server.ts`** (optional)
   - Extend response to include milestones for this goal

---

## Implementation Phases

### Phase 1: MVP (Option B approach)

1. Add `GoalMilestonesSidebarSection` component
2. Load milestones via separate edges query in GoalEditModal
3. "Add Milestone" opens existing MilestoneCreateModal
4. Clicking milestone opens existing MilestoneEditModal
5. Basic progress indicator

### Phase 2: Enhanced Experience

1. Extend `/full` endpoint to include milestones (single request)
2. Add inline quick create form
3. Add quick toggle complete action
4. Add progress bar visualization

### Phase 3: Polish

1. Optimistic updates
2. Animations for add/remove
3. Reorder milestones (drag & drop)
4. Mobile-optimized layout

---

## Acceptance Criteria

### Must Have

- [ ] Milestones section visible in GoalEditModal sidebar
- [ ] Shows existing milestones for current goal
- [ ] Can create new milestone from within modal
- [ ] Can click milestone to edit
- [ ] Shows progress (X/Y completed)
- [ ] Handles empty state gracefully
- [ ] Respects goal terminal states (achieved/abandoned)

### Should Have

- [ ] Quick toggle complete on hover
- [ ] Sorted by state (active first) then due date
- [ ] Progress bar visualization

### Nice to Have

- [ ] Inline quick create form
- [ ] Animations on add/remove
- [ ] Drag & drop reorder

---

## Related Files

| File | Purpose |
|------|---------|
| `GoalEditModal.svelte` | Parent modal to modify |
| `GoalMilestonesSection.svelte` | Existing component (project page version) |
| `MilestoneListItem.svelte` | Reusable milestone row component |
| `MilestoneCreateModal.svelte` | Full milestone creation modal |
| `MilestoneEditModal.svelte` | Full milestone edit modal |
| `/api/onto/goals/[id]/full/+server.ts` | Endpoint to extend |
| `/api/onto/milestones/create/+server.ts` | Milestone creation endpoint |

---

## Open Questions

1. **Should milestones in sidebar be editable inline?** Or always open the full edit modal?
   - Recommendation: Start with modal, add inline editing later if needed

2. **Should we show milestone description in sidebar?** Or just title + due date?
   - Recommendation: Just title + due date + state icon to keep it compact

3. **Progress bar: simple or detailed?** Count vs percentage vs visual timeline?
   - Recommendation: Simple count (2/5) + optional progress bar

4. **Offline support?** Should milestone changes work offline?
   - Recommendation: Not in MVP, consider later

---

## Notes

- Reuse existing `MilestoneListItem.svelte` component where possible
- Follow Inkprint design system for all new components
- Ensure responsive design (sidebar collapses on mobile)
- Consider accessibility: keyboard navigation, ARIA labels
