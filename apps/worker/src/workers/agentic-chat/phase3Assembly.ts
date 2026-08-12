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
import {
	type AgenticChatEffectRpcClient,
	SupabaseAgenticChatEffectControlAdapter
} from './effectControl';
import { SupabaseAgenticChatExecutionInputAdapter } from './executionInput';
import { AgenticChatFixtureMutationExecutor } from './fixtureMutationExecutor';
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
import { AgenticChatCreateOntoDocumentMutationAdapter } from './createOntoDocumentMutationAdapter';
import { AgenticChatCreateOntoProjectMutationAdapter } from './createOntoProjectMutationAdapter';
import { AgenticChatCreateOntoTaskMutationAdapter } from './createOntoTaskMutationAdapter';
import { AgenticChatMoveOntoTaskMutationAdapter } from './moveOntoTaskMutationAdapter';
import { AgenticChatTagOntoEntityPingMutationAdapter } from './tagOntoEntityPingMutationAdapter';
import {
	AGENTIC_CHAT_GATEWAY_ENTITY_MUTATION_TOOL_NAMES_V1,
	AgenticChatGatewayEntityMutationAdapter
} from './gatewayEntityMutationAdapter';
import {
	AGENTIC_CHAT_DOCUMENT_RELATIONSHIP_MUTATION_TOOL_NAMES_V1,
	AgenticChatGatewayDocumentRelationshipMutationAdapter
} from './gatewayDocumentRelationshipMutationAdapter';
import {
	AGENTIC_CHAT_EDGE_MUTATION_TOOL_NAMES_V1,
	AgenticChatGatewayEdgeMutationAdapter
} from './gatewayEdgeMutationAdapter';
import { AgenticChatGatewayProjectMutationAdapter } from './gatewayProjectMutationAdapter';
import {
	type AgenticChatMutationAdapterEntry,
	AgenticChatMutationAdapterRouter
} from './mutationAdapterRouter';
import {
	AGENTIC_CHAT_MUTATION_CAPABILITY_TOOLS_V1,
	type AgenticChatProviderMutationCapabilitiesV1,
	normalizeAgenticChatMutationCapabilitiesV1
} from './mutationToolCatalog';
import { AgenticChatUpdateOntoTaskMutationAdapter } from './updateOntoTaskMutationAdapter';
import { SupabaseAgenticChatLiveVisionResolver } from './liveVision';

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
 * Compose the hosted Phase 3 read-only worker without starting it. The caller
 * must still explicitly start `runtime`; this module is intentionally absent
 * from production entrypoints and cannot open web routing by itself.
 */
