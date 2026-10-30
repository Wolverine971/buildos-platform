// apps/web/src/lib/components/projects/desktop/reader-edit.test.ts
import { describe, expect, it } from 'vitest';
import {
	dayOf,
	optimisticTimestamp,
	presetDay,
	removalFor,
	taskPriorityLabel,
	valueForDay
} from './reader-edit';

describe('reader date chips', () => {
	const now = new Date(2026, 9, 30, 15, 0); // Oct 30 2026, 3 PM local

	it('counts presets from today', () => {
		expect(presetDay('today', now)).toBe('2026-10-30');
		expect(presetDay('tomorrow', now)).toBe('2026-10-31');
		expect(presetDay('next_week', now)).toBe('2026-11-06');
	});

	it('sends a bare day when nothing was set, so the server picks the edge of the day', () => {
		expect(valueForDay('2026-11-02', null)).toBe('2026-11-02');
	});

	it('keeps an existing time of day on the new day', () => {
		const existing = new Date(2026, 6, 9, 14, 30).toISOString();
		const moved = new Date(valueForDay('2026-11-02', existing));
		expect(dayOf(moved.toISOString())).toBe('2026-11-02');
		expect(moved.getHours()).toBe(14);
		expect(moved.getMinutes()).toBe(30);
	});

	it('shows a bare day as the end (due) or start (start date) of that local day', () => {
		const end = new Date(optimisticTimestamp('2026-11-02', 'end')!);
		expect([end.getDate(), end.getHours(), end.getMinutes()]).toEqual([2, 23, 59]);
		const start = new Date(optimisticTimestamp('2026-11-02', 'start')!);
		expect([start.getDate(), start.getHours()]).toEqual([2, 0]);
		expect(optimisticTimestamp(null, 'end')).toBeNull();
	});

	it('reads an unset or broken value as no day', () => {
		expect(dayOf(null)).toBe('');
		expect(dayOf('not a date')).toBe('');
	});
});

describe('reader facts and removal', () => {
	it('labels task priority with its meaning', () => {
		expect(taskPriorityLabel(2)).toBe('P2 · High');
		expect(taskPriorityLabel(null)).toBe('Priority');
	});

	it('archives tasks and docs and deletes goals', () => {
		expect(removalFor('task', 't1')).toMatchObject({
			label: 'Archive',
			request: { url: '/api/onto/tasks/t1', method: 'DELETE', body: { archive: true } }
		});
		expect(removalFor('document', 'd1')).toMatchObject({
			label: 'Archive',
			request: {
				url: '/api/onto/documents/d1',
				method: 'PATCH',
				body: { action: 'archive', archive_children_mode: 'promote_children' }
			}
		});
		expect(removalFor('goal', 'g1')).toMatchObject({
			label: 'Delete',
			request: { url: '/api/onto/goals/g1', method: 'DELETE' }
		});
	});
});
