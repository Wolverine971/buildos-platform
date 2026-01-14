// apps/worker/src/workers/voice-notes/voiceNoteTranscriptionWorker.ts
import type { VoiceNoteTranscriptionJobMetadata } from '@buildos/shared-types';
import { logWorkerError } from '../../lib/errorLogger';
import { supabase } from '../../lib/supabase';
import type { LegacyJob } from '../shared/jobAdapter';

type VoiceNoteRecord = {
	id: string;
	user_id: string;
	storage_bucket: string;
	storage_path: string;
	mime_type: string | null;
	transcript: string | null;
	transcription_status: string | null;
	metadata: Record<string, unknown> | null;
	deleted_at: string | null;
};

const OPENAI_API_KEY =
	process.env.OPENAI_API_KEY?.trim() || process.env.PRIVATE_OPENAI_API_KEY?.trim();
// const TRANSCRIPTION_MODEL = process.env.TRANSCRIPTION_MODEL || 'gpt-4o-transcribe';
// NOTE: Testing the cheaper model to reduce transcription costs.
const TRANSCRIPTION_MODEL = process.env.TRANSCRIPTION_MODEL || 'gpt-4o-mini-transcribe';
const OPENAI_TRANSCRIBE_URL = 'https://api.openai.com/v1/audio/transcriptions';

const BASE_VOCABULARY = 'BuildOS, brain dump, ontology, daily brief, phase, project context';

function buildFilename(storagePath: string, mimeType: string | null): string {
	const basename = storagePath.split('/').pop();
	if (basename) return basename;

	if (mimeType?.includes('ogg')) return 'voice-note.ogg';
	if (mimeType?.includes('mpeg') || mimeType?.includes('mp3')) return 'voice-note.mp3';
	if (mimeType?.includes('wav')) return 'voice-note.wav';
	if (mimeType?.includes('mp4') || mimeType?.includes('aac')) return 'voice-note.m4a';
	return 'voice-note.webm';
}

function normalizeMimeType(mimeType: string | null): string {
	if (!mimeType) return 'audio/webm';
	return mimeType.split(';')[0]?.trim().toLowerCase() || 'audio/webm';
}

export async function processVoiceNoteTranscriptionJob(
	job: LegacyJob<VoiceNoteTranscriptionJobMetadata>
) {
	const { voiceNoteId, userId } = job.data;
	let voiceNote: VoiceNoteRecord | null = null;
	let stage: 'validate' | 'fetch' | 'download' | 'transcribe' | 'update' | 'unknown' = 'validate';
	let errorType: 'validation_error' | 'database_error' | 'api_error' | 'llm_error' | 'unknown' =
		'unknown';
	let transcriptionStartTime: number | null = null;
	console.log(`🎙️  Transcribing voice note ${voiceNoteId} for user ${userId}`);

	try {
		if (!OPENAI_API_KEY) {
			errorType = 'validation_error';
			throw new Error('Missing OpenAI API key for voice note transcription');
		}

		stage = 'fetch';
		errorType = 'database_error';
		const { data: fetchedNote, error: fetchError } = (await (supabase as any)
			.from('voice_notes')
			.select(
				'id, user_id, storage_bucket, storage_path, mime_type, transcript, transcription_status, metadata, deleted_at'
			)
			.eq('id', voiceNoteId)
			.single()) as { data: VoiceNoteRecord | null; error: any };

		if (fetchError || !fetchedNote) {
			throw new Error(fetchError?.message || 'Voice note not found');
		}

		voiceNote = fetchedNote;

		if (voiceNote.user_id !== userId) {
			throw new Error('Voice note user mismatch');
		}

		if (voiceNote.deleted_at) {
			console.log(`⏭️  Voice note ${voiceNoteId} deleted, skipping`);
			return { success: true, voiceNoteId, skipped: true, reason: 'deleted' };
		}

		if (voiceNote.transcription_status === 'complete' && voiceNote.transcript) {
			console.log(`⏭️  Voice note ${voiceNoteId} already transcribed, skipping`);
			return {
				success: true,
				voiceNoteId,
				skipped: true,
				reason: 'already_transcribed',
				transcriptLength: voiceNote.transcript.length
			};
		}

		stage = 'download';
		errorType = 'api_error';
		const { data: audioBlob, error: downloadError } = await supabase.storage
			.from(voiceNote.storage_bucket)
			.download(voiceNote.storage_path);

		if (downloadError || !audioBlob) {
			throw new Error(downloadError?.message || 'Failed to download voice note audio');
		}

		const mimeType = normalizeMimeType(voiceNote.mime_type || audioBlob.type);
		const filename = buildFilename(voiceNote.storage_path, mimeType);
		const audioBuffer = await audioBlob.arrayBuffer();
		const audioFile = new Blob([audioBuffer], { type: mimeType });

		const formData = new FormData();
		formData.append('file', audioFile, filename);
		formData.append('model', TRANSCRIPTION_MODEL);
		formData.append('response_format', 'json');
		formData.append('temperature', '0.2');
		formData.append('prompt', BASE_VOCABULARY);

		stage = 'transcribe';
		errorType = 'llm_error';
		transcriptionStartTime = Date.now();
		const response = await fetch(OPENAI_TRANSCRIBE_URL, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${OPENAI_API_KEY}`
			},
			body: formData
		});

		const payload = await response.json().catch(() => ({}));
		if (!response.ok) {
			const message =
				payload?.error?.message || `OpenAI transcription failed (${response.status})`;
			throw new Error(message);
		}

		const transcript = typeof payload?.text === 'string' ? payload.text.trim() : '';
		if (!transcript) {
			throw new Error('No transcript returned from OpenAI');
		}

		stage = 'update';
		errorType = 'database_error';
		const metadata: Record<string, unknown> = {
			...(voiceNote.metadata || {}),
			transcription_source: (voiceNote.metadata as any)?.transcription_source || 'audio',
			transcription_service: 'openai',
			transcription_latency_ms: Date.now() - (transcriptionStartTime ?? Date.now())
		};

		const { error: updateError } = await (supabase as any)
			.from('voice_notes')
			.update({
				transcript,
				transcription_status: 'complete',
				transcription_model: TRANSCRIPTION_MODEL,
				transcription_error: null,
				metadata
			})
			.eq('id', voiceNoteId);

		if (updateError) {
			throw new Error(updateError.message);
		}

		return { success: true, voiceNoteId, transcriptLength: transcript.length };
	} catch (error: any) {
		const message = error instanceof Error ? error.message : 'Transcription failed';
		const fallbackMetadata: Record<string, unknown> = {
			...(voiceNote?.metadata || {}),
			transcription_source: (voiceNote?.metadata as any)?.transcription_source || 'audio',
			transcription_service: 'openai'
		};

		if (voiceNoteId) {
			await (supabase as any)
				.from('voice_notes')
				.update({
					transcription_status: 'failed',
					transcription_model: TRANSCRIPTION_MODEL,
					transcription_error: message,
					metadata: fallbackMetadata
				})
				.eq('id', voiceNoteId);
		}

		await logWorkerError(error, {
			userId,
			tableName: 'voice_notes',
			recordId: voiceNoteId,
			operationType: 'transcribe_voice_note',
			llmProvider: 'openai',
			llmModel: TRANSCRIPTION_MODEL,
			responseTimeMs: transcriptionStartTime
				? Date.now() - transcriptionStartTime
				: undefined,
			errorType,
			metadata: {
				stage,
				queue_job_id: job.id,
				storage_bucket: voiceNote?.storage_bucket,
				storage_path: voiceNote?.storage_path
			}
		});

		throw error;
	}
}
