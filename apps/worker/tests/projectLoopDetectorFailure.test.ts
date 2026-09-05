// apps/worker/tests/projectLoopDetectorFailure.test.ts
import { describe, expect, it } from 'vitest';
import {
	LLMRequestCancelledError,
	LLMRequestTimeoutError,
	OpenRouterEmptyContentError
} from '@buildos/smart-llm';
import { classifyDetectorFailure } from '../src/workers/project-loop/detectorFailure';
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

	it('does not degrade cancellation, parse, empty-content, auth, database, or wrapped errors', () => {
		expect(classifyDetectorFailure(new LLMRequestCancelledError('worker timeout'))).toBeNull();
		expect(classifyDetectorFailure(new SyntaxError('Unexpected end of JSON input'))).toBeNull();
		expect(
			classifyDetectorFailure(
				new OpenRouterEmptyContentError('OpenRouter returned empty content', {})
			)
		).toBeNull();
		expect(classifyDetectorFailure({ status: 401, message: 'Unauthorized' })).toBeNull();
		expect(
			classifyDetectorFailure({ code: 'PGRST116', message: 'Database failed' })
		).toBeNull();
		expect(
			classifyDetectorFailure(new Error('Failed to generate valid JSON: upstream timeout'))
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
