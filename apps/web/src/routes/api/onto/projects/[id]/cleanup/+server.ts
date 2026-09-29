// apps/web/src/routes/api/onto/projects/[id]/cleanup/+server.ts
//
// Tasker 112: the project's one living "Project cleanup" change set.
//
// GET  /api/onto/projects/[id]/cleanup
//   -> { view }: the change set, every executable row re-verified against the live project.
//
// POST /api/onto/projects/[id]/cleanup
//   body: { decisions: [{ suggestion_id, action: 'approve' | 'dismiss' | 'address',
//           expected_fingerprint?, reason?, note? }] }
//   -> { outcomes, view }. Decisions apply one at a time through decideProjectSuggestion, so
//   each keeps its own verification, result and trail, and one failure never stops the rest.
//   An approval carries the fingerprint the card showed; a change revised since then comes
//   back as 'changed' instead of applying something the user never saw.
//
// Gated by PROJECT_LOOPS_ENABLED.

import type { RequestHandler } from './$types';
import { z } from 'zod';
import { loadProjectCleanupView } from '@buildos/shared-agent-ops/project-cleanup';
import { syncInboxItemForProjectCleanup } from '@buildos/shared-agent-ops/inbox-index';
import { PROJECT_LOOPS_ENABLED } from '$lib/config/project-loops';
import { runAfterResponse } from '$lib/server/background';
import { requireProjectMemberAccess } from '$lib/server/ontology-project-access';
import { captureServerEvent } from '$lib/server/posthog';
import {
	decideProjectSuggestion,
	type ProjectSuggestionDecisionOutcome
} from '$lib/server/project-suggestion-actions.service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { ApiResponse } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';

// Each approval re-verifies and replays its operations inline.
export const config = { maxDuration: 300 };

const MAX_CLEANUP_DECISIONS = 40;
// Stop starting new decisions well before the function limit; the rest stay in the list.
const DECISION_TIME_BUDGET_MS = 240_000;

const CLEANUP_CHANGED_MESSAGE = 'This item changed since you opened it — review the new version.';
const DEFAULT_ADDRESS_NOTE = 'Handled from the project cleanup list';

const decisionSchema = z
	.object({
		suggestion_id: z.string().trim().min(1).max(128),
		action: z.enum(['approve', 'dismiss', 'address']),
		expected_fingerprint: z.string().trim().max(256).nullable().optional(),
		reason: z
			.enum(['not_relevant', 'wrong_evidence', 'intentional', 'too_risky', 'other'])
			.optional(),
		note: z.string().max(1000).optional()
	})
	.strict();

const cleanupDecisionSchema = z
	.object({
		decisions: z.array(decisionSchema).min(1).max(MAX_CLEANUP_DECISIONS)
	})
	.strict();

type CleanupDecision = z.infer<typeof decisionSchema>;

type CleanupOutcomeStatus =
	| 'applied'
	| 'failed'
	| 'rejected'
	| 'addressed'
	| 'changed'
	| 'already_decided'
	| 'error';

type CleanupOutcome = {
	suggestion_id: string;
	ok: boolean;
	status: CleanupOutcomeStatus;
	message?: string;
};

function firstResultError(outcome: Extract<ProjectSuggestionDecisionOutcome, { ok: true }>) {
	const error = outcome.result?.errors?.find((entry) => entry?.error)?.error;
	return typeof error === 'string' && error.trim() ? error.trim() : null;
}

/** Plain-English status for one row's decision. */
function toCleanupOutcome(
	decision: CleanupDecision,
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

function dedupeDecisions(decisions: CleanupDecision[]): CleanupDecision[] {
	const seen = new Set<string>();
	return decisions.filter((decision) => {
		if (seen.has(decision.suggestion_id)) return false;
		seen.add(decision.suggestion_id);
		return true;
	});
}

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!PROJECT_LOOPS_ENABLED) return ApiResponse.notFound('Not found');

	const access = await requireProjectMemberAccess({
		locals,
		projectId: params.id,
		requiredAccess: 'read'
	});
	if (!access.ok) return access.response;

	try {
		const view = await loadProjectCleanupView(createAdminSupabaseClient(), access.projectId, {
			verify: true
		});
		return ApiResponse.success({ view });
	} catch (error) {
		return ApiResponse.databaseError(error);
	}
};

export const POST: RequestHandler = async ({ params, locals, request }) => {
	if (!PROJECT_LOOPS_ENABLED) return ApiResponse.notFound('Not found');

	const access = await requireProjectMemberAccess({
		locals,
		projectId: params.id,
		requiredAccess: 'write'
	});
	if (!access.ok) return access.response;

	const parsed = await parseJsonRequest(request, cleanupDecisionSchema);
	if (!parsed.ok) return parsed.response;
	const decisions = dedupeDecisions(parsed.data.decisions);

	const startedAt = Date.now();
	const outcomes: CleanupOutcome[] = [];
	for (const decision of decisions) {
		if (Date.now() - startedAt > DECISION_TIME_BUDGET_MS) {
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
				supabase: locals.supabase,
				userId: access.userId,
				projectId: access.projectId,
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

	const admin = createAdminSupabaseClient();
	try {
		await syncInboxItemForProjectCleanup({ supabase: admin, projectId: access.projectId });
	} catch (error) {
		console.warn(
			'[Project cleanup] Failed to sync the cleanup inbox item:',
			error instanceof Error ? error.message : error
		);
	}

	let view: Awaited<ReturnType<typeof loadProjectCleanupView>> | null = null;
	try {
		view = await loadProjectCleanupView(admin, access.projectId, { verify: true });
	} catch (error) {
		console.warn(
			'[Project cleanup] Failed to reload the cleanup view:',
			error instanceof Error ? error.message : error
		);
	}

	const count = (status: CleanupOutcomeStatus) =>
		outcomes.filter((outcome) => outcome.status === status).length;
	runAfterResponse(
		captureServerEvent(access.userId, 'project_cleanup_decisions_saved', {
			project_id: access.projectId,
			decision_count: decisions.length,
			approve_count: decisions.filter((decision) => decision.action === 'approve').length,
			dismiss_count: decisions.filter((decision) => decision.action === 'dismiss').length,
			address_count: decisions.filter((decision) => decision.action === 'address').length,
			applied: count('applied'),
			failed: count('failed'),
			changed: count('changed'),
			errors: count('error'),
			remaining_items: view?.counts.total ?? null
		}),
		'project_cleanup_decisions_saved'
	);

	return ApiResponse.success({ outcomes, view });
};
