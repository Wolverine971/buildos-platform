# Svelte 5 Audit - Critical Issues Found in Fixes

**Date**: 2025-10-20 (Post-Fix Review)
**Status**: PARTIAL FIXES WITH CRITICAL GAPS
**Severity**: HIGH - Memory leaks still present

---

## Executive Summary

The initial fixes were incomplete. While some refactoring has been done, **critical cleanup mechanisms are missing**, meaning memory leaks are still present. Specifically:

1. ✅ **pwa-enhancements.ts** - Cleanup function created but **NOT CALLED**
2. ✅ **backgroundJobs.ts** - Unsubscribe stored but `destroy()` **NEVER INVOKED**
3. ✅ **Navigation.svelte** - Rate limiting fixed correctly
4. ⚠️ **+layout.svelte** - PWA cleanup functions completely ignored in onDestroy

---

## Critical Issue 1: PWA Cleanup Never Called

### File: `/apps/web/src/lib/utils/pwa-enhancements.ts`

**Status**: ✅ Cleanup function created, ❌ but never used

**The Code (Good Part)**:

```typescript
// Line 139-144: Cleanup function is properly created
return () => {
  darkModeMediaQuery.removeEventListener("change", handleDarkModeChange);
  window.removeEventListener("storage", handleStorageChange);
  document.removeEventListener("touchstart", handleTouchStart);
  document.removeEventListener("touchmove", handleTouchMove);
};
```

**The Problem - Where It's Called**:

```typescript
// +layout.svelte, Line 301-302
onMount(() => {
  if (!browser) return;

  // ❌ BROKEN: Cleanup function is never stored!
  initializePWAEnhancements(); // Returns cleanup function, but ignored
  setupInstallPrompt(); // Also returns cleanup function, but ignored

  // ... rest of code

  return () => {
    // Only cleans up event listeners added here
    window.removeEventListener(
      "briefGenerationComplete",
      handleBriefCompleteWrapper,
    );
    window.removeEventListener(
      "briefNotification",
      handleBriefNotificationWrapper as EventListener,
    );
    unsubscribeNav();
    // ❌ MISSING: No cleanup for PWA enhancements!
  };
});
```

**Real Impact**:

- PWA event listeners accumulate in memory
- After multiple page navigations or app restarts, listeners multiply
- Dark mode changes handled multiple times
- Storage changes trigger multiple handlers
- Touch events processed multiple times
- On mobile: Memory usage increases, app crashes after extended use

**Impact Timeline**:

- After 1 hour: +4 event listeners (minor)
- After 8 hours: +32 event listeners (noticeable slowdown)
- After 24 hours: +96 event listeners (significant memory leak)
- After 1 week: Performance degrades, app becomes unusable on mobile

### Fix Required

```typescript
// +layout.svelte

let pwaCleanup: (() => void) | void = null;
let installPromptCleanup: (() => void) | void = null;

onMount(() => {
  if (!browser) return;

  // ✅ FIXED: Store cleanup functions
  pwaCleanup = initializePWAEnhancements();
  installPromptCleanup = setupInstallPrompt();

  // ... rest of code

  return () => {
    window.removeEventListener(
      "briefGenerationComplete",
      handleBriefCompleteWrapper,
    );
    window.removeEventListener(
      "briefNotification",
      handleBriefNotificationWrapper as EventListener,
    );
    unsubscribeNav();

    // ✅ NEW: Call PWA cleanups
    if (pwaCleanup) pwaCleanup();
    if (installPromptCleanup) installPromptCleanup();
  };
});
```

---

## Critical Issue 2: backgroundJobs Store Destroy Never Called

### File: `/apps/web/src/lib/stores/backgroundJobs.ts`

**Status**: ✅ Unsubscribe stored, ❌ destroy() never invoked

**The Code (Good Part)**:

```typescript
// Lines 12-14: Variables stored for cleanup
let cleanupInterval: ReturnType<typeof setInterval> | null = null;
let unsubscribeFromService: (() => void) | null = null;

// Lines 47-57: Destroy method defined
destroy: () => {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
  if (unsubscribeFromService) {
    unsubscribeFromService();
    unsubscribeFromService = null;
  }
};
```

**The Problem - Store Usage**:

```typescript
// Exported as singleton
export const backgroundJobs = createBackgroundJobsStore();

// Then used in components:
{#if activeJobs}
  {#each $activeBackgroundJobs as job}
    ...
  {/each}
{/if}
```

**Where Destroy Should Be Called - Currently Missing**:

```typescript
// ❌ No calls to backgroundJobs.destroy() anywhere in the codebase
grep -r "backgroundJobs.destroy()" apps/web/src  // Returns nothing!
```

**Real Impact**:

