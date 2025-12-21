# Code Quality Findings Report

**Date:** 2025-12-21
**Scope:** BuildOS Web Application (`apps/web`)
**Reviewer:** Automated Analysis with Manual Verification
**Status:** ✅ ALL ISSUES FIXED (2025-12-21)

---

## Summary

| Severity | Count | Description                                                    | Status   |
| -------- | ----- | -------------------------------------------------------------- | -------- |
| Medium   | 2     | Logic bugs affecting UI behavior and data race conditions      | ✅ Fixed |
| Low      | 4     | Configuration issues and potential memory/performance concerns | ✅ Fixed |

---

## Findings

### MEDIUM-1: State Badge Color Mismatch ✅ FIXED

**File:** `apps/web/src/routes/projects/[id]/+page.svelte`
**Lines:** 388-444
**Fix:** Added `getStateKey()` helper function that extracts canonical lowercase keys. Both `normalizeState()` and `getStateColor()` now use this helper for consistent state matching.

**Issue:**
The `normalizeState()` function returns Title Case strings (e.g., "In Review", "Draft", "Published"), but `getStateColor()` compares against `STATE_COLUMNS` which uses lowercase keys. This causes status badges to always fall back to the default `bg-muted` color.

**Code Analysis:**

```typescript
// Lines 133-138: STATE_COLUMNS uses lowercase keys
const STATE_COLUMNS = [
	{ key: 'draft', label: 'Draft', color: 'bg-muted' },
	{ key: 'review', label: 'In Review', color: 'bg-amber-500/10' },
	{ key: 'approved', label: 'Approved', color: 'bg-accent/10' },
	{ key: 'published', label: 'Published', color: 'bg-emerald-500/10' }
];

// Lines 388-401: normalizeState() returns Title Case
function normalizeState(state: string): string {
	const s = state?.toLowerCase() || 'draft';
	let normalized: string;
	// ... normalization logic ...
	// Returns Title Case: "In Review", "Draft", etc.
	return normalized
		.split(/[_\s]+/)
		.map((w) => w.charAt(0).toUpperCase() + w.slice(1))
		.join(' ');
}

// Lines 440-444: getStateColor() compares Title Case against lowercase keys
function getStateColor(state: string): string {
	const normalized = normalizeState(state); // Returns "In Review"
	const col = STATE_COLUMNS.find((c) => c.key === normalized); // Compares against 'review'
	return col?.color || 'bg-muted'; // Always falls back to bg-muted
}
```

**Impact:**

- All output status badges display with the default muted background color
- Visual distinction between states (Draft, In Review, Approved, Published) is lost
- Users cannot quickly identify output status at a glance

**Recommendation:**
Compare the pre-Title-Case normalized value against `STATE_COLUMNS.key`:

```typescript
function getStateColor(state: string): string {
	const s = state?.toLowerCase() || 'draft';
	// Normalize to canonical key first
	let key: string;
	if (s === 'complete' || s === 'completed' || s === 'shipped') key = 'published';
	else if (s === 'in_review' || s === 'reviewing') key = 'review';
	else if (s === 'in_progress' || s === 'drafting') key = 'draft';
	else if (STATE_COLUMNS.some((c) => c.key === s)) key = s;
	else key = 'draft';

	const col = STATE_COLUMNS.find((c) => c.key === key);
	return col?.color || 'bg-muted';
}
```

---

### MEDIUM-2: Promise Race Condition in History Page ✅ FIXED

**File:** `apps/web/src/routes/history/+page.svelte`
**Lines:** 99-111
**Fix:** Added `historyResolveVersion` token. Each `$effect` run increments the version and checks it before updating state, discarding stale Promise resolutions.

**Issue:**
The `$effect` that resolves `data.historyData` does not guard against stale Promise resolution. When users rapidly change filters or pagination, older Promises can resolve after newer ones, causing stale data to overwrite current results.

**Code Analysis:**

```typescript
// Lines 99-111: No staleness guard
$effect(() => {
	historyLoading = true;
	historyError = null;
	data.historyData
		.then((result) => {
			resolvedData = result; // May overwrite newer data
			historyLoading = false;
		})
		.catch((err) => {
			historyError = err?.message || 'Failed to load history';
			historyLoading = false;
		});
});
```

**Scenario:**

1. User applies filter A (Promise A starts)
2. User immediately applies filter B (Promise B starts)
3. Promise B resolves first, showing filter B results
4. Promise A resolves later, overwriting filter B results with stale filter A data

**Impact:**

- Inconsistent UI state - displayed results may not match applied filters
- User confusion when viewing data that doesn't match their filter selections
- Race condition is intermittent and hard to reproduce

**Recommendation:**
Use a version token pattern (similar to `+page.svelte` projects streaming):

```typescript
let historyVersion = 0;

$effect(() => {
	const currentVersion = ++historyVersion;
	historyLoading = true;
	historyError = null;

	data.historyData
		.then((result) => {
			if (currentVersion !== historyVersion) return; // Stale, discard
			resolvedData = result;
			historyLoading = false;
		})
		.catch((err) => {
			if (currentVersion !== historyVersion) return; // Stale, discard
			historyError = err?.message || 'Failed to load history';
			historyLoading = false;
		});
});
```

---

### LOW-1: Double Speed Insights Injection ✅ FIXED

**Files:**

- `apps/web/src/routes/+layout.ts` (line 8)
- `apps/web/src/routes/+layout.svelte` (lines 51-59)

**Fix:** Removed `injectSpeedInsights()` call and import from `+layout.ts`. Kept the guarded version in `+layout.svelte` which only runs in browser and production.

**Issue:**
Speed Insights is injected in both files, potentially causing duplicate telemetry scripts.

