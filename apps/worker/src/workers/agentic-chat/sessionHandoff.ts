import type { ChatContextType } from '@buildos/shared-types';
import type { AgenticChatExecutionIdentityV1 } from './executionControl';
import { runWithAbortableDeadline } from './abortableDeadline';
import { agenticChatGenerationWriteFenceArgsV1 } from './writeFence';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DATABASE_TIMESTAMP_PATTERN =
	/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const CONTEXT_TYPES = new Set<ChatContextType>([
	'global',
	'project',
	'calendar',
	'daily_brief',
	'general',
	'project_create',
	'daily_brief_update',
	'ontology'
]);

export const AGENTIC_CHAT_SESSION_HANDOFF_TIMEOUT_MS = 30_000;

type RpcError = { code?: string; message: string };
type RpcResponse = PromiseLike<{ data: unknown; error: RpcError | null }> & {
	abortSignal?(signal: AbortSignal): RpcResponse;
};

export type AgenticChatSessionHandoffRpcClient = {
	rpc(name: string, args: Record<string, unknown>): RpcResponse;
};

export type AgenticChatSessionHandoffInputV1 = AgenticChatExecutionIdentityV1 & {
	userId: string;
	sessionId: string;
	executionGeneration: number;
	contextType: ChatContextType;
	entityId: string | null;
	projectId: string | null;
};

export type AgenticChatSessionHandoffPortV1 = {
	persist(input: AgenticChatSessionHandoffInputV1, signal: AbortSignal): Promise<void>;
};

export class AgenticChatSessionHandoffRpcError extends Error {
	readonly failureClass = 'transient_infra' as const;

	constructor(
		readonly code: string,
		message: string
	) {
		super(`persist_agentic_chat_session_handoff failed${code ? ` (${code})` : ''}: ${message}`);
		this.name = 'AgenticChatSessionHandoffRpcError';
	}
}

export class AgenticChatSessionHandoffFenceError extends Error {
	readonly failureClass = 'unknown' as const;

	constructor(readonly outcome: 'stale_generation') {
		super(`Agentic Chat session handoff lost its execution fence (${outcome})`);
		this.name = 'AgenticChatSessionHandoffFenceError';
	}
}

export class AgenticChatSessionHandoffTimeoutError extends Error {
	readonly code = 'session_handoff_persist_timeout';
	readonly failureClass = 'transient_infra' as const;

	constructor(timeoutMs: number) {
		super(`Agentic Chat session handoff exceeded its ${timeoutMs}ms deadline`);
		this.name = 'AgenticChatSessionHandoffTimeoutError';
	}
}

export class AgenticChatSessionHandoffProtocolError extends Error {
	constructor(message: string) {
		super(`Invalid Agentic Chat session-handoff receipt: ${message}`);
		this.name = 'AgenticChatSessionHandoffProtocolError';
	}
}

export class SupabaseAgenticChatSessionHandoffAdapter implements AgenticChatSessionHandoffPortV1 {
	private readonly timeoutMs: number;

	constructor(
		private readonly client: AgenticChatSessionHandoffRpcClient,
		options: { timeoutMs?: number } = {}
	) {
		this.timeoutMs = options.timeoutMs ?? AGENTIC_CHAT_SESSION_HANDOFF_TIMEOUT_MS;
	}

	async persist(
		input: AgenticChatSessionHandoffInputV1,
		signal: AbortSignal = new AbortController().signal
	): Promise<void> {
		validateInput(input);
		const { data, error } = await runWithAbortableDeadline({
			parentSignal: signal,
			timeoutMs: this.timeoutMs,
			createTimeoutError: () => new AgenticChatSessionHandoffTimeoutError(this.timeoutMs),
			run: (deadlineSignal) => {
				const request = this.client.rpc('persist_agentic_chat_session_handoff', {
					...agenticChatGenerationWriteFenceArgsV1(input),
					p_user_id: input.userId,
					p_context_type: input.contextType,
					p_entity_id: input.entityId,
					p_project_id: input.projectId
				});
				return request.abortSignal?.(deadlineSignal) ?? request;
			}
		});
		if (error) throw new AgenticChatSessionHandoffRpcError(error.code ?? '', error.message);
		if (data === null || data === undefined) throw protocolError('RPC returned no receipt');
		parseReceipt(data, input);
	}
}

function validateInput(input: AgenticChatSessionHandoffInputV1): void {
	canonicalUuid(input.turnRunId, 'turnRunId');
	canonicalUuid(input.queueJobId, 'queueJobId');
	canonicalUuid(input.processingToken, 'processingToken');
	canonicalUuid(input.userId, 'userId');
	canonicalUuid(input.sessionId, 'sessionId');
	if (!Number.isSafeInteger(input.executionGeneration) || input.executionGeneration < 1) {
		throw protocolError('execution generation is invalid');
	}
	if (!CONTEXT_TYPES.has(input.contextType)) throw protocolError('context type is invalid');
	if (input.entityId !== null) canonicalUuid(input.entityId, 'entityId');
	if (input.projectId !== null) canonicalUuid(input.projectId, 'projectId');
	if (
		input.contextType === 'project' &&
		(input.entityId === null || input.projectId === null || input.entityId !== input.projectId)
	) {
		throw protocolError('project context requires one matching entity and project id');
	}
}

function parseReceipt(value: unknown, expected: AgenticChatSessionHandoffInputV1): void {
	const receipt = requireRecord(value);
	if (
		receipt.turn_run_id !== expected.turnRunId ||
		receipt.queue_job_id !== expected.queueJobId ||
		receipt.session_id !== expected.sessionId ||
		receipt.user_id !== expected.userId ||
		!Number.isSafeInteger(receipt.execution_generation) ||
		(receipt.execution_generation as number) < 1
	) {
		throw protocolError('scope is inconsistent');
	}
	if (receipt.outcome === 'stale_generation') {
		throw new AgenticChatSessionHandoffFenceError('stale_generation');
	}
	if (receipt.outcome !== 'persisted' && receipt.outcome !== 'already_applied') {
		throw protocolError('outcome is invalid');
	}
	if (
		receipt.execution_generation !== expected.executionGeneration ||
		receipt.context_type !== expected.contextType ||
		receipt.entity_id !== expected.entityId ||
		receipt.project_id !== expected.projectId ||
		typeof receipt.shifted_at !== 'string' ||
		!DATABASE_TIMESTAMP_PATTERN.test(receipt.shifted_at) ||
		!Number.isFinite(Date.parse(receipt.shifted_at))
	) {
		throw protocolError('persisted handoff is inconsistent');
	}
}

function canonicalUuid(value: unknown, name: string): asserts value is string {
	if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
		throw protocolError(`${name} is not a canonical UUID`);
	}
}

function requireRecord(value: unknown): Record<string, unknown> {
	if (value === null || typeof value !== 'object' || Array.isArray(value)) {
		throw protocolError('receipt is not an object');
	}
	return value as Record<string, unknown>;
}

function protocolError(message: string): AgenticChatSessionHandoffProtocolError {
	return new AgenticChatSessionHandoffProtocolError(message);
}
