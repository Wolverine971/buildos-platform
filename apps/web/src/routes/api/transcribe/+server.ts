// src/routes/api/transcribe/+server.ts
import { PRIVATE_OPENAI_API_KEY } from '$env/static/private';
import OpenAI from 'openai';
import type { RequestHandler } from './$types';
import { ApiResponse } from '$lib/utils/api-response';

const openai = new OpenAI({
	apiKey: PRIVATE_OPENAI_API_KEY
});

// MIME type to file extension mapping for OpenAI Whisper compatibility
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

// Get the correct file extension for OpenAI Whisper API
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

// Validate if the format is supported by OpenAI Whisper
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

		// Log received file details
		console.log(
			`[Transcribe] Received: ${audioFile.size} bytes, Type: ${audioFile.type}, Name: ${audioFile.name}`
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
		const whisperFile = new File([audioBlob], filename, { type: audioFile.type });

		// console.log(`[Transcribe] Sending to OpenAI: ${filename} (${audioFile.size} bytes)`);

		// Call OpenAI Whisper API with optimized parameters
		const transcription = await openai.audio.transcriptions.create({
			model: 'whisper-1',
			file: whisperFile,
			language: 'en', // Specify language for better accuracy and speed
			response_format: 'json',
			temperature: 0.2 // Lower temperature for more consistent results
		});

		const duration = Date.now() - startTime;

		if (transcription?.text) {
			return ApiResponse.success({
				transcript: transcription.text,
				duration_ms: duration,
				audio_duration: transcription.duration || null
			});
		} else {
			return ApiResponse.internalError('Failed to transcribe audio. No text returned.');
		}
	} catch (error: any) {
		const duration = Date.now() - startTime;
		console.error(`[Transcribe] Error after ${duration}ms:`, error);

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
		if (error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
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
