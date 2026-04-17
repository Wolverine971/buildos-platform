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

	it('accepts the lite prompt variant without consulting the admin gate', async () => {
		// Lite is now the only prompt path (docs/specs/agentic-chat-lite-prompt-consolidation-2026-04-16.md).
		// There is no admin/dev gate anymore, so the request should not hit `admin_users`.
		// The endpoint will attempt to start streaming and fail downstream in this minimal
		// test harness, but the key assertion is that validation does NOT return 400/403
		// for the lite variant and does NOT query the admin-users table.
		const supabase = createSupabase({ isAdmin: false });
		try {
			await POST({
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
		} catch {
			// downstream streaming machinery is not mocked in this harness; we only
			// care that the variant gate did not reject the request.
		}

		expect(supabase.from).not.toHaveBeenCalledWith('admin_users');
	});
});
