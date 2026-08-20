// apps/worker/src/workers/agentic-chat/researchCapture.ts
import { createHash } from 'node:crypto';
import {
	type ResearchToolCall,
	buildResearchEntryFromCalls,
	buildResearchLogDescription,
	renderResearchEntry
} from '@buildos/agentic-chat-runtime/loop';
import {
	type JsonObject,
	type JsonValue,
	canonicalizeAgenticChatJson
} from '@buildos/shared-types';
import { runWithAbortableDeadline } from './abortableDeadline';
import type { AgenticChatWorkerExecutionInputV1 } from './executionInput';
import { agenticChatGenerationWriteFenceArgsV1 } from './writeFence';

const RESEARCH_CAPTURE_IDENTITY_VERSION = 'agentic_chat_research_capture_identity_v1';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const DATABASE_TIMESTAMP_PATTERN =
	/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;
export const AGENTIC_CHAT_RESEARCH_CAPTURE_TIMEOUT_MS = 10_000;

type RpcError = { code?: string; message: string };
type RpcResponse = PromiseLike<{ data: unknown; error: RpcError | null }> & {
	abortSignal?(signal: AbortSignal): RpcResponse;
};

export type AgenticChatResearchCaptureRpcClient = {
	rpc(name: string, args: Record<string, unknown>): RpcResponse;
};

export type AgenticChatResearchCaptureResultV1 =
	| { status: 'appended' | 'duplicate'; effectId: string; documentId: string; rotated: number }
	| { status: 'failed'; effectId: string; failureCode: string }
	| {
			status: 'skipped';
			reason:
				| 'no_project'
				| 'not_eligible'
				| 'cancel_requested'
				| 'stale_generation'
				| 'already_terminal';
	  };

export type AgenticChatResearchCapturePortV1 = {
	capture(input: {
		executionInput: AgenticChatWorkerExecutionInputV1;
		processingToken: string;
		signal: AbortSignal;
	}): Promise<AgenticChatResearchCaptureResultV1>;
};

export class AgenticChatResearchCaptureRpcError extends Error {
	constructor(
		readonly rpcName: string,
		readonly code: string,
		message: string
	) {
		super(`${rpcName} failed${code ? ` (${code})` : ''}: ${message}`);
		this.name = 'AgenticChatResearchCaptureRpcError';
	}
}

export class AgenticChatResearchCaptureProtocolError extends Error {
	constructor(message: string) {
		super(`Invalid Agentic Chat research-capture receipt: ${message}`);
		this.name = 'AgenticChatResearchCaptureProtocolError';
	}
}

/** Durable-evidence reader plus atomic, terminal-effect Research Log append. */
export class SupabaseAgenticChatResearchCaptureAdapter implements AgenticChatResearchCapturePortV1 {
	private readonly timeoutMs: number;

