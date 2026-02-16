<!-- docs/specs/DOCUMENT_VERSION_DIFF_COMPARISON_SPEC.md -->

# Document Version Diff & Comparison Spec

## Status: Draft

## Date: 2026-02-14

---

## Problem

The DocumentModal has version history functionality, but comparing versions is clunky and disconnected from the editing experience:

1. **Separate modal overlay**: Clicking "vs Previous" or "vs Current" opens a `DocumentVersionDiffDrawer` as a second modal on top of the document modal. The user loses context of the document they're editing.
2. **No step-through navigation**: To compare multiple versions, the user must close the diff modal, go back to the version list, select another version, and re-open. This is tedious for reviewing a sequence of changes.
3. **Weak diff algorithm**: The current `createLineDiff()` in `diff.ts` uses Set-based membership checking. This means if the same line text exists in both versions (even at different positions), it's marked "unchanged." Duplicate lines, reordered content, and subtle edits are poorly represented.
4. **No word-level highlighting**: The diff only shows whole-line additions/removals. If a single word changed on a long line, the entire line is highlighted red/green with no indication of what specifically changed.
5. **No inline/unified view option**: Only side-by-side mode exists, which wastes space on narrow screens and for small changes.

## Goal

Replace the current separate-modal diff experience with an **inline comparison mode** that takes over the DocumentModal's main content area. The user should be able to browse version diffs step-by-step without leaving their document, with GitHub-quality diff rendering.

---

## Design

### Core Concept: Comparison Mode

When the user activates comparison mode, the DocumentModal transitions from **editing mode** to **comparison mode**:

- The main content area (where the RichMarkdownEditor normally lives) is replaced with a **diff view**
- A **comparison toolbar** appears at the top of the content area with version navigation
- The left sidebar remains visible (version history panel stays accessible)
- An "Exit comparison" button returns to editing mode

This keeps the user within the same modal and maintains spatial context.

### Entry Point

In the `DocumentVersionHistoryPanel`, each version in the list gets a new interaction pattern:

**Current behavior**: Click version to select it, then click "vs Previous" or "vs Current" buttons in the actions bar below the list.

**New behavior**: Keep the current select + action pattern, but add a prominent **"See Changes"** button that appears when a version is selected. Clicking "See Changes" activates comparison mode in the main content area instead of opening a separate modal.

```
Version selected → Actions bar shows:
  [See Changes]  [Restore] (admin only)
```

"See Changes" defaults to comparing the selected version against the previous version (same as "vs Previous" today). Once in comparison mode, the user can toggle the comparison target.

### Comparison Toolbar

When comparison mode is active, a toolbar replaces the "CONTENT / MARKDOWN" header above the editor:

```
+-----------------------------------------------------------------------+
| [< Prev]  v3 → v4  [Next >]  |  vs: [Previous] [Current]  | [x Exit] |
+-----------------------------------------------------------------------+
```

**Elements:**

- **Prev/Next arrows**: Step through adjacent version pairs. "Prev" compares v2→v3, "Next" compares v4→v5. Disabled at boundaries.
- **Version labels**: Shows the "from → to" versions being compared, e.g. "v3 → v4"
- **Compare target toggle**: Switch between comparing to "Previous version" or "Current document"
- **Exit button**: Returns to editing mode, restoring the RichMarkdownEditor

### Comparison State Model (Required)

Use a state model that avoids invalid version numbers and keeps navigation deterministic:

- `selectedVersionNumber: number` (always 1..latest)
- `compareTarget: 'previous' | 'current'`
- `fromVersionNumber: number | null` (`null` means empty baseline)
- `toVersionNumber: number | 'current'`

Rules:

- If `compareTarget === 'previous'`:
    - `selectedVersionNumber === 1` maps to `fromVersionNumber = null`, `toVersionNumber = 1` (all-added diff)
    - otherwise `fromVersionNumber = selectedVersionNumber - 1`, `toVersionNumber = selectedVersionNumber`
- If `compareTarget === 'current'`:
    - `fromVersionNumber = selectedVersionNumber`, `toVersionNumber = 'current'`
- Prev/Next changes `selectedVersionNumber` by ±1 regardless of target mode.
- Boundaries are `1..latestVersionNumber`; never issue API requests for version `0`.

### Diff View

The diff view replaces the editor content area and shows changes between two document states.

#### View Modes

