// apps/worker/tests/projectLoopDetectorFailure.test.ts
import { describe, expect, it } from 'vitest';
import {
	LLMRequestCancelledError,
	LLMRequestTimeoutError,
	OpenRouterEmptyContentError,
	OpenRouterTruncatedContentError,
	safeLlmErrorDiagnostic
} from '@buildos/smart-llm';
import {
	DetectorOutputUnusableError,
	classifyDetectorFailure
} from '../src/workers/project-loop/detectorFailure';
import { ProjectReviewLanguageError } from '../src/workers/project-loop/reviewLanguage';

describe('classifyDetectorFailure', () => {
	it('marks an exhausted language retry as an unchecked detector', () => {
		expect(classifyDetectorFailure(new ProjectReviewLanguageError())).toBe('invalid_language');
	});
	it('degrades typed provider timeouts', () => {
		expect(
			classifyDetectorFailure(
				new LLMRequestTimeoutError(120_000, 'deepseek/deepseek-v4-flash', {
					generationId: 'gen-timeout'
				})
			)
		).toBe('provider_timeout');
	});

	it.each([408, 429, 500, 502, 503, 504])('degrades transient OpenRouter HTTP %s', (status) => {
		expect(
			classifyDetectorFailure({
				status,
				message: `OpenRouter API error: ${status}`,
				openrouter: { httpStatus: status }
			})
		).toBe('provider_error');
	});

	it('degrades embedded upstream provider errors without an HTTP status', () => {
		expect(
			classifyDetectorFailure({
				message: 'OpenRouter API error: Provider returned error',
				openrouter: { providerName: 'Novita' }
			})
		).toBe('provider_error');
	});

	it('recognizes a transient provider cause beneath the generic JSON wrapper', () => {
		const cause = {
			status: 503,
			message: 'OpenRouter API error: 503 - provider unavailable',
			openrouter: { httpStatus: 503, generationId: 'gen-provider-error' }
		};
		const wrapper = new Error(
			'Failed to generate valid JSON: OpenRouter API error: 503 - provider unavailable',
			{ cause }
		);

		expect(classifyDetectorFailure(wrapper)).toBe('provider_error');
	});

	it('recognizes a typed timeout cause beneath an intermediate wrapper', () => {
		const wrapper = new Error('intermediate request wrapper', {
			cause: new LLMRequestTimeoutError(120_000, 'deepseek/deepseek-v4-flash')
		});

		expect(classifyDetectorFailure(wrapper)).toBe('provider_timeout');
	});

	/**
	 * The error `getJSONResponse` throws when every attempt failed: a generic Error whose cause
	 * carries only the safe diagnostic of the last failure (smart-llm-service.ts).
	 */
	const jsonWrapper = (lastError: unknown) =>
		new Error('Failed to generate valid JSON', {
			cause: { llmErrorDiagnostic: safeLlmErrorDiagnostic(lastError) }
		});

	it('skips only that check when the answer is still malformed or empty after repair (F14)', () => {
		const empty = new OpenRouterEmptyContentError('OpenRouter returned empty content', {});
		const cutOff = new OpenRouterTruncatedContentError('OpenRouter output hit max_tokens', {});
		const parse = new SyntaxError('Unexpected end of JSON input');

		expect(classifyDetectorFailure(parse)).toBe('invalid_response');
		expect(classifyDetectorFailure(empty)).toBe('invalid_response');
		// As the worker really sees them: wrapped, with the class kept only in the diagnostic.
		expect(classifyDetectorFailure(jsonWrapper(parse))).toBe('invalid_response');
		expect(classifyDetectorFailure(jsonWrapper(empty))).toBe('invalid_response');
		expect(classifyDetectorFailure(jsonWrapper(cutOff))).toBe('invalid_response');
		expect(classifyDetectorFailure(new Error('intermediate wrapper', { cause: parse }))).toBe(
			'invalid_response'
		);
	});

	it('reads a transient HTTP status from the wrapped diagnostic', () => {
		expect(classifyDetectorFailure(jsonWrapper({ status: 503, message: 'unavailable' }))).toBe(
			'provider_error'
		);
		expect(classifyDetectorFailure(jsonWrapper({ status: 429, message: 'slow down' }))).toBe(
			'provider_error'
		);
		expect(
			classifyDetectorFailure(jsonWrapper({ status: 400, message: 'bad request' }))
		).toBeNull();
		expect(
			classifyDetectorFailure(jsonWrapper({ status: 401, message: 'Unauthorized' }))
		).toBeNull();
	});

	it('reports a check whose every proposal was dropped as not checked (F15)', () => {
		const error = new DetectorOutputUnusableError('document organization', 2);
		expect(classifyDetectorFailure(error)).toBe('unusable_output');
		expect(error.message).toBe(
			'document organization: none of the 2 proposed changes could be used'
		);
	});

	it('does not degrade cancellation, auth, database, or unexplained wrapped errors', () => {
		expect(classifyDetectorFailure(new LLMRequestCancelledError('worker timeout'))).toBeNull();
		expect(
			classifyDetectorFailure(
				new Error('intermediate wrapper', {
					cause: new LLMRequestCancelledError('worker timeout')
				})
			)
		).toBeNull();
		expect(classifyDetectorFailure({ status: 401, message: 'Unauthorized' })).toBeNull();
		expect(
			classifyDetectorFailure({ code: 'PGRST116', message: 'Database failed' })
		).toBeNull();
		expect(
			classifyDetectorFailure(new Error('Failed to generate valid JSON: upstream timeout'))
		).toBeNull();
		// A local bug is not a model answer: no LLM diagnostic, so it still stops the run.
		expect(classifyDetectorFailure(new TypeError('x is not a function'))).toBeNull();
		expect(
			classifyDetectorFailure(jsonWrapper(new Error('something else entirely')))
		).toBeNull();
	});

	it('does not mistake deterministic provider validation errors for transient failures', () => {
		expect(
			classifyDetectorFailure({
				status: 400,
				message: 'OpenRouter API error: 400 - Invalid request param',
				openrouter: { providerName: 'Venice' }
			})
		).toBeNull();
	});
});
