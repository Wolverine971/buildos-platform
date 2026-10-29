// apps/mobile/tests/reader-due-menu.test.ts
import { describe, expect, it } from 'vitest';

import { dueChoices, weekendChoice } from '@/components/reader/due-menu';
import { isTaskStateKey, stateTone, taskStateLabel } from '@/components/reader/task-state';

// Local dates: the menu works in the phone's own timezone.
const monday = new Date(2026, 9, 26, 10);
const thursday = new Date(2026, 9, 29, 10);
const friday = new Date(2026, 9, 30, 10);
const sunday = new Date(2026, 10, 1, 10);

describe('weekendChoice', () => {
	it('offers Saturday of this week, end of day, Monday to Thursday', () => {
		for (const day of [monday, thursday]) {
			const choice = weekendChoice(day);
			expect(choice).toMatchObject({ kind: 'set', key: 'weekend', day: '2026-10-31' });
			if (choice?.kind !== 'set') throw new Error('expected a set choice');
			const value = new Date(choice.value);
			expect([value.getDay(), value.getHours(), value.getMinutes()]).toEqual([6, 23, 59]);
		}
	});

	it('is left out Friday to Sunday, where it would repeat Tomorrow or mean a week away', () => {
		expect(weekendChoice(friday)).toBeNull();
		expect(weekendChoice(sunday)).toBeNull();
	});
});

describe('dueChoices', () => {
	it('puts This weekend before Next week and Clear only when a date is set', () => {
		expect(dueChoices(thursday, true).map((choice) => choice.label)).toEqual([
			'Today',
			'Tomorrow',
			'This weekend',
			'Next week',
			'Pick a date…',
			'Clear'
		]);
		expect(dueChoices(friday, false).map((choice) => choice.label)).toEqual([
			'Today',
			'Tomorrow',
			'Next week',
			'Pick a date…'
		]);
	});
});

describe('task states', () => {
	it('labels known states and spaces unknown ones', () => {
		expect(taskStateLabel('in_progress')).toBe('In progress');
		expect(taskStateLabel('waiting_on_review')).toBe('Waiting on review');
		expect(taskStateLabel('')).toBe('To do');
		expect(isTaskStateKey('blocked')).toBe(true);
		expect(isTaskStateKey('archived')).toBe(false);
	});

	it('colors the state pill like the website', () => {
		expect(stateTone('done')).toBe('success');
		expect(stateTone('in_progress')).toBe('success');
		expect(stateTone('blocked')).toBe('destructive');
		expect(stateTone('todo')).toBe('foreground');
	});
});
