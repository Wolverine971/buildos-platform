// apps/worker/tests/questionTreeScheduler.test.ts
import { describe, expect, it } from 'vitest';
import type {
	QuestionTreeNode,
	QuestionTreeProposal
} from '../src/workers/question-tree/questionTreeContracts';
import { scoreQuestionTreeFrontier } from '../src/workers/question-tree/questionTreeScheduler';

function node(overrides: Partial<QuestionTreeNode>): QuestionTreeNode {
	return {
		id: 'node-root',
		run_id: 'run-1',
		parent_node_id: null,
		node_kind: 'root',
		node_number: 0,
		depth: 0,
		sibling_index: null,
		status: 'completed',
		question: 'Original question',
		normalized_question: 'original question',
		answer: null,
		thesis: null,
		epistemic_assessment: null,
		confidence: null,
		stop_reason: null,
		model_requested: null,
		model_used: null,
		provider_request_id: null,
		attempt_count: 0,
		prompt_tokens: 0,
		completion_tokens: 0,
		reasoning_tokens: 0,
		cost_usd: 0,
		latency_ms: 0,
		lease_owner: null,
		lease_expires_at: null,
		error_code: null,
		error_message: null,
		started_at: null,
		completed_at: null,
		created_at: '2026-08-01T00:00:00.000Z',
		updated_at: '2026-08-01T00:00:00.000Z',
		...overrides
	};
}

function proposal(overrides: Partial<QuestionTreeProposal>): QuestionTreeProposal {
	return {
		id: 'proposal-1',
		run_id: 'run-1',
		source_node_id: 'node-root',
		rank: 0,
		question: 'What evidence would overturn the thesis?',
		normalized_question: 'what evidence would overturn the thesis',
		purpose: 'falsify',
		target_claim: 'The central thesis',
		why_it_matters: 'It could disprove the answer.',
		expected_information_gain: 'high',
		model_priority: 0.9,
		scheduler_score: null,
		status: 'proposed',
		child_node_id: null,
		duplicate_of_node_id: null,
		validation_error: null,
		created_at: '2026-08-01T00:00:00.000Z',
		updated_at: '2026-08-01T00:00:00.000Z',
		...overrides
	};
}

describe('Question Tree frontier scheduler', () => {
	it('prefers a deeper falsification question and drops low-value padding', () => {
		const nodes = [
			node({}),
			node({
				id: 'branch-a',
				parent_node_id: 'node-root',
				node_kind: 'question',
				node_number: 1,
				depth: 1,
				sibling_index: 0,
				question: 'What is the first unknown?'
			}),
			node({
				id: 'branch-a-deep',
				parent_node_id: 'branch-a',
				node_kind: 'question',
				node_number: 2,
				depth: 2,
				sibling_index: 0,
				question: 'What assumption supports it?'
			})
		];
		const result = scoreQuestionTreeFrontier({
			nodes,
			remainingSlots: 2,
			proposals: [
				proposal({ id: 'deep', source_node_id: 'branch-a-deep' }),
				proposal({
					id: 'padding',
					source_node_id: 'node-root',
					question: 'What else is interesting?',
					purpose: 'frame',
					expected_information_gain: 'low',
					model_priority: 0
				})
			]
		});

		expect(result.selectedIds).toEqual(['deep']);
		expect(result.belowThresholdIds).toContain('padding');
	});

	it('reserves a slot for a different root branch in a full batch', () => {
		const nodes = [
			node({}),
			node({
				id: 'branch-a',
				parent_node_id: 'node-root',
				node_kind: 'question',
				node_number: 1,
				depth: 1,
				sibling_index: 0
			}),
			node({
				id: 'branch-b',
				parent_node_id: 'node-root',
				node_kind: 'question',
				node_number: 2,
				depth: 1,
				sibling_index: 1,
				question: 'Alternative branch'
			})
		];
		const result = scoreQuestionTreeFrontier({
			nodes,
			remainingSlots: 3,
			batchLimit: 3,
			proposals: [
				proposal({ id: 'a1', source_node_id: 'branch-a', rank: 0 }),
				proposal({ id: 'a2', source_node_id: 'branch-a', rank: 1, model_priority: 0.85 }),
				proposal({ id: 'a3', source_node_id: 'branch-a', rank: 2, model_priority: 0.8 }),
				proposal({ id: 'b1', source_node_id: 'branch-b', rank: 0, model_priority: 0.7 })
			]
		});

		expect(result.selectedIds).toHaveLength(3);
		expect(result.selectedIds).toContain('b1');
	});
});
