// apps/web/src/lib/services/agentic-chat-v2/turn-supervisor/checkpoint-service.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@buildos/shared-types';
import type { TurnDigest, TurnSupervisorDecision } from './types';

const DEFAULT_TURN_CHECKPOINT_EXPIRY_MS = 24 * 60 * 60 * 1000;

export type TurnCheckpointStatus = 'active' | 'resuming' | 'resumed' | 'expired' | 'cancelled';

export type TurnCheckpointType = 'supervisor_question' | 'supervisor_resume';

type ChatTurnCheckpointRow = Database['public']['Tables']['chat_turn_checkpoints']['Row'];

export type ChatTurnCheckpoint = Omit<ChatTurnCheckpointRow, 'checkpoint_type' | 'status'> & {
	checkpoint_type: TurnCheckpointType | string;
	status: TurnCheckpointStatus;
};

export type TurnSupervisorSupabaseClient = Pick<SupabaseClient<Database>, 'from'>;

export type CreateTurnCheckpointParams = {
	supabase: TurnSupervisorSupabaseClient;
	turnRunId: string;
	sessionId: string;
	userId: string;
	checkpointType: TurnCheckpointType;
	reason: string;
	digest: TurnDigest;
	resumeContext: Record<string, unknown>;
	supervisorDecision: TurnSupervisorDecision;
	question?: string | null;
	expiresAt?: string | null;
};

export type LoadLatestActiveCheckpointParams = {
	supabase: TurnSupervisorSupabaseClient;
	sessionId: string;
	userId: string;
	now?: string;
};

export type MarkCheckpointResumingParams = {
	supabase: TurnSupervisorSupabaseClient;
	checkpointId: string;
	userId: string;
	resumeTurnRunId: string;
	resumeStartedAt?: string;
};

export type MarkCheckpointResumedParams = {
	supabase: TurnSupervisorSupabaseClient;
	checkpointId: string;
	userId: string;
	resumedAt?: string;
};

export type RestoreCheckpointToActiveParams = {
	supabase: TurnSupervisorSupabaseClient;
	checkpointId: string;
	userId: string;
};

type StaleResumingCheckpointRecoveryParams = {
	supabase: TurnSupervisorSupabaseClient;
	userId: string;
	staleBefore: string;
};

export type RecoverStaleResumingCheckpointsParams = StaleResumingCheckpointRecoveryParams & {
	recoveredAt?: string;
};

export type RecoverStaleResumingCheckpointsResult = {
	restoredActive: ChatTurnCheckpoint[];
	markedResumed: ChatTurnCheckpoint[];
};

export async function createTurnCheckpoint(
	params: CreateTurnCheckpointParams
): Promise<ChatTurnCheckpoint> {
	const expiresAt =
		params.expiresAt === undefined
			? new Date(Date.now() + DEFAULT_TURN_CHECKPOINT_EXPIRY_MS).toISOString()
			: params.expiresAt;
	const { data, error } = await params.supabase
		.from('chat_turn_checkpoints')
		.insert({
			turn_run_id: params.turnRunId,
			session_id: params.sessionId,
			user_id: params.userId,
			checkpoint_type: params.checkpointType,
			status: 'active',
			reason: params.reason,
			digest: params.digest as unknown as Json,
			resume_context: params.resumeContext as Json,
			supervisor_decision: params.supervisorDecision as unknown as Json,
			question: params.question ?? null,
			expires_at: expiresAt
		})
		.select('*')
		.maybeSingle();

	if (error) {
		throw new Error(`Failed to create turn checkpoint: ${readErrorMessage(error)}`);
	}
	if (!data) {
		throw new Error('Failed to create turn checkpoint: no row returned');
	}
	return toChatTurnCheckpoint(data);
}

