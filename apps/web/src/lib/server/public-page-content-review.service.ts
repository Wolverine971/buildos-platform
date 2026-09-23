// apps/web/src/lib/server/public-page-content-review.service.ts
import { createHash } from 'node:crypto';
import { SmartLLMService } from '$lib/services/smart-llm-service';
import {
	getPublicPageCitations,
	getPublicPageDocumentContent,
	type PublicPagePublicationText
} from '$lib/server/public-page-publication';

type SupabaseLike = any;

// v3: review covers the published title/summary/description/sources plus the
// full body in chunks, and a pass or an admin approval only counts when the
// LLM review completed. v2 rows (keyword-era flags, coerced passes) never reuse.
export const PUBLIC_PAGE_CONTENT_POLICY_VERSION = 'public_page_policy_v3';

const LLM_REVIEW_PROVIDER = 'rule_engine+smart_llm';
const REVIEW_ATTEMPTS_TABLE = 'onto_public_page_review_attempts';

export type PublicPageReviewSource = 'publish_confirm' | 'live_sync' | 'manual_retry';
export type PublicPageReviewStatus = 'passed' | 'flagged' | 'error';
export type PublicPageAdminDecision = 'approved' | 'rejected';
export type PublicPageReviewSeverity = 'low' | 'medium' | 'high';
export type PublicPageReviewCategory =
	| 'credentials'
	| 'personal_data'
	| 'self_harm_or_violence'
	| 'sexual_content'
	| 'hate_or_harassment'
	| 'illegal_activity'
	| 'other';
export type PublicPageReviewFindingSource = 'text' | 'image';

export type PublicPageReviewFinding = {
	code: string;
	category: PublicPageReviewCategory;
	severity: PublicPageReviewSeverity;
	source: PublicPageReviewFindingSource;
	message: string;
	recommendation: string;
	excerpt: string | null;
	asset_id: string | null;
	asset_label: string | null;
};

export type PublicPageReviewAttempt = {
	id: string;
	project_id: string;
	document_id: string;
	public_page_id: string | null;
	source: PublicPageReviewSource;
	status: PublicPageReviewStatus;
	policy_version: string;
	summary: string | null;
	reasons: string[];
	text_findings: PublicPageReviewFinding[];
	image_findings: PublicPageReviewFinding[];
	created_by: string;
	created_at: string;
	review_metadata: Record<string, unknown>;
	admin_decision: PublicPageAdminDecision | null;
	admin_decision_reason: string | null;
	admin_decision_by: string | null;
	admin_decision_at: string | null;
};

type DocumentLike = {
	id: string;
	project_id: string;
	title: string | null;
	description: string | null;
	content: string | null;
	props: Record<string, unknown> | null;
	updated_at?: string | null;
};

type AssetLike = {
	id: string;
	content_type: string | null;
	original_filename: string | null;
	alt_text: string | null;
	caption: string | null;
	extracted_text: string | null;
	extraction_summary: string | null;
	ocr_status: string | null;
};

type ReviewOptions = {
	/** User-scoped client: inline asset reads and LLM usage logging. */
	supabase: SupabaseLike;
	/**
	 * Service-role client that persists the review attempt. Members cannot
	 * write review rows directly; callers must verify the actor's project
	 * write access with the user-scoped client before passing this in.
	 */
	adminSupabase: SupabaseLike;
	document: DocumentLike;
	/** Title and summary the publish or live sync will write. Reviewed with the body. */
	publication: PublicPagePublicationText;
	actorId: string;
	actorUserId?: string | null;
	source: PublicPageReviewSource;
	publicPageId?: string | null;
	/**
	 * The document's latest stored review. Chunks whose exact text that review
	 * already passed are not sent to the LLM again, so a live-synced long page
	 * only pays for the parts that changed.
	 */
	previousReview?: PublicPageReviewAttempt | null;
};

type SetAdminDecisionOptions = {
	/** Service-role client. Callers must verify the user is a BuildOS admin first. */
	adminSupabase: SupabaseLike;
	reviewId: string;
	actorId: string;
	decision: PublicPageAdminDecision;
	reason?: string | null;
};

type LlmReviewResult = {
	status: 'passed' | 'flagged';
	summary: string | null;
	findings: PublicPageReviewFinding[];
	reasons: string[];
};

type RegexRule = {
	code: string;
	category: PublicPageReviewCategory;
	severity: PublicPageReviewSeverity;
	message: string;
	recommendation: string;
	source: PublicPageReviewFindingSource | 'both';
	patterns: RegExp[];
	redaction: string;
};

export class PublicPageReviewDecisionError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'PublicPageReviewDecisionError';
	}
}

const INLINE_ASSET_RENDER_REGEX =
	/\/api\/onto\/assets\/([0-9a-fA-F-]{36})\/render(?:\?[^\s)\]]*)?/g;

/**
 * User-facing summary when the LLM policy review could not run. Publishing and
 * live sync are refused (fail closed) and the user is asked to retry.
 */
export const PUBLIC_PAGE_REVIEW_UNAVAILABLE_MESSAGE =
	'Content review is temporarily unavailable. Please try again in a few minutes.';

export const PUBLIC_PAGE_REVIEW_TOO_LONG_CODE = 'content_too_long_for_automatic_review';

