// apps/web/src/lib/server/public-page-content-review.service.ts
import { SmartLLMService } from '$lib/services/smart-llm-service';

type SupabaseLike = any;

export const PUBLIC_PAGE_CONTENT_POLICY_VERSION = 'public_page_policy_v1';

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
	supabase: SupabaseLike;
	document: DocumentLike;
	actorId: string;
	actorUserId?: string | null;
	source: PublicPageReviewSource;
	publicPageId?: string | null;
};

type SetAdminDecisionOptions = {
	supabase: SupabaseLike;
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
};

const INLINE_ASSET_RENDER_REGEX =
	/\/api\/onto\/assets\/([0-9a-fA-F-]{36})\/render(?:\?[^\s)\]]*)?/g;

const POLICY_RULES: RegexRule[] = [
	{
		code: 'secret_private_key',
		category: 'credentials',
		severity: 'high',
		message: 'Possible private key material detected.',
		recommendation: 'Remove credentials or secrets before publishing.',
		source: 'both',
		patterns: [/-----BEGIN(?: [A-Z0-9]+)? PRIVATE KEY-----/i]
	},
	{
		code: 'secret_openai_key',
		category: 'credentials',
		severity: 'high',
		message: 'Possible API key detected.',
		recommendation: 'Remove keys and rotate any exposed credentials.',
		source: 'both',
		patterns: [/\bsk-[a-zA-Z0-9]{20,}\b/i, /\bxox[baprs]-[a-zA-Z0-9-]{16,}\b/i]
	},
	{
		code: 'pii_ssn',
		category: 'personal_data',
		severity: 'high',
		message: 'Possible Social Security Number detected.',
		recommendation: 'Remove sensitive personal identifiers before publishing.',
		source: 'both',
		patterns: [/\b\d{3}-\d{2}-\d{4}\b/]
	},
	{
		code: 'harm_instruction',
		category: 'self_harm_or_violence',
		severity: 'high',
		message: 'Possible self-harm or violence instructions detected.',
		recommendation: 'Remove instructional harmful content before publishing.',
		source: 'both',
		patterns: [
			/\b(how to|guide to|steps to)\b[\s\S]{0,60}\b(make|build)\b[\s\S]{0,60}\b(bomb|explosive|weapon)\b/i,
			/\b(how to|ways to|best way to)\b[\s\S]{0,60}\b(kill myself|commit suicide|self[- ]harm)\b/i
		]
	},
	{
		code: 'sexual_minors',
		category: 'sexual_content',
		severity: 'high',
		message: 'Possible sexual content involving minors detected.',
		recommendation: 'Remove prohibited sexual content before publishing.',
		source: 'both',
		patterns: [
			/\b(child|minor|underage)\b[\s\S]{0,40}\b(nude|porn|sex|explicit)\b/i,
			/\b(nude|porn|sex|explicit)\b[\s\S]{0,40}\b(child|minor|underage)\b/i
		]
	},
	{
		code: 'illegal_instruction',
		category: 'illegal_activity',
		severity: 'high',
		message: 'Possible illegal activity instructions detected.',
		recommendation: 'Remove illegal instructional guidance before publishing.',
		source: 'both',
		patterns: [
			/\b(how to|guide to|steps to)\b[\s\S]{0,50}\b(buy|sell|traffic|smuggle|counterfeit)\b[\s\S]{0,40}\b(drugs|ids?|passports?|documents?)\b/i
		]
	},
	{
		code: 'hate_harassment',
		category: 'hate_or_harassment',
		severity: 'medium',
		message: 'Possible hate or harassment language detected.',
		recommendation: 'Remove abusive or hateful language before publishing.',
		source: 'both',
		patterns: [
			/\b(kill all|exterminate|eradicate)\b[\s\S]{0,30}\b(immigrants|muslims|jews|blacks|gays|lesbians|trans people|women)\b/i
		]
	}
];

const MAX_CONTENT_CHARS_FOR_LLM = 12000;
const MAX_IMAGES_FOR_LLM = 12;
const MAX_IMAGE_TEXT_CHARS = 1500;

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

function getDocumentContent(document: DocumentLike): string {
	if (typeof document.content === 'string') return document.content;
	const markdown = document.props?.body_markdown;
	return typeof markdown === 'string' ? markdown : '';
}

