// apps/worker/src/workers/agentic-chat/workflow/workflow-dispatch.ts
import { randomUUID } from 'node:crypto';
import {
	AGENTIC_CHAT_WORKFLOW_LIMITS,
	AGENTIC_CHAT_WORKFLOW_MAX_OUTPUT_TOKENS,
	AGENTIC_CHAT_WORKFLOW_MAX_RATES_USD_PER_MILLION,
	type AgenticChatWorkflowDispatchKindV1,
	type AgenticChatWorkflowPricingSnapshotV1,
	type AgenticChatWorkflowStepKeyV1,
	type JsonObject
} from '@buildos/shared-types';
import {
	AgenticChatProviderDispatchDeniedError,
	type AgenticChatProviderDispatchGateV1,
	type AgenticChatProviderDispatchPermitV1,
	type AgenticChatProviderDispatchReceiptV1,
	type AgenticChatProviderDispatchRequestV1,
	type AgenticChatProviderDispatchUsageV1
} from '../provider/contracts';
import type { AgenticChatWorkflowFenceV1, AgenticChatWorkflowStorePortV1 } from './workflow-store';

/**
 * Tasker 87 slice B: the cost adapter behind the provider client's physical dispatch
 * hook. Every BuildOS-to-provider HTTP request (planner, specialist, compact retry,
 * editor, and route fallback) reserves budget in the chat-owned ledger, receives a
 * one-time permit, and settles by its token. This writes no model-usage or cost-entry
 * receipt: the client's existing usage observer stays the single usage record, and
 * the ledger is exposure accounting against the workflow's persisted spend cap.
 */

/**
 * Frozen maximum admitted rates (contract section 4). A model outside this table is
 * `pricing_unavailable` and cannot dispatch; changing it requires a new policy version.
 */
export const AGENTIC_CHAT_WORKFLOW_PRICING_SNAPSHOTS_V1: Readonly<
	Record<string, AgenticChatWorkflowPricingSnapshotV1>
> = Object.freeze({
	'deepseek/deepseek-v4.1-flash': Object.freeze({
		version: 'agentic_chat_workflow_pricing_v1',
		model: 'deepseek/deepseek-v4.1-flash',
		canonicalModel: 'deepseek/deepseek-v4.1-flash-20260910',
		promptUsdPerMillion: '0.30',
		completionUsdPerMillion: '1.20',
		cacheReadUsdPerMillion: '0.006',
		requestUsd: '0',
		source: 'openrouter_models_api',
		observedAt: '2026-09-12T00:00:00Z'
	})
});

/** The workflow's primary model; every request is priced by a frozen snapshot. */
export const AGENTIC_CHAT_WORKFLOW_PRIMARY_MODEL_V1 = 'deepseek/deepseek-v4.1-flash';
/** Provider-internal fallback models inside the same request; each must be priced. */
export const AGENTIC_CHAT_WORKFLOW_FALLBACK_MODELS_V1: readonly string[] = Object.freeze([]);
/** Contract section 3: one physical request may run 90 s, with a 10 s header wait. */
export const AGENTIC_CHAT_WORKFLOW_REQUEST_TIMEOUT_MS = 90_000;
export const AGENTIC_CHAT_WORKFLOW_RESPONSE_HEADERS_TIMEOUT_MS = 10_000;

/**
 * Workflow routes reuse the configured OpenRouter credential and provider policy but
 * pin the priced workflow models, so no request can reach an unpriced model. Startup
 * fails closed if the configuration cannot satisfy that.
 */
export function buildAgenticChatWorkflowRoutesV1<
	Route extends { id: string; kind: string; model: string; fallbackModels?: readonly string[] }
>(
	routes: readonly Route[],
	pricing: Readonly<
		Record<string, AgenticChatWorkflowPricingSnapshotV1>
	> = AGENTIC_CHAT_WORKFLOW_PRICING_SNAPSHOTS_V1
): Route[] {
	const openrouter = routes.find((route) => route.kind === 'openrouter');
	if (!openrouter) {
		throw new Error('Workflow execution requires an OpenRouter route for provider max_price');
	}
	const models = [
		AGENTIC_CHAT_WORKFLOW_PRIMARY_MODEL_V1,
		...AGENTIC_CHAT_WORKFLOW_FALLBACK_MODELS_V1
	];
	const unpriced = models.filter((model) => !pricing[model]);
	if (unpriced.length) {
		throw new Error(`Workflow models lack frozen pricing snapshots: ${unpriced.join(', ')}`);
	}
	return [
		{
			...openrouter,
			id: `${openrouter.id}-workflow`,
			model: AGENTIC_CHAT_WORKFLOW_PRIMARY_MODEL_V1,
			fallbackModels: [...AGENTIC_CHAT_WORKFLOW_FALLBACK_MODELS_V1]
		}
	];
}