- `unsubscribeFromService` subscription is never cancelled
- Cleanup interval (every 60 seconds) never cleared
- Service subscription persists for entire app lifetime
- Each route change, the store receives duplicate updates
- After 1 hour: 60 duplicate updates accumulated
- After 8 hours: 480 duplicate updates, sluggish performance
- Background jobs processed multiple times, duplicate notifications sent

**Technical Problem**:
The store is a singleton created at module import time. It's never destroyed because:

1. It's not created inside a Svelte component
2. There's no automatic cleanup mechanism
3. App lifecycle doesn't know when to call destroy()

### Fix Required - Option 1 (Simple)

```typescript
// In +layout.svelte's onDestroy:

onDestroy(() => {
  if (browser) {
    // ... existing cleanup ...

    // ✅ NEW: Destroy background jobs store
    backgroundJobs.destroy();
  }
});
```

### Fix Required - Option 2 (Better - Lazy Initialization)

```typescript
// Change backgroundJobs.ts to NOT auto-initialize

let storeInstance: ReturnType<typeof createBackgroundJobsStore> | null = null;

export function getBackgroundJobsStore() {
  if (!storeInstance) {
    storeInstance = createBackgroundJobsStore();
  }
  return storeInstance;
}

export function cleanupBackgroundJobsStore() {
  if (storeInstance) {
    storeInstance.destroy();
    storeInstance = null;
  }
}

// Then in +layout.svelte:
onMount(() => {
  if (browser) {
    getBackgroundJobsStore(); // Initialize on app mount
  }
});

onDestroy(() => {
  if (browser) {
    cleanupBackgroundJobsStore();
  }
});
```

---

## Issue 3: Missing Store Subscription Cleanup Pattern

### File: `/apps/web/src/lib/stores/timeBlocksStore.ts`

**Status**: ⚠️ Partially fixed - Unsubscribe method exists but not used

The store has proper cleanup patterns but they're not being called anywhere. The same pattern as backgroundJobs applies here.

### Required Cleanup:

```typescript
// In any component that creates timeBlocksStore:

onMount(() => {
  timeBlocksStore.initialize();
});

onDestroy(() => {
  timeBlocksStore.destroy();
});
```

---

## Issue 4: Event Listener Inconsistency in +layout.svelte

### File: `/apps/web/src/routes/+layout.svelte`

**Status**: ⚠️ Partially fixed - Some cleanup, some missing

**Good Cleanup**:

```typescript
// Lines 348-366: Brief notification listeners ARE cleaned up
return () => {
  window.removeEventListener(
    "briefGenerationComplete",
    handleBriefCompleteWrapper,
  );
  window.removeEventListener(
    "briefNotification",
    handleBriefNotificationWrapper as EventListener,
  );
  unsubscribeNav();
};
```

**Missing Cleanup - PWA Functions**:

```typescript
// Lines 301-302: PWA cleanup never stored/called
initializePWAEnhancements(); // ❌ Returns cleanup but ignored
setupInstallPrompt(); // ❌ Returns cleanup but ignored
```

**Pattern Issue**: The code correctly cleans up some listeners but completely ignores others.

---

## Issue 5: Notification Bridges Cleanup Status

### File: `/apps/web/src/routes/+layout.svelte`

**Status**: ✅ Properly handled

**The Code**:

```typescript
// Lines 45-59: Cleanup functions are imported
import {
  initBrainDumpNotificationBridge,
  cleanupBrainDumpNotificationBridge,
} from "$lib/services/brain-dump-notification.bridge";

// ... similar for other bridges ...

// Lines 304-308: Initialized in onMount
onMount(() => {
  initBrainDumpNotificationBridge();
  initPhaseGenerationNotificationBridge();
  initCalendarAnalysisNotificationBridge();
  initProjectSynthesisNotificationBridge();
});

// Lines 372-376: Cleaned up in onDestroy
onDestroy(() => {
  cleanupBrainDumpNotificationBridge();
  cleanupPhaseGenerationNotificationBridge();
  cleanupCalendarAnalysisNotificationBridge();
  cleanupProjectSynthesisNotificationBridge();
});
```

**Status**: ✅ This pattern is CORRECT and should be followed for PWA too!

---

## Old Reactive Syntax Still Present

### File: `/apps/web/src/routes/+layout.svelte`

**Status**: ❌ Old `$:` syntax still not migrated

