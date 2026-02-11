// apps/web/src/routes/api/onto/projects/[id]/full/+server.ts
/**
 * GET /api/onto/projects/[id]/full
 * OPTIMIZED: Fetch project with all related entities using single RPC
 *
 * This endpoint uses the get_project_full() database function which
 * fetches all project data in a single database round-trip, replacing
 * 13+ separate queries.
 *
 * Performance improvement: ~100-300ms faster than the standard endpoint
 *
 * Note: FSM transitions removed - using simple enum states now (see FSM_SIMPLIFICATION_COMPLETE.md)
 */

import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { logOntologyApiError } from '../../../shared/error-logging';
import type { Database } from '@buildos/shared-types';
import { decorateMilestonesWithGoals } from '$lib/server/milestone-decorators';
import { isValidUUID } from '$lib/utils/operations/validation-utils';

// Type for the RPC response
interface ProjectFullData {
	project: Record<string, unknown>;
	goals: unknown[];
	requirements: unknown[];
	plans: unknown[];
	tasks: unknown[];
	documents: unknown[];
	sources: unknown[];
	milestones: unknown[];
	risks: unknown[];
	metrics: unknown[];
	context_document: unknown | null;
}

type MilestoneRow = Database['public']['Tables']['onto_milestones']['Row'];
type GoalRow = Database['public']['Tables']['onto_goals']['Row'];

const extractErrorMessage = (error: unknown): string => {
	if (!error) return 'Unknown error';
	if (error instanceof Error) return error.message;
	if (typeof error === 'string') return error;
	if (typeof error === 'object') {
		const err = error as Record<string, unknown>;
		const message = typeof err.message === 'string' ? err.message : null;
		if (message) return message;
		const errorDescription =
			typeof err.error_description === 'string' ? err.error_description : null;
		if (errorDescription) return errorDescription;
		const errorMessage = typeof err.error === 'string' ? err.error : null;
		if (errorMessage) return errorMessage;
		const details = typeof err.details === 'string' ? err.details : null;
		if (details) return details;
		const hint = typeof err.hint === 'string' ? err.hint : null;
		if (hint) return hint;
		try {
			return JSON.stringify(err);
		} catch {
			return String(error);
		}
	}
	return String(error);
};

export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		const { user } = await locals.safeGetSession();

		const { id } = params;

		if (!id) {
			return ApiResponse.badRequest('Project ID required');
		}
		if (!isValidUUID(id)) {
			return ApiResponse.badRequest('Invalid project ID');
		}

		const supabase = locals.supabase;
		let actorId: string | null = null;

		// Get actor ID for authorization check
		if (user) {
			const { data, error: actorError } = await supabase.rpc('ensure_actor_for_user', {
				p_user_id: user.id
			});

			if (actorError || !data) {
				console.error('[Project Full API] Failed to get actor:', actorError);
				await logOntologyApiError({
					supabase,
					error: actorError || new Error('Failed to resolve user actor'),
					endpoint: `/api/onto/projects/${id}/full`,
					method: 'GET',
					userId: user.id,
					projectId: id,
					entityType: 'project',
					operation: 'project_actor_resolve'
				});
				return ApiResponse.internalError(
					actorError || new Error('Failed to resolve user actor'),
					'Failed to resolve user actor'
				);
			}

			actorId = data as string;
		}

		// OPTIMIZED: Single RPC call for all project data
		// Note: actorId can be null for anonymous access to public projects
		const { data, error } = (await supabase.rpc('get_project_full', {
			p_project_id: id,
			p_actor_id: actorId!
		})) as { data: ProjectFullData | null; error: unknown };

		if (error) {
			console.error('[Project Full API] RPC error:', error);
			await logOntologyApiError({
				supabase,
				error,
				endpoint: `/api/onto/projects/${id}/full`,
				method: 'GET',
				userId: user?.id,
				projectId: id,
				entityType: 'project',
				operation: 'project_full_get'
			});
			const errorMessage = extractErrorMessage(error);
			return ApiResponse.error(`Failed to fetch project: ${errorMessage}`, 500);
		}

		if (!data) {
			return ApiResponse.notFound('Project');
		}

		const goals = (data.goals || []) as GoalRow[];
		const milestones = (data.milestones || []) as MilestoneRow[];

		const { milestones: decoratedMilestones } = await decorateMilestonesWithGoals(
			supabase,
			goals,
			milestones
		);

		// Fetch doc_structure separately (RPC may not include it)
		const { data: projectRow, error: projectError } = await supabase
			.from('onto_projects')
			.select('doc_structure')
			.eq('id', id)
			.maybeSingle();

		if (projectError) {
			console.error('[Project Full API] Failed to fetch doc_structure:', projectError);
		}
		if (projectRow && data.project && typeof data.project === 'object') {
			(data.project as Record<string, unknown>).doc_structure =
				projectRow.doc_structure ?? null;
		}

		return ApiResponse.success({
			project: data.project,
			goals,
			requirements: data.requirements || [],
			plans: data.plans || [],
			tasks: data.tasks || [],
			documents: data.documents || [],
			sources: data.sources || [],
			milestones: decoratedMilestones,
			risks: data.risks || [],
			metrics: data.metrics || [],
			context_document: data.context_document
		});
	} catch (err) {
		console.error('[Project Full API] Unexpected error:', err);
		await logOntologyApiError({
			supabase: locals.supabase,
			error: err,
			endpoint: `/api/onto/projects/${params.id ?? ''}/full`,
			method: 'GET',
			userId: (await locals.safeGetSession()).user?.id,
			projectId: params.id,
			entityType: 'project',
			operation: 'project_full_get'
		});
		return ApiResponse.internalError(err, 'An unexpected error occurred');
	}
};
