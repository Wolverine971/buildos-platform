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
	class="relative overflow-hidden rounded-3xl border border-slate-200/60 bg-white/85 px-6 py-7 shadow-sm transition-colors duration-300 dark:border-slate-800/70 dark:bg-slate-900/70 sm:px-8 sm:py-9"
>
	<div
		class="pointer-events-none absolute inset-0 bg-gradient-to-br from-blue-500/7 via-purple-500/7 to-cyan-400/7 opacity-80 blur-xl dark:from-blue-500/15 dark:via-purple-500/15 dark:to-cyan-500/15"
	/>

	<div class="relative flex flex-col gap-5">
		{#if showBack}
			<a
				href={backHref}
				class="w-max rounded-full border border-slate-200/60 bg-white/60 px-3 py-1 text-xs font-semibold uppercase tracking-[0.28em] text-slate-500 transition-colors duration-200 hover:border-blue-400/60 hover:text-blue-600 dark:border-slate-700/70 dark:bg-slate-900/60 dark:text-slate-400 dark:hover:border-blue-400/60 dark:hover:text-blue-200"
			>
				<span class="inline-flex items-center gap-2">
					<ArrowLeft class="h-3.5 w-3.5" />
					<span>Back · {backLabel}</span>
				</span>
			</a>
		{/if}

		<div class="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
			<div class="flex-1">
				<h1
					class="flex items-center gap-4 text-2xl font-semibold text-slate-900 dark:text-slate-50 sm:text-3xl"
				>
					{#if icon}
						{@const Icon = icon}
						<span
							class="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-500/20 via-purple-500/20 to-cyan-400/20 text-blue-600 dark:text-blue-200"
						>
							<Icon class="h-6 w-6 sm:h-7 sm:w-7" />
						</span>
					{/if}
					<span class="tracking-tight">{title}</span>
				</h1>
				{#if description}
					<p
						class="mt-2 max-w-3xl text-sm text-slate-600 dark:text-slate-300 sm:text-base"
					>
						{description}
					</p>
				{/if}
			</div>

			{#if $$slots.actions}
				<div class="flex shrink-0 flex-wrap items-center gap-4">
					<slot name="actions" />
				</div>
			{/if}
		</div>

		{#if $$slots.controls}
			<div
				class="mt-3 flex flex-wrap items-center gap-4 border-t border-slate-200/60 pt-5 dark:border-slate-800/70"
			>
				<slot name="controls" />
			</div>
		{/if}
	</div>
</div>
