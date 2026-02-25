<!-- docs/specs/sticky-scroll/STICKY_SCROLL_SPEC_UNIFIED.md -->

# Sticky Scroll for Rich Markdown Editor - Unified Spec

**Date:** 2026-02-20  
**Status:** Ready for implementation  
**Supersedes:** `docs/archive/specs/sticky-scroll/STICKY_SCROLL_SPEC.md`, `docs/archive/specs/sticky-scroll/STICKY_SCROLL_SPEC_ALT.md`  
**Target:** `apps/web/src/lib/components/ui/codemirror/*`

## 1) Goal

Add a VS Code-style sticky heading region to the CodeMirror 6 markdown editor so users always see section context while scrolling long documents.

In edit mode, the top of the editor shows the current heading path, for example:

- `Overview`
- `API`
- `Authentication`

Each sticky line is clickable and jumps to that heading.

## 2) Decisions From Both Drafts

This unified plan keeps the strongest parts of both drafts and resolves open choices:

1. Heading source of truth: use CodeMirror markdown syntax tree (`syntaxTree`) rather than regex line scanning.
2. Active context source: scroll-anchored (`top visible position`) for v1.
3. Rendering: use CodeMirror `showPanel` (not an absolute overlay).
4. State model: keep a heading index in a `StateField` and render/update from panel lifecycle.
5. Performance strategy: parse on `docChanged`, binary search on scroll, render only if path changed.
6. Scope boundary: include both ATX (`#`) and Setext (`===`/`---`) headings in v1.

## 3) Scope

### In scope (v1)

- Sticky heading panel inside the editor.
- Scroll-anchored heading path.
- Click-to-navigate.
- Dynamic top scroll margin so cursor/scrollIntoView is never hidden behind sticky panel.
- Styling integrated into existing Inkprint CodeMirror theme.
- Unit tests for heading extraction + path computation.
- Manual validation in `DocumentModal` and task/document edit surfaces.

### Out of scope (v1)

- Toolbar toggle UI.
- Cursor-follow or hybrid mode.
- Heading context menus (copy link, fold section).
- Animations beyond normal hover/transition polish.

## 4) Current Integration Points

- `apps/web/src/lib/components/ui/codemirror/extensions.ts`
- `apps/web/src/lib/components/ui/codemirror/inkprint-theme.ts`
- `apps/web/src/lib/components/ui/codemirror/CodeMirrorEditor.svelte`
- `apps/web/src/lib/components/ui/RichMarkdownEditor.svelte` (no direct changes expected)

No new npm dependencies are required.

## 5) Technical Design

### 5.1 Data types

```ts
type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

type StickyHeading = {
	level: HeadingLevel;
	from: number; // heading start position
	to: number; // heading end position
	text: string; // clean heading text
	line: number; // 1-based line number
	parentIndex: number | null; // parent in heading array
	sectionEnd: number; // exclusive end position of this section
};

type StickyHeadingIndex = {
	headings: StickyHeading[];
	positions: number[]; // headings[i].from, for binary search
	version: number; // bump on doc changes
};
```

### 5.2 Parsing headings

Use `syntaxTree(state).iterate(...)` and include:

- `ATXHeading1` to `ATXHeading6`
- `SetextHeading1`, `SetextHeading2`

Text extraction:

- Use heading node span.
- Remove markdown markers (`HeaderMark`) from display text.
- Trim whitespace.

Code fences are naturally ignored because fenced content is parsed as `FencedCode`/`CodeText`, not heading nodes.

### 5.3 Section + parent computation

During extraction, compute:

- `parentIndex` by maintaining a stack of heading indices and levels.
- `sectionEnd` by closing headings when a new heading of level `<=` current level appears.

This gives fast and deterministic "which section contains this position?" behavior.

### 5.4 Active path algorithm

Input: `topPos`, `StickyHeadingIndex`, `maxLines`.

1. Find last heading with `from <= topPos` using binary search on `positions`.
2. If none, path is empty.
3. Walk `parentIndex` chain from leaf to root.
4. Reverse to root -> leaf.
5. If path exceeds `maxLines`, keep deepest `maxLines`.

Complexity per scroll update: `O(log n + depth)` where `n = heading count`.

### 5.5 Extension shape

Implement `stickyScroll(config?: StickyScrollConfig): Extension` in a new file:

- `StateField<StickyHeadingIndex>` for heading cache.
- `showPanel` panel class for DOM rendering and lifecycle updates.
- `EditorView.scrollMargins` provider for top offset.

