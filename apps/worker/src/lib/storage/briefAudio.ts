// apps/worker/src/lib/storage/briefAudio.ts
import { supabase } from '../supabase';

export const BRIEF_AUDIO_BUCKET = 'brief-audio';

export function buildBriefAudioStoragePath(userId: string, briefId: string): string {
	return `${userId}/${briefId}.mp3`;
}

export async function uploadBriefAudio(params: {
	userId: string;
	briefId: string;
	audio: Buffer;
}): Promise<string> {
	const storagePath = buildBriefAudioStoragePath(params.userId, params.briefId);

	const { error } = await supabase.storage
		.from(BRIEF_AUDIO_BUCKET)
		.upload(storagePath, params.audio, {
			contentType: 'audio/mpeg',
			cacheControl: '31536000',
			upsert: true
		});

	if (error) {
		throw new Error(`Failed to upload brief audio: ${error.message}`);
	}

	return storagePath;
}
