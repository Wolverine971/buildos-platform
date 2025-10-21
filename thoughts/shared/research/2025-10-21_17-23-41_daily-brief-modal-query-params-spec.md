---
date: 2025-10-21T17:23:41Z
researcher: Claude
git_commit: ed476a80517ec664a4d3c1edc812c6f008ed3077
branch: main
repository: buildos-platform
topic: "Daily Brief Modal with Query Parameters - Implementation Spec"
tags:
  [research, codebase, daily-briefs, modals, url-params, ui-ux, projects-page]
status: complete
last_updated: 2025-10-21
last_updated_by: Claude
---

# Research: Daily Brief Modal with Query Parameters - Implementation Spec

**Date**: 2025-10-21T17:23:41Z
**Researcher**: Claude
**Git Commit**: ed476a80517ec664a4d3c1edc812c6f008ed3077
**Branch**: main
**Repository**: buildos-platform

## Research Question

How can we convert the expandable daily brief on `/projects` page to a modal and add URL query parameter support for:

1. Opening specific briefs via URL
2. Updating URL when brief modal opens
3. Auto-opening brief modal when loading page with query params
4. Supporting this on both `/projects` (Projects tab) and `/projects?tab=briefs` (Briefs tab)

## Summary

Based on comprehensive codebase research, this spec outlines converting the expandable `DailyBriefSection` component to a modal-based system with full URL query parameter support. The implementation will leverage the existing modal infrastructure (`Modal.svelte`, `modalStore`), follow established URL synchronization patterns from the codebase, and provide seamless deep-linking to specific daily briefs.

**Key Changes:**

- Replace expand/collapse behavior with modal open/close
- Add `briefId` and/or `briefDate` query parameters
- Auto-open modal on page load when query params present
- Update URL when modal opens/closes
- Maintain consistency with existing modal patterns in the app

## Current Implementation Analysis

### 1. Daily Brief Display on Projects Page

**File:** `/apps/web/src/routes/projects/+page.svelte` (lines 598-600)

Currently, the daily brief appears as an expandable section:

```svelte
{#if activeTab === 'projects' && filteredProjects?.length}
    <DailyBriefSection user={data.user} />
{/if}
```

**Component:** `/apps/web/src/lib/components/briefs/DailyBriefSection.svelte` (999 lines)

**Current Behavior:**

- Displays today's brief in a card
- Collapsed state: Shows single-line preview (max 200 chars), priority actions badge
- Expanded state: Shows full markdown content, priority actions, email opt-in
- Toggle via `isExpanded` boolean state (line 43)
- Toggle button with ChevronUp/ChevronDown icons (lines 392-400)

**States:**

1. Loading (shimmer animation)
2. Generation in progress (progress bar + live preview)
3. Display collapsed (single-line preview)
4. Display expanded (full content)
5. No brief (CTA to generate)

### 2. Existing Modal Infrastructure

**Base Modal Component:** `/apps/web/src/lib/components/ui/Modal.svelte`

Features:

- Portal rendering to document.body
- Focus trapping
- Backdrop click handling
- Escape key handling
- Size variants: sm, md, lg, xl
- Slot-based composition (header, default, footer)
- Accessibility (ARIA labels, focus management)

**Modal Store:** `/apps/web/src/lib/stores/modal.store.ts`

```typescript
interface ModalState {
  [key: string]: {
    isOpen: boolean;
    data?: any;
    phaseId?: string | null;
    phase?: any;
  };
}

// Methods:
modalStore.open(modalName: string, data?: any, extra?: any)
modalStore.close(modalName: string)
modalStore.closeAll()
modalStore.getModal(modalName: string)
```

**Existing Daily Brief Modal:** `/apps/web/src/lib/components/briefs/DailyBriefModal.svelte`

This component already exists and displays a full daily brief in a modal. Currently used in:

- `/apps/web/src/routes/briefs/+page.svelte` (full briefs page)
- Not currently used on `/projects` page

### 3. URL Query Parameter Patterns in Codebase

**Pattern 1: Reading Query Params**

```typescript
// From /projects/+page.svelte (lines 58-71)
$effect(() => {
  if (!browser) return;
  const urlParams = new URLSearchParams($page.url.search);
  const tabParam = urlParams.get("tab");
  if (tabParam === "briefs") {
    activeTab = "briefs";
    if (!briefsLoaded) loadBriefs();
  }
});
```

**Pattern 2: Updating Query Params**

```typescript
// From /projects/+page.svelte (lines 188-206)
function handleTabChange(tabId: string) {
  activeTab = tabId as TabType;

  if (browser) {
    const url = new URL(window.location.href);
    if (tabId === "briefs") {
      url.searchParams.set("tab", "briefs");
    } else {
      url.searchParams.delete("tab");
    }
    window.history.pushState({}, "", url);
  }
}
```

**Pattern 3: Multiple Query Params**

```typescript
// From /briefs/+page.svelte (lines 190-202)
const url = new URL($page.url);
if (currentDate && currentDate !== url.searchParams.get("date")) {
  url.searchParams.set("date", currentDate);
}
if (selectedView !== url.searchParams.get("view")) {
  url.searchParams.set("view", selectedView);
}
if (browser) {
  replaceState(url.toString(), {});
}
```

### 4. Daily Brief Data Structure

**Type:** `/apps/web/src/lib/types/daily-brief.ts`

