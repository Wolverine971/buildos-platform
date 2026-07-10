// apps/web/src/routes/api/transcribe/+server.ts

// Audio upload + Whisper round-trip — needs higher memory for the file buffer
// and longer duration for slower transcriptions.
export const config = {
	maxDuration: 120,
	memory: 1024
};

import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';
import { ErrorLoggerService } from '$lib/services/errorLogger.service';
import { SmartLLMService } from '$lib/services/smart-llm-service';
import {
	estimateTranscriptionReservation,
	expensiveOperationLimiter,
	type ExpensiveOperationLease,
	withRateLimitHeaders
} from '$lib/server/expensive-operation-limiter';

const DEFAULT_OPENROUTER_TRANSCRIPTION_MODEL = 'openai/gpt-4o-mini-transcribe';

// Timeout and retry configuration
const TRANSCRIPTION_TIMEOUT_MS = 30000; // 30 seconds timeout
const MAX_RETRIES = 2; // Maximum retry attempts
const INITIAL_RETRY_DELAY_MS = 1000; // 1 second initial delay

function parseModelList(value?: string | null): string[] {
	if (!value) return [];
	return value
		.split(',')
		.map((model) => model.trim())
		.filter(Boolean);
}

// MIME type to file extension mapping for speech-to-text API compatibility
const MIME_TO_EXTENSION: Record<string, string> = {
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

// Get the correct file extension for the transcription request
function getFileExtension(mimeType: string, filename?: string): string {
	// Strip codec information from MIME type
	const baseMimeType = mimeType?.split(';')[0]?.trim();

	// First, try to get extension from cleaned MIME type
	if (baseMimeType && MIME_TO_EXTENSION[baseMimeType]) {
		return MIME_TO_EXTENSION[baseMimeType];
	}

	// Fallback: try to extract from filename if provided
	if (filename && filename.includes('.')) {
		const ext = filename.split('.').pop()?.toLowerCase();
		if (ext && isSupportedFormat(ext)) {
			return ext === 'mp4' ? 'm4a' : ext;
		}
	}

	// Default fallback - webm is widely supported
	// console.warn(`[Transcribe] Unknown MIME type: ${mimeType}, defaulting to webm`);
	return 'webm';
}

// Validate if the format is supported by the transcription API
function isSupportedFormat(extension: string): boolean {
	const supportedFormats = [
		'flac',
		'm4a',
		'mp3',
		'mp4',
		'mpeg',
		'mpga',
		'oga',
		'ogg',
		'wav',
		'webm'
	];
	return supportedFormats.includes(extension.toLowerCase());
}

export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	const startTime = Date.now();
	const errorLogger = ErrorLoggerService.getInstance(supabase);
	let audioFile: File | null = null;
	let customVocabulary: string | null = null;
	let userId: string | null = null;
	let operationLease: ExpensiveOperationLease | null = null;
	let transcriptionModel =
		env.TRANSCRIPTION_OPENROUTER_MODEL?.trim() || DEFAULT_OPENROUTER_TRANSCRIPTION_MODEL;

	try {
		// Authentication check
		const { user } = await safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized();
		}
		userId = user.id;

		// Parse the form data to get audio file and metadata
		const formData = await request.formData();
		audioFile = formData.get('audio') as File;
		customVocabulary = formData.get('vocabularyTerms') as string | null;

		if (!audioFile || audioFile.size === 0) {
			return ApiResponse.badRequest('No audio data received');
		}

		const operationDecision = expensiveOperationLimiter.acquire({
			userId,
			policyKey: 'transcribe',
			estimatedCost: estimateTranscriptionReservation(audioFile.size)
		});
		if (!operationDecision.allowed) {
			return withRateLimitHeaders(
				ApiResponse.error(operationDecision.message, 429, 'RATE_LIMITED', {
					retryAfter: operationDecision.retryAfterSeconds,
					reason: operationDecision.reason
				}),
				operationDecision.headers
			);
		}
		operationLease = operationDecision.lease;

		// Log received file details and model being used
		console.log(
			`[Transcribe] Received: ${audioFile.size} bytes, Type: ${audioFile.type}, Name: ${audioFile.name}, Model: ${transcriptionModel}, Provider: OpenRouter`
		);

		// Determine the correct file extension
		const extension = getFileExtension(audioFile.type, audioFile.name);
		const filename = `audio.${extension}`;

		// Validate format support
		if (!isSupportedFormat(extension)) {
			console.error(
				`[Transcribe] Unsupported format: ${extension} (MIME: ${audioFile.type})`
			);
			return ApiResponse.badRequest(
				`Unsupported audio format: ${extension}. Supported formats: flac, m4a, mp3, mp4, mpeg, mpga, oga, ogg, wav, webm`
			);
		}

		// Preserve the browser recording format for OpenRouter's transcription API.
		const audioBlob = new Blob([await audioFile.arrayBuffer()], { type: audioFile.type });
		const transcriptionFile = new File([audioBlob], filename, { type: audioFile.type });

		const openrouterModels = [
			transcriptionModel,
			...parseModelList(env.TRANSCRIPTION_OPENROUTER_FALLBACK_MODELS)
		].filter((model, index, models) => model && models.indexOf(model) === index);
		transcriptionModel = openrouterModels[0] ?? DEFAULT_OPENROUTER_TRANSCRIPTION_MODEL;

		const llmService = new SmartLLMService({
			supabase,
			appName: 'BuildOS Transcription',
			httpReferer: 'https://build-os.com'
		});
		const openrouterResult = await llmService.transcribeAudio({
			audio: { kind: 'file', file: transcriptionFile },
			userId,
			vocabularyTerms: customVocabulary || undefined,
			models: openrouterModels,
			timeoutMs: TRANSCRIPTION_TIMEOUT_MS,
			maxRetries: MAX_RETRIES,
			initialRetryDelayMs: INITIAL_RETRY_DELAY_MS
		});
		operationLease.recordCost(audioFile.size);

		return ApiResponse.success({
			transcript: openrouterResult.text,
			duration_ms: Date.now() - startTime,
			audio_duration: openrouterResult.audioDuration ?? null,
			transcription_model: openrouterResult.model,
			transcription_service: openrouterResult.service
		});
	} catch (error: any) {
		const duration = Date.now() - startTime;
		console.error(`[Transcribe] Error after ${duration}ms:`, error);
		await errorLogger.logError(error, {
			userId: userId || undefined,
			endpoint: '/api/transcribe',
			httpMethod: 'POST',
			operationType: 'transcribe_audio',
			llmMetadata: {
				provider: 'openrouter',
				model: transcriptionModel,
				responseTimeMs: duration
			},
			metadata: {
				audioSizeBytes: audioFile?.size,
				mimeType: audioFile?.type,
				hasCustomVocabulary: Boolean(customVocabulary)
			}
		});

		// Handle timeout errors
		if (error?.name === 'TranscriptionTimeoutError') {
			return ApiResponse.error(
				'Transcription took too long. Please try again with a shorter recording.',
				504 // Gateway Timeout
			);
		}

		const providerStatus = error?.status || error?.response?.status;
		if (providerStatus === 429) {
			return ApiResponse.error(
				'OpenRouter transcription is rate limited. Please try again in a moment.',
				429
			);
		}
		if (providerStatus === 402) {
			return ApiResponse.error('OpenRouter transcription credits are unavailable.', 503);
		}
		if (providerStatus && providerStatus >= 400 && providerStatus < 500) {
			return ApiResponse.error('OpenRouter could not process this audio recording.', 502);
		}

		// Handle network/timeout errors
		if (
			error.code === 'ENOTFOUND' ||
			error.code === 'ETIMEDOUT' ||
			error.code === 'ECONNRESET'
		) {
			return ApiResponse.error(
				'Network error. Please check your connection and try again.',
				503
			);
		}

		// Generic error fallback
		return ApiResponse.internalError(
			error,
			`Transcription failed: ${error.message || 'Unknown server error'}`
		);
	} finally {
		operationLease?.release();
	}
};
