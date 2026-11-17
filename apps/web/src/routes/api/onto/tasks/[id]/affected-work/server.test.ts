import { describe, expect, it, vi } from 'vitest';
import { GET } from './+server';

const taskId = 'a16a0000-0000-4000-8000-000000000020';

function event(options: { query?: string; id?: string; user?: boolean; result?: unknown } = {}) {
	const rpc = vi.fn().mockResolvedValue(options.result ?? { data: { tasks: [] }, error: null });
	return {
		rpc,
		input: {
			params: { id: options.id ?? taskId },
			url: new URL(
				`http://localhost/api/onto/tasks/${taskId}/affected-work${options.query ?? ''}`
			),
			locals: {
				safeGetSession: async () => ({
					user: options.user === false ? null : { id: 'user' }
				}),
				supabase: { rpc }
			}
		} as unknown as Parameters<typeof GET>[0]
	};
}

describe('GET task affected work', () => {
	it('uses the session client for one bounded RPC and prevents response caching', async () => {
		const { input, rpc } = event({ query: '?max_depth=2&max_tasks=10' });
		const response = await GET(input);
		expect(response.status).toBe(200);
		expect(rpc).toHaveBeenCalledExactlyOnceWith('onto_task_affected_work', {
			p_task_id: taskId,
			p_max_depth: 2,
			p_max_tasks: 10
		});
		expect(response.headers.get('cache-control')).toBe('private, no-store');
	});
	it('supplies conservative defaults', async () => {
		const { input, rpc } = event();
		await GET(input);
		expect(rpc).toHaveBeenCalledWith('onto_task_affected_work', {
			p_task_id: taskId,
			p_max_depth: 3,
			p_max_tasks: 50
		});
	});
	it('refuses unauthenticated requests before querying', async () => {
		const { input, rpc } = event({ user: false });
		expect((await GET(input)).status).toBe(401);
		expect(rpc).not.toHaveBeenCalled();
	});
	it.each([
		'?max_depth=7',
		'?max_depth=0',
		'?max_tasks=101',
		'?max_tasks=-1',
		'?max_depth=1.5',
		'?max_depth=',
		'?max_depth=1%20OR%201=1'
	])('refuses invalid or unbounded parameters %s', async (query) => {
		const { input, rpc } = event({ query });
		expect((await GET(input)).status).toBe(400);
		expect(rpc).not.toHaveBeenCalled();
	});
	it('rejects malformed task IDs before querying', async () => {
		const { input, rpc } = event({ id: 'not-a-uuid' });
		expect((await GET(input)).status).toBe(400);
		expect(rpc).not.toHaveBeenCalled();
	});
	it('returns the same not-found response for unavailable and unauthorized tasks', async () => {
		const { input } = event({ result: { data: null, error: null } });
		expect((await GET(input)).status).toBe(404);
	});
	it('does not turn query failures into an empty impact result or expose database details', async () => {
		const log = vi.spyOn(console, 'error').mockImplementation(() => {});
		try {
			const { input } = event({
				result: {
					data: null,
					error: { code: 'PGRST202', message: 'private schema detail' }
				}
			});
			const response = await GET(input);
			expect(response.status).toBe(503);
			expect(await response.text()).not.toContain('private schema detail');
		} finally {
			log.mockRestore();
		}
	});
});
