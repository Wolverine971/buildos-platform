// apps/worker/src/workers/chat/libriSessionEntities.ts
// Sanitization helpers for Libri session-close entity extraction.

export type LibriExtractedEntityType = 'person' | 'book' | 'youtube_video' | 'youtube_channel';
export type LibriExtractedEntityRelevance = 'primary' | 'supporting' | 'incidental';
export type LibriExtractedEntityAction = 'resolve_or_enqueue' | 'search_only' | 'ignore';

export interface ExtractedLibriEntity {
	entity_type: LibriExtractedEntityType;
	display_name: string;
	canonical_query: string;
	url?: string;
	youtube_video_id?: string;
	authors?: string[];
	aliases?: string[];
	confidence: number;
	relevance: LibriExtractedEntityRelevance;
	recommended_action: LibriExtractedEntityAction;
	user_requested_research: boolean;
	extraction_reason: string;
	source_message_ids: string[];
	source_turn_indices: number[];
	evidence_snippets: string[];
}

export interface IgnoredEntityCandidate {
	display_name: string;
	reason: string;
	evidence_snippets?: string[];
}

export interface SessionExtractedEntities {
	libri_candidates: ExtractedLibriEntity[];
	ignored_candidates?: IgnoredEntityCandidate[];
	extraction_version: 'libri_session_synthesis_v1';
	extracted_at: string;
}

export interface SanitizeSessionExtractedEntitiesOptions {
	now?: () => Date;
	knownMessageIds?: Set<string>;
	maxTurnIndex?: number;
}

const EXTRACTION_VERSION = 'libri_session_synthesis_v1';
const MAX_CANDIDATES = 12;
const MAX_IGNORED_CANDIDATES = 12;
const MAX_EVIDENCE_SNIPPETS = 3;
const MAX_SOURCE_IDS = 8;
const MAX_SOURCE_TURNS = 8;
const MAX_AUTHORS = 6;
const MAX_ALIASES = 6;
const MIN_AUTO_HANDOFF_CONFIDENCE = 0.72;
const MIN_INCIDENTAL_AUTO_HANDOFF_CONFIDENCE = 0.9;

const SUPPORTED_ENTITY_TYPES = new Set<LibriExtractedEntityType>([
	'person',
	'book',
	'youtube_video',
	'youtube_channel'
]);

