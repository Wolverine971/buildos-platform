<!-- apps/web/src/lib/components/ui/TextareaWithVoice.svelte -->
<script lang="ts">
	import { createEventDispatcher, onDestroy, onMount } from 'svelte';
	import { Mic, MicOff, LoaderCircle } from 'lucide-svelte';
	import Textarea from './Textarea.svelte';
	import {
		voiceRecordingService,
		type TranscriptionService
	} from '$lib/services/voiceRecording.service';
	import { liveTranscript } from '$lib/utils/voice';

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
		idleHint?: string;
		voiceBlocked?: boolean;
		voiceBlockedLabel?: string;
		transcriptionEndpoint?: string;
		liveTranscriptLabel?: string;
		voiceButtonLabel?: string;
		listeningLabel?: string;
		transcribingLabel?: string;
		preparingLabel?: string;
		class?: string;
		// Bindable voice state props for parent components
		isRecording?: boolean;
		isInitializing?: boolean;
		isTranscribing?: boolean;
		voiceError?: string;
		recordingDuration?: number;
		canUseLiveTranscript?: boolean;
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

	const dispatch = createEventDispatcher<{
		input: { value: string };
	}>();

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
		idleHint = 'Use the mic to dictate your update.',
		voiceBlocked = false,
		voiceBlockedLabel = 'Recording unavailable right now',
		transcriptionEndpoint = '/api/transcribe',
		liveTranscriptLabel = 'Live transcript',
		voiceButtonLabel = 'Record voice note',
		listeningLabel = 'Listening',
		transcribingLabel = 'Transcribing…',
		preparingLabel = 'Preparing microphone…',
		class: className = '',
		// Bindable voice state props
		isRecording = $bindable(false),
		isInitializing = $bindable(false),
		isTranscribing = $bindable(false),
		voiceError = $bindable(''),
		recordingDuration = $bindable(0),
		canUseLiveTranscript = $bindable(false),
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
	let _recordingDuration = $state(0);

	let microphonePermissionGranted = $state(false);
	let hasAttemptedVoice = $state(false);
	let durationUnsubscribe: (() => void) | null = null;
	let transcriptUnsubscribe: (() => void) | null = null;
	let voiceInitialized = $state(false);

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

	const transcriptionService: TranscriptionService = {
		async transcribeAudio(audioFile: File) {
			const formData = new FormData();
			formData.append('audio', audioFile);

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
			if (result?.success && result?.data?.transcript) {
				return { transcript: result.data.transcript };
			}

			if (result?.transcript) {
				return { transcript: result.transcript };
			}

			throw new Error('No transcript returned from transcription service');
		}
	};

	const isLiveTranscribing = $derived(
		isCurrentlyRecording && liveTranscriptPreview.trim().length > 0 && _canUseLiveTranscript
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

		if (_isTranscribing) {
			return {
				icon: LoaderCircle,
				label: transcribingLabel,
				disabled: true,
				isLoading: true,
				variant: 'loading'
			};
		}

		if (!microphonePermissionGranted && (hasAttemptedVoice || _voiceError)) {
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
		switch (variant) {
			case 'recording':
				return 'border-2 border-rose-500/60 bg-gradient-to-br from-rose-50 to-red-50 text-rose-600 shadow-sm hover:shadow-md hover:border-rose-600/70 dark:border-rose-500/50 dark:from-rose-900/30 dark:to-red-900/20 dark:text-rose-300';
			case 'loading':
				return 'border border-slate-200/60 bg-white/80 text-slate-400 backdrop-blur-sm dark:border-slate-600/60 dark:bg-slate-800/80 dark:text-slate-400';
			case 'prompt':
				return 'border-2 border-blue-500/60 bg-gradient-to-br from-blue-50 to-indigo-50 text-blue-600 shadow-sm hover:shadow-md hover:border-blue-600/70 dark:border-blue-500/50 dark:from-blue-900/30 dark:to-indigo-900/20 dark:text-blue-300';
			case 'muted':
				return 'border border-slate-200/60 bg-slate-50/80 text-slate-400 cursor-not-allowed dark:border-slate-700/60 dark:bg-slate-800/50 dark:text-slate-500';
			default:
				return 'border border-slate-900/80 bg-slate-900 text-white shadow-sm hover:bg-slate-800 hover:shadow-md dark:border-slate-100/80 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200';
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
					dispatch('input', { value });
				},
				onError: (errorMessage: string) => {
					_voiceError = errorMessage;
					isCurrentlyRecording = false;
					isInitializingRecording = false;
				},
				onPhaseChange: (phase: 'idle' | 'transcribing') => {
					_isTranscribing = phase === 'transcribing';
				},
				onPermissionGranted: () => {
					microphonePermissionGranted = true;
					_voiceError = '';
				},
				onCapabilityUpdate: (update: { canUseLiveTranscript: boolean }) => {
					_canUseLiveTranscript = update.canUseLiveTranscript;
				}
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

		try {
			await voiceRecordingService.startRecording(value);
			isInitializingRecording = false;
			isCurrentlyRecording = true;
			microphonePermissionGranted = true;
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

		try {
			await voiceRecordingService.stopRecording(value);
		} catch (error) {
			console.error('Failed to stop voice recording:', error);
			const message =
				error instanceof Error ? error.message : 'Failed to stop recording. Try again.';
			_voiceError = message;
		} finally {
			liveTranscriptPreview = '';
			isCurrentlyRecording = false;
			isInitializingRecording = false;
		}
	}

	async function toggleVoiceRecording() {
		if (!enableVoice || !isVoiceSupported) return;

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
		hasAttemptedVoice = false;
		microphonePermissionGranted = false;
		voiceInitialized = false;
	}

	function handleTextareaInput(event: CustomEvent<string>) {
		value = event.detail;
		dispatch('input', { value });
	}

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

<div class={`space-y-2 ${containerClass} ${className}`.trim()}>
	<div class="relative">
		<Textarea
			bind:value
			{placeholder}
			{rows}
			{maxRows}
			{autoResize}
			{disabled}
			{helperText}
			{error}
			{errorMessage}
			class={`${actions ? 'pr-28 sm:pr-32' : 'pr-14 sm:pr-16'} ${textareaClass}`.trim()}
			on:input={handleTextareaInput}
			{...restProps}
		/>

		<!-- Action buttons container - fixed position on the right side -->
		<div class="absolute right-2 top-2 flex items-center gap-2">
			<!-- Snippet for custom action buttons (e.g., send button) -->
			{#if actions}
				{@render actions()}
			{/if}

			<!-- Voice recording button -->
			{#if enableVoice}
				<button
					type="button"
					class={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 dark:focus:ring-offset-slate-900 ${voiceButtonClasses}`}
					onclick={toggleVoiceRecording}
					aria-label={voiceButtonState.label}
					title={voiceButtonState.label}
					aria-pressed={isCurrentlyRecording}
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
		</div>

		<!-- Live transcript preview overlay -->
		{#if enableVoice && showLiveTranscriptPreview && isLiveTranscribing}
			<div
				class="pointer-events-none absolute bottom-2 left-2 right-14 sm:bottom-3 sm:left-3 sm:right-28"
			>
				<div
					class="pointer-events-auto rounded-lg border border-blue-200/60 bg-gradient-to-br from-blue-50/95 to-indigo-50/90 px-3 py-2 text-sm text-blue-900 shadow-md backdrop-blur-sm dark:border-blue-500/30 dark:from-blue-900/80 dark:to-indigo-900/70 dark:text-blue-100"
				>
					<p class="m-0 whitespace-pre-wrap leading-relaxed">
						{liveTranscriptPreview}
					</p>
				</div>
			</div>
		{/if}
	</div>

	{#if enableVoice && showStatusRow}
		<div
			class="flex flex-wrap items-center justify-between gap-2 text-xs font-medium text-slate-500 dark:text-slate-400"
		>
			<div class="flex items-center gap-2">
				{#if isCurrentlyRecording}
					<span class="flex items-center gap-2 text-rose-600 dark:text-rose-400">
						<span class="relative flex h-2.5 w-2.5 items-center justify-center">
							<span
								class="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-500/70 dark:bg-rose-400/70"
							></span>
							<span
								class="relative inline-flex h-2 w-2 rounded-full bg-rose-600 dark:bg-rose-500"
							></span>
						</span>
						<span class="font-medium">{listeningLabel}</span>
						<span class="font-semibold tabular-nums"
							>{formatDuration(_recordingDuration)}</span
						>
					</span>
				{:else if isInitializingRecording}
					<span class="flex items-center gap-2 text-slate-600 dark:text-slate-300">
						<LoaderCircle class="h-3.5 w-3.5 animate-spin" />
						<span class="font-medium">{preparingLabel}</span>
					</span>
				{:else if _isTranscribing}
					<span class="flex items-center gap-2 text-blue-600 dark:text-blue-400">
						<LoaderCircle class="h-3.5 w-3.5 animate-spin" />
						<span class="font-medium">{transcribingLabel}</span>
					</span>
				{:else if !isVoiceSupported}
					<span class="text-slate-500 dark:text-slate-400"
						>Voice capture unavailable in this browser.</span
					>
				{:else if voiceBlocked}
					<span class="text-amber-600 dark:text-amber-400">{voiceBlockedLabel}</span>
				{:else}
					<span class="text-slate-500 dark:text-slate-400">{idleHint}</span>
				{/if}

				{#if _canUseLiveTranscript && isCurrentlyRecording}
					<span
						class="hidden rounded-md border border-blue-200/60 bg-gradient-to-r from-blue-50 to-indigo-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-700 dark:border-blue-500/40 dark:from-blue-900/30 dark:to-indigo-900/20 dark:text-blue-300 sm:inline"
					>
						{liveTranscriptLabel}
					</span>
				{/if}
			</div>

			<div class="flex flex-wrap items-center gap-2">
				{#if _voiceError}
					<span
						role="alert"
						class="flex items-center gap-1.5 rounded-md bg-gradient-to-r from-rose-50 to-red-50 px-2.5 py-1 text-[11px] font-medium text-rose-700 dark:from-rose-900/30 dark:to-red-900/20 dark:text-rose-300"
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
			</div>
		</div>
	{/if}
</div>
