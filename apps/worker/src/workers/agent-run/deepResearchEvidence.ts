// apps/worker/src/workers/agent-run/deepResearchEvidence.ts
import type {
	DeepResearchClaimKind,
	DeepResearchClaimSourceLink,
	DeepResearchEvidenceClaim,
	DeepResearchEvidenceContradiction,
	DeepResearchEvidencePacketV1,
	DeepResearchEvidenceSource,
	DeepResearchEvidenceSupport,
	DeepResearchSourceType
} from '@buildos/shared-types';
import { AGENT_OP_WEB_SEARCH, AGENT_OP_WEB_VISIT } from '@buildos/shared-agent-ops';

const MAX_SOURCES = 30;
const MAX_CLAIMS = 50;
const MAX_LINKS_PER_CLAIM = 8;
const MAX_CONTRADICTIONS = 20;
const MAX_LIST_ITEMS = 20;
const MAX_PACKET_JSON_CHARS = 24_000;
const MAX_OBSERVED_VISITS = 50;

export interface ObservedResearchSource {
	requestedUrl: string;
	finalUrl: string;
	title?: string;
	accessedAt: string;
	/** Bounded text already persisted in the successful tool-execution result. */
	content?: string;
}

export interface DeepResearchObservations {
	searchQueries: string[];
	visitedSources: ObservedResearchSource[];
}

export interface DeepResearchEvidenceValidation {
	packet: DeepResearchEvidencePacketV1;
	issues: string[];
	validForCompletion: boolean;
}

function readRecord(value: unknown): Record<string, unknown> | null {
	return value && typeof value === 'object' && !Array.isArray(value)
		? (value as Record<string, unknown>)
		: null;
}

function readText(value: unknown, maxChars: number): string | null {
	if (typeof value !== 'string') return null;
	const compact = value.replace(/\s+/g, ' ').trim();
	return compact ? compact.slice(0, maxChars) : null;
}

function readStringList(value: unknown, limit = MAX_LIST_ITEMS, maxChars = 500): string[] {
	if (!Array.isArray(value)) return [];
	return value
		.map((item) => readText(item, maxChars))
		.filter((item): item is string => Boolean(item))
		.slice(0, limit);
}

export function canonicalizeResearchUrl(value: unknown): string | null {
	if (typeof value !== 'string' || !value.trim()) return null;
	try {
		const url = new URL(value.trim());
		if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password)
			return null;
		url.hash = '';
		const normalized = url.toString();
		return normalized.length <= 2_048 ? normalized : null;
	} catch {
		return null;
	}
}

function finiteConfidence(value: unknown, fallback: number): number {
	return isConfidence(value) ? value : fallback;
}

function claimKind(value: unknown): DeepResearchClaimKind | null {
	return value === 'fact' || value === 'inference' || value === 'opinion' ? value : null;
}

function supportKind(value: unknown): DeepResearchEvidenceSupport | null {
	return value === 'direct' || value === 'inferred' || value === 'conflicting' ? value : null;
}

function sourceType(value: unknown): DeepResearchSourceType | null {
	return value === 'primary' ||
		value === 'secondary' ||
		value === 'reference' ||
		value === 'community'
		? value
		: value === 'other'
			? value
			: null;
}

function isConfidence(value: unknown): value is number {
	return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
}

function validDateText(value: unknown): string | undefined {
	const text = readText(value, 100);
	return text && Number.isFinite(Date.parse(text)) ? text : undefined;
}

function dedupeStrings(values: string[], limit: number): string[] {
	return Array.from(new Set(values)).slice(0, limit);
}

function sourceContainsExcerpt(
	source: ObservedResearchSource | undefined,
	excerpt: string
): boolean {
	if (!source?.content) return false;
	return source.content.toLocaleLowerCase().includes(excerpt.toLocaleLowerCase());
}