/** OpenRouter `provider.max_price` sent on every workflow request. */
export const AGENTIC_CHAT_WORKFLOW_PROVIDER_MAX_PRICE_V1 = Object.freeze({
	prompt: AGENTIC_CHAT_WORKFLOW_MAX_RATES_USD_PER_MILLION.prompt,
	completion: AGENTIC_CHAT_WORKFLOW_MAX_RATES_USD_PER_MILLION.completion,
	request: 0
});

/** The client's attempt-timeout floor; a shorter window cannot preserve finalization. */
export const AGENTIC_CHAT_WORKFLOW_MIN_DISPATCH_WINDOW_MS = 5_000;

export type AgenticChatWorkflowDispatchDenialCodeV1 =
	| 'pricing_unavailable'
	| 'request_too_large'
	| 'dispatch_limit'
	| 'deadline_expired'
	| 'budget_exhausted'
	| 'synthesis_headroom_required'
	| 'reservation_conflict'
	| 'reservation_required'
	| 'stale_claim'
	| 'dispatch_permit_lost'
	| 'dispatch_store_unavailable'
	| 'stale_generation'
	| 'ownership_lost'
	| 'cancel_requested'
	| 'already_terminal';

export const AGENTIC_CHAT_WORKFLOW_FENCED_DENIALS: ReadonlySet<string> = new Set([
	'stale_generation',
	'ownership_lost',
	'cancel_requested',
	'already_terminal'
]);

export type AgenticChatWorkflowLedgerEventV1 =
	| 'reserved'
	| 'dispatching'
	| 'denied'
	| 'settled'
	| 'uncertain'
	| 'released'
	| 'settlement_conflict'
	| 'settlement_unavailable';

/** Local receipt of one ledger transition, for diagnostics and the handoff ledger. */
export type AgenticChatWorkflowLedgerEntryV1 = {
	event: AgenticChatWorkflowLedgerEventV1;
	dispatchId: string | null;
	stepKey: AgenticChatWorkflowStepKeyV1;
	stepAttemptId: string;
	physicalAttempt: number;
	kind: AgenticChatWorkflowDispatchKindV1;
	model: string;
	reservedMicroUsd: number | null;
	actualMicroUsd: number | null;
	detail: string | null;
	atMs: number;
};

type SettlementOutcome = 'settled' | 'uncertain' | 'released';

export type AgenticChatWorkflowDispatchMeterOptionsV1 = {
	now?: () => number;
	ids?: () => string;
	pricing?: Readonly<Record<string, AgenticChatWorkflowPricingSnapshotV1>>;
	/** Bounded retries for a lost settlement response; settlement is idempotent by token. */
	settleAttempts?: number;
	settleRetryDelayMs?: number;
	onLedger?: (entry: AgenticChatWorkflowLedgerEntryV1) => void;
};

/** Converts a provider receipt into an integer micro-USD charge, rounded up. */
export function computeAgenticChatWorkflowActualMicroUsdV1(
	usage: AgenticChatProviderDispatchUsageV1,
	pricing: AgenticChatWorkflowPricingSnapshotV1
): number {
	if (usage.costUsd !== null && Number.isFinite(usage.costUsd) && usage.costUsd >= 0) {
		// Round to picodollars first so binary noise cannot add a spurious micro-USD.
		return Math.ceil(Math.round(usage.costUsd * 1e12) / 1e6);
	}
	// No provider cost: charge the actual tokens at the admitted maximum rates.
	const prompt = Number(pricing.promptUsdPerMillion);
	const completion = Number(pricing.completionUsdPerMillion);
	const micro = usage.promptTokens * prompt + usage.completionTokens * completion;
	return Math.ceil(Math.round(micro * 1e6) / 1e6);
}

/**
 * One meter per workflow invocation. It owns the dispatch ids, the settlement promises
 * that must drain before terminal truth, and the local ledger receipt.
 */
export class AgenticChatWorkflowDispatchMeter {
	private readonly pending = new Set<Promise<void>>();
	private readonly entries: AgenticChatWorkflowLedgerEntryV1[] = [];
	private readonly now: () => number;
	private readonly ids: () => string;
	private readonly pricing: Readonly<Record<string, AgenticChatWorkflowPricingSnapshotV1>>;
	private readonly settleAttempts: number;
	private readonly settleRetryDelayMs: number;