export async function loadLatestActiveCheckpoint(
	params: LoadLatestActiveCheckpointParams
): Promise<ChatTurnCheckpoint | null> {
	const now = params.now ?? new Date().toISOString();
	const { data, error } = await params.supabase
		.from('chat_turn_checkpoints')
		.select('*')
		.eq('session_id', params.sessionId)
		.eq('user_id', params.userId)
		.eq('status', 'active')
		.or(`expires_at.is.null,expires_at.gt.${now}`)
		.order('created_at', { ascending: false })
		.limit(1);

	if (error) {
		throw new Error(`Failed to load active turn checkpoint: ${readErrorMessage(error)}`);
	}

	return Array.isArray(data) && data[0] ? toChatTurnCheckpoint(data[0]) : null;
}

export async function markCheckpointResuming(
	params: MarkCheckpointResumingParams
): Promise<ChatTurnCheckpoint | null> {
	const resumeStartedAt = params.resumeStartedAt ?? new Date().toISOString();
	const { data, error } = await params.supabase
		.from('chat_turn_checkpoints')
		.update({
			status: 'resuming',
			resume_turn_run_id: params.resumeTurnRunId,
			resume_started_at: resumeStartedAt
		})
		.eq('id', params.checkpointId)
		.eq('user_id', params.userId)
		.eq('status', 'active')
		.select('*')
		.maybeSingle();

	if (error) {
		throw new Error(`Failed to mark checkpoint resuming: ${readErrorMessage(error)}`);
	}
	return data ? toChatTurnCheckpoint(data) : null;
}

export async function markCheckpointResumed(
	params: MarkCheckpointResumedParams
): Promise<ChatTurnCheckpoint | null> {
	const resumedAt = params.resumedAt ?? new Date().toISOString();
	const { data, error } = await params.supabase
		.from('chat_turn_checkpoints')
		.update({
			status: 'resumed',
			resumed_at: resumedAt
		})
		.eq('id', params.checkpointId)
		.eq('user_id', params.userId)
		.eq('status', 'resuming')
		.select('*')
		.maybeSingle();

	if (error) {
		throw new Error(`Failed to mark checkpoint resumed: ${readErrorMessage(error)}`);
	}
	return data ? toChatTurnCheckpoint(data) : null;
}

export async function restoreCheckpointToActive(
	params: RestoreCheckpointToActiveParams
): Promise<ChatTurnCheckpoint | null> {
	const { data, error } = await params.supabase
		.from('chat_turn_checkpoints')
		.update({
			status: 'active',
			resume_turn_run_id: null,
			resume_started_at: null,
			resumed_at: null
		})
		.eq('id', params.checkpointId)
		.eq('user_id', params.userId)
		.eq('status', 'resuming')
		.select('*')
		.maybeSingle();

	if (error) {
		throw new Error(`Failed to restore checkpoint: ${readErrorMessage(error)}`);
	}
	return data ? toChatTurnCheckpoint(data) : null;
}

export async function recoverStaleResumingCheckpoints(
	params: RecoverStaleResumingCheckpointsParams
): Promise<RecoverStaleResumingCheckpointsResult> {
	const { data, error } = await params.supabase
		.from('chat_turn_checkpoints')
		.select('*')
		.eq('user_id', params.userId)
		.eq('status', 'resuming')
		.lt('resume_started_at', params.staleBefore);

	if (error) {
		throw new Error(`Failed to load stale checkpoints: ${readErrorMessage(error)}`);
	}

	const staleRows = Array.isArray(data) ? data.map(toChatTurnCheckpoint) : [];
	if (staleRows.length === 0) {
		return { restoredActive: [], markedResumed: [] };
	}

	const resumeTurnRunIds = Array.from(
		new Set(
			staleRows
				.map((row) => row.resume_turn_run_id)
				.filter((id): id is string => typeof id === 'string' && id.length > 0)
		)
	);
	const completedResumeTurnRunIds = new Set<string>();
	if (resumeTurnRunIds.length > 0) {
		const { data: turnRows, error: turnError } = await params.supabase
			.from('chat_turn_runs')
			.select('id, status')
			.eq('user_id', params.userId)
			.in('id', resumeTurnRunIds);

		if (turnError) {
			throw new Error(`Failed to inspect resume turn runs: ${readErrorMessage(turnError)}`);
		}

		for (const row of Array.isArray(turnRows) ? turnRows : []) {
			if (row?.status === 'completed' && typeof row.id === 'string') {
				completedResumeTurnRunIds.add(row.id);
			}
		}
	}

	const markResumedIds = staleRows
		.filter(
			(row) =>
				row.resume_turn_run_id !== null &&
				completedResumeTurnRunIds.has(row.resume_turn_run_id)
		)
		.map((row) => row.id);
	const restoreActiveIds = staleRows
		.filter(
			(row) =>
				row.resume_turn_run_id === null ||
				!completedResumeTurnRunIds.has(row.resume_turn_run_id)
		)
		.map((row) => row.id);

	const markedResumed =
		markResumedIds.length > 0
			? await markStaleCheckpointsResumed({
					supabase: params.supabase,
					userId: params.userId,
					checkpointIds: markResumedIds,
					resumedAt: params.recoveredAt ?? new Date().toISOString()
				})
			: [];
	const restoredActive =
		restoreActiveIds.length > 0
			? await restoreStaleCheckpointsById({
					supabase: params.supabase,
					userId: params.userId,
					checkpointIds: restoreActiveIds
				})
			: [];

	return { restoredActive, markedResumed };
}

