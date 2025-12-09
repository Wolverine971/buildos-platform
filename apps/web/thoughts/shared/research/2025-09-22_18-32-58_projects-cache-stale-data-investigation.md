---
date: 2025-09-22T18:32:58-04:00
researcher: Claude
git_commit: 563977ca83dd56f4ab91bf95dabd9a22fb0bcf20
branch: main
repository: build_os
topic: 'Stale Cache Data on /projects Route'
tags: [research, codebase, caching, projects, stale-data, performance]
status: complete
last_updated: 2025-09-22
last_updated_by: Claude
path: apps/web/thoughts/shared/research/2025-09-22_18-32-58_projects-cache-stale-data-investigation.md
---

# Research: Stale Cache Data on /projects Route

**Date**: 2025-09-22T18:32:58-04:00  
**Researcher**: Claude  
**Git Commit**: 563977ca83dd56f4ab91bf95dabd9a22fb0bcf20  
**Branch**: main  
**Repository**: build_os

## Research Question

Investigate stale response caching issues on the /projects route that are causing outdated data to persist after updates.

## Summary

The /projects route has a **multi-layered caching architecture** causing stale data issues. The primary problem is **5 layers of caching** that don't properly invalidate when data changes:

1. **HTTP Response Caching** (5-min browser cache + 10-min stale-while-revalidate)
2. **Service-Level LRU Cache** (ProjectService with 5-min TTL)
3. **Store-Level Cache** (ProjectStoreV2 with 1-5 min TTL)
4. **Component-Level State** (manual `projectsLoaded` flag)
5. **ETag Conditional Requests** (304 responses preventing fresh data)

**Critical Issue**: After brain dump modal closes or project updates occur, the component calls `loadProjects()` but doesn't bypass any cache layers, receiving stale cached responses.

## Detailed Findings

### 1. HTTP Response Caching Layer

**Location**: `src/routes/api/projects/list/+server.ts:79-81`

```typescript
return ApiResponse.cached(responseData, undefined, 300, {
	staleWhileRevalidate: 600
});
```

- **Cache-Control**: `public, max-age=300, stale-while-revalidate=600`
- **Impact**: Browser caches responses for 5 minutes, serves stale for 10 minutes
- **ETag Support**: Automatic MD5 hash generation for conditional requests
- **304 Responses**: Returns cached data when ETag matches

### 2. Service-Level Caching

**Location**: `src/lib/services/projectService.ts:25-98`

```typescript
private cache = new CacheManager<any>(50, 5 * 60 * 1000); // 50 items, 5 min TTL

// Cache key pattern for list requests
const cacheKey = `projects:${JSON.stringify(params)}`;
```

**Issues Found**:

- **Incomplete Invalidation**: Bulk operations only invalidate if projectId provided (line 270-273)
- **Pattern Invalidation**: Uses `/^projects:/` but may miss specific keys
- **Dual Cache Problem**: Both service and store maintain separate caches

### 3. Store-Level Caching

**Location**: `src/lib/stores/project.store.ts:189-193`

```typescript
if (!force && this.isCacheValid('tasks', 60000)) {
	return; // Returns cached data for 1 minute
}
```

**Cache TTL Configuration**:

- Tasks: 60 seconds
- Phases: 120 seconds
- Stats: 30 seconds
- Projects: 300 seconds

**Problems**:

- **No Automatic Invalidation**: Cache persists until TTL expires
- **Local Update Tracking**: 3-second window blocks legitimate updates (lines 152-156)
- **Memory-based Maps**: Data persists until manually cleared

### 4. Component-Level State Management

**Location**: `src/routes/projects/+page.svelte:184-314`

```javascript
// Manual state tracking
let projectsLoaded = false;

function handleBrainDumpClose() {
	showBrainDumpModal = false;
	selectedBrainDumpProject = null;
	projectsLoaded = false; // Only resets component flag
	loadProjects(); // Doesn't bypass caches!
}

async function loadProjects() {
	if (projectsLoaded || loadingProjects) return; // Early return on cached state

	const response = await fetch('/api/projects/list'); // No cache-busting headers
	// ...
}
```

**Critical Issues**:

- **No Cache Bypass**: `loadProjects()` doesn't include cache-busting headers
- **Service Cache Not Cleared**: Doesn't call `projectService.clearCache()`
- **Store Cache Persists**: Doesn't force reload with `force=true`

### 5. Real-Time Updates Conflict

**Location**: `src/lib/services/realtimeProject.service.ts:183-186, 433-438`

```typescript
// Overly aggressive filtering
if (newRecord?.user_id === this.state.currentUserId && this.isRecentUpdate(newRecord)) {
    return; // Skips updates within 2-second window
}

private static isRecentUpdate(record: any): boolean {
    return now - updateTime < 2000; // May block legitimate updates
}
```

### 6. Missing SvelteKit Dependencies

**Location**: `src/routes/projects/+page.server.ts:9`

```typescript
depends('app:auth'); // Only tracks auth, not project data
// Missing: depends('projects:list');
```

**Impact**: No automatic invalidation when project data changes

## Architecture Insights

