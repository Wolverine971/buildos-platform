<!-- apps/web/src/lib/components/ui/TabNav.svelte -->
<script lang="ts" context="module">
	import type { ComponentType } from 'svelte';

	export interface Tab {
		id: string;
		label: string;
		icon?: ComponentType;
		count?: number;
		hideCount?: boolean;
	}
</script>

<script lang="ts">
	import { createEventDispatcher } from 'svelte';
	import Button from './Button.svelte';

	export let tabs: Tab[] = [];
	export let activeTab: string;
	export let containerClass = '';
	export let navClass = '';
	export let ariaLabel = 'Tabs';

	const dispatch = createEventDispatcher<{
		change: string;
	}>();

	function handleTabClick(tabId: string) {
		if (tabId !== activeTab) {
			dispatch('change', tabId);
		}
	}
</script>

<div class={`border-b border-gray-200 dark:border-gray-700 mb-4 sm:mb-6 ${containerClass}`}>
	<nav
		class={`-mb-px flex flex-nowrap gap-1 sm:gap-2 overflow-x-auto -mx-2 px-2 sm:mx-0 sm:px-0 scrollbar-hide ${navClass}`}
		aria-label={ariaLabel}
	>
		{#each tabs as tab (tab.id)}
			<Button
				type="button"
				on:click={() => handleTabClick(tab.id)}
				variant="ghost"
				size="md"
				btnType="container"
				class="border-b-2 text-xs sm:text-sm font-medium transition-colors whitespace-nowrap rounded-t-lg px-2 sm:px-4 py-2 sm:py-3 focus:ring-0 focus:ring-offset-0 flex-shrink-0 min-w-fit
					{activeTab === tab.id
					? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
					: 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'}"
			>
				<span class="inline-flex items-center gap-1.5 sm:gap-2">
					{#if tab.icon}
						<svelte:component this={tab.icon} class="w-3.5 h-3.5 sm:w-4 sm:h-4" />
					{/if}
					<span class="hidden sm:inline">{tab.label}</span>
					<span class="sm:hidden">{tab.label.split(' ')[0]}</span>
					{#if !tab.hideCount && tab.count !== undefined}
						<span
							class="ml-0.5 sm:ml-1 px-1.5 sm:px-2 py-0.5 text-xs rounded-full
								{activeTab === tab.id
								? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400'
								: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}"
						>
							{tab.count}
						</span>
					{/if}
				</span>
			</Button>
		{/each}
	</nav>
</div>

<style>
	/* Hide scrollbar for tab navigation */
	.scrollbar-hide {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
	.scrollbar-hide::-webkit-scrollbar {
		display: none;
	}
</style>
