// apps/web/src/lib/components/project/ProjectCalendarSettingsModal.test.ts
// @vitest-environment jsdom
// apps/web/src/lib/components/project/ProjectCalendarSettingsModal.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import ProjectCalendarSettingsModal from './ProjectCalendarSettingsModal.svelte';

const { fetchCalendarItemsMock } = vi.hoisted(() => ({
	fetchCalendarItemsMock: vi.fn()
}));

vi.mock('$lib/services/calendar-items.service', () => ({
	fetchCalendarItems: fetchCalendarItemsMock
}));

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function okJson(payload: Record<string, unknown>) {
	return Promise.resolve({
		ok: true,
		status: 200,
		json: async () => payload
	} as Response);
}

function buildProject() {
	return {
		id: PROJECT_ID,
		name: 'Launch Plan',
		description: 'Project for launch planning',
		type_key: 'project.general',
		state_key: 'active',
		props: {},
		created_by: USER_ID,
		created_at: new Date().toISOString(),
		updated_at: new Date().toISOString()
	} as any;
}

describe('ProjectCalendarSettingsModal sync coverage and health', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		fetchCalendarItemsMock.mockResolvedValue([]);
		Object.defineProperty(window, 'scrollTo', {
			configurable: true,
			writable: true,
			value: vi.fn()
		});
		global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			const method = init?.method || 'GET';

			if (method === 'GET' && url === `/api/onto/projects/${PROJECT_ID}/calendar`) {
				return okJson({
					success: true,
					data: {
						calendar_name: 'Launch Plan - Tasks',
						color_id: '7',
						sync_enabled: true,
						sync_mode: 'member_fanout'
					}
				});
			}

			if (
				method === 'GET' &&
				url === `/api/onto/projects/${PROJECT_ID}/calendar/collaboration`
			) {
				return okJson({
					success: true,
					data: {
						sync_mode: 'member_fanout',
						total_members: 1,
						mapped_members: 1,
						active_sync_members: 1,
						pending_invite_count: 1,
						pending_invites: [
							{
								invitee_email: 'pending@example.com',
								role_key: 'editor',
								access: 'write',
								expires_at: new Date(Date.now() + 86400000).toISOString()
							}
						],
						members: [
							{
								actor_id: 'actor-1',
								user_id: USER_ID,
								display_name: 'You',
								email: 'you@example.com',
								role_key: 'owner',
								access: 'admin',
								has_calendar: true,
								sync_enabled: true,
								calendar_name: 'Launch Plan - Tasks',
								sync_status: 'active',
								is_current_user: true
							}
						]
					}
				});
			}

			if (
				method === 'GET' &&
				url.startsWith(`/api/onto/projects/${PROJECT_ID}/calendar/sync-health`)
			) {
				return okJson({
					success: true,
					data: {
						events: [
							{
								event_id: 'event-1',
								title: 'Kickoff Call',
								start_at: new Date().toISOString(),
								end_at: new Date(Date.now() + 3600000).toISOString(),
								updated_at: new Date().toISOString(),
								deleted_at: null,
								targets: [
									{
										user_id: USER_ID,
										display_name: 'You',
										email: 'you@example.com',
										sync_status: 'failed',
										sync_error: 'Google permission denied',
										last_synced_at: null,
										queue_status: 'failed',
										queue_attempts: 2,
										queue_max_attempts: 3,
										queue_error: 'Google permission denied',
										retry_action: 'upsert',
										can_retry: true
									}
								]
							}
						],
						summary: {
							total_events: 1,
							total_targets: 1,
							failed_targets: 1,
							active_queue_targets: 0
						}
					}
				});
			}

			if (
				method === 'POST' &&
				url === `/api/onto/projects/${PROJECT_ID}/calendar/sync-health`
			) {
				return okJson({
					success: true,
					data: { queue_job_id: 'job-1' }
				});
			}

			return okJson({ success: true, data: {} });
		}) as any;
	});

	it('renders pending invitees in Team Sync Coverage', async () => {
		render(ProjectCalendarSettingsModal, {
			props: {
				isOpen: true,
				project: buildProject()
			}
		});

		await fireEvent.click(screen.getByRole('tab', { name: /settings/i }));

		await waitFor(() => {
			expect(screen.getByText('Team Sync Coverage')).toBeInTheDocument();
		});
		expect(screen.getByText('pending@example.com')).toBeInTheDocument();
		expect(screen.getByText('Pending invite')).toBeInTheDocument();
		expect(screen.getByText('Not linked')).toBeInTheDocument();
	});

	it('shows event sync health and allows retry', async () => {
		render(ProjectCalendarSettingsModal, {
			props: {
				isOpen: true,
				project: buildProject()
			}
		});

		await fireEvent.click(screen.getByRole('tab', { name: /settings/i }));

		await waitFor(() => {
			expect(screen.getByText('Event Sync Health')).toBeInTheDocument();
		});
		expect(screen.getByText('Kickoff Call')).toBeInTheDocument();
		expect(screen.getByText('Attempts: 2/3')).toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: /retry/i }));

		await waitFor(() => {
			expect(global.fetch).toHaveBeenCalledWith(
				`/api/onto/projects/${PROJECT_ID}/calendar/sync-health`,
				expect.objectContaining({
					method: 'POST'
				})
			);
		});
	});
});
