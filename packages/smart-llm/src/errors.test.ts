import { describe, expect, it } from 'vitest';
import { isRetryableOpenRouterError } from './errors';

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
});