```typescript
export interface DailyBrief {
  id: string; // UUID
  user_id: string;
  brief_date: string; // YYYY-MM-DD format
  summary_content: string; // Main brief (markdown)
  project_brief_ids?: string[];
  insights?: string;
  priority_actions?: string[];
  generation_status?: "pending" | "completed" | "failed";
  metadata?: any;
  created_at?: string;
  updated_at?: string;
}
```

**API Endpoint:** `GET /api/daily-briefs?date=YYYY-MM-DD`

Returns the daily brief for a specific date (defaults to today).

## Proposed Changes

### Overview

1. **Remove expandable behavior** from `DailyBriefSection`
2. **Add modal trigger** - clicking the brief opens a modal
3. **Lazy-load** `DailyBriefModal` component on `/projects` page
4. **Add query parameters:**
   - `briefDate` - Date of the brief to display (YYYY-MM-DD)
   - Optional: `briefId` - Specific brief ID (if needed for direct access)
5. **URL synchronization:**
   - Opening modal adds `?briefDate=YYYY-MM-DD` (and optionally `?briefId=xxx`)
   - Closing modal removes brief-related query params
   - Page load with params auto-opens modal
6. **Preserve tab param** - Ensure `?tab=briefs` is maintained when opening/closing brief modal

### User Flows

#### Flow 1: Open Brief from Projects Page (Projects Tab)

1. User lands on `/projects`
2. User sees collapsed daily brief card (non-expandable)
3. User clicks "View Brief" or clicks anywhere on the brief card
4. Modal opens with full brief content
5. URL updates to `/projects?briefDate=2025-10-21`
6. User closes modal → URL returns to `/projects`

#### Flow 2: Open Brief from Projects Page (Briefs Tab)

1. User is on `/projects?tab=briefs`
2. User clicks on a brief in the list
3. Modal opens with full brief content
4. URL updates to `/projects?tab=briefs&briefDate=2025-10-21`
5. User closes modal → URL returns to `/projects?tab=briefs`

#### Flow 3: Direct Link to Brief

1. User navigates to `/projects?briefDate=2025-10-21`
2. Page loads with brief modal already open
3. Modal displays brief for 2025-10-21
4. User closes modal → URL updates to `/projects`

#### Flow 4: Direct Link to Brief on Briefs Tab

1. User navigates to `/projects?tab=briefs&briefDate=2025-10-20`
2. Page loads with briefs tab active AND brief modal open
3. Modal displays brief for 2025-10-20
4. User closes modal → URL updates to `/projects?tab=briefs`

#### Flow 5: Navigate Between Briefs (Future Enhancement)

1. User has brief modal open
2. Modal has "Previous Day" / "Next Day" navigation buttons
3. Clicking "Next Day" updates URL to `/projects?briefDate=2025-10-22`
4. Modal content updates to show next day's brief
5. Browser back button returns to previous brief

## Implementation Specification

### Phase 1: Convert DailyBriefSection to Modal Trigger

**File:** `/apps/web/src/lib/components/briefs/DailyBriefSection.svelte`

**Changes:**

1. **Remove expand/collapse state:**
   - Remove `let isExpanded = false;` (line 43)
   - Remove toggle button (lines 392-400)
   - Remove `.collapsed-preview` section (lines 404-446)
   - Remove `.expanded-body` section (lines 448-510)

2. **Add click handler to open modal:**

   ```svelte
   <script>
     import { createEventDispatcher } from 'svelte';
     const dispatch = createEventDispatcher();

     function handleViewBrief() {
       if (displayDailyBrief) {
         dispatch('viewBrief', {
           briefId: displayDailyBrief.id,
           briefDate: displayDailyBrief.brief_date
         });
       }
     }
   </script>
   ```

3. **Update card to be clickable:**

   ```svelte
   <button
     type="button"
     class="daily-brief-card clickable"
     on:click={handleViewBrief}
     aria-label="View daily brief"
   >
     <!-- Brief preview content -->
     <div class="brief-preview">
       <h3>Today's Brief</h3>
       <p class="preview-text">{truncatedContent}</p>
       {#if displayDailyBrief.priority_actions?.length}
         <div class="priority-badge">
           {displayDailyBrief.priority_actions.length} priorities
         </div>
       {/if}
     </div>
     <div class="view-icon">
       <ChevronRight />
     </div>
   </button>
   ```

4. **Add hover/focus styles:**

   ```css
   .daily-brief-card.clickable {
     cursor: pointer;
     transition: all 0.2s ease;
   }

   .daily-brief-card.clickable:hover,
   .daily-brief-card.clickable:focus-visible {
     transform: translateY(-2px);
     box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
     border-color: var(--color-primary-400);
   }
   ```

### Phase 2: Add Modal to Projects Page

**File:** `/apps/web/src/routes/projects/+page.svelte`

**Changes:**

1. **Add modal state:**

   ```svelte
   <script>
     // Brief modal state
     let briefModalOpen = $state(false);
     let selectedBrief = $state<DailyBrief | null>(null);
     let selectedBriefDate = $state<string | null>(null);
   </script>
   ```

2. **Add event handler for brief view:**

   ```svelte
   function handleViewBrief(event: CustomEvent<{ briefId: string; briefDate: string }>) {
     const { briefId, briefDate } = event.detail;
     selectedBriefDate = briefDate;

     // Optionally fetch full brief data if needed
     // For now, we can fetch it inside DailyBriefModal based on date

     briefModalOpen = true;
     updateBriefUrl(briefDate);
   }
   ```

