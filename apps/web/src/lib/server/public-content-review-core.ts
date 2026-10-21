// apps/web/src/lib/server/public-content-review-core.ts
import { createHash } from 'node:crypto';
import type { SmartLLMService } from '$lib/services/smart-llm-service';
import type {
	PublicPageReviewCategory,
	PublicPageReviewSeverity,
	PublicPageReviewFindingSource,
	PublicPageReviewFinding
} from './public-page-content-review.service';

export type AssetLike = {
	id: string;
	content_type: string | null;
	original_filename: string | null;
	alt_text: string | null;
	caption: string | null;
	extracted_text: string | null;
	extraction_summary: string | null;
	ocr_status: string | null;
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
// Document review (PUBLIC_PAGE_CONTENT_POLICY_VERSION public_page_policy_v3) uses
// this detector byte for byte. Changing it changes which documents pass, so it
// needs a policy version bump (and the paid re-reviews that triggers).
const DOCUMENT_CARD_CANDIDATE_REGEX = /(?:\b\d[ -]*?){13,19}\b/g;
// Chat shares: the lookahead checks overlapping structured number groups (e.g. a
// card after an SSN) and plain 13–19 digit runs.
const OVERLAPPING_CARD_CANDIDATE_REGEX = /(?=(\b(?:\d[ -]*?){13,19}\b))/g;

/** Which card-number detector a caller's policy uses. Documents keep the default. */
export type FixedFormatDetectorOptions = { cardDetector?: 'document' | 'overlapping' };

function cardCandidateRegex(options: FixedFormatDetectorOptions | undefined): RegExp {
	return new RegExp(
		options?.cardDetector === 'overlapping'
			? OVERLAPPING_CARD_CANDIDATE_REGEX
			: DOCUMENT_CARD_CANDIDATE_REGEX
	);
}
const EXCERPT_LONG_TOKEN_REGEX = /[A-Za-z0-9+/=_-]{32,}/g;

/** Characters per LLM review call. */
export const LLM_REVIEW_CHUNK_CHARS = 12_000;
/**
 * Pages up to this many characters (page text plus image text) get a full
 * automatic review, split across at most three LLM calls. Longer pages are
 * flagged for an admin instead of passing on a partial read.
 */
export const MAX_LLM_REVIEW_CHARS = 30_000;
const LLM_CHUNK_MIN_FILL = 0.85;
export const LLM_CHUNK_CONTEXT_CHARS = 300;

function globalRegex(pattern: RegExp): RegExp {
	const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
	return new RegExp(pattern.source, flags);
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
function findSensitiveRanges(text: string, options?: FixedFormatDetectorOptions): SensitiveRange[] {
	const ranges: SensitiveRange[] = [];
	const collect = (
		expression: RegExp,
		placeholder: string,
		accept?: (match: string) => boolean
	) => {
		for (const match of text.matchAll(expression)) {
			const matched = match[1] ?? match[0] ?? '';
			if (!matched || (accept && !accept(matched))) continue;
			const start = match.index ?? 0;
			ranges.push({ start, end: start + matched.length, placeholder });
		}
	};
	collect(new RegExp(PRIVATE_KEY_BLOCK_REGEX), '[redacted-private-key]');
	for (const rule of POLICY_RULES) {
		for (const pattern of rule.patterns) collect(globalRegex(pattern), rule.redaction);
	}
	collect(cardCandidateRegex(options), '[redacted-card-number]', isLikelyCreditCard);

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
export function redactFixedFormatMatches(
	value: string,
	options?: FixedFormatDetectorOptions
): string {
	return applyRedactions(value, findSensitiveRanges(value, options));
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
	asset: AssetLike | null,
	options?: FixedFormatDetectorOptions
): PublicPageReviewFinding[] {
	const findings: PublicPageReviewFinding[] = [];
	for (const match of text.matchAll(cardCandidateRegex(options))) {
		const candidate = match[1] ?? match[0] ?? '';
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

export function scanTextForFindings(
	text: string,
	source: PublicPageReviewFindingSource,
	asset: AssetLike | null,
	options?: FixedFormatDetectorOptions
): PublicPageReviewFinding[] {
	if (!text.trim()) return [];
	const ranges = findSensitiveRanges(text, options);
	return [
		...scanRegexRules(text, ranges, source, asset),
		...scanCreditCards(text, ranges, source, asset, options)
	];
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

function toStringOrNull(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	return value.trim() || null;
}
function normalizeWhitespace(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}

export function fingerprintReviewText(policyVersion: string, text: string): string {
	return createHash('sha256').update(policyVersion).update('\n').update(text).digest('hex');
}

/** Shared review profile; callers reject malformed or failed verdicts. */
export async function requestPublicTextReview(
	service: SmartLLMService,
	input: {
		systemPrompt: string;
		userPrompt: string;
		userId: string;
		operationType: string;
		projectId?: string;
		/** Caller-owned deadline/cancellation; omitted by the document path. */
		signal?: AbortSignal;
	}
): Promise<Record<string, unknown>> {
	return (await service.getJSONResponse({
		...input,
		profile: 'balanced',
		temperature: 0,
		validation: { retryOnParseError: true, maxRetries: 1 }
	})) as Record<string, unknown>;
}
