// apps/web/src/lib/utils/voice.ts

/// <reference types="dom-speech-recognition" />

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
let runtimeValidationDone = false;
let isRecognitionStarting = false; // Track if recognition is currently starting/restarting

// Accumulated transcript to preserve speech across SpeechRecognition restarts (e.g., after pauses)
let accumulatedFinalTranscript = '';

// Callback for runtime capability updates
let onCapabilityUpdate: ((update: { canUseLiveTranscript: boolean }) => void) | null = null;

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
		// Create new instance and assign to local variable for type safety
		const newRecognition = new capabilitiesCache.speechRecognition() as SpeechRecognition;
		newRecognition.continuous = true;
		newRecognition.interimResults = true;
		newRecognition.lang = 'en-US';

		// Optimized result handling
		newRecognition.onresult = (event: SpeechRecognitionEvent) => {
			let newFinalText = '';
			let interimText = '';

			// Process only new results for better performance
			for (let i = event.resultIndex; i < event.results.length; i++) {
				const result = event.results[i];
				const alternative = result?.[0];

				if (result && alternative?.transcript) {
					const transcript = alternative.transcript;
					if (result.isFinal) {
						newFinalText += transcript + ' ';
					} else {
						interimText += transcript;
					}
				}
			}

			// Accumulate final results across SpeechRecognition restarts
			// This prevents loss of previous speech when user pauses and recognition auto-restarts
			if (newFinalText) {
				accumulatedFinalTranscript += newFinalText;
			}

			// Combine accumulated final results with current interim results
			const combinedText = (accumulatedFinalTranscript + interimText).trim();
			liveTranscript.set(combinedText);
		};

		newRecognition.onerror = (event: SpeechRecognitionErrorEvent) => {
			console.warn('[SpeechRecognition] Error:', event.error);

			// Notify UI of capability loss on permission errors
			if (
				(event.error === 'not-allowed' || event.error === 'service-not-allowed') &&
				onCapabilityUpdate
			) {
				console.log('[SpeechRecognition] Permission denied - updating capability status');
				onCapabilityUpdate({ canUseLiveTranscript: false });
			}

			// Don't stop recording on speech recognition errors
			// since MediaRecorder is the primary capture method
		};

		newRecognition.onend = () => {
			// Auto-restart if still recording (improves reliability)
			if (get(isRecording) && recognition && !isRecognitionStarting) {
				// Add a small delay to ensure recognition is fully stopped before restarting
				// This prevents race conditions where start() is called while still stopping
				isRecognitionStarting = true;
				setTimeout(() => {
					if (get(isRecording) && recognition) {
						try {
							recognition.start();
						} catch (error) {
							console.warn('[SpeechRecognition] Failed to restart:', error);
							isRecognitionStarting = false;
						}
					} else {
						isRecognitionStarting = false;
					}
				}, 100); // 100ms delay is enough for the API to settle
			}
		};

		// Assign to module-level variable after successful initialization
		recognition = newRecognition;
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
	accumulatedFinalTranscript = ''; // Reset accumulated transcript
	isRecognitionStarting = false; // Reset recognition state flag
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

	// Initialize speech recognition the first time, and rehydrate it if it was cleaned up
	const needsSpeechRecognitionInit =
		capabilities.liveTranscriptSupported && (!isInitialized || !recognition);

	if (needsSpeechRecognitionInit) {
		initializeSpeechRecognition();
		isInitialized = true;
	}

	// Reset state
	audioChunks = [];
	liveTranscript.set('');
	accumulatedFinalTranscript = ''; // Reset accumulated transcript for new recording

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

		// Runtime validation: Now that we have permissions, test if SpeechRecognition actually works
		if (!runtimeValidationDone && capabilities.liveTranscriptSupported && recognition) {
			runtimeValidationDone = true; // Mark as done before testing to avoid infinite loops

			try {
				// Quick test: start and immediately stop to verify it works
				recognition.start();
				recognition.stop();

				console.log('[SpeechRecognition] Runtime validation successful');

				// Re-initialize for actual use
				recognition = null;
				initializeSpeechRecognition();

				// Notify UI that live transcript is actually available
				if (onCapabilityUpdate) {
					onCapabilityUpdate({ canUseLiveTranscript: true });
				}
			} catch (error) {
				console.warn('[SpeechRecognition] Runtime validation failed:', error);
				recognition = null;

				// Notify UI that live transcript is NOT available
				if (onCapabilityUpdate) {
					onCapabilityUpdate({ canUseLiveTranscript: false });
				}
			}
		}

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

		// Start recording immediately (before state updates for minimal delay)
		mediaRecorder.start(1000); // Collect data every second

		// Update state after recording has started
		isRecording.set(true);

		// Start speech recognition if available (non-blocking, happens after MediaRecorder starts)
		if (recognition) {
			try {
				isRecognitionStarting = true;
				recognition.start();
				// Recognition started successfully, reset the flag after a brief moment
				setTimeout(() => {
					isRecognitionStarting = false;
				}, 50);
			} catch (error) {
				console.warn('[SpeechRecognition] Start failed:', error);
				isRecognitionStarting = false;
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
				// FIXED: Defensive coding with optional chaining for null pointer safety
				let mimeType = 'audio/webm'; // Default
				if (audioChunks[0]?.type) {
					mimeType = audioChunks[0].type;
				} else if (capabilitiesCache?.supportedMimeType) {
					mimeType = capabilitiesCache.supportedMimeType;
				}

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
	runtimeValidationDone = false; // Reset validation state for next recording session
	capabilitiesCache = null; // Reset cache to re-detect on next use
};

// Set callback for runtime capability updates
export const setCapabilityUpdateCallback = (
	callback: (update: { canUseLiveTranscript: boolean }) => void
): void => {
	onCapabilityUpdate = callback;
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
