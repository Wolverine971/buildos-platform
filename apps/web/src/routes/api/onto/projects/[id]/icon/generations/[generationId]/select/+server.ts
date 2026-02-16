// apps/web/src/routes/api/onto/projects/[id]/icon/generations/[generationId]/select/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { isValidUUID } from '$lib/utils/operations/validation-utils';
import { requireProjectAccess, validateProjectAndGenerationIds } from '../../../shared';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	try {
		const projectId = params.id?.trim() ?? '';
		const generationId = params.generationId?.trim() ?? '';
		const idValidation = validateProjectAndGenerationIds(projectId, generationId);
		if (idValidation) return idValidation;

		const access = await requireProjectAccess(locals, projectId, 'write');
		if (!access.ok) return access.response;

		const body = await request.json().catch(() => null);
		const candidateId = typeof body?.candidateId === 'string' ? body.candidateId.trim() : '';
		if (!candidateId) {
			return ApiResponse.badRequest('candidateId is required');
		}
		if (!isValidUUID(candidateId)) {
			return ApiResponse.badRequest('Invalid candidateId');
		}

		const { data: generation, error: generationError } = await access.supabase
			.from('onto_project_icon_generations')
			.select('id, project_id, steering_prompt')
			.eq('id', generationId)
			.eq('project_id', projectId)
			.maybeSingle();

		if (generationError) {
			return ApiResponse.databaseError(generationError);
		}
		if (!generation) {
			return ApiResponse.notFound('Icon generation');
		}

		const { data: candidate, error: candidateError } = await access.supabase
			.from('onto_project_icon_candidates')
			.select('id, generation_id, project_id, concept, svg_sanitized')
			.eq('id', candidateId)
			.eq('generation_id', generationId)
			.eq('project_id', projectId)
			.maybeSingle();

		if (candidateError) {
			return ApiResponse.databaseError(candidateError);
		}
		if (!candidate) {
			return ApiResponse.notFound('Icon candidate');
		}

		const now = new Date().toISOString();
		const { error: clearSelectionError } = await access.supabase
			.from('onto_project_icon_candidates')
			.update({ selected_at: null })
			.eq('generation_id', generationId)
			.eq('project_id', projectId);
		if (clearSelectionError) {
			return ApiResponse.databaseError(clearSelectionError);
		}

		const { error: markCandidateError } = await access.supabase
			.from('onto_project_icon_candidates')
			.update({ selected_at: now })
			.eq('id', candidateId)
			.eq('generation_id', generationId)
			.eq('project_id', projectId);
		if (markCandidateError) {
			return ApiResponse.databaseError(markCandidateError);
		}

		const { error: generationUpdateError } = await access.supabase
			.from('onto_project_icon_generations')
			.update({
				selected_candidate_id: candidateId,
				status: 'completed',
				completed_at: now,
				error_message: null
			})
			.eq('id', generationId)
			.eq('project_id', projectId);
		if (generationUpdateError) {
			return ApiResponse.databaseError(generationUpdateError);
		}

		const { error: projectUpdateError } = await access.supabase
			.from('onto_projects')
			.update({
				icon_svg: candidate.svg_sanitized,
				icon_concept: candidate.concept,
				icon_generated_at: now,
				icon_generation_source: 'manual',
				icon_generation_prompt: generation.steering_prompt
			})
			.eq('id', projectId)
			.is('deleted_at', null);
		if (projectUpdateError) {
			return ApiResponse.databaseError(projectUpdateError);
		}

		return ApiResponse.success({
			generationId,
			candidateId,
			concept: candidate.concept,
			applied: true
		});
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to select icon candidate');
	}
};