	constructor(
		private readonly client: AgenticChatResearchCaptureRpcClient,
		options: { timeoutMs?: number } = {}
	) {
		this.timeoutMs = options.timeoutMs ?? AGENTIC_CHAT_RESEARCH_CAPTURE_TIMEOUT_MS;
		if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1) {
			throw invalid('research capture timeout is invalid');
		}
	}

	async capture(input: {
		executionInput: AgenticChatWorkerExecutionInputV1;
		processingToken: string;
		signal: AbortSignal;
	}): Promise<AgenticChatResearchCaptureResultV1> {
		const { claim } = input.executionInput;
		const context = requireRecord(
			input.executionInput.requestPayload.context,
			'request context'
		);
		const projectId = context.projectId;
		if (projectId === null || projectId === undefined) {
			return { status: 'skipped', reason: 'no_project' };
		}
		canonicalUuid(projectId, 'projectId');
		canonicalUuid(input.processingToken, 'processingToken');

		const evidenceValue = await this.call(
			'load_agentic_chat_research_capture_evidence',
			{
				...agenticChatGenerationWriteFenceArgsV1({
					...claim,
					processingToken: input.processingToken
				}),
				p_user_id: claim.userId
			},
			input.signal
		);
		const evidence = parseEvidence(evidenceValue, input.executionInput);
		if (evidence.outcome !== 'eligible') {
			return { status: 'skipped', reason: evidence.outcome };
		}

		const entry = buildResearchEntryFromCalls(evidence.calls, {
			streamRunId: input.executionInput.streamRunId,
			userMessage: String(input.executionInput.requestPayload.message),
			capturedAt: evidence.capturedAt
		});
		if (!entry) throw invalid('eligible evidence did not satisfy the shared qualifier');
		const renderedEntry = renderResearchEntry(entry);
		const description = buildResearchLogDescription(entry);
		const identity = createStableResearchCaptureIdentity({
			turnRunId: claim.turnRunId,
			projectId,
			streamRunId: input.executionInput.streamRunId,
			renderedEntry,
			description
		});

		const applyValue = await this.call(
			'apply_agentic_chat_research_capture',
			{
				...agenticChatGenerationWriteFenceArgsV1({
					...claim,
					processingToken: input.processingToken
				}),
				p_user_id: claim.userId,
				p_effect_id: identity.effectId,
				p_canonical_argument_hash: identity.canonicalArgumentHash,
				p_project_id: projectId,
				p_stream_run_id: input.executionInput.streamRunId,
				p_rendered_entry: renderedEntry,
				p_description: description
			},
			input.signal
		);
		return parseApplyReceipt(applyValue, {
			...identity,
			turnRunId: claim.turnRunId,
			queueJobId: claim.queueJobId,
			sessionId: claim.sessionId,
			userId: claim.userId,
			executionGeneration: claim.executionGeneration,
			projectId,
			streamRunId: input.executionInput.streamRunId
		});
	}

	private async call(
		name: string,
		args: Record<string, unknown>,
		signal: AbortSignal
	): Promise<unknown> {
		const { data, error } = await runWithAbortableDeadline({
			parentSignal: signal,
			timeoutMs: this.timeoutMs,
			createTimeoutError: () =>
				new Error(`${name} exceeded its ${this.timeoutMs}ms deadline`),
			run: (deadlineSignal) => {
				const request = this.client.rpc(name, args);
				return request.abortSignal ? request.abortSignal(deadlineSignal) : request;
			}
		});
		if (error)
			throw new AgenticChatResearchCaptureRpcError(name, error.code ?? '', error.message);
		if (data === null || data === undefined) throw invalid(`${name} returned no receipt`);
		return data;
	}
}

function parseEvidence(
	value: unknown,
	expected: AgenticChatWorkerExecutionInputV1
):
	| { outcome: 'eligible'; capturedAt: string; calls: ResearchToolCall[] }
	| {
			outcome: 'not_eligible' | 'cancel_requested' | 'stale_generation' | 'already_terminal';
	  } {
	const receipt = requireRecord(value, 'evidence receipt');
	validateScope(receipt, expected);
	if (
		receipt.outcome === 'not_eligible' ||
		receipt.outcome === 'cancel_requested' ||
		receipt.outcome === 'stale_generation' ||
		receipt.outcome === 'already_terminal'
	) {
		return { outcome: receipt.outcome };
	}
	if (
		receipt.outcome !== 'eligible' ||
		typeof receipt.captured_at !== 'string' ||
		!DATABASE_TIMESTAMP_PATTERN.test(receipt.captured_at) ||
		!Array.isArray(receipt.calls) ||
		receipt.calls.length < 2
	) {
		throw invalid('eligible evidence fields are inconsistent');
	}
	const calls = receipt.calls.map((raw, index): ResearchToolCall => {
		const call = requireRecord(raw, `research call ${index}`);
		if (
			typeof call.name !== 'string' ||
			!isJsonObject(call.args) ||
			!isJsonValue(call.result)
		) {
			throw invalid(`research call ${index} is malformed`);
		}
		return { name: call.name, args: call.args, result: call.result };
	});
	return { outcome: 'eligible', capturedAt: receipt.captured_at, calls };
}

