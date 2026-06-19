// apps/web/src/lib/services/agentic-chat-v2/turn-supervisor/deterministic-supervisor.test.ts
import { describe, expect, it, vi } from 'vitest';
import { createDeterministicTurnSupervisor } from './deterministic-supervisor';
import type { TurnSupervisorCreateParams, TurnSupervisorDecision } from './types';

function createSupervisor(overrides: Partial<TurnSupervisorCreateParams> = {}) {
	return createDeterministicTurnSupervisor({
		turnRunId: 'turn_1',
		sessionId: 'session_1',
		userId: 'user_1',
		contextType: 'project',
		entityId: 'project_1',
		projectId: 'project_1',
		userMessage: 'Find the relevant task and update it.',
		config: {
			statusSilenceMs: 10_000,
			repeatedStatusIntervalMs: 15_000,
			forceSynthesisAfterToolCalls: 6,
			forceSynthesisAfterReadRounds: 3,
			maxToolRounds: 8
		},
		...overrides
	});
}

describe('createDeterministicTurnSupervisor', () => {
	it('emits a status decision after long-running tool work', () => {
		vi.useFakeTimers();
		try {
			const startedAt = Date.now();
			const supervisor = createSupervisor();
			supervisor.observe({ type: 'turn_started', at: startedAt });
			supervisor.observe({
				type: 'tool_call_emitted',
				toolName: 'search_project',
				toolCallId: 'tool_1',
				argsPreview: { query: 'launch task' },
				at: startedAt + 100
			});

			const decisions = supervisor.observe({
				type: 'long_running_operation',
				operation: 'tool_execution',
				toolName: 'search_project',
				toolCallId: 'tool_1',
				elapsedMs: 12_000,
				at: startedAt + 12_100
			});

			expect(decisions).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						action: 'emit_status',
						reason: 'long_running_operation'
					})
				])
			);
		} finally {
			vi.useRealTimers();
		}
	});

	it('forces synthesis after repeated read rounds', () => {
		const startedAt = Date.now();
		const supervisor = createSupervisor();
		supervisor.observe({ type: 'turn_started', at: startedAt });

		let decisions: TurnSupervisorDecision[] = [];
		for (let round = 1; round <= 3; round += 1) {
			supervisor.observe({
				type: 'tool_call_emitted',
				toolName: 'search_project',
				toolCallId: `tool_${round}`,
				argsPreview: { query: 'launch task' },
				at: startedAt + round * 100
			});
			supervisor.observe({
				type: 'tool_result_received',
				toolName: 'search_project',
				toolCallId: `tool_${round}`,
				success: true,
				resultSummary: '[]',
				at: startedAt + round * 100 + 10
			});
			decisions = supervisor.observe({
				type: 'tool_round_completed',
				round,
				toolCallsMade: round,
				at: startedAt + round * 100 + 20
			});
		}

		expect(decisions).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					action: 'force_synthesis'
				})
			])
		);
		expect(supervisor.getDigest().risks).toContain('low_novelty_reads');
	});

	it('asks the user after repeated validation failures on a write', () => {
		const startedAt = Date.now();
		const supervisor = createSupervisor();
		supervisor.observe({ type: 'turn_started', at: startedAt });

		let decisions: TurnSupervisorDecision[] = [];
		for (let round = 1; round <= 2; round += 1) {
			const toolCallId = `update_${round}`;
			supervisor.observe({
				type: 'tool_call_emitted',
				toolName: 'update_onto_task',
				toolCallId,
				argsPreview: { state_key: 'done' },
				at: startedAt + round * 100
			});
			supervisor.observe({
				type: 'tool_result_received',
				toolName: 'update_onto_task',
				toolCallId,
				success: false,
				error: 'Tool validation failed: Missing required parameter: task_id',
				resultSummary: 'Tool validation failed: Missing required parameter: task_id',
				at: startedAt + round * 100 + 10
			});
			decisions = supervisor.observe({
				type: 'tool_round_completed',
				round,
				toolCallsMade: round,
				at: startedAt + round * 100 + 20
			});
		}

		const askDecision = decisions.find((decision) => decision.action === 'ask_user');
		expect(askDecision).toMatchObject({
			action: 'ask_user',
			reason: 'repeated_validation_failures',
			question:
				'Which exact task should I use? Send the name or ID, and I will continue from here.'
		});
		if (askDecision?.action === 'ask_user') {
			expect(askDecision.checkpoint.resumeContext).toMatchObject({
				missing_field: 'task_id',
				last_failed_tool: 'update_onto_task'
			});
		}
	});

	it('injects a wrong-entity-kind recovery instruction after a not_found write', () => {
		const startedAt = Date.now();
		const goalId = 'ccbbc592-7138-46a5-9aa9-7d4549e1fa50';
		const supervisor = createSupervisor({
			entityIndex: [
				{
					id: goalId,
					kind: 'goal',
					label: 'Complete The Last Ember Novel Development'
				}
			]
		});
		supervisor.observe({ type: 'turn_started', at: startedAt });
		supervisor.observe({
			type: 'tool_call_emitted',
			toolName: 'update_onto_task',
			toolCallId: 'update_task:goal-id',
			argsPreview: {
				task_id: goalId,
				title: 'Complete The Last Ember First Draft',
				state_key: 'in_progress'
			},
			at: startedAt + 100
		});

		const decisions = supervisor.observe({
			type: 'tool_result_received',
			toolName: 'update_onto_task',
			toolCallId: 'update_task:goal-id',
			success: false,
			error: 'Tool failed: Task not found',
			resultSummary: 'Tool failed: Task not found',
			at: startedAt + 120
		});

		const recoveryDecision = decisions.find(
			(decision) => decision.action === 'inject_recovery_instruction'
		);
		expect(recoveryDecision).toMatchObject({
			action: 'inject_recovery_instruction',
			reason: 'wrong_entity_kind_failed_write',
			toolCallId: 'update_task:goal-id'
		});
		if (recoveryDecision?.action === 'inject_recovery_instruction') {
			expect(recoveryDecision.instruction).toContain('task_id=' + goalId);
			expect(recoveryDecision.instruction).toContain('identifies that UUID as a goal');
			expect(recoveryDecision.instruction).toContain('needs a task id');
			expect(recoveryDecision.instruction).toContain('Do not retry the same call.');
		}
	});

	it('blocks an exact retry of a previously failed write payload', () => {
		const startedAt = Date.now();
		const taskId = '881823a4-e74e-48d2-bf3e-b77db7e47b5f';
		const args = { task_id: taskId, state_key: 'done' };
		const supervisor = createSupervisor();
		supervisor.observe({ type: 'turn_started', at: startedAt });
		supervisor.observe({
			type: 'tool_call_emitted',
			toolName: 'update_onto_task',
			toolCallId: 'update_task:first',
			argsPreview: args,
			at: startedAt + 100
		});
		supervisor.observe({
			type: 'tool_result_received',
			toolName: 'update_onto_task',
			toolCallId: 'update_task:first',
			success: false,
			error: 'Task not found',
			resultSummary: 'Task not found',
			at: startedAt + 120
		});

		const decisions = supervisor.observe({
			type: 'tool_call_emitted',
			toolName: 'update_onto_task',
			toolCallId: 'update_task:retry',
			argsPreview: args,
			at: startedAt + 200
		});

		expect(decisions).toEqual([
			expect.objectContaining({
				action: 'inject_recovery_instruction',
				reason: 'blocked_repeated_failed_write',
				toolCallId: 'update_task:retry',
				blockToolCall: true
			})
		]);
	});

	it('allows a changed retry payload after a failed write', () => {
		const startedAt = Date.now();
		const failedTaskId = '881823a4-e74e-48d2-bf3e-b77db7e47b5f';
		const correctedTaskId = 'c7441a46-a892-429d-ac1d-8814db45c650';
		const supervisor = createSupervisor();
		supervisor.observe({ type: 'turn_started', at: startedAt });
		supervisor.observe({
			type: 'tool_call_emitted',
			toolName: 'update_onto_task',
			toolCallId: 'update_task:first',
			argsPreview: { task_id: failedTaskId, state_key: 'done' },
			at: startedAt + 100
		});
		supervisor.observe({
			type: 'tool_result_received',
			toolName: 'update_onto_task',
			toolCallId: 'update_task:first',
			success: false,
			error: 'Task not found',
			resultSummary: 'Task not found',
			at: startedAt + 120
		});

		const decisions = supervisor.observe({
			type: 'tool_call_emitted',
			toolName: 'update_onto_task',
			toolCallId: 'update_task:corrected',
			argsPreview: { task_id: correctedTaskId, state_key: 'done' },
			at: startedAt + 200
		});

		expect(decisions).toEqual([expect.objectContaining({ action: 'continue' })]);
	});
});
