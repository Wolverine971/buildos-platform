// apps/web/src/lib/tests/agentic-e2e/harness/provenance.ts
import {
	assertSourceProvenance,
	readSourceProvenance,
	type SourceProvenance
} from '@buildos/agentic-chat-runtime/provenance';
import type { DbView } from './types';

export interface BatteryProvenance {
	expected: SourceProvenance;
	worker: SourceProvenance | null;
	web: SourceProvenance | null;
	verified: boolean;
	error: string | null;
}

export async function verifyBatteryServices(
	record: BatteryProvenance,
	baseUrl: string,
	workerUrl: string | null
): Promise<void> {
	try {
		if (!workerUrl)
			throw new Error('PRIVATE_AGENTIC_CHAT_WORKER_URL is required for battery provenance');
		const get = async (url: string) => {
			const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
			if (!response.ok)
				throw new Error(`Provenance health request failed: ${url} (${response.status})`);
			return response.json();
		};
		const [worker, web] = await Promise.all([
			get(`${workerUrl}/health`),
			get(`${baseUrl}/__agentic/provenance`)
		]);
		record.worker = worker.provenance ?? null;
		record.web = web.provenance ?? null;
		assertSourceProvenance(record.expected, record.worker, 'Worker');
		assertSourceProvenance(record.expected, record.web, 'Web');
		const batch = process.env.CHAT_MUTATION_BATCH_LANE?.trim().toLowerCase() !== 'false';
		if (worker.mutationBatchLaneEnabled !== batch || web.mutationBatchLaneEnabled !== batch)
			throw new Error('Web, worker and battery mutation-lane flags differ');
		assertSourceProvenance(record.expected, readSourceProvenance(), 'Current checkout');
		record.verified = true;
	} catch (error) {
		record.verified = false;
		record.error = error instanceof Error ? error.message : String(error);
		throw error;
	}
}

// A matching health endpoint alone does not prove which consumer claimed a job
// on a shared queue. Verify the durable receipt from the actual executing worker.
export async function verifyTurnWorkerProvenance(
	admin: DbView['admin'],
	streamRunId: string,
	expected: SourceProvenance
): Promise<void> {
	const { data, error } = await admin
		.from('chat_turn_events')
		.select('payload')
		.eq('stream_run_id', streamRunId)
		.eq('event_type', 'turn_phase');
	if (error) throw new Error(`Could not read worker provenance: ${error.message}`);
	const acknowledged = data
		?.map((row) => row.payload as Record<string, unknown>)
		.find((payload) => payload.turn_phase === 'acknowledged');
	assertSourceProvenance(
		expected,
		acknowledged?.workerProvenance,
		`Executing worker for ${streamRunId}`
	);
}
