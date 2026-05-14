// apps/web/src/routes/api/daily-briefs/[id]/audio-request/+server.ts
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { mapOntologyDailyBriefRow } from '$lib/services/dailyBrief/ontology-mappers';

const AUDIO_JOB_TYPE = 'generate_brief_audio';
const AUDIO_JOB_PRIORITY = 20;
const AUDIO_JOB_MAX_ATTEMPTS = 1;

function buildBriefAudioStoragePath(userId: string, briefId: string): string {
	return `${userId}/${briefId}.mp3`;
}

export const POST: RequestHandler = async ({ params, locals: { safeGetSession } }) => {
	const { user } = await safeGetSession();
	if (!user) {
		return ApiResponse.unauthorized();
	}

	try {
		const admin = createAdminSupabaseClient();

		const { data: profile, error: profileError } = await admin
			.from('users')
			.select('is_admin, voice_narration_enabled')
			.eq('id', user.id)
			.maybeSingle();

		if (profileError) throw profileError;
		if (!profile?.is_admin) {
			return ApiResponse.forbidden('Voice narration is currently available to admins only');
		}
		if (!profile.voice_narration_enabled) {
			return ApiResponse.badRequest('Voice narration is disabled for this account');
		}

		const { data: existingBrief, error: briefError } = await admin
			.from('ontology_daily_briefs')
			.select('*')
			.eq('id', params.id)
			.eq('user_id', user.id)
			.maybeSingle();

		if (briefError) throw briefError;
		if (!existingBrief) {
			return ApiResponse.notFound('Brief');
		}

		if (existingBrief.audio_status === 'ready' && existingBrief.audio_storage_path) {
			return ApiResponse.success({
				brief: mapOntologyDailyBriefRow(existingBrief),
				queued: false
			});
		}

		const requestedAt = new Date().toISOString();
		const storagePath = buildBriefAudioStoragePath(user.id, params.id);

		const { data: updatedBrief, error: updateError } = await admin
			.from('ontology_daily_briefs')
			.update({
				audio_status: 'pending',
				audio_storage_path: storagePath,
				audio_error: null,
				audio_duration_ms: null,
				audio_generation_ms: null,
				audio_requested_at: requestedAt,
				audio_generation_started_at: null,
				audio_generated_at: null,
				updated_at: requestedAt
			})
			.eq('id', params.id)
			.eq('user_id', user.id)
			.select('*')
			.single();

		if (updateError) throw updateError;

		const { data: jobId, error: queueError } = await admin.rpc('add_queue_job', {
			p_user_id: user.id,
			p_job_type: AUDIO_JOB_TYPE,
			p_metadata: { briefId: params.id },
			p_priority: AUDIO_JOB_PRIORITY,
			p_scheduled_for: requestedAt,
			p_dedup_key: `brief-audio-${params.id}-${Date.parse(requestedAt)}`
		});

		if (queueError) throw queueError;

		if (typeof jobId === 'string') {
			const { error: maxAttemptsError } = await admin
				.from('queue_jobs')
				.update({
					max_attempts: AUDIO_JOB_MAX_ATTEMPTS,
					updated_at: new Date().toISOString()
				})
				.eq('id', jobId);

			if (maxAttemptsError) throw maxAttemptsError;
		}

		return ApiResponse.success(
			{
				brief: mapOntologyDailyBriefRow(updatedBrief),
				jobId,
				queued: true
			},
			'Audio narration queued'
		);
	} catch (error) {
		return ApiResponse.internalError(error, 'Failed to queue audio narration');
	}
};
