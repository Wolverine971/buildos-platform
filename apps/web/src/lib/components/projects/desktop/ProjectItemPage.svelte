<!-- apps/web/src/lib/components/projects/desktop/ProjectItemPage.svelte -->
<!--
	A doc's or task's own page: the reader at full width, the project's docs or
	tasks as a rail beside it (hide it with the list toggle or F), and chat beside
	the reader. It is the same reader as the Projects card and the project page,
	at its deepest. Walking to another item swaps it in place and rewrites the
	URL, so the address always names what is open. On phones the item opens as a
	full sheet over the project's list.
-->
<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { goto, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { ArrowLeft } from '$lib/icons/lucide';
	import { onReturnAfterAway } from '$lib/utils/return-refresh';
	import { isTableTypeKey } from '@buildos/shared-agent-ops/tables';
	import { visibleDocumentTree } from '$lib/components/organize/organize-plan';
	import type { DocTreeNode } from '$lib/types/onto-api';
	import type { ProjectItemPageData } from '$lib/server/projects/project-item-page';
	import { fetchCard, type DesktopCard } from './desktop-moves';
	import ReaderPanes from './ReaderPanes.svelte';
	import ReaderDocTree from './ReaderDocTree.svelte';
	import ReaderTaskList from './ReaderTaskList.svelte';
	import { groupTasksForReader, taskReaderOrder } from './reader-task-groups';
	import type { ChatScope, ReaderItem, ReaderKind } from './reader-model';

	let { data }: { data: ProjectItemPageData } = $props();

	type RailTab = 'docs' | 'tasks';
	type PanesApi = {
		open: (item: ReaderItem) => void;
		openChat: (scope: ChatScope) => void;
		handleKey: (event: KeyboardEvent) => boolean;
	};

	// The open item: the route's, until a walk swaps another in. A new route
	// (a link to another item) starts over from its own data.
	let walked = $state.raw<{ from: ProjectItemPageData['item']; item: ReaderItem } | null>(null);
	const item = $derived<ReaderItem>(
		walked && walked.from === data.item ? walked.item : data.item
	);

	let freshCard = $state.raw<{ for: ProjectItemPageData; card: DesktopCard } | null>(null);
	const card = $derived(freshCard?.for === data ? freshCard.card : data.card);
	let railTab = $state<RailTab>(untrack(() => (data.item.kind === 'task' ? 'tasks' : 'docs')));
	let showDone = $state(false);
	let reloadKey = $state(0);
	let chatOpen = $state(false);
	let chatScope = $state<ChatScope>('project');
	let panes = $state<PanesApi | null>(null);

	const projectHref = $derived(resolve('/projects/[id]', { id: data.projectId }));
	const canWrite = $derived(card ? card.project.can_write : data.canWrite);
	const projectName = $derived(card?.project.name || data.projectName || 'Project');

	const tree = $derived(card ? visibleDocumentTree(card.project) : []);
	const titles = $derived(new Map(card?.project.documents.map((doc) => [doc.id, doc.title])));
	const tableIds = $derived(
		new Set(
			(card?.project.documents ?? [])
				.filter((doc) => isTableTypeKey(doc.type_key))
				.map((doc) => doc.id)
		)
	);
	const taskGroups = $derived(groupTasksForReader(card?.project.tasks ?? []));
	const openTaskCount = $derived(
		taskGroups.reduce(
			(total, group) => total + (group.key === 'done' ? 0 : group.tasks.length),
			0
		)
	);
	const docOrder = $derived.by(() => {
		const ids: string[] = [];
		const walk = (nodes: DocTreeNode[]) => {
			for (const node of nodes) {
				ids.push(node.id);
				walk(node.children ?? []);
			}
		};
		walk(tree);
		return ids;
	});

	function order(kind: ReaderKind): string[] {
		if (kind === 'document') return docOrder;
		if (kind === 'task') return taskReaderOrder(taskGroups, showDone);
		return (card?.goals ?? []).map((goal) => goal.id);
	}

	function titleOf(target: ReaderItem): string {
		if (target.kind === 'document') {
			return titles.get(target.id) ?? (target.id === data.item.id ? data.itemTitle : '');
		}
		if (target.kind === 'task') {
			const task = card?.project.tasks.find((entry) => entry.id === target.id);
			return task?.title ?? (target.id === data.item.id ? data.itemTitle : '');
		}
		return card?.goals.find((goal) => goal.id === target.id)?.name ?? '';
	}

	const title = $derived(titleOf(item) || data.itemTitle || 'Untitled');

	function hrefFor(target: ReaderItem): string | null {
		if (target.kind === 'document') {
			return resolve('/projects/[id]/documents/[document_id]', {
				id: data.projectId,
				document_id: target.id
			});
		}
		if (target.kind === 'task') {
			return resolve('/projects/[id]/tasks/[task_id]', {
				id: data.projectId,
				task_id: target.id
			});
		}
		return null;
	}

	// Walking swaps the item in place and rewrites the URL without a new history
	// entry, like the card: Back still leaves the page in one step.
	function openItem(next: ReaderItem) {
		if (next.kind === item.kind && next.id === item.id) return;
		walked = { from: data.item, item: next };
		const href = hrefFor(next);
		if (href) replaceState(href, page.state);
	}

	function closeItem() {
		const view = item.kind === 'task' ? 'work' : 'docs';
		void goto(`${projectHref}?view=${view}`);
	}

	async function refreshCard() {
		const requestedFor = data;
		try {
			const next = await fetchCard(data.projectId);
			if (requestedFor === data) freshCard = { for: requestedFor, card: next };
		} catch {
			// The rail keeps its last read; the reader already shows the change.
		}
	}

	function changed() {
		void refreshCard();
	}

	function keydown(event: KeyboardEvent) {
		if (event.defaultPrevented || document.querySelector('[role="dialog"]')) return;
		if (panes?.handleKey(event)) event.preventDefault();
	}

	// The panes fill the window below the header; they scroll on their own.
	let host = $state<HTMLElement | null>(null);
	let hostTop = $state(0);
	function measure() {
		hostTop = Math.max(0, (host?.getBoundingClientRect().top ?? 0) + window.scrollY);
	}
	onMount(() => {
		measure();
		// Changes made elsewhere (another device, an agent) catch up after a real
		// absence, not on every alt-tab.
		return onReturnAfterAway(() => {
			reloadKey += 1;
			void refreshCard();
		});
	});
</script>

<svelte:window onkeydown={keydown} onresize={measure} />

<svelte:head>
	<title>{title} | {projectName} | BuildOS</title>
</svelte:head>

<div class="item-page">
	<header class="top">
		<a
			href="{projectHref}?view={item.kind === 'task' ? 'work' : 'docs'}"
			class="back"
			aria-label="Back to {projectName}"
		>
			<ArrowLeft class="h-4 w-4" />
		</a>
		<nav class="crumbs" aria-label="Where this lives">
			<a href={projectHref} class="crumb">{projectName}</a>
			<span aria-hidden="true">/</span>
			<a href="{projectHref}?view={item.kind === 'task' ? 'work' : 'docs'}" class="crumb">
				{item.kind === 'task' ? 'Tasks' : 'Docs'}
			</a>
			<span aria-hidden="true">/</span>
			<span class="here">{title}</span>
		</nav>
		<button
			type="button"
			class="bolt"
			onclick={() => panes?.openChat('project')}
			aria-pressed={chatOpen && chatScope === 'project'}
			title="Chat about this project"
			aria-label="Chat about {projectName}"
		>
			<img src="/brain-bolt.webp" alt="" class="h-6 w-6 rounded object-cover" />
		</button>
	</header>

	<div class="host" bind:this={host} style:--host-top="{hostTop}px">
		<ReaderPanes
			bind:this={panes}
			bind:chatOpen
			bind:chatScope
			projectId={data.projectId}
			{projectName}
			{canWrite}
			reader={item}
			{reloadKey}
			seed={data.seed}
			pageLink={false}
			openDetent="full"
			{order}
			{titleOf}
			listAttrs={{ 'aria-label': `${projectName} list` }}
			onOpenItem={openItem}
			onCloseItem={closeItem}
			onChanged={changed}
		>
			{#snippet list()}
				<div class="rail-tabs" role="tablist" aria-label="Show">
					<button
						type="button"
						role="tab"
						aria-selected={railTab === 'docs'}
						onclick={() => (railTab = 'docs')}
					>
						Docs<span class="count">{card?.project.documents.length ?? '–'}</span>
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={railTab === 'tasks'}
						onclick={() => (railTab = 'tasks')}
					>
						Tasks<span class="count">{card ? openTaskCount : '–'}</span>
					</button>
				</div>
				{#if !card}
					<p class="note">
						This project's list can't be shown here (archived projects keep their items,
						not their list). <a href={projectHref}>Open the project</a>.
					</p>
				{:else if railTab === 'docs'}
					<ReaderDocTree
						{tree}
						{titles}
						{tableIds}
						selectedId={item.kind === 'document' ? item.id : null}
						onOpen={(id) => panes?.open({ kind: 'document', id })}
					/>
				{:else}
					<ReaderTaskList
						groups={taskGroups}
						selectedId={item.kind === 'task' ? item.id : null}
						bind:showDone
						onOpen={(id) => panes?.open({ kind: 'task', id })}
					/>
				{/if}
			{/snippet}
		</ReaderPanes>
	</div>
</div>

<style>
	.item-page {
		display: flex;
		flex-direction: column;
		background: hsl(var(--background));
	}
	.top {
		display: flex;
		align-items: center;
		gap: 10px;
		min-height: 52px;
		border-bottom: 1px solid hsl(var(--border));
		background: hsl(var(--card));
		padding: 6px 12px;
	}
	.back,
	.bolt {
		display: grid;
		flex: none;
		place-items: center;
		width: 36px;
		height: 36px;
		border-radius: 9px;
		color: hsl(var(--muted-foreground));
	}
	.back:hover,
	.bolt:hover {
		background: hsl(var(--muted));
		color: hsl(var(--foreground));
	}
	.bolt[aria-pressed='true'] {
		background: hsl(var(--accent) / 0.14);
	}
	.back:focus-visible,
	.bolt:focus-visible,
	.crumb:focus-visible,
	.rail-tabs button:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: 1px;
	}
	.crumbs {
		display: flex;
		min-width: 0;
		flex: 1;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		color: hsl(var(--muted-foreground));
	}
	.crumb {
		flex: none;
		max-width: 16rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		text-decoration: underline;
		text-decoration-color: hsl(var(--border-strong));
		text-underline-offset: 3px;
	}
	.crumb:hover {
		color: hsl(var(--foreground));
	}
	.here {
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 600;
		color: hsl(var(--foreground));
	}
	.host {
		display: flex;
		min-width: 0;
		flex-direction: column;
	}
	@media (min-width: 768px) {
		.host {
			--list-w: 320px;
			height: calc(100dvh - var(--host-top, 110px));
			min-height: 420px;
			background: hsl(var(--card));
		}
	}
	@media (max-width: 767px) {
		.crumb {
			max-width: 9rem;
		}
	}
	.rail-tabs {
		position: sticky;
		top: 0;
		z-index: 1;
		display: flex;
		gap: 2px;
		border-bottom: 1px solid hsl(var(--border));
		background: hsl(var(--card));
		padding: 0 10px;
	}
	.rail-tabs button {
		margin-bottom: -1px;
		border-bottom: 2px solid transparent;
		padding: 10px 8px 9px;
		font-size: 13px;
		font-weight: 500;
		color: hsl(var(--muted-foreground));
	}
	.rail-tabs button[aria-selected='true'] {
		border-bottom-color: hsl(var(--accent));
		color: hsl(var(--foreground));
	}
	.count {
		margin-left: 5px;
		font-family: var(--font-mono, ui-monospace, monospace);
		font-size: 11px;
		color: hsl(var(--muted-foreground));
	}
	.note {
		padding: 16px 12px;
		font-size: 13px;
		color: hsl(var(--muted-foreground));
	}
	.note a {
		text-decoration: underline;
		text-underline-offset: 3px;
	}
</style>
