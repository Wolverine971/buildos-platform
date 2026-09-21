// apps/worker/src/workers/agentic-chat/workflow/specialist-snapshot-store.ts
import {
	type ExecutableSpecialistSnapshot,
	parseExecutableSpecialistSnapshot
} from '@buildos/agentic-chat-runtime/specialists';
import type { AgenticChatWorkflowStoreClient } from './workflow-store';

export type SpecialistSnapshotIdentity = {
	turnRunId: string;
	userId: string;
	sessionId: string;
	projectId: string;
	requestHash: string;
};
/** Service-only read. Both request identity and snapshot content are verified. */
export async function loadSpecialistSnapshotV2(
	client: AgenticChatWorkflowStoreClient,
	identity: SpecialistSnapshotIdentity
): Promise<ExecutableSpecialistSnapshot> {
	const { data, error } = await client
		.from('chat_turn_specialist_snapshots')
		.select('turn_run_id,user_id,session_id,project_id,request_hash,snapshot,snapshot_hash')
		.eq('turn_run_id', identity.turnRunId)
		.maybeSingle();
	if (error)
		throw new Error(`Specialist snapshot read failed: ${error.code ?? 'database_error'}`);
	const row = data as Record<string, unknown> | null;
	if (
		!row ||
		row.turn_run_id !== identity.turnRunId ||
		row.user_id !== identity.userId ||
		row.session_id !== identity.sessionId ||
		row.project_id !== identity.projectId ||
		row.request_hash !== identity.requestHash ||
		typeof row.snapshot_hash !== 'string'
	)
		throw new Error('Specialist snapshot missing or binding invalid');
	return parseExecutableSpecialistSnapshot(row.snapshot, row.snapshot_hash);
}