	constructor(
		private readonly store: Pick<
			AgenticChatWorkflowStorePortV1,
			'reserveDispatch' | 'beginDispatch' | 'settleDispatch'
		>,
		private readonly fence: AgenticChatWorkflowFenceV1,
		private readonly options: AgenticChatWorkflowDispatchMeterOptionsV1 = {}
	) {
		this.now = options.now ?? Date.now;
		this.ids = options.ids ?? randomUUID;
		this.pricing = options.pricing ?? AGENTIC_CHAT_WORKFLOW_PRICING_SNAPSHOTS_V1;
		this.settleAttempts = options.settleAttempts ?? 3;
		this.settleRetryDelayMs = options.settleRetryDelayMs ?? 50;
	}

	/** A gate for one claimed step attempt; at most two physical requests per attempt. */
	forStepAttempt(input: {
		stepKey: AgenticChatWorkflowStepKeyV1;
		stepAttemptId: string;
		firstKind: Extract<
			AgenticChatWorkflowDispatchKindV1,
			'planner' | 'specialist' | 'editor' | 'corrective'
		>;
		/** Latest instant a physical request may still run (finalization already held). */
		boundaryAtMs: () => number;
	}): AgenticChatWorkflowStepDispatchGate {
		return new AgenticChatWorkflowStepDispatchGate(this, input);
	}

	get ledger(): readonly AgenticChatWorkflowLedgerEntryV1[] {
		return this.entries;
	}

	/** Waits for settlements already started; returns false if the bound elapsed first. */
	async drain(timeoutMs: number): Promise<boolean> {
		if (!this.pending.size) return true;
		let timer: NodeJS.Timeout | undefined;
		try {
			return await Promise.race([
				Promise.allSettled([...this.pending]).then(() => true),
				new Promise<boolean>((resolve) => {
					timer = setTimeout(() => resolve(false), timeoutMs);
				})
			]);
		} finally {
			if (timer) clearTimeout(timer);
		}
	}

	/** @internal */
	record(entry: Omit<AgenticChatWorkflowLedgerEntryV1, 'atMs'>): void {
		const complete = { ...entry, atMs: this.now() };
		this.entries.push(complete);
		try {
			this.options.onLedger?.(complete);
		} catch {
			// Ledger telemetry cannot alter a dispatch decision.
		}
	}