```ts
type StickyScrollConfig = {
	maxLines?: number; // default: 5
	minLevel?: HeadingLevel; // default: 1
	maxLevel?: HeadingLevel; // default: 6
};
```

### 5.6 Update triggers

Panel updates on:

- `update.docChanged` (re-parse via StateField)
- `update.viewportChanged`

Selection changes are ignored in v1 (scroll-anchored mode only).

### 5.7 DOM + accessibility

Panel container:

- `role="navigation"`
- `aria-label="Document heading context"`

Each line:

- `button` element (or keyboard-focusable div with key handlers)
- `title` attribute with full heading text
- `aria-label="Jump to heading: <text>"`

Interaction:

- Click / Enter / Space dispatches:
    - selection at heading start
    - `EditorView.scrollIntoView(heading.from, { y: 'start' })`
    - `view.focus()`

## 6) UX Details

- Sticky panel is hidden when no heading is above viewport top.
- Heading order is always outermost -> innermost.
- Deep levels are visually subordinate (indent + slightly lower emphasis).
- Long titles truncate with ellipsis; full title shown via tooltip.
- Maximum visible lines defaults to `5`.

## 7) Styling Plan

Add `.cm-sticky-scroll*` rules in `inkprint-theme.ts` using existing tokens:

- Background: `hsl(var(--card))`
- Divider: `hsl(var(--border))`
- Text: `hsl(var(--muted-foreground))`
- Hover/focus: `hsl(var(--muted) / 0.5)` + `hsl(var(--foreground))`

Additional style requirements:

- `position` managed by panel system (not custom fixed positioning).
- `z-index` above editor content.
- Clear focus-visible outline for keyboard navigation.

## 8) File Changes

1. `apps/web/src/lib/components/ui/codemirror/sticky-scroll.ts` (new)
2. `apps/web/src/lib/components/ui/codemirror/extensions.ts`
3. `apps/web/src/lib/components/ui/codemirror/inkprint-theme.ts`
4. `apps/web/src/lib/components/ui/codemirror/sticky-scroll.test.ts` (new)

Optional (low-cost kill switch):

5. Add optional `stickyScroll?: boolean | StickyScrollConfig` to `EditorExtensionOptions` in `extensions.ts` (default enabled).

## 9) Acceptance Criteria

1. Scrolling through nested markdown headings updates sticky path correctly.
2. Clicking any sticky line jumps to the correct heading and focuses editor.
3. Headings inside fenced code blocks never appear in sticky path.
4. Editing, deleting, or re-leveling headings updates sticky output immediately after doc change.
5. Cursor auto-scroll and `scrollIntoView` never hide content behind sticky panel.
6. Empty docs and heading-free docs render no sticky panel.
7. No visible scroll jank on large documents (~50k chars).

## 10) Test Plan

### Unit tests (`sticky-scroll.test.ts`)

- Extract ATX headings.
- Extract Setext headings.
- Ignore fenced-code pseudo-headings.
- Build parent chain correctly with skipped levels (H1 -> H3).
- Compute section boundaries correctly across sibling resets.
- Binary-search active heading selection.
- Path truncation to `maxLines`.

### Manual QA

- Document with deep nesting (H1-H6).
- Long heading text truncation + tooltip.
- Rapid scroll up/down.
- Edit mode <-> preview mode toggling in `RichMarkdownEditor`.
- Read-only and disabled states.
- Mobile/narrow width editor behavior.

## 11) Delivery Plan

1. Implement `sticky-scroll.ts` with extraction + indexing + panel + navigation.
2. Wire extension into `buildExtensions()` in `extensions.ts`.
3. Add sticky-scroll theme rules in `inkprint-theme.ts`.
4. Add/execute focused unit tests.
5. Run manual QA checklist in document/task editor flows.

## 12) Risks and Mitigations

- Risk: parser node-name drift in future markdown package updates.
    - Mitigation: guard extraction by regex on heading node names and cover with tests.
- Risk: panel height changes causing scroll overlap.
    - Mitigation: always return dynamic top `scrollMargins` from panel height.
- Risk: excessive DOM churn during fast scrolling.
    - Mitigation: store and compare previous path key before mutating panel DOM.

## 13) Nice-Next (post-v1)

- Toolbar toggle for sticky scroll.
- Cursor-follow/hybrid modes.
- Breadcrumb separators (`Overview > API > Auth`) option.
- Context actions (copy heading link, fold section).
