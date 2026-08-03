<!-- apps/web/src/lib/components/admin/chat/ToolPayloadPanel.svelte -->
<script lang="ts">
	import { ChevronDown, Database, Send } from '$lib/icons/lucide';
	import {
		buildToolPayloadOverview,
		normalizeToolPayloadValue,
		toolPayloadFullText,
		type ToolPayloadKind
	} from '$lib/services/admin/chat-session-audit-tool-presentation';

	let {
		kind,
		value,
		emptyLabel
	}: {
		kind: ToolPayloadKind;
		value: unknown;
		emptyLabel: string;
	} = $props();

	let normalizedValue = $derived(normalizeToolPayloadValue(value));
	let overview = $derived(buildToolPayloadOverview(normalizedValue, kind));
	let fullText = $derived(toolPayloadFullText(normalizedValue));
	let title = $derived(kind === 'request' ? 'Request' : 'Response');
	let description = $derived(
		kind === 'request' ? 'What the tool received' : 'What the tool returned'
	);
</script>

<section class="overflow-hidden rounded-lg border border-border bg-card" aria-label={title}>
	<header class="flex items-center gap-2.5 border-b border-border bg-muted/40 px-3 py-2">
		<span
			class={[
				'flex h-8 w-8 shrink-0 items-center justify-center rounded-md border',
				kind === 'request'
					? 'border-accent/25 bg-accent/10 text-accent'
					: 'border-info/25 bg-info/10 text-info'
			]}
		>
			{#if kind === 'request'}
				<Send class="h-4 w-4" />
			{:else}
				<Database class="h-4 w-4" />
			{/if}
		</span>
		<div class="min-w-0">
			<h4 class="text-sm font-semibold text-foreground">{title}</h4>
			<p class="text-xs text-muted-foreground">{description}</p>
		</div>
	</header>

	<div class="space-y-3 p-3">
		{#if !overview.hasContent}
			<p class="text-sm text-muted-foreground">{emptyLabel}</p>
		{:else}
			{#if overview.headline}
				<p
					class="whitespace-pre-wrap break-words text-sm font-medium leading-relaxed text-foreground"
				>
					{overview.headline}
				</p>
			{/if}

			{#if overview.facts.length > 0}
				<dl class="grid grid-cols-1 gap-x-4 gap-y-2 sm:grid-cols-2">
					{#each overview.facts as fact (fact.key)}
						<div class="min-w-0">
							<dt class="micro-label text-muted-foreground">{fact.label}</dt>
							<dd class="mt-0.5 break-words text-xs font-medium text-foreground">
								{fact.value}
							</dd>
						</div>
					{/each}
				</dl>
			{/if}

			{#if overview.items.length > 0}
				<div class="space-y-1.5">
					<p class="micro-label text-muted-foreground">{overview.collectionLabel}</p>
					<div
						class="divide-y divide-border overflow-hidden rounded-md border border-border bg-background"
					>
						{#each overview.items as item (item.key)}
							<div class="min-w-0 px-2.5 py-2">
								<div
									class="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5"
								>
									<p
										class="min-w-0 break-words text-xs font-semibold text-foreground"
									>
										{item.title}
									</p>
									{#if item.meta}
										<p class="text-2xs text-muted-foreground">{item.meta}</p>
									{/if}
								</div>
								{#if item.detail}
									<p
										class="mt-0.5 break-words text-xs leading-relaxed text-muted-foreground"
									>
										{item.detail}
									</p>
								{/if}
							</div>
						{/each}
					</div>
					{#if overview.remainingItems > 0}
						<p class="text-2xs text-muted-foreground">
							+{overview.remainingItems.toLocaleString()} more in the full {kind}
						</p>
					{/if}
				</div>
			{/if}

			<details class="group overflow-hidden rounded-md border border-border bg-background">
				<summary
					class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
				>
					<span>Full {kind}</span>
					<ChevronDown
						class="h-4 w-4 shrink-0 transition-transform group-open:rotate-180 motion-reduce:transition-none"
					/>
				</summary>
				<pre
					class="max-h-[28rem] overflow-auto whitespace-pre-wrap break-words border-t border-border bg-muted/40 p-3 text-xs leading-relaxed text-foreground">{fullText}</pre>
			</details>
		{/if}
	</div>
</section>