	/** @internal */
	async admit(
		gate: AgenticChatWorkflowStepDispatchGate,
		request: AgenticChatProviderDispatchRequestV1,
		signal: AbortSignal
	): Promise<AgenticChatProviderDispatchPermitV1> {
		signal.throwIfAborted();
		const physicalAttempt = gate.nextPhysicalAttempt();
		const kind: AgenticChatWorkflowDispatchKindV1 =
			physicalAttempt === 1 ? gate.firstKind : 'provider_fallback';
		const base = {
			stepKey: gate.stepKey,
			stepAttemptId: gate.stepAttemptId,
			physicalAttempt,
			kind,
			model: request.model
		};
		const deny = (
			code: AgenticChatWorkflowDispatchDenialCodeV1,
			detail: string,
			dispatchId: string | null = null
		): never => {
			gate.lastDenial = { code, detail };
			this.record({
				...base,
				event: 'denied',
				dispatchId,
				reservedMicroUsd: null,
				actualMicroUsd: null,
				detail: code
			});
			throw new AgenticChatProviderDispatchDeniedError(
				code,
				`Workflow dispatch denied (${code}): ${detail}`
			);
		};

		if (physicalAttempt > AGENTIC_CHAT_WORKFLOW_LIMITS.physicalAttemptsPerStepAttempt) {
			return deny('dispatch_limit', 'this step attempt already used its physical requests');
		}
		const pricing = this.pricing[request.model];
		if (
			request.routeKind !== 'openrouter' ||
			!pricing ||
			request.fallbackModels.some((model) => !this.pricing[model])
		) {
			return deny(
				'pricing_unavailable',
				'every model in the request needs a frozen pricing snapshot and an OpenRouter max price'
			);
		}
		if (
			!Number.isSafeInteger(request.serializedRequestBytes) ||
			request.serializedRequestBytes < 1 ||
			request.serializedRequestBytes > AGENTIC_CHAT_WORKFLOW_LIMITS.serializedRequestMaxBytes
		) {
			return deny('request_too_large', 'the serialized request exceeds its byte bound');
		}
		if (
			!Number.isSafeInteger(request.maxOutputTokens) ||
			request.maxOutputTokens < 1 ||
			request.maxOutputTokens > AGENTIC_CHAT_WORKFLOW_MAX_OUTPUT_TOKENS[gate.stepKey]
		) {
			return deny('request_too_large', 'the output ceiling exceeds this step’s limit');
		}
		if (gate.boundaryAtMs() - this.now() < AGENTIC_CHAT_WORKFLOW_MIN_DISPATCH_WINDOW_MS) {
			return deny('deadline_expired', 'too little time remains to preserve finalization');
		}

		const dispatchId = this.ids();
		const reserveInput = {
			dispatchId,
			stepKey: gate.stepKey,
			stepAttemptId: gate.stepAttemptId,
			physicalAttempt,
			kind,
			modelRequested: request.model,
			pricing,
			serializedRequestBytes: request.serializedRequestBytes,
			maxOutputTokens: request.maxOutputTokens
		};
		// A lost reservation response is safe to replay: the same dispatch id returns
		// `already_reserved` with its settlement token, and no network call follows yet.
		let reserve;
		try {
			reserve = await retryOnce(() => this.store.reserveDispatch(this.fence, reserveInput));
		} catch (error) {
			return deny('dispatch_store_unavailable', errorText(error), dispatchId);
		}
		if (reserve.outcome !== 'reserved' && reserve.outcome !== 'already_reserved') {
			return deny(
				reserve.outcome as AgenticChatWorkflowDispatchDenialCodeV1,
				'reservation refused',
				dispatchId
			);
		}
		const settlementToken = reserve.settlementToken;
		if (!settlementToken) {
			return deny(
				'dispatch_store_unavailable',
				'reservation returned no settlement token',
				dispatchId
			);
		}
		const reservedMicroUsd = reserve.reservedMicroUsd;
		this.record({
			...base,
			event: 'reserved',
			dispatchId,
			reservedMicroUsd,
			actualMicroUsd: null,
			detail: reserve.outcome
		});

		// Begin grants the only permit. A committed begin whose response was lost
		// replays as `already_started`: that exposure is held, and no second permit exists.
		let begin;
		try {
			begin = await retryOnce(() => this.store.beginDispatch(this.fence, { dispatchId }));
		} catch (error) {
			// Unknown: the row is reserved or dispatching. Recovery or the terminal trigger
			// releases a reserved row and holds a dispatching one as uncertain.
			return deny('dispatch_store_unavailable', errorText(error), dispatchId);
		}
		const settlement = { dispatchId, settlementToken, reservedMicroUsd, pricing, base };
		if (begin.outcome === 'already_started') {
			this.settle(settlement, 'uncertain', null, null, 'dispatch_permit_lost');
			return deny(
				'dispatch_permit_lost',
				'a dispatch permit was granted but its receipt was lost',
				dispatchId
			);
		}
		if (begin.outcome !== 'dispatching' || !begin.dispatchPermitted) {
			// Nothing was sent: return the unused reservation.
			this.settle(settlement, 'released', null, null, begin.outcome);
			return deny(
				begin.outcome as AgenticChatWorkflowDispatchDenialCodeV1,
				'dispatch start refused',
				dispatchId
			);
		}
		this.record({
			...base,
			event: 'dispatching',
			dispatchId,
			reservedMicroUsd,
			actualMicroUsd: null,
			detail: null
		});
		gate.dispatches += 1;

		let used = false;
		return {
			settle: (receipt: AgenticChatProviderDispatchReceiptV1) => {
				if (used) return;
				used = true;
				if (receipt.usage) {
					this.settle(
						settlement,
						'settled',
						receipt,
						computeAgenticChatWorkflowActualMicroUsdV1(receipt.usage, pricing),
						'provider_usage'
					);
				} else if (receipt.kind === 'provider_error_response') {
					this.settle(settlement, 'settled', receipt, 0, `http_${receipt.httpStatus}`);
				} else {
					// The request may have crossed the provider boundary; only provider-backed
					// reconciliation may release this exposure.
					this.settle(settlement, 'uncertain', receipt, null, receipt.kind);
				}
			}
		};
	}

