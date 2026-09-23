<!-- apps/web/src/lib/components/ui/CommentTextareaWithVoice.svelte -->
<!--
  Compact comment box with voice dictation. Spoken words land at the caret as
  the user talks (confirmed solid, draft grey) and the server transcript
  replaces them in place. Built on the shared engine in $lib/voice.
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
		// Core textarea props
		value?: string;
		placeholder?: string;
		rows?: number;
		disabled?: boolean;
		size?: 'sm' | 'base';
		id?: string;
		class?: string;

		// Voice recording props
		enableVoice?: boolean;
		voiceBlocked?: boolean;
		voiceBlockedLabel?: string;
		transcriptionEndpoint?: string;
		vocabularyTerms?: string;

		// Voice note storage (optional)
		voiceNoteSource?: string;
		voiceNoteGroupId?: string | null;
		onVoiceNoteGroupReady?: (groupId: string) => void;
		onVoiceNoteSegmentSaved?: (voiceNote: VoiceNote) => void;
		onVoiceNoteSegmentError?: (error: string) => void;

		// Bindable state for parent
		/** Recording or still firming up the transcript: hold submit until false. */
		isVoiceBusy?: boolean;
		isRecording?: boolean;
		isTranscribing?: boolean;
		voiceError?: string;
		recordingDuration?: number;

		// Events
		oninput?: (event: Event) => void;

		// Snippets for customization
		actions?: import('svelte').Snippet;
		footer?: import('svelte').Snippet<
			[
				{
					isRecording: boolean;
					isTranscribing: boolean;
					recordingDuration: number;
					voiceError: string;
				}
			]
		>;
	}

	let {
		value = $bindable(''),
		placeholder = 'Share an update or ask a question...',
		rows = 2,
		disabled = false,
		size = 'sm',
		id,
		class: className = '',

		enableVoice = true,
		voiceBlocked = false,
		voiceBlockedLabel = 'Recording unavailable right now',
		transcriptionEndpoint = '/api/transcribe',
		vocabularyTerms = '',

		voiceNoteSource = 'entity-comment',
		voiceNoteGroupId = $bindable(null),
		onVoiceNoteGroupReady,
		onVoiceNoteSegmentSaved,
		onVoiceNoteSegmentError,

		isVoiceBusy = $bindable(false),
		isRecording = $bindable(false),
		isTranscribing = $bindable(false),
		voiceError = $bindable(''),
		recordingDuration = $bindable(0),

		oninput,

		actions,
		footer
	}: Props = $props();

	let textareaComponent = $state<Textarea | null>(null);
	let textareaElement = $state<HTMLTextAreaElement | null>(null);
	let userPlacedCaret = false;
	let savedRecording: SavedRecording | null = null;

	const anchor = new TextareaDictationAnchor();
	let anchorVersion = $state(0);

	const sink = createVoiceNoteSink({
		source: () => voiceNoteSource,
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
			setValue(committed.value);
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

	$effect(() => {
		isVoiceBusy = dictation.isBusy;
		isRecording = dictation.isCapturing;
		isTranscribing = dictation.phase === 'finishing';
		voiceError =
			dictation.error && dictation.error.code !== 'draft-fallback'
				? dictation.error.message
				: '';
		recordingDuration = Math.floor(dictation.elapsedMs / 1000);
	});

	$effect(() => {
		if (!dictating) return;
		setValue(anchor.write(dictation.confirmedText, dictation.draftText));
	});

	$effect.pre(() => {
		if (dictating && anchor.observe(value)) anchorVersion += 1;
	});

	$effect(() => {
		if ((voiceBlocked || disabled || !enableVoice) && dictation.isCapturing) {
			void dictation.stop();
		}
	});

	$effect(() => {
		textareaElement = textareaComponent?.getElement() ?? null;
	});

	$effect(() => {
		if (enableVoice) scheduleVoiceDraftCleanup();
	});

	onDestroy(() => {
		dictation.destroy();
	});

	/** Hosts use a controlled value + oninput; keep them in sync with dictated text. */
	function setValue(next: string) {
		if (next === value) return;
		value = next;
		if (oninput) {
			const event = new InputEvent('input', { bubbles: true });
			Object.defineProperty(event, 'target', { value: { value: next }, enumerable: true });
			oninput(event);
		}
	}

	function placeCaret(offset: number) {
		if (isTouchDevice || !textareaElement) return;
		queueMicrotask(() => {
			if (!textareaElement) return;
			textareaElement.focus({ preventScroll: true });
			textareaElement.setSelectionRange(offset, offset);
		});
	}

	async function startDictation() {
		if (!enableVoice || voiceBlocked || disabled || dictation.isBusy) return;
		const selection = userPlacedCaret ? (textareaComponent?.getSelectionRange() ?? null) : null;
		anchor.begin(value, selection);
		anchorVersion += 1;
		const started = await dictation.start();
		if (started && !isTouchDevice) textareaComponent?.focus();
	}

	function toggleVoice() {
		haptic('light');
		if (dictation.phase === 'recording') void dictation.stop();
		else if (dictation.phase === 'idle') void startDictation();
	}

	function handleTextareaKeyDown(event: KeyboardEvent) {
		if (dictation.phase === 'recording' && (event.key === ' ' || event.key === 'Enter')) {
			event.preventDefault();
			event.stopPropagation();
			void dictation.stop();
		}
	}

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
		void dictation.stop();
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

	export async function cleanup() {
		await stopRecording();
	}

	export function focus() {
		textareaComponent?.focus();
	}
</script>

<div class={`space-y-1.5 ${className}`}>
	<div class="relative">
		<Textarea
			bind:this={textareaComponent}
			{id}
			bind:value
			{placeholder}
			{rows}
			{disabled}
			{size}
			{oninput}
			readonly={dictating}
			class={dictating
				? 'text-transparent caret-transparent placeholder:text-transparent transition-none'
				: quietSwap
					? 'transition-none'
					: ''}
			onfocus={() => (userPlacedCaret = true)}
			onkeydown={handleTextareaKeyDown}
		/>
		{#if dictating}
			<DictationMirror
				target={textareaElement}
				{pieces}
				listening={dictation.phase === 'recording'}
			/>
		{/if}
	</div>

	<div class="flex flex-wrap items-center justify-between gap-2">
		<div class="min-w-0 flex-1 text-2xs text-muted-foreground/80" aria-live="polite">
			{#if enableVoice && (dictation.isBusy || dictation.error)}
				<VoiceStatusLine {dictation} showKeyHint={!isTouchDevice} />
			{:else if footer}
				{@render footer({
					isRecording,
					isTranscribing,
					recordingDuration,
					voiceError
				})}
			{:else}
				<span>
					Mentions: <span class="font-mono bg-muted px-1 rounded">[[user:id|Name]]</span>
				</span>
			{/if}
		</div>

		<div class="flex items-center gap-1.5">
			{#if enableVoice}
				<VoiceMicButton
					{dictation}
					{disabled}
					blocked={voiceBlocked}
					blockedLabel={voiceBlockedLabel}
					onclick={toggleVoice}
				/>
			{/if}
			{#if actions}
				{@render actions()}
			{/if}
		</div>
	</div>
</div>
