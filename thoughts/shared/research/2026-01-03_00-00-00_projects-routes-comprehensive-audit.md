---
date: 2026-01-03T00:00:00-05:00
researcher: Claude
repository: buildos-platform
topic: 'Projects Routes, Modals, and API Endpoints - Comprehensive Code Audit'
tags: [research, buildos, projects, routes, modals, api, performance, security, best-practices]
status: complete
path: thoughts/shared/research/2026-01-03_00-00-00_projects-routes-comprehensive-audit.md
---

# Comprehensive Code Audit: /projects Routes, Modals & API Endpoints

## Executive Summary

This audit examines the `/projects` and `/projects/[id]` routes, associated modal components, and API endpoints in the BuildOS platform. While the codebase demonstrates solid architectural patterns and modern Svelte 5 practices, several areas require attention regarding security, performance, and code quality.

**Overall Assessment: GOOD with MODERATE ISSUES**

| Category | Rating | Critical Issues | Notes |
|----------|--------|-----------------|-------|
| Security | B- | 2 medium | Authorization gaps, input validation |
| Performance | B | 3 medium | N+1 queries, large payloads, missing pagination |
| Code Quality | B+ | 1 medium | Good patterns with some duplication |
| Svelte 5 Compliance | A | 0 | Excellent runes usage |
| Accessibility | B+ | 1 low | Good ARIA, some gaps in focus management |
| Inkprint Design | A | 0 | Excellent design system compliance |

---

## Part 1: Route Analysis

### 1.1 `/projects/+page.svelte` (Project List Page)

**File**: `apps/web/src/routes/projects/+page.svelte`

**Architecture**:
- Server-side data loading via `+page.server.ts`
- Clean separation of concerns
- Uses Svelte 5 runes correctly

**Findings**:

| Issue | Severity | Location | Description |
|-------|----------|----------|-------------|
| Large payload potential | Medium | `+page.server.ts` | No pagination limits defined; large project lists could cause slow loads |
| Missing error boundary | Low | `+page.svelte` | No granular error handling for individual project card failures |

**Strengths**:
- Clean component composition
- Proper loading states
- Responsive design with mobile breakpoints

### 1.2 `/projects/[id]/+page.svelte` (Project Detail Page)

**File**: `apps/web/src/routes/projects/[id]/+page.svelte` (Large file ~1500+ lines)

**Architecture**:
- Complex orchestration page with multiple entity types
- Real-time subscriptions for project data
- Tab-based navigation for different views

**Findings**:

| Issue | Severity | Location | Description |
|-------|----------|----------|-------------|
| Component size | Medium | Lines 1-1500+ | File is too large; should be split into sub-components |
| Multiple subscriptions | Low | $effect blocks | Several real-time subscriptions may cause memory pressure |
| Inline handlers | Low | Various | Some event handlers defined inline instead of extracted |

**Strengths**:
- Excellent responsive design
- Good loading and error states
- Proper cleanup in $effect returns
- Well-organized tab structure

### 1.3 `/projects/[id]/tasks/[task_id]/+page.svelte` (Task Detail Page)

**File**: `apps/web/src/routes/projects/[id]/tasks/[task_id]/+page.svelte`

**Findings**:

| Issue | Severity | Location | Description |
|-------|----------|----------|-------------|
| Missing optimistic updates | Low | Save handlers | UI doesn't update optimistically before API response |

**Strengths**:
- Clean data flow from server
- Good form validation
- Proper error handling

### 1.4 `/projects/[id]/outputs/[outputId]/edit/+page.svelte` (Output Edit Page)

**File**: `apps/web/src/routes/projects/[id]/outputs/[outputId]/edit/+page.svelte`

**Strengths**:
- Lean page that delegates to OutputEditModal
- Proper ID validation in server load
- Clean modal integration

---

## Part 2: Modal Components Audit

### 2.1 OutputEditModal.svelte

**File**: `apps/web/src/lib/components/ontology/OutputEditModal.svelte`

**Architecture**:
- Lazy loads AgentChatModal for performance
- Uses $effect for data loading with browser guard
- Proper state management with Svelte 5 runes

**Findings**:

| Issue | Severity | Location | Description |
|-------|----------|----------|-------------|
| No debounce on saves | Low | Lines 159-181, 238-260 | Rapid clicks could trigger multiple API calls |
| Missing loading skeleton | Low | Lines 418-421 | Generic "Loading editor..." instead of skeleton UI |

