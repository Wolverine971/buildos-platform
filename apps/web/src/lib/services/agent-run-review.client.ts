// apps/web/src/lib/services/agent-run-review.client.ts
import { get, writable } from 'svelte/store';
import type { ChangeSet, ChangeSetDecision } from '@buildos/shared-types';
import { toastService } from '$lib/stores/toast.store';
import { notifyDataMutation } from '$lib/stores/projectDataMutations';
import { loadAiInboxCount } from '$lib/stores/aiInboxCount.store';

type CommitResult = {
	applied: number;
	rejected: number;
	failed: number;
	change_set?: ChangeSet;
};

export type ReviewCommitOutcome = { result: CommitResult | null; error: string | null };
export type PendingReviewCommit = {
	changeSet: ChangeSet;
	decisions: ChangeSetDecision[];
	dismissing: boolean;
	promise: Promise<ReviewCommitOutcome>;
};

// Only in-flight browser requests live here. Closing/reopening a modal joins the
// original request, including from another inbox surface. Entries are removed on
// settlement; nothing is persisted or started during server rendering.
const pending = writable(new Map<string, PendingReviewCommit>());
export const pendingAgentRunReviews = { subscribe: pending.subscribe };

function affectedProjectIds(changeSet: ChangeSet): string[] {
	const ids = new Set<string>();
	for (const change of changeSet.changes) {
		for (const payload of [change.after, change.before]) {
			const projectId = payload?.project_id;
			if (typeof projectId === 'string' && projectId) ids.add(projectId);
		}
		if (change.entity_type === 'project') {
			const id = change.entity_id ?? change.applied_entity_id;
			if (id) ids.add(id);
		}
	}
	return [...ids];
}

async function sendDecision(
	runId: string,
	decisions: ChangeSetDecision[]
): Promise<ReviewCommitOutcome> {
	try {
		const response = await fetch(`/api/agent-runs/${runId}/commit`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ decisions })
		});
		const payload = await response.json().catch(() => null);
		if (!response.ok) {
			return {
				result: null,
				error: payload?.error || 'Could not apply the changes. Try again.'
			};
		}
		const result = payload?.data as CommitResult | undefined;
		if (
			!result ||
			![result.applied, result.rejected, result.failed].every(
				(value) => Number.isInteger(value) && value >= 0
			)
		) {
			throw new Error('Missing commit result');
		}
		return {
			result,
			error:
				result.failed > 0
					? `Applied ${result.applied}; ${result.failed} could not be applied. Review the details below or discuss a follow-up.`
					: null
		};
	} catch {
		return {
			result: null,
			error: 'Could not confirm the changes. Try again to check their status.'
		};
	}
}

export function submitAgentRunReview(
	runId: string,
	changeSet: ChangeSet,
	decisions: ChangeSetDecision[]
): PendingReviewCommit {
	const existing = get(pending).get(runId);
	if (existing) return existing;
	const entry: PendingReviewCommit = {
		changeSet,
		decisions,
		dismissing: decisions.every((decision) => decision.decision === 'rejected'),
		promise: Promise.resolve()
			.then(() => sendDecision(runId, decisions))
			.then((outcome) => {
				// These effects belong to the request, not to a modal that may be closed
				// or mounted twice. Background failures remain visible as a toast.
				if (outcome.result?.applied) {
					notifyDataMutation({
						hasChanges: true,
						totalMutations: outcome.result.applied,
						affectedProjectIds: affectedProjectIds(changeSet),
						hasMessagesSent: false
					});
				}
				if (outcome.error) {
					if (outcome.result) toastService.warning(outcome.error);
					else toastService.error(outcome.error);
				} else if (outcome.result) {
					const count = outcome.result.applied;
					toastService.success(
						count > 0
							? `Applied ${count} change${count === 1 ? '' : 's'}`
							: 'Changes dismissed'
					);
				}
				if (outcome.result) void loadAiInboxCount({ force: true });
				return outcome;
			})
			.finally(() => {
				pending.update((current) => {
					const next = new Map(current);
					next.delete(runId);
					return next;
				});
			})
	};
	pending.update((current) => new Map(current).set(runId, entry));
	return entry;
}
