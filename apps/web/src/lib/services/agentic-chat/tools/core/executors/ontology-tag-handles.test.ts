// apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-tag-handles.test.ts
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

describe('OntologyWriteExecutor tag_onto_entity handle resolution', () => {
	const userId = 'user-1';
	const sessionId = 'session-1';
	const actorId = 'actor-1';

	let mockSupabase: SupabaseClient<Database>;
	let mockFetch: typeof fetch;
	let context: ExecutorContext;

	beforeEach(() => {
		mockSupabase = {
			from: vi.fn(),
			rpc: vi.fn().mockResolvedValue({ data: actorId, error: null }),
			auth: {
				getSession: vi.fn().mockResolvedValue({
					data: { session: { access_token: 'test-token' } }
				})
			}
		} as unknown as SupabaseClient<Database>;

		let lastPingBody: any = null;
		let lastDocumentPatchBody: any = null;

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

			if (urlValue.includes('/api/onto/documents/doc-1/full') && options?.method === 'GET') {
				return Promise.resolve(
					buildJsonResponse({
						success: true,
						data: {
							document: {
								id: 'doc-1',
								project_id: 'project-1',
								title: 'Doc title',
								description: null,
								content: 'Existing content'
							}
						}
					})
				);
			}

			if (urlValue.includes('/api/onto/documents/doc-1') && options?.method === 'PATCH') {
				lastDocumentPatchBody = body;
				return Promise.resolve(
					buildJsonResponse({
						success: true,
						data: {
							document: {
								id: 'doc-1',
								project_id: 'project-1',
								content: body?.content ?? ''
							}
						}
					})
				);
			}

			if (urlValue.includes('/api/onto/mentions/ping') && options?.method === 'POST') {
				lastPingBody = body;
				return Promise.resolve(
					buildJsonResponse({
						success: true,
						data: {
							project_id: body?.project_id,
							entity_type: body?.entity_type,
							entity_id: body?.entity_id,
							mentioned_user_ids: body?.mentioned_user_ids ?? [],
							notified_user_ids: body?.mentioned_user_ids ?? []
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

		(mockFetch as any).lastPingBody = () => lastPingBody;
		(mockFetch as any).lastDocumentPatchBody = () => lastDocumentPatchBody;
	});

	it('resolves @handles and posts user IDs to mention ping endpoint in ping mode', async () => {
		const executor = new OntologyWriteExecutor(context);

		await executor.tagOntoEntity({
			project_id: 'project-1',
			entity_type: 'document',
			entity_id: 'doc-1',
			mode: 'ping',
			mentioned_handles: ['@jim']
		});

		const lastPingBody = (mockFetch as any).lastPingBody();
		expect(lastPingBody.mentioned_user_ids).toEqual(['user-jim']);
	});

	it('appends canonical mention tokens to document content in content mode', async () => {
		const executor = new OntologyWriteExecutor(context);

		await executor.tagOntoEntity({
			project_id: 'project-1',
			entity_type: 'document',
			entity_id: 'doc-1',
			mode: 'content',
			mentioned_handles: ['@jim'],
			message: 'Please review this section.'
		});

		const lastDocumentPatchBody = (mockFetch as any).lastDocumentPatchBody();
		expect(lastDocumentPatchBody.content).toContain('Existing content');
		expect(lastDocumentPatchBody.content).toContain('[[user:user-jim|Jim]]');
		expect(lastDocumentPatchBody.content).toContain('Please review this section.');
	});

	it('throws on ambiguous mention handle matches', async () => {
		const ambiguousFetch = vi.fn().mockImplementation((url) => {
			const urlValue = String(url);
			if (urlValue.includes('/api/onto/projects/project-1/members')) {
				return Promise.resolve(
					buildJsonResponse({
						success: true,
						data: {
							members: [
								{
									actor_id: 'actor-jim',
									actor: { id: 'actor-jim', user_id: 'user-jim', name: 'Jim' }
								},
								{
									actor_id: 'actor-jimmy',
									actor: {
										id: 'actor-jimmy',
										user_id: 'user-jimmy',
										name: 'Jimmy'
									}
								}
							]
						}
					})
				);
			}

			if (urlValue.includes('/api/onto/mentions/ping')) {
				return Promise.resolve(
					buildJsonResponse({
						success: true,
						data: {
							project_id: 'project-1',
							entity_type: 'task',
							entity_id: 'task-1',
							mentioned_user_ids: [],
							notified_user_ids: []
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

		const ambiguousContext: ExecutorContext = {
			...context,
			fetchFn: ambiguousFetch
		};
		const executor = new OntologyWriteExecutor(ambiguousContext);

		await expect(
			executor.tagOntoEntity({
				project_id: 'project-1',
				entity_type: 'task',
				entity_id: 'task-1',
				mentioned_handles: ['@ji']
			})
		).rejects.toThrow('Ambiguous mention handle');
	});
});
