<!-- apps/web/src/lib/components/projects/desktop/DesktopProjectCard.svelte -->
<!--
	An opened project: it takes the desktop while the rest dock. Tabs show what
	it holds (sub-projects, docs, tasks, goals). Sub-projects, docs and undated
	tasks drag out to the dock; every row also has a Move button for the same
	thing without a drag. The card itself is a drop target, so a project dragged
	in from the dock goes inside.
-->
<script lang="ts" module>
	export type CardTab = 'inside' | 'docs' | 'tasks' | 'goals';
</script>

<script lang="ts">
	import {
		ArrowUpRight,
		ChevronRight,
		Circle,
		CircleCheck,
		CircleDot,
		CircleSlash,
		FileText,
		FolderOpen,
		GripVertical,
		Lock,
		Minimize2,
		RefreshCw,
		Target
	} from '$lib/icons/lucide';
	import { resolve } from '$app/paths';
	import { PROJECT_STATE_META, normalizeProjectState } from '$lib/config/project-states';
	import {
		pinnedDocumentReason,
		visibleDocumentTree
	} from '$lib/components/organize/organize-plan';
	import type { DocTreeNode } from '$lib/types/onto-api';
	import { formatProjectResumeCue, type ProjectListSummary } from '../project-list';
	import DesktopTile from './DesktopTile.svelte';
	import { relativeDay, shortName } from './desktop-model';
	import { SCHEDULED_TASK_MOVES_ENABLED, isDatedTask, type DesktopCard } from './desktop-moves';
	import type { DesktopItem } from './desktop-rules';

	let {
		project,
		parent,
		inside,
		canHold,
		updatedAt,
		data,
		error,
		tab,
		over,
		lifted,
		canTakeOut,
		onTab,
		onCollapse,
		onOpenProject,
		onOpenFull,
		onTakeOut,
		onMove,
		onRetry
	}: {
		project: ProjectListSummary;
		parent: ProjectListSummary | null;
		inside: readonly ProjectListSummary[];
		/** Only top-level projects hold others. */
		canHold: boolean;
		updatedAt: number;
		data: DesktopCard | null;
		error: string;
		tab: CardTab;
		over: { key: string; ok: boolean } | null;
		lifted: string | null;
		canTakeOut: boolean;
		onTab: (tab: CardTab) => void;
		onCollapse: () => void;
		onOpenProject: (projectId: string) => void;
		onOpenFull: () => void;
		onTakeOut: (anchor: HTMLElement) => void;
		onMove: (item: DesktopItem, anchor: HTMLElement) => void;
		onRetry: () => void;
	} = $props();

	let openDocs = $state<Set<string>>(new Set());
	let showDone = $state(false);

	const projectState = $derived(normalizeProjectState(project.state_key));
	const nextStep = $derived(formatProjectResumeCue(project.next_step_short));
	const description = $derived(formatProjectResumeCue(project.description));
	const href = $derived(resolve('/projects/[id]', { id: project.id }));
	const canWrite = $derived(Boolean(data?.project.can_write));

	const tree = $derived(data ? visibleDocumentTree(data.project) : []);
	const titles = $derived(new Map(data?.project.documents.map((doc) => [doc.id, doc.title])));
	const tasks = $derived(
		[...(data?.project.tasks ?? [])].sort(
			(a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)
		)
	);
	const openTasks = $derived(tasks.filter((task) => task.state_key !== 'done'));
	const doneTasks = $derived(tasks.filter((task) => task.state_key === 'done'));

	const tabs = $derived.by(() => {
		const list: { key: CardTab; label: string; count: number }[] = [];
		if (canHold) list.push({ key: 'inside', label: 'Inside', count: inside.length });
		list.push(
			{
				key: 'docs',
				label: 'Docs',
				count: data ? data.project.documents.length : project.document_count
			},
			{ key: 'tasks', label: 'Tasks', count: data ? openTasks.length : project.task_count },
			{ key: 'goals', label: 'Goals', count: data ? data.goals.length : project.goal_count }
		);
		return list;
	});

	function countNodes(nodes: DocTreeNode[]): number {
		return nodes.reduce((total, node) => total + 1 + countNodes(node.children ?? []), 0);
	}

	function toggleDoc(id: string) {
		const next = new Set(openDocs);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		openDocs = next;
	}

	function move(event: MouseEvent, item: DesktopItem) {
		const button = event.currentTarget as HTMLElement;
		onMove(item, button);
	}

	function dropClass(key: string) {
		if (over?.key !== key) return '';
		return over.ok ? 'drop-ok' : 'drop-no';
	}

	function tabKeydown(event: KeyboardEvent, index: number) {
		if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
		event.preventDefault();
		const next =
			tabs[(index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
		if (!next) return;
		onTab(next.key);
		const list = (event.currentTarget as HTMLElement).parentElement;
		requestAnimationFrame(() =>
			list?.querySelector<HTMLElement>(`[data-tab="${next.key}"]`)?.focus()
		);
	}

	function shortDate(value: string): string {
		const date = new Date(value);
		return Number.isNaN(date.getTime())
			? ''
			: date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
	}
</script>

<article
	class="card {dropClass(`project:${project.id}`)}"
	data-drop-kind="project"
	data-drop-id={project.id}
	aria-label={project.name}
>
	<header class="grid gap-3 border-b border-border px-4 pb-3.5 pt-4 sm:px-5">
		<nav
			class="flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted-foreground"
			aria-label="Where this project lives"
		>
			<button type="button" class="crumb" onclick={onCollapse}>Desktop</button>
			<span aria-hidden="true">/</span>
			{#if parent}
				<button type="button" class="crumb" onclick={() => onOpenProject(parent.id)}>
					{shortName(parent.name)}
				</button>
				<span aria-hidden="true">/</span>
			{/if}
			<span class="truncate">{shortName(project.name)}</span>
		</nav>
		<div class="flex items-start gap-3.5">
			<DesktopTile {project} inside={canHold ? inside : []} size="md" />
			<div class="min-w-0 flex-1">
				<h2
					tabindex="-1"
					class="text-xl font-semibold outline-none leading-tight tracking-tight text-foreground text-balance"
				>
					{project.name}
				</h2>
				<div
					class="mt-1.5 flex flex-wrap items-center gap-2 text-[12.5px] text-muted-foreground"
				>
					<span
						class="rounded-full px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-wide {PROJECT_STATE_META[
							projectState
						].chipClass}"
					>
						{PROJECT_STATE_META[projectState].label}
					</span>
					<span>Updated {relativeDay(new Date(updatedAt).toISOString())}</span>
					{#if parent}<span>· Part of {shortName(parent.name)}</span>{/if}
				</div>
			</div>
			<div class="flex shrink-0 flex-wrap justify-end gap-1.5">
				{#if parent && canTakeOut}
					<button
						type="button"
						class="action hidden sm:inline-flex"
						onclick={(event) => onTakeOut(event.currentTarget)}
					>
						Take out of {shortName(parent.name, 20)}
					</button>
				{/if}
				<a {href} class="action" onclick={onOpenFull} data-sveltekit-preload-data="hover">
					<ArrowUpRight class="h-4 w-4" />
					<span class="hidden sm:inline">Open project</span>
					<span class="sr-only sm:hidden">Open project</span>
				</a>
				<button
					type="button"
					class="action quiet"
					onclick={onCollapse}
					aria-label="Collapse and go back to the desktop"
				>
					<Minimize2 class="h-4 w-4" />
					<span class="hidden sm:inline">Collapse</span>
				</button>
			</div>
		</div>
		<div class="grid gap-0.5">
			<span class="micro-label text-accent">NEXT STEP</span>
			<p class="max-w-[72ch] text-sm text-foreground">{nextStep || 'No next step yet.'}</p>
		</div>
		{#if description}
			<p class="line-clamp-3 max-w-[72ch] text-[13px] text-muted-foreground">
				{description}
			</p>
		{/if}
		{#if parent && canTakeOut}
			<button
				type="button"
				class="action justify-self-start sm:hidden"
				onclick={(event) => onTakeOut(event.currentTarget)}
			>
				Take out of {shortName(parent.name, 24)}
			</button>
		{/if}
	</header>

	<div class="tabs" role="tablist" aria-label="What {project.name} holds">
		{#each tabs as item, index (item.key)}
			<button
				type="button"
				role="tab"
				id="desktop-tab-{item.key}"
				data-tab={item.key}
				aria-selected={tab === item.key}
				aria-controls="desktop-tabpanel"
				tabindex={tab === item.key ? 0 : -1}
				onclick={() => onTab(item.key)}
				onkeydown={(event) => tabKeydown(event, index)}
			>
				{item.label}<span class="count">{item.count}</span>
			</button>
		{/each}
	</div>

	<div
		class="body"
		id="desktop-tabpanel"
		role="tabpanel"
		aria-labelledby="desktop-tab-{tab}"
		data-autoscroll
	>
		{#if tab === 'inside'}
			{#if inside.length}
				<p class="hint">
					Drag a sub-project onto Desktop in the dock to take it out, or onto another
					project to move it there.
				</p>
			{/if}
			{#each inside as child (child.id)}
				{@const cue =
					formatProjectResumeCue(child.next_step_short) ||
					formatProjectResumeCue(child.description)}
				<div
					class="row {dropClass(`project:${child.id}`)}"
					class:lifted={lifted === `project:${child.id}`}
					data-drag-kind="project"
					data-drag-id={child.id}
					data-drop-kind="project"
					data-drop-id={child.id}
				>
					<GripVertical class="grip h-3.5 w-3.5" />
					<DesktopTile project={child} size="sm" />
					<button
						type="button"
						class="min-w-0 text-left"
						draggable="false"
						onclick={() => onOpenProject(child.id)}
					>
						<span class="block truncate text-sm text-foreground">{child.name}</span>
						<span class="block truncate text-xs text-muted-foreground">
							{cue || 'No next step yet.'}
						</span>
					</button>
					<button
						type="button"
						class="mv"
						data-nodrag
						onclick={(event) => move(event, { kind: 'project', id: child.id })}
					>
						Move
					</button>
				</div>
			{/each}
			<div class="empty-drop">
				Drag a project from the dock into this card to put it inside {shortName(
					project.name
				)}.
			</div>
		{:else if !data}
			{#if error}
				<div class="empty-drop grid justify-items-center gap-2" role="alert">
					<span>{error}</span>
					<button type="button" class="action" onclick={onRetry}>
						<RefreshCw class="h-3.5 w-3.5" /> Try again
					</button>
				</div>
			{:else}
				<div class="grid gap-1.5 px-2 py-1" aria-busy="true" aria-label="Loading">
					{#each [0, 1, 2, 3] as index (index)}
						<div
							class="h-9 animate-pulse rounded-lg bg-muted motion-reduce:animate-none"
						></div>
					{/each}
				</div>
			{/if}
		{:else if tab === 'docs'}
			{#if tree.length}
				{#if canWrite}
					<p class="hint">
						Drag a doc onto a project in the dock to move it, with any docs nested under
						it.
					</p>
				{/if}
				{@render docRows(tree, 0)}
			{:else}
				<div class="empty-drop">No docs yet.</div>
			{/if}
		{:else if tab === 'tasks'}
			{#if tasks.length}
				{#if canWrite}
					<p class="hint">
						Drag a task onto a project in the dock to move it.{SCHEDULED_TASK_MOVES_ENABLED
							? ''
							: ' Dated tasks stay put for now.'}
					</p>
				{/if}
				{#each openTasks as task (task.id)}
					{@render taskRow(task)}
				{/each}
				{#if doneTasks.length}
					<button
						type="button"
						class="mt-1 flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-left text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
						aria-expanded={showDone}
						onclick={() => (showDone = !showDone)}
					>
						<ChevronRight
							class="h-3.5 w-3.5 transition-transform motion-reduce:transition-none {showDone
								? 'rotate-90'
								: ''}"
						/>
						Done · {doneTasks.length}
					</button>
					{#if showDone}
						{#each doneTasks as task (task.id)}
							{@render taskRow(task)}
						{/each}
					{/if}
				{/if}
			{:else}
				<div class="empty-drop">No tasks yet.</div>
			{/if}
		{:else if data.goals.length}
			<p class="hint">Goals stay with their project for now.</p>
			{#each data.goals as goal (goal.id)}
				<div class="row">
					<span></span>
					<Target class="h-4 w-4 text-accent" />
					<span class="truncate text-sm text-foreground">{goal.name}</span>
					<span class="chip">
						{goal.target_date ? shortDate(goal.target_date) : goal.state_key}
					</span>
				</div>
			{/each}
		{:else}
			<div class="empty-drop">No goals yet.</div>
		{/if}
	</div>
</article>

{#snippet docRows(nodes: DocTreeNode[], depth: number)}
	{#each nodes as node (node.id)}
		{@const children = node.children ?? []}
		{@const expanded = openDocs.has(node.id)}
		{@const title = node.title || titles.get(node.id) || 'Untitled'}
		{@const pinned = data ? pinnedDocumentReason(data.project, node.id) : null}
		{@const movable = canWrite && !pinned}
		<div
			class="row"
			class:lifted={lifted === `document:${node.id}`}
			style:--depth={depth}
			data-drag-kind={movable ? 'document' : undefined}
			data-drag-id={movable ? node.id : undefined}
			data-drag-project={movable ? project.id : undefined}
		>
			{#if children.length}
				<button
					type="button"
					class="toggle"
					data-nodrag
					aria-expanded={expanded}
					aria-label="{expanded ? 'Collapse' : 'Expand'} {title}"
					onclick={() => toggleDoc(node.id)}
				>
					<ChevronRight class="h-3.5 w-3.5" />
				</button>
			{:else}
				<span></span>
			{/if}
			<span class="glyph">
				{#if children.length}<FolderOpen class="h-4 w-4" />{:else}<FileText
						class="h-4 w-4"
					/>{/if}
			</span>
			<span class="min-w-0">
				<span class="block truncate text-sm text-foreground">{title}</span>
				{#if children.length}
					<span class="block text-xs text-muted-foreground">
						{countNodes(children)} inside
					</span>
				{/if}
			</span>
			{#if pinned}
				<span class="chip inline-flex items-center gap-1" title={pinned}>
					<Lock class="h-3 w-3" /> Stays
				</span>
			{:else if movable}
				<button
					type="button"
					class="mv"
					data-nodrag
					onclick={(event) =>
						move(event, { kind: 'document', id: node.id, projectId: project.id })}
				>
					Move
				</button>
			{:else}
				<span></span>
			{/if}
		</div>
		{#if children.length && expanded}
			{@render docRows(children, depth + 1)}
		{/if}
	{/each}
{/snippet}

{#snippet taskRow(task: DesktopCard['project']['tasks'][number])}
	{@const dated = isDatedTask(task)}
	{@const locked = dated && !SCHEDULED_TASK_MOVES_ENABLED}
	{@const movable = canWrite && !locked}
	<div
		class="row"
		class:lifted={lifted === `task:${task.id}`}
		data-drag-kind={movable ? 'task' : undefined}
		data-drag-id={movable ? task.id : undefined}
		data-drag-project={movable ? project.id : undefined}
	>
		<span></span>
		<span class="glyph state-{task.state_key}">
			{#if task.state_key === 'done'}<CircleCheck
					class="h-4 w-4"
				/>{:else if task.state_key === 'in_progress'}<CircleDot
					class="h-4 w-4"
				/>{:else if task.state_key === 'blocked'}<CircleSlash
					class="h-4 w-4"
				/>{:else}<Circle class="h-4 w-4" />{/if}
		</span>
		<span
			class="truncate text-sm {task.state_key === 'done'
				? 'text-muted-foreground line-through'
				: 'text-foreground'}">{task.title}</span
		>
		{#if locked}
			<span
				class="chip inline-flex items-center gap-1"
				title="Dated tasks can't move yet: calendar moves are off."
			>
				<Lock class="h-3 w-3" />
				{shortDate(task.due_at ?? task.start_at ?? '')}
			</span>
		{:else if movable}
			<button
				type="button"
				class="mv"
				data-nodrag
				onclick={(event) =>
					move(event, { kind: 'task', id: task.id, projectId: project.id })}
			>
				Move
			</button>
		{:else}
			<span></span>
		{/if}
	</div>
{/snippet}

<style>
	.card {
		display: flex;
		min-width: 0;
		flex-direction: column;
		border-radius: 16px;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--card));
		box-shadow: var(--shadow-ink);
		animation: grow 180ms ease-out;
	}
	@media (min-width: 768px) {
		.card {
			max-height: calc(100dvh - 1.5rem);
		}
	}
	@keyframes grow {
		from {
			opacity: 0;
			transform: scale(0.985);
		}
		to {
			opacity: 1;
			transform: none;
		}
	}
	.card.drop-ok {
		outline: 2px dashed hsl(var(--accent));
		outline-offset: -2px;
		background: color-mix(in srgb, hsl(var(--accent)) 6%, hsl(var(--card)));
	}
	.crumb {
		color: hsl(var(--muted-foreground));
		text-decoration: underline;
		text-decoration-color: hsl(var(--border-strong));
		text-underline-offset: 3px;
	}
	.crumb:hover {
		color: hsl(var(--foreground));
	}
	.action {
		display: inline-flex;
		min-height: 2.25rem;
		align-items: center;
		gap: 6px;
		border-radius: 9px;
		border: 1px solid hsl(var(--border-strong));
		background: hsl(var(--card));
		padding: 0 10px;
		font-size: 13px;
		font-weight: 500;
		color: hsl(var(--foreground));
		white-space: nowrap;
	}
	.action:hover {
		background: hsl(var(--muted));
	}
	.action.quiet {
		border-color: transparent;
		background: none;
		color: hsl(var(--muted-foreground));
	}
	.action.quiet:hover {
		color: hsl(var(--foreground));
		background: hsl(var(--muted));
	}
	.tabs {
		display: flex;
		flex: none;
		gap: 2px;
		overflow-x: auto;
		border-bottom: 1px solid hsl(var(--border));
		padding: 0 12px;
		scrollbar-width: none;
	}
	.tabs button {
		margin-bottom: -1px;
		border-bottom: 2px solid transparent;
		padding: 11px 10px 10px;
		font-size: 13.5px;
		font-weight: 500;
		white-space: nowrap;
		color: hsl(var(--muted-foreground));
	}
	.tabs button[aria-selected='true'] {
		border-bottom-color: hsl(var(--accent));
		color: hsl(var(--foreground));
	}
	.tabs button:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: -2px;
	}
	.count {
		margin-left: 5px;
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 11px;
		color: hsl(var(--muted-foreground));
	}
	.body {
		display: grid;
		align-content: start;
		gap: 2px;
		min-height: 12rem;
		padding: 10px 10px 16px;
	}
	@media (min-width: 768px) {
		.body {
			flex: 1;
			overflow-y: auto;
			overscroll-behavior: contain;
		}
	}
	.hint {
		padding: 2px 8px 8px;
		font-size: 12.5px;
		color: hsl(var(--muted-foreground));
	}
	.row {
		display: grid;
		grid-template-columns: 22px auto minmax(0, 1fr) auto;
		align-items: center;
		gap: 10px;
		min-height: 44px;
		padding: 6px 8px;
		padding-left: calc(6px + var(--depth, 0) * 20px);
		border-radius: 9px;
		-webkit-user-select: none;
		user-select: none;
		-webkit-touch-callout: none;
		touch-action: pan-y;
		transition:
			background-color 100ms ease,
			opacity 120ms ease;
	}
	.row:hover {
		background: hsl(var(--muted));
	}
	.row[data-drag-kind] {
		cursor: grab;
	}
	.row :global(.grip) {
		color: hsl(var(--border-strong));
		opacity: 0;
		justify-self: center;
		transition: opacity 100ms ease;
	}
	.row:hover :global(.grip),
	.row:focus-within :global(.grip) {
		opacity: 1;
	}
	.row.drop-ok {
		background: hsl(var(--accent) / 0.14);
		box-shadow: inset 0 0 0 2px hsl(var(--accent));
	}
	.row.drop-no,
	.lifted {
		opacity: 0.4;
	}
	.glyph {
		display: grid;
		place-items: center;
		width: 26px;
		height: 26px;
		border-radius: 7px;
		background: hsl(var(--muted));
		color: hsl(var(--muted-foreground));
	}
	.state-done {
		color: hsl(var(--success));
	}
	.state-in_progress {
		color: hsl(var(--warning));
	}
	.state-blocked {
		color: hsl(var(--destructive));
	}
	.toggle {
		display: grid;
		place-items: center;
		width: 22px;
		height: 22px;
		border-radius: 5px;
		color: hsl(var(--muted-foreground));
	}
	.toggle:hover {
		background: hsl(var(--border));
		color: hsl(var(--foreground));
	}
	.toggle :global(svg) {
		transition: transform 120ms ease;
	}
	.toggle[aria-expanded='true'] :global(svg) {
		transform: rotate(90deg);
	}
	.chip {
		border-radius: 6px;
		border: 1px solid hsl(var(--border));
		padding: 2px 6px;
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 11px;
		white-space: nowrap;
		color: hsl(var(--muted-foreground));
	}
	.mv {
		border-radius: 7px;
		border: 1px solid hsl(var(--border));
		background: hsl(var(--card));
		padding: 3px 9px;
		font-size: 12px;
		color: hsl(var(--muted-foreground));
		opacity: 0;
	}
	.row:hover .mv,
	.row:focus-within .mv,
	.mv:focus-visible {
		opacity: 1;
	}
	.mv:hover {
		border-color: hsl(var(--border-strong));
		color: hsl(var(--foreground));
	}
	@media (hover: none) {
		.mv,
		.row :global(.grip) {
			opacity: 1;
		}
	}
	.empty-drop {
		margin: 6px 4px;
		padding: 22px 16px;
		border-radius: 12px;
		border: 1.5px dashed hsl(var(--border-strong));
		text-align: center;
		font-size: 13px;
		color: hsl(var(--muted-foreground));
	}
	@media (prefers-reduced-motion: reduce) {
		.card {
			animation: none;
		}
		.row,
		.toggle :global(svg),
		.row :global(.grip) {
			transition: none;
		}
	}
</style>
