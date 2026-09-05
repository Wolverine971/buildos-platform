// apps/worker/src/workers/project-loop/detectorFailure.ts
import {
	LLMRequestCancelledError,
	LLMRequestTimeoutError,
	OpenRouterEmptyContentError,
	isOpenRouterProviderError,
	parseOpenRouterErrorMetadata
} from '@buildos/smart-llm';
import { ProjectReviewLanguageError } from './reviewLanguage';

export type DetectorSkipReason =
	| 'cost_cap'
	| 'provider_timeout'
	| 'provider_error'
	| 'invalid_language';

export type SkippedLens = {
	label: string;
	kind: string | null;
	reason: DetectorSkipReason;
	detail?: string;
	providerRequestId?: string | null;
};

/**
 * Detector isolation is intentionally narrow: a provider timeout, transient
 * upstream response, or exhausted language retry may degrade a single lens.
 * Cancellation, malformed JSON, empty content, database failures, and local
 * invariants must still stop the run.
 */
export function classifyDetectorFailure(error: unknown): DetectorSkipReason | null {
	if (error instanceof LLMRequestCancelledError) return null;
	if (error instanceof ProjectReviewLanguageError) return 'invalid_language';
	if (error instanceof LLMRequestTimeoutError) return 'provider_timeout';
	if (error instanceof SyntaxError || error instanceof OpenRouterEmptyContentError) return null;

	const directMetadata = parseOpenRouterErrorMetadata(error);
	const cause =
		error && typeof error === 'object' ? (error as { cause?: unknown }).cause : undefined;
	const candidate =
		directMetadata.status !== undefined || isOpenRouterProviderError(error) ? error : cause;
	if (candidate instanceof LLMRequestCancelledError) return null;
	if (candidate instanceof LLMRequestTimeoutError) return 'provider_timeout';
	if (candidate instanceof SyntaxError || candidate instanceof OpenRouterEmptyContentError) {
		return null;
	}
	const { status } = parseOpenRouterErrorMetadata(candidate);
	if (
		status === 408 ||
		status === 429 ||
		(status !== undefined && status >= 500 && status < 600)
	) {
		return 'provider_error';
	}

	// OpenRouter can return an embedded provider error in a successful HTTP
	// response. With no HTTP status to inspect, its provider metadata is the LLM
	// pedigree that keeps this boundary from swallowing arbitrary application errors.
	if (status === undefined && isOpenRouterProviderError(candidate)) return 'provider_error';

	return null;
}
