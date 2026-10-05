// apps/web/src/lib/server/project-cleanup-decisions.service.ts
//
// Tasker 112: saving decisions on a project's "Project cleanup" card. Shared by the card's
// batch endpoint and the quick-note endpoint (Jev reads a note into one of these decisions).
// Decisions apply one at a time through decideProjectSuggestion, so each keeps its own
// verification, result and trail, and one failure never stops the rest.

import { loadProjectCleanupView } from '@buildos/shared-agent-ops/project-cleanup';
import { syncInboxItemForProjectCleanup } from '@buildos/shared-agent-ops/inbox-index';
import {
	decideProjectSuggestion,
	type ProjectSuggestionDecisionOutcome
} from '$lib/server/project-suggestion-actions.service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';

// Stop starting new decisions well before the function limit; the rest stay in the list.
export const DECISION_TIME_BUDGET_MS = 240_000;

export const CLEANUP_CHANGED_MESSAGE =
	'This item changed since you opened it — review the new version.';
export const DEFAULT_ADDRESS_NOTE = 'Handled from the project cleanup list';

export type CleanupDismissReason =
	| 'not_relevant'
	| 'wrong_evidence'
	| 'intentional'
	| 'too_risky'
	| 'other';

export type CleanupDecisionInput = {
	suggestion_id: string;
	action: 'approve' | 'dismiss' | 'address';
	expected_fingerprint?: string | null;
	reason?: CleanupDismissReason;
	note?: string;
};

export type CleanupOutcomeStatus =
	| 'applied'
	| 'failed'
	| 'rejected'
	| 'addressed'
	| 'changed'
	| 'already_decided'
	| 'error';

export type CleanupOutcome = {
	suggestion_id: string;
	ok: boolean;
	status: CleanupOutcomeStatus;
	message?: string;
};

type AnySupabase = any;

function firstResultError(outcome: Extract<ProjectSuggestionDecisionOutcome, { ok: true }>) {
	const error = outcome.result?.errors?.find((entry) => entry?.error)?.error;
	return typeof error === 'string' && error.trim() ? error.trim() : null;
}

/** Plain-English status for one row's decision. */
export function toCleanupOutcome(
	decision: CleanupDecisionInput,
	outcome: ProjectSuggestionDecisionOutcome
): CleanupOutcome {
	const suggestionId = decision.suggestion_id;
	if (!outcome.ok) {
		if (outcome.status === 409 || /can no longer be applied/i.test(outcome.message)) {
			return {
				suggestion_id: suggestionId,
				ok: false,
				status: 'changed',
				message: CLEANUP_CHANGED_MESSAGE
			};
		}
		if (outcome.status === 404) {
			return {
				suggestion_id: suggestionId,
				ok: false,
				status: 'error',
				message: 'This item is no longer in the cleanup list.'
			};
		}
		return {
			suggestion_id: suggestionId,
			ok: false,
			status: 'error',
			message: outcome.message
		};
	}
	if (outcome.superseded) {
		return {
			suggestion_id: suggestionId,
			ok: false,
			status: 'changed',
			message: CLEANUP_CHANGED_MESSAGE
		};
	}
	if (outcome.alreadyDecided) {
		return {
			suggestion_id: suggestionId,
			ok: true,
			status: 'already_decided',
			message: 'Already handled.'
		};
	}
	if (decision.action === 'dismiss') {
		return { suggestion_id: suggestionId, ok: true, status: 'rejected' };
	}
	if (decision.action === 'address') {
		return { suggestion_id: suggestionId, ok: true, status: 'addressed' };
	}
	if (outcome.result && outcome.result.ok === false) {
		return {
			suggestion_id: suggestionId,
			ok: false,
			status: 'failed',
			message: firstResultError(outcome) ?? 'Some changes could not be applied.'
		};
	}
	return { suggestion_id: suggestionId, ok: true, status: 'applied' };
}

export function dedupeCleanupDecisions<T extends { suggestion_id: string }>(decisions: T[]): T[] {
	const seen = new Set<string>();
	return decisions.filter((decision) => {
		if (seen.has(decision.suggestion_id)) return false;
		seen.add(decision.suggestion_id);
		return true;
	});
}

/** Applies each decision in order; never throws. The card's inbox row is synced by the caller. */
export async function runCleanupDecisions(params: {
	supabase: AnySupabase;
	userId: string;
	projectId: string;
	decisions: CleanupDecisionInput[];
	timeBudgetMs?: number;
}): Promise<CleanupOutcome[]> {
	const budget = params.timeBudgetMs ?? DECISION_TIME_BUDGET_MS;
	const startedAt = Date.now();
	const outcomes: CleanupOutcome[] = [];
	for (const decision of params.decisions) {
		if (Date.now() - startedAt > budget) {
			outcomes.push({
				suggestion_id: decision.suggestion_id,
				ok: false,
				status: 'error',
				message: 'Not reached this time. It is still in the list.'
			});
			continue;
		}
		try {
			const outcome = await decideProjectSuggestion({
				supabase: params.supabase,
				userId: params.userId,
				projectId: params.projectId,
				suggestionId: decision.suggestion_id,
				action: decision.action,
				// One card sync after the batch instead of one or two per decision.
				deferInboxSync: true,
				...(decision.action === 'approve'
					? { expectedStructuralFingerprint: decision.expected_fingerprint ?? null }
					: {
							feedback: {
								reason: decision.reason,
								note:
									decision.note?.trim() ||
									(decision.action === 'address'
										? DEFAULT_ADDRESS_NOTE
										: undefined)
							}
						})
			});
			outcomes.push(toCleanupOutcome(decision, outcome));
		} catch (error) {
			// decideProjectSuggestion should not throw; one that does must not stop the rest.
			console.error('[Project cleanup] Decision failed:', decision.suggestion_id, error);
			outcomes.push({
				suggestion_id: decision.suggestion_id,
				ok: false,
				status: 'error',
				message: error instanceof Error ? error.message : 'Could not save this decision.'
			});
		}
	}
	return outcomes;
}

/** Rebuilds the project's inbox card and returns the freshly verified view (null on failure). */
export async function refreshCleanupCard(
	projectId: string
): Promise<Awaited<ReturnType<typeof loadProjectCleanupView>> | null> {
	const admin = createAdminSupabaseClient();
	try {
		await syncInboxItemForProjectCleanup({ supabase: admin, projectId });
	} catch (error) {
		console.warn(
			'[Project cleanup] Failed to sync the cleanup inbox item:',
			error instanceof Error ? error.message : error
		);
	}
	try {
		return await loadProjectCleanupView(admin, projectId, { verify: true });
	} catch (error) {
		console.warn(
			'[Project cleanup] Failed to reload the cleanup view:',
			error instanceof Error ? error.message : error
		);
		return null;
	}
}
