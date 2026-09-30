// packages/shared-agent-ops/src/permissions/proposal.test.ts
import { describe, it, expect } from 'vitest';
import { normalizePermissionProposal, buildPermissionMutation } from './proposal';
const id = '10000000-0000-4000-8000-000000000001';
const before = {
	id,
	project_id: id,
	title: 'Before',
	content: 'Some text',
	props: { body_markdown: 'Some text' },
	type_key: 'document.base'
};
const doc = (changes: Record<string, unknown>) =>
	normalizePermissionProposal({ kind: 'document', target_id: id, changes });
describe('bounded permission proposals', () => {
	it('binds append to the reviewed body', () => {
		expect(
			buildPermissionMutation(doc({ content: 'Added', update_mode: 'append' }), before)
		).toEqual({ content: 'Some text\n\nAdded' });
	});
	it('normalizes equivalent submissions before lookup', () => {
		expect(doc({ title: '  After  ', content: 'body' })).toEqual(
			doc({ title: 'After', content: 'body', update_mode: 'replace' })
		);
	});
	it.each([
		'props',
		'deleted_at',
		'state_key',
		'publish',
		'override_large_deletion',
		'calendar_sync'
	])('rejects document privilege field %s', (field) => {
		expect(() => doc({ [field]: true })).toThrow();
	});
	it('rejects model merge and mixed body formats', () => {
		expect(() => doc({ content: 'x', update_mode: 'merge_llm' })).toThrow();
		expect(() => doc({ content: 'x', edits: [{ old_text: 'a', new_text: 'b' }] })).toThrow();
	});
	it('rejects managed or archived targets', () => {
		expect(() =>
			buildPermissionMutation(doc({ title: 'After' }), {
				...before,
				type_key: 'document.context.project'
			})
		).toThrow('Managed');
		expect(() =>
			buildPermissionMutation(doc({ title: 'After' }), { ...before, archived_at: 'today' })
		).toThrow('archived');
	});
	it('rejects a new no-effect proposal', () => {
		expect(() => buildPermissionMutation(doc({ title: 'Before' }), before)).toThrow(
			'no changes'
		);
	});
	it('resolves exact edits once', () => {
		expect(
			buildPermissionMutation(
				doc({ edits: [{ old_text: 'Some text', new_text: 'Different text' }] }),
				before
			)
		).toEqual({ content: 'Different text' });
	});
	it('never accepts task scheduling, completion timestamp, or assignment', () => {
		for (const field of ['due_at', 'start_at', 'completed_at', 'assigned_to', 'calendar_sync'])
			expect(() =>
				normalizePermissionProposal({
					kind: 'task',
					target_id: id,
					changes: { title: 'After', [field]: 'x' }
				})
			).toThrow();
	});
	it('accepts task workflow and canonical priority without effect controls', () => {
		const p = normalizePermissionProposal({
			kind: 'task',
			target_id: id,
			changes: { state_key: 'done', priority: 2 }
		});
		expect(buildPermissionMutation(p, { ...before, state_key: 'todo', priority: 3 })).toEqual({
			state_key: 'done',
			priority: 2
		});
	});
});
