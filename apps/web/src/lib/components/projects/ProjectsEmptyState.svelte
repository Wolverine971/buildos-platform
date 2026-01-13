<!-- apps/web/src/lib/components/projects/ProjectsEmptyState.svelte -->
<!-- Inkprint Design System: Uses semantic tokens and appropriate textures -->
<script lang="ts">
	import { FolderOpen, FileText, Plus } from 'lucide-svelte';
	import Button from '$lib/components/ui/Button.svelte';
	import { createEventDispatcher } from 'svelte';

	export let type: 'projects' | 'briefs' = 'projects';
	export let hasFilters: boolean = false;
	export let message: string = '';

	const dispatch = createEventDispatcher();

	const defaultMessages = {
		projects: {
			withFilters: 'No projects match your criteria',
			withFiltersSubtext: 'Try adjusting your search or filter settings',
			noData: 'No projects yet',
			noDataSubtext:
				'Projects help you organize related tasks and track progress toward specific outcomes. Create your first project to get started.'
		},
		briefs: {
			withFilters: 'No briefs found',
			withFiltersSubtext: 'Try adjusting your search or filter settings',
			noData: 'No briefs found',
			noDataSubtext: 'Project briefs will appear here once generated'
		}
	};

	$: config = defaultMessages[type];
	$: icon = type === 'projects' ? FolderOpen : FileText;
	$: title = hasFilters ? config.withFilters : config.noData;
	$: subtext = message || (hasFilters ? config.withFiltersSubtext : config.noDataSubtext);

	function handleClearFilters() {
		dispatch('clearFilters');
	}

	function handleCreateProject() {
		dispatch('createProject');
	}
</script>

<div class="text-center py-12 sm:py-16">
	<div
		class="bg-card rounded-xl p-6 sm:p-8 max-w-md mx-auto shadow-ink border border-dashed border-border tx tx-bloom tx-weak"
	>
		{#if icon}
			{@const EmptyStateIcon = icon}
			<div
				class="mx-auto mb-4 flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-lg border border-accent/30 bg-accent/10"
			>
				<EmptyStateIcon class="w-6 h-6 text-accent" />
			</div>
		{/if}
		<h3 class="text-lg font-semibold text-foreground mb-2">
			{title}
		</h3>
		<p class="text-sm text-muted-foreground mb-6 max-w-md mx-auto leading-relaxed">
			{subtext}
		</p>

		{#if hasFilters}
			<Button onclick={handleClearFilters} variant="secondary" size="md">
				Clear Filters
			</Button>
		{:else if type === 'projects'}
			<Button onclick={handleCreateProject} variant="primary" size="md" icon={Plus}>
				Create your first project
			</Button>
		{/if}
	</div>
</div>