export function observeDeepResearchToolResult(params: {
	op: string;
	args: Record<string, unknown>;
	result: unknown;
	observedAt: string;
}): DeepResearchObservations {
	if (params.op === AGENT_OP_WEB_SEARCH) {
		const query = readText(params.args.query, 1_000);
		return { searchQueries: query ? [query] : [], visitedSources: [] };
	}
	if (params.op !== AGENT_OP_WEB_VISIT) {
		return { searchQueries: [], visitedSources: [] };
	}
	const result = readRecord(params.result);
	const requestedUrl = canonicalizeResearchUrl(result?.url ?? params.args.url);
	const finalUrl = canonicalizeResearchUrl(result?.final_url ?? requestedUrl);
	if (!requestedUrl || !finalUrl) {
		return { searchQueries: [], visitedSources: [] };
	}
	const info = readRecord(result?.info);
	return {
		searchQueries: [],
		visitedSources: [
			{
				requestedUrl,
				finalUrl,
				title: readText(result?.title, 500) ?? undefined,
				accessedAt: validDateText(info?.fetched_at) ?? params.observedAt,
				content: readText(result?.content, 12_000) ?? undefined
			}
		]
	};
}

export function mergeDeepResearchObservations(
	...observations: DeepResearchObservations[]
): DeepResearchObservations {
	const sourceByVisit = new Map<string, ObservedResearchSource>();
	for (const observation of observations) {
		for (const source of observation.visitedSources) {
			// Preserve every requested URL alias. Two inputs may redirect to the
			// same final URL, and either input is legitimate provenance for a later
			// model-authored source record.
			sourceByVisit.set(`${source.requestedUrl}\n${source.finalUrl}`, source);
		}
	}
	return {
		searchQueries: dedupeStrings(
			observations.flatMap((observation) => observation.searchQueries),
			50
		),
		visitedSources: Array.from(sourceByVisit.values()).slice(0, MAX_OBSERVED_VISITS)
	};
}

