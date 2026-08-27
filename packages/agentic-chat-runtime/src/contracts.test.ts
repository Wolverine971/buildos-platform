// packages/agentic-chat-runtime/src/contracts.test.ts
import { describe, expect, expectTypeOf, it, vi } from 'vitest';
import type { AgentSSEMessage, AgentStreamEventV1 } from '@buildos/shared-types';
import {
	AGENTIC_CHAT_RUNTIME_CONTRACT_VERSION,
	isAdmittedTurnHandle,
	type AdmittedTurnHandleV1,
	type AgenticChatRuntimeEvent,
	type AgenticChatRuntimePorts,
	type AgenticChatStreamEvent,
	type AgenticChatTurnCommand,
	type AgenticChatTurnOutcome,
	type RunAgenticChatTurn
} from './index';

type UnrepresentableRuntimeEvent = AgentSSEMessage extends infer TEvent
	? TEvent extends { type: string }
		? AgentStreamEventV1<TEvent> extends AgenticChatStreamEvent
			? never
			: TEvent
		: TEvent
	: never;

type RetiredAgentSSEMessageType =
	| 'ontology_loaded'
	| 'focus_active'
	| 'focus_changed'
	| 'clarifying_questions'
	| 'operation'
	| 'draft_update'
	| 'dimension_update'
	| 'phase_update'
	| 'queue_update';

type RetiredAgentSSEMessageTypeStillPresent = Extract<
	AgentSSEMessage['type'],
	RetiredAgentSSEMessageType
>;

const legacyHandle: AdmittedTurnHandleV1 = {
	contractVersion: 'legacy_internal_v1',
	executionMode: 'legacy_sse',
	streamRunId: 'stream-1',
	clientTurnId: 'client-1',
	sessionId: 'session-1',
	turnRunId: 'turn-1'
};

const command: AgenticChatTurnCommand = {
	runtimeContractVersion: AGENTIC_CHAT_RUNTIME_CONTRACT_VERSION,
	handle: legacyHandle,
	userId: 'user-1',
	userMessageId: 'message-1',
	userMessage: 'Hello',
	context: { type: 'global', entityId: null, projectId: null },
	attachments: [],
	input: null
};

function createPorts(): AgenticChatRuntimePorts {
	const abortController = new AbortController();
	return {
		loaders: {
			context: { load: vi.fn(async () => ({})) },
			history: { load: vi.fn(async () => []) },
			preparedPrompt: { load: vi.fn(async () => null) }
		},
		prompt: { build: vi.fn(async () => ({})) },
		llm: { stream: vi.fn(async () => ({})) },
		tools: {
			catalog: { list: vi.fn(async () => []) },
			execution: { execute: vi.fn(async () => ({})) }
		},
		events: { emit: vi.fn(async () => undefined) },
		persistence: {
			turns: { write: vi.fn(async () => ({})) },
			messages: { write: vi.fn(async () => ({})) },
			toolExecutions: { write: vi.fn(async () => ({})) }
		},
		supervisor: {
			decisions: { evaluate: vi.fn(async () => ({})) },
			checkpoints: { write: vi.fn(async () => ({})) }
		},
		postProcessing: { run: vi.fn(async () => ({})) },
		telemetry: { record: vi.fn(async () => undefined) },
		costs: { record: vi.fn(async () => undefined) },
		cancellation: {
			signal: abortController.signal,
			getReason: () => null
		},
		clock: {
			now: () => new Date('2026-07-31T00:00:00.000Z'),
			monotonicNowMs: () => 100
		},
		debugArtifacts: { write: vi.fn(async () => undefined) }
	};
}

describe('agentic chat runtime contracts', () => {
	it('requires an admitted handle before runtime execution', () => {
		expect(isAdmittedTurnHandle(legacyHandle)).toBe(true);
		expect(
			isAdmittedTurnHandle({
				contractVersion: 'agentic_chat_worker_v1',
				executionMode: 'worker_realtime',
				streamRunId: 'stream-2',
				clientTurnId: 'client-2',
				sessionId: 'session-2',
				turnRunId: 'turn-2'
			})
		).toBe(true);
		expect(
			isAdmittedTurnHandle({
				...legacyHandle,
				sessionId: null,
				turnRunId: null
			})
		).toBe(false);
	});

	it('defines the top-level runtime call without binding a transport', async () => {
		const outcome: AgenticChatTurnOutcome = {
			status: 'completed',
			finishedReason: 'stop',
			assistantText: 'Hello back',
			assistantMessageId: 'assistant-1',
			metadata: {}
		};
		const run: RunAgenticChatTurn = vi.fn(async () => outcome);

		expectTypeOf(run).toMatchTypeOf<RunAgenticChatTurn>();
		expectTypeOf<Parameters<AgenticChatRuntimePorts['events']['emit']>>().toEqualTypeOf<
			[AgenticChatRuntimeEvent]
		>();
		await expect(run(command, createPorts())).resolves.toEqual(outcome);
	});

	it('represents every public SSE payload variant in the runtime stream event', () => {
		expectTypeOf<AgenticChatRuntimeEvent>().toEqualTypeOf<AgentSSEMessage>();
		expectTypeOf<UnrepresentableRuntimeEvent>().toEqualTypeOf<never>();
	});

	it('keeps retired, unhandled payloads out of the public SSE contract', () => {
		expectTypeOf<RetiredAgentSSEMessageTypeStillPresent>().toEqualTypeOf<never>();
	});
});
