<!-- apps/web/src/lib/components/ui/TextareaWithVoice.svelte -->
<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { Mic, MicOff, LoaderCircle } from 'lucide-svelte';
	import Textarea from './Textarea.svelte';
	import {
		voiceRecordingService,
		type TranscriptionService
	} from '$lib/services/voiceRecording.service';
	import {
		createVoiceNoteGroup,
		cleanupVoiceNoteGroups
	} from '$lib/services/voice-note-groups.service';
	import { uploadVoiceNote, updateVoiceNote } from '$lib/services/voice-notes.service';
	import type { VoiceNote } from '$lib/types/voice-notes';
	import { liveTranscript } from '$lib/utils/voice';
	import { browser } from '$app/environment';
	import { haptic } from '$lib/utils/haptic';

	type VoiceButtonVariant = 'muted' | 'loading' | 'prompt' | 'recording' | 'ready';

	type VoiceButtonState = {
		icon: typeof Mic;
		label: string;
		disabled: boolean;
		isLoading: boolean;
		variant: VoiceButtonVariant;
	};

	interface Props {
		value?: string;
		placeholder?: string;
		rows?: number;
		maxRows?: number;
		autoResize?: boolean;
		disabled?: boolean;
		textareaClass?: string;
		containerClass?: string;
		helperText?: string;
		error?: boolean;
		errorMessage?: string;
		enableVoice?: boolean;
		showStatusRow?: boolean;
		showLiveTranscriptPreview?: boolean;
		voiceBlocked?: boolean;
		voiceBlockedLabel?: string;
		transcriptionEndpoint?: string;
		liveTranscriptLabel?: string;
		voiceButtonLabel?: string;
		listeningLabel?: string;
		transcribingLabel?: string;
		preparingLabel?: string;
		class?: string;
		// Custom vocabulary terms for transcription (e.g., project name)
		vocabularyTerms?: string;
		// Bindable voice state props for parent components
		isRecording?: boolean;
		isInitializing?: boolean;
		isTranscribing?: boolean;
		voiceError?: string;
		recordingDuration?: number;
		canUseLiveTranscript?: boolean;
		// Voice note capture metadata
		voiceNoteSource?: string;
		voiceNoteGroupId?: string | null;
		onVoiceNoteGroupReady?: (groupId: string) => void;
		onVoiceNoteSegmentSaved?: (voiceNote: VoiceNote) => void;
		onVoiceNoteSegmentError?: (error: string) => void;
		// Snippet for action buttons
		actions?: import('svelte').Snippet;
		// Snippet for status row
		status?: import('svelte').Snippet<
			[
				{
					isCurrentlyRecording: boolean;
					isTranscribing: boolean;
					recordingDuration: number;
					voiceError: string;
				}
			]
		>;
		[key: string]: any; // Allow rest props
	}

	// Svelte 5 runes mode: use $props() with rest capture for proper prop forwarding
	// Keep value in props to support two-way binding with bind:value
	let {
		value = $bindable(''),
		placeholder = '',
		rows = 4,
		maxRows = 6,
		autoResize = false,
		disabled = false,
		textareaClass = '',
		containerClass = '',
		helperText = undefined,
		error = false,
		errorMessage = undefined,
		enableVoice = true,
		showStatusRow = true,
		showLiveTranscriptPreview = true,
		voiceBlocked = false,
		voiceBlockedLabel = 'Recording unavailable right now',
		transcriptionEndpoint = '/api/transcribe',
		liveTranscriptLabel = 'Live transcript',
		voiceButtonLabel = 'Record voice note',
		listeningLabel = 'Listening',
		transcribingLabel = 'Transcribing…',
		preparingLabel = 'Preparing microphone…',
		class: className = '',
		// Custom vocabulary terms for transcription
		vocabularyTerms = '',
		// Bindable voice state props
		isRecording = $bindable(false),
		isInitializing = $bindable(false),
		isTranscribing = $bindable(false),
		voiceError = $bindable(''),
		recordingDuration = $bindable(0),
		canUseLiveTranscript = $bindable(false),
		// Voice note capture metadata
		voiceNoteSource = '',
		voiceNoteGroupId = $bindable(null),
		onVoiceNoteGroupReady,
		onVoiceNoteSegmentSaved,
		onVoiceNoteSegmentError,
		// Snippet for action buttons
		actions,
		// Snippet for status row (legacy support)
		status,
		...restProps
	}: Props = $props();

	// Internal voice state (using Svelte 5 $state)
	let isVoiceSupported = $state(false);
	let isCurrentlyRecording = $state(false);
	let isInitializingRecording = $state(false);
	let _isTranscribing = $state(false);
	let _voiceError = $state('');
	let _canUseLiveTranscript = $state(false);
	let liveTranscriptPreview = $state('');
	let hadLiveTranscript = $state(false);
	let _recordingDuration = $state(0);

	let microphonePermissionGranted = $state(false);
	let hasAttemptedVoice = $state(false);
	let durationUnsubscribe: (() => void) | null = null;
	let transcriptUnsubscribe: (() => void) | null = null;
	let voiceInitialized = $state(false);
	let textareaRef = $state<Textarea | null>(null);

	type PendingTranscriptUpdate = {
		transcript?: string;
		transcriptionSource: 'audio' | 'live';
		transcriptionStatus: 'complete' | 'failed';
		transcriptionModel?: string | null;
		transcriptionService?: string | null;
		transcriptionError?: string | null;
		latencyMs?: number;
	};

	type TranscriptionResult = {
		transcript: string;
		transcriptionModel?: string | null;
		transcriptionService?: string | null;
	};

	type SegmentState = {
		voiceNoteId?: string;
		pendingTranscript?: PendingTranscriptUpdate;
	};

	type GroupState = {
		segmentIndex: number;
		segments: Map<number, SegmentState>;
	};

	let groupStates = new Map<string, GroupState>();
	let groupCreatePromises = new Map<string, Promise<string>>();
	let lastTranscriptionTarget: { groupId: string; segmentIndex: number } | null = null;
	let hasScheduledDraftCleanup = $state(false);
	let activeUploads = 0;
	const uploadQueue: Array<() => Promise<void>> = [];
	// Captured transcript snapshot for handleAudioCaptured callback
	// Set in stopVoiceRecording before clearing liveTranscriptPreview for UI
	let capturedTranscriptForCallback = '';
	const MAX_CONCURRENT_UPLOADS = 2;

	// Sync internal state with bindable props for parent component access
	$effect(() => {
		isRecording = isCurrentlyRecording;
	});

	$effect(() => {
		isInitializing = isInitializingRecording;
	});

	$effect(() => {
		isTranscribing = _isTranscribing;
	});

	$effect(() => {
		voiceError = _voiceError;
	});

	$effect(() => {
		recordingDuration = _recordingDuration;
	});

	$effect(() => {
		canUseLiveTranscript = _canUseLiveTranscript;
	});

	// Update vocabulary terms on the voice recording service when prop changes
	$effect(() => {
		if (voiceInitialized) {
			voiceRecordingService.setVocabularyTerms(vocabularyTerms);
		}
	});

	async function requestTranscription(
		audioFile: File,
		vocabTerms?: string
	): Promise<TranscriptionResult> {
		const formData = new FormData();
		formData.append('audio', audioFile);
		if (vocabTerms) {
			formData.append('vocabularyTerms', vocabTerms);
		}

		const response = await fetch(transcriptionEndpoint, {
			method: 'POST',
			body: formData
		});

		if (!response.ok) {
			let errorMessage = `Transcription failed: ${response.status}`;
			try {
				const errorPayload = await response.json();
				if (errorPayload?.error) {
					errorMessage = errorPayload.error;
				}
			} catch {
				// Ignore JSON parse errors
			}
			throw new Error(errorMessage);
		}

		const result = await response.json();
		const payload = result?.success && result?.data ? result.data : result;
		if (payload?.transcript) {
			return {
				transcript: payload.transcript,
				transcriptionModel: payload.transcription_model ?? null,
				transcriptionService: payload.transcription_service ?? null
			};
		}

		throw new Error('No transcript returned from transcription service');
	}

	const transcriptionService: TranscriptionService = {
		async transcribeAudio(audioFile: File, vocabTerms?: string) {
			const startTime = performance.now();
			try {
				const {
					transcript,
					transcriptionModel,
					transcriptionService: transcriptionServiceName
				} = await requestTranscription(audioFile, vocabTerms);
				queueTranscriptUpdate({
					transcript,
					transcriptionSource: 'audio',
					transcriptionStatus: 'complete',
					transcriptionModel,
					transcriptionService: transcriptionServiceName,
					latencyMs: Math.round(performance.now() - startTime)
				});
				return {
					transcript,
					transcriptionModel,
					transcriptionService: transcriptionServiceName
				};
			} catch (error) {
				const message =
					error instanceof Error ? error.message : 'Failed to transcribe audio';
				queueTranscriptUpdate({
					transcriptionSource: 'audio',
					transcriptionStatus: 'failed',
					transcriptionError: message
				});
				throw error;
			}
		}
	};

	function scheduleDraftCleanup() {
		if (!browser || hasScheduledDraftCleanup) return;
		hasScheduledDraftCleanup = true;

		const runCleanup = () => {
			cleanupVoiceNoteGroups({ maxAgeHours: 24 }).catch((error) => {
				if (error instanceof Error) {
					console.warn('[VoiceNotes] Draft cleanup failed:', error.message);
				}
			});
		};

		if ('requestIdleCallback' in window) {
			(
				window as Window & { requestIdleCallback?: (cb: () => void) => void }
			).requestIdleCallback?.(runCleanup);
		} else {
			setTimeout(runCleanup, 1500);
		}
	}

	function buildGroupMetadata(): Record<string, unknown> {
		const metadata: Record<string, unknown> = {};
		if (voiceNoteSource) {
			metadata.source_component = voiceNoteSource;
		}
		return metadata;
	}

	function getOrCreateGroupState(groupId: string): GroupState {
		const existing = groupStates.get(groupId);
		if (existing) return existing;

		const nextState: GroupState = {
			segmentIndex: 0,
			segments: new Map()
		};
		groupStates.set(groupId, nextState);
		return nextState;
	}

	function startGroupCreation(groupId: string): Promise<string> {
		const existing = groupCreatePromises.get(groupId);
		if (existing) return existing;

		const promise = createVoiceNoteGroup({ id: groupId, metadata: buildGroupMetadata() })
			.then(() => groupId)
			.catch((error) => {
				groupCreatePromises.delete(groupId);
				throw error;
			});

		groupCreatePromises.set(groupId, promise);
		return promise;
	}

	function getOrCreateGroupId(): string {
		if (voiceNoteGroupId) return voiceNoteGroupId;
		const newGroupId = crypto.randomUUID();
		voiceNoteGroupId = newGroupId;
		onVoiceNoteGroupReady?.(newGroupId);
		startGroupCreation(newGroupId).catch((error) => {
			const message =
				error instanceof Error ? error.message : 'Failed to create voice note group';
			onVoiceNoteSegmentError?.(message);
		});
		return newGroupId;
	}

	function enqueueUpload(task: () => Promise<void>) {
		uploadQueue.push(task);
		void processUploadQueue();
	}

	async function processUploadQueue() {
		while (activeUploads < MAX_CONCURRENT_UPLOADS && uploadQueue.length > 0) {
			const task = uploadQueue.shift();
			if (!task) return;
			activeUploads += 1;
			task()
				.catch((error) => {
					if (error instanceof Error) {
						console.warn('[VoiceNotes] Upload failed:', error.message);
					}
				})
				.finally(() => {
					activeUploads -= 1;
					void processUploadQueue();
				});
		}
	}

	function queueTranscriptUpdate(update: PendingTranscriptUpdate) {
		if (!lastTranscriptionTarget) return;
		const { groupId, segmentIndex } = lastTranscriptionTarget;
		const groupState = getOrCreateGroupState(groupId);
		const segmentState = groupState.segments.get(segmentIndex) ?? {};

		if (!segmentState.voiceNoteId) {
			segmentState.pendingTranscript = update;
			groupState.segments.set(segmentIndex, segmentState);
			return;
		}

		void applyTranscriptUpdate(groupId, segmentIndex, update);
	}

	async function applyTranscriptUpdate(
		groupId: string,
		segmentIndex: number,
		update: PendingTranscriptUpdate
	) {
		const groupState = getOrCreateGroupState(groupId);
		const segmentState = groupState.segments.get(segmentIndex);

		if (!segmentState?.voiceNoteId) {
			const nextSegmentState = segmentState ?? {};
			nextSegmentState.pendingTranscript = update;
			groupState.segments.set(segmentIndex, nextSegmentState);
			return;
		}

		const metadata: Record<string, unknown> = {};
		if (typeof update.latencyMs === 'number') {
			metadata.transcription_latency_ms = update.latencyMs;
		}
		if (update.transcriptionService) {
			metadata.transcription_service = update.transcriptionService;
		}

		try {
			const updated = await updateVoiceNote(segmentState.voiceNoteId, {
				transcript: update.transcript ?? null,
				transcriptionStatus: update.transcriptionStatus,
				transcriptionSource: update.transcriptionSource,
				transcriptionModel: update.transcriptionModel ?? null,
				transcriptionError: update.transcriptionError ?? null,
				metadata: Object.keys(metadata).length > 0 ? metadata : null
			});
			onVoiceNoteSegmentSaved?.(updated);
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Failed to update voice note transcript';
			onVoiceNoteSegmentError?.(message);
		}
	}

	async function uploadVoiceSegment(params: {
		groupId: string;
		segmentIndex: number;
		audioBlob: Blob;
		durationSeconds: number;
		recordedAt: string;
		transcript?: string;
		transcriptionStatus?: string;
		transcriptionSource?: string;
	}) {
		const {
			groupId,
			segmentIndex,
			audioBlob,
			durationSeconds,
			recordedAt,
			transcript,
			transcriptionStatus,
			transcriptionSource
		} = params;

		try {
			const metadata: Record<string, unknown> = {};
			if (voiceNoteSource) {
				metadata.source_component = voiceNoteSource;
			}
			if (transcriptionSource === 'live') {
				metadata.transcription_service = 'web-speech-api';
			}

			await startGroupCreation(groupId);
			const voiceNote = await uploadVoiceNote({
				audioBlob,
				durationSeconds,
				groupId,
				segmentIndex,
				recordedAt,
				transcript: transcript ?? null,
				transcriptionStatus: transcriptionStatus ?? null,
				transcriptionSource: transcriptionSource ?? null,
				transcribe: false,
				metadata: Object.keys(metadata).length > 0 ? metadata : null
			});

			const groupState = getOrCreateGroupState(groupId);
			const segmentState = groupState.segments.get(segmentIndex) ?? {};
			segmentState.voiceNoteId = voiceNote.id;
			groupState.segments.set(segmentIndex, segmentState);
			onVoiceNoteSegmentSaved?.(voiceNote);

			if (segmentState.pendingTranscript) {
				await applyTranscriptUpdate(groupId, segmentIndex, segmentState.pendingTranscript);
				segmentState.pendingTranscript = undefined;
			}
		} catch (error) {
			const message =
				error instanceof Error ? error.message : 'Failed to save voice note segment';
			onVoiceNoteSegmentError?.(message);
		}
	}

	function handleAudioCaptured(audio: Blob | null, meta: { durationSeconds: number }) {
		if (!audio || audio.size === 0) {
			onVoiceNoteSegmentError?.('No audio captured. Please try again.');
			return;
		}

		const groupId = getOrCreateGroupId();
		const groupState = getOrCreateGroupState(groupId);
		groupState.segmentIndex += 1;
		const segmentIndex = groupState.segmentIndex;
		groupState.segments.set(segmentIndex, {});

		lastTranscriptionTarget = { groupId, segmentIndex };

		// Use captured transcript from stopVoiceRecording (set before UI was cleared)
		const transcriptSnapshot = capturedTranscriptForCallback;
		const hasTranscript = transcriptSnapshot.length > 0;
		// Note: hadLiveTranscript is already set in stopVoiceRecording
		const recordedAt = new Date().toISOString();

		enqueueUpload(() =>
			uploadVoiceSegment({
				groupId,
				segmentIndex,
				audioBlob: audio,
				durationSeconds: meta.durationSeconds,
				recordedAt,
				transcript: hasTranscript ? transcriptSnapshot : undefined,
				transcriptionStatus: hasTranscript ? 'complete' : 'pending',
				transcriptionSource: hasTranscript ? 'live' : undefined
			})
		);
	}

	const isLiveTranscribing = $derived(
		isCurrentlyRecording && liveTranscriptPreview.trim().length > 0 && _canUseLiveTranscript
	);

	const transcribingStatusLabel = $derived(
		hadLiveTranscript ? 'Refining transcript…' : transcribingLabel
	);

	const voiceButtonState = $derived.by(() =>
		buildVoiceButtonState({
			enableVoice,
			isVoiceSupported,
			isCurrentlyRecording,
			isInitializingRecording,
			isTranscribing: _isTranscribing,
			voiceBlocked,
			hasAttemptedVoice,
			voiceError: _voiceError,
			microphonePermissionGranted,
			disabled,
			voiceBlockedLabel,
			voiceButtonLabel
		})
	);

	const voiceButtonClasses = $derived(getVoiceButtonClasses(voiceButtonState.variant));

	onMount(() => {
		if (enableVoice) {
			initializeVoice();
		}
		scheduleDraftCleanup();
	});

	$effect(() => {
		if (enableVoice && !voiceInitialized) {
			initializeVoice();
		}

		if (!enableVoice && voiceInitialized) {
			stopRecordingInternal();
			cleanupVoice();
		}

		if ((voiceBlocked || disabled) && isCurrentlyRecording) {
			stopRecordingInternal();
		}
	});

	onDestroy(() => {
		stopRecordingInternal();
		cleanupVoice();
	});

	function buildVoiceButtonState(params: {
		enableVoice: boolean;
		isVoiceSupported: boolean;
		isCurrentlyRecording: boolean;
		isInitializingRecording: boolean;
		isTranscribing: boolean;
		voiceBlocked: boolean;
		hasAttemptedVoice: boolean;
		voiceError: string;
		microphonePermissionGranted: boolean;
		disabled: boolean;
		voiceBlockedLabel: string;
		voiceButtonLabel: string;
	}): VoiceButtonState {
		const {
			enableVoice,
			isVoiceSupported,
			isCurrentlyRecording,
			isInitializingRecording,
			isTranscribing,
			voiceBlocked,
			hasAttemptedVoice,
			voiceError,
			microphonePermissionGranted,
			disabled,
			voiceBlockedLabel,
			voiceButtonLabel
		} = params;

		if (!enableVoice) {
			return {
				icon: MicOff,
				label: 'Voice capture disabled',
				disabled: true,
				isLoading: false,
				variant: 'muted'
			};
		}

		if (!isVoiceSupported) {
			return {
				icon: MicOff,
				label: 'Voice capture unavailable',
				disabled: true,
				isLoading: false,
				variant: 'muted'
			};
		}

		if (disabled) {
			return {
				icon: MicOff,
				label: 'Input disabled',
				disabled: true,
				isLoading: false,
				variant: 'muted'
			};
		}

		if (voiceBlocked) {
			return {
				icon: Mic,
				label: voiceBlockedLabel,
				disabled: true,
				isLoading: false,
				variant: 'muted'
			};
		}

		if (isCurrentlyRecording) {
			return {
				icon: MicOff,
				label: 'Stop recording',
				disabled: false,
				isLoading: false,
				variant: 'recording'
			};
		}

		if (isInitializingRecording) {
			return {
				icon: LoaderCircle,
				label: preparingLabel,
				disabled: true,
				isLoading: true,
				variant: 'loading'
			};
		}

		if (isTranscribing) {
			return {
				icon: LoaderCircle,
				label: transcribingStatusLabel,
				disabled: true,
				isLoading: true,
				variant: 'loading'
			};
		}

		if (!microphonePermissionGranted && (hasAttemptedVoice || voiceError)) {
			return {
				icon: Mic,
				label: 'Enable microphone',
				disabled: false,
				isLoading: false,
				variant: 'prompt'
			};
		}

		return {
			icon: Mic,
			label: voiceButtonLabel,
			disabled: false,
			isLoading: false,
			variant: 'ready'
		};
	}

	function getVoiceButtonClasses(variant: VoiceButtonVariant): string {
		// Base classes for all interactive states - Inkprint compliant
		const base =
			'shadow-ink pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 dark:focus-visible:ring-offset-background';

		switch (variant) {
			case 'recording':
				// Active recording (stop action) - solid destructive for urgency/stop
				return `${base} border-2 border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90`;
			case 'loading':
				// Processing state - subtle muted, non-interactive feel
				return `${base} border border-border bg-muted text-muted-foreground`;
			case 'prompt':
				// Needs attention (enable mic) - accent outline to draw eye
				return `${base} border-2 border-accent bg-accent/10 text-accent hover:bg-accent/20 dark:bg-accent/15 dark:hover:bg-accent/25`;
			case 'muted':
				// Disabled/unavailable - clearly inactive, no pressable
				return `border border-border bg-muted text-muted-foreground/40 cursor-not-allowed`;
			default:
				// Ready state - outline style to complement accent send button
				return `${base} border border-foreground/20 bg-card text-foreground hover:border-foreground/40 hover:bg-muted dark:border-foreground/15 dark:hover:border-foreground/30`;
		}
	}

	async function initializeVoice() {
		if (voiceInitialized) return;

		isVoiceSupported = voiceRecordingService.isVoiceSupported();
		_canUseLiveTranscript = voiceRecordingService.isLiveTranscriptSupported();
		microphonePermissionGranted = false;
		hasAttemptedVoice = false;
		_voiceError = '';

		if (!isVoiceSupported) {
			voiceInitialized = true;
			return;
		}

		voiceRecordingService.initialize(
			{
				onTextUpdate: (text: string) => {
					value = text;
					_voiceError = '';
				},
				onError: (errorMessage: string) => {
					_voiceError = errorMessage;
					isCurrentlyRecording = false;
					isInitializingRecording = false;
				},
				onPhaseChange: (phase: 'idle' | 'transcribing') => {
					_isTranscribing = phase === 'transcribing';
					if (phase === 'idle') {
						hadLiveTranscript = false;
					}
				},
				onPermissionGranted: () => {
					microphonePermissionGranted = true;
					_voiceError = '';
				},
				onCapabilityUpdate: (update: { canUseLiveTranscript: boolean }) => {
					_canUseLiveTranscript = update.canUseLiveTranscript;
				},
				onAudioCaptured: handleAudioCaptured
			},
			transcriptionService
		);

		const durationStore = voiceRecordingService.getRecordingDuration();
		durationUnsubscribe = durationStore.subscribe((newDuration) => {
			_recordingDuration = newDuration;
		});

		transcriptUnsubscribe = liveTranscript.subscribe((text) => {
			liveTranscriptPreview = text;
		});

		voiceInitialized = true;
	}

	async function startVoiceRecording() {
		if (
			!enableVoice ||
			!isVoiceSupported ||
			voiceBlocked ||
			isInitializingRecording ||
			isCurrentlyRecording ||
			_isTranscribing ||
			disabled
		) {
			return;
		}

		hasAttemptedVoice = true;
		_voiceError = '';
		isInitializingRecording = true;
		hadLiveTranscript = false;

		try {
			await voiceRecordingService.startRecording(value);
			isInitializingRecording = false;
			isCurrentlyRecording = true;
			microphonePermissionGranted = true;
			// Focus textarea so Space/Enter can stop recording
			textareaRef?.focus();
		} catch (error) {
			console.error('Failed to start voice recording:', error);
			const message =
				error instanceof Error
					? error.message
					: 'Unable to access microphone. Please check permissions.';
			_voiceError = message;
			microphonePermissionGranted = false;
			isInitializingRecording = false;
			isCurrentlyRecording = false;
		}
	}

	async function stopVoiceRecording() {
		if (!isCurrentlyRecording && !isInitializingRecording) {
			return;
		}

		// Capture live transcript BEFORE clearing for use in handleAudioCaptured callback
		capturedTranscriptForCallback = liveTranscriptPreview.trim();
		hadLiveTranscript = capturedTranscriptForCallback.length > 0;

		// Clear recording states IMMEDIATELY so transcribing state can show
		// This must happen BEFORE the await so the UI updates promptly
		liveTranscriptPreview = '';
		isCurrentlyRecording = false;
		isInitializingRecording = false;

		try {
			await voiceRecordingService.stopRecording(value);
		} catch (error) {
			console.error('Failed to stop voice recording:', error);
			const message =
				error instanceof Error ? error.message : 'Failed to stop recording. Try again.';
			_voiceError = message;
		} finally {
			// Clear captured transcript after callback has had a chance to use it
			capturedTranscriptForCallback = '';
		}
	}

	async function toggleVoiceRecording() {
		if (!enableVoice || !isVoiceSupported) return;

		// Haptic feedback for voice toggle (mobile)
		haptic('light');

		if (isCurrentlyRecording || isInitializingRecording) {
			await stopVoiceRecording();
		} else {
			await startVoiceRecording();
		}
	}

	async function stopRecordingInternal() {
		if (isCurrentlyRecording || isInitializingRecording) {
			await stopVoiceRecording();
		}
	}

	function cleanupVoice() {
		if (!voiceInitialized) return;

		durationUnsubscribe?.();
		transcriptUnsubscribe?.();
		durationUnsubscribe = null;
		transcriptUnsubscribe = null;

		voiceRecordingService.cleanup();

		isCurrentlyRecording = false;
		isInitializingRecording = false;
		_isTranscribing = false;
		_recordingDuration = 0;
		liveTranscriptPreview = '';
		hadLiveTranscript = false;
		hasAttemptedVoice = false;
		microphonePermissionGranted = false;
		voiceInitialized = false;
	}

	function handleTextareaInput(event: Event) {
		let target = event?.target as HTMLTextAreaElement;
		value = target.value;
	}

	function handleTextareaKeyDown(event: KeyboardEvent) {
		// Stop recording on Space or Enter when recording is active
		if (isCurrentlyRecording && (event.key === ' ' || event.key === 'Enter')) {
			event.preventDefault();
			event.stopPropagation();
			stopVoiceRecording();
		}
	}

	// Global keydown handler for stopping recording (works even when textarea not focused)
	function handleGlobalKeyDown(event: KeyboardEvent) {
		if (isCurrentlyRecording && (event.key === ' ' || event.key === 'Enter')) {
			// Stop recording regardless of focus - this is the expected behavior
			// when voice recording is active
			event.preventDefault();
			stopVoiceRecording();
		}
	}

	// Set up global keydown listener when recording starts
	$effect(() => {
		if (browser && isCurrentlyRecording) {
			document.addEventListener('keydown', handleGlobalKeyDown);
			return () => {
				document.removeEventListener('keydown', handleGlobalKeyDown);
			};
		}
	});

	export async function stopRecording() {
		await stopRecordingInternal();
	}

	export async function cleanup() {
		await stopRecordingInternal();
		cleanupVoice();
	}

	function formatDuration(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}
