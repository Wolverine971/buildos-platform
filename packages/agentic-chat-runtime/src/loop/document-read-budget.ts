// packages/agentic-chat-runtime/src/loop/document-read-budget.ts
//
// One place for how much document body a chat read returns (audit 2026-10-17
// S8). Shared by the read tools (tools/ontology-reads.ts), which decide what to
// slice, and the model-payload compactor (loop/tool-payload-compaction.ts),
// which keeps those slices exact.
//
// Measured on prod chat_tool_executions (all document reads, 2026-09-18 →
// 2026-10-17): 18 of 37 get_onto_document_details calls hit the old 3.5k
// preview, and 13 of those 18 were followed by an outline and section reads of
// the same document — 2–5 acting rounds of ~4 s each just reading. Six of the
// 18 truncated bodies sat between 5.0k and 6.0k, so a 6k inline cap covers 11
// of 18 (a 5k cap covers 5). Section text read per turn and document: 21 of 24
// were ≤ 12k, so one 12k call covers what used to take several.

/** A body at or under this many characters comes back whole, never as a preview. */
export const DOCUMENT_INLINE_BODY_MAX_CHARS = 6_000;
/** Preview length for a longer body (unchanged from before S8). */
export const DOCUMENT_PREVIEW_CHARS = 3_500;
/** Most section (or body) characters one read_document_section call returns. */
export const DOCUMENT_SECTION_READ_BUDGET_CHARS = 12_000;
/** Section index entries a long document's detail read carries. */
export const DOCUMENT_SECTION_INDEX_MAX_ENTRIES = 30;
const DOCUMENT_SECTION_INDEX_HEADING_CHARS = 80;
/**
 * Serialized characters of headings one get_document_outline call returns; more page by
 * `offset`. Prod 2026-11-13: 51 of 628 documents have over 39 headings (what the old 5.6k cut
 * kept) and the longest has 236; this fits about 100 to 150, inside the 16k document budget.
 */
export const DOCUMENT_OUTLINE_PAGE_CHARS = 12_000;

export type DocumentSectionIndexEntryV1 = {
	anchor: string;
	heading: string;
	level: number;
	/** Characters in the section, nested subsections included. */
	chars: number;
};

type OutlineNodeLike = {
	level: number;
	text: string;
	anchor: string;
	char_start: number;
	char_end: number;
	children?: OutlineNodeLike[];
};

/** The body text a document record carries (`content`, or legacy `props.body_markdown`). */
export function documentBodyText(document: Record<string, any> | null | undefined): string {
	if (!document) return '';
	if (typeof document.content === 'string') return document.content;
	const props = document.props;
	return props && typeof props === 'object' && typeof props.body_markdown === 'string'
		? props.body_markdown
		: '';
}

/** Outline nodes flattened in document order. */
export function flattenOutlineNodes<T extends OutlineNodeLike>(nodes: readonly T[]): T[] {
	const out: T[] = [];
	for (const node of nodes) {
		out.push(node);
		if (node.children) out.push(...flattenOutlineNodes(node.children as T[]));
	}
	return out;
}

function sectionIndexEntry(node: OutlineNodeLike): DocumentSectionIndexEntryV1 {
	return {
		anchor: node.anchor,
		heading:
			node.text.length > DOCUMENT_SECTION_INDEX_HEADING_CHARS
				? `${node.text.slice(0, DOCUMENT_SECTION_INDEX_HEADING_CHARS - 3)}...`
				: node.text,
		level: node.level,
		chars: Math.max(0, node.char_end - node.char_start)
	};
}

/**
 * A flat section index (anchor, heading, level, size) the model can pick
 * anchors from without a separate outline read.
 */
export function buildDocumentSectionIndex(
	nodes: readonly OutlineNodeLike[],
	limit = DOCUMENT_SECTION_INDEX_MAX_ENTRIES
): { sections: DocumentSectionIndexEntryV1[]; omitted: number } {
	const flat = flattenOutlineNodes(nodes);
	const sections = flat.slice(0, limit).map(sectionIndexEntry);
	return { sections, omitted: Math.max(0, flat.length - sections.length) };
}

/**
 * One page of a document's headings in document order, starting at heading index `offset`.
 * A page holds as many whole entries as `budgetChars` allows (always at least one), and
 * `nextOffset` says where the next page starts, so every anchor is reachable however long
 * the outline is.
 */
export function buildDocumentOutlinePage(
	nodes: readonly OutlineNodeLike[],
	offset = 0,
	budgetChars = DOCUMENT_OUTLINE_PAGE_CHARS
): {
	headings: DocumentSectionIndexEntryV1[];
	total: number;
	offset: number;
	nextOffset: number | null;
} {
	const flat = flattenOutlineNodes(nodes);
	const start = Math.max(0, Math.min(Math.floor(offset) || 0, flat.length));
	const headings: DocumentSectionIndexEntryV1[] = [];
	let used = 0;
	for (let index = start; index < flat.length; index += 1) {
		const entry = sectionIndexEntry(flat[index]!);
		// The entry plus the comma that joins it to the next one.
		const size = JSON.stringify(entry).length + 1;
		if (headings.length > 0 && used + size > budgetChars) break;
		headings.push(entry);
		used += size;
	}
	const end = start + headings.length;
	return { headings, total: flat.length, offset: start, nextOffset: end < flat.length ? end : null };
}

/**
 * End index for a slice of `text` that starts at `start` and holds at most
 * `maxChars`. Prefers ending just after a line break in the last quarter of
 * the window so a continuation never starts mid-line, and never splits a
 * surrogate pair. Offsets stay exact: the next read starts at the returned end.
 */
export function documentSliceEnd(text: string, start: number, maxChars: number): number {
	const from = Math.max(0, Math.min(start, text.length));
	const limit = Math.max(1, Math.floor(maxChars));
	if (text.length - from <= limit) return text.length;
	let end = from + limit;
	const lineBreak = text.lastIndexOf('\n', end - 1);
	if (lineBreak >= from + Math.floor(limit * 0.75)) {
		end = lineBreak + 1;
	}
	const code = text.charCodeAt(end - 1);
	if (end - 1 > from && code >= 0xd800 && code <= 0xdbff) end -= 1;
	return end;
}
