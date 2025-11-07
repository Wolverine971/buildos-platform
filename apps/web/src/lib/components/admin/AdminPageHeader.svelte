<!-- apps/web/src/lib/components/admin/AdminPageHeader.svelte -->
<script lang="ts">
	import { ArrowLeft } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import type { ComponentType } from 'svelte';

	export let title: string;
	export let description: string = '';
	export let icon: ComponentType | null = null;
	export let backHref: string = '/admin';
	export let backLabel: string = 'Admin Dashboard';
	export let showBack: boolean = true;
</script>

<div
	class="relative rounded-2xl border border-slate-200/60 bg-white/80 px-5 py-4 shadow-sm transition-colors duration-300 dark:border-slate-800/70 dark:bg-slate-900/70 sm:px-6 sm:py-5"
>
	<div class="relative flex flex-col gap-4">
		<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
			<div class="flex flex-1 flex-col gap-2">
				<div class="flex items-center gap-3">
					{#if showBack}
						<a
							href={backHref}
							class="inline-flex items-center gap-2 rounded-full border border-slate-200/60 px-2.5 py-1 text-[0.6rem] font-semibold uppercase tracking-[0.25em] text-slate-500 transition-colors duration-200 hover:border-blue-400/60 hover:text-blue-600 dark:border-slate-700/70 dark:text-slate-400 dark:hover:border-blue-400/60 dark:hover:text-blue-200"
						>
							<ArrowLeft class="h-3 w-3" />
							<span>Back</span>
						</a>
					{/if}
					{#if icon}
						{@const Icon = icon}
						<span
							class="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500/15 via-purple-500/15 to-cyan-400/15 text-blue-600 dark:text-blue-200"
						>
							<Icon class="h-5 w-5" />
						</span>
					{/if}
					<h1 class="text-xl font-semibold text-slate-900 dark:text-slate-50 sm:text-2xl">
						{title}
					</h1>
				</div>
				{#if description}
					<p class="text-sm text-slate-600 dark:text-slate-300">{description}</p>
				{/if}
			</div>

			{#if $$slots.actions}
				<div class="flex w-full flex-wrap items-center gap-3 md:w-auto md:justify-end">
					<slot name="actions" />
				</div>
			{/if}
		</div>

		{#if $$slots.controls}
			<div class="flex flex-wrap items-center gap-3 border-t border-slate-200/60 pt-3 dark:border-slate-800/70">
				<slot name="controls" />
			</div>
		{/if}
	</div>
</div>
