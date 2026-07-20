// apps/worker/src/workers/agent-run/agentRunCostReconciler.ts
//
// Bounded provider reconciliation for stale paid-attempt reservations.
// OpenRouter exposes an authoritative generation lookup. Providers without a
// per-request lookup remain conservative exposure and are routed to operators.

import {
	type AgentRunCostEntry,
	AgentRunCostLedgerError,
	claimAgentRunCostReconciliations,
	reconcileAgentRunCost,
	releaseAgentRunCostReconciliation
} from './agentRunCostLedger';

const OPENROUTER_GENERATION_URL = 'https://openrouter.ai/api/v1/generation';
const DEFAULT_STALE_MS = 10 * 60 * 1000;
const DEFAULT_BATCH_SIZE = 20;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_LEASE_SECONDS = 120;
const DEFAULT_MAX_ATTEMPTS = 8;
const DEFAULT_LOOKUP_TIMEOUT_MS = 10_000;
const DEFAULT_RETRY_BASE_MS = 15 * 60 * 1000;
const MAX_RETRY_MS = 6 * 60 * 60 * 1000;

interface OpenRouterGenerationData {
	id?: unknown;
	model?: unknown;
	provider_name?: unknown;
	total_cost?: unknown;
	native_tokens_prompt?: unknown;
	native_tokens_completion?: unknown;
	tokens_prompt?: unknown;
	tokens_completion?: unknown;
}

interface OpenRouterGenerationResponse {
	data?: OpenRouterGenerationData;
}

export interface OpenRouterGenerationCost {
	generationId: string;
	totalCostUsd: number;
	totalTokens?: number;
	model?: string;
	providerName?: string;
}

export class ProviderCostLookupError extends Error {
	constructor(
		message: string,
		readonly retryable: boolean,
		readonly status?: number
	) {
		super(message);
		this.name = 'ProviderCostLookupError';
	}
}

interface ReconciliationLedger {
	claim: typeof claimAgentRunCostReconciliations;
	reconcile: typeof reconcileAgentRunCost;
	release: typeof releaseAgentRunCostReconciliation;
}

export interface AgentRunCostReconciliationOptions {
	apiKey?: string;
	fetchFn?: typeof fetch;
	now?: () => Date;
	staleMs?: number;
	batchSize?: number;
	concurrency?: number;
	leaseSeconds?: number;
	maxAttempts?: number;
	lookupTimeoutMs?: number;
	retryBaseMs?: number;
	ledger?: ReconciliationLedger;
}

export interface AgentRunCostReconciliationSummary {
	claimed: number;
	settled: number;
	retryScheduled: number;
	needsOperator: number;
	leaseConflicts: number;
	errors: number;
}

function finiteNonNegative(value: unknown): number | null {
	const parsed =
		typeof value === 'number'
			? value
			: typeof value === 'string' && value.trim()
				? Number(value)
				: Number.NaN;
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function optionalText(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim().slice(0, 300) : undefined;
}

function tokenTotal(data: OpenRouterGenerationData): number | undefined {
	const nativePrompt = finiteNonNegative(data.native_tokens_prompt);
	const nativeCompletion = finiteNonNegative(data.native_tokens_completion);
	if (nativePrompt !== null && nativeCompletion !== null) {
		return nativePrompt + nativeCompletion;
	}
	const prompt = finiteNonNegative(data.tokens_prompt);
	const completion = finiteNonNegative(data.tokens_completion);
	return prompt !== null && completion !== null ? prompt + completion : undefined;
}

export async function lookupOpenRouterGenerationCost(
	generationId: string,
	options: {
		apiKey: string;
		fetchFn?: typeof fetch;
		timeoutMs?: number;
	}
): Promise<OpenRouterGenerationCost> {
	const id = generationId.trim();
	if (!id || id.length > 300) {
		throw new ProviderCostLookupError('OpenRouter generation id is invalid.', false);
	}
	const apiKey = options.apiKey.trim();
	if (!apiKey) {
		throw new ProviderCostLookupError('OpenRouter API key is unavailable.', false);
	}

	const url = new URL(OPENROUTER_GENERATION_URL);
	url.searchParams.set('id', id);
	let response: Response;
	try {
		response = await (options.fetchFn ?? globalThis.fetch)(url, {
			headers: { Authorization: `Bearer ${apiKey}` },
			signal: AbortSignal.timeout(options.timeoutMs ?? DEFAULT_LOOKUP_TIMEOUT_MS)
		});
	} catch (error) {
		throw new ProviderCostLookupError(
			`OpenRouter generation lookup failed: ${
				error instanceof Error ? error.message : String(error)
			}`,
			true
		);
	}

	if (!response.ok) {
		const retryable =
			response.status === 404 || response.status === 429 || response.status >= 500;
		throw new ProviderCostLookupError(
			`OpenRouter generation lookup returned HTTP ${response.status}.`,
			retryable,
			response.status
		);
	}

	let payload: OpenRouterGenerationResponse;
	try {
		payload = (await response.json()) as OpenRouterGenerationResponse;
	} catch {
		throw new ProviderCostLookupError(
			'OpenRouter generation lookup returned invalid JSON.',
			true
		);
	}
	const data = payload.data;
	const returnedId = optionalText(data?.id);
	const totalCostUsd = finiteNonNegative(data?.total_cost);
	if (!data || returnedId !== id) {
		throw new ProviderCostLookupError(
			'OpenRouter generation lookup returned missing or mismatched generation data.',
			false
		);
	}
	if (totalCostUsd === null) {
		throw new ProviderCostLookupError('OpenRouter generation cost is not available yet.', true);
	}
	const totalTokens = tokenTotal(data);

	return {
		generationId: returnedId,
		totalCostUsd,
		...(totalTokens === undefined ? {} : { totalTokens }),
		...(optionalText(data.model) ? { model: optionalText(data.model) } : {}),
		...(optionalText(data.provider_name)
			? { providerName: optionalText(data.provider_name) }
			: {})
	};
}

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number) {
	return typeof value === 'number' && Number.isInteger(value)
		? Math.min(Math.max(value, min), max)
		: fallback;
}

