// apps/worker/tests/deepResearchLlmFailure.test.ts
import { describe, expect, it } from 'vitest';
import { LLMSpendLimitError } from '@buildos/smart-llm';
import { categorizeLlmFailure } from '../src/workers/agent-run/deepResearchOrchestrator';

describe('categorizeLlmFailure', () => {
	it('flags a reservation-infeasible budget distinctly', () => {
		expect(categorizeLlmFailure(new LLMSpendLimitError('budget too small'))).toBe(
			'reservation_infeasible'
		);
	});

	it('flags an OpenRouter max_price rejection distinctly', () => {
		expect(
			categorizeLlmFailure(
				new Error('OpenRouter API error: 404 - No endpoints found that satisfy the max price')
			)
		).toBe('provider_price_rejected');
	});

	it('falls back to a generic model_error for anything else', () => {
		expect(categorizeLlmFailure(new Error('upstream 503'))).toBe('model_error');
		expect(categorizeLlmFailure('weird string')).toBe('model_error');
	});
});
