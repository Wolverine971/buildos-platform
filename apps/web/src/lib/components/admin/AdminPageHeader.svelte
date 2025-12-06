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
							class="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium uppercase tracking-wider text-slate-600 transition-all duration-200 hover:border-slate-300 hover:bg-slate-50 hover:text-slate-900 dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-100"
						>
							<ArrowLeft class="h-3 w-3" />
							<span class="hidden sm:inline">{backLabel}</span>
							<span class="sm:hidden">Back</span>
						</a>
					</div>
				{/if}
				<div class="flex items-center gap-3">
					{#if icon}
						{@const Icon = icon}
						<span
							class="hidden sm:flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-50 to-purple-50 text-blue-600 dark:from-blue-950/30 dark:to-purple-950/30 dark:text-blue-400"
						>
							<Icon class="h-6 w-6" />
						</span>
					{/if}
					<div>
						<h1
							class="text-xl font-bold text-slate-900 dark:text-white sm:text-2xl lg:text-3xl"
						>
							{title}
						</h1>
						{#if description}
							<p class="mt-1 text-sm text-slate-600 dark:text-slate-400 sm:text-base">
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
			<div
				class="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-4 dark:border-slate-700"
			>
				{@render controls()}
			</div>
		{/if}
	</div>
</div>
