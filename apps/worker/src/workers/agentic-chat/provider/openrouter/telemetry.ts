// apps/worker/src/workers/agentic-chat/provider/openrouter/telemetry.ts
// Durable, bounded side writes of a provider call: the `llm_usage_logs` row and
// the provider-attempt execution observation. Neither can alter the turn.
import { performance } from 'node:perf_hooks';
import type { UsageLogger } from '@buildos/smart-llm';
import type { JsonObject } from '@buildos/shared-types';
import {
	type AgenticChatPersistenceTraceSinkV1,
	emitAgenticChatPersistenceTrace,
	persistenceErrorCode
} from '../../effects/persistence-trace';
import {
	type AgenticChatExecutionObservationPortV1,
	createStableAgenticChatExecutionObservationKeyV1
} from '../../effects/execution-observation';
import type { AgenticChatPendingEffectsRegistry } from '../../effects/pending-effects';
import { runWithAbortableDeadline } from '../../shared/abortable-deadline';
import type {
	AgenticChatOpenAiCompatibleRouteV1,
	AgenticChatProviderUsageObservationV1,
	AgenticChatProviderUsageObserverPortV1,
	ClientInput
} from './types';
import { canonicalProviderAttempt, canonicalProviderPassRole } from './canonical';

const PROVIDER_TELEMETRY_TIMEOUT_MS = 5_000;

export type OpenRouterClientPorts = {
	usage: AgenticChatProviderUsageObserverPortV1;
	executionObservations?: AgenticChatExecutionObservationPortV1;
	/** Shared with the executor, which drains a turn's set at finalization. */
	pendingEffects?: Pick<AgenticChatPendingEffectsRegistry, 'forTurn'>;
	onUsageError?: (error: unknown) => void;
	onPersistenceTrace?: AgenticChatPersistenceTraceSinkV1;
	onExecutionObservationError?: (error: unknown) => void;
};

export type ProviderAttemptEventType = 'provider_attempt_started' | 'provider_attempt_ended';

/** Never rejects: usage persistence failures are traced and reported, not raised. */
export async function persistProviderUsage(
	ports: OpenRouterClientPorts,
	observation: AgenticChatProviderUsageObservationV1,
	executionGeneration: number
): Promise<void> {
	const startedAt = performance.now();
	const base = {
		event: 'agentic_chat_persistence_trace' as const,
		lane: 'usage' as const,
		turnRunId: observation.turnRunId,
		executionGeneration,
		operationId: observation.usageLogId,
		rpc: 'llm_usage_logs.upsert',
		passRole: observation.passRole,
		logicalProviderRound: observation.logicalProviderRound,
		attempt: observation.providerAttempt
	};
	const trace = (
		outcome: 'started' | 'persisted' | 'failed' | 'timed_out',
		errorCode: string | null = null
	) =>
		emitAgenticChatPersistenceTrace(ports.onPersistenceTrace, {
			...base,
			stage: outcome === 'started' ? 'attempt_started' : 'attempt_finished',
			observedAt: new Date().toISOString(),
			durationMs: Math.max(0, performance.now() - startedAt),
			outcome,
			errorCode
		});
	const timeoutError = new Error('Agentic Chat provider usage observation timed out');
	trace('started');
	try {
		await runWithAbortableDeadline({
			parentSignal: new AbortController().signal,
			timeoutMs: PROVIDER_TELEMETRY_TIMEOUT_MS,
			createTimeoutError: () => timeoutError,
			run: (signal) => Promise.resolve(ports.usage.observe(observation, signal))
		});
		trace('persisted');
	} catch (error) {
		trace(error === timeoutError ? 'timed_out' : 'failed', persistenceErrorCode(error));
		try {
			ports.onUsageError?.(error);
		} catch {
			// Usage telemetry failures cannot alter the durable turn outcome.
		}
	}
}

