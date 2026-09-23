<!-- apps/web/src/lib/components/ui/TextareaWithVoice.svelte -->
<!--
	Textarea with voice dictation. Spoken words land in the field at the caret
	as the user talks (server-confirmed words solid, live draft grey); stopping
	firms up the last few words. Built on the shared engine in $lib/voice.
-->
<script lang="ts">
	import { onDestroy } from 'svelte';
	import Textarea from './Textarea.svelte';
	import DictationMirror from '$lib/components/voice/DictationMirror.svelte';
	import VoiceMicButton from '$lib/components/voice/VoiceMicButton.svelte';
	import VoiceStatusLine from '$lib/components/voice/VoiceStatusLine.svelte';
	import { VoiceDictation } from '$lib/voice/dictation-session.svelte';
	import { TextareaDictationAnchor } from '$lib/voice/textarea-dictation';
	import {
		createVoiceNoteSink,
		scheduleVoiceDraftCleanup,
		type SavedRecording
	} from '$lib/voice/voice-note-sink';
	import type { VoiceNote } from '$lib/types/voice-notes';
	import { browser } from '$app/environment';
	import { haptic } from '$lib/utils/haptic';

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
		/** Show idle hints and host actions under the field. The mic is always shown. */
		showStatusRow?: boolean;
		hintText?: string;
		/** @deprecated Words now appear in the field itself. */
		showLiveTranscriptPreview?: boolean;
		voiceBlocked?: boolean;
		voiceBlockedLabel?: string;
		transcriptionEndpoint?: string;
		/** @deprecated */
		liveTranscriptLabel?: string;
		voiceButtonLabel?: string;
		listeningLabel?: string;
		/** @deprecated */
		stoppingLabel?: string;
		/** @deprecated */
		transcribingLabel?: string;
		preparingLabel?: string;
		class?: string;
		/**
		 * Mark the textarea as the preferred initial focus of a host `Modal`
		 * (renders `data-autofocus`, not the native attribute). Modal honors it
		 * only on fine-pointer devices so phones don't pop the keyboard on open.
		 */
		autofocus?: boolean;
		/** Names and terms the transcriber should expect (e.g. the project name). */
		vocabularyTerms?: string;
		// Bindable voice state for hosts
		isRecording?: boolean;
		isInitializing?: boolean;
		/** Always false; kept for hosts that gate on it. Finishing is `isTranscribing`. */
		isStopping?: boolean;
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
		/** Called when the user explicitly stops capture from the voice UI. */
		onVoiceStopRequested?: () => void;
		actions?: import('svelte').Snippet;
		status?: import('svelte').Snippet<
			[
				{
					isCurrentlyRecording: boolean;
					isStopping: boolean;
					isTranscribing: boolean;
					recordingDuration: number;
					voiceError: string;
				}
			]
		>;
		[key: string]: any;
	}

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
		showLiveTranscriptPreview: _showLiveTranscriptPreview = true,
		hintText = undefined,
		voiceBlocked = false,
		voiceBlockedLabel = 'Recording unavailable right now',
		transcriptionEndpoint = '/api/transcribe',
		liveTranscriptLabel: _liveTranscriptLabel = 'Live transcript',
		voiceButtonLabel = 'Record voice note',
		listeningLabel = 'Listening',
		stoppingLabel: _stoppingLabel = 'Stopping...',
		transcribingLabel: _transcribingLabel = 'Transcribing…',
		preparingLabel = 'Starting mic…',
		class: className = '',
		autofocus = false,
		vocabularyTerms = '',
		isRecording = $bindable(false),
		isInitializing = $bindable(false),
		isStopping = $bindable(false),
		isTranscribing = $bindable(false),
		voiceError = $bindable(''),
		recordingDuration = $bindable(0),
		canUseLiveTranscript = $bindable(false),
		voiceNoteSource = '',
		voiceNoteGroupId = $bindable(null),
		onVoiceNoteGroupReady,
		onVoiceNoteSegmentSaved,
		onVoiceNoteSegmentError,
		onVoiceStopRequested,
		actions,
		status,
		...restProps
	}: Props = $props();

	let textareaRef = $state<Textarea | null>(null);
	let textareaElement = $state<HTMLTextAreaElement | null>(null);
	/** The user has put the caret somewhere on purpose; dictate there instead of at the end. */
	let userPlacedCaret = false;
	let savedRecording: SavedRecording | null = null;

	const anchor = new TextareaDictationAnchor();
	/** Bumped whenever the anchor moves, so the mirror re-derives its pieces. */
	let anchorVersion = $state(0);

	const sink = createVoiceNoteSink({
		source: () => voiceNoteSource || 'textarea',
		getGroupId: () => voiceNoteGroupId,
		setGroupId: (groupId) => {
			voiceNoteGroupId = groupId;
			onVoiceNoteGroupReady?.(groupId);
		},
		onSaved: (note) => onVoiceNoteSegmentSaved?.(note),
		onError: (message) => onVoiceNoteSegmentError?.(message)
	});

	const dictation = new VoiceDictation({
		vocabulary: () => vocabularyTerms,
		endpoint: () => transcriptionEndpoint,
		onAudio: ({ audio, durationSeconds }) => {
			savedRecording = sink.save(audio, durationSeconds);
		},
		onCommit: (result) => {
			const committed = anchor.commit(result.text);
			value = committed.value;
			savedRecording?.complete(result);
			savedRecording = null;
			placeCaret(committed.caret);
		}
	});

	const isTouchDevice = $derived(
		browser &&
			typeof navigator !== 'undefined' &&
			('ontouchstart' in window || navigator.maxTouchPoints > 0)
	);

	const dictating = $derived(dictation.isBusy);
	// Hand the text back from the mirror without the field's color transition
	// fading it in (it would flash invisible for ~150ms).
	let quietSwap = $state(false);
	$effect(() => {
		if (dictating) {
			quietSwap = true;
			return;
		}
		const timer = setTimeout(() => (quietSwap = false), 80);
		return () => clearTimeout(timer);
	});
	const pieces = $derived.by(() => {
		void anchorVersion;
		return anchor.pieces(dictation.confirmedText, dictation.draftText);
	});
	const showVoiceStatus = $derived(enableVoice && (dictation.isBusy || dictation.error !== null));

	// Mirror engine state into the host bindings.
	$effect(() => {
		isRecording = dictation.phase === 'recording';
		isInitializing = dictation.phase === 'starting';
		isStopping = false;
		isTranscribing = dictation.phase === 'finishing';
		voiceError =
			dictation.error && dictation.error.code !== 'draft-fallback'
				? dictation.error.message
				: '';
		recordingDuration = Math.floor(dictation.elapsedMs / 1000);
		canUseLiveTranscript = dictation.liveDraftActive || dictation.liveDraftSupported;
	});

	// Words land in the field as they arrive.
	$effect(() => {
		if (!dictating) return;
		const next = anchor.write(dictation.confirmedText, dictation.draftText);
		if (next !== value) value = next;
	});

	// If the host rewrites the field mid-dictation, dictation continues after its text.
	$effect.pre(() => {
		if (dictating && anchor.observe(value)) anchorVersion += 1;
	});

	$effect(() => {
		if ((voiceBlocked || disabled || !enableVoice) && dictation.isCapturing) {
			void dictation.stop();
		}
	});

	$effect(() => {
		textareaElement = textareaRef?.getElement() ?? null;
	});

	$effect(() => {
		if (enableVoice) scheduleVoiceDraftCleanup();
	});

	onDestroy(() => {
		dictation.destroy();
	});

	function placeCaret(offset: number) {
		if (isTouchDevice || !textareaElement) return;
		queueMicrotask(() => {
			if (!textareaElement || document.activeElement !== textareaElement) return;
			textareaElement.setSelectionRange(offset, offset);
		});
	}

	async function startDictation() {
		if (!enableVoice || voiceBlocked || disabled || dictation.isBusy) return;
		const selection = userPlacedCaret ? (textareaRef?.getSelectionRange() ?? null) : null;
		anchor.begin(value, selection);
		anchorVersion += 1;
		const started = await dictation.start();
		// Desktop keeps focus in the field so Enter/Space finish; phones keep the keyboard down.
		if (started && !isTouchDevice) textareaRef?.focus({ preventScroll: true });
	}

	function requestStop() {
		onVoiceStopRequested?.();
		void dictation.stop();
	}

	function toggleVoice() {
		haptic('light');
		if (dictation.phase === 'recording') requestStop();
		else if (dictation.phase === 'idle') void startDictation();
	}

	function handleTextareaKeyDown(event: KeyboardEvent) {
		if (dictation.phase === 'recording' && (event.key === ' ' || event.key === 'Enter')) {
			event.preventDefault();
			event.stopPropagation();
			requestStop();
		}
	}

	// Enter/Space anywhere (outside other inputs) finishes recording.
	function handleGlobalKeyDown(event: KeyboardEvent) {
		if (dictation.phase !== 'recording') return;
		if (event.key !== ' ' && event.key !== 'Enter') return;
		const active = document.activeElement;
		if (active === textareaElement) return;
		const typingElsewhere =
			active instanceof HTMLInputElement ||
			active instanceof HTMLTextAreaElement ||
			(active instanceof HTMLElement && active.isContentEditable);
		if (typingElsewhere) return;
		event.preventDefault();
		requestStop();
	}

	$effect(() => {
		if (!browser || dictation.phase !== 'recording') return;
		document.addEventListener('keydown', handleGlobalKeyDown);
		return () => document.removeEventListener('keydown', handleGlobalKeyDown);
	});

	/** Stop and wait until the transcript is in the field. */
	export async function stopRecording() {
		if (dictation.phase === 'starting') dictation.cancel();
		else await dictation.stop();
	}

	/** Focus the textarea (e.g. after the host swaps in the composer view). */
	export function focus(options?: FocusOptions) {
		textareaRef?.focus(options);
	}

	/**
	 * Focus the textarea only on fine-pointer (mouse/trackpad) devices, so a
	 * host can hand focus back to the composer without popping a phone's
	 * software keyboard. Returns whether focus was attempted.
	 */
	export function focusIfFinePointer(): boolean {
		if (!browser || typeof window.matchMedia !== 'function') return false;
		if (!window.matchMedia('(pointer: fine)').matches) return false;
		textareaRef?.focus({ preventScroll: true });
		return Boolean(textareaRef);
	}

	export async function cleanup() {
		await stopRecording();
	}
