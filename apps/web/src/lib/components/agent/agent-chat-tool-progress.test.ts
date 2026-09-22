// apps/web/src/lib/components/agent/agent-chat-tool-progress.test.ts
import { describe, expect, it } from 'vitest';
import {
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
			'Jev: not here (4%) → "Networking Lunch" (91%)',
			'Opened chamber.test/events/lunch',
			'Jev: answer 95%',
			'Found it: Networking Lunch'
		]);
		expect(steps.at(-1)?.data).toEqual({ outcome: 'found' });
		expect(buildWebNavigateTrailFromResult(null)).toEqual([]);
	});
});
