<!-- apps/web/src/lib/components/projects/desktop/DesktopHoverCard.svelte -->
<!--
	The "little more" a mouse gets after resting on a tile: next step,
	description, counts and what's inside. Never shown on touch (a tap opens the
	card) and never interactive, so it can't trap the pointer.
-->
<script lang="ts">
	import { PROJECT_STATE_META, normalizeProjectState } from '$lib/config/project-states';
	import { formatProjectResumeCue, type ProjectListSummary } from '../project-list';
	import { relativeDay, shortName } from './desktop-model';

	let {
		project,
		inside,
		parentName,
		updatedAt,
		anchor
	}: {
		project: ProjectListSummary;
		inside: readonly ProjectListSummary[];
		parentName: string | null;
		/** Includes sub-project activity. */
		updatedAt: number;
		anchor: DOMRect;
	} = $props();

	let width = $state(0);
	let height = $state(0);
	let viewportWidth = $state(1024);
	let viewportHeight = $state(768);

	const projectState = $derived(normalizeProjectState(project.state_key));
	const nextStep = $derived(formatProjectResumeCue(project.next_step_short));
	const description = $derived(formatProjectResumeCue(project.description));

	// Beside the tile when there's room, else below it; always on screen.
	const position = $derived.by(() => {
		let left = anchor.right + 8;
		let top = anchor.top;
		if (left + width > viewportWidth - 12) left = anchor.left - width - 8;
		if (left < 12) {
			left = Math.min(Math.max(12, anchor.left), viewportWidth - width - 12);
			top = anchor.bottom + 6;
		}
		top = Math.min(Math.max(12, top), viewportHeight - height - 12);
		return { left, top };
	});
</script>

<svelte:window bind:innerWidth={viewportWidth} bind:innerHeight={viewportHeight} />

<div
	bind:offsetWidth={width}
	bind:offsetHeight={height}
	class="pointer-events-none fixed z-[60] grid w-[19rem] max-w-[calc(100vw-2rem)] gap-2 rounded-xl border border-border bg-card p-3.5 shadow-ink-strong tx tx-frame tx-weak"
	style:left="{position.left}px"
	style:top="{position.top}px"
	style:visibility={width ? 'visible' : 'hidden'}
	aria-hidden="true"
>
	<div class="flex items-start justify-between gap-2.5">
		<span class="text-[14.5px] font-semibold leading-snug text-foreground text-balance">
			{project.name}
		</span>
		<span
			class="shrink-0 rounded-full px-1.5 py-0.5 text-[10.5px] font-medium uppercase tracking-wide {PROJECT_STATE_META[
				projectState
			].chipClass}"
		>
			{PROJECT_STATE_META[projectState].label}
		</span>
	</div>
	<p class="font-mono text-[11px] text-muted-foreground">
		{project.task_count} tasks · {project.document_count} docs · updated {relativeDay(
			new Date(updatedAt).toISOString()
		)}
	</p>
	{#if nextStep}
		<div class="grid gap-0.5">
			<span class="micro-label text-accent">NEXT STEP</span>
			<p class="line-clamp-3 text-[13px] text-foreground">{nextStep}</p>
		</div>
	{/if}
	{#if description}
		<p class="line-clamp-3 text-[13px] text-muted-foreground">{description}</p>
	{/if}
	{#if inside.length}
		<p class="text-[13px] text-foreground">
			<span class="micro-label text-muted-foreground">INSIDE</span>
			{inside.map((child) => shortName(child.name, 28)).join(', ')}
		</p>
	{:else if parentName}
		<p class="text-[13px] text-muted-foreground">Part of {parentName}</p>
	{/if}
	<p class="border-t border-border pt-2 text-[11.5px] text-muted-foreground">
		Click to open · drag onto another project to put it inside
	</p>
</div>
