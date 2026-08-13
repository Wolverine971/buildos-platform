// packages/agentic-chat-runtime/src/loop/stated-future-capture.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildStatedFutureTaskDescription,
	buildStatedFutureTaskTitle,
	STATED_FUTURE_SOURCE,
	STATED_FUTURE_TASK_TYPE_KEY
} from './stated-future-capture';

describe('stated-future capture rendering', () => {
	it('preserves the legacy source, task type, title, and provenance copy', () => {
		expect(STATED_FUTURE_SOURCE).toBe('stated_future_capture');
		expect(STATED_FUTURE_TASK_TYPE_KEY).toBe('task.default');
		expect(buildStatedFutureTaskTitle('  waiting   to hear back from them.  ')).toBe(
			'Waiting to hear back from them'
		);
		expect(
			buildStatedFutureTaskDescription({
				clause: 'waiting to hear back from them',
				userMessage: 'Closed the old task. Waiting to hear back from them.'
			})
		).toBe(
			'Captured automatically from your words: "waiting to hear back from them".\n' +
				'The chat turn acted on your message but recorded nothing for this follow-up, so BuildOS saved it.\n' +
				'Full message: "Closed the old task. Waiting to hear back from them."'
		);
	});

	it('clips deterministically and rejects an empty title', () => {
		expect(buildStatedFutureTaskTitle('  ...  ')).toBeNull();
		const title = buildStatedFutureTaskTitle(`waiting ${'x'.repeat(200)}!`);
		expect(title).toHaveLength(120);
		expect(title).toMatch(/…$/);
		const description = buildStatedFutureTaskDescription({
			clause: `waiting ${'x'.repeat(400)}`,
			userMessage: `message ${'y'.repeat(400)}`
		});
		expect(description).toContain('…".');
		expect(description).toContain('Full message: "message ');
	});
});