Two view modes, toggled via a control in the toolbar:

1. **Unified view** (default): Single-column, GitHub-style unified diff. Added lines have green left border and light green background. Removed lines have red left border and light rose background. Unchanged context lines shown in between. Best for reading through changes linearly.

2. **Split view**: Two columns side-by-side (like the current DiffView.svelte but improved). Left column shows the "from" version, right column shows the "to" version. Lines are aligned so changes appear at the same vertical position. Best for comparing long content.

On mobile, only unified view is available (split view collapses to unified).

#### Field Sections

The diff view shows changes organized by field, in order of importance:

1. **Content** (body markdown) - always shown, largest section
2. **Title** - shown only if changed
3. **Description** - shown only if changed
4. **State** - shown only if changed (e.g., "draft → published")

Each field section has a collapsible header showing the field name and a change indicator.

If no fields changed between the two versions, show a message: "No changes between these versions."

#### Line-Level Diff

Each line in the diff shows:

- **Line number** (gutter, muted color)
- **Change indicator**: `+` for added, `-` for removed, space for unchanged
- **Line content** with **word-level highlighting**

#### Word-Level Highlighting (Key Improvement)

Within changed lines, individual words/tokens that differ are highlighted with a stronger background:

- Added words: bold green background on the specific words, lighter green on the rest of the line
- Removed words: bold red background on the specific words, lighter red on the rest of the line

This is the single biggest UX improvement. Instead of "this entire line changed," the user sees exactly which words were added, removed, or modified.

**Implementation**: Use the `diff` npm package (`jsdiff`):

- `diffLines()` to identify changed line ranges
- `diffWords()` on changed line pairs to identify word-level changes
- Render word spans with appropriate highlight classes
- Pair adjacent removed/added line blocks to compute "modified lines" stats deterministically (`modified = min(removed, added)` per block)

#### Context Lines

For long documents, don't show every unchanged line. Show:

- 3 lines of context above and below each change hunk
- A collapsible "show N hidden lines" separator between hunks
- Click to expand hidden sections

This keeps the diff focused on what changed while allowing the user to see surrounding context when needed.

### Version Metadata

Above the diff content, show a compact metadata bar:

```
+-----------------------------------------------------------------------+
| v3 by Wayne · Feb 12, 2:30 PM    →    v4 by Wayne · Feb 12, 3:15 PM  |
| ~45m window · 3 edits merged          ~20m window · Form              |
+-----------------------------------------------------------------------+
```

Left card (rose-tinted) shows the "from" version metadata. Right card (green-tinted) shows the "to" version metadata. Matches the current DiffDrawer's metadata cards but more compact.

### Summary Stats

Below the metadata bar, a single line showing change statistics:

```
+3 lines added  -1 line removed  ~2 lines modified  |  Title changed  State: draft → published
```

This gives a quick at-a-glance summary before the user reads the full diff.

---

## Implementation Plan

### Phase 1: Upgrade Diff Algorithm

**Files to add/modify:**

- `apps/web/src/lib/utils/document-diff.ts` (new, document-version specific)
- `apps/web/src/lib/utils/diff.ts` (keep backward-compatible API for existing consumers)

**Changes:**

1. Add `diff` (jsdiff) as a dependency: `pnpm add diff --filter=web`
2. Add document-specific line diff creation using `diffLines()` from jsdiff
3. Add a new `createWordDiff()` function using `diffWords()` for word-level highlighting within changed lines
4. Add context-line collapsing logic (group unchanged lines, keep N lines of context around changes)
5. Add document-specific types to support word-level spans:

```typescript
interface DiffWordSpan {
	type: 'added' | 'removed' | 'unchanged';
	text: string;
}

interface DocumentDiffLine {
	type: 'added' | 'removed' | 'unchanged' | 'separator';
	content: string;
	lineNumber?: number;
	wordSpans?: DiffWordSpan[]; // Word-level diff within the line
	hiddenLineCount?: number; // For separator lines
}
```

6. Add a `createUnifiedDiff()` function that produces a single interleaved array of `DocumentDiffLine` items (removed lines followed by added lines, with unchanged context)
7. Keep `createLineDiff()` / existing `DiffLine` in `diff.ts` stable so non-document consumers (e.g., parse-results diff UI) do not regress during migration

### Phase 2: New Comparison Components

**New files:**

