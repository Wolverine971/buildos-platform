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
		containerClass="rounded-lg border border-slate-200/80 bg-white shadow-sm dark:border-slate-700/80 dark:bg-slate-900"
		textareaClass="border-none bg-transparent px-2.5 py-2 text-sm leading-snug text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-0 dark:text-slate-100 dark:placeholder:text-slate-500 sm:px-3 sm:py-2.5"
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
			<!-- ✅ Compact send button: h-9 w-9 (36px), h-4 w-4 icons -->
			<button
				type="submit"
				class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-900/80 bg-slate-900 text-white shadow-sm transition-all duration-200 hover:bg-slate-800 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-100/80 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 dark:focus:ring-offset-slate-900"
				aria-label="Send message"
				disabled={isSendDisabled}
			>
				{#if isStreaming}
					<Loader class="h-4 w-4 animate-spin" />
				{:else}
					<Send class="h-4 w-4" />
				{/if}
			</button>
		{/snippet}
	</TextareaWithVoice>

	{#if voiceErrorMessage || isStreaming}
		<!-- ✅ Ultra-compact status indicators: gap-1, px-0.5 -->
		<div
			class="flex flex-wrap items-center justify-between gap-1 px-0.5 text-[10px] font-medium"
		>
			<div class="flex flex-wrap items-center gap-1">
				{#if voiceErrorMessage}
					<!-- ✅ Compact error badge: px-2 py-0.5, text-[10px] -->
					<span
						role="alert"
						class="flex items-center gap-1 rounded-md bg-gradient-to-r from-rose-50 to-red-50 px-2 py-0.5 text-[10px] font-medium text-rose-700 dark:from-rose-900/30 dark:to-red-900/20 dark:text-rose-300"
					>
						{voiceErrorMessage}
					</span>
				{/if}

				{#if isStreaming}
					<!-- ✅ Compact working badge: px-2 py-0.5, h-1.5 w-1.5 dot, text-[10px] -->
					<div
						class="flex items-center gap-1 rounded-md border border-emerald-200/60 bg-gradient-to-r from-emerald-50 to-green-50 px-2 py-0.5 text-emerald-700 dark:border-emerald-500/40 dark:from-emerald-900/30 dark:to-green-900/20 dark:text-emerald-300"
					>
						<div
							class="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-600 dark:bg-emerald-400"
						></div>
						<span class="text-[10px] font-semibold">Working...</span>
					</div>
				{/if}
			</div>
		</div>
	{/if}
</form>
