// apps/worker/src/workers/agentic-chat/persistenceTrace.ts
// Bounded metadata only. These observations never authorize or settle work.
export type AgenticChatPersistenceTraceV1 = {
	event: 'agentic_chat_persistence_trace';
	lane: 'publisher' | 'usage';
	stage:
		| 'enqueued'
		| 'attempt_started'
		| 'attempt_finished'
		| 'accepted'
		| 'retry_scheduled'
		| 'pressure_started'
		| 'pressure_finished';
	turnRunId: string;
	executionGeneration: number;
	observedAt: string;
	operationId?: string;
	eventType?: string;
	rpc?: string;
	attempt?: number;
	sequence?: number;
	pendingEvents?: number;
	durationMs?: number;
	queueWaitMs?: number;
	retryWaitMs?: number;
	enqueueToReceiptMs?: number;
	retryDelayMs?: number;
	outcome?: string;
	errorCode?: string | null;
	passRole?: string;
	logicalProviderRound?: number;
};

export type AgenticChatPersistenceTraceSinkV1 = (trace: AgenticChatPersistenceTraceV1) => void;

export function logAgenticChatPersistenceTrace(trace: AgenticChatPersistenceTraceV1): void {
	console.info(JSON.stringify(trace));
}

export function emitAgenticChatPersistenceTrace(
	sink: AgenticChatPersistenceTraceSinkV1 | undefined,
	trace: AgenticChatPersistenceTraceV1
): void {
	try {
		sink?.(trace);
	} catch {
		// A logging outage must never change acceptance, retries, or billing.
	}
}

export function persistenceErrorCode(error: unknown): string | null {
	if (!error || typeof error !== 'object' || !('code' in error)) return null;
	const code = String(error.code);
	return /^(?:[A-Z0-9]{5}|PGRST[0-9]{3})$/.test(code) ? code : null;
}