- `apps/web/src/lib/components/ontology/DocumentComparisonView.svelte` - Main comparison mode container
- `apps/web/src/lib/components/ontology/ComparisonToolbar.svelte` - Version navigation toolbar
- `apps/web/src/lib/components/ui/UnifiedDiffView.svelte` - Unified (single-column) diff renderer
- `apps/web/src/lib/components/ontology/DocumentSplitDiffView.svelte` - Split (two-column) renderer for document comparison

Prefer keeping generic `DiffView.svelte` unchanged in this phase to avoid regressions in other product surfaces.

#### DocumentComparisonView.svelte

Props:

```typescript
interface Props {
	documentId: string;
	projectId: string;
	// The version pair to compare
	fromVersionNumber: number | null;
	toVersionNumber: number | 'current';
	// Current document state (for comparing to current)
	currentDocument: {
		title: string | null;
		description: string | null;
		content: string | null;
		state_key: string | null;
	};
	// Navigation
	latestVersionNumber: number;
	// Events
	onExit: () => void;
	onNavigate: (fromVersion: number | null, toVersion: number | 'current') => void;
}
```

Responsibilities:

- Fetch version snapshots from API
- Cache fetched snapshots by version number during the session
- Use `AbortController` (or request token guard) to prevent stale response races when user navigates quickly
- Compute diffs using upgraded diff utilities
- Render ComparisonToolbar + diff content
- Handle loading/error states

#### ComparisonToolbar.svelte

Props:

```typescript
interface Props {
	fromVersion: number | null;
	toVersion: number | 'current';
	latestVersionNumber: number;
	viewMode: 'unified' | 'split';
	onPrev: () => void;
	onNext: () => void;
	onToggleTarget: (target: 'previous' | 'current') => void;
	onToggleViewMode: () => void;
	onExit: () => void;
}
```

### Phase 3: Integrate into DocumentModal

**Modify:**

- `apps/web/src/lib/components/ontology/DocumentModal.svelte`
- `apps/web/src/lib/components/ontology/DocumentVersionHistoryPanel.svelte`

#### DocumentModal changes:

1. Add comparison mode state:

```typescript
let comparisonMode = $state(false);
let comparisonFromVersion = $state<number | null>(null);
let comparisonToVersion = $state<number | 'current'>(1);
let comparisonLatestVersion = $state(1);
```

2. In the main content area, conditionally render:

```svelte
{#if comparisonMode}
	<DocumentComparisonView
		{documentId}
		{projectId}
		fromVersionNumber={comparisonFromVersion}
		toVersionNumber={comparisonToVersion}
		currentDocument={{ title, description, content: body, state_key: stateKey }}
		latestVersionNumber={comparisonLatestVersion}
		onExit={() => (comparisonMode = false)}
		onNavigate={handleComparisonNavigate}
	/>
{:else}
	<!-- Existing RichMarkdownEditor -->
{/if}
```

3. Add handler for entering comparison mode:

```typescript
function handleEnterComparison(versionNumber: number, latestVersionNumber: number) {
	comparisonLatestVersion = latestVersionNumber;
	comparisonFromVersion = versionNumber > 1 ? versionNumber - 1 : null;
	comparisonToVersion = versionNumber;
	comparisonMode = true;
}
```

#### DocumentVersionHistoryPanel changes:

1. Replace the "vs Previous" / "vs Current" buttons with a single "See Changes" button
2. Add a new callback prop:
   `onCompareRequested?: (versionNumber: number, latestVersionNumber: number) => void`
3. When "See Changes" is clicked, call `onCompareRequested` instead of `onDiffRequested`
4. Keep "Restore" button as-is

Also update both desktop and mobile `DocumentVersionHistoryPanel` usages in `DocumentModal.svelte` to pass the new callback.

### Phase 4: Deprecate DocumentVersionDiffDrawer

Once the inline comparison mode is working:

1. Remove the `DocumentVersionDiffDrawer.svelte` component
2. Remove related state from `DocumentModal.svelte` (`showDiffDrawer`, `selectedVersionForDiff`, `diffCompareMode`)
3. Remove the `handleDiffRequested` / `handleDiffDrawerClose` functions
4. Clean up imports

---

## Visual Design

### Color Palette (Inkprint tokens)

