---
title: "Insight Panels Migration Guide - Applying Semantic Visual Patterns"
date: 2026-01-25
status: ready-for-implementation
tags: [migration, implementation, insight-panels, ontology]
related:
  - /thoughts/shared/research/2026-01-25_ontology-entity-semantic-visual-design.md
  - /thoughts/shared/research/2026-01-25_ontology-visual-patterns-quick-ref.md
  - /apps/web/src/routes/projects/[id]/+page.svelte
path: thoughts/shared/research/2026-01-25_insight-panels-migration-guide.md
---

# Insight Panels Migration Guide

**Goal:** Update the insight panels in `/apps/web/src/routes/projects/[id]/+page.svelte` to use the new semantic visual patterns for all entity types.

---

## Current vs. New Patterns

### Before (Current Implementation)

```svelte
<!-- Current Task List Item -->
<li>
  <div class="flex items-center min-w-0">
    <button
      type="button"
      onclick={() => (editingTaskId = task.id)}
      class="flex-1 min-w-0 flex items-center gap-3 px-4 py-3 text-left hover:bg-accent/5 transition-colors pressable"
    >
      <TaskIcon class="w-4 h-4 flex-shrink-0 {visuals.color}" />
      <div class="min-w-0 flex-1">
        <p class="text-sm text-foreground truncate">{task.title}</p>
        <p class="text-xs text-muted-foreground">
          <span class="capitalize">{(task.state_key || 'draft').replace(/_/g, ' ')}</span>
          <span class="mx-1 opacity-50">·</span>
          <span class={sortDisplay.color || ''}>{sortDisplay.value}</span>
        </p>
      </div>
    </button>
    <a
      href="/projects/{project.id}/tasks/{task.id}"
      class="flex-shrink-0 p-2 mr-2 rounded-lg hover:bg-accent/10 transition-colors pressable"
      title="Open task focus page"
    >
      <ExternalLink class="w-4 h-4 text-muted-foreground hover:text-accent" />
    </a>
  </div>
</li>
```

**Issues:**
- ❌ No entity-specific texture or weight
- ❌ No semantic border styling
- ❌ No background color differentiation
- ❌ Generic hover state
- ❌ Spacing is `px-4 py-3` (not using dense scale)

### After (New Implementation)

```svelte
<!-- New Task List Item -->
<li>
  <div class="flex items-center min-w-0">
    <button
      type="button"
      onclick={() => (editingTaskId = task.id)}
      class="
        flex-1 min-w-0 flex items-center gap-3 px-3 py-2.5 rounded-lg text-left
        {getTaskBorderClass(task.state_key)}
        {getTaskBackgroundClass(task.state_key)}
        {getTaskHoverClass(task.state_key)}
        tx tx-grain tx-weak
        {getTaskWeightClass(task.state_key)}
        transition-colors pressable
      "
    >
      <TaskIcon class="w-4 h-4 shrink-0 {visuals.color}" />
      <div class="min-w-0 flex-1">
        <p class="text-sm {task.state_key === 'done' ? 'text-muted-foreground line-through' : 'text-foreground'} truncate">
          {task.title}
        </p>
        <p class="text-xs text-muted-foreground">
          <span class="capitalize">{(task.state_key || 'draft').replace(/_/g, ' ')}</span>
          <span class="mx-1 opacity-50">·</span>
          <span class={sortDisplay.color || ''}>{sortDisplay.value}</span>
        </p>
      </div>
    </button>
    <a
      href="/projects/{project.id}/tasks/{task.id}"
      class="flex-shrink-0 p-2 mr-2 rounded-lg hover:bg-accent/10 transition-colors pressable"
      title="Open task focus page"
    >
      <ExternalLink class="w-4 h-4 text-muted-foreground hover:text-accent" />
    </a>
  </div>
</li>
```

**Improvements:**
- ✅ Entity-specific texture (`tx-grain`)
- ✅ State-based weight class
- ✅ Semantic border and background
- ✅ Entity-specific hover state
- ✅ Proper spacing (`px-3 py-2.5`)
- ✅ Border radius (`rounded-lg`)

---

## Helper Functions to Add

Add these helper functions to `/apps/web/src/routes/projects/[id]/+page.svelte`:

