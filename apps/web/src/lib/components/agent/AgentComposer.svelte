<!-- apps/web/src/lib/components/agent/AgentComposer.svelte -->
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

<!-- ✅ Ultra-tight form: space-y-1 (4px) -->
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
		containerClass="input-scratchpad rounded-sm border-2 border-slate-300 bg-white shadow-sm dark:border-slate-600 dark:bg-slate-800"
		textareaClass="border-none bg-transparent px-2.5 py-2 text-sm font-medium leading-snug text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0 dark:text-slate-100 dark:placeholder:text-slate-500 sm:px-3 sm:py-2.5"
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
			<!-- ✅ Tactile send button with proper light/dark styling -->
			<button
				type="submit"
				class="btn-tactile flex h-10 w-10 shrink-0 items-center justify-center rounded-sm border-2 border-slate-700 bg-slate-800 text-white shadow-md transition-all duration-100 touch-manipulation hover:bg-slate-700 hover:shadow-lg active:translate-y-1 active:shadow-none focus:outline-none focus:ring-2 focus:ring-accent-blue focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 xs:h-9 xs:w-9 dark:border-slate-400 dark:bg-slate-600 dark:hover:bg-slate-500"
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
		<!-- ✅ Ultra-compact status indicators: gap-1, px-0.5, responsive text -->
		<div
			class="flex flex-wrap items-center justify-between gap-1 px-0.5 text-[10px] font-medium xs:text-[11px]"
		>
			<div class="flex flex-wrap items-center gap-1">
				{#if voiceErrorMessage}
					<!-- ✅ Industrial error badge with proper contrast -->
					<span
						role="alert"
						class="flex items-center gap-1 rounded-sm border border-rose-400 bg-rose-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-rose-700 dark:border-rose-600 dark:bg-rose-900/30 dark:text-rose-400 xs:text-[11px]"
					>
						{voiceErrorMessage}
					</span>
				{/if}

				{#if isStreaming}
					<!-- ✅ Industrial working badge with proper contrast -->
					<div
						class="flex items-center gap-1 rounded-sm border border-green-400 bg-green-100 px-2 py-0.5 text-green-700 dark:border-green-600 dark:bg-green-900/30 dark:text-green-400"
					>
						<div
							class="h-1.5 w-1.5 animate-pulse rounded-full bg-green-500 dark:bg-green-400"
						></div>
						<span
							class="text-[10px] font-semibold uppercase tracking-wider xs:text-[11px]"
							>Working</span
						>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</form>
