// apps/web/src/lib/services/agentic-chat-v2/turn-admission.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ChatContextType, Database } from '@buildos/shared-types';
import { isRunningTurnUniqueViolation } from './turn-run-conflicts';

type ChatTurnRunRow = Database['public']['Tables']['chat_turn_runs']['Row'];

export type ActiveFastChatTurn = Pick<ChatTurnRunRow, 'id' | 'stream_run_id' | 'started_at'>;

type TurnAdmissionDiagnostics = {
	activeTurn: ActiveFastChatTurn | null;
	activeTurnLookupError: unknown | null;
	activeTurnLookupMs: number;
	staleTurnCancelError: unknown | null;
	turnAdmissionMs: number | null;
};

export type FastChatTurnAdmissionResult =
	| (TurnAdmissionDiagnostics & {
			status: 'active_turn_running';
			activeTurn: ActiveFastChatTurn;
	  })
	| (TurnAdmissionDiagnostics & {
			status: 'insert_failed';
			turnRunId: string;
			insertError: unknown;
			activeTurnConflict: boolean;
	  })
	| (TurnAdmissionDiagnostics & {
			status: 'admitted';
			turnRunId: string;
	  });

type AdmitFastChatTurnParams = {
	supabase: SupabaseClient<Database>;
	sessionId: string;
	userId: string;
	streamRunId: string;
	clientTurnId: string | null;
	contextType: ChatContextType;
	entityId: string | null;
	projectId: string | null;
	gatewayEnabled: boolean;
	requestMessage: string;
	requestStartedAtMs: number;
	detachedTurnMaxDurationMs: number;
	createTurnRunId: () => string;
	now?: () => number;
};

function elapsedMs(startedAtMs: number, now: () => number): number {
	return Math.max(0, now() - startedAtMs);
}

/**
 * Acquires the one-running-turn-per-session lock.
 *
 * A recent running turn blocks admission. An expired running turn is cancelled
 * first, then the insert remains the authoritative lock acquisition so races
 * are still resolved by the database unique constraint.
 */
export async function admitFastChatTurn({
	supabase,
	sessionId,
	userId,
	streamRunId,
	clientTurnId,
	contextType,
	entityId,
	projectId,
	gatewayEnabled,
	requestMessage,
	requestStartedAtMs,
	detachedTurnMaxDurationMs,
	createTurnRunId,
	now = Date.now
}: AdmitFastChatTurnParams): Promise<FastChatTurnAdmissionResult> {
	const activeTurnLookupStartedAtMs = now();
	const { data: activeTurnRows, error: activeTurnLookupError } = await supabase
		.from('chat_turn_runs')
		.select('id, stream_run_id, started_at')
		.eq('session_id', sessionId)
		.eq('user_id', userId)
		.eq('status', 'running')
		.order('started_at', { ascending: false })
		.limit(1);
	const activeTurnLookupMs = elapsedMs(activeTurnLookupStartedAtMs, now);
	const activeTurn = Array.isArray(activeTurnRows) ? (activeTurnRows[0] ?? null) : null;
	let staleTurnCancelError: unknown | null = null;

	if (activeTurn) {
		const activeStartedAtMs = Date.parse(activeTurn.started_at);
		const activeTurnAgeMs = Number.isFinite(activeStartedAtMs)
			? Math.max(0, now() - activeStartedAtMs)
			: 0;

		if (activeTurnAgeMs < detachedTurnMaxDurationMs) {
			return {
				status: 'active_turn_running',
				activeTurn,
				activeTurnLookupError,
				activeTurnLookupMs,
				staleTurnCancelError,
				turnAdmissionMs: null
			};
		}

		const { error } = await supabase
			.from('chat_turn_runs')
			.update({
				status: 'cancelled',
				finished_reason: 'stale_running_turn',
				finished_at: new Date(now()).toISOString()
			})
			.eq('id', activeTurn.id)
			.eq('user_id', userId)
			.eq('status', 'running');
		staleTurnCancelError = error;
	}

	const turnRunId = createTurnRunId();
	const turnAdmissionStartedAtMs = now();
	let insertError: unknown | null = null;
	try {
		const { error } = await supabase.from('chat_turn_runs').insert({
			id: turnRunId,
			session_id: sessionId,
			user_id: userId,
			stream_run_id: streamRunId,
			client_turn_id: clientTurnId,
			source: 'live_ui',
			context_type: contextType,
			entity_id: entityId,
			project_id: projectId,
			gateway_enabled: gatewayEnabled,
			request_message: requestMessage,
			status: 'running',
			request_prewarmed_context: false,
			started_at: new Date(requestStartedAtMs).toISOString()
		});
		insertError = error;
	} catch (error) {
		insertError = error;
	}
	const turnAdmissionMs = elapsedMs(turnAdmissionStartedAtMs, now);
	const diagnostics = {
		activeTurn,
		activeTurnLookupError,
		activeTurnLookupMs,
		staleTurnCancelError,
		turnAdmissionMs
	};

	if (insertError) {
		return {
			...diagnostics,
			status: 'insert_failed',
			turnRunId,
			insertError,
			activeTurnConflict: isRunningTurnUniqueViolation(insertError)
		};
	}

	return {
		...diagnostics,
		status: 'admitted',
		turnRunId
	};
}
