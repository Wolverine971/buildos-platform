// apps/worker/src/workers/agent-run/agentRunRuntimePolicy.ts
import type { Json } from '@buildos/shared-types';
import type { DeepResearchObservations } from './deepResearchEvidence';

const DEEP_RESEARCH_TOKEN_OVERRUN_FRACTION = 0.1;
const DEEP_RESEARCH_MIN_TOKEN_OVERRUN = 1_000;
const DEEP_RESEARCH_MAX_TOKEN_OVERRUN = 2_500;
const DEEP_RESEARCH_RESEARCH_TURN_MAX_OUTPUT = 2_048;
const DEEP_RESEARCH_RESEARCH_TURN_MIN_OUTPUT = 512;
const DEEP_RESEARCH_FINAL_TURN_MAX_OUTPUT = 4_096;
const DEEP_RESEARCH_FINAL_TURN_MIN_OUTPUT = 512;
const PROMPT_ESTIMATE_FIXED_TOKENS = 512;
const PROMPT_ESTIMATE_BYTES_PER_TOKEN = 3;
const FINAL_CONTEXT_MAX_CHARS = 20_000;
const FINAL_CONTEXT_SOURCE_MAX_CHARS = 6_000;
const WORKING_CONTEXT_SOURCE_CHARS = 1_500;
const WORKING_CONTEXT_TOTAL_SOURCE_CHARS = 6_000;
const WORKING_CONTEXT_SEARCH_RESULTS = 12;
const WORKING_CONTEXT_SEARCH_SNIPPET_CHARS = 350;

export interface AgentRunTokenPlan {
	softTarget?: number;
	hardLimit?: number;
	forceSubmitResult: boolean;
	maxOutputTokens?: number;
	estimatedPromptTokens?: number;
	reason?: 'tool_budget' | 'token_headroom';
	cannotFitFinalTurn?: boolean;
}

export interface AgentRunTokenUsageCharge {
	observedTokens: number;
	uncertainTokenExposure: number;
}

/**
 * A lost strict-budget response is charged at its full reservation so cost
 * accounting stays conservative. Its estimated token units are not provider-
 * observed usage, though, and must not consume the run's research token target.
 */
export function classifyAgentRunTokenUsage(params: {
	totalTokens?: number;
	costSource?: 'provider_reported' | 'catalog_estimate' | 'reservation';
	billingDisposition?: 'settled' | 'released' | 'uncertain';
}): AgentRunTokenUsageCharge {
	const totalTokens =
		typeof params.totalTokens === 'number' &&
		Number.isFinite(params.totalTokens) &&
		params.totalTokens > 0
			? params.totalTokens
			: 0;
	const isUncertainReservation =
		params.costSource === 'reservation' && params.billingDisposition === 'uncertain';
	return {
		observedTokens: isUncertainReservation ? 0 : totalTokens,
		uncertainTokenExposure: isUncertainReservation ? totalTokens : 0
	};
}

export function resolveAgentRunHardTokenLimit(
	maxTokens: number | undefined,
	allowsSoftOverrun: boolean
): number | undefined {
	const softTarget = finitePositiveInteger(maxTokens);
	if (softTarget === undefined || !allowsSoftOverrun) return softTarget;
	const overrunAllowance = Math.min(
		DEEP_RESEARCH_MAX_TOKEN_OVERRUN,
		Math.max(
			DEEP_RESEARCH_MIN_TOKEN_OVERRUN,
			Math.ceil(softTarget * DEEP_RESEARCH_TOKEN_OVERRUN_FRACTION)
		)
	);
	return softTarget + overrunAllowance;
}

function finitePositiveInteger(value: number | undefined): number | undefined {
	return typeof value === 'number' && Number.isFinite(value) && value > 0
		? Math.floor(value)
		: undefined;
}

/**
 * Agent Run token budgets are provider-reported aggregate usage, so an exact
 * preflight count is not available. This estimate intentionally leans
 * conservative without using the cost ledger's much stricter 1-byte-per-token
 * reservation estimate, which would force finalization before useful research.
 */
export function estimateAgentRunPromptTokens(...parts: string[]): number {
	const bytes = new TextEncoder().encode(parts.join('\n')).byteLength;
	return Math.ceil(bytes / PROMPT_ESTIMATE_BYTES_PER_TOKEN) + PROMPT_ESTIMATE_FIXED_TOKENS;
}

