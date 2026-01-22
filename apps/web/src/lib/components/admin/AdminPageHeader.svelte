<!-- apps/web/src/lib/components/admin/AdminPageHeader.svelte -->
<script lang="ts">
	import { ArrowLeft } from 'lucide-svelte';
	import type { ComponentType, Snippet } from 'svelte';

	let {
		title,
		description = '',
		icon = null,
		backHref = '/admin',
		backLabel = 'Admin Dashboard',
		showBack = true,
		actions,
		controls
	}: {
		title: string;
		description?: string;
		icon?: ComponentType | null;
		backHref?: string;
		backLabel?: string;
		showBack?: boolean;
		actions?: Snippet;
		controls?: Snippet;
	} = $props();
</script>

<div class="space-y-4">
	<div class="relative flex flex-col gap-4">
		<div class="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
			<div class="flex flex-1 flex-col gap-3">
				{#if showBack}
					<div>
						<a
							href={backHref}
							class="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-muted-foreground transition-all duration-200 hover:border-accent hover:bg-muted hover:text-foreground shadow-ink pressable"
						>
							<ArrowLeft class="h-3 w-3 shrink-0" />
							<span class="hidden sm:inline">{backLabel}</span>
							<span class="sm:hidden">Back</span>
						</a>
					</div>
				{/if}
				<div class="flex items-center gap-3">
					{#if icon}
						{@const Icon = icon}
						<span
							class="hidden sm:flex h-12 w-12 items-center justify-center rounded-xl bg-muted text-accent shadow-ink"
						>
							<Icon class="h-6 w-6" />
						</span>
					{/if}
					<div>
						<h1 class="text-xl font-bold text-foreground sm:text-2xl lg:text-3xl">
							{title}
						</h1>
						{#if description}
							<p class="mt-1 text-sm text-muted-foreground sm:text-base">
								{description}
							</p>
						{/if}
					</div>
				</div>
			</div>

			{#if actions}
				<div class="flex flex-wrap items-center gap-2 lg:justify-end">
					{@render actions()}
				</div>
			{/if}
		</div>

		{#if controls}
			<div class="flex flex-wrap items-center gap-3 border-t border-border pt-4">
				{@render controls()}
			</div>
		{/if}
	</div>
</div>
