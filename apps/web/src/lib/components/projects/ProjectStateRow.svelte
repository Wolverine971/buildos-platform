<!-- apps/web/src/lib/components/projects/ProjectStateRow.svelte -->
<script lang="ts">
	import { AlignLeft, ListTodo, Users } from '$lib/icons/lucide';
	import { resolve } from '$app/paths';
	import {
		formatAccessRole,
		normalizeProjectState,
		PROJECT_STATE_META
	} from '$lib/config/project-states';
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
	const stateLabel = $derived(PROJECT_STATE_META[normalizeProjectState(project.state_key)].label);
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
	const compactUpdatedLabel = $derived(updatedLabel.replace(/^Updated /, ''));
	const updatedTitle = $derived(formatProjectUpdatedTitle(project.updated_at));

	function handleClick() {
		onSelect?.(project);
	}
</script>

<a
	href={resolve('/projects/[id]', { id: project.id })}
	onclick={handleClick}
	class="project-dossier-row grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 rounded-lg border border-border/70 bg-card px-3 py-2 pressable hover:border-border-strong hover:bg-muted/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
>
	<h3
		class="min-w-0 truncate text-sm font-semibold text-foreground"
		style="view-transition-name: project-title-{project.id}; view-transition-class: project-title"
		title={project.name}
	>
		{project.name}
	</h3>
	<time
		datetime={project.updated_at}
		title={updatedTitle}
		aria-label={updatedLabel}
		class="justify-self-end whitespace-nowrap text-xs tabular-nums text-muted-foreground"
	>
		{compactUpdatedLabel}
	</time>
	<div
		class="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground {project.has_collaborators
			? ''
			: 'col-span-2'}"
	>
		<span class="shrink-0" aria-label="Project state: {stateLabel}">{stateLabel}</span>
		<span aria-hidden="true" class="text-muted-foreground/50">·</span>
		<p
			class="flex min-w-0 items-center gap-1"
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
	{#if project.has_collaborators}
		<span
			title={collaboratorTitle}
			aria-label={collaboratorTitle}
			class="inline-flex items-center justify-self-end gap-1 whitespace-nowrap text-2xs text-muted-foreground"
		>
			<Users class="h-3 w-3 shrink-0" aria-hidden="true" />
			Collaborators
		</span>
	{/if}
</a>