**Code Analysis:**

```typescript
// +layout.ts line 8
injectSpeedInsights();

// +layout.svelte lines 51-59
import { injectSpeedInsights } from '@vercel/speed-insights/sveltekit';

if (browser && !dev) {
	injectSpeedInsights();
}
```

**Impact:**

- Potential duplicate telemetry data sent to Vercel
- Slight performance overhead from duplicate script injection
- May affect analytics accuracy

**Recommendation:**
Remove one of the injection sites. The `+layout.svelte` version with the `browser && !dev` guard is more appropriate:

```typescript
// Remove from +layout.ts (line 8)
// injectSpeedInsights();  // DELETE THIS LINE
```

---

### LOW-2: Duplicate Supabase Browser Clients ✅ FIXED

**Files:**

- `apps/web/src/routes/+layout.ts` (lines 11-19)
- `apps/web/src/routes/+layout.svelte` (lines 90-94)

**Fix:** Changed `+layout.svelte` to use `data.supabase` from `+layout.ts` instead of creating a new client. Removed the unused `createSupabaseBrowser` import.

**Issue:**
Both files create separate Supabase browser clients, which can result in duplicated auth listeners and extra memory usage.

**Code Analysis:**

```typescript
// +layout.ts lines 17-18
export const load = async ({ data, depends }) => {
	return {
		...data,
		supabase: browser ? createSupabaseBrowser() : null
	};
};

// +layout.svelte lines 90-94
const supabase = browser ? createSupabaseBrowser() : null;
if (supabase) {
	setContext('supabase', supabase);
}
```

**Impact:**

- Two separate Supabase client instances in memory
- Auth state changes may be handled by both instances
- Potential for inconsistent auth state between instances
- Increased memory footprint

**Recommendation:**
Use the client from `+layout.ts` via the data prop in `+layout.svelte`:

```typescript
// +layout.svelte - use the passed client instead of creating new one
const supabase = data.supabase; // From +layout.ts
if (supabase) {
	setContext('supabase', supabase);
}
```

---

### LOW-3: Trailing Space in TypeScript Version ✅ FIXED

**File:** `apps/web/package.json`
**Line:** 114
**Fix:** Removed trailing space from `"^5.9.2 "` → `"^5.9.2"`.

**Issue:**
The TypeScript version has a trailing space: `"^5.9.2 "` instead of `"^5.9.2"`.

**Code:**

```json
"typescript": "^5.9.2 ",
```

**Impact:**

- May cause inconsistencies in lockfile generation
- Different package managers may handle the trailing space differently
- Could lead to "phantom" changes in `pnpm-lock.yaml` across machines

**Recommendation:**
Remove the trailing space:

```json
"typescript": "^5.9.2",
```

---

### LOW-4: Node.js Types Version Mismatch ✅ FIXED

**File:** `apps/web/package.json`
**Lines:** 122, 143
**Fix:** Downgraded `@types/node` from `^24.1.0` to `^20.19.0` to match the Node 20.x runtime specified in engines.

**Issue:**
Runtime Node.js version is 20.x but `@types/node` is v24. The types may expose APIs not available at runtime.

**Code:**

```json
"engines": {
  "node": ">=20.19.0",  // Line 122
  ...
},
"dependencies": {
  "@types/node": "^24.1.0",  // Line 143
  ...
}
```

**Impact:**

- TypeScript may allow usage of Node.js 24 APIs
- Code compiles successfully but fails at runtime
- Affects features like:
    - New `crypto` methods
    - New `fs` APIs
    - Iterator helpers
    - Any Node 21-24 specific additions

**Recommendation:**
Align `@types/node` with the runtime version:

```json
"@types/node": "^20.19.0",
```

Or if you need the latest LTS features:

```json
"@types/node": "^20",
```

---

## Priority Matrix

| Finding                           | Severity   | Effort  | Impact           | Priority |
| --------------------------------- | ---------- | ------- | ---------------- | -------- |
| MEDIUM-1: State Badge Colors      | Medium     | Low     | High (UX)        | **P1**   |
| MEDIUM-2: History Race Condition  | Medium     | Low     | Medium           | **P2**   |
| LOW-4: Node Types Mismatch        | Low/Medium | Low     | Medium (Runtime) | **P2**   |
| LOW-1: Double Speed Insights      | Low        | Low     | Low              | P3       |
| LOW-2: Duplicate Supabase Clients | Low        | Low     | Low              | P3       |
| LOW-3: Trailing Space             | Low        | Trivial | Low              | P3       |

---

## Resolution Summary

All 6 issues were fixed on 2025-12-21:

| Issue    | Fix Applied                                                 |
| -------- | ----------------------------------------------------------- |
| MEDIUM-1 | Added `getStateKey()` helper for consistent state matching  |
| MEDIUM-2 | Added version token pattern to guard against stale Promises |
| LOW-1    | Removed duplicate Speed Insights from `+layout.ts`          |
| LOW-2    | Changed to use shared Supabase client from `data.supabase`  |
| LOW-3    | Removed trailing space from TypeScript version              |
| LOW-4    | Downgraded `@types/node` to `^20.19.0`                      |

**Verification:** Type checking passed with `pnpm run check`. Pre-existing errors in unrelated files (`migration-stats.service.ts`, `migration-error.service.ts`, `onto.ts`) remain but are outside the scope of these fixes.

---

## References

- Root cause similar to projects streaming: `apps/web/src/routes/+page.svelte` lines 54-80 (correctly implemented)
- Inkprint Design System: `apps/web/docs/technical/components/INKPRINT_DESIGN_SYSTEM.md`
- Ontology Data Models: `apps/web/docs/features/ontology/DATA_MODELS.md`
