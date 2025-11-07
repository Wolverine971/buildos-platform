<!-- apps/web/src/lib/components/admin/AdminPageHeader.svelte -->
<script lang="ts">
	import { ArrowLeft } from 'lucide-svelte';
	import type { ComponentType } from 'svelte';

	export let title: string;
	export let description: string = '';
	export let icon: ComponentType | null = null;
	export let backHref: string = '/admin';
	export let backLabel: string = 'Admin Dashboard';
	export let showBack: boolean = true;
</script>

<div class="admin-panel px-4 py-4 sm:px-5 sm:py-4">
	<div class="relative flex flex-col gap-3">
		<div class="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
			<div class="flex flex-1 flex-col gap-2">
				<div class="flex items-center gap-3">
					{#if showBack}
						<a
							href={backHref}
							class="inline-flex items-center gap-2 rounded-full border border-slate-200 px-2.5 py-1 text-[0.6rem] font-medium uppercase tracking-[0.22em] text-slate-500 transition-colors duration-200 hover:border-slate-400 hover:text-slate-700 dark:border-slate-700 dark:text-slate-400 dark:hover:border-slate-500 dark:hover:text-slate-100"
						>
							<ArrowLeft class="h-3 w-3" />
							<span>Back</span>
						</a>
					{/if}
					{#if icon}
						{@const Icon = icon}
						<span
							class="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900/5 text-slate-700 dark:bg-slate-50/10 dark:text-slate-200"
						>
							<Icon class="h-5 w-5" />
						</span>
					{/if}
					<h1
						class="text-xl font-semibold text-slate-900 dark:text-slate-50 sm:text-[1.35rem]"
					>
						{title}
					</h1>
				</div>
				{#if description}
					<p class="text-sm text-slate-600 dark:text-slate-300">{description}</p>
				{/if}
			</div>

			{#if $$slots.actions}
				<div class="flex w-full flex-wrap items-center gap-2 md:w-auto md:justify-end">
					<slot name="actions" />
				</div>
			{/if}
		</div>

		{#if $$slots.controls}
			<div
				class="flex flex-wrap items-center gap-3 border-t border-slate-200 pt-3 dark:border-slate-800/70"
			>
				<slot name="controls" />
			</div>
		{/if}
	</div>
</div>
