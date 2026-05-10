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
});
