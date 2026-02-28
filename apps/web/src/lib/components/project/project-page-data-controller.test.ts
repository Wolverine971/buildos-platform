// apps/web/src/lib/components/project/project-page-data-controller.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	fetchProjectEvents,
	fetchProjectFullData,
	fetchProjectMembers,
	fetchProjectNotificationSettings,
	fetchProjectSnapshot,
	updateProjectNotificationSettings
} from './project-page-data-controller';

type MockResponseOptions = {
	ok?: boolean;
	status?: number;
	body?: unknown;
};

function mockJsonResponse(options: MockResponseOptions = {}): Promise<Response> {
	const { ok = true, status = 200, body = {} } = options;
	return Promise.resolve({
		ok,
		status,
		json: async () => body
	} as Response);
}

describe('project-page-data-controller', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		global.fetch = vi.fn();
	});

	it('fetchProjectFullData returns parsed data payload', async () => {
		(global.fetch as any).mockImplementation(() =>
			mockJsonResponse({
				body: {
					data: {
						project: { id: 'project-1', name: 'Project 1' },
						tasks: [{ id: 'task-1' }]
					}
				}
			})
		);

		const result = await fetchProjectFullData('project-1');

		expect(result.project).toMatchObject({ id: 'project-1' });
		expect(result.tasks).toHaveLength(1);
		expect(global.fetch).toHaveBeenCalledWith('/api/onto/projects/project-1/full', undefined);
	});

	it('fetchProjectFullData throws when response has no data object', async () => {
		(global.fetch as any).mockImplementation(() => mockJsonResponse({ body: {} }));

		await expect(fetchProjectFullData('project-1')).rejects.toThrow(
			'No data returned from server'
		);
	});

	it('fetchProjectSnapshot returns empty object when data payload is absent', async () => {
		(global.fetch as any).mockImplementation(() => mockJsonResponse({ body: {} }));

		await expect(fetchProjectSnapshot('project-1')).resolves.toEqual({});
	});

	it('fetchProjectEvents returns events list and falls back to empty list', async () => {
		(global.fetch as any)
			.mockImplementationOnce(() =>
				mockJsonResponse({ body: { data: { events: [{ id: 'evt-1' }] } } })
			)
			.mockImplementationOnce(() => mockJsonResponse({ body: { data: {} } }));

		await expect(fetchProjectEvents('project-1')).resolves.toHaveLength(1);
		await expect(fetchProjectEvents('project-1')).resolves.toEqual([]);
	});

	it('fetchProjectMembers returns members and actor id', async () => {
		(global.fetch as any).mockImplementation(() =>
			mockJsonResponse({
				body: {
					data: {
						members: [
							{
								actor_id: 'actor-1',
								actor: {
									id: 'actor-1',
									user_id: null,
									name: 'Ada',
									email: 'ada@example.com'
								}
							}
						],
						actorId: 'actor-1'
					}
				}
			})
		);

		const result = await fetchProjectMembers('project-1');

		expect(result.members).toHaveLength(1);
		expect(result.actorId).toBe('actor-1');
		expect(global.fetch).toHaveBeenCalledWith(
			'/api/onto/projects/project-1/members',
			expect.objectContaining({ method: 'GET', credentials: 'same-origin' })
		);
	});

	it('fetchProjectNotificationSettings throws with API error message', async () => {
		(global.fetch as any).mockImplementation(() =>
			mockJsonResponse({ ok: false, status: 400, body: { error: 'bad settings' } })
		);

		await expect(fetchProjectNotificationSettings('project-1')).rejects.toThrow('bad settings');
	});

	it('updateProjectNotificationSettings sends PATCH and returns parsed settings', async () => {
		(global.fetch as any).mockImplementation(() =>
			mockJsonResponse({
				body: {
					data: {
						settings: {
							project_id: 'project-1',
							member_count: 1,
							is_shared_project: true,
							project_default_enabled: true,
							member_enabled: false,
							effective_enabled: false,
							member_overridden: true,
							can_manage_default: true
						}
					}
				}
			})
		);

		const result = await updateProjectNotificationSettings({
			projectId: 'project-1',
			memberEnabled: false
		});

		expect(result?.member_enabled).toBe(false);
		expect(global.fetch).toHaveBeenCalledWith(
			'/api/onto/projects/project-1/notification-settings',
			expect.objectContaining({
				method: 'PATCH',
				credentials: 'same-origin',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ member_enabled: false })
			})
		);
	});
});
