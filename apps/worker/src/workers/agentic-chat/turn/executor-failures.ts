// apps/worker/src/workers/agentic-chat/turn/executor-failures.ts
//
// How a turn failure is classified, coded, and reported: the recovery failure
// class, the terminal failure code, eligibility for the partial-completion
// lane, and the diagnostics written to the queue job log and effect reporters.
import {
	type AgenticChatRecoveryFailureClassV1,
	classifyAgenticChatRetryV1
} from '@buildos/shared-types';
import type { ProcessingJob } from '../../../lib/supabaseQueue';
import { AgenticChatCancellationError } from './cancellation-observer';
import { AgenticChatTurnLeaseLostError } from './turn-lease';
import {
	AgenticChatExecutionInputError,
	type AgenticChatWorkerExecutionInputV1
} from './execution-input';
import { AgenticChatEffectExecutionError } from '../mutations/mutation-executor';
import {
	AgenticChatPublisherBlockedError,
	AgenticChatPublisherOverloadError
} from '../stream/stream-publisher';
import { AgenticChatProviderExecutionError } from '../provider/contracts';
import { AgenticChatReadToolFenceTimeoutError } from '../tools/read-tool-fence';
import {
	AgenticChatToolExecutionFenceError,
	AgenticChatToolExecutionTimeoutError
} from '../tools/tool-execution';
import type {
	AgenticChatExecutorEffects,
	AgenticChatTerminalControlErrorReportV1
} from '../effects/executor-effects';
import {
	AgenticChatSessionHandoffFenceError,
	AgenticChatSessionHandoffRpcError,
	AgenticChatSessionHandoffTimeoutError
} from './session-handoff';
import type { TerminalClaim } from './executor-contracts';
import { canonicalText } from './executor-helpers';

/**
 * Post-start failure classes that finalize `completed` / `mutation_unfulfilled`
 * with the partial disclosure once at least one durable write exists. Cancelled,
 * publisher_overload, stale_context, and uncertain_external_commit stay on the
 * failure path; pre-start classes never have durable writes.
 */
export const PARTIAL_COMPLETION_FAILURE_CLASSES: ReadonlySet<AgenticChatRecoveryFailureClassV1> =
	new Set<AgenticChatRecoveryFailureClassV1>([
		'timeout_post_start',
		'permanent',
		'transient_infra',
		'unknown',
		'provider_throttle'
	]);

export function classifyFailure(
	error: unknown,
	executionStarted: boolean,
	signal: AbortSignal
): AgenticChatRecoveryFailureClassV1 {
	// Once an irreversible effect reports uncertainty, a concurrent cancellation
	// cannot downgrade the recovery classification to ordinary cancellation.
	// A committed-effect persist failure classifies as its cause so recovery
	// semantics (timeout, database error) are unchanged; only the partial-
	// completion lane treats the wrapper specially.
	if (error instanceof AgenticChatCommittedEffectPersistError) {
		return classifyFailure(error.cause, executionStarted, signal);
	}
	if (error instanceof AgenticChatEffectExecutionError) return error.failureClass;
	if (error instanceof AgenticChatToolExecutionFenceError) return error.failureClass;
	if (error instanceof AgenticChatToolExecutionTimeoutError) return error.failureClass;
	if (error instanceof AgenticChatReadToolFenceTimeoutError) return error.failureClass;
	if (error instanceof AgenticChatSessionHandoffFenceError) return error.failureClass;
	if (error instanceof AgenticChatSessionHandoffRpcError) return error.failureClass;
	if (error instanceof AgenticChatSessionHandoffTimeoutError) return error.failureClass;
	if (error instanceof AgenticChatProviderExecutionError) return error.failureClass;
	const reason = signal.aborted ? signal.reason : error;
	if (reason instanceof AgenticChatCancellationError) return 'cancelled';
	if (reason instanceof AgenticChatPublisherOverloadError) return 'publisher_overload';
	if (error instanceof AgenticChatExecutionInputError) {
		if (error.code === 'database_error') return 'transient_infra';
		if (error.code === 'artifact_expired') return 'stale_context';
		return 'permanent';
	}
	if (signal.aborted) return executionStarted ? 'timeout_post_start' : 'timeout_pre_start';
	return executionStarted ? 'unknown' : 'transient_infra';
}

/**
 * A mutation effect committed but its receipt row could not be persisted. The
 * turn must keep the failure route: the ledger knows the effect, and a partial
 * disclosure would name a committed write as not done.
 */
export class AgenticChatCommittedEffectPersistError extends Error {
	readonly effectId: string;
	readonly cause: unknown;
	constructor(effectId: string, cause: unknown) {
		super(
			cause instanceof Error
				? cause.message
				: 'Committed mutation receipt could not be persisted.'
		);
		this.name = 'AgenticChatCommittedEffectPersistError';
		this.effectId = effectId;
		this.cause = cause;
	}
}

