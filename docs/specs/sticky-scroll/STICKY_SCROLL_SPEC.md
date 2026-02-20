<!-- docs/specs/sticky-scroll/STICKY_SCROLL_SPEC.md -->

# Sticky Scroll for Markdown Editor - Implementation Spec

**Date:** 2026-02-19
**Status:** Draft
**Complexity:** Moderate (~2-3 days of focused work)
**Risk:** Low (additive feature, no existing behavior changes)
**Dependencies:** None new required - uses existing CodeMirror 6 APIs

---

## Executive Summary

Implement a VS Code-style sticky scroll header for the CodeMirror 6-based `RichMarkdownEditor`. As the user scrolls through a document, a pinned region at the top of the editor shows the current heading hierarchy (e.g., `Overview > API > Authentication`), providing persistent context about where the user is in the document. Each sticky line is clickable to navigate to that heading.

**Why now:** The DocumentModal supports documents up to 50,000 characters. In longer documents, users lose context about which section they're editing. This feature solves the "where am I?" problem without requiring a separate outline panel.

---

## Architecture Overview

### Current Editor Stack

```
DocumentModal.svelte
  └── RichMarkdownEditor.svelte (toolbar, edit/preview toggle, voice)
      └── CodeMirrorEditor.svelte (Svelte 5 wrapper)
          └── CodeMirror 6 EditorView
              ├── extensions.ts (markdown language, keybindings)
              ├── inkprint-theme.ts (visual theme)
              └── voice-widget.ts (inline transcription indicator)
```

### Where Sticky Scroll Fits

The sticky scroll is implemented as a **pure CodeMirror 6 extension** - a self-contained module that plugs into the existing extension pipeline. No changes needed to `RichMarkdownEditor.svelte` or `CodeMirrorEditor.svelte` beyond passing the extension.

```
CodeMirror 6 EditorView
  ├── extensions.ts
  ├── inkprint-theme.ts
  ├── voice-widget.ts
  └── sticky-scroll.ts  ← NEW (single file, ~250 lines)
```

### Key CodeMirror 6 APIs Used

| API                                        | Purpose                                                                |
| ------------------------------------------ | ---------------------------------------------------------------------- |
| `showPanel` facet                          | Renders the sticky header DOM above the editor content                 |
| `syntaxTree()` from `@codemirror/language` | Access parsed markdown AST to find headings                            |
| `ViewUpdate.viewportChanged`               | Detect scroll events to update the sticky display                      |
| `ViewUpdate.docChanged`                    | Detect document edits to reparse headings                              |
| `EditorView.scrollMargins`                 | Offset scroll calculations so cursor doesn't hide behind sticky region |
| `EditorView.scrollIntoView()`              | Scroll to heading on click                                             |
| `view.viewport.from`                       | Get the document position at the top of the visible area               |

**No new npm packages are required.** All APIs are already available from `@codemirror/view`, `@codemirror/state`, and `@codemirror/language` (already installed).

---

## Detailed Design

### 1. Heading Extraction (Model Layer)

Parse the CodeMirror syntax tree to extract headings. The `@codemirror/lang-markdown` parser (via `@lezer/markdown`) produces nodes named `ATXHeading1` through `ATXHeading6` and `SetextHeading1`/`SetextHeading2`.

```typescript
interface StickyHeading {
	level: number; // 1-6
	from: number; // document position (start of heading line)
	to: number; // document position (end of heading line)
	text: string; // heading text without # marks
	lineNumber: number; // 1-based line number
}
```

**Extraction logic:**

- Use `syntaxTree(state).iterate()` to walk the AST
- Filter for `ATXHeading*` and `SetextHeading*` node types
- Strip `HeaderMark` children (the `#` characters) to get clean heading text
- Ignore headings inside fenced code blocks (the Lezer parser already handles this - code block content is parsed as `CodeText`, not as headings)

**Caching strategy:**

- Recompute headings only when `update.docChanged` is true
- On scroll-only updates, reuse the cached heading list

