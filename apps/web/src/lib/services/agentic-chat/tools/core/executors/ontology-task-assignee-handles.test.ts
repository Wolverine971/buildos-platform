// apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-task-assignee-handles.test.ts
/**
 * Phase-2 tests for assignee handle resolution in ontology task write tools.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { OntologyWriteExecutor } from './ontology-write-executor';
import type { ExecutorContext } from './types';

const buildJsonResponse = (payload: any) => ({
	ok: true,
	status: 200,
	statusText: 'OK',
	headers: {
		get: () => 'application/json'
	},
	json: async () => payload,
	text: async () => JSON.stringify(payload)
});

describe('OntologyWriteExecutor task assignee handle resolution', () => {
	const userId = 'user-1';
	const sessionId = 'session-1';
	const actorId = 'actor-1';

	let mockSupabase: SupabaseClient<Database>;
	let mockFetch: typeof fetch;
	let context: ExecutorContext;

	beforeEach(() => {
		const createProjectOwnerQuery = (createdBy: string | null = 'actor-owner') => {
			const query = {
				select: vi.fn().mockReturnThis(),
				eq: vi.fn().mockReturnThis(),
				is: vi.fn().mockReturnThis(),
				maybeSingle: vi.fn().mockResolvedValue({
					data: createdBy ? { created_by: createdBy } : null,
					error: null
				})
			};
			return query;
		};

		mockSupabase = {
			from: vi.fn().mockImplementation((table: string) => {
				if (table === 'onto_projects') {
					return createProjectOwnerQuery();
				}
				throw new Error(`Unexpected table query in test: ${table}`);
			}),
			rpc: vi.fn().mockResolvedValue({ data: actorId, error: null }),
			auth: {
				getSession: vi.fn().mockResolvedValue({
					data: { session: { access_token: 'test-token' } }
				})
			}
		} as unknown as SupabaseClient<Database>;

		let lastCreateBody: any = null;
		let lastPatchBody: any = null;

		mockFetch = vi.fn().mockImplementation((url, options) => {
			const urlValue = String(url);
			const body = options?.body ? JSON.parse(options.body as string) : null;

			if (urlValue.includes('/api/onto/projects/project-1/members')) {
				return Promise.resolve(
					buildJsonResponse({
						success: true,
						data: {
							members: [
								{
									actor_id: 'actor-jim',
									actor: {
										id: 'actor-jim',
										user_id: 'user-jim',
										name: 'Jim',
										email: 'jim@example.com'
									}
								},
								{
									actor_id: 'actor-dj',
									actor: {
										id: 'actor-dj',
										user_id: 'user-dj',
										name: 'DJ Wayne',
										email: 'djwayne@example.com'
									}
								}
							]
						}
					})
				);
			}

			if (urlValue.includes('/api/onto/tasks/create')) {
				lastCreateBody = body;
				return Promise.resolve(
					buildJsonResponse({
						success: true,
						data: {
							task: {
								id: 'task-1',
								project_id: body?.project_id,
								title: body?.title ?? 'Untitled'
							}
						}
					})
				);
			}

			if (urlValue.includes('/api/onto/tasks/task-123') && options?.method === 'PATCH') {
				lastPatchBody = body;
				return Promise.resolve(
					buildJsonResponse({
						success: true,
						data: {
							task: {
								id: 'task-123',
								title: 'Existing Task'
							}
						}
					})
				);
			}

			return Promise.resolve({
				ok: false,
				status: 404,
				statusText: 'Not Found',
				headers: { get: () => 'application/json' },
				json: async () => ({ error: 'Unexpected request' }),
				text: async () => 'Unexpected request'
			});
		});

		context = {
			supabase: mockSupabase,
			userId,
			sessionId,
			fetchFn: mockFetch,
			getActorId: async () => actorId,
			getAdminSupabase: () => mockSupabase as any,
			getAuthHeaders: async () => ({})
		};

		(mockFetch as any).lastCreateBody = () => lastCreateBody;
		(mockFetch as any).lastPatchBody = () => lastPatchBody;
	});

	it('resolves @handle inputs for task creation', async () => {
		const executor = new OntologyWriteExecutor(context);

		await executor.createOntoTask({
			project_id: 'project-1',
			title: 'Assign from handle',
			assignee_handles: ['@jim']
		});

		const lastCreateBody = (mockFetch as any).lastCreateBody();
		expect(lastCreateBody.assignee_actor_ids).toEqual(['actor-jim']);
	});

	it('resolves @handle inputs for task updates', async () => {
		const executor = new OntologyWriteExecutor(context);

		await executor.updateOntoTask(
			{
				task_id: 'task-123',
				assignee_handles: ['@dj']
			},
			async () => ({
				task: {
					id: 'task-123',
					project_id: 'project-1',
					description: 'Existing task description'
				}
			})
		);

		const lastPatchBody = (mockFetch as any).lastPatchBody();
		expect(lastPatchBody.assignee_actor_ids).toEqual(['actor-dj']);
	});

	it('throws on ambiguous @handle matches', async () => {
		const ambiguousFetch = vi.fn().mockImplementation((url, options) => {
			const urlValue = String(url);
			if (urlValue.includes('/api/onto/projects/project-1/members')) {
				return Promise.resolve(
					buildJsonResponse({
						success: true,
						data: {
							members: [
								{
									actor_id: 'actor-jim',
									actor: {
										id: 'actor-jim',
										name: 'Jim',
										email: 'jim@example.com'
									}
								},
								{
									actor_id: 'actor-jimmy',
									actor: {
										id: 'actor-jimmy',
										name: 'Jimmy',
										email: 'jimmy@example.com'
									}
								}
							]
						}
					})
				);
			}

			if (urlValue.includes('/api/onto/tasks/create') && options?.method === 'POST') {
				return Promise.resolve(
					buildJsonResponse({
						success: true,
						data: { task: { id: 'task-should-not-create' } }
					})
				);
			}

			return Promise.resolve({
				ok: false,
				status: 404,
				statusText: 'Not Found',
				headers: { get: () => 'application/json' },
				json: async () => ({ error: 'Unexpected request' }),
				text: async () => 'Unexpected request'
			});
		});

		const ambiguousContext: ExecutorContext = {
			...context,
			fetchFn: ambiguousFetch
		};
		const executor = new OntologyWriteExecutor(ambiguousContext);

		await expect(
			executor.createOntoTask({
				project_id: 'project-1',
				title: 'Ambiguous handle task',
				assignee_handles: ['@ji']
			})
		).rejects.toThrow('Ambiguous assignee handle');
	});

	it('allows explicit assignee actor IDs when they belong to active members', async () => {
		const executor = new OntologyWriteExecutor(context);

		await executor.createOntoTask({
			project_id: 'project-1',
			title: 'Assign by actor ID',
			assignee_actor_ids: ['actor-jim']
		});

		const lastCreateBody = (mockFetch as any).lastCreateBody();
		expect(lastCreateBody.assignee_actor_ids).toEqual(['actor-jim']);
	});

	it('loads project context when updating assignees by explicit actor IDs', async () => {
		const executor = new OntologyWriteExecutor(context);

		await executor.updateOntoTask(
			{
				task_id: 'task-123',
				assignee_actor_ids: ['actor-dj']
			},
			async () => ({
				task: {
					id: 'task-123',
					project_id: 'project-1'
				}
			})
		);

		const lastPatchBody = (mockFetch as any).lastPatchBody();
		expect(lastPatchBody.assignee_actor_ids).toEqual(['actor-dj']);
	});

	it('rejects explicit assignee actor IDs that are not active project members', async () => {
		const executor = new OntologyWriteExecutor(context);

		await expect(
			executor.createOntoTask({
				project_id: 'project-1',
				title: 'Assign by invalid actor ID',
				assignee_actor_ids: ['actor-removed']
			})
		).rejects.toThrow('assignee_actor_ids must reference active project members');

		const lastCreateBody = (mockFetch as any).lastCreateBody();
		expect(lastCreateBody).toBeNull();
	});
});
