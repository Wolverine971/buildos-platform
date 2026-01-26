<!-- apps/web/src/lib/components/ontology/OntologyProjectHeader.svelte -->
<script lang="ts">
	import Button from '$lib/components/ui/Button.svelte';
	import { getProjectStateBadgeClass } from '$lib/utils/ontology-badge-styles';
	import type { Document, Project, Template } from '$lib/types/onto';
	import { FileText, Edit2, Info, Trash2 } from 'lucide-svelte';

	type ProjectStats = {
		tasks: number;
		goals: number;
		plans: number;
		documents: number;
	};

	interface Props {
		project: Project;
		template?: Template | null;
		stats: ProjectStats;
		contextDocument?: Document | null;
		onEdit?: () => void;
		onDelete?: () => void;
	}

	let {
		project,
		template = null,
		stats,
		contextDocument = null,
		onEdit,
		onDelete
	}: Props = $props();

	const facetChips = $derived(
		[
			{ label: 'Context', value: project.facet_context },
			{ label: 'Scale', value: project.facet_scale },
			{ label: 'Stage', value: project.facet_stage }
		].filter((chip) => Boolean(chip.value))
	);

	const statBlocks = $derived([
		{ label: 'Goals', value: stats.goals },
		{ label: 'Plans', value: stats.plans },
		{ label: 'Tasks', value: stats.tasks },
		{ label: 'Docs', value: stats.documents }
	]);

	const contextDocTitle = $derived(
		contextDocument ? contextDocument.title : 'No context document attached'
	);

	function formatLabel(value: string): string {
		return value
			.split('_')
			.map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
			.join(' ');
	}

	function handleEdit() {
		onEdit?.();
	}

	function handleDelete() {
		onDelete?.();
	}
</script>

<div class="flex flex-col gap-6">
	<div class="flex flex-col gap-4">
		<div class="flex flex-col gap-3">
			<div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
				<div class="space-y-2 flex-1 min-w-0">
					<h1
						class="text-2xl sm:text-3xl lg:text-4xl font-bold text-foreground leading-tight"
					>
						{project.name}
					</h1>
					<div class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
						<span
							class="px-3 py-1 rounded-full text-xs font-semibold capitalize {getProjectStateBadgeClass(
								project.state_key
							)}"
						>
							{project.state_key}
						</span>
					</div>
				</div>
				<div class="flex flex-wrap items-center gap-2 sm:flex-shrink-0">
					<Button
						variant="secondary"
						size="sm"
						onclick={handleEdit}
						aria-label="Edit project"
						class="touch-manipulation transition-all hover:shadow-sm"
					>
						<Edit2 class="w-4 h-4" aria-hidden="true" />
						<span class="hidden sm:inline">Edit Project</span>
						<span class="sm:hidden">Edit</span>
					</Button>
					{#if onDelete}
						<Button
							variant="danger"
							size="sm"
							onclick={handleDelete}
							aria-label="Delete project"
							class="touch-manipulation !px-2.5 transition-all hover:shadow-sm"
						>
							<Trash2 class="w-4 h-4" aria-hidden="true" />
						</Button>
					{/if}
				</div>
			</div>
			{#if project.description}
				<p class="text-sm sm:text-base text-foreground leading-relaxed">
					{project.description}
				</p>
			{/if}
		</div>

		{#if facetChips.length > 0}
			<div class="flex flex-wrap gap-2">
				{#each facetChips as chip}
					<span
						class="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-muted text-foreground border border-border shadow-ink"
					>
						<span class="font-semibold">{chip.label}:</span>
						<span class="ml-1.5">{formatLabel(chip.value as string)}</span>
					</span>
				{/each}
			</div>
		{/if}
	</div>

	<div class="grid gap-4 grid-cols-1 sm:grid-cols-2">
		<div
			class="p-4 rounded bg-surface-elevated border-2 border-gray-300 dark:border-gray-600/50 shadow-subtle hover:shadow-elevated transition-all duration-200"
		>
			<div class="flex items-start gap-3">
				<div class="flex-shrink-0 rounded-full p-2 bg-surface-panel shadow-sm">
					<FileText class="w-5 h-5 text-accent-blue" aria-hidden="true" />
				</div>
				<div class="flex-1 min-w-0">
					<p
						class="text-xs uppercase font-semibold text-accent-blue tracking-wide mb-1 flex items-center gap-1.5"
					>
						<span class="w-1.5 h-1.5 bg-accent-blue rounded-full"></span>
						Context Document
					</p>
					<p class="text-sm font-semibold text-foreground truncate mb-1">
						{contextDocTitle}
					</p>
					{#if !contextDocument}
						<p class="text-xs text-muted-foreground mt-1 leading-relaxed">
							Create a document with type <code
								class="px-1 py-0.5 bg-surface-panel rounded text-xs font-medium"
								>document.context.project</code
							> to link it here.
						</p>
					{/if}
				</div>
			</div>
		</div>
		<div
			class="p-3 sm:p-4 rounded border-2 border-gray-300 dark:border-gray-600/50 bg-surface-elevated shadow-subtle hover:shadow-elevated transition-all duration-200"
		>
			<p
				class="text-xs uppercase font-semibold text-muted-foreground tracking-wide mb-2.5 sm:mb-3 flex items-center gap-1.5"
			>
				<span class="w-1.5 h-1.5 bg-accent rounded-full"></span>
				Project Entities
			</p>
			<div class="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-2.5 text-center">
				{#each statBlocks as stat}
					<div
						class="rounded bg-surface-panel py-2 px-1.5 sm:px-2 border border-gray-200 dark:border-gray-600/30 hover:border-accent-orange transition-colors"
					>
						<p class="text-lg sm:text-xl font-bold text-foreground">
							{stat.value}
						</p>
						<p
							class="text-xs uppercase tracking-wide text-muted-foreground font-semibold"
						>
							{stat.label}
						</p>
					</div>
				{/each}
			</div>
		</div>
	</div>
</div>