// Deterministic detectors match fixed formats (keys, tokens, SSNs; card numbers
// are Luhn-checked below), never meaning. Judging harmful, sexual, illegal, or
// hateful content belongs to the LLM review, which fails closed.
const POLICY_RULES: RegexRule[] = [
	{
		code: 'secret_private_key',
		category: 'credentials',
		severity: 'high',
		message: 'Possible private key material detected.',
		recommendation: 'Remove credentials or secrets before publishing.',
		source: 'both',
		patterns: [/-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----/i],
		redaction: '[redacted-private-key]'
	},
	{
		code: 'secret_api_token',
		category: 'credentials',
		severity: 'high',
		message: 'Possible API key detected.',
		recommendation: 'Remove keys and rotate any exposed credentials.',
		source: 'both',
		patterns: [
			/\bsk-(?:proj-)?[a-zA-Z0-9_-]{20,}\b/i,
			/\bsk_(?:live|test)_[a-zA-Z0-9]{16,}\b/i,
			/\bSG\.[a-zA-Z0-9_-]{16,}\.[a-zA-Z0-9_-]{16,}\b/i,
			/\bAKIA[0-9A-Z]{16}\b/,
			/\b(?:gh[pousr]_[a-zA-Z0-9]{36,}|github_pat_[a-zA-Z0-9_]{50,})\b/i,
			/\bxox[baprs]-[a-zA-Z0-9-]{16,}\b/i,
			/\bAIza[0-9a-zA-Z_-]{35}\b/
		],
		redaction: '[redacted-credential]'
	},
	{
		code: 'pii_ssn',
		category: 'personal_data',
		severity: 'high',
		message: 'Possible Social Security Number detected.',
		recommendation: 'Remove sensitive personal identifiers before publishing.',
		source: 'both',
		patterns: [/\b\d{3}-\d{2}-\d{4}\b/],
		redaction: '[redacted-ssn]'
	}
];

// A PEM private key block: the header through its END line, or, when the END
// line is missing, the header plus the base64 body lines that follow it. Used
// only for redaction so key material never reaches the LLM.
const PRIVATE_KEY_BLOCK_REGEX =
	/-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----(?:[\s\S]{0,12000}?-----END(?: [A-Z0-9]+)? PRIVATE KEY-----|(?:[ \t]*\r?\n[ \t]*[A-Za-z0-9+/=]{40,})*)/gi;
const CARD_CANDIDATE_REGEX = /(?:\b\d[ -]*?){13,19}\b/g;
const EXCERPT_LONG_TOKEN_REGEX = /[A-Za-z0-9+/=_-]{32,}/g;

/** Characters per LLM review call. */
const LLM_REVIEW_CHUNK_CHARS = 12_000;
/**
 * Pages up to this many characters (page text plus image text) get a full
 * automatic review, split across at most three LLM calls. Longer pages are
 * flagged for an admin instead of passing on a partial read.
 */
const MAX_LLM_REVIEW_CHARS = 30_000;
const LLM_CHUNK_MIN_FILL = 0.85;
const LLM_CHUNK_CONTEXT_CHARS = 300;

function toStringOrNull(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const trimmed = value.trim();
	return trimmed.length > 0 ? trimmed : null;
}

function readMetadataString(
	metadata: Record<string, unknown> | null | undefined,
	key: string
): string | null {
	if (!metadata) return null;
	return toStringOrNull(metadata[key]);
}

function normalizeWhitespace(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}

function globalRegex(pattern: RegExp): RegExp {
	const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
	return new RegExp(pattern.source, flags);
}

function extractInlineAssetIds(markdown: string): string[] {
	if (!markdown) return [];
	const ids = new Set<string>();
	for (const match of markdown.matchAll(new RegExp(INLINE_ASSET_RENDER_REGEX))) {
		const id = match[1]?.toLowerCase();
		if (id) ids.add(id);
	}
	return [...ids];
}

function isLikelyCreditCard(value: string): boolean {
	const digits = value.replace(/\D/g, '');
	if (digits.length < 13 || digits.length > 19) return false;
	if (/^(\d)\1+$/.test(digits)) return false;

	let sum = 0;
	let shouldDouble = false;
	for (let i = digits.length - 1; i >= 0; i--) {
		let digit = Number(digits.charAt(i));
		if (shouldDouble) {
			digit *= 2;
			if (digit > 9) digit -= 9;
		}
		sum += digit;
		shouldDouble = !shouldDouble;
	}
	return sum % 10 === 0;
}

type SensitiveRange = { start: number; end: number; placeholder: string };

/**
 * Every fixed-format detector match (private key blocks, API tokens, SSNs,
 * Luhn-valid card numbers) in `text`, sorted and merged.
 */
function findSensitiveRanges(text: string): SensitiveRange[] {
	const ranges: SensitiveRange[] = [];
	const collect = (
		expression: RegExp,
		placeholder: string,
		accept?: (match: string) => boolean
	) => {
		for (const match of text.matchAll(expression)) {
			const matched = match[0] ?? '';
			if (!matched || (accept && !accept(matched))) continue;
			const start = match.index ?? 0;
			ranges.push({ start, end: start + matched.length, placeholder });
		}
	};
	collect(new RegExp(PRIVATE_KEY_BLOCK_REGEX), '[redacted-private-key]');
	for (const rule of POLICY_RULES) {
		for (const pattern of rule.patterns) collect(globalRegex(pattern), rule.redaction);
	}
	collect(new RegExp(CARD_CANDIDATE_REGEX), '[redacted-card-number]', isLikelyCreditCard);

	ranges.sort((a, b) => a.start - b.start || b.end - a.end);
	const merged: SensitiveRange[] = [];
	for (const range of ranges) {
		const last = merged[merged.length - 1];
		if (last && range.start < last.end) {
			last.end = Math.max(last.end, range.end);
			continue;
		}
		merged.push({ ...range });
	}
	return merged;
}

