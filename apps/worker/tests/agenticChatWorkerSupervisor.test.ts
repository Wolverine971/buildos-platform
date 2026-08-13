// apps/worker/tests/agenticChatWorkerSupervisor.test.ts
import { provideAgenticChatLoopToolCatalog } from '@buildos/agentic-chat-runtime/loop';
import { describe, expect, it } from 'vitest';
import type { AgenticChatWorkerExecutionInputV1 } from '../src/workers/agentic-chat/executionInput';
import {
	AgenticChatWorkerSupervisorBridge,
	createStableAgenticChatSupervisorTransitionIdV1
} from '../src/workers/agentic-chat/workerSupervisor';

const TURN_RUN_ID = '3000000a-0000-4000-8000-000000000003';
const TASK_ID = '70000000-0000-4000-8000-000000000007';

provideAgenticChatLoopToolCatalog(() => ({
	ops: {},
	byToolName: {
		get_project_overview: {
			op: 'get_project_overview',
			tool_name: 'get_project_overview',
			kind: 'read'
		},
		update_onto_task: {
			op: 'update_onto_task',
			tool_name: 'update_onto_task',
			kind: 'write'
		}
	}
}));

describe('AgenticChatWorkerSupervisorBridge', () => {
	it('starts only at the explicit execution boundary and rejects pre-start observations', () => {
		const bridge = new AgenticChatWorkerSupervisorBridge(executionInput(), () =>
			Date.parse('2026-08-13T10:00:00.000Z')
		);

		expect(() => bridge.getDigest()).toThrow('before start');
		expect(() => bridge.observe({ type: 'assistant_text_delta', chars: 1 })).toThrow(
			'before start'
		);
		expect(bridge.start()).toEqual([]);
		expect(() => bridge.start()).toThrow('only once');
		expect(bridge.getDigest()).toMatchObject({
			turnRunId: TURN_RUN_ID,
			contextType: 'project',
			userMessage: 'Update the task.'
		});
	});

	it('returns stable ordered records for a synthesis intervention', () => {
		const startAt = Date.parse('2026-08-13T10:00:00.000Z');
		const first = runReadRounds(startAt);
		const replay = runReadRounds(startAt);

		expect(first).toHaveLength(1);
		expect(first[0]).toMatchObject({
			executionGeneration: 1,
			sequence: 1,
			at: '2026-08-13T10:00:01.620Z',
			source: 'monitor',
			decision: { action: 'force_synthesis', reason: 'low_novelty_reads' }
		});
		expect(first[0]?.transitionId).toBe(replay[0]?.transitionId);
		expect(first[0]?.digest).toMatchObject({
			toolRoundCount: 8,
			toolCallCount: 8,
			progress: { readRounds: 8, lowNoveltyReadRounds: 7 }
		});
	});

	it('uses the frozen context entity index for wrong-kind recovery', () => {
		const startAt = Date.parse('2026-08-13T10:00:00.000Z');
		const bridge = new AgenticChatWorkerSupervisorBridge(
			executionInput({
				artifact: {
					...executionInput().artifact,
					prepared: {
						...executionInput().artifact.prepared,
						contextPayload: {
							goals: [{ id: TASK_ID, name: 'Actually a goal' }]
						}
					}
				}
			}),
			() => startAt
		);
		bridge.start(startAt);
		bridge.observe({
			type: 'tool_call_emitted',
			toolName: 'update_onto_task',
			toolCallId: 'write-1',
			argsPreview: { task_id: TASK_ID, state_key: 'done' },
			at: startAt + 10
		});

		const records = bridge.observe({
			type: 'tool_result_received',
			toolName: 'update_onto_task',
			toolCallId: 'write-1',
			success: false,
			error: 'Task not found',
			resultSummary: 'Task not found',
			at: startAt + 20
		});

		expect(records).toHaveLength(1);
		expect(records[0]?.decision).toMatchObject({
			action: 'inject_recovery_instruction',
			reason: 'wrong_entity_kind_failed_write'
		});
		if (records[0]?.decision.action === 'inject_recovery_instruction') {
			expect(records[0].decision.instruction).toContain('identifies that UUID as a goal');
		}
	});

	it('records recovery before blocking an exact failed-write retry', () => {
		const startAt = Date.parse('2026-08-13T10:00:00.000Z');
		const bridge = new AgenticChatWorkerSupervisorBridge(executionInput(), () => startAt);
		const args = { task_id: TASK_ID, state_key: 'done' };
		bridge.start(startAt);
		bridge.observe({
			type: 'tool_call_emitted',
			toolName: 'update_onto_task',
			toolCallId: 'write-1',
			argsPreview: args,
			at: startAt + 10
		});

		const recovery = bridge.observe({
			type: 'tool_result_received',
			toolName: 'update_onto_task',
			toolCallId: 'write-1',
			success: false,
			error: 'Task not found',
			resultSummary: 'Task not found',
			at: startAt + 20
		});
		const blocked = bridge.observe({
			type: 'tool_call_emitted',
			toolName: 'update_onto_task',
			toolCallId: 'write-2',
			argsPreview: args,
			at: startAt + 30
		});

		expect(recovery[0]).toMatchObject({
			sequence: 1,
			decision: { action: 'inject_recovery_instruction', reason: 'not_found_failed_write' }
		});
		expect(blocked[0]).toMatchObject({
			sequence: 2,
			decision: {
				action: 'inject_recovery_instruction',
				reason: 'blocked_repeated_failed_write',
				toolCallId: 'write-2',
				blockToolCall: true
			}
		});
		expect(blocked[0]?.transitionId).not.toBe(recovery[0]?.transitionId);
	});

	it('rejects malformed immutable worker context instead of silently downgrading it', () => {
		expect(
			() =>
				new AgenticChatWorkerSupervisorBridge(
					executionInput({
						requestPayload: {
							...executionInput().requestPayload,
							context: { type: 'unsupported' }
						}
					})
				)
		).toThrow('context type is invalid');
		expect(
			() =>
				new AgenticChatWorkerSupervisorBridge(
					executionInput({
						claim: { ...executionInput().claim, turnRunId: 'not-a-turn-id' }
					})
				)
		).toThrow('turnRunId must be a canonical UUID');
	});

	it('rejects invalid or time-regressing observation clocks', () => {
		const startAt = Date.parse('2026-08-13T10:00:00.000Z');
		const bridge = new AgenticChatWorkerSupervisorBridge(executionInput(), () => startAt);

		expect(() => bridge.start(Number.NaN)).toThrow('timestamp is invalid');
		expect(bridge.start(startAt)).toEqual([]);
		expect(() =>
			bridge.observe({ type: 'assistant_text_delta', chars: 1, at: startAt - 1 })
		).toThrow('must be time-ordered');
	});
});