export function normalizeDeepResearchEvidencePacket(params: {
	raw: unknown;
	questionId: string;
	observations: DeepResearchObservations;
}): DeepResearchEvidenceValidation {
	const issues: string[] = [];
	let blocksCompletion = false;
	const issue = (message: string, blocking = true) => {
		issues.push(message);
		if (blocking) blocksCompletion = true;
	};
	const raw = readRecord(params.raw);
	if (!raw) issue('missing_evidence_packet');
	if (raw?.version !== 1) issue('unsupported_evidence_packet_version');
	if (raw?.question_id !== params.questionId) issue('question_id_mismatch');

	const observedByUrl = new Map<string, ObservedResearchSource>();
	for (const observed of params.observations.visitedSources) {
		observedByUrl.set(observed.requestedUrl, observed);
		observedByUrl.set(observed.finalUrl, observed);
	}

	const sources: DeepResearchEvidenceSource[] = [];
	const sourceAliases = new Map<string, string>();
	const sourceByUrl = new Map<string, DeepResearchEvidenceSource>();
	const observedSourceById = new Map<string, ObservedResearchSource>();
	const observedSourceByAlias = new Map<string, ObservedResearchSource>();
	const authoredSources = Array.isArray(raw?.sources) ? raw.sources : [];
	if (authoredSources.length > MAX_SOURCES) issue('too_many_sources');
	const rawSources = authoredSources.slice(0, MAX_SOURCES);
	for (const [index, value] of rawSources.entries()) {
		const candidate = readRecord(value);
		if (!candidate) {
			issue(`source_${index + 1}_malformed`);
			continue;
		}
		const authoredId = readText(candidate.id, 100);
		const sourceId = authoredId ?? `source-${index + 1}`;
		if (!authoredId) issue(`source_${index + 1}_missing_id`, false);
		const candidateUrl = canonicalizeResearchUrl(candidate.url);
		if (!candidateUrl) {
			issue(`source_${sourceId}_invalid_url`);
			continue;
		}
		const observed = observedByUrl.get(candidateUrl);
		if (!observed) {
			issue(`source_${sourceId}_was_not_visited`);
			continue;
		}
		const existing = sourceByUrl.get(observed.finalUrl);
		if (existing) {
			sourceAliases.set(sourceId, existing.id);
			observedSourceByAlias.set(sourceId, observed);
			continue;
		}
		if (sources.some((source) => source.id === sourceId)) {
			issue(`duplicate_source_id_${sourceId}`);
			continue;
		}
		const normalizedSourceType = sourceType(candidate.source_type);
		if (!normalizedSourceType) issue(`source_${sourceId}_has_invalid_source_type`);
		const source: DeepResearchEvidenceSource = {
			id: sourceId,
			url: observed.finalUrl,
			title: observed.title ?? readText(candidate.title, 500) ?? undefined,
			publisher: readText(candidate.publisher, 300) ?? undefined,
			published_at: validDateText(candidate.published_at),
			accessed_at: observed.accessedAt,
			source_type: normalizedSourceType ?? 'other'
		};
		sources.push(source);
		sourceByUrl.set(source.url, source);
		sourceAliases.set(sourceId, sourceId);
		observedSourceById.set(sourceId, observed);
		observedSourceByAlias.set(sourceId, observed);
	}
	if (sources.length === 0) issue('no_verified_sources');

	const claims: DeepResearchEvidenceClaim[] = [];
	const authoredClaims = Array.isArray(raw?.claims) ? raw.claims : [];
	if (authoredClaims.length > MAX_CLAIMS) issue('too_many_claims');
	const rawClaims = authoredClaims.slice(0, MAX_CLAIMS);
	for (const [index, value] of rawClaims.entries()) {
		const candidate = readRecord(value);
		const text = readText(candidate?.claim, 2_000);
		if (!candidate || !text) {
			issue(`claim_${index + 1}_malformed`);
			continue;
		}
		const authoredId = readText(candidate.id, 100);
		const claimId = authoredId ?? `claim-${index + 1}`;
		if (!authoredId) issue(`claim_${index + 1}_missing_id`, false);
		if (claims.some((claim) => claim.id === claimId)) {
			issue(`duplicate_claim_id_${claimId}`);
			continue;
		}
		const links: DeepResearchClaimSourceLink[] = [];
		const authoredLinks = Array.isArray(candidate.evidence) ? candidate.evidence : [];
		if (authoredLinks.length > MAX_LINKS_PER_CLAIM) {
			issue(`claim_${claimId}_has_too_many_evidence_links`);
		}
		const rawLinks = authoredLinks.slice(0, MAX_LINKS_PER_CLAIM);
		for (const linkValue of rawLinks) {
			const link = readRecord(linkValue);
			const authoredSourceId = readText(link?.source_id, 100);
			const sourceId = authoredSourceId ? sourceAliases.get(authoredSourceId) : undefined;
			if (!sourceId) {
				issue(`claim_${claimId}_references_unknown_source`);
				continue;
			}
			const support = supportKind(link?.support);
			if (!support) {
				issue(`claim_${claimId}_has_invalid_support_type`);
				continue;
			}
			let supportingExcerpt = readText(link?.supporting_excerpt, 500) ?? undefined;
			if (
				supportingExcerpt &&
				!sourceContainsExcerpt(
					(authoredSourceId ? observedSourceByAlias.get(authoredSourceId) : undefined) ??
						observedSourceById.get(sourceId),
					supportingExcerpt
				)
			) {
				// Non-blocking. Fabrication is already prevented by two stronger gates
				// that remain blocking: the source must be a URL this child actually
				// visited, and a `fact` claim must carry a `direct` link. An exact
				// substring match is brittle against ordinary model paraphrase or
				// whitespace/quote trimming, so a near-miss quote should drop the
				// unverifiable excerpt — not drag an otherwise sound run to `partial`.
				// The link itself (source_id + support) survives.
				issue(`claim_${claimId}_excerpt_not_found_in_source_${sourceId}`, false);
				supportingExcerpt = undefined;
			}
			const normalized: DeepResearchClaimSourceLink = {
				source_id: sourceId,
				support,
				supporting_excerpt: supportingExcerpt,
				location: readText(link?.location, 200) ?? undefined
			};
			const existing = links.find((item) => item.source_id === normalized.source_id);
			if (!existing) {
				links.push(normalized);
			} else if (normalized.support === 'direct' && existing.support !== 'direct') {
				existing.support = 'direct';
				existing.supporting_excerpt ??= normalized.supporting_excerpt;
				existing.location ??= normalized.location;
			}
		}
		const normalizedClaimKind = claimKind(candidate.kind);
		if (!normalizedClaimKind) issue(`claim_${claimId}_has_invalid_kind`);
		if (!isConfidence(candidate.confidence)) issue(`claim_${claimId}_has_invalid_confidence`);
		const kind = normalizedClaimKind ?? 'fact';
		if (kind === 'fact' && !links.some((link) => link.support === 'direct')) {
			issue(`claim_${claimId}_has_no_direct_support`);
		}
		if (kind === 'inference' && links.length === 0) {
			issue(`claim_${claimId}_has_no_evidence`);
		}
		claims.push({
			id: claimId,
			claim: text,
			kind,
			confidence: finiteConfidence(candidate.confidence, 0.5),
			evidence: links
		});
	}
	if (claims.length === 0) issue('no_usable_claims');
	if (!claims.some((claim) => claim.evidence.length > 0)) issue('no_source_linked_claims');

	const claimIds = new Set(claims.map((claim) => claim.id));
	const sourceIds = new Set(sources.map((source) => source.id));
	const contradictions: DeepResearchEvidenceContradiction[] = [];
	const authoredContradictions = Array.isArray(raw?.contradictions) ? raw.contradictions : [];
	if (authoredContradictions.length > MAX_CONTRADICTIONS) issue('too_many_contradictions');
	const rawContradictions = authoredContradictions.slice(0, MAX_CONTRADICTIONS);
	for (const [index, value] of rawContradictions.entries()) {
		const contradiction = readRecord(value);
		const description = readText(contradiction?.description, 1_000);
		if (!description) continue;
		const authoredClaimIds = readStringList(contradiction?.claim_ids, 10, 100);
		const authoredSourceIds = readStringList(contradiction?.source_ids, 10, 100);
		const normalizedClaimIds = authoredClaimIds.filter((id) => claimIds.has(id));
		const normalizedSourceIds = authoredSourceIds
			.map((id) => sourceAliases.get(id) ?? id)
			.filter((id) => sourceIds.has(id));
		if (
			normalizedClaimIds.length !== authoredClaimIds.length ||
			normalizedSourceIds.length !== authoredSourceIds.length
		) {
			issue(`contradiction_${index + 1}_references_unknown_id`);
		}
		contradictions.push({
			description,
			claim_ids: normalizedClaimIds,
			source_ids: normalizedSourceIds
		});
	}

	const averageConfidence = claims.length
		? claims.reduce((total, claim) => total + claim.confidence, 0) / claims.length
		: 0;
	if (!isConfidence(raw?.confidence)) issue('evidence_packet_has_invalid_confidence');
	const coverage = readRecord(raw?.search_coverage);
	const packet: DeepResearchEvidencePacketV1 = {
		version: 1,
		question_id: params.questionId,
		claims,
		sources,
		contradictions,
		limitations: readStringList(raw?.limitations),
		unanswered_questions: readStringList(raw?.unanswered_questions),
		search_coverage: {
			queries: dedupeStrings(params.observations.searchQueries, 50),
			visited_urls: dedupeStrings(
				params.observations.visitedSources.map((source) => source.finalUrl),
				MAX_OBSERVED_VISITS
			),
			notes: readText(coverage?.notes, 1_000) ?? undefined
		},
		confidence: finiteConfidence(raw?.confidence, averageConfidence)
	};
	if (JSON.stringify(packet).length > MAX_PACKET_JSON_CHARS) {
		issue('evidence_packet_exceeds_size_limit');
		for (const claim of packet.claims) {
			claim.evidence = claim.evidence.map((link) => ({
				source_id: link.source_id,
				support: link.support
			}));
		}
		const keepOnlyReferencedSources = () => {
			const referencedSourceIds = new Set(
				packet.claims.flatMap((claim) => claim.evidence.map((link) => link.source_id))
			);
			packet.sources = packet.sources.filter((source) => referencedSourceIds.has(source.id));
			packet.search_coverage.visited_urls = packet.sources.map((source) => source.url);
		};
		keepOnlyReferencedSources();
		const packetIsOversized = () => JSON.stringify(packet).length > MAX_PACKET_JSON_CHARS;
		while (packetIsOversized()) {
			if (packet.search_coverage.queries.length > 0) {
				packet.search_coverage.queries.pop();
				continue;
			}
			if (packet.contradictions.length > 0) {
				packet.contradictions.pop();
				continue;
			}
			if (packet.limitations.length > 1) {
				packet.limitations.pop();
				continue;
			}
			if (packet.unanswered_questions.length > 1) {
				packet.unanswered_questions.pop();
				continue;
			}
			const claimWithExtraLinks = packet.claims.find((claim) => claim.evidence.length > 1);
			if (claimWithExtraLinks) {
				const removableIndex = claimWithExtraLinks.evidence.findIndex(
					(link) => link.support !== 'direct'
				);
				claimWithExtraLinks.evidence.splice(
					removableIndex >= 0 ? removableIndex : claimWithExtraLinks.evidence.length - 1,
					1
				);
				keepOnlyReferencedSources();
				continue;
			}
			if (packet.claims.length > 1) {
				packet.claims.pop();
				keepOnlyReferencedSources();
				continue;
			}
			const sourceWithMetadata = packet.sources.find(
				(source) => source.title || source.publisher || source.published_at
			);
			if (sourceWithMetadata) {
				delete sourceWithMetadata.title;
				delete sourceWithMetadata.publisher;
				delete sourceWithMetadata.published_at;
				continue;
			}
			if (packet.search_coverage.notes) {
				delete packet.search_coverage.notes;
				continue;
			}
			break;
		}
		if (packetIsOversized()) {
			// This should be unreachable under the per-field limits, but retain a
			// deterministic final bound if those limits are widened later.
			issue('evidence_packet_compaction_failed');
			packet.claims = packet.claims.slice(0, 1);
			packet.claims[0]?.evidence.splice(1);
			keepOnlyReferencedSources();
			packet.contradictions = [];
			packet.limitations = packet.limitations.slice(0, 1);
			packet.unanswered_questions = packet.unanswered_questions.slice(0, 1);
			packet.search_coverage.queries = [];
			delete packet.search_coverage.notes;
			for (const source of packet.sources) {
				delete source.title;
				delete source.publisher;
				delete source.published_at;
			}
		}
	}

	return {
		packet,
		issues: dedupeStrings(issues, 100),
		validForCompletion: !blocksCompletion
	};
}

