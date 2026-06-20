<!-- apps/web/src/lib/components/projects/ProjectStateRow.svelte -->
<script lang="ts">
	import { ArrowRight, Share2 } from 'lucide-svelte';
	import ProjectIcon from '$lib/components/project/ProjectIcon.svelte';
	import ProjectStateChip from './ProjectStateChip.svelte';
	import { formatAccessRole } from '$lib/config/project-states';
	import type { OntologyProjectSummary } from '$lib/services/ontology/ontology-projects.service';

	interface Props {
		project: OntologyProjectSummary;
		variant?: 'primary' | 'secondary';
		onSelect?: (project: OntologyProjectSummary) => void;
	}

	const { project, variant = 'primary', onSelect }: Props = $props();

	const isSecondary = $derived(variant === 'secondary');
	const accessRoleLabel = $derived(formatAccessRole(project.access_role));
	const entityCounts = $derived(
		`Tasks ${project.task_count} · Goals ${project.goal_count} · Plans ${project.plan_count} · Docs ${project.document_count}`
	);

	function formatUpdatedAt(value: string): string {
		const date = new Date(value);
		if (Number.isNaN(date.getTime())) return 'Updated recently';
		return date.toLocaleString(undefined, {
			month: 'short',
			day: 'numeric',
			year: 'numeric',
			hour: 'numeric',
			minute: '2-digit'
		});
	}

	function handleClick() {
		onSelect?.(project);
	}
</script>

<a
	href="/projects/{project.id}"
	onclick={handleClick}
	class="project-dossier-row group block wt-paper p-3 sm:p-4 pressable tx tx-frame tx-weak"
	class:project-dossier-row--secondary={isSecondary}
>
	<div class="flex items-start justify-between gap-3">
		<div class="min-w-0 flex items-center gap-2.5">
			<ProjectIcon svg={project.icon_svg} concept={project.icon_concept} size="sm" />
			<div class="min-w-0 flex items-center gap-2 flex-wrap">
				<h4
					class="min-w-0 truncate text-base sm:text-xl font-semibold text-foreground tracking-tight"
					class:sm:text-lg={isSecondary}
					style="view-transition-name: project-title-{project.id}; view-transition-class: project-title"
				>
					{project.name}
				</h4>
				<ProjectStateChip state={project.state_key} size="xs" />
				{#if project.is_shared}
					<span
						class="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold bg-accent/15 text-accent border border-accent/20"
					>
						<Share2 class="h-2.5 w-2.5" aria-hidden="true" />
						<span class="hidden sm:inline">
							Shared{accessRoleLabel ? `: ${accessRoleLabel}` : ''}
						</span>
						<span class="sm:hidden">Shared</span>
					</span>
				{/if}
			</div>
		</div>
		<div class="shrink-0 flex items-center gap-1.5">
			<time
				datetime={project.updated_at}
				class="text-[10px] sm:text-xs font-medium text-muted-foreground whitespace-nowrap text-right"
			>
				{formatUpdatedAt(project.updated_at)}
			</time>
			<span class="project-dossier-arrow" aria-hidden="true">
				<ArrowRight
					class="h-3 w-3 sm:h-3.5 sm:w-3.5 {isSecondary
						? 'text-muted-foreground'
						: 'text-accent'}"
				/>
			</span>
		</div>
	</div>

	<p class="mt-1 text-xs sm:text-sm text-muted-foreground truncate">
		{project.description?.trim() || 'No description provided.'}
	</p>

	{#if project.next_step_short && !isSecondary}
		<p
			class="mt-1.5 text-[11px] sm:text-xs font-medium text-accent/90 truncate"
			title={project.next_step_long ?? project.next_step_short}
		>
			Next: {project.next_step_short}
		</p>
	{/if}

	<p
		class="mt-1 text-[11px] sm:text-xs font-medium whitespace-nowrap overflow-hidden text-ellipsis {isSecondary
			? 'text-muted-foreground/80'
			: 'text-muted-foreground/90'}"
	>
		{entityCounts}
	</p>
</a>

<style>
	.project-dossier-row {
		transition: box-shadow 180ms ease;
	}

	.project-dossier-row:hover,
	.project-dossier-row:focus-visible {
		box-shadow: inset 0 -1px 0 hsl(var(--accent) / 0.6);
	}

	.project-dossier-row--secondary {
		opacity: 0.88;
	}

	.project-dossier-row--secondary:hover,
	.project-dossier-row--secondary:focus-visible {
		opacity: 1;
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
</style>