</script>

<div class={`${containerClass} ${className}`.trim()}>
	<!-- Live transcript preview: Positioned above textarea as floating box -->
	{#if enableVoice && showLiveTranscriptPreview && isLiveTranscribing}
		<div
			class="mb-2 overflow-hidden rounded-lg border border-accent/50 bg-card shadow-ink"
			aria-live="polite"
			aria-atomic="true"
		>
			<div class="flex items-start gap-2 px-3 py-2">
				<span
					class="mt-0.5 inline-flex shrink-0 items-center gap-1.5 rounded-full bg-accent/15 px-2 py-0.5 text-xs font-medium text-accent"
				>
					<span class="h-1.5 w-1.5 animate-pulse rounded-full bg-accent"></span>
					{liveTranscriptLabel}
				</span>
				<p class="m-0 line-clamp-3 flex-1 text-sm leading-relaxed text-foreground">
					{liveTranscriptPreview}
				</p>
			</div>
		</div>
	{/if}

	<div class="relative">
		<!-- Textarea with optional live transcript preview overlay -->
		<Textarea
			bind:this={textareaRef}
			bind:value
			{placeholder}
			{rows}
			{maxRows}
			{autoResize}
			{disabled}
			{helperText}
			{error}
			{errorMessage}
			class={textareaClass}
			oninput={handleTextareaInput}
			{...restProps}
			onkeydown={(e) => {
				handleTextareaKeyDown(e);
				// Also call any passed keydown handler from restProps
				restProps.onkeydown?.(e);
			}}
		/>
	</div>

	<!-- Mobile action bar: Visible only on portrait phones (< 480px) -->
	<!-- z-10 ensures buttons are ALWAYS clickable above any overlays -->
	<div class="relative z-10 mt-2 flex items-center justify-end gap-2 xs:hidden">
		<!-- Voice recording button for mobile (larger touch target) -->
		{#if enableVoice}
			<button
				type="button"
				class={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all duration-150 touch-manipulation ${voiceButtonClasses}`}
				style="-webkit-tap-highlight-color: transparent;"
				onclick={toggleVoiceRecording}
				aria-label={voiceButtonState.label}
				title={voiceButtonState.label}
				aria-pressed={voiceButtonState.variant === 'recording' ? true : undefined}
				disabled={voiceButtonState.disabled}
			>
				{#if voiceButtonState.isLoading}
					<LoaderCircle class="h-5 w-5 animate-spin" />
				{:else}
					{@const VoiceIcon = voiceButtonState.icon}
					<VoiceIcon class="h-5 w-5" />
				{/if}
			</button>
		{/if}

		<!-- Custom action buttons (e.g., send) for mobile -->
		{#if actions}
			{@render actions()}
		{/if}
	</div>

	{#if showStatusRow}
		<!-- Status row: hints, status indicators, and action buttons -->
		<div class="mt-1.5 px-1">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<!-- Left side: Status indicators and keyboard hints -->
				<div class="flex flex-wrap items-center gap-1.5">
					{#if enableVoice && isCurrentlyRecording}
						<!-- Recording indicator: destructive semantic with pulse animation -->
						<span class="flex items-center gap-1.5 text-destructive">
							<span class="relative flex h-2 w-2 items-center justify-center">
								<span
									class="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive/60"
								></span>
								<span
									class="relative inline-flex h-1.5 w-1.5 rounded-full bg-destructive"
								></span>
							</span>
							<span class="text-xs font-semibold">{listeningLabel}</span>
							<span class="text-xs font-bold tabular-nums"
								>{formatDuration(_recordingDuration)}</span
							>
							<!-- Keyboard hint to stop recording (desktop only) -->
							<kbd
								class="hidden rounded border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 font-mono text-[0.65rem] font-medium text-destructive md:inline-flex"
							>
								Enter
							</kbd>
						</span>
					{:else if enableVoice && isInitializingRecording}
						<!-- Initializing state: muted, processing feel -->
						<span class="flex items-center gap-1.5 text-muted-foreground">
							<LoaderCircle class="h-3 w-3 animate-spin" />
							<span class="text-xs font-medium">{preparingLabel}</span>
						</span>
					{:else if enableVoice && _isTranscribing}
						<!-- Transcribing state: accent color for active processing -->
						<span class="flex items-center gap-1.5 text-accent">
							<LoaderCircle class="h-3 w-3 animate-spin" />
							<span class="text-xs font-semibold">{transcribingStatusLabel}</span>
						</span>
					{:else if enableVoice && !isVoiceSupported}
						<!-- Unsupported: muted text -->
						<span class="text-xs font-medium text-muted-foreground"
							>Voice unavailable</span
						>
					{:else if enableVoice && voiceBlocked}
						<!-- Blocked: warning state -->
						<span class="text-xs font-medium text-amber-600 dark:text-amber-500"
							>{voiceBlockedLabel}</span
						>
					{:else}
						<!-- Idle hint: keyboard shortcuts (desktop only - hidden on mobile) -->
						<span
							class="hidden text-xs text-muted-foreground md:inline-flex md:items-center"
						>
							<kbd
								class="rounded border border-border bg-background px-1 py-0.5 font-mono text-[0.65rem] font-medium text-foreground"
								>Enter</kbd
							>
							<span class="mx-1">send</span>
							<span class="text-muted-foreground/50">·</span>
							<kbd
								class="ml-1 rounded border border-border bg-background px-1 py-0.5 font-mono text-[0.65rem] font-medium text-foreground"
								>Shift+Enter</kbd
							>
							<span class="ml-1">new line</span>
						</span>
						<!-- Mobile hint: conditional on voice availability -->
						<span class="text-xs text-muted-foreground md:hidden">
							{#if enableVoice && !voiceBlocked}
								Tap send or use voice
							{:else}
								Tap send
							{/if}
						</span>
					{/if}

					<!-- Live transcript badge: accent styling, micro-label -->
					{#if enableVoice && _canUseLiveTranscript && isCurrentlyRecording}
						<span
							class="hidden rounded-md border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider text-accent xs:inline-flex"
						>
							{liveTranscriptLabel}
						</span>
					{/if}
				</div>

				<!-- Right side: Errors, status snippet, and action buttons -->
				<div class="flex items-center gap-2">
					{#if enableVoice && _voiceError}
						<!-- Error badge: destructive with Inkprint static texture -->
						<span
							role="alert"
							class="flex max-w-[200px] items-center gap-1 truncate rounded-md border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive tx tx-static tx-weak"
						>
							{_voiceError}
						</span>
					{/if}

					{#if status}
						{@render status({
							isCurrentlyRecording,
							isTranscribing: _isTranscribing,
							recordingDuration: _recordingDuration,
							voiceError: _voiceError
						})}
					{/if}

					<!-- Action buttons: inline with status row (desktop) -->
					<div class="hidden items-center gap-1.5 xs:flex">
						<!-- Custom action buttons (e.g., send button) -->
						{#if actions}
							{@render actions()}
						{/if}

						<!-- Voice recording button -->
						{#if enableVoice}
							<button
								type="button"
								class={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-all duration-150 touch-manipulation ${voiceButtonClasses}`}
								style="-webkit-tap-highlight-color: transparent;"
								onclick={toggleVoiceRecording}
								aria-label={voiceButtonState.label}
								title={voiceButtonState.label}
								aria-pressed={voiceButtonState.variant === 'recording'
									? true
									: undefined}
								disabled={voiceButtonState.disabled}
							>
								{#if voiceButtonState.isLoading}
									<LoaderCircle class="h-4 w-4 animate-spin" />
								{:else}
									{@const VoiceIcon = voiceButtonState.icon}
									<VoiceIcon class="h-4 w-4" />
								{/if}
							</button>
						{/if}
					</div>
				</div>
			</div>
		</div>
	{/if}
</div>
