// apps/web/src/lib/server/voice-note-transcription.service.ts
import { createAdminSupabaseClient } from '$lib/supabase/admin';

export async function queueVoiceNoteTranscription(params: {
	voiceNoteId: string;
	userId: string;
}): Promise<{ queued: boolean; jobId?: string; reason?: string }> {
	try {
		const supabase = createAdminSupabaseClient();
		const { data, error } = await supabase.rpc('add_queue_job', {
			p_user_id: params.userId,
			p_job_type: 'transcribe_voice_note',
			p_metadata: { voiceNoteId: params.voiceNoteId, userId: params.userId },
			p_priority: 8,
			p_scheduled_for: new Date().toISOString(),
			p_dedup_key: `transcribe-voice-note-${params.voiceNoteId}`
		});

		if (error) {
			return { queued: false, reason: error.message };
		}

		return { queued: true, jobId: data as string };
	} catch (error) {
		const message = error instanceof Error ? error.message : 'Failed to queue transcription';
		return { queued: false, reason: message };
	}
}
