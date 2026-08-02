// apps/worker/tests/questionTreeModelAdapter.test.ts
import { describe, expect, it, vi } from 'vitest';
import {
	isOpenRouterQuotaError,
	OpenRouterQuestionTreeModel
} from '../src/workers/question-tree/questionTreeModelAdapter';
import type {
	QuestionTreeNode,
	QuestionTreeRun
} from '../src/workers/question-tree/questionTreeContracts';

function run(policy: QuestionTreeRun['model_policy']): QuestionTreeRun {
	return {
		id: 'run-1',
		created_by: 'admin-1',
		root_node_id: 'root-1',
		root_question: 'What makes a durable research thesis?',
		status: 'running',
		phase: 'seed',
		model_policy: policy,
		explorer_model_requested:
			policy === 'free_strict'
				? 'inclusionai/ling-3.0-flash:free'
				: 'inclusionai/ling-2.6-flash',
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
		config: {},
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

function response(content?: string): Response {
	return new Response(
		JSON.stringify({
			id: 'request-1',
			model: 'inclusionai/ling-2.6-flash',
			choices: [
				{
					message: {
						content:
							content ??
							JSON.stringify({
								questions: [
									{
										question: 'What evidence defines durability?',
										unknownAddressed: 'Definition of durability',
										whyItMatters: 'The thesis needs a measurable standard.',
										purpose: 'frame',
										expectedInformationGain: 'high'
									},
									{
										question: 'What counterexamples would disprove it?',
										unknownAddressed: 'Potential counterexamples',
										whyItMatters:
											'A falsifying case would overturn the thesis.',
										purpose: 'falsify',
										expectedInformationGain: 'high'
									}
								]
							})
					}
				}
			],
			usage: { prompt_tokens: 100, completion_tokens: 80, total_tokens: 180, cost: 0.00001 }
		}),
		{ status: 200, headers: { 'content-type': 'application/json' } }
	);
}

function node(): QuestionTreeNode {
	return {
		id: 'node-1',
		run_id: 'run-1',
		parent_node_id: 'root-1',
		node_kind: 'question',
		node_number: 1,
		depth: 1,
		sibling_index: 0,
		status: 'running',
		question: 'What evidence makes a thesis durable?',
		normalized_question: 'what evidence makes a thesis durable',
		answer: null,
		thesis: null,
		epistemic_assessment: null,
		confidence: null,
		stop_reason: null,
		model_requested: null,
		model_used: null,
		provider_request_id: null,
		attempt_count: 1,
		prompt_tokens: 0,
		completion_tokens: 0,
		reasoning_tokens: 0,
		cost_usd: 0,
		latency_ms: 0,
		lease_owner: 'worker-1',
		lease_expires_at: null,
		error_code: null,
		error_message: null,
		started_at: null,
		completed_at: null,
		created_at: '2026-08-01T00:00:00.000Z',
		updated_at: '2026-08-01T00:00:00.000Z'
	};
}

describe('OpenRouterQuestionTreeModel', () => {
	it('pins the paid model, requests JSON, allows same-model provider fallback, and sends no tools', async () => {
		const fetchImpl = vi.fn(async () => response());
		const model = new OpenRouterQuestionTreeModel({ apiKey: 'test-key', fetchImpl });
		const result = await model.seed({ run: run('paid_floor_strict') });
		const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));

		expect(body.model).toBe('inclusionai/ling-2.6-flash');
		expect(body.models).toBeUndefined();
		expect(body.tools).toBeUndefined();
		expect(body.response_format).toEqual({ type: 'json_object' });
		expect(body.provider).toMatchObject({
			allow_fallbacks: true,
			data_collection: 'deny',
			zdr: true,
			require_parameters: true,
			max_price: { prompt: 0.02, completion: 0.06, request: 0 }
		});
		expect(result.value.questions).toHaveLength(2);
		expect(result.telemetry.cost_usd).toBe(0.00001);
	});

	it('omits response_format for the strict free endpoint', async () => {
		const fetchImpl = vi.fn(async () => response());
		const model = new OpenRouterQuestionTreeModel({ apiKey: 'test-key', fetchImpl });
		await model.seed({ run: run('free_strict') });
		const body = JSON.parse(String(fetchImpl.mock.calls[0]?.[1]?.body));

		expect(body.model).toBe('inclusionai/ling-3.0-flash:free');
		expect(body.response_format).toBeUndefined();
		expect(body.reasoning).toEqual({ effort: 'none', exclude: true });
		expect(body.provider.require_parameters).toBe(false);
		expect(body.provider.max_price).toBeUndefined();
	});

	it('accepts a follow-up without whyItMatters and supplies a safe fallback', async () => {
		const content = JSON.stringify({
			answer: 'Durability requires evidence that survives counterexamples.',
			thesis: 'A durable thesis remains falsifiable.',
			confidence: 0.7,
			claims: [],
			followUpQuestions: [
				{
					question: 'Which counterexample would overturn this thesis?',
					purpose: 'falsify',
					targetClaim: 'A durable thesis remains falsifiable.',
					expectedInformationGain: 'high',
					priority: 0.9
				}
			],
			stopReason: 'One material falsifier remains.'
		});
		const model = new OpenRouterQuestionTreeModel({
			apiKey: 'test-key',
			fetchImpl: vi.fn(async () => response(content))
		});

		const result = await model.answer({
			run: run('paid_floor_strict'),
			node: node(),
			ancestry: []
		});

		expect(result.value.followUpQuestions[0]?.whyItMatters).toContain(
			'strengthen or challenge'
		);
	});

	it('repairs a truncated JSON response and keeps complete follow-up fields', async () => {
		const truncated =
			'{"answer":"A concise answer.","thesis":"A falsifiable thesis.","confidence":0.7,"claims":[],"followUpQuestions":[{"question":"What would disprove it?","purpose":"falsify","targetClaim":"The thesis","whyItMatters":"This response was cut';
		const model = new OpenRouterQuestionTreeModel({
			apiKey: 'test-key',
			fetchImpl: vi.fn(async () => response(truncated))
		});

		const result = await model.answer({
			run: run('paid_floor_strict'),
			node: node(),
			ancestry: []
		});

		expect(result.value.answer).toBe('A concise answer.');
		expect(result.value.followUpQuestions).toHaveLength(1);
		expect(result.value.followUpQuestions[0]?.whyItMatters).toContain(
			'strengthen or challenge'
		);
	});

	it('backs off and retries a provider 429 before failing the node', async () => {
		const fetchImpl = vi
			.fn()
			.mockResolvedValueOnce(
				new Response(JSON.stringify({ error: { message: 'Provider returned error' } }), {
					status: 429,
					headers: { 'retry-after': '0' }
				})
			)
			.mockResolvedValueOnce(response());
		const sleepImpl = vi.fn(async () => undefined);
		const model = new OpenRouterQuestionTreeModel({
			apiKey: 'test-key',
			fetchImpl,
			sleepImpl
		});

		await model.seed({ run: run('paid_floor_strict') });

		expect(fetchImpl).toHaveBeenCalledTimes(2);
		expect(sleepImpl).toHaveBeenCalledWith(500, undefined);
	});

	it('only treats a final free-lane 429 as a quota pause', () => {
		const error = Object.assign(new Error('rate limited'), { status: 429 });
		expect(isOpenRouterQuotaError(error, 'free_strict')).toBe(true);
		expect(isOpenRouterQuotaError(error, 'paid_floor_strict')).toBe(false);
	});
});
