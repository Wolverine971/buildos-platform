// apps/worker/tests/queueCorrelation.test.ts
import { describe, expect, it } from 'vitest';
import {
	createRequestCorrelationId,
	ensureQueueCorrelationMetadata,
	getQueueCorrelationId,
	runWithRequestCorrelation
} from '../src/lib/queueCorrelation';
import { createLegacyJob } from '../src/workers/shared/jobAdapter';
import type { ProcessingJob } from '../src/lib/supabaseQueue';

describe('queue correlation context', () => {
	it('preserves an explicit metadata correlation ID', () => {
		const correlationId = '11111111-1111-4111-8111-111111111111';
		const result = ensureQueueCorrelationMetadata({
			correlationId,
			briefDate: '2026-07-24'
		});

		expect(result.correlationId).toBe(correlationId);
		expect(getQueueCorrelationId(result.metadata)).toBe(correlationId);
	});

	it('inherits the HTTP request correlation ID when metadata has none', () => {
		const correlationId = '22222222-2222-4222-8222-222222222222';
		const result = runWithRequestCorrelation(correlationId, () =>
			ensureQueueCorrelationMetadata({ briefDate: '2026-07-24' })
		);

		expect(result.correlationId).toBe(correlationId);
		expect(result.metadata.correlationId).toBe(correlationId);
	});

	it('replaces non-UUID inbound values with a UUID', () => {
		const correlationId = createRequestCorrelationId('external-request-123');

		expect(correlationId).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
		);
	});

	it('carries the first-class correlation field into legacy job adapters', () => {
		const correlationId = '33333333-3333-4333-8333-333333333333';
		const processingJob: ProcessingJob<{ value: string }> = {
			id: 'job-1',
			processingToken: null,
			correlationId,
			userId: 'user-1',
			data: { value: 'ok' },
			attempts: 0,
			signal: new AbortController().signal,
			updateProgress: async () => undefined,
			log: async () => undefined
		};

		expect(createLegacyJob(processingJob).correlationId).toBe(correlationId);
	});
});
