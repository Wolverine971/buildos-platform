// packages/agentic-chat-runtime/src/loop/research-capture.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildResearchEntryFromCalls,
	buildResearchLogDescription,
	isResearchCaptureToolName,
	renderResearchEntry,
	RESEARCH_ENTRY_MAX_CHARS,
	type ResearchEntryInput
} from './research-capture';

function entry(overrides: Partial<ResearchEntryInput> = {}): ResearchEntryInput {
	return {
		streamRunId: 'run-1',
		userMessage: 'i think we need to figure out what people charge for this',
		queries: ['competitor pricing scheduling', 'acuity pricing 2026'],
		visitedUrls: ['https://calendly.com/pricing', 'https://acuityscheduling.com/pricing'],
		findings: ['Calendly Standard is $10/seat/mo annual'],
		unresolved: ['no public pricing for two vendors'],
		capturedAt: '2026-07-26T02:30:00.000Z',
		...overrides
	};
}

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

describe('renderResearchEntry', () => {
	it('renders a dated heading, the run marker, and the detail lines', () => {
		const rendered = renderResearchEntry(entry());
		expect(rendered).toContain('## 2026-07-26 · i think we need to figure out');
		expect(rendered).toContain('<!-- run:run-1 -->');
		expect(rendered).toContain('- Queries: competitor pricing scheduling');
		expect(rendered).toContain('https://calendly.com/pricing');
		expect(rendered).toContain('- Unresolved:');
	});

	it('stays within the per-entry cap even with a lot of input', () => {
		const rendered = renderResearchEntry(
			entry({
				userMessage: 'x'.repeat(500),
				queries: Array.from({ length: 12 }, (_, i) => `query number ${i} `.repeat(6)),
				visitedUrls: Array.from(
					{ length: 12 },
					(_, i) => `https://example.com/${'segment/'.repeat(10)}${i}`
				),
				findings: Array.from({ length: 12 }, (_, i) => `finding ${i} `.repeat(10)),
				unresolved: Array.from({ length: 6 }, (_, i) => `unresolved ${i} `.repeat(8))
			})
		);
		expect(rendered.length).toBeLessThanOrEqual(RESEARCH_ENTRY_MAX_CHARS);
	});

	it('never truncates mid-URL when shedding content to fit the cap', () => {
		const rendered = renderResearchEntry(
			entry({
				findings: Array.from({ length: 10 }, (_, i) => `finding ${i} `.repeat(12)),
				visitedUrls: ['https://example.com/a', 'https://example.com/b']
			})
		);
		const urls = rendered.match(/https?:\/\/\S+/g) ?? [];
		for (const url of urls) {
			expect(url.endsWith('…')).toBe(false);
		}
	});

	it('deduplicates repeated queries and urls', () => {
		const rendered = renderResearchEntry(
			entry({
				queries: ['same query', 'same query', 'same query'],
				visitedUrls: ['https://a.com', 'https://a.com']
			})
		);
		expect(rendered.match(/same query/g)).toHaveLength(1);
		expect(rendered.match(/https:\/\/a\.com/g)).toHaveLength(1);
	});
});

describe('buildResearchLogDescription', () => {
	it('summarizes the latest topic within the highlight truncation budget', () => {
		const description = buildResearchLogDescription(entry({ userMessage: 'z'.repeat(400) }));
		expect(description.length).toBeLessThanOrEqual(180);
		expect(description.startsWith('Auto-captured research. Latest:')).toBe(true);
	});
});