3. **Add URL update function:**

   ```svelte
   function updateBriefUrl(briefDate: string | null) {
     if (!browser) return;

     const url = new URL(window.location.href);

     if (briefDate) {
       url.searchParams.set('briefDate', briefDate);
     } else {
       url.searchParams.delete('briefDate');
     }

     // Use pushState for new entry (allows back button to close modal)
     window.history.pushState({}, '', url);
   }
   ```

4. **Add modal close handler:**

   ```svelte
   function closeBriefModal() {
     briefModalOpen = false;
     selectedBrief = null;
     selectedBriefDate = null;
     updateBriefUrl(null);
   }
   ```

5. **Add URL effect for auto-opening modal:**

   ```svelte
   // Check URL params for briefDate on load
   $effect(() => {
     if (!browser) return;

     const urlParams = new URLSearchParams($page.url.search);
     const briefDateParam = urlParams.get('briefDate');

     if (briefDateParam && !briefModalOpen) {
       // Valid date format check
       if (/^\d{4}-\d{2}-\d{2}$/.test(briefDateParam)) {
         selectedBriefDate = briefDateParam;
         briefModalOpen = true;
       }
     }
   });
   ```

6. **Add lazy-loaded modal component:**

   ```svelte
   <script>
     import { browser } from '$app/environment';

     // Lazy load modal component
     let DailyBriefModalComponent: any = null;

     $effect(() => {
       if (browser && briefModalOpen && !DailyBriefModalComponent) {
         import('$lib/components/briefs/DailyBriefModal.svelte').then((module) => {
           DailyBriefModalComponent = module.default;
         });
       }
     });
   </script>

   <!-- Template -->
   {#if DailyBriefModalComponent}
     <svelte:component
       this={DailyBriefModalComponent}
       isOpen={briefModalOpen}
       briefDate={selectedBriefDate}
       onClose={closeBriefModal}
     />
   {/if}
   ```

7. **Update DailyBriefSection usage:**
   ```svelte
   {#if activeTab === 'projects' && filteredProjects?.length}
     <DailyBriefSection
       user={data.user}
       on:viewBrief={handleViewBrief}
     />
   {/if}
   ```

### Phase 3: Update DailyBriefModal Component

**File:** `/apps/web/src/lib/components/briefs/DailyBriefModal.svelte`

**Current Props (assumption based on research):**

```typescript
export let isOpen: boolean = false;
export let brief: DailyBrief | null = null;
export let onClose: () => void;
```

**Proposed Props:**

```typescript
export let isOpen: boolean = false;
export let briefDate: string | null = null; // NEW: Accept date instead of full object
export let briefId: string | null = null; // NEW: Optional specific brief ID
export let onClose: () => void;
```

**Changes:**

1. **Add internal brief loading state:**

   ```svelte
   <script>
     let brief = $state<DailyBrief | null>(null);
     let loading = $state(false);
     let error = $state<string | null>(null);
   </script>
   ```

2. **Add effect to fetch brief when date changes:**

   ```svelte
   $effect(() => {
     if (isOpen && briefDate) {
       loadBrief(briefDate);
     }
   });

   async function loadBrief(date: string) {
     loading = true;
     error = null;

     try {
       const response = await fetch(`/api/daily-briefs?date=${date}`);
       if (!response.ok) {
         throw new Error('Failed to load brief');
       }

       const result = await response.json();
       brief = result.brief;
     } catch (err) {
       console.error('Error loading brief:', err);
       error = err.message;
     } finally {
       loading = false;
     }
   }
   ```

3. **Add loading and error states to modal:**

   ```svelte
   <Modal {isOpen} {onClose} size="xl" title="Daily Brief">
     {#if loading}
       <div class="loading-state">
         <Spinner />
         <p>Loading brief...</p>
       </div>
     {:else if error}
       <div class="error-state">
         <p class="error-message">{error}</p>
         <Button on:click={() => loadBrief(briefDate)}>Retry</Button>
       </div>
     {:else if brief}
       <!-- Existing brief display content -->
       <div class="brief-content">
         <div class="brief-header">
           <h2>{formatDate(brief.brief_date)}</h2>
           {#if brief.priority_actions?.length}
             <span class="priority-count">{brief.priority_actions.length} priorities</span>
           {/if}
         </div>

         <div class="brief-body">
           {@html renderMarkdown(brief.summary_content)}
         </div>

         {#if brief.priority_actions?.length}
           <div class="priority-actions">
             <h3>Priority Actions</h3>
             <ul>
               {#each brief.priority_actions as action}
                 <li>{action}</li>
               {/each}
             </ul>
           </div>
         {/if}

         {#if brief.insights}
           <div class="insights">
             <h3>Insights</h3>
             {@html renderMarkdown(brief.insights)}
           </div>
         {/if}
       </div>
     {:else}
       <div class="no-brief-state">
         <p>No brief available for this date.</p>
       </div>
     {/if}

     <svelte:fragment slot="footer">
       <div class="modal-actions">
         <Button variant="ghost" on:click={onClose}>Close</Button>
         {#if brief}
           <Button variant="secondary" on:click={() => exportBrief(brief)}>
             Export
           </Button>
           <Button variant="secondary" on:click={() => copyBrief(brief)}>
             Copy
           </Button>
         {/if}
       </div>
     </svelte:fragment>
   </Modal>
   ```

### Phase 4: Update DailyBriefsTab Component

