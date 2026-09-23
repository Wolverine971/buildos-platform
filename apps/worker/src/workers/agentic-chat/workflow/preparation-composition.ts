// apps/worker/src/workers/agentic-chat/workflow/preparation-composition.ts
import { loadSpecialistSnapshotV2 } from './specialist-snapshot-store';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import type { AgenticChatExecutionControlPortV1 } from '../turn/execution-control';
import type { SupabaseAgenticChatExecutionInputAdapter } from '../turn/execution-input';
import type { AgenticChatTurnProviderClientPortV1 } from '../provider/contracts';
import type { AgenticChatProviderCapacity } from '../provider/provider-capacity';
import type { AgenticChatStreamPublisher } from '../stream/stream-publisher';
import { createWorkflowPreparationContextLoader } from './context-loader';
import type { ContextFinderDecider } from '@buildos/agentic-chat-runtime/context-finder';
import { type ContextFinderReadClient, createWorkflowContextFinder } from './context-finder-port';
import {
	type AgenticChatWorkflowPreparationReadClient,
	type AgenticChatWorkflowPreparationRpcClient,
	SupabaseAgenticChatWorkflowPreparationStore
} from './preparation-store';
import { AgenticChatWorkflowTurnPreparer } from './raw-turn-preparation';
import type { AgenticChatWorkflowReasoningPolicyV1 } from './contracts';
import { AgenticChatWorkflowRunner } from './workflow-runner';
import { AgenticChatWorkflowRunnerAdapter } from './workflow-runner-adapter';
import {
	type AgenticChatWorkflowStoreClient,
	SupabaseAgenticChatWorkflowStore
} from './workflow-store';
import {
	type AgenticChatWorkflowRunnerPortV1,
	unavailableAgenticChatWorkflowRunner
} from './workflow-runner-port';

export type AgenticChatWorkflowV4CompositionOptionsV1 = {
	/** AGENTIC_CHAT_WORKFLOW_V4_PREPARATION_ENABLED; off means the port is not installed. */
	preparationEnabled: boolean;
	specialistWorkflowsEnabled?: boolean;
	documentReadToolsEnabled?: boolean;
	documentEvidenceHandoffEnabled?: boolean;
	publishedSpecialistsEnabled?: boolean;
	projectReviewV2Enabled?: boolean;
	projectReviewV3Enabled?: boolean;
	/**
	 * AGENTIC_CHAT_CONTEXT_FINDER_ENABLED: Jev-selected evidence for published specialists.
	 * Off installs no port, so a run that requests evidence records it as unavailable.
	 */
	contextFinderEnabled?: boolean;
	contextFinderDecider?: ContextFinderDecider;
	/** Tasker 87 supplies the durable runner; until then preparation ends in a readable failure. */
	runner?: AgenticChatWorkflowRunnerPortV1;
	/**
	 * AGENTIC_CHAT_WORKFLOW_EXECUTION_ENABLED (Tasker 87). Requires preparation and a
	 * workflow client whose routes use only priced models; off keeps the readable
	 * `workflow_execution_not_enabled` failure.
	 */
	executionEnabled?: boolean;
	runnerClient?: AgenticChatTurnProviderClientPortV1;
	/** AGENTIC_CHAT_WORKFLOW_REASONING_OFF_STEPS: host-owned hidden reasoning per step. */
	reasoning?: AgenticChatWorkflowReasoningPolicyV1;
};

/**
 * Compose Tasker 86 raw-request preparation, or return undefined so the
 * executor keeps its exact pre-86 behavior (v4 input refused permanently).
 */
