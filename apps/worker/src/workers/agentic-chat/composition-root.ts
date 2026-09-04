// apps/worker/src/workers/agentic-chat/composition-root.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import type { WebResearchPort } from '@buildos/shared-agent-ops';
import { createAgentRunWebResearchPort } from '../agent-run/webResearchPort';
import type { AgenticChatQueueAgeClient } from './capacity';
import {
	AgenticChatWorkerCapacityCollector,
	SupabaseAgenticChatReadyQueueAgeAdapter
} from './capacity';
import {
	AgenticChatCancellationObserver,
	type AgenticChatCancellationObserverConfig
} from './cancellationObserver';
import {
	type AgenticChatConsumerConfig,
	DEFAULT_AGENTIC_CHAT_CONSUMER_CONFIG,
	createAgenticChatConsumer,
	validateAgenticChatConsumerConfig,
	validateAgenticChatDrainTimeout
} from './consumer';
import { AgenticChatConsumerRuntime } from './consumerRuntime';
import {
	type AgenticChatExecutionRpcClient,
	SupabaseAgenticChatExecutionControlAdapter
} from './executionControl';
import {
	type AgenticChatEffectRpcClient,
	SupabaseAgenticChatEffectControlAdapter
} from './effectControl';
import { SupabaseAgenticChatExecutionInputAdapter } from './executionInput';
import { AgenticChatMutationExecutor } from './mutation-executor';
import { AgenticChatTurnExecutor } from './turn-executor';
import {
	AgenticChatProviderExecutionError,
	type AgenticChatProviderPortV1,
	type AgenticChatTurnProviderClientPortV1
} from './provider/contracts';
import { AgenticChatProviderCapacity } from './providerCapacity';
import {
	type AgenticChatPromptSnapshotPortV1,
	type AgenticChatPromptSnapshotRpcClient,
	SupabaseAgenticChatPromptSnapshotAdapter
} from './promptSnapshot';
import { AgenticChatTurnProviderAdapter } from './provider/turn-provider';
import { AgenticChatToolExecutionAdapter } from './tools/execution-adapter';
import {
	type AgenticChatCalendarWritePortV1,
	createWorkerAgenticChatCalendarWritePort
} from './tools/calendar-write-port';
import {
	type AgenticChatRecoverySnapshotRpcClient,
	SupabaseAgenticChatRecoverySnapshotAdapter
} from './recoverySnapshot';
import {
	type AgenticChatStalledReadClient,
	type AgenticChatStalledRecoveryReportV1,
	AgenticChatStalledRecoverySweep,
	SupabaseAgenticChatStalledCandidateSource
} from './stalledRecovery';
import { type AgenticChatPublisherConfig, AgenticChatStreamPublisher } from './streamPublisher';
import { SupabaseAgenticChatCancellationObservationAdapter } from './supabaseCancellationObserverAdapter';
import {
	type AgenticChatRealtimeClient,
	type AgenticChatSupabaseRpcClient,
	SupabaseAgenticChatBroadcastAdapter,
	SupabaseAgenticChatPersistenceAdapter
} from './supabaseStreamPublisherAdapters';
import {
	type AgenticChatToolExecutionPortV1,
	type AgenticChatToolExecutionRpcClient,
	SupabaseAgenticChatToolExecutionAdapter
} from './toolExecution';
import {
	type AgenticChatExecutionObservationPortV1,
	type AgenticChatExecutionObservationRpcClient,
	SupabaseAgenticChatExecutionObservationAdapter
} from './executionObservation';
import { AgenticChatCreateOntoProjectMutationAdapter } from './createOntoProjectMutationAdapter';
import { AgenticChatDelegateTaskMutationAdapter } from './delegateTaskMutationAdapter';
import {
	type AgenticChatMutationAdapterEntry,
	AgenticChatMutationAdapterRouter,
	selectAgenticChatMutationAdapterEntriesV1
} from './mutationAdapterRouter';
import {
	AGENTIC_CHAT_MUTATION_CAPABILITY_TOOLS_V1,
	type AgenticChatProviderMutationCapabilitiesV1,
	normalizeAgenticChatMutationCapabilitiesV1
} from './mutationToolCatalog';
import { AgenticChatTableMutationAdapter } from './tableMutationAdapter';
import { SupabaseAgenticChatLiveVisionResolver } from './liveVision';
import {
	type AgenticChatSessionHandoffPortV1,
	type AgenticChatSessionHandoffRpcClient,
	SupabaseAgenticChatSessionHandoffAdapter
} from './sessionHandoff';
import {
	type AgenticChatResearchCapturePortV1,
	type AgenticChatResearchCaptureRpcClient,
	SupabaseAgenticChatResearchCaptureAdapter
} from './researchCapture';
import {
	type AgenticChatStatedFutureCapturePortV1,
	type AgenticChatStatedFutureCaptureRpcClient,
	SupabaseAgenticChatStatedFutureCaptureAdapter
} from './statedFutureCapture';
import {
	type AgenticChatConsumptionBillingPortV1,
	type AgenticChatConsumptionBillingRpcClient,
	SupabaseAgenticChatConsumptionBillingAdapter
} from './consumptionBilling';
import type {
	AgenticChatRuntimeTimingObserverV1,
	AgenticChatRuntimeTimingSnapshotV1
} from './runtimeTiming';

