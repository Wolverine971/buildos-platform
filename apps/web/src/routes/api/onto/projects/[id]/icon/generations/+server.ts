// apps/web/src/routes/api/onto/projects/[id]/icon/generations/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { queueProjectIconGeneration } from '$lib/server/project-icon-generation.service';
import {
	parseCandidateCount,
	normalizePrompt,
	requireProjectAccess,
	validateProjectAndGenerationIds
} from '../shared';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	try {
		const projectId = params.id?.trim() ?? '';
		const projectIdValidation = validateProjectAndGenerationIds(projectId);
		if (projectIdValidation) return projectIdValidation;

		const access = await requireProjectAccess(locals, projectId, 'write');
		if (!access.ok) return access.response;

		const body = await request.json().catch(() => ({}));
		if (!body || typeof body !== 'object') {
			return ApiResponse.badRequest('Invalid request body');
		}

		const payload = body as Record<string, unknown>;
		const steeringPromptInput = payload.steeringPrompt;
		if (
			steeringPromptInput !== undefined &&
			steeringPromptInput !== null &&
			typeof steeringPromptInput !== 'string'
		) {
			return ApiResponse.badRequest('steeringPrompt must be a string');
		}

		const steeringPrompt = normalizePrompt(steeringPromptInput);
		const candidateCount = parseCandidateCount(payload.candidateCount);
		if (candidateCount === null) {
			return ApiResponse.badRequest('candidateCount must be an integer between 1 and 8');
		}

		const { data: generation, error: generationError } = await access.supabase
			.from('onto_project_icon_generations')
			.insert({
				project_id: projectId,
				requested_by: access.userId,
				trigger_source: 'manual',
				steering_prompt: steeringPrompt,
				candidate_count: candidateCount,
				status: 'queued'
			})
			.select('id, status')
			.single();

		if (generationError || !generation) {
			return ApiResponse.databaseError(generationError);
		}

		const queueResult = await queueProjectIconGeneration({
			projectId,
			generationId: generation.id,
			userId: access.userId,
			triggerSource: 'manual',
			steeringPrompt: steeringPrompt ?? undefined,
			candidateCount,
			autoSelect: false,
			priority: 8,
			dedupKey: `project-icon:generation:${generation.id}`
		});

		if (!queueResult.queued) {
			await access.supabase
				.from('onto_project_icon_generations')
				.update({
					status: 'failed',
					error_message: queueResult.reason ?? 'Failed to queue job',
					completed_at: new Date().toISOString()
				})
				.eq('id', generation.id)
				.eq('project_id', projectId);

			return ApiResponse.error('Failed to queue icon generation', 500);
		}

		return ApiResponse.created({
			generationId: generation.id,
			status: generation.status,
			queueJobId: queueResult.jobId ?? null
		});
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to create icon generation');
	}
};
