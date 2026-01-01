<!-- apps/web/docs/features/mobile-command-center/MOBILE_COMMAND_CENTER_SPEC.md -->

# Mobile Command Center Specification

> **Version:** 1.0
> **Created:** 2025-12-31
> **Status:** Implementation Ready
> **Author:** BuildOS Design System

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Design Philosophy](#2-design-philosophy)
3. [Layout Architecture](#3-layout-architecture)
4. [Decisions Entity](#4-decisions-entity)
5. [Component Specifications](#5-component-specifications)
6. [Interaction Design](#6-interaction-design)
7. [Visual Design](#7-visual-design)
8. [Implementation Plan](#8-implementation-plan)
9. [File Manifest](#9-file-manifest)
10. [Testing Requirements](#10-testing-requirements)

---

## 1. Executive Summary

### Problem Statement

The current project detail page (`/projects/[id]`) on mobile requires excessive vertical scrolling to access all project data models. Users cannot quickly scan and navigate between Goals, Milestones, Tasks, Plans, Risks, Documents, and Outputs. The layout is not optimized for the "command center" mental model that power users need.

### Solution

Transform the mobile project page into an **ultra-condensed command center** with:

- **Paired panel rows** - Two related data models per row
- **Single-expansion accordion** - Only one panel open at a time globally
- **Fluid wrap behavior** - Expanded panel takes full width, partner wraps below
- **New Decisions entity** - Complete the ontology with decision tracking

### Key Decisions Made

| Decision                | Choice    | Rationale                                    |
| ----------------------- | --------- | -------------------------------------------- |
| Create Decisions entity | Yes       | Completes project ontology, pairs with Risks |
| Persist expanded state  | No        | Fresh state each load, simpler UX            |
| Desktop layout changes  | No        | Desktop remains unchanged                    |
| Graph section           | Unchanged | Already well-positioned                      |

---

## 2. Design Philosophy

### 2.1 Command Center Mental Model

The mobile layout should feel like a **mission control dashboard**:

- **At-a-glance status** - See all 8 data models with counts instantly
- **One-tap access** - Any section accessible with a single tap
- **Zero cognitive overload** - Only one expanded section at a time
- **Spatial memory** - Consistent positions help users build muscle memory

### 2.2 Information Density Principles

Following the Inkprint design system's density guidelines:

```
┌─────────────────────────────────────────────────────────────┐
│  MAXIMUM DENSITY ZONE                                       │
│  • Minimal padding (px-2.5 py-2)                           │
│  • Tight gaps (gap-1.5 = 6px)                              │
│  • Small text (text-xs base)                               │
│  • Icons as anchors (w-4 h-4)                              │
│  • Counts inline with labels                               │
└─────────────────────────────────────────────────────────────┘
```

### 2.3 Touch-First Design

- **44px minimum** touch targets on all interactive elements
- **Thumb-zone optimization** - Most-used panels toward bottom of viewport
- **Swipe-friendly** - No horizontal scroll conflicts
- **Visual feedback** - `pressable` class on all tappable elements

---

## 3. Layout Architecture

### 3.1 Row Configuration

The command center organizes 8 data models into 4 paired rows:

```
┌─────────────────────────────────────────────────────────────┐
│                    STICKY HEADER                            │
│            (Project name, state, next step)                 │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │   🎯 Goals (3)  │  │  🚩 Milestones  │   ROW 1          │
│  │                 │  │      (2)        │   Strategic      │
│  └─────────────────┘  └─────────────────┘                  │
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │  ☑️ Tasks (12)  │  │  📅 Plans (4)   │   ROW 2          │
│  │                 │  │                 │   Execution      │
│  └─────────────────┘  └─────────────────┘                  │
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │  ⚠️ Risks (2)   │  │  ⚖️ Decisions   │   ROW 3          │
│  │                 │  │      (5)        │   Governance     │
│  └─────────────────┘  └─────────────────┘                  │
│                                                             │
│  ┌─────────────────┐  ┌─────────────────┐                  │
│  │  📄 Documents   │  │  📦 Outputs (3) │   ROW 4          │
│  │      (7)        │  │                 │   Artifacts      │
│  └─────────────────┘  └─────────────────┘                  │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Row Semantic Groupings

| Row | Left Panel | Right Panel | Theme                                 |
| --- | ---------- | ----------- | ------------------------------------- |
| 1   | Goals      | Milestones  | **Strategic** - Where we're going     |
| 2   | Tasks      | Plans       | **Execution** - How we get there      |
| 3   | Risks      | Decisions   | **Governance** - Managing uncertainty |
| 4   | Documents  | Outputs     | **Artifacts** - What we produce       |

### 3.3 Collapsed State Dimensions

```css
/* Each panel in collapsed state */
.panel-collapsed {
	width: calc(50% - 3px); /* Half row minus half gap */
	height: 52px; /* Fixed collapsed height */
}

/* Row container */
.command-row {
	display: flex;
	flex-wrap: wrap;
	gap: 6px;
	align-items: flex-start;
}
```

### 3.4 Expanded State Behavior

When a panel expands:

1. **Expanding panel** → `width: 100%`, content revealed with `max-height: 192px` (scrollable)
2. **Partner panel** → `width: 100%`, `order: 2`, wraps to next line
3. **All other panels** → Collapse automatically (single-expansion constraint)

```
BEFORE (both collapsed):
┌────────────────┐ ┌────────────────┐
│  Goals (3)     │ │  Milestones    │
└────────────────┘ └────────────────┘

AFTER (Goals expanded):
┌─────────────────────────────────────┐
│  🎯 Goals (3)                    ▼  │
├─────────────────────────────────────┤
│  • Launch MVP by Q2                 │
│  • Reach 1000 users                 │
│  • Secure Series A                  │
│  [+ Add Goal]                       │
└─────────────────────────────────────┘
┌─────────────────────────────────────┐
│  🚩 Milestones (2)               ▶  │  ← Wrapped below
└─────────────────────────────────────┘
```

---

## 4. Decisions Entity

### 4.1 Rationale

The project ontology currently tracks:

- **Goals** - What success looks like
- **Milestones** - Checkpoints and deadlines
- **Tasks** - Atomic work items
- **Plans** - Execution scaffolding
- **Risks** - What could go wrong
- **Documents** - Notes and research
- **Outputs** - Deliverables

Missing: **Decisions** - The choices that shape the project.

Decisions pair naturally with Risks in the "Governance" row because:

- Risks often require decisions to mitigate
- Decisions often create or resolve risks
- Both represent project meta-information vs. work items

### 4.2 Data Model

```sql
CREATE TABLE onto_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES onto_projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  outcome TEXT,                    -- What was decided
  rationale TEXT,                  -- Why this decision was made
  state_key TEXT NOT NULL DEFAULT 'pending',
  decision_at TIMESTAMPTZ,         -- When the decision was made
  props JSONB DEFAULT '{}',        -- Extensible properties
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4.3 State Machine

```
                    ┌─────────┐
                    │ pending │
                    └────┬────┘
                         │
            ┌────────────┼────────────┐
            ▼            │            ▼
       ┌────────┐        │       ┌──────────┐
       │  made  │◄───────┼───────│ deferred │
       └────┬───┘        │       └──────────┘
            │            │
            ▼            │
       ┌──────────┐      │
       │ reversed │──────┘
       └──────────┘
```

| State      | Meaning             | Icon Color              |
| ---------- | ------------------- | ----------------------- |
| `pending`  | Awaiting decision   | `text-muted-foreground` |
| `made`     | Decision finalized  | `text-emerald-500`      |
| `deferred` | Postponed for later | `text-amber-500`        |
| `reversed` | Decision overturned | `text-red-500`          |

### 4.4 TypeScript Interface

```typescript
export interface Decision {
	id: string;
	project_id: string;
	title: string;
	description?: string | null;
	outcome?: string | null;
	rationale?: string | null;
	state_key: 'pending' | 'made' | 'deferred' | 'reversed';
	decision_at?: string | null;
	props?: Record<string, unknown> | null;
	created_at: string;
	updated_at: string;
}
```

### 4.5 API Endpoints

| Method | Endpoint                           | Purpose                    |
| ------ | ---------------------------------- | -------------------------- |
| GET    | `/api/onto/decisions?project_id=X` | List decisions for project |
| POST   | `/api/onto/decisions`              | Create new decision        |
| GET    | `/api/onto/decisions/[id]`         | Get single decision        |
| PATCH  | `/api/onto/decisions/[id]`         | Update decision            |
| DELETE | `/api/onto/decisions/[id]`         | Delete decision            |

---

## 5. Component Specifications

### 5.1 Component Tree

```
MobileCommandCenter.svelte
│
├── CommandCenterRow.svelte (× 4)
│   │
│   ├── CommandCenterPanel.svelte (left)
│   │   └── [Entity-specific item list]
│   │
│   └── CommandCenterPanel.svelte (right)
│       └── [Entity-specific item list]
│
└── [Existing modals for create/edit]
```

### 5.2 MobileCommandCenter.svelte

**Purpose:** Container component that orchestrates the 4 rows and manages global expansion state.

**Props:**

```typescript
interface MobileCommandCenterProps {
	// Data
	goals: Goal[];
	milestones: Milestone[];
	tasks: Task[];
	plans: Plan[];
	risks: Risk[];
	decisions: Decision[];
	documents: Document[];
	outputs: Output[];

	// Callbacks
	onAddGoal: () => void;
	onAddMilestone: () => void;
	onAddTask: () => void;
	onAddPlan: () => void;
	onAddRisk: () => void;
	onAddDecision: () => void;
	onAddDocument: () => void;
	onAddOutput: () => void;

	onEditGoal: (id: string) => void;
	onEditMilestone: (id: string) => void;
	onEditTask: (id: string) => void;
	onEditPlan: (id: string) => void;
	onEditRisk: (id: string) => void;
	onEditDecision: (id: string) => void;
	onEditDocument: (id: string) => void;
	onEditOutput: (id: string) => void;
}
```

**Internal State:**

```typescript
type PanelKey =
	| 'goals'
	| 'milestones'
	| 'tasks'
	| 'plans'
	| 'risks'
	| 'decisions'
	| 'documents'
	| 'outputs';

let expandedPanel = $state<PanelKey | null>(null);

function togglePanel(key: PanelKey) {
	expandedPanel = expandedPanel === key ? null : key;
}
```

### 5.3 CommandCenterRow.svelte

**Purpose:** Wraps two panels with flex-wrap behavior for expansion.

**Props:**

```typescript
interface CommandCenterRowProps {
	leftKey: PanelKey;
	rightKey: PanelKey;
	expandedPanel: PanelKey | null;
	children: Snippet; // The two panels
}
```

**Template:**

```svelte
<div class="flex flex-wrap gap-1.5">
	{@render children()}
</div>
```

### 5.4 CommandCenterPanel.svelte

**Purpose:** Individual collapsible panel with header and content.

**Props:**

```typescript
interface CommandCenterPanelProps {
	key: PanelKey;
	label: string;
	icon: ComponentType;
	iconColor: string;
	count: number;
	expanded: boolean;
	partnerExpanded: boolean; // Is the sibling panel expanded?
	onToggle: (key: PanelKey) => void;
	onAdd: () => void;
	emptyMessage: string;
	children: Snippet; // Item list content
}
```

**Computed Classes:**

```typescript
const panelClasses = $derived(() => {
	if (expanded) return 'w-full';
	if (partnerExpanded) return 'w-full order-2';
	return 'w-[calc(50%-3px)]';
});
```

---

## 6. Interaction Design

### 6.1 Tap Interactions

| Element                  | Action | Result                                |
| ------------------------ | ------ | ------------------------------------- |
| Panel header (collapsed) | Tap    | Expand this panel, collapse any other |
| Panel header (expanded)  | Tap    | Collapse this panel                   |
| Add button               | Tap    | Open create modal for entity type     |
| Item row                 | Tap    | Open edit modal for that item         |
| Chevron icon             | Tap    | Same as panel header                  |

### 6.2 Expansion Animation

```css
/* Panel width transition */
.cc-panel {
	transition:
		flex-basis 200ms cubic-bezier(0.4, 0, 0.2, 1),
		order 0ms; /* Order change is instant */
}

/* Content reveal */
.cc-content {
	/* Uses Svelte slide transition */
	transition: slide 150ms;
}

/* Chevron rotation */
.cc-chevron {
	transition: transform 150ms ease;
}
.cc-chevron-open {
	transform: rotate(180deg);
}
```

### 6.3 Scroll Behavior

When a panel expands:

1. Content area has `max-height: 192px` (12rem)
2. If content exceeds, shows vertical scrollbar
3. Scrollbar styled minimally: `scrollbar-thin scrollbar-thumb-border`
4. Panel does NOT auto-scroll into view (user initiated action)

### 6.4 Empty States

Each panel type has a contextual empty state message:

| Panel      | Empty Message                    |
| ---------- | -------------------------------- |
| Goals      | "Define what success looks like" |
| Milestones | "Set checkpoints and dates"      |
| Tasks      | "Add tasks to track work"        |
| Plans      | "Create a plan to organize work" |
| Risks      | "Track potential blockers"       |
| Decisions  | "Record key choices"             |
| Documents  | "Add notes and research"         |
| Outputs    | "Create deliverables"            |

---

## 7. Visual Design

### 7.1 Panel Anatomy

```
┌─────────────────────────────────────────────────────────────┐
│ COLLAPSED PANEL (52px height)                               │
│                                                             │
│  ┌──────┐                                                   │
│  │ Icon │  Label (count)                              ▶     │
│  └──────┘                                                   │
│                                                             │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ EXPANDED PANEL                                              │
│                                                             │
│  ┌──────┐                                                   │
│  │ Icon │  Label (count)                              ▼     │
│  └──────┘                                                   │
├─────────────────────────────────────────────────────────────┤
│                                          [+ Add]            │
├─────────────────────────────────────────────────────────────┤
│  ┌────┐                                                     │
│  │ •  │  Item title                              State      │
│  └────┘                                                     │
│  ┌────┐                                                     │
│  │ •  │  Item title                              State      │
│  └────┘                                                     │
│  ┌────┐                                                     │
│  │ •  │  Item title                              State      │
│  └────┘                                                     │
│                            (scrollable if more items)       │
└─────────────────────────────────────────────────────────────┘
```

### 7.2 Color Palette

| Panel      | Icon            | Icon Color         | Texture               |
| ---------- | --------------- | ------------------ | --------------------- |
| Goals      | `Target`        | `text-amber-500`   | `tx tx-frame tx-weak` |
| Milestones | `Flag`          | `text-emerald-500` | `tx tx-frame tx-weak` |
| Tasks      | `ListChecks`    | `text-slate-500`   | `tx tx-frame tx-weak` |
| Plans      | `Calendar`      | `text-indigo-500`  | `tx tx-frame tx-weak` |
| Risks      | `AlertTriangle` | `text-red-500`     | `tx tx-frame tx-weak` |
| Decisions  | `Scale`         | `text-violet-500`  | `tx tx-frame tx-weak` |
| Documents  | `FileText`      | `text-sky-500`     | `tx tx-frame tx-weak` |
| Outputs    | `Layers`        | `text-purple-500`  | `tx tx-frame tx-weak` |

### 7.3 Typography Scale

| Element       | Classes                                 |
| ------------- | --------------------------------------- |
| Panel label   | `text-xs font-semibold text-foreground` |
| Count badge   | `text-[10px] text-muted-foreground`     |
| Item title    | `text-xs text-foreground`               |
| Item metadata | `text-[10px] text-muted-foreground`     |
| Empty state   | `text-xs text-muted-foreground`         |
| Add button    | `text-[10px] font-medium`               |

### 7.4 Spacing Tokens

| Element         | Value           |
| --------------- | --------------- |
| Row gap         | `gap-1.5` (6px) |
| Panel gap       | `gap-1.5` (6px) |
| Header padding  | `px-2.5 py-2`   |
| Content padding | `px-2.5`        |
| Item padding    | `px-2.5 py-1.5` |
| Icon size       | `w-4 h-4`       |
| Chevron size    | `w-3.5 h-3.5`   |

### 7.5 Inkprint Styling

All panels use consistent Inkprint tokens:

```svelte
<div class="
  bg-card
  border border-border
  rounded-lg
  shadow-ink
  tx tx-frame tx-weak
  overflow-hidden
">
```

---

## 8. Implementation Plan

### Phase 1: Decisions Entity

1. **Database Migration** - Create `onto_decisions` table
2. **TypeScript Types** - Add Decision interface
3. **API Endpoints** - CRUD operations
4. **Create Modal** - DecisionCreateModal.svelte
5. **Edit Modal** - DecisionEditModal.svelte
6. **Integration** - Add to project page data loading

### Phase 2: Command Center Components

1. **CommandCenterPanel.svelte** - Individual panel component
2. **CommandCenterRow.svelte** - Paired row wrapper
3. **MobileCommandCenter.svelte** - Main container

### Phase 3: Project Page Integration

1. **Add mobile layout** - `sm:hidden` wrapper with command center
2. **Wire up state** - Connect expandedPanel state
3. **Wire up callbacks** - Connect to existing modals
4. **Add decisions data** - Load and display decisions

### Phase 4: Polish

1. **Animations** - Refine transitions
2. **Empty states** - Add contextual messages
3. **Skeleton loading** - Add loading state
4. **Testing** - Cross-device testing

---

## 9. File Manifest

### New Files

| File                                                                         | Purpose                              |
| ---------------------------------------------------------------------------- | ------------------------------------ |
| `supabase/migrations/XXXXXX_create_onto_decisions.sql`                       | Database migration                   |
| `src/lib/types/onto-decisions.ts`                                            | TypeScript types (or add to onto.ts) |
| `src/routes/api/onto/decisions/+server.ts`                                   | List/Create API                      |
| `src/routes/api/onto/decisions/[id]/+server.ts`                              | Get/Update/Delete API                |
| `src/lib/components/ontology/DecisionCreateModal.svelte`                     | Create modal                         |
| `src/lib/components/ontology/DecisionEditModal.svelte`                       | Edit modal                           |
| `src/lib/components/project/CommandCenterPanel.svelte`                       | Panel component                      |
| `src/lib/components/project/CommandCenterRow.svelte`                         | Row component                        |
| `src/lib/components/project/MobileCommandCenter.svelte`                      | Main component                       |
| `apps/web/docs/features/mobile-command-center/MOBILE_COMMAND_CENTER_SPEC.md` | This spec                            |

### Modified Files

| File                                                | Changes                       |
| --------------------------------------------------- | ----------------------------- |
| `src/lib/types/onto.ts`                             | Add Decision type export      |
| `src/routes/projects/[id]/+page.svelte`             | Add mobile command center     |
| `src/routes/projects/[id]/+page.server.ts`          | Add decision_count            |
| `src/routes/api/onto/projects/[id]/full/+server.ts` | Include decisions             |
| `src/routes/api/onto/projects/[id]/+server.ts`      | Include decisions in response |

---

## 10. Testing Requirements

### 10.1 Device Testing

| Device            | Viewport | Priority |
| ----------------- | -------- | -------- |
| iPhone SE         | 375px    | Critical |
| iPhone 14         | 390px    | Critical |
| iPhone 14 Pro Max | 430px    | High     |
| Galaxy S21        | 360px    | High     |
| Pixel 7           | 412px    | Medium   |

### 10.2 Functional Tests

- [ ] Single expansion constraint works across all panels
- [ ] Expanding panel A closes panel B
- [ ] Partner panel wraps correctly below expanded panel
- [ ] All "Add" buttons trigger correct modals
- [ ] All item clicks trigger correct edit modals
- [ ] Empty states display when no items
- [ ] Counts update after create/edit/delete
- [ ] Decisions CRUD operations work correctly

### 10.3 Visual Tests

- [ ] Collapsed panels are exactly 52px height
- [ ] Expanded content scrolls at 192px max-height
- [ ] Icons display correct colors
- [ ] Transitions are smooth (60fps)
- [ ] No layout shift during transitions
- [ ] Dark mode renders correctly

### 10.4 Accessibility Tests

- [ ] All panels keyboard navigable
- [ ] `aria-expanded` attributes present
- [ ] Focus visible on all interactive elements
- [ ] Touch targets ≥ 44px
- [ ] Screen reader announces panel states

---

## Appendix A: Decision Modal Fields

### Create Modal

| Field         | Type           | Required | Validation       |
| ------------- | -------------- | -------- | ---------------- |
| Title         | text input     | Yes      | 1-200 chars      |
| Description   | textarea       | No       | Max 2000 chars   |
| Outcome       | textarea       | No       | Max 1000 chars   |
| Rationale     | textarea       | No       | Max 1000 chars   |
| State         | select         | Yes      | Default: pending |
| Decision Date | datetime-local | No       | Valid date       |

### Edit Modal

Same as create, plus:

- Delete button with confirmation
- Created/Updated timestamps display

---

## Appendix B: Skeleton Loading

When `isHydrating` is true, show skeleton panels:

```svelte
<div class="flex flex-wrap gap-1.5">
	<div class="w-[calc(50%-3px)] h-[52px] bg-muted animate-pulse rounded-lg" />
	<div class="w-[calc(50%-3px)] h-[52px] bg-muted animate-pulse rounded-lg" />
</div>
```

Repeat for all 4 rows.

---

_End of Specification_