function normalizeWhitespace(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
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

function excerptAround(value: string, startIndex: number, matchLength: number): string {
	const safeStart = Math.max(0, startIndex - 60);
	const safeEnd = Math.min(value.length, startIndex + matchLength + 80);
	return normalizeWhitespace(value.slice(safeStart, safeEnd)).slice(0, 220);
}

function toAssetLabel(asset: AssetLike): string | null {
	return (
		toStringOrNull(asset.original_filename) ??
		toStringOrNull(asset.alt_text) ??
		toStringOrNull(asset.caption)
	);
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

function scanRegexRules(
	text: string,
	source: PublicPageReviewFindingSource,
	asset: AssetLike | null
): PublicPageReviewFinding[] {
	const findings: PublicPageReviewFinding[] = [];
	for (const rule of POLICY_RULES) {
		if (rule.source !== 'both' && rule.source !== source) continue;
		for (const pattern of rule.patterns) {
			const flags = pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`;
			const expression = new RegExp(pattern.source, flags);
			for (const match of text.matchAll(expression)) {
				const matchText = match[0] ?? '';
				const index = match.index ?? 0;
				findings.push({
					code: rule.code,
					category: rule.category,
					severity: rule.severity,
					source,
					message: rule.message,
					recommendation: rule.recommendation,
					excerpt: excerptAround(text, index, matchText.length),
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
	source: PublicPageReviewFindingSource,
	asset: AssetLike | null
): PublicPageReviewFinding[] {
	const findings: PublicPageReviewFinding[] = [];
	const pattern = /(?:\b\d[ -]*?){13,19}\b/g;
	for (const match of text.matchAll(pattern)) {
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
			excerpt: excerptAround(text, index, candidate.length),
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
	return [...scanRegexRules(text, source, asset), ...scanCreditCards(text, source, asset)];
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

function clampForLlm(value: string, limit: number): string {
	if (value.length <= limit) return value;
	return `${value.slice(0, Math.max(0, limit - 3))}...`;
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

async function runLlmReview(
	supabase: SupabaseLike,
	document: DocumentLike,
	assets: AssetLike[],
	initialFindings: PublicPageReviewFinding[],
	actorUserId?: string | null
): Promise<LlmReviewResult | null> {
	try {
		const service = new SmartLLMService({
			supabase,
			httpReferer: 'https://build-os.com',
			appName: 'BuildOS Public Page Review'
		});
		const content = getDocumentContent(document);
		const imageInputs = assets.slice(0, MAX_IMAGES_FOR_LLM).map((asset) => ({
			id: asset.id,
			filename: toStringOrNull(asset.original_filename),
			content_type: toStringOrNull(asset.content_type),
			ocr_status: toStringOrNull(asset.ocr_status),
			alt_text: toStringOrNull(asset.alt_text),
			caption: toStringOrNull(asset.caption),
			extraction_summary: toStringOrNull(asset.extraction_summary),
			extracted_text: clampForLlm(
				toStringOrNull(asset.extracted_text) ?? '',
				MAX_IMAGE_TEXT_CHARS
			)
		}));
		const seedFindings = initialFindings.slice(0, 15).map((finding) => ({
			category: finding.category,
			source: finding.source,
			message: finding.message,
			excerpt: finding.excerpt
		}));

		const systemPrompt = `You are BuildOS public page policy reviewer.

Policy:
1) Reject secrets or credentials (API keys, private keys, auth tokens).
2) Reject direct personal sensitive data (SSN, card numbers, private identifiers).
3) Reject instructions for self-harm, weapons, explosives, or other physical harm.
4) Reject sexual content involving minors.
5) Reject explicit illegal activity instructions.
6) Reject explicit hate or harassment targeting protected groups.

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

		const userPrompt = JSON.stringify(
			{
				document: {
					id: document.id,
					title: document.title,
					description: document.description,
					content: clampForLlm(content, MAX_CONTENT_CHARS_FOR_LLM)
				},
				images: imageInputs,
				heuristic_findings: seedFindings
			},
			null,
			2
		);

		const response = (await service.getJSONResponse({
			systemPrompt,
			userPrompt,
			userId: actorUserId ?? 'public-page-review',
			profile: 'balanced',
			temperature: 0,
			validation: {
				retryOnParseError: true,
				maxRetries: 1
			},
			operationType: 'public_page_content_review',
			projectId: document.project_id
		})) as Record<string, unknown>;

		const rawStatus = toStringOrNull(response?.status);
		const status: 'passed' | 'flagged' = rawStatus === 'flagged' ? 'flagged' : 'passed';
		const summary = toStringOrNull(response?.summary);
		const findings = parseLlmFindings(response?.findings);
		const reasons = dedupeReasons(
			Array.isArray(response?.reasons)
				? response.reasons
						.map((entry) => toStringOrNull(entry))
						.filter((entry): entry is string => Boolean(entry))
				: []
		);

		return {
			status,
			summary,
			findings,
			reasons
		};
	} catch {
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
		status: row.status === 'flagged' || row.status === 'error' ? row.status : 'passed',
		policy_version: toStringOrNull(row.policy_version) ?? PUBLIC_PAGE_CONTENT_POLICY_VERSION,
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

export function isPublicPageReviewReusableForDocument(
	review: PublicPageReviewAttempt,
	document: DocumentLike
): boolean {
	if (review.policy_version !== PUBLIC_PAGE_CONTENT_POLICY_VERSION) return false;
	const reviewDocumentUpdatedAt = readMetadataString(
		review.review_metadata,
		'document_updated_at'
	);
	const documentUpdatedAt = getDocumentUpdatedAt(document);
	if (!reviewDocumentUpdatedAt || !documentUpdatedAt) return false;
	return reviewDocumentUpdatedAt === documentUpdatedAt;
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
	const { supabase, document, actorId, actorUserId, source, publicPageId = null } = options;
	const content = getDocumentContent(document);
	const assets = await fetchInlineAssetsForDocument(supabase, document, content);

	const textFindings = scanTextForFindings(content, 'text', null);
	const imageFindings = assets.flatMap((asset) =>
		scanTextForFindings(normalizeImageTextForScan(asset), 'image', asset)
	);

	const baseFindings = dedupeFindings([...textFindings, ...imageFindings]);
	const llmResult = await runLlmReview(supabase, document, assets, baseFindings, actorUserId);
	const mergedFindings = dedupeFindings([
		...baseFindings,
		...(llmResult?.status === 'flagged' ? llmResult.findings : [])
	]);

	const wasFlaggedByLlm = llmResult?.status === 'flagged';
	const reviewReasons = dedupeReasons([
		...buildReasons(mergedFindings),
		...(llmResult?.status === 'flagged' ? llmResult.reasons : [])
	]);
	const status: PublicPageReviewStatus =
		mergedFindings.length > 0 || wasFlaggedByLlm ? 'flagged' : 'passed';
	if (status === 'flagged' && reviewReasons.length === 0) {
		reviewReasons.push(
			llmResult?.summary ?? 'Content was flagged by public page policy checks.'
		);
	}
	const textOnlyFindings = mergedFindings.filter((finding) => finding.source === 'text');
	const imageOnlyFindings = mergedFindings.filter((finding) => finding.source === 'image');
	const summary = llmResult?.summary ?? toReviewSummary(status, reviewReasons);

	const reviewMetadata = {
		provider: llmResult ? 'rule_engine+smart_llm' : 'rule_engine',
		document_updated_at: getDocumentUpdatedAt(document),
		scanned: {
			content_char_count: content.length,
			image_count: assets.length
		},
		image_scan: {
			with_text: assets.filter((asset) => normalizeImageTextForScan(asset).length > 0).length,
			without_text: assets.filter((asset) => normalizeImageTextForScan(asset).length === 0)
				.length
		}
	};

	const { data, error } = await (supabase as any)
		.from('onto_public_page_review_attempts')
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
		.from('onto_public_page_review_attempts')
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
	const { supabase, reviewId, actorId, decision, reason } = options;
	const { data, error } = await (supabase as any)
		.from('onto_public_page_review_attempts')
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
		throw new Error('Review attempt not found or not eligible for admin decision');
	}

	return toReviewAttempt(data as Record<string, unknown>);
}