function parseApplyReceipt(
	value: unknown,
	expected: {
		effectId: string;
		canonicalArgumentHash: string;
		turnRunId: string;
		queueJobId: string;
		sessionId: string;
		userId: string;
		executionGeneration: number;
		projectId: string;
		streamRunId: string;
	}
): AgenticChatResearchCaptureResultV1 {
	const receipt = requireRecord(value, 'apply receipt');
	if (
		receipt.effect_id !== expected.effectId ||
		receipt.turn_run_id !== expected.turnRunId ||
		receipt.queue_job_id !== expected.queueJobId ||
		receipt.session_id !== expected.sessionId ||
		receipt.user_id !== expected.userId ||
		receipt.execution_generation !== expected.executionGeneration ||
		receipt.project_id !== expected.projectId ||
		receipt.stream_run_id !== expected.streamRunId ||
		receipt.canonical_argument_hash !== expected.canonicalArgumentHash
	) {
		throw invalid('apply receipt identity is inconsistent');
	}
	if (receipt.outcome === 'failed') {
		if (typeof receipt.failure_code !== 'string' || receipt.failure_code.length === 0) {
			throw invalid('failed apply receipt has no failure code');
		}
		return {
			status: 'failed',
			effectId: expected.effectId,
			failureCode: receipt.failure_code
		};
	}
	if (
		(receipt.outcome !== 'appended' && receipt.outcome !== 'duplicate') ||
		!canonicalUuidValue(receipt.document_id) ||
		!Number.isSafeInteger(receipt.rotated) ||
		(receipt.rotated as number) < 0
	) {
		throw invalid('successful apply receipt fields are inconsistent');
	}
	return {
		status: receipt.outcome,
		effectId: expected.effectId,
		documentId: receipt.document_id,
		rotated: receipt.rotated as number
	};
}

function validateScope(receipt: JsonObject, expected: AgenticChatWorkerExecutionInputV1): void {
	const { claim } = expected;
	if (
		receipt.turn_run_id !== claim.turnRunId ||
		receipt.queue_job_id !== claim.queueJobId ||
		receipt.session_id !== claim.sessionId ||
		receipt.user_id !== claim.userId ||
		receipt.stream_run_id !== expected.streamRunId ||
		!Number.isSafeInteger(receipt.execution_generation) ||
		(receipt.execution_generation as number) < 1 ||
		((receipt.outcome === 'eligible' ||
			receipt.outcome === 'not_eligible' ||
			receipt.outcome === 'cancel_requested') &&
			receipt.execution_generation !== claim.executionGeneration)
	) {
		throw invalid('evidence receipt scope is inconsistent');
	}
}

function createStableResearchCaptureIdentity(input: {
	turnRunId: string;
	projectId: string;
	streamRunId: string;
	renderedEntry: string;
	description: string;
}): { effectId: string; canonicalArgumentHash: string } {
	const canonicalArguments = canonicalizeAgenticChatJson({
		version: RESEARCH_CAPTURE_IDENTITY_VERSION,
		projectId: input.projectId,
		streamRunId: input.streamRunId,
		renderedEntry: input.renderedEntry,
		description: input.description
	});
	return {
		effectId: uuidFromSha256(`${RESEARCH_CAPTURE_IDENTITY_VERSION}:${input.turnRunId}`),
		canonicalArgumentHash: createHash('sha256').update(canonicalArguments, 'utf8').digest('hex')
	};
}

function uuidFromSha256(value: string): string {
	const bytes = createHash('sha256').update(value, 'utf8').digest().subarray(0, 16);
	bytes[6] = (bytes[6]! & 0x0f) | 0x50;
	bytes[8] = (bytes[8]! & 0x3f) | 0x80;
	const hex = bytes.toString('hex');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function requireRecord(value: unknown, label: string): JsonObject {
	if (!isJsonObject(value)) throw invalid(`${label} must be an object`);
	return value;
}

function isJsonObject(value: unknown): value is JsonObject {
	return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isJsonValue(value: unknown): value is JsonValue {
	try {
		canonicalizeAgenticChatJson(value as JsonValue);
		return true;
	} catch {
		return false;
	}
}

function canonicalUuid(value: unknown, label: string): asserts value is string {
	if (!canonicalUuidValue(value)) throw invalid(`${label} is not a canonical UUID`);
}

function canonicalUuidValue(value: unknown): value is string {
	return typeof value === 'string' && UUID_PATTERN.test(value) && value === value.toLowerCase();
}

function invalid(message: string): AgenticChatResearchCaptureProtocolError {
	return new AgenticChatResearchCaptureProtocolError(message);
}