/** Never rejects: observation failures are reported, not raised. */
export async function persistProviderAttemptObservation(
	ports: OpenRouterClientPorts,
	input: ClientInput,
	route: AgenticChatOpenAiCompatibleRouteV1,
	eventType: ProviderAttemptEventType,
	payload: JsonObject
): Promise<void> {
	try {
		const providerAttempt = canonicalProviderAttempt(input.providerAttempt);
		const observationSignal = input.signal.aborted
			? new AbortController().signal
			: input.signal;
		await runWithAbortableDeadline({
			parentSignal: observationSignal,
			timeoutMs: PROVIDER_TELEMETRY_TIMEOUT_MS,
			createTimeoutError: () =>
				new Error('Agentic Chat provider execution observation timed out'),
			run: (deadlineSignal) =>
				ports.executionObservations!.observe(
					{
						turnRunId: input.turnRunId,
						queueJobId: input.queueJobId,
						processingToken: input.processingToken,
						userId: input.userId,
						executionGeneration: input.executionGeneration,
						observationKey: createStableAgenticChatExecutionObservationKeyV1({
							turnRunId: input.turnRunId,
							scope:
								`provider:${input.logicalProviderRound}:` +
								`${canonicalProviderPassRole(input.passRole)}:${input.providerRound}:` +
								`${route.id}` +
								(providerAttempt === 1 ? '' : `:attempt:${providerAttempt}`),
							boundary: eventType
						}),
						phase: 'provider',
						eventType,
						payload
					},
					deadlineSignal
				)
		});
	} catch (error) {
		try {
			ports.onExecutionObservationError?.(error);
		} catch {
			// Private observation failures remain bounded and cannot alter the turn.
		}
	}
}

/** Durable usage adapter for the existing `llm_usage_logs` writer. */
export class AgenticChatLlmUsageObserver implements AgenticChatProviderUsageObserverPortV1 {
	constructor(private readonly logger: UsageLogger) {}

	observe(
		observation: AgenticChatProviderUsageObservationV1,
		signal?: AbortSignal
	): Promise<void> {
		return this.logger.logUsageToDatabase(
			{
				id: observation.usageLogId,
				userId: observation.userId,
				operationType: 'agentic_chat_worker_stream',
				modelRequested: observation.modelRequested ?? 'unknown',
				modelUsed: observation.modelUsed ?? observation.modelRequested ?? 'unknown',
				provider: observation.provider ?? undefined,
				promptTokens: observation.promptTokens,
				completionTokens: observation.completionTokens,
				totalTokens: observation.totalTokens,
				inputCost: observation.providerInputCost,
				outputCost: observation.providerOutputCost,
				totalCost: observation.providerCost ?? 0,
				responseTimeMs: Math.max(
					0,
					observation.observedAtMs - observation.requestStartedAtMs
				),
				requestStartedAt: new Date(observation.requestStartedAtMs),
				requestCompletedAt: new Date(observation.observedAtMs),
				status: observation.status === 'success' ? 'success' : 'failure',
				errorMessage: observation.error ?? undefined,
				streaming: true,
				projectId: observation.projectId ?? undefined,
				chatSessionId: observation.sessionId,
				turnRunId: observation.turnRunId,
				streamRunId: observation.streamRunId,
				clientTurnId: observation.clientTurnId,
				openrouterRequestId: observation.requestId ?? undefined,
				openrouterUsageCost: observation.providerCost ?? undefined,
				openrouterCacheStatus: observation.cacheStatus,
				openrouterByok: observation.providerByok,
				openrouterUpstreamInferenceCost: observation.providerUpstreamInferenceCost,
				reasoningTokens: observation.reasoningTokens,
				cachedPromptTokens: observation.cachedPromptTokens,
				cacheWriteTokens: observation.cacheWriteTokens,
				metadata: {
					...(observation.localPromptDump
						? { localPromptDump: observation.localPromptDump }
						: {}),
					contextType: observation.contextType,
					entityId: observation.entityId,
					routeId: observation.routeId,
					logicalProviderRound: observation.logicalProviderRound,
					passRole: observation.passRole,
					providerAttempt: observation.providerAttempt,
					attemptedRouteIds: observation.attemptedRouteIds,
					estimatedUsage: observation.estimated,
					costSource: observation.costSource,
					retryable: observation.retryable,
					providerStatus: observation.status
				}
			},
			signal
		);
	}
}