describe('createStableAgenticChatSupervisorTransitionIdV1', () => {
	it('is deterministic and separates sequence/action identity', () => {
		const first = createStableAgenticChatSupervisorTransitionIdV1({
			turnRunId: TURN_RUN_ID,
			executionGeneration: 1,
			sequence: 1,
			action: 'force_synthesis'
		});
		expect(first).toMatch(/^[0-9a-f-]{36}$/);
		expect(
			createStableAgenticChatSupervisorTransitionIdV1({
				turnRunId: TURN_RUN_ID,
				executionGeneration: 1,
				sequence: 1,
				action: 'force_synthesis'
			})
		).toBe(first);
		expect(
			createStableAgenticChatSupervisorTransitionIdV1({
				turnRunId: TURN_RUN_ID,
				executionGeneration: 1,
				sequence: 2,
				action: 'force_synthesis'
			})
		).not.toBe(first);
		expect(
			createStableAgenticChatSupervisorTransitionIdV1({
				turnRunId: TURN_RUN_ID,
				executionGeneration: 2,
				sequence: 1,
				action: 'force_synthesis'
			})
		).not.toBe(first);
		expect(() =>
			createStableAgenticChatSupervisorTransitionIdV1({
				turnRunId: TURN_RUN_ID.toUpperCase(),
				executionGeneration: 1,
				sequence: 1,
				action: 'force_synthesis'
			})
		).toThrow('canonical UUID');
	});
});

function runReadRounds(startAt: number) {
	const bridge = new AgenticChatWorkerSupervisorBridge(executionInput(), () => startAt);
	bridge.start(startAt);
	let records = [] as ReturnType<typeof bridge.observe>;
	for (let round = 1; round <= 8; round += 1) {
		const callId = `read-${round}`;
		bridge.observe({
			type: 'tool_call_emitted',
			toolName: 'get_project_overview',
			toolCallId: callId,
			argsPreview: {},
			at: startAt + round * 200
		});
		bridge.observe({
			type: 'tool_result_received',
			toolName: 'get_project_overview',
			toolCallId: callId,
			success: true,
			resultSummary: '[]',
			at: startAt + round * 200 + 10
		});
		records = bridge.observe({
			type: 'tool_round_completed',
			round,
			toolCallsMade: round,
			at: startAt + round * 200 + 20
		});
	}
	return records;
}

function executionInput(
	overrides: Partial<AgenticChatWorkerExecutionInputV1> = {}
): AgenticChatWorkerExecutionInputV1 {
	return {
		claim: {
			outcome: 'claimed',
			executionMayStart: true,
			turnRunId: TURN_RUN_ID,
			queueJobId: '40000000-0000-4000-8000-000000000004',
			sessionId: '20000000-0000-4000-8000-000000000002',
			userId: '10000000-0000-4000-8000-000000000001',
			correlationId: '50000000-0000-4000-8000-000000000005',
			executionGeneration: 1,
			status: 'running',
			inputArtifactId: '60000000-0000-4000-8000-000000000006',
			userMessageId: '80000000-0000-4000-8000-000000000008'
		},
		streamRunId: 'stream-1',
		clientTurnId: 'client-1',
		requestPayload: {
			message: 'Update the task.',
			attachments: [],
			context: { type: 'project', entityId: null, projectId: null }
		},
		artifact: {
			artifactVersion: 'agentic_chat_input_v2',
			historySource: 'admission_window',
			history: [],
			prepared: {
				sourcePreparedPromptId: null,
				contextPayload: {},
				conversationSummary: null,
				surfaceProfile: 'project_default',
				systemPrompt: 'System prompt',
				promptSections: [],
				toolSurface: {}
			},
			createdAt: '2026-08-13T09:00:00.000Z',
			retainUntil: '2026-08-14T09:00:00.000Z',
			contentHash: '0'.repeat(64)
		},
		timingBaseline: {
			admittedAt: '2026-08-13T09:59:57.000Z',
			startedAt: '2026-08-13T09:59:58.000Z',
			workerStartedAt: '2026-08-13T09:59:59.000Z',
			executionStartedAt: null,
			historyCutoffAt: '2026-08-13T09:59:58.000Z',
			requestPrewarmedContext: false,
			cacheSource: 'not_requested',
			cacheAgeSeconds: null,
			historyStrategy: null,
			historyCompressed: null,
			rawHistoryCount: null,
			historyForModelCount: null,
			preparedPromptId: null,
			preparedPromptHit: false,
			preparedPromptMissReason: null,
			preparedSurfaceProfile: null
		},
		...overrides
	};
}
