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
import { expireInboxItemsForProject } from '@buildos/shared-agent-ops/inbox-index';
import type { ChangeSetDecision } from '@buildos/shared-types';

const DELETED_PROJECT_COMMIT_MESSAGE =
	'This proposal belongs to a deleted project and can no longer be applied.';

export const POST: RequestHandler = async ({ params, request, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) return ApiResponse.unauthorized();

	const payload = await request.json().catch(() => null);

	const decisions: ChangeSetDecision[] = Array.isArray(payload?.decisions)
		? payload.decisions
				.filter(
					(d: unknown): d is { change_id: string; decision: string } =>
						!!d && typeof (d as { change_id?: unknown }).change_id === 'string'
				)
				.map((d: { change_id: string; decision: string }) => ({
					change_id: d.change_id,
					decision: d.decision === 'rejected' ? 'rejected' : 'approved'
				}))
		: [];

	const defaultDecision: 'approved' | 'rejected' =
		payload?.default_decision === 'rejected' ? 'rejected' : 'approved';

	const admin = createAdminSupabaseClient();
	const { data: run, error: runError } = await admin
		.from('agent_runs')
		.select('id, user_id, project_id, status')
		.eq('id', params.id)
		.eq('user_id', user.id)
		.maybeSingle();
	if (runError) return ApiResponse.databaseError(runError);
	if (!run) return ApiResponse.notFound('Agent run');

	if (run.project_id) {
		const { data: project, error: projectError } = await admin
			.from('onto_projects')
			.select('id, deleted_at')
			.eq('id', run.project_id)
			.maybeSingle();
		if (projectError) return ApiResponse.databaseError(projectError);
		if (!project || project.deleted_at) {
			if (run.status === 'proposal_ready') {
				const { error: cancelError } = await admin
					.from('agent_runs')
					.update({
						status: 'cancelled',
						error: 'Project was deleted before proposal review',
						completed_at: new Date().toISOString(),
						commit_started_at: null
					} as never)
					.eq('id', run.id)
					.eq('user_id', user.id)
					.eq('status', 'proposal_ready');
				if (cancelError) return ApiResponse.databaseError(cancelError);
			}
			try {
				await expireInboxItemsForProject({
					supabase: admin as any,
					projectId: run.project_id
				});
			} catch (expireError) {
				return ApiResponse.databaseError(expireError);
			}
			return ApiResponse.error(
				DELETED_PROJECT_COMMIT_MESSAGE,
				HttpStatus.CONFLICT,
				'PROJECT_DELETED'
			);
		}
	}

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