function applyRedactions(
	text: string,
	ranges: SensitiveRange[],
	windowStart = 0,
	windowEnd = text.length
): string {
	let output = '';
	let cursor = windowStart;
	for (const range of ranges) {
		if (range.end <= windowStart || range.start >= windowEnd) continue;
		const start = Math.max(range.start, windowStart);
		output += text.slice(cursor, start) + range.placeholder;
		cursor = Math.min(range.end, windowEnd);
	}
	return output + text.slice(cursor, windowEnd);
}

/**
 * Replaces every fixed-format detector match with a placeholder. The LLM only
 * ever sees redacted text, so a detected secret is never sent to the model.
 */
function redactFixedFormatMatches(value: string): string {
	return applyRedactions(value, findSensitiveRanges(value));
}

function excerptAround(
	value: string,
	ranges: SensitiveRange[],
	startIndex: number,
	matchLength: number
): string {
	const safeStart = Math.max(0, startIndex - 60);
	const safeEnd = Math.min(value.length, startIndex + matchLength + 80);
	// Redact against matches found in the full text so a window edge can never
	// expose part of a secret; also mask any long unbroken token that remains.
	return normalizeWhitespace(
		applyRedactions(value, ranges, safeStart, safeEnd).replace(
			EXCERPT_LONG_TOKEN_REGEX,
			'[redacted]'
		)
	).slice(0, 220);
}

function toAssetLabel(asset: AssetLike): string | null {
	return (
		toStringOrNull(asset.original_filename) ??
		toStringOrNull(asset.alt_text) ??
		toStringOrNull(asset.caption)
	);
}

function scanRegexRules(
	text: string,
	ranges: SensitiveRange[],
	source: PublicPageReviewFindingSource,
	asset: AssetLike | null
): PublicPageReviewFinding[] {
	const findings: PublicPageReviewFinding[] = [];
	for (const rule of POLICY_RULES) {
		if (rule.source !== 'both' && rule.source !== source) continue;
		for (const pattern of rule.patterns) {
			for (const match of text.matchAll(globalRegex(pattern))) {
				const matchText = match[0] ?? '';
				const index = match.index ?? 0;
				findings.push({
					code: rule.code,
					category: rule.category,
					severity: rule.severity,
					source,
					message: rule.message,
					recommendation: rule.recommendation,
					excerpt: excerptAround(text, ranges, index, matchText.length),
					asset_id: asset?.id ?? null,
					asset_label: asset ? toAssetLabel(asset) : null
				});
			}
		}
	}
	return findings;
}

function scanCreditCards(
	text: string,
	ranges: SensitiveRange[],
	source: PublicPageReviewFindingSource,
	asset: AssetLike | null
): PublicPageReviewFinding[] {
	const findings: PublicPageReviewFinding[] = [];
	for (const match of text.matchAll(new RegExp(CARD_CANDIDATE_REGEX))) {
		const candidate = match[0] ?? '';
		if (!isLikelyCreditCard(candidate)) continue;
		const index = match.index ?? 0;
		findings.push({
			code: 'pii_credit_card',
			category: 'personal_data',
			severity: 'high',
			source,
			message: 'Possible credit card number detected.',
			recommendation: 'Remove payment card numbers before publishing.',
			excerpt: excerptAround(text, ranges, index, candidate.length),
			asset_id: asset?.id ?? null,
			asset_label: asset ? toAssetLabel(asset) : null
		});
	}
	return findings;
}

function scanTextForFindings(
	text: string,
	source: PublicPageReviewFindingSource,
	asset: AssetLike | null
): PublicPageReviewFinding[] {
	if (!text.trim()) return [];
	const ranges = findSensitiveRanges(text);
	return [
		...scanRegexRules(text, ranges, source, asset),
		...scanCreditCards(text, ranges, source, asset)
	];
}

function normalizeImageTextForScan(asset: AssetLike): string {
	return normalizeWhitespace(
		[
			toStringOrNull(asset.original_filename),
			toStringOrNull(asset.alt_text),
			toStringOrNull(asset.caption),
			toStringOrNull(asset.extraction_summary),
			toStringOrNull(asset.extracted_text)
		]
			.filter((value): value is string => Boolean(value))
			.join('\n')
	);
}

function buildImageReviewSection(asset: AssetLike): string | null {
	const fields: Array<[string, string | null]> = [
		['filename', toStringOrNull(asset.original_filename)],
		['alt text', toStringOrNull(asset.alt_text)],
		['caption', toStringOrNull(asset.caption)],
		['summary', toStringOrNull(asset.extraction_summary)],
		['extracted text', toStringOrNull(asset.extracted_text)]
	];
	const lines = fields
		.filter((entry): entry is [string, string] => Boolean(entry[1]))
		.map(([label, value]) => `${label}: ${value}`);
	if (lines.length === 0) return null;
	return `[IMAGE id=${asset.id}]\n${lines.join('\n')}`;
}

function dedupeFindings(findings: PublicPageReviewFinding[]): PublicPageReviewFinding[] {
	const seen = new Set<string>();
	const unique: PublicPageReviewFinding[] = [];
	for (const finding of findings) {
		const key = [
			finding.code,
			finding.source,
			finding.asset_id ?? '',
			finding.message,
			finding.excerpt ?? ''
		].join('::');
		if (seen.has(key)) continue;
		seen.add(key);
		unique.push(finding);
	}
	return unique;
}

function dedupeReasons(reasons: string[]): string[] {
	const seen = new Set<string>();
	const unique: string[] = [];
	for (const reason of reasons) {
		const normalized = normalizeWhitespace(reason);
		if (!normalized) continue;
		if (seen.has(normalized)) continue;
		seen.add(normalized);
		unique.push(normalized);
	}
	return unique;
}

