// apps/web/src/routes/api/onto/braindumps/[id]/server.test.ts
import { describe, expect, it, vi } from 'vitest';
import { DELETE, GET } from './+server';

const BRAINDUMP_ID = '11111111-1111-4111-8111-111111111111';

function localsWith(options: {
	user?: { id: string } | null;
	rpcError?: { code: string; message: string } | null;
	braindump?: Record<string, unknown> | null;
}) {
	const rpc = vi.fn().mockResolvedValue({
		data: options.rpcError ? null : { deleted: true },
		error: options.rpcError ?? null
	});
	const filters: Array<[string, string, unknown]> = [];
	const query: any = {
		select: vi.fn(() => query),
		eq: vi.fn((column: string, value: unknown) => {
			filters.push(['eq', column, value]);
			return query;
		}),
		is: vi.fn((column: string, value: unknown) => {
			filters.push(['is', column, value]);
			return query;
		}),
		single: vi.fn().mockResolvedValue({
			data: options.braindump ?? null,
			error: options.braindump ? null : { code: 'PGRST116' }
		})
	};
	return {
		locals: {
			safeGetSession: vi.fn().mockResolvedValue({
				user: options.user === undefined ? { id: 'user-1' } : options.user
			}),
			supabase: { rpc, from: vi.fn(() => query) }
		},
		rpc,
		filters
	};
}

describe('DELETE /api/onto/braindumps/[id]', () => {
	it('soft-deletes the caller’s brain dump through the owner-only RPC', async () => {
		const { locals, rpc } = localsWith({});
		const response = await DELETE({ params: { id: BRAINDUMP_ID }, locals } as any);

		expect(response.status).toBe(200);
		expect((await response.json()).data).toEqual({ deleted: true });
		expect(rpc).toHaveBeenCalledWith('delete_my_braindump', {
			p_braindump_id: BRAINDUMP_ID
		});
	});

	it('answers 404 for someone else’s, an already deleted, or a malformed id', async () => {
		for (const code of ['P0002', '22P02']) {
			const { locals } = localsWith({ rpcError: { code, message: 'x' } });
			const response = await DELETE({ params: { id: BRAINDUMP_ID }, locals } as any);
			expect(response.status, code).toBe(404);
		}
	});

	it('requires a signed-in user and surfaces other database errors', async () => {
		const signedOut = localsWith({ user: null });
		expect(
			(await DELETE({ params: { id: BRAINDUMP_ID }, locals: signedOut.locals } as any)).status
		).toBe(401);
		expect(signedOut.rpc).not.toHaveBeenCalled();

		const failing = localsWith({ rpcError: { code: '57014', message: 'timeout' } });
		expect(
			(await DELETE({ params: { id: BRAINDUMP_ID }, locals: failing.locals } as any)).status
		).toBe(500);
	});
});

describe('GET /api/onto/braindumps/[id]', () => {
	it('never returns a deleted brain dump', async () => {
		const { locals, filters } = localsWith({ braindump: null });
		const response = await GET({ params: { id: BRAINDUMP_ID }, locals } as any);

		expect(response.status).toBe(404);
		expect(filters).toContainEqual(['is', 'deleted_at', null]);
		expect(filters).toContainEqual(['eq', 'user_id', 'user-1']);
	});
});
