<!-- apps/web/src/lib/components/admin/chat/workflow/CopyableId.svelte -->
<!-- A readable label first, with the raw id copyable in one click. -->
<script lang="ts">
	import { Check, Copy } from '$lib/icons/lucide';

	let {
		value,
		label = null,
		short = true
	}: { value: string | null | undefined; label?: string | null; short?: boolean } = $props();

	let copied = $state(false);
	let timer: ReturnType<typeof setTimeout> | null = null;

	const display = $derived(
		value
			? short && value.length > 14
				? `${value.slice(0, 8)}…${value.slice(-4)}`
				: value
			: '-'
	);

	async function copy() {
		if (!value) return;
		try {
			await navigator.clipboard.writeText(value);
			copied = true;
			if (timer) clearTimeout(timer);
			timer = setTimeout(() => (copied = false), 1200);
		} catch {
			copied = false;
		}
	}

	$effect(() => () => {
		if (timer) clearTimeout(timer);
	});
</script>

<span class="inline-flex max-w-full items-center gap-1 align-middle">
	{#if label}<span class="text-foreground">{label}</span>{/if}
	<code
		class="truncate rounded bg-muted px-1 py-0.5 font-mono text-2xs text-muted-foreground"
		title={value ?? ''}>{display}</code
	>
	{#if value}
		<button
			type="button"
			class="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			onclick={copy}
			aria-label={`Copy ${label ?? 'id'}`}
			title="Copy"
		>
			{#if copied}<Check class="h-3 w-3 text-success" />{:else}<Copy class="h-3 w-3" />{/if}
		</button>
	{/if}
</span>