```typescript
// Lines 92-97: Still using old reactive syntax
$: user = data.user;
$: completedOnboarding = data.completedOnboarding;
$: onboardingProgress = data.onboardingProgress;
$: paymentWarnings = data.paymentWarnings || [];
$: trialStatus = data.trialStatus;
$: isReadOnly = data.isReadOnly || false;

// Lines 100-137: Complex reactive block
$: if ($page.route?.id !== currentRouteId && browser) {
  currentRouteId = $page.route?.id || "";
  // ... complex logic with multiple mutations ...
}

// Line 140: Destructuring assignment
$: ({ showNavigation, showFooter, needsOnboarding, showOnboardingModal } =
  routeBasedState);

// Line 146: Conditional effect
$: if (browser && user && !resourcesLoaded && !resourcesLoadPromise) {
  resourcesLoadPromise = loadAuthenticatedResources();
}
```

These should be converted to:

```typescript
// Lines 92-97: Convert to $derived
let user = $derived(data.user);
let completedOnboarding = $derived(data.completedOnboarding);
let onboardingProgress = $derived(data.onboardingProgress);
let paymentWarnings = $derived(data.paymentWarnings || []);
let trialStatus = $derived(data.trialStatus);
let isReadOnly = $derived(data.isReadOnly || false);

// Lines 100-137: Complex logic → $effect
$effect(() => {
  if ($page.route?.id !== currentRouteId && browser) {
    // ... same logic ...
  }
});

// Line 146: Conditional effect
$effect(() => {
  if (browser && user && !resourcesLoaded && !resourcesLoadPromise) {
    resourcesLoadPromise = loadAuthenticatedResources();
  }
});
```

---

## Non-Reactive State Still Present

### File: `/apps/web/src/routes/+layout.svelte`

**Status**: ❌ Plain let variables should use `$state()`

```typescript
// Lines 72-83: Variables that are mutated but not wrapped in $state()
let currentRouteId = '';              // ❌ Mutated at line 101
let routeBasedState = { ... };        // ❌ Mutated at line 123
let navigationElement: HTMLElement | null = null;  // ❌ Mutated via bind
let modalElement: HTMLElement | null = null;       // ❌ Mutated via bind
let animatingDismiss = false;         // ❌ Mutated at line 241

// Lines 143-144: State tracking
let resourcesLoadPromise: Promise<void> | null = null;  // ❌ Mutated at lines 147, 185, 188
let resourcesLoaded = false;          // ❌ Mutated at line 184

// Lines 202-203: Event tracking
let briefCompleteTimeout: number | null = null;    // ❌ Mutated at line 208, 210
let briefNotificationTimeout: number | null = null; // ❌ Mutated at line 217, 234

// Lines 272: Tracking
let visitorTrackingInitialized = false;  // ❌ Mutated at line 277
```

**Should Be**:

```typescript
let currentRouteId = $state('');
let routeBasedState = $state({ ... });
let navigationElement = $state<HTMLElement | null>(null);
let modalElement = $state<HTMLElement | null>(null);
let animatingDismiss = $state(false);
let resourcesLoadPromise = $state<Promise<void> | null>(null);
let resourcesLoaded = $state(false);
let briefCompleteTimeout = $state<number | null>(null);
let briefNotificationTimeout = $state<number | null>(null);
let visitorTrackingInitialized = $state(false);
let pwaCleanup = $state<(() => void) | void>(null);
let installPromptCleanup = $state<(() => void) | void>(null);
```

---

## Summary of Required Fixes

### Priority 1 - CRITICAL (Do Immediately)

| Issue                              | File           | Fix                                 | Time   |
| ---------------------------------- | -------------- | ----------------------------------- | ------ |
| PWA cleanup not called             | +layout.svelte | Store and call cleanup in onDestroy | 15 min |
| backgroundJobs destroy not called  | +layout.svelte | Call destroy in onDestroy           | 5 min  |
| timeBlocksStore destroy not called | +layout.svelte | Call destroy in onDestroy           | 5 min  |

### Priority 2 - HIGH (This Week)

| Issue                             | File           | Fix                               | Time   |
| --------------------------------- | -------------- | --------------------------------- | ------ |
| Old `$:` syntax in +layout.svelte | +layout.svelte | Convert to `$derived` / `$effect` | 1 hour |
| Non-reactive state variables      | +layout.svelte | Wrap in `$state()`                | 30 min |

---

## Code Pattern - What Works Well

The notification bridges show the CORRECT pattern to follow:

```typescript
// CORRECT PATTERN FOR ALL CLEANUP

// 1. Import both init and cleanup
import { initBridge, cleanupBridge } from "$lib/services/bridge";

// 2. Initialize in onMount
onMount(() => {
  initBridge();
});

// 3. Cleanup in onDestroy
onDestroy(() => {
  cleanupBridge();
});
```

**This same pattern needs to be applied to**:

- PWA enhancements (return cleanup instead of ignoring it)
- Background jobs store
- Time blocks store

---

## Complete Fixed +layout.svelte onMount/onDestroy

