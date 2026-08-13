// packages/agentic-chat-runtime/src/loop/research-capture.test.ts
import { describe, expect, it } from 'vitest';
import { buildResearchEntryFromCalls, isResearchCaptureToolName } from './research-capture';

describe('shared deterministic research capture', () => {
	it('builds the legacy-exact entry from qualifying calls', () => {
		expect(
			buildResearchEntryFromCalls(
				[
					{
						name: 'web_search',
						args: { query: 'competitor pricing' },
						result: {
							answer: 'Calendly publishes tiered pricing.',
							results: [{ url: 'https://calendly.com/pricing' }]
						}
					},
					{
						name: 'util.web.visit',
						args: { url: 'https://acuityscheduling.com/pricing' },
						result: { final_url: 'https://acuityscheduling.com/pricing' }
					},
					{
						name: 'onto_project_read',
						args: { project_id: 'project-1' },
						result: { url: 'https://ignored.example/project' }
					}
				],
				{
					streamRunId: 'stream-research-1',
					userMessage: 'Research scheduling competitors.',
					capturedAt: '2026-07-29T20:00:00.000Z'
				}
			)
		).toEqual({
			streamRunId: 'stream-research-1',
			userMessage: 'Research scheduling competitors.',
			queries: ['competitor pricing'],
			visitedUrls: [
				'https://calendly.com/pricing',
				'https://acuityscheduling.com/pricing',
				'https://acuityscheduling.com/pricing'
			],
			findings: ['Calendly publishes tiered pricing.'],
			capturedAt: '2026-07-29T20:00:00.000Z'
		});
	});

	it('requires two recognized research calls and keeps the name set exact', () => {
		expect(isResearchCaptureToolName('WEB_SEARCH')).toBe(true);
		expect(isResearchCaptureToolName('util.web.visit')).toBe(true);
		expect(isResearchCaptureToolName('x.search.posts')).toBe(false);
		expect(
			buildResearchEntryFromCalls(
				[{ name: 'web_search', args: { query: 'one query' }, result: {} }],
				{
					streamRunId: 'stream-research-2',
					userMessage: 'Research this.',
					capturedAt: '2026-07-29T20:00:00.000Z'
				}
			)
		).toBeNull();
	});
});