	private settle(
		settlement: {
			dispatchId: string;
			settlementToken: string;
			reservedMicroUsd: number | null;
			pricing: AgenticChatWorkflowPricingSnapshotV1;
			base: Omit<
				AgenticChatWorkflowLedgerEntryV1,
				'event' | 'dispatchId' | 'reservedMicroUsd' | 'actualMicroUsd' | 'detail' | 'atMs'
			>;
		},
		outcome: SettlementOutcome,
		receipt: AgenticChatProviderDispatchReceiptV1 | null,
		actualMicroUsd: number | null,
		detail: string
	): void {
		const providerUsage: JsonObject | null = receipt?.usage
			? {
					prompt_tokens: receipt.usage.promptTokens,
					completion_tokens: receipt.usage.completionTokens,
					total_tokens: receipt.usage.totalTokens,
					reasoning_tokens: receipt.usage.reasoningTokens,
					cached_prompt_tokens: receipt.usage.cachedPromptTokens,
					cost_usd: receipt.usage.costUsd,
					model_used: receipt.usage.modelUsed,
					http_status: receipt.httpStatus
				}
			: receipt?.httpStatus
				? { http_status: receipt.httpStatus }
				: null;
		const work = (async () => {
			for (let attempt = 1; attempt <= this.settleAttempts; attempt += 1) {
				try {
					const result = await this.store.settleDispatch({
						dispatchId: settlement.dispatchId,
						settlementToken: settlement.settlementToken,
						providerRequestId: receipt?.requestId?.slice(0, 512) ?? null,
						providerUsage,
						actualMicroUsd: outcome === 'settled' ? actualMicroUsd : null,
						outcome
					});
					this.record({
						...settlement.base,
						event:
							result.outcome === 'settlement_conflict' ||
							result.outcome === 'unknown_dispatch'
								? 'settlement_conflict'
								: outcome,
						dispatchId: settlement.dispatchId,
						reservedMicroUsd: settlement.reservedMicroUsd,
						actualMicroUsd: result.actualMicroUsd ?? actualMicroUsd,
						detail: `${detail}:${result.outcome}`
					});
					return;
				} catch (error) {
					if (attempt === this.settleAttempts) {
						// Still `dispatching` durably: recovery or the terminal trigger marks it
						// uncertain, so the exposure remains held.
						this.record({
							...settlement.base,
							event: 'settlement_unavailable',
							dispatchId: settlement.dispatchId,
							reservedMicroUsd: settlement.reservedMicroUsd,
							actualMicroUsd,
							detail: errorText(error)
						});
						return;
					}
					await new Promise((resolve) =>
						setTimeout(resolve, this.settleRetryDelayMs * 2 ** (attempt - 1))
					);
				}
			}
		})();
		this.pending.add(work);
		void work.finally(() => this.pending.delete(work));
	}
}

/** The dispatch hook handed to the provider client for one step attempt. */
export class AgenticChatWorkflowStepDispatchGate implements AgenticChatProviderDispatchGateV1 {
	readonly providerMaxPrice = AGENTIC_CHAT_WORKFLOW_PROVIDER_MAX_PRICE_V1;
	readonly stepKey: AgenticChatWorkflowStepKeyV1;
	readonly stepAttemptId: string;
	readonly firstKind: AgenticChatWorkflowDispatchKindV1;
	readonly boundaryAtMs: () => number;
	lastDenial: { code: AgenticChatWorkflowDispatchDenialCodeV1; detail: string } | null = null;
	/** Physical requests that received a permit. */
	dispatches = 0;
	private physicalAttempts = 0;

	constructor(
		private readonly meter: AgenticChatWorkflowDispatchMeter,
		input: Parameters<AgenticChatWorkflowDispatchMeter['forStepAttempt']>[0]
	) {
		this.stepKey = input.stepKey;
		this.stepAttemptId = input.stepAttemptId;
		this.firstKind = input.firstKind;
		this.boundaryAtMs = input.boundaryAtMs;
	}

	admit(
		request: AgenticChatProviderDispatchRequestV1,
		signal: AbortSignal
	): Promise<AgenticChatProviderDispatchPermitV1> {
		return this.meter.admit(this, request, signal);
	}

	/** @internal */
	nextPhysicalAttempt(): number {
		this.physicalAttempts += 1;
		return this.physicalAttempts;
	}
}

async function retryOnce<T>(operation: () => Promise<T>): Promise<T> {
	try {
		return await operation();
	} catch {
		return await operation();
	}
}

function errorText(error: unknown): string {
	return (error instanceof Error ? error.message : String(error)).slice(0, 500);
}