function buildReasons(findings: PublicPageReviewFinding[]): string[] {
	return dedupeReasons(
		findings.map((finding) => {
			const location =
				finding.source === 'image'
					? `Image${finding.asset_label ? ` (${finding.asset_label})` : ''}`
					: 'Document text';
			return `${location}: ${finding.message}`;
		})
	);
}

function toReviewSummary(status: PublicPageReviewStatus, reasons: string[]): string {
	if (status === 'passed') return 'Content passed public page policy checks.';
	if (reasons.length === 0) return 'Content was flagged by public page policy checks.';
	return reasons.slice(0, 2).join(' ');
}

/**
 * Everything the public page shows as text: the published title and summary,
 * the description (shown when there is no summary), the sources list, and the
 * body. The deterministic scan, the LLM review, and the reuse fingerprint all
 * use this, so what is reviewed is what gets published.
 */
export function buildPublicPageReviewText(
	document: Pick<DocumentLike, 'description' | 'content' | 'props'>,
	publication: PublicPagePublicationText
): string {
	const sections: string[] = [];
	const addSection = (label: string, value: string | null | undefined) => {
		if (typeof value === 'string' && value.trim()) sections.push(`[${label}]\n${value}`);
	};
	addSection('PAGE TITLE', publication.title);
	addSection('PAGE SUMMARY', publication.summary);
	addSection('PAGE DESCRIPTION', toStringOrNull(document.description));
	const citations = getPublicPageCitations(document.props);
	if (citations.length > 0) {
		addSection(
			'SOURCES',
			citations
				.map(
					(citation, index) =>
						`${index + 1}. ${[citation.label, citation.title, citation.url]
							.filter((part): part is string => Boolean(part))
							.join(' | ')}`
				)
				.join('\n')
		);
	}
	addSection('PAGE CONTENT', getPublicPageDocumentContent(document));
	return sections.join('\n\n');
}

/** Hash of the reviewed text, stored on the attempt so reuse is exact. */
export function computePublicPageReviewFingerprint(
	document: Pick<DocumentLike, 'description' | 'content' | 'props'>,
	publication: PublicPagePublicationText
): string {
	return createHash('sha256')
		.update(PUBLIC_PAGE_CONTENT_POLICY_VERSION)
		.update('\n')
		.update(buildPublicPageReviewText(document, publication))
		.digest('hex');
}

function hashReviewChunk(chunkText: string): string {
	return createHash('sha256')
		.update(PUBLIC_PAGE_CONTENT_POLICY_VERSION)
		.update('\n')
		.update(chunkText)
		.digest('hex');
}

/** Chunk hashes a prior current-policy review of this document already passed. */
function readPassedChunkHashes(
	previousReview: PublicPageReviewAttempt | null | undefined,
	documentId: string
): Set<string> {
	if (
		!previousReview ||
		previousReview.document_id !== documentId ||
		previousReview.policy_version !== PUBLIC_PAGE_CONTENT_POLICY_VERSION
	) {
		return new Set();
	}
	const coverage = previousReview.review_metadata?.llm_review;
	const hashes =
		coverage && typeof coverage === 'object' && !Array.isArray(coverage)
			? (coverage as Record<string, unknown>).passed_chunk_hashes
			: null;
	return new Set(
		Array.isArray(hashes)
			? hashes.filter(
					(hash): hash is string => typeof hash === 'string' && hash.length === 64
				)
			: []
	);
}

function lastWhitespaceIndex(value: string): number {
	for (let index = value.length - 1; index >= 0; index--) {
		const code = value.charCodeAt(index);
		if (code === 32 || code === 9 || code === 10 || code === 13) return index;
	}
	return -1;
}

/**
 * Splits review text into chunks of at most `chunkChars`, preferring paragraph,
 * line, then word breaks in the last 15% of each window.
 */
export function splitTextForLlmReview(
	text: string,
	chunkChars: number = LLM_REVIEW_CHUNK_CHARS
): string[] {
	const chunks: string[] = [];
	let start = 0;
	while (start < text.length) {
		let end = Math.min(start + chunkChars, text.length);
		if (end < text.length) {
			const searchFrom = start + Math.floor(chunkChars * LLM_CHUNK_MIN_FILL);
			const window = text.slice(searchFrom, end);
			const paragraphBreak = window.lastIndexOf('\n\n');
			const lineBreak = window.lastIndexOf('\n');
			const wordBreak = lastWhitespaceIndex(window);
			if (paragraphBreak >= 0) end = searchFrom + paragraphBreak + 2;
			else if (lineBreak >= 0) end = searchFrom + lineBreak + 1;
			else if (wordBreak >= 0) end = searchFrom + wordBreak + 1;
			else {
				// Hard cut: never split a surrogate pair.
				const code = text.charCodeAt(end - 1);
				if (code >= 0xd800 && code <= 0xdbff) end -= 1;
			}
		}
		chunks.push(text.slice(start, end));
		start = end;
	}
	return chunks;
}

