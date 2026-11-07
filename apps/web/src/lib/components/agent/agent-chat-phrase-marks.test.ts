// apps/web/src/lib/components/agent/agent-chat-phrase-marks.test.ts
import { describe, expect, it } from 'vitest';
import { derivePhraseMarks, splitByMarks } from './agent-chat-phrase-marks';
import type { ActivityEntry } from './agent-chat.types';

const MESSAGE = 'Push the lease signing to Monday, and add a task to order the deck oven.';

function write(
	id: string,
	toolName: string,
	quote: string,
	status: ActivityEntry['status'],
	extra: Record<string, unknown> = {}
): ActivityEntry {
	return {
		id: `a-${id}`,
		content: '',
		timestamp: new Date(),
		activityType: 'tool_call',
		status,
		toolCallId: id,
		metadata: { toolName, sourceQuote: quote, ...extra }
	} as ActivityEntry;
}

describe('derivePhraseMarks', () => {
	it('marks each change on its own words, live then landed', () => {
		const marks = derivePhraseMarks(MESSAGE, [
			write('c2', 'create_onto_task', 'order the deck oven', 'pending'),
			write('c1', 'update_onto_task', 'Push the lease signing to Monday', 'completed', {
				affectedEntities: [
					{ kind: 'task', id: 't1', title: 'Sign lease', operation: 'updated' }
				]
			})
		]);
		expect(marks.map((mark) => [mark.id, mark.state, mark.action, mark.label])).toEqual([
			['c1', 'landed', 'updated', 'task'],
			['c2', 'live', 'created', 'task']
		]);
		expect(MESSAGE.slice(marks[1]!.start, marks[1]!.end)).toBe('order the deck oven');
	});

	it('skips quotes that are not in the message and steps without one', () => {
		const marks = derivePhraseMarks(MESSAGE, [
			write('c1', 'update_onto_task', 'renew my passport', 'completed'),
			{ ...write('c2', 'list_onto_tasks', '', 'completed') }
		]);
		expect(marks).toEqual([]);
	});
});

describe('splitByMarks', () => {
	it('returns plain and marked runs that rebuild the message', () => {
		const marks = derivePhraseMarks(MESSAGE, [
			write('c1', 'create_onto_task', 'order the deck oven', 'completed')
		]);
		const pieces = splitByMarks(MESSAGE, marks);
		expect(pieces.map((piece) => piece.text).join('')).toBe(MESSAGE);
		expect(pieces.filter((piece) => piece.mark).map((piece) => piece.text)).toEqual([
			'order the deck oven'
		]);
	});
});
