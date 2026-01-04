// apps/web/src/routes/api/transcribe/+server.ts
import { PRIVATE_OPENAI_API_KEY } from '$env/static/private';
import { env } from '$env/dynamic/private';
import OpenAI from 'openai';
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

const openai = new OpenAI({
	apiKey: PRIVATE_OPENAI_API_KEY
});

// Transcription model configuration
// gpt-4o-transcribe: State-of-the-art accuracy (~8.9% WER), best for accented/noisy speech
// gpt-4o-mini-transcribe: Good balance of cost/accuracy (~13.2% WER), half the price
// whisper-1: Legacy model (deprecated for new projects)
const TRANSCRIPTION_MODEL = env.TRANSCRIPTION_MODEL || 'gpt-4o-transcribe';

// Timeout and retry configuration
const TRANSCRIPTION_TIMEOUT_MS = 30000; // 30 seconds timeout
const MAX_RETRIES = 2; // Maximum retry attempts
const INITIAL_RETRY_DELAY_MS = 1000; // 1 second initial delay

/**
 * Custom timeout error for transcription requests
 */
class TranscriptionTimeoutError extends Error {
	constructor(timeoutMs: number) {
		super(`Transcription request timed out after ${timeoutMs}ms`);
		this.name = 'TranscriptionTimeoutError';
	}
}

/**
 * Execute a promise with a timeout
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
	let timeoutId: ReturnType<typeof setTimeout>;

	const timeoutPromise = new Promise<never>((_, reject) => {
		timeoutId = setTimeout(() => {
			reject(new TranscriptionTimeoutError(timeoutMs));
		}, timeoutMs);
	});

	try {
		const result = await Promise.race([promise, timeoutPromise]);
		clearTimeout(timeoutId!);
		return result;
	} catch (error) {
		clearTimeout(timeoutId!);
		throw error;
	}
}

/**
 * Check if an error is retryable (transient errors that may succeed on retry)
 */
function isRetryableError(error: any): boolean {
	// Timeout errors are retryable
	if (error instanceof TranscriptionTimeoutError) {
		return true;
	}

	// Network errors are retryable
	if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET') {
		return true;
	}

	// Rate limiting (429) is retryable
	if (error?.response?.status === 429 || error?.status === 429) {
		return true;
	}

	// Server errors (5xx) are retryable
	const status = error?.response?.status || error?.status;
	if (status && status >= 500 && status < 600) {
		return true;
	}

	return false;
}

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

// MIME type to file extension mapping for OpenAI Audio API compatibility
const MIME_TO_EXTENSION: Record<string, string> = {
	'audio/webm': 'webm',
	'audio/ogg': 'ogg',
	'audio/wav': 'wav',
	'audio/mp4': 'm4a', // OpenAI prefers m4a for MP4 audio
	'audio/mpeg': 'mp3',
	'audio/mp3': 'mp3',
	'audio/flac': 'flac',
	'audio/x-flac': 'flac',
	'audio/aac': 'm4a'
};

// Get the correct file extension for OpenAI Audio API
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

// Validate if the format is supported by OpenAI Audio API
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

export const POST: RequestHandler = async ({ request, locals: { safeGetSession } }) => {
	const startTime = Date.now();

	try {
		// Authentication check
		const { user } = await safeGetSession();
		if (!user) {
			return ApiResponse.unauthorized();
		}

		if (!PRIVATE_OPENAI_API_KEY) {
			return ApiResponse.internalError('OpenAI API key not configured');
		}

		// Parse the form data to get audio file and metadata
		const formData = await request.formData();
		const audioFile = formData.get('audio') as File;

		if (!audioFile || audioFile.size === 0) {
			return ApiResponse.badRequest('No audio data received');
		}

		// Log received file details and model being used
		console.log(
			`[Transcribe] Received: ${audioFile.size} bytes, Type: ${audioFile.type}, Name: ${audioFile.name}, Model: ${TRANSCRIPTION_MODEL}`
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

		// Create a properly formatted File object for OpenAI
		const audioBlob = new Blob([await audioFile.arrayBuffer()], { type: audioFile.type });
		const transcriptionFile = new File([audioBlob], filename, { type: audioFile.type });

		// console.log(`[Transcribe] Sending to OpenAI: ${filename} (${audioFile.size} bytes)`);

		// Call OpenAI transcription API with timeout and retry logic
		// Using gpt-4o-mini-transcribe for better accuracy and fewer hallucinations
		// Language auto-detection enabled for multilingual support
		let lastError: Error | null = null;
		let transcription: Awaited<ReturnType<typeof openai.audio.transcriptions.create>> | null =
			null;

		for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
			try {
				// Add exponential backoff delay for retries
				if (attempt > 0) {
					const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt - 1);
					console.log(
						`[Transcribe] Retry attempt ${attempt}/${MAX_RETRIES} after ${delay}ms`
					);
					await sleep(delay);
				}

				// Execute transcription with timeout
				// Custom vocabulary prompt helps the model recognize domain-specific terms
				const vocabularyPrompt =
					'BuildOS, brain dump, ontology, daily brief, phase, project context';

				transcription = await withTimeout(
					openai.audio.transcriptions.create({
						model: TRANSCRIPTION_MODEL,
						file: transcriptionFile,
						// No language specified - enables automatic language detection
						response_format: 'json',
						temperature: 0.2, // Lower temperature for more consistent results
						prompt: vocabularyPrompt // Guides model to recognize custom vocabulary
					}),
					TRANSCRIPTION_TIMEOUT_MS
				);

				// Success - break out of retry loop
				break;
			} catch (error: any) {
				lastError = error;

				// Log the attempt failure
				console.warn(
					`[Transcribe] Attempt ${attempt + 1}/${MAX_RETRIES + 1} failed:`,
					error.message || error
				);

				// If not retryable or last attempt, throw immediately
				if (!isRetryableError(error) || attempt === MAX_RETRIES) {
					throw error;
				}

				// Continue to next retry attempt
			}
		}

		const duration = Date.now() - startTime;

		if (transcription?.text) {
			return ApiResponse.success({
				transcript: transcription.text,
				duration_ms: duration,
				// Duration may not be available in all transcription models
				audio_duration: (transcription as any).duration ?? null
			});
		} else {
			return ApiResponse.internalError('Failed to transcribe audio. No text returned.');
		}
	} catch (error: any) {
		const duration = Date.now() - startTime;
		console.error(`[Transcribe] Error after ${duration}ms:`, error);

		// Handle timeout errors
		if (error instanceof TranscriptionTimeoutError) {
			return ApiResponse.error(
				'Transcription took too long. Please try again with a shorter recording.',
				504 // Gateway Timeout
			);
		}

		// Handle specific OpenAI API errors
		if (error?.response?.data) {
			const apiError = error.response.data.error;
			// console.error('[Transcribe] OpenAI API Error:', apiError);

			// Check for format-related errors
			if (apiError?.message?.includes('format') || apiError?.message?.includes('file')) {
				return ApiResponse.badRequest(
					`Audio format error: ${apiError.message}. Please try recording again.`
				);
			}

			// Check for rate limiting
			if (error.response.status === 429) {
				return ApiResponse.error(
					'Transcription service is busy. Please try again in a moment.',
					429
				);
			}

			return ApiResponse.error(
				`Transcription failed: ${apiError?.message || 'OpenAI API error'}`,
				error.response.status || 500
			);
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
	}
};
