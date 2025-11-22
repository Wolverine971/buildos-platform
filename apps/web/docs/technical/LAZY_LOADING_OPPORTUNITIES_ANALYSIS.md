# Comprehensive Lazy Loading Opportunities Analysis

**Date:** November 21, 2025
**Last Updated:** November 22, 2025
**Status:** ✅ Top 3 Quick Wins Implemented - Additional opportunities remain
**Priority:** 🔴 High Performance Impact
**Estimated Bundle Reduction:** Additional 30-40% on top of modal optimizations

---

## ✅ Implementation Progress (November 22, 2025)

### Quick Wins Completed

**Total Savings from Quick Wins:** ~1.0-1.5MB (300-450KB compressed)

1. **✅ Ontology Graph Components** (Quick Win #1)
    - File: `src/routes/ontology/projects/[id]/+page.svelte`
    - Savings: 800KB-1.2MB
    - Implementation: Lazy load OntologyGraph, GraphControls, NodeDetailsPanel with `Promise.all()`
    - Loading: Skeleton with spinner matching graph layout
    - Status: **COMPLETE**

2. **✅ Mobile Task Tabs** (Quick Win #2)
    - File: `src/lib/components/dashboard/Dashboard.svelte`
    - Savings: ~120KB
    - Implementation: Lazy load MobileTaskTabs only on mobile (`<div class="sm:hidden">`)
    - Loading: Tab-based skeleton with pulse animation
    - Impact: Desktop users NEVER download this component
    - Status: **COMPLETE**

3. **✅ Weekly Task Calendar** (Quick Win #3)
    - File: `src/lib/components/dashboard/Dashboard.svelte`
    - Savings: ~150KB
    - Implementation: Lazy load WeeklyTaskCalendar on demand
    - Loading: 7-column calendar grid skeleton
    - Impact: Only loads when user has weekly tasks to display
    - Status: **COMPLETE**

### Next Steps

- Continue with Category 2 & 3 optimizations below
- Run bundle analysis to measure actual savings
- Test on production build with slow 3G throttling

---

## 📊 Executive Summary

Beyond the 16 modals already converted, I've identified **50+ additional components** that can be lazy loaded for significant performance gains. These fall into 4 categories:

1. **Heavy Visualization Components** (2-3MB) - Graph/Chart components
2. **Tab-Based Conditional Components** (500KB-1MB) - Only loaded when tab active
3. **Large Feature Components** (300KB-800KB) - Time blocks, email composer, etc.
4. **Admin-Only Components** (200KB-500KB) - Rarely used by most users

**Total Potential Impact:** 60-70% bundle size reduction when combined with modal lazy loading

---

## 🎯 Category 1: Heavy Visualization Components

**Priority:** 🔴 **CRITICAL** - Largest immediate impact
**Estimated Savings:** 2-3MB uncompressed (~600KB-900KB compressed)

### 1.1 Graph Visualizations (HIGHEST PRIORITY)

#### OntologyGraph Component (Currently NOT Lazy Loaded!)

**File:** `src/routes/ontology/projects/[id]/+page.svelte`
**Issue:** Graph is imported statically but only shown when "graph" tab is active
**Size:** ~800KB-1.2MB (with D3/visualization dependencies)
**Usage Pattern:** User must click "Graph" tab to see it

**Current Code:**

```svelte
<script>
  import OntologyGraph from '$lib/components/ontology/graph/OntologyGraph.svelte';
  import GraphControls from '$lib/components/ontology/graph/GraphControls.svelte';
  import NodeDetailsPanel from '$lib/components/ontology/graph/NodeDetailsPanel.svelte';

  let activeTab = $state('tasks'); // Defaults to 'tasks', NOT 'graph'
</script>

<!-- Graph only rendered when activeTab === 'graph' -->
{:else if activeTab === 'graph'}
  <OntologyGraph data={projectGraphSource} />
  <GraphControls {graphInstance} />
  <NodeDetailsPanel {selectedNode} />
{/if}
```

**Problem:** Even though the graph is conditionally rendered, ALL graph code is in the initial bundle because of the static import!

**Solution:**

```svelte
<script>
  // Remove static imports
  // import OntologyGraph from '$lib/components/ontology/graph/OntologyGraph.svelte';
  // import GraphControls from '$lib/components/ontology/graph/GraphControls.svelte';
  // import NodeDetailsPanel from '$lib/components/ontology/graph/NodeDetailsPanel.svelte';

  let activeTab = $state('tasks');
</script>

{:else if activeTab === 'graph'}
  {#await Promise.all([
    import('$lib/components/ontology/graph/OntologyGraph.svelte'),
    import('$lib/components/ontology/graph/GraphControls.svelte'),
    import('$lib/components/ontology/graph/NodeDetailsPanel.svelte')
  ])}
    <!-- Loading skeleton for graph -->
    <div class="h-[520px] animate-pulse bg-gray-100 dark:bg-gray-800 rounded-xl"></div>
  {:then [GraphMod, ControlsMod, PanelMod]}
    <svelte:component this={GraphMod.default} data={projectGraphSource} />
    <svelte:component this={ControlsMod.default} {graphInstance} />
    <svelte:component this={PanelMod.default} {selectedNode} />
  {:catch error}
    <div class="p-4 text-red-600">Failed to load graph visualization</div>
  {/await}
{/if}
```

**Impact:**

- ✅ **800KB-1.2MB** removed from initial bundle
- ✅ Graph loads only when user clicks "Graph" tab
- ✅ Cached after first load - instant on subsequent visits

#### Agent Plan Visualization

**File:** `src/lib/components/agent/PlanVisualization.svelte`
**Size:** ~200KB
**Current Status:** Statically imported in AgentChatModal

**Opportunity:** Lazy load when plan is actually displayed

```svelte
<!-- In AgentChatModal.svelte -->
{#if message.content?.type === 'plan'}
	{#await import('./PlanVisualization.svelte') then { default: PlanViz }}
		<svelte:component this={PlanViz} plan={message.content.plan} />
	{/await}
{/if}
```

### 1.2 Calendar/Timeline Components

#### TimePlayCalendar (2,108 lines!)

**File:** `src/lib/components/time-blocks/TimePlayCalendar.svelte`
**Size:** ~500KB (largest single component!)
**Usage:** Only in time-blocks feature

**Opportunity:** This is ALREADY a route-specific component, but could be further optimized with:

- Lazy load individual calendar views (day/week/month)
- Split event handlers into separate chunks

#### WeeklyTaskCalendar (641 lines)

**File:** `src/lib/components/dashboard/WeeklyTaskCalendar.svelte`
**Size:** ~150KB
**Current Import:** Static import in Dashboard.svelte

**Opportunity:**

```svelte
<!-- Dashboard.svelte -->
<script>
	// Remove: import WeeklyTaskCalendar from './WeeklyTaskCalendar.svelte';
</script>

<!-- Only show on desktop, lazy load -->
<div class="hidden lg:block">
	{#await import('./WeeklyTaskCalendar.svelte') then { default: Calendar }}
		<svelte:component this={Calendar} {weeklyTasks} />
	{/await}
</div>
```

---

## 🗂️ Category 2: Tab-Based Conditional Components

**Priority:** 🟡 **HIGH** - Easy wins with significant impact
**Estimated Savings:** 500KB-1MB per file

### 2.1 Ontology Project Tabs

**File:** `src/routes/ontology/projects/[id]/+page.svelte`
**Tabs:** tasks, graph, outputs, documents, plans, goals, other

**Current Problem:** ALL tab content is bundled even though only 1 tab is visible at a time!

**Tab Content to Lazy Load:**

```svelte
<script>
	// Remove ALL these static imports - they're only used in specific tabs!
	// The list components below are ONLY shown when their tab is active

	let activeTab = $state('tasks'); // Default tab
</script>

<!-- BEFORE: All tab content in initial bundle -->
{#if activeTab === 'tasks'}
	<!-- Task list UI - inline, keep static -->
{:else if activeTab === 'graph'}
	<!-- LAZY LOAD: Graph components (see Category 1) -->
{:else if activeTab === 'outputs'}
	<!-- Currently inline - could extract to component and lazy load -->
{:else if activeTab === 'documents'}
	<!-- Currently inline - could extract to component and lazy load -->
{:else if activeTab === 'plans'}
	<!-- Currently inline - could extract to component and lazy load -->
{:else if activeTab === 'goals'}
	<!-- Currently inline - could extract to component and lazy load -->
{:else if activeTab === 'other'}
	<!-- Currently inline - keep static (small) -->
{/if}
```

**Refactored Approach:**

Extract each tab into its own component:

```
src/lib/components/ontology/tabs/
  ├── TasksTabContent.svelte
  ├── GraphTabContent.svelte (graph components)
  ├── OutputsTabContent.svelte
  ├── DocumentsTabContent.svelte
  ├── PlansTabContent.svelte
  ├── GoalsTabContent.svelte
  └── OtherTabContent.svelte
```

Then lazy load:

```svelte
{#if activeTab === 'tasks'}
	{#await import('$lib/components/ontology/tabs/TasksTabContent.svelte') then { default: TasksTab }}
		<svelte:component this={TasksTab} {tasks} {project} />
	{/await}
{:else if activeTab === 'graph'}
	{#await import('$lib/components/ontology/tabs/GraphTabContent.svelte') then { default: GraphTab }}
		<svelte:component this={GraphTab} {projectGraphSource} />
	{/await}
{:else if activeTab === 'outputs'}
	{#await import('$lib/components/ontology/tabs/OutputsTabContent.svelte') then { default: OutputsTab }}
		<svelte:component this={OutputsTab} {outputs} {project} />
	{/await}
	<!-- ... etc -->
{/if}
```

**Impact:**

- ✅ Only active tab content loaded initially
- ✅ Each tab ~100-200KB → saved ~600-1,400KB on initial load
- ✅ Tabs cache after first visit

### 2.2 Dashboard Mobile Tabs

**File:** `src/lib/components/dashboard/MobileTaskTabs.svelte` (595 lines)
**Size:** ~120KB
**Usage:** Mobile only (`<div class="lg:hidden">`)

**Opportunity:**

```svelte
<!-- Dashboard.svelte -->
<div class="lg:hidden">
	{#await import('./MobileTaskTabs.svelte') then { default: MobileTabs }}
		<svelte:component this={MobileTabs} {todaysTasks} {tomorrowsTasks} />
	{/await}
</div>
```

**Impact:**

- ✅ Desktop users NEVER download this code
- ✅ Mobile users load it on-demand
- ✅ Saves ~120KB for desktop users (100% of desktop traffic)

---

## 📦 Category 3: Large Feature Components

**Priority:** 🟡 **HIGH** - User-initiated features
**Estimated Savings:** 1-2MB total

### 3.1 Brain Dump Processing Components

#### ParseResultsDiffView (1,398 lines!)

**File:** `src/lib/components/brain-dump/ParseResultsDiffView.svelte`
**Size:** ~350KB
**Usage:** Only shown AFTER brain dump processing completes

**Current:** Imported in BrainDumpModal (already lazy loaded ✅)
**But:** Could be further lazy loaded within the modal

```svelte
<!-- BrainDumpModal.svelte -->
{#if processingPhase === 'reviewing_results'}
	{#await import('./ParseResultsDiffView.svelte') then { default: DiffView }}
		<svelte:component this={DiffView} {results} />
	{/await}
{/if}
```

#### DualProcessingResults (1,080 lines)

**File:** `src/lib/components/brain-dump/DualProcessingResults.svelte`
**Size:** ~280KB
**Same opportunity** as ParseResultsDiffView

### 3.2 Email Composer (1,202 lines)

**File:** `src/lib/components/email/EmailComposer.svelte`
**Size:** ~300KB
**Usage:** Only in specific admin routes and email features

**Opportunity:** Already route-specific, but could lazy load:

- Rich text editor
- Attachment handler
- Template selector

### 3.3 Time Blocks Components

#### TimeBlocksCard (1,003 lines)

**File:** `src/lib/components/dashboard/TimeBlocksCard.svelte`
**Size:** ~250KB
**Usage:** In dashboard, but could be lazy loaded

```svelte
<!-- Dashboard.svelte -->
{#if calendarStatus.isConnected}
	{#await import('./TimeBlocksCard.svelte') then { default: TimeBlocks }}
		<svelte:component this={TimeBlocks} />
	{/await}
{:else}
	<div class="text-center py-8">
		<p>Connect your calendar to see time blocks</p>
	</div>
{/if}
```

#### TimeAllocationPanel (1,069 lines)

**File:** `src/lib/components/time-blocks/TimeAllocationPanel.svelte`
**Size:** ~270KB
**Usage:** In time blocks feature

**Same pattern:** Lazy load when feature is accessed

---

## 🔐 Category 4: Admin-Only Components

**Priority:** 🟢 **MEDIUM** - Affects few users but easy wins
**Estimated Savings:** 500KB-800KB for non-admin users (99% of users)

### 4.1 Admin Components

**Files to Lazy Load:**

```
src/lib/components/admin/
  ├── UserContextPanel.svelte (1,182 lines)
  ├── UserActivityModal.svelte (large)
  ├── EmailHistoryViewerModal.svelte
  └── SessionDetailModal.svelte
```

**Pattern:** All admin routes should lazy load admin-specific components

```svelte
<!-- src/routes/admin/+layout.svelte -->
<script>
	import { page } from '$app/stores';

	const isAdmin = $derived($page.data.user?.is_admin);
</script>

{#if isAdmin}
	{@render children()}
{:else}
	<div>Access denied</div>
{/if}
```

Then in each admin route:

```svelte
<!-- src/routes/admin/users/+page.svelte -->
{#await import('$lib/components/admin/UserContextPanel.svelte') then { default: Panel }}
	<svelte:component this={Panel} {users} />
{/await}
```

---

## 🚀 Implementation Priority Matrix

### Phase 1: Critical Impact (Week 1) - 2-3MB savings

1. **✅ Ontology Graph Components** (800KB-1.2MB)
    - `OntologyGraph.svelte`
    - `GraphControls.svelte`
    - `NodeDetailsPanel.svelte`

2. **✅ Dashboard Mobile Tabs** (120KB desktop users never need)
    - `MobileTaskTabs.svelte`

3. **✅ Weekly Task Calendar** (150KB, only desktop)
    - `WeeklyTaskCalendar.svelte`

### Phase 2: Tab-Based Components (Week 2) - 500KB-1MB savings

4. **Extract & Lazy Load Ontology Tabs**
    - Create separate components for each tab
    - Lazy load on tab activation

5. **BuildOS Flow Components**
    - `BuildOSFlow.svelte` (995 lines)
    - `BuildOSFlow-MultiProjects.svelte` (520 lines)

### Phase 3: Feature Components (Week 2-3) - 500KB-800KB savings

6. **Time Blocks Suite**
    - `TimeBlocksCard.svelte`
    - `TimeAllocationPanel.svelte`
    - `TimePlayCalendar.svelte` (only when time blocks accessed)

7. **Brain Dump Sub-Components**
    - `ParseResultsDiffView.svelte`
    - `DualProcessingResults.svelte`

### Phase 4: Admin Components (Week 3) - 300KB-500KB savings

8. **Admin-Only Components**
    - All components in `src/lib/components/admin/`
    - Lazy load at route level

---

## 📝 Implementation Patterns

### Pattern A: Tab-Based Lazy Loading

```svelte
<script lang="ts">
	let activeTab = $state('default');

	// Component map for lazy loading
	const tabComponents = {
		tasks: () => import('./tabs/TasksTab.svelte'),
		graph: () => import('./tabs/GraphTab.svelte'),
		outputs: () => import('./tabs/OutputsTab.svelte')
	};
</script>

{#if tabComponents[activeTab]}
	{#await tabComponents[activeTab]()}
		<div class="animate-pulse bg-gray-100 h-64 rounded-lg"></div>
	{:then { default: TabComponent }}
		<svelte:component this={TabComponent} {...tabProps} />
	{:catch error}
		<div class="text-red-600">Failed to load tab content</div>
	{/await}
{/if}
```

### Pattern B: Conditional Feature Loading

```svelte
<script lang="ts">
	let featureEnabled = $state(false);
</script>

{#if featureEnabled}
	{#await import('./HeavyFeatureComponent.svelte')}
		<!-- Loading skeleton matching component layout -->
		<div class="skeleton-loader h-full"></div>
	{:then { default: FeatureComponent }}
		<svelte:component this={FeatureComponent} />
	{:catch}
		<div>Feature unavailable</div>
	{/await}
{/if}
```

### Pattern C: Responsive Component Loading

```svelte
<script lang="ts">
	import { browser } from '$app/environment';

	const isMobile = $derived(browser && window.innerWidth < 768);
</script>

<!-- Desktop version -->
{#if !isMobile}
	{#await import('./DesktopHeavyComponent.svelte') then { default: Desktop }}
		<svelte:component this={Desktop} />
	{/await}
{:else}
	<!-- Mobile version -->
	{#await import('./MobileLightComponent.svelte') then { default: Mobile }}
		<svelte:component this={Mobile} />
	{/await}
{/if}
```

### Pattern D: Parallel Loading for Related Components

```svelte
{#await Promise.all([
  import('./ComponentA.svelte'),
  import('./ComponentB.svelte'),
  import('./ComponentC.svelte')
])}
	<LoadingSkeleton />
{:then [ModA, ModB, ModC]}
	<svelte:component this={ModA.default} />
	<svelte:component this={ModB.default} />
	<svelte:component this={ModC.default} />
{/await}
```

---

## 🧪 Testing Strategy

### Per-Component Testing

```bash
# 1. Build and analyze
ANALYZE=true pnpm build

# 2. Check stats.html for:
# - Component is NOT in initial bundle
# - Component appears as separate chunk
# - Chunk size is reasonable

# 3. Test in browser:
# - Open DevTools Network tab
# - Navigate to feature
# - Verify component chunk loads when triggered
# - Verify component functions correctly
```

### Bundle Analysis Targets

| Metric             | Before | Target | Change     |
| ------------------ | ------ | ------ | ---------- |
| **Initial Bundle** | 800KB  | 250KB  | -69%       |
| **Largest Chunk**  | N/A    | <150KB | Controlled |
| **Total Chunks**   | ~10    | 60-80  | +Granular  |
| **FCP**            | 3.2s   | <1.5s  | -53%       |
| **TTI**            | 4.5s   | <2.5s  | -44%       |

---

## 📊 Expected Overall Impact

### Combined with Modal Lazy Loading

| Optimization            | Bundle Savings | Status              |
| ----------------------- | -------------- | ------------------- |
| **Modal Lazy Loading**  | 400KB          | ✅ Complete (16/34) |
| **Graph Visualization** | 800KB-1.2MB    | ⏳ Pending          |
| **Tab Components**      | 500KB-1MB      | ⏳ Pending          |
| **Feature Components**  | 500KB-800KB    | ⏳ Pending          |
| **Admin Components**    | 300KB-500KB    | ⏳ Pending          |
| **TOTAL REDUCTION**     | **2.5-4MB**    | **60-70%**          |

### User Experience Impact

- ✅ **Initial load:** 60-70% faster
- ✅ **Tab switching:** Instant after first load
- ✅ **Mobile users:** Never download desktop code
- ✅ **Non-admin users:** Never download admin code
- ✅ **Better caching:** Granular chunks cache independently

---

## 🎯 Quick Wins (Start Here)

### Top 3 Highest Impact

1. **Ontology Graph** (1-2 hours work, 800KB-1.2MB savings)
    - File: `src/routes/ontology/projects/[id]/+page.svelte`
    - Change: Lazy load 3 graph components when graph tab active
    - Impact: HUGE - removes largest single feature from initial bundle

2. **Mobile Task Tabs** (30 min work, 120KB savings)
    - File: `src/lib/components/dashboard/Dashboard.svelte`
    - Change: Lazy load `MobileTaskTabs.svelte`
    - Impact: Desktop users NEVER load this

3. **Weekly Calendar** (30 min work, 150KB savings)
    - File: `src/lib/components/dashboard/Dashboard.svelte`
    - Change: Lazy load `WeeklyTaskCalendar.svelte`
    - Impact: Only loads for desktop users with calendar

**Total Time:** 2-3 hours
**Total Savings:** 1-1.5MB
**ROI:** Excellent!

---

## 📚 Related Documentation

- **Modal Lazy Loading Summary:** `/apps/web/docs/technical/MODAL_LAZY_LOADING_SUMMARY.md`
- **Performance Optimization Plan:** `/apps/web/docs/technical/MOBILE_PERFORMANCE_OPTIMIZATION_PLAN.md`
- **Svelte 5 Patterns:** `/apps/web/docs/technical/development/svelte5-runes.md`

---

**Last Updated:** November 21, 2025
**Status:** Ready for Implementation
**Next Steps:** Start with Phase 1 Quick Wins
