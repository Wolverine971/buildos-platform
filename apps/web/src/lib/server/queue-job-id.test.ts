// apps/web/src/lib/server/queue-job-id.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	addQueueJobWithPublicId,
	createQueueCorrelationId,
	withQueueCorrelationMetadata
} from './queue-job-id';

describe('web queue correlation', () => {
	it('preserves a UUID caller correlation ID', () => {
		const correlationId = '11111111-1111-4111-8111-111111111111';
		const headers = new Headers({ 'x-correlation-id': correlationId });
		expect(createQueueCorrelationId(headers)).toBe(correlationId);
		expect(withQueueCorrelationMetadata({ task: 'brief' }, correlationId)).toMatchObject({
			correlationId,
			metadata: { task: 'brief', correlationId }
		});
	});

	it('replaces a non-UUID request header with a UUID', () => {
		const headers = new Headers({ 'x-correlation-id': 'external-request-123' });
		expect(createQueueCorrelationId(headers)).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
		);
	});

	it('enriches the RPC metadata and returns the persisted trace ID', async () => {
		const rpc = vi.fn().mockResolvedValue({ data: 'row-1', error: null });
		const maybeSingle = vi.fn().mockResolvedValue({
			data: {
				queue_job_id: 'generate_daily_brief_job-1',
				metadata: {
					briefDate: '2026-07-24',
					correlationId: '22222222-2222-4222-8222-222222222222'
				}
			},
			error: null
		});
		const singleQuery = {
			select: vi.fn().mockReturnThis(),
			eq: vi.fn().mockReturnThis(),
			maybeSingle
		};
		const supabase = {
			rpc,
			from: vi.fn(() => singleQuery)
		};

		const result = await addQueueJobWithPublicId(supabase as never, {
			p_user_id: '00000000-0000-4000-8000-000000000001',
			p_job_type: 'generate_daily_brief',
			p_metadata: { briefDate: '2026-07-24' },
			p_priority: 10,
			p_scheduled_for: '2026-07-24T12:00:00.000Z',
			p_dedup_key: 'brief:user:date'
		});

		const rpcMetadata = rpc.mock.calls[0]?.[1]?.p_metadata as Record<string, unknown>;
		expect(rpcMetadata.correlationId).toMatch(
			/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
		);
		expect(result).toMatchObject({
			queueRecordId: 'row-1',
			queueJobId: 'generate_daily_brief_job-1',
			correlationId: '22222222-2222-4222-8222-222222222222'
		});
	});
});