function parseLlmFindings(value: unknown): PublicPageReviewFinding[] {
	if (!Array.isArray(value)) return [];
	const parsed: PublicPageReviewFinding[] = [];
	for (const item of value) {
		if (!item || typeof item !== 'object') continue;
		const record = item as Record<string, unknown>;
		const categoryRaw = toStringOrNull(record.category) ?? 'other';
		const category: PublicPageReviewCategory =
			categoryRaw === 'credentials' ||
			categoryRaw === 'personal_data' ||
			categoryRaw === 'self_harm_or_violence' ||
			categoryRaw === 'sexual_content' ||
			categoryRaw === 'hate_or_harassment' ||
			categoryRaw === 'illegal_activity'
				? categoryRaw
				: 'other';
		const severityRaw = toStringOrNull(record.severity) ?? 'medium';
		const severity: PublicPageReviewSeverity =
			severityRaw === 'low' || severityRaw === 'high' ? severityRaw : 'medium';
		const sourceRaw = toStringOrNull(record.source) ?? 'text';
		const source: PublicPageReviewFindingSource = sourceRaw === 'image' ? 'image' : 'text';
		const message = toStringOrNull(record.message);
		const recommendation = toStringOrNull(record.recommendation);
		if (!message || !recommendation) continue;
		parsed.push({
			code: `llm_${toStringOrNull(record.code) ?? 'policy'}`,
			category,
			severity,
			source,
			message,
			recommendation,
			excerpt: toStringOrNull(record.excerpt),
			asset_id: toStringOrNull(record.asset_id),
			asset_label: toStringOrNull(record.asset_label)
		});
	}
	return parsed;
}

const LLM_REVIEW_SYSTEM_PROMPT = `You are BuildOS public page policy reviewer.

Policy:
1) Reject secrets or credentials (API keys, private keys, auth tokens).
2) Reject direct personal sensitive data (SSN, card numbers, private identifiers).
3) Reject instructions for self-harm, weapons, explosives, or other physical harm.
4) Reject sexual content involving minors.
5) Reject explicit illegal activity instructions.
6) Reject explicit hate or harassment targeting protected groups.

Input notes:
- A long page is split into parts and you see one part at a time. Judge only "text". Use "preceding_context" (the end of the previous part) only to understand how this part begins.
- Sections are labeled [PAGE TITLE], [PAGE SUMMARY], [PAGE DESCRIPTION], [SOURCES], [PAGE CONTENT], and [IMAGE id=...]. An image section describes an inline image through its filename, alt text, caption, and extracted text. For a problem inside an image section, set "source" to "image" and "asset_id" to that image's id.
- Placeholders such as [redacted-credential], [redacted-private-key], [redacted-ssn], and [redacted-card-number] mark values a fixed-format detector already removed and flagged. Do not flag a placeholder itself; review everything around it.

Return strict JSON with this shape:
{
  "status": "passed" | "flagged",
  "summary": "short summary",
  "reasons": ["reason 1", "reason 2"],
  "findings": [
    {
      "code": "short_code",
      "category": "credentials|personal_data|self_harm_or_violence|sexual_content|hate_or_harassment|illegal_activity|other",
      "severity": "low|medium|high",
      "source": "text|image",
      "message": "what is wrong",
      "recommendation": "what to change",
      "excerpt": "short excerpt",
      "asset_id": "optional image id",
      "asset_label": "optional image label"
    }
  ]
}

Be conservative about safety, but do not flag benign factual discussion unless it is instructional, targeted abuse, or clearly disallowed content.`;

async function runLlmReviewChunk(
	service: SmartLLMService,
	args: {
		document: DocumentLike;
		pageTitle: string;
		chunkText: string;
		precedingContext: string | null;
		partIndex: number;
		partCount: number;
		seedFindings: Array<Record<string, unknown>>;
		actorUserId?: string | null;
	}
): Promise<LlmReviewResult | null> {
	try {
		const userPrompt = JSON.stringify(
			{
				page: { id: args.document.id, title: args.pageTitle },
				part: { index: args.partIndex, count: args.partCount },
				...(args.precedingContext ? { preceding_context: args.precedingContext } : {}),
				text: args.chunkText,
				heuristic_findings: args.seedFindings
			},
			null,
			2
		);

		const response = (await service.getJSONResponse({
			systemPrompt: LLM_REVIEW_SYSTEM_PROMPT,
			userPrompt,
			userId: args.actorUserId ?? 'public-page-review',
			profile: 'balanced',
			temperature: 0,
			validation: {
				retryOnParseError: true,
				maxRetries: 1
			},
			operationType: 'public_page_content_review',
			projectId: args.document.project_id
		})) as Record<string, unknown>;

		// An empty or malformed verdict is a failed review, never an implicit pass.
		const rawStatus = toStringOrNull(response?.status)?.toLowerCase();
		if (rawStatus !== 'passed' && rawStatus !== 'flagged') {
			console.error('[PublicPageReview] LLM review returned no usable status', {
				documentId: args.document.id,
				part: args.partIndex,
				status: rawStatus ?? null
			});
			return null;
		}
		const reasons = dedupeReasons(
			Array.isArray(response?.reasons)
				? response.reasons
						.map((entry) => toStringOrNull(entry))
						.filter((entry): entry is string => Boolean(entry))
				: []
		);

		return {
			status: rawStatus,
			summary: toStringOrNull(response?.summary),
			findings: parseLlmFindings(response?.findings),
			reasons
		};
	} catch (error) {
		console.error('[PublicPageReview] LLM review failed', {
			documentId: args.document.id,
			part: args.partIndex,
			error: error instanceof Error ? error.message : String(error)
		});
		return null;
	}
}

