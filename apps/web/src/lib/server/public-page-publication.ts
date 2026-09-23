// apps/web/src/lib/server/public-page-publication.ts
// Pure helpers that decide exactly which text a public page publishes. The
// content review and the publish/live-sync writers both call these, so the
// text that gets reviewed is the text that gets published.

export const PUBLIC_PAGE_TITLE_MAX_LENGTH = 200;
export const PUBLIC_PAGE_SUMMARY_MAX_LENGTH = 500;
const DERIVED_SUMMARY_MAX_LENGTH = 220;
const MAX_PUBLIC_PAGE_CITATIONS = 100;
const MAX_CITATION_TEXT_LENGTH = 300;
const MAX_CITATION_URL_LENGTH = 2048;

export type PublicPageDocumentText = {
	title: string | null;
	description: string | null;
	content: string | null;
	props: Record<string, unknown> | null;
};

export type PublicPagePublicationText = {
	title: string;
	summary: string | null;
};

export type PublicPageCitation = {
	url: string | null;
	label: string | null;
	title: string | null;
};

function toStringOrNull(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function clampText(value: string, maxLength: number): string {
	if (value.length <= maxLength) return value;
	return `${value.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function stripMarkdown(value: string): string {
	return value
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/`[^`]+`/g, ' ')
		.replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
		.replace(/\[[^\]]+\]\([^)]+\)/g, ' ')
		.replace(/[#>*_~\-]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

export function getPublicPageDocumentContent(document: {
	content: string | null;
	props: Record<string, unknown> | null;
}): string {
	if (typeof document.content === 'string') return document.content;
	const markdown = document.props?.body_markdown;
	return typeof markdown === 'string' ? markdown : '';
}

export function derivePublicPageSummary(
	content: string | null,
	description: string | null,
	explicit?: string | null
): string | null {
	const explicitSummary = toStringOrNull(explicit);
	if (explicitSummary) return clampText(explicitSummary, PUBLIC_PAGE_SUMMARY_MAX_LENGTH);
	const descriptionSummary = toStringOrNull(description);
	if (descriptionSummary) return clampText(descriptionSummary, PUBLIC_PAGE_SUMMARY_MAX_LENGTH);
	if (!content || !content.trim()) return null;
	const plain = stripMarkdown(content);
	if (!plain) return null;
	return clampText(plain, DERIVED_SUMMARY_MAX_LENGTH);
}

/**
 * The title and summary a publish (or live sync) will write. Explicit values
 * win; otherwise they derive from the document. Always length-capped.
 */
export function resolvePublicPagePublicationText(
	document: PublicPageDocumentText,
	input: { title?: string | null; summary?: string | null } = {}
): PublicPagePublicationText {
	const content = getPublicPageDocumentContent(document);
	const title = clampText(
		toStringOrNull(input.title) ?? toStringOrNull(document.title) ?? 'Untitled',
		PUBLIC_PAGE_TITLE_MAX_LENGTH
	);
	const summary = derivePublicPageSummary(
		content,
		toStringOrNull(document.description),
		input.summary ?? null
	);
	return { title, summary };
}

/**
 * Rejects explicit title/summary input that exceeds the public page limits.
 * Returns a user-facing message, or null when the input is acceptable.
 */
export function validatePublicPagePublicationInput(input: {
	title?: string | null;
	summary?: string | null;
}): string | null {
	const title = toStringOrNull(input.title);
	if (title && title.length > PUBLIC_PAGE_TITLE_MAX_LENGTH) {
		return `Public page title must be ${PUBLIC_PAGE_TITLE_MAX_LENGTH} characters or fewer.`;
	}
	const summary = toStringOrNull(input.summary);
	if (summary && summary.length > PUBLIC_PAGE_SUMMARY_MAX_LENGTH) {
		return `Public page summary must be ${PUBLIC_PAGE_SUMMARY_MAX_LENGTH} characters or fewer.`;
	}
	return null;
}

function toSafeHttpUrl(value: unknown): string | null {
	const trimmed = toStringOrNull(value);
	if (!trimmed || trimmed.length > MAX_CITATION_URL_LENGTH) return null;
	try {
		const parsed = new URL(trimmed);
		return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
	} catch {
		return null;
	}
}

/**
 * Citations as the public page renders them. Only http(s) links survive; a
 * `javascript:` or `data:` URL is dropped (its label still renders as text).
 */
export function getPublicPageCitations(props: unknown): PublicPageCitation[] {
	if (!props || typeof props !== 'object' || Array.isArray(props)) return [];
	const raw = (props as Record<string, unknown>).citations;
	if (!Array.isArray(raw)) return [];

	const citations: PublicPageCitation[] = [];
	for (const entry of raw) {
		if (citations.length >= MAX_PUBLIC_PAGE_CITATIONS) break;
		if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
		const record = entry as Record<string, unknown>;
		const url = toSafeHttpUrl(record.url);
		const labelRaw = toStringOrNull(record.label);
		const titleRaw = toStringOrNull(record.title);
		const label = labelRaw ? clampText(labelRaw, MAX_CITATION_TEXT_LENGTH) : null;
		const title = titleRaw ? clampText(titleRaw, MAX_CITATION_TEXT_LENGTH) : null;
		if (!url && !label && !title) continue;
		citations.push({ url, label, title });
	}
	return citations;
}

/**
 * The props snapshot stored on the public page. Only what the public page
 * renders is copied, so nothing unreviewed rides along in `published_props`.
 */
export function buildPublicPagePublishedProps(
	documentProps: Record<string, unknown> | null,
	documentState: string | null
): Record<string, unknown> {
	return {
		document_state: documentState ?? 'draft',
		citations: getPublicPageCitations(documentProps)
	};
}