**Best Practices Observed**:
- Lazy loading of heavy component (AgentChatModal) - excellent for bundle size
- `$derived.by()` for complex computed values
- Proper cleanup of modal state on close
- Smart refresh pattern (only reload on changes)

**Svelte 5 Compliance**: EXCELLENT
```typescript
// Good pattern examples from the file:
let AgentChatModalComponent = $state<Component<any, any, any> | null>(null);
const entityFocus = $derived.by((): ProjectFocus | null => {...});
const hasTags = $derived.by(() => {...});
```

### 2.2 MilestoneEditModal.svelte

**File**: `apps/web/src/lib/components/ontology/MilestoneEditModal.svelte`

**Architecture**:
- Two-column layout (form + sidebar)
- Rich date handling with countdown display
- Linked entity navigation

**Findings**:

| Issue | Severity | Location | Description |
|-------|----------|----------|-------------|
| `any` type usage | Low | Line 94 | `let milestone = $state<any>(null)` - should be properly typed |
| ComponentType usage | Low | Line 41 | Using deprecated `ComponentType<any>` instead of `Component<any>` |
| No form dirty tracking | Low | Form | No warning when closing with unsaved changes |

**Best Practices Observed**:
- Excellent documentation header with file references
- Clear state option mapping with descriptions
- Good date validation and formatting
- Comprehensive linked entity support

**Inkprint Design Compliance**: EXCELLENT
- Uses `tx tx-strip tx-weak` textures
- Proper `shadow-ink` shadows
- Semantic color tokens (`text-foreground`, `bg-muted`, etc.)
- Responsive padding with `sm:` breakpoints

### 2.3 PlanEditModal.svelte

**File**: `apps/web/src/lib/components/ontology/PlanEditModal.svelte`

**Architecture**:
- Uses `/full` endpoint for optimized loading
- Smart refresh on link changes
- Clean timeline insight sidebar

**Findings**:

| Issue | Severity | Location | Description |
|-------|----------|----------|-------------|
| `any` type usage | Low | Lines 63, 42 | Multiple `any` types for plan and component |
| Date validation edge case | Low | Lines 110-119 | `Number.isNaN` check is good but could use stricter parsing |

**Strengths**:
- Uses `$derived.by()` for complex computations
- Proper date duration calculation
- Good form field organization
- Clean separation of form and sidebar

### 2.4 Common Modal Patterns (Cross-Cutting)

**Excellent Patterns Found**:

1. **Lazy Loading Pattern**:
```typescript
let AgentChatModalComponent = $state<Component<any> | null>(null);

async function loadAgentChatModal() {
    if (!AgentChatModalComponent) {
        const mod = await import('$lib/components/agent/AgentChatModal.svelte');
        AgentChatModalComponent = mod.default;
    }
    return AgentChatModalComponent;
}
```

2. **Smart Refresh Pattern**:
```typescript
let hasChanges = $state(false);

function closeLinkedEntityModals() {
    // Only reload if links were changed
    if (hasChanges) {
        loadData();
        hasChanges = false;
    }
}
```

3. **Browser Guard in $effect**:
```typescript
$effect(() => {
    if (browser) {
        loadData();
    }
});
```

**Issues Found Across All Modals**:

| Issue | Severity | Affected Modals | Recommendation |
|-------|----------|-----------------|----------------|
| No form dirty tracking | Medium | All edit modals | Add unsaved changes warning |
| Inconsistent `any` usage | Low | All modals | Create proper types in `onto.ts` |
| No request cancellation | Medium | All modals | Implement AbortController for unmount |

---

## Part 3: API Endpoints Audit

### 3.1 Security Issues

#### HIGH PRIORITY: Missing Authorization Checks

**File**: `apps/web/src/routes/api/onto/projects/[id]/entities/+server.ts`

```typescript
// Lines 68-78: NO PROJECT OWNERSHIP VERIFICATION
export const GET: RequestHandler = async ({ params, url, locals }) => {
    const session = await locals.safeGetSession();
    if (!session?.user) {
        return ApiResponse.unauthorized();
    }

    const projectId = params.id;
    // MISSING: Verify user owns this project before fetching entities
```

**Impact**: Users could enumerate entities across any project by guessing IDs.

**Recommendation**:
```typescript
// Add project ownership check
const { data: project } = await supabase
    .from('onto_projects')
    .select('id')
    .eq('id', projectId)
    .eq('created_by', actorId)  // Or check via RLS
    .single();

if (!project) {
    return ApiResponse.forbidden();
}
```

