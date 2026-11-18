<!-- apps/web/src/lib/components/knowledge/KnowledgeMentionPeek.svelte -->
<!--
	A light preview when the pointer rests on (or keyboard focus reaches) a tagged name in a doc or
	task (tasker 167): the entry's name, what it is, and its one-line summary. Purely informational
	(no pointer events, no focus): clicking the name opens the full knowledge card.
-->
<script lang="ts">
	import { portal } from '$lib/attachments/portal';
	import { Building, MapPin, User } from '$lib/icons/lucide';

	interface Props {
		anchor: HTMLElement;
		name: string;
		kind: string;
		summary: string | null;
	}

	let { anchor, name, kind, summary }: Props = $props();

	const kindLabel = $derived(
		kind === 'person'
			? 'Person'
			: kind === 'org'
				? 'Organization'
				: kind === 'place'
					? 'Place'
					: 'Entry'
	);

	let viewportWidth = $state(1024);
	let width = $state(0);
	// Read once per anchor: the peek closes on scroll-away (pointer leaves the name).
	const rect = $derived(anchor.getBoundingClientRect());
	const left = $derived(
		Math.min(Math.max(rect.left, 12), Math.max(12, viewportWidth - width - 12))
	);
	const below = $derived(rect.bottom + 6);
</script>

<svelte:window bind:innerWidth={viewportWidth} />

<div
	{@attach portal()}
	role="tooltip"
	bind:offsetWidth={width}
	class="pointer-events-none fixed z-[9999] w-max max-w-72 rounded-lg border border-border bg-card px-3 py-2 text-foreground shadow-ink motion-safe:animate-ink-in"
	style:left="{left}px"
	style:top="{below}px"
>
	<p class="flex items-center gap-1.5 text-sm font-semibold leading-tight">
		{#if kind === 'org'}<Building
				class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
				aria-hidden="true"
			/>
		{:else if kind === 'place'}<MapPin
				class="h-3.5 w-3.5 shrink-0 text-muted-foreground"
				aria-hidden="true"
			/>
		{:else}<User class="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />{/if}
		<span class="truncate">{name}</span>
	</p>
	<p class="mt-0.5 text-xs text-muted-foreground">
		{summary ?? kindLabel} · <span class="text-accent">Click for more</span>
	</p>
</div>
