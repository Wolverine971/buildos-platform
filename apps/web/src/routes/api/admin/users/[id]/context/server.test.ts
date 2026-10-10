// apps/web/src/routes/api/admin/users/[id]/context/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createAdminSupabaseClientMock, getUserContextMock, serviceClients } = vi.hoisted(() => ({
	createAdminSupabaseClientMock: vi.fn(),
	getUserContextMock: vi.fn(),
	serviceClients: [] as unknown[]
}));

vi.mock('$lib/supabase/admin', () => ({
	createAdminSupabaseClient: createAdminSupabaseClientMock
}));

vi.mock('$lib/services/email-generation-service', () => ({
	EmailGenerationService: class {
		constructor(client: unknown) {
			serviceClients.push(client);
		}
		getUserContext = getUserContextMock;
	}
}));

import { GET } from './+server';

const OTHER_USER_ID = '777553ca-5e72-46c8-90b6-9533c21f6af4';
const adminClient = { kind: 'admin' };
const sessionClient = { kind: 'session' };

function createEvent(id: string, user: { id: string; is_admin: boolean } | null) {
	return {
		params: { id },
		url: new URL(`http://localhost/api/admin/users/${id}/context`),
		locals: {
			supabase: sessionClient,
			safeGetSession: vi.fn().mockResolvedValue({ user })
		}
	} as any;
}

describe('GET /api/admin/users/[id]/context', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		serviceClients.length = 0;
		createAdminSupabaseClientMock.mockReturnValue(adminClient);
		getUserContextMock.mockResolvedValue({ basic: { id: OTHER_USER_ID } });
	});

	it("reads another user's context with the admin client, not the admin's own session", async () => {
		const response = await GET(createEvent(OTHER_USER_ID, { id: 'admin-1', is_admin: true }));
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.data).toEqual({ basic: { id: OTHER_USER_ID } });
		// A signed-in session can only resolve its own actor, so the session
		// client 500s here for every user except the admin themself.
		expect(serviceClients).toEqual([adminClient]);
		expect(getUserContextMock).toHaveBeenCalledWith(OTHER_USER_ID);
	});

	it('refuses non-admins before creating the admin client', async () => {
		const response = await GET(createEvent(OTHER_USER_ID, { id: 'user-1', is_admin: false }));

		expect(response.status).toBe(403);
		expect(createAdminSupabaseClientMock).not.toHaveBeenCalled();
		expect(getUserContextMock).not.toHaveBeenCalled();
	});

	it('rejects an id that is not a UUID before creating the admin client', async () => {
		const response = await GET(
			createEvent('not-a-uuid,recipient_id.neq.x', { id: 'admin-1', is_admin: true })
		);

		expect(response.status).toBe(400);
		expect(createAdminSupabaseClientMock).not.toHaveBeenCalled();
	});
});
