<!-- apps/web/src/lib/components/workspace/FindRow.svelte -->
<!--
	One Workspace search result: kind icon, title, where it lives, and the words that matched
	inside its text. It is a real link (/projects?open=kind:id), so ⌘-click and copy work;
	a plain click hands the item to `onOpen` so the page can open it in place.
-->
<script lang="ts">
	import {
		Circle,
		CircleCheck,
		FileText,
		FolderKanban,
		StickyNote,
		Target
	} from '$lib/icons/lucide';
	import { resolve } from '$app/paths';
	import { relativeDay } from '$lib/components/projects/desktop/desktop-model';
	import {
		DISPLAY_KIND_LABEL,
		displayKind,
		hasMarks,
		isDone,
		openParam,
		splitMarks,
		whereLabel,
		type FindItem
	} from './find-model';

	let {
		item,
		query = '',
		showWhere = true,
		active = false,
		onOpen
	}: {
		item: FindItem;
		/** The words typed, to mark them in the title. */
		query?: string;
		/** Off inside a group that already says where (the Workspace group). */
		showWhere?: boolean;
		/** Keyboard selection in the palette. */
		active?: boolean;
		onOpen: (item: FindItem) => void;
	} = $props();

	const kind = $derived(displayKind(item));
	const done = $derived(isDone(item));
	const due = $derived.by(() => {
		if (!item.due_at || done) return '';
		const date = new Date(item.due_at);
		return Number.isNaN(date.getTime())
			? ''
			: `due ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
	});
	const state = $derived(
		item.kind === 'project' || !item.state_key || ['todo', 'draft'].includes(item.state_key)
			? ''
			: item.state_key.replace(/_/g, ' ')
	);
	const snippet = $derived(hasMarks(item.snippet) ? splitMarks(item.snippet) : []);

	// Marks the typed words where a title word starts with one. Display only, never used to
	// decide anything; a miss just leaves a word unmarked (AGENTS.md lexical-check note).
	const titleParts = $derived.by(() => {
		const words = query
			.toLocaleLowerCase()
			.split(/\s+/)
			.filter((word) => word.length >= 2);
		if (!words.length) return [{ text: item.title, mark: false }];
		const parts: { text: string; mark: boolean }[] = [];
		for (const token of item.title.split(/(\s+)/)) {
			const lower = token.toLocaleLowerCase();
			const hit = words.find((word) => lower.startsWith(word));
			if (hit) {
				parts.push({ text: token.slice(0, hit.length), mark: true });
				if (token.length > hit.length)
					parts.push({ text: token.slice(hit.length), mark: false });
			} else parts.push({ text: token, mark: false });
		}
		return parts;
	});

	function handleClick(event: MouseEvent) {
		if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
			return;
		event.preventDefault();
		onOpen(item);
	}
</script>

<a
	href={resolve(`/projects?open=${openParam(item)}`)}
	class={['row', { active }]}
	data-find-row={`${item.kind}:${item.id}`}
	aria-current={active ? 'true' : undefined}
	onclick={handleClick}
>
	<span class="icon" aria-hidden="true">
		{#if kind === 'task'}
			{#if done}<CircleCheck class="h-3.5 w-3.5" />{:else}<Circle class="h-3.5 w-3.5" />{/if}
		{:else if kind === 'note'}
			<StickyNote class="h-3.5 w-3.5" />
		{:else if kind === 'goal'}
			<Target class="h-3.5 w-3.5" />
		{:else if kind === 'project'}
			<FolderKanban class="h-3.5 w-3.5" />
		{:else}
			<FileText class="h-3.5 w-3.5" />
		{/if}
	</span>
	<span class={['title', { done }]}>
		{#each titleParts as part, index (index)}
			{#if part.mark}<mark>{part.text}</mark>{:else}{part.text}{/if}
		{/each}
	</span>
	<span class="when">{relativeDay(item.updated_at)}</span>
	<span class="sub">
		{#if showWhere}
			<span class={['where', { ws: item.in_workspace }]}>{whereLabel(item)}</span>
		{/if}
		<span
			>{DISPLAY_KIND_LABEL[kind]}{#if state}
				· {state}{/if}{#if due}
				· {due}{/if}</span
		>
		{#if snippet.length}
			<span class="snippet"
				>“{#each snippet as part, index (index)}{#if part.mark}<mark>{part.text}</mark
						>{:else}{part.text}{/if}{/each}”</span
			>
		{/if}
	</span>
</a>

<style>
	.row {
		display: grid;
		grid-template-columns: 18px minmax(0, 1fr) auto;
		gap: 2px 8px;
		align-items: start;
		min-height: 44px;
		padding: 8px 10px;
		border-top: 1px solid hsl(var(--border));
		color: hsl(var(--foreground));
		text-decoration: none;
		min-width: 0;
	}
	.row:first-child {
		border-top: 0;
	}
	.row:hover,
	.row.active {
		background: hsl(var(--accent) / 0.08);
	}
	.row:focus-visible {
		outline: 2px solid hsl(var(--ring));
		outline-offset: -2px;
	}
	.icon {
		display: inline-flex;
		padding-top: 3px;
		color: hsl(var(--muted-foreground));
	}
	.title {
		min-width: 0;
		overflow: hidden;
		overflow-wrap: anywhere;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		font-size: 14px;
		font-weight: 500;
		line-height: 20px;
	}
	.title.done {
		text-decoration: line-through;
		color: hsl(var(--muted-foreground));
	}
	.when {
		padding-top: 2px;
		font-size: 11px;
		color: hsl(var(--muted-foreground));
		white-space: nowrap;
		font-variant-numeric: tabular-nums;
	}
	.sub {
		grid-column: 2 / 4;
		display: flex;
		flex-wrap: wrap;
		gap: 2px 10px;
		min-width: 0;
		font-size: 12px;
		line-height: 16px;
		color: hsl(var(--muted-foreground));
	}
	.where {
		max-width: 100%;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.where.ws {
		color: hsl(var(--info));
		font-weight: 600;
	}
	.snippet {
		flex-basis: 100%;
		min-width: 0;
		overflow: hidden;
		overflow-wrap: anywhere;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
	}
	mark {
		background: hsl(var(--warning) / 0.28);
		color: inherit;
		border-radius: 2px;
		padding: 0 1px;
	}
</style>
