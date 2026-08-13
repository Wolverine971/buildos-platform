// apps/worker/src/workers/agentic-chat/workerSupervisor.ts
import { createHash } from 'node:crypto';
import {
	type TurnDigest,
	type TurnSupervisor,
	type TurnSupervisorDecision,
	type TurnSupervisorDecisionRecord,
	type TurnSupervisorObservation,
	buildTurnSupervisorEntityIndexFromContextData,
	createDeterministicTurnSupervisor
} from '@buildos/agentic-chat-runtime/supervisor';
import type { ChatContextType } from '@buildos/shared-types';
import type { AgenticChatWorkerExecutionInputV1 } from './executionInput';

export type AgenticChatWorkerSupervisorDecisionRecordV1 = TurnSupervisorDecisionRecord & {
	/** Stable across a replay that produces the same ordered decision sequence. */
	transitionId: string;
	executionGeneration: number;
	sequence: number;
};

export type AgenticChatWorkerSupervisorPortV1 = {
	start(at?: number): readonly AgenticChatWorkerSupervisorDecisionRecordV1[];
	observe(
		observation: TurnSupervisorObservation
	): readonly AgenticChatWorkerSupervisorDecisionRecordV1[];
	getDigest(): TurnDigest;
};

export type AgenticChatWorkerSupervisorFactoryV1 = (
	input: AgenticChatWorkerExecutionInputV1
) => AgenticChatWorkerSupervisorPortV1;

/**
 * Worker host adapter for the shared deterministic supervisor.
 *
 * Construction is side-effect free so provider preparation cannot start the
 * semantic clock before the execution-start fence. `start` is called by the
 * prepared invocation's first stream only after that fence.
 */
export class AgenticChatWorkerSupervisorBridge implements AgenticChatWorkerSupervisorPortV1 {
	private readonly supervisor: TurnSupervisor;
	private readonly turnRunId: string;
	private readonly executionGeneration: number;
	private started = false;
	private lastObservationAt: number | null = null;
	private decisionSequence = 0;

	constructor(
		input: AgenticChatWorkerExecutionInputV1,
		private readonly now: () => number = Date.now
	) {
		this.turnRunId = input.claim.turnRunId;
		this.executionGeneration = input.claim.executionGeneration;
		canonicalUuid(this.turnRunId, 'turnRunId');
		canonicalUuid(input.claim.sessionId, 'sessionId');
		canonicalUuid(input.claim.userId, 'userId');
		if (!Number.isSafeInteger(this.executionGeneration) || this.executionGeneration < 1) {
			throw new Error('Agentic Chat worker supervisor execution generation is invalid');
		}
		this.supervisor = createDeterministicTurnSupervisor({
			turnRunId: this.turnRunId,
			sessionId: input.claim.sessionId,
			userId: input.claim.userId,
			contextType: readContextType(input.requestPayload.context),
			entityId: readNullableText(input.requestPayload.context, 'entityId'),
			projectId: readNullableText(input.requestPayload.context, 'projectId'),
			userMessage: readRequiredText(input.requestPayload.message, 'worker user message'),
			entityIndex: buildTurnSupervisorEntityIndexFromContextData(
				input.artifact.prepared.contextPayload
			)
		});
	}

	start(at = this.now()): readonly AgenticChatWorkerSupervisorDecisionRecordV1[] {
		if (this.started) {
			throw new Error('Agentic Chat worker supervisor may start only once');
		}
		assertSemanticTimestamp(at);
		this.started = true;
		this.lastObservationAt = at;
		return this.record(this.supervisor.observe({ type: 'turn_started', at }), at);
	}

	observe(
		observation: TurnSupervisorObservation
	): readonly AgenticChatWorkerSupervisorDecisionRecordV1[] {
		if (!this.started) {
			throw new Error('Agentic Chat worker supervisor observation arrived before start');
		}
		const at = observation.at ?? this.now();
		assertSemanticTimestamp(at);
		if (this.lastObservationAt !== null && at < this.lastObservationAt) {
			throw new Error('Agentic Chat worker supervisor observations must be time-ordered');
		}
		this.lastObservationAt = at;
		return this.record(this.supervisor.observe({ ...observation, at }), at);
	}

