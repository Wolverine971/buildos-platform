// apps/web/src/lib/server/fsm/actions/__tests__/create-research-doc.test.ts
import { describe, it, expect } from 'vitest';
import {
	buildResearchSummary,
	type ResearchSource
} from '$lib/server/fsm/actions/create-research-doc';

const makeSource = (overrides: Partial<ResearchSource>): ResearchSource => ({
	id: 'source-1',
	uri: 'https://example.com',
	title: 'Sample Source',
	notes: 'Key insight about the topic.',
	snapshot_uri: null,
	...overrides
});

describe('create_research_doc helpers', () => {
	it('builds summary with sources in order', () => {
		const sources = [
			makeSource({
				id: 'a',
				title: 'Interview with Alice',
				uri: 'https://example.com/alice',
				notes: 'Customers struggle with onboarding.'
			}),
			makeSource({
				id: 'b',
				title: 'Survey Results',
				uri: null,
				notes: null
			})
		];

		const summary = buildResearchSummary('Onboarding Research', sources);

		expect(summary).toContain('Topic: Onboarding Research');
		expect(summary).toContain('Source 1: Interview with Alice');
		expect(summary).toContain('Customers struggle with onboarding.');
		expect(summary).toContain('URL: https://example.com/alice');
		expect(summary).toContain('Source 2: Survey Results');
		expect(summary).toContain('Insights pending');
	});

	it('handles empty source list gracefully', () => {
		const summary = buildResearchSummary('Product Discovery', []);
		expect(summary).toContain('Product Discovery');
		expect(summary).toContain('initial notes');
	});
});