</script>

<div class={`${containerClass} ${className}`.trim()}>
	<div class="relative">
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
			class={dictating
				? `${textareaClass} text-transparent caret-transparent placeholder:text-transparent transition-none`
				: quietSwap
					? `${textareaClass} transition-none`
					: textareaClass}
			readonly={dictating || restProps.readonly}
			data-autofocus={autofocus ? '' : undefined}
			{...restProps}
			onfocus={(event: FocusEvent) => {
				userPlacedCaret = true;
				restProps.onfocus?.(event);
			}}
			onkeydown={(event: KeyboardEvent) => {
				handleTextareaKeyDown(event);
				// Voice handled Enter/Space: the host must not treat it as send.
				if (!event.defaultPrevented) restProps.onkeydown?.(event);
			}}
		/>
		{#if dictating}
			<DictationMirror
				target={textareaElement}
				{pieces}
				listening={dictation.phase === 'recording'}
			/>
		{/if}
	</div>

	{#if showStatusRow || enableVoice}
		<div class="relative z-10 mt-1 flex items-center gap-2 px-1 pb-0.5">
			<div class="min-w-0 flex-1" aria-live="polite">
				{#if showVoiceStatus}
					<VoiceStatusLine
						{dictation}
						{listeningLabel}
						{preparingLabel}
						showKeyHint={!isTouchDevice}
					/>
				{:else if hintText}
					<span class="text-xs text-muted-foreground">{hintText}</span>
				{:else if showStatusRow}
					<span
						class="hidden text-xs text-muted-foreground md:inline-flex md:items-center"
					>
						<kbd
							class="rounded border border-border bg-background px-1 py-0.5 font-mono text-2xs font-medium text-foreground"
							>Enter</kbd
						>
						<span class="mx-1">send</span>
						<span class="text-muted-foreground/50">·</span>
						<kbd
							class="ml-1 rounded border border-border bg-background px-1 py-0.5 font-mono text-2xs font-medium text-foreground"
							>Shift+Enter</kbd
						>
						<span class="ml-1">new line</span>
					</span>
					<span class="text-xs text-muted-foreground md:hidden">
						{enableVoice && !voiceBlocked ? 'Type or speak' : 'Tap to send'}
					</span>
				{/if}
			</div>

			{#if status}
				{@render status({
					isCurrentlyRecording: isRecording,
					isStopping,
					isTranscribing,
					recordingDuration,
					voiceError
				})}
			{/if}

			<div class="flex shrink-0 items-center gap-1.5">
				{#if actions && showStatusRow}
					{@render actions()}
				{/if}
				{#if enableVoice}
					<VoiceMicButton
						{dictation}
						{disabled}
						blocked={voiceBlocked}
						blockedLabel={voiceBlockedLabel}
						label={voiceButtonLabel}
						onclick={toggleVoice}
					/>
				{/if}
			</div>
		</div>
	{/if}
</div>
