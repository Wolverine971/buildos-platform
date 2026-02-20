// apps/web/src/routes/api/onto/projects/[id]/icon/generations/[generationId]/+server.ts
import type { RequestHandler } from './$types';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { ApiResponse } from '$lib/utils/api-response';
import { createLogger } from '$lib/utils/logger';
import { requireProjectAccess, validateProjectAndGenerationIds } from '../../shared';

const logger = createLogger('API:ProjectIconGenerationStatus');

export const GET: RequestHandler = async ({ params, locals }) => {
	try {
		const projectId = params.id?.trim() ?? '';
		const generationId = params.generationId?.trim() ?? '';
		const idValidation = validateProjectAndGenerationIds(projectId, generationId);
		if (idValidation) return idValidation;

		const access = await requireProjectAccess(locals, projectId, 'read');
		if (!access.ok) return access.response;

		const { data: generation, error: generationError } = await access.supabase
			.from('onto_project_icon_generations')
			.select(
				'id, project_id, trigger_source, steering_prompt, candidate_count, status, selected_candidate_id, error_message, created_at, updated_at, completed_at'
			)
			.eq('id', generationId)
			.eq('project_id', projectId)
			.maybeSingle();

		if (generationError) {
			return ApiResponse.databaseError(generationError);
		}
		if (!generation) {
			return ApiResponse.notFound('Icon generation');
		}

		const { data: candidates, error: candidatesError } = await access.supabase
			.from('onto_project_icon_candidates')
			.select('id, candidate_index, concept, svg_sanitized, selected_at, created_at')
			.eq('generation_id', generationId)
			.eq('project_id', projectId)
			.order('candidate_index', { ascending: true });

		if (candidatesError) {
			return ApiResponse.databaseError(candidatesError);
		}

		let resolvedGeneration = generation;
		const resolvedCandidates = candidates ?? [];

		// Queue state is useful for diagnosing "stuck queued" generations.
		let queueJob: {
			queue_job_id: string;
			status: string;
			attempts: number;
			max_attempts: number;
			error_message: string | null;
			created_at: string;
			started_at: string | null;
			completed_at: string | null;
		} | null = null;
		let adminClient: ReturnType<typeof createAdminSupabaseClient> | null = null;

		try {
			adminClient = createAdminSupabaseClient();
			const { data: latestQueueJob } = await adminClient
				.from('queue_jobs')
				.select(
					'queue_job_id, status, attempts, max_attempts, error_message, created_at, started_at, completed_at'
				)
				.eq('job_type', 'generate_project_icon')
				.eq('metadata->>generationId', generationId)
				.eq('metadata->>projectId', projectId)
				.order('created_at', { ascending: false })
				.limit(1)
				.maybeSingle();

			if (latestQueueJob) {
				const raw = latestQueueJob as Record<string, unknown>;
				queueJob = {
					queue_job_id:
						typeof raw.queue_job_id === 'string' ? raw.queue_job_id : 'unknown',
					status: typeof raw.status === 'string' ? raw.status : 'pending',
					attempts: typeof raw.attempts === 'number' ? raw.attempts : 0,
					max_attempts: typeof raw.max_attempts === 'number' ? raw.max_attempts : 0,
					error_message: typeof raw.error_message === 'string' ? raw.error_message : null,
					created_at:
						typeof raw.created_at === 'string'
							? raw.created_at
							: new Date().toISOString(),
					started_at: typeof raw.started_at === 'string' ? raw.started_at : null,
					completed_at: typeof raw.completed_at === 'string' ? raw.completed_at : null
				};
			}
		} catch (queueLookupError) {
			// Do not fail status reads if queue diagnostics lookup fails.
			logger.warn('Queue diagnostics lookup failed for icon generation', {
				projectId,
				generationId,
				error: queueLookupError
			});
		}

		if (
			resolvedGeneration.trigger_source !== 'auto' &&
			(resolvedGeneration.status === 'queued' ||
				resolvedGeneration.status === 'processing') &&
			resolvedCandidates.length > 0
		) {
			const completedAt = resolvedGeneration.completed_at ?? new Date().toISOString();
			const selectedCandidateId =
				resolvedGeneration.selected_candidate_id ??
				resolvedCandidates.find((candidate: { id: string; selected_at: string | null }) =>
					Boolean(candidate.selected_at)
				)?.id ??
				null;

			logger.warn(
				'Generation has candidates while still non-terminal; reconciling status to completed',
				{
					projectId,
					generationId,
					generationStatus: resolvedGeneration.status,
					queueStatus: queueJob?.status ?? null,
					queueJobId: queueJob?.queue_job_id ?? null,
					candidateCount: resolvedCandidates.length
				}
			);

			resolvedGeneration = {
				...resolvedGeneration,
				status: 'completed',
				error_message: null,
				completed_at: completedAt,
				selected_candidate_id: selectedCandidateId
			};

			// Intentionally do not persist from GET.
			// This endpoint must remain side-effect free for read-only users.
		}

		if (
			queueJob &&
			(resolvedGeneration.status === 'queued' ||
				resolvedGeneration.status === 'processing') &&
			(queueJob.status === 'failed' || queueJob.status === 'cancelled')
		) {
			logger.warn('Generation status is active while queue job is terminal', {
				projectId,
				generationId,
				generationStatus: resolvedGeneration.status,
				queueStatus: queueJob.status,
				queueJobId: queueJob.queue_job_id,
				queueError: queueJob.error_message
			});
		}

		return ApiResponse.success({
			generation: resolvedGeneration,
			candidates: resolvedCandidates,
			queueJob
		});
	} catch (error) {
		logger.error(error instanceof Error ? error : 'Unknown icon generation status error', {
			projectId: params.id?.trim() ?? null,
			generationId: params.generationId?.trim() ?? null
		});
		return ApiResponse.internalError(error, 'Failed to fetch icon generation');
	}
};
