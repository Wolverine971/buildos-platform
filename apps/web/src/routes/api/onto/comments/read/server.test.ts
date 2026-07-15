// apps/web/src/routes/api/onto/comments/read/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminSupabaseClientMock } = vi.hoisted(() => ({
	createAdminSupabaseClientMock: vi.fn()
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: createAdminSupabaseClientMock
}));

vi.mock('$lib/server/comment-public-access', () => ({
	canAccessPublicComments: vi.fn()
}));

vi.mock('../../shared/error-logging', () => ({
	logOntologyApiError: vi.fn()
}));

import { POST } from './+server';

const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

describe('POST /api/onto/comments/read UUID validation', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns 422 before database access for malformed identifiers', async () => {
		const supabase = {
			rpc: vi.fn(),
			from: vi.fn()
		};
		const response = await POST({
			request: new Request('http://localhost/api/onto/comments/read', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					project_id: 'preview-project',
					entity_type: 'project',
					entity_id: 'preview-project',
					root_id: 'preview-root'
				})
			}),
			locals: {
				supabase,
				safeGetSession: vi.fn().mockResolvedValue({
					user: { id: USER_ID, email: 'builder@example.com' }
				})
			}
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(422);
		expect(payload.code).toBe('INVALID_FIELD');
		expect(payload.details.issues.map((issue: { path: string }) => issue.path)).toEqual([
			'project_id',
			'entity_id',
			'root_id'
		]);
		expect(supabase.rpc).not.toHaveBeenCalled();
		expect(supabase.from).not.toHaveBeenCalled();
		expect(createAdminSupabaseClientMock).not.toHaveBeenCalled();
	});
});
