// apps/web/src/lib/server/voice-note-transcription.service.ts
import { createAdminSupabaseClient } from '$lib/supabase/admin';
import { addQueueJobWithPublicId } from '$lib/server/queue-job-id';

export async function queueVoiceNoteTranscription(params: {
	voiceNoteId: string;
	userId: string;
}): Promise<{ queued: boolean; jobId?: string; reason?: string }> {
	try {
		const supabase = createAdminSupabaseClient();
		const { queueJobId } = await addQueueJobWithPublicId(supabase, {
			p_user_id: params.userId,
			p_job_type: 'transcribe_voice_note',
			p_metadata: { voiceNoteId: params.voiceNoteId, userId: params.userId },
			p_priority: 8,
			p_scheduled_for: new Date().toISOString(),
			p_dedup_key: `transcribe-voice-note-${params.voiceNoteId}`
		});

		return { queued: true, jobId: queueJobId };
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to queue transcription';
		return { queued: false, reason: message };
	}
}
