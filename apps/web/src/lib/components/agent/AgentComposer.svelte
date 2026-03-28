<!-- apps/web/src/lib/components/agent/AgentComposer.svelte -->
<!-- INKPRINT Design System: Composer input with inner shadow styling -->
<script lang="ts">
	import { Send, Square } from 'lucide-svelte';
	import TextareaWithVoice from '$lib/components/ui/TextareaWithVoice.svelte';
	import type TextareaWithVoiceComponent from '$lib/components/ui/TextareaWithVoice.svelte';
	import type { VoiceNote } from '$lib/types/voice-notes';

	interface Props {
		inputValue: string;
		isStreaming: boolean;
		isSendDisabled: boolean;
		allowSendWhileStreaming?: boolean;
		displayContextLabel: string;
		mode?: 'chat' | 'braindump';
		disabled?: boolean;
		vocabularyTerms?: string;
		voiceInputRef: TextareaWithVoiceComponent | null;
		isVoiceRecording: boolean;
		isVoiceInitializing: boolean;
		isVoiceTranscribing: boolean;
		voiceErrorMessage: string;
		voiceRecordingDuration: number;
		voiceSupportsLiveTranscript: boolean;
		voiceNoteGroupId?: string | null;
		onVoiceNoteSegmentSaved?: (voiceNote: VoiceNote) => void;
		onVoiceNoteSegmentError?: (error: string) => void;
		onKeyDownHandler?: (event: KeyboardEvent) => void;
		onSend?: () => void;
		onStop?: () => void;
	}

	let {
		inputValue = $bindable(),
		isStreaming,
		isSendDisabled,
		allowSendWhileStreaming = false,
		displayContextLabel,
		mode = 'chat',
		disabled = false,
		vocabularyTerms = '',
		voiceInputRef = $bindable(),
		isVoiceRecording = $bindable(),
		isVoiceInitializing = $bindable(),
		isVoiceTranscribing = $bindable(),
		voiceErrorMessage = $bindable(),
		voiceRecordingDuration = $bindable(),
		voiceSupportsLiveTranscript = $bindable(),
		voiceNoteGroupId = $bindable(null),
		onVoiceNoteSegmentSaved,
		onVoiceNoteSegmentError,
		onKeyDownHandler,
		onSend,
		onStop
	}: Props = $props();

	const placeholder = $derived.by(() => {
		if (mode === 'braindump') {
			return 'Capture whatever is on your mind...';
		}
		const label = displayContextLabel.trim().toLowerCase();
		return label ? `Ask about ${label}...` : 'Ask BuildOS anything...';
	});

	const initialRows = $derived(mode === 'braindump' ? 8 : 1);
	const maxRows = $derived(mode === 'braindump' ? 18 : 6);
	const isVoiceBlocked = $derived(isStreaming || disabled);
	const resolvedVoiceBlockedLabel = $derived(
		disabled ? 'Chat is still loading...' : 'Wait for BuildOS...'
	);

	function handleSubmit(event: Event) {
		event.preventDefault();
		if (disabled) return;
		onSend?.();
	}
</script>

<!-- INKPRINT form with compact spacing and Grain texture for active input workspace -->
<form
	onsubmit={handleSubmit}
	class={`tx tx-grain tx-weak rounded-lg ${mode === 'braindump' ? 'h-full' : ''}`}
>
	<TextareaWithVoice
		bind:this={voiceInputRef}
		bind:value={inputValue}
		bind:isRecording={isVoiceRecording}
		bind:isInitializing={isVoiceInitializing}
		bind:isTranscribing={isVoiceTranscribing}
		bind:voiceError={voiceErrorMessage}
		bind:recordingDuration={voiceRecordingDuration}
		bind:canUseLiveTranscript={voiceSupportsLiveTranscript}
		bind:voiceNoteGroupId
		voiceNoteSource="agent_chat"
		{onVoiceNoteSegmentSaved}
		{onVoiceNoteSegmentError}
		class="w-full"
		containerClass={`rounded-lg border border-border bg-background shadow-ink-inner ${
			mode === 'braindump' ? 'h-full' : ''
		}`}
		textareaClass="border-none bg-transparent px-3 py-2 text-base font-medium leading-snug text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0 sm:px-4 sm:py-3"
		{placeholder}
		autoResize
		rows={initialRows}
		{maxRows}
		{disabled}
		voiceBlocked={isVoiceBlocked}
		voiceBlockedLabel={resolvedVoiceBlockedLabel}
		voiceButtonLabel="Record voice note"
		listeningLabel="Listening"
		transcribingLabel="Transcribing..."
		preparingLabel="Preparing mic…"
		liveTranscriptLabel="Live"
		showStatusRow={true}
		showLiveTranscriptPreview={true}
		{vocabularyTerms}
		onkeydown={onKeyDownHandler}
	>
		{#snippet actions()}
			<!-- INKPRINT action buttons: inline with status row hints -->
			{#if isStreaming}
				<!-- Stop button: destructive semantic for urgency -->
				<button
					type="button"
					class="flex h-11 w-11 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full border-2 border-destructive bg-destructive text-destructive-foreground shadow-ink transition-all duration-100 touch-manipulation pressable hover:bg-destructive/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2 dark:focus-visible:ring-offset-background"
					style="-webkit-tap-highlight-color: transparent;"
					aria-label="Stop response"
					onclick={onStop}
				>
					<Square class="h-3.5 w-3.5" />
				</button>
				{#if allowSendWhileStreaming}
					<!-- Send while streaming: accent for primary action -->
					<button
						type="submit"
						class="flex h-11 w-11 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full border border-accent bg-accent text-accent-foreground shadow-ink transition-all duration-100 touch-manipulation pressable hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:border-border disabled:bg-muted disabled:text-muted-foreground/50 disabled:shadow-none disabled:cursor-not-allowed dark:focus-visible:ring-offset-background"
						style="-webkit-tap-highlight-color: transparent;"
						aria-label="Send & stop"
						title="Send & stop"
						disabled={disabled || isSendDisabled}
					>
						<Send class="h-3.5 w-3.5" />
					</button>
				{/if}
			{:else}
				<!-- Send button: accent color for primary action, clear disabled state -->
				<button
					type="submit"
					class="flex h-11 w-11 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-full border border-accent bg-accent text-accent-foreground shadow-ink transition-all duration-100 touch-manipulation pressable hover:bg-accent/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:border-border disabled:bg-muted disabled:text-muted-foreground/50 disabled:shadow-none disabled:cursor-not-allowed dark:focus-visible:ring-offset-background"
					style="-webkit-tap-highlight-color: transparent;"
					aria-label="Send message"
					disabled={disabled || isSendDisabled}
				>
					<Send class="h-3.5 w-3.5" />
				</button>
			{/if}
		{/snippet}
	</TextareaWithVoice>
</form>
