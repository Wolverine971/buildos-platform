// apps/worker/src/workers/agentic-chat/workflow/context-loader.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import type { MasterPromptContext } from '@buildos/agentic-chat-runtime/context';
import { createFastChatContextLoader } from '@buildos/agentic-chat-runtime/context/loader';
import { WorkerAgenticChatToolAccessAdapter } from '../workerAccessAdapter';

/** Service-role reads require a fresh actor-explicit access check for each workflow. */
export function createWorkflowContextLoader(client: SupabaseClient<Database>) {
	const loader = createFastChatContextLoader({
		logger: {
			warn: (message) => console.warn(`[workflow-context] ${message}`)
		}
	});
	return (userId: string, projectId: string, signal: AbortSignal) =>
		boundedBySignal(signal, async () => {
			await new WorkerAgenticChatToolAccessAdapter({ client, userId }).assertProjectAccess(
				projectId,
				'read'
			);
			signal.throwIfAborted();
			const context = await loader.loadFastChatPromptContext({
				supabase: client,
				userId,
				contextType: 'project',
				entityId: projectId
			});
			signal.throwIfAborted();
			return context;
		});
}

export type AgenticChatWorkflowPreparationContextLoaderV1 = (input: {
	userId: string;
	projectId: string;
	signal: AbortSignal;
}) => Promise<MasterPromptContext>;

/**
 * Tasker 86 raw-request preparation. The caller has just checked current access
 * with `agentic_chat_workflow_project_access_v1`, the same authority the context
 * checkpoint RPC re-applies at commit. The shared portable loader's project RPC
 * remains the read boundary (no RLS fallback), and the caller's signal carries
 * the 20-second context bound plus cancellation.
 */
export function createWorkflowPreparationContextLoader(
	client: SupabaseClient<Database>
): AgenticChatWorkflowPreparationContextLoaderV1 {
	const loader = createFastChatContextLoader({
		logger: {
			warn: (message) => console.warn(`[workflow-preparation-context] ${message}`)
		}
	});
	return ({ userId, projectId, signal }) =>
		boundedBySignal(signal, async () => {
			const context = await loader.loadFastChatPromptContext({
				supabase: client,
				userId,
				contextType: 'project',
				entityId: projectId
			});
			signal.throwIfAborted();
			return context;
		});
}

/**
 * The shared loader cannot cancel every DB request yet. Bound the caller and
 * prevent late results from being used; reads may finish in the background.
 */
function boundedBySignal<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
	return new Promise<T>((resolve, reject) => {
		// A throw inside the executor rejects, so an already-aborted signal still rejects.
		signal.throwIfAborted();
		const cancel = () => reject(signal.reason);
		signal.addEventListener('abort', cancel, { once: true });
		void work()
			.then(resolve, reject)
			.finally(() => signal.removeEventListener('abort', cancel));
	});
}