export function buildCheckpointResumeSystemMessage(checkpoint: ChatTurnCheckpoint): string {
	const context = checkpoint.resume_context ?? {};
	const question = checkpoint.question?.trim();
	const serializedContext = safeJsonStringify(context);
	return [
		'Continue from the previous supervisor checkpoint.',
		'Do not re-run completed reads or writes unless the user answer changes the target.',
		question ? `Supervisor question that paused the previous turn: ${question}` : null,
		`Checkpoint resume context: ${serializedContext}`
	]
		.filter((line): line is string => Boolean(line))
		.join('\n');
}

async function markStaleCheckpointsResumed(params: {
	supabase: TurnSupervisorSupabaseClient;
	userId: string;
	checkpointIds: string[];
	resumedAt: string;
}): Promise<ChatTurnCheckpoint[]> {
	const { data, error } = await params.supabase
		.from('chat_turn_checkpoints')
		.update({
			status: 'resumed',
			resumed_at: params.resumedAt
		})
		.eq('user_id', params.userId)
		.eq('status', 'resuming')
		.in('id', params.checkpointIds)
		.select('*');

	if (error) {
		throw new Error(`Failed to mark stale checkpoints resumed: ${readErrorMessage(error)}`);
	}
	return Array.isArray(data) ? data.map(toChatTurnCheckpoint) : [];
}

async function restoreStaleCheckpointsById(params: {
	supabase: TurnSupervisorSupabaseClient;
	userId: string;
	checkpointIds: string[];
}): Promise<ChatTurnCheckpoint[]> {
	const { data, error } = await params.supabase
		.from('chat_turn_checkpoints')
		.update({
			status: 'active',
			resume_turn_run_id: null,
			resume_started_at: null,
			resumed_at: null
		})
		.eq('user_id', params.userId)
		.eq('status', 'resuming')
		.in('id', params.checkpointIds)
		.select('*');

	if (error) {
		throw new Error(`Failed to restore stale checkpoints: ${readErrorMessage(error)}`);
	}
	return Array.isArray(data) ? data.map(toChatTurnCheckpoint) : [];
}

function toChatTurnCheckpoint(row: ChatTurnCheckpointRow): ChatTurnCheckpoint {
	if (!isTurnCheckpointStatus(row.status)) {
		throw new Error(`Unexpected turn checkpoint status: ${row.status}`);
	}
	return {
		...row,
		status: row.status
	};
}

function isTurnCheckpointStatus(value: string): value is TurnCheckpointStatus {
	return (
		value === 'active' ||
		value === 'resuming' ||
		value === 'resumed' ||
		value === 'expired' ||
		value === 'cancelled'
	);
}

function readErrorMessage(error: unknown): string {
	if (!error || typeof error !== 'object') return String(error);
	const message = (error as { message?: unknown }).message;
	return typeof message === 'string' && message.trim() ? message : JSON.stringify(error);
}

function safeJsonStringify(value: unknown): string {
	try {
		return JSON.stringify(value);
	} catch {
		return '{}';
	}
}
