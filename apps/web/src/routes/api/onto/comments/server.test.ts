// apps/web/src/routes/api/onto/comments/server.test.ts
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

vi.mock('../shared/error-logging', () => ({
	logOntologyApiError: vi.fn()
}));

vi.mock('./comment-mentions', () => ({
	handleCommentMentions: vi.fn()
}));

import { GET, POST } from './+server';

const PROJECT_ID = '11111111-1111-4111-8111-111111111111';
const ENTITY_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

function createLocals(authenticated = false) {
	return {
		supabase: {},
		safeGetSession: vi.fn().mockResolvedValue(
			authenticated
				? {
						user: { id: USER_ID, email: 'builder@example.com' }
					}
				: null
		)
	};
}

describe('/api/onto/comments UUID validation', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns 400 before querying Supabase for the preview-project placeholder', async () => {
		const response = await GET({
			request: new Request(
				'http://localhost/api/onto/comments?project_id=preview-project&entity_type=project&entity_id=preview-project&include_deleted=true'
			),
			locals: createLocals()
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload).toMatchObject({
			success: false,
			code: 'INVALID_REQUEST',
			error: 'Invalid project_id'
		});
		expect(createAdminSupabaseClientMock).not.toHaveBeenCalled();
	});

	it.each([
		[`project_id=${PROJECT_ID}&entity_type=task&entity_id=not-a-uuid`, 'Invalid entity_id'],
		[
			`project_id=${PROJECT_ID}&entity_type=task&entity_id=${ENTITY_ID}&root_id=not-a-uuid`,
			'Invalid root_id'
		]
	])('rejects malformed GET identifiers: %s', async (query, expectedError) => {
		const response = await GET({
			request: new Request(`http://localhost/api/onto/comments?${query}`),
			locals: createLocals()
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload.error).toBe(expectedError);
		expect(createAdminSupabaseClientMock).not.toHaveBeenCalled();
	});

	it('returns 422 before querying Supabase for malformed POST UUIDs', async () => {
		const response = await POST({
			request: new Request('http://localhost/api/onto/comments', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					project_id: 'preview-project',
					entity_type: 'project',
					entity_id: 'preview-project',
					body: 'Preview comment'
				})
			}),
			locals: createLocals(true)
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(422);
		expect(payload.code).toBe('INVALID_FIELD');
		expect(payload.details.issues).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ path: 'project_id', code: 'invalid_string' }),
				expect.objectContaining({ path: 'entity_id', code: 'invalid_string' })
			])
		);
		expect(createAdminSupabaseClientMock).not.toHaveBeenCalled();
	});
});
