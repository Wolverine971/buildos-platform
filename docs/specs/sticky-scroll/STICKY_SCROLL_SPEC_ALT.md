<!-- docs/specs/sticky-scroll/STICKY_SCROLL_SPEC_ALT.md -->

## Feature: Sticky Headings (Sticky Scroll) for CodeMirror 6 Markdown

### Goal

When scrolling a Markdown document, show a **sticky header stack** at the top of the editor that represents the current heading hierarchy (H1 → H2 → H3…) for the section currently in view. The sticky stack updates as the user scrolls.

---

# 1) What the feature does

### 1.1 Sticky stack content

- Shows a list of headings representing the “path” to the current section.
- Example display when inside `### Auth` under `## API` under `# Overview`:
    - `Overview`
    - `API`
    - `Auth`

### 1.2 How “current section” is determined

Provide two modes (or pick one):

- **Scroll-anchored mode (recommended default):** determine the “active line” by the **top visible line** in the viewport.
- **Cursor-anchored mode (optional):** determine by the **cursor line**.
- **Hybrid (optional):** while user is typing, follow cursor; while user scrolls, follow viewport top.

### 1.3 Update trigger

- Updates on:
    - editor scroll (viewport changes)
    - document changes (headings added/removed/edited)
    - selection changes (if cursor-follow mode enabled)

### 1.4 Interactions

- Clicking a sticky heading scrolls the editor to that heading.
- Optional:
    - Hover tooltip shows full heading text
    - “Copy link” / “Fold section” if you support those

---

# 2) Markdown heading rules

### 2.1 Recognize headings

Support ATX headings:

- Pattern: `^(#{1,6})\s+(.+?)\s*$`
    - `level = number of #`
    - `title = captured text (trim trailing #’s optionally)`

Optional: Setext headings

- `Title` followed by `====` → H1
- `Title` followed by `----` → H2

### 2.2 Ignore headings inside fenced code blocks

- Text between:
    - ```(triple backticks) fences (or ~~~)

      ```

- Headings inside fences should not count.

---

# 3) Data model

Maintain a heading index:

```ts
type Heading = {
	id: string; // stable across updates if possible
	level: 1 | 2 | 3 | 4 | 5 | 6;
	title: string;
	from: number; // doc position (start of heading line)
	to: number; // doc position (end of heading line)
	line: number; // line number (optional cached)
};
```

Also maintain a computed range:

- `endLine` or `endPos` for each heading (ends at next heading of level <= current)

This lets you answer:

- “Given an active line L, what is the deepest heading containing L?”
- “What are its ancestors?”

---

# 4) Architecture in CodeMirror 6

You’ll implement this with:

1. A **StateField** to store headings + derived section boundaries
2. A **ViewPlugin** to:
    - listen to viewport changes + scroll
    - compute active path
    - render a sticky DOM overlay at top of the editor

3. A lightweight DOM container inserted into the editor’s DOM using `EditorView.dom` (or via `panel`)

### 4.1 Choose rendering strategy

Two good options:

#### Option A — Use `showPanel` (recommended)

Use `@codemirror/view` panels:

- Panels naturally sit above the editor content.
- You can show/hide and update them cleanly.

#### Option B — Absolute-position overlay

Insert a `div` inside `EditorView.dom` and position `sticky` or `absolute` at top.

- More manual CSS, but flexible.

**I recommend Option A (panel)**.

---

# 5) Parsing headings in CM6

### 5.1 Easiest: parse text lines (works everywhere)

On document changes:

- Iterate lines and apply regex + fence tracking.

Pros: independent of markdown parser, predictable
Cons: O(n) scan on edits unless incremental

### 5.2 Better: incremental parsing with Lezer Markdown (optional)

If you already use `@codemirror/lang-markdown`, you can use syntax tree nodes (`syntaxTree(state)`) to find heading nodes and ignore code fences naturally.

Pros: incremental, robust
Cons: requires you to depend on parser node names and tree shape

