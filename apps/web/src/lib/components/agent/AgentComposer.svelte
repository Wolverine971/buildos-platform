<!-- apps/web/src/lib/components/agent/AgentComposer.svelte -->
<!-- INKPRINT Design System: Composer input with inner shadow styling -->
<script lang="ts">
	import { Send, Loader } from 'lucide-svelte';
	import TextareaWithVoice from '$lib/components/ui/TextareaWithVoice.svelte';
	import type TextareaWithVoiceComponent from '$lib/components/ui/TextareaWithVoice.svelte';

	// ✅ Svelte 5: Use callback props and $bindable() for two-way binding
	interface Props {
		inputValue: string;
		isStreaming: boolean;
		isSendDisabled: boolean;
		displayContextLabel: string;
		voiceInputRef: TextareaWithVoiceComponent | null;
		isVoiceRecording: boolean;
		isVoiceInitializing: boolean;
		isVoiceTranscribing: boolean;
		voiceErrorMessage: string;
		voiceRecordingDuration: number;
		voiceSupportsLiveTranscript: boolean;
		onKeyDownHandler?: (event: KeyboardEvent) => void;
		onSend?: () => void; // ✅ Svelte 5: Callback instead of event
	}

	let {
		inputValue = $bindable(),
		isStreaming,
		isSendDisabled,
		displayContextLabel,
		voiceInputRef = $bindable(),
		isVoiceRecording = $bindable(),
		isVoiceInitializing = $bindable(),
		isVoiceTranscribing = $bindable(),
		voiceErrorMessage = $bindable(),
		voiceRecordingDuration = $bindable(),
		voiceSupportsLiveTranscript = $bindable(),
		onKeyDownHandler,
		onSend
	}: Props = $props();

	function handleSubmit(event: Event) {
		event.preventDefault();
		onSend?.(); // ✅ Svelte 5: Call callback instead of dispatching event
	}
</script>

<!-- INKPRINT form with tight spacing -->
<form onsubmit={handleSubmit} class="space-y-1">
	<TextareaWithVoice
		bind:this={voiceInputRef}
		bind:value={inputValue}
		bind:isRecording={isVoiceRecording}
		bind:isInitializing={isVoiceInitializing}
		bind:isTranscribing={isVoiceTranscribing}
		bind:voiceError={voiceErrorMessage}
		bind:recordingDuration={voiceRecordingDuration}
		bind:canUseLiveTranscript={voiceSupportsLiveTranscript}
		class="w-full"
		containerClass="rounded-lg border border-border bg-background shadow-ink-inner"
		textareaClass="border-none bg-transparent px-2.5 py-2 text-base font-medium leading-snug text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-0 sm:px-3 sm:py-2.5"
		placeholder={`Share the next thing about ${displayContextLabel.toLowerCase()}...`}
		autoResize
		rows={1}
		maxRows={6}
		disabled={isStreaming}
		voiceBlocked={isStreaming}
		voiceBlockedLabel="Wait for BuildOS..."
		idleHint="Enter · Shift+Enter for new line"
		voiceButtonLabel="Record voice note"
		listeningLabel="Listening"
		transcribingLabel="Transcribing..."
		preparingLabel="Preparing mic…"
		liveTranscriptLabel="Live"
		showStatusRow={true}
		showLiveTranscriptPreview={true}
		onkeydown={onKeyDownHandler}
	>
		{#snippet actions()}
			<!-- INKPRINT primary send button -->
			<button
				type="submit"
				class="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-foreground text-background shadow-ink transition-all duration-100 touch-manipulation pressable hover:bg-foreground/90 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 xs:h-9 xs:w-9"
				style="-webkit-tap-highlight-color: transparent;"
				aria-label="Send message"
				disabled={isSendDisabled}
			>
				{#if isStreaming}
					<Loader class="h-4 w-4 animate-spin xs:h-4 xs:w-4" />
				{:else}
					<Send class="h-4 w-4 xs:h-4 xs:w-4" />
				{/if}
			</button>
		{/snippet}
	</TextareaWithVoice>

	{#if voiceErrorMessage || isStreaming}
		<!-- INKPRINT micro-label status indicators -->
		<div
			class="flex flex-wrap items-center justify-between gap-1 px-0.5 text-[0.65rem] font-medium uppercase tracking-[0.15em]"
		>
			<div class="flex flex-wrap items-center gap-1">
				{#if voiceErrorMessage}
					<!-- INKPRINT error badge with Static texture -->
					<span
						role="alert"
						class="flex items-center gap-1 rounded-lg border border-red-600/30 bg-red-50 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-[0.1em] text-red-700 tx tx-static tx-weak dark:bg-red-950/30 dark:text-red-400"
					>
						{voiceErrorMessage}
					</span>
				{/if}

				{#if isStreaming}
					<!-- INKPRINT working badge with Grain texture -->
					<div
						class="flex items-center gap-1 rounded-lg border border-emerald-600/30 bg-emerald-50 px-2 py-0.5 text-emerald-700 tx tx-grain tx-weak dark:bg-emerald-950/30 dark:text-emerald-400"
					>
						<div
							class="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-600 dark:bg-emerald-400"
						></div>
						<span class="text-[0.65rem] font-semibold uppercase tracking-[0.1em]"
							>Working</span
						>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</form>
