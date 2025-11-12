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
		onOpenContextDoc?: () => void;
		onDelete?: () => void;
	}

	let {
		project,
		template = null,
		stats,
		contextDocument = null,
		onEdit,
		onOpenContextDoc,
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

	function handleContextDoc() {
		if (!contextDocument) return;
		onOpenContextDoc?.();
	}

	function handleDelete() {
		onDelete?.();
	}
</script>

<div class="flex flex-col gap-6">
	<div class="flex flex-col gap-4">
		<div class="flex flex-col gap-3">
			<div class="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
				<div class="space-y-2">
					<p class="text-xs font-semibold tracking-wide uppercase text-gray-500">
						Ontology Project
					</p>
					<h1 class="text-3xl font-bold text-gray-900 dark:text-white leading-tight">
						{project.name}
					</h1>
					<div
						class="flex flex-wrap items-center gap-2 text-sm text-gray-500 dark:text-gray-400"
					>
						<span class="font-mono">{project.type_key}</span>
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
								Template: {template.name}
							</span>
						{/if}
					</div>
				</div>
				<div class="flex flex-wrap items-center gap-2">
					<Button
						variant="secondary"
						size="sm"
						onclick={handleEdit}
						aria-label="Edit project"
					>
						<Edit2 class="w-4 h-4" aria-hidden="true" />
						<span>Edit Project</span>
					</Button>
					{#if contextDocument}
						<Button
							variant="ghost"
							size="sm"
							onclick={handleContextDoc}
							aria-label="Open context document"
						>
							<FileText class="w-4 h-4" aria-hidden="true" />
							<span>Context Doc</span>
						</Button>
					{:else}
						<div
							class="px-3 py-2 rounded-md text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
						>
							No context document
						</div>
					{/if}
					{#if onDelete}
						<Button
							variant="danger"
							size="sm"
							onclick={handleDelete}
							aria-label="Delete project"
						>
							<Trash2 class="w-4 h-4" aria-hidden="true" />
							<span>Delete</span>
						</Button>
					{/if}
				</div>
			</div>
			{#if project.description}
				<p class="text-gray-600 dark:text-gray-300 leading-relaxed">
					{project.description}
				</p>
			{/if}
		</div>

		{#if facetChips.length > 0}
			<div class="flex flex-wrap gap-2">
				{#each facetChips as chip}
					<span
						class="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300"
					>
						{chip.label}: {formatLabel(chip.value as string)}
					</span>
				{/each}
			</div>
		{/if}
	</div>

	<div class="grid gap-4 md:grid-cols-2">
		<div
			class="p-4 rounded-xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-100 dark:border-blue-900/30"
		>
			<div class="flex items-start gap-3">
				<div class="flex-shrink-0 rounded-full p-2 bg-white dark:bg-white/10">
					<FileText class="w-5 h-5 text-blue-600 dark:text-blue-300" aria-hidden="true" />
				</div>
				<div class="flex-1 min-w-0">
					<p
						class="text-xs uppercase font-semibold text-blue-800 dark:text-blue-200 tracking-wide"
					>
						Context Document
					</p>
					<p class="text-sm font-medium text-gray-900 dark:text-white truncate">
						{contextDocTitle}
					</p>
					{#if !contextDocument}
						<p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
							Create a document with type <code>document.project.context</code> to link
							it here.
						</p>
					{/if}
				</div>
			</div>
		</div>
		<div
			class="p-4 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 shadow-sm"
		>
			<p class="text-xs uppercase font-semibold text-gray-500 tracking-wide mb-3">
				Project Entities
			</p>
			<div class="grid grid-cols-3 gap-3 text-center">
				{#each statBlocks as stat}
					<div class="rounded-lg bg-gray-50 dark:bg-gray-800/50 py-2 px-2">
						<p class="text-lg font-semibold text-gray-900 dark:text-white">
							{stat.value}
						</p>
						<p class="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400">
							{stat.label}
						</p>
					</div>
				{/each}
			</div>
		</div>
	</div>
</div>