export type AgenticChatCompositionRoot = {
	consumer: ReturnType<typeof createAgenticChatConsumer>;
	runtime: AgenticChatConsumerRuntime;
	executor: AgenticChatTurnExecutor;
	provider: AgenticChatProviderPortV1;
	providerCapacity: AgenticChatProviderCapacity;
	promptSnapshots: AgenticChatPromptSnapshotPortV1;
	toolExecutions: AgenticChatToolExecutionPortV1;
	executionObservations: AgenticChatExecutionObservationPortV1;
	sessionHandoff: AgenticChatSessionHandoffPortV1;
	researchCapture: AgenticChatResearchCapturePortV1;
	statedFutureCapture: AgenticChatStatedFutureCapturePortV1;
	consumptionBilling: AgenticChatConsumptionBillingPortV1 | null;
	publisher: AgenticChatStreamPublisher;
	cancellation: AgenticChatCancellationObserver;
	recovery: AgenticChatStalledRecoverySweep;
	capacity: AgenticChatWorkerCapacityCollector;
};

export function assertAgenticChatMutationAdapterCoverageV1(
	capabilities: AgenticChatProviderMutationCapabilitiesV1,
	entries: ReadonlyArray<AgenticChatMutationAdapterEntry>
): void {
	const expectedToolNames = AGENTIC_CHAT_MUTATION_CAPABILITY_TOOLS_V1.filter(
		([capability]) => capabilities[capability]
	)
		.map(([, toolName]) => toolName)
		.sort();
	const installedToolNames = entries.map(([toolName]) => toolName).sort();
	const installed = new Set(installedToolNames);
	const expected = new Set(expectedToolNames);
	const duplicates = installedToolNames.filter(
		(toolName, index) => installedToolNames.indexOf(toolName) !== index
	);
	const missing = expectedToolNames.filter((toolName) => !installed.has(toolName));
	const unexpected = installedToolNames.filter((toolName) => !expected.has(toolName));

	if (duplicates.length > 0 || missing.length > 0 || unexpected.length > 0) {
		throw new Error(
			`Agentic Chat mutation adapter coverage mismatch: duplicate=${[...new Set(duplicates)].join(',') || 'none'}; missing=${missing.join(',') || 'none'}; unexpected=${unexpected.join(',') || 'none'}`
		);
	}
}

/**
 * Compose the hosted Agentic Chat worker without starting it. The caller
 * must still explicitly start `runtime`; this module is intentionally absent
 * from production entrypoints and cannot open web routing by itself.
 */
