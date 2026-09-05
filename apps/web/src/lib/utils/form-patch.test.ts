// apps/web/src/lib/utils/form-patch.test.ts
import { describe, expect, it } from 'vitest';
import { changedFormFields } from './form-patch';

describe('changedFormFields', () => {
	it('omits untouched dates and copied assignee arrays', () => {
		const initial = { title: 'Task', start_at: '2026-09-04T12:00', assignees: ['a'] };
		expect(changedFormFields(initial, { ...initial, assignees: ['a'] })).toEqual({});
		expect(changedFormFields(initial, { ...initial, title: 'Edited' })).toEqual({
			title: 'Edited'
		});
	});
	it('preserves explicit clearing, zero and empty assignee lists', () => {
		expect(
			changedFormFields(
				{
					description: 'Text' as string | null,
					due_at: '2026-09-04T12:00',
					priority: 3,
					assignees: ['a']
				},
				{ description: null, due_at: '', priority: 0, assignees: [] }
			)
		).toEqual({ description: null, due_at: '', priority: 0, assignees: [] });
	});
});
