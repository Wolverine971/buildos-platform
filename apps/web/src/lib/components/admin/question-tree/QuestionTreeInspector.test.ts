// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/svelte';
import QuestionTreeInspector from './QuestionTreeInspector.svelte';
import type { QuestionTreeNode, QuestionTreeProposal } from '$lib/services/question-tree/types';

function node(overrides: Partial<QuestionTreeNode> = {}): QuestionTreeNode {
	return {
		id: 'root-node',
		run_id: 'run-1',
		parent_node_id: null,
		node_kind: 'root',
		node_number: 0,
		depth: 0,
		sibling_index: null,
		status: 'completed',
		question: 'What should this research tree investigate?',
		answer: null,
		thesis: null,
		epistemic_assessment: null,
		confidence: null,
		stop_reason: null,
		model_requested: 'test-model',
		model_used: 'test-model',
		provider_request_id: null,
		attempt_count: 1,
		prompt_tokens: 100,
		completion_tokens: 50,
		reasoning_tokens: 0,
		cost_usd: 0.0001,
		latency_ms: 1200,
		error_code: null,
		error_message: null,
		started_at: null,
		completed_at: null,
		created_at: '2026-08-02T12:00:00.000Z',
		updated_at: '2026-08-02T12:00:00.000Z',
		...overrides
	};
}

function proposal(overrides: Partial<QuestionTreeProposal> = {}): QuestionTreeProposal {
	return {
		id: 'proposal-1',
		run_id: 'run-1',
		source_node_id: 'root-node',
		rank: 1,
		question: 'Which claim should the next node pressure-test?',
		purpose: 'falsify',
		target_claim: 'The current thesis is robust.',
		why_it_matters: 'A direct falsification attempt makes the thesis more trustworthy.',
		expected_information_gain: 'high',
		model_priority: 1,
		scheduler_score: 0.9,
		status: 'spawned',
		child_node_id: 'child-node',
		duplicate_of_node_id: null,
		validation_error: null,
		created_at: '2026-08-02T12:00:00.000Z',
		updated_at: '2026-08-02T12:00:00.000Z',
		...overrides
	};
}

afterEach(cleanup);

describe('QuestionTreeInspector', () => {
	it('explains an answerless root without calling it unanswered', async () => {
		const onClose = vi.fn();
		render(QuestionTreeInspector, {
			props: { node: node(), proposals: [], onClose }
		});

		expect(screen.getByText('Research origin')).toBeInTheDocument();
		expect(screen.queryByText('No answer yet.')).not.toBeInTheDocument();

		await fireEvent.click(screen.getByRole('button', { name: 'Close node inspector' }));
		expect(onClose).toHaveBeenCalledOnce();
	});

	it('progressively discloses proposal rationale and opens its child node', async () => {
		const onSelectNode = vi.fn();
		const item = proposal();
		const view = render(QuestionTreeInspector, {
			props: {
				node: node(),
				proposals: [item],
				onSelectNode,
				onClose: vi.fn()
			}
		});

		const disclosure = view.container.querySelector('details');
		expect(disclosure).not.toBeNull();
		expect(disclosure?.open).toBe(false);

		const summary = screen.getByText(item.question).closest('summary');
		expect(summary).not.toBeNull();
		await fireEvent.click(summary as HTMLElement);
		expect(disclosure?.open).toBe(true);

		await fireEvent.click(screen.getByRole('button', { name: 'Open child node' }));
		expect(onSelectNode).toHaveBeenCalledWith('child-node');
	});
});
