// apps/web/src/routes/api/admin/chat/lite-shadow-comparison/server.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { buildLiteShadowComparisonMock, formatLiteShadowComparisonReportMock } = vi.hoisted(() => ({
	buildLiteShadowComparisonMock: vi.fn(),
	formatLiteShadowComparisonReportMock: vi.fn()
}));

vi.mock('$lib/services/agentic-chat-lite/shadow', () => ({
	buildLiteShadowComparison: buildLiteShadowComparisonMock,
	formatLiteShadowComparisonReport: formatLiteShadowComparisonReportMock
}));

import { POST } from './+server';

function createQuery(result: unknown) {
	return {
		select: vi.fn().mockReturnThis(),
		eq: vi.fn().mockReturnThis(),
		single: vi.fn().mockResolvedValue(result),
		maybeSingle: vi.fn().mockResolvedValue(result)
	};
}

function createSupabase({ isAdmin = true, promptSnapshot = { id: 'snapshot-1' } } = {}) {
	const adminQuery = createQuery({
		data: isAdmin ? { user_id: 'admin-1' } : null,
		error: isAdmin ? null : { message: 'not found' }
	});
	const snapshotQuery = createQuery({
		data: promptSnapshot,
		error: null
	});

	return {
		adminQuery,
		snapshotQuery,
		from: vi.fn().mockImplementation((table: string) => {
			if (table === 'admin_users') return adminQuery;
			if (table === 'chat_prompt_snapshots') return snapshotQuery;
			throw new Error(`Unexpected table: ${table}`);
		})
	};
}

describe('POST /api/admin/chat/lite-shadow-comparison', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		buildLiteShadowComparisonMock.mockReturnValue({
			prompt_variant: 'lite_seed_v1',
			snapshot: { id: 'snapshot-1' }
		});
		formatLiteShadowComparisonReportMock.mockReturnValue('Lite Prompt Shadow Comparison');
	});

	it('loads a prompt snapshot and returns comparison plus optional report for admins', async () => {
		const supabase = createSupabase();
		const response = await POST({
			request: new Request('http://localhost/api/admin/chat/lite-shadow-comparison', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					prompt_snapshot_id: 'snapshot-1',
					include_report: true
				})
			}),
			locals: {
				supabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'admin-1' } })
			}
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(payload.data.comparison.prompt_variant).toBe('lite_seed_v1');
		expect(payload.data.report).toBe('Lite Prompt Shadow Comparison');
		expect(supabase.snapshotQuery.eq).toHaveBeenCalledWith('id', 'snapshot-1');
		expect(buildLiteShadowComparisonMock).toHaveBeenCalledWith({
			promptSnapshot: { id: 'snapshot-1' }
		});
	});

	it('can load by turn_run_id', async () => {
		const supabase = createSupabase();
		const response = await POST({
			request: new Request('http://localhost/api/admin/chat/lite-shadow-comparison', {
				method: 'POST',
				body: JSON.stringify({
					turn_run_id: 'turn-1'
				})
			}),
			locals: {
				supabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'admin-1' } })
			}
		} as any);

		expect(response.status).toBe(200);
		expect(supabase.snapshotQuery.eq).toHaveBeenCalledWith('turn_run_id', 'turn-1');
	});

	it('rejects non-admin users before loading snapshots', async () => {
		const supabase = createSupabase({ isAdmin: false });
		const response = await POST({
			request: new Request('http://localhost/api/admin/chat/lite-shadow-comparison', {
				method: 'POST',
				body: JSON.stringify({ prompt_snapshot_id: 'snapshot-1' })
			}),
			locals: {
				supabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		} as any);

		expect(response.status).toBe(403);
		expect(supabase.snapshotQuery.maybeSingle).not.toHaveBeenCalled();
		expect(buildLiteShadowComparisonMock).not.toHaveBeenCalled();
	});

	it('requires a prompt snapshot id or turn run id', async () => {
		const response = await POST({
			request: new Request('http://localhost/api/admin/chat/lite-shadow-comparison', {
				method: 'POST',
				body: JSON.stringify({})
			}),
			locals: {
				supabase: createSupabase(),
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'admin-1' } })
			}
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(400);
		expect(payload.message).toContain('prompt_snapshot_id or turn_run_id is required');
		expect(buildLiteShadowComparisonMock).not.toHaveBeenCalled();
	});
});
