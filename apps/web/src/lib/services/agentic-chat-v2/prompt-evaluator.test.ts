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

	it('passes an outcome-card scenario when the outcome card loader is observed', () => {
		const scenario = getPromptEvalScenario('workflow.outcome_card.cold_email_campaign_build');
		expect(scenario).not.toBeNull();

		const result = evaluatePromptScenario(scenario!, {
			turnRun: {
				id: 'run-outcome-card',
				status: 'completed',
				first_lane: 'skill_first',
				first_canonical_op: null,
				first_skill_path: null,
				validation_failure_count: 0,
				prompt_snapshot: { id: 'snapshot-outcome-card' }
			},
			assistantMessage: {
				id: 'assistant-outcome-card',
				content: 'I drafted the campaign structure and next steps.'
			},
			events: [
				{ event_type: 'prompt_snapshot_created', payload: {} },
				{ event_type: 'done_emitted', payload: {} }
			],
			toolExecutions: [{ tool_name: 'outcome_card_load', success: true }]
		});

		expect(result.status).toBe('passed');
		expect(
			result.assertions.find(
				(assertion) => assertion.assertionKey === 'observed_tool:outcome_card_load'
			)?.status
		).toBe('passed');
	});

	it('fails the project-audit scenario when the outcome card loader is used', () => {
		const scenario = getPromptEvalScenario('workflow.audit.project_health');
		expect(scenario).not.toBeNull();

		const result = evaluatePromptScenario(scenario!, {
			turnRun: {
				id: 'run-audit-outcome-card',
				status: 'completed',
				first_lane: 'overview',
				first_canonical_op: 'util.project.overview',
				first_skill_path: 'workflow.audit.skill',
				validation_failure_count: 0,
				prompt_snapshot: { id: 'snapshot-audit-outcome-card' }
			},
			assistantMessage: {
				id: 'assistant-audit-outcome-card',
				content: 'I audited the project health.'
			},
			events: [
				{ event_type: 'skill_loaded', payload: { path: 'workflow.audit.skill' } },
				{ event_type: 'done_emitted', payload: {} }
			],
			toolExecutions: [
				{ tool_name: 'outcome_card_load', success: true },
				{ gateway_op: 'util.project.overview', success: true }
			]
		});

		expect(result.status).toBe('failed');
		expect(
			result.assertions.find(
				(assertion) => assertion.assertionKey === 'forbidden_tool:outcome_card_load'
			)?.status
		).toBe('failed');
	});

	it('passes a supervisor question turn with checkpoint events', () => {
		const scenario = getPromptEvalScenario('safety.supervisor_question_repeated_validation');
		expect(scenario).not.toBeNull();

		const result = evaluatePromptScenario(scenario!, {
			turnRun: {
				id: 'run-supervisor-question',
				status: 'completed',
				finished_reason: 'supervisor_question',
				first_lane: 'direct_exact_op',
				first_canonical_op: 'onto.task.update',
				first_skill_path: null,
				validation_failure_count: 2,
				prompt_snapshot: { id: 'snapshot-supervisor-question' }
			},
			assistantMessage: {
				id: 'assistant-supervisor-question',
				content:
					'Which exact task should I use? Send the name or ID, and I will continue from here.'
			},
			events: [
				{ event_type: 'supervisor_decision', payload: { action: 'ask_user' } },
				{ event_type: 'supervisor_question_checkpoint_created', payload: {} },
				{ event_type: 'done_emitted', payload: {} }
			],
			toolExecutions: [{ gateway_op: 'onto.task.update', success: false }]
		});

		expect(result.status).toBe('passed');
		expect(result.summary).toMatchObject({
			finished_reason: 'supervisor_question',
			validation_failure_count: 2
		});
		expect(
			result.assertions.find(
				(assertion) => assertion.assertionKey === 'finished_reason_matches'
			)?.status
		).toBe('passed');
	});

	it('fails the supervisor question scenario when the turn finishes normally', () => {
		const scenario = getPromptEvalScenario('safety.supervisor_question_repeated_validation');
		expect(scenario).not.toBeNull();

		const result = evaluatePromptScenario(scenario!, {
			turnRun: {
				id: 'run-normal',
				status: 'completed',
				finished_reason: 'stop',
				first_lane: 'direct_exact_op',
				first_canonical_op: 'onto.task.update',
				first_skill_path: null,
				validation_failure_count: 2,
				prompt_snapshot: { id: 'snapshot-normal' }
			},
			assistantMessage: {
				id: 'assistant-normal',
				content: 'I could not update the task.'
			},
			events: [{ event_type: 'done_emitted', payload: {} }],
			toolExecutions: [{ gateway_op: 'onto.task.update', success: false }]
		});

		expect(result.status).toBe('failed');
		expect(
			result.assertions.find(
				(assertion) => assertion.assertionKey === 'finished_reason_matches'
			)?.status
		).toBe('failed');
		expect(
			result.assertions.find(
				(assertion) => assertion.assertionKey === 'event_type:supervisor_decision'
			)?.status
		).toBe('failed');
	});
});