function normalizeFindingsJson(value: unknown): PublicPageReviewFinding[] {
	if (!Array.isArray(value)) return [];
	const findings: PublicPageReviewFinding[] = [];
	for (const item of value) {
		if (!item || typeof item !== 'object') continue;
		const row = item as Record<string, unknown>;
		const category = toStringOrNull(row.category);
		const severity = toStringOrNull(row.severity);
		const source = toStringOrNull(row.source);
		const message = toStringOrNull(row.message);
		const recommendation = toStringOrNull(row.recommendation);
		if (!category || !severity || !source || !message || !recommendation) continue;
		findings.push({
			code: toStringOrNull(row.code) ?? 'policy',
			category:
				category === 'credentials' ||
				category === 'personal_data' ||
				category === 'self_harm_or_violence' ||
				category === 'sexual_content' ||
				category === 'hate_or_harassment' ||
				category === 'illegal_activity'
					? category
					: 'other',
			severity: severity === 'low' || severity === 'high' ? severity : 'medium',
			source: source === 'image' ? 'image' : 'text',
			message,
			recommendation,
			excerpt: toStringOrNull(row.excerpt),
			asset_id: toStringOrNull(row.asset_id),
			asset_label: toStringOrNull(row.asset_label)
		});
	}
	return findings;
}

function toReviewAttempt(row: Record<string, unknown>): PublicPageReviewAttempt {
	const reasons =
		Array.isArray(row.reasons) || typeof row.reasons === 'object'
			? dedupeReasons(
					Array.isArray(row.reasons)
						? (row.reasons as unknown[])
								.map((entry) => toStringOrNull(entry))
								.filter((entry): entry is string => Boolean(entry))
						: []
				)
			: [];
	const metadata =
		row.review_metadata &&
		typeof row.review_metadata === 'object' &&
		!Array.isArray(row.review_metadata)
			? (row.review_metadata as Record<string, unknown>)
			: {};

	return {
		id: String(row.id),
		project_id: String(row.project_id),
		document_id: String(row.document_id),
		public_page_id: toStringOrNull(row.public_page_id),
		source:
			row.source === 'live_sync' || row.source === 'manual_retry'
				? row.source
				: 'publish_confirm',
		// An unknown status is never a pass.
		status: row.status === 'passed' || row.status === 'flagged' ? row.status : 'error',
		policy_version: toStringOrNull(row.policy_version) ?? 'unknown',
		summary: toStringOrNull(row.summary),
		reasons,
		text_findings: normalizeFindingsJson(row.text_findings),
		image_findings: normalizeFindingsJson(row.image_findings),
		created_by: String(row.created_by),
		created_at: String(row.created_at),
		review_metadata: metadata,
		admin_decision:
			row.admin_decision === 'approved' || row.admin_decision === 'rejected'
				? row.admin_decision
				: null,
		admin_decision_reason: toStringOrNull(row.admin_decision_reason),
		admin_decision_by: toStringOrNull(row.admin_decision_by),
		admin_decision_at: toStringOrNull(row.admin_decision_at)
	};
}

function getDocumentUpdatedAt(document: DocumentLike): string | null {
	return toStringOrNull(document.updated_at);
}

/**
 * True only when every LLM review call for the attempt returned a verdict.
 * Rows where the LLM failed, or never ran, are not evidence of a review.
 */
export function didPublicPageReviewLlmComplete(
	review: Pick<PublicPageReviewAttempt, 'review_metadata'>
): boolean {
	const metadata = review.review_metadata ?? {};
	return (
		readMetadataString(metadata, 'provider') === LLM_REVIEW_PROVIDER &&
		metadata.llm_review_failed !== true &&
		metadata.llm_review_completed !== false
	);
}

/**
 * Why an admin cannot approve this flagged review, or null when approval would
 * let the page publish. Approval only counts on current-policy rows where the
 * LLM review actually completed.
 */
export function getPublicPageReviewApprovalBlocker(
	review: Pick<PublicPageReviewAttempt, 'status' | 'policy_version' | 'review_metadata'>
): string | null {
	if (review.status !== 'flagged') return 'Only flagged reviews need an admin decision.';
	if (review.policy_version !== PUBLIC_PAGE_CONTENT_POLICY_VERSION) {
		return 'This review used an older policy. The next publish attempt re-reviews the page.';
	}
	if (!didPublicPageReviewLlmComplete(review)) {
		return 'The AI review did not finish for this attempt, so approving it would publish unreviewed content. The next publish attempt re-runs the review.';
	}
	return null;
}

export function isPublicPageReviewApprovedForPublish(
	review: Pick<
		PublicPageReviewAttempt,
		'status' | 'policy_version' | 'review_metadata' | 'admin_decision'
	>
): boolean {
	return (
		review.status === 'flagged' &&
		review.admin_decision === 'approved' &&
		getPublicPageReviewApprovalBlocker(review) === null
	);
}

export function isPublicPageReviewReusableForDocument(
	review: PublicPageReviewAttempt,
	document: DocumentLike,
	publication: PublicPagePublicationText
): boolean {
	if (review.policy_version !== PUBLIC_PAGE_CONTENT_POLICY_VERSION) return false;
	// A review that could not run is never a verdict; always review again.
	if (review.status === 'error') return false;
	// Passes and admin approvals only count when the LLM review completed.
	if (!didPublicPageReviewLlmComplete(review)) return false;
	const reviewDocumentUpdatedAt = readMetadataString(
		review.review_metadata,
		'document_updated_at'
	);
	const documentUpdatedAt = getDocumentUpdatedAt(document);
	if (!reviewDocumentUpdatedAt || !documentUpdatedAt) return false;
	if (reviewDocumentUpdatedAt !== documentUpdatedAt) return false;
	// The exact text being published (including a new title or summary) must
	// be the text that was reviewed.
	const reviewFingerprint = readMetadataString(review.review_metadata, 'input_fingerprint');
	return (
		reviewFingerprint !== null &&
		reviewFingerprint === computePublicPageReviewFingerprint(document, publication)
	);
}

