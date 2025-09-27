// src/lib/utils/voice.ts
import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

export const isRecording = writable(false);
export const liveTranscript = writable('');

// Cached capability detection for better performance
let capabilitiesCache: {
	voiceSupported: boolean;
	liveTranscriptSupported: boolean;
	supportedMimeType: string | null;
	speechRecognition: any;
} | null = null;

// Internal state
let recognition: SpeechRecognition | null = null;
let mediaRecorder: MediaRecorder | null = null;
let audioChunks: Blob[] = [];
let currentStream: MediaStream | null = null;
let isInitialized = false;

// API-compatible MIME types (ordered by transcription API compatibility)
const API_COMPATIBLE_MIME_TYPES = [
	'audio/webm', // WebM format - widely supported by APIs
	'audio/ogg', // OGG format - good fallback
	'audio/mp4', // MP4 format - universal compatibility
	'audio/wav', // WAV format - uncompressed, always works
	'audio/mpeg' // MP3 format - universal fallback
];

/* ---------- MIME TYPE UTILITIES ---------- */
export function getFileExtensionForMimeType(mimeType: string): string {
	const mimeToExtension: Record<string, string> = {
		'audio/webm': 'webm',
		'audio/ogg': 'ogg',
		'audio/mp4': 'm4a',
		'audio/wav': 'wav',
		'audio/mpeg': 'mp3'
	};

	return mimeToExtension[mimeType] || 'webm';
}

/* ---------- SAFE CAPABILITY DETECTION ---------- */
function detectCapabilities() {
	// Only run in browser environment
	if (!browser) {
		return {
			voiceSupported: false,
			liveTranscriptSupported: false,
			supportedMimeType: null,
			speechRecognition: null
		};
	}

	if (capabilitiesCache) return capabilitiesCache;

	// Check MediaRecorder support safely
	const hasMediaDevices =
		typeof navigator !== 'undefined' &&
		navigator.mediaDevices &&
		typeof navigator.mediaDevices.getUserMedia === 'function';

	const hasMediaRecorder =
		typeof window !== 'undefined' && typeof window.MediaRecorder === 'function';

	const voiceSupported = hasMediaDevices && hasMediaRecorder;

	// console.log('[Voice] Capability check:', {
	// 	browser,
	// 	hasNavigator: typeof navigator !== 'undefined',
	// 	hasMediaDevices,
	// 	hasMediaRecorder,
	// 	voiceSupported
	// });

	// Find optimal MIME type for transcription API compatibility
	let supportedMimeType: string | null = null;
	if (voiceSupported && window.MediaRecorder) {
		for (const mimeType of API_COMPATIBLE_MIME_TYPES) {
			if (MediaRecorder.isTypeSupported(mimeType)) {
				supportedMimeType = mimeType;
				break;
			}
		}
	}

	// Check Speech Recognition support safely
	let SpeechRecConstructor = null;
	if (typeof window !== 'undefined') {
		SpeechRecConstructor =
			(window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
	}

	capabilitiesCache = {
		voiceSupported,
		liveTranscriptSupported: !!SpeechRecConstructor,
		supportedMimeType,
		speechRecognition: SpeechRecConstructor
	};

	// console.log('[Voice] Detected capabilities:', capabilitiesCache);
	return capabilitiesCache;
}

/* ---------- OPTIMIZED SPEECH RECOGNITION SETUP ---------- */
function initializeSpeechRecognition() {
	if (!browser || recognition || !capabilitiesCache?.speechRecognition) return;

	try {
		recognition = new capabilitiesCache.speechRecognition();
		recognition.continuous = true;
		recognition.interimResults = true;
		recognition.lang = 'en-US';

		// Optimized result handling
		recognition.onresult = (event: SpeechRecognitionEvent) => {
			let finalText = '';
			let interimText = '';

			// Process only new results for better performance
			for (let i = event.resultIndex; i < event.results.length; i++) {
				const transcript = event.results[i][0].transcript;
				if (event.results[i].isFinal) {
					finalText += transcript + ' ';
				} else {
					interimText += transcript;
				}
			}

			const combinedText = (finalText + interimText).trim();
			liveTranscript.set(combinedText);
		};

		recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
			console.warn('[SpeechRecognition] Error:', event.error);
			// Don't stop recording on speech recognition errors
			// since MediaRecorder is the primary capture method
		};

		recognition.onend = () => {
			// Auto-restart if still recording (improves reliability)
			if (get(isRecording) && recognition) {
				try {
					recognition.start();
				} catch (error) {
					console.warn('[SpeechRecognition] Failed to restart:', error);
				}
			}
		};
	} catch (error) {
		console.error('[SpeechRecognition] Initialization failed:', error);
		recognition = null;
	}
}

