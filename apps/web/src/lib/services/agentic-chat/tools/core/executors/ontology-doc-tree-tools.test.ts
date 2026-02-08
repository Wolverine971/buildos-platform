// apps/web/src/lib/services/agentic-chat/tools/core/executors/ontology-doc-tree-tools.test.ts
/**
 * Tests for document tree tooling behaviors (placement, unlinked path reporting).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { OntologyWriteExecutor } from './ontology-write-executor';
import { OntologyReadExecutor } from './ontology-read-executor';
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

describe('Ontology document tree tools', () => {
	const userId = 'user-123';
	const sessionId = 'session-456';
	const actorId = 'actor-789';

	let mockSupabase: SupabaseClient<Database>;
	let mockFetch: typeof fetch;
	let context: ExecutorContext;

	beforeEach(() => {
		const chain = {
			select: vi.fn().mockReturnThis(),
			eq: vi.fn().mockReturnThis(),
			in: vi.fn().mockReturnThis(),
			maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'project-1' }, error: null })
		};

		mockSupabase = {
			from: vi.fn(() => chain),
			rpc: vi.fn().mockResolvedValue({ data: actorId, error: null }),
			auth: {
				getSession: vi.fn().mockResolvedValue({
					data: { session: { access_token: 'test-token' } }
				})
			}
		} as unknown as SupabaseClient<Database>;

		let lastCreateBody: any = null;
		let lastMoveBody: any = null;
		mockFetch = vi.fn().mockImplementation((url, options) => {
			if (String(url).includes('/api/onto/documents/create')) {
				lastCreateBody = options?.body ? JSON.parse(options.body as string) : null;
				return Promise.resolve(
					buildJsonResponse({
						document: {
							id: 'doc-1',
							title: lastCreateBody?.title ?? 'Untitled'
						}
					})
				);
			}

			if (String(url).includes('/api/onto/projects/project-1/doc-tree/move')) {
				lastMoveBody = options?.body ? JSON.parse(options.body as string) : null;
				return Promise.resolve(
					buildJsonResponse({
						structure: { version: 1, root: [] }
					})
				);
			}

			if (String(url).includes('/api/onto/projects/project-1/doc-tree')) {
				return Promise.resolve(
					buildJsonResponse({
						structure: { version: 1, root: [] },
						documents: {
							'doc-unlinked': { id: 'doc-unlinked', title: 'Unlinked Doc' }
						},
						unlinked: ['doc-unlinked']
					})
				);
			}

			return Promise.resolve({
				ok: false,
				status: 500,
				statusText: 'Internal Server Error',
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

		// Attach lastCreateBody to the fetch mock for assertions
		(mockFetch as any).lastCreateBody = () => lastCreateBody;
		(mockFetch as any).lastMoveBody = () => lastMoveBody;
	});

	it('passes parent_id and position when creating documents', async () => {
		const executor = new OntologyWriteExecutor(context);

		await executor.createOntoDocument({
			project_id: 'project-1',
			title: 'Placement Doc',
			description: 'Doc for placement testing',
			type_key: 'document.context.project',
			parent_id: 'parent-123',
			position: 2
		});

		const lastBody = (mockFetch as any).lastCreateBody();
		expect(lastBody.parent_id).toBe('parent-123');
		expect(lastBody.position).toBe(2);
	});

	it('returns a not-found message when the document is not in the tree', async () => {
		const executor = new OntologyReadExecutor(context);

		const result = await executor.getDocumentPath({
			project_id: 'project-1',
			document_id: 'doc-unlinked'
		});

		expect(result.path).toHaveLength(0);
		expect(result.message.toLowerCase()).toContain('not found');
	});

	it('posts move payload when rehoming documents in the tree', async () => {
		const executor = new OntologyWriteExecutor(context);

		await executor.moveDocumentInTree({
			project_id: 'project-1',
			document_id: 'doc-unlinked',
			new_parent_id: 'parent-123',
			new_position: 1
		});

		const lastBody = (mockFetch as any).lastMoveBody();
		expect(lastBody).toEqual({
			document_id: 'doc-unlinked',
			new_parent_id: 'parent-123',
			new_position: 1
		});
	});
});
