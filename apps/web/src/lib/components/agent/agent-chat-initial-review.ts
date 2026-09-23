// apps/web/src/lib/components/agent/agent-chat-initial-review.ts
//
// A review launched from another surface (Workflow Lab) runs as that durable
// review or not at all: it never falls back to an ordinary chat turn, which can
// write to the project. The modal applies the result to its review selection,
// the same state the in-chat Review / Organize documents toggles set.
import type { AgenticChatWorkerCommand } from '$lib/services/agentic-chat-v2/worker-transport-client';

export type ChatReviewIntent = NonNullable<AgenticChatWorkerCommand['reviewIntent']>;

export type ChatReviewCapabilities =
	| { status: 'loading' }
	| { status: 'failed' }
	| { status: 'ready'; projectReview: boolean; documentOrganization: boolean };

export type InitialReviewDecision =
	| { kind: 'wait' }
	| { kind: 'unavailable'; message: string }
	| { kind: 'ready'; selection: { projectId: string; intent: ChatReviewIntent } };

export function resolveInitialReview(input: {
	intent: ChatReviewIntent;
	capabilities: ChatReviewCapabilities;
	/** Set only for project context with project-wide focus, like the in-chat toggle. */
	reviewProjectId: string | null;
}): InitialReviewDecision {
	const { intent, capabilities } = input;
	if (capabilities.status === 'loading') return { kind: 'wait' };
	if (capabilities.status === 'failed') {
		return {
			kind: 'unavailable',
			message: 'BuildOS could not confirm that reviews are available. Reload to try again.'
		};
	}
	const available =
		intent === 'document_organization'
			? capabilities.documentOrganization
			: capabilities.projectReview;
	if (!available) {
		return {
			kind: 'unavailable',
			message:
				intent === 'document_organization'
					? 'Specialist document reviews are not enabled for this account, so the review was not started.'
					: 'Project review is not enabled for this account, so the review was not started.'
		};
	}
	// The project scope settles after the context router applies the launch props.
	if (!input.reviewProjectId) return { kind: 'wait' };
	return { kind: 'ready', selection: { projectId: input.reviewProjectId, intent } };
}
