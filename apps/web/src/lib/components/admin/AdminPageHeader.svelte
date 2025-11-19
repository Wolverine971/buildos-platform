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

<div class="admin-panel px-4 py-5 sm:px-6 sm:py-6">
	<div class="relative flex flex-col gap-4">
		<div class="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
			<div class="flex flex-1 flex-col gap-2">
				<div class="flex items-center gap-3">
					{#if showBack}
						<a
							href={backHref}
							class="inline-flex items-center gap-2 rounded-full border border-gray-200 px-3 py-1.5 text-[0.65rem] font-medium uppercase tracking-[0.15em] text-gray-600 transition-colors duration-200 hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900 dark:border-gray-700 dark:text-gray-400 dark:hover:border-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-100"
						>
							<ArrowLeft class="h-3 w-3" />
							<span>Back</span>
						</a>
					{/if}
					{#if icon}
						{@const Icon = icon}
						<span
							class="flex h-11 w-11 items-center justify-center rounded-xl bg-gray-900/5 text-gray-700 dark:bg-gray-50/10 dark:text-gray-200"
						>
							<Icon class="h-6 w-6" />
						</span>
					{/if}
					<h1 class="text-2xl font-semibold text-gray-900 dark:text-white sm:text-3xl">
						{title}
					</h1>
				</div>
				{#if description}
					<p class="text-base leading-relaxed text-gray-600 dark:text-gray-300">
						{description}
					</p>
				{/if}
			</div>

			{#if actions}
				<div class="flex w-full flex-wrap items-center gap-2 md:w-auto md:justify-end">
					{@render actions()}
				</div>
			{/if}
		</div>

		{#if controls}
			<div
				class="flex flex-wrap items-center gap-3 border-t border-gray-200 pt-4 dark:border-gray-800/70"
			>
				{@render controls()}
			</div>
		{/if}
	</div>
</div>
