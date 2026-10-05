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
import { PROJECT_LOOPS_ENABLED } from '$lib/config/project-loops';
import { runAfterResponse } from '$lib/server/background';
import { requireProjectMemberAccess } from '$lib/server/ontology-project-access';
import { captureServerEvent } from '$lib/server/posthog';
import {
	dedupeCleanupDecisions,
	refreshCleanupCard,
	runCleanupDecisions,
	type CleanupOutcomeStatus
} from '$lib/server/project-cleanup-decisions.service';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { ApiResponse } from '$lib/utils/api-response';
import { parseJsonRequest } from '$lib/utils/request-validation';

// Each approval re-verifies and replays its operations inline.
export const config = { maxDuration: 300 };

const MAX_CLEANUP_DECISIONS = 40;

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
	const decisions = dedupeCleanupDecisions(parsed.data.decisions);

	const outcomes = await runCleanupDecisions({
		supabase: locals.supabase,
		userId: access.userId,
		projectId: access.projectId,
		decisions
	});
	const view = await refreshCleanupCard(access.projectId);

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