```typescript
// ============================================================
// ENTITY VISUAL STYLING HELPERS
// ============================================================

/**
 * Get task border class based on state
 */
function getTaskBorderClass(state: string | null | undefined): string {
  switch (state) {
    case 'done':
      return 'border border-emerald-500/30';
    case 'in_progress':
    case 'active':
      return 'border border-amber-500/30';
    default:
      return 'border border-border';
  }
}

/**
 * Get task background class based on state
 */
function getTaskBackgroundClass(state: string | null | undefined): string {
  switch (state) {
    case 'done':
      return 'bg-emerald-50/30 dark:bg-emerald-900/10';
    case 'in_progress':
    case 'active':
      return 'bg-amber-50/30 dark:bg-amber-900/10';
    default:
      return 'bg-card';
  }
}

/**
 * Get task hover class based on state
 */
function getTaskHoverClass(state: string | null | undefined): string {
  switch (state) {
    case 'done':
      return 'hover:bg-emerald-100/40 dark:hover:bg-emerald-900/20';
    case 'in_progress':
    case 'active':
      return 'hover:bg-amber-100/40 dark:hover:bg-amber-900/20';
    default:
      return 'hover:bg-muted/30';
  }
}

/**
 * Get task weight class based on state
 */
function getTaskWeightClass(state: string | null | undefined): string {
  switch (state) {
    case 'done':
      return 'wt-card';
    case 'in_progress':
    case 'active':
      return 'wt-paper';
    default:
      return 'wt-ghost';
  }
}

/**
 * Get plan border and background classes
 */
function getPlanClasses(state: string | null | undefined): {
  border: string;
  bg: string;
  hover: string;
} {
  return {
    border: 'border-l-4 border-indigo-500',
    bg: 'bg-indigo-50/50 dark:bg-indigo-900/10',
    hover: 'hover:bg-indigo-100/50 dark:hover:bg-indigo-900/20'
  };
}

/**
 * Get goal border and background classes
 */
function getGoalClasses(state: string | null | undefined): {
  border: string;
  bg: string;
  hover: string;
} {
  return {
    border: 'border-l-4 border-amber-500',
    bg: 'bg-amber-50/50 dark:bg-amber-900/10',
    hover: 'hover:bg-amber-100/50 dark:hover:bg-amber-900/20'
  };
}

/**
 * Get risk border, background, and weight classes by severity
 */
function getRiskClasses(severity: string | null | undefined): {
  border: string;
  bg: string;
  hover: string;
  weight: string;
  iconClass: string;
} {
  const isHigh = severity === 'high' || severity === 'critical';

  return {
    border: isHigh
      ? 'border-2 border-dashed border-red-600'
      : 'border-2 border-dashed border-red-500/40',
    bg: isHigh
      ? 'bg-red-50 dark:bg-red-900/20'
      : 'bg-red-50/40 dark:bg-red-900/10',
    hover: isHigh
      ? 'hover:bg-red-100 dark:hover:bg-red-900/30'
      : 'hover:bg-red-100/50 dark:hover:bg-red-900/20',
    weight: isHigh ? 'wt-card' : 'wt-paper',
    iconClass: isHigh ? 'text-red-600 animate-pulse' : 'text-red-500'
  };
}

/**
 * Get event border and background classes
 */
function getEventClasses(state: string | null | undefined): {
  border: string;
  bg: string;
  hover: string;
} {
  return {
    border: 'border border-blue-500/30',
    bg: 'bg-blue-50/40 dark:bg-blue-900/10',
    hover: 'hover:bg-blue-100/50 dark:hover:bg-blue-900/20'
  };
}
```

---

## Migration Steps

### Step 1: Update Task List Items

**Location:** Lines ~1872-1949 in `/apps/web/src/routes/projects/[id]/+page.svelte`

