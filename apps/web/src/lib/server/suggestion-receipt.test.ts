// apps/web/src/lib/server/suggestion-receipt.test.ts
import { describe, expect, it } from 'vitest';
import { buildSuggestionReceipt, receiptLines } from './suggestion-receipt';

const move = {
	tool: 'move_document_in_tree',
	args: { project_id: 'p1', document_id: 'doc-brand', new_parent_id: 'doc-strategy' }
};
const update = {
	tool: 'update_onto_task',
	args: { project_id: 'p1', task_id: 'task-1', due_at: '2026-11-13' }
};
const verifiedMove = {
	actionLabel: 'Move',
	entityLabel: 'document',
	target: 'Brand Direction',
	changes: [
		{ label: 'Current location', value: 'Top level' },
		{ label: 'New location', value: 'Project Context and Strategy' }
	]
};
const verifiedUpdate = {
	actionLabel: 'Update',
	entityLabel: 'task',
	target: 'Send proposal',
	changes: [{ label: 'Due', before: 'Nov 5', value: 'Nov 13' }]
};

describe('buildSuggestionReceipt', () => {
	it('keeps only the steps that were written, with the record each one changed', () => {
		const receipt = buildSuggestionReceipt({
			operations: [move, update],
			verified: [verifiedMove, verifiedUpdate],
			applied: [false, true]
		});
		expect(receipt).toEqual([
			{
				action_label: 'Update task',
				target: 'Send proposal',
				entity: { kind: 'task', id: 'task-1' },
				changes: [{ label: 'Due', before: 'Nov 5', value: 'Nov 13' }]
			}
		]);
	});

	it('names the moved document, not its destination', () => {
		const [step] = buildSuggestionReceipt({
			operations: [move],
			verified: [verifiedMove],
			applied: [true]
		});
		expect(step?.entity).toEqual({ kind: 'document', id: 'doc-brand' });
		expect(step?.changes).toHaveLength(2);
	});

	it('clips long text and gives nothing when the lists do not line up', () => {
		const long = 'x'.repeat(400);
		const [step] = buildSuggestionReceipt({
			operations: [update],
			verified: [
				{ ...verifiedUpdate, changes: [{ label: 'Change', before: long, value: long }] }
			],
			applied: [true]
		});
		expect(step?.changes[0]?.before).toHaveLength(241);
		expect(step?.changes[0]?.value.endsWith('…')).toBe(true);
		expect(
			buildSuggestionReceipt({
				operations: [move, update],
				verified: [verifiedMove],
				applied: [true, true]
			})
		).toEqual([]);
	});
});

describe('receiptLines', () => {
	it('writes one line per step, with the first before → after when there is one', () => {
		const receipt = buildSuggestionReceipt({
			operations: [move, update],
			verified: [verifiedMove, verifiedUpdate],
			applied: [true, true]
		});
		expect(receiptLines(receipt)).toEqual([
			'Move document · Brand Direction (Top level → Project Context and Strategy)',
			'Update task · Send proposal (Due: Nov 5 → Nov 13)'
		]);
		expect(receiptLines(null)).toEqual([]);
	});
});
