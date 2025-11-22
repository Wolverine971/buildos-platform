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
		outputs: number;
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
		{ label: 'Outputs', value: stats.outputs },
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

<div class="flex flex-col gap-5 sm:gap-6">
	<div class="flex flex-col gap-3 sm:gap-4">
		<div class="flex flex-col gap-2.5 sm:gap-3">
			<div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
				<div class="space-y-1.5 sm:space-y-2 flex-1 min-w-0">
					<h1
						class="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white leading-tight"
					>
						{project.name}
					</h1>
					<div
						class="flex flex-wrap items-center gap-2 text-sm text-gray-500 dark:text-gray-400"
					>
						<span class="font-mono text-xs sm:text-sm">{project.type_key}</span>
						<span
							class="px-3 py-1 rounded-full text-xs font-semibold capitalize {getProjectStateBadgeClass(
								project.state_key
							)}"
						>
							{project.state_key}
						</span>
						{#if template}
							<span
								class="inline-flex items-center gap-1 text-xs font-medium text-gray-600 dark:text-gray-300"
							>
								<Info class="w-3.5 h-3.5" aria-hidden="true" />
								<span class="hidden sm:inline">Template:</span>
								{template.name}
							</span>
						{/if}
					</div>
				</div>
				<div class="flex flex-wrap items-center gap-2.5 sm:flex-shrink-0">
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
				<p class="text-sm sm:text-base text-gray-600 dark:text-gray-300 leading-relaxed">
					{project.description}
				</p>
			{/if}
		</div>

		{#if facetChips.length > 0}
			<div class="flex flex-wrap gap-2 sm:gap-2.5">
				{#each facetChips as chip}
					<span
						class="inline-flex items-center px-3 py-1.5 rounded-full text-xs font-medium bg-gradient-to-r from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-800/80 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 shadow-sm dither-subtle"
					>
						<span class="font-semibold">{chip.label}:</span>
						<span class="ml-1.5">{formatLabel(chip.value as string)}</span>
					</span>
				{/each}
			</div>
		{/if}
	</div>

	<div class="grid gap-3 sm:gap-4 grid-cols-1 sm:grid-cols-2">
		<div
			class="p-3 sm:p-4 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-900/30 shadow-sm hover:shadow-md transition-all duration-200 dither-soft"
		>
			<div class="flex items-start gap-2.5 sm:gap-3">
				<div class="flex-shrink-0 rounded-full p-2 bg-white dark:bg-white/10 shadow-sm">
					<FileText class="w-5 h-5 text-blue-600 dark:text-blue-300" aria-hidden="true" />
				</div>
				<div class="flex-1 min-w-0">
					<p
						class="text-xs uppercase font-semibold text-blue-800 dark:text-blue-200 tracking-wide mb-1 flex items-center gap-1.5"
					>
						<span class="w-1.5 h-1.5 bg-blue-500 rounded-full"></span>
						Context Document
					</p>
					<p class="text-sm font-semibold text-gray-900 dark:text-white truncate mb-1">
						{contextDocTitle}
					</p>
					{#if !contextDocument}
						<p class="text-xs text-gray-600 dark:text-gray-400 mt-1 leading-relaxed">
							Create a document with type <code
								class="px-1 py-0.5 bg-white dark:bg-gray-800 rounded text-xs"
								>document.project.context</code
							> to link it here.
						</p>
					{/if}
				</div>
			</div>
		</div>
		<div
			class="p-3 sm:p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm hover:shadow-md transition-all duration-200"
		>
			<p
				class="text-xs uppercase font-semibold text-gray-500 dark:text-gray-400 tracking-wide mb-2.5 sm:mb-3 flex items-center gap-1.5"
			>
				<span class="w-1.5 h-1.5 bg-gray-500 rounded-full"></span>
				Project Entities
			</p>
			<div class="grid grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-2.5 text-center">
				{#each statBlocks as stat}
					<div
						class="rounded-lg bg-gradient-to-br from-gray-50 to-gray-100 dark:from-gray-800/50 dark:to-gray-800/30 py-2 px-1.5 sm:px-2 border border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700 transition-colors dither-subtle dither-fade-hover"
					>
						<p class="text-lg sm:text-xl font-bold text-gray-900 dark:text-white">
							{stat.value}
						</p>
						<p
							class="text-xs uppercase tracking-wide text-gray-600 dark:text-gray-400 font-semibold"
						>
							{stat.label}
						</p>
					</div>
				{/each}
			</div>
		</div>
	</div>
</div>