function boundedDuration(value: number | undefined, fallback: number, min: number, max: number) {
	return typeof value === 'number' && Number.isFinite(value)
		? Math.min(Math.max(value, min), max)
		: fallback;
}

function retryAfter(now: Date, attempt: number, retryBaseMs: number): Date {
	const exponent = Math.max(0, Math.min(attempt - 1, 10));
	return new Date(now.getTime() + Math.min(retryBaseMs * 2 ** exponent, MAX_RETRY_MS));
}

async function markUnresolved(
	entry: AgentRunCostEntry,
	reason: string,
	retryable: boolean,
	params: {
		now: Date;
		maxAttempts: number;
		retryBaseMs: number;
		ledger: ReconciliationLedger;
	}
): Promise<'settled' | 'retry' | 'operator'> {
	const lockToken = entry.reconciliation_lock_token;
	if (!lockToken) {
		throw new AgentRunCostLedgerError(
			`Claimed cost entry ${entry.id} has no reconciliation lease token.`,
			'lease_conflict'
		);
	}
	const shouldRetry = retryable && entry.reconciliation_attempts < params.maxAttempts;
	const released = await params.ledger.release({
		entryId: entry.id,
		lockToken,
		error: reason.slice(0, 4000),
		retryable: shouldRetry,
		...(shouldRetry
			? {
					retryAfter: retryAfter(
						params.now,
						entry.reconciliation_attempts,
						params.retryBaseMs
					)
				}
			: {})
	});
	if (released.status === 'settled' || released.status === 'released') {
		return 'settled';
	}
	return shouldRetry ? 'retry' : 'operator';
}

async function reconcileOne(
	entry: AgentRunCostEntry,
	params: {
		apiKey: string;
		fetchFn: typeof fetch;
		now: Date;
		lookupTimeoutMs: number;
		maxAttempts: number;
		retryBaseMs: number;
		ledger: ReconciliationLedger;
	}
): Promise<'settled' | 'retry' | 'operator' | 'lease_conflict' | 'error'> {
	if (entry.reconciliation_needs_operator_at) return 'operator';
	const lockToken = entry.reconciliation_lock_token;
	if (!lockToken) return 'lease_conflict';

	if (entry.provider !== 'openrouter') {
		try {
			return await markUnresolved(
				entry,
				`Automatic per-request cost lookup is unsupported for provider ${entry.provider}.`,
				false,
				params
			);
		} catch (error) {
			return error instanceof AgentRunCostLedgerError && error.code === 'lease_conflict'
				? 'lease_conflict'
				: 'error';
		}
	}

	if (!entry.provider_request_id) {
		try {
			return await markUnresolved(
				entry,
				'OpenRouter generation id was not captured; authoritative automatic lookup is unavailable.',
				false,
				params
			);
		} catch (error) {
			return error instanceof AgentRunCostLedgerError && error.code === 'lease_conflict'
				? 'lease_conflict'
				: 'error';
		}
	}

	try {
		const providerCost = await lookupOpenRouterGenerationCost(entry.provider_request_id, {
			apiKey: params.apiKey,
			fetchFn: params.fetchFn,
			timeoutMs: params.lookupTimeoutMs
		});
		await params.ledger.reconcile({
			entryId: entry.id,
			lockToken,
			actualCostUsd: providerCost.totalCostUsd,
			actualUnits: providerCost.totalTokens,
			providerRequestId: providerCost.generationId,
			metadata: {
				reconciliation_source: 'openrouter_generation_api',
				reconciled_at: params.now.toISOString(),
				actual_model: providerCost.model ?? null,
				actual_provider: providerCost.providerName ?? null
			}
		});
		return 'settled';
	} catch (error) {
		if (error instanceof AgentRunCostLedgerError && error.code === 'lease_conflict') {
			return 'lease_conflict';
		}
		const lookupError =
			error instanceof ProviderCostLookupError
				? error
				: new ProviderCostLookupError(
						error instanceof Error ? error.message : String(error),
						true
					);
		try {
			return await markUnresolved(entry, lookupError.message, lookupError.retryable, params);
		} catch (releaseError) {
			return releaseError instanceof AgentRunCostLedgerError &&
				releaseError.code === 'lease_conflict'
				? 'lease_conflict'
				: 'error';
		}
	}
}