async function fetchInlineAssetsForDocument(
	supabase: SupabaseLike,
	document: DocumentLike,
	content: string
): Promise<AssetLike[]> {
	const idsFromMarkdown = extractInlineAssetIds(content);
	const { data: linkRows, error: linksError } = await (supabase as any)
		.from('onto_asset_links')
		.select('asset_id')
		.eq('project_id', document.project_id)
		.eq('entity_kind', 'document')
		.eq('entity_id', document.id)
		.eq('role', 'inline');

	if (linksError) {
		throw linksError;
	}

	const linkedIds = Array.isArray(linkRows)
		? linkRows
				.map((row) => toStringOrNull((row as Record<string, unknown>).asset_id))
				.filter((id): id is string => Boolean(id))
		: [];

	const allIds = Array.from(new Set([...idsFromMarkdown, ...linkedIds]));
	if (allIds.length === 0) return [];

	const { data: assets, error: assetsError } = await (supabase as any)
		.from('onto_assets')
		.select(
			'id, content_type, original_filename, alt_text, caption, extracted_text, extraction_summary, ocr_status'
		)
		.eq('project_id', document.project_id)
		.is('deleted_at', null)
		.in('id', allIds);

	if (assetsError) {
		throw assetsError;
	}

	return Array.isArray(assets) ? (assets as AssetLike[]) : [];
}

export async function runPublicPageContentReview(
	options: ReviewOptions
): Promise<PublicPageReviewAttempt> {
	const {
		supabase,
		adminSupabase,
		document,
		publication,
		actorId,
		actorUserId,
		source,
		publicPageId = null,
		previousReview = null
	} = options;
	const content = getPublicPageDocumentContent(document);
	const assets = await fetchInlineAssetsForDocument(supabase, document, content);
	const reviewText = buildPublicPageReviewText(document, publication);

	const textFindings = scanTextForFindings(reviewText, 'text', null);
	const imageFindings = assets.flatMap((asset) =>
		scanTextForFindings(normalizeImageTextForScan(asset), 'image', asset)
	);
	// One finding per detector match; excerpts are redacted, so adjacent matches
	// can look identical and must not be collapsed.
	const baseFindings = [...textFindings, ...imageFindings];

	// The LLM always reviews the page, but only with fixed-format matches
	// (credentials, SSNs, card numbers) redacted, so a detector hit never sends
	// the secret itself and never skips the review of everything around it.
	const imageSections = assets
		.map((asset) => buildImageReviewSection(asset))
		.filter((section): section is string => Boolean(section));
	const unredactedLlmText = [reviewText, ...imageSections].join('\n\n');
	const llmText = redactFixedFormatMatches(unredactedLlmText);
	const chunks = splitTextForLlmReview(llmText.length > 0 ? llmText : ' ');
	const reviewedChunks: string[] = [];
	let reviewedChars = 0;
	for (const chunk of chunks) {
		if (reviewedChars + chunk.length > MAX_LLM_REVIEW_CHARS) break;
		reviewedChunks.push(chunk);
		reviewedChars += chunk.length;
	}
	const truncated = reviewedChunks.length < chunks.length;

	const seedFindings = baseFindings.slice(0, 15).map((finding) => ({
		category: finding.category,
		source: finding.source,
		message: finding.message,
		excerpt: finding.excerpt
	}));
	const service = new SmartLLMService({
		supabase,
		httpReferer: 'https://build-os.com',
		appName: 'BuildOS Public Page Review'
	});
	const chunkHashes = reviewedChunks.map((chunkText) => hashReviewChunk(chunkText));
	const previouslyPassedHashes = readPassedChunkHashes(previousReview, document.id);
	let reusedChunks = 0;
	const chunkResults = await Promise.all(
		reviewedChunks.map((chunkText, index): Promise<LlmReviewResult | null> => {
			// The LLM already passed this exact text under the current policy.
			const chunkHash = chunkHashes[index];
			if (chunkHash && previouslyPassedHashes.has(chunkHash)) {
				reusedChunks += 1;
				return Promise.resolve({
					status: 'passed',
					summary: null,
					findings: [],
					reasons: []
				});
			}
			return runLlmReviewChunk(service, {
				document,
				pageTitle: redactFixedFormatMatches(publication.title),
				chunkText,
				precedingContext:
					index > 0
						? (reviewedChunks[index - 1]?.slice(-LLM_CHUNK_CONTEXT_CHARS) ?? null)
						: null,
				partIndex: index + 1,
				partCount: reviewedChunks.length,
				seedFindings,
				actorUserId
			});
		})
	);

	const failedChunks = chunkResults.filter((result) => result === null).length;
	const flaggedChunkResults = chunkResults.filter(
		(result): result is LlmReviewResult => result?.status === 'flagged'
	);
	const llmReviewCompleted = failedChunks === 0;

	// Content past the automatic review cap never passes silently: an admin
	// has to read the rest before it can publish.
	const coverageFindings: PublicPageReviewFinding[] = truncated
		? [
				{
					code: PUBLIC_PAGE_REVIEW_TOO_LONG_CODE,
					category: 'other',
					severity: 'medium',
					source: 'text',
					message: `This page is longer than automatic review covers (the AI reviewed the first ${reviewedChars.toLocaleString('en-US')} of ${llmText.length.toLocaleString('en-US')} characters), so an admin must review the rest before it can publish.`,
					recommendation:
						'Split the page into shorter pages, or ask an admin to review and approve it.',
					excerpt: null,
					asset_id: null,
					asset_label: null
				}
			]
		: [];

	const mergedFindings = [
		...baseFindings,
		...coverageFindings,
		...dedupeFindings(flaggedChunkResults.flatMap((result) => result.findings))
	];
	const reviewReasons = dedupeReasons([
		...buildReasons(mergedFindings),
		...flaggedChunkResults.flatMap((result) => result.reasons)
	]);
	// Any finding or flagged part blocks publication. Otherwise only a fully
	// completed LLM review can pass a page; a failed part fails closed as a
	// retryable error.
	const status: PublicPageReviewStatus =
		mergedFindings.length > 0 || flaggedChunkResults.length > 0
			? 'flagged'
			: llmReviewCompleted
				? 'passed'
				: 'error';
	const flaggedLlmSummary = flaggedChunkResults.find((result) => result.summary)?.summary;
	if (status === 'flagged' && reviewReasons.length === 0) {
		reviewReasons.push(
			flaggedLlmSummary ?? 'Content was flagged by public page policy checks.'
		);
	}
	const summary =
		status === 'error'
			? PUBLIC_PAGE_REVIEW_UNAVAILABLE_MESSAGE
			: status === 'passed'
				? (chunkResults.find((result) => result?.summary)?.summary ??
					toReviewSummary(status, reviewReasons))
				: baseFindings.length === 0 && coverageFindings.length === 0 && flaggedLlmSummary
					? flaggedLlmSummary
					: toReviewSummary(status, reviewReasons);
	const textOnlyFindings = mergedFindings.filter((finding) => finding.source === 'text');
	const imageOnlyFindings = mergedFindings.filter((finding) => finding.source === 'image');

	const reviewMetadata = {
		provider: llmReviewCompleted ? LLM_REVIEW_PROVIDER : 'rule_engine',
		llm_review_completed: llmReviewCompleted,
		llm_review_failed: !llmReviewCompleted,
		llm_review_skipped_reason: null,
		llm_input_redacted: llmText !== unredactedLlmText,
		llm_review: {
			chunk_chars: LLM_REVIEW_CHUNK_CHARS,
			max_reviewed_chars: MAX_LLM_REVIEW_CHARS,
			chunk_count: chunks.length,
			chunks_reviewed: reviewedChunks.length,
			chunks_failed: failedChunks,
			chunks_flagged: flaggedChunkResults.length,
			chunks_reused: reusedChunks,
			passed_chunk_hashes: chunkHashes.filter(
				(_hash, index) => chunkResults[index]?.status === 'passed'
			),
			reviewed_chars: reviewedChars,
			total_chars: llmText.length,
			truncated
		},
		input_fingerprint: computePublicPageReviewFingerprint(document, publication),
		document_updated_at: getDocumentUpdatedAt(document),
		scanned: {
			content_char_count: content.length,
			review_text_char_count: reviewText.length,
			image_count: assets.length
		},
		image_scan: {
			with_text: assets.filter((asset) => normalizeImageTextForScan(asset).length > 0).length,
			without_text: assets.filter((asset) => normalizeImageTextForScan(asset).length === 0)
				.length
		}
	};

	const { data, error } = await (adminSupabase as any)
		.from(REVIEW_ATTEMPTS_TABLE)
		.insert({
			project_id: document.project_id,
			document_id: document.id,
			public_page_id: publicPageId,
			source,
			status,
			policy_version: PUBLIC_PAGE_CONTENT_POLICY_VERSION,
			summary,
			reasons: reviewReasons,
			text_findings: textOnlyFindings,
			image_findings: imageOnlyFindings,
			review_metadata: reviewMetadata,
			created_by: actorId
		})
		.select('*')
		.single();

	if (error || !data) {
		throw error ?? new Error('Failed to persist content review attempt');
	}

	return toReviewAttempt(data as Record<string, unknown>);
}

