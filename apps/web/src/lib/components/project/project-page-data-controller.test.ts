// apps/web/src/lib/components/project/project-page-data-controller.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
	archiveProjectDocument,
	deleteProject,
	fetchProjectBriefs,
	fetchProjectLogs,
	fetchProjectEvents,
	fetchProjectFullData,
	fetchProjectMembers,
	fetchProjectNotificationSettings,
	fetchProjectSnapshot,
	generateProjectNextStep,
	moveProjectDocument,
	updateProjectMilestoneState,
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

function successBody(data: unknown) {
	return {
		success: true,
		data
	};
}

describe('project-page-data-controller', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		global.fetch = vi.fn();
	});

	it('fetchProjectFullData returns parsed data payload', async () => {
		(global.fetch as any).mockImplementation(() =>
			mockJsonResponse({
				body: successBody({
					project: { id: 'project-1', name: 'Project 1' },
					tasks: [{ id: 'task-1' }],
					events: [{ id: 'event-1' }],
					public_page_counts: { total: 2, live: 1 }
				})
			})
		);

		const result = await fetchProjectFullData('project-1');

		expect(result.project).toMatchObject({ id: 'project-1' });
		expect(result.tasks).toHaveLength(1);
		expect(result.events).toHaveLength(1);
		expect(result.public_page_counts).toEqual({ total: 2, live: 1 });
		expect(global.fetch).toHaveBeenCalledWith('/api/onto/projects/project-1/full', undefined);
	});

	it('fetchProjectFullData throws when response contract is invalid', async () => {
		(global.fetch as any).mockImplementation(() => mockJsonResponse({ body: {} }));

		await expect(fetchProjectFullData('project-1')).rejects.toThrow(
			'Invalid API response contract'
		);
	});

	it('fetchProjectSnapshot throws when the project payload is missing', async () => {
		(global.fetch as any).mockImplementation(() =>
			mockJsonResponse({ body: successBody({ tasks: [] }) })
		);

		await expect(fetchProjectSnapshot('project-1')).rejects.toThrow(
			'Invalid project snapshot response'
		);
	});

	it('fetchProjectSnapshot uses the optimized full project endpoint', async () => {
		(global.fetch as any).mockImplementation(() =>
			mockJsonResponse({
				body: successBody({
					project: { id: 'project-1', name: 'Project 1' },
					tasks: []
				})
			})
		);

		const result = await fetchProjectSnapshot('project-1');

		expect(result.project).toMatchObject({ id: 'project-1' });
		expect(global.fetch).toHaveBeenCalledWith('/api/onto/projects/project-1/full', undefined);
	});

	it('fetchProjectEvents returns events list', async () => {
		(global.fetch as any).mockImplementationOnce(() =>
			mockJsonResponse({ body: successBody({ events: [{ id: 'evt-1' }] }) })
		);

		await expect(fetchProjectEvents('project-1')).resolves.toHaveLength(1);
	});

	it('fetchProjectMembers returns members and actor id', async () => {
		(global.fetch as any).mockImplementation(() =>
			mockJsonResponse({
				body: successBody({
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
				})
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
			mockJsonResponse({
				ok: false,
				status: 400,
				body: { success: false, error: 'bad settings' }
			})
		);

		await expect(fetchProjectNotificationSettings('project-1')).rejects.toThrow('bad settings');
	});

	it('updateProjectNotificationSettings sends PATCH and returns parsed settings', async () => {
		(global.fetch as any).mockImplementation(() =>
			mockJsonResponse({
				body: successBody({
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
				})
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

	it('fetchProjectLogs validates paginated payloads', async () => {
		(global.fetch as any).mockImplementation(() =>
			mockJsonResponse({
				body: successBody({
					logs: [{ id: 'log-1', created_at: '2026-01-01T00:00:00.000Z' }],
					total: 1,
					hasMore: false
				})
			})
		);

		const result = await fetchProjectLogs({ projectId: 'project-1', limit: 10, offset: 0 });

		expect(result.total).toBe(1);
		expect(result.logs).toHaveLength(1);
		expect(global.fetch).toHaveBeenCalledWith(
			'/api/onto/projects/project-1/logs?limit=10&offset=0',
			undefined
		);
	});

	it('fetchProjectBriefs validates paginated payloads', async () => {
		(global.fetch as any).mockImplementation(() =>
			mockJsonResponse({
				body: successBody({
					briefs: [
						{
							id: 'brief-1',
							brief_content: 'Summary',
							metadata: null,
							created_at: '2026-01-01T00:00:00.000Z',
							brief_date: '2026-01-01',
							daily_brief_id: 'daily-1',
							executive_summary: null,
							priority_actions: null
						}
					],
					total: 1,
					hasMore: false
				})
			})
		);

		const result = await fetchProjectBriefs({ projectId: 'project-1', limit: 5, offset: 0 });

		expect(result.total).toBe(1);
		expect(result.briefs[0]?.id).toBe('brief-1');
		expect(global.fetch).toHaveBeenCalledWith(
			'/api/onto/projects/project-1/briefs?limit=5&offset=0',
			undefined
		);
	});

	it('generateProjectNextStep normalizes missing long text to the short text', async () => {
		(global.fetch as any).mockImplementation(() =>
			mockJsonResponse({
				body: successBody({
					next_step_short: 'Draft the brief',
					next_step_long: null,
					next_step_source: 'ai',
					next_step_updated_at: '2026-01-01T00:00:00.000Z'
				})
			})
		);

		const result = await generateProjectNextStep('project-1');

		expect(result.next_step_short).toBe('Draft the brief');
		expect(result.next_step_long).toBe('Draft the brief');
		expect(global.fetch).toHaveBeenCalledWith(
			'/api/onto/projects/project-1/next-step/generate',
			expect.objectContaining({ method: 'POST' })
		);
	});

	it('project mutation helpers reuse the standard response contract', async () => {
		(global.fetch as any)
			.mockImplementationOnce(() =>
				mockJsonResponse({ body: successBody({ structure: { root: [] } }) })
			)
			.mockImplementationOnce(() => mockJsonResponse({ body: successBody({ id: 'doc-1' }) }))
			.mockImplementationOnce(() =>
				mockJsonResponse({ body: successBody({ id: 'milestone-1' }) })
			)
			.mockImplementationOnce(() =>
				mockJsonResponse({ body: successBody({ id: 'project-1', deleteType: 'soft' }) })
			);

		await expect(
			moveProjectDocument({
				projectId: 'project-1',
				documentId: 'doc-1',
				newParentId: null,
				newPosition: 0
			})
		).resolves.toMatchObject({ structure: { root: [] } });

		await expect(
			archiveProjectDocument({
				documentId: 'doc-1',
				mode: 'archive_children'
			})
		).resolves.toMatchObject({ id: 'doc-1' });

		await expect(
			updateProjectMilestoneState({
				milestoneId: 'milestone-1',
				stateKey: 'completed'
			})
		).resolves.toMatchObject({ id: 'milestone-1' });

		await expect(deleteProject('project-1')).resolves.toMatchObject({
			id: 'project-1',
			deleteType: 'soft'
		});
	});
});