/** This worker no longer owns the turn; terminal truth belongs to the DB, not a partial. */
export function isExecutionFenceLost(error: unknown): boolean {
	return (
		error instanceof AgenticChatToolExecutionFenceError ||
		error instanceof AgenticChatSessionHandoffFenceError
	);
}

export function specificTerminalFailureCode(
	error: unknown,
	signal: AbortSignal
): string | undefined {
	const reason = signal.aborted ? signal.reason : error;
	const unwrapped =
		reason instanceof AgenticChatCommittedEffectPersistError ? reason.cause : reason;
	const candidate = unwrapped ?? error;
	// The database stopped counting this worker as alive (or it could not prove
	// it was): a distinct code, so a lease loss is never read as a model timeout.
	if (candidate instanceof AgenticChatTurnLeaseLostError) return candidate.code;
	if (candidate instanceof AgenticChatToolExecutionTimeoutError) return candidate.code;
	if (candidate instanceof AgenticChatReadToolFenceTimeoutError) return candidate.code;
	if (candidate instanceof AgenticChatProviderExecutionError) {
		return canonicalText(candidate.code, 128) ? candidate.code : undefined;
	}
	return undefined;
}

export function executionErrorCode(error: unknown, signal: AbortSignal): string {
	const reason = signal.aborted ? signal.reason : error;
	if (
		reason &&
		typeof reason === 'object' &&
		typeof (reason as { code?: unknown }).code === 'string'
	) {
		return String((reason as { code: string }).code).slice(0, 128);
	}
	if (reason instanceof Error && reason.name) return reason.name.slice(0, 128);
	return 'unknown';
}

export function cancellationInterruptionReason(
	error: unknown,
	signal: AbortSignal
): string | undefined {
	const reason = signal.aborted ? signal.reason : error;
	return reason instanceof AgenticChatCancellationError && canonicalText(reason.cancelReason, 256)
		? reason.cancelReason
		: undefined;
}

export function canonicalErrorMessage(message: string): string {
	const normalized = message.trim().slice(0, 2_000);
	return normalized || 'Agentic Chat fixture execution failed';
}

export function errorMessage(error: unknown): string {
	return canonicalErrorMessage(error instanceof Error ? error.message : String(error));
}

export function reportTerminalControlError(
	effects: Pick<AgenticChatExecutorEffects, 'reportTerminalControlError'>,
	stage: AgenticChatTerminalControlErrorReportV1['stage'],
	claim: { turnRunId: string; executionGeneration: number | null },
	error: unknown
): void {
	effects.reportTerminalControlError({
		stage,
		turnRunId: claim.turnRunId,
		executionGeneration: claim.executionGeneration,
		error
	});
}

type AgenticChatExecutionBoundaryStage =
	| 'read_op'
	| 'ledger_persist'
	| 'tool_result_publish'
	| 'tool_round';

export function logAgenticChatExecutionBoundary(
	job: Pick<ProcessingJob, 'log'>,
	executionInput: AgenticChatWorkerExecutionInputV1,
	input: {
		stage: AgenticChatExecutionBoundaryStage;
		state: 'started' | 'finished' | 'failed';
		providerToolCallId: string;
		toolName: string;
		durationMs?: number;
		error?: unknown;
	}
): Promise<void> {
	const failure = executionBoundaryFailure(input.error);
	const record = {
		event: 'agentic_chat_execution_boundary',
		stage: input.stage,
		state: input.state,
		turn_run_id: executionInput.claim.turnRunId,
		queue_job_id: executionInput.claim.queueJobId,
		execution_generation: executionInput.claim.executionGeneration,
		provider_tool_call_id: input.providerToolCallId,
		tool_name: input.toolName,
		...(input.durationMs !== undefined ? { duration_ms: input.durationMs } : {}),
		...failure
	};
	try {
		void job.log(JSON.stringify(record)).catch(() => undefined);
	} catch {
		// Diagnostic logging must never become part of the execution boundary.
	}
	return Promise.resolve();
}

export function logAgenticChatTypedExecutionFailure(
	job: Pick<ProcessingJob, 'log'>,
	claim: TerminalClaim,
	error: unknown,
	failureClass: AgenticChatRecoveryFailureClassV1,
	signal: AbortSignal,
	executionStarted: boolean
): void {
	const reason = signal.aborted ? signal.reason : error;
	const providerError =
		reason instanceof AgenticChatProviderExecutionError
			? reason
			: error instanceof AgenticChatProviderExecutionError
				? error
				: null;
	let diagnostic: Record<string, string | number> = {};
	if (providerError) {
		try {
			diagnostic = providerExecutionDiagnostic(providerError);
		} catch {
			// A malformed optional diagnostic must not suppress the base failure log.
		}
	}
	const record = {
		event: 'agentic_chat_typed_execution_failure',
		turn_run_id: claim.turnRunId,
		queue_job_id: claim.queueJobId,
		execution_generation: claim.executionGeneration,
		execution_error_code: providerError?.code ?? executionErrorCode(error, signal),
		failure_class: failureClass,
		retry_classification: classifyAgenticChatRetryV1(failureClass),
		execution_started: executionStarted,
		...diagnostic,
		// A blocked publisher names the guard that blocked it; without this the
		// log says only "AgenticChatPublisherBlockedError" and the cause is lost.
		...(error instanceof AgenticChatPublisherBlockedError
			? { publisher_block_outcome: error.outcome.slice(0, 160) }
			: {})
	};
	try {
		void job.log(JSON.stringify(record)).catch(() => undefined);
	} catch {
		// Provider diagnostics must never alter recovery or terminal truth.
	}
}