### Multi-Layer Cache Architecture

The system implements a sophisticated but problematic 5-layer cache:

```
Browser HTTP Cache (5 min)
    ↓
ETag Conditional Requests (304 responses)
    ↓
Service LRU Cache (5 min, 50 items)
    ↓
Store TTL Cache (1-5 min per data type)
    ↓
Component State Cache (manual flags)
```

### Cache Invalidation Flow Issues

1. **Create/Update Operations**:
    - ✅ Service cache invalidates pattern `/^projects:/`
    - ✅ Store updates optimistically
    - ❌ HTTP cache persists (5 minutes)
    - ❌ ETags still match (304 responses)
    - ❌ Component state not reset

2. **Brain Dump Flow**:
    - User creates project via brain dump
    - Modal closes, triggers `handleBrainDumpClose()`
    - Component resets `projectsLoaded` flag
    - `loadProjects()` called but hits ALL cache layers
    - Result: Stale data displayed

## Code References

- `src/routes/api/projects/list/+server.ts:79-81` - HTTP cache configuration
- `src/routes/projects/+page.svelte:308-314` - Brain dump close handler
- `src/routes/projects/+page.svelte:190` - Fetch without cache-busting
- `src/lib/services/projectService.ts:270-273` - Incomplete bulk invalidation
- `src/lib/services/projectService.ts:94-98` - Service cache setting
- `src/lib/stores/project.store.ts:189-193` - Store cache validation
- `src/lib/stores/project.store.ts:152-156` - Local update tracking
- `src/lib/services/realtimeProject.service.ts:433-438` - Real-time filtering
- `src/lib/utils/api-response.ts:102-126` - ApiResponse.cached implementation

## Historical Context (from thoughts/)

### Performance Optimization History

- `thoughts/shared/research/2025-09-16_11-00-40_projects-route-optimization.md` - Documents multi-level caching strategy
- `thoughts/shared/research/2025-09-14_09-31-02_projects-slug-page-audit.md` - Performance audit showing cache benefits
- `thoughts/shared/research/2025-09-14_frontend-patterns-analysis.md` - Memory leak fixes from manual subscriptions
- `thoughts/shared/research/2025-09-10_braindump-api-optimization-analysis.md` - Successful cache implementation (5-min TTL)

### Known Issues Documented

- **Memory leaks** from manual store subscriptions (fixed 2025-09-14)
- **Race conditions** in processing notifications
- **Mixed Svelte 4/5 patterns** causing reactivity issues
- **Missing HTTP cache-control** identified as optimization opportunity

### Design Decisions

- **Multi-layer caching** chosen for 60-80% server load reduction
- **Service singleton pattern** with LRU cache for consistency
- **Optimistic updates** with rollback for better UX
- **Pattern-based invalidation** for related data clearing

## Recommended Solutions

### Immediate Fix (Critical)

```typescript
// src/routes/projects/+page.svelte
function handleBrainDumpClose() {
	showBrainDumpModal = false;
	selectedBrainDumpProject = null;

	// Clear ALL cache layers
	if (typeof window !== 'undefined') {
		const projectService = ProjectService.getInstance();
		projectService.clearCache();
	}

	projectsLoaded = false;

	// Force fresh data with cache-busting
	loadProjectsWithCacheBust();
}

async function loadProjectsWithCacheBust() {
	loadingProjects = true;

	try {
		const response = await fetch('/api/projects/list', {
			headers: {
				'Cache-Control': 'no-cache',
				Pragma: 'no-cache'
			},
			cache: 'no-store'
		});

		// Process response...
	} finally {
		loadingProjects = false;
		projectsLoaded = true;
	}
}
```

### Long-Term Solutions

1. **Implement Proper Cache Invalidation**:

    ```typescript
    // Add to +page.server.ts
    depends('projects:list');

    // After mutations
    await invalidate('projects:list');
    ```

2. **Reduce Cache Durations**:
    - HTTP cache: 60 seconds (from 300)
    - Remove stale-while-revalidate
    - Service cache: 2 minutes (from 5)

3. **Add Cache Versioning**:
    - Include data version in responses
    - Invalidate when version changes

4. **Implement WebSocket/SSE**:
    - Real-time updates bypass all caches
    - Direct store updates on changes

5. **Unify Cache Strategy**:
    - Single source of truth (either service OR store)
    - Consistent invalidation patterns
    - Atomic cache operations

## Related Research

- [Projects Route Optimization (2025-09-16)](./2025-09-16_11-00-40_projects-route-optimization.md)
- [Frontend Patterns Analysis (2025-09-14)](./2025-09-14_frontend-patterns-analysis.md)
- [Project Page Performance Audit (2025-09-14)](./2025-09-14_09-31-02_projects-slug-page-audit.md)

## Open Questions

1. Why was 5-minute HTTP caching chosen for frequently updated data?
2. Should we implement cache tags for granular invalidation?
3. Can we use SvelteKit's built-in caching instead of custom solutions?
4. Would moving to event-driven architecture solve the invalidation complexity?
5. Should we implement a "force refresh" button for users experiencing stale data?
