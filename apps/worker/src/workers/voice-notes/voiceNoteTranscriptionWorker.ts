// apps/worker/src/workers/voice-notes/voiceNoteTranscriptionWorker.ts
import type { VoiceNoteTranscriptionJobMetadata } from '@buildos/shared-types';
import { logWorkerError } from '../../lib/errorLogger';
import { SmartLLMService } from '../../lib/services/smart-llm-service';
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

const OPENROUTER_API_KEY =
	process.env.PRIVATE_OPENROUTER_API_KEY?.trim() || process.env.OPENROUTER_API_KEY?.trim();
const DEFAULT_TRANSCRIPTION_MODEL = 'openai/gpt-4o-mini-transcribe';
const TRANSCRIPTION_MODEL =
	process.env.TRANSCRIPTION_OPENROUTER_MODEL?.trim() || DEFAULT_TRANSCRIPTION_MODEL;
const TRANSCRIPTION_FALLBACK_MODELS = (process.env.TRANSCRIPTION_OPENROUTER_FALLBACK_MODELS || '')
	.split(',')
	.map((model) => model.trim())
	.filter(Boolean);

const BASE_VOCABULARY = 'BuildOS, ontology, daily brief, phase, project context';

function normalizeMimeType(mimeType: string | null): string {
	if (!mimeType) return 'audio/webm';
	return mimeType.split(';')[0]?.trim().toLowerCase() || 'audio/webm';
}

function getAudioFormat(mimeType: string): string {
	const formats: Record<string, string> = {
		'audio/webm': 'webm',
		'audio/ogg': 'ogg',
		'audio/wav': 'wav',
		'audio/mp4': 'm4a',
		'audio/mpeg': 'mp3',
		'audio/mp3': 'mp3',
		'audio/flac': 'flac',
		'audio/x-flac': 'flac',
		'audio/aac': 'm4a'
	};
	return formats[mimeType] || 'webm';
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
	let transcriptionModel = TRANSCRIPTION_MODEL;
	console.log(`🎙️  Transcribing voice note ${voiceNoteId} for user ${userId}`);

	try {
		if (!OPENROUTER_API_KEY) {
			errorType = 'validation_error';
			throw new Error('Missing OpenRouter API key for voice note transcription');
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
		const audioBuffer = await audioBlob.arrayBuffer();
		const models = [TRANSCRIPTION_MODEL, ...TRANSCRIPTION_FALLBACK_MODELS].filter(
			(model, index, candidates) => candidates.indexOf(model) === index
		);

		stage = 'transcribe';
		errorType = 'llm_error';
		transcriptionStartTime = Date.now();
		const llmService = new SmartLLMService({
			apiKey: OPENROUTER_API_KEY,
			supabase,
			appName: 'BuildOS Voice Note Transcription'
		});
		const transcription = await llmService.transcribeAudio({
			audio: {
				kind: 'buffer',
				data: new Uint8Array(audioBuffer),
				format: getAudioFormat(mimeType)
			},
			userId,
			vocabularyTerms: BASE_VOCABULARY,
			models
		});
		const transcript = transcription.text.trim();
		if (!transcript) {
			throw new Error('No transcript returned from OpenRouter');
		}
		transcriptionModel = transcription.model;

		stage = 'update';
		errorType = 'database_error';
		const metadata: Record<string, unknown> = {
			...(voiceNote.metadata || {}),
			transcription_source: (voiceNote.metadata as any)?.transcription_source || 'audio',
			transcription_service: 'openrouter',
			transcription_latency_ms: Date.now() - (transcriptionStartTime ?? Date.now())
		};

		const { error: updateError } = await (supabase as any)
			.from('voice_notes')
			.update({
				transcript,
				transcription_status: 'complete',
				transcription_model: transcriptionModel,
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
			transcription_service: 'openrouter'
		};

		if (voiceNoteId) {
			await (supabase as any)
				.from('voice_notes')
				.update({
					transcription_status: 'failed',
					transcription_model: transcriptionModel,
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
			llmProvider: 'openrouter',
			llmModel: transcriptionModel,
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