### 2. Active Heading Stack (Logic Layer)

Given the cached headings and the current viewport position, compute the "breadcrumb stack" of ancestor headings.

**Algorithm:**

```
Input: headings[] sorted by document position, viewportFrom (top visible position)
Output: stack[] of headings representing the current context path

1. Filter headings to only those with `from < viewportFrom`
2. Build stack by iterating filtered headings in order:
   - For each heading, pop stack entries with level >= heading.level
   - Push the heading
3. Trim stack to last MAX_STICKY_LINES entries
```

This gives us the heading hierarchy path. Example:

- Document has: `# A`, `## A1`, `### A1a`, `## A2`, `# B`
- Viewport top is inside `### A1a` body
- Stack: `[# A, ## A1, ### A1a]`

**Performance:** O(n) where n = number of headings (typically < 100 even in large documents). No binary search needed at this scale.

### 3. Panel Rendering (View Layer)

Use CodeMirror's `showPanel` facet to create a DOM element positioned above the editor content.

**DOM structure:**

```html
<div class="cm-sticky-scroll" aria-label="Document navigation" role="navigation">
	<div class="cm-sticky-scroll-line cm-sticky-scroll-h1" data-level="1">
		<span class="cm-sticky-scroll-text">Overview</span>
	</div>
	<div class="cm-sticky-scroll-line cm-sticky-scroll-h2" data-level="2">
		<span class="cm-sticky-scroll-text">API Reference</span>
	</div>
	<div class="cm-sticky-scroll-line cm-sticky-scroll-h3" data-level="3">
		<span class="cm-sticky-scroll-text">Authentication</span>
	</div>
</div>
```

**Rendering rules:**

- When stack is empty (top of document, no headings above), the panel is hidden (`display: none`)
- Each line is indented based on heading level (using `padding-left`)
- Long headings are truncated with ellipsis
- The panel has a bottom border to visually separate from content
- Maximum 5 visible lines (configurable)

**Update strategy:**

- On each `ViewUpdate` where `viewportChanged || docChanged`:
    1. If `docChanged`, reparse headings
    2. Compute new stack from headings + viewport position
    3. Compare new stack to previous (by heading `from` positions)
    4. Only mutate DOM if stack actually changed

### 4. Click-to-Navigate

Each sticky line has a click handler that:

1. Dispatches `EditorView.scrollIntoView(heading.from, { y: 'start' })` to scroll the heading to the top
2. Sets the cursor to the heading position
3. Focuses the editor

### 5. Scroll Margin Adjustment

Register `EditorView.scrollMargins` to account for the sticky region's height. This ensures that when CodeMirror scrolls to show the cursor (e.g., after typing), it doesn't scroll the cursor behind the sticky header.

```typescript
EditorView.scrollMargins.of((view) => {
	const el = view.dom.querySelector('.cm-sticky-scroll');
	if (!el || (el as HTMLElement).style.display === 'none') return null;
	return { top: (el as HTMLElement).offsetHeight };
});
```

---

## Styling

Uses Inkprint design system semantic tokens for automatic light/dark mode support.

```css
.cm-sticky-scroll {
	background: hsl(var(--card));
	border-bottom: 1px solid hsl(var(--border));
	font-family: ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
	font-size: 13px;
	line-height: 1.4;
	overflow: hidden;
	z-index: 5;
}

.cm-sticky-scroll-line {
	padding: 2px 12px;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	color: hsl(var(--muted-foreground));
	cursor: pointer;
	transition: background-color 0.1s;
}

.cm-sticky-scroll-line:hover {
	background: hsl(var(--muted) / 0.5);
	color: hsl(var(--foreground));
}

/* Indent by level */
.cm-sticky-scroll-line[data-level='2'] {
	padding-left: 24px;
}
.cm-sticky-scroll-line[data-level='3'] {
	padding-left: 36px;
}
.cm-sticky-scroll-line[data-level='4'] {
	padding-left: 48px;
}
.cm-sticky-scroll-line[data-level='5'] {
	padding-left: 60px;
}
.cm-sticky-scroll-line[data-level='6'] {
	padding-left: 72px;
}

/* Subtle size decrease for deeper levels */
.cm-sticky-scroll-line[data-level='3'],
.cm-sticky-scroll-line[data-level='4'],
.cm-sticky-scroll-line[data-level='5'],
.cm-sticky-scroll-line[data-level='6'] {
	font-size: 12px;
	opacity: 0.85;
}
```

