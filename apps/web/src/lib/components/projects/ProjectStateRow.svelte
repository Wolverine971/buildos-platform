<!-- apps/web/src/lib/components/projects/ProjectStateRow.svelte -->
<script lang="ts">
	import { ArrowRight, Share2 } from '$lib/icons/lucide';
	import { resolve } from '$app/paths';
	import ProjectIcon from '$lib/components/project/ProjectIcon.svelte';
	import ProjectStateChip from './ProjectStateChip.svelte';
	import { formatAccessRole } from '$lib/config/project-states';
	import type { OntologyProjectSummary } from '$lib/services/ontology/ontology-projects.service';
	import { formatProjectUpdatedLabel, formatProjectUpdatedTitle } from './project-list';

	interface Props {
		project: OntologyProjectSummary;
		onSelect?: (project: OntologyProjectSummary) => void;
	}

	const { project, onSelect }: Props = $props();

	const accessRoleLabel = $derived(formatAccessRole(project.access_role));
	const hasNextStep = $derived(Boolean(project.next_step_short?.trim()));
	const resumeCue = $derived(
		project.next_step_short?.trim() ||
			project.description?.trim() ||
			'Open this project to continue.'
	);
	const updatedLabel = $derived(formatProjectUpdatedLabel(project.updated_at));
	const updatedTitle = $derived(formatProjectUpdatedTitle(project.updated_at));

	function handleClick() {
		onSelect?.(project);
	}
</script>

<a
	href={resolve('/projects/[id]', { id: project.id })}
	onclick={handleClick}
	class="project-dossier-row group block wt-paper p-3 pressable tx tx-frame tx-weak sm:p-4"
>
	<div class="flex min-w-0 items-start gap-2.5 sm:gap-3">
		<div class="shrink-0">
			<ProjectIcon svg={project.icon_svg} concept={project.icon_concept} size="sm" />
		</div>
		<div class="min-w-0 flex-1">
			<div class="flex min-w-0 items-center justify-between gap-3">
				<div class="flex min-w-0 items-center gap-2">
					<h4
						class="min-w-0 truncate text-base font-semibold tracking-tight text-foreground sm:text-lg"
						style="view-transition-name: project-title-{project.id}; view-transition-class: project-title"
						title={project.name}
					>
						{project.name}
					</h4>
					{#if project.is_shared}
						<span
							class="inline-flex shrink-0 items-center gap-1 rounded-full border border-accent/20 bg-accent/15 px-1.5 py-0.5 text-2xs font-semibold text-accent"
						>
							<Share2 class="h-2.5 w-2.5" aria-hidden="true" />
							<span>Shared{accessRoleLabel ? `: ${accessRoleLabel}` : ''}</span>
						</span>
					{:else}
						<ProjectStateChip state={project.state_key} size="xs" />
					{/if}
				</div>
				<time
					datetime={project.updated_at}
					title={updatedTitle}
					class="hidden shrink-0 whitespace-nowrap text-right text-xs font-medium text-muted-foreground sm:block"
				>
					{updatedLabel}
				</time>
			</div>

			<p
				class="mt-1 truncate text-xs sm:text-sm {hasNextStep
					? 'font-medium text-accent'
					: 'text-muted-foreground'}"
				title={hasNextStep ? (project.next_step_long ?? resumeCue) : resumeCue}
			>
				{hasNextStep ? 'Next: ' : ''}{resumeCue}
			</p>

			<time
				datetime={project.updated_at}
				title={updatedTitle}
				class="mt-1 block whitespace-nowrap text-2xs font-medium text-muted-foreground sm:hidden"
			>
				{updatedLabel}
			</time>
		</div>
		<span class="project-dossier-arrow hidden shrink-0 sm:flex" aria-hidden="true">
			<ArrowRight class="h-3.5 w-3.5 text-accent" />
		</span>
	</div>
</a>

<style>
	.project-dossier-row {
		transition: box-shadow 180ms ease;
	}

	.project-dossier-row:hover,
	.project-dossier-row:focus-visible {
		box-shadow: inset 0 -1px 0 hsl(var(--accent) / 0.6);
	}

	.project-dossier-arrow {
		opacity: 0;
		transform: translateX(-2px);
		transition:
			opacity 180ms ease,
			transform 180ms ease;
	}

	.project-dossier-row:hover .project-dossier-arrow,
	.project-dossier-row:focus-visible .project-dossier-arrow {
		opacity: 1;
		transform: translateX(0);
	}

	@media (prefers-reduced-motion: reduce) {
		.project-dossier-row,
		.project-dossier-arrow {
			transition: none;
		}
	}
</style>
