// apps/worker/src/workers/agentic-chat/workflow/context-loader.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@buildos/shared-types';
import { createFastChatContextLoader } from '@buildos/agentic-chat-runtime/context/loader';
import { WorkerAgenticChatToolAccessAdapter } from '../workerAccessAdapter';

/** Service-role reads require a fresh actor-explicit access check for each workflow. */
export function createWorkflowContextLoader(client: SupabaseClient<Database>) {
	const loader = createFastChatContextLoader({
		logger: {
			warn: (message) => console.warn(`[workflow-context] ${message}`)
		}
	});
	return async (userId: string, projectId: string, signal: AbortSignal) => {
		signal.throwIfAborted();
		const work = async () => {
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
		};
		// The shared loader cannot cancel every DB request yet. Bound the caller and
		// prevent late results from starting model work; reads may finish in background.
		return new Promise<Awaited<ReturnType<typeof work>>>((resolve, reject) => {
			const cancel = () => reject(signal.reason);
			signal.addEventListener('abort', cancel, { once: true });
			void work()
				.then(resolve, reject)
				.finally(() => signal.removeEventListener('abort', cancel));
		});
	};
}
