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

	it('redacts content in operation_payload and metadata before insert', async () => {
		await logWorkerError(new Error('insert failed'), {
			operationPayload: {
				subject: 'Maya updated Acme rebrand',
				recipientEmail: 'person@example.com',
				emailId: '123e4567-e89b-12d3-a456-426614174000'
			},
			metadata: {
				jobId: 'job-1',
				summary: 'Therapy with Dr. Lee',
				details: 'Failing row contains (Acme rebrand)',
				briefDate: '2026-09-24'
			}
		});

		const [entry] = mocks.insert.mock.calls[0] as unknown as [Record<string, any>];
		expect(entry.operation_payload).toEqual({
			subject: '[redacted]',
			recipientEmail: '[redacted-email]',
			emailId: '123e4567-e89b-12d3-a456-426614174000'
		});
		expect(entry.metadata).toMatchObject({
			jobId: 'job-1',
			summary: '[redacted]',
			details: '[redacted]',
			briefDate: '2026-09-24',
			worker: true
		});
		expect(JSON.stringify(entry)).not.toMatch(/Acme|Therapy|person@example\.com/);
	});
});