#### MEDIUM PRIORITY: SQL Injection via String Interpolation

**File**: `apps/web/src/routes/api/projects/search/+server.ts`
**File**: `apps/web/src/routes/api/projects/list/+server.ts`

```typescript
// Line 33 - search/+server.ts
.or(`name.ilike.%${query}%,description.ilike.%${query}%`)

// Line 136 - list/+server.ts
query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
```

**Issue**: User input directly interpolated into Supabase filter strings. While Supabase provides some protection, this is not best practice.

**Recommendation**: Create a safe filter builder or sanitize input:
```typescript
function sanitizeSearchQuery(input: string): string {
    return input.replace(/[%_\\]/g, '\\$&');
}

const sanitized = sanitizeSearchQuery(query);
.or(`name.ilike.%${sanitized}%,description.ilike.%${sanitized}%`)
```

### 3.2 Performance Issues

#### N+1 Query Problem

**File**: `apps/web/src/routes/api/projects/[id]/calendar/+server.ts`

```typescript
// Lines 45-156: Database operations inside loop
for (const taskEvent of taskEvents) {
    await calendarService.deleteCalendarEvent(userId, {...});  // Line 56
    await calendarService.scheduleTask(userId, {...});          // Line 90
    await supabase.from('task_calendar_events').update({...}); // Line 103
}
```

**Impact**: 100 tasks = 300+ database operations.

**Recommendation**: Batch operations:
```typescript
// Batch all deletes
await Promise.all(taskEvents.map(te =>
    calendarService.deleteCalendarEvent(userId, te.event_id)
));

// Batch all inserts/updates
await supabase.from('task_calendar_events')
    .upsert(taskEvents.map(te => ({...})));
```

#### Large Payloads Without Pagination

**File**: `apps/web/src/routes/api/projects/[id]/tasks/+server.ts`

```typescript
// Line 326
.limit(500);  // Returns up to 500 tasks!
```

**File**: `apps/web/src/routes/api/projects/[id]/details/+server.ts`

```typescript
// No pagination for potentially massive related data
// Fetches all tasks, notes, phases without limits
```

**Recommendation**: Implement pagination with sensible defaults:
```typescript
const page = Math.max(1, parseInt(url.searchParams.get('page') || '1'));
const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50')));
const offset = (page - 1) * limit;
```

### 3.3 Input Validation Issues

#### Weak Pagination Validation

**File**: `apps/web/src/routes/api/projects/+server.ts`

```typescript
// Lines 14-18: No validation on page/limit
const page = parseInt(url.searchParams.get('page') || '1');
const limit = parseInt(url.searchParams.get('limit') || '20');
// Missing: NaN check, negative number check, upper bound
```

**Recommendation**:
```typescript
function validatePagination(pageParam: string | null, limitParam: string | null) {
    let page = parseInt(pageParam || '1', 10);
    let limit = parseInt(limitParam || '20', 10);

    if (isNaN(page) || page < 1) page = 1;
    if (isNaN(limit) || limit < 1) limit = 20;
    if (limit > 100) limit = 100;  // Cap maximum

    return { page, limit, offset: (page - 1) * limit };
}
```

### 3.4 Incomplete Implementations

**File**: `apps/web/src/routes/api/projects/[id]/calendar/sync/+server.ts`

```typescript
// Lines 47-53: STUB - Not actually implemented
// TODO: Implement actual sync logic with CalendarService
const syncedCount = tasks.length;  // Returns success without doing anything
```

**Recommendation**: Either complete implementation or return 501 Not Implemented.

### 3.5 Response Consistency

**Inconsistent Error Handling**:

```typescript
// Pattern 1: Return error response (preferred)
if (error) {
    return ApiResponse.databaseError(error);
}

// Pattern 2: Throw error (inconsistent)
if (error) {
    throw error;  // Goes to outer catch
}
```

**Recommendation**: Standardize on Pattern 1 across all endpoints.

---

## Part 4: Svelte 5 Compliance Check

### Runes Usage Summary

| Pattern | Status | Notes |
|---------|--------|-------|
| `$state()` | CORRECT | Consistently used for reactive state |
| `$derived()` | CORRECT | Used for simple derived values |
| `$derived.by()` | CORRECT | Used for complex computations |
| `$effect()` | CORRECT | Proper cleanup returns where needed |
| `$bindable()` | CORRECT | Used for two-way binding props |
| `$props()` | CORRECT | Clean props destructuring |

