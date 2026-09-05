// apps/web/src/lib/services/admin/chat-session-flow-profile.test.ts
import { requireTestValue } from '$lib/test-helpers/require-test-value';
import { describe, expect, it } from 'vitest';
import { buildSessionFlowProfile } from './chat-session-flow-profile';
import type { ChatSessionAuditPayload, ConversationTurn } from './chat-session-audit-types';

const detail = (totalCostUsd = 0.02): ChatSessionAuditPayload => ({
	session: {
		id: 'session-1',
		title: 'Flow test',
		user: { id: 'user-1', email: 'admin@example.com', name: 'Admin' },
		context_type: 'global',
		context_id: null,
		status: 'completed',
		message_count: 2,
		total_tokens: 100,
		tool_call_count: 1,
		llm_call_count: 1,
		cost_estimate: totalCostUsd,
		has_errors: false,
		created_at: '2026-08-03T12:00:00.000Z',
		updated_at: '2026-08-03T12:00:05.000Z',
		last_message_at: '2026-08-03T12:00:05.000Z',
		agent_metadata: {},
		extracted_entities: null
	},
	metrics: {
		total_tokens: 100,
		total_cost_usd: totalCostUsd,
		tool_calls: 1,
		tool_failures: 0,
		llm_calls: 1,
		llm_failures: 0,
		messages: 2
	},
	messages: [],
	tool_executions: [],
	llm_calls: [],
	operations: [],
	timeline: [],
	timing_metrics: null,
	turn_runs: []
});

const turn = (): ConversationTurn => ({
	id: 'turn:1',
	turnIndex: 1,
	run: null,
	userMessages: [
		{
			id: 'message-user-1',
			role: 'user',
			roleLabel: 'You',
			content: 'Search my inbox',
			timestamp: '2026-08-03T12:00:00.000Z',
			turnIndex: 1,
			totalTokens: 0,
			errorMessage: ''
		}
	],
	assistantMessages: [],
	otherMessages: [],
	toolCalls: [
		{
			id: 'tool-call-1',
			toolName: 'search_email_messages',
			title: 'Search email',
			summary: 'Search inbox',
			statusLabel: 'completed',
			success: true,
			severity: 'success',
			sourceLabel: 'Streamed tool lifecycle',
			timestamp: '2026-08-03T12:00:02.000Z',
			completedAt: '2026-08-03T12:00:03.500Z',
			duration: 1500,
			toolCallId: 'tool-call-1',
			canonicalOp: 'email.messages.search',
			resultSource: 'gateway',
			arguments: { query: 'inbox' },
			result: { matches: 3 },
			error: '',
			metadata: {},
			linkedToolExecution: null,
			linkedToolMessage: null,
			rawPayload: {},
			qualityRank: 4
		}
	],
	llmCalls: [
		{
			id: 'llm:usage-1',
			timestamp: '2026-08-03T12:00:00.500Z',
			type: 'llm_call',
			severity: 'info',
			title: 'LLM Call: gpt-test',
			summary: '100 tokens',
			turn_index: 1,
			payload: {
				model_used: 'gpt-test',
				request_started_at: '2026-08-03T12:00:00.500Z',
				request_completed_at: '2026-08-03T12:00:01.500Z',
				response_time_ms: 1000,
				total_cost_usd: 0.015,
				metadata: { costSource: 'provider_reported' }
			}
		}
	],
	promptSnapshots: [],
	operations: [],
	evalRuns: [],
	supervisorEvents: [],
	auditEvents: [],
	startedAt: '2026-08-03T12:00:00.000Z',
	finishedAt: '2026-08-03T12:00:04.000Z',
	status: 'completed',
	errors: 0
});