export function createAgenticChatWorkflowTurnPreparerV1(input: {
	options: AgenticChatWorkflowV4CompositionOptionsV1 | undefined;
	client: SupabaseClient<Database>;
	input: Pick<SupabaseAgenticChatExecutionInputAdapter, 'loadRawWorkflowInput'>;
	publisher: AgenticChatStreamPublisher;
	control: AgenticChatExecutionControlPortV1;
	allowedUserIds: readonly string[];
	/** The shared provider admission gate; workflow specialists run within it. */
	providerCapacity?: Pick<AgenticChatProviderCapacity, 'acquire' | 'getSnapshot'>;
}): AgenticChatWorkflowTurnPreparer | undefined {
	if (!input.options?.preparationEnabled) return undefined;
	const runner = input.options.runner ?? createWorkflowRunnerPort(input);
	return new AgenticChatWorkflowTurnPreparer({
		input: input.input,
		store: new SupabaseAgenticChatWorkflowPreparationStore(
			input.client as unknown as AgenticChatWorkflowPreparationRpcClient,
			input.client as unknown as AgenticChatWorkflowPreparationReadClient
		),
		loadContext: createWorkflowPreparationContextLoader(input.client),
		publisher: input.publisher,
		control: input.control,
		runner: runner ?? unavailableAgenticChatWorkflowRunner,
		allowedUserIds: input.allowedUserIds,
		specialistWorkflowsEnabled: input.options.specialistWorkflowsEnabled,
		documentReadToolsEnabled: input.options.documentReadToolsEnabled,
		documentEvidenceHandoffEnabled: input.options.documentEvidenceHandoffEnabled,
		publishedSpecialistsEnabled: input.options.publishedSpecialistsEnabled,
		projectReviewV2Enabled: input.options.projectReviewV2Enabled,
		projectReviewV3Enabled: input.options.projectReviewV3Enabled,
		...(input.options.contextFinderEnabled
			? {
					findContext: createWorkflowContextFinder({
						client: input.client as unknown as ContextFinderReadClient,
						decider: input.options.contextFinderDecider
					})
				}
			: {}),
		loadSpecialistSnapshot: (identity) =>
			loadSpecialistSnapshotV2(
				input.client as unknown as AgenticChatWorkflowStoreClient,
				identity
			),
		onError: (report) =>
			console.warn(
				JSON.stringify({
					event: 'agentic_chat_workflow_preparation_error',
					stage: report.stage,
					turnRunId: report.turnRunId,
					error:
						report.error instanceof Error
							? `${report.error.name}: ${report.error.message}`.slice(0, 500)
							: 'unknown'
				})
			)
	});
}

/** Tasker 87's durable runner behind the port, only when execution is enabled. */
function createWorkflowRunnerPort(
	input: Parameters<typeof createAgenticChatWorkflowTurnPreparerV1>[0]
): AgenticChatWorkflowRunnerPortV1 | undefined {
	if (!input.options?.executionEnabled) return undefined;
	if (!input.options.runnerClient || !input.providerCapacity || !input.control.recoverWorkflow) {
		throw new Error('Workflow execution requires a priced workflow client and shared capacity');
	}
	const store = new SupabaseAgenticChatWorkflowStore(
		input.client as unknown as AgenticChatWorkflowStoreClient
	);
	const recoverWorkflow = input.control.recoverWorkflow.bind(input.control);
	return new AgenticChatWorkflowRunnerAdapter({
		runner: new AgenticChatWorkflowRunner(
			{
				store,
				client: input.options.runnerClient,
				capacity: input.providerCapacity
			},
			{ reasoning: input.options.reasoning }
		),
		store,
		control: { finalize: input.control.finalize.bind(input.control), recoverWorkflow },
		publisher: input.publisher,
		// The reasoning setting is host-owned and not stored with the run; log it per run.
		onRunSummary: (summary) =>
			console.info(JSON.stringify({ ...summary, reasoning: input.options?.reasoning ?? {} })),
		onError: (report) =>
			console.warn(
				JSON.stringify({
					event: 'agentic_chat_workflow_run_error',
					stage: report.stage,
					turnRunId: report.turnRunId,
					error:
						report.error instanceof Error
							? `${report.error.name}: ${report.error.message}`.slice(0, 500)
							: 'unknown'
				})
			)
	});
}
