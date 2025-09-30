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

<div class="mb-6 sm:mb-8">
	<!-- Back Button - Mobile and Desktop -->
	{#if showBack}
		<div class="mb-4">
			<a
				href={backHref}
				class="inline-flex items-center text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-200 transition-colors"
			>
				<ArrowLeft class="w-4 h-4 mr-2" />
				<span>Back to {backLabel}</span>
			</a>
		</div>
	{/if}

	<!-- Header Content -->
	<div class="flex flex-col sm:flex-row sm:items-center sm:justify-between">
		<div class="flex-1">
			<h1
				class="text-xl sm:text-2xl lg:text-3xl font-bold text-gray-900 dark:text-white flex items-center"
			>
				{#if icon}
					<svelte:component
						this={icon}
						class="mr-3 h-5 w-5 sm:h-6 sm:w-6 lg:h-8 lg:w-8 text-blue-600"
					/>
				{/if}
				{title}
			</h1>
			{#if description}
				<p class="text-sm sm:text-base text-gray-600 dark:text-gray-400 mt-1">
					{description}
				</p>
			{/if}
		</div>

		<!-- Right side slot for action buttons -->
		<div class="mt-4 sm:mt-0">
			<slot name="actions" />
		</div>
	</div>

	<!-- Additional slot for filters or controls -->
	{#if $$slots.controls}
		<div class="mt-4">
			<slot name="controls" />
		</div>
	{/if}
</div>