export function resolveAgentRunTokenPlan(params: {
	maxTokens?: number;
	tokensUsed: number;
	isResearchEvidenceChild: boolean;
	isDeepRun?: boolean;
	toolCallBudgetReached: boolean;
	systemPrompt: string;
	finalSystemPrompt?: string;
	normalUserPrompt: string;
	finalUserPrompt?: string;
}): AgentRunTokenPlan {
	const softTarget = finitePositiveInteger(params.maxTokens);
	const preservesFinalTurn = params.isResearchEvidenceChild || params.isDeepRun === true;
	if (!preservesFinalTurn || softTarget === undefined) {
		return {
			softTarget,
			hardLimit: softTarget,
			forceSubmitResult: params.toolCallBudgetReached,
			reason: params.toolCallBudgetReached ? 'tool_budget' : undefined
		};
	}

	const hardLimit = resolveAgentRunHardTokenLimit(softTarget, true)!;
	const finalUserPrompt = params.finalUserPrompt ?? params.normalUserPrompt;
	const estimatedNormalPromptTokens = estimateAgentRunPromptTokens(
		params.systemPrompt,
		params.normalUserPrompt
	);
	const estimatedFinalPromptTokens = estimateAgentRunPromptTokens(
		params.finalSystemPrompt ?? params.systemPrompt,
		finalUserPrompt
	);
	// Reserve a guaranteed terminal packet, not the terminal turn's full maximum.
	// Reserving all 4,096 possible output tokens forced live children to stop near
	// 6k observed tokens even though their 20k target still had useful headroom.
	// The final plan below may use up to 4,096 when that headroom actually remains.
	const projectedResearchThenFinal =
		params.tokensUsed +
		estimatedNormalPromptTokens +
		DEEP_RESEARCH_RESEARCH_TURN_MIN_OUTPUT +
		estimatedFinalPromptTokens +
		DEEP_RESEARCH_FINAL_TURN_MIN_OUTPUT;
	const forceForHeadroom = projectedResearchThenFinal >= hardLimit;
	const forceSubmitResult = params.toolCallBudgetReached || forceForHeadroom;

	if (!forceSubmitResult) {
		const remainingAfterPrompt = Math.floor(
			hardLimit - params.tokensUsed - estimatedNormalPromptTokens
		);
		return {
			softTarget,
			hardLimit,
			forceSubmitResult: false,
			maxOutputTokens: Math.max(
				DEEP_RESEARCH_FINAL_TURN_MIN_OUTPUT,
				Math.min(DEEP_RESEARCH_RESEARCH_TURN_MAX_OUTPUT, remainingAfterPrompt)
			),
			estimatedPromptTokens: estimatedNormalPromptTokens
		};
	}

	const remainingAfterFinalPrompt = Math.floor(
		hardLimit - params.tokensUsed - estimatedFinalPromptTokens
	);
	return {
		softTarget,
		hardLimit,
		forceSubmitResult: true,
		maxOutputTokens: Math.max(
			DEEP_RESEARCH_FINAL_TURN_MIN_OUTPUT,
			Math.min(DEEP_RESEARCH_FINAL_TURN_MAX_OUTPUT, remainingAfterFinalPrompt)
		),
		estimatedPromptTokens: estimatedFinalPromptTokens,
		reason: params.toolCallBudgetReached ? 'tool_budget' : 'token_headroom',
		cannotFitFinalTurn: remainingAfterFinalPrompt < DEEP_RESEARCH_FINAL_TURN_MIN_OUTPUT
	};
}

function sanitizeJsonString(value: string): string {
	// PostgreSQL jsonb cannot represent U+0000. Replace it instead of dropping the
	// entire successful tool result. Also replace lone UTF-16 surrogates, which can
	// be rejected by a strict JSON decoder even though JSON.stringify escapes them.
	return value
		.split('\u0000')
		.join('\uFFFD')
		.replace(
			/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g,
			'\uFFFD'
		);
}

/**
 * Convert arbitrary operation output into a JSON-compatible value that
 * Supabase/PostgreSQL jsonb can persist. This is deliberately loss-minimizing:
 * successful research observations remain usable after unsafe scalar values are
 * normalized, while cycles and exotic runtime values cannot break telemetry.
 */