export async function getLatestPublicPageReviewForDocument(
	supabase: SupabaseLike,
	documentId: string
): Promise<PublicPageReviewAttempt | null> {
	const { data, error } = await (supabase as any)
		.from(REVIEW_ATTEMPTS_TABLE)
		.select('*')
		.eq('document_id', documentId)
		.order('created_at', { ascending: false })
		.limit(1)
		.maybeSingle();

	if (error || !data) return null;
	return toReviewAttempt(data as Record<string, unknown>);
}

export async function setPublicPageReviewAdminDecision(
	options: SetAdminDecisionOptions
): Promise<PublicPageReviewAttempt> {
	const { adminSupabase, reviewId, actorId, decision, reason } = options;
	const { data: existing, error: readError } = await (adminSupabase as any)
		.from(REVIEW_ATTEMPTS_TABLE)
		.select('*')
		.eq('id', reviewId)
		.maybeSingle();
	if (readError) {
		throw readError;
	}
	if (!existing) {
		throw new PublicPageReviewDecisionError('Review attempt not found.');
	}
	const review = toReviewAttempt(existing as Record<string, unknown>);
	if (review.status !== 'flagged') {
		throw new PublicPageReviewDecisionError(
			'Only flagged reviews can receive an admin decision.'
		);
	}
	if (decision === 'approved') {
		const blocker = getPublicPageReviewApprovalBlocker(review);
		if (blocker) throw new PublicPageReviewDecisionError(blocker);
	}

	const { data, error } = await (adminSupabase as any)
		.from(REVIEW_ATTEMPTS_TABLE)
		.update({
			admin_decision: decision,
			admin_decision_reason: toStringOrNull(reason),
			admin_decision_by: actorId,
			admin_decision_at: new Date().toISOString()
		})
		.eq('id', reviewId)
		.eq('status', 'flagged')
		.select('*')
		.maybeSingle();

	if (error) {
		throw error;
	}
	if (!data) {
		throw new PublicPageReviewDecisionError(
			'Review attempt not found or not eligible for admin decision.'
		);
	}

	return toReviewAttempt(data as Record<string, unknown>);
}
