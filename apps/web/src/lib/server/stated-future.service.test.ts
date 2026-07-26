// apps/web/src/lib/server/stated-future.service.test.ts
import { describe, expect, it } from 'vitest';
import {
	buildStatedFutureTaskDescription,
	buildStatedFutureTaskTitle
} from './stated-future.service';

describe('buildStatedFutureTaskTitle', () => {
	it('keeps the user words verbatim, capitalized, without trailing punctuation', () => {
		expect(buildStatedFutureTaskTitle("i'm just waiting to hear back from them.")).toBe(
			"I'm just waiting to hear back from them"
		);
	});

	it('collapses dictation whitespace', () => {
		expect(buildStatedFutureTaskTitle('still  need to\nbook the room')).toBe(
			'Still need to book the room'
		);
	});

	it('caps at 120 chars without a dangling cut', () => {
		const title = buildStatedFutureTaskTitle(`waiting on ${'x'.repeat(300)}`);
		expect(title).not.toBeNull();
		expect(title!.length).toBeLessThanOrEqual(120);
	});

	it('returns null for whitespace or punctuation-only input', () => {
		expect(buildStatedFutureTaskTitle('   ')).toBeNull();
		expect(buildStatedFutureTaskTitle('...')).toBeNull();
	});
});

describe('buildStatedFutureTaskDescription', () => {
	it('quotes the clause and explains why the task exists', () => {
		const description = buildStatedFutureTaskDescription({
			clause: 'waiting to hear back',
			userMessage: 'that call is done. waiting to hear back'
		});
		expect(description).toContain('"waiting to hear back"');
		expect(description).toContain('BuildOS saved it');
		expect(description).toContain('Full message:');
	});

	it('omits the full message line when it adds nothing over the clause', () => {
		const description = buildStatedFutureTaskDescription({
			clause: 'waiting to hear back',
			userMessage: 'waiting to hear back'
		});
		expect(description).not.toContain('Full message:');
	});
});
