// apps/worker/tests/questionTreeWorker.test.ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
	QuestionTreeNode,
	QuestionTreeProposal,
	QuestionTreeRun
} from '../src/workers/question-tree/questionTreeContracts';

const repository = vi.hoisted(() => ({
	admitProposals: vi.fn(),
	claimBatch: vi.fn(),
	closeFrontier: vi.fn(),
	completeNode: vi.fn(),
	completeSeed: vi.fn(),
	enqueueAdvance: vi.fn(),
	failNode: vi.fn(),
	finishRun: vi.fn(),
	getRun: vi.fn(),
	listNodes: vi.fn(),
	listProposals: vi.fn(),
	markRunFailed: vi.fn(),
	markRunStarted: vi.fn(),
	transitionToSynthesis: vi.fn(),
	updateFrontierScores: vi.fn()
}));

vi.mock('../src/workers/question-tree/questionTreeRepository', () => repository);

import { processQuestionTreeJob } from '../src/workers/question-tree/questionTreeWorker';

function baseRun(): QuestionTreeRun {
	return {
		id: 'run-1',
		created_by: 'admin-1',
		root_node_id: 'root-1',
		root_question: 'What makes an adaptive research tree useful?',
		status: 'queued',
		phase: 'seed',
		model_policy: 'paid_floor_strict',
		explorer_model_requested: 'inclusionai/ling-2.6-flash',
		synthesis_model_requested: 'inclusionai/ling-2.6-flash',
		prompt_version: 'question-tree-v1',
		node_limit: 100,
		nodes_created: 0,
		nodes_completed: 0,
		nodes_failed: 0,
		deepest_depth: 0,
		frontier_count: 0,
		advance_sequence: 0,
		max_provider_requests: 125,
		provider_requests: 0,
		config: { max_cost_usd: 0.02 },
		usage: {
			prompt_tokens: 0,
			completion_tokens: 0,
			total_tokens: 0,
			cost_usd: 0,
			latency_ms: 0
		},
		synthesis: null,
		pause_reason: null,
		next_retry_at: null,
		next_batch_not_before: null,
		started_at: null,
		completed_at: null,
		created_at: '2026-08-01T00:00:00.000Z',
		updated_at: '2026-08-01T00:00:00.000Z'
	};
}

function rootNode(): QuestionTreeNode {
	return {
		id: 'root-1',
		run_id: 'run-1',
		parent_node_id: null,
		node_kind: 'root',
		node_number: 0,
		depth: 0,
		sibling_index: null,
		status: 'completed',
		question: 'What makes an adaptive research tree useful?',
		normalized_question: 'what makes an adaptive research tree useful',
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
		updated_at: '2026-08-01T00:00:00.000Z'
	};
}

describe('Question Tree worker orchestration', () => {
	beforeEach(() => vi.clearAllMocks());

	it('seeds, admits an adaptive first batch, and enqueues the next advance', async () => {
		const run = baseRun();
		const nodes: QuestionTreeNode[] = [rootNode()];
		const proposals: QuestionTreeProposal[] = [];
		repository.getRun.mockImplementation(async () => run);
		repository.listNodes.mockImplementation(async () => nodes);
		repository.listProposals.mockImplementation(async () => proposals);
		repository.markRunStarted.mockImplementation(async () => {
			run.status = 'running';
		});
		repository.completeSeed.mockImplementation(async ({ output }) => {
			run.phase = 'explore';
			output.questions.forEach((question: any, rank: number) =>
				proposals.push({
					id: `proposal-${rank}`,
					run_id: run.id,
					source_node_id: run.root_node_id,
					rank,
					question: question.question,
					normalized_question: question.question.toLowerCase(),
					purpose: question.purpose,
					target_claim: question.unknownAddressed,
					why_it_matters: question.whyItMatters,
					expected_information_gain: question.expectedInformationGain,
					model_priority: 0.8,
					scheduler_score: null,
					status: 'proposed',
					child_node_id: null,
					duplicate_of_node_id: null,
					validation_error: null,
					created_at: new Date(rank).toISOString(),
					updated_at: new Date(rank).toISOString()
				})
			);
		});
		repository.admitProposals.mockImplementation(async (_runId, proposalIds: string[]) => {
			for (const [index, proposalId] of proposalIds.entries()) {
				const proposal = proposals.find((entry) => entry.id === proposalId);
				if (!proposal) continue;
				proposal.status = 'spawned';
				nodes.push({
					...rootNode(),
					id: `node-${index + 1}`,
					parent_node_id: run.root_node_id,
					node_kind: 'question',
					node_number: index + 1,
					depth: 1,
					sibling_index: index,
					status: 'queued',
					question: proposal.question
				});
			}
			return proposalIds.length;
		});

		const model = {
			seed: vi.fn().mockResolvedValue({
				value: {
					questions: [
						{
							question: 'Which unknown matters most?',
							unknownAddressed: 'Primary unknown',
							whyItMatters: 'It frames the thesis.',
							purpose: 'frame',
							expectedInformationGain: 'high'
						},
						{
							question: 'What could disprove the thesis?',
							unknownAddressed: 'Counterevidence',
							whyItMatters: 'It could overturn the thesis.',
							purpose: 'falsify',
							expectedInformationGain: 'high'
						}
					]
				},
				telemetry: {
					model_requested: run.explorer_model_requested,
					model_used: run.explorer_model_requested,
					provider_request_id: 'request-1',
					prompt_tokens: 20,
					completion_tokens: 20,
					total_tokens: 40,
					cost_usd: 0.000001,
					latency_ms: 10,
					reasoning_tokens: 0
				}
			}),
			answer: vi.fn(),
			synthesize: vi.fn()
		};
		const controller = new AbortController();
		const result = await processQuestionTreeJob(
			{
				id: 'job-1',
				correlationId: 'correlation-1',
				userId: 'admin-1',
				data: { run_id: run.id, advance_sequence: 0 },
				attempts: 0,
				signal: controller.signal,
				updateProgress: vi.fn(),
				log: vi.fn()
			},
			{ model }
		);

		expect(model.seed).toHaveBeenCalledOnce();
		expect(repository.completeSeed).toHaveBeenCalledOnce();
		expect(repository.admitProposals).toHaveBeenCalledWith(run.id, [
			'proposal-1',
			'proposal-0'
		]);
		expect(repository.enqueueAdvance).toHaveBeenCalledOnce();
		expect(nodes.filter((node) => node.node_kind === 'question')).toHaveLength(2);
		expect(result).toEqual({ status: 'running', phase: 'explore' });
	});
});
