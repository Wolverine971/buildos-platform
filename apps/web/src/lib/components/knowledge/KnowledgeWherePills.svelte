<!-- apps/web/src/lib/components/knowledge/KnowledgeWherePills.svelte -->
<!--
	One row of "where it shows up" pills: projects, tasks or documents. The row never wraps: it
	scrolls sideways inside its cell (trackpad, shift-wheel, swipe), and the edges fade while there
	is more to see. Resting on a task or doc pill shows the sentence that named the entry.
-->
<script lang="ts">
	import { portal } from '$lib/attachments/portal';
	import { CheckSquare, FileText, Folder, Square } from '$lib/icons/lucide';
	import type { KnowledgeWhereProject, KnowledgeWhereRecord } from './where-types';

	type Props =
		| {
				group: 'projects';
				items: KnowledgeWhereProject[];
				onPick: (item: KnowledgeWhereProject) => void;
				label: string;
		  }
		| {
				group: 'tasks' | 'documents';
				items: KnowledgeWhereRecord[];
				onPick: (item: KnowledgeWhereRecord) => void;
				label: string;
		  };

	let props: Props = $props();

	let fadeStart = $state(false);
	let fadeEnd = $state(false);

	function measure(node: HTMLElement) {
		fadeStart = node.scrollLeft > 2;
		fadeEnd = node.scrollLeft + node.clientWidth < node.scrollWidth - 2;
	}

	function overflowWatch(node: HTMLElement) {
		measure(node);
		const observer = new ResizeObserver(() => measure(node));
		observer.observe(node);
		const onScroll = () => measure(node);
		node.addEventListener('scroll', onScroll, { passive: true });
		return () => {
			observer.disconnect();
			node.removeEventListener('scroll', onScroll);
		};
	}

	const mask = $derived(
		fadeStart || fadeEnd
			? `mask-image: linear-gradient(to right, ${fadeStart ? 'transparent, black 1.25rem' : 'black'}, ${fadeEnd ? 'black calc(100% - 1.75rem), transparent' : 'black'});`
			: ''
	);

	// The quote peek: one per row, shown after a short rest.
	let peek = $state<{ anchor: HTMLElement; title: string; quote: string } | null>(null);
	let peekTimer: ReturnType<typeof setTimeout> | undefined;
	function showPeek(anchor: HTMLElement, title: string, quote: string | null) {
		clearTimeout(peekTimer);
		if (!quote) return;
		peekTimer = setTimeout(() => (peek = { anchor, title, quote }), 280);
	}
	function hidePeek() {
		clearTimeout(peekTimer);
		peek = null;
	}
	const peekRect = $derived(peek?.anchor.getBoundingClientRect() ?? null);

	const pill =
		'inline-flex h-6 max-w-[12rem] shrink-0 items-center gap-1 rounded-full border px-2 text-xs pressable focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';
</script>

<div
	class="flex min-w-0 items-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
	style={mask}
	role="list"
	aria-label={props.label}
	{@attach overflowWatch}
	onpointerleave={hidePeek}
>
	{#if props.group === 'projects'}
		{@const pick = props.onPick}
		{#each props.items as item (item.id)}
			<span role="listitem" class="contents">
				<button
					type="button"
					class="{pill} border-accent/30 bg-accent/10 text-foreground hover:bg-accent/20"
					title="{item.name} · {item.count} mention{item.count === 1 ? '' : 's'}"
					onclick={(e) => {
						e.stopPropagation();
						hidePeek();
						pick(item);
					}}
				>
					<Folder class="h-3 w-3 shrink-0 text-accent" aria-hidden="true" />
					<span class="truncate">{item.name}</span>
					{#if item.count > 1}<span class="stamp text-[10px] text-muted-foreground"
							>{item.count}</span
						>{/if}
				</button>
			</span>
		{/each}
	{:else}
		{@const pick = props.onPick}
		{#each props.items as item (item.id)}
			<span role="listitem" class="contents">
				<button
					type="button"
					class="{pill} border-border bg-background hover:bg-muted {item.done
						? 'text-muted-foreground'
						: 'text-foreground'}"
					aria-label="{item.kind === 'task'
						? 'Task'
						: 'Document'}: {item.title}{item.project_name
						? ` in ${item.project_name}`
						: ''}"
					onpointerenter={(e) => showPeek(e.currentTarget, item.title, item.quote)}
					onfocus={(e) => showPeek(e.currentTarget, item.title, item.quote)}
					onblur={hidePeek}
					onclick={(e) => {
						e.stopPropagation();
						hidePeek();
						pick(item);
					}}
				>
					{#if item.kind === 'document'}
						<FileText
							class="h-3 w-3 shrink-0 text-muted-foreground"
							aria-hidden="true"
						/>
					{:else if item.done}
						<CheckSquare
							class="h-3 w-3 shrink-0 text-muted-foreground"
							aria-hidden="true"
						/>
					{:else}
						<Square class="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden="true" />
					{/if}
					<span class="truncate {item.done ? 'line-through' : ''}">{item.title}</span>
				</button>
			</span>
		{/each}
	{/if}
</div>

{#if peek && peekRect}
	<div
		{@attach portal()}
		class="pointer-events-none fixed z-[200] w-72 rounded-md border border-border bg-card p-2.5 text-xs shadow-ink-strong"
		style="left: {Math.min(
			Math.max(peekRect.left, 12),
			window.innerWidth - 300
		)}px; top: {peekRect.bottom + 6}px;"
		role="tooltip"
	>
		<p class="mb-1 truncate font-medium text-foreground">{peek.title}</p>
		<p class="line-clamp-4 text-muted-foreground">“{peek.quote}”</p>
	</div>
{/if}