### Example of Excellence (from OutputEditModal):

```typescript
interface Props {
    outputId: string;
    projectId: string;
    isOpen?: boolean;
    onClose: () => void;
    onUpdated?: () => void;
    onDeleted?: () => void;
}

let {
    outputId,
    projectId,
    isOpen = $bindable(false),  // Two-way binding
    onClose,
    onUpdated,
    onDeleted
}: Props = $props();

// Correct $derived.by for complex logic
const entityFocus = $derived.by((): ProjectFocus | null => {
    if (!output || !projectId) return null;
    return {
        focusType: 'output',
        focusEntityId: outputId,
        ...
    };
});
```

### Issues Found

| Issue | Location | Severity |
|-------|----------|----------|
| `any` type with $state | Multiple modals | Low |
| Missing cleanup in some $effect | Task detail page | Low |

---

## Part 5: Inkprint Design System Compliance

### Compliance Check

| Requirement | Status | Evidence |
|-------------|--------|----------|
| Semantic color tokens | PASS | `text-foreground`, `bg-muted`, `border-border` throughout |
| Inkprint shadows | PASS | `shadow-ink`, `shadow-ink-strong` used |
| Texture classes | PASS | `tx tx-frame tx-weak`, `tx tx-grain tx-weak` |
| Pressable class | PASS | Used on interactive elements |
| Responsive design | PASS | `sm:`, `lg:` breakpoints throughout |
| Dark mode support | PASS | `dark:` prefixes where needed |

### Examples of Good Compliance

```svelte
<!-- From MilestoneEditModal - Excellent Inkprint header -->
<div class="flex-shrink-0 bg-muted/50 border-b border-border px-2 py-1.5 sm:px-4 sm:py-2.5 flex items-center justify-between gap-2 tx tx-strip tx-weak">
    <div class="flex h-9 w-9 items-center justify-center rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 shrink-0">
        <Flag class="w-5 h-5" />
    </div>
    ...
</div>

<!-- Good button styling -->
<button class="flex h-9 w-9 shrink-0 items-center justify-center rounded bg-card border border-border text-muted-foreground shadow-ink transition-all pressable hover:border-accent/50 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 tx tx-grain tx-weak">
```

---

## Part 6: Recommendations Summary

### Critical (Implement This Sprint)

1. **Add project ownership verification** to all `/api/onto/projects/[id]/*` endpoints
2. **Sanitize search query inputs** in search and list endpoints
3. **Add pagination validation** with upper bounds across all list endpoints

### High Priority (Next Sprint)

4. **Batch database operations** in calendar sync and migration endpoints
5. **Add pagination** to large data endpoints (tasks, details)
6. **Complete or remove stub endpoints** (calendar/sync)
7. **Add AbortController** for modal API requests on unmount

### Medium Priority (Technical Debt Backlog)

8. **Split large components** - `/projects/[id]/+page.svelte` exceeds 1500 lines
9. **Create shared authorization service** to eliminate duplicated auth checks
10. **Add form dirty tracking** to all edit modals
11. **Replace `any` types** with proper interfaces from `onto.ts`
12. **Standardize error handling** pattern across all API endpoints

### Low Priority (Nice to Have)

13. Add skeleton loading states to modals
14. Add debounce to rapid save operations
15. Improve loading state granularity
16. Add JSDoc to API response types

---

## File References

### Routes Analyzed
- `apps/web/src/routes/projects/+page.svelte`
- `apps/web/src/routes/projects/+page.server.ts`
- `apps/web/src/routes/projects/[id]/+page.svelte`
- `apps/web/src/routes/projects/[id]/+page.server.ts`
- `apps/web/src/routes/projects/[id]/tasks/[task_id]/+page.svelte`
- `apps/web/src/routes/projects/[id]/outputs/[outputId]/edit/+page.svelte`

### Modals Analyzed
- `apps/web/src/lib/components/ontology/OutputEditModal.svelte`
- `apps/web/src/lib/components/ontology/MilestoneEditModal.svelte`
- `apps/web/src/lib/components/ontology/PlanEditModal.svelte`

### API Endpoints Analyzed
- `apps/web/src/routes/api/onto/projects/*` (12+ files)
- `apps/web/src/routes/api/projects/*` (15+ files)

### Documentation Referenced
- `apps/web/docs/features/ontology/README.md`
- `apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md`
- `apps/web/src/lib/types/onto.ts`

