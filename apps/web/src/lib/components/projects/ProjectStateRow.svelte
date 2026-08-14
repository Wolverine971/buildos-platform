<!-- apps/web/src/lib/components/projects/ProjectStateRow.svelte -->
<script lang="ts">
	import { AlignLeft, ListTodo, Users } from '$lib/icons/lucide';
	import { resolve } from '$app/paths';
	import ProjectIcon from '$lib/components/project/ProjectIcon.svelte';
	import ProjectStateChip from './ProjectStateChip.svelte';
	import { formatAccessRole } from '$lib/config/project-states';
	import {
		formatProjectUpdatedLabel,
		formatProjectUpdatedTitle,
		type ProjectListSummary
	} from './project-list';

	interface Props {
		project: ProjectListSummary;
		onSelect?: (project: ProjectListSummary) => void;
	}

	const { project, onSelect }: Props = $props();

	const accessRoleLabel = $derived(formatAccessRole(project.access_role));
	const collaboratorTitle = $derived(
		project.is_shared && accessRoleLabel
			? `Has collaborators · Your role: ${accessRoleLabel}`
			: 'Has collaborators'
	);
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
			<div class="flex min-w-0 items-start justify-between gap-2 sm:gap-3">
				<div class="flex min-w-0 items-center gap-2">
					<h4
						class="min-w-0 truncate text-base font-semibold tracking-tight text-foreground sm:text-lg"
						style="view-transition-name: project-title-{project.id}; view-transition-class: project-title"
						title={project.name}
					>
						{project.name}
					</h4>
					<ProjectStateChip state={project.state_key} size="xs" tone="neutral" />
				</div>
				<div class="flex shrink-0 flex-col items-end gap-0.5 text-right">
					<time
						datetime={project.updated_at}
						title={updatedTitle}
						class="whitespace-nowrap text-2xs text-muted-foreground sm:text-xs"
					>
						{updatedLabel}
					</time>
					{#if project.has_collaborators}
						<span
							title={collaboratorTitle}
							class="inline-flex items-center gap-1 whitespace-nowrap text-2xs text-muted-foreground"
						>
							<Users class="h-2.5 w-2.5 shrink-0" aria-hidden="true" />
							Has collaborators
						</span>
					{/if}
				</div>
			</div>

			<p
				class="mt-1 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground sm:text-sm"
				title={hasNextStep ? (project.next_step_long ?? resumeCue) : resumeCue}
			>
				{#if hasNextStep}
					<ListTodo class="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
					<span class="sr-only">Next step: </span>
				{:else}
					<AlignLeft class="h-3.5 w-3.5 shrink-0 opacity-60" aria-hidden="true" />
				{/if}
				<span class="truncate">{resumeCue}</span>
			</p>
		</div>
	</div>
</a>

<style>
	.project-dossier-row {
		transition: box-shadow 180ms ease;
	}

	.project-dossier-row:hover,
	.project-dossier-row:focus-visible {
		box-shadow: inset 0 -1px 0 hsl(var(--border));
	}

	@media (prefers-reduced-motion: reduce) {
		.project-dossier-row {
			transition: none;
		}
	}
</style>