describe('chat-session-flow-profile', () => {
	it('builds readable per-turn spans and finds the slowest measured event', () => {
		const profile = buildSessionFlowProfile({ detail: detail(), conversationTurns: [turn()] });
		const toolEvent = profile.events.find((event) => event.category === 'tool');

		expect(profile.turns[0]).toMatchObject({ label: 'Turn 1', durationMs: 4000 });
		expect(toolEvent).toMatchObject({
			label: 'search_email_messages',
			durationMs: 1500,
			costState: 'unmetered',
			target: { kind: 'tool' }
		});
		expect(profile.slowestEvent?.id).toBe(toolEvent?.id);
	});

	it('attributes LLM spend while keeping tool work unmetered', () => {
		const profile = buildSessionFlowProfile({
			detail: detail(0.02),
			conversationTurns: [turn()]
		});
		const llmEvent = profile.events.find((event) => event.category === 'llm');
		const toolEvent = profile.events.find((event) => event.category === 'tool');

		expect(llmEvent).toMatchObject({ costUsd: 0.015, costState: 'reported' });
		expect(toolEvent).toMatchObject({ costUsd: null, costState: 'unmetered' });
		expect(profile.attributedCostUsd).toBeCloseTo(0.015);
		expect(profile.reportedCostUsd).toBeCloseTo(0.015);
		expect(profile.costDifferenceUsd).toBeCloseTo(0.005);
	});

	it('distinguishes a recorded zero-cost LLM call from unmetered work', () => {
		const zeroCostTurn = turn();
		requireTestValue(zeroCostTurn.llmCalls[0]).payload.total_cost_usd = 0;
		const profile = buildSessionFlowProfile({
			detail: detail(0),
			conversationTurns: [zeroCostTurn]
		});

		expect(profile.events.find((event) => event.category === 'llm')?.costState).toBe(
			'reported'
		);
		expect(profile.events.find((event) => event.category === 'tool')?.costState).toBe(
			'unmetered'
		);
	});

	it('does not coerce a missing LLM cost into a recorded zero', () => {
		const missingCostTurn = turn();
		delete requireTestValue(missingCostTurn.llmCalls[0]).payload.total_cost_usd;
		const profile = buildSessionFlowProfile({
			detail: detail(0),
			conversationTurns: [missingCostTurn]
		});

		expect(profile.events.find((event) => event.category === 'llm')).toMatchObject({
			costUsd: null,
			costState: 'unknown'
		});
	});

	it.each([
		{ costSource: 'catalog_estimate', estimatedUsage: true },
		{ costSource: 'catalog_estimate' },
		{ costSource: 'reservation' },
		{ estimatedUsage: true }
	])('keeps estimated charges separate from provider-reported spend (%j)', (metadata) => {
		const estimatedTurn = turn();
		requireTestValue(estimatedTurn.llmCalls[0]).severity = 'error';
		requireTestValue(estimatedTurn.llmCalls[0]).payload.metadata = metadata;
		requireTestValue(estimatedTurn.llmCalls[0]).payload.openrouter_usage_cost_usd = null;
		const profile = buildSessionFlowProfile({
			detail: detail(0.015),
			conversationTurns: [estimatedTurn]
		});

		expect(profile.events.find((event) => event.category === 'llm')).toMatchObject({
			costUsd: 0.015,
			storedCostUsd: 0.015,
			costState: 'estimated'
		});
		expect(profile.reportedCostUsd).toBe(0);
		expect(profile.estimatedCostUsd).toBe(0.015);
		expect(profile.estimatedCostCount).toBe(1);
		expect(profile.attributedCostUsd).toBe(0.015);
		expect(profile.costDifferenceUsd).toBe(0);
	});

	it.each([0, '0'])('honors provider-reported zero %j over a stored estimate', (providerCost) => {
		const reportedTurn = turn();
		requireTestValue(reportedTurn.llmCalls[0]).payload.metadata = { costSource: 'catalog_estimate' };
		requireTestValue(reportedTurn.llmCalls[0]).payload.openrouter_usage_cost_usd = providerCost;
		const profile = buildSessionFlowProfile({
			detail: detail(0.015),
			conversationTurns: [reportedTurn]
		});

		expect(profile.events.find((event) => event.category === 'llm')).toMatchObject({
			costUsd: 0,
			storedCostUsd: 0.015,
			costState: 'reported'
		});
		expect(profile.reportedCostUsd).toBe(0);
		expect(profile.estimatedCostUsd).toBe(0);
		expect(profile.unknownCostCount).toBe(0);
		expect(profile.attributedCostUsd).toBe(0.015);
	});

	it.each([undefined, null, {}, { unrelated: true }])(
		'recovers full usage evidence from a partial timeline payload (%j)',
		(metadata) => {
			const legacyTurn = turn();
			requireTestValue(legacyTurn.llmCalls[0]).payload.metadata = metadata;
			requireTestValue(legacyTurn.llmCalls[0]).payload.openrouter_usage_cost_usd = null;
			const sessionDetail = detail(0.015);
			sessionDetail.llm_calls = [
				{
					id: 'usage-1',
					openrouter_usage_cost_usd: 0.012,
					metadata: { passRole: 'contract_review' }
				}
			];
			const profile = buildSessionFlowProfile({
				detail: sessionDetail,
				conversationTurns: [legacyTurn]
			});

			expect(profile.events.find((event) => event.category === 'llm')).toMatchObject({
				label: 'Contract review · gpt-test',
				modelLabel: 'gpt-test',
				passRoleLabel: 'Contract review',
				costUsd: 0.012,
				storedCostUsd: 0.015,
				costState: 'reported'
			});
			expect(profile.reportedCostUsd).toBe(0.012);
			expect(profile.attributedCostUsd).toBe(0.015);
		}
	);

	it.each([{}, { costSource: 'unknown' }])(
		'does not present historical charges with no provider evidence as reported (%j)',
		(metadata) => {
			const legacyTurn = turn();
			requireTestValue(legacyTurn.llmCalls[0]).payload.metadata = metadata;
			const profile = buildSessionFlowProfile({
				detail: detail(0.015),
				conversationTurns: [legacyTurn]
			});

			expect(profile.events.find((event) => event.category === 'llm')).toMatchObject({
				costUsd: 0.015,
				costState: 'unknown'
			});
			expect(profile.reportedCostUsd).toBe(0);
			expect(profile.unknownCostUsd).toBe(0.015);
			expect(profile.unknownCostCount).toBe(1);
		}
	);

	it.each([null, '', ' ', false, -1, 'invalid'])(
		'does not interpret invalid provider cost %j as reported zero',
		(providerCost) => {
			const legacyTurn = turn();
			requireTestValue(legacyTurn.llmCalls[0]).payload.metadata = {};
			requireTestValue(legacyTurn.llmCalls[0]).payload.openrouter_usage_cost_usd = providerCost;
			const profile = buildSessionFlowProfile({
				detail: detail(),
				conversationTurns: [legacyTurn]
			});

			expect(profile.events.find((event) => event.category === 'llm')?.costState).toBe(
				'unknown'
			);
		}
	);

	it.each([
		['contract_review', 'Contract review'],
		['acting', 'Acting'],
		['final_response', 'Final response'],
		['repair', 'Repair']
	])('labels the %s pass in plain language', (passRole, expectedLabel) => {
		const labeledTurn = turn();
		requireTestValue(labeledTurn.llmCalls[0]).payload.metadata = { passRole };
		const profile = buildSessionFlowProfile({
			detail: detail(),
			conversationTurns: [labeledTurn]
		});

		expect(profile.events.find((event) => event.category === 'llm')?.label).toBe(
			`${expectedLabel} · gpt-test`
		);
	});

	it('drops turns that have no renderable flow events', () => {
		const emptyTurn = turn();
		emptyTurn.userMessages = [];
		emptyTurn.toolCalls = [];
		emptyTurn.llmCalls = [];
		const profile = buildSessionFlowProfile({
			detail: detail(0),
			conversationTurns: [emptyTurn]
		});

		expect(profile.turns).toEqual([]);
		expect(profile.events).toEqual([]);
		expect(profile.totalActiveDurationMs).toBe(0);
	});
});
