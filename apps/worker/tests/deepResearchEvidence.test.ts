// apps/worker/tests/deepResearchEvidence.test.ts
import { describe, expect, it } from 'vitest';
import {
	isDeepResearchEvidencePacketCompletionReady,
	mergeDeepResearchObservations,
	normalizeDeepResearchEvidencePacket,
	observeDeepResearchToolResult,
	readDeepResearchEvidencePacket
} from '../src/workers/agent-run/deepResearchEvidence';

const QUESTION_ID = '20000000-0000-4000-8000-000000000001';
const ACCESSED_AT = '2026-07-21T12:00:00.000Z';

function observations() {
	return {
		searchQueries: ['current primary evidence'],
		visitedSources: [
			{
				requestedUrl: 'https://example.com/start',
				finalUrl: 'https://example.com/report',
				title: 'Primary report',
				accessedAt: ACCESSED_AT,
				content: 'The report says: A short exact excerpt. Additional context follows.'
			}
		]
	};
}

function validPacket() {
	return {
		version: 1,
		question_id: QUESTION_ID,
		claims: [
			{
				id: 'claim-1',
				claim: 'The primary report supports the finding.',
				kind: 'fact',
				confidence: 0.9,
				evidence: [
					{
						source_id: 'source-1',
						support: 'direct',
						supporting_excerpt: 'A short exact excerpt.'
					}
				]
			}
		],
		sources: [
			{
				id: 'source-1',
				url: 'https://example.com/start#ignored',
				title: 'Model title',
				publisher: 'Example Research',
				published_at: '2026-07-20',
				accessed_at: '1900-01-01T00:00:00.000Z',
				source_type: 'primary'
			}
		],
		contradictions: [],
		limitations: [],
		unanswered_questions: [],
		search_coverage: { notes: 'One primary source was sufficient for this narrow claim.' },
		confidence: 0.9
	};
}

