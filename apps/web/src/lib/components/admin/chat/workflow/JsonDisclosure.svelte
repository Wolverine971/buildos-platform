<!-- apps/web/src/lib/components/admin/chat/workflow/JsonDisclosure.svelte -->
<!-- Collapsed-by-default pretty JSON with a copy button. Large values stay off-screen until asked for. -->
<script lang="ts">
	import { Check, Copy } from '$lib/icons/lucide';
	import { prettyJson } from '$lib/services/admin/chat-session-audit-formatters';

	let {
		title,
		value,
		open = false,
		emptyLabel = 'none'
	}: { title: string; value: unknown; open?: boolean; emptyLabel?: string } = $props();

	let copied = $state(false);
	const text = $derived(prettyJson(value));
	const isEmpty = $derived(
		value === null ||
			value === undefined ||
			(Array.isArray(value) && value.length === 0) ||
			(typeof value === 'object' &&
				!Array.isArray(value) &&
				Object.keys(value as object).length === 0)
	);
	const bytes = $derived(text.length);

	async function copy() {
		try {
			await navigator.clipboard.writeText(text);
			copied = true;
			setTimeout(() => (copied = false), 1200);
		} catch {
			copied = false;
		}
	}
</script>

<details class="group rounded-lg border border-border bg-background" {open}>
	<summary
		class="flex cursor-pointer items-center justify-between gap-2 px-3 py-2 text-xs font-medium text-foreground marker:content-none"
	>
		<span class="flex items-center gap-2">
			<span class="text-muted-foreground transition-transform group-open:rotate-90">▸</span>
			{title}
			{#if isEmpty}<span class="text-2xs text-muted-foreground">({emptyLabel})</span
				>{:else}<span class="text-2xs text-muted-foreground"
					>{bytes.toLocaleString()} chars</span
				>{/if}
		</span>
		{#if !isEmpty}
			<button
				type="button"
				class="inline-flex h-6 items-center gap-1 rounded px-1.5 text-2xs text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				onclick={(event) => {
					event.preventDefault();
					void copy();
				}}
			>
				{#if copied}<Check class="h-3 w-3 text-success" /> Copied{:else}<Copy
						class="h-3 w-3"
					/> Copy{/if}
			</button>
		{/if}
	</summary>
	{#if !isEmpty}
		<pre
			class="max-h-96 overflow-auto border-t border-border px-3 py-2 font-mono text-2xs leading-relaxed text-foreground">{text}</pre>
	{/if}
</details>
