// apps/worker/src/workers/agentic-chat/workflow/preparation-composition.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import type { AgenticChatExecutionControlPortV1 } from '../executionControl';
import type { SupabaseAgenticChatExecutionInputAdapter } from '../executionInput';
import type { AgenticChatStreamPublisher } from '../streamPublisher';
import { createWorkflowPreparationContextLoader } from './context-loader';
import {
	type AgenticChatWorkflowPreparationReadClient,
	type AgenticChatWorkflowPreparationRpcClient,
	SupabaseAgenticChatWorkflowPreparationStore
} from './preparation-store';
import { AgenticChatWorkflowTurnPreparer } from './raw-turn-preparation';
import {
	type AgenticChatWorkflowRunnerPortV1,
	unavailableAgenticChatWorkflowRunner
} from './workflow-runner-port';

export type AgenticChatWorkflowV4CompositionOptionsV1 = {
	/** AGENTIC_CHAT_WORKFLOW_V4_PREPARATION_ENABLED; off means the port is not installed. */
	preparationEnabled: boolean;
	/** Tasker 87 supplies the durable runner; until then preparation ends in a readable failure. */
	runner?: AgenticChatWorkflowRunnerPortV1;
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
}): AgenticChatWorkflowTurnPreparer | undefined {
	if (!input.options?.preparationEnabled) return undefined;
	return new AgenticChatWorkflowTurnPreparer({
		input: input.input,
		store: new SupabaseAgenticChatWorkflowPreparationStore(
			input.client as unknown as AgenticChatWorkflowPreparationRpcClient,
			input.client as unknown as AgenticChatWorkflowPreparationReadClient
		),
		loadContext: createWorkflowPreparationContextLoader(input.client),
		publisher: input.publisher,
		control: input.control,
		runner: input.options.runner ?? unavailableAgenticChatWorkflowRunner,
		allowedUserIds: input.allowedUserIds,
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