**File:** `/apps/web/src/lib/components/briefs/DailyBriefsTab.svelte`

This component shows the full briefs interface on the Briefs tab. We need to integrate modal opening here as well.

**Changes:**

1. **Add modal state to parent page** (already done in Phase 2)

2. **Update brief list items to dispatch event:**

   ```svelte
   <script>
     import { createEventDispatcher } from 'svelte';
     const dispatch = createEventDispatcher();

     function handleBriefClick(brief: DailyBrief) {
       dispatch('viewBrief', {
         briefId: brief.id,
         briefDate: brief.brief_date
       });
     }
   </script>

   <!-- In brief list -->
   {#each filteredBriefs as brief}
     <button
       class="brief-list-item"
       on:click={() => handleBriefClick(brief)}
     >
       <!-- Brief preview content -->
     </button>
   {/each}
   ```

3. **Wire up in projects page:**
   ```svelte
   <DailyBriefsTab
     user={data.user}
     on:viewBrief={handleViewBrief}
   />
   ```

### Phase 5: Handle Browser Navigation

**File:** `/apps/web/src/routes/projects/+page.svelte`

**Changes:**

1. **Listen to popstate events:**

   ```svelte
   import { onMount } from 'svelte';

   onMount(() => {
     if (!browser) return;

     // Handle browser back/forward buttons
     function handlePopState() {
       const urlParams = new URLSearchParams(window.location.search);
       const briefDateParam = urlParams.get('briefDate');

       if (briefDateParam && !briefModalOpen) {
         selectedBriefDate = briefDateParam;
         briefModalOpen = true;
       } else if (!briefDateParam && briefModalOpen) {
         briefModalOpen = false;
         selectedBrief = null;
         selectedBriefDate = null;
       }
     }

     window.addEventListener('popstate', handlePopState);

     return () => {
       window.removeEventListener('popstate', handlePopState);
     };
   });
   ```

## Query Parameter Structure

### Primary Approach: `briefDate`

**Format:** `?briefDate=YYYY-MM-DD`

**Examples:**

