<!-- apps/web/src/lib/components/voice/VoiceMicButton.svelte -->
<!-- Shared mic control. Ready → Mic; recording → Stop (with a level-driven ring); finishing → spinner. -->
<script lang="ts">
	import { LoaderCircle, Mic, MicOff, Square } from '$lib/icons/lucide';
	import type { VoiceDictation } from '$lib/voice/dictation-session.svelte';

	let {
		dictation,
		disabled = false,
		blocked = false,
		blockedLabel = 'Recording unavailable right now',
		label = 'Record voice note',
		class: className = '',
		onclick
	}: {
		dictation: VoiceDictation;
		disabled?: boolean;
		blocked?: boolean;
		blockedLabel?: string;
		label?: string;
		class?: string;
		onclick: () => void;
	} = $props();

	const permissionProblem = $derived(
		dictation.error?.code === 'permission-denied' || dictation.error?.code === 'no-device'
	);

	const view = $derived.by(() => {
		if (!dictation.supported) {
			return {
				kind: 'muted',
				label: "Voice isn't available in this browser",
				enabled: false
			};
		}
		if (dictation.phase === 'recording') {
			return { kind: 'recording', label: 'Stop and insert text', enabled: true };
		}
		if (dictation.phase === 'starting') {
			return { kind: 'loading', label: 'Starting microphone…', enabled: false };
		}
		if (dictation.phase === 'finishing') {
			return { kind: 'loading', label: 'Finishing transcript…', enabled: false };
		}
		if (disabled) return { kind: 'muted', label: 'Input disabled', enabled: false };
		if (blocked) return { kind: 'muted', label: blockedLabel, enabled: false };
		if (permissionProblem) return { kind: 'prompt', label: 'Enable microphone', enabled: true };
		return { kind: 'ready', label, enabled: true };
	});

	const level = $derived(dictation.levels[dictation.levels.length - 1] ?? 0);

	const variantClasses: Record<string, string> = {
		recording:
			'border-2 border-destructive bg-destructive text-destructive-foreground hover:bg-destructive/90',
		loading: 'border border-border bg-muted text-muted-foreground',
		prompt: 'border-2 border-accent bg-accent/10 text-accent hover:bg-accent/20 dark:bg-accent/15 dark:hover:bg-accent/25',
		muted: 'border border-border bg-muted text-muted-foreground/40 cursor-not-allowed',
		ready: 'border border-foreground/20 bg-card text-foreground hover:border-foreground/40 hover:bg-muted dark:border-foreground/15 dark:hover:border-foreground/30'
	};
</script>

<button
	type="button"
	class={`relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full touch-manipulation transition-colors duration-150 sm:h-8 sm:w-8 ${
		view.kind === 'muted'
			? ''
			: 'shadow-ink pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 dark:focus-visible:ring-offset-background'
	} ${variantClasses[view.kind]} ${className}`}
	style:box-shadow={view.kind === 'recording'
		? `0 0 0 ${Math.round(2 + level * 6)}px hsl(var(--destructive) / 0.22)`
		: undefined}
	aria-label={view.label}
	title={view.label}
	aria-pressed={view.kind === 'recording' ? true : undefined}
	disabled={!view.enabled}
	{onclick}
>
	{#if view.kind === 'loading'}
		<LoaderCircle class="h-5 w-5 animate-spin motion-reduce:animate-none sm:h-4 sm:w-4" />
	{:else if view.kind === 'recording'}
		<Square class="h-4 w-4 fill-current sm:h-3.5 sm:w-3.5" />
	{:else if view.kind === 'muted' && !dictation.supported}
		<MicOff class="h-5 w-5 sm:h-4 sm:w-4" />
	{:else}
		<Mic class="h-5 w-5 sm:h-4 sm:w-4" />
	{/if}
</button>
