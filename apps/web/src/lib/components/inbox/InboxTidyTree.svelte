<!-- apps/web/src/lib/components/inbox/InboxTidyTree.svelte -->
<!--
	Tidy-ups preview (tasker 149): what the picked (or all) tidy-ups do to the project's document
	tree. "Now" marks what moves where and what gets archived; "After" shows the result. The tree
	loads once, when the block scrolls into view or the first time a view is picked. If it can't
	load, the toggle hides and the list below still works.
-->
<script lang="ts">
	import type { ProjectCleanupItem } from '@buildos/shared-types';
	import { FileText, Folder } from '$lib/icons/lucide';
	import {
		buildDocTreePreview,
		collectTreeOperations,
		countTreeOperations,
		readDocTreeSnapshot,
		treeDocumentIds,
		treeOperationsLine,
		type DocTreeSnapshot,
		type TreePreviewMark,
		type TreePreviewNode
	} from './doc-tree-preview';

	let {
		projectId,
		items = [],
		callItems = [],
		scopeLabel = ''
	}: {
		projectId: string;
		/** The tidy-ups being previewed. */
		items?: ProjectCleanupItem[];
		/** Other open items that touch the tree; their documents are marked "your call". */
		callItems?: ProjectCleanupItem[];
		/** e.g. "all 10" or "the 3 you picked". */
		scopeLabel?: string;
	} = $props();

	const uid = $props.id();

	let status = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
	let snapshot = $state.raw<DocTreeSnapshot | null>(null);
	let mode = $state<'now' | 'after'>('now');
	let root = $state<HTMLElement>();

	const operations = $derived(collectTreeOperations(items));
	const counts = $derived(countTreeOperations(operations));
	const summary = $derived(treeOperationsLine(counts));
	const touchesTree = $derived(operations.some((op) => op.kind !== 'archive_task'));
	const archivedTasks = $derived(
		operations.flatMap((op) =>
			op.kind === 'archive_task' ? [op.title ?? 'Untitled task'] : []
		)
	);
	const callIds = $derived.by(() => {
		const mine = treeDocumentIds(operations);
		return [...treeDocumentIds(collectTreeOperations(callItems))].filter((id) => !mine.has(id));
	});
	const preview = $derived(
		snapshot && touchesTree
			? buildDocTreePreview(snapshot, operations, { callDocumentIds: callIds })
			: null
	);
	const legend = $derived.by(() => {
		if (!preview) return [];
		const wanted: TreePreviewMark[] =
			mode === 'now' ? ['moving', 'archiving', 'call'] : ['moved', 'call'];
		return wanted.filter((mark) => preview.marks.has(mark));
	});

	const MODES = [
		{ value: 'now', label: 'Now' },
		{ value: 'after', label: 'After' }
	] as const;

	const MARK_ROW: Record<TreePreviewMark, string> = {
		moving: 'bg-success/10',
		moved: 'bg-success/15 font-semibold',
		archiving: 'text-muted-foreground',
		call: 'bg-info/10'
	};
	const MARK_NOTE: Record<TreePreviewMark, string> = {
		moving: 'text-success',
		moved: 'text-success',
		archiving: 'text-muted-foreground',
		call: 'text-info'
	};
	const LEGEND: Record<TreePreviewMark, { label: string; swatch: string }> = {
		moving: { label: 'moves', swatch: 'border-success bg-success/15' },
		moved: { label: 'moved', swatch: 'border-success bg-success/15' },
		archiving: { label: 'archived', swatch: 'border-destructive bg-muted' },
		call: { label: 'needs your call', swatch: 'border-info bg-info/15' }
	};

	async function load() {
		if (status === 'loading' || status === 'ready') return;
		status = 'loading';
		try {
			const res = await fetch(
				`/api/onto/projects/${encodeURIComponent(projectId)}/doc-tree?include_content=false`
			);
			const json = await res.json().catch(() => null);
			const next = res.ok ? readDocTreeSnapshot(json?.data) : null;
			if (!next) throw new Error('Could not load the document tree');
			snapshot = next;
			status = 'ready';
		} catch {
			status = 'error';
		}
	}

	function show(next: 'now' | 'after') {
		mode = next;
		void load();
	}

	// Load once the block is on screen; without IntersectionObserver, on the first toggle.
	$effect(() => {
		if (!root || status !== 'idle' || !touchesTree) return;
		if (typeof IntersectionObserver === 'undefined') return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries.some((entry) => entry.isIntersecting)) {
					observer.disconnect();
					void load();
				}
			},
			{ rootMargin: '200px' }
		);
		observer.observe(root);
		return () => observer.disconnect();
	});
</script>

