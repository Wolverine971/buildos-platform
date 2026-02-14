// apps/worker/src/workers/notification/projectActivityBatchWorker.ts
import { createServiceClient } from '@buildos/supabase-client';
import type { ProcessingJob } from '../../lib/supabaseQueue';

const supabase = createServiceClient();

interface ProjectActivityBatchFlushMetadata {
	batch_id?: string;
	batchId?: string;
}

interface FlushResultRow {
	batch_id: string | null;
	status: 'flushed' | 'already_flushed' | 'missing' | 'failed' | 'invalid';
	event_id: string | null;
	message: string | null;
}

export async function processProjectActivityBatchFlushJob(
	job: ProcessingJob<ProjectActivityBatchFlushMetadata>
): Promise<FlushResultRow> {
	const batchId = job.data?.batch_id || job.data?.batchId;
	if (!batchId) {
		throw new Error('Missing batch_id in project activity batch flush job');
	}

	const { data, error } = await (supabase.rpc as any)(
		'flush_project_activity_notification_batch',
		{
			p_batch_id: batchId
		}
	);

	if (error) {
		throw new Error(`Batch flush RPC failed: ${error.message}`);
	}

	const row = (Array.isArray(data) ? data[0] : data) as FlushResultRow | null;
	if (!row) {
		throw new Error('Batch flush RPC returned empty response');
	}

	if (row.status === 'failed' || row.status === 'invalid') {
		throw new Error(row.message || `Project activity batch flush failed (${row.status})`);
	}

	return row;
}
