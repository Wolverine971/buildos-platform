// apps/web/src/lib/components/agent/agent-chat-phrase-marks.test.ts
import { describe, expect, it } from 'vitest';
import {
	derivePhraseMarks,
	derivePhraseMarksForTurn,
	mergePhraseMarks,
	splitByMarks
} from './agent-chat-phrase-marks';
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

describe('a mark only claims what its step did', () => {
	const UPDATED = {
		affectedEntities: [{ kind: 'document', id: 'd1', title: 'Menu', operation: 'updated' }]
	};

	it('a change held for the person is held, never landed', () => {
		const [mark] = derivePhraseMarks(MESSAGE, [
			write('c1', 'update_onto_document', 'order the deck oven', 'completed', {
				...UPDATED,
				requiresUserAction: true
			})
		]);
		expect(mark).toMatchObject({ state: 'held', action: 'updated' });
	});

	it('an approved held change lands; an undone or declined one is not lit at all', () => {
		const held = write('c1', 'update_onto_document', 'order the deck oven', 'completed', {
			...UPDATED,
			requiresUserAction: true
		});
		const approved = derivePhraseMarks(MESSAGE, [held], {
			settled: { 'a-c1': { state: 'approved', label: 'Updated' } }
		});
		expect(approved[0]?.state).toBe('landed');
		const saved = write(
			'c2',
			'update_onto_document',
			'order the deck oven',
			'completed',
			UPDATED
		);
		expect(
			derivePhraseMarks(MESSAGE, [saved], {
				settled: { 'a-c2': { state: 'undone', label: 'Undone' } }
			})
		).toEqual([]);
		expect(
			derivePhraseMarks(MESSAGE, [held], {
				settled: { 'a-c1': { state: 'declined', label: 'Not saved' } }
			})
		).toEqual([]);
	});

	it('a step still pending after the turn ended stops pulsing', () => {
		const pending = write('c1', 'create_onto_task', 'order the deck oven', 'pending');
		expect(derivePhraseMarks(MESSAGE, [pending], { turnActive: true })[0]?.state).toBe('live');
		expect(derivePhraseMarks(MESSAGE, [pending], { turnActive: false })).toEqual([]);
	});

	it('two changes quoting the same words share one mark; neither drifts to other words', () => {
		const text = 'mark the oven task done, mark the lease task done';
		const marks = derivePhraseMarks(text, [
			write('c1', 'update_onto_task', 'mark the oven task done', 'completed'),
			write('c2', 'update_onto_task', 'mark the oven task done', 'completed'),
			write('c3', 'update_onto_task', 'mark the lease task done', 'completed')
		]);
		expect(marks.map((mark) => [text.slice(mark.start, mark.end), mark.ids])).toEqual([
			['mark the oven task done', ['c1', 'c2']],
			['mark the lease task done', ['c3']]
		]);
	});

	it('a quote of the whole message does not swallow the specific ones', () => {
		const marks = derivePhraseMarks(MESSAGE, [
			write('c0', 'update_onto_document', MESSAGE, 'completed'),
			write('c1', 'update_onto_task', 'Push the lease signing to Monday', 'completed'),
			write('c2', 'create_onto_task', 'order the deck oven', 'completed')
		]);
		expect(marks.map((mark) => mark.id)).toEqual(['c1', 'c2']);
	});
});

describe('looking back for the quoted words', () => {
	it('lights the earlier message when the answer to a question was acted on', () => {
		const earlier = {
			id: 'm1',
			content:
				'I need to call Frontier Airlines and get a refund for my checked bag because now I have two checked bags.'
		};
		const latest = { id: 'm2', content: 'Leave it as a task in my workspace' };
		const marks = derivePhraseMarksForTurn(
			[latest, earlier],
			[
				write(
					'c1',
					'create_onto_task',
					'I need to call Frontier Airlines and get a refund for my checked bag',
					'completed'
				)
			]
		);
		expect([...marks.keys()]).toEqual(['m1']);
		expect(marks.get('m1')![0]).toMatchObject({ id: 'c1', state: 'landed', action: 'created' });
	});

	it('prefers the message the turn answered, and merges marks from two turns', () => {
		const own = { id: 'm2', content: 'order the deck oven today' };
		const earlier = { id: 'm1', content: 'order the deck oven' };
		const marks = derivePhraseMarksForTurn(
			[own, earlier],
			[write('c1', 'create_onto_task', 'order the deck oven', 'completed')]
		);
		expect([...marks.keys()]).toEqual(['m2']);
		const merged = mergePhraseMarks(marks.get('m2')!, [
			{ ...marks.get('m2')![0]!, id: 'c9', ids: ['c9'] },
			{
				id: 'c8',
				ids: ['c8'],
				start: 20,
				end: 25,
				action: 'updated',
				label: 'task',
				state: 'landed'
			}
		]);
		expect(merged.map((mark) => mark.id)).toEqual(['c1', 'c8']);
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
