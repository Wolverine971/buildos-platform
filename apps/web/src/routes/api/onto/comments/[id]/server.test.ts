// apps/web/src/routes/api/onto/comments/[id]/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminSupabaseClientMock } = vi.hoisted(() => ({
	createAdminSupabaseClientMock: vi.fn()
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: createAdminSupabaseClientMock
}));

vi.mock('$lib/server/comment-public-access', () => ({
	resolveCommentEntityOwnerActorId: vi.fn()
}));

vi.mock('../../shared/error-logging', () => ({
	logOntologyApiError: vi.fn()
}));

vi.mock('../comment-mentions', () => ({
	handleCommentMentions: vi.fn()
}));

import { DELETE, PATCH } from './+server';

const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function createLocals() {
	return {
		supabase: {
			rpc: vi.fn(),
			from: vi.fn()
		},
		safeGetSession: vi.fn().mockResolvedValue({
			user: { id: USER_ID, email: 'builder@example.com' }
		})
	};
}

describe('/api/onto/comments/[id] UUID validation', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('rejects malformed PATCH IDs before reading the request body or database', async () => {
		const locals = createLocals();
		const response = await PATCH({
			params: { id: 'preview-comment' },
			request: new Request('http://localhost/api/onto/comments/preview-comment', {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ body: 'Updated comment' })
			}),
			locals
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload.error).toBe('Invalid comment ID');
		expect(locals.supabase.from).not.toHaveBeenCalled();
		expect(createAdminSupabaseClientMock).not.toHaveBeenCalled();
	});

	it('rejects malformed DELETE IDs before database access', async () => {
		const locals = createLocals();
		const response = await DELETE({
			params: { id: 'preview-comment' },
			locals
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload.error).toBe('Invalid comment ID');
		expect(locals.supabase.from).not.toHaveBeenCalled();
	});
});

const COMMENT_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const DOCUMENT_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
const OWNER_ACTOR_ID = 'owner-actor';

function createUpdateChain(result: { data: unknown; error: unknown }) {
	const chain: Record<string, any> = {};
	chain.update = vi.fn(() => chain);
	chain.eq = vi.fn(() => chain);
	chain.select = vi.fn(() => Promise.resolve(result));
	return chain;
}

function createDeleteLocals(options: {
	createdBy: string;
	isAdmin: boolean;
	userUpdate?: ReturnType<typeof createUpdateChain>;
}) {
	const fetchChain = {
		select: vi.fn(() => fetchChain),
		eq: vi.fn(() => fetchChain),
		maybeSingle: vi.fn().mockResolvedValue({
			data: {
				id: COMMENT_ID,
				project_id: 'project-1',
				entity_type: 'document',
				entity_id: DOCUMENT_ID,
				created_by: options.createdBy,
				deleted_at: null
			},
			error: null
		})
	};
	const userUpdate = options.userUpdate ?? createUpdateChain({ data: [], error: null });
	const from = vi.fn().mockReturnValueOnce(fetchChain).mockReturnValue(userUpdate);
	const rpc = vi.fn(async (name: string) => {
		if (name === 'ensure_actor_for_user') return { data: OWNER_ACTOR_ID, error: null };
		if (name === 'is_admin') return { data: options.isAdmin, error: null };
		return { data: null, error: null };
	});
	return {
		locals: {
			supabase: { rpc, from },
			safeGetSession: vi.fn().mockResolvedValue({
				user: { id: USER_ID, email: 'builder@example.com' }
			})
		},
		userUpdate
	};
}

describe('DELETE /api/onto/comments/[id] soft delete', () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		const access = await import('$lib/server/comment-public-access');
		vi.mocked(access.resolveCommentEntityOwnerActorId).mockResolvedValue(OWNER_ACTOR_ID);
	});

	it('lets the page owner moderate through the admin client, scoped to the owned entity', async () => {
		const adminUpdate = createUpdateChain({ data: [{ id: COMMENT_ID }], error: null });
		createAdminSupabaseClientMock.mockReturnValue({ from: vi.fn(() => adminUpdate) });
		const { locals, userUpdate } = createDeleteLocals({
			createdBy: 'someone-else',
			isAdmin: false
		});

		const response = await DELETE({ params: { id: COMMENT_ID }, locals } as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.data).toEqual({ deleted: true });
		expect(adminUpdate.update).toHaveBeenCalledWith({ deleted_at: expect.any(String) });
		expect(adminUpdate.eq).toHaveBeenCalledWith('id', COMMENT_ID);
		expect(adminUpdate.eq).toHaveBeenCalledWith('entity_id', DOCUMENT_ID);
		expect(adminUpdate.select).toHaveBeenCalledWith('id');
		expect(userUpdate.update).not.toHaveBeenCalled();
	});

	it('returns 404 instead of deleted:true when no row was updated', async () => {
		const adminUpdate = createUpdateChain({ data: [], error: null });
		createAdminSupabaseClientMock.mockReturnValue({ from: vi.fn(() => adminUpdate) });
		const { locals } = createDeleteLocals({ createdBy: 'someone-else', isAdmin: false });

		const response = await DELETE({ params: { id: COMMENT_ID }, locals } as any);

		expect(response.status).toBe(404);
	});

	it('keeps the author delete on the user-scoped client', async () => {
		const userUpdate = createUpdateChain({ data: [{ id: COMMENT_ID }], error: null });
		const { locals } = createDeleteLocals({
			createdBy: OWNER_ACTOR_ID,
			isAdmin: false,
			userUpdate
		});

		const response = await DELETE({ params: { id: COMMENT_ID }, locals } as any);

		expect(response.status).toBe(200);
		expect(userUpdate.update).toHaveBeenCalled();
		expect(createAdminSupabaseClientMock).not.toHaveBeenCalled();
	});
});
