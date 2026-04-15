// apps/web/src/routes/api/agent/v2/stream/server.test.ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/environment', () => ({
	dev: false,
	browser: false,
	building: false,
	version: 'test'
}));

import { POST } from './+server';

function createQuery(result: unknown) {
	return {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		maybeSingle: vi.fn().mockResolvedValue(result)
	};
}

function createSupabase({ isAdmin = false } = {}) {
	const adminQuery = createQuery({
		data: isAdmin ? { user_id: 'admin-1' } : null,
		error: isAdmin ? null : { message: 'not found' }
	});

	return {
		adminQuery,
		from: vi.fn().mockImplementation((table: string) => {
			if (table === 'admin_users') return adminQuery;
			throw new Error(`Unexpected table: ${table}`);
		})
	};
}

describe('POST /api/agent/v2/stream prompt variant gate', () => {
	it('rejects unsupported prompt variants before starting the stream', async () => {
		const supabase = createSupabase({ isAdmin: false });
		const response = await POST({
			request: new Request('http://localhost/api/agent/v2/stream', {
				method: 'POST',
				body: JSON.stringify({
					message: 'Hello',
					prompt_variant: 'experimental'
				})
			}),
			locals: {
				supabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			},
			fetch: vi.fn()
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload.message).toContain('Unsupported prompt_variant');
		expect(supabase.from).not.toHaveBeenCalledWith('admin_users');
	});

	it('rejects lite prompt variant requests for non-admin users outside dev', async () => {
		const supabase = createSupabase({ isAdmin: false });
		const response = await POST({
			request: new Request('http://localhost/api/agent/v2/stream', {
				method: 'POST',
				body: JSON.stringify({
					message: 'Hello',
					prompt_variant: 'lite_seed_v1'
				})
			}),
			locals: {
				supabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			},
			fetch: vi.fn()
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(403);
		expect(payload.message).toContain('Lite prompt variant requires admin access');
		expect(supabase.adminQuery.maybeSingle).toHaveBeenCalledTimes(1);
	});
});