export async function runAgentRunCostReconciliation(
	options: AgentRunCostReconciliationOptions = {}
): Promise<AgentRunCostReconciliationSummary> {
	const summary: AgentRunCostReconciliationSummary = {
		claimed: 0,
		settled: 0,
		retryScheduled: 0,
		needsOperator: 0,
		leaseConflicts: 0,
		errors: 0
	};
	const apiKey = (options.apiKey ?? process.env.PRIVATE_OPENROUTER_API_KEY ?? '').trim();
	if (!apiKey) {
		throw new Error(
			'Agent Run cost reconciliation requires PRIVATE_OPENROUTER_API_KEY before claiming rows.'
		);
	}

	const now = (options.now ?? (() => new Date()))();
	const staleMs = boundedDuration(options.staleMs, DEFAULT_STALE_MS, 60_000, 24 * 60 * 60 * 1000);
	const requestedBatchSize = boundedInteger(options.batchSize, DEFAULT_BATCH_SIZE, 1, 100);
	const concurrency = boundedInteger(options.concurrency, DEFAULT_CONCURRENCY, 1, 10);
	const maxAttempts = boundedInteger(options.maxAttempts, DEFAULT_MAX_ATTEMPTS, 1, 100);
	const lookupTimeoutMs = boundedDuration(
		options.lookupTimeoutMs,
		DEFAULT_LOOKUP_TIMEOUT_MS,
		1_000,
		60_000
	);
	const requestedLeaseSeconds = boundedInteger(
		options.leaseSeconds,
		DEFAULT_LEASE_SECONDS,
		30,
		900
	);
	const leaseSeconds = Math.min(
		900,
		Math.max(requestedLeaseSeconds, Math.ceil(lookupTimeoutMs / 1000) + 30)
	);
	const leaseProcessingMs = Math.max(lookupTimeoutMs, leaseSeconds * 1000 - 30_000);
	const maxWavesPerLease = Math.max(1, Math.floor(leaseProcessingMs / lookupTimeoutMs));
	const batchSize = Math.min(requestedBatchSize, concurrency * maxWavesPerLease);
	const retryBaseMs = boundedDuration(
		options.retryBaseMs,
		DEFAULT_RETRY_BASE_MS,
		60_000,
		MAX_RETRY_MS
	);
	const ledger = options.ledger ?? {
		claim: claimAgentRunCostReconciliations,
		reconcile: reconcileAgentRunCost,
		release: releaseAgentRunCostReconciliation
	};
	const claimed = await ledger.claim({
		staleBefore: new Date(now.getTime() - staleMs),
		limit: batchSize,
		leaseSeconds,
		maxAttempts
	});
	summary.claimed = claimed.length;

	let cursor = 0;
	const workers = Array.from({ length: Math.min(concurrency, claimed.length) }, async () => {
		while (cursor < claimed.length) {
			const entry = claimed[cursor++];
			const outcome = await reconcileOne(entry, {
				apiKey,
				fetchFn: options.fetchFn ?? globalThis.fetch,
				now,
				lookupTimeoutMs,
				maxAttempts,
				retryBaseMs,
				ledger
			});
			if (outcome === 'settled') summary.settled += 1;
			else if (outcome === 'retry') summary.retryScheduled += 1;
			else if (outcome === 'operator') summary.needsOperator += 1;
			else if (outcome === 'lease_conflict') summary.leaseConflicts += 1;
			else summary.errors += 1;
		}
	});
	await Promise.all(workers);
	return summary;
}

export function agentRunCostReconciliationEnabled(): boolean {
	return process.env.AGENT_RUN_COST_RECONCILIATION_ENABLED === 'true';
}
