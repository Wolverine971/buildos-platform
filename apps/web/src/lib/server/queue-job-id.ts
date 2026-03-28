// apps/web/src/lib/server/queue-job-id.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';

type QueueJobClient = Pick<SupabaseClient<Database>, 'from' | 'rpc'>;

export type AddQueueJobArgs = Database['public']['Functions']['add_queue_job']['Args'];

export async function resolveQueueJobPublicId(
	supabase: QueueJobClient,
	queueRecordId: string
): Promise<string> {
	const { data, error } = await supabase
		.from('queue_jobs')
		.select('queue_job_id')
		.eq('id', queueRecordId)
		.maybeSingle();

	if (error || !data?.queue_job_id) {
		throw new Error(
			error?.message || `Failed to resolve queue_job_id for queue record ${queueRecordId}`
		);
	}

	return data.queue_job_id;
}

export async function addQueueJobWithPublicId(
	supabase: QueueJobClient,
	args: AddQueueJobArgs
): Promise<{ queueRecordId: string; queueJobId: string }> {
	const { data, error } = await supabase.rpc('add_queue_job', args);

	if (error || typeof data !== 'string' || data.length === 0) {
		throw new Error(error?.message || 'Queue RPC did not return a valid queue record ID');
	}

	return {
		queueRecordId: data,
		queueJobId: await resolveQueueJobPublicId(supabase, data)
	};
}
