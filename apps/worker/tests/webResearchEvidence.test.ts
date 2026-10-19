// apps/worker/tests/webResearchEvidence.test.ts
import { describe, expect, it } from 'vitest';
import {
	mergeWebResearchObservations,
	observeWebResearchToolResult
} from '../src/workers/agent-run/webResearchEvidence';
const ACCESSED_AT = '2026-07-21T12:00:00.000Z';
describe('web research evidence', () => {
	it('derives coverage from recorded search and visit tool results', () => {
		const search = observeWebResearchToolResult({
			op: 'util.web.search',
			args: { query: '  current primary evidence  ' },
			result: { results: [] },
			observedAt: ACCESSED_AT
		});
		const visit = observeWebResearchToolResult({
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

		expect(mergeWebResearchObservations(search, visit)).toEqual({
			searchQueries: ['current primary evidence'],
			searchResults: [],
			visitedSources: [
				{
					requestedUrl: 'https://example.com/start',
					finalUrl: 'https://example.com/report',
					title: 'Primary report',
					accessedAt: ACCESSED_AT,
					content: 'The report says: A short exact excerpt. Additional context follows.'
				}
			]
		});
	});

	it('retains bounded canonical search candidates for compact working context', () => {
		const observed = observeWebResearchToolResult({
			op: 'util.web.search',
			args: { query: 'current primary evidence' },
			result: {
				results: [
					{
						title: 'Primary report',
						url: 'https://example.com/report#findings',
						snippet: 'A concise result snippet.'
					},
					{ title: 'Unsafe', url: 'javascript:alert(1)', snippet: 'discard me' }
				]
			},
			observedAt: ACCESSED_AT
		});

		expect(observed.searchResults).toEqual([
			{
				query: 'current primary evidence',
				title: 'Primary report',
				url: 'https://example.com/report',
				snippet: 'A concise result snippet.'
			}
		]);
	});

	it('records pages fetched during search as verified visited sources', () => {
		const observed = observeWebResearchToolResult({
			op: 'util.web.search',
			args: { query: 'current primary evidence' },
			result: {
				results: [
					{
						title: 'Discovery title',
						url: 'https://example.com/start',
						page_title: 'Fetched title',
						page_content: 'Direct evidence from the fetched page.',
						page_final_url: 'https://example.com/report#section',
						page_fetched_at: ACCESSED_AT,
						page_visit_id: '10000000-0000-4000-8000-000000000001',
						page_version_id: '20000000-0000-4000-8000-000000000001',
						page_version_number: 2,
						page_content_hash: 'a'.repeat(64),
						page_evidence_chunks: [
							{
								id: '30000000-0000-4000-8000-000000000001',
								chunk_index: 0,
								start_offset: 0,
								end_offset: 38,
								selector: 'char:0-38',
								content_hash: 'b'.repeat(64)
							}
						]
					}
				]
			},
			observedAt: '2026-07-21T13:00:00.000Z'
		});

		expect(observed.visitedSources).toEqual([
			{
				requestedUrl: 'https://example.com/start',
				finalUrl: 'https://example.com/report',
				title: 'Fetched title',
				accessedAt: ACCESSED_AT,
				content: 'Direct evidence from the fetched page.',
				pageVisitId: '10000000-0000-4000-8000-000000000001',
				pageVersionId: '20000000-0000-4000-8000-000000000001',
				pageVersionNumber: 2,
				contentHash: 'a'.repeat(64),
				evidenceChunks: [
					{
						id: '30000000-0000-4000-8000-000000000001',
						chunk_index: 0,
						start_offset: 0,
						end_offset: 38,
						selector: 'char:0-38',
						content_hash: 'b'.repeat(64)
					}
				]
			}
		]);
	});
});
