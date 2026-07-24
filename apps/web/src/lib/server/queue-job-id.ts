// apps/web/src/lib/server/queue-job-id.ts
import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@buildos/shared-types';

type QueueJobClient = Pick<SupabaseClient<Database>, 'from' | 'rpc'>;

export type AddQueueJobArgs = Database['public']['Functions']['add_queue_job']['Args'];

const UUID_CORRELATION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function normalizeQueueCorrelationId(value: unknown): string | null {
	if (typeof value !== 'string') return null;
	const normalized = value.trim();
	return UUID_CORRELATION_ID.test(normalized) ? normalized : null;
}

export function getQueueCorrelationId(metadata: unknown): string | null {
	if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return null;
	return normalizeQueueCorrelationId((metadata as Record<string, unknown>).correlationId);
}

export function createQueueCorrelationId(
	headers?: Headers | null,
	preferredCorrelationId?: unknown
): string {
	return (
		normalizeQueueCorrelationId(preferredCorrelationId) ??
		normalizeQueueCorrelationId(headers?.get('x-correlation-id')) ??
		randomUUID()
	);
}

export function withQueueCorrelationMetadata(
	metadata: Json,
	preferredCorrelationId?: string
): { metadata: Json; correlationId: string } {
	const record =
		metadata && typeof metadata === 'object' && !Array.isArray(metadata)
			? (metadata as Record<string, Json | undefined>)
			: { payload: metadata };
	const correlationId =
		getQueueCorrelationId(record) ?? createQueueCorrelationId(null, preferredCorrelationId);

	return {
		metadata: { ...record, correlationId } as Json,
		correlationId
	};
}

export async function resolveQueueJobDetails(
	supabase: QueueJobClient,
	queueRecordId: string
): Promise<{ queueJobId: string; metadata: unknown }> {
	const { data, error } = await supabase
		.from('queue_jobs')
		.select('queue_job_id, metadata')
		.eq('id', queueRecordId)
		.maybeSingle();

	if (error || !data?.queue_job_id) {
		throw new Error(
			error?.message || `Failed to resolve queue_job_id for queue record ${queueRecordId}`
		);
	}

	return {
		queueJobId: data.queue_job_id,
		metadata: data.metadata
	};
}

export async function resolveQueueJobPublicId(
	supabase: QueueJobClient,
	queueRecordId: string
): Promise<string> {
	return (await resolveQueueJobDetails(supabase, queueRecordId)).queueJobId;
}

export async function addQueueJobWithPublicId(
	supabase: QueueJobClient,
	args: AddQueueJobArgs
): Promise<{
	queueRecordId: string;
	queueJobId: string;
	metadata: unknown;
	correlationId: string;
}> {
	const correlated = withQueueCorrelationMetadata(args.p_metadata);
	const { data, error } = await supabase.rpc('add_queue_job', {
		...args,
		p_metadata: correlated.metadata
	});

	if (error || typeof data !== 'string' || data.length === 0) {
		throw new Error(error?.message || 'Queue RPC did not return a valid queue record ID');
	}

	const details = await resolveQueueJobDetails(supabase, data);
	const correlationId = getQueueCorrelationId(details.metadata) ?? correlated.correlationId;
	console.info('[queue.enqueue]', {
		jobType: args.p_job_type,
		queueJobId: details.queueJobId,
		correlationId
	});
	return {
		queueRecordId: data,
		queueJobId: details.queueJobId,
		metadata: details.metadata,
		correlationId
	};
}
