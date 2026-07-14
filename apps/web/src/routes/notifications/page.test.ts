// apps/web/src/routes/notifications/page.test.ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/svelte';
import NotificationsPage from './+page.svelte';

function deliveryRow(overrides: Record<string, unknown> = {}) {
	return {
		id: 'delivery-1',
		event_id: 'event-1',
		correlation_id: 'correlation-1',
		feed_kind: 'delivery',
		channel: 'email',
		status: 'failed',
		attempts: 2,
		max_attempts: 3,
		opened_at: new Date().toISOString(),
		clicked_at: null,
		failed_at: new Date().toISOString(),
		last_error: 'SMTP 550 mailbox provider rejected recipient',
		created_at: new Date().toISOString(),
		payload: {
			title: 'Task assigned',
			body: 'You own Draft launch plan',
			action_url: '/projects/project-1/tasks/task-1'
		},
		notification_events: {
			id: 'event-record-1',
			event_type: 'task.assigned',
			payload: {
				task_name: 'Draft launch plan',
				project_name: 'Author Training',
				project_id: 'project-1',
				task_id: 'task-1'
			}
		},
		...overrides
	};
}

describe('/notifications', () => {
	afterEach(cleanup);

	it('shows the activity and action without delivery telemetry or raw identifiers', () => {
		render(NotificationsPage, {
			props: { data: { notifications: [deliveryRow()], error: null } as never }
		});

		expect(screen.getByText('Task assigned')).toBeInTheDocument();
		expect(screen.getByText('You own Draft launch plan')).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'Open task' })).toHaveAttribute(
			'href',
			'/projects/project-1/tasks/task-1'
		);
		expect(screen.queryByText('/projects/project-1/tasks/task-1')).not.toBeInTheDocument();
		expect(screen.queryByText('Failed')).not.toBeInTheDocument();
		expect(screen.queryByText('email')).not.toBeInTheDocument();
		expect(screen.queryByText(/Attempt 2\/3/)).not.toBeInTheDocument();
		expect(screen.queryByText(/Opened/)).not.toBeInTheDocument();
		expect(
			screen.queryByText('SMTP 550 mailbox provider rejected recipient')
		).not.toBeInTheDocument();
	});

	it('uses safe copy for unknown event types and brief failures', () => {
		const unknown = deliveryRow({
			id: 'delivery-unknown',
			event_id: 'event-unknown',
			correlation_id: 'correlation-unknown',
			payload: {},
			notification_events: {
				id: 'event-record-unknown',
				event_type: 'agent.internal_state_changed',
				payload: {}
			}
		});
		const briefFailure = deliveryRow({
			id: 'delivery-brief',
			event_id: 'event-brief',
			correlation_id: 'correlation-brief',
			payload: {},
			notification_events: {
				id: 'event-record-brief',
				event_type: 'brief.failed',
				payload: {
					error_message: 'DB_TIMEOUT relation notification_events missing',
					retry_count: 4
				}
			}
		});

		render(NotificationsPage, {
			props: { data: { notifications: [unknown, briefFailure], error: null } as never }
		});

		expect(screen.getByText('Update')).toBeInTheDocument();
		expect(screen.getByText('Something changed in BuildOS')).toBeInTheDocument();
		expect(
			screen.getByText('Your daily brief could not be prepared. Open Today to try again.')
		).toBeInTheDocument();
		expect(screen.queryByText(/agent.internal_state_changed/)).not.toBeInTheDocument();
		expect(
			screen.queryByText('DB_TIMEOUT relation notification_events missing')
		).not.toBeInTheDocument();
		expect(screen.queryByText('Retries:')).not.toBeInTheDocument();
	});
});
