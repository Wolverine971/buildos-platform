// apps/web/src/routes/api/admin/chat/domains/research-queue/[id]/server.test.ts
import { describe, expect, it, vi } from 'vitest';
import { PATCH } from './+server';

function createUpdateQuery(result: { data: unknown; error: unknown }) {
	const query: any = {
		update: vi.fn(() => query),
		eq: vi.fn(() => query),
		select: vi.fn(() => query),
		single: vi.fn().mockResolvedValue(result)
	};
	return query;
}

function createSupabase({
	isAdmin = true,
	result = { id: 'queue-1', status: 'researching' }
}: {
	isAdmin?: boolean;
	result?: unknown;
} = {}) {
	const updateQuery = createUpdateQuery({ data: result, error: null });
	const supabase = {
		updateQuery,
		from: vi.fn((table: string) => {
			if (table === 'admin_users') {
				return {
					select: vi.fn().mockReturnThis(),
					eq: vi.fn().mockReturnThis(),
					single: vi.fn().mockResolvedValue({
						data: isAdmin ? { user_id: 'admin-1' } : null,
						error: isAdmin ? null : { message: 'not found' }
					})
				};
			}
			if (table === 'domain_research_queue') return updateQuery;
			throw new Error(`Unexpected table: ${table}`);
		})
	};
	return supabase;
}

describe('PATCH /api/admin/chat/domains/research-queue/[id]', () => {
	it('claims a queue row for admin users', async () => {
		const supabase = createSupabase();
		const response = await PATCH({
			params: { id: 'queue-1' },
			request: new Request('http://localhost/api/admin/chat/domains/research-queue/queue-1', {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ status: 'researching' })
			}),
			locals: {
				supabase,
				safeGetSession: vi
					.fn()
					.mockResolvedValue({ user: { id: 'admin-1', email: 'admin@example.com' } })
			}
		} as any);
		const payload = await response.json();

		expect(response.status).toBe(200);
		expect(payload.success).toBe(true);
		expect(supabase.updateQuery.update).toHaveBeenCalledWith(
			expect.objectContaining({
				status: 'researching',
				claimed_by: 'admin@example.com'
			})
		);
		expect(supabase.updateQuery.update.mock.calls[0][0].claimed_at).toEqual(expect.any(String));
		expect(supabase.updateQuery.eq).toHaveBeenCalledWith('id', 'queue-1');
	});

	it('allows clearing result because the table permits null', async () => {
		const supabase = createSupabase({ result: { id: 'queue-1', result: null } });
		const response = await PATCH({
			params: { id: 'queue-1' },
			request: new Request('http://localhost/api/admin/chat/domains/research-queue/queue-1', {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ result: null })
			}),
			locals: {
				supabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'admin-1' } })
			}
		} as any);

		expect(response.status).toBe(200);
		expect(supabase.updateQuery.update).toHaveBeenCalledWith({ result: null });
	});

	it('rejects invalid status updates before touching queue rows', async () => {
		const supabase = createSupabase();
		const response = await PATCH({
			params: { id: 'queue-1' },
			request: new Request('http://localhost/api/admin/chat/domains/research-queue/queue-1', {
				method: 'PATCH',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ status: 'invalid' })
			}),
			locals: {
				supabase,
				safeGetSession: vi.fn().mockResolvedValue({ user: { id: 'admin-1' } })
			}
		} as any);

		expect(response.status).toBe(400);
		expect(supabase.updateQuery.update).not.toHaveBeenCalled();
	});
});