export function createAgenticChatPhase3Assembly(options: {
	client: SupabaseClient<Database>;
	providerClient: AgenticChatReadOnlyProviderClientPortV1;
	providerConfigured: boolean;
	/** Separate default-off gate for ephemeral current-turn image resolution. */
	liveVisionEnabled?: boolean;
	liveVisionFetchImpl?: typeof fetch;
	internalUserIds: readonly string[];
	consumerConfig?: Partial<AgenticChatConsumerConfig>;
	publisherConfig?: Partial<AgenticChatPublisherConfig>;
	cancellationConfig?: Partial<AgenticChatCancellationObserverConfig>;
	providerCooldownMs?: number;
	providerBudgetMs?: number;
	maxProviderRounds?: number;
	maxToolCalls?: number;
	/** Separate provider-advertisement gate. Requires the matching adapter gate. */
	mutationProviderCapabilities?: Partial<AgenticChatProviderMutationCapabilitiesV1>;
	/** Separate irreversible-adapter gate. The production bootstrap leaves this off. */
	mutationAdapterCapabilities?: Partial<AgenticChatProviderMutationCapabilitiesV1>;
	onPromptSnapshotError?: (error: unknown) => void;
	onExecutionObservationError?: (error: unknown) => void;
}): AgenticChatPhase3Assembly {
	if (
		options.cancellationConfig?.consumerConcurrency !== undefined &&
		options.cancellationConfig.consumerConcurrency !== 1
	) {
		throw new Error('Phase 3 cancellation concurrency must match CHAT_CONCURRENCY=1');
	}
	const mutationProviderCapabilities = normalizeAgenticChatMutationCapabilitiesV1(
		options.mutationProviderCapabilities
	);
	const mutationAdapterCapabilities = normalizeAgenticChatMutationCapabilitiesV1(
		options.mutationAdapterCapabilities
	);
	for (const [capability, toolName] of AGENTIC_CHAT_MUTATION_CAPABILITY_TOOLS_V1) {
		if (mutationProviderCapabilities[capability] && !mutationAdapterCapabilities[capability]) {
			throw new Error(`${toolName} provider capability requires its mutation adapter`);
		}
	}
	const rpcClient = options.client as unknown as AgenticChatExecutionRpcClient &
		AgenticChatEffectRpcClient &
		AgenticChatSupabaseRpcClient &
		AgenticChatRecoverySnapshotRpcClient &
		AgenticChatPromptSnapshotRpcClient &
		AgenticChatToolExecutionRpcClient &
		AgenticChatExecutionObservationRpcClient;
	const control = new SupabaseAgenticChatExecutionControlAdapter(rpcClient);
	const effectControl = new SupabaseAgenticChatEffectControlAdapter(rpcClient);
	const promptSnapshots = new SupabaseAgenticChatPromptSnapshotAdapter(rpcClient);
	const toolExecutions = new SupabaseAgenticChatToolExecutionAdapter(rpcClient);
	const executionObservations = new SupabaseAgenticChatExecutionObservationAdapter(rpcClient);
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
		{ ...options.cancellationConfig, consumerConcurrency: 1 }
	);
	const providerCapacity = new AgenticChatProviderCapacity({
		configured: options.providerConfigured,
		concurrency: 1
	});
	const provider = new AgenticChatReadOnlyProviderAdapter(
		{ client: options.providerClient, capacity: providerCapacity, liveVision },
		options.providerCooldownMs,
		options.maxProviderRounds,
		mutationProviderCapabilities
	);
	const readTool = new AgenticChatReadOnlyToolAdapter(options.client);
	const mutationAdapters: AgenticChatMutationAdapterEntry[] = [];
	if (mutationAdapterCapabilities.createOntoDocument) {
		mutationAdapters.push([
			'create_onto_document',
			new AgenticChatCreateOntoDocumentMutationAdapter(options.client)
		]);
	}
	if (mutationAdapterCapabilities.createOntoTask) {
		mutationAdapters.push([
			'create_onto_task',
			new AgenticChatCreateOntoTaskMutationAdapter(options.client)
		]);
	}
	if (mutationAdapterCapabilities.updateOntoTask) {
		mutationAdapters.push([
			'update_onto_task',
			new AgenticChatUpdateOntoTaskMutationAdapter(options.client)
		]);
	}
	if (mutationAdapterCapabilities.moveOntoTask) {
		mutationAdapters.push([
			'move_onto_task',
			new AgenticChatMoveOntoTaskMutationAdapter(options.client)
		]);
	}
	if (mutationAdapterCapabilities.tagOntoEntity) {
		mutationAdapters.push([
			'tag_onto_entity',
			new AgenticChatTagOntoEntityPingMutationAdapter(options.client)
		]);
	}
	if (mutationAdapterCapabilities.updateOntoProject) {
		mutationAdapters.push([
			'update_onto_project',
			new AgenticChatGatewayProjectMutationAdapter(options.client)
		]);
	}
	if (mutationAdapterCapabilities.createOntoProject) {
		mutationAdapters.push([
			'create_onto_project',
			new AgenticChatCreateOntoProjectMutationAdapter(options.client)
		]);
	}
	const gatewayEntityToolNames = new Set<string>(
		AGENTIC_CHAT_GATEWAY_ENTITY_MUTATION_TOOL_NAMES_V1
	);
	const enabledGatewayEntityTools = AGENTIC_CHAT_MUTATION_CAPABILITY_TOOLS_V1.filter(
		([capability, toolName]) =>
			mutationAdapterCapabilities[capability] && gatewayEntityToolNames.has(toolName)
	).map(([, toolName]) => toolName);
	if (enabledGatewayEntityTools.length > 0) {
		const gatewayEntityAdapter = new AgenticChatGatewayEntityMutationAdapter(options.client);
		for (const toolName of enabledGatewayEntityTools) {
			mutationAdapters.push([toolName, gatewayEntityAdapter]);
		}
	}
	const documentRelationshipToolNames = new Set<string>(
		AGENTIC_CHAT_DOCUMENT_RELATIONSHIP_MUTATION_TOOL_NAMES_V1
	);
	const enabledDocumentRelationshipTools = AGENTIC_CHAT_MUTATION_CAPABILITY_TOOLS_V1.filter(
		([capability, toolName]) =>
			mutationAdapterCapabilities[capability] && documentRelationshipToolNames.has(toolName)
	).map(([, toolName]) => toolName);
	if (enabledDocumentRelationshipTools.length > 0) {
		const documentRelationshipAdapter =
			new AgenticChatGatewayDocumentRelationshipMutationAdapter(options.client);
		for (const toolName of enabledDocumentRelationshipTools) {
			mutationAdapters.push([toolName, documentRelationshipAdapter]);
		}
	}
	const edgeToolNames = new Set<string>(AGENTIC_CHAT_EDGE_MUTATION_TOOL_NAMES_V1);
	const enabledEdgeTools = AGENTIC_CHAT_MUTATION_CAPABILITY_TOOLS_V1.filter(
		([capability, toolName]) =>
			mutationAdapterCapabilities[capability] && edgeToolNames.has(toolName)
	).map(([, toolName]) => toolName);
	if (enabledEdgeTools.length > 0) {
		const edgeAdapter = new AgenticChatGatewayEdgeMutationAdapter(options.client);
		for (const toolName of enabledEdgeTools) {
			mutationAdapters.push([toolName, edgeAdapter]);
		}
	}
	assertAgenticChatMutationAdapterCoverageV1(mutationAdapterCapabilities, mutationAdapters);
	const mutation =
		mutationAdapters.length > 0
			? new AgenticChatFixtureMutationExecutor({
					control: effectControl,
					mutatingTool: new AgenticChatMutationAdapterRouter(mutationAdapters)
				})
			: disabledToolPort('mutating_tools_disabled');
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
			onTerminalControlError: (report) =>
				console.error(
					`Agentic Chat terminal control ${report.stage} failed turn=${report.turnRunId} generation=${report.executionGeneration}`,
					report.error
				),
			readTool,
			toolExecutions,
			mutation
		},
		{
			providerBudgetMs: options.providerBudgetMs,
			maxProviderRounds: options.maxProviderRounds,
			maxToolCalls: options.maxToolCalls
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
