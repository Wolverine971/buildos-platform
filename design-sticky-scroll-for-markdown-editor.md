<!-- design-sticky-scroll-for-markdown-editor.md -->

## Sticky Scroll: What it does

### Core behavior

- As the user scrolls through a document, the editor shows a **“sticky” header region** at the top of the viewport.
- The sticky region displays the **current structural path** the cursor/viewport is inside of.
    - In Markdown: heading hierarchy like `# H1 > ## H2 > ### H3 …`
    - In HTML: element nesting like `<article> > <section> > <h2> …` (if you support that)

- When the topmost visible content moves past a structural boundary (e.g., you scroll past an `##` heading), the sticky region updates to include that heading under its parent(s).

### “Where am I?” rule

- The sticky stack represents the **innermost section that contains the top of the viewport** (or the active line/cursor—configurable).
- For Markdown, a section is defined as:
    - A heading line `Hn` begins a section
    - That section continues until the next heading of level `<= n` (or end of doc)

### Display rules

- The sticky region shows **one line per level** in the current path.
    - Example: If you’re inside `# Overview` then later `## API` then later `### Authentication`, the sticky shows:
        - `Overview`
        - `API`
        - `Authentication`

- The sticky region always displays in correct hierarchy order: outermost at top → innermost at bottom.
- Sticky lines appear visually “pinned” (not moving) while document content scrolls underneath.

---

## Precise update behavior

### When it changes

Sticky content updates when either:

1. The scroll position changes enough that the **top visible line** enters a different section, or
2. The **cursor/selection active line** enters a different section (if you support “follow cursor” mode).

### Entering a new section

- Scrolling down:
    - When the next heading `Hn` reaches/passes the top of the viewport, it becomes part of the sticky path.

- Scrolling up:
    - When you scroll above a heading boundary, that heading (and any deeper children) are removed from the sticky path.

### Boundary conditions

- At the very top of the file: sticky area is empty (or shows the first heading once it scrolls off).
- If the document has no headings before the viewport: sticky area is empty.
- If you’re between headings (inside a section body), sticky still shows the most recent heading ancestors.

---

## Interaction behavior (expected UX)

### Click to navigate (high value)

- Clicking a sticky header line scrolls the editor to that heading.
- Optional: clicking selects the heading range, or places cursor on that heading line.

### Hover affordances (optional)

- On hover, show:
    - full heading text (if truncated)
    - line number
    - a “reveal in outline” icon

### Context menu (optional)

- “Copy link to heading” (Markdown anchor behavior depends on your system)
- “Collapse section” / “Fold section” (if you support folding)
- “Rename heading” (if you support structured edits)

---

## Rendering details

### Layout

- Sticky region is inside the editor pane, at the top, above the text viewport.
- It consumes vertical space equal to:
    - `min(depth, maxStickyLines)` \* lineHeight

- The document content is rendered below it (not behind it), OR can scroll behind it with a background overlay (either is fine; VS Code uses an overlay-like look).

### Truncation

- Long headings:
    - Single-line display with ellipsis truncation
    - Tooltip or full text on hover

### Styling cues

- Each deeper level is typically indented or visually subordinate (smaller font, lighter opacity, subtle divider).
- Optional: show small chevrons or separators to indicate nesting.

---

## Configuration knobs (implement these if you can)

1. **Enable/disable** sticky scroll.
2. **Max sticky lines** (e.g., up to 5 levels shown).
3. **Source of truth**:
    - Follow scroll (top visible line)
    - Follow cursor (active line)
    - Hybrid (cursor if user is typing; scroll if user is scrolling)

4. **Include code fences?**
    - Usually code fences do _not_ affect heading hierarchy.

5. **Heading parsing rules**:
    - ATX headings (`#`, `##`, …)
    - Optional Setext headings (`===`, `---`)

6. **Markdown “frontmatter” handling**
    - Ignore YAML frontmatter for heading detection

7. **Performance controls**
    - Throttle/debounce scroll events
    - Incremental parse vs full parse

---

## Markdown-specific parsing rules (recommended)

### Recognize headings

- `^(#{1,6})\s+(.+?)\s*$` → level = count(`#`)
- Optional: support Setext:
    - Line `text` followed by `===` → H1
    - Line `text` followed by `---` → H2

- Ignore headings inside fenced code blocks:
    - Between triple backticks ``` or tildes ~~~

### Build a section index

Precompute an array of heading nodes:

- `id` (stable)
- `level` (1–6)
- `title`
- `startLine`
- `endLine` (computed by next heading of level <= current)

Then at runtime, for a given line `L`:

- Find the **deepest heading** whose `[startLine, endLine]` contains `L`
- Build the ancestor chain by walking backward to headings with decreasing levels.

---

## Performance expectations (what “good” looks like)

- Sticky header updates should feel instant during scroll.
- Avoid O(n) scanning on every scroll tick.
    - Use binary search over heading start lines to find the nearest heading above `L`.

- Update only when the computed path changes (diff current path vs previous).

---

## Example behavior (test cases)

### Example Markdown

```md
# A

intro

## A1

text

### A1a

text

## A2

text

# B

text
```

### Expected sticky outputs

- In “intro” under `# A`: sticky shows `A`
- In `## A1` body: sticky shows `A > A1`
- In `### A1a` body: sticky shows `A > A1 > A1a`
- In `## A2` body: sticky shows `A > A2`
- In `# B` body: sticky shows `B`

---

## Implementation outline (minimal viable)

1. Parse document → heading index (ignore fenced code).
2. On scroll:
    - Determine `topVisibleLine` (or active line).
    - Compute sticky path.
    - If changed, re-render sticky header list.

3. Add click handlers on sticky items to scroll-to-heading.

---
