<!-- apps/web/src/lib/components/knowledge/KnowledgeWhereProjectModal.svelte -->
<!--
	"Kyle Smith in Cadre": every task and doc in one project that names the entry, each with the
	sentence that named it. A row opens that task or doc in place; the footer filters the whole
	knowledge page to everything in the project, or opens the project.
-->
<script lang="ts">
	import Modal from '$lib/components/ui/Modal.svelte';
	import {
		ArrowUpRight,
		CheckSquare,
		FileText,
		Folder,
		ListFilter,
		Square
	} from '$lib/icons/lucide';
	import type {
		KnowledgeWhere,
		KnowledgeWhereProject,
		KnowledgeWhereRecord
	} from './where-types';

	interface Props {
		entityName: string;
		project: KnowledgeWhereProject;
		where: KnowledgeWhere;
		onClose: () => void;
		onOpenRecord: (record: KnowledgeWhereRecord) => void;
		onFilterProject: (project: { id: string; name: string }) => void;
	}

	let { entityName, project, where, onClose, onOpenRecord, onFilterProject }: Props = $props();

	const tasks = $derived(where.tasks.filter((r) => r.project_id === project.id));
	const documents = $derived(where.documents.filter((r) => r.project_id === project.id));
</script>

{#snippet row(record: KnowledgeWhereRecord)}
	<li>
		<button
			type="button"
			class="flex w-full min-w-0 items-start gap-2.5 rounded-md px-2.5 py-2 text-left pressable hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			onclick={() => onOpenRecord(record)}
		>
			<span class="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true">
				{#if record.kind === 'document'}
					<FileText class="h-4 w-4" />
				{:else if record.done}
					<CheckSquare class="h-4 w-4" />
				{:else}
					<Square class="h-4 w-4" />
				{/if}
			</span>
			<span class="min-w-0 flex-1">
				<span
					class="block truncate text-sm font-medium {record.done
						? 'text-muted-foreground line-through'
						: 'text-foreground'}">{record.title}</span
				>
				{#if record.quote}
					<span class="mt-0.5 line-clamp-2 block text-xs text-muted-foreground"
						>“{record.quote}”</span
					>
				{/if}
			</span>
		</button>
	</li>
{/snippet}

<Modal isOpen={true} {onClose} size="md" title="{entityName} in {project.name}">
	<div class="flex flex-col gap-4 p-4 sm:p-5">
		{#if project.quote}
			<div class="flex items-start gap-2.5 rounded-md bg-muted/60 px-2.5 py-2">
				<Folder class="mt-0.5 h-4 w-4 shrink-0 text-accent" aria-hidden="true" />
				<p class="text-xs text-muted-foreground">
					On the project itself: “{project.quote}”
				</p>
			</div>
		{/if}
		{#if tasks.length}
			<section>
				<h3
					class="mb-1 px-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground"
				>
					Tasks <span class="stamp">{tasks.length}</span>
				</h3>
				<ul class="flex flex-col">
					{#each tasks as record (record.id)}{@render row(record)}{/each}
				</ul>
			</section>
		{/if}
		{#if documents.length}
			<section>
				<h3
					class="mb-1 px-2.5 text-xs font-medium uppercase tracking-wide text-muted-foreground"
				>
					Docs <span class="stamp">{documents.length}</span>
				</h3>
				<ul class="flex flex-col">
					{#each documents as record (record.id)}{@render row(record)}{/each}
				</ul>
			</section>
		{/if}
		{#if !tasks.length && !documents.length && !project.quote}
			<p class="px-2.5 text-sm text-muted-foreground">
				Linked to the project as a whole, not to a task or doc in it.
			</p>
		{/if}
		<div class="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
			<button
				type="button"
				class="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-foreground pressable hover:bg-muted"
				onclick={() => onFilterProject({ id: project.id, name: project.name })}
			>
				<ListFilter class="h-4 w-4" aria-hidden="true" /> Everything in {project.name}
			</button>
			<a
				href="/projects/{project.id}"
				class="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-accent px-3 text-sm font-medium text-accent-foreground pressable"
			>
				Open project <ArrowUpRight class="h-4 w-4" aria-hidden="true" />
			</a>
		</div>
	</div>
</Modal>