function isRecord(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function trimText(value: unknown, maxLength: number): string | undefined {
	if (typeof value !== 'string') return undefined;
	const normalized = value.replace(/\s+/g, ' ').trim();
	if (!normalized) return undefined;
	return normalized.length > maxLength ? normalized.slice(0, maxLength).trim() : normalized;
}

function normalizeStringArray(
	value: unknown,
	options: { maxItems: number; maxLength: number }
): string[] {
	if (!Array.isArray(value)) return [];
	const seen = new Set<string>();
	const strings: string[] = [];
	for (const entry of value) {
		const normalized = trimText(entry, options.maxLength);
		if (!normalized) continue;
		const key = normalized.toLowerCase();
		if (seen.has(key)) continue;
		seen.add(key);
		strings.push(normalized);
		if (strings.length >= options.maxItems) break;
	}
	return strings;
}

function normalizeMessageIds(value: unknown, knownMessageIds?: Set<string>): string[] {
	const ids = normalizeStringArray(value, { maxItems: MAX_SOURCE_IDS, maxLength: 80 });
	if (!knownMessageIds?.size) return ids;
	return ids.filter((id) => knownMessageIds.has(id));
}

function normalizeTurnIndices(value: unknown, maxTurnIndex?: number): number[] {
	if (!Array.isArray(value)) return [];
	const seen = new Set<number>();
	const indices: number[] = [];
	for (const entry of value) {
		const numeric =
			typeof entry === 'number'
				? entry
				: typeof entry === 'string'
					? Number.parseInt(entry, 10)
					: Number.NaN;
		if (!Number.isFinite(numeric)) continue;
		const normalized = Math.floor(numeric);
		if (normalized < 0) continue;
		if (typeof maxTurnIndex === 'number' && normalized > maxTurnIndex) continue;
		if (seen.has(normalized)) continue;
		seen.add(normalized);
		indices.push(normalized);
		if (indices.length >= MAX_SOURCE_TURNS) break;
	}
	return indices;
}

function clampConfidence(value: unknown): number {
	const numeric =
		typeof value === 'number'
			? value
			: typeof value === 'string'
				? Number.parseFloat(value)
				: Number.NaN;
	if (!Number.isFinite(numeric)) return 0;
	return Math.min(1, Math.max(0, numeric));
}

function normalizeRelevance(value: unknown): LibriExtractedEntityRelevance {
	if (value === 'primary' || value === 'supporting' || value === 'incidental') {
		return value;
	}
	return 'supporting';
}

function normalizeRecommendedAction(value: unknown): LibriExtractedEntityAction {
	if (value === 'resolve_or_enqueue' || value === 'search_only' || value === 'ignore') {
		return value;
	}
	return 'search_only';
}

function normalizeBoolean(value: unknown): boolean {
	return value === true;
}

function normalizeEntityType(value: unknown): LibriExtractedEntityType | null {
	const normalized = trimText(value, 40);
	if (!normalized) return null;
	return SUPPORTED_ENTITY_TYPES.has(normalized as LibriExtractedEntityType)
		? (normalized as LibriExtractedEntityType)
		: null;
}

function normalizeUrl(value: unknown): string | undefined {
	const text = trimText(value, 500);
	if (!text) return undefined;
	try {
		const url = new URL(text);
		if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
		url.hash = '';
		return url.toString();
	} catch {
		return text;
	}
}

function cleanYouTubeVideoId(value: unknown): string | undefined {
	const text = trimText(value, 80);
	if (!text) return undefined;
	const match = text.match(/[A-Za-z0-9_-]{6,}/);
	return match?.[0];
}

export function extractYouTubeVideoId(value: unknown): string | undefined {
	const text = trimText(value, 500);
	if (!text) return undefined;

	const direct = cleanYouTubeVideoId(text);
	if (direct && text === direct) return direct;

	try {
		const url = new URL(text);
		const host = url.hostname.replace(/^www\./, '').toLowerCase();
		if (host === 'youtu.be') {
			return cleanYouTubeVideoId(url.pathname.split('/').filter(Boolean)[0]);
		}
		const isYouTubeHost = host === 'youtube.com' || host.endsWith('.youtube.com');
		const isNoCookieHost =
			host === 'youtube-nocookie.com' || host.endsWith('.youtube-nocookie.com');
		if (!isYouTubeHost && !isNoCookieHost) return undefined;

		const watchId = cleanYouTubeVideoId(url.searchParams.get('v'));
		if (watchId) return watchId;

		const parts = url.pathname.split('/').filter(Boolean);
		const markerIndex = parts.findIndex((part) =>
			['embed', 'shorts', 'live', 'v'].includes(part.toLowerCase())
		);
		if (markerIndex >= 0) return cleanYouTubeVideoId(parts[markerIndex + 1]);
	} catch {
		return undefined;
	}

	return undefined;
}

function getField(record: Record<string, unknown>, snakeCase: string, camelCase?: string): unknown {
	return record[snakeCase] ?? (camelCase ? record[camelCase] : undefined);
}

function sanitizeCandidate(
	value: unknown,
	options: SanitizeSessionExtractedEntitiesOptions
): ExtractedLibriEntity | null {
	if (!isRecord(value)) return null;

	const entityType = normalizeEntityType(getField(value, 'entity_type', 'entityType'));
	const displayName = trimText(getField(value, 'display_name', 'displayName'), 160);
	const canonicalQuery = trimText(getField(value, 'canonical_query', 'canonicalQuery'), 220);

	if (!entityType || !displayName || !canonicalQuery) return null;

	const url = normalizeUrl(value.url);
	const explicitVideoId = cleanYouTubeVideoId(
		getField(value, 'youtube_video_id', 'youtubeVideoId')
	);
	const youtubeVideoId =
		entityType === 'youtube_video'
			? (explicitVideoId ??
				extractYouTubeVideoId(url) ??
				extractYouTubeVideoId(canonicalQuery) ??
				extractYouTubeVideoId(displayName))
			: undefined;

	const candidate: ExtractedLibriEntity = {
		entity_type: entityType,
		display_name: displayName,
		canonical_query: canonicalQuery,
		confidence: clampConfidence(value.confidence),
		relevance: normalizeRelevance(value.relevance),
		recommended_action: normalizeRecommendedAction(
			getField(value, 'recommended_action', 'recommendedAction')
		),
		user_requested_research: normalizeBoolean(
			getField(value, 'user_requested_research', 'userRequestedResearch')
		),
		extraction_reason:
			trimText(getField(value, 'extraction_reason', 'extractionReason'), 240) ??
			'Extracted during chat session synthesis.',
		source_message_ids: normalizeMessageIds(
			getField(value, 'source_message_ids', 'sourceMessageIds'),
			options.knownMessageIds
		),
		source_turn_indices: normalizeTurnIndices(
			getField(value, 'source_turn_indices', 'sourceTurnIndices'),
			options.maxTurnIndex
		),
		evidence_snippets: normalizeStringArray(
			getField(value, 'evidence_snippets', 'evidenceSnippets'),
			{
				maxItems: MAX_EVIDENCE_SNIPPETS,
				maxLength: 240
			}
		)
	};

	if (url) candidate.url = url;
	if (youtubeVideoId) candidate.youtube_video_id = youtubeVideoId;

	const authors = normalizeStringArray(value.authors, {
		maxItems: MAX_AUTHORS,
		maxLength: 120
	});
	if (authors.length) candidate.authors = authors;

	const aliases = normalizeStringArray(value.aliases, {
		maxItems: MAX_ALIASES,
		maxLength: 120
	});
	if (aliases.length) candidate.aliases = aliases;

	return candidate;
}

function sanitizeIgnoredCandidate(value: unknown): IgnoredEntityCandidate | null {
	if (!isRecord(value)) return null;
	const displayName = trimText(getField(value, 'display_name', 'displayName'), 160);
	const reason = trimText(value.reason, 240);
	if (!displayName || !reason) return null;

	const evidenceSnippets = normalizeStringArray(
		getField(value, 'evidence_snippets', 'evidenceSnippets'),
		{
			maxItems: MAX_EVIDENCE_SNIPPETS,
			maxLength: 240
		}
	);

	return {
		display_name: displayName,
		reason,
		...(evidenceSnippets.length ? { evidence_snippets: evidenceSnippets } : {})
	};
}

export function emptySessionExtractedEntities(
	now: () => Date = () => new Date()
): SessionExtractedEntities {
	return {
		libri_candidates: [],
		extraction_version: EXTRACTION_VERSION,
		extracted_at: now().toISOString()
	};
}

export function sanitizeSessionExtractedEntities(
	value: unknown,
	options: SanitizeSessionExtractedEntitiesOptions = {}
): SessionExtractedEntities {
	const now = options.now ?? (() => new Date());
	const empty = emptySessionExtractedEntities(now);
	if (!isRecord(value)) return empty;

	const rawCandidates = getField(value, 'libri_candidates', 'libriCandidates');
	const candidates: ExtractedLibriEntity[] = [];
	const seen = new Set<string>();
	if (Array.isArray(rawCandidates)) {
		for (const rawCandidate of rawCandidates) {
			const candidate = sanitizeCandidate(rawCandidate, options);
			if (!candidate) continue;
			const key = `${candidate.entity_type}:${candidate.canonical_query.toLowerCase()}`;
			if (seen.has(key)) continue;
			seen.add(key);
			candidates.push(candidate);
			if (candidates.length >= MAX_CANDIDATES) break;
		}
	}

	const rawIgnored = getField(value, 'ignored_candidates', 'ignoredCandidates');
	const ignoredCandidates = Array.isArray(rawIgnored)
		? rawIgnored
				.map(sanitizeIgnoredCandidate)
				.filter((candidate): candidate is IgnoredEntityCandidate => Boolean(candidate))
				.slice(0, MAX_IGNORED_CANDIDATES)
		: [];

	return {
		libri_candidates: candidates,
		...(ignoredCandidates.length ? { ignored_candidates: ignoredCandidates } : {}),
		extraction_version: EXTRACTION_VERSION,
		extracted_at: empty.extracted_at
	};
}

export function getEligibleLibriCandidates(
	extractedEntities: SessionExtractedEntities
): ExtractedLibriEntity[] {
	return extractedEntities.libri_candidates.filter((candidate) => {
		if (candidate.recommended_action !== 'resolve_or_enqueue') return false;
		if (candidate.confidence < MIN_AUTO_HANDOFF_CONFIDENCE) return false;
		if (
			candidate.relevance === 'incidental' &&
			candidate.confidence < MIN_INCIDENTAL_AUTO_HANDOFF_CONFIDENCE
		) {
			return false;
		}
		return true;
	});
}
