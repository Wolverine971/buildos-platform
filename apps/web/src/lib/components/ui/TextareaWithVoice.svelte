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
		...restProps
	}: Props = $props();

	// Voice state bindings exposed to parent components (using Svelte 5 $state)
	let isVoiceSupported = $state(false);
	let isCurrentlyRecording = $state(false);
	let isInitializingRecording = $state(false);
	let isTranscribing = $state(false);
	let voiceError = $state('');
	let canUseLiveTranscript = $state(false);
	let liveTranscriptPreview = $state('');
	let recordingDuration = $state(0);

	let microphonePermissionGranted = $state(false);
	let hasAttemptedVoice = $state(false);
	let durationUnsubscribe: (() => void) | null = null;
	let transcriptUnsubscribe: (() => void) | null = null;
	let voiceInitialized = $state(false);

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
		isCurrentlyRecording && liveTranscriptPreview.trim().length > 0 && canUseLiveTranscript
	);

	const voiceButtonState = $derived.by(() =>
		buildVoiceButtonState({
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

		if (isTranscribing) {
			return {
				icon: LoaderCircle,
				label: transcribingLabel,
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
		switch (variant) {
			case 'recording':
				return 'border border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100 dark:border-rose-500/40 dark:bg-rose-500/10 dark:text-rose-200';
			case 'loading':
				return 'border border-slate-200 bg-white text-slate-400 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-300';
			case 'prompt':
				return 'border border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 dark:border-blue-500/50 dark:bg-blue-500/10 dark:text-blue-200';
			case 'muted':
				return 'border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-500';
			default:
				return 'border border-transparent bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200';
		}
	}

	async function initializeVoice() {
		if (voiceInitialized) return;

		isVoiceSupported = voiceRecordingService.isVoiceSupported();
		canUseLiveTranscript = voiceRecordingService.isLiveTranscriptSupported();
		microphonePermissionGranted = false;
		hasAttemptedVoice = false;
		voiceError = '';

		if (!isVoiceSupported) {
			voiceInitialized = true;
			return;
		}

		voiceRecordingService.initialize(
			{
				onTextUpdate: (text: string) => {
					value = text;
					voiceError = '';
					dispatch('input', { value });
				},
				onError: (errorMessage: string) => {
					voiceError = errorMessage;
					isCurrentlyRecording = false;
					isInitializingRecording = false;
				},
				onPhaseChange: (phase: 'idle' | 'transcribing') => {
					isTranscribing = phase === 'transcribing';
				},
				onPermissionGranted: () => {
					microphonePermissionGranted = true;
					voiceError = '';
				},
				onCapabilityUpdate: (update: { canUseLiveTranscript: boolean }) => {
					canUseLiveTranscript = update.canUseLiveTranscript;
				}
			},
			transcriptionService
		);

		const durationStore = voiceRecordingService.getRecordingDuration();
		durationUnsubscribe = durationStore.subscribe((newDuration) => {
			recordingDuration = newDuration;
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
			isTranscribing ||
			disabled
		) {
			return;
		}

		hasAttemptedVoice = true;
		voiceError = '';
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
			voiceError = message;
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
			voiceError = message;
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
		isTranscribing = false;
		recordingDuration = 0;
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

<div class={`space-y-3 ${containerClass} ${className}`.trim()}>
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
			class={`pr-16 ${textareaClass}`.trim()}
			on:input={handleTextareaInput}
			{...restProps}
		/>

		{#if enableVoice}
			<button
				type="button"
				class={`absolute top-3 right-3 flex h-10 w-10 items-center justify-center rounded-full transition ${voiceButtonClasses}`}
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

		{#if enableVoice && showLiveTranscriptPreview && isLiveTranscribing}
			<div class="pointer-events-none absolute bottom-3 left-3 right-14">
				<div
					class="pointer-events-auto rounded-xl border border-gray-200 bg-white/90 px-3 py-2 text-sm text-gray-600 shadow-sm dark:border-gray-700 dark:bg-gray-900/80 dark:text-gray-100"
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
			class="flex flex-wrap items-center justify-between gap-3 text-xs font-medium text-gray-500 dark:text-gray-400"
		>
			<div class="flex items-center gap-2">
				{#if isCurrentlyRecording}
					<span class="flex items-center gap-2 text-rose-500 dark:text-rose-400">
						<span class="relative flex h-2.5 w-2.5 items-center justify-center">
							<span
								class="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400/70"
							></span>
							<span class="relative inline-flex h-2 w-2 rounded-full bg-rose-500"
							></span>
						</span>
						{listeningLabel}
						<span class="font-semibold">{formatDuration(recordingDuration)}</span>
					</span>
				{:else if isInitializingRecording}
					<span class="flex items-center gap-2 text-gray-600 dark:text-gray-300">
						<LoaderCircle class="h-4 w-4 animate-spin" />
						{preparingLabel}
					</span>
				{:else if isTranscribing}
					<span class="flex items-center gap-2">
						<LoaderCircle class="h-4 w-4 animate-spin" />
						{transcribingLabel}
					</span>
				{:else if !isVoiceSupported}
					<span>Voice capture unavailable in this browser.</span>
				{:else if voiceBlocked}
					<span>{voiceBlockedLabel}</span>
				{:else}
					<span>{idleHint}</span>
				{/if}

				{#if canUseLiveTranscript && isCurrentlyRecording}
					<span
						class="hidden rounded-full border border-blue-200 bg-blue-50 px-3 py-0.5 text-[11px] font-semibold uppercase tracking-[0.24em] text-blue-600 dark:border-blue-500/40 dark:bg-blue-500/10 dark:text-blue-300 sm:inline"
					>
						{liveTranscriptLabel}
					</span>
				{/if}
			</div>

			<div class="flex flex-wrap items-center gap-2">
				{#if voiceError}
					<span
						role="alert"
						class="flex items-center gap-2 rounded-full bg-rose-50 px-3 py-1 text-rose-600 dark:bg-rose-900/20 dark:text-rose-300"
					>
						{voiceError}
					</span>
				{/if}

				<slot
					name="status"
					{isCurrentlyRecording}
					{isTranscribing}
					{recordingDuration}
					{voiceError}
				/>
			</div>
		</div>
	{/if}
</div>