```svelte
{#if section.key === 'tasks'}
  {#if filteredTasks.length > 0}
    <ul class="divide-y divide-border/80">
      {#each filteredTasks as task}
        {@const visuals = getTaskVisuals(task.state_key)}
        {@const TaskIcon = visuals.icon}
        {@const sortDisplay = getSortValueDisplay(
          task as unknown as Record<string, unknown>,
          panelStates.tasks.sort.field,
          'tasks'
        )}
        <li>
          <div class="flex items-center min-w-0">
            <button
              type="button"
              onclick={() => (editingTaskId = task.id)}
              class="
                flex-1 min-w-0 flex items-center gap-3 px-3 py-2.5 rounded-lg text-left
                {getTaskBorderClass(task.state_key)}
                {getTaskBackgroundClass(task.state_key)}
                {getTaskHoverClass(task.state_key)}
                tx tx-grain tx-weak
                {getTaskWeightClass(task.state_key)}
                transition-colors pressable
              "
            >
              <TaskIcon class="w-4 h-4 shrink-0 {visuals.color}" />
              <div class="min-w-0 flex-1">
                <p
                  class="text-sm {task.state_key === 'done'
                    ? 'text-muted-foreground line-through'
                    : 'text-foreground'} truncate"
                >
                  {task.title}
                </p>
                <p class="text-xs text-muted-foreground">
                  <span class="capitalize"
                    >{(task.state_key || 'draft').replace(/_/g, ' ')}</span
                  >
                  <span class="mx-1 opacity-50">·</span>
                  <span class={sortDisplay.color || ''}>
                    {sortDisplay.value}
                  </span>
                </p>
              </div>
            </button>
            <a
              href="/projects/{project.id}/tasks/{task.id}"
              class="flex-shrink-0 p-2 mr-2 rounded-lg hover:bg-accent/10 transition-colors pressable"
              title="Open task focus page"
            >
              <ExternalLink class="w-4 h-4 text-muted-foreground hover:text-accent" />
            </a>
          </div>
        </li>
      {/each}
    </ul>
  {:else}
    <div class="px-4 py-4 text-center">
      <p class="text-sm text-muted-foreground">No tasks yet</p>
      <p class="text-xs text-muted-foreground/70 mt-1">Add tasks to track work</p>
    </div>
  {/if}
{/if}
```

### Step 2: Update Plan List Items

**Location:** Lines ~1950-2010 in `/apps/web/src/routes/projects/[id]/+page.svelte`

```svelte
{:else if section.key === 'plans'}
  {#if filteredPlans.length > 0}
    <ul class="divide-y divide-border/80">
      {#each filteredPlans as plan}
        {@const sortDisplay = getSortValueDisplay(
          plan as unknown as Record<string, unknown>,
          panelStates.plans.sort.field,
          'plans'
        )}
        {@const classes = getPlanClasses(plan.state_key)}
        <li>
          <button
            type="button"
            onclick={() => (editingPlanId = plan.id)}
            class="
              w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left
              {classes.border}
              {classes.bg}
              {classes.hover}
              tx tx-grain tx-weak wt-paper
              transition-colors pressable
            "
          >
            <Calendar class="w-4 h-4 text-indigo-500 shrink-0" />
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-foreground truncate">{plan.name}</p>
              <p class="text-xs text-muted-foreground">
                <span class="capitalize"
                  >{(plan.state_key || 'draft').replace(/_/g, ' ')}</span
                >
                <span class="mx-1 opacity-50">·</span>
                <span class={sortDisplay.color || ''}>
                  {sortDisplay.value}
                </span>
              </p>
            </div>
          </button>
        </li>
      {/each}
    </ul>
  {:else}
    <div class="px-3 sm:px-4 py-3 sm:py-4 text-center">
      <p class="text-xs sm:text-sm text-muted-foreground">No plans yet</p>
      <p class="text-[10px] sm:text-xs text-muted-foreground/70 mt-0.5 hidden sm:block">
        Create a plan to organize work
      </p>
    </div>
  {/if}
{/if}
```

### Step 3: Update Goal List Items

**Location:** Lines ~2011-2095 in `/apps/web/src/routes/projects/[id]/+page.svelte`