function providerExecutionDiagnostic(
	error: AgenticChatProviderExecutionError
): Record<string, string | number> {
	const diagnostic = error.diagnostic;
	if (!diagnostic) return {};
	if (diagnostic.kind === 'rejected_tool_arguments') {
		// Shape and position only. Never the argument text, the prompt, or hidden
		// reasoning — the hash exists so repeats can be correlated without them.
		const toolName = canonicalProviderToolDiagnosticName(diagnostic.toolName);
		const argumentBytes = boundedDiagnosticInteger(diagnostic.argumentBytes, 64 * 1024);
		const parseErrorOffset = boundedDiagnosticInteger(diagnostic.parseErrorOffset, 64 * 1024);
		return {
			rejected_tool_arguments_stage: diagnostic.stage,
			...(toolName ? { rejected_provider_tool_name: toolName } : {}),
			...(argumentBytes !== null ? { rejected_tool_argument_bytes: argumentBytes } : {}),
			...(parseErrorOffset !== null
				? { rejected_tool_argument_parse_offset: parseErrorOffset }
				: {}),
			...(diagnostic.parseErrorCategory
				? { rejected_tool_argument_parse_category: diagnostic.parseErrorCategory }
				: {}),
			...(diagnostic.finishedReason &&
			/^[A-Za-z0-9_.:-]{1,64}$/.test(diagnostic.finishedReason)
				? { provider_finished_reason: diagnostic.finishedReason }
				: {}),
			completion_budget_exhausted: diagnostic.completionBudgetExhausted ? 1 : 0,
			rejected_tool_argument_sha256: diagnostic.argumentSha256
		};
	}
	if (diagnostic.kind !== 'rejected_tool_name') return {};
	const rejectedToolName = canonicalProviderToolDiagnosticName(diagnostic.rejectedToolName);
	const repeatedAdvertisedToolName = canonicalProviderToolDiagnosticName(
		diagnostic.repeatedAdvertisedToolName
	);
	const rejectedToolNameLength = boundedDiagnosticInteger(diagnostic.rejectedToolNameLength, 256);
	const advertisedToolCount = boundedDiagnosticInteger(diagnostic.advertisedToolCount, 256);
	const repeatedToolNameCount = boundedDiagnosticInteger(diagnostic.repeatedToolNameCount, 256);
	return {
		...(rejectedToolName ? { rejected_provider_tool_name: rejectedToolName } : {}),
		...(rejectedToolNameLength !== null
			? { rejected_provider_tool_name_length: rejectedToolNameLength }
			: {}),
		...(advertisedToolCount !== null ? { advertised_tool_count: advertisedToolCount } : {}),
		...(repeatedAdvertisedToolName
			? { repeated_advertised_tool_name: repeatedAdvertisedToolName }
			: {}),
		...(repeatedToolNameCount !== null
			? { repeated_tool_name_count: repeatedToolNameCount }
			: {})
	};
}

function canonicalProviderToolDiagnosticName(value: unknown): string | null {
	if (
		typeof value !== 'string' ||
		value.length < 1 ||
		value.length > 256 ||
		!/^[A-Za-z0-9_.:-]+$/.test(value)
	) {
		return null;
	}
	return value;
}

function boundedDiagnosticInteger(value: unknown, maximum: number): number | null {
	return Number.isSafeInteger(value) && (value as number) >= 1 && (value as number) <= maximum
		? (value as number)
		: null;
}

function executionBoundaryFailure(error: unknown): Record<string, string> {
	if (error === undefined) return {};
	const candidate =
		error && typeof error === 'object'
			? (error as { code?: unknown; failureClass?: unknown; name?: unknown })
			: {};
	const code = canonicalBoundaryLabel(candidate.code, 128);
	const failureClass = canonicalBoundaryLabel(candidate.failureClass, 128);
	const errorName = canonicalBoundaryLabel(
		candidate.name ?? (error instanceof Error ? error.name : typeof error),
		128
	);
	return {
		...(code ? { error_code: code } : {}),
		...(failureClass ? { failure_class: failureClass } : {}),
		...(errorName ? { error_name: errorName } : {})
	};
}

function canonicalBoundaryLabel(value: unknown, maximum: number): string | null {
	if (typeof value !== 'string') return null;
	const normalized = value.trim();
	return normalized && normalized.length <= maximum ? normalized : null;
}
