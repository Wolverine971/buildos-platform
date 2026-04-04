// apps/web/src/lib/services/agentic-chat-v2/prompt-evaluator.test.ts
import { describe, expect, it } from 'vitest';
import { getPromptEvalScenario } from './prompt-eval-scenarios';
import { evaluatePromptScenario } from './prompt-evaluator';

describe('evaluatePromptScenario', () => {
	it('passes a named-project overview turn that used the correct lane and op', () => {
		const scenario = getPromptEvalScenario('project.named_status');
		expect(scenario).not.toBeNull();

		const result = evaluatePromptScenario(scenario!, {
			turnRun: {
				id: 'run-1',
				status: 'completed',
				first_lane: 'overview',
				first_canonical_op: 'util.project.overview',
				first_skill_path: null,
				validation_failure_count: 0,
				prompt_snapshot: { id: 'snapshot-1' }
			},
			assistantMessage: {
				id: 'assistant-1',
				content: 'I checked 9takes and summarized the active tasks and recent changes.'
			},
			events: [
				{ event_type: 'prompt_snapshot_created', payload: {} },
				{
					event_type: 'tool_result_received',
					payload: { canonical_op: 'util.project.overview' }
				},
				{ event_type: 'done_emitted', payload: {} }
			],
			toolExecutions: [{ gateway_op: 'util.project.overview', success: true }]
		});

		expect(result.status).toBe('passed');
		expect(result.summary).toMatchObject({
			first_lane: 'overview',
			first_canonical_op: 'util.project.overview'
		});
		expect(result.assertions.every((assertion) => assertion.status === 'passed')).toBe(true);
	});

	it('fails when an audit turn never loaded the audit skill and leaked scratchpad text', () => {
		const scenario = getPromptEvalScenario('workflow.audit.project_health');
		expect(scenario).not.toBeNull();

		const result = evaluatePromptScenario(scenario!, {
			turnRun: {
				id: 'run-2',
				status: 'completed',
				first_lane: 'overview',
				first_canonical_op: 'util.project.overview',
				first_skill_path: null,
				validation_failure_count: 2,
				prompt_snapshot: { id: 'snapshot-2' }
			},
			assistantMessage: {
				id: 'assistant-2',
				content: 'No, wait, args need query.'
			},
			events: [
				{ event_type: 'prompt_snapshot_created', payload: {} },
				{
					event_type: 'tool_result_received',
					payload: { canonical_op: 'util.project.overview' }
				},
				{ event_type: 'done_emitted', payload: {} }
			],
			toolExecutions: [{ gateway_op: 'util.project.overview', success: true }]
		});

		expect(result.status).toBe('failed');
		expect(
			result.assertions.find(
				(assertion) => assertion.assertionKey === 'assistant_answer_clean'
			)?.status
		).toBe('failed');
		expect(
			result.assertions.find(
				(assertion) => assertion.assertionKey === 'observed_skill:workflow.audit.skill'
			)?.status
		).toBe('failed');
		expect(
			result.assertions.find(
				(assertion) => assertion.assertionKey === 'validation_failures_within_limit'
			)?.status
		).toBe('failed');
	});
});
