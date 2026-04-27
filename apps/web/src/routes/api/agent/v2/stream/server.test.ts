// apps/web/src/routes/api/agent/v2/stream/server.test.ts
import { describe, expect, it, vi } from 'vitest';

vi.mock('$app/environment', () => ({
	dev: false,
	browser: false,
	building: false,
	version: 'test'
}));

import { GET, POST } from './+server';

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

describe('/api/agent/v2/stream', () => {
	it('GET warmup authenticates and returns a no-content response', async () => {
		const safeGetSession = vi.fn().mockResolvedValue({ user: { id: 'user-1' } });
		const response = await GET({
			locals: {
				safeGetSession
			}
		} as any);

		expect(response.status).toBe(204);
		expect(response.headers.get('Cache-Control')).toContain('no-store');
		expect(response.headers.get('X-BuildOS-Agent-Stream-Warmup')).toBe('1');
		expect(safeGetSession).toHaveBeenCalledTimes(1);
	});

	it('GET warmup requires an authenticated user', async () => {
		const response = await GET({
			locals: {
				safeGetSession: vi.fn().mockResolvedValue({ user: null })
			}
		} as any);

		expect(response.status).toBe(401);
	});

	it('ignores the legacy prompt_variant request field and does not consult the admin gate', async () => {
		// Lite is the only prompt path (docs/specs/agentic-chat-lite-prompt-consolidation-2026-04-16.md).
		// The legacy `prompt_variant` field is ignored silently; every session runs lite.
		// There is no admin/dev gate anymore, so the request should not hit `admin_users`.
		// The endpoint will attempt to start streaming and fail downstream in this minimal
		// test harness, but the key assertion is that validation does NOT query admin-users.
		const supabase = createSupabase({ isAdmin: false });
		try {
			await POST({
				request: new Request('http://localhost/api/agent/v2/stream', {
					method: 'POST',
					body: JSON.stringify({
						message: 'Hello',
						prompt_variant: 'anything-we-ignore'
					})
				}),
				locals: {
					supabase,
					safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
				},
				fetch: vi.fn()
			} as any);
		} catch {
			// downstream streaming machinery is not mocked in this harness.
		}

		expect(supabase.from).not.toHaveBeenCalledWith('admin_users');
	});
});
