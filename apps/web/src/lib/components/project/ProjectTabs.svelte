<!-- apps/web/src/lib/components/project/ProjectTabs.svelte -->
<script lang="ts">
	import {
		LayoutGrid,
		CheckSquare,
		FileText,
		Calendar,
		Brain,
		Layers,
		AlertCircle,
		Clock
	} from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { createEventDispatcher } from 'svelte';

	// Define ExtendedTabType locally
	type ExtendedTabType = 'overview' | 'tasks' | 'notes' | 'briefs' | 'synthesis' | 'braindumps';

	let {
		activeTab = 'overview' as ExtendedTabType,
		tabCounts,
		isMobile = false
	} = $props<{
		activeTab?: ExtendedTabType;
		tabCounts: {
			tasks: number;
			notes: number;
			deletedTasks: number;
			doneTasks: number;
			phases: number;
			scheduled: number;
			briefs: number;
			braindumps: number;
		};
		isMobile?: boolean;
	}>();

	const dispatch = createEventDispatcher<{ change: ExtendedTabType }>();

	interface Tab {
		id: ExtendedTabType;
		label: string;
		icon: typeof LayoutGrid;
		count?: number;
		hideCount?: boolean;
		hideOnMobile?: boolean;
		mobileLabel?: string;
	}

	let tabs = $derived([
		{
			id: 'overview' as const,
			label: 'Overview',
			icon: Layers,
			hideCount: true
		},
		{
			id: 'tasks' as const,
			label: 'Tasks',
			icon: CheckSquare,
			count: tabCounts.tasks
		},
		{
			id: 'braindumps' as const,
			label: 'Brain Dumps',
			mobileLabel: 'Dumps',
			icon: Brain,
			count: tabCounts.braindumps,
			hideCount: true
		},
		{
			id: 'briefs' as const,
			label: 'Daily Briefs',
			mobileLabel: 'Briefs',
			icon: FileText,
			hideCount: tabCounts?.briefs ? false : true,
			count: tabCounts.briefs
		},
		{
			id: 'notes' as const,
			label: 'Notes',
			icon: LayoutGrid,
			count: tabCounts.notes
		},
		{
			id: 'synthesis' as const,
			label: 'AI Summary',
			mobileLabel: 'AI',
			icon: AlertCircle,
			hideCount: true
		}
	]);

	let visibleTabs = $derived(isMobile ? tabs.filter((tab) => !tab.hideOnMobile) : tabs);
</script>

<div class="border-b border-gray-200 dark:border-gray-700">
	<div class="project-tabs -mb-px">
		{#each visibleTabs as tab}
			<Button
				onclick={() => dispatch('change', tab.id)}
				variant="ghost"
				size="md"
				class="project-tab border-b-2 text-sm font-medium transition-colors rounded-none
					{activeTab === tab.id
					? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20'
					: 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 hover:border-gray-300 dark:hover:border-gray-600'}"
			>
				<svelte:component this={tab.icon} class="w-4 h-4 mr-2" />
				<span>{isMobile && tab.mobileLabel ? tab.mobileLabel : tab.label}</span>
				{#if !tab.hideCount && tab.count !== undefined}
					<span
						class="ml-2 px-2 py-0.5 text-xs rounded-full
							{activeTab === tab.id
							? 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400'
							: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400'}"
					>
						{tab.count}
					</span>
				{/if}
			</Button>
		{/each}
	</div>
</div>

<style>
	.scrollbar-hide {
		-ms-overflow-style: none;
		scrollbar-width: none;
	}
	.scrollbar-hide::-webkit-scrollbar {
		display: none;
	}
</style>
