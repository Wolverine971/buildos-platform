// apps/worker/src/workers/agentic-chat/supervisorCheckpoint.ts

import { createHash } from 'node:crypto';
import {
	type JsonObject,
	type JsonValue,
	canonicalizeAgenticChatJson
} from '@buildos/shared-types';
import type { AgenticChatExecutionIdentityV1 } from './executionControl';
import { runWithAbortableDeadline } from './abortableDeadline';
import { createStableAgenticChatSupervisorTransitionIdV1 } from './workerSupervisor';
import { agenticChatGenerationWriteFenceArgsV1 } from './writeFence';

const CHECKPOINT_IDENTITY_VERSION = 'agentic_chat_supervisor_checkpoint_identity_v1';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DATABASE_TIMESTAMP_PATTERN =
	/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
const MAX_CHECKPOINT_PAYLOAD_BYTES = 256 * 1024;
export const AGENTIC_CHAT_SUPERVISOR_CHECKPOINT_TIMEOUT_MS = 10_000;

type RpcError = { code?: string; message: string };
type RpcResponse = PromiseLike<{ data: unknown; error: RpcError | null }> & {
	abortSignal?(signal: AbortSignal): RpcResponse;
};

export type AgenticChatSupervisorCheckpointRpcClient = {
	rpc(name: string, args: Record<string, unknown>): RpcResponse;
};

export type AgenticChatSupervisorCheckpointPersistInputV1 = AgenticChatExecutionIdentityV1 & {
	userId: string;
	sessionId: string;
	executionGeneration: number;
	checkpointId: string;
	supervisorTransitionId: string;
	sequence: number;
	reason: string;
	question: string;
	digest: JsonObject;
	resumeContext: JsonObject;
	supervisorDecision: JsonObject;
};

export type AgenticChatSupervisorCheckpointPersistResultV1 = {
	outcome: 'persisted' | 'already_persisted';
	checkpointId: string;
	expiresAt: string;
};

export type AgenticChatSupervisorCheckpointPortV1 = {
	persist(
		input: AgenticChatSupervisorCheckpointPersistInputV1,
		signal: AbortSignal
	): Promise<AgenticChatSupervisorCheckpointPersistResultV1>;
};

export class AgenticChatSupervisorCheckpointRpcError extends Error {
	constructor(
		readonly code: string,
		message: string
	) {
		super(
			`persist_agentic_chat_supervisor_question_checkpoint failed${code ? ` (${code})` : ''}: ${message}`
		);
		this.name = 'AgenticChatSupervisorCheckpointRpcError';
	}
}

export class AgenticChatSupervisorCheckpointFenceError extends Error {
	constructor(
		readonly outcome: 'stale_generation' | 'cancel_requested' | 'already_terminal',
		readonly failureClass: 'cancelled' | 'unknown'
	) {
		super(`Agentic Chat supervisor checkpoint lost its execution fence (${outcome})`);
		this.name = 'AgenticChatSupervisorCheckpointFenceError';
	}
}

export class AgenticChatSupervisorCheckpointTimeoutError extends Error {
	readonly code = 'supervisor_checkpoint_persist_timeout';
	readonly failureClass = 'transient_infra' as const;

	constructor(timeoutMs: number) {
		super(`Agentic Chat supervisor checkpoint exceeded its ${timeoutMs}ms deadline`);
		this.name = 'AgenticChatSupervisorCheckpointTimeoutError';
	}
}

