<!-- apps/web/src/lib/components/projects/CollapsibleStateSection.svelte -->
<script lang="ts">
	import { ChevronDown } from '$lib/icons/lucide';
	import { PROJECT_STATE_META } from '$lib/config/project-states';
	import type { ProjectState } from '$lib/types/onto';
	import type { ProjectListSummary } from './project-list';
	import ProjectStateRow from './ProjectStateRow.svelte';

	interface Props {
		projectState: ProjectState;
		projects: ProjectListSummary[];
		onSelect?: (project: ProjectListSummary) => void;
	}

	const { projectState, projects, onSelect }: Props = $props();

	const meta = $derived(PROJECT_STATE_META[projectState]);
	const count = $derived(projects.length);
	let collapsed = $state(true);

	function toggle() {
		collapsed = !collapsed;
	}
</script>

{#if count > 0}
	<section
		class="space-y-1 border-t border-border pt-2"
		aria-labelledby="state-section-{projectState}"
	>
		<h2>
			<button
				type="button"
				class="flex min-h-11 w-full items-center justify-between gap-3 rounded-md text-left pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset [@media(pointer:fine)]:min-h-7"
				onclick={toggle}
				aria-expanded={!collapsed}
				aria-controls="state-section-body-{projectState}"
			>
				<span class="flex items-baseline gap-2">
					<span
						id="state-section-{projectState}"
						class="text-sm font-semibold text-foreground"
					>
						{meta.label} projects
					</span>
					<span class="text-xs font-medium tabular-nums text-muted-foreground"
						>{count}</span
					>
				</span>
				<ChevronDown
					class="h-4 w-4 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none {collapsed
						? '-rotate-90'
						: ''}"
				/>
			</button>
		</h2>

		{#if !collapsed}
			<div id="state-section-body-{projectState}" class="space-y-1">
				{#each projects as project (project.id)}
					<ProjectStateRow {project} {onSelect} />
				{/each}
			</div>
		{/if}
	</section>
{/if}
