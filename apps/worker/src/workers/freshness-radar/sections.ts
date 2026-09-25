// apps/worker/src/workers/freshness-radar/sections.ts
//
// A document's own sections for the dig (tasker 106). Uses the same outline
// (extractOutline: gfm heading anchors) as the chat's get_document_outline /
// read_document_section / section_edits, so a flagged section names an anchor
// the chat can edit directly. Each segment is a heading's OWN text (up to the
// next heading of any level), so a stale sub-section is judged on its own
// words rather than diluted by its siblings. Headings are structure, not prose.

import { createHash } from 'node:crypto';
import {
	type DocOutlineNode,
	extractOutline
} from '@buildos/shared-agent-ops/utils/document-outline';

export type DocumentSegment = {
	/** gfm heading anchor, or null for the text before the first heading. */
	anchor: string | null;
	heading: string;
	level: number;
	/** The segment's own markdown (heading line included), clipped with a marked "…". */
	text: string;
	/** SHA-256 of the unclipped own text: the roll-up's "was this section edited?" key. */
	textSha256: string;
};

export const PREAMBLE_HEADING = '(opening, before the first heading)';

function sha256(value: string): string {
	return createHash('sha256').update(value).digest('hex');
}

function flatten(nodes: readonly DocOutlineNode[], out: DocOutlineNode[] = []): DocOutlineNode[] {
	for (const node of nodes) {
		out.push(node);
		if (node.children) flatten(node.children, out);
	}
	return out;
}

function clip(text: string, max: number): string {
	if (text.length <= max) return text;
	return `${text.slice(0, max - 1).trimEnd()}… [section shortened]`;
}

/** Segments in document order. Empty-bodied headings are kept only when they have no children. */
export function documentSegments(
	content: string | null | undefined,
	options: { sectionChars: number }
): DocumentSegment[] {
	const text = (content ?? '').replace(/\r\n|\r/g, '\n');
	if (!text.trim()) return [];
	const headings = flatten(extractOutline(text).nodes).sort(
		(a, b) => a.char_start - b.char_start
	);
	const segments: DocumentSegment[] = [];
	const firstStart = headings[0]?.char_start ?? text.length;
	const preamble = text.slice(0, firstStart).trim();
	if (preamble) {
		segments.push({
			anchor: null,
			heading: PREAMBLE_HEADING,
			level: 0,
			text: clip(preamble, options.sectionChars),
			textSha256: sha256(preamble)
		});
	}
	headings.forEach((heading, index) => {
		const end = headings[index + 1]?.char_start ?? text.length;
		const own = text.slice(heading.char_start, end).trim();
		const body = own.replace(/^[^\n]*\n?/, '').trim();
		const hasChildren = Boolean(heading.children?.length);
		if (!body && hasChildren) return; // a pure container heading says nothing itself
		segments.push({
			anchor: heading.anchor,
			heading: heading.text,
			level: heading.level,
			text: clip(own, options.sectionChars),
			textSha256: sha256(own)
		});
	});
	return segments;
}

/** Current own-text hash per anchor (preamble keyed by ''), for the roll-up close check. */
export function segmentHashes(content: string | null | undefined): Map<string, string> {
	const hashes = new Map<string, string>();
	for (const segment of documentSegments(content, { sectionChars: Number.MAX_SAFE_INTEGER })) {
		hashes.set(segment.anchor ?? '', segment.textSha256);
	}
	return hashes;
}
