// packages/shared-agent-ops/src/utils/document-outline.ts
import { createHash } from 'node:crypto';
import { Marked } from 'marked';
import { gfmHeadingId, getHeadingList, resetHeadings } from 'marked-gfm-heading-id';

/**
 * Project Knowledge Layer — Layer 0.
 *
 * A document's heading outline is a *pure, deterministic function of its markdown
 * content*: recompute on every save, no LLM, always fresh. This is the structural
 * index that the knowledge map (Layer 1) and section-retrieval tools (Layer 2)
 * build on. See PROJECT_KNOWLEDGE_LAYER_DESIGN_2026-06-16.md.
 */

export const DOC_OUTLINE_VERSION = 1 as const;

export interface DocOutlineNode {
	/** Heading level 1..6 */
	level: number;
	/** Heading text, plain (markdown stripped by marked's tokenizer) */
	text: string;
	/** gfmHeadingId slug — matches the rendered HTML anchor, so deep links work */
	anchor: string;
	/** Offset in content where this section (heading line) begins */
	char_start: number;
	/** Offset where this section ends — next heading of equal-or-higher level, or EOF */
	char_end: number;
	/** Approximate word count of this section's own body, excluding child sections */
	word_count: number;
	children?: DocOutlineNode[];
}

export interface DocOutline {
	version: typeof DOC_OUTLINE_VERSION;
	/** sha256 of the raw content this outline was derived from (staleness key) */
	content_hash: string;
	nodes: DocOutlineNode[];
}

interface FlatHeading {
	level: number;
	text: string;
	anchor: string;
	char_start: number;
	char_end: number;
	word_count: number;
}

/** Stable content hash. Keyed on content alone — title/state/props changes do not invalidate the outline. */
export function hashDocumentContent(content: string | null | undefined): string {
	return createHash('sha256')
		.update(typeof content === 'string' ? content : '')
		.digest('hex');
}

function countWords(text: string): number {
	const trimmed = text.trim();
	if (!trimmed) return 0;
	return trimmed.split(/\s+/).length;
}

/**
 * Extract a nested heading outline from markdown.
 *
 * Anchors come from `getHeadingList()` (the same slugger the renderer uses, so
 * anchors round-trip with rendered HTML ids). Offsets come from the block lexer,
 * whose top-level token `raw` values concatenate back to the source. Both are in
 * document order with identical counts, so we zip them by index.
 */