export function createAgenticChatCompositionRoot(options: {
	client: SupabaseClient<Database>;
	providerClient: AgenticChatTurnProviderClientPortV1;
	semanticReviewerClient?: AgenticChatTurnProviderClientPortV1;
	providerConfigured: boolean;
	/** Separate default-off gate for ephemeral current-turn image resolution. */
	liveVisionEnabled?: boolean;
	/** Shared default-off gate for terminal consumption-billing re-evaluation. */
	consumptionBillingEnabled?: boolean;
	liveVisionFetchImpl?: typeof fetch;
	consumerConfig?: Partial<AgenticChatConsumerConfig>;
	publisherConfig?: Partial<AgenticChatPublisherConfig>;
	cancellationConfig?: Partial<AgenticChatCancellationObserverConfig>;
	providerCooldownMs?: number;
	providerBudgetMs?: number;
	maxProviderRounds?: number;
	maxToolCalls?: number;
	maxToolConcurrency?: number;
	concurrentReadsEnabled?: boolean;
	concurrentMutationsEnabled?: boolean;
	/** Injectable for tests; production reuses the worker's SSRF-safe native web port. */
	webResearch?: WebResearchPort;
	/**
	 * Injectable for tests. Production composes the source-aware Google Calendar
	 * services, `OntoEventSyncService` and the shared project-calendar service
	 * per execution inside the port — never at boot and never cached across
	 * turns — so a worker deployed without the Calendar OAuth env still starts
	 * and a calendar write reports `not_configured` as structured data.
	 */
	calendarWrites?: AgenticChatCalendarWritePortV1;
	/**
	 * One surface controls both provider advertisement and installed adapters.
	 * Production passes the complete reviewed catalog; partial maps remain useful
	 * for isolated assembly tests without permitting the two sides to drift.
	 */
	mutationCapabilities?: Partial<AgenticChatProviderMutationCapabilitiesV1>;
	onPromptSnapshotError?: (error: unknown) => void;
	onExecutionObservationError?: (error: unknown) => void;
	onResearchCaptureError?: (error: unknown) => void;
	onStatedFutureCaptureError?: (error: unknown) => void;
	onConsumptionBillingError?: (error: unknown) => void;
	/** Injectable telemetry sink; production emits one bounded structured span summary per turn. */
	onTimingSnapshot?: AgenticChatRuntimeTimingObserverV1;
}): AgenticChatCompositionRoot {
	const consumerConfig: AgenticChatConsumerConfig = {
		...DEFAULT_AGENTIC_CHAT_CONSUMER_CONFIG,
		...options.consumerConfig
	};
	validateAgenticChatConsumerConfig(consumerConfig);
	validateAgenticChatDrainTimeout(consumerConfig.drainTimeoutMs);
	if (
		options.cancellationConfig?.consumerConcurrency !== undefined &&
		options.cancellationConfig.consumerConcurrency !== consumerConfig.concurrency
	) {
		throw new Error('Agentic Chat cancellation concurrency must match CHAT_CONCURRENCY');
	}
	const mutationCapabilities = normalizeAgenticChatMutationCapabilitiesV1(
		options.mutationCapabilities
	);
	if (Object.values(mutationCapabilities).some(Boolean) && !options.semanticReviewerClient) {
		throw new Error(
			'Agentic Chat mutation provider capabilities require an independent semantic reviewer client'
		);
	}
	const rpcClient = options.client as unknown as AgenticChatExecutionRpcClient &
		AgenticChatEffectRpcClient &
		AgenticChatSupabaseRpcClient &
		AgenticChatRecoverySnapshotRpcClient &
		AgenticChatPromptSnapshotRpcClient &
		AgenticChatToolExecutionRpcClient &
		AgenticChatExecutionObservationRpcClient &
		AgenticChatSessionHandoffRpcClient &
		AgenticChatResearchCaptureRpcClient &
		AgenticChatStatedFutureCaptureRpcClient &
		AgenticChatConsumptionBillingRpcClient;
	const control = new SupabaseAgenticChatExecutionControlAdapter(rpcClient);
	const effectControl = new SupabaseAgenticChatEffectControlAdapter(rpcClient);
	const promptSnapshots = new SupabaseAgenticChatPromptSnapshotAdapter(rpcClient);
	const toolExecutions = new SupabaseAgenticChatToolExecutionAdapter(rpcClient);
	const executionObservations = new SupabaseAgenticChatExecutionObservationAdapter(rpcClient);
	const sessionHandoff = new SupabaseAgenticChatSessionHandoffAdapter(rpcClient);
	const researchCapture = new SupabaseAgenticChatResearchCaptureAdapter(rpcClient);
	const statedFutureCapture = new SupabaseAgenticChatStatedFutureCaptureAdapter(
		rpcClient,
		effectControl
	);
	const consumptionBilling = options.consumptionBillingEnabled
		? new SupabaseAgenticChatConsumptionBillingAdapter(rpcClient)
		: null;
	const liveVision = options.liveVisionEnabled
		? new SupabaseAgenticChatLiveVisionResolver({
				client: options.client,
				observations: executionObservations,
				fetchImpl: options.liveVisionFetchImpl
			})
		: undefined;
	const input = new SupabaseAgenticChatExecutionInputAdapter(options.client);
	const broadcast = new SupabaseAgenticChatBroadcastAdapter(
		options.client as unknown as AgenticChatRealtimeClient
	);
	const publisher = new AgenticChatStreamPublisher(
		{
			persistence: new SupabaseAgenticChatPersistenceAdapter(rpcClient),
			broadcast
		},
		options.publisherConfig
	);
	const cancellation = new AgenticChatCancellationObserver(
		{
			observation: new SupabaseAgenticChatCancellationObservationAdapter(rpcClient)
		},
		{ ...options.cancellationConfig, consumerConcurrency: consumerConfig.concurrency }
	);
	const providerCapacity = new AgenticChatProviderCapacity({
		configured: options.providerConfigured,
		concurrency: consumerConfig.concurrency
	});
	const provider = new AgenticChatTurnProviderAdapter(
		{
			client: options.providerClient,
			semanticReviewer: options.semanticReviewerClient,
			capacity: providerCapacity,
			liveVision
		},
		options.providerCooldownMs,
		options.maxProviderRounds,
		mutationCapabilities
	);
	const readTool = new AgenticChatToolExecutionAdapter(options.client, {
		webResearch: options.webResearch ?? createAgentRunWebResearchPort()
	});
	const calendarWrites =
		options.calendarWrites ??
		createWorkerAgenticChatCalendarWritePort({ client: options.client });
	const mutationAdapters: AgenticChatMutationAdapterEntry[] =
		selectAgenticChatMutationAdapterEntriesV1({
			capabilities: mutationCapabilities,
			tableAdapter: () =>
				new AgenticChatTableMutationAdapter(options.client, { calendarWrites }),
			customAdapters: {
				create_onto_project: () =>
					new AgenticChatCreateOntoProjectMutationAdapter(options.client),
				delegate_task: () => new AgenticChatDelegateTaskMutationAdapter(options.client)
			}
		});
	assertAgenticChatMutationAdapterCoverageV1(mutationCapabilities, mutationAdapters);
	const mutation =
		mutationAdapters.length > 0
			? new AgenticChatMutationExecutor({
					control: effectControl,
					mutatingTool: new AgenticChatMutationAdapterRouter(mutationAdapters)
				})
			: disabledToolPort('mutating_tools_disabled');
	const executor = new AgenticChatTurnExecutor(
		{
			control,
			input,
			publisher,
			cancellation,
			provider,
			promptSnapshots,
			executionObservations,
			onPromptSnapshotError:
				options.onPromptSnapshotError ??
				((error) =>
					console.error('Agentic Chat prompt snapshot persistence failed', error)),
			onExecutionObservationError:
				options.onExecutionObservationError ??
				((error) => console.error('Agentic Chat execution observation failed', error)),
			onResearchCaptureError:
				options.onResearchCaptureError ??
				((error) => console.error('Agentic Chat research capture failed', error)),
			onStatedFutureCaptureError:
				options.onStatedFutureCaptureError ??
				((error) => console.error('Agentic Chat stated-future capture failed', error)),
			onTerminalControlError: (report) =>
				console.error(
					`Agentic Chat terminal control ${report.stage} failed turn=${report.turnRunId} generation=${report.executionGeneration}`,
					report.error
				),
			readTool,
			toolExecutions,
			sessionHandoff,
			researchCapture,
			statedFutureCapture,
			consumptionBilling: consumptionBilling ?? undefined,
			onConsumptionBillingError:
				options.onConsumptionBillingError ??
				((error) =>
					console.error('Agentic Chat consumption billing evaluation failed', error)),
			onTimingSnapshot: options.onTimingSnapshot ?? reportAgenticChatRuntimeTiming,
			mutation
		},
		{
			providerBudgetMs: options.providerBudgetMs,
			maxProviderRounds: options.maxProviderRounds,
			maxToolCalls: options.maxToolCalls,
			maxToolConcurrency: options.maxToolConcurrency,
			concurrentReadsEnabled: options.concurrentReadsEnabled,
			concurrentMutationsEnabled: options.concurrentMutationsEnabled
		}
	);
	const consumer = createAgenticChatConsumer(executor, {
		config: consumerConfig
	});
	const stalledCandidates = new SupabaseAgenticChatStalledCandidateSource(
		options.client as unknown as AgenticChatStalledReadClient,
		(error, index) =>
			console.error(`Agentic Chat stalled candidate ${index} was invalid`, error)
	);
	const recovery = new AgenticChatStalledRecoverySweep(
		{
			candidates: stalledCandidates,
			control,
			snapshots: new SupabaseAgenticChatRecoverySnapshotAdapter(rpcClient)
		},
		{
			stallTimeoutMs: consumer.config.stalledTimeoutMs,
			drainTimeoutMs: consumer.config.drainTimeoutMs,
			onError: (error) => console.error('Agentic Chat stalled recovery sweep failed', error),
			onReport: reportAgenticChatStalledRecovery
		}
	);
	const runtime = new AgenticChatConsumerRuntime(consumer.queue, {
		publisher: {
			start: () => publisher.start(),
			stop: async () => {
				try {
					return await publisher.stop();
				} finally {
					await broadcast.close();
				}
			}
		},
		cancellation,
		recovery,
		realtime: broadcast
	});
	const capacity = new AgenticChatWorkerCapacityCollector({
		runtime,
		queue: consumer.queue,
		queueAge: new SupabaseAgenticChatReadyQueueAgeAdapter(
			options.client as unknown as AgenticChatQueueAgeClient
		),
		provider: providerCapacity,
		publisher
	});

	return {
		consumer,
		runtime,
		executor,
		provider,
		providerCapacity,
		promptSnapshots,
		toolExecutions,
		executionObservations,
		sessionHandoff,
		researchCapture,
		statedFutureCapture,
		consumptionBilling,
		publisher,
		cancellation,
		recovery,
		capacity
	};
}