```svelte
{:else if section.key === 'goals'}
  {#if filteredGoals.length > 0}
    <div class="divide-y divide-border/80">
      {#each filteredGoals as goal (goal.id)}
        {@const sortDisplay = getSortValueDisplay(
          goal as unknown as Record<string, unknown>,
          panelStates.goals.sort.field,
          'goals'
        )}
        {@const goalMilestones = milestonesByGoalId.get(goal.id) || []}
        {@const classes = getGoalClasses(goal.state_key)}
        <!-- Goal Card with nested milestones -->
        <div class="bg-card">
          <!-- Goal Header (clickable to edit) -->
          <button
            type="button"
            onclick={() => (editingGoalId = goal.id)}
            class="
              w-full flex items-start gap-2 sm:gap-3 px-3 py-2.5 rounded-lg text-left
              {classes.border}
              {classes.bg}
              {classes.hover}
              tx tx-bloom tx-weak wt-paper
              transition-colors pressable
            "
          >
            <Target class="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <p class="text-sm font-medium text-foreground truncate flex-1">
                  {goal.name}
                </p>
                {#if goalMilestones.length > 0}
                  {@const completedCount = goalMilestones.filter(
                    (m) => resolveMilestoneState(m).state === 'completed'
                  ).length}
                  <span class="text-[10px] text-muted-foreground shrink-0">
                    {completedCount}/{goalMilestones.length}
                  </span>
                {/if}
              </div>
              <p class="text-xs text-muted-foreground">
                <span class="capitalize"
                  >{(goal.state_key || 'draft').replace(/_/g, ' ')}</span
                >
                <span class="mx-1 opacity-50">·</span>
                <span class={sortDisplay.color || ''}>
                  {sortDisplay.value}
                </span>
              </p>
            </div>
          </button>

          <!-- Nested Milestones Section -->
          <GoalMilestonesSection
            milestones={goalMilestones}
            goalId={goal.id}
            goalName={goal.name}
            goalState={goal.state_key}
            {canEdit}
            onAddMilestone={handleAddMilestoneFromGoal}
            onEditMilestone={(id) => (editingMilestoneId = id)}
            onToggleMilestoneComplete={handleToggleMilestoneComplete}
          />
        </div>
      {/each}
    </div>
  {:else}
    <div class="px-3 sm:px-4 py-3 sm:py-4 text-center">
      <p class="text-xs sm:text-sm text-muted-foreground">No goals yet</p>
      <p class="text-[10px] sm:text-xs text-muted-foreground/70 mt-0.5 hidden sm:block">
        Set goals to define success
      </p>
    </div>
  {/if}
{/if}
```

### Step 4: Update Risk List Items

**Location:** Lines ~2095+ in `/apps/web/src/routes/projects/[id]/+page.svelte`

```svelte
{:else if section.key === 'risks'}
  {#if filteredRisks.length > 0}
    <ul class="divide-y divide-border/80">
      {#each filteredRisks as risk}
        {@const sortDisplay = getSortValueDisplay(
          risk as unknown as Record<string, unknown>,
          panelStates.risks.sort.field,
          'risks'
        )}
        {@const severity = risk.props?.severity as string | undefined}
        {@const classes = getRiskClasses(severity)}
        <li>
          <button
            type="button"
            onclick={() => (editingRiskId = risk.id)}
            class="
              w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left
              {classes.border}
              {classes.bg}
              {classes.hover}
              tx tx-static tx-weak
              {classes.weight}
              transition-colors pressable
            "
          >
            <AlertTriangle class="w-4 h-4 shrink-0 {classes.iconClass}" />
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-foreground truncate">{risk.name}</p>
              <p class="text-xs text-muted-foreground">
                <span class="capitalize"
                  >{(risk.state_key || 'open').replace(/_/g, ' ')}</span
                >
                {#if severity}
                  <span class="mx-1 opacity-50">·</span>
                  <span class="capitalize">{severity} severity</span>
                {/if}
                <span class="mx-1 opacity-50">·</span>
                <span class={sortDisplay.color || ''}>
                  {sortDisplay.value}
                </span>
              </p>
            </div>
          </button>
        </li>
      {/each}
    </ul>
  {:else}
    <div class="px-3 sm:px-4 py-3 sm:py-4 text-center">
      <p class="text-xs sm:text-sm text-muted-foreground">No risks identified</p>
      <p class="text-[10px] sm:text-xs text-muted-foreground/70 mt-0.5 hidden sm:block">
        Document risks to track blockers
      </p>
    </div>
  {/if}
{/if}
```

### Step 5: Update Event List Items

