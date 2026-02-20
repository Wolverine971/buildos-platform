// apps/web/src/lib/components/ui/codemirror/sticky-scroll.ts
/**
 * Sticky Scroll Extension for CodeMirror 6
 *
 * Shows a VS Code-style sticky heading region at the top of the editor
 * that displays the current heading hierarchy as the user scrolls.
 * Each heading line is clickable to navigate to that section.
 *
 * Uses a scroll listener on scrollDOM (throttled to requestAnimationFrame)
 * for smooth updates during scrolling.
 */

import { type Extension } from '@codemirror/state';
import { StateField } from '@codemirror/state';
import { EditorView, showPanel, type Panel, type ViewUpdate } from '@codemirror/view';
import { ensureSyntaxTree, syntaxTree } from '@codemirror/language';
import type { EditorState } from '@codemirror/state';
import type { SyntaxNode } from '@lezer/common';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface StickyHeading {
	level: HeadingLevel;
	from: number;
	to: number;
	text: string;
	line: number;
	parentIndex: number | null;
	sectionEnd: number;
}

export interface StickyHeadingIndex {
	headings: StickyHeading[];
	positions: number[];
	version: number;
}

export interface StickyScrollConfig {
	/** Maximum number of heading lines to show. Default: 5 */
	maxLines?: number;
	/** Minimum heading level to track. Default: 1 */
	minLevel?: HeadingLevel;
	/** Maximum heading level to track. Default: 6 */
	maxLevel?: HeadingLevel;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_CONFIG: Required<StickyScrollConfig> = {
	maxLines: 5,
	minLevel: 1,
	maxLevel: 6
};
const PARSE_TIMEOUT_MS = 200;

const ATX_HEADING_RE = /^ATXHeading([1-6])$/;
const SETEXT_HEADING_RE = /^SetextHeading([12])$/;

// ---------------------------------------------------------------------------
// Heading Extraction
// ---------------------------------------------------------------------------

/**
 * Extract heading text from a heading node, stripping markdown markers.
 * For ATX headings, strips opening/closing hash markers from the raw heading line.
 * For Setext headings, takes the first line (before the underline).
 */
function extractHeadingText(state: EditorState, node: SyntaxNode, isSetext: boolean): string {
	if (isSetext) {
		const fullText = state.doc.sliceString(node.from, node.to);
		const firstLine = fullText.split('\n')[0];
		return firstLine?.trim() ?? '';
	}

	// ATX: strip the opening marker and optional closing marker from the raw line.
	// This is more robust than relying on child node segmentation.
	const raw = state.doc.sliceString(node.from, node.to);
	const firstLine = raw.split('\n')[0] ?? raw;
	return firstLine
		.replace(/^#{1,6}[ \t]*/, '')
		.replace(/[ \t]+#+[ \t]*$/, '')
		.trim();
}

/**
 * Parse all headings from the syntax tree.
 * Returns a StickyHeadingIndex with parent chain and section boundaries computed.
 */
export function buildHeadingIndex(
	state: EditorState,
	config: Required<StickyScrollConfig>
): StickyHeadingIndex {
	const headings: StickyHeading[] = [];
	let tree = syntaxTree(state);
	if (tree.length < state.doc.length) {
		// On longer docs, the parser can be partially available during initial
		// render. Ensure we have a full tree so sticky scroll doesn't "freeze"
		// at the last parsed heading.
		tree = ensureSyntaxTree(state, state.doc.length, PARSE_TIMEOUT_MS) ?? tree;
	}

	tree.iterate({
		enter: (nodeRef) => {
			let level: number | null = null;
			let isSetext = false;

			const atxMatch = ATX_HEADING_RE.exec(nodeRef.name);
			if (atxMatch?.[1]) {
				level = parseInt(atxMatch[1], 10);
			} else {
				const setextMatch = SETEXT_HEADING_RE.exec(nodeRef.name);
				if (setextMatch?.[1]) {
					level = parseInt(setextMatch[1], 10);
					isSetext = true;
				}
			}

			if (level === null) return;
			if (level < config.minLevel || level > config.maxLevel) return;

			const text = extractHeadingText(state, nodeRef.node, isSetext);
			if (!text) return;

			const lineInfo = state.doc.lineAt(nodeRef.from);

			headings.push({
				level: level as HeadingLevel,
				from: nodeRef.from,
				to: nodeRef.to,
				text,
				line: lineInfo.number,
				parentIndex: null,
				sectionEnd: state.doc.length // will be refined below
			});
		}
	});

	// Compute parentIndex and sectionEnd
	computeParentsAndSections(headings, state.doc.length);

	return {
		headings,
		positions: headings.map((h) => h.from),
		version: 0
	};
}

/**
 * Compute parent chain and section boundaries for a list of headings.
 * parentIndex: the index of the nearest ancestor heading (lower level).
 * sectionEnd: the position where this heading's section ends (next heading of level <= current, or doc end).
 */
function computeParentsAndSections(headings: StickyHeading[], docLength: number): void {
	// Stack of indices for determining parents
	const stack: number[] = [];

	for (let i = 0; i < headings.length; i++) {
		const h = headings[i]!;

		// Pop stack until we find a heading with strictly lower level (= parent)
		while (stack.length > 0) {
			const topIdx = stack[stack.length - 1]!;
			if (headings[topIdx]!.level >= h.level) {
				stack.pop();
			} else {
				break;
			}
		}

		h.parentIndex = stack.length > 0 ? stack[stack.length - 1]! : null;
		stack.push(i);
	}

	// Compute sectionEnd: each heading's section ends where the next heading of level <= it starts
	for (let i = 0; i < headings.length; i++) {
		const h = headings[i]!;
		h.sectionEnd = docLength; // default: extends to end of document

		for (let j = i + 1; j < headings.length; j++) {
			const next = headings[j]!;
			if (next.level <= h.level) {
				h.sectionEnd = next.from;
				break;
			}
		}
	}
}

// ---------------------------------------------------------------------------
// Active Path Computation
// ---------------------------------------------------------------------------

/**
 * Binary search to find the last heading with `from <= topPos`.
 * Returns the index, or -1 if no heading is at or before topPos.
 */
export function findActiveHeadingIndex(positions: number[], topPos: number): number {
	if (positions.length === 0) return -1;

	let lo = 0;
	let hi = positions.length - 1;
	let result = -1;

	while (lo <= hi) {
		const mid = (lo + hi) >>> 1;
		if (positions[mid]! <= topPos) {
			result = mid;
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}

	return result;
}

/**
 * Compute the active heading path (breadcrumb stack) for a given scroll position.
 * Returns headings from outermost to innermost.
 */
export function getActivePath(
	index: StickyHeadingIndex,
	topPos: number,
	maxLines: number
): StickyHeading[] {
	const { headings, positions } = index;

	const activeIdx = findActiveHeadingIndex(positions, topPos);
	if (activeIdx < 0) return [];

	// Walk the parent chain from the active heading to the root
	const path: StickyHeading[] = [];
	let current: number | null = activeIdx;

	while (current !== null && current >= 0) {
		const heading: StickyHeading = headings[current]!;
		path.push(heading);
		current = heading.parentIndex;
	}

	// Reverse to get root -> leaf order
	path.reverse();

	// Trim to maxLines (keep the deepest entries)
	if (path.length > maxLines) {
		return path.slice(path.length - maxLines);
	}

	return path;
}

// ---------------------------------------------------------------------------
// StateField
// ---------------------------------------------------------------------------

function createHeadingField(config: Required<StickyScrollConfig>) {
	return StateField.define<StickyHeadingIndex>({
		create(state) {
			return buildHeadingIndex(state, config);
		},
		update(value, tr) {
			if (tr.docChanged) {
				const newIndex = buildHeadingIndex(tr.state, config);
				newIndex.version = value.version + 1;
				return newIndex;
			}
			return value;
		}
	});
}

// ---------------------------------------------------------------------------
// Panel + Scroll Listener
// ---------------------------------------------------------------------------

/**
 * Compute the top visible document position.
 *
 * Uses coordinate lookup anchored to the scroller viewport, which avoids
 * drift from manual scrollTop math and tracks wrapped lines correctly.
 */
function getTopVisiblePos(view: EditorView): number {
	const scrollRect = view.scrollDOM.getBoundingClientRect();
	if (scrollRect.width > 0 && scrollRect.height > 0) {
		const contentStyle = getComputedStyle(view.contentDOM);
		const contentPaddingLeft = Number.parseFloat(contentStyle.paddingLeft);
		const probeOffset = Number.isFinite(contentPaddingLeft) ? contentPaddingLeft + 1 : 16;
		const x = Math.min(scrollRect.right - 2, scrollRect.left + probeOffset);
		const y = scrollRect.top + 1;
		const pos = view.posAtCoords({ x, y });
		if (pos !== null) return pos;
	}

	// Fallback: use the earliest visible range.
	const ranges = view.visibleRanges;
	if (ranges.length > 0) {
		let top = ranges[0]!.from;
		for (let i = 1; i < ranges.length; i++) {
			top = Math.min(top, ranges[i]!.from);
		}
		return top;
	}

	return view.viewport.from;
}

function createStickyPanel(
	headingField: StateField<StickyHeadingIndex>,
	config: Required<StickyScrollConfig>
) {
	return (view: EditorView): Panel => {
		const dom = document.createElement('div');
		dom.className = 'cm-sticky-scroll';
		dom.setAttribute('role', 'navigation');
		dom.setAttribute('aria-label', 'Document heading context');

		let lastPathKey = '';
		let rafId: number | null = null;

		function renderPath(v: EditorView) {
			const index = v.state.field(headingField);
			const topPos = getTopVisiblePos(v);
			// Sticky headings should represent context above the currently visible
			// top line. This avoids duplicate/jumpy behavior with back-to-back headings.
			const topLineStart = v.state.doc.lineAt(topPos).from;
			const anchorPos = topLineStart - 1;
			const path = getActivePath(index, anchorPos, config.maxLines);

			// Build a key to detect changes - skip DOM work if unchanged
			const pathKey = `${index.version}|${path.map((h) => `${h.from}:${h.level}:${h.text}`).join('|')}`;
			if (pathKey === lastPathKey) return;
			lastPathKey = pathKey;

			// Clear and rebuild
			dom.innerHTML = '';

			if (path.length === 0) {
				dom.style.display = 'none';
				return;
			}

			dom.style.display = '';

			for (const heading of path) {
				const line = document.createElement('button');
				line.type = 'button';
				line.className = `cm-sticky-scroll-line cm-sticky-scroll-h${heading.level}`;
				line.setAttribute('data-level', String(heading.level));
				line.textContent = heading.text;
				line.title = heading.text;
				line.setAttribute('aria-label', `Jump to heading: ${heading.text}`);

				const headingFrom = heading.from;
				line.addEventListener('click', (e) => {
					e.preventDefault();
					v.dispatch({
						selection: { anchor: headingFrom },
						effects: EditorView.scrollIntoView(headingFrom, { y: 'start' })
					});
					v.focus();
				});

				dom.appendChild(line);
			}
		}

		function scheduleRender(v: EditorView) {
			if (rafId !== null) return;
			rafId = requestAnimationFrame(() => {
				rafId = null;
				renderPath(v);
			});
		}

		// Initial render
		renderPath(view);

		// Throttle scroll-driven updates to animation frames.
		const onScroll = () => scheduleRender(view);
		view.scrollDOM.addEventListener('scroll', onScroll, { passive: true });

		return {
			dom,
			top: true,
			update(update: ViewUpdate) {
				if (update.docChanged || update.viewportChanged) {
					scheduleRender(update.view);
				}
			},
			destroy() {
				if (rafId !== null) {
					cancelAnimationFrame(rafId);
					rafId = null;
				}
				view.scrollDOM.removeEventListener('scroll', onScroll);
			}
		};
	};
}

// ---------------------------------------------------------------------------
// Scroll Margin
// ---------------------------------------------------------------------------

function createScrollMargin() {
	return EditorView.scrollMargins.of((view) => {
		const el = view.dom.querySelector('.cm-sticky-scroll') as HTMLElement | null;
		if (!el || el.style.display === 'none') return null;
		const height = el.offsetHeight;
		if (height === 0) return null;
		return { top: height };
	});
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create the sticky scroll extension for CodeMirror 6.
 *
 * Usage:
 * ```ts
 * import { stickyScroll } from './sticky-scroll';
 * const extensions = [markdown(), stickyScroll(), ...];
 * ```
 */
export function stickyScroll(config?: StickyScrollConfig): Extension {
	const resolved: Required<StickyScrollConfig> = { ...DEFAULT_CONFIG, ...config };
	const headingField = createHeadingField(resolved);

	return [
		headingField,
		showPanel.of(createStickyPanel(headingField, resolved)),
		createScrollMargin()
	];
}
