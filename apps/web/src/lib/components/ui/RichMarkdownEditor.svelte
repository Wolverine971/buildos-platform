<!-- apps/web/src/lib/components/ui/RichMarkdownEditor.svelte -->
<script module lang="ts">
	let richMarkdownIdCounter = 0;
</script>

<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import CodeMirrorEditor from './codemirror/CodeMirrorEditor.svelte';
	import {
		Bold,
		Italic,
		Heading1,
		Heading2,
		List,
		ListOrdered,
		Quote,
		Code,
		Link as LinkIcon,
		Eye,
		Edit3,
		Mic,
		MicOff,
		LoaderCircle,
		MoreHorizontal,
		ChevronUp
	} from 'lucide-svelte';
	import { renderMarkdown, getProseClasses } from '$lib/utils/markdown';
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

	type EditorSize = 'sm' | 'base' | 'lg';
	type ToolbarAction = 'bold' | 'italic' | 'h1' | 'h2' | 'ul' | 'ol' | 'quote' | 'code' | 'link';
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
		id?: string;
		label?: string;
		helpText?: string;
		placeholder?: string;
		required?: boolean;
		disabled?: boolean;
		maxLength?: number;
		/** @deprecated No longer used with CodeMirror editor */
		rows?: number;
		size?: EditorSize;
		/** When true, the editor expands to fill its parent container height */
		fillHeight?: boolean;
		class?: string;
		// Voice recording props
		enableVoice?: boolean;
		voiceBlocked?: boolean;
		voiceBlockedLabel?: string;
		transcriptionEndpoint?: string;
		vocabularyTerms?: string;
		// Voice note storage props
		voiceNoteSource?: string;
		voiceNoteLinkedEntityType?: string;
		voiceNoteLinkedEntityId?: string;
		voiceNoteGroupId?: string | null;
		onVoiceNoteGroupReady?: (groupId: string) => void;
		onVoiceNoteSegmentSaved?: (voiceNote: VoiceNote) => void;
		onVoiceNoteSegmentError?: (error: string) => void;
		/** Callback on Cmd/Ctrl+S */
		onSave?: () => void;
		/** Called on every document change (replaces onchange/oninput) */
		onDocChange?: (value: string) => void;
		// Bindable voice state
		isRecording?: boolean;
		isTranscribing?: boolean;
		voiceError?: string;
		recordingDuration?: number;
	}

	let {
		value = $bindable(''),
		id,
		label,
		helpText,
		placeholder = 'Write in Markdown...',
		required = false,
		disabled = false,
		maxLength = 8000,
		rows = 12,
		size = 'base',
		fillHeight = false,
		class: className = '',
		// Voice props
		enableVoice = true,
		voiceBlocked = false,
		voiceBlockedLabel = 'Recording unavailable right now',
		transcriptionEndpoint = '/api/transcribe',
		vocabularyTerms = '',
		// Voice note storage
		voiceNoteSource = '',
		voiceNoteLinkedEntityType = '',
		voiceNoteLinkedEntityId = '',
		voiceNoteGroupId = $bindable(null),
		onVoiceNoteGroupReady,
		onVoiceNoteSegmentSaved,
		onVoiceNoteSegmentError,
		onSave,
		onDocChange,
		// Bindable voice state
		isRecording = $bindable(false),
		isTranscribing = $bindable(false),
		voiceError = $bindable(''),
		recordingDuration = $bindable(0)
	}: Props = $props();

	let mode = $state<'edit' | 'preview'>('edit');
	let editorRef = $state<CodeMirrorEditor | null>(null);
	let showMoreTools = $state(false);
	const generatedId = `rich-markdown-${++richMarkdownIdCounter}`;
	const editorId = $derived(id ?? generatedId);

	// ============================================
	// Voice Recording State
	// ============================================
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
	let voiceInitialized = $state(false);
	// Smooth transition state - keeps recording UI visible during text insertion
	let isTransitioningFromRecording = $state(false);
	let transitionTranscript = $state('');

	// Extended "Added" feedback state (shows longer than transition)
	let showAddedFeedback = $state(false);
	let addedFeedbackTimeout: ReturnType<typeof setTimeout> | null = null;

	// Processing state - shows spinner on button while inserting text
	let isInsertingText = $state(false);

	// Cursor position tracking - CRITICAL for insertion at cursor
	let cursorPositionBeforeRecording = $state<{ start: number; end: number } | null>(null);

	// Voice service subscriptions
	let durationUnsubscribe: (() => void) | null = null;
	let transcriptUnsubscribe: (() => void) | null = null;

	// Voice note storage
	type PendingTranscriptUpdate = {
		transcript?: string;
		transcriptionSource: 'audio' | 'live';
		transcriptionStatus: 'complete' | 'failed';
		transcriptionModel?: string | null;
		transcriptionService?: string | null;
		transcriptionError?: string | null;
		latencyMs?: number;
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
	let capturedTranscriptForCallback = '';
	const MAX_CONCURRENT_UPLOADS = 2;

	// ============================================
	// Derived State
	// ============================================
	const stats = $derived({
		words: value.trim() ? value.trim().split(/\s+/).length : 0,
		chars: value.length
	});

	const labelSizeClass = size === 'lg' ? 'text-base' : 'text-sm';

	const proseSize = size === 'sm' ? 'sm' : size === 'lg' ? 'lg' : 'base';
	const proseClasses = $derived(getProseClasses(proseSize));

	// Primary toolbar buttons (always visible)
	const primaryToolbarButtons: Array<{ id: ToolbarAction; icon: typeof Bold; label: string }> = [
		{ id: 'bold', icon: Bold, label: 'Bold' },
		{ id: 'italic', icon: Italic, label: 'Italic' },
		{ id: 'h1', icon: Heading1, label: 'Heading 1' },
		{ id: 'h2', icon: Heading2, label: 'Heading 2' },
		{ id: 'ul', icon: List, label: 'Bulleted list' },
		{ id: 'ol', icon: ListOrdered, label: 'Numbered list' }
	];

	// Secondary toolbar buttons (overflow on mobile)
	const secondaryToolbarButtons: Array<{ id: ToolbarAction; icon: typeof Bold; label: string }> =
		[
			{ id: 'quote', icon: Quote, label: 'Quote' },
			{ id: 'code', icon: Code, label: 'Code' },
			{ id: 'link', icon: LinkIcon, label: 'Link' }
		];

	// Voice button state machine
	const transcribingStatusLabel = $derived(
		hadLiveTranscript ? 'Refining transcript...' : 'Transcribing...'
	);

	const voiceButtonState = $derived.by(() =>
		buildVoiceButtonState({
			enableVoice,
			isVoiceSupported,
			isCurrentlyRecording,
			isInitializingRecording,
			isTranscribing: _isTranscribing,
			isInsertingText,
			voiceBlocked,
			hasAttemptedVoice,
			voiceError: _voiceError,
			microphonePermissionGranted,
			disabled: disabled ?? false,
			mode,
			voiceBlockedLabel
		})
	);

	const voiceButtonClasses = $derived(getVoiceButtonClasses(voiceButtonState.variant));

	// ============================================
	// Sync bindable props
	// ============================================
	$effect(() => {
		isRecording = isCurrentlyRecording;
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
		if (voiceInitialized) {
			voiceRecordingService.setVocabularyTerms(vocabularyTerms);
		}
	});

	// Sync live transcript preview to CM6 voice widget
	$effect(() => {
		if (editorRef && liveTranscriptPreview) {
			editorRef.updateTranscriptPreview(liveTranscriptPreview);
		}
	});

	// ============================================
	// Toolbar Commands (delegated to CodeMirror)
	// ============================================
	function handleToolbar(action: ToolbarAction) {
		if (disabled || !editorRef) return;

		switch (action) {
			case 'bold':
				editorRef.execBold();
				break;
			case 'italic':
				editorRef.execItalic();
				break;
			case 'h1':
				editorRef.execH1();
				break;
			case 'h2':
				editorRef.execH2();
				break;
			case 'ul':
				editorRef.execBulletList();
				break;
			case 'ol':
				editorRef.execOrderedList();
				break;
			case 'quote':
				editorRef.execBlockquote();
				break;
			case 'code':
				editorRef.execCodeBlock();
				break;
			case 'link':
				editorRef.execLink();
				break;
		}
	}

	function toggleMode(nextMode: 'edit' | 'preview') {
		// Stop recording if switching to preview
		if (nextMode === 'preview' && isCurrentlyRecording) {
			stopVoiceRecording();
		}
		mode = nextMode;
		if (nextMode === 'edit') {
			editorRef?.focus();
		}
	}

	// ============================================
	// Voice Recording Functions
	// ============================================
	function buildVoiceButtonState(params: {
		enableVoice: boolean;
		isVoiceSupported: boolean;
		isCurrentlyRecording: boolean;
		isInitializingRecording: boolean;
		isTranscribing: boolean;
		isInsertingText: boolean;
		voiceBlocked: boolean;
		hasAttemptedVoice: boolean;
		voiceError: string;
		microphonePermissionGranted: boolean;
		disabled: boolean;
		mode: 'edit' | 'preview';
		voiceBlockedLabel: string;
	}): VoiceButtonState {
		const {
			enableVoice,
			isVoiceSupported,
			isCurrentlyRecording,
			isInitializingRecording,
			isTranscribing,
			isInsertingText,
			voiceBlocked,
			hasAttemptedVoice,
			voiceError,
			microphonePermissionGranted,
			disabled,
			mode,
			voiceBlockedLabel
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

		if (mode === 'preview') {
			return {
				icon: Mic,
				label: 'Switch to edit mode to record',
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

		if (isInsertingText) {
			return {
				icon: LoaderCircle,
				label: 'Adding text...',
				disabled: true,
				isLoading: true,
				variant: 'loading'
			};
		}

		if (isInitializingRecording) {
			return {
				icon: LoaderCircle,
				label: 'Preparing microphone...',
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
			label: 'Record voice note',
			disabled: false,
			isLoading: false,
			variant: 'ready'
		};
	}

	function getVoiceButtonClasses(variant: VoiceButtonVariant): string {
		const base =
			'shadow-ink pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 dark:focus-visible:ring-offset-background';

		switch (variant) {
			case 'recording':
				return `${base} border-2 border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90`;
			case 'loading':
				return `${base} border border-border bg-muted/80 text-muted-foreground`;
			case 'prompt':
				return `${base} border-2 border-accent bg-accent/10 text-accent hover:bg-accent/20 dark:bg-accent/15 dark:hover:bg-accent/25`;
			case 'muted':
				return `border border-border bg-muted/60 text-muted-foreground/40 cursor-not-allowed`;
			default:
				return `${base} border border-foreground/20 bg-card text-foreground hover:border-foreground/40 hover:bg-muted/50 dark:border-foreground/15 dark:hover:border-foreground/30`;
		}
	}

	function formatDuration(seconds: number): string {
		const mins = Math.floor(seconds / 60);
		const secs = seconds % 60;
		return `${mins}:${secs.toString().padStart(2, '0')}`;
	}

	// ============================================
	// Transcription at Cursor Position
	// ============================================
	function insertTranscriptionAtCursor(transcript: string) {
		const trimmedTranscript = transcript.trim();
		if (!trimmedTranscript || !editorRef) return;

		if (!cursorPositionBeforeRecording) {
			// Fallback: append to end
			const pos = value.length;
			const separator = value.trim() ? ' ' : '';
			editorRef.insertTextAt(pos, separator + trimmedTranscript);
			return;
		}

		const { start, end } = cursorPositionBeforeRecording;
		// insertTextAt handles smart spacing when start === end (no selection)
		editorRef.insertTextAt(start, trimmedTranscript, end !== start ? end : undefined);

		// Reset cursor tracking
		cursorPositionBeforeRecording = null;
	}

	// ============================================
	// Voice Note Storage
	// ============================================
	function scheduleDraftCleanup() {
		if (!browser || hasScheduledDraftCleanup) return;
		hasScheduledDraftCleanup = true;

		const runCleanup = () => {
			cleanupVoiceNoteGroups({ maxAgeHours: 24 }).catch((error) => {
				if (error instanceof Error) {
					console.warn('[RichMarkdownEditor] Draft cleanup failed:', error.message);
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
		metadata.editor_type = 'rich-markdown-editor';
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

		const promise = createVoiceNoteGroup({
			id: groupId,
			metadata: buildGroupMetadata(),
			linkedEntityType: voiceNoteLinkedEntityType || undefined,
			linkedEntityId: voiceNoteLinkedEntityId || undefined
		})
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
						console.warn('[RichMarkdownEditor] Upload failed:', error.message);
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
			metadata.editor_type = 'rich-markdown-editor';

			await startGroupCreation(groupId);
			const voiceNote = await uploadVoiceNote({
				audioBlob,
				durationSeconds,
				groupId,
				segmentIndex,
				recordedAt,
				linkedEntityType: voiceNoteLinkedEntityType || undefined,
				linkedEntityId: voiceNoteLinkedEntityId || undefined,
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

		const transcriptSnapshot = capturedTranscriptForCallback;
		const hasTranscript = transcriptSnapshot.length > 0;
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

	// ============================================
	// Transcription Service
	// ============================================
	async function requestTranscription(
		audioFile: File,
		vocabTerms?: string
	): Promise<{
		transcript: string;
		transcriptionModel?: string | null;
		transcriptionService?: string | null;
	}> {
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

	// ============================================
	// Voice Recording Lifecycle
	// ============================================
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
					// The service appends text - we intercept and insert at cursor instead
					// This is handled in stopVoiceRecording after transcription completes
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
			disabled ||
			mode === 'preview'
		) {
			return;
		}

		hasAttemptedVoice = true;
		_voiceError = '';
		isInitializingRecording = true;
		hadLiveTranscript = false;

		// CRITICAL: Capture cursor position BEFORE recording starts
		if (editorRef) {
			const sel = editorRef.getSelection();
			cursorPositionBeforeRecording = { start: sel.from, end: sel.to };
			// Show inline transcribing indicator in the editor
			editorRef.showTranscribing();
		} else {
			cursorPositionBeforeRecording = { start: value.length, end: value.length };
		}

		try {
			// Pass empty string - we handle text insertion ourselves
			await voiceRecordingService.startRecording('');
			isInitializingRecording = false;
			isCurrentlyRecording = true;
			microphonePermissionGranted = true;
			// Focus editor so Space/Enter can stop recording
			editorRef?.focus();
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
			cursorPositionBeforeRecording = null;
			editorRef?.hideTranscribing();
		}
	}

	async function stopVoiceRecording() {
		if (!isCurrentlyRecording && !isInitializingRecording) {
			return;
		}

		// Capture live transcript BEFORE clearing for use in handleAudioCaptured callback
		capturedTranscriptForCallback = liveTranscriptPreview.trim();
		hadLiveTranscript = capturedTranscriptForCallback.length > 0;

		// Store the transcript we'll use for insertion
		const transcriptToInsert = capturedTranscriptForCallback;

		// Hide the inline voice widget in the editor
		editorRef?.hideTranscribing();

		// Clear the live preview and recording state
		liveTranscriptPreview = '';
		isInitializingRecording = false;
		isCurrentlyRecording = false;

		// Show loading spinner on button while processing
		isInsertingText = true;

		// Clear any existing feedback timeout
		if (addedFeedbackTimeout) {
			clearTimeout(addedFeedbackTimeout);
			addedFeedbackTimeout = null;
		}

		try {
			// Pass empty string - we handle text ourselves
			await voiceRecordingService.stopRecording('');

			// If we had a live transcript, insert it at cursor position now
			// The audio transcription may update it later with better accuracy
			if (transcriptToInsert) {
				// Insert text
				insertTranscriptionAtCursor(transcriptToInsert);

				// Show "Added" feedback for 1.5 seconds
				showAddedFeedback = true;
				addedFeedbackTimeout = setTimeout(() => {
					showAddedFeedback = false;
				}, 1500);
			}

			// Clear inserting state
			isInsertingText = false;
			isTransitioningFromRecording = false;
			transitionTranscript = '';
		} catch (error) {
			console.error('Failed to stop voice recording:', error);
			const message =
				error instanceof Error ? error.message : 'Failed to stop recording. Try again.';
			_voiceError = message;
			// On error, immediately clear all state
			editorRef?.hideTranscribing();
			isCurrentlyRecording = false;
			isInsertingText = false;
			isTransitioningFromRecording = false;
			transitionTranscript = '';
			showAddedFeedback = false;
		} finally {
			capturedTranscriptForCallback = '';
		}
	}

	async function toggleVoiceRecording() {
		if (!enableVoice || !isVoiceSupported) return;

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
		cursorPositionBeforeRecording = null;
		// Clear transition state
		isTransitioningFromRecording = false;
		transitionTranscript = '';
		// Clear feedback state
		if (addedFeedbackTimeout) {
			clearTimeout(addedFeedbackTimeout);
			addedFeedbackTimeout = null;
		}
		showAddedFeedback = false;
		isInsertingText = false;
	}

	// ============================================
	// Keyboard Shortcuts
	// ============================================
	// Global keydown handler for stopping recording
	function handleGlobalKeyDown(event: KeyboardEvent) {
		if (isCurrentlyRecording && (event.key === ' ' || event.key === 'Enter')) {
			event.preventDefault();
			stopVoiceRecording();
		}
	}

	$effect(() => {
		if (browser && isCurrentlyRecording) {
			document.addEventListener('keydown', handleGlobalKeyDown);
			return () => {
				document.removeEventListener('keydown', handleGlobalKeyDown);
			};
		}
	});

	// ============================================
	// Lifecycle
	// ============================================
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

	// ============================================
	// Exported Functions
	// ============================================
	export async function stopRecording() {
		await stopRecordingInternal();
	}

	export async function cleanup() {
		await stopRecordingInternal();
		cleanupVoice();
	}
</script>

<div class={`${fillHeight ? 'flex flex-col h-full' : 'space-y-2'} ${className}`}>
	{#if label}
		<div class="flex items-center justify-between">
			<label for={editorId} class="font-medium text-foreground {labelSizeClass}">
				{label}{#if required}<span class="text-destructive ml-1">*</span>{/if}
			</label>
			{#if maxLength}
				<span class="text-xs text-muted-foreground">
					{stats.chars}/{maxLength} characters
				</span>
			{/if}
		</div>
	{/if}

	<div
		class="rounded-xl border border-border bg-card shadow-ink overflow-hidden tx tx-frame tx-weak {fillHeight
			? 'flex-1 flex flex-col min-h-0'
			: ''}"
	>
		<!-- Header: Unified toolbar row -->
		<div class="border-b border-border bg-muted/30">
			<div class="flex items-center px-2 py-1.5 sm:px-3">
				<!-- Segmented Control for Edit/Preview -->
				<div
					class="inline-flex rounded-lg bg-muted/60 p-0.5 border border-border/50 shrink-0"
					role="tablist"
				>
					<button
						type="button"
						role="tab"
						aria-selected={mode === 'edit'}
						class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all duration-150 {mode ===
						'edit'
							? 'bg-card text-foreground shadow-ink'
							: 'text-muted-foreground hover:text-foreground'}"
						onclick={() => toggleMode('edit')}
					>
						<Edit3 class="w-3.5 h-3.5" />
						<span class="hidden xs:inline">Edit</span>
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={mode === 'preview'}
						class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-all duration-150 {mode ===
						'preview'
							? 'bg-card text-foreground shadow-ink'
							: 'text-muted-foreground hover:text-foreground'}"
						onclick={() => toggleMode('preview')}
					>
						<Eye class="w-3.5 h-3.5" />
						<span class="hidden xs:inline">Preview</span>
					</button>
				</div>

				<!-- Formatting toolbar inline (edit mode only) -->
				{#if mode === 'edit'}
					<div class="w-px h-5 bg-border/50 mx-1.5 shrink-0"></div>
					<div
						class="flex items-center gap-0.5 overflow-x-auto scrollbar-hide flex-1 min-w-0"
					>
						{#each primaryToolbarButtons as action}
							{@const ActionIcon = action.icon}
							<button
								type="button"
								onmousedown={(e) => e.preventDefault()}
								onclick={() => handleToolbar(action.id)}
								class="flex items-center justify-center w-8 h-8 sm:w-7 sm:h-7 rounded-md text-muted-foreground hover:bg-accent/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 disabled:cursor-not-allowed transition-colors active:scale-95 shrink-0"
								title={action.label}
								aria-label={action.label}
								{disabled}
							>
								<ActionIcon class="w-4 h-4" />
							</button>
						{/each}

						<div class="w-px h-5 bg-border/50 mx-0.5 hidden sm:block shrink-0"></div>

						{#each secondaryToolbarButtons as action}
							{@const ActionIcon = action.icon}
							<button
								type="button"
								onmousedown={(e) => e.preventDefault()}
								onclick={() => handleToolbar(action.id)}
								class="hidden sm:flex items-center justify-center w-7 h-7 rounded-md text-muted-foreground hover:bg-accent/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 disabled:cursor-not-allowed transition-colors active:scale-95 shrink-0"
								title={action.label}
								aria-label={action.label}
								{disabled}
							>
								<ActionIcon class="w-4 h-4" />
							</button>
						{/each}

						<!-- More button (mobile only) -->
						<button
							type="button"
							onclick={() => (showMoreTools = !showMoreTools)}
							class="sm:hidden flex items-center justify-center w-8 h-8 rounded-md transition-colors active:scale-95 shrink-0 {showMoreTools
								? 'bg-accent/20 text-accent'
								: 'text-muted-foreground hover:bg-accent/10 hover:text-foreground'}"
							title="More formatting"
							aria-label="More formatting options"
							aria-expanded={showMoreTools}
						>
							{#if showMoreTools}
								<ChevronUp class="w-4 h-4" />
							{:else}
								<MoreHorizontal class="w-4 h-4" />
							{/if}
						</button>
					</div>
				{/if}

				<!-- Stats (hidden on mobile in edit mode to save space) -->
				<div
					class="{mode === 'edit'
						? 'hidden sm:flex'
						: 'flex'} items-center gap-2 text-[10px] sm:text-xs text-muted-foreground ml-auto pl-2 shrink-0"
				>
					<span class="tabular-nums">{stats.words}w</span>
					<span class="hidden sm:inline text-border">·</span>
					<span class="hidden sm:inline tabular-nums">{stats.chars}c</span>
					{#if maxLength}
						<span class="hidden md:inline text-border">·</span>
						<span class="hidden md:inline tabular-nums"
							>{Math.max(0, maxLength - stats.chars)} left</span
						>
					{/if}
				</div>
			</div>

			<!-- Expanded tools (mobile only, edit mode) -->
			{#if mode === 'edit' && showMoreTools}
				<div
					class="sm:hidden flex items-center gap-0.5 px-1.5 py-1.5 border-t border-border/30 bg-muted/10"
				>
					{#each secondaryToolbarButtons as action}
						{@const ActionIcon = action.icon}
						<button
							type="button"
							onmousedown={(e) => e.preventDefault()}
							onclick={() => {
								handleToolbar(action.id);
								showMoreTools = false;
							}}
							class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium text-muted-foreground hover:bg-accent/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40 transition-colors active:scale-95"
							title={action.label}
							aria-label={action.label}
							{disabled}
						>
							<ActionIcon class="w-3.5 h-3.5" />
							<span>{action.label}</span>
						</button>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Content area -->
		{#if mode === 'edit'}
			<CodeMirrorEditor
				bind:this={editorRef}
				bind:value
				{placeholder}
				readOnly={disabled}
				{disabled}
				{maxLength}
				{fillHeight}
				{onSave}
				{onDocChange}
				class={fillHeight ? 'flex-1' : ''}
			/>
		{:else}
			<div
				class="px-4 py-4 bg-card overflow-y-auto {fillHeight
					? 'flex-1 min-h-0'
					: 'min-h-[200px]'}"
			>
				{#if value.trim()}
					<div class={`${proseClasses} text-foreground`}>
						{@html renderMarkdown(value)}
					</div>
				{:else}
					<p class="text-muted-foreground text-sm">
						Nothing to preview yet. Switch back to edit mode to start writing.
					</p>
				{/if}
			</div>
		{/if}

		<!-- Footer with voice controls (compact, mobile-optimized) -->
		{#if enableVoice}
			<div
				class="flex items-center justify-between gap-2 px-2 py-1.5 sm:px-3 sm:py-2 border-t border-border bg-muted/30 text-xs text-muted-foreground"
			>
				<!-- Left side: Recording status or voice info -->
				<div class="flex items-center gap-2 min-w-0 flex-1">
					{#if isCurrentlyRecording && !isTransitioningFromRecording}
						<!-- Recording indicator -->
						<span class="flex items-center gap-1.5 text-destructive">
							<span
								class="relative flex h-2 w-2 items-center justify-center shrink-0"
							>
								<span
									class="absolute inline-flex h-full w-full animate-ping rounded-full bg-destructive/60"
								></span>
								<span
									class="relative inline-flex h-1.5 w-1.5 rounded-full bg-destructive"
								></span>
							</span>
							<span class="font-semibold text-[11px]">Recording</span>
							<span class="font-bold tabular-nums text-[11px]"
								>{formatDuration(_recordingDuration)}</span
							>
						</span>
						<!-- Live transcript preview (multi-line on mobile) -->
						{#if liveTranscriptPreview}
							<div
								class="text-accent text-[10px] sm:text-[11px] px-1.5 py-0.5 rounded bg-accent/10 border border-accent/20 max-w-[200px] sm:max-w-[300px] line-clamp-2 break-words leading-tight"
							>
								{liveTranscriptPreview}
							</div>
						{/if}
					{:else if showAddedFeedback}
						<!-- Extended "Added" indicator (shows for 1.5 seconds) -->
						<span
							class="flex items-center gap-1.5 text-green-600 dark:text-green-400 animate-in fade-in duration-200"
						>
							<svg
								class="h-3.5 w-3.5 shrink-0"
								viewBox="0 0 20 20"
								fill="currentColor"
							>
								<path
									fill-rule="evenodd"
									d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
									clip-rule="evenodd"
								/>
							</svg>
							<span class="font-medium text-[11px]">Text added</span>
						</span>
					{:else if isInitializingRecording}
						<!-- Initializing state -->
						<span class="flex items-center gap-1.5 text-muted-foreground">
							<LoaderCircle class="h-3 w-3 animate-spin shrink-0" />
							<span class="text-[11px]">Preparing mic...</span>
						</span>
					{:else if _isTranscribing}
						<!-- Transcribing state -->
						<span class="flex items-center gap-1.5 text-accent">
							<LoaderCircle class="h-3 w-3 animate-spin shrink-0" />
							<span class="font-medium text-[11px]">{transcribingStatusLabel}</span>
						</span>
					{:else if _voiceError}
						<!-- Error state -->
						<span
							role="alert"
							class="truncate text-destructive text-[11px] font-medium px-1.5 py-0.5 rounded bg-destructive/10 border border-destructive/20 max-w-[200px]"
						>
							{_voiceError}
						</span>
					{:else}
						<!-- Ready state hint -->
						<span class="text-[10px] text-muted-foreground/60 hidden sm:inline">
							Tap mic to record voice note
						</span>
					{/if}
				</div>

				<!-- Right side: Voice button -->
				<button
					type="button"
					class={`flex h-8 w-8 sm:h-7 sm:w-7 shrink-0 items-center justify-center rounded-full transition-all duration-150 touch-manipulation ${voiceButtonClasses}`}
					style="-webkit-tap-highlight-color: transparent;"
					onclick={toggleVoiceRecording}
					aria-label={voiceButtonState.label}
					title={voiceButtonState.label}
					aria-pressed={voiceButtonState.variant === 'recording' ? true : undefined}
					disabled={voiceButtonState.disabled}
				>
					{#if voiceButtonState.isLoading}
						<LoaderCircle class="h-3.5 w-3.5 animate-spin" />
					{:else}
						{@const VoiceIcon = voiceButtonState.icon}
						<VoiceIcon class="h-3.5 w-3.5" />
					{/if}
				</button>
			</div>
		{/if}
	</div>

	{#if helpText}
		<p class="text-xs text-muted-foreground">{helpText}</p>
	{/if}
</div>

<style>
	/* Hide scrollbar but allow scroll */
	.scrollbar-hide {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
	.scrollbar-hide::-webkit-scrollbar {
		display: none;
	}
</style>