**Spec recommendation:** start with text scanning; optimize later if needed.

---

# 6) Computing the sticky path

Given `activeLine` (top visible line or cursor line):

### 6.1 Find nearest heading above activeLine

- Use binary search over headings sorted by line/pos:
    - find last heading with `heading.line <= activeLine`

### 6.2 Determine if activeLine is inside that heading’s section

- A heading `H` owns lines from `H.line` to `(next heading of level <= H.level) - 1`
- Precompute `sectionEndLine` per heading.

### 6.3 Build ancestors

Walk backward from the current heading:

- To find parent of a heading at level `k`, find nearest previous heading with `level < k`.
- Continue until you reach level 1 or no parent.

Result: `path: Heading[]` from outer → inner.

### 6.4 Diff + render

Only update the sticky DOM if the `path` changed (compare ids/positions).

---

# 7) Determining “top visible line” in CM6

Use `view.viewport` or visible ranges:

- `view.viewport.from` is the document pos at the start of the viewport.
- Convert to line:
    - `state.doc.lineAt(view.viewport.from).number`

More robust:

- Use `view.visibleRanges[0].from` as top.
- Or find the minimum `.from` across visible ranges.

So:

```ts
const topPos = Math.min(...view.visibleRanges.map((r) => r.from));
const topLine = view.state.doc.lineAt(topPos).number;
```

---

# 8) Scrolling to a heading on click

When user clicks a sticky line:

1. Dispatch selection to `heading.from`
2. Scroll into view

In CM6:

- `EditorView.scrollIntoView(pos, {y: "start"})` as an effect
- Or use `view.dispatch({selection: {anchor: pos}, effects: EditorView.scrollIntoView(pos, {y: "start"})})`

---

# 9) UI and styling requirements

### 9.1 Visual layout

- Sticky area sits above the editor content.
- Height = `min(path.length, maxStickyLines) * lineHeight`.
- Each line:
    - single-line with ellipsis
    - optional indentation per depth
    - subtle divider at bottom of panel

### 9.2 Long headings

- Truncate with ellipsis.
- Tooltip on hover with full title.

### 9.3 Configurable max lines

- `maxStickyLines` default: 3–5
- Show the deepest headings if you exceed max (or show outermost + deepest—your choice)

---

# 10) Configuration surface (recommended)

```ts
type StickyHeadingsConfig = {
	enabled: boolean;
	maxLines: number; // default 4
	mode: 'scroll' | 'cursor' | 'hybrid';
	includeSetext: boolean; // default false
	ignoreFencedCode: boolean; // default true
};
```

---

# 11) Edge cases & expected outcomes

- **No headings yet** → sticky panel hidden.
- **Inside fenced code** → sticky still shows the last heading path outside fence (based on section boundaries), but headings _inside_ fence don’t count.
- **Multiple H1s** → path resets when entering new H1 section.
- **Headings out of order** (H3 after H1 with no H2) → parent is last lower-level heading (H1), path still works.
- **Edits** that change heading text/level should update sticky within one animation frame.

---

# 12) Suggested acceptance tests

1. Scrolling through nested headings updates sticky stack correctly.
2. Clicking sticky lines scrolls to correct heading and sets cursor.
3. Headings inside code fences never appear in sticky stack.
4. Editing a heading updates the sticky title immediately.
5. Performance: scrolling does not cause jank on large docs (throttled to animation frame).

---

# 13) Reference implementation plan (agent checklist)

1. Implement `StateField<HeadingIndex>`:
    - Store list of headings sorted by `from`
    - Store precomputed `sectionEndLine` (or endPos)

2. Implement `ViewPlugin`:
    - Track `lastPathKey`
    - On `update`:
        - if `viewportChanged || docChanged || selectionChanged` (depending on mode)
        - compute active line
        - compute path
        - update DOM panel if changed

3. Add panel rendering:
    - `showPanel.of(...)` with a panel class that can update itself

4. Add click handlers to scroll

---
