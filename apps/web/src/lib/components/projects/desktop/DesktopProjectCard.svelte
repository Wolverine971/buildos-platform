<!-- apps/web/src/lib/components/projects/desktop/DesktopProjectCard.svelte -->
<!--
	An opened project: it takes the desktop while the rest dock. Tabs show what
	it holds (nested projects, docs, tasks, goals). Clicking a doc, task or goal
	opens it in the reader: beside the list (Peek), across the card (Focus), or on
	its own page; on phones the reader is a sheet over the list. Chat opens beside
	the reader, about the item or the whole project. Nested projects, docs and
	undated tasks drag out to the dock; every row also has a Move button for the
	same thing without a drag. The card itself is a drop target, so a project
	dragged in from the dock goes inside.
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
	import { onMount, tick, untrack } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { prefersReducedMotion } from 'svelte/motion';
	import { MediaQuery } from 'svelte/reactivity';
	import { resolve } from '$app/paths';
	import { portal } from '$lib/actions/portal';
	import { PROJECT_STATE_META, normalizeProjectState } from '$lib/config/project-states';
	import {
		pinnedDocumentReason,
		visibleDocumentTree
	} from '$lib/components/organize/organize-plan';
	import type { DocTreeNode } from '$lib/types/onto-api';
	import { formatProjectResumeCue, type ProjectListSummary } from '../project-list';
	import './desktop-colors.css';
	import DesktopTile from './DesktopTile.svelte';
	import DesktopTaskMix from './DesktopTaskMix.svelte';
	import { getDesktopLook } from './desktop-context';
	import { relativeDay, shortName } from './desktop-model';
	import { PULSE_META, TASK_BUCKETS, taskBucket, type TaskBucket } from './desktop-signals';
	import { SCHEDULED_TASK_MOVES_ENABLED, isDatedTask, type DesktopCard } from './desktop-moves';
	import type { DesktopItem } from './desktop-rules';
	import DesktopChatPane from './DesktopChatPane.svelte';
	import {
		loadReaderLayout,
		neighbors,
		paneMode,
		saveReaderLayout,
		sheetAfterDrag,
		showsList,
		type ChatScope,
		type ReaderItem,
		type ReaderKind,
		type ReaderLayout,
		type SheetDetent
	} from './reader-model';

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
		onRetry,
		reader,
		reloadKey,
		onOpenItem,
		onCloseItem,
		onChanged
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
		/** The doc, task or goal open in the reader (shallow history). */
		reader: ReaderItem | null;
		/** Bumped when the open item may have changed elsewhere (chat, a move). */
		reloadKey: number;
		onOpenItem: (item: ReaderItem) => void;
		onCloseItem: () => void;
		/** A task or goal changed in the reader: the list and tiles catch up. */
		onChanged: () => void;
	} = $props();

	let openDocs = $state<Set<string>>(new Set());
	let showDone = $state(false);

	const projectState = $derived(normalizeProjectState(project.state_key));
	const nextStep = $derived(formatProjectResumeCue(project.next_step_short));
	const description = $derived(formatProjectResumeCue(project.description));
	const href = $derived(resolve('/projects/[id]', { id: project.id }));
	const canWrite = $derived(Boolean(data?.project.can_write));

	const lookUp = getDesktopLook();
	const look = $derived(lookUp(project.id));
	const now = Date.now();

	const tree = $derived(data ? visibleDocumentTree(data.project) : []);
	const titles = $derived(new Map(data?.project.documents.map((doc) => [doc.id, doc.title])));
	const tasks = $derived(
		[...(data?.project.tasks ?? [])].sort(
			(a, b) => Date.parse(b.updated_at) - Date.parse(a.updated_at)
		)
	);
	const openTasks = $derived(tasks.filter((task) => task.state_key !== 'done'));
	const doneTasks = $derived(tasks.filter((task) => task.state_key === 'done'));
	// The same split as the tile's T bar, from the card's fresher task list.
	const taskMix = $derived.by(() => {
		const mix = Object.fromEntries(TASK_BUCKETS.map((bucket) => [bucket, 0])) as Record<
			TaskBucket,
			number
		>;
		for (const task of openTasks) {
			const bucket = taskBucket(task, now);
			if (bucket !== 'done') mix[bucket] += 1;
		}
		return mix;
	});

	// Nested projects lead when there are some and trail when there are none,
	// so an empty folder doesn't sit in front of the docs.
	const tabs = $derived.by(() => {
		const list: { key: CardTab; label: string; count: number }[] = [
			{
				key: 'docs',
				label: 'Docs',
				count: data ? data.project.documents.length : project.document_count
			},
			{ key: 'tasks', label: 'Tasks', count: data ? openTasks.length : project.task_count },
			{ key: 'goals', label: 'Goals', count: data ? data.goals.length : project.goal_count }
		];
		if (!canHold) return list;
		const nested = { key: 'inside' as const, label: 'Nested projects', count: inside.length };
		return inside.length ? [nested, ...list] : [...list, nested];
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

	// ---------- Reader and chat ----------

	// Phones get sheets over the card; wider screens get panes inside it.
	const phoneQuery = new MediaQuery('max-width: 767px', false);
	const phone = $derived(phoneQuery.current);

	type ReaderComponent = typeof import('./DesktopReader.svelte').default;
	type ReaderApi = { handleKey: (event: KeyboardEvent) => boolean; settle: () => Promise<void> };
	let Reader = $state<ReaderComponent | null>(null);
	let readerApi = $state<ReaderApi | null>(null);
	// Load the reader with the card, so the first click opens without a wait.
	onMount(() => {
		void import('./DesktopReader.svelte').then((module) => (Reader = module.default));
	});

	let layout = $state<ReaderLayout>(loadReaderLayout());
	let chatOpen = $state(false);
	let chatScope = $state<ChatScope>('project');
	let listWithChat = $state(false);
	let detent = $state<SheetDetent>('peek');
	let localReload = $state(0);
	const mode = $derived(
		paneMode({ reading: Boolean(reader), layout, chat: chatOpen, listWithChat })
	);
	const listShown = $derived(showsList(mode));

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
	const docParents = $derived.by(() => {
		const parents = new Map<string, string>();
		const walk = (nodes: DocTreeNode[], parentId: string | null) => {
			for (const node of nodes) {
				if (parentId) parents.set(node.id, parentId);
				walk(node.children ?? [], node.id);
			}
		};
		walk(tree, null);
		return parents;
	});

	function listOrder(kind: ReaderKind): string[] {
		if (kind === 'document') return docOrder;
		if (kind === 'task')
			return [...openTasks, ...(showDone ? doneTasks : [])].map((task) => task.id);
		return (data?.goals ?? []).map((goal) => goal.id);
	}

	// Prev/Next walk the list as it stood when an item was opened from it, so
	// marking a task done (which moves it to Done) doesn't lose your place.
	let walk = $state<{ kind: ReaderKind; ids: string[] } | null>(null);
	const known = $derived(
		new Set([
			...docOrder,
			...tasks.map((task) => task.id),
			...(data?.goals ?? []).map((g) => g.id)
		])
	);
	function orderOf(kind: ReaderKind): string[] {
		if (walk?.kind !== kind) return listOrder(kind);
		return data ? walk.ids.filter((id) => known.has(id)) : walk.ids;
	}

	const readerTitle = $derived.by(() => {
		if (!reader) return '';
		if (reader.kind === 'document') return titles.get(reader.id) ?? '';
		if (reader.kind === 'task') return tasks.find((task) => task.id === reader.id)?.title ?? '';
		return data?.goals.find((goal) => goal.id === reader.id)?.name ?? '';
	});

	// A doc opened from Prev/Next may sit in a collapsed folder: open the way to it.
	$effect(() => {
		if (reader?.kind !== 'document') return;
		const path: string[] = [];
		for (let at = docParents.get(reader.id); at; at = docParents.get(at)) path.push(at);
		untrack(() => {
			if (path.some((id) => !openDocs.has(id))) openDocs = new Set([...openDocs, ...path]);
		});
	});

	let listEl = $state<HTMLElement | null>(null);
	$effect(() => {
		const id = reader?.id;
		if (!id) return;
		void tick().then(() =>
			listEl
				?.querySelector<HTMLElement>(`[data-row-id="${id}"]`)
				?.scrollIntoView({ block: 'nearest' })
		);
	});

	function openItem(kind: ReaderKind, id: string) {
		if (!reader) detent = 'peek';
		walk = { kind, ids: listOrder(kind) };
		onOpenItem({ kind, id });
	}

	function step(direction: 1 | -1) {
		if (!reader) return;
		const near = neighbors(orderOf(reader.kind), reader.id);
		const id = direction > 0 ? near.next : near.prev;
		if (id) onOpenItem({ kind: reader.kind, id });
	}

	async function closeItem() {
		await readerApi?.settle();
		if (chatOpen && chatScope === 'item') chatOpen = false;
		detent = 'peek';
		onCloseItem();
	}

	function toggleFocus() {
		if (phone) {
			detent = detent === 'full' ? 'peek' : 'full';
			return;
		}
		if (chatOpen) {
			chatOpen = false;
			layout = 'focus';
		} else {
			layout = layout === 'focus' ? 'peek' : 'focus';
		}
		saveReaderLayout(layout);
	}

	function toggleList() {
		if (chatOpen) {
			listWithChat = !listWithChat;
			return;
		}
		layout = layout === 'focus' ? 'peek' : 'focus';
		saveReaderLayout(layout);
	}

	function openChat(scope: ChatScope) {
		if (chatOpen && chatScope === scope) {
			chatOpen = false;
			return;
		}
		chatScope = scope;
		chatOpen = true;
	}

	/** Keys for the reader and chat; the desktop asks first and stops when one is used. */
	export function handleKey(event: KeyboardEvent): boolean {
		const target = event.target instanceof Element ? event.target : null;
		const typing = Boolean(
			target?.closest('input, textarea, select, [contenteditable="true"], [role="textbox"]')
		);
		if ((!typing || event.key === 'Escape') && readerApi?.handleKey(event)) return true;
		if (typing || event.metaKey || event.ctrlKey || event.altKey) return false;
		if (event.key === 'Escape') {
			if (chatOpen) {
				chatOpen = false;
				return true;
			}
			if (reader) {
				void closeItem();
				return true;
			}
			return false;
		}
		if (!reader) return false;
		// Arrow keys inside the reader scroll it; J and K always walk the list.
		const inReader = Boolean(target?.closest('[data-reader-pane]'));
		const key = event.key.toLowerCase();
		if (key === 'j' || (event.key === 'ArrowDown' && !inReader)) {
			step(1);
			return true;
		}
		if (key === 'k' || (event.key === 'ArrowUp' && !inReader)) {
			step(-1);
			return true;
		}
		if (key === 'f') {
			toggleFocus();
			return true;
		}
		return false;
	}

	// ---------- Phone sheet ----------

	let dragTop = $state<number | null>(null);
	let sheetDrag: { y0: number; top0: number; dy: number; moved: boolean } | null = null;
	const sheetMotion = $derived({
		y: 480,
		duration: prefersReducedMotion.current ? 0 : 260,
		easing: cubicOut
	});

	function sheetDown(event: PointerEvent) {
		const target = event.target instanceof Element ? event.target : null;
		if (!target?.closest('[data-sheet-drag]') || target.closest('button, a')) return;
		const sheet = event.currentTarget as HTMLElement;
		sheetDrag = {
			y0: event.clientY,
			top0: sheet.getBoundingClientRect().top,
			dy: 0,
			moved: false
		};
		sheet.setPointerCapture?.(event.pointerId);
	}

	function sheetMove(event: PointerEvent) {
		if (!sheetDrag) return;
		sheetDrag.dy = event.clientY - sheetDrag.y0;
		if (Math.abs(sheetDrag.dy) > 6) sheetDrag.moved = true;
		if (sheetDrag.moved) dragTop = Math.max(0, sheetDrag.top0 + sheetDrag.dy);
	}

	function sheetUp() {
		if (!sheetDrag) return;
		const { dy, moved } = sheetDrag;
		sheetDrag = null;
		dragTop = null;
		const next = sheetAfterDrag(detent, dy, moved);
		if (next === 'closed') void closeItem();
		else detent = next;
	}

	function scrimClick() {
		if (chatOpen) chatOpen = false;
		else void closeItem();
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
	class:reading={Boolean(reader) && !phone}
	data-drop-kind="project"
	data-drop-id={project.id}
	aria-label={project.name}
>
	<header class="grid gap-3 border-b border-border px-4 pb-3.5 pt-4 sm:px-5">
		<nav
			class="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"
			aria-label="Where this project lives"
		>
			<button type="button" class="crumb" onclick={onCollapse}>Projects</button>
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
				<div class="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
					{#if look?.pulse}
						<span class="pulse pulse-{look.pulse}" title={look.reason}>
							{PULSE_META[look.pulse].label}
						</span>
						<span>{look.reason}</span>
					{:else}
						<span>Updated {relativeDay(new Date(updatedAt).toISOString())}</span>
					{/if}
					<span>· Status {PROJECT_STATE_META[projectState].label.toLowerCase()}</span>
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
				<button
					type="button"
					class="action bolt"
					onclick={() => openChat('project')}
					aria-pressed={chatOpen && chatScope === 'project'}
					title="Chat about this project"
					aria-label="Chat about {project.name}"
				>
					<img src="/brain-bolt.webp" alt="" class="h-6 w-6 rounded object-cover" />
				</button>
				<a {href} class="action" onclick={onOpenFull} data-sveltekit-preload-data="hover">
					<ArrowUpRight class="h-4 w-4" />
					<span class="hidden sm:inline">Open project</span>
					<span class="sr-only sm:hidden">Open project</span>
				</a>
				<button
					type="button"
					class="action quiet"
					onclick={onCollapse}
					aria-label="Collapse and go back to all projects"
				>
					<Minimize2 class="h-4 w-4" />
					<span class="hidden sm:inline">Collapse</span>
				</button>
			</div>
		</div>
		<div class="grid gap-0.5">
			<span class="micro-label text-accent">NEXT STEP</span>
			<p class="next max-w-[72ch] text-sm text-foreground">
				{nextStep || 'No next step yet.'}
			</p>
		</div>
		{#if description}
			<p class="line-clamp-3 max-w-[72ch] text-sm text-muted-foreground">
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

	<div class="panes mode-{phone ? 'list' : mode}">
		<div
			class="body"
			bind:this={listEl}
			id="desktop-tabpanel"
			role="tabpanel"
			aria-labelledby="desktop-tab-{tab}"
			data-autoscroll
			inert={!phone && !listShown}
		>
			{#if tab === 'inside'}
				{#if inside.length}
					<p class="hint">
						Drag a nested project onto Projects in the dock to take it out, or onto
						another project to move it there.
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
					Drag a project from the dock into this card to nest it in {shortName(
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
					<p class="hint">
						Click a doc to open it.{canWrite
							? ' Drag it onto a project in the dock to move it, with any docs nested under it.'
							: ''}
					</p>
					{@render docRows(tree, 0)}
				{:else}
					<div class="empty-drop">No docs yet.</div>
				{/if}
			{:else if tab === 'tasks'}
				{#if tasks.length}
					<div class="px-2 pb-2 pt-1"><DesktopTaskMix mix={taskMix} /></div>
					<p class="hint">
						Click a task to open it.{canWrite
							? ` Drag it onto a project in the dock to move it.${SCHEDULED_TASK_MOVES_ENABLED ? '' : ' Dated tasks stay put for now.'}`
							: ''}
					</p>
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
				<p class="hint">Click a goal to open it. Goals stay with their project for now.</p>
				{#each data.goals as goal (goal.id)}
					{@const selected = reader?.kind === 'goal' && reader.id === goal.id}
					<div class="row" class:sel={selected} data-row-id={goal.id}>
						<span></span>
						<Target class="h-4 w-4 text-accent" />
						<button
							type="button"
							class="open truncate text-sm text-foreground"
							aria-current={selected ? 'true' : undefined}
							onclick={() => openItem('goal', goal.id)}
						>
							{goal.name}
						</button>
						<span class="chip">
							{goal.target_date ? shortDate(goal.target_date) : goal.state_key}
						</span>
					</div>
				{/each}
			{:else}
				<div class="empty-drop">No goals yet.</div>
			{/if}
		</div>
		{#if !phone}
			<div class="reader-col" data-reader-pane inert={!reader || mode === 'list-chat'}>
				{#if reader}
					{@render readerView(reader)}
				{/if}
			</div>
			<div class="chat-col" inert={!chatOpen}>
				{#if chatOpen}
					{@render chatView()}
				{/if}
			</div>
		{/if}
	</div>
</article>

{#if phone && (reader || chatOpen)}
	<div use:portal class="sheet-layer">
		<button
			type="button"
			class="scrim"
			tabindex="-1"
			aria-label="Close"
			onclick={scrimClick}
			transition:fade|global={{ duration: sheetMotion.duration }}
		></button>
		{#if reader}
			<section
				class="sheet reader-sheet {chatOpen ? 'under-chat' : detent}"
				class:dragging={dragTop !== null}
				style:top={dragTop !== null ? `${dragTop}px` : null}
				aria-label={readerTitle || 'Reader'}
				data-reader-pane
				onpointerdown={sheetDown}
				onpointermove={sheetMove}
				onpointerup={sheetUp}
				onpointercancel={sheetUp}
				transition:fly|global={sheetMotion}
			>
				{@render readerView(reader)}
			</section>
		{/if}
		{#if chatOpen}
			<section
				class="sheet chat-sheet"
				class:tall={!reader}
				transition:fly|global={sheetMotion}
			>
				{@render chatView()}
			</section>
		{/if}
	</div>
{/if}

{#snippet readerView(item: ReaderItem)}
	{#if Reader}
		<Reader
			bind:this={readerApi}
			{item}
			projectId={project.id}
			{canWrite}
			order={orderOf(item.kind)}
			fallbackTitle={readerTitle}
			{layout}
			{listShown}
			chatOn={chatOpen && chatScope === 'item'}
			{phone}
			{detent}
			reloadKey={reloadKey + localReload}
			onClose={() => void closeItem()}
			onStep={(id) => onOpenItem({ kind: item.kind, id })}
			onToggleFocus={toggleFocus}
			onToggleList={toggleList}
			onChat={() => openChat('item')}
			{onChanged}
			onDetent={(next) => (detent = next)}
		/>
	{:else}
		<div class="grid h-full place-items-center text-sm text-muted-foreground" aria-busy="true">
			Opening…
		</div>
	{/if}
{/snippet}

{#snippet chatView()}
	<DesktopChatPane
		projectId={project.id}
		projectName={project.name}
		item={reader}
		itemTitle={readerTitle}
		scope={reader ? chatScope : 'project'}
		{phone}
		onScope={(scope) => (chatScope = scope)}
		onClose={() => (chatOpen = false)}
		onDocumentChanged={() => (localReload += 1)}
	/>
{/snippet}

{#snippet docRows(nodes: DocTreeNode[], depth: number)}
	{#each nodes as node (node.id)}
		{@const children = node.children ?? []}
		{@const expanded = openDocs.has(node.id)}
		{@const title = node.title || titles.get(node.id) || 'Untitled'}
		{@const pinned = data ? pinnedDocumentReason(data.project, node.id) : null}
		{@const movable = canWrite && !pinned}
		{@const selected = reader?.kind === 'document' && reader.id === node.id}
		<div
			class="row"
			class:sel={selected}
			data-row-id={node.id}
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
				<button
					type="button"
					class="open block max-w-full truncate text-sm text-foreground"
					draggable="false"
					aria-current={selected ? 'true' : undefined}
					onclick={() => openItem('document', node.id)}
				>
					{title}
				</button>
				{#if children.length}
					<span class="block text-xs text-muted-foreground">
						{countNodes(children)} nested
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
	{@const bucket = taskBucket(task, now)}
	{@const selected = reader?.kind === 'task' && reader.id === task.id}
	<div
		class="row"
		class:sel={selected}
		data-row-id={task.id}
		class:lifted={lifted === `task:${task.id}`}
		data-drag-kind={movable ? 'task' : undefined}
		data-drag-id={movable ? task.id : undefined}
		data-drag-project={movable ? project.id : undefined}
	>
		<span></span>
		<span class="glyph bucket-{bucket}">
			{#if task.state_key === 'done'}<CircleCheck
					class="h-4 w-4"
				/>{:else if task.state_key === 'in_progress'}<CircleDot
					class="h-4 w-4"
				/>{:else if task.state_key === 'blocked'}<CircleSlash
					class="h-4 w-4"
				/>{:else}<Circle class="h-4 w-4" />{/if}
		</span>
		<button
			type="button"
			class="open truncate text-sm {task.state_key === 'done'
				? 'text-muted-foreground line-through'
				: 'text-foreground'}"
			draggable="false"
			aria-current={selected ? 'true' : undefined}
			onclick={() => openItem('task', task.id)}>{task.title}</button
		>
		{#if locked}
			<span
				class="chip date-{bucket} inline-flex items-center gap-1"
				title="{bucket === 'overdue'
					? 'Overdue. '
					: ''}Dated tasks can't move yet: calendar moves are off."
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
		/* A reader needs the room even when the list is short. */
		.card.reading {
			height: calc(100dvh - 1.5rem);
		}
		.card.reading .desc {
			display: none;
		}
		.card.reading .next {
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
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
	.action.bolt {
		width: 2.25rem;
		justify-content: center;
		padding: 0;
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
	/* The card body: list | reader | chat. Tracks keep one shape so width changes animate.
	   The chat lays out at its final width (--chat-w) while its column slides open, so
	   nothing inside it measures itself mid-animation. */
	@media (min-width: 768px) {
		.panes {
			--chat-w: 380px;
			display: grid;
			flex: 1;
			min-height: 0;
			grid-template-rows: minmax(0, 1fr);
			grid-template-columns: minmax(0, 1fr) 0px 0px;
			transition: grid-template-columns 240ms cubic-bezier(0.2, 0.8, 0.2, 1);
		}
		.mode-peek {
			grid-template-columns: 340px minmax(0, 1fr) 0px;
		}
		.mode-focus {
			grid-template-columns: 0px minmax(0, 1fr) 0px;
		}
		.mode-reader-chat {
			grid-template-columns: 0px minmax(0, 1fr) var(--chat-w);
		}
		.mode-all {
			--chat-w: 340px;
			grid-template-columns: 280px minmax(0, 1fr) var(--chat-w);
		}
		.mode-list-chat {
			grid-template-columns: minmax(0, 1fr) 0px var(--chat-w);
		}
		.chat-col > :global(*) {
			width: var(--chat-w);
		}
		.body {
			min-height: 0;
			overflow-y: auto;
			overscroll-behavior: contain;
		}
		.mode-focus .body,
		.mode-reader-chat .body {
			visibility: hidden;
			padding-inline: 0;
		}
		.reader-col,
		.chat-col {
			min-width: 0;
			min-height: 0;
			overflow: hidden;
			border-left: 1px solid hsl(var(--border));
		}
		.mode-list .reader-col,
		.mode-list .chat-col,
		.mode-peek .chat-col,
		.mode-focus .chat-col,
		.mode-list-chat .reader-col,
		.mode-focus .reader-col,
		.mode-reader-chat .reader-col {
			border-left: 0;
		}
	}
	/* Under ~1180px there is no room for the list beside a reader: Peek reads like Focus. */
	@media (min-width: 768px) and (max-width: 1179px) {
		.mode-peek {
			grid-template-columns: 0px minmax(0, 1fr) 0px;
		}
		.panes,
		.mode-all {
			--chat-w: 320px;
		}
		.mode-all,
		.mode-reader-chat {
			grid-template-columns: 0px minmax(0, 1fr) var(--chat-w);
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
	.row.sel {
		background: hsl(var(--accent) / 0.12);
	}
	.row.sel .open {
		color: hsl(var(--accent));
		font-weight: 600;
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
	/* A row's title opens it; the rest of the row is the drag handle. */
	.open {
		cursor: pointer;
		text-align: left;
		text-underline-offset: 3px;
	}
	/* Done tasks keep their strike-through. */
	.open:not(.line-through):hover {
		text-decoration-line: underline;
		text-decoration-color: hsl(var(--border-strong));
	}
	.open:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: 2px;
		border-radius: 4px;
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
	/* Task colors match the tile's T bar (desktop-colors.css). */
	.bucket-overdue {
		color: hsl(var(--desk-overdue));
	}
	.bucket-in_progress {
		color: hsl(var(--desk-in-progress));
	}
	.bucket-scheduled {
		color: hsl(var(--desk-scheduled));
	}
	.chip.date-overdue {
		border-color: hsl(var(--desk-overdue) / 0.5);
		color: hsl(var(--desk-overdue));
	}
	.chip.date-scheduled {
		border-color: hsl(var(--desk-scheduled) / 0.5);
		color: hsl(var(--desk-scheduled));
	}
	.pulse {
		border-radius: 99px;
		border: 1px solid hsl(var(--c) / 0.5);
		background: hsl(var(--c) / 0.14);
		padding: 2px 7px;
		font-size: 10.5px;
		font-weight: 600;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: color-mix(in oklab, hsl(var(--c)) 80%, hsl(var(--foreground)));
	}
	.pulse-moving {
		--c: var(--desk-moving);
	}
	.pulse-shaping {
		--c: var(--desk-shaping);
	}
	.pulse-quiet {
		--c: var(--desk-quiet);
	}
	.pulse-parked {
		--c: var(--desk-parked);
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
	/* ---------- Phone sheets (portaled to body) ---------- */
	.sheet-layer {
		display: contents;
	}
	.scrim {
		position: fixed;
		inset: 0;
		z-index: 200;
		background: hsl(0 0% 0% / 0.45);
		touch-action: none;
	}
	.sheet {
		position: fixed;
		left: 0;
		right: 0;
		bottom: 0;
		z-index: 201;
		display: flex;
		flex-direction: column;
		overflow: hidden;
		border-top: 1px solid hsl(var(--border));
		border-radius: 18px 18px 0 0;
		background: hsl(var(--background));
		box-shadow: 0 -12px 40px -16px hsl(0 0% 0% / 0.5);
		transition:
			top 280ms cubic-bezier(0.2, 0.8, 0.2, 1),
			border-radius 280ms ease;
	}
	.sheet.dragging {
		transition: none;
	}
	.reader-sheet.peek {
		top: 34dvh;
	}
	.reader-sheet.full,
	.reader-sheet.under-chat {
		top: env(safe-area-inset-top, 0px);
		border-radius: 0;
		border-top: 0;
	}
	/* Reading while chatting: the doc keeps the top of the screen and scrolls clear of the chat. */
	.reader-sheet.under-chat :global(.body) {
		padding-bottom: 58dvh;
	}
	.chat-sheet {
		z-index: 202;
		top: 46dvh;
		background: hsl(var(--card));
	}
	.chat-sheet.tall {
		top: 10dvh;
	}
	.chat-sheet :global(.chat) {
		padding-bottom: env(safe-area-inset-bottom, 0px);
	}
	@media (prefers-reduced-motion: reduce) {
		.sheet,
		.panes {
			transition: none;
		}
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
