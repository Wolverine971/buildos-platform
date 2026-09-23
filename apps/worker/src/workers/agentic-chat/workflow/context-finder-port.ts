// apps/worker/src/workers/agentic-chat/workflow/context-finder-port.ts
//
// Research specialists: load the project's records once (access was checked by the same
// bounded preparation step), then let the shared context finder rank and select evidence.
// A curated plan from Workflow Lab is only materialized; it never calls Jev again.
import {
	type ContextEvidenceV1,
	type ContextFinderDecider,
	type ContextFinderReadClient,
	findProjectContext,
	loadContextFinderProject
} from '@buildos/agentic-chat-runtime/context-finder';
import type { PublishedSpecialistContextFinderV1 } from '@buildos/agentic-chat-runtime/specialists';

export type { ContextFinderReadClient };

export type WorkflowContextFinderPortV1 = (input: {
	userId: string;
	projectId: string;
	question: string;
	request: PublishedSpecialistContextFinderV1;
	signal: AbortSignal;
}) => Promise<ContextEvidenceV1>;

/**
 * Per Jev call. A review runs for a minute or more, so a slow ranking costs little; the
 * pilot saw one of four 3-second rankings time out (2026-09-22).
 */
export const WORKFLOW_CONTEXT_FINDER_TIMEOUT_MS = 8_000;

export function createWorkflowContextFinder(input: {
	client: ContextFinderReadClient;
	/** Absent when AGENTIC_CHAT_CONTEXT_FINDER_ENABLED is off: auto requests are unavailable. */
	decider?: ContextFinderDecider;
	timeoutMs?: number;
}): WorkflowContextFinderPortV1 {
	return async ({ userId, projectId, question, request, signal }) => {
		const project = await loadContextFinderProject(input.client, projectId, signal);
		const result = await findProjectContext({
			project,
			message: question,
			decider: request.mode === 'auto' ? input.decider : undefined,
			plan: request.mode === 'curated' ? request.plan : undefined,
			signal,
			timeoutMs: input.timeoutMs ?? WORKFLOW_CONTEXT_FINDER_TIMEOUT_MS,
			usage: { operationType: 'agentic_chat_context_finder', userId, projectId }
		});
		return result.evidence;
	};
}