export class SupabaseAgenticChatSupervisorCheckpointAdapter
	implements AgenticChatSupervisorCheckpointPortV1
{
	private readonly timeoutMs: number;

	constructor(
		private readonly client: AgenticChatSupervisorCheckpointRpcClient,
		options: { timeoutMs?: number } = {}
	) {
		this.timeoutMs = options.timeoutMs ?? AGENTIC_CHAT_SUPERVISOR_CHECKPOINT_TIMEOUT_MS;
		if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1) {
			throw invalid('checkpoint timeout is invalid');
		}
	}

	async persist(
		input: AgenticChatSupervisorCheckpointPersistInputV1,
		signal: AbortSignal
	): Promise<AgenticChatSupervisorCheckpointPersistResultV1> {
		validateInput(input);
		const { data, error } = await runWithAbortableDeadline({
			parentSignal: signal,
			timeoutMs: this.timeoutMs,
			createTimeoutError: () =>
				new AgenticChatSupervisorCheckpointTimeoutError(this.timeoutMs),
			run: (deadlineSignal) => {
				const request = this.client.rpc(
					'persist_agentic_chat_supervisor_question_checkpoint',
					{
						...agenticChatGenerationWriteFenceArgsV1(input),
						p_user_id: input.userId,
						p_checkpoint_id: input.checkpointId,
						p_supervisor_transition_id: input.supervisorTransitionId,
						p_sequence: input.sequence,
						p_reason: input.reason,
						p_question: input.question,
						p_digest: input.digest,
						p_resume_context: input.resumeContext,
						p_supervisor_decision: input.supervisorDecision
					}
				);
				return request.abortSignal ? request.abortSignal(deadlineSignal) : request;
			}
		});
		if (error) {
			throw new AgenticChatSupervisorCheckpointRpcError(error.code ?? '', error.message);
		}
		return parseReceipt(data, input);
	}
}

