// apps/web/src/lib/services/voiceRecording.service.ts
// Voice Recording Service for Brain Dump
// Wraps voice.ts utility and adds transcription/text integration
import {
	startRecording as voiceStartRecording,
	stopRecording as voiceStopRecording,
	isRecording,
	liveTranscript,
	voiceSupported,
	liveTranscriptSupported,
	forceCleanup,
	setCapabilityUpdateCallback,
	prewarmMicrophone,
	isMicrophonePrewarmed,
	releasePrewarmedStream
} from '$lib/utils/voice';
import { get, writable } from 'svelte/store';
import { browser } from '$app/environment';

export interface VoiceRecordingCallbacks {
	onTextUpdate: (text: string) => void;
	onError: (error: string) => void;
	onPhaseChange: (phase: 'idle' | 'transcribing') => void;
	onPermissionGranted?: () => void;
	onCapabilityUpdate?: (update: { canUseLiveTranscript: boolean }) => void;
}

export interface TranscriptionService {
	transcribeAudio(audioFile: File): Promise<{ transcript: string }>;
}

export class VoiceRecordingService {
	private static instance: VoiceRecordingService;
	private callbacks: VoiceRecordingCallbacks | null = null;
	private transcriptionService: TranscriptionService | null = null;

	// Recording state - use writable store for reactivity
	private recordingStartTime: number = 0;
	private recordingTimer: NodeJS.Timeout | null = null;
	private recordingDurationStore = writable<number>(0);

	// Live transcript tracking
	private liveTranscriptUnsubscribe: (() => void) | null = null;
	private currentLiveTranscript: string = '';
	private finalTranscriptSinceLastStop: string = '';

	private constructor() {}

	public static getInstance(): VoiceRecordingService {
		if (!this.instance) {
			this.instance = new VoiceRecordingService();
		}
		return this.instance;
	}

	public initialize(
		callbacks: VoiceRecordingCallbacks,
		transcriptionService: TranscriptionService
	): void {
		this.callbacks = callbacks;
		this.transcriptionService = transcriptionService;

		// Unsubscribe from any existing subscription to prevent leaks
		if (this.liveTranscriptUnsubscribe) {
			this.liveTranscriptUnsubscribe();
			this.liveTranscriptUnsubscribe = null;
		}

		// Subscribe to live transcript updates
		if (browser) {
			this.liveTranscriptUnsubscribe = liveTranscript.subscribe((transcript) => {
				this.currentLiveTranscript = transcript;
			});
		}

		// Set up runtime capability update callback
		if (callbacks.onCapabilityUpdate) {
			setCapabilityUpdateCallback(callbacks.onCapabilityUpdate);
		}
	}

	public isVoiceSupported(): boolean {
		return voiceSupported();
	}

	public isLiveTranscriptSupported(): boolean {
		return liveTranscriptSupported();
	}

	/**
	 * Pre-warm the microphone for faster recording start.
	 * Call this when a voice-enabled component mounts to eliminate the 50-100ms
	 * getUserMedia delay when the user clicks record.
	 *
	 * @returns Promise<boolean> - true if pre-warming succeeded
	 */
	public async prewarmMicrophone(): Promise<boolean> {
		if (!this.isVoiceSupported()) return false;
		return prewarmMicrophone();
	}

	/**
	 * Check if the microphone is pre-warmed and ready for instant recording
	 */
	public isMicrophonePrewarmed(): boolean {
		return isMicrophonePrewarmed();
	}

	/**
	 * Release pre-warmed microphone stream without using it
	 * Call this on component unmount if recording wasn't started
	 */
	public releasePrewarmedStream(): void {
		releasePrewarmedStream();
	}

	public getRecordingDuration() {
		return this.recordingDurationStore;
	}

	public isCurrentlyRecording(): boolean {
		return get(isRecording);
	}

	/**
	 * Get the current live transcript text
	 * @returns Current live transcript string
	 */
	public getCurrentLiveTranscript(): string {
		return this.currentLiveTranscript;
	}