```svelte
{:else if section.key === 'events'}
  {#if filteredEvents.length > 0}
    <ul class="divide-y divide-border/80">
      {#each filteredEvents as event}
        {@const sortDisplay = getSortValueDisplay(
          event as unknown as Record<string, unknown>,
          panelStates.events.sort.field,
          'events'
        )}
        {@const classes = getEventClasses(event.state_key)}
        <li>
          <button
            type="button"
            onclick={() => (editingEventId = event.id)}
            class="
              w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left
              {classes.border}
              {classes.bg}
              {classes.hover}
              tx tx-frame tx-weak wt-paper
              transition-colors pressable
            "
          >
            <Clock class="w-4 h-4 text-blue-500 shrink-0" />
            <div class="min-w-0 flex-1">
              <p class="text-sm font-medium text-foreground truncate">{event.name}</p>
              <p class="text-xs text-muted-foreground">
                <span class="capitalize"
                  >{(event.state_key || 'upcoming').replace(/_/g, ' ')}</span
                >
                <span class="mx-1 opacity-50">·</span>
                <span class={sortDisplay.color || ''}>
                  {sortDisplay.value}
                </span>
              </p>
            </div>
          </button>
        </li>
      {/each}
    </ul>
  {:else}
    <div class="px-3 sm:px-4 py-3 sm:py-4 text-center">
      <p class="text-xs sm:text-sm text-muted-foreground">No events scheduled</p>
      <p class="text-[10px] sm:text-xs text-muted-foreground/70 mt-0.5 hidden sm:block">
        Add events to track meetings and deadlines
      </p>
    </div>
  {/if}
{/if}
```

---

## Panel Header Update

Update the panel header icon container to use entity-specific colors:

**Current:**
```svelte
<div class="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center">
  <SectionIcon class="w-4 h-4 text-accent" />
</div>
```

**New (add helper function):**
```typescript
function getPanelIconColor(key: InsightPanelKey): string {
  switch (key) {
    case 'goals':
      return 'text-amber-500 bg-amber-500/10';
    case 'plans':
      return 'text-indigo-500 bg-indigo-500/10';
    case 'tasks':
      return 'text-slate-500 bg-slate-500/10';
    case 'risks':
      return 'text-red-500 bg-red-500/10';
    case 'events':
      return 'text-blue-500 bg-blue-500/10';
    default:
      return 'text-accent bg-accent/10';
  }
}
```

**Updated markup:**
```svelte
{@const iconColor = getPanelIconColor(section.key)}
<div class="w-9 h-9 rounded-lg flex items-center justify-center {iconColor}">
  <SectionIcon class="w-4 h-4" />
</div>
```

---

## Testing Checklist

After migration, verify:

- [ ] All task states render correctly (todo, in progress, done)
- [ ] All plan items have left indigo border
- [ ] All goal items have left amber border
- [ ] All risk items have dashed red border (with severity variations)
- [ ] All event items have blue styling
- [ ] Textures are visible but subtle
- [ ] Hover states show proper color tints
- [ ] Dark mode works correctly
- [ ] Spacing is consistent (px-3 py-2.5)
- [ ] Icons are proper size (w-4 h-4)
- [ ] Text truncates properly
- [ ] Mobile responsive (test on small screens)

---

## Performance Considerations

**Derived values for helper functions:**

Instead of calling helper functions in the template repeatedly, derive the classes once:

```svelte
{#each filteredTasks as task}
  {@const visuals = getTaskVisuals(task.state_key)}
  {@const TaskIcon = visuals.icon}
  {@const sortDisplay = getSortValueDisplay(...)}
  <!-- ADD THESE: -->
  {@const taskClasses = {
    border: getTaskBorderClass(task.state_key),
    bg: getTaskBackgroundClass(task.state_key),
    hover: getTaskHoverClass(task.state_key),
    weight: getTaskWeightClass(task.state_key)
  }}

  <button
    class="... {taskClasses.border} {taskClasses.bg} {taskClasses.hover} tx tx-grain tx-weak {taskClasses.weight} ..."
  >
    <!-- content -->
  </button>
{/each}
```

---

## Rollout Strategy

1. **Phase 1:** Add helper functions (non-breaking)
2. **Phase 2:** Update one entity type (Tasks) and test thoroughly
3. **Phase 3:** Update remaining entity types one at a time
4. **Phase 4:** Update panel header icons
5. **Phase 5:** Clean up old unused code

---

**Status:** ✅ Ready for Implementation

**Estimated Time:** 2-3 hours for full migration

**Risk:** Low - Changes are primarily CSS class additions
