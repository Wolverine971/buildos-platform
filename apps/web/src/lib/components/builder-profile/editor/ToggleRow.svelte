<!-- apps/web/src/lib/components/builder-profile/editor/ToggleRow.svelte -->
<!-- One on/off setting: label, a short hint, and a switch (44px touch target). -->
<script lang="ts">
	let {
		id,
		label,
		hint = '',
		checked,
		disabled = false,
		busy = false,
		error = null,
		onchange
	}: {
		id: string;
		label: string;
		hint?: string;
		checked: boolean;
		disabled?: boolean;
		busy?: boolean;
		error?: string | null;
		onchange: (next: boolean) => void;
	} = $props();
</script>

<div class="flex items-start justify-between gap-4 py-2">
	<div class="min-w-0 space-y-0.5 pt-2.5">
		<p id="{id}-label" class="text-sm font-medium text-foreground {disabled ? 'opacity-60' : ''}">
			{label}
		</p>
		{#if hint}
			<p id="{id}-hint" class="text-xs text-muted-foreground">{hint}</p>
		{/if}
		{#if error}
			<p class="text-xs text-destructive" role="alert">{error}</p>
		{/if}
	</div>
	<button
		{id}
		type="button"
		role="switch"
		aria-checked={checked}
		aria-labelledby="{id}-label"
		aria-describedby={hint ? `${id}-hint` : undefined}
		aria-busy={busy || undefined}
		{disabled}
		onclick={() => onchange(!checked)}
		class="group inline-flex h-11 w-14 shrink-0 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
	>
		<span
			class="relative h-7 w-12 rounded-full border transition-colors motion-reduce:transition-none {checked
				? 'border-accent bg-accent'
				: 'border-border-strong bg-muted'}"
		>
			<span
				class="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-background shadow-ink transition-transform motion-reduce:transition-none {checked
					? 'translate-x-5'
					: 'translate-x-0'}"
			></span>
		</span>
	</button>
</div>
