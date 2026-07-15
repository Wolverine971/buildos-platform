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
