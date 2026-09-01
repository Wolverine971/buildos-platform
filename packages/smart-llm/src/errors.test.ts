// packages/smart-llm/src/errors.test.ts
import { describe, expect, it } from 'vitest';
import {
	LLMRequestCancelledError,
	LLMRequestTimeoutError,
	isOpenRouterDefinitivePreGenerationRejection,
	isOpenRouterModelAvailabilityError,
	isRetryableOpenRouterError,
	safeLlmErrorDiagnostic,
	safeLlmErrorForLogging,
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

	it('retries typed request timeouts but never caller cancellations', () => {
		expect(isRetryableOpenRouterError(new LLMRequestTimeoutError(120_000, 'test/model'))).toBe(
			true
		);
		expect(isRetryableOpenRouterError(new LLMRequestCancelledError('worker shutdown'))).toBe(
			false
		);
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
			message: 'OpenRouter API error: 403 - This model is not available for your account.'
		};

		expect(isOpenRouterModelAvailabilityError(error)).toBe(true);
		expect(shouldFailoverToNextOpenRouterModel(error)).toBe(true);
	});

	it('only releases definitive route rejection without a generation id', () => {
		expect(
			isOpenRouterDefinitivePreGenerationRejection({
				status: 404,
				message: 'OpenRouter API error: 404 - No endpoints found for this model',
				openrouter: { httpStatus: 404, generationId: null }
			})
		).toBe(true);
		expect(
			isOpenRouterDefinitivePreGenerationRejection({
				status: 404,
				message: 'OpenRouter API error: 404 - No endpoints found for this model',
				openrouter: { httpStatus: 404, generationId: 'gen-accepted' }
			})
		).toBe(false);
		expect(
			isOpenRouterDefinitivePreGenerationRejection({
				status: 504,
				message: 'upstream timeout',
				openrouter: { httpStatus: 504, generationId: null }
			})
		).toBe(false);
		expect(
			isOpenRouterDefinitivePreGenerationRejection({
				status: 404,
				message: 'unrelated resource was not found',
				openrouter: { httpStatus: 404, generationId: null }
			})
		).toBe(false);
	});
});

describe('safe LLM error diagnostics', () => {
	it('never serializes provider messages, request config, response bodies, or stacks', () => {
		const sentinel = 'SUPER_SECRET_PROMPT_AND_API_KEY';
		const error = Object.assign(new Error(sentinel), {
			name: `Injected${sentinel}`,
			status: 503,
			code: `Injected${sentinel}`,
			config: { headers: { Authorization: sentinel }, body: sentinel },
			response: { data: { error: sentinel } },
			openrouter: {
				httpStatus: 503,
				errorCode: `Injected${sentinel}`,
				error: { message: sentinel }
			}
		});

		expect(safeLlmErrorDiagnostic(error)).toEqual({
			name: 'ProviderError',
			category: 'server_error',
			status: 503
		});
		expect(JSON.stringify(safeLlmErrorDiagnostic(error))).not.toContain(sentinel);
		expect(safeLlmErrorForLogging(error, 'LLM request').message).not.toContain(sentinel);
	});

	it.each([
		['LLMRequestCancelledError', 'cancelled'],
		['LLMRequestTimeoutError', 'timeout'],
		['SyntaxError', 'invalid_response']
	] as const)(
		'classifies allowlisted %s errors across serialization boundaries',
		(name, category) => {
			expect(safeLlmErrorDiagnostic({ name })).toMatchObject({ name, category });
		}
	);
});
