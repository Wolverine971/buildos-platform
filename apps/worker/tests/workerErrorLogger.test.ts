// apps/worker/tests/workerErrorLogger.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	insert: vi.fn(async () => ({ error: null }))
}));

vi.mock('../src/lib/supabase', () => ({
	supabase: {
		from: vi.fn(() => ({ insert: mocks.insert }))
	}
}));

import { logWorkerError } from '../src/lib/errorLogger';

describe('worker error classification', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.insert.mockResolvedValue({ error: null });
	});

	it('classifies SQLSTATE failures as database errors even with LLM metadata', async () => {
		const error = Object.assign(new Error('duplicate key value violates unique constraint'), {
			code: '23505'
		});

		await logWorkerError(error, {
			llmProvider: 'deepseek',
			llmModel: 'deepseek/test-model'
		});

		expect(mocks.insert).toHaveBeenCalledWith(
			expect.objectContaining({
				error_type: 'database_error',
				error_code: '23505'
			})
		);
	});

	it('keeps genuine model failures classified as LLM errors', async () => {
		await logWorkerError(new Error('model request failed'), {
			llmProvider: 'deepseek',
			llmModel: 'deepseek/test-model'
		});

		expect(mocks.insert).toHaveBeenCalledWith(
			expect.objectContaining({ error_type: 'llm_error' })
		);
	});
});