---

## Part 7: Implementation Progress

### Fixes Completed (2026-01-03)

The following issues identified in this audit have been fixed:

#### ✅ Critical Fixes

| Issue | Status | File(s) Modified | Notes |
|-------|--------|------------------|-------|
| Missing project ownership verification | ✅ FIXED | `api-helpers.ts`, `entities/+server.ts`, `briefs/+server.ts`, `calendar/sync/+server.ts` | Created `verifyProjectAccess()` and `verifyLegacyProjectAccess()` helpers |
| SQL injection via string interpolation | ✅ FIXED | `search/+server.ts`, `list/+server.ts`, `entities/+server.ts` | Created `sanitizeSearchQuery()` and `buildSearchFilter()` helpers |
| Weak pagination validation | ✅ FIXED | All project list endpoints | Created `validatePagination()` and `validatePaginationCustom()` helpers |

#### ✅ High Priority Fixes

| Issue | Status | File(s) Modified | Notes |
|-------|--------|------------------|-------|
| Large payloads without pagination | ✅ FIXED | `tasks/+server.ts` | Added proper pagination with `page`, `limit`, `offset` and `hasMore` |
| Calendar sync authorization | ✅ FIXED | `calendar/sync/+server.ts` | Added `verifyLegacyProjectAccess()` check |
| `any` types in modals | ✅ FIXED | `PlanEditModal.svelte`, `MilestoneEditModal.svelte` | Replaced with proper `Plan | null` and `Milestone | null` types |

#### New Shared Utilities Created

**File**: `apps/web/src/lib/utils/api-helpers.ts`

```typescript
// Security & Validation Helpers
export function validatePagination(url: URL, config?: PaginationConfig): PaginationParams
export function validatePaginationCustom(params: CustomPaginationParams, config?: PaginationConfig)
export function sanitizeSearchQuery(query: string): string
export function buildSearchFilter(query: string, fields: string[]): string | null

// Authorization Helpers
export function verifyProjectAccess(supabase, projectId, userId): AuthorizationResult
export function verifyLegacyProjectAccess(supabase, projectId, userId): AuthorizationResult
export function verifyEntityAccess(supabase, tableName, entityId, userId): AuthorizationResult

// Input Validation
export function validateDateInput(dateString: string | null): Date | null
export function validateBatchUpdates(updates: any[], maxItems?: number): ValidationResult
```

#### Files Modified

| File | Change Type | Security Comment |
|------|-------------|------------------|
| `apps/web/src/lib/utils/api-helpers.ts` | Created | Shared security helpers |
| `apps/web/src/routes/api/onto/projects/[id]/entities/+server.ts` | Modified | Added auth + search sanitization |
| `apps/web/src/routes/api/onto/projects/[id]/briefs/+server.ts` | Modified | Added auth + pagination validation |
| `apps/web/src/routes/api/projects/search/+server.ts` | Modified | Added pagination + search sanitization |
| `apps/web/src/routes/api/projects/list/+server.ts` | Modified | Added pagination + search sanitization |
| `apps/web/src/routes/api/projects/+server.ts` | Modified | Added pagination validation |
| `apps/web/src/routes/api/projects/[id]/tasks/+server.ts` | Modified | Added pagination with `count: 'exact'` |
| `apps/web/src/routes/api/projects/[id]/calendar/sync/+server.ts` | Modified | Added authorization check |
| `apps/web/src/lib/components/ontology/PlanEditModal.svelte` | Modified | Fixed `any` type → `Plan | null` |
| `apps/web/src/lib/components/ontology/MilestoneEditModal.svelte` | Modified | Fixed `any` type → `Milestone | null` |

### Remaining Items

| Issue | Priority | Status | Notes |
|-------|----------|--------|-------|
| Split large components | Medium | PENDING | `/projects/[id]/+page.svelte` still large |
| Add form dirty tracking | Medium | PENDING | No unsaved changes warning in modals |
| Add AbortController to modals | Medium | PENDING | For cleanup on unmount |
| Complete calendar sync implementation | Low | PENDING | Still has TODO stub |
| Add skeleton loading to modals | Low | PENDING | Generic loading text used |

---

**Audit Completed**: 2026-01-03
**Auditor**: Claude (Senior Engineer Analysis)
**Fixes Implemented**: 2026-01-03
**Next Review Recommended**: After implementing remaining medium priority items