export function extractOutline(content: string | null | undefined): DocOutline {
	const text = typeof content === 'string' ? content : '';
	const contentHash = hashDocumentContent(text);

	if (!text.trim()) {
		return { version: DOC_OUTLINE_VERSION, content_hash: contentHash, nodes: [] };
	}

	// Isolated marked instance so we never mutate the app-wide marked config.
	const marked = new Marked();
	marked.use(gfmHeadingId());

	// getHeadingList() is module-global to the package; reset → parse → read, with
	// nothing else parsing in between (synchronous), keeps it isolated.
	resetHeadings();
	try {
		marked.parse(text);
	} catch {
		// If parsing throws, fall back to no outline rather than failing the write.
		return { version: DOC_OUTLINE_VERSION, content_hash: contentHash, nodes: [] };
	}
	const headingList = getHeadingList();

	// Walk top-level block tokens to recover char offsets for each heading.
	const tokens = marked.lexer(text);
	const headingStarts: number[] = [];
	let offset = 0;
	for (const token of tokens) {
		if (token.type === 'heading') headingStarts.push(offset);
		offset += token.raw.length;
	}

	// Defensive: if the two passes ever disagree on count, bail rather than misalign.
	if (headingStarts.length !== headingList.length) {
		return { version: DOC_OUTLINE_VERSION, content_hash: contentHash, nodes: [] };
	}

	const flat: FlatHeading[] = headingList.map((h, i) => ({
		level: h.level,
		text: h.text,
		anchor: h.id,
		char_start: headingStarts[i],
		char_end: text.length, // filled below
		word_count: 0 // filled below
	}));

	// char_end: next heading of equal-or-higher importance (level <= current).
	for (let i = 0; i < flat.length; i += 1) {
		let end = text.length;
		for (let j = i + 1; j < flat.length; j += 1) {
			if (flat[j].level <= flat[i].level) {
				end = flat[j].char_start;
				break;
			}
		}
		flat[i].char_end = end;

		// word_count of own body: from this heading up to its first child (deeper level)
		// or the section end, whichever comes first. Drop the heading line itself.
		const firstChild = flat.slice(i + 1).find((h) => h.char_start < flat[i].char_end);
		const bodyEnd =
			firstChild && firstChild.level > flat[i].level
				? firstChild.char_start
				: flat[i].char_end;
		const section = text.slice(flat[i].char_start, bodyEnd);
		const body = section.replace(/^[^\n]*\n?/, ''); // strip the heading line
		flat[i].word_count = countWords(body);
	}

	// Build the nested tree from the flat list using a level stack.
	const root: DocOutlineNode[] = [];
	const stack: DocOutlineNode[] = [];
	for (const h of flat) {
		const node: DocOutlineNode = {
			level: h.level,
			text: h.text,
			anchor: h.anchor,
			char_start: h.char_start,
			char_end: h.char_end,
			word_count: h.word_count
		};
		while (stack.length && stack[stack.length - 1].level >= h.level) stack.pop();
		if (stack.length === 0) {
			root.push(node);
		} else {
			const parent = stack[stack.length - 1];
			(parent.children ??= []).push(node);
		}
		stack.push(node);
	}

	return { version: DOC_OUTLINE_VERSION, content_hash: contentHash, nodes: root };
}

export interface DocumentSection {
	/** Whether a heading with this anchor was found */
	found: boolean;
	anchor: string;
	/** The matched heading text, when found */
	heading: string | null;
	/** The matched heading level, when found */
	level: number | null;
	/** The section body markdown (heading line + content through the section end) */
	content: string;
}

/**
 * Return the markdown for the section under a given heading anchor.
 *
 * Re-parses the live content (does NOT trust any stored char ranges) so a section
 * read is always correct even if the document was edited since the outline cache
 * was last written. The section spans from its heading to the next heading of
 * equal-or-higher level (i.e. it includes nested subsections). Layer 2.
 */
export function getSectionByAnchor(
	content: string | null | undefined,
	anchor: string
): DocumentSection {
	const text = typeof content === 'string' ? content : '';
	const outline = extractOutline(text);

	let match: DocOutlineNode | null = null;
	const walk = (nodes: DocOutlineNode[]) => {
		for (const n of nodes) {
			if (n.anchor === anchor) {
				match = n;
				return;
			}
			if (n.children) walk(n.children);
			if (match) return;
		}
	};
	walk(outline.nodes);

	if (!match) {
		return { found: false, anchor, heading: null, level: null, content: '' };
	}

	const node = match as DocOutlineNode;
	return {
		found: true,
		anchor,
		heading: node.text,
		level: node.level,
		content: text.slice(node.char_start, node.char_end).trim()
	};
}

/** Total number of heading nodes in an outline tree (all levels). */
export function countOutlineNodes(nodes: DocOutlineNode[]): number {
	let count = 0;
	for (const n of nodes) {
		count += 1;
		if (n.children) count += countOutlineNodes(n.children);
	}
	return count;
}

/** All heading anchors in document order (all levels), for "did you mean" hints. */
export function collectOutlineAnchors(nodes: DocOutlineNode[]): string[] {
	const out: string[] = [];
	for (const n of nodes) {
		out.push(n.anchor);
		if (n.children) out.push(...collectOutlineAnchors(n.children));
	}
	return out;
}

/** True when a stored outline is missing or no longer matches the document content. */
export function isOutlineStale(
	outline: Pick<DocOutline, 'content_hash'> | null | undefined,
	content: string | null | undefined
): boolean {
	if (!outline || typeof outline.content_hash !== 'string') return true;
	return outline.content_hash !== hashDocumentContent(content);
}
