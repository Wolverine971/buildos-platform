<!-- apps/web/src/lib/components/projects/desktop/ReaderPanes.svelte -->
<!--
	The reader layout shared by the Projects card, the project page and an item's
	own page: a list, the reader beside it (Peek) or across it (Focus), and chat
	beside the reader. On phones the list stays put and the reader and chat are
	sheets over it. The host owns the list (a snippet) and where the open item is
	kept (history state or the URL); this owns the depths, the sheets and the keys.
-->
<script lang="ts">
	import { tick, untrack, type Snippet } from 'svelte';
	import { fade, fly } from 'svelte/transition';
	import { cubicOut } from 'svelte/easing';
	import { prefersReducedMotion } from 'svelte/motion';
	import { MediaQuery } from 'svelte/reactivity';
	import { portal } from '$lib/actions/portal';
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
		projectId,
		projectName,
		canWrite,
		reader,
		reloadKey = 0,
		hasList = true,
		seed = null,
		pageLink = true,
		openDetent = 'peek',
		order,
		known = () => true,
		titleOf,
		listAttrs = {},
		list,
		onOpenItem,
		onCloseItem,
		onChanged,
		chatOpen = $bindable(false),
		chatScope = $bindable<ChatScope>('project')
	}: {
		projectId: string;
		projectName: string;
		canWrite: boolean;
		/** The open doc, task or goal; the host keeps it in history or the URL. */
		reader: ReaderItem | null;
		/** Bumped when the open item may have changed elsewhere (chat, a move). */
		reloadKey?: number;
		/** False where no list sits beside the reader: it always reads across. */
		hasList?: boolean;
		/** The first item's read, already made by the page. */
		seed?: Record<string, unknown> | null;
		/** False on an item's own page: the reader has no fuller page to open. */
		pageLink?: boolean;
		/** Where a phone sheet opens: Peek over the list, or Full (an item's own page). */
		openDetent?: SheetDetent;
		/** Ids of a kind in the list's order, for Prev/Next. */
		order: (kind: ReaderKind) => string[];
		/** Whether an id remembered from an earlier list still exists. */
		known?: (kind: ReaderKind, id: string) => boolean;
		/** The list's title for an item, shown while the reader loads it. */
		titleOf: (item: ReaderItem) => string;
		/** Attributes for the list column (id, role, labels). */
		listAttrs?: Record<string, string>;
		list: Snippet;
		onOpenItem: (item: ReaderItem) => void;
		onCloseItem: () => void;
		/** Something changed in the reader: the list should catch up. */
		onChanged: () => void;
		chatOpen?: boolean;
		chatScope?: ChatScope;
	} = $props();

	// Phones get sheets over the list; wider screens get panes beside it.
	const phoneQuery = new MediaQuery('max-width: 767px', false);
	const phone = $derived(phoneQuery.current);

	type ReaderComponent = typeof import('./DesktopReader.svelte').default;
	type ReaderApi = { handleKey: (event: KeyboardEvent) => boolean; settle: () => Promise<void> };
	let Reader = $state<ReaderComponent | null>(null);
	let readerApi = $state<ReaderApi | null>(null);
	// Load the reader with the list, so the first click opens without a wait.
	$effect(() => {
		void import('./DesktopReader.svelte').then((module) => (Reader = module.default));
	});

	let layout = $state<ReaderLayout>(untrack(() => loadReaderLayout()));
	// A table opens at full width (Focus) without changing the saved preference;
	// toggling back to split clears it for that table.
	let tableFocusId = $state<string | null>(null);
	const effectiveLayout = $derived<ReaderLayout>(
		!hasList || (reader && tableFocusId === reader.id) ? 'focus' : layout
	);
	let listWithChat = $state(false);
	let detent = $state<SheetDetent>(untrack(() => openDetent));
	let localReload = $state(0);
	const mode = $derived(
		paneMode({
			reading: Boolean(reader),
			layout: effectiveLayout,
			chat: chatOpen,
			listWithChat: hasList && listWithChat
		})
	);
	const listShown = $derived(showsList(mode));

	// A sheet opens at Peek; closing the reader ends a chat about it.
	let wasReading = false;
	$effect(() => {
		const reading = Boolean(reader);
		untrack(() => {
			if (reading && !wasReading) detent = openDetent;
			if (!reading && wasReading) {
				walk = null;
				if (chatOpen && chatScope === 'item') chatOpen = false;
			}
			wasReading = reading;
		});
	});

	// Prev/Next walk the list as it stood when an item was opened from it, so
	// marking a task done (which moves it to Done) doesn't lose your place.
	let walk = $state<{ kind: ReaderKind; ids: string[] } | null>(null);
	function orderOf(kind: ReaderKind): string[] {
		if (walk?.kind !== kind) return order(kind);
		return walk.ids.filter((id) => known(kind, id));
	}

	const readerTitle = $derived(reader ? titleOf(reader) : '');

	// The seed belongs to the item the page opened with, and only to it.
	const seedKey = untrack(() => (seed && reader ? `${reader.kind}:${reader.id}` : null));
	// Spent once the reader first shows it: a reader mounted later (a resize
	// between phone and wide) reads the item fresh.
	let seedSpent = false;
	function seedFor(item: ReaderItem): Record<string, unknown> | null {
		return !seedSpent && seedKey === `${item.kind}:${item.id}` ? seed : null;
	}
	$effect(() => {
		if (Reader && reader) queueMicrotask(() => (seedSpent = true));
	});

	let listEl = $state<HTMLElement | null>(null);
	$effect(() => {
		const id = reader?.id;
		if (!id || phone) return;
		void tick().then(() =>
			listEl
				?.querySelector<HTMLElement>(`[data-row-id="${id}"], [data-node-id="${id}"]`)
				?.scrollIntoView({ block: 'nearest' })
		);
	});

	/** Open an item from the host's list; Prev/Next then walk that list. */
	export function open(item: ReaderItem) {
		walk = { kind: item.kind, ids: order(item.kind) };
		onOpenItem(item);
	}

	function step(direction: 1 | -1) {
		if (!reader) return;
		const near = neighbors(orderOf(reader.kind), reader.id);
		const id = direction > 0 ? near.next : near.prev;
		if (id) onOpenItem({ kind: reader.kind, id });
	}

	/** Save an open edit, then close the reader. */
	export async function close() {
		await readerApi?.settle();
		detent = 'peek';
		onCloseItem();
	}

	function toggleFocus() {
		if (phone) {
			detent = detent === 'full' ? 'peek' : 'full';
			return;
		}
		if (!hasList) {
			if (chatOpen) chatOpen = false;
			return;
		}
		if (!chatOpen && reader && tableFocusId === reader.id && layout !== 'focus') {
			tableFocusId = null;
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
		if (!hasList) return;
		if (chatOpen) {
			listWithChat = !listWithChat;
			return;
		}
		if (reader && tableFocusId === reader.id && layout !== 'focus') {
			tableFocusId = null;
			return;
		}
		layout = layout === 'focus' ? 'peek' : 'focus';
		saveReaderLayout(layout);
	}

	/** Chat about the open item or the whole project; the same scope again closes it. */
	export function openChat(scope: ChatScope) {
		if (chatOpen && chatScope === scope) {
			chatOpen = false;
			return;
		}
		chatScope = scope;
		chatOpen = true;
	}

	/** Keys for the reader and chat; the host asks first and stops when one is used. */
	export function handleKey(event: KeyboardEvent): boolean {
		const target = event.target instanceof Element ? event.target : null;
		// A table grid owns its keys (cell moves, type-to-edit), like a text field.
		const typing = Boolean(
			target?.closest(
				'input, textarea, select, [contenteditable="true"], [role="textbox"], [role="grid"]'
			)
		);
		if ((!typing || event.key === 'Escape') && readerApi?.handleKey(event)) return true;
		if (typing || event.metaKey || event.ctrlKey || event.altKey) return false;
		if (event.key === 'Escape') {
			if (chatOpen) {
				chatOpen = false;
				return true;
			}
			if (reader) {
				void close();
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
		if (next === 'closed') void close();
		else detent = next;
	}

	function scrimClick() {
		if (chatOpen) chatOpen = false;
		else void close();
	}
</script>

<div class="panes mode-{phone ? 'list' : mode}">
	<div
		class="list-col"
		bind:this={listEl}
		data-autoscroll
		inert={!phone && !listShown}
		{...listAttrs}
	>
		{@render list()}
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
			{projectId}
			{canWrite}
			order={orderOf(item.kind)}
			fallbackTitle={readerTitle}
			layout={effectiveLayout}
			{listShown}
			canShowList={hasList}
			chatOn={chatOpen && chatScope === 'item'}
			{phone}
			{detent}
			reloadKey={reloadKey + localReload}
			seed={seedFor(item)}
			{pageLink}
			onClose={() => void close()}
			onStep={(id) => onOpenItem({ kind: item.kind, id })}
			onOpen={(next) => onOpenItem(next)}
			onToggleFocus={toggleFocus}
			onToggleList={toggleList}
			onChat={() => openChat('item')}
			{onChanged}
			onDetent={(next) => (detent = next)}
			onTableShown={(id) => {
				if (!phone) tableFocusId = id;
			}}
		/>
	{:else}
		<div class="grid h-full place-items-center text-sm text-muted-foreground" aria-busy="true">
			Opening…
		</div>
	{/if}
{/snippet}

{#snippet chatView()}
	<DesktopChatPane
		{projectId}
		{projectName}
		item={reader}
		itemTitle={readerTitle}
		scope={reader ? chatScope : 'project'}
		{phone}
		onScope={(scope) => (chatScope = scope)}
		onClose={() => (chatOpen = false)}
		onDocumentChanged={() => (localReload += 1)}
	/>
{/snippet}

<style>
	/* list | reader | chat. Tracks keep one shape so width changes animate. The chat
	   lays out at its final width (--chat-w) while its column slides open, so nothing
	   inside it measures itself mid-animation. */
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
			grid-template-columns: var(--list-w, 340px) minmax(0, 1fr) 0px;
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
		.list-col {
			min-width: 0;
			min-height: 0;
			overflow-y: auto;
			overscroll-behavior: contain;
		}
		.mode-focus .list-col,
		.mode-reader-chat .list-col {
			visibility: hidden;
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
		.mode-peek .list-col {
			visibility: hidden;
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
	}
</style>