/* ---------- RESOURCE MANAGEMENT ---------- */
function cleanupResources() {
	// Stop speech recognition
	if (recognition) {
		try {
			recognition.stop();
		} catch (error) {
			console.warn('[SpeechRecognition] Cleanup error:', error);
		}
		recognition = null;
	}

	// Stop media recorder
	if (mediaRecorder && mediaRecorder.state !== 'inactive') {
		try {
			mediaRecorder.stop();
		} catch (error) {
			console.warn('[MediaRecorder] Cleanup error:', error);
		}
	}

	// Stop media tracks
	if (currentStream) {
		currentStream.getTracks().forEach((track) => track.stop());
		currentStream = null;
	}

	// Reset state
	mediaRecorder = null;
	audioChunks = [];
	isRecording.set(false);
	liveTranscript.set('');
}

/* ---------- SAFE PUBLIC API ---------- */
export async function startRecording(): Promise<void> {
	if (!browser) {
		throw new Error('Voice recording is only available in the browser');
	}

	if (get(isRecording)) {
		console.warn('[Voice] Already recording');
		return;
	}

	const capabilities = detectCapabilities();

	if (!capabilities.voiceSupported) {
		throw new Error('Voice recording is not supported in this browser');
	}

	// Initialize speech recognition once
	if (!isInitialized && capabilities.liveTranscriptSupported) {
		initializeSpeechRecognition();
		isInitialized = true;
	}

	// Reset state
	audioChunks = [];
	liveTranscript.set('');

	try {
		// Request optimized audio stream
		currentStream = await navigator.mediaDevices.getUserMedia({
			audio: {
				channelCount: 1, // Mono for smaller size
				sampleRate: 16000, // Optimal for speech recognition
				echoCancellation: true, // Better quality
				noiseSuppression: true, // Reduce background noise
				autoGainControl: true // Normalize volume
			}
		});

		// Setup MediaRecorder with optimal settings
		const recorderOptions: MediaRecorderOptions = {
			audioBitsPerSecond: 64000 // Reduced from 128k for faster processing
		};

		if (capabilities.supportedMimeType) {
			recorderOptions.mimeType = capabilities.supportedMimeType;
		}

		mediaRecorder = new MediaRecorder(currentStream, recorderOptions);

		// Optimized event handlers
		mediaRecorder.ondataavailable = (event) => {
			if (event.data && event.data.size > 0) {
				audioChunks.push(event.data);
			}
		};

		mediaRecorder.onerror = (event) => {
			console.error('[MediaRecorder] Error:', event);
			cleanupResources();
			throw new Error('Recording failed');
		};

		// mediaRecorder.onstart = () => {
		// 	console.log('[MediaRecorder] Started with MIME type:', mediaRecorder?.mimeType);
		// };

		// Start recording
		isRecording.set(true);
		mediaRecorder.start(1000); // Collect data every second

		// Start speech recognition if available
		if (recognition) {
			try {
				recognition.start();
			} catch (error) {
				console.warn('[SpeechRecognition] Start failed:', error);
				// Continue with MediaRecorder only
			}
		}
	} catch (error) {
		cleanupResources();

		if (error instanceof Error) {
			if (error.name === 'NotAllowedError') {
				throw new Error('Microphone permission denied. Please allow access and try again.');
			} else if (error.name === 'NotFoundError') {
				throw new Error('No microphone found. Please check your audio device.');
			} else if (error.name === 'NotReadableError') {
				throw new Error('Microphone is being used by another application.');
			}
		}

		throw new Error(
			`Failed to start recording: ${error instanceof Error ? error.message : 'Unknown error'}`
		);
	}
}

