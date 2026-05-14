<!-- apps/web/src/lib/components/projects/CollapsibleStateSection.svelte -->
<script lang="ts">
	import { ChevronDown } from 'lucide-svelte';
	import { PROJECT_STATE_META } from '$lib/config/project-states';
	import type { ProjectState } from '$lib/types/onto';
	import type { OntologyProjectSummary } from '$lib/services/ontology/ontology-projects.service';
	import ProjectStateRow from './ProjectStateRow.svelte';

	interface Props {
		projectState: ProjectState;
		projects: OntologyProjectSummary[];
		variant?: 'primary' | 'secondary';
		/** Default collapse for secondary tiers; ignored on primary tiers. */
		collapseThreshold?: number;
		/** Optional pre-computed recency buckets for primary tiers. */
		recencyGroups?: {
			recent: OntologyProjectSummary[];
			olderThan7Days: OntologyProjectSummary[];
			olderThan30Days: OntologyProjectSummary[];
		} | null;
		onSelect?: (project: OntologyProjectSummary) => void;
	}

	const {
		projectState,
		projects,
		variant = 'primary',
		collapseThreshold = 3,
		recencyGroups = null,
		onSelect
	}: Props = $props();

	const meta = $derived(PROJECT_STATE_META[projectState]);
	const count = $derived(projects.length);
	const isSecondary = $derived(variant === 'secondary');
	const isCollapsible = $derived(isSecondary);

	let manuallyToggled = $state(false);
	let collapsed = $state(false);

	$effect(() => {
		if (manuallyToggled) return;
		collapsed = isSecondary && count > collapseThreshold;
	});

	function toggle() {
		if (!isCollapsible) return;
		manuallyToggled = true;
		collapsed = !collapsed;
	}
</script>

{#if count > 0}
	<section
		class="space-y-2"
		class:border-t={isSecondary}
		class:border-border={isSecondary}
		class:pt-4={isSecondary}
		aria-labelledby="state-section-{projectState}"
	>
		<button
			type="button"
			class="w-full flex items-center justify-between gap-3 text-left transition pressable"
			class:cursor-default={!isCollapsible}
			onclick={toggle}
			aria-expanded={isCollapsible ? !collapsed : undefined}
			aria-controls={isCollapsible ? `state-section-body-${projectState}` : undefined}
		>
			<div class="flex items-baseline gap-2">
				<p
					id="state-section-{projectState}"
					class="micro-label"
					class:text-accent={!isSecondary}
					class:text-muted-foreground={isSecondary}
				>
					{meta.label}
				</p>
				<span class="text-xs font-semibold text-muted-foreground">
					{count}
				</span>
				<span class="hidden sm:inline text-xs font-medium text-muted-foreground/80">
					· {meta.helperLine}
				</span>
			</div>
			{#if isCollapsible}
				<ChevronDown
					class="h-4 w-4 text-muted-foreground transition-transform duration-200 {collapsed
						? '-rotate-90'
						: ''}"
				/>
			{/if}
		</button>

		{#if !collapsed}
			<div id="state-section-body-{projectState}" class="space-y-2">
				{#if !isSecondary && recencyGroups}
					{#each recencyGroups.recent as project (project.id)}
						<ProjectStateRow {project} variant="primary" {onSelect} />
					{/each}

					{#if recencyGroups.olderThan7Days.length > 0}
						<div class="project-recency-separator">Not touched in last 7 days</div>
						{#each recencyGroups.olderThan7Days as project (project.id)}
							<ProjectStateRow {project} variant="primary" {onSelect} />
						{/each}
					{/if}

					{#if recencyGroups.olderThan30Days.length > 0}
						<div class="project-recency-separator">Not touched in last 30 days</div>
						{#each recencyGroups.olderThan30Days as project (project.id)}
							<ProjectStateRow {project} variant="primary" {onSelect} />
						{/each}
					{/if}
				{:else}
					{#each projects as project (project.id)}
						<ProjectStateRow
							{project}
							variant={isSecondary ? 'secondary' : 'primary'}
							{onSelect}
						/>
					{/each}
				{/if}
			</div>
		{/if}
	</section>
{/if}

<style>
	.project-recency-separator {
		margin-top: 0.5rem;
		padding-top: 0.75rem;
		border-top: 1px solid hsl(var(--border));
		font-size: 0.6875rem;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: hsl(var(--muted-foreground) / 0.85);
	}
</style>