	getDigest(): TurnDigest {
		if (!this.started) {
			throw new Error('Agentic Chat worker supervisor digest requested before start');
		}
		return this.supervisor.getDigest(this.lastObservationAt ?? this.now());
	}

	private record(
		decisions: readonly TurnSupervisorDecision[],
		at: number
	): readonly AgenticChatWorkerSupervisorDecisionRecordV1[] {
		const actionable = decisions.filter((decision) => decision.action !== 'continue');
		return actionable.map((decision) => {
			this.decisionSequence += 1;
			return {
				decision,
				digest: this.supervisor.getDigest(at),
				at: new Date(at).toISOString(),
				source: 'monitor',
				executionGeneration: this.executionGeneration,
				sequence: this.decisionSequence,
				transitionId: createStableAgenticChatSupervisorTransitionIdV1({
					turnRunId: this.turnRunId,
					executionGeneration: this.executionGeneration,
					sequence: this.decisionSequence,
					action: decision.action
				})
			};
		});
	}
}

export function createStableAgenticChatSupervisorTransitionIdV1(input: {
	turnRunId: string;
	executionGeneration: number;
	sequence: number;
	action: Exclude<TurnSupervisorDecision['action'], 'continue'>;
}): string {
	canonicalUuid(input.turnRunId, 'turnRunId');
	if (!Number.isSafeInteger(input.executionGeneration) || input.executionGeneration < 1) {
		throw new Error('Agentic Chat supervisor execution generation must be positive');
	}
	if (!Number.isSafeInteger(input.sequence) || input.sequence < 1) {
		throw new Error('Agentic Chat supervisor sequence must be a positive safe integer');
	}
	if (!SUPERVISOR_ACTIONS.has(input.action)) {
		throw new Error('Agentic Chat supervisor action is invalid');
	}
	const bytes = createHash('sha256')
		.update(
			`agentic-chat-supervisor-transition-v1:${input.turnRunId}:${input.executionGeneration}:${input.sequence}:${input.action}`,
			'utf8'
		)
		.digest()
		.subarray(0, 16);
	bytes[6] = (bytes[6]! & 0x0f) | 0x50;
	bytes[8] = (bytes[8]! & 0x3f) | 0x80;
	const hex = bytes.toString('hex');
	return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

const SUPERVISOR_ACTIONS = new Set<Exclude<TurnSupervisorDecision['action'], 'continue'>>([
	'emit_status',
	'force_synthesis',
	'inject_recovery_instruction',
	'ask_user',
	'stop_with_message',
	'flag_eval'
]);

const CHAT_CONTEXT_TYPES = new Set<ChatContextType>([
	'global',
	'project',
	'calendar',
	'daily_brief',
	'general',
	'project_create',
	'daily_brief_update',
	'ontology'
]);

function readContextType(value: unknown): ChatContextType {
	const context = readRecord(value, 'worker request context');
	const type = context.type;
	if (typeof type !== 'string' || !CHAT_CONTEXT_TYPES.has(type as ChatContextType)) {
		throw new Error('Agentic Chat worker supervisor context type is invalid');
	}
	return type as ChatContextType;
}

function readNullableText(value: unknown, key: string): string | null {
	const record = readRecord(value, 'worker request context');
	const candidate = record[key];
	if (candidate === null || candidate === undefined) return null;
	return readRequiredText(candidate, `worker context ${key}`);
}

function readRequiredText(value: unknown, label: string): string {
	if (
		typeof value !== 'string' ||
		value.length === 0 ||
		value !== value.trim() ||
		value.length > 64_000
	) {
		throw new Error(`${label} is invalid`);
	}
	return value;
}

function readRecord(value: unknown, label: string): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`${label} is invalid`);
	}
	return value as Record<string, unknown>;
}

function canonicalUuid(value: string, label: string): void {
	if (!UUID_PATTERN.test(value) || value !== value.toLowerCase()) {
		throw new Error(`${label} must be a canonical UUID`);
	}
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function assertSemanticTimestamp(value: number): void {
	if (!Number.isSafeInteger(value) || value < 0 || value > 8_640_000_000_000_000) {
		throw new Error('Agentic Chat worker supervisor timestamp is invalid');
	}
}