	/**
	 * Check if live transcription is currently active
	 * @returns true if recording and has live transcript content
	 */
	public isLiveTranscribing(): boolean {
		return get(isRecording) && this.currentLiveTranscript.length > 0;
	}

	public async startRecording(currentInputText: string): Promise<void> {
		if (!this.callbacks) {
			throw new Error('VoiceRecordingService not initialized');
		}

		try {
			// Reset transcript accumulator
			this.finalTranscriptSinceLastStop = '';

			// Start the actual recording FIRST (before text processing to minimize delay)
			await voiceStartRecording();

			// Add line break AFTER recording starts (non-blocking)
			if (currentInputText.trim()) {
				this.callbacks.onTextUpdate(currentInputText + '\n\n');
			}

			// Start timer - reset to 0 first
			this.recordingStartTime = Date.now();
			this.recordingDurationStore.set(0);
			this.startRecordingTimer();

			// Notify permission granted
			if (this.callbacks.onPermissionGranted) {
				this.callbacks.onPermissionGranted();
			}
		} catch (error) {
			console.error('Recording error:', error);
			const errorMessage =
				error instanceof Error ? error.message : 'Unable to access microphone';
			this.callbacks.onError(errorMessage);
			throw error;
		}
	}

	public async stopRecording(currentInputText: string): Promise<void> {
		if (!this.callbacks) {
			throw new Error('VoiceRecordingService not initialized');
		}

		this.stopRecordingTimer();

		try {
			// Capture live transcript before stopping
			const capturedLiveTranscript = this.currentLiveTranscript.trim();

			// Stop recording and get audio blob
			const audioBlob = await voiceStopRecording();

			// Determine if we should transcribe audio
			const shouldTranscribeAudio =
				audioBlob &&
				audioBlob.size > 1000 && // Minimum size to avoid empty recordings
				(!this.isLiveTranscriptSupported() || // iOS doesn't support live transcription
					!capturedLiveTranscript || // No live transcription captured
					capturedLiveTranscript.length < 10); // Very short live transcription

			if (shouldTranscribeAudio && this.transcriptionService) {
				console.log('Transcribing audio file...', {
					blobSize: audioBlob!.size,
					hasLiveTranscript: !!capturedLiveTranscript,
					liveTranscriptLength: capturedLiveTranscript.length
				});
				await this.transcribeAudio(audioBlob!, capturedLiveTranscript, currentInputText);
			} else if (capturedLiveTranscript) {
				// Use live transcript if available
				if (!currentInputText.endsWith(capturedLiveTranscript)) {
					const separator = currentInputText.trim() ? ' ' : '';
					const newText = currentInputText + separator + capturedLiveTranscript;
					this.callbacks.onTextUpdate(newText);
				}
			}

			// Reset transcript for next recording
			this.finalTranscriptSinceLastStop = '';

			// CRITICAL: Always reset phase to idle after stopping, regardless of path taken
			this.callbacks.onPhaseChange('idle');
		} catch (error) {
			console.error('Stop recording error:', error);
			const errorMessage =
				error instanceof Error ? error.message : 'Failed to stop recording';
			this.callbacks.onError(errorMessage);

			// CRITICAL: Reset phase to idle even on error to prevent stuck state
			this.callbacks.onPhaseChange('idle');
		}
	}

