// apps/worker/src/workers/briefAudio/enqueueBriefAudio.ts
import { supabase } from '../../lib/supabase';
import { buildBriefAudioStoragePath } from '../../lib/storage/briefAudio';

const AUDIO_JOB_TYPE = 'generate_brief_audio';
const AUDIO_JOB_PRIORITY = 20;
const MAX_AUDIO_ERROR_LENGTH = 1000;

type VoiceNarrationEligibility = {
	is_admin: boolean | null;
	voice_narration_enabled: boolean | null;
};

async function fetchEligibility(userId: string): Promise<VoiceNarrationEligibility | null> {
	const { data, error } = await supabase
		.from('users')
		.select('is_admin, voice_narration_enabled')
		.eq('id', userId)
		.maybeSingle();

	if (error) {
		throw new Error(`Failed to load voice narration eligibility: ${error.message}`);
	}

	return data as VoiceNarrationEligibility | null;
}

async function resetAudioState(briefId: string, userId: string): Promise<void> {
	const { error } = await supabase
		.from('ontology_daily_briefs')
		.update({
			audio_status: 'none',
			audio_storage_path: null,
			audio_voice: null,
			audio_model: null,
			audio_duration_ms: null,
			audio_generation_ms: null,
			audio_requested_at: null,
			audio_generation_started_at: null,
			audio_generated_at: null,
			audio_error: null,
			updated_at: new Date().toISOString()
		})
		.eq('id', briefId)
		.eq('user_id', userId);

	if (error) {
		throw new Error(`Failed to reset brief audio state: ${error.message}`);
	}
}

function truncateErrorMessage(message: string): string {
	return message.length > MAX_AUDIO_ERROR_LENGTH
		? `${message.slice(0, MAX_AUDIO_ERROR_LENGTH - 3)}...`
		: message;
}

export async function enqueueBriefAudioIfEnabled(params: {
	briefId: string;
	userId: string;
}): Promise<void> {
	const eligibility = await fetchEligibility(params.userId);
	const enabled = Boolean(eligibility?.is_admin && eligibility.voice_narration_enabled);

	if (!enabled) {
		await resetAudioState(params.briefId, params.userId);
		return;
	}

	const requestedAt = new Date().toISOString();
	const expectedStoragePath = buildBriefAudioStoragePath(params.userId, params.briefId);

	const { data: updatedBrief, error: updateError } = await supabase
		.from('ontology_daily_briefs')
		.update({
			audio_status: 'pending',
			audio_storage_path: expectedStoragePath,
			audio_error: null,
			audio_duration_ms: null,
			audio_generation_ms: null,
			audio_requested_at: requestedAt,
			audio_generation_started_at: null,
			audio_generated_at: null,
			updated_at: requestedAt
		})
		.eq('id', params.briefId)
		.eq('user_id', params.userId)
		.select('id')
		.maybeSingle();

	if (updateError) {
		throw new Error(`Failed to mark brief audio pending: ${updateError.message}`);
	}

	if (!updatedBrief) {
		throw new Error(`Brief ${params.briefId} not found for user ${params.userId}`);
	}

	const { error: queueError } = await supabase.rpc('add_queue_job', {
		p_user_id: params.userId,
		p_job_type: AUDIO_JOB_TYPE,
		p_metadata: { briefId: params.briefId },
		p_priority: AUDIO_JOB_PRIORITY,
		p_scheduled_for: requestedAt,
		p_dedup_key: `brief-audio-${params.briefId}`
	});

	if (queueError) {
		await supabase
			.from('ontology_daily_briefs')
			.update({
				audio_status: 'failed',
				audio_error: truncateErrorMessage(queueError.message),
				updated_at: new Date().toISOString()
			})
			.eq('id', params.briefId)
			.eq('user_id', params.userId);

		throw new Error(`Failed to enqueue brief audio job: ${queueError.message}`);
	}
}
