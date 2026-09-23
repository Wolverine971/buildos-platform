// apps/web/src/lib/services/agentic-chat/tools/core/executors/base-executor.test.ts
import { describe, expect, it, vi } from 'vitest';
import { BaseExecutor } from './base-executor';
import type { ExecutorContext } from './types';

class TestExecutor extends BaseExecutor {
	callActorId() {
		return this.getActorId();
	}

	callAdminSupabase() {
		return this.getAdminSupabase();
	}
}

describe('BaseExecutor', () => {
	it('uses the context infrastructure providers', async () => {
		const admin = { from: vi.fn() };
		const executor = new TestExecutor({
			supabase: {} as ExecutorContext['supabase'],
			userId: 'user_1',
			sessionId: 'session-1',
			getActorId: vi.fn().mockResolvedValue('actor-from-context'),
			getAdminSupabase: vi.fn().mockReturnValue(admin)
		} as ExecutorContext);

		await expect(executor.callActorId()).resolves.toBe('actor-from-context');
		expect(executor.callAdminSupabase()).toBe(admin);
	});
});
