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
	projectReviewV2?: boolean;
	question?: string;
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
	return ({ userId, projectId, signal, projectReviewV2, question }) =>
		boundedBySignal(signal, async () => {
			if (projectReviewV2) {
				// One actor-authorized RPC captures all recipe families in the same transaction.
				const rpc = client as unknown as {
					rpc(
						name: string,
						args: Record<string, unknown>
					): {
						abortSignal(
							signal: AbortSignal
						): PromiseLike<{ data: unknown; error: unknown }>;
					};
				};
				const result = await rpc
					.rpc('load_agentic_chat_project_review_evidence_v2', {
						p_user_id: userId,
						p_project_id: projectId,
						p_question: question ?? ''
					})
					.abortSignal(signal);
				signal.throwIfAborted();
				if (
					result.error ||
					!result.data ||
					typeof result.data !== 'object' ||
					Array.isArray(result.data)
				)
					throw new Error('Project review evidence is unavailable');
				return {
					contextType: 'project',
					timezone: reviewTimezone(result.data),
					entityId: projectId,
					projectId,
					contextLoadSource: 'rpc',
					data: result.data
				} as MasterPromptContext;
			}
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

function reviewTimezone(data: object): string {
	const value = (data as Record<string, unknown>).review_timezone;
	if (typeof value === 'string' && value.trim()) {
		try {
			new Intl.DateTimeFormat('en-US', { timeZone: value.trim() });
			return value.trim();
		} catch {
			/* Same UTC fallback as the ordinary context loader. */
		}
	}
	return 'UTC';
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