These styles will be defined inside `inkprint-theme.ts` as part of the `EditorView.theme()` call, keeping all editor styling in one place.

---

## Integration Points

### File Changes

| File                           | Change                                      | Scope        |
| ------------------------------ | ------------------------------------------- | ------------ |
| `codemirror/sticky-scroll.ts`  | **NEW** - The entire extension (~250 lines) | Core feature |
| `codemirror/extensions.ts`     | Add `stickyScroll()` to `buildExtensions()` | 2 lines      |
| `codemirror/inkprint-theme.ts` | Add `.cm-sticky-scroll*` styles to theme    | ~30 lines    |

### extensions.ts Change

```typescript
import { stickyScroll } from './sticky-scroll';

export function buildExtensions(options: EditorExtensionOptions = {}): Extension[] {
	const extensions: Extension[] = [
		inkprintTheme,
		markdown(),
		history(),
		EditorView.lineWrapping,
		stickyScroll(), // ← ADD THIS
		keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
		formattingKeymap(onSave),
		...additionalExtensions
	];
	// ...
}
```

### No Changes Required To:

- `CodeMirrorEditor.svelte` - Extension is added at the build level, transparent to wrapper
- `RichMarkdownEditor.svelte` - No awareness of sticky scroll needed
- `DocumentModal.svelte` - No changes
- `package.json` - No new dependencies

---

## Configuration

The `stickyScroll()` function accepts an optional config object:

```typescript
interface StickyScrollConfig {
	/** Maximum number of heading lines to show. Default: 5 */
	maxLines?: number;
	/** Minimum heading level to track (1 = H1). Default: 1 */
	minLevel?: number;
	/** Maximum heading level to track (6 = H6). Default: 4 */
	maxLevel?: number;
}

// Usage:
stickyScroll(); // defaults
stickyScroll({ maxLines: 3 }); // limit to 3 levels
```

For the initial implementation, defaults are used everywhere and no UI toggle is exposed. A future iteration could add a toggle to the RichMarkdownEditor toolbar.

---

## Edge Cases

