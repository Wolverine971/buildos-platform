// apps/web/src/lib/components/scheduling/CalendarView.test.ts
// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import CalendarView from './CalendarView.svelte';

const workingHours = {
	work_start_time: '00:00',
	work_end_time: '24:00',
	working_days: [0, 1, 2, 3, 4, 5, 6]
};

describe('CalendarView multi-day events', () => {
	it('shows an overlapping event even when it started before the selected day', async () => {
		const calendarItem = {
			calendar_item_id: 'event-1',
			all_day: false
		};
		const handleEventClick = vi.fn();

		render(CalendarView, {
			props: {
				viewMode: 'day',
				currentDate: new Date(2026, 4, 2, 12),
				workingHours,
				events: [
					{
						summary: 'Conference',
						start: { dateTime: '2026-05-01T09:00:00' },
						end: { dateTime: '2026-05-03T17:00:00' },
						calendarItem
					}
				],
				oneventClick: handleEventClick
			}
		});

		const eventButton = screen.getByRole('button', { name: /Conference/i });
		expect(eventButton).toBeInTheDocument();
		expect(screen.getByText('Continues')).toBeInTheDocument();

		await fireEvent.click(eventButton);

		expect(handleEventClick).toHaveBeenCalledWith(
			expect.objectContaining({
				calendarItem
			})
		);
	});

	it('renders all-day multi-day events as month-spanning bars', () => {
		render(CalendarView, {
			props: {
				viewMode: 'month',
				currentDate: new Date(2026, 4, 1, 12),
				workingHours,
				events: [
					{
						summary: 'Planning Retreat',
						start: { date: '2026-05-11' },
						end: { date: '2026-05-14' },
						allDay: true
					}
				]
			}
		});

		expect(screen.getAllByText('Planning Retreat').length).toBeGreaterThan(1);

		const spanningButton = screen
			.getAllByRole('button', { name: /Planning Retreat/i })
			.find((button) => button.getAttribute('style')?.includes('width: calc('));

		expect(spanningButton).toBeDefined();
		expect(spanningButton?.getAttribute('style')).toContain('border-top-left-radius: 4px');
		expect(spanningButton?.getAttribute('style')).toContain('border-top-right-radius: 4px');
		expect(screen.getAllByText('Starts').length).toBeGreaterThan(0);
		expect(screen.getAllByText('Continues').length).toBeGreaterThan(0);
		expect(screen.getAllByText('Ends').length).toBeGreaterThan(0);
	});

	it('does not merge distinct all-day events that share title and time when ids are missing', () => {
		render(CalendarView, {
			props: {
				viewMode: 'month',
				currentDate: new Date(2026, 4, 1, 12),
				workingHours,
				events: [
					{
						summary: 'Launch Window',
						start: { date: '2026-05-11' },
						end: { date: '2026-05-14' },
						allDay: true
					},
					{
						summary: 'Launch Window',
						start: { date: '2026-05-11' },
						end: { date: '2026-05-14' },
						allDay: true
					}
				]
			}
		});

		const spanningBars = screen
			.getAllByRole('button', { name: /Launch Window/i })
			.filter((button) => button.getAttribute('style')?.includes('width: calc('));

		expect(spanningBars.length).toBe(2);
	});
});

describe('CalendarView audit regressions', () => {
	it('labels task calendar markers by kind in day view', () => {
		render(CalendarView, {
			props: {
				viewMode: 'day',
				currentDate: new Date(2026, 4, 11, 9),
				workingHours,
				events: [
					{
						summary: 'Scope build',
						start: { dateTime: '2026-05-11T09:00:00' },
						end: { dateTime: '2026-05-11T10:00:00' },
						itemKind: 'range',
						calendarItem: {
							calendar_item_id: 'task-range',
							item_kind: 'range'
						}
					},
					{
						summary: 'Kickoff task',
						start: { dateTime: '2026-05-11T11:00:00' },
						end: { dateTime: '2026-05-11T11:30:00' },
						itemKind: 'start',
						calendarItem: {
							calendar_item_id: 'task-start',
							item_kind: 'start'
						}
					},
					{
						summary: 'Ship review',
						start: { dateTime: '2026-05-11T15:00:00' },
						end: { dateTime: '2026-05-11T15:30:00' },
						itemKind: 'due',
						calendarItem: {
							calendar_item_id: 'task-due',
							item_kind: 'due'
						}
					}
				]
			}
		});

		expect(screen.getByText('Scheduled')).toBeInTheDocument();
		expect(screen.getByText('Start')).toBeInTheDocument();
		expect(screen.getByText('Due')).toBeInTheDocument();
	});

	it('opens the affected day when a month overflow count is clicked', async () => {
		const handleDateChange = vi.fn();
		const handleViewModeChange = vi.fn();

		render(CalendarView, {
			props: {
				viewMode: 'month',
				currentDate: new Date(2026, 4, 1, 12),
				workingHours,
				events: [
					{
						summary: 'Morning review',
						start: { dateTime: '2026-05-11T09:00:00' },
						end: { dateTime: '2026-05-11T09:30:00' }
					},
					{
						summary: 'Design sync',
						start: { dateTime: '2026-05-11T10:00:00' },
						end: { dateTime: '2026-05-11T10:30:00' }
					},
					{
						summary: 'Build pass',
						start: { dateTime: '2026-05-11T11:00:00' },
						end: { dateTime: '2026-05-11T11:30:00' }
					}
				],
				ondateChange: handleDateChange,
				onviewModeChange: handleViewModeChange
			}
		});

		await fireEvent.click(
			screen.getByRole('button', {
				name: /Open Mon, May 11 day view to see 1 more event/i
			})
		);

		expect(handleViewModeChange).toHaveBeenCalledWith('day');
		expect(handleDateChange).toHaveBeenCalledWith(expect.any(Date));

		const selectedDate = handleDateChange.mock.calls.at(-1)?.[0] as Date;
		expect(selectedDate.getFullYear()).toBe(2026);
		expect(selectedDate.getMonth()).toBe(4);
		expect(selectedDate.getDate()).toBe(11);
	});

	it('shows an explicit empty state for an empty month list', () => {
		render(CalendarView, {
			props: {
				viewMode: 'month',
				currentDate: new Date(2026, 4, 1, 12),
				workingHours,
				events: []
			}
		});

		expect(screen.getByText('No events scheduled for this month')).toBeInTheDocument();
	});
});