{#snippet branch(nodes: TreePreviewNode[], hidden: number)}
	{#each nodes as node (node.id)}
		<li class="py-0.5">
			<span
				class="inline-flex max-w-full items-start gap-1.5 rounded px-1.5 py-0.5 {node.mark
					? MARK_ROW[node.mark]
					: ''}"
			>
				{#if node.isFolder}
					<Folder
						class="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
						aria-hidden="true"
					/>
				{:else}
					<FileText
						class="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground"
						aria-hidden="true"
					/>
				{/if}
				<span class="min-w-0 break-words">
					<span
						class={node.mark === 'archiving'
							? 'line-through decoration-destructive decoration-1'
							: 'text-foreground'}>{node.title}</span
					>
					{#if node.note}
						<span class="ml-1 font-mono text-[10.5px] {MARK_NOTE[node.mark ?? 'call']}"
							>{node.note}</span
						>
					{/if}
					{#if node.collapsedCount}
						<span class="ml-1 text-muted-foreground"
							>· {node.collapsedCount} inside</span
						>
					{/if}
				</span>
			</span>
			{#if node.children.length || node.hiddenCount}
				<ul class="ml-2 border-l border-dashed border-border pl-3">
					{@render branch(node.children, node.hiddenCount)}
				</ul>
			{/if}
		</li>
	{/each}
	{#if hidden}
		<li class="py-0.5 pl-1.5 text-muted-foreground">+ {hidden} more</li>
	{/if}
{/snippet}

{#if operations.length}
	<div bind:this={root} class="min-w-0 rounded-md border border-border bg-card p-2.5">
		<div class="flex flex-wrap items-start justify-between gap-2">
			<div class="min-w-0">
				{#if summary}
					<p class="text-sm font-semibold text-foreground">{summary}</p>
				{/if}
				<p class="mt-0.5 text-2xs text-muted-foreground">
					{#if preview}
						{preview.topLevelBefore === preview.topLevelAfter
							? `Top level stays at ${preview.topLevelBefore}.`
							: `Top level: ${preview.topLevelBefore} → ${preview.topLevelAfter}.`}
					{/if}
					{scopeLabel ? `Previewing ${scopeLabel}.` : ''}
					Archived items can be restored.
				</p>
			</div>
			{#if touchesTree && status !== 'error'}
				<div
					role="group"
					aria-label="Document tree preview"
					class="inline-flex shrink-0 rounded-md border border-border-strong bg-background p-0.5"
				>
					{#each MODES as { value, label } (value)}
						<button
							type="button"
							aria-pressed={status === 'ready' && mode === value}
							aria-controls={`${uid}-tree`}
							onclick={() => show(value)}
							class="min-h-11 min-w-14 rounded px-3 text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-ring {status ===
								'ready' && mode === value
								? 'bg-foreground text-background'
								: 'text-muted-foreground hover:text-foreground'}"
						>
							{label}
						</button>
					{/each}
				</div>
			{/if}
		</div>

		{#if status === 'loading'}
			<p role="status" class="mt-2 text-2xs text-muted-foreground">
				Loading the document tree…
			</p>
		{/if}

		{#if preview}
			{#if legend.length}
				<ul
					class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-2xs text-muted-foreground"
					aria-label="Legend"
				>
					{#each legend as mark (mark)}
						<li class="inline-flex items-center gap-1.5">
							<span
								class="inline-block h-2.5 w-2.5 rounded-sm border {LEGEND[mark]
									.swatch}"
								aria-hidden="true"
							></span>
							{LEGEND[mark].label}
						</li>
					{/each}
				</ul>
			{/if}
			<div
				id={`${uid}-tree`}
				class="mt-2 max-h-[28rem] overflow-auto rounded-md border border-border bg-background"
			>
				<ul
					class="min-w-[16rem] p-2 text-xs"
					aria-label={mode === 'now' ? 'Documents now' : 'Documents after the tidy-ups'}
				>
					{@render branch(mode === 'now' ? preview.now : preview.after, 0)}
				</ul>
			</div>
			{#if mode === 'after' && preview.archivedDocuments.length}
				<div class="mt-2">
					<p class="micro-label text-muted-foreground">
						Archived ({preview.archivedDocuments.length})
					</p>
					<ul class="mt-1 space-y-0.5 text-xs" aria-label="Archived documents">
						{#each preview.archivedDocuments as doc (doc.id)}
							<li class="break-words text-muted-foreground">
								<span class="line-through decoration-destructive decoration-1"
									>{doc.title}</span
								>
								{#if doc.insideCount}
									<span>· with {doc.insideCount} inside</span>
								{/if}
							</li>
						{/each}
					</ul>
				</div>
			{/if}
		{/if}

		{#if archivedTasks.length}
			<p class="mt-2 break-words text-2xs text-muted-foreground">
				Also archives {archivedTasks.length === 1
					? 'a task'
					: `${archivedTasks.length} tasks`}: {archivedTasks.join(' · ')}
			</p>
		{/if}
	</div>
{/if}
