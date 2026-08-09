// apps/web/src/lib/tests/agentic-e2e/harness/telemetry-usage.test.ts
import { describe, expect, it } from 'vitest';

import { summarizeUsageLogs, teardownChatSession, type LlmUsageLogRow } from './telemetry';

function usage(overrides: Partial<LlmUsageLogRow>): LlmUsageLogRow {
	return {
		id: 'usage-1',
		model_requested: 'provider/model-a',
		model_used: 'provider/model-a',
		provider: 'provider',
		profile: 'balanced',
		operation_type: 'agent_chat_stream',
		prompt_tokens: 100,
		completion_tokens: 20,
		total_tokens: 120,
		total_cost_usd: 0.01,
		request_started_at: '2026-07-24T17:00:00.000Z',
		request_completed_at: '2026-07-24T17:00:01.000Z',
		...overrides
	};
}

describe('agentic E2E stream usage summaries', () => {
	it('aggregates every model pass and de-duplicates attribution fields', () => {
		const result = summarizeUsageLogs([
			usage({}),
			usage({
				id: 'usage-2',
				model_requested: 'provider/model-b',
				model_used: 'provider/model-b',
				profile: 'quality',
				operation_type: 'agent_chat_synthesis',
				prompt_tokens: 200,
				completion_tokens: 50,
				total_tokens: 250,
				total_cost_usd: 0.04
			})
		]);

		expect(result).toEqual({
			requestCount: 2,
			promptTokens: 300,
			completionTokens: 70,
			totalTokens: 370,
			totalCostUsd: 0.05,
			models: ['provider/model-a', 'provider/model-b'],
			providers: ['provider'],
			profiles: ['balanced', 'quality'],
			operations: ['agent_chat_stream', 'agent_chat_synthesis']
		});
	});

	it('retains worker sessions while production control-row retention is active', async () => {
		await expect(
			teardownChatSession({} as never, 'user-id', 'session-id', {
				retainForWorkerControlRowRetention: true
			})
		).resolves.toBeUndefined();
	});
});