| Element           | Light Mode                 | Dark Mode                  |
| ----------------- | -------------------------- | -------------------------- |
| Added line bg     | `bg-emerald-50`            | `bg-emerald-900/15`        |
| Added word bg     | `bg-emerald-200/60`        | `bg-emerald-700/40`        |
| Added gutter      | `text-emerald-600`         | `text-emerald-400`         |
| Removed line bg   | `bg-rose-50`               | `bg-rose-900/15`           |
| Removed word bg   | `bg-rose-200/60`           | `bg-rose-700/40`           |
| Removed gutter    | `text-rose-600`            | `text-rose-400`            |
| Unchanged bg      | `bg-transparent`           | `bg-transparent`           |
| Context separator | `bg-muted border-border`   | `bg-muted border-border`   |
| Toolbar bg        | `bg-muted`                 | `bg-muted`                 |
| Line numbers      | `text-muted-foreground/50` | `text-muted-foreground/50` |

### Typography

- Diff content: `font-mono text-xs` (monospace for alignment)
- Line numbers: `text-[10px] tabular-nums`
- Toolbar: `text-sm` with `font-medium` for labels
- Field headers: `micro-label` pattern (consistent with rest of DocumentModal)

### Responsive Behavior

- **Desktop (lg+)**: Full comparison view with optional split mode. Left sidebar with version history visible.
- **Tablet (md)**: Unified view only. Left sidebar visible.
- **Mobile (sm)**: Unified view only. Left sidebar collapsed (accessible via mobile metadata toggle). Comparison toolbar wraps to two rows if needed.

---

## Edge Cases

1. **Version 1 selected**: "See Changes" shows the full content as all-added (no previous version to compare against). Prev button disabled.
2. **Latest version selected**: "vs Current" is always available. If current matches latest version exactly, show "No changes" message.
3. **Long documents**: Context collapsing ensures only changed regions are expanded. Hidden line separators are clickable to expand.
4. **Empty content**: If a version has empty content (e.g., just title/metadata changes), show appropriate empty state in the content section.
5. **Loading state**: Skeleton shimmer while fetching version data. Toolbar navigation disabled during load.
6. **API errors**: Inline error with retry button, similar to current DiffDrawer pattern.
7. **Autosave during comparison**: If autosave triggers while in comparison mode and comparing "vs Current", the diff should continue to use the live editor state and update reactively.
8. **Rapid navigation clicks**: If multiple requests are in flight, only the latest request result should render.
9. **Keyboard access**: While in comparison mode, `ArrowLeft` / `ArrowRight` navigate versions and `Escape` exits mode.

---

## Testing Requirements

1. **Unit tests (`document-diff.ts`)**:
    - Duplicate lines and reordered blocks
    - Version 1 (`null` baseline) all-added behavior
    - Word-level changes on long lines
    - Modified-line summary math (`removed`, `added`, `modified`)
2. **Component tests (`DocumentComparisonView.svelte`)**:
    - Prev/Next boundaries
    - Toggle previous/current target
    - Loading, error, and retry states
    - Stale-response protection during rapid navigation
3. **Integration tests (`DocumentModal.svelte`)**:
    - Enter/exit comparison mode from desktop and mobile version panels
    - Preserve editor content and autosave behavior after exiting comparison
    - Restore flow remains unchanged
4. **Accessibility checks**:
    - Toolbar controls reachable by keyboard
    - Focus moves into toolbar on entry and returns to editor on exit
    - Diff meaning is not color-only (symbols/text present)

---

## Migration & Backwards Compatibility

- The old `DocumentVersionDiffDrawer` can be removed once the new inline comparison mode is complete
- Keep existing `diff.ts` and `DiffView.svelte` interfaces stable until all other consumers are migrated
- API endpoints (`GET /versions/{number}`) remain unchanged
- No database changes required

---

## Open Questions

1. **Rendered markdown diff**: Should we show the diff of raw markdown source (current approach) or also offer a "rendered" view that shows the diff of the rendered HTML output? This would look more like Google Docs revision history. **Recommendation**: Start with source diff only (Phase 1-4). Add rendered diff as a future enhancement if users request it.

2. **Arbitrary version comparison**: Currently you can only compare to "previous" or "current." Should we support comparing any two arbitrary versions (e.g., v2 vs v7)? **Recommendation**: Defer. The prev/next step-through and compare-to-current covers 95% of use cases. Arbitrary comparison adds UI complexity.