export function createStableAgenticChatSupervisorCheckpointIdV1(input: {
	turnRunId: string;
	executionGeneration: number;
	supervisorTransitionId: string;
}): string {
	canonicalUuid(input.turnRunId, 'turnRunId');
	canonicalUuid(input.supervisorTransitionId, 'supervisorTransitionId');
	if (!Number.isSafeInteger(input.executionGeneration) || input.executionGeneration < 1) {
		throw invalid('execution generation is invalid');
	}
	const bytes = createHash('sha256')
		.update(
			`${CHECKPOINT_IDENTITY_VERSION}:${input.turnRunId}:${input.executionGeneration}:${input.supervisorTransitionId}`,
			'utf8'
		)
		.digest()
		.subarray(0, 16);
	bytes[6] = (bytes[6]! & 0x0f) | 0x50;
	bytes[8] = (bytes[8]! & 0x3f) | 0x80;
	const hex = bytes.toString('hex');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function validateInput(input: AgenticChatSupervisorCheckpointPersistInputV1): void {
	canonicalUuid(input.turnRunId, 'turnRunId');
	canonicalUuid(input.userId, 'userId');
	canonicalUuid(input.sessionId, 'sessionId');
	canonicalUuid(input.queueJobId, 'queueJobId');
	canonicalUuid(input.processingToken, 'processingToken');
	canonicalUuid(input.checkpointId, 'checkpointId');
	canonicalUuid(input.supervisorTransitionId, 'supervisorTransitionId');
	if (!Number.isSafeInteger(input.executionGeneration) || input.executionGeneration < 1) {
		throw invalid('execution generation is invalid');
	}
	if (!Number.isSafeInteger(input.sequence) || input.sequence < 1) {
		throw invalid('supervisor sequence is invalid');
	}
	if (
		input.supervisorTransitionId !==
		createStableAgenticChatSupervisorTransitionIdV1({
			turnRunId: input.turnRunId,
			executionGeneration: input.executionGeneration,
			sequence: input.sequence,
			action: 'ask_user'
		})
	) {
		throw invalid('supervisor transition id is not the stable ask-user identity');
	}
	if (
		input.checkpointId !==
		createStableAgenticChatSupervisorCheckpointIdV1({
			turnRunId: input.turnRunId,
			executionGeneration: input.executionGeneration,
			supervisorTransitionId: input.supervisorTransitionId
		})
	) {
		throw invalid('checkpoint id is not the stable supervisor identity');
	}
	canonicalText(input.reason, 'reason', 256);
	canonicalText(input.question, 'question', 4_000);
	for (const [label, value] of [
		['digest', input.digest],
		['resume context', input.resumeContext],
		['supervisor decision', input.supervisorDecision]
	] as const) {
		if (!value || typeof value !== 'object' || Array.isArray(value)) {
			throw invalid(`${label} is invalid`);
		}
		if (
			Buffer.byteLength(canonicalizeAgenticChatJson(value as JsonValue), 'utf8') >
			MAX_CHECKPOINT_PAYLOAD_BYTES
		) {
			throw invalid(`${label} exceeds its bound`);
		}
	}
	const decision = input.supervisorDecision;
	if (
		decision.action !== 'ask_user' ||
		decision.reason !== input.reason ||
		decision.question !== input.question ||
		!sameJson(decision.checkpoint, {
			digest: input.digest,
			resumeContext: input.resumeContext
		})
	) {
		throw invalid('supervisor decision does not match the checkpoint payload');
	}
}

function parseReceipt(
	value: unknown,
	expected: AgenticChatSupervisorCheckpointPersistInputV1
): AgenticChatSupervisorCheckpointPersistResultV1 {
	const receipt = requireRecord(value);
	if (
		receipt.turn_run_id !== expected.turnRunId ||
		receipt.queue_job_id !== expected.queueJobId ||
		receipt.session_id !== expected.sessionId ||
		receipt.user_id !== expected.userId ||
		!Number.isSafeInteger(receipt.execution_generation) ||
		(receipt.execution_generation as number) < 1
	) {
		throw invalid('receipt scope is inconsistent');
	}

	if (receipt.outcome === 'persisted' || receipt.outcome === 'already_persisted') {
		if (
			receipt.execution_generation !== expected.executionGeneration ||
			receipt.checkpoint_id !== expected.checkpointId ||
			receipt.supervisor_transition_id !== expected.supervisorTransitionId ||
			receipt.sequence !== expected.sequence ||
			receipt.checkpoint_type !== 'supervisor_question' ||
			receipt.status !== 'active' ||
			receipt.reason !== expected.reason ||
			receipt.question !== expected.question ||
			!isTimestamp(receipt.created_at) ||
			!isTimestamp(receipt.expires_at)
		) {
			throw invalid('persisted checkpoint receipt is inconsistent');
		}
		return {
			outcome: receipt.outcome,
			checkpointId: expected.checkpointId,
			expiresAt: receipt.expires_at as string
		};
	}

	if (
		receipt.outcome === 'stale_generation' ||
		receipt.outcome === 'cancel_requested' ||
		receipt.outcome === 'already_terminal'
	) {
		throw new AgenticChatSupervisorCheckpointFenceError(
			receipt.outcome,
			receipt.outcome === 'cancel_requested' ? 'cancelled' : 'unknown'
		);
	}
	throw invalid('receipt outcome is invalid');
}

function sameJson(left: unknown, right: JsonObject): boolean {
	if (!left || typeof left !== 'object' || Array.isArray(left)) return false;
	return (
		canonicalizeAgenticChatJson(left as JsonValue) ===
		canonicalizeAgenticChatJson(right as JsonValue)
	);
}

function requireRecord(value: unknown): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw invalid('receipt is not an object');
	}
	return value as Record<string, unknown>;
}

function canonicalText(value: string, label: string, maxLength: number): void {
	if (!value || value !== value.trim() || value.length > maxLength) {
		throw invalid(`${label} is invalid`);
	}
}

function canonicalUuid(value: string, label: string): void {
	if (!UUID_PATTERN.test(value) || value !== value.toLowerCase()) {
		throw invalid(`${label} is invalid`);
	}
}

function isTimestamp(value: unknown): value is string {
	return typeof value === 'string' && DATABASE_TIMESTAMP_PATTERN.test(value);
}

function invalid(message: string): AgenticChatSupervisorCheckpointRpcError {
	return new AgenticChatSupervisorCheckpointRpcError(
		'supervisor_checkpoint_protocol_error',
		`Invalid Agentic Chat supervisor checkpoint: ${message}`
	);
}
