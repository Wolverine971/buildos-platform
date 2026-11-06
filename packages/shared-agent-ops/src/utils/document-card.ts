// packages/shared-agent-ops/src/utils/document-card.ts
//
// Document cards (tasker 152): how a document is previewed without its body. A card is
// the person's own description (or, when there is none, the AI summary kept in
// `onto_documents.digest`) plus the topics the document covers (its outline headings).
// A document short enough to read at a glance is its own card. Browser-safe: no node APIs.
import type { DocOutlineNode } from './document-outline';

/** Text this short is shown whole: no summary is written for it. */
export const DOCUMENT_CARD_TEXT_MAX_CHARS = 280;

/** `onto_documents.digest`: a derived cache, fresh while its content_hash matches. */
export type DocumentDigest = {
	summary?: string;
	content_hash?: string;
	model?: string;
	at?: string;
	/** Set instead of `summary` when the last attempt failed for this text. */
	failed_at?: string;
};

export function readDocumentDigest(value: unknown): DocumentDigest | null {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
	return value as DocumentDigest;
}

/** The digest's summary when it was written for this exact text, else null. */
export function freshDigestSummary(digest: unknown, contentHash: string | null): string | null {
	const read = readDocumentDigest(digest);
	if (!read || !contentHash || read.content_hash !== contentHash) return null;
	const summary = typeof read.summary === 'string' ? read.summary.trim() : '';
	return summary || null;
}

const NAMED_ENTITIES: Record<string, string> = {
	amp: '&',
	lt: '<',
	gt: '>',
	quot: '"',
	apos: "'",
	nbsp: ' '
};

/**
 * The stored outline keeps marked's rendered heading HTML (`<strong>Bold</strong> &amp; x`);
 * cards want the plain words. HTML is a structured format, so stripping it lexically is fine.
 */
export function plainOutlineHeading(html: string): string {
	return html
		.replace(/<[^>]*>/g, '')
		.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, name: string) => {
			if (name[0] !== '#') return NAMED_ENTITIES[name.toLowerCase()] ?? match;
			const code =
				name[1] === 'x' || name[1] === 'X'
					? parseInt(name.slice(2), 16)
					: parseInt(name.slice(1), 10);
			return Number.isFinite(code) && code > 0 && code <= 0x10ffff
				? String.fromCodePoint(code)
				: match;
		})
		.replace(/\s+/g, ' ')
		.trim();
}

function outlineNodes(outline: unknown): DocOutlineNode[] {
	if (!outline || typeof outline !== 'object') return [];
	const nodes = (outline as { nodes?: unknown }).nodes;
	return Array.isArray(nodes) ? (nodes as DocOutlineNode[]) : [];
}

const normalized = (text: string) => text.toLocaleLowerCase().replace(/\s+/g, ' ').trim();

/**
 * The topics a document covers: its H1–H3 headings in reading order, plain text, without an
 * H1 that just repeats the title. Headings stay valid as topics even when the outline is a
 * few edits behind, so freshness isn't checked here.
 */
export function outlineTopics(outline: unknown, title?: string | null, max = 12): string[] {
	const titleKey = title ? normalized(title) : '';
	const topics: string[] = [];
	const seen = new Set<string>();
	const walk = (nodes: readonly DocOutlineNode[]) => {
		for (const node of nodes) {
			if (topics.length >= max) return;
			if (node.level <= 3) {
				const heading = plainOutlineHeading(String(node.text ?? ''));
				const key = normalized(heading);
				if (heading && key !== titleKey && !seen.has(key)) {
					seen.add(key);
					topics.push(heading);
				}
			}
			if (Array.isArray(node.children)) walk(node.children);
		}
	};
	walk(outlineNodes(outline));
	return topics;
}

export type DocumentCardInput = {
	title?: string | null;
	description?: string | null;
	digest?: unknown;
	outline?: unknown;
	content_hash?: string | null;
	/** Only when already loaded and short: a short document is its own card. */
	content?: string | null;
};

export type DocumentCard = {
	/** The person's or agent's description, else the fresh AI summary. */
	summary: string | null;
	summarySource: 'description' | 'digest' | null;
	topics: string[];
	/** The whole text, when it is short enough to be the card. */
	text: string | null;
};

export function documentCard(doc: DocumentCardInput, maxTopics = 12): DocumentCard {
	const description = doc.description?.trim() || null;
	const digest = description ? null : freshDigestSummary(doc.digest, doc.content_hash ?? null);
	const content = doc.content?.trim() ?? '';
	return {
		summary: description ?? digest,
		summarySource: description ? 'description' : digest ? 'digest' : null,
		topics: outlineTopics(doc.outline, doc.title, maxTopics),
		text: content && content.length <= DOCUMENT_CARD_TEXT_MAX_CHARS ? content : null
	};
}

/** Document types the summary sweep leaves alone: START HERE (managed regions re-render its
 * text; the brief and chat read its orientation directly) and table docs (rows, not prose). */
export const DIGEST_SKIPPED_TYPE_KEYS = ['document.context.project', 'document.table'] as const;
