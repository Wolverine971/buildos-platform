<!-- apps/web/src/lib/components/organize/OrganizePane.svelte -->
<script lang="ts">
	import OrganizeTreeRow from './OrganizeTreeRow.svelte';
	import {
		flattenDocumentTree,
		pinnedDocumentReason,
		type OrganizeProject,
		type OrganizeRef
	} from './organize-plan';
	let {
		project,
		selected,
		pendingIds,
		targetParentId,
		isTarget = false,
		onselect,
		onmove,
		onkeydown,
		onpointerdown
	}: {
		project: OrganizeProject;
		selected: OrganizeRef | null;
		pendingIds: Set<string>;
		targetParentId: string | null;
		isTarget?: boolean;
		onselect: (ref: OrganizeRef) => void;
		onmove: (ref: OrganizeRef) => void;
		onkeydown: (event: KeyboardEvent, ref: OrganizeRef) => void;
		onpointerdown: (event: PointerEvent, ref: OrganizeRef) => void;
	} = $props();
	const rows = $derived(flattenDocumentTree(project));
	const documents = $derived(new Map(project.documents.map((doc) => [doc.id, doc])));
</script>

<section
	class="min-w-0 overflow-hidden rounded-xl border border-border bg-card shadow-ink"
	aria-label={project.name}
>
	<header class="border-b border-border bg-muted/30 p-4">
		<h2 class="truncate font-semibold text-foreground">{project.name}</h2>
		<p class="mt-1 text-xs text-muted-foreground">
			{project.documents.length} docs · {project.tasks.length} tasks{!project.can_write
				? ' · Read only'
				: ''}
		</p>
	</header>
	<div class="max-h-[65vh] min-h-64 overflow-y-auto p-2" data-organize-pane={project.id}>
		<div
			class="mb-2 rounded-md border border-dashed px-3 py-3 text-xs text-muted-foreground {isTarget &&
			targetParentId === null
				? 'bg-accent/10'
				: ''}"
			class:border-accent={isTarget && targetParentId === null}
			class:border-border={!isTarget || targetParentId !== null}
			data-organize-drop
			data-project-id={project.id}
		>
			Project root · Drop here
		</div>
		<h3 class="px-2 py-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
			Documents
		</h3>
		<ul class="space-y-0.5" aria-label={`${project.name} documents`}>
			{#each rows as row (row.node.id)}
				{@const ref = {
					kind: 'document' as const,
					id: row.node.id,
					project_id: project.id
				}}
				<OrganizeTreeRow
					{ref}
					title={documents.get(row.node.id)?.title ?? 'Untitled document'}
					depth={row.depth}
					pinned={!project.can_write
						? 'Read only'
						: pinnedDocumentReason(project, row.node.id)}
					pending={pendingIds.has(row.node.id)}
					selected={selected?.id === row.node.id}
					highlighted={isTarget && targetParentId === row.node.id}
					onselect={() => onselect(ref)}
					onmove={() => onmove(ref)}
					onkeydown={(event) => onkeydown(event, ref)}
					onpointerdown={(event) => onpointerdown(event, ref)}
				/>
				{#if row.node.id === project.shared_folder_document_id}
					<li class="px-9 pb-1 text-2xs text-muted-foreground">
						Shared with {project.shared_with_count ?? '…'} sub-projects
					</li>
				{/if}
			{/each}
		</ul>
		{#if rows.length === 0}<p class="px-3 py-4 text-sm text-muted-foreground">
				No documents yet.
			</p>{/if}
		<h3
			class="mt-4 border-t border-border px-2 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
		>
			Tasks
		</h3>
		<ul class="space-y-0.5" aria-label={`${project.name} tasks`}>
			{#each project.tasks as task (task.id)}
				{@const ref = { kind: 'task' as const, id: task.id, project_id: project.id }}
				<OrganizeTreeRow
					{ref}
					title={task.title}
					pinned={project.can_write ? null : 'Read only'}
					pending={pendingIds.has(task.id)}
					selected={selected?.id === task.id}
					onselect={() => onselect(ref)}
					onmove={() => onmove(ref)}
					onkeydown={(event) => onkeydown(event, ref)}
					onpointerdown={(event) => onpointerdown(event, ref)}
				/>
			{/each}
		</ul>
		{#if project.tasks.length === 0}<p class="px-3 py-4 text-sm text-muted-foreground">
				No tasks yet.
			</p>{/if}
	</div>
</section>