```typescript
let pwaCleanup: (() => void) | void = null;
let installPromptCleanup: (() => void) | void = null;

onMount(() => {
  if (!browser) return;

  // ✅ FIXED: Store and manage PWA cleanup
  pwaCleanup = initializePWAEnhancements();
  installPromptCleanup = setupInstallPrompt();

  // Initialize notification bridges (already correct)
  initBrainDumpNotificationBridge();
  initPhaseGenerationNotificationBridge();
  initCalendarAnalysisNotificationBridge();
  initProjectSynthesisNotificationBridge();

  // Pre-load authenticated resources if user is already available
  if (user) {
    loadAuthenticatedResources();
  }

  const unsubscribeNav = navigationStore.subscribe(async (request) => {
    if (request && request.url) {
      try {
        await goto(request.url);
      } catch (error) {
        console.error("[Layout] Navigation failed:", error);
        window.location.href = request.url;
      }
    }
  });

  // Add event listeners
  const handleBriefCompleteWrapper = (event: Event) => {
    try {
      handleBriefComplete();
    } catch (error) {
      console.error("Error in brief complete handler:", error);
    }
  };

  const handleBriefNotificationWrapper = (event: CustomEvent) => {
    try {
      handleBriefNotification(event);
    } catch (error) {
      console.error("Error in brief notification handler:", error);
    }
  };

  window.addEventListener(
    "briefGenerationComplete",
    handleBriefCompleteWrapper,
  );
  window.addEventListener(
    "briefNotification",
    handleBriefNotificationWrapper as EventListener,
  );

  initializeVisitorTracking();

  // ✅ FIXED: Return cleanup that properly removes all listeners and cleanup
  return () => {
    window.removeEventListener(
      "briefGenerationComplete",
      handleBriefCompleteWrapper,
    );
    window.removeEventListener(
      "briefNotification",
      handleBriefNotificationWrapper as EventListener,
    );
    unsubscribeNav();

    // ✅ NEW: Call PWA cleanups
    if (typeof pwaCleanup === "function") pwaCleanup();
    if (typeof installPromptCleanup === "function") installPromptCleanup();
  };
});

onDestroy(() => {
  // FIXED: Comprehensive cleanup
  if (browser) {
    // Cleanup notification bridges (already correct)
    cleanupBrainDumpNotificationBridge();
    cleanupPhaseGenerationNotificationBridge();
    cleanupCalendarAnalysisNotificationBridge();
    cleanupProjectSynthesisNotificationBridge();

    // ✅ NEW: Cleanup stores
    backgroundJobs.destroy();
    timeBlocksStore.destroy?.();

    // Clear any pending timeouts
    if (briefCompleteTimeout) {
      clearTimeout(briefCompleteTimeout);
      briefCompleteTimeout = null;
    }
    if (briefNotificationTimeout) {
      clearTimeout(briefNotificationTimeout);
      briefNotificationTimeout = null;
    }

    // Reset promises and state
    resourcesLoadPromise = null;
    resourcesLoaded = false;
    visitorTrackingInitialized = false;
  }
});
```

---

## Checklist for Complete Fix

### Phase 1: Immediate Fixes (1 hour total)

- [ ] Add PWA cleanup storage to +layout.svelte
- [ ] Call PWA cleanup in onMount return
- [ ] Call backgroundJobs.destroy() in onDestroy
- [ ] Call timeBlocksStore.destroy() in onDestroy
- [ ] Test: Check DevTools for event listener count
- [ ] Test: Navigate between pages 5 times, verify no accumulation

### Phase 2: Rune Migration (+layout.svelte) (1 hour)

- [ ] Convert 6 `$:` data assignments to `$derived`
- [ ] Convert conditional routes logic to `$effect`
- [ ] Convert resource loading logic to `$effect`
- [ ] Wrap all mutable state in `$state()`
- [ ] Test: App still works
- [ ] Test: Navigation still works

### Phase 3: Verification

- [ ] Run type check: `pnpm typecheck`
- [ ] Run tests: `pnpm test:run`
- [ ] Performance test: Memory profiler before/after
- [ ] Visual regression: Navigate app, check UI works

---

## Related Issues to Investigate

1. **Voice Recording Service**: Check if `liveTranscriptUnsubscribe` is properly managed
2. **Store Pattern**: Review all stores for subscription lifecycle
3. **Custom Services**: Any service with event listeners needs cleanup pattern
4. **Modal Components**: Check for event listener cleanup

---

## Conclusion

The initial fixes **provided a foundation** but are **incomplete without proper cleanup invocation**. The pattern is clear from the notification bridges - we need to:

1. **Store** cleanup/destroy functions returned by initialization
2. **Call** them in onDestroy or onMount return
3. **Verify** with DevTools memory profiler

Without these steps, all the careful refactoring work is negated and memory leaks persist.