| Scenario                                        | Behavior                                                                                                       |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Document has no headings                        | Sticky region stays hidden                                                                                     |
| Viewport is above all headings                  | Sticky region stays hidden                                                                                     |
| Document starts with body text, then headings   | Sticky hidden until first heading scrolls past                                                                 |
| Very long heading text                          | Truncated with `text-overflow: ellipsis`                                                                       |
| Heading inside fenced code block                | Ignored (Lezer parser doesn't emit ATXHeading nodes for code block content)                                    |
| YAML frontmatter `---` blocks                   | Not treated as Setext headings (Lezer parser handles this correctly when frontmatter extension is not enabled) |
| Preview mode (markdown rendered as HTML)        | Sticky scroll only active in edit mode (CodeMirror is unmounted in preview)                                    |
| Read-only / disabled editor                     | Sticky scroll still works (read-only doesn't affect panels)                                                    |
| Rapid scrolling                                 | Panel update checks if stack changed before mutating DOM - no unnecessary reflows                              |
| Document change while scrolled down             | Headings reparsed, stack recalculated, panel updated                                                           |
| Empty document                                  | Sticky region stays hidden                                                                                     |
| Very deep nesting (H1 > H2 > H3 > H4 > H5 > H6) | Capped at `maxLines` (default 5), shows deepest N levels                                                       |

---

## Performance Considerations

1. **Heading parsing:** Only on `docChanged`. Uses `syntaxTree(state)` which returns the already-parsed incremental tree - no forced full parse.

2. **Stack computation:** O(h) where h = number of headings before viewport. For a 50K-char document with ~50 headings, this is sub-millisecond.

3. **DOM updates:** Diffed by comparing heading `from` positions. DOM only mutated when the visible stack actually changes (typically only at heading boundaries during scroll).

4. **Scroll event frequency:** We don't add a raw scroll listener. The Panel's `update()` method fires on CodeMirror's internal update cycle, which is already debounced and batched.

5. **Memory:** One cached array of heading objects (~50 headings max for typical docs). Negligible.

---

## Test Plan

### Unit Tests (for heading extraction and stack computation)

```
sticky-scroll.test.ts:
  - extractHeadings: parses ATX headings (#, ##, ###)
  - extractHeadings: ignores headings inside fenced code blocks
  - extractHeadings: handles empty document
  - extractHeadings: handles document with no headings
  - extractHeadings: strips # marks from heading text
  - getActiveStack: returns empty for position before all headings
  - getActiveStack: returns single heading when inside H1 body
  - getActiveStack: returns nested path (H1 > H2 > H3)
  - getActiveStack: pops deeper headings when entering sibling section
  - getActiveStack: respects maxLines limit
  - getActiveStack: handles consecutive headings with no body
```

### Manual Testing Checklist

- [ ] Scroll through a document with multiple heading levels - sticky shows correct path
- [ ] Click a sticky heading line - editor scrolls to that heading
- [ ] Edit a heading while scrolled down - sticky updates to new text
- [ ] Delete a heading while scrolled down - sticky updates correctly
- [ ] Toggle between edit and preview mode - no errors
- [ ] Test on mobile viewport (DocumentModal responsive layout)
- [ ] Test in dark mode - colors use semantic tokens correctly
- [ ] Test with a document that has no headings - no sticky region visible
- [ ] Test with very long heading text - properly truncated
- [ ] Test rapid scrolling - no visual glitches or performance lag

---

## Implementation Steps

### Step 1: Create `sticky-scroll.ts` (~200-250 lines)

The self-contained CodeMirror extension with:

- `extractHeadings(state)` - Parse headings from syntax tree
- `getActiveStack(headings, viewportFrom, config)` - Compute breadcrumb stack
- `stickyScrollPanel(view)` - Panel constructor with DOM rendering and update logic
- `stickyScroll(config?)` - Public extension factory that bundles panel + scrollMargins

### Step 2: Add theme styles to `inkprint-theme.ts`

Add `.cm-sticky-scroll` related CSS rules to the `inkprintEditorTheme` object.

### Step 3: Wire into `extensions.ts`

Import and add `stickyScroll()` to the `buildExtensions()` function.

### Step 4: Test and polish

Write unit tests for the pure functions. Manual testing in the DocumentModal with various document structures.

---

## Future Enhancements (Not in scope for v1)

- **Toggle button** in RichMarkdownEditor toolbar to enable/disable sticky scroll
- **Hover tooltip** showing full heading text and line number
- **Smooth transition animation** when sticky lines enter/exit
- **Follow cursor mode** (update based on cursor position rather than scroll position)
- **Setext heading support** (lines underlined with `===` or `---`)
- **Outline panel** using the same heading extraction logic
- **"Copy link to heading"** context menu

---

## Summary

This is a clean, self-contained feature that:

- Lives in a **single new file** (`sticky-scroll.ts`, ~250 lines)
- Requires **2 lines of changes** to existing code (`extensions.ts`) plus theme styles
- Uses **zero new dependencies** - only existing CodeMirror 6 APIs
- Has **no risk** to existing editor behavior (purely additive)
- Provides **high user value** for navigating longer documents

The feature is architecturally simple because CodeMirror 6's Panel API was designed exactly for this kind of use case - fixed UI above the scrolling content with reactive updates.