export function renderDeepResearchEvidencePacket(packet: DeepResearchEvidencePacketV1): string {
	return JSON.stringify(packet, null, 2);
}

export function readDeepResearchEvidencePacket(
	value: unknown
): DeepResearchEvidencePacketV1 | null {
	const packet = readRecord(value);
	const coverage = readRecord(packet?.search_coverage);
	if (
		packet?.version !== 1 ||
		!readText(packet.question_id, 100) ||
		!Array.isArray(packet.claims) ||
		packet.claims.length === 0 ||
		packet.claims.length > MAX_CLAIMS ||
		!Array.isArray(packet.sources) ||
		packet.sources.length === 0 ||
		packet.sources.length > MAX_SOURCES ||
		!Array.isArray(packet.contradictions) ||
		packet.contradictions.length > MAX_CONTRADICTIONS ||
		!Array.isArray(packet.limitations) ||
		packet.limitations.length > MAX_LIST_ITEMS ||
		!packet.limitations.every((item) => typeof item === 'string') ||
		!Array.isArray(packet.unanswered_questions) ||
		packet.unanswered_questions.length > MAX_LIST_ITEMS ||
		!packet.unanswered_questions.every((item) => typeof item === 'string') ||
		!coverage ||
		!Array.isArray(coverage.queries) ||
		coverage.queries.length > 50 ||
		!coverage.queries.every((query) => typeof query === 'string') ||
		!Array.isArray(coverage.visited_urls) ||
		coverage.visited_urls.length > MAX_OBSERVED_VISITS ||
		!coverage.visited_urls.every((url) => canonicalizeResearchUrl(url) === url) ||
		typeof packet.confidence !== 'number' ||
		!Number.isFinite(packet.confidence) ||
		packet.confidence < 0 ||
		packet.confidence > 1 ||
		JSON.stringify(packet).length > MAX_PACKET_JSON_CHARS
	) {
		return null;
	}
	const sourceIds = new Set<string>();
	for (const value of packet.sources) {
		const source = readRecord(value);
		const id = readText(source?.id, 100);
		if (
			!source ||
			!id ||
			sourceIds.has(id) ||
			canonicalizeResearchUrl(source.url) !== source.url ||
			!validDateText(source.accessed_at) ||
			!['primary', 'secondary', 'reference', 'community', 'other'].includes(
				String(source.source_type)
			)
		) {
			return null;
		}
		sourceIds.add(id);
	}
	const claimIds = new Set<string>();
	for (const value of packet.claims) {
		const claim = readRecord(value);
		const id = readText(claim?.id, 100);
		if (
			!claim ||
			!id ||
			claimIds.has(id) ||
			!readText(claim.claim, 2_000) ||
			!['fact', 'inference', 'opinion'].includes(String(claim.kind)) ||
			typeof claim.confidence !== 'number' ||
			!Number.isFinite(claim.confidence) ||
			claim.confidence < 0 ||
			claim.confidence > 1 ||
			!Array.isArray(claim.evidence) ||
			claim.evidence.length > MAX_LINKS_PER_CLAIM ||
			claim.evidence.some((value) => {
				const link = readRecord(value);
				return (
					!link ||
					!sourceIds.has(String(link.source_id)) ||
					!['direct', 'inferred', 'conflicting'].includes(String(link.support))
				);
			})
		) {
			return null;
		}
		claimIds.add(id);
	}
	for (const value of packet.contradictions) {
		const contradiction = readRecord(value);
		if (
			!contradiction ||
			!readText(contradiction.description, 1_000) ||
			!Array.isArray(contradiction.claim_ids) ||
			contradiction.claim_ids.length > 10 ||
			!contradiction.claim_ids.every((id) => claimIds.has(String(id))) ||
			!Array.isArray(contradiction.source_ids) ||
			contradiction.source_ids.length > 10 ||
			!contradiction.source_ids.every((id) => sourceIds.has(String(id)))
		) {
			return null;
		}
	}
	return packet as unknown as DeepResearchEvidencePacketV1;
}

export function isDeepResearchEvidencePacketCompletionReady(
	packet: DeepResearchEvidencePacketV1
): boolean {
	return (
		packet.sources.length > 0 &&
		packet.claims.some((claim) => claim.evidence.length > 0) &&
		packet.claims.every(
			(claim) =>
				claim.kind === 'opinion' ||
				(claim.kind === 'inference' && claim.evidence.length > 0) ||
				(claim.kind === 'fact' && claim.evidence.some((link) => link.support === 'direct'))
		)
	);
}