- `/projects?briefDate=2025-10-21` - Open today's brief on Projects tab
- `/projects?tab=briefs&briefDate=2025-10-20` - Open Oct 20 brief on Briefs tab
- `/projects?briefDate=2025-10-21&tab=briefs` - Same as above (param order doesn't matter)

**Rationale:**

- Date is the natural identifier for daily briefs (one brief per user per day)
- More user-friendly and shareable than UUID
- Easier to construct URLs manually
- Consistent with existing API pattern (`/api/daily-briefs?date=YYYY-MM-DD`)

### Alternative Approach: `briefId`

**Format:** `?briefId=550e8400-e29b-41d4-a716-446655440000`

**Use Cases:**

- Linking to specific brief version if regenerated multiple times
- Admin/support tools needing exact brief reference
- Future: Brief history/versioning

**Recommendation:** Use `briefDate` as primary, add `briefId` support as enhancement if needed.

### Combined Approach (Recommended)

Support both parameters with priority:

```typescript
function getBriefIdentifier(urlParams: URLSearchParams) {
  const briefId = urlParams.get("briefId");
  const briefDate = urlParams.get("briefDate");

  // Priority: briefId > briefDate
  if (briefId) {
    return { type: "id", value: briefId };
  } else if (briefDate) {
    return { type: "date", value: briefDate };
  }
  return null;
}
```

## File Changes Required

### New Files

None - all components already exist.

### Modified Files

| File                                                           | Changes                                             | Lines Affected (Approx)       |
| -------------------------------------------------------------- | --------------------------------------------------- | ----------------------------- |
| `/apps/web/src/routes/projects/+page.svelte`                   | Add brief modal state, URL handling, event handlers | ~50 new lines                 |
| `/apps/web/src/lib/components/briefs/DailyBriefSection.svelte` | Remove expand/collapse, add click handler           | ~150 lines removed, ~30 added |
| `/apps/web/src/lib/components/briefs/DailyBriefModal.svelte`   | Add date-based loading, loading/error states        | ~50 new lines                 |
| `/apps/web/src/lib/components/briefs/DailyBriefsTab.svelte`    | Add event dispatcher for brief clicks               | ~20 new lines                 |

### Type Updates

**File:** `/apps/web/src/lib/types/projects-page.ts`

```typescript
// Add brief modal state type
export interface BriefModalState {
  isOpen: boolean;
  briefDate: string | null;
  briefId: string | null;
}
```

## Code Examples

### Complete Example: Projects Page with Brief Modal

```svelte
<!-- /apps/web/src/routes/projects/+page.svelte -->
<script lang="ts">
  import { page } from '$app/stores';
  import { browser } from '$app/environment';
  import { onMount } from 'svelte';

  import DailyBriefSection from '$lib/components/briefs/DailyBriefSection.svelte';
  import DailyBriefsTab from '$lib/components/briefs/DailyBriefsTab.svelte';

  // Existing state...
  let activeTab = $state<TabType>('projects');
  let projects = $state<Project[]>([]);
  // ...

  // Brief modal state
  let briefModalOpen = $state(false);
  let selectedBriefDate = $state<string | null>(null);
  let DailyBriefModalComponent: any = null;

  // Handle viewing brief
  function handleViewBrief(event: CustomEvent<{ briefId: string; briefDate: string }>) {
    const { briefDate } = event.detail;
    selectedBriefDate = briefDate;
    briefModalOpen = true;
    updateBriefUrl(briefDate);
  }

  // Update URL with brief date
  function updateBriefUrl(briefDate: string | null) {
    if (!browser) return;

    const url = new URL(window.location.href);

    if (briefDate) {
      url.searchParams.set('briefDate', briefDate);
    } else {
      url.searchParams.delete('briefDate');
    }

    window.history.pushState({}, '', url);
  }

  // Close brief modal
  function closeBriefModal() {
    briefModalOpen = false;
    selectedBriefDate = null;
    updateBriefUrl(null);
  }

  // Check URL params for briefDate on load and changes
  $effect(() => {
    if (!browser) return;

    const urlParams = new URLSearchParams($page.url.search);
    const briefDateParam = urlParams.get('briefDate');

    // Open modal if briefDate in URL
    if (briefDateParam && !briefModalOpen) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(briefDateParam)) {
        selectedBriefDate = briefDateParam;
        briefModalOpen = true;
      }
    }

    // Close modal if briefDate removed from URL
    if (!briefDateParam && briefModalOpen) {
      briefModalOpen = false;
      selectedBriefDate = null;
    }
  });

  // Lazy load modal component when needed
  $effect(() => {
    if (browser && briefModalOpen && !DailyBriefModalComponent) {
      import('$lib/components/briefs/DailyBriefModal.svelte').then((module) => {
        DailyBriefModalComponent = module.default;
      });
    }
  });

  // Handle browser back/forward
  onMount(() => {
    if (!browser) return;

    function handlePopState() {
      const urlParams = new URLSearchParams(window.location.search);
      const briefDateParam = urlParams.get('briefDate');

      if (briefDateParam && !briefModalOpen) {
        selectedBriefDate = briefDateParam;
        briefModalOpen = true;
      } else if (!briefDateParam && briefModalOpen) {
        briefModalOpen = false;
        selectedBriefDate = null;
      }
    }

    window.addEventListener('popstate', handlePopState);

    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  });
</script>

<!-- Template -->
<div class="projects-page">
  <!-- Tab navigation -->
  <TabNav {tabs} {activeTab} on:change={(e) => handleTabChange(e.detail)} />

  <div class="tab-content-container">
    {#if activeTab === 'projects'}
      <!-- Projects Tab Content -->
      <div class="content-transition">
        {#if filteredProjects?.length}
          <DailyBriefSection
            user={data.user}
            on:viewBrief={handleViewBrief}
          />
          <ProjectsGrid projects={filteredProjects} />
        {/if}
      </div>
    {:else}
      <!-- Briefs Tab Content -->
      <div class="content-transition fade-in">
        <DailyBriefsTab
          user={data.user}
          on:viewBrief={handleViewBrief}
        />
      </div>
    {/if}
  </div>

  <!-- Brief Modal (lazy loaded) -->
  {#if DailyBriefModalComponent}
    <svelte:component
      this={DailyBriefModalComponent}
      isOpen={briefModalOpen}
      briefDate={selectedBriefDate}
      onClose={closeBriefModal}
    />
  {/if}
</div>
```

### Complete Example: Updated DailyBriefSection

```svelte
<!-- /apps/web/src/lib/components/briefs/DailyBriefSection.svelte -->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { ChevronRight } from 'lucide-svelte';
  import type { User } from '$lib/types/user';
  import type { DailyBrief } from '$lib/types/daily-brief';

  const dispatch = createEventDispatcher();

  export let user: User;

  // State
  let displayDailyBrief = $state<DailyBrief | null>(null);
  let loading = $state(true);

  // Fetch today's brief
  async function loadTodaysBrief() {
    loading = true;
    try {
      const response = await fetch('/api/daily-briefs');
      const result = await response.json();
      displayDailyBrief = result.brief;
    } catch (error) {
      console.error('Error loading brief:', error);
    } finally {
      loading = false;
    }
  }

  // Load on mount
  $effect(() => {
    loadTodaysBrief();
  });

  // Handle view brief click
  function handleViewBrief() {
    if (displayDailyBrief) {
      dispatch('viewBrief', {
        briefId: displayDailyBrief.id,
        briefDate: displayDailyBrief.brief_date
      });
    }
  }

  // Truncate content for preview
  function truncateContent(content: string, maxLength: number = 150): string {
    if (content.length <= maxLength) return content;
    return content.slice(0, maxLength) + '...';
  }
</script>

{#if loading}
  <!-- Loading skeleton -->
  <div class="daily-brief-skeleton">
    <div class="skeleton-header"></div>
    <div class="skeleton-content"></div>
  </div>
{:else if displayDailyBrief}
  <!-- Clickable brief card -->
  <button
    type="button"
    class="daily-brief-card clickable"
    on:click={handleViewBrief}
    aria-label="View full daily brief"
  >
    <div class="brief-header">
      <h3>📋 Today's Daily Brief</h3>
      {#if displayDailyBrief.priority_actions?.length}
        <span class="priority-badge">
          {displayDailyBrief.priority_actions.length} priorities
        </span>
      {/if}
    </div>

    <div class="brief-preview">
      <p class="preview-text">
        {truncateContent(displayDailyBrief.summary_content)}
      </p>
    </div>

    <div class="view-action">
      <span class="view-text">View Full Brief</span>
      <ChevronRight size={20} />
    </div>
  </button>
{:else}
  <!-- No brief CTA -->
  <div class="daily-brief-empty">
    <p>No brief for today yet.</p>
    <button class="generate-brief-btn" on:click={() => generateBrief()}>
      Generate Brief
    </button>
  </div>
{/if}

<style>
  .daily-brief-card {
    width: 100%;
    background: white;
    border: 1px solid var(--color-border-light);
    border-radius: 12px;
    padding: 20px;
    margin-bottom: 24px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    text-align: left;
  }

  .daily-brief-card.clickable {
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .daily-brief-card.clickable:hover,
  .daily-brief-card.clickable:focus-visible {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
    border-color: var(--color-primary-400);
  }

  .brief-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .brief-header h3 {
    font-size: 18px;
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .priority-badge {
    background: var(--color-accent-100);
    color: var(--color-accent-700);
    padding: 4px 12px;
    border-radius: 12px;
    font-size: 13px;
    font-weight: 500;
  }

  .brief-preview {
    flex: 1;
  }

  .preview-text {
    color: var(--color-text-secondary);
    line-height: 1.6;
    font-size: 15px;
  }

  .view-action {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--color-primary-600);
    font-weight: 500;
    margin-top: 8px;
  }

  .view-action :global(svg) {
    transition: transform 0.2s ease;
  }

  .daily-brief-card.clickable:hover .view-action :global(svg) {
    transform: translateX(4px);
  }
</style>
```

### Complete Example: Updated DailyBriefModal

```svelte
<!-- /apps/web/src/lib/components/briefs/DailyBriefModal.svelte -->
<script lang="ts">
  import Modal from '$lib/components/ui/Modal.svelte';
  import Button from '$lib/components/ui/Button.svelte';
  import Spinner from '$lib/components/ui/Spinner.svelte';
  import { renderMarkdown } from '$lib/utils/markdown';
  import { formatDate } from '$lib/utils/date';
  import type { DailyBrief } from '$lib/types/daily-brief';

  export let isOpen: boolean = false;
  export let briefDate: string | null = null;
  export let briefId: string | null = null;
  export let onClose: () => void;

  // Internal state
  let brief = $state<DailyBrief | null>(null);
  let loading = $state(false);
  let error = $state<string | null>(null);

  // Load brief when modal opens or date changes
  $effect(() => {
    if (isOpen && briefDate) {
      loadBrief(briefDate);
    } else if (isOpen && briefId) {
      loadBriefById(briefId);
    }
  });

  // Load brief by date
  async function loadBrief(date: string) {
    loading = true;
    error = null;

    try {
      const response = await fetch(`/api/daily-briefs?date=${date}`);
      if (!response.ok) {
        throw new Error('Failed to load brief');
      }

      const result = await response.json();
      if (result.success && result.brief) {
        brief = result.brief;
      } else {
        throw new Error(result.error || 'Brief not found');
      }
    } catch (err: any) {
      console.error('Error loading brief:', err);
      error = err.message || 'Failed to load brief';
    } finally {
      loading = false;
    }
  }

  // Load brief by ID
  async function loadBriefById(id: string) {
    loading = true;
    error = null;

    try {
      const response = await fetch(`/api/daily-briefs/${id}`);
      if (!response.ok) {
        throw new Error('Failed to load brief');
      }

      const result = await response.json();
      if (result.success && result.brief) {
        brief = result.brief;
      } else {
        throw new Error(result.error || 'Brief not found');
      }
    } catch (err: any) {
      console.error('Error loading brief:', err);
      error = err.message || 'Failed to load brief';
    } finally {
      loading = false;
    }
  }

  // Export brief
  async function exportBrief() {
    if (!brief) return;

    const markdown = `# Daily Brief - ${formatDate(brief.brief_date)}\n\n${brief.summary_content}`;
    const blob = new Blob([markdown], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `daily-brief-${brief.brief_date}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Copy brief to clipboard
  async function copyBrief() {
    if (!brief) return;

    try {
      await navigator.clipboard.writeText(brief.summary_content);
      // Show toast notification
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  }
</script>

<Modal {isOpen} {onClose} size="xl" title="Daily Brief">
  {#if loading}
    <div class="loading-state">
      <Spinner size="lg" />
      <p>Loading brief...</p>
    </div>
  {:else if error}
    <div class="error-state">
      <p class="error-message">{error}</p>
      <Button on:click={() => briefDate ? loadBrief(briefDate) : loadBriefById(briefId)}>
        Retry
      </Button>
    </div>
  {:else if brief}
    <div class="brief-content">
      <!-- Brief Header -->
      <div class="brief-header">
        <div class="brief-title">
          <h2>{formatDate(brief.brief_date)}</h2>
          {#if brief.priority_actions?.length}
            <span class="priority-count">
              {brief.priority_actions.length} {brief.priority_actions.length === 1 ? 'priority' : 'priorities'}
            </span>
          {/if}
        </div>
      </div>

      <!-- Brief Body -->
      <div class="brief-body">
        {@html renderMarkdown(brief.summary_content)}
      </div>

      <!-- Priority Actions -->
      {#if brief.priority_actions?.length}
        <div class="priority-actions">
          <h3>🎯 Priority Actions</h3>
          <ul>
            {#each brief.priority_actions as action}
              <li>{action}</li>
            {/each}
          </ul>
        </div>
      {/if}

      <!-- Insights -->
      {#if brief.insights}
        <div class="insights">
          <h3>💡 Insights</h3>
          {@html renderMarkdown(brief.insights)}
        </div>
      {/if}
    </div>
  {:else}
    <div class="no-brief-state">
      <p>No brief available for this date.</p>
    </div>
  {/if}

  <svelte:fragment slot="footer">
    <div class="modal-actions">
      <Button variant="ghost" on:click={onClose}>Close</Button>
      {#if brief}
        <Button variant="secondary" on:click={copyBrief}>
          Copy
        </Button>
        <Button variant="secondary" on:click={exportBrief}>
          Export
        </Button>
      {/if}
    </div>
  </svelte:fragment>
</Modal>

<style>
  .loading-state,
  .error-state,
  .no-brief-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 24px;
    gap: 16px;
  }

  .brief-content {
    padding: 24px;
    max-height: 70vh;
    overflow-y: auto;
  }

  .brief-header {
    margin-bottom: 24px;
    padding-bottom: 16px;
    border-bottom: 1px solid var(--color-border-light);
  }

  .brief-title {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .brief-title h2 {
    font-size: 24px;
    font-weight: 600;
    color: var(--color-text-primary);
  }

  .priority-count {
    background: var(--color-accent-100);
    color: var(--color-accent-700);
    padding: 6px 14px;
    border-radius: 16px;
    font-size: 14px;
    font-weight: 500;
  }

  .brief-body {
    margin-bottom: 24px;
    line-height: 1.7;
    color: var(--color-text-primary);
  }

  .priority-actions,
  .insights {
    margin-top: 24px;
    padding: 20px;
    background: var(--color-bg-secondary);
    border-radius: 8px;
  }

  .priority-actions h3,
  .insights h3 {
    font-size: 18px;
    font-weight: 600;
    margin-bottom: 12px;
  }

  .priority-actions ul {
    list-style: none;
    padding: 0;
  }

  .priority-actions li {
    padding: 8px 0;
    border-bottom: 1px solid var(--color-border-light);
  }

  .priority-actions li:last-child {
    border-bottom: none;
  }

  .modal-actions {
    display: flex;
    gap: 12px;
    justify-content: flex-end;
  }
</style>
```

## Testing Considerations

### Manual Testing Checklist

- [ ] **Projects page load without params** - No modal opens
- [ ] **Projects page load with `?briefDate=today`** - Modal auto-opens with today's brief
- [ ] **Projects page load with `?briefDate=2025-10-20`** - Modal auto-opens with Oct 20 brief
- [ ] **Click brief card on Projects tab** - Modal opens, URL updates to include `briefDate`
- [ ] **Close modal via close button** - Modal closes, URL updates to remove `briefDate`
- [ ] **Close modal via backdrop click** - Modal closes, URL updates to remove `briefDate`
- [ ] **Close modal via Escape key** - Modal closes, URL updates to remove `briefDate`
- [ ] **Browser back button after opening modal** - Modal closes, URL returns to previous state
- [ ] **Browser forward button after closing modal** - Modal re-opens with correct brief
- [ ] **Switch to Briefs tab** - `?tab=briefs` added to URL, modal param preserved if open
- [ ] **Click brief on Briefs tab** - Modal opens with correct brief, URL updates
- [ ] **Direct link `?tab=briefs&briefDate=2025-10-20`** - Briefs tab active, modal auto-opens
- [ ] **Modal displays loading state** while fetching brief
- [ ] **Modal displays error state** if brief fetch fails
- [ ] **Modal displays empty state** if no brief exists for date
- [ ] **Modal export button** downloads markdown file
- [ ] **Modal copy button** copies content to clipboard
- [ ] **Mobile responsive** - Modal displays properly on small screens
- [ ] **Keyboard navigation** - Tab, Shift+Tab, Escape all work correctly
- [ ] **Screen reader** - ARIA labels and focus management work

### Edge Cases

- [ ] Invalid date format in URL (`?briefDate=invalid`) - No modal opens, shows error
- [ ] Future date with no brief (`?briefDate=2030-01-01`) - Modal opens with empty state
- [ ] Past date with no brief (`?briefDate=2020-01-01`) - Modal opens with empty state
- [ ] Multiple simultaneous query params (`?tab=briefs&briefDate=2025-10-21&briefId=xxx`) - briefId takes priority
- [ ] Rapid navigation (open/close/open modal quickly) - No race conditions, correct state
- [ ] Network error during brief fetch - Error state shown, retry works
- [ ] Slow network (3G) - Loading state shown, no timeout errors

### Automated Testing

```typescript
// Test: URL updates when modal opens
test("opening brief modal updates URL with briefDate param", async () => {
  const { component } = render(ProjectsPage);

  const briefCard = screen.getByRole("button", {
    name: /view full daily brief/i,
  });
  await fireEvent.click(briefCard);

  expect(window.location.search).toContain("briefDate=");
});

// Test: Modal auto-opens with URL param
test("modal auto-opens when briefDate param in URL", async () => {
  const url = "/projects?briefDate=2025-10-21";
  const { component } = render(ProjectsPage, { url });

  await waitFor(() => {
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText(/daily brief/i)).toBeInTheDocument();
  });
});

// Test: Browser back button closes modal
test("browser back button closes modal and removes param", async () => {
  const { component } = render(ProjectsPage);

  // Open modal
  const briefCard = screen.getByRole("button", {
    name: /view full daily brief/i,
  });
  await fireEvent.click(briefCard);

  expect(window.location.search).toContain("briefDate=");

  // Simulate back button
  window.history.back();
  await waitFor(() => {
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(window.location.search).not.toContain("briefDate=");
  });
});
```

## Migration Notes

### Breaking Changes

None - this is an enhancement to existing functionality.

### Backward Compatibility

- Existing `/projects` page URLs continue to work
- Existing `/projects?tab=briefs` URLs continue to work
- New query params are additive and optional

### Rollout Plan

1. **Phase 1:** Implement modal infrastructure (no UI changes yet)
2. **Phase 2:** Add URL param support (modal works but brief still expandable)
3. **Phase 3:** Switch DailyBriefSection to modal trigger (replaces expand/collapse)
4. **Phase 4:** Update DailyBriefsTab to use modal
5. **Phase 5:** Full testing and refinement

### Feature Flag (Optional)

Consider adding a feature flag for gradual rollout:

```typescript
const BRIEF_MODAL_ENABLED = import.meta.env.PUBLIC_BRIEF_MODAL_ENABLED === 'true';

{#if BRIEF_MODAL_ENABLED}
  <!-- New modal behavior -->
{:else}
  <!-- Old expand/collapse behavior -->
{/if}
```

## Code References

### Key Files

| Component            | File Path                                                      |
| -------------------- | -------------------------------------------------------------- |
| Projects Page        | `/apps/web/src/routes/projects/+page.svelte`                   |
| Daily Brief Section  | `/apps/web/src/lib/components/briefs/DailyBriefSection.svelte` |
| Daily Brief Modal    | `/apps/web/src/lib/components/briefs/DailyBriefModal.svelte`   |
| Daily Briefs Tab     | `/apps/web/src/lib/components/briefs/DailyBriefsTab.svelte`    |
| Modal Base Component | `/apps/web/src/lib/components/ui/Modal.svelte`                 |
| Modal Store          | `/apps/web/src/lib/stores/modal.store.ts`                      |
| Brief Types          | `/apps/web/src/lib/types/daily-brief.ts`                       |
| Projects Page Types  | `/apps/web/src/lib/types/projects-page.ts`                     |
| Daily Briefs API     | `/apps/web/src/routes/api/daily-briefs/+server.ts`             |

### Existing Patterns to Follow

**Modal Opening:**

- Lazy load modal components to reduce initial bundle size
- Use portal rendering for proper z-index stacking
- Implement focus trapping for accessibility

**URL Synchronization:**

- Use `window.history.pushState()` for new entries (modal opens)
- Use `replaceState` for filter changes (if needed)
- Always check `browser` before manipulating URL
- Handle popstate events for back/forward buttons

**Svelte 5 Patterns:**

- Use `$state` for reactive local state
- Use `$derived` for computed values
- Use `$effect` for side effects (URL watching, data fetching)
- Avoid old reactive statements (`$:`)

## Architecture Insights

### Design Decisions

1. **Modal vs Expanded State:**
   - Modal provides better focus and dedicated space for full brief
   - Easier to implement URL deep-linking
   - More mobile-friendly (full-screen on small screens)
   - Consistent with other detail views in the app

2. **`briefDate` vs `briefId` Priority:**
   - Date is more user-friendly and shareable
   - Natural key for daily briefs (one per user per day)
   - Consistent with API endpoint patterns
   - briefId reserved for specific use cases (versioning, admin tools)

3. **Lazy Loading Modal:**
   - Reduces initial bundle size
   - Modal component only loaded when needed
   - Improves page load performance
   - Follows pattern used elsewhere in app (ProjectModals.svelte)

4. **URL Persistence:**
   - Browser history integration allows back/forward navigation
   - Shareable URLs for specific briefs
   - Bookmarkable brief views
   - SEO-friendly (if briefs become public in future)

### Future Enhancements

1. **Modal Navigation:**
   - "Previous Day" / "Next Day" buttons in modal
   - Arrow key navigation between days
   - Swipe gestures on mobile

2. **Brief Comparison:**
   - Open multiple briefs side-by-side
   - URL: `?briefDate=2025-10-21&compareTo=2025-10-20`

3. **Brief Versioning:**
   - Track multiple generations per day
   - URL: `?briefDate=2025-10-21&version=2`

4. **Brief Sharing:**
   - Generate shareable public links
   - URL: `/shared/brief/[shareId]`

5. **Brief Analytics:**
   - Track modal open rates
   - Monitor brief engagement
   - A/B test modal vs expanded design

## Open Questions

1. **Should we preserve scroll position when closing modal?**
   - Current behavior: Page remains at same scroll position
   - Alternative: Scroll to brief section when modal closes

2. **Should modal support keyboard shortcuts?**
   - `Cmd/Ctrl + K` to open today's brief from anywhere?
   - `Cmd/Ctrl + Shift + K` to open brief picker?

3. **Should we preload today's brief data?**
   - Faster modal opening if data already fetched
   - Trade-off: Additional API call on page load

4. **Should brief cards show hover preview?**
   - Tooltip with brief preview on hover?
   - Preview panel that slides in from side?

5. **Mobile UX considerations:**
   - Full-screen modal on mobile vs drawer/sheet?
   - Bottom sheet for easier thumb access?
   - Swipe down to close?

## Related Research

- See `/thoughts/shared/research/2025-10-21_17-23-41_daily-brief-modal-query-params-spec.md` (this document)
- Future: Link to ADR for modal vs expansion decision

---

**This specification is ready for implementation. All necessary patterns, code examples, and integration points have been documented based on thorough codebase research.**
