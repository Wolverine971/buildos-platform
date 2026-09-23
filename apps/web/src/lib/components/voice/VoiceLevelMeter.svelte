<!-- apps/web/src/lib/components/voice/VoiceLevelMeter.svelte -->
<!-- Live microphone level: proof the mic is hearing you, drawn from real audio. -->
<script lang="ts">
	let {
		levels,
		class: className = '',
		barClass = 'bg-destructive'
	}: {
		levels: number[];
		class?: string;
		barClass?: string;
	} = $props();
</script>

<span class={`inline-flex h-4 items-center gap-[2px] ${className}`} aria-hidden="true">
	{#each levels as level, index (index)}
		<span
			class={`w-[2px] shrink-0 rounded-full ${barClass}`}
			style:height={`${Math.max(14, Math.round(level * 100))}%`}
			style:opacity={0.45 + Math.min(1, level) * 0.55}
		></span>
	{/each}
</span>
