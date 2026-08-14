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
		class="space-y-2 border-t border-border pt-4"
		aria-labelledby="state-section-{projectState}"
	>
		<button
			type="button"
			class="flex min-h-11 w-full items-center justify-between gap-3 rounded-md text-left transition pressable focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
			onclick={toggle}
			aria-expanded={!collapsed}
			aria-controls="state-section-body-{projectState}"
		>
			<div class="flex items-baseline gap-2">
				<p id="state-section-{projectState}" class="micro-label text-muted-foreground">
					{meta.label} projects
				</p>
				<span class="text-xs font-semibold text-muted-foreground">{count}</span>
			</div>
			<ChevronDown
				class="h-4 w-4 text-muted-foreground transition-transform duration-200 motion-reduce:transition-none {collapsed
					? '-rotate-90'
					: ''}"
			/>
		</button>

		{#if !collapsed}
			<div id="state-section-body-{projectState}" class="space-y-2">
				{#each projects as project (project.id)}
					<ProjectStateRow {project} {onSelect} />
				{/each}
			</div>
		{/if}
	</section>
{/if}
