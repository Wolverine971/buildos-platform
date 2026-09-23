<!-- apps/web/src/lib/components/voice/VoiceStatusLine.svelte -->
<!-- What the mic is doing right now, readable at every width. Renders nothing when idle and error-free. -->
<script lang="ts">
	import { AlertTriangle, LoaderCircle, X } from '$lib/icons/lucide';
	import {
		formatDictationDuration,
		type VoiceDictation
	} from '$lib/voice/dictation-session.svelte';
	import VoiceLevelMeter from './VoiceLevelMeter.svelte';

	let {
		dictation,
		listeningLabel = 'Listening',
		preparingLabel = 'Starting mic…',
		showKeyHint = true,
		class: className = ''
	}: {
		dictation: VoiceDictation;
		listeningLabel?: string;
		preparingLabel?: string;
		showKeyHint?: boolean;
		class?: string;
	} = $props();

	const finishingLabel = $derived(
		dictation.pendingSegments > 1
			? `Finishing · ${dictation.pendingSegments} parts left`
			: 'Finishing…'
	);
</script>

<div class={`flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs ${className}`}>
	{#if dictation.needsAttention && dictation.error}
		<span role="alert" class="flex min-w-0 items-center gap-1.5 font-semibold text-destructive">
			<AlertTriangle class="h-3.5 w-3.5 shrink-0" />
			<span class="min-w-0">{dictation.error.message}</span>
		</span>
		<span class="flex items-center gap-1">
			<button
				type="button"
				class="min-h-8 rounded-full border border-accent bg-accent px-2.5 font-semibold text-accent-foreground shadow-ink pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				onclick={() => void dictation.retry()}
			>
				Retry
			</button>
			<button
				type="button"
				class="min-h-8 rounded-full border border-border bg-card px-2.5 font-semibold text-foreground pressable hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				onclick={() => dictation.keepPartial()}
			>
				Keep what's there
			</button>
		</span>
	{:else if dictation.phase === 'recording'}
		<span class="flex items-center gap-1.5 font-semibold text-destructive">
			<span class="relative flex h-2 w-2 items-center justify-center">
				<span
					class="absolute inline-flex h-full w-full animate-status-ping rounded-full bg-destructive/60 motion-reduce:animate-none"
				></span>
				<span class="relative inline-flex h-1.5 w-1.5 rounded-full bg-destructive"></span>
			</span>
			{listeningLabel}
			<span class="font-bold tabular-nums">{formatDictationDuration(dictation.elapsedMs)}</span>
		</span>
		<VoiceLevelMeter levels={dictation.levels} />
		{#if showKeyHint}
			<span class="hidden items-center gap-1 text-muted-foreground md:inline-flex">
				<kbd
					class="rounded border border-border bg-background px-1 py-0.5 font-mono text-2xs font-medium text-foreground"
					>Enter</kbd
				>
				to finish
			</span>
		{/if}
	{:else if dictation.phase === 'starting'}
		<span class="flex items-center gap-1.5 font-medium text-muted-foreground">
			<LoaderCircle class="h-3 w-3 animate-spin motion-reduce:animate-none" />
			{preparingLabel}
		</span>
	{:else if dictation.phase === 'finishing'}
		<span class="flex items-center gap-1.5 font-semibold text-accent">
			<LoaderCircle class="h-3 w-3 animate-spin motion-reduce:animate-none" />
			{finishingLabel}
		</span>
	{:else if dictation.error}
		<span
			role="alert"
			class="flex min-w-0 items-center gap-1.5 font-medium {dictation.error.code ===
			'draft-fallback'
				? 'text-muted-foreground'
				: 'text-destructive'}"
		>
			<AlertTriangle class="h-3.5 w-3.5 shrink-0" />
			<span class="min-w-0">{dictation.error.message}</span>
		</span>
		<button
			type="button"
			class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground focus:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			aria-label="Dismiss"
			onclick={() => dictation.dismissError()}
		>
			<X class="h-3.5 w-3.5" />
		</button>
	{/if}
</div>