export function reportAgenticChatStalledRecovery(report: AgenticChatStalledRecoveryReportV1): void {
	if (report.candidateCount === 0) return;
	const finishedAtMs = Date.parse(report.finishedAt);
	const oldestCandidateAgeMs = report.results.reduce(
		(oldest, result) => Math.max(oldest, finishedAtMs - Date.parse(result.startedAt)),
		0
	);
	const attentionRequiredCount = report.results.filter((result) =>
		STALLED_RECOVERY_ATTENTION_OUTCOMES.has(result.outcome)
	).length;
	const payload = {
		event: 'agentic_chat_stalled_recovery_report',
		alert: attentionRequiredCount > 0 || oldestCandidateAgeMs >= STALLED_TURN_ALERT_AGE_MS,
		oldestCandidateAgeMs,
		attentionRequiredCount,
		...report
	};
	if (payload.alert) {
		console.error('Agentic Chat stalled recovery requires attention', payload);
		return;
	}
	console.info('Agentic Chat stalled recovery completed', payload);
}

export function reportAgenticChatRuntimeTiming(snapshot: AgenticChatRuntimeTimingSnapshotV1): void {
	console.info('Agentic Chat runtime timing', {
		event: 'agentic_chat_runtime_timing',
		...snapshot
	});
}

const STALLED_TURN_ALERT_AGE_MS = 10 * 60_000;
const STALLED_RECOVERY_ATTENTION_OUTCOMES = new Set([
	'effect_reconciliation_required',
	'manual_recovery_required',
	'failed'
]);

function disabledToolPort(code: 'mutating_tools_disabled') {
	return {
		execute(): Promise<never> {
			return Promise.reject(
				new AgenticChatProviderExecutionError(
					code,
					'permanent',
					`${code.replaceAll('_', ' ')} because mutation capability is not enabled`
				)
			);
		}
	};
}
