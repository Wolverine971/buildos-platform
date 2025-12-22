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
	import { browser } from '$app/environment';

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
	let textareaRef = $state<Textarea | null>(null);

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

	// Compute padding for textarea based on whether actions snippet is provided
	const textareaPaddingRight = $derived(
		actions
			? 'pr-3 xs:pr-[100px] sm:pr-[116px]' /* send (36-40px) + gap (6px) + voice (36-40px) + margin (12-20px) */
			: 'pr-3 xs:pr-[56px] sm:pr-[64px]' /* voice (36-40px) + margin (12-16px) */
	);

	// Border radius for textarea (full rounded - status row is now separate helper text)
	const textareaBorderRadius = '';

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
		// Base classes for all states - Inkprint compliant
		const base =
			'shadow-ink pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 dark:focus-visible:ring-offset-background';

		switch (variant) {
			case 'recording':
				// Active recording - uses destructive semantic (urgency/stop)
				return `${base} border-2 border-destructive bg-destructive/10 text-destructive hover:bg-destructive/15 dark:bg-destructive/20 dark:hover:bg-destructive/25`;
			case 'loading':
				// Processing state - muted, non-interactive feel
				return `${base} border border-border bg-muted text-muted-foreground`;
			case 'prompt':
				// Needs attention - accent color draws eye
				return `${base} border-2 border-accent bg-accent/10 text-accent hover:bg-accent/15 dark:bg-accent/20 dark:hover:bg-accent/25`;
			case 'muted':
				// Disabled/unavailable - clearly inactive
				return `border border-border bg-muted text-muted-foreground/60 cursor-not-allowed opacity-60`;
			default:
				// Ready state - primary action, inverted for prominence
				return `${base} border border-foreground bg-foreground text-background hover:bg-foreground/90`;
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

		// Pre-warm microphone for faster recording start (non-blocking)
		// This eliminates the 50-100ms getUserMedia delay when user clicks record
		voiceRecordingService.prewarmMicrophone().then((success: boolean) => {
			if (success) {
				microphonePermissionGranted = true;
			}
		});

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

	function handleTextareaInput(event: Event) {
		let target = event?.target as HTMLTextAreaElement;
		value = target.value;
		dispatch('input', { value });
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
	<div class="relative">
		<!-- Textarea: rounded-t only when status row is shown (seamless connection) -->
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
			class={`${textareaPaddingRight} ${textareaBorderRadius} ${textareaClass}`.trim()}
			oninput={handleTextareaInput}
			{...restProps}
			onkeydown={(e) => {
				handleTextareaKeyDown(e);
				// Also call any passed keydown handler from restProps
				restProps.onkeydown?.(e);
			}}
		/>

		<!-- ✅ Action buttons: Below textarea on portrait mobile, inside on landscape+ -->
		<div class="absolute bottom-1.5 right-1.5 top-1.5 hidden items-start gap-1.5 xs:flex">
			<!-- Snippet for custom action buttons (e.g., send button) -->
			{#if actions}
				{@render actions()}
			{/if}

			<!-- Voice recording button: 36px, touch-optimized, hidden on mobile (shown in bottom bar) -->
			{#if enableVoice}
				<button
					type="button"
					class={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-all duration-150 touch-manipulation ${voiceButtonClasses}`}
					style="-webkit-tap-highlight-color: transparent;"
					onclick={toggleVoiceRecording}
					aria-label={voiceButtonState.label}
					title={voiceButtonState.label}
					aria-pressed={isCurrentlyRecording}
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

		<!-- Live transcript preview: Positioned to avoid overlap with action buttons -->
		{#if enableVoice && showLiveTranscriptPreview && isLiveTranscribing}
			{@const rightOffset = actions ? 'xs:right-24' : 'xs:right-14'}
			<div
				class={`pointer-events-none absolute bottom-12 left-2 right-2 xs:bottom-2 ${rightOffset}`}
			>
				<div
					class="pointer-events-auto rounded-lg border border-accent/30 bg-accent/5 px-2.5 py-1.5 text-sm text-accent shadow-ink backdrop-blur-sm dark:bg-accent/10"
				>
					<p class="m-0 whitespace-pre-wrap leading-snug">
						{liveTranscriptPreview}
					</p>
				</div>
			</div>
		{/if}
	</div>

	<!-- Mobile action bar: Visible only on portrait phones (< 480px) -->
	<div class="mt-2 flex items-center justify-end gap-2 xs:hidden">
		<!-- Voice recording button for mobile (larger touch target) -->
		{#if enableVoice}
			<button
				type="button"
				class={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all duration-150 touch-manipulation ${voiceButtonClasses}`}
				style="-webkit-tap-highlight-color: transparent;"
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

		<!-- Custom action buttons (e.g., send) for mobile -->
		{#if actions}
			{@render actions()}
		{/if}
	</div>

	{#if enableVoice && showStatusRow}
		<!-- Status row: clean helper text below input -->
		<div class="mt-1.5 px-1">
			<div class="flex flex-wrap items-center justify-between gap-2">
				<!-- Left side: Primary status indicator -->
				<div class="flex flex-wrap items-center gap-1.5">
					{#if isCurrentlyRecording}
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
							<!-- Keyboard hint to stop recording -->
							<kbd
								class="hidden rounded border border-destructive/30 bg-destructive/10 px-1.5 py-0.5 font-mono text-[0.65rem] font-medium text-destructive sm:inline-flex"
							>
								Space
							</kbd>
						</span>
					{:else if isInitializingRecording}
						<!-- Initializing state: muted, processing feel -->
						<span class="flex items-center gap-1.5 text-muted-foreground">
							<LoaderCircle class="h-3 w-3 animate-spin" />
							<span class="text-xs font-medium">{preparingLabel}</span>
						</span>
					{:else if _isTranscribing}
						<!-- Transcribing state: accent color for active processing -->
						<span class="flex items-center gap-1.5 text-accent">
							<LoaderCircle class="h-3 w-3 animate-spin" />
							<span class="text-xs font-semibold">{transcribingLabel}</span>
						</span>
					{:else if !isVoiceSupported}
						<!-- Unsupported: muted text -->
						<span class="text-xs font-medium text-muted-foreground"
							>Voice unavailable</span
						>
					{:else if voiceBlocked}
						<!-- Blocked: warning state -->
						<span class="text-xs font-medium text-amber-600 dark:text-amber-500"
							>{voiceBlockedLabel}</span
						>
					{:else}
						<!-- Idle hint: keyboard shortcuts highlighted -->
						<span class="text-xs text-muted-foreground">
							<kbd
								class="rounded border border-border bg-background px-1 py-0.5 font-mono text-[0.65rem] font-medium text-foreground"
								>Enter</kbd
							>
							<span class="mx-1">send</span>
							<span class="text-border">·</span>
							<kbd
								class="ml-1 rounded border border-border bg-background px-1 py-0.5 font-mono text-[0.65rem] font-medium text-foreground"
								>Shift+Enter</kbd
							>
							<span class="ml-1">new line</span>
						</span>
					{/if}

					<!-- Live transcript badge: accent styling, micro-label -->
					{#if _canUseLiveTranscript && isCurrentlyRecording}
						<span
							class="hidden rounded-md border border-accent/30 bg-accent/10 px-1.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider text-accent xs:inline-flex"
						>
							{liveTranscriptLabel}
						</span>
					{/if}
				</div>

				<!-- Right side: Errors and custom status snippet -->
				<div class="flex flex-wrap items-center gap-1.5">
					{#if _voiceError}
						<!-- Error badge: destructive with Inkprint static texture -->
						<span
							role="alert"
							class="flex items-center gap-1 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-0.5 text-xs font-semibold text-destructive tx tx-static tx-weak"
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
		</div>
	{/if}
</div>
