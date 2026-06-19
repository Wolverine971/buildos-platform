// apps/web/src/routes/api/agent-runs/[id]/commit/+server.ts
//
// Apply a staged Change Set (Phase 4). A review run finishes as 'proposal_ready'
// with a pending Change Set; this endpoint applies the approved changes through
// the same worker-safe write path used for direct commits, records per-change
// results, promotes applied entities into entities_touched, and flips the run to
// a terminal status. Default decision is 'approved' (approve-all) unless the
// body narrows it.
import type { RequestHandler } from './$types';
import { ApiResponse, HttpStatus } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { commitChangeSet } from '@buildos/shared-agent-ops';
import type { ChangeSetDecision } from '@buildos/shared-types';

export const POST: RequestHandler = async ({ params, request, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) return ApiResponse.unauthorized();

	const payload = await request.json().catch(() => null);

	const decisions: ChangeSetDecision[] = Array.isArray(payload?.decisions)
		? payload.decisions
				.filter(
					(d: unknown): d is { change_id: string; decision: string } =>
						!!d &&
						typeof (d as { change_id?: unknown }).change_id === 'string'
				)
				.map((d: { change_id: string; decision: string }) => ({
					change_id: d.change_id,
					decision: d.decision === 'rejected' ? 'rejected' : 'approved'
				}))
		: [];

	const defaultDecision: 'approved' | 'rejected' =
		payload?.default_decision === 'rejected' ? 'rejected' : 'approved';

	const admin = createAdminSupabaseClient();

	const outcome = await commitChangeSet({
		admin,
		runId: params.id,
		userId: user.id,
		decisions,
		defaultDecision
	});

	if (!outcome.ok) {
		const status =
			outcome.error.code === 'NOT_FOUND'
				? HttpStatus.NOT_FOUND
				: outcome.error.code === 'CONFLICT'
					? HttpStatus.CONFLICT
					: outcome.error.code === 'VALIDATION_ERROR'
						? HttpStatus.BAD_REQUEST
						: HttpStatus.INTERNAL_SERVER_ERROR;
		return ApiResponse.error(outcome.error.message, status, outcome.error.code);
	}

	return ApiResponse.success(outcome.result);
};