export function stopRecording(): Promise<Blob | null> {
	return new Promise((resolve) => {
		if (!browser) {
			resolve(null);
			return;
		}

		if (!get(isRecording) || !mediaRecorder) {
			console.warn('[Voice] Not currently recording');
			cleanupResources();
			resolve(null);
			return;
		}

		// Setup stop handler before stopping
		mediaRecorder.onstop = () => {
			let audioBlob: Blob | null = null;

			if (audioChunks.length > 0) {
				const mimeType =
					audioChunks[0].type || capabilitiesCache?.supportedMimeType || 'audio/webm';
				audioBlob = new Blob(audioChunks, { type: mimeType });

				// console.log(`[MediaRecorder] Stopped. Blob: ${audioBlob.size} bytes, Type: ${audioBlob.type}`);
			} else {
				console.warn('[MediaRecorder] No audio data recorded');
			}

			cleanupResources();
			resolve(audioBlob);
		};

		// Stop recording
		try {
			mediaRecorder.stop();
		} catch (error) {
			console.error('[MediaRecorder] Stop error:', error);
			cleanupResources();
			resolve(null);
		}
	});
}

/* ---------- SAFE CAPABILITY CHECKS ---------- */
export const voiceSupported = (): boolean => {
	if (!browser) return false;
	const capabilities = detectCapabilities();
	return capabilities.voiceSupported;
};

export const liveTranscriptSupported = (): boolean => {
	if (!browser) return false;
	return detectCapabilities().liveTranscriptSupported;
};

/* ---------- ADDITIONAL UTILITIES ---------- */

// Get current recording status
export const getRecordingStatus = () => ({
	isRecording: get(isRecording),
	hasLiveTranscript: get(liveTranscript).length > 0,
	capabilities: browser ? detectCapabilities() : null
});

// Force cleanup (useful for component unmounting)
export const forceCleanup = () => {
	cleanupResources();
	isInitialized = false;
	capabilitiesCache = null; // Reset cache to re-detect on next use
};

// Check if microphone permission is granted (without starting recording)
export const checkMicrophonePermission = async (): Promise<boolean> => {
	if (!browser || !voiceSupported()) return false;

	try {
		// Try to get a minimal audio stream to test permissions
		const stream = await navigator.mediaDevices.getUserMedia({
			audio: {
				echoCancellation: false,
				noiseSuppression: false,
				autoGainControl: false
			}
		});

		// Immediately stop all tracks
		stream.getTracks().forEach((track) => track.stop());
		// console.log('[Voice] Microphone permission granted');
		return true;
	} catch (error) {
		console.log('[Voice] Microphone permission check failed:', error);
		return false;
	}
};

/* ---------- BROWSER CLEANUP ---------- */
// Store event handlers for cleanup
let cleanupHandlersAttached = false;

// Attach cleanup handlers
export const attachCleanupHandlers = () => {
	if (!browser || cleanupHandlersAttached) return;

	window.addEventListener('beforeunload', forceCleanup);
	window.addEventListener('pagehide', forceCleanup);
	cleanupHandlersAttached = true;
};

// Remove cleanup handlers
export const removeCleanupHandlers = () => {
	if (!browser || !cleanupHandlersAttached) return;

	window.removeEventListener('beforeunload', forceCleanup);
	window.removeEventListener('pagehide', forceCleanup);
	cleanupHandlersAttached = false;
};

// Auto-attach handlers on module load
if (browser) {
	attachCleanupHandlers();
}
