// apps/worker/src/workers/agentic-chat/phase3Assembly.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import type { AgenticChatQueueAgeClient } from './capacity';
import {
	AgenticChatWorkerCapacityCollector,
	SupabaseAgenticChatReadyQueueAgeAdapter
} from './capacity';
import {
	AgenticChatCancellationObserver,
	type AgenticChatCancellationObserverConfig
} from './cancellationObserver';
import { type AgenticChatConsumerConfig, createAgenticChatConsumer } from './consumer';
import { AgenticChatConsumerRuntime } from './consumerRuntime';
import {
	type AgenticChatExecutionRpcClient,
	SupabaseAgenticChatExecutionControlAdapter
} from './executionControl';
import { SupabaseAgenticChatExecutionInputAdapter } from './executionInput';
import { AgenticChatFixtureTurnExecutor } from './fixtureTurnExecutor';
import {
	AgenticChatProviderExecutionError,
	type AgenticChatProviderPortV1
} from './providerContract';
import { AgenticChatProviderCapacity } from './providerCapacity';
import {
	type AgenticChatPromptSnapshotPortV1,
	type AgenticChatPromptSnapshotRpcClient,
	SupabaseAgenticChatPromptSnapshotAdapter
} from './promptSnapshot';
import {
	AgenticChatReadOnlyProviderAdapter,
	type AgenticChatReadOnlyProviderClientPortV1
} from './readOnlyProvider';
import { AgenticChatReadOnlyToolAdapter } from './readOnlyTool';
import {
	type AgenticChatRecoverySnapshotRpcClient,
	SupabaseAgenticChatRecoverySnapshotAdapter
} from './recoverySnapshot';
import {
	type AgenticChatStalledReadClient,
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

export type AgenticChatPhase3Assembly = {
	consumer: ReturnType<typeof createAgenticChatConsumer>;
	runtime: AgenticChatConsumerRuntime;
	executor: AgenticChatFixtureTurnExecutor;
	provider: AgenticChatProviderPortV1;
	providerCapacity: AgenticChatProviderCapacity;
	promptSnapshots: AgenticChatPromptSnapshotPortV1;
	toolExecutions: AgenticChatToolExecutionPortV1;
	executionObservations: AgenticChatExecutionObservationPortV1;
	publisher: AgenticChatStreamPublisher;
	cancellation: AgenticChatCancellationObserver;
	recovery: AgenticChatStalledRecoverySweep;
	capacity: AgenticChatWorkerCapacityCollector;
};

/**
 * Compose the hosted Phase 3 read-only worker without starting it. The caller
 * must still explicitly start `runtime`; this module is intentionally absent
 * from production entrypoints and cannot open web routing by itself.
 */
export function createAgenticChatPhase3Assembly(options: {
	client: SupabaseClient<Database>;
	providerClient: AgenticChatReadOnlyProviderClientPortV1;
	providerConfigured: boolean;
	internalUserIds: readonly string[];
	consumerConfig?: Partial<AgenticChatConsumerConfig>;
	publisherConfig?: Partial<AgenticChatPublisherConfig>;
	cancellationConfig?: Partial<AgenticChatCancellationObserverConfig>;
	providerCooldownMs?: number;
	providerBudgetMs?: number;
	onPromptSnapshotError?: (error: unknown) => void;
	onExecutionObservationError?: (error: unknown) => void;
}): AgenticChatPhase3Assembly {
	if (
		options.cancellationConfig?.consumerConcurrency !== undefined &&
		options.cancellationConfig.consumerConcurrency !== 1
	) {
		throw new Error('Phase 3 cancellation concurrency must match CHAT_CONCURRENCY=1');
	}
	const rpcClient = options.client as unknown as AgenticChatExecutionRpcClient &
		AgenticChatSupabaseRpcClient &
		AgenticChatRecoverySnapshotRpcClient &
		AgenticChatPromptSnapshotRpcClient &
		AgenticChatToolExecutionRpcClient &
		AgenticChatExecutionObservationRpcClient;
	const control = new SupabaseAgenticChatExecutionControlAdapter(rpcClient);
	const promptSnapshots = new SupabaseAgenticChatPromptSnapshotAdapter(rpcClient);
	const toolExecutions = new SupabaseAgenticChatToolExecutionAdapter(rpcClient);
	const executionObservations = new SupabaseAgenticChatExecutionObservationAdapter(rpcClient);
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
		{ ...options.cancellationConfig, consumerConcurrency: 1 }
	);
	const providerCapacity = new AgenticChatProviderCapacity({
		configured: options.providerConfigured,
		concurrency: 1
	});
	const provider = new AgenticChatReadOnlyProviderAdapter(
		{ client: options.providerClient, capacity: providerCapacity },
		options.providerCooldownMs
	);
	const readTool = new AgenticChatReadOnlyToolAdapter(options.client);
	const executor = new AgenticChatFixtureTurnExecutor(
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
			readTool,
			toolExecutions,
			mutation: disabledToolPort('mutating_tools_disabled')
		},
		{
			providerBudgetMs: options.providerBudgetMs
		}
	);
	const consumer = createAgenticChatConsumer(executor, {
		internalUserIds: options.internalUserIds,
		config: options.consumerConfig
	});
	const recovery = new AgenticChatStalledRecoverySweep(
		{
			candidates: new SupabaseAgenticChatStalledCandidateSource(
				options.client as unknown as AgenticChatStalledReadClient
			),
			control,
			snapshots: new SupabaseAgenticChatRecoverySnapshotAdapter(rpcClient)
		},
		{
			stallTimeoutMs: consumer.config.stalledTimeoutMs,
			drainTimeoutMs: consumer.config.drainTimeoutMs
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
		recovery
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
		publisher,
		cancellation,
		recovery,
		capacity
	};
}

function disabledToolPort(code: 'mutating_tools_disabled') {
	return {
		execute(): Promise<never> {
			return Promise.reject(
				new AgenticChatProviderExecutionError(
					code,
					'permanent',
					`${code.replaceAll('_', ' ')} in the Phase 3 read-only slice`
				)
			);
		}
	};
}
