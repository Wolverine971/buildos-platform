// apps/web/src/lib/components/agent/agent-chat-tool-progress.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildGuidedSearchTrailFromResult,
	buildWebContentFlagTrailFromResult,
	buildWebNavigateTrailFromResult,
	mergeToolProgressStep,
	readToolProgressSteps
} from './agent-chat-tool-progress';

describe('tool progress steps', () => {
	it('merges idempotently by index and keeps order', () => {
		let steps = mergeToolProgressStep(undefined, { index: 1, message: 'b', kind: 'decided' });
		steps = mergeToolProgressStep(steps, { index: 0, message: 'a', kind: 'opened' });
		steps = mergeToolProgressStep(steps, {
			index: 1,
			message: 'b (replayed)',
			kind: 'decided'
		});
		expect(steps.map((s) => s.message)).toEqual(['a', 'b (replayed)']);
		expect(readToolProgressSteps([{ index: 'x' }, ...steps, null])).toHaveLength(2);
	});

	it('rebuilds a navigation trail from a persisted web_navigate result', () => {
		const steps = buildWebNavigateTrailFromResult({
			outcome: 'found',
			answer_page: { url: 'https://chamber.test/events/lunch', title: 'Networking Lunch' },
			path: [
				{
					step: 1,
					url: 'https://www.chamber.test/events',
					answer_probability: 0.04,
					clicked: {
						label: 'Networking Lunch',
						url: 'https://chamber.test/events/lunch',
						probability: 0.91
					}
				},
				{ step: 2, url: 'https://chamber.test/events/lunch', answer_probability: 0.95 }
			]
		});
		expect(steps.map((s) => s.message)).toEqual([
			'Opened chamber.test/events',
			'Not on this page (4%) → "Networking Lunch" (91%)',
			'Opened chamber.test/events/lunch',
			'Answer is on this page (95%)',
			'Found it: Networking Lunch'
		]);
		// The trail is shown to the person: it never names an internal model.
		expect(steps.map((s) => s.message).join(' ')).not.toMatch(/jev/i);
		expect(steps.at(-1)?.data).toEqual({ outcome: 'found' });
		expect(buildWebNavigateTrailFromResult(null)).toEqual([]);
	});

	it('rebuilds the flag line for a page that had text aimed at AI tools, under any web tool', () => {
		const content_warnings = [
			{ url: 'https://www.b.example/pricing?x=1', warning: 'flagged' },
			{ url: 'https://b.example/about', warning: 'flagged' }
		];
		// web_search and web_visit: one line per site, with the worker's live wording.
		expect(buildWebContentFlagTrailFromResult({ results: [], content_warnings })).toEqual([
			{
				index: 0,
				kind: 'flag',
				message: 'Flagged · b.example · it has text aimed at AI tools'
			}
		]);
		// A result that only says the words is not a flag.
		expect(
			buildWebContentFlagTrailFromResult({ content: 'content_warnings: flagged page' })
		).toEqual([]);
		expect(buildWebContentFlagTrailFromResult(null)).toEqual([]);

		const navigated = buildWebNavigateTrailFromResult({
			outcome: 'found',
			answer_page: { url: 'https://b.example/about', title: 'About' },
			path: [{ step: 1, url: 'https://b.example/about', answer_probability: 0.9 }],
			content_warnings
		});
		expect(navigated.at(-1)).toMatchObject({ kind: 'flag', index: navigated.length - 1 });

		const explored = buildGuidedSearchTrailFromResult({
			knowledge_explore: {
				queries: ['b leadership'],
				pages: [{ url: 'https://b.example/about', title: 'About', flagged: true }],
				entities: []
			},
			content_warnings
		});
		expect(explored.map((step) => step.kind)).toEqual(['search', 'flag', 'read']);
		expect(explored.map((step) => step.index)).toEqual([0, 1, 2]);
	});
});
