// apps/web/src/lib/components/today/TodayTwoWeeks.test.ts
// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/svelte';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CalendarItem } from '$lib/types/calendar-items';
import TodayTwoWeeks from './TodayTwoWeeks.svelte';
import { buildTwoWeeks } from './today-two-weeks';

afterEach(() => {
	cleanup();
});

function event(id: string, title: string, start_at: string, extra: Partial<CalendarItem> = {}) {
	return {
		calendar_item_id: id,
		item_type: 'event',
		item_kind: 'event',
		source_table: 'google_calendar',
		title,
		start_at,
		end_at: null,
		all_day: false,
		timezone: null,
		project_id: null,
		owner_entity_type: null,
		owner_entity_id: null,
		task_id: null,
		event_id: null,
		state_key: null,
		type_key: null,
		props: null,
		created_at: '',
		updated_at: '',
		...extra
	} as CalendarItem;
}

const monday = [
	event('a', 'Weekly planning', '2026-11-23T14:00:00Z', {
		props: { external_link: 'https://calendar.google.com/event?eid=a' },
		calendar_source_label: 'Work'
	}),
	event('b', 'Demo video review', '2026-11-23T18:00:00Z', {
		source_table: 'onto_events',
		project_id: 'project-1',
		task_id: 'task-9'
	}),
	event('c', 'Investor call', '2026-11-23T20:00:00Z'),
	event('d', 'Gym', '2026-11-23T22:30:00Z')
];

function renderStrip(items: CalendarItem[], compact = false) {
	const onOpenTask = vi.fn();
	render(TodayTwoWeeks, {
		props: {
			days: buildTwoWeeks({
				start: '2026-11-15',
				today: '2026-11-21',
				timezone: 'America/New_York',
				items
			}),
			compact,
			projectNameOf: (id: string | null) => (id ? 'Launch Project' : null),
			onOpenTask
		}
	});
	return { onOpenTask };
}

describe('TodayTwoWeeks', () => {
	it('shows two Sunday-to-Saturday weeks, one button per day', () => {
		renderStrip(monday);

		const days = screen.getAllByRole('button', { name: /, November \d+/ });
		expect(days).toHaveLength(14);
		expect(days[0]).toHaveAccessibleName('Sunday, November 15: nothing booked');
		expect(days[6]).toHaveAccessibleName('Saturday, November 21, today: nothing booked');
		expect(days[13]).toHaveAccessibleName('Saturday, November 28: nothing booked');
		expect(screen.getByText('This week and next')).toBeInTheDocument();
	});

	it('fits two chips and a count in a busy day, then lists every event when the day is opened', async () => {
		const { onOpenTask } = renderStrip(monday);
		const day = screen.getByRole('button', { name: 'Monday, November 23: 4 events' });

		expect(within(day).getByText('+2 more')).toBeInTheDocument();
		expect(within(day).queryByText('Investor call')).toBeNull();

		await fireEvent.click(day);
		const list = screen.getByRole('list');
		expect(
			within(list)
				.getAllByRole('listitem')
				.map((item) => item.textContent?.replace(/\s+/g, ' ').trim())
		).toEqual([
			'9:00 AM Weekly planning Work',
			'1:00 PM Demo video review Launch Project Open task',
			'3:00 PM Investor call',
			'5:30 PM Gym'
		]);
		expect(
			within(list).getByRole('link', { name: 'Open Weekly planning in Google Calendar' })
		).toHaveAttribute('href', 'https://calendar.google.com/event?eid=a');

		await fireEvent.click(within(list).getByRole('button', { name: 'Open task' }));
		expect(onOpenTask).toHaveBeenCalledWith('task-9', 'project-1');

		// The same day again closes the list.
		await fireEvent.click(day);
		expect(screen.queryByRole('list')).toBeNull();
	});

	it('says so when nothing is booked, and opens the next busy day by default on a phone', () => {
		renderStrip([]);
		expect(screen.getByText('Nothing booked through next week')).toBeInTheDocument();
		cleanup();

		renderStrip(monday, true);
		expect(screen.getByText('Monday, November 23')).toBeInTheDocument();
		expect(screen.getAllByRole('listitem')).toHaveLength(4);
	});
});