	private async transcribeAudio(
		audioBlob: Blob,
		capturedLiveTranscript: string,
		currentInputText: string
	): Promise<void> {
		if (!this.callbacks || !this.transcriptionService) return;

		this.callbacks.onPhaseChange('transcribing');

		try {
			// Get MIME type and extension from blob
			const mimeType = audioBlob.type || 'audio/webm';
			const extension = this.getFileExtension(mimeType);
			const audioFile = new File([audioBlob], `recording.${extension}`, { type: mimeType });

			const response = await this.transcriptionService.transcribeAudio(audioFile);

			if (response?.transcript) {
				const newTranscript = response.transcript.trim();

				if (capturedLiveTranscript) {
					// Check similarity between live and audio transcription
					const similarity = this.calculateSimilarity(
						capturedLiveTranscript.toLowerCase(),
						newTranscript.toLowerCase()
					);

					if (similarity > 0.8) {
						console.log(
							'Skipping audio transcription - already captured via live transcription'
						);
					} else {
						// Replace live transcript with more accurate audio transcription
						let baseText = currentInputText;
						if (currentInputText.endsWith(capturedLiveTranscript)) {
							baseText = currentInputText
								.slice(0, -capturedLiveTranscript.length)
								.trim();
						}

						const separator = baseText ? ' ' : '';
						this.callbacks.onTextUpdate(baseText + separator + newTranscript);
						console.log(
							'Replaced live transcription with more accurate audio transcription'
						);
					}
				} else {
					// No live transcript, check for duplicates
					const lastPortion = currentInputText.slice(-newTranscript.length).trim();

					if (lastPortion !== newTranscript) {
						const separator = currentInputText.trim() ? ' ' : '';
						const updatedText = currentInputText + separator + newTranscript;
						console.log('[VoiceService] Updating text with transcription:', {
							currentLength: currentInputText.length,
							transcriptLength: newTranscript.length,
							newLength: updatedText.length,
							transcript: newTranscript.substring(0, 50) + '...'
						});
						this.callbacks.onTextUpdate(updatedText);
					} else {
						console.log('Skipping exact duplicate transcription');
					}
				}
			} else {
				console.warn('No transcript received from transcription service');
			}

			this.callbacks.onPhaseChange('idle');
		} catch (error) {
			console.error('Transcription error:', error);
			const errorMessage =
				error instanceof Error ? error.message : 'Failed to transcribe audio';
			this.callbacks.onError(errorMessage);
			this.callbacks.onPhaseChange('idle');
		}
	}

	private getFileExtension(mimeType: string): string {
		const mimeToExtension: Record<string, string> = {
			'audio/webm': 'webm',
			'audio/ogg': 'ogg',
			'audio/mp4': 'm4a',
			'audio/wav': 'wav',
			'audio/mpeg': 'mp3'
		};
		return mimeToExtension[mimeType] || 'webm';
	}

	private calculateSimilarity(str1: string, str2: string): number {
		if (str1.length === 0 || str2.length === 0) return 0;

		const longer = str1.length > str2.length ? str1 : str2;
		const shorter = str1.length > str2.length ? str2 : str1;

		if (longer.includes(shorter)) {
			return shorter.length / longer.length;
		}

		let maxOverlap = 0;
		for (let i = 1; i <= shorter.length; i++) {
			if (longer.includes(shorter.slice(0, i))) {
				maxOverlap = i;
			}
		}

		return maxOverlap / longer.length;
	}

	private startRecordingTimer(): void {
		this.recordingTimer = setInterval(() => {
			const duration = Math.floor((Date.now() - this.recordingStartTime) / 1000);
			this.recordingDurationStore.set(duration);
		}, 100);
	}

	private stopRecordingTimer(): void {
		if (this.recordingTimer) {
			clearInterval(this.recordingTimer);
			this.recordingTimer = null;
			this.recordingDurationStore.set(0);
		}
	}

	public cleanup(): void {
		// Stop timer
		this.stopRecordingTimer();

		// Unsubscribe from live transcript
		if (this.liveTranscriptUnsubscribe) {
			this.liveTranscriptUnsubscribe();
			this.liveTranscriptUnsubscribe = null;
		}

		// Release any pre-warmed stream first
		this.releasePrewarmedStream();

		// Force cleanup of voice utility
		forceCleanup();

		// Reset state
		this.currentLiveTranscript = '';
		this.finalTranscriptSinceLastStop = '';
		this.recordingDurationStore.set(0);
		this.recordingStartTime = 0;
	}
}

// Export singleton instance
export const voiceRecordingService = VoiceRecordingService.getInstance();
