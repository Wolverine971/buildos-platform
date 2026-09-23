// apps/web/src/lib/components/scheduling/CalendarItemPanel.test.ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/svelte';
import CalendarItemPanel from './CalendarItemPanel.svelte';
import type { CalendarItem } from '$lib/types/calendar-items';

function calendarItem(overrides: Partial<CalendarItem>): CalendarItem {
	return {
		calendar_item_id: 'item-1',
		item_type: 'task',
		item_kind: 'due',
		source_table: 'onto_tasks',
		title: 'Due: Ask the wealth manager about the Q4 rebalancing plan',
		start_at: new Date(2026, 8, 23, 23, 29).toISOString(),
		end_at: new Date(2026, 8, 23, 23, 59).toISOString(),
		all_day: false,
		timezone: null,
		project_id: 'project-1',
		owner_entity_type: 'task',
		owner_entity_id: 'task-1',
		task_id: 'task-1',
		event_id: null,
		state_key: 'todo',
		type_key: 'task.default',
		props: {},
		created_at: '2026-09-01T12:00:00.000Z',
		updated_at: '2026-09-01T12:00:00.000Z',
		...overrides
	};
}

describe('CalendarItemPanel', () => {
	beforeEach(() => {
		vi.useFakeTimers({ toFake: ['Date'] });
		vi.setSystemTime(new Date(2026, 8, 22, 10, 0));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('shows the full task name, real deadline, and quick actions', async () => {
		const onMarkDone = vi.fn();
		const onReschedule = vi.fn();
		render(CalendarItemPanel, {
			props: {
				item: calendarItem({}),
				detail: {
					type: 'task',
					data: {
						id: 'task-1',
						state_key: 'in_progress',
						priority: 2,
						due_at: new Date(2026, 8, 23, 23, 59).toISOString(),
						assignees: [{ name: 'DJ Wayne' }],
						description: 'Bring last quarter statements.'
					},
					linkedEntities: {
						goals: [{ id: 'goal-1', name: 'Close 3 clients' }],
						plans: [],
						milestones: [],
						documents: [],
						dependentTasks: []
					}
				},
				project: {
					id: 'project-1',
					name: 'Samos Offers',
					state_key: 'active',
					description: null,
					facet_stage: null,
					facet_scale: null
				},
				onClose: vi.fn(),
				onMarkDone,
				onReschedule
			}
		});

		expect(
			screen.getByRole('heading', {
				name: 'Ask the wealth manager about the Q4 rebalancing plan'
			})
		).toBeInTheDocument();
		expect(screen.getByText('Due 11:59 PM')).toBeInTheDocument();
		expect(screen.getByText('Due tomorrow')).toBeInTheDocument();
		expect(screen.getByText('In progress')).toBeInTheDocument();
		expect(screen.getByText('P2 High')).toBeInTheDocument();
		expect(screen.getByText('DJ Wayne')).toBeInTheDocument();
		expect(screen.getByText('Samos Offers')).toBeInTheDocument();
		expect(screen.getByText('Bring last quarter statements.')).toBeInTheDocument();
		expect(screen.getByRole('link', { name: /Close 3 clients/ })).toHaveAttribute(
			'href',
			'/projects/project-1?entity=goal&entity_id=goal-1'
		);

		await fireEvent.click(screen.getByRole('button', { name: /Mark done/ }));
		expect(onMarkDone).toHaveBeenCalled();
		await fireEvent.click(screen.getByRole('button', { name: /Next week/ }));
		expect(onReschedule).toHaveBeenCalledWith('nextWeek');
		// Already due tomorrow, so "Tomorrow" has nothing to do.
		expect(screen.getByRole('button', { name: /Tomorrow/ })).toBeDisabled();
	});

	it('gives Google events their duration, meeting link, and guests', () => {
		render(CalendarItemPanel, {
			props: {
				item: calendarItem({
					item_type: 'event',
					item_kind: 'event',
					source_table: 'google_calendar',
					title: 'Client sync',
					start_at: new Date(2026, 8, 22, 14).toISOString(),
					end_at: new Date(2026, 8, 22, 15, 30).toISOString(),
					project_id: null,
					task_id: null,
					calendar_source_label: 'Work · dj@example.com',
					calendar_source_color: '#7986cb',
					props: {
						meeting_url: 'https://meet.google.com/abc',
						description: 'Agenda<br>Pricing',
						external_link: 'https://calendar.google.com/event?eid=1',
						attendees: [
							{
								name: 'Ana',
								email: 'ana@example.com',
								response: 'accepted',
								organizer: true,
								self: false,
								optional: false
							},
							{
								name: null,
								email: 'dj@example.com',
								response: 'needsAction',
								organizer: false,
								self: true,
								optional: false
							}
						]
					}
				}),
				detail: { type: 'event', data: {} },
				project: null,
				onClose: vi.fn()
			}
		});

		expect(screen.getByText('2:00 – 3:30 PM')).toBeInTheDocument();
		expect(screen.getByText('1h 30m')).toBeInTheDocument();
		expect(screen.getByText('Starts in 4 hours')).toBeInTheDocument();
		expect(screen.getByRole('link', { name: /Join meeting/ })).toHaveAttribute(
			'href',
			'https://meet.google.com/abc'
		);
		expect(screen.getByText('2 guests')).toBeInTheDocument();
		expect(screen.getByText('1 yes · 1 awaiting')).toBeInTheDocument();
		expect(screen.getByText('Work · dj@example.com')).toBeInTheDocument();
		expect(screen.getByText(/Agenda\s+Pricing/)).toBeInTheDocument();
		expect(screen.getByRole('link', { name: /Open in Google Calendar/ })).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /Mark done/ })).toBeNull();
	});
});