describe('deep research evidence contract', () => {
	it('accepts directly supported claims only from URLs the child actually visited', () => {
		const validation = normalizeDeepResearchEvidencePacket({
			raw: validPacket(),
			questionId: QUESTION_ID,
			observations: observations()
		});

		expect(validation.validForCompletion).toBe(true);
		expect(validation.issues).toEqual([]);
		expect(validation.packet.sources[0]).toMatchObject({
			id: 'source-1',
			url: 'https://example.com/report',
			title: 'Primary report',
			accessed_at: ACCESSED_AT,
			source_type: 'primary'
		});
		expect(validation.packet.search_coverage).toEqual({
			queries: ['current primary evidence'],
			visited_urls: ['https://example.com/report'],
			notes: 'One primary source was sufficient for this narrow claim.'
		});
	});

	it('preserves partial evidence but blocks completion for fabricated source ids and unvisited URLs', () => {
		const raw = validPacket();
		raw.sources[0]!.url = 'https://unvisited.example/private-claim';
		raw.claims[0]!.evidence[0]!.source_id = 'fabricated-source';

		const validation = normalizeDeepResearchEvidencePacket({
			raw,
			questionId: QUESTION_ID,
			observations: observations()
		});

		expect(validation.validForCompletion).toBe(false);
		expect(validation.packet.sources).toEqual([]);
		expect(validation.packet.claims).toHaveLength(1);
		expect(validation.packet.claims[0]?.evidence).toEqual([]);
		expect(validation.issues).toEqual(
			expect.arrayContaining([
				'source_source-1_was_not_visited',
				'claim_claim-1_references_unknown_source',
				'claim_claim-1_has_no_direct_support'
			])
		);
	});

	it('deduplicates redirected source URLs and remaps claim links to one stable source id', () => {
		const raw = validPacket();
		raw.sources.push({
			...raw.sources[0]!,
			id: 'source-duplicate',
			url: 'https://example.com/report'
		});
		raw.claims[0]!.evidence[0]!.source_id = 'source-duplicate';

		const validation = normalizeDeepResearchEvidencePacket({
			raw,
			questionId: QUESTION_ID,
			observations: observations()
		});

		expect(validation.validForCompletion).toBe(true);
		expect(validation.packet.sources).toHaveLength(1);
		expect(validation.packet.claims[0]?.evidence[0]?.source_id).toBe('source-1');
	});

	it('does not treat missing support types or opinion-only packets as completed research', () => {
		const missingSupport = validPacket();
		delete (missingSupport.claims[0]!.evidence[0] as { support?: string }).support;
		const missingSupportValidation = normalizeDeepResearchEvidencePacket({
			raw: missingSupport,
			questionId: QUESTION_ID,
			observations: observations()
		});
		expect(missingSupportValidation.validForCompletion).toBe(false);
		expect(missingSupportValidation.issues).toEqual(
			expect.arrayContaining([
				'claim_claim-1_has_invalid_support_type',
				'claim_claim-1_has_no_direct_support'
			])
		);

		const opinionOnly = validPacket();
		opinionOnly.claims[0]!.kind = 'opinion';
		opinionOnly.claims[0]!.evidence = [];
		opinionOnly.sources = [];
		const opinionValidation = normalizeDeepResearchEvidencePacket({
			raw: opinionOnly,
			questionId: QUESTION_ID,
			observations: observations()
		});
		expect(opinionValidation.validForCompletion).toBe(false);
		expect(opinionValidation.issues).toEqual(
			expect.arrayContaining(['no_verified_sources', 'no_source_linked_claims'])
		);
	});

	it('drops an unverifiable excerpt without blocking completion (source + direct support already gate fabrication)', () => {
		const raw = validPacket();
		raw.claims[0]!.evidence[0]!.supporting_excerpt = 'A fabricated exact quotation.';

		const validation = normalizeDeepResearchEvidencePacket({
			raw,
			questionId: QUESTION_ID,
			observations: observations()
		});

		// The excerpt near-miss is recorded but non-blocking: the source was still
		// visited and the fact claim still carries a direct link.
		expect(validation.validForCompletion).toBe(true);
		expect(validation.issues).toContain('claim_claim-1_excerpt_not_found_in_source_source-1');
		expect(validation.packet.claims[0]?.evidence[0]?.supporting_excerpt).toBeUndefined();
		expect(validation.packet.claims[0]?.evidence[0]).toMatchObject({
			source_id: 'source-1',
			support: 'direct'
		});
	});

	it('still blocks completion when the excerpt near-miss is on a claim with no other support', () => {
		const raw = validPacket();
		// A single inference claim whose only link is an unverifiable excerpt still
		// counts as evidence (inference needs a link, not a direct one), so the
		// excerpt drop alone must not fabricate completion-readiness for a claim
		// that has no real backing beyond the (now-removed) quote.
		raw.claims[0]!.kind = 'fact';
		raw.claims[0]!.evidence[0]!.support = 'inferred';
		raw.claims[0]!.evidence[0]!.supporting_excerpt = 'A fabricated exact quotation.';

		const validation = normalizeDeepResearchEvidencePacket({
			raw,
			questionId: QUESTION_ID,
			observations: observations()
		});

		// fact with only an `inferred` link → still blocked by has_no_direct_support,
		// independent of the (non-blocking) excerpt issue.
		expect(validation.validForCompletion).toBe(false);
		expect(validation.issues).toEqual(
			expect.arrayContaining([
				'claim_claim-1_excerpt_not_found_in_source_source-1',
				'claim_claim-1_has_no_direct_support'
			])
		);
	});

	it('downgrades invalid enums and confidence values instead of silently accepting them', () => {
		const raw = validPacket() as Record<string, any>;
		raw.claims[0].kind = 'prediction';
		raw.claims[0].confidence = 9;
		raw.sources[0].source_type = 'blog';
		raw.confidence = 'high';

		const validation = normalizeDeepResearchEvidencePacket({
			raw,
			questionId: QUESTION_ID,
			observations: observations()
		});

		expect(validation.validForCompletion).toBe(false);
		expect(validation.issues).toEqual(
			expect.arrayContaining([
				'claim_claim-1_has_invalid_kind',
				'claim_claim-1_has_invalid_confidence',
				'source_source-1_has_invalid_source_type',
				'evidence_packet_has_invalid_confidence'
			])
		);
		expect(validation.packet.claims[0]).toMatchObject({ kind: 'fact', confidence: 0.5 });
		expect(validation.packet.sources[0]?.source_type).toBe('other');
	});

	it('preserves multiple requested URL aliases that redirect to one final source', () => {
		const merged = mergeDeepResearchObservations(observations(), {
			searchQueries: [],
			visitedSources: [
				{
					...observations().visitedSources[0]!,
					requestedUrl: 'https://example.com/alternate'
				}
			]
		});
		const raw = validPacket();
		raw.sources[0]!.url = 'https://example.com/start';
		raw.sources.push({
			...raw.sources[0]!,
			id: 'source-alternate',
			url: 'https://example.com/alternate'
		});
		raw.claims[0]!.evidence[0]!.source_id = 'source-alternate';

		const validation = normalizeDeepResearchEvidencePacket({
			raw,
			questionId: QUESTION_ID,
			observations: merged
		});

		expect(merged.visitedSources).toHaveLength(2);
		expect(validation.validForCompletion).toBe(true);
		expect(validation.packet.sources).toHaveLength(1);
		expect(validation.packet.claims[0]?.evidence[0]?.source_id).toBe('source-1');
	});

	it('fails the coordinator read guard closed on malformed nested evidence', () => {
		const validation = normalizeDeepResearchEvidencePacket({
			raw: validPacket(),
			questionId: QUESTION_ID,
			observations: observations()
		});
		expect(readDeepResearchEvidencePacket(validation.packet)).not.toBeNull();

		const malformed = structuredClone(validation.packet);
		malformed.claims[0]!.evidence[0]!.source_id = 'unknown-source';
		expect(readDeepResearchEvidencePacket(malformed)).toBeNull();

		const partial = structuredClone(validation.packet);
		partial.claims[0]!.evidence[0]!.support = 'inferred';
		expect(readDeepResearchEvidencePacket(partial)).not.toBeNull();
		expect(isDeepResearchEvidencePacketCompletionReady(partial)).toBe(false);
	});

	it('derives coverage from recorded search and visit tool results', () => {
		const search = observeDeepResearchToolResult({
			op: 'util.web.search',
			args: { query: '  current primary evidence  ' },
			result: { results: [] },
			observedAt: ACCESSED_AT
		});
		const visit = observeDeepResearchToolResult({
			op: 'util.web.visit',
			args: { url: 'https://example.com/start' },
			result: {
				url: 'https://example.com/start',
				final_url: 'https://example.com/report#section',
				title: 'Primary report',
				content: 'The report says: A short exact excerpt. Additional context follows.',
				info: { fetched_at: ACCESSED_AT }
			},
			observedAt: '2026-07-21T12:01:00.000Z'
		});

		expect(mergeDeepResearchObservations(search, visit)).toEqual(observations());
	});

	it('bounds oversized packets without discarding all usable evidence', () => {
		const raw = validPacket();
		raw.claims = Array.from({ length: 50 }, (_, index) => ({
			id: `claim-${index + 1}`,
			claim: `Supported finding ${index + 1}: ${'evidence '.repeat(300)}`,
			kind: 'fact',
			confidence: 0.8,
			evidence: [
				{
					source_id: 'source-1',
					support: 'direct',
					supporting_excerpt: 'bounded excerpt '.repeat(100)
				}
			]
		}));
		const oversizedObservations = observations();
		oversizedObservations.searchQueries = Array.from(
			{ length: 50 },
			(_, index) => `query ${index}: ${'long '.repeat(300)}`
		);

		const validation = normalizeDeepResearchEvidencePacket({
			raw,
			questionId: QUESTION_ID,
			observations: oversizedObservations
		});

		expect(validation.validForCompletion).toBe(false);
		expect(validation.issues).toContain('evidence_packet_exceeds_size_limit');
		expect(validation.packet.claims.length).toBeGreaterThan(0);
		expect(JSON.stringify(validation.packet).length).toBeLessThanOrEqual(24_000);
	});
});
