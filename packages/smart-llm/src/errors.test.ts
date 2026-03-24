// packages/smart-llm/src/errors.test.ts
import {
	describe,
	expect,
	it
} from 'vitest';
import {
	isOpenRouterModelAvailabilityError,
	isRetryableOpenRouterError,
	shouldFailoverToNextOpenRouterModel
} from './errors';

describe('isRetryableOpenRouterError', () => {
	it('does not retry deterministic provider schema validation 400 errors', () => {
		const error = {
			status: 400,
			message:
				'OpenRouter API error: 400 - {"error":{"message":"Provider returned error","metadata":{"provider_name":"OpenAI"}}}'
		};

		expect(isRetryableOpenRouterError(error)).toBe(false);
	});

	it('retries transient server/provider failures', () => {
		const error = {
			status: 503,
			message:
				'OpenRouter API error: 503 - {"error":{"message":"Provider returned error","metadata":{"provider_name":"OpenAI"}}}'
		};

		expect(isRetryableOpenRouterError(error)).toBe(true);
	});

	it('treats 404 model removals as failover-worthy', () => {
		const error = {
			status: 404,
			message:
				'OpenRouter API error: 404 - Hunter Alpha was a stealth model revealed on March 18th as an early testing version of MiMo-V2-Pro.'
		};

		expect(isRetryableOpenRouterError(error)).toBe(false);
		expect(isOpenRouterModelAvailabilityError(error)).toBe(true);
		expect(shouldFailoverToNextOpenRouterModel(error)).toBe(true);
	});

	it('treats explicit model availability denials as failover-worthy', () => {
		const error = {
			status: 403,
			message:
				'OpenRouter API error: 403 - This model is not available for your account.'
		};

		expect(isOpenRouterModelAvailabilityError(error)).toBe(true);
		expect(shouldFailoverToNextOpenRouterModel(error)).toBe(true);
	});
});
