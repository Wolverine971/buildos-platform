// apps/web/src/lib/services/agentic-chat/tools/core/executors/base-executor.abort.test.ts
import { describe, expect, it, vi } from 'vitest';
import { BaseExecutor } from './base-executor';
import type { ExecutorContext } from './types';

// Minimal test subclass to exercise the protected apiRequest() surface.
class TestExecutor extends BaseExecutor {
	callApiRequest(path: string, options?: RequestInit) {
		return this.apiRequest(path, options);
	}
}

function makeContext(overrides: Partial<ExecutorContext>): ExecutorContext {
	const supabase = {
		auth: {
			getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: 'tok' } } })
		}
	} as unknown as ExecutorContext['supabase'];

	return {
		supabase,
		userId: 'user_1',
		fetchFn: vi.fn(),
		getActorId: vi.fn(),
		getAdminSupabase: vi.fn(),
		getAuthHeaders: vi.fn(),
		...overrides
	} as ExecutorContext;
}

function jsonResponse(body: unknown): Response {
	return new Response(JSON.stringify(body), {
		status: 200,
		headers: { 'content-type': 'application/json' }
	});
}

describe('BaseExecutor abort signal threading', () => {
	it('passes the turn abort signal into fetch', async () => {
		const controller = new AbortController();
		const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ data: { ok: true } }));
		const executor = new TestExecutor(
			makeContext({ fetchFn: fetchFn as any, abortSignal: controller.signal })
		);

		await executor.callApiRequest('/api/onto/tasks/create', { method: 'POST', body: '{}' });

		expect(fetchFn).toHaveBeenCalledTimes(1);
		const [, init] = fetchFn.mock.calls[0];
		expect(init.signal).toBe(controller.signal);
	});

	it('fails fast without issuing the request when already aborted', async () => {
		const controller = new AbortController();
		controller.abort();
		const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ data: { ok: true } }));
		const executor = new TestExecutor(
			makeContext({ fetchFn: fetchFn as any, abortSignal: controller.signal })
		);

		await expect(
			executor.callApiRequest('/api/onto/tasks/create', { method: 'POST', body: '{}' })
		).rejects.toMatchObject({ name: 'AbortError' });
		expect(fetchFn).not.toHaveBeenCalled();
	});

	it('prefers an explicit per-call signal over the turn signal', async () => {
		const turnController = new AbortController();
		const callController = new AbortController();
		const fetchFn = vi.fn().mockResolvedValue(jsonResponse({ data: { ok: true } }));
		const executor = new TestExecutor(
			makeContext({ fetchFn: fetchFn as any, abortSignal: turnController.signal })
		);

		await executor.callApiRequest('/api/onto/tasks/create', {
			method: 'POST',
			signal: callController.signal
		});

		const [, init] = fetchFn.mock.calls[0];
		expect(init.signal).toBe(callController.signal);
	});
});