export function sanitizeAgentRunTelemetryJson(value: unknown): Json {
	const ancestors = new WeakSet<object>();

	const visit = (input: unknown, depth: number): Json => {
		if (depth > 30) return '[max-depth]';
		if (input === null || input === undefined) return null;
		if (typeof input === 'string') return sanitizeJsonString(input);
		if (typeof input === 'boolean') return input;
		if (typeof input === 'number') return Number.isFinite(input) ? input : null;
		if (typeof input === 'bigint') return input.toString();
		if (typeof input === 'symbol' || typeof input === 'function') return null;

		if (input instanceof Date) {
			return Number.isFinite(input.getTime()) ? input.toISOString() : null;
		}
		if (input instanceof Error) {
			return {
				name: sanitizeJsonString(input.name),
				message: sanitizeJsonString(input.message)
			};
		}
		if (ancestors.has(input)) return '[circular]';
		ancestors.add(input);
		try {
			if (Array.isArray(input)) {
				return input.map((item) => visit(item, depth + 1));
			}
			const output = Object.create(null) as Record<string, Json>;
			for (const [rawKey, item] of Object.entries(input)) {
				output[sanitizeJsonString(rawKey)] = visit(item, depth + 1);
			}
			return output;
		} catch {
			return '[unserializable]';
		} finally {
			ancestors.delete(input);
		}
	};

	return visit(value, 0);
}

/**
 * Finalization uses compact, durable observations instead of replaying every
 * large tool response. This lowers repeated prompt cost while retaining exact
 * excerpts and URLs required by the evidence validator.
 */
export function renderDeepResearchFinalizationContext(
	observations: DeepResearchObservations
): string {
	let remainingChars = FINAL_CONTEXT_MAX_CHARS;
	const sources = observations.visitedSources.flatMap((source) => {
		if (remainingChars <= 0) return [];
		const content = (source.content ?? '').slice(
			0,
			Math.min(FINAL_CONTEXT_SOURCE_MAX_CHARS, remainingChars)
		);
		remainingChars -= content.length;
		return [
			{
				requested_url: source.requestedUrl,
				final_url: source.finalUrl,
				title: source.title ?? null,
				accessed_at: source.accessedAt,
				content
			}
		];
	});

	return JSON.stringify({
		search_queries: observations.searchQueries,
		verified_visited_sources: sources
	});
}

/**
 * Research turns need candidate URLs and enough source memory to choose the
 * next operation, not an ever-growing replay of every raw tool result. The
 * final evidence turn receives the larger context above.
 */
export function renderDeepResearchWorkingContext(observations: DeepResearchObservations): string {
	let remainingSourceChars = WORKING_CONTEXT_TOTAL_SOURCE_CHARS;
	const visitedSources = observations.visitedSources.flatMap((source) => {
		if (remainingSourceChars <= 0) return [];
		const content = (source.content ?? '').slice(
			0,
			Math.min(WORKING_CONTEXT_SOURCE_CHARS, remainingSourceChars)
		);
		remainingSourceChars -= content.length;
		return [
			{
				requested_url: source.requestedUrl,
				final_url: source.finalUrl,
				title: source.title ?? null,
				content
			}
		];
	});
	const searchResults = observations.searchResults
		.slice(-WORKING_CONTEXT_SEARCH_RESULTS)
		.map((result) => ({
			query: result.query,
			title: result.title,
			url: result.url,
			snippet: result.snippet?.slice(0, WORKING_CONTEXT_SEARCH_SNIPPET_CHARS) ?? null
		}));

	return JSON.stringify({
		completed_search_queries: observations.searchQueries,
		candidate_search_results: searchResults,
		verified_visited_sources: visitedSources
	});
}

/**
 * A budget/cancellation fallback must never publish a raw tool transcript as
 * the user-facing answer. For research-scoped runs, retain a small useful list
 * of only the URLs that were both visited and durably recorded.
 */
export function renderDeepResearchInterruptedAnswer(
	observations: DeepResearchObservations
): string {
	const urls = Array.from(
		new Set(
			observations.visitedSources
				.map((source) => source.finalUrl.trim())
				.filter((url) => url.length > 0)
		)
	).slice(0, 10);
	if (urls.length === 0) return '';
	return `Research stopped before final synthesis. Verified sources collected:\n\n${urls
		.map((url) => `- ${url}`)
		.join('\n')}`;
}
